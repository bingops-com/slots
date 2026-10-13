package engine

import (
	"encoding/json"
	"math"
)

// How points are shared out: every player gets the same grant at the start of
// a season, whatever the day they arrive. The grant is worth nothing on the
// leaderboard until it is played; every payout falls into the loot, and the
// score is the loot plus banked repayments minus the outstanding debt. Not playing earns
// zero, and an advance never moves a player up.
const (
	StartStake   = 1_000_000
	advance      = 100_000
	advanceBelow = 100
	minBet       = 10
	maxBet       = 500_000
)

type Best struct {
	Mult   float64 `json:"mult"`
	Game   string  `json:"game"`
	Payout int64   `json:"payout"`
}

// Wallet is everything a player owns in a season, games in progress included.
type Wallet struct {
	Stake   int64      `json:"stake"`
	Loot    int64      `json:"loot"`
	Debt    int64      `json:"debt"`
	Banked  int64      `json:"banked,omitempty"` // spent loot retained in the score after repayment
	Wagered int64      `json:"wagered"`
	Won     int64      `json:"won"`
	Rounds  int64      `json:"rounds"`
	Rebuys  int64      `json:"rebuys"`
	Best    *Best      `json:"best"`
	BJ      *Blackjack `json:"bj"`
	Mines   *Mines     `json:"mines"`
	Crash   *Crash     `json:"crash"`
}

func NewWallet() *Wallet { return &Wallet{Stake: StartStake} }

func (w *Wallet) Balance() int64 { return w.Stake + w.Loot }
func (w *Wallet) Score() int64   { return w.Loot - w.Debt + w.Banked }

func (w *Wallet) canAdvance() bool {
	return w.Balance() < advanceBelow && w.BJ == nil && w.Mines == nil
}

type Limits struct {
	Min     int64 `json:"min"`
	Max     int64 `json:"max"`
	Start   int64 `json:"start"`
	Advance int64 `json:"advance"`
}

// View is the wallet as the interface shows it.
type View struct {
	Balance    int64  `json:"balance"`
	Stake      int64  `json:"stake"`
	Loot       int64  `json:"loot"`
	Debt       int64  `json:"debt"`
	Banked     int64  `json:"banked"`
	Score      int64  `json:"score"`
	Wagered    int64  `json:"wagered"`
	Rounds     int64  `json:"rounds"`
	Rebuys     int64  `json:"rebuys"`
	Best       *Best  `json:"best"`
	CanAdvance bool   `json:"canAdvance"`
	Limits     Limits `json:"limits"`
}

func (w *Wallet) View() View {
	return View{
		Balance: w.Balance(), Stake: w.Stake, Loot: w.Loot, Debt: w.Debt, Banked: w.Banked, Score: w.Score(),
		Wagered: w.Wagered, Rounds: w.Rounds, Rebuys: w.Rebuys, Best: w.Best, CanAdvance: w.canAdvance(),
		Limits: Limits{Min: minBet, Max: maxBet, Start: StartStake, Advance: advance},
	}
}

// Active describes the games left in progress, to resume them.
type Active struct {
	Blackjack *BlackjackView `json:"blackjack"`
	Mines     *MinesView     `json:"mines"`
	Crash     *CrashView     `json:"crash"`
}

// Active describes the games in progress at the given time (milliseconds).
func (w *Wallet) Active(now int64) Active {
	var a Active
	if w.Crash != nil {
		v := w.Crash.view(now)
		a.Crash = &v
	}
	if w.BJ != nil {
		v := w.BJ.view()
		a.Blackjack = &v
	}
	if w.Mines != nil {
		v := w.Mines.view()
		a.Mines = &v
	}
	return a
}

// Round is the credits side of a slot spin; the rest is in multiples of the bet.
type Round struct {
	Bet    int64 `json:"bet"`
	Cost   int64 `json:"cost"`
	Payout int64 `json:"payout"`
}

// Settled is reported at the end of every round.
type Settled struct {
	Game    string
	Wagered int64
	Payout  int64
	Mult    float64
}

// Engine plays actions on a wallet.
type Engine struct {
	Rng Source
	// Now gives the time in milliseconds. Only Crash needs it.
	Now func() int64
	// OnSettle, when set, is called at the end of every round.
	OnSettle func(Settled)
}

// Actions lists what Do accepts.
var Actions = []string{
	"dice", "roulette", "slots/bass", "slots/beard", "slots/bounty", "slots/neptune", "slots/reef", "slots/dogs",
	"blackjack/start", "blackjack/action", "mines/start", "mines/reveal", "mines/cashout",
	"crash/start", "crash/poll", "crash/cashout", "plinko", "advance", "repay",
}

type request struct {
	Amount *int64        `json:"amount"`
	Bet    *int64        `json:"bet"`
	Target *float64      `json:"target"`
	Over   bool          `json:"over"`
	Bets   []RouletteBet `json:"bets"`
	Golden bool          `json:"golden"`
	Buy    string        `json:"buy"`
	Action string        `json:"action"`
	Mines  *int          `json:"mines"`
	Cell   *int          `json:"cell"`
	Auto   float64       `json:"auto"`
	Rows   int           `json:"rows"`
	Risk   string        `json:"risk"`
	Ante   bool          `json:"ante"`
	Mode   string        `json:"mode"`
}

func parseBet(v *int64) (int64, error) {
	if v == nil || *v < minBet || *v > maxBet {
		return 0, Error("Mise invalide")
	}
	return *v, nil
}

// A bet eats into the grant before the loot.
func (w *Wallet) debit(amount int64) error {
	if w.Balance() < amount {
		return Error("Solde insuffisant")
	}
	fromStake := min(w.Stake, amount)
	w.Stake -= fromStake
	w.Loot -= amount - fromStake
	return nil
}

func (e *Engine) settle(w *Wallet, game string, wagered, payout int64) {
	w.Loot += payout
	w.Wagered += wagered
	w.Won += payout
	w.Rounds++
	mult := math.Round(float64(payout)/float64(wagered)*100) / 100
	if payout > wagered && (w.Best == nil || mult > w.Best.Mult) {
		w.Best = &Best{Mult: mult, Game: game, Payout: payout}
	}
	if e.OnSettle != nil {
		e.OnSettle(Settled{Game: game, Wagered: wagered, Payout: payout, Mult: mult})
	}
}

type gameOut[T any] struct {
	Game T `json:"game"`
}

func (e *Engine) blackjackState(w *Wallet) gameOut[BlackjackView] {
	out := gameOut[BlackjackView]{w.BJ.view()}
	if w.BJ.Phase == "done" {
		e.settle(w, "blackjack", w.BJ.Wagered, w.BJ.Payout)
		w.BJ = nil
	}
	return out
}

func (e *Engine) minesEnd(w *Wallet, payout int64, hit *int) gameOut[MinesView] {
	state := w.Mines
	w.Mines = nil
	e.settle(w, "mines", state.Bet, payout)
	v := state.view()
	v.Done, v.Hit, v.Bombs, v.Payout = true, hit, state.Bombs, &payout
	return gameOut[MinesView]{v}
}

func (e *Engine) minesCashout(w *Wallet) (any, error) {
	if w.Mines == nil {
		return nil, Error("Aucune partie en cours")
	}
	if len(w.Mines.Revealed) == 0 {
		return nil, Error("Révélez au moins une case")
	}
	payout := int64(math.Floor(float64(w.Mines.Bet) * minesMultiplier(w.Mines.Mines, len(w.Mines.Revealed))))
	return e.minesEnd(w, payout, nil), nil
}

// Do plays one action. On error the wallet is left untouched.
func (e *Engine) Do(w *Wallet, action string, body []byte) (any, error) {
	var req request
	if len(body) > 0 {
		if err := json.Unmarshal(body, &req); err != nil {
			return nil, Error("Requête invalide")
		}
	}
	switch action {
	case "dice":
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if w.Balance() < bet {
			return nil, Error("Solde insuffisant")
		}
		if req.Target == nil {
			return nil, Error("Seuil invalide")
		}
		res, err := dicePlay(e.Rng, *req.Target, req.Over)
		if err != nil {
			return nil, err
		}
		_ = w.debit(bet)
		payout := int64(math.Floor(float64(bet) * res.PayoutMult))
		e.settle(w, "dice", bet, payout)
		return struct {
			DiceResult
			Bet    int64 `json:"bet"`
			Payout int64 `json:"payout"`
		}{res, bet, payout}, nil

	case "roulette":
		total, err := rouletteValidate(req.Bets)
		if err != nil {
			return nil, err
		}
		if _, err := parseBet(&total); err != nil {
			return nil, err
		}
		if err := w.debit(total); err != nil {
			return nil, err
		}
		res := roulettePlay(e.Rng, req.Bets)
		res.Bet = total
		e.settle(w, "roulette", total, res.Payout)
		return res, nil

	case "slots/bass":
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		cost := bet
		switch req.Buy {
		case "":
		case "fs":
			cost = bet * BassBuyCost
		default:
			return nil, Error("Achat inconnu")
		}
		if err := w.debit(cost); err != nil {
			return nil, err
		}
		res := BassSpin(e.Rng, req.Buy != "")
		res.Round = Round{Bet: bet, Cost: cost, Payout: int64(math.Round(float64(bet) * res.TotalMult))}
		e.settle(w, "bass", cost, res.Payout)
		return res, nil

	case "slots/beard":
		// The price of a spin may exceed the bet (golden bet, bonus buy).
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		opts := BeardOptions{Golden: req.Golden, Buy: req.Buy}
		mult, err := BeardCost(opts)
		if err != nil {
			return nil, err
		}
		cost := int64(math.Round(float64(bet) * mult))
		if err := w.debit(cost); err != nil {
			return nil, err
		}
		res := BeardSpin(e.Rng, opts)
		res.Round = Round{Bet: bet, Cost: cost, Payout: int64(math.Round(float64(bet) * res.TotalMult))}
		e.settle(w, "beard", cost, res.Payout)
		return res, nil

	case "slots/neptune", "slots/reef":
		spec := TumbleSpecs[action[len("slots/"):]]
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if req.Buy != "" && req.Buy != "fs" {
			return nil, Error("Achat inconnu")
		}
		opts := TumbleOptions{Ante: req.Ante && req.Buy == "", Buy: req.Buy == "fs"}
		cost := int64(math.Round(float64(bet) * TumbleCost(opts)))
		if err := w.debit(cost); err != nil {
			return nil, err
		}
		res := spec.Spin(e.Rng, opts)
		res.Round = Round{Bet: bet, Cost: cost, Payout: int64(math.Round(float64(bet) * res.TotalMult))}
		e.settle(w, spec.ID, cost, res.Payout)
		return res, nil

	case "slots/dogs":
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		// "fs" buys the sticky wilds, "rain" the raining wilds; without a purchase,
		// mode says which of the two the scatters open.
		mode := DogsSticky
		switch {
		case req.Buy == "rain", req.Buy == "" && req.Mode == DogsRain:
			mode = DogsRain
		case req.Buy != "" && req.Buy != "fs":
			return nil, Error("Achat inconnu")
		case req.Mode != "" && req.Mode != DogsSticky && req.Mode != DogsRain:
			return nil, Error("Bonus inconnu")
		}
		buy := req.Buy != ""
		cost := bet
		if buy {
			cost *= DogsBuyCost
		}
		if err := w.debit(cost); err != nil {
			return nil, err
		}
		res := DogsPlay(e.Rng, buy, mode)
		res.Round = Round{Bet: bet, Cost: cost, Payout: int64(math.Round(float64(bet) * res.TotalMult))}
		e.settle(w, "dogs", cost, res.Payout)
		return res, nil

	case "slots/bounty":
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		cost := bet
		if req.Buy != "" {
			price, ok := BountyCosts[req.Buy]
			if !ok {
				return nil, Error("Achat inconnu")
			}
			cost = int64(math.Round(float64(bet) * price))
		}
		if err := w.debit(cost); err != nil {
			return nil, err
		}
		res := BountySpinRound(e.Rng, req.Buy)
		res.Round = Round{Bet: bet, Cost: cost, Payout: int64(math.Round(float64(bet) * res.TotalMult))}
		e.settle(w, "bounty", cost, res.Payout)
		return res, nil

	case "blackjack/start":
		if w.BJ != nil {
			return nil, Error("Une main est déjà en cours")
		}
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if err := w.debit(bet); err != nil {
			return nil, err
		}
		w.BJ = bjStart(e.Rng, bet)
		return e.blackjackState(w), nil

	case "blackjack/action":
		if w.BJ == nil {
			return nil, Error("Aucune main en cours")
		}
		if err := w.BJ.act(e.Rng, req.Action, w.debit); err != nil {
			return nil, err
		}
		return e.blackjackState(w), nil

	case "mines/start":
		if w.Mines != nil {
			return nil, Error("Une partie est déjà en cours")
		}
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if w.Balance() < bet {
			return nil, Error("Solde insuffisant")
		}
		if req.Mines == nil {
			return nil, Error("Nombre de mines invalide")
		}
		state, err := minesStart(e.Rng, bet, *req.Mines)
		if err != nil {
			return nil, err
		}
		_ = w.debit(bet)
		w.Mines = state
		return gameOut[MinesView]{state.view()}, nil

	case "mines/reveal":
		if w.Mines == nil {
			return nil, Error("Aucune partie en cours")
		}
		if req.Cell == nil {
			return nil, Error("Case invalide")
		}
		hit, done, err := w.Mines.reveal(*req.Cell)
		if err != nil {
			return nil, err
		}
		if hit {
			return e.minesEnd(w, 0, req.Cell), nil
		}
		if done {
			return e.minesCashout(w)
		}
		return gameOut[MinesView]{w.Mines.view()}, nil

	case "mines/cashout":
		return e.minesCashout(w)

	case "plinko":
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if w.Balance() < bet {
			return nil, Error("Solde insuffisant")
		}
		res, err := plinkoDrop(e.Rng, req.Rows, req.Risk, bet)
		if err != nil {
			return nil, err
		}
		_ = w.debit(bet)
		e.settle(w, "plinko", bet, res.Payout)
		return res, nil

	case "crash/start":
		// A round left unattended is settled by crash/poll, which the game
		// calls when it opens.
		if w.Crash != nil {
			return nil, Error("Une plongée est déjà en cours")
		}
		bet, err := parseBet(req.Bet)
		if err != nil {
			return nil, err
		}
		if req.Auto != 0 && (math.IsNaN(req.Auto) || req.Auto < 1.01 || req.Auto > crashMax) {
			return nil, Error("Remontée automatique : entre 1,01 et 10 000")
		}
		if err := w.debit(bet); err != nil {
			return nil, err
		}
		w.Crash = &Crash{Bet: bet, StartedAt: e.now(), Point: crashPoint(e.Rng), Auto: math.Floor(req.Auto*100) / 100}
		v := w.Crash.view(e.now())
		return gameOut[*CrashView]{&v}, nil

	case "crash/poll":
		if w.Crash == nil {
			return gameOut[*CrashView]{}, nil
		}
		if out := e.crashResolve(w); out != nil {
			return *out, nil
		}
		v := w.Crash.view(e.now())
		return gameOut[*CrashView]{&v}, nil

	case "crash/cashout":
		if w.Crash == nil {
			return nil, Error("Aucune plongée en cours")
		}
		// Too late is too late: the stop is checked before the cash-out.
		if out := e.crashResolve(w); out != nil {
			return *out, nil
		}
		return e.crashEnd(w, w.Crash.multiplier(e.now())), nil

	case "repay":
		if req.Amount == nil || *req.Amount <= 0 {
			return nil, Error("Montant de remboursement invalide")
		}
		amount := *req.Amount
		if amount > w.Debt {
			return nil, Error("Le remboursement dépasse la dette restante")
		}
		if amount > w.Balance() {
			return nil, Error("Solde insuffisant")
		}
		// The grant is spent first, as for bets. Only spent loot needs banking:
		// reducing debt already restores the points lost when the grant was lent.
		// Thus an untouched advance repaid immediately creates no score.
		fromLoot := amount - min(w.Stake, amount)
		if w.Banked > math.MaxInt64-fromLoot || w.Score() > math.MaxInt64-amount {
			return nil, Error("Score maximum atteint")
		}
		_ = w.debit(amount)
		w.Debt -= amount
		w.Banked += fromLoot
		return struct {
			Repaid int64 `json:"repaid"`
		}{amount}, nil

	case "advance":
		// An advance when everything is lost: it lets the player go on but is
		// taken off the score.
		if !w.canAdvance() {
			return nil, Error("L'avance n'est proposée que lorsqu'il ne reste plus rien à miser")
		}
		w.Stake += advance
		w.Debt += advance
		w.Rebuys++
		return struct{}{}, nil
	}
	return nil, Error("Action inconnue")
}
