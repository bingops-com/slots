package engine

import (
	"fmt"
	"math"
)

// A shared blackjack table: several players bet on the same deal and play
// their hands in turn against one dealer. A player may bet on several of the
// five places and plays each of those hands. The table waits for a first bet,
// deals as soon as everyone watching says they are ready (or after a short
// moment), gives
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
	Pos         int // screen position: 0 left, 4 right; played from right to left
	UserID      string
	Name        string
	Cards       []Card
	Bet         int64
	FromStake   int64 // how much of the bet came out of the grant, to refund it exactly
	Done        bool
	Doubled     bool
	Result      string
	Payout      int64
	Split       *TableSeat // a second hand at the same place, never another betting spot
	SplitHand   bool
	SideBets    TableSideBets
	SideResults []TableSideResult
}

type Table struct {
	Phase    string // waiting, betting, playing, done
	Dealer   []Card
	Seats    []*TableSeat
	Turn     int
	Hand     int // first or split hand at the current place
	Deadline int64
	Round    int64
	// Present is when each signed-in player last looked at the table: the deal
	// does not wait for people who are not there.
	Present map[string]int64
	// Ready holds the players who have placed all the bets they wanted.
	Ready map[string]bool
}

// TableResult is what the server must settle for one player.
type TableResult struct {
	UserID  string
	Wagered int64
	Payout  int64
}

type TableSeatView struct {
	Pos         int               `json:"pos"`
	Name        string            `json:"name"`
	Cards       []Card            `json:"cards"`
	Total       int               `json:"total"`
	Bet         int64             `json:"bet"`
	Result      string            `json:"result,omitempty"`
	Payout      *int64            `json:"payout,omitempty"`
	You         bool              `json:"you,omitempty"`
	Turn        bool              `json:"turn,omitempty"`
	MainBet     int64             `json:"mainBet"`
	Hands       []TableHandView   `json:"hands"`
	SideResults []TableSideResult `json:"sideResults"`
}

type TableHandView struct {
	BlackjackHandView
	Turn bool `json:"turn,omitempty"`
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
	Ready       bool            `json:"ready"`    // the player asked for the deal
	CanReady    bool            `json:"canReady"` // the player has bets down and may ask for it
	CanBet      bool            `json:"canBet"`
	Actions     []string        `json:"actions"`
}

func NewTable() *Table {
	return &Table{Phase: "waiting", Seats: []*TableSeat{}, Present: map[string]int64{}, Ready: map[string]bool{}}
}

// Seen records that a player is looking at the table.
func (t *Table) Seen(userID string, now int64) { t.Present[userID] = now }

// everyoneIn says whether all the players at the table have placed their bets
// and asked for the deal.
func (t *Table) everyoneIn(now int64) bool {
	for id, at := range t.Present {
		if now-at > tablePresence {
			delete(t.Present, id)
			continue
		}
		if !t.Ready[id] {
			return false
		}
	}
	return true
}

// CanReady says whether the player may ask for the deal: the bets are open and
// one of them is theirs.
func (t *Table) CanReady(userID string) bool {
	return t.Phase == "betting" && t.seat(userID) != nil && !t.Ready[userID]
}

// SetReady records that the player has no more bets to place.
func (t *Table) SetReady(userID string, now int64) {
	t.Ready[userID] = true
	t.Seen(userID, now)
}

// Stamp changes whenever something happens at the table.
func (t *Table) Stamp() string {
	cards := len(t.Dealer)
	for _, s := range t.Seats {
		for _, h := range s.hands() {
			cards += len(h.Cards)
		}
	}
	return fmt.Sprintf("%s/%d/%d/%d/%d/%d/%d", t.Phase, t.Round, t.Turn, t.Hand, t.Deadline, len(t.Seats), cards)
}

func (t *Table) seat(userID string) *TableSeat {
	for _, s := range t.Seats {
		if s.UserID == userID {
			return s
		}
	}
	return nil
}

// place is the place the player gets: the one asked for, or the first free one
// when pos is negative. It is -1 when that cannot be.
func (t *Table) place(pos int) int {
	taken := [TableSeats]bool{}
	for _, s := range t.Seats {
		taken[s.Pos] = true
	}
	if pos >= 0 {
		if pos >= TableSeats || taken[pos] {
			return -1
		}
		return pos
	}
	for i := TableSeats - 1; i >= 0; i-- {
		if !taken[i] {
			return i
		}
	}
	return -1
}

// CanBet says whether the player may join the coming deal at that place (any
// free place when pos is negative).
func (t *Table) CanBet(userID string, amount int64, pos int) error {
	if amount < minBet || amount > maxBet {
		return Error("Mise invalide")
	}
	if t.Phase != "waiting" && t.Phase != "betting" {
		return Error("La donne est en cours, attendez la suivante")
	}
	if t.Ready[userID] {
		return Error("Vos mises sont posées, la donne arrive")
	}
	if len(t.Seats) >= TableSeats {
		return Error("La table est complète")
	}
	if t.place(pos) < 0 {
		return Error("Cette place est prise")
	}
	return nil
}

// Bet seats the player at a place accepted by CanBet. The first bet opens the
// window for the others.
func (t *Table) Bet(userID, name string, amount, fromStake int64, pos int, now int64) {
	t.BetWithSides(userID, name, amount, fromStake, TableSideBets{}, pos, now)
}

func (t *Table) BetWithSides(userID, name string, amount, fromStake int64, sides TableSideBets, pos int, now int64) {
	seat := &TableSeat{Pos: t.place(pos), UserID: userID, Name: name, Bet: amount, FromStake: fromStake, Cards: []Card{}, SideBets: sides, SideResults: []TableSideResult{}}
	at := 0
	for at < len(t.Seats) && t.Seats[at].Pos > seat.Pos {
		at++
	}
	t.Seats = append(t.Seats[:at], append([]*TableSeat{seat}, t.Seats[at:]...)...)
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
	if t.Hand == 1 {
		return t.Seats[t.Turn].Split
	}
	return t.Seats[t.Turn]
}

func (t *Table) allowed(userID string) []string {
	s := t.current()
	if s == nil || s.UserID != userID {
		return []string{}
	}
	if len(s.Cards) == 2 {
		actions := []string{"hit", "stand", "double"}
		if !s.SplitHand && s.Cards[0].value() == s.Cards[1].value() {
			actions = append(actions, "split")
		}
		return actions
	}
	return []string{"hit", "stand"}
}

// CanAct checks the action and returns what it costs on top of the bet
// (doubling costs the bet again).
func (t *Table) CanAct(userID, action string) (extra int64, err error) {
	for _, a := range t.allowed(userID) {
		if a == action {
			if action == "double" || action == "split" {
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
	case "split":
		second := &TableSeat{Pos: s.Pos, UserID: s.UserID, Name: s.Name, Bet: s.Bet, FromStake: extraFromStake, SplitHand: true}
		first, other := s.Cards[0], s.Cards[1]
		s.Split, s.SplitHand = second, true
		s.Cards = []Card{first, bjDraw(rng)}
		second.Cards = []Card{other, bjDraw(rng)}
		// Split aces receive one card each; split 21 is an ordinary winning hand.
		s.Done = first.R == "A" || bjTotal(s.Cards) >= 21
		second.Done = first.R == "A" || bjTotal(second.Cards) >= 21
	}
	t.Deadline = now + tableTurnTime
	if s.Done {
		return t.next(rng, now)
	}
	return nil
}

// next gives the turn to the next hand still to play, or ends the deal.
func (t *Table) next(rng Source, now int64) []TableResult {
	for t.Turn < len(t.Seats) && t.current().Done {
		if t.Hand == 0 && t.Seats[t.Turn].Split != nil {
			t.Hand = 1
		} else {
			t.Turn++
			t.Hand = 0
		}
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
	t.Hand = 0
	t.Dealer = []Card{}
	for _, s := range t.Seats {
		s.Cards = []Card{}
	}
	for range 2 {
		for _, s := range t.Seats {
			s.Cards = append(s.Cards, bjDraw(rng))
		}
		t.Dealer = append(t.Dealer, bjDraw(rng))
	}
	for _, s := range t.Seats {
		s.Done = bjNatural(s.Cards)
		s.sideResults(t.Dealer[0])
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
		for _, h := range s.hands() {
			if bjTotal(h.Cards) <= 21 && (!bjNatural(h.Cards) || h.SplitHand) {
				live = true
			}
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
		for _, h := range s.hands() {
			p := bjTotal(h.Cards)
			natural := bjNatural(h.Cards) && !h.Doubled && !h.SplitHand
			mult := 0.0
			h.Result = "lose"
			switch {
			case p > 21:
			case natural && dealerBJ:
				mult, h.Result = 1, "push"
			case natural:
				mult, h.Result = 2.5, "blackjack"
			case dealerBJ:
			case d > 21 || p > d:
				mult, h.Result = 2, "win"
			case p == d:
				mult, h.Result = 1, "push"
			}
			h.Payout = int64(math.Round(float64(h.Bet) * mult))
			payout := h.Payout
			for _, side := range h.SideResults {
				payout += side.Payout
			}
			results = append(results, TableResult{UserID: h.UserID, Wagered: h.Committed(), Payout: payout})
		}
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
		t.Ready = map[string]bool{}
		t.Round++
	}
	return nil
}

// Pending lists the bets not settled yet, to refund them if the table closes.
func (t *Table) Pending() []*TableSeat {
	if t.Phase == "betting" || t.Phase == "playing" {
		pending := []*TableSeat{}
		for _, seat := range t.Seats {
			pending = append(pending, seat.hands()...)
		}
		return pending
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
	v.Ready, v.CanReady = t.Ready[userID], t.CanReady(userID)
	v.CanBet = userID != "" && !v.Ready && v.Free > 0 && (t.Phase == "waiting" || t.Phase == "betting")
	for i, s := range t.Seats {
		sv := TableSeatView{Pos: s.Pos, Name: s.Name, Cards: s.Cards, Total: bjTotal(s.Cards), Bet: s.Bet, Result: s.Result, You: s.UserID == userID, Turn: t.Phase == "playing" && i == t.Turn}
		sv.MainBet = s.Bet
		sv.SideResults = s.SideResults
		sv.Bet = 0
		totalPayout := int64(0)
		for j, h := range s.hands() {
			hv := TableHandView{BlackjackHandView: BlackjackHandView{Cards: h.Cards, Bet: h.Bet, Total: bjTotal(h.Cards), Result: h.Result}, Turn: sv.Turn && j == t.Hand}
			if done {
				p := h.Payout
				hv.Payout = &p
			}
			sv.Hands = append(sv.Hands, hv)
			sv.Bet += h.Committed()
			totalPayout += h.Payout
		}
		for _, side := range s.SideResults {
			totalPayout += side.Payout
		}
		if done && s.Split != nil {
			sv.Result = "lose"
			if totalPayout > sv.Bet {
				sv.Result = "win"
			} else if totalPayout == sv.Bet {
				sv.Result = "push"
			}
		}
		if done {
			p := totalPayout
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
