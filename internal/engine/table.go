package engine

import (
	"fmt"
	"math"
)

// A shared blackjack table: several players bet on the same deal and play
// their hands in turn against one dealer. The table waits for a first bet,
// deals as soon as everyone watching has bet (or after a short moment), gives
// each player a limited time to act, plays the dealer, shows the result, and
// starts over. Nothing makes the players wait more than five seconds.
//
// This file is the table's rules only. It holds no money and no clock: the
// server debits and pays the wallets, and passes the time in.

const (
	TableSeats     = 5
	tableBetWindow = 5_000 // ms left to the others once a first bet is placed
	tableTurnTime  = 5_000 // ms to act before standing by default
	tableShowTime  = 5_000 // ms the result stays on the table
	tableCardTime  = 150   // ms the screen takes to deal a card: the first turn starts once they are down
	tablePresence  = 4_000 // ms after which a player who stopped asking is gone
)

type TableSeat struct {
	UserID    string
	Name      string
	Cards     []Card
	Bet       int64
	FromStake int64 // how much of the bet came out of the grant, to refund it exactly
	Done      bool
	Doubled   bool
	Result    string
	Payout    int64
}

type Table struct {
	Phase    string // waiting, betting, playing, done
	Dealer   []Card
	Seats    []*TableSeat
	Turn     int
	Deadline int64
	Round    int64
	// Present is when each signed-in player last looked at the table: the deal
	// does not wait for people who are not there.
	Present map[string]int64
}

// TableResult is what the server must settle for one player.
type TableResult struct {
	UserID  string
	Wagered int64
	Payout  int64
}

type TableSeatView struct {
	Name   string `json:"name"`
	Cards  []Card `json:"cards"`
	Total  int    `json:"total"`
	Bet    int64  `json:"bet"`
	Result string `json:"result,omitempty"`
	Payout *int64 `json:"payout,omitempty"`
	You    bool   `json:"you,omitempty"`
	Turn   bool   `json:"turn,omitempty"`
}

type TableView struct {
	Phase       string          `json:"phase"`
	Round       int64           `json:"round"`
	Dealer      []Card          `json:"dealer"`
	DealerTotal int             `json:"dealerTotal"`
	Hole        bool            `json:"hole"`
	Seats       []TableSeatView `json:"seats"`
	Free        int             `json:"free"`      // seats still open
	Remaining   int64           `json:"remaining"` // ms before the phase moves on by itself
	Window      int64           `json:"window"`    // ms the phase lasts at most
	Seated      bool            `json:"seated"`
	CanBet      bool            `json:"canBet"`
	Actions     []string        `json:"actions"`
}

func NewTable() *Table {
	return &Table{Phase: "waiting", Seats: []*TableSeat{}, Present: map[string]int64{}}
}

// Seen records that a player is looking at the table.
func (t *Table) Seen(userID string, now int64) { t.Present[userID] = now }

// everyoneIn says whether all the players at the table have placed their bet.
func (t *Table) everyoneIn(now int64) bool {
	for id, at := range t.Present {
		if now-at > tablePresence {
			delete(t.Present, id)
			continue
		}
		if t.seat(id) == nil {
			return false
		}
	}
	return true
}

// Stamp changes whenever something happens at the table.
func (t *Table) Stamp() string {
	cards := len(t.Dealer)
	for _, s := range t.Seats {
		cards += len(s.Cards)
	}
	return fmt.Sprintf("%s/%d/%d/%d/%d/%d", t.Phase, t.Round, t.Turn, t.Deadline, len(t.Seats), cards)
}

func (t *Table) seat(userID string) *TableSeat {
	for _, s := range t.Seats {
		if s.UserID == userID {
			return s
		}
	}
	return nil
}

// CanBet says whether the player may join the coming deal.
func (t *Table) CanBet(userID string, amount int64) error {
	if amount < minBet || amount > maxBet {
		return Error("Mise invalide")
	}
	if t.Phase != "waiting" && t.Phase != "betting" {
		return Error("La donne est en cours, attendez la suivante")
	}
	if t.seat(userID) != nil {
		return Error("Votre mise est déjà posée")
	}
	if len(t.Seats) >= TableSeats {
		return Error("La table est complète")
	}
	return nil
}

// Bet seats the player. The first bet opens the window for the others.
func (t *Table) Bet(userID, name string, amount, fromStake, now int64) {
	t.Seats = append(t.Seats, &TableSeat{UserID: userID, Name: name, Bet: amount, FromStake: fromStake, Cards: []Card{}})
	t.Seen(userID, now)
	if t.Phase == "waiting" {
		t.Phase = "betting"
		t.Deadline = now + tableBetWindow
	}
	if len(t.Seats) == TableSeats {
		t.Deadline = now // nobody left to wait for
	}
}

func (t *Table) current() *TableSeat {
	if t.Phase != "playing" || t.Turn >= len(t.Seats) {
		return nil
	}
	return t.Seats[t.Turn]
}

func (t *Table) allowed(userID string) []string {
	s := t.current()
	if s == nil || s.UserID != userID {
		return []string{}
	}
	if len(s.Cards) == 2 {
		return []string{"hit", "stand", "double"}
	}
	return []string{"hit", "stand"}
}

// CanAct checks the action and returns what it costs on top of the bet
// (doubling costs the bet again).
func (t *Table) CanAct(userID, action string) (extra int64, err error) {
	for _, a := range t.allowed(userID) {
		if a == action {
			if action == "double" {
				return t.current().Bet, nil
			}
			return 0, nil
		}
	}
	return 0, Error("Action impossible")
}

// Act plays an action already accepted by CanAct. extraFromStake is the part
// of a doubling taken from the grant.
func (t *Table) Act(rng Source, action string, extraFromStake, now int64) []TableResult {
	s := t.current()
	switch action {
	case "hit":
		s.Cards = append(s.Cards, bjDraw(rng))
		s.Done = bjTotal(s.Cards) >= 21
	case "stand":
		s.Done = true
	case "double":
		s.FromStake += extraFromStake
		s.Bet *= 2
		s.Doubled = true
		s.Cards = append(s.Cards, bjDraw(rng))
		s.Done = true
	}
	t.Deadline = now + tableTurnTime
	if s.Done {
		return t.next(rng, now)
	}
	return nil
}

// next gives the turn to the next hand still to play, or ends the deal.
func (t *Table) next(rng Source, now int64) []TableResult {
	for t.Turn < len(t.Seats) && t.Seats[t.Turn].Done {
		t.Turn++
	}
	if t.Turn < len(t.Seats) {
		t.Deadline = now + tableTurnTime
		return nil
	}
	return t.finish(rng, now)
}

func (t *Table) deal(rng Source, now int64) []TableResult {
	t.Phase = "playing"
	t.Turn = 0
	t.Dealer = []Card{bjDraw(rng), bjDraw(rng)}
	for _, s := range t.Seats {
		s.Cards = []Card{bjDraw(rng), bjDraw(rng)}
		s.Done = bjNatural(s.Cards)
	}
	// A dealer's blackjack ends the deal before anyone plays.
	if bjNatural(t.Dealer) {
		return t.finish(rng, now)
	}
	res := t.next(rng, now)
	if t.Phase == "playing" {
		t.Deadline += int64(tableCardTime * 2 * (len(t.Seats) + 1))
	}
	return res
}

func (t *Table) finish(rng Source, now int64) []TableResult {
	live := false
	for _, s := range t.Seats {
		if bjTotal(s.Cards) <= 21 && !bjNatural(s.Cards) {
			live = true
		}
	}
	if live {
		for bjTotal(t.Dealer) < 17 {
			t.Dealer = append(t.Dealer, bjDraw(rng))
		}
	}
	d, dealerBJ := bjTotal(t.Dealer), bjNatural(t.Dealer)
	results := make([]TableResult, 0, len(t.Seats))
	for _, s := range t.Seats {
		p := bjTotal(s.Cards)
		natural := bjNatural(s.Cards) && !s.Doubled
		mult := 0.0
		s.Result = "lose"
		switch {
		case p > 21:
		case natural && dealerBJ:
			mult, s.Result = 1, "push"
		case natural:
			mult, s.Result = 2.5, "blackjack"
		case dealerBJ:
		case d > 21 || p > d:
			mult, s.Result = 2, "win"
		case p == d:
			mult, s.Result = 1, "push"
		}
		s.Payout = int64(math.Round(float64(s.Bet) * mult))
		results = append(results, TableResult{UserID: s.UserID, Wagered: s.Bet, Payout: s.Payout})
	}
	t.Phase = "done"
	t.Turn = len(t.Seats)
	t.Deadline = now + tableShowTime
	return results
}

// Tick moves the table on when a deadline has passed. It returns the results
// to settle when a deal has just ended.
func (t *Table) Tick(rng Source, now int64) []TableResult {
	if t.Phase == "waiting" {
		return nil
	}
	if now < t.Deadline && (t.Phase != "betting" || !t.everyoneIn(now)) {
		return nil
	}
	switch t.Phase {
	case "betting":
		return t.deal(rng, now)
	case "playing":
		// Out of time: the hand stands.
		t.current().Done = true
		return t.next(rng, now)
	case "done":
		t.Phase = "waiting"
		t.Dealer = nil
		t.Seats = []*TableSeat{}
		t.Round++
	}
	return nil
}

// Pending lists the bets not settled yet, to refund them if the table closes.
func (t *Table) Pending() []*TableSeat {
	if t.Phase == "betting" || t.Phase == "playing" {
		return t.Seats
	}
	return nil
}

// View is the table as one player (or a spectator, with an empty id) sees it.
func (t *Table) View(userID string, now int64) TableView {
	done := t.Phase == "done"
	dealer := t.Dealer
	if t.Phase == "playing" {
		dealer = t.Dealer[:1]
	}
	if dealer == nil {
		dealer = []Card{}
	}
	v := TableView{
		Phase: t.Phase, Round: t.Round, Dealer: dealer, DealerTotal: bjTotal(dealer), Hole: t.Phase == "playing",
		Seats: []TableSeatView{}, Free: TableSeats - len(t.Seats), Seated: t.seat(userID) != nil, Actions: t.allowed(userID),
	}
	if t.Phase != "waiting" {
		v.Remaining = max(0, t.Deadline-now)
		v.Window = map[string]int64{"betting": tableBetWindow, "playing": tableTurnTime, "done": tableShowTime}[t.Phase]
	}
	v.CanBet = userID != "" && !v.Seated && v.Free > 0 && (t.Phase == "waiting" || t.Phase == "betting")
	for i, s := range t.Seats {
		sv := TableSeatView{Name: s.Name, Cards: s.Cards, Total: bjTotal(s.Cards), Bet: s.Bet, Result: s.Result, You: s.UserID == userID, Turn: t.Phase == "playing" && i == t.Turn}
		if done {
			p := s.Payout
			sv.Payout = &p
		}
		v.Seats = append(v.Seats, sv)
	}
	return v
}

// ---------- the money side, for the server ----------

// TableDebit takes a bet from the wallet and says how much came out of the grant.
func TableDebit(w *Wallet, amount int64) (fromStake int64, err error) {
	fromStake = min(w.Stake, amount)
	return fromStake, w.debit(amount)
}

// TableRefund gives back a bet that was never played.
func TableRefund(w *Wallet, amount, fromStake int64) {
	w.Stake += fromStake
	w.Loot += amount - fromStake
}

// TableSettle records the end of a hand at the shared table.
func (e *Engine) TableSettle(w *Wallet, wagered, payout int64) {
	e.settle(w, "blackjack", wagered, payout)
}

// TableLose takes chips lost at a table that closed before the player left.
func TableLose(w *Wallet, amount int64) error { return w.debit(amount) }
