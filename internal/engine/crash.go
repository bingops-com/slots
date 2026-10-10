package engine

import "math"

// Crash: the multiplier climbs from 1.00 and stops at a point drawn in advance
// and kept secret. Cashing out before it pays the bet times the multiplier
// reached; after it, the bet is lost. The chance of reaching x is 0.99 / x:
// a 1 % edge for the house, whatever the player's target.
//
// Time is the server's: the multiplier of a round is computed from the moment
// it started, never from what the player's screen shows.

const (
	crashEdge = 0.01
	// CrashRate is the growth of the multiplier: e^(rate × seconds). It doubles
	// every 11.5 seconds or so.
	CrashRate = 0.06
	crashMax  = 10_000 // the multiplier at which a round is cashed out for the player
)

// Crash is a round in progress; it lives in the wallet between two requests.
type Crash struct {
	Bet       int64   `json:"bet"`
	StartedAt int64   `json:"startedAt"` // milliseconds
	Point     float64 `json:"point"`     // where it stops; never sent before the end
	Auto      float64 `json:"auto"`      // cash out by itself at this multiplier, 0 for none
}

// CrashView is what the player may see.
type CrashView struct {
	Bet        int64   `json:"bet"`
	Elapsed    int64   `json:"elapsed"` // milliseconds since the start, by the server's clock
	Rate       float64 `json:"rate"`
	Auto       float64 `json:"auto,omitempty"`
	Multiplier float64 `json:"multiplier"`
	Done       bool    `json:"done,omitempty"`
	Crashed    bool    `json:"crashed,omitempty"`
	At         float64 `json:"at,omitempty"`    // multiplier cashed out at
	Point      float64 `json:"point,omitempty"` // where the round stopped, once it is over
	Payout     *int64  `json:"payout,omitempty"`
}

func crashPoint(rng Source) float64 {
	p := math.Floor((1-crashEdge)/(1-rng())*100) / 100
	return math.Max(1, math.Min(p, crashMax))
}

func (c *Crash) multiplier(now int64) float64 {
	m := math.Exp(CrashRate * float64(now-c.StartedAt) / 1000)
	return math.Min(math.Floor(m*100)/100, crashMax)
}

func (c *Crash) view(now int64) CrashView {
	return CrashView{Bet: c.Bet, Elapsed: now - c.StartedAt, Rate: CrashRate, Auto: c.Auto, Multiplier: c.multiplier(now)}
}

func (e *Engine) now() int64 {
	if e.Now != nil {
		return e.Now()
	}
	return 0
}

// crashEnd settles the round. at is the multiplier cashed out at, 0 when lost.
func (e *Engine) crashEnd(w *Wallet, at float64) gameOut[*CrashView] {
	c := w.Crash
	w.Crash = nil
	payout := int64(math.Floor(float64(c.Bet) * at))
	e.settle(w, "crash", c.Bet, payout)
	v := c.view(e.now())
	v.Done, v.Crashed, v.At, v.Point, v.Payout = true, at == 0, at, c.Point, &payout
	return gameOut[*CrashView]{&v}
}

// crashResolve ends the round if it is over by now: the automatic cash-out
// when its target was reached before the stop, a loss when the stop came first.
// It returns nil while the round is still running.
func (e *Engine) crashResolve(w *Wallet) *gameOut[*CrashView] {
	c := w.Crash
	m := c.multiplier(e.now())
	var out gameOut[*CrashView]
	switch {
	case c.Auto > 0 && c.Auto <= c.Point && m >= c.Auto:
		out = e.crashEnd(w, c.Auto)
	case m >= c.Point:
		out = e.crashEnd(w, 0)
	case m >= crashMax:
		out = e.crashEnd(w, crashMax)
	default:
		return nil
	}
	return &out
}
