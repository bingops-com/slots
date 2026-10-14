package server

import (
	"context"
	"net/http"
	"strconv"
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
	// rev counts what has happened at the table. A screen that already shows
	// the current one is answered when the next thing happens, so nobody
	// learns of a card a second late.
	rev     int64
	stamp   string
	changed chan struct{}
}

// tableHold is how long a request waits for news before being answered anyway.
const tableHold = 2 * time.Second

// moved wakes the requests waiting for news; the caller holds the lock.
func (r *room) moved() {
	stamp := r.table.Stamp()
	if stamp == r.stamp {
		return
	}
	r.stamp = stamp
	r.rev++
	if r.changed != nil {
		close(r.changed)
		r.changed = nil
	}
}

// news is closed at the next change; the caller holds the lock.
func (r *room) news() <-chan struct{} {
	if r.changed == nil {
		r.changed = make(chan struct{})
	}
	return r.changed
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
	r.moved()
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
			engine.TableRefund(u.Wallet, seat.Committed(), seat.FromStake)
			return nil, nil
		})
		if err != nil {
			r.srv.log.Error("table: refund", "user", seat.UserID, "bet", seat.Bet, "err", err)
		}
	}
	r.table = engine.NewTable()
	r.moved()
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
	out["rev"] = r.rev
	return out, nil
}

func (s *Server) tableState(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	rm := s.room
	look := func() {
		rm.tick(r.Context())
		if u != nil {
			rm.table.Seen(u.ID, nowMs())
		}
	}
	rm.mu.Lock()
	look()
	if rev := r.URL.Query().Get("rev"); rev != "" && rev == strconv.FormatInt(rm.rev, 10) {
		news := rm.news()
		rm.mu.Unlock()
		hold := time.NewTimer(tableHold)
		select {
		case <-news:
		case <-hold.C:
		case <-r.Context().Done():
		}
		hold.Stop()
		rm.mu.Lock()
		look()
	}
	defer rm.mu.Unlock()
	return rm.answer(r.Context(), u)
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
		Bet      int64                `json:"bet"`
		Seat     *int                 `json:"seat"` // the place asked for; any free one when absent
		SideBets engine.TableSideBets `json:"sideBets"`
	}
	if err := readJSON(r, &body); err != nil {
		return nil, err
	}
	rm := s.room
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	pos := -1
	if body.Seat != nil {
		if pos = *body.Seat; pos < 0 {
			return nil, engine.Error("Cette place est prise")
		}
	}
	if err := rm.table.CanBet(u.ID, body.Bet, pos); err != nil {
		return nil, err
	}
	cost, err := engine.TableBetCost(body.Bet, body.SideBets)
	if err != nil {
		return nil, err
	}
	var fromStake int64
	if _, err := s.store.Play(r.Context(), u.ID, func(u *store.User) (*store.Round, error) {
		var err error
		fromStake, err = engine.TableDebit(u.Wallet, cost)
		return nil, err
	}); err != nil {
		return nil, err
	}
	rm.table.BetWithSides(u.ID, u.Name, body.Bet, fromStake, body.SideBets, pos, nowMs())
	rm.moved()
	return rm.answer(r.Context(), u)
}

// tableReady is a player saying their bets are all down: the deal does not
// wait for the clock when everyone at the table has said so.
func (s *Server) tableReady(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errAuth
	}
	rm := s.room
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	if !rm.table.CanReady(u.ID) {
		return nil, engine.Error("Posez d'abord une mise")
	}
	rm.table.SetReady(u.ID, nowMs())
	rm.tick(r.Context())
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
	rm.moved()
	return rm.answer(r.Context(), u)
}
