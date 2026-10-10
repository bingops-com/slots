package server

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/store"
)

// pokerRoom is the shared hold'em table: the rules are engine.Poker, the
// buy-ins and the cash-outs go through the store. One lock orders everything.
type pokerRoom struct {
	mu    sync.Mutex
	table *engine.Poker
	srv   *Server
}

// settle pays the players who have left the table.
func (r *pokerRoom) settle(ctx context.Context, outs []engine.PokerCashout) {
	for _, out := range outs {
		_, err := r.srv.store.Play(ctx, out.UserID, func(u *store.User) (*store.Round, error) {
			var round *store.Round
			eng := engine.Engine{OnSettle: func(s engine.Settled) {
				round = &store.Round{Game: s.Game, Wagered: s.Wagered, Payout: s.Payout, Mult: s.Mult,
					Announce: s.Mult >= feedMult || s.Payout-s.Wagered >= feedProfit}
			}}
			eng.PokerSettle(u.Wallet, out.BuyIn, out.Stack)
			return round, nil
		})
		if err != nil {
			r.srv.log.Error("poker: cash-out", "user", out.UserID, "buyIn", out.BuyIn, "stack", out.Stack, "err", err)
		}
	}
}

func (r *pokerRoom) tick(ctx context.Context) {
	r.settle(ctx, r.table.Tick(engine.Secure, nowMs()))
}

func (r *pokerRoom) run(ctx context.Context) {
	t := time.NewTicker(200 * time.Millisecond)
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

// close gives everyone their chips back, those in the pot of an unfinished
// hand included.
func (r *pokerRoom) close(ctx context.Context) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, out := range r.table.Pending() {
		_, err := r.srv.store.Play(ctx, out.UserID, func(u *store.User) (*store.Round, error) {
			engine.TableRefund(u.Wallet, out.BuyIn, out.FromStake)
			// What was won or lost before the stop still counts.
			if d := out.Stack - out.BuyIn; d > 0 {
				u.Wallet.Loot += d
			} else if err := engine.TableLose(u.Wallet, -d); err != nil {
				return nil, err
			}
			return nil, nil
		})
		if err != nil {
			r.srv.log.Error("poker: refund", "user", out.UserID, "stack", out.Stack, "err", err)
		}
	}
	r.table = engine.NewPoker()
}

func (r *pokerRoom) answer(ctx context.Context, u *store.User) (any, error) {
	out := map[string]any{}
	id := ""
	if u != nil {
		id = u.ID
		r.table.Seen(id, nowMs())
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

// player is the common opening of the handlers that change the table.
func (s *Server) pokerPlayer(r *http.Request, body any) (*store.User, error) {
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
	return u, readJSON(r, body)
}

func (s *Server) pokerState(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	s.poker.mu.Lock()
	defer s.poker.mu.Unlock()
	s.poker.tick(r.Context())
	return s.poker.answer(r.Context(), u)
}

func (s *Server) pokerSit(w http.ResponseWriter, r *http.Request) (any, error) {
	var body struct {
		BuyIn int64 `json:"buyIn"`
	}
	u, err := s.pokerPlayer(r, &body)
	if err != nil {
		return nil, err
	}
	rm := s.poker
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	if err := rm.table.CanSit(u.ID, body.BuyIn); err != nil {
		return nil, err
	}
	var fromStake int64
	if _, err := s.store.Play(r.Context(), u.ID, func(u *store.User) (*store.Round, error) {
		var err error
		fromStake, err = engine.TableDebit(u.Wallet, body.BuyIn)
		return nil, err
	}); err != nil {
		return nil, err
	}
	rm.table.Sit(u.ID, u.Name, body.BuyIn, fromStake, nowMs())
	return rm.answer(r.Context(), u)
}

func (s *Server) pokerLeave(w http.ResponseWriter, r *http.Request) (any, error) {
	var body struct{}
	u, err := s.pokerPlayer(r, &body)
	if err != nil {
		return nil, err
	}
	rm := s.poker
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	rm.settle(r.Context(), rm.table.Leave(engine.Secure, u.ID, nowMs()))
	return rm.answer(r.Context(), u)
}

func (s *Server) pokerAction(w http.ResponseWriter, r *http.Request) (any, error) {
	var body struct {
		Action string `json:"action"`
		Amount int64  `json:"amount"`
	}
	u, err := s.pokerPlayer(r, &body)
	if err != nil {
		return nil, err
	}
	rm := s.poker
	rm.mu.Lock()
	defer rm.mu.Unlock()
	rm.tick(r.Context())
	outs, err := rm.table.Act(engine.Secure, u.ID, body.Action, body.Amount, nowMs())
	if err != nil {
		return nil, err
	}
	rm.settle(r.Context(), outs)
	return rm.answer(r.Context(), u)
}
