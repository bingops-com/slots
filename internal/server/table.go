package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/store"
)

// room is the shared blackjack table: the rules are engine.Table, the money
// goes through the store. One lock orders everything that happens at the
// table, wallet changes included, so a bet is never seated without being paid
// for nor paid for without being seated.
type room struct {
	mu    sync.Mutex
	table *engine.Table
	srv   *Server
}

func nowMs() int64 { return time.Now().UnixMilli() }

// settle pays the players of a deal that has just ended. A wallet that cannot
// be written is logged: the hand is over either way.
func (r *room) settle(ctx context.Context, results []engine.TableResult) {
	for _, res := range results {
		_, err := r.srv.store.Play(ctx, res.UserID, func(u *store.User) (*store.Round, error) {
			var round *store.Round
			eng := engine.Engine{OnSettle: func(s engine.Settled) {
				round = &store.Round{Game: s.Game, Wagered: s.Wagered, Payout: s.Payout, Mult: s.Mult,
					Announce: s.Mult >= feedMult || s.Payout-s.Wagered >= feedProfit}
			}}
			eng.TableSettle(u.Wallet, res.Wagered, res.Payout)
			return round, nil
		})
		if err != nil {
			r.srv.log.Error("table: settle", "user", res.UserID, "wagered", res.Wagered, "payout", res.Payout, "err", err)
		}
	}
}

// tick moves the table on; the caller holds the lock.
func (r *room) tick(ctx context.Context) {
	r.settle(ctx, r.table.Tick(engine.Secure, nowMs()))
}

// run keeps the table moving while nobody is asking for it.
func (r *room) run(ctx context.Context) {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.mu.Lock()
			r.tick(ctx)
			r.mu.Unlock()
		}
	}
}

// close gives back the bets of a deal that will not be finished.
func (r *room) close(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, seat := range r.table.Pending() {
		_, err := r.srv.store.Play(ctx, seat.UserID, func(u *store.User) (*store.Round, error) {
			engine.TableRefund(u.Wallet, seat.Bet, seat.FromStake)
			return nil, nil
		})
		if err != nil {
			r.srv.log.Error("table: refund", "user", seat.UserID, "bet", seat.Bet, "err", err)
		}
	}
	r.table = engine.NewTable()
}

func (r *room) answer(ctx context.Context, u *store.User) (any, error) {
	out := map[string]any{}
	id := ""
	if u != nil {
		id = u.ID
		// The wallet may have been paid by the deal that just ended.
		fresh, err := r.srv.store.User(ctx, u.ID)
		if err != nil {
			return nil, err
		}
		acc, err := r.srv.account(ctx, fresh)
		if err != nil {
			return nil, err
		}
		out["user"] = acc
	}
	out["table"] = r.table.View(id, nowMs())
	return out, nil
}

func (s *Server) tableState(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	s.room.mu.Lock()
	defer s.room.mu.Unlock()
	s.room.tick(r.Context())
	return s.room.answer(r.Context(), u)
}

func (s *Server) tableBet(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errAuth
	}
	if !s.playLimit.allow(u.ID) {
		return nil, httpError{http.StatusTooManyRequests, "Trop de manches à la fois, ralentissez"}
	}
	var body struct {
		Bet int64 `json:"bet"`
	}
	if err := readJSON(r, &body); err != nil {
		return nil, err
	}
	rm := s.room
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	if err := rm.table.CanBet(u.ID, body.Bet); err != nil {
		return nil, err
	}
	var fromStake int64
	if _, err := s.store.Play(r.Context(), u.ID, func(u *store.User) (*store.Round, error) {
		var err error
		fromStake, err = engine.TableDebit(u.Wallet, body.Bet)
		return nil, err
	}); err != nil {
		return nil, err
	}
	rm.table.Bet(u.ID, u.Name, body.Bet, fromStake, nowMs())
	return rm.answer(r.Context(), u)
}

func (s *Server) tableAction(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errAuth
	}
	if !s.playLimit.allow(u.ID) {
		return nil, httpError{http.StatusTooManyRequests, "Trop de manches à la fois, ralentissez"}
	}
	var body struct {
		Action string `json:"action"`
	}
	if err := readJSON(r, &body); err != nil {
		return nil, err
	}
	rm := s.room
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	extra, err := rm.table.CanAct(u.ID, body.Action)
	if err != nil {
		return nil, err
	}
	var fromStake int64
	if extra > 0 {
		if _, err := s.store.Play(r.Context(), u.ID, func(u *store.User) (*store.Round, error) {
			var err error
			fromStake, err = engine.TableDebit(u.Wallet, extra)
			return nil, err
		}); err != nil {
			return nil, err
		}
	}
	rm.settle(r.Context(), rm.table.Act(engine.Secure, body.Action, fromStake, nowMs()))
	return rm.answer(r.Context(), u)
}
