package engine

import (
	"sort"
)

// A shared Texas hold'em table, no limit. Players sit with a buy-in taken from
// their wallet, play hand after hand against each other and against the
// characters of the house, and leave with the chips they have left. The house
// takes no rake: what a player wins comes from the others at the table.
//
// This file is the table's rules only. It holds no money and no clock: the
// server takes the buy-ins, pays the cash-outs, and passes the time in.

const (
	PokerSeats      = 6
	PokerSmallBlind = 50
	PokerBigBlind   = 100
	PokerMinBuyIn   = 40 * PokerBigBlind
	PokerMaxBuyIn   = 200 * PokerBigBlind

	pokerPlayers   = 4      // the house's characters fill the table up to this many players
	pokerTurnTime  = 25_000 // ms to act before checking or folding by default
	pokerStartTime = 3_000  // ms between a seat being taken and the first hand
	pokerShowTime  = 6_000  // ms a finished hand stays on the table
	pokerStreetGap = 1_100  // ms before the next board cards
	pokerAwayTime  = 45_000 // ms without news from a player before their seat is given up
)

// PokerCharacter is one of the house's players: a name, a face, a temper.
type PokerCharacter struct {
	Name   string
	Avatar string
	// How strong a hand they need to enter a pot (0 loose, 1 tight), how often
	// they bet and raise rather than call, how often they bluff.
	Tight, Aggro, Bluff float64
}

var pokerCharacters = []PokerCharacter{
	{"Barbe-Rouge", "beard/captain", 0.30, 0.75, 0.22},
	{"La Vigie", "beard/lookout", 0.62, 0.45, 0.05},
	{"Le Canonnier", "beard/gunner", 0.22, 0.15, 0.03},
	{"Le Corsaire", "beard/corsair", 0.45, 0.60, 0.30},
	{"Le Mousse", "beard/sailor", 0.38, 0.35, 0.12},
	{"Le Pêcheur", "bass/fisherman", 0.55, 0.30, 0.08},
}

type PokerSeat struct {
	UserID    string // empty for a character
	Character int    // index in pokerCharacters, for a character
	Name      string
	Avatar    string
	Stack     int64
	BuyIn     int64 // what the player brought in, to settle when they leave
	FromStake int64 // how much of it came out of the grant
	Hole      []Card
	Bet       int64 // put in on this street
	Total     int64 // put in on this hand
	InHand    bool
	Folded    bool
	AllIn     bool
	Acted     bool
	Leaving   bool // gives the seat up at the end of the hand
	LastSeen  int64
	Shown     bool   // hole cards revealed at the showdown
	Won       int64  // what the last hand brought
	HandName  string // "Paire", "Couleur"… at the showdown
	Last      string // last action, for the table to show
}

type Poker struct {
	Seats    [PokerSeats]*PokerSeat
	Phase    string // idle, preflop, flop, turn, river, showdown
	Button   int
	Board    []Card
	Turn     int // seat to act, -1 when nobody
	Deadline int64
	Bet      int64 // highest bet of the street
	MinRaise int64
	Hand     int64
	deck     []Card
}

// PokerCashout is a player leaving the table with their chips.
type PokerCashout struct {
	UserID    string
	BuyIn     int64
	FromStake int64
	Stack     int64
}

func NewPoker() *Poker { return &Poker{Phase: "idle", Turn: -1, Button: PokerSeats - 1} }

func (t *Poker) seatOf(userID string) int {
	for i, s := range t.Seats {
		if s != nil && s.UserID != "" && s.UserID == userID {
			return i
		}
	}
	return -1
}

func (t *Poker) humans() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && s.UserID != "" {
			n++
		}
	}
	return n
}

// CanSit says whether the player may take a seat with this buy-in.
func (t *Poker) CanSit(userID string, buyIn int64) error {
	if buyIn < PokerMinBuyIn || buyIn > PokerMaxBuyIn {
		return Error("Cave : entre 40 et 200 grosses blindes")
	}
	if t.seatOf(userID) >= 0 {
		return Error("Vous êtes déjà assis")
	}
	if t.free() < 0 {
		return Error("La table est complète")
	}
	return nil
}

func (t *Poker) free() int {
	for i, s := range t.Seats {
		if s == nil {
			return i
		}
	}
	// A character that is not playing the current hand gives up its seat.
	for i, s := range t.Seats {
		if s.UserID == "" && !s.InHand {
			return i
		}
	}
	return -1
}

// The faces of the players, picked by their name.
var pokerAvatars = []string{"tables/crab", "bass/fish", "bass/dragonfly", "tables/dealer", "bounty/skull", "bass/float"}

// Sit seats a player already accepted by CanSit.
func (t *Poker) Sit(userID, name string, buyIn, fromStake, now int64) {
	h := 0
	for _, c := range name {
		h = h*31 + int(c)
	}
	t.Seats[t.free()] = &PokerSeat{UserID: userID, Name: name, Avatar: pokerAvatars[(h%len(pokerAvatars)+len(pokerAvatars))%len(pokerAvatars)],
		Stack: buyIn, BuyIn: buyIn, FromStake: fromStake, LastSeen: now}
	if t.Phase == "idle" {
		t.Deadline = now + pokerStartTime
	}
}

// Seen records that the player is still there.
func (t *Poker) Seen(userID string, now int64) {
	if i := t.seatOf(userID); i >= 0 {
		t.Seats[i].LastSeen = now
	}
}

// Leave gives the seat up: at once when the player is not in a hand,
// otherwise their hand is folded first. It returns the cash-out to settle.
func (t *Poker) Leave(rng Source, userID string, now int64) []PokerCashout {
	i := t.seatOf(userID)
	if i < 0 {
		return nil
	}
	s := t.Seats[i]
	out := []PokerCashout{}
	if s.InHand && !s.Folded && t.Phase != "showdown" && t.Phase != "idle" {
		wasTurn := t.Turn == i
		t.fold(i)
		if wasTurn || t.alive() <= 1 {
			out = append(out, t.advance(rng, now)...)
		}
	}
	// The chips already in the pot stay there; the rest leaves with the player.
	out = append(out, PokerCashout{UserID: s.UserID, BuyIn: s.BuyIn, FromStake: s.FromStake, Stack: s.Stack})
	if s.InHand && t.Phase != "idle" {
		// The seat stays as a ghost until the hand ends, so the pot keeps its chips.
		s.UserID, s.Stack, s.Character = "", 0, -1
	} else {
		t.Seats[i] = nil
	}
	return out
}

func (t *Poker) fold(i int) {
	s := t.Seats[i]
	s.Folded, s.Acted, s.Last = true, true, "se couche"
}

// alive counts the players still in the hand.
func (t *Poker) alive() int {
	n := 0
	for _, s := range t.Seats {
		if s != nil && s.InHand && !s.Folded {
			n++
		}
	}
	return n
}

func (t *Poker) pot() int64 {
	var p int64
	for _, s := range t.Seats {
		if s != nil {
			p += s.Total
		}
	}
	return p
}

func (t *Poker) next(from int, ok func(*PokerSeat) bool) int {
	for k := 1; k <= PokerSeats; k++ {
		i := (from + k) % PokerSeats
		if s := t.Seats[i]; s != nil && ok(s) {
			return i
		}
	}
	return -1
}

func canAct(s *PokerSeat) bool { return s.InHand && !s.Folded && !s.AllIn }

func (t *Poker) put(i int, amount int64) {
	s := t.Seats[i]
	amount = min(amount, s.Stack)
	s.Stack -= amount
	s.Bet += amount
	s.Total += amount
	if s.Stack == 0 {
		s.AllIn = true
	}
}

// PokerActions lists what the player to act may do, with the amounts.
type PokerActions struct {
	Fold     bool  `json:"fold"`
	Check    bool  `json:"check"`
	Call     int64 `json:"call"`     // chips to add to call, 0 when there is nothing to call
	MinRaise int64 `json:"minRaise"` // smallest total bet of a raise, 0 when raising is not possible
	MaxRaise int64 `json:"maxRaise"` // all the chips: the total bet of an all-in
}

func (t *Poker) actions(i int) PokerActions {
	s := t.Seats[i]
	toCall := min(t.Bet-s.Bet, s.Stack)
	a := PokerActions{Fold: true, Check: toCall == 0, Call: toCall}
	if s.Stack > toCall {
		a.MaxRaise = s.Bet + s.Stack
		a.MinRaise = min(t.Bet+t.MinRaise, a.MaxRaise)
	}
	return a
}

// Act plays the action of the player whose turn it is. amount is the total
// bet of a raise.
func (t *Poker) Act(rng Source, userID, action string, amount, now int64) ([]PokerCashout, error) {
	i := t.seatOf(userID)
	if i < 0 || i != t.Turn {
		return nil, Error("Ce n'est pas votre tour")
	}
	if err := t.play(i, action, amount); err != nil {
		return nil, err
	}
	t.Seats[i].LastSeen = now
	return t.advance(rng, now), nil
}

func (t *Poker) play(i int, action string, amount int64) error {
	s := t.Seats[i]
	a := t.actions(i)
	switch action {
	case "fold":
		t.fold(i)
	case "check":
		if !a.Check {
			return Error("Il y a une mise à suivre")
		}
		s.Acted, s.Last = true, "parole"
	case "call":
		if a.Call == 0 {
			return Error("Rien à suivre")
		}
		t.put(i, a.Call)
		s.Acted, s.Last = true, "suit"
		if s.AllIn {
			s.Last = "tapis"
		}
	case "raise":
		if a.MinRaise == 0 || amount < a.MinRaise || amount > a.MaxRaise {
			return Error("Relance invalide")
		}
		raise := amount - t.Bet
		t.put(i, amount-s.Bet)
		if raise > t.MinRaise {
			t.MinRaise = raise
		}
		t.Bet = amount
		// Everyone else has to answer the raise.
		for _, o := range t.Seats {
			if o != nil && canAct(o) {
				o.Acted = false
			}
		}
		s.Acted, s.Last = true, "relance"
		if s.AllIn {
			s.Last = "tapis"
		}
	default:
		return Error("Action inconnue")
	}
	return nil
}

// advance moves on after an action: to the next player, the next street, or
// the end of the hand.
func (t *Poker) advance(rng Source, now int64) []PokerCashout {
	if t.alive() <= 1 {
		return t.showdown(now)
	}
	open := func(s *PokerSeat) bool { return canAct(s) && (!s.Acted || s.Bet < t.Bet) }
	if nxt := t.next(t.Turn, open); nxt >= 0 {
		t.Turn = nxt
		t.Deadline = now + pokerTurnTime
		if t.Seats[nxt].UserID == "" {
			t.Deadline = now + 900 + int64(rng()*1400) // a character thinks for a moment
		}
		return nil
	}
	// The street is over.
	t.Turn = -1
	t.Deadline = now + pokerStreetGap
	return nil
}

// street deals the next board cards and opens the betting, or ends the hand.
func (t *Poker) street(rng Source, now int64) []PokerCashout {
	for _, s := range t.Seats {
		if s != nil {
			s.Bet, s.Acted = 0, false
			if s.InHand && !s.Folded {
				s.Last = ""
			}
		}
	}
	t.Bet, t.MinRaise = 0, PokerBigBlind
	switch t.Phase {
	case "preflop":
		t.Phase = "flop"
		t.Board = append(t.Board, t.draw(), t.draw(), t.draw())
	case "flop":
		t.Phase = "turn"
		t.Board = append(t.Board, t.draw())
	case "turn":
		t.Phase = "river"
		t.Board = append(t.Board, t.draw())
	default:
		return t.showdown(now)
	}
	// With at most one player able to bet, the board simply runs out.
	able := 0
	for _, s := range t.Seats {
		if s != nil && canAct(s) {
			able++
		}
	}
	if able <= 1 {
		t.Turn, t.Deadline = -1, now+pokerStreetGap
		return nil
	}
	t.Turn = t.Button
	return t.advance(rng, now)
}

func (t *Poker) draw() Card {
	c := t.deck[len(t.deck)-1]
	t.deck = t.deck[:len(t.deck)-1]
	return c
}

// start deals a new hand.
func (t *Poker) start(rng Source, now int64) {
	// The house's characters come and go so that the table has enough players.
	humans := t.humans()
	want := max(1, pokerPlayers-humans)
	have := 0
	for i, s := range t.Seats {
		if s == nil || s.UserID != "" {
			continue
		}
		if s.Character < 0 || have >= want {
			t.Seats[i] = nil
			continue
		}
		have++
		if s.Stack < 20*PokerBigBlind {
			s.Stack = 100 * PokerBigBlind // back from the hold with a fresh purse
		}
	}
	for i := range t.Seats {
		if have >= want {
			break
		}
		if t.Seats[i] != nil {
			continue
		}
		c := -1
		for k := range pokerCharacters {
			j := (int(t.Hand) + i + k) % len(pokerCharacters)
			used := false
			for _, s := range t.Seats {
				used = used || (s != nil && s.UserID == "" && s.Character == j)
			}
			if !used {
				c = j
				break
			}
		}
		if c < 0 {
			break
		}
		ch := pokerCharacters[c]
		t.Seats[i] = &PokerSeat{Character: c, Name: ch.Name, Avatar: ch.Avatar, Stack: 100 * PokerBigBlind}
		have++
	}

	t.Hand++
	t.Board = []Card{}
	t.deck = make([]Card, 0, 52)
	for _, s := range bjSuits {
		for _, r := range bjRanks {
			t.deck = append(t.deck, Card{R: r, S: s})
		}
	}
	for i := len(t.deck) - 1; i > 0; i-- {
		j := intn(rng, i+1)
		t.deck[i], t.deck[j] = t.deck[j], t.deck[i]
	}
	for _, s := range t.Seats {
		if s == nil {
			continue
		}
		*s = PokerSeat{UserID: s.UserID, Character: s.Character, Name: s.Name, Avatar: s.Avatar, Stack: s.Stack, BuyIn: s.BuyIn, FromStake: s.FromStake, LastSeen: s.LastSeen}
		s.InHand = s.Stack > 0
		if s.InHand {
			s.Hole = []Card{t.draw(), t.draw()}
		}
	}
	in := func(s *PokerSeat) bool { return s.InHand }
	t.Button = t.next(t.Button, in)
	sb := t.next(t.Button, in)
	if t.alive() == 2 {
		sb = t.Button // heads-up: the button posts the small blind
	}
	bb := t.next(sb, in)
	t.put(sb, PokerSmallBlind)
	t.put(bb, PokerBigBlind)
	t.Seats[sb].Last, t.Seats[bb].Last = "petite blinde", "grosse blinde"
	t.Phase, t.Bet, t.MinRaise = "preflop", PokerBigBlind, PokerBigBlind
	t.Turn = bb
	t.advance(rng, now)
}

// showdown ends the hand: the pots are shared, the cards of those still in are
// shown, and the players who are leaving or broke give their seat up.
func (t *Poker) showdown(now int64) []PokerCashout {
	contested := t.alive() > 1
	// With everyone all-in before the river, the board is completed first.
	for contested && len(t.Board) < 5 {
		t.Board = append(t.Board, t.draw())
	}
	type entry struct {
		seat  int
		score [6]int
	}
	var live []entry
	for i, s := range t.Seats {
		if s == nil || !s.InHand || s.Folded {
			continue
		}
		e := entry{seat: i}
		if contested {
			var name string
			e.score, name = pokerBest(append(append([]Card{}, s.Hole...), t.Board...))
			s.Shown, s.HandName = true, name
		}
		live = append(live, e)
	}
	// Side pots: one per level of commitment, open to those who reached it.
	levels := []int64{}
	for _, s := range t.Seats {
		if s != nil && s.Total > 0 && s.InHand && !s.Folded {
			levels = append(levels, s.Total)
		}
	}
	sort.Slice(levels, func(a, b int) bool { return levels[a] < levels[b] })
	var prev int64
	for _, level := range levels {
		if level == prev {
			continue
		}
		var pot int64
		for _, s := range t.Seats {
			if s != nil {
				pot += max(0, min(s.Total, level)-prev)
			}
		}
		var best [6]int
		var winners []int
		for _, e := range live {
			if t.Seats[e.seat].Total < level {
				continue
			}
			switch c := compareScore(e.score, best); {
			case len(winners) == 0 || c > 0:
				best, winners = e.score, []int{e.seat}
			case c == 0:
				winners = append(winners, e.seat)
			}
		}
		share := pot / int64(len(winners))
		for k, w := range winners {
			got := share
			if k == 0 {
				got += pot % int64(len(winners)) // the odd chips go to the first winner
			}
			t.Seats[w].Stack += got
			t.Seats[w].Won += got
		}
		prev = level
	}
	// Chips committed above the highest live level (a bet nobody called and
	// whose owner folded cannot exist; a bet nobody called goes back).
	for _, s := range t.Seats {
		if s != nil && s.Total > prev && s.InHand && !s.Folded {
			s.Stack += s.Total - prev
		}
	}
	t.Phase, t.Turn, t.Deadline = "showdown", -1, now+pokerShowTime
	if !contested {
		t.Deadline = now + pokerShowTime/2
	}
	return nil
}

func compareScore(a, b [6]int) int {
	for i := range a {
		if a[i] != b[i] {
			return a[i] - b[i]
		}
	}
	return 0
}

// cleanup, once a finished hand has been shown: players who left, are broke
// or have gone silent give their seat up.
func (t *Poker) cleanup(now int64) []PokerCashout {
	out := []PokerCashout{}
	for i, s := range t.Seats {
		if s == nil {
			continue
		}
		s.InHand = false
		if s.UserID == "" {
			if s.Character < 0 {
				t.Seats[i] = nil // the ghost of a player who left during the hand
			}
			continue
		}
		if s.Stack == 0 || now-s.LastSeen > pokerAwayTime {
			out = append(out, PokerCashout{UserID: s.UserID, BuyIn: s.BuyIn, FromStake: s.FromStake, Stack: s.Stack})
			t.Seats[i] = nil
		}
	}
	return out
}

// Tick moves the table on when a deadline has passed: a character plays, a
// player out of time checks or folds, the next cards come, the next hand
// starts. It returns the cash-outs to settle.
func (t *Poker) Tick(rng Source, now int64) []PokerCashout {
	if now < t.Deadline {
		return nil
	}
	switch t.Phase {
	case "idle":
		if t.humans() == 0 {
			return nil
		}
		t.start(rng, now)
	case "showdown":
		out := t.cleanup(now)
		t.Phase, t.Board = "idle", []Card{}
		if t.humans() == 0 {
			// Nobody left to play with: the characters go back to their ship.
			t.Seats = [PokerSeats]*PokerSeat{}
			return out
		}
		t.start(rng, now)
		return out
	default:
		if t.Turn < 0 {
			return t.street(rng, now)
		}
		s := t.Seats[t.Turn]
		if s.UserID == "" && s.Character >= 0 {
			action, amount := t.think(rng, t.Turn)
			if t.play(t.Turn, action, amount) != nil {
				t.fold(t.Turn)
			}
		} else if t.actions(t.Turn).Check {
			_ = t.play(t.Turn, "check", 0)
		} else {
			t.fold(t.Turn)
		}
		return t.advance(rng, now)
	}
	return nil
}

// Pending lists the seats holding players' chips, to give them back if the
// table closes.
func (t *Poker) Pending() []PokerCashout {
	out := []PokerCashout{}
	for _, s := range t.Seats {
		if s != nil && s.UserID != "" {
			// A hand that will not be finished is cancelled: everyone takes back
			// what they had put in.
			out = append(out, PokerCashout{UserID: s.UserID, BuyIn: s.BuyIn, FromStake: s.FromStake, Stack: s.Stack + s.Total})
		}
	}
	return out
}

// ---------- the characters' play ----------

var pokerRankValue = map[string]int{"2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14}

// strength rates a hand between 0 and 1: the hole cards before the flop, the
// best five cards after.
func (t *Poker) strength(i int) float64 {
	s := t.Seats[i]
	a, b := pokerRankValue[s.Hole[0].R], pokerRankValue[s.Hole[1].R]
	if a < b {
		a, b = b, a
	}
	if len(t.Board) == 0 {
		v := float64(a+b) / 56 // 0.07 to 0.5
		if a == b {
			v = 0.5 + float64(a)/28
		} else {
			if s.Hole[0].S == s.Hole[1].S {
				v += 0.08
			}
			if a-b <= 2 {
				v += 0.05
			}
			if a >= 13 {
				v += 0.1
			}
		}
		return min(v, 1)
	}
	score, _ := pokerBest(append(append([]Card{}, s.Hole...), t.Board...))
	board, _ := pokerBest(t.Board)
	base := []float64{0.12, 0.42, 0.66, 0.8, 0.88, 0.92, 0.97, 0.99, 1}[score[0]]
	if score[0] == board[0] && len(t.Board) >= 5 || (score[0] == 1 && board[0] == 1) {
		base -= 0.25 // the board holds it, not the hand
	}
	if score[0] == 1 { // a pair: top pair is worth more than bottom pair
		base += float64(score[1]-8) / 60
	}
	if score[0] == 0 {
		base += float64(a-8) / 100
	}
	return max(0, min(base, 1))
}

func (t *Poker) think(rng Source, i int) (string, int64) {
	s := t.Seats[i]
	ch := pokerCharacters[s.Character]
	a := t.actions(i)
	v := t.strength(i) + (rng()-0.5)*0.12
	pot := t.pot()
	size := func(frac float64) int64 {
		to := t.Bet + int64(float64(pot)*frac)
		to = to / PokerSmallBlind * PokerSmallBlind
		return max(a.MinRaise, min(to, a.MaxRaise))
	}
	bluff := rng() < ch.Bluff*0.5
	if a.Check {
		if a.MinRaise > 0 && (v > 0.62-ch.Aggro*0.2 && rng() < 0.45+ch.Aggro*0.5 || bluff) {
			return "raise", size(0.45 + rng()*0.4)
		}
		return "check", 0
	}
	odds := float64(a.Call) / float64(pot+a.Call)
	need := 0.22 + ch.Tight*0.3 + odds*0.9
	if len(t.Board) == 0 {
		need = 0.2 + ch.Tight*0.28 + odds*0.6
	}
	if a.MinRaise > 0 && (v > need+0.3-ch.Aggro*0.12 && rng() < 0.3+ch.Aggro*0.6 || bluff && odds < 0.3) {
		return "raise", size(0.6 + rng()*0.5)
	}
	if v > need {
		return "call", 0
	}
	return "fold", 0
}

// ---------- hand ranking ----------

var pokerHandNames = []string{"Carte haute", "Paire", "Deux paires", "Brelan", "Suite", "Couleur", "Full", "Carré", "Quinte flush"}

// pokerBest ranks the best five cards out of those given. The score compares
// position by position: the kind of hand first, then the cards that decide.
func pokerBest(cards []Card) (score [6]int, name string) {
	var ranks [15]int
	suits := map[string][]int{}
	for _, c := range cards {
		v := pokerRankValue[c.R]
		ranks[v]++
		suits[c.S] = append(suits[c.S], v)
	}
	straight := func(has func(int) bool) int {
		run := 0
		for v := 14; v >= 1; v-- {
			x := v
			if v == 1 {
				x = 14 // the ace also plays low
			}
			if has(x) {
				run++
				if run == 5 {
					return v + 4
				}
			} else {
				run = 0
			}
		}
		return 0
	}
	var flush []int
	for _, vs := range suits {
		if len(vs) >= 5 {
			sort.Sort(sort.Reverse(sort.IntSlice(vs)))
			flush = vs
		}
	}
	// Groups of equal ranks, the biggest first, then the highest.
	type group struct{ n, v int }
	var groups []group
	for v := 14; v >= 2; v-- {
		if ranks[v] > 0 {
			groups = append(groups, group{ranks[v], v})
		}
	}
	sort.SliceStable(groups, func(a, b int) bool { return groups[a].n > groups[b].n })
	kickers := func(skip ...int) []int {
		var out []int
		for v := 14; v >= 2; v-- {
			used := false
			for _, s := range skip {
				used = used || s == v
			}
			if ranks[v] > 0 && !used {
				out = append(out, v)
			}
		}
		// Fewer than five cards (the board alone): pad, so callers can index.
		return append(out, 0, 0, 0, 0, 0)
	}
	set := func(kind int, vals ...int) ([6]int, string) {
		s := [6]int{kind}
		copy(s[1:], vals)
		return s, pokerHandNames[kind]
	}
	if flush != nil {
		in := map[int]bool{}
		for _, v := range flush {
			in[v] = true
		}
		if top := straight(func(v int) bool { return in[v] }); top > 0 {
			return set(8, top)
		}
	}
	if groups[0].n == 4 {
		return set(7, groups[0].v, kickers(groups[0].v)[0])
	}
	if groups[0].n == 3 && len(groups) > 1 && groups[1].n >= 2 {
		return set(6, groups[0].v, groups[1].v)
	}
	if flush != nil {
		return set(5, flush[:5]...)
	}
	if top := straight(func(v int) bool { return ranks[v] > 0 }); top > 0 {
		return set(4, top)
	}
	if groups[0].n == 3 {
		k := kickers(groups[0].v)
		return set(3, groups[0].v, k[0], k[1])
	}
	if groups[0].n == 2 && len(groups) > 1 && groups[1].n == 2 {
		return set(2, groups[0].v, groups[1].v, kickers(groups[0].v, groups[1].v)[0])
	}
	if groups[0].n == 2 {
		k := kickers(groups[0].v)
		return set(1, append([]int{groups[0].v}, k[:3]...)...)
	}
	k := kickers()
	return set(0, k[:5]...)
}

// ---------- what a player sees ----------

type PokerSeatView struct {
	Seat     int    `json:"seat"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
	House    bool   `json:"house,omitempty"` // one of the house's characters
	Stack    int64  `json:"stack"`
	Bet      int64  `json:"bet"`
	InHand   bool   `json:"inHand"`
	Folded   bool   `json:"folded,omitempty"`
	AllIn    bool   `json:"allIn,omitempty"`
	Cards    []Card `json:"cards,omitempty"` // shown: the viewer's own, or at the showdown
	Hidden   int    `json:"hidden,omitempty"`
	Won      int64  `json:"won,omitempty"`
	HandName string `json:"handName,omitempty"`
	Last     string `json:"last,omitempty"`
	You      bool   `json:"you,omitempty"`
	Turn     bool   `json:"turn,omitempty"`
	Button   bool   `json:"button,omitempty"`
}

type PokerView struct {
	Phase     string          `json:"phase"`
	Hand      int64           `json:"hand"`
	Board     []Card          `json:"board"`
	Pot       int64           `json:"pot"`
	Seats     []PokerSeatView `json:"seats"`
	Remaining int64           `json:"remaining"`
	Seated    bool            `json:"seated"`
	Stack     int64           `json:"stack"`
	Actions   *PokerActions   `json:"actions"` // only when it is the viewer's turn
	Blinds    [2]int64        `json:"blinds"`
	BuyIn     [2]int64        `json:"buyIn"`
}

// View is the table as one player (or a spectator, with an empty id) sees it.
func (t *Poker) View(userID string, now int64) PokerView {
	v := PokerView{Phase: t.Phase, Hand: t.Hand, Board: t.Board, Pot: t.pot(), Seats: []PokerSeatView{},
		Blinds: [2]int64{PokerSmallBlind, PokerBigBlind}, BuyIn: [2]int64{PokerMinBuyIn, PokerMaxBuyIn}}
	if v.Board == nil {
		v.Board = []Card{}
	}
	if t.Phase != "idle" || t.humans() > 0 {
		v.Remaining = max(0, t.Deadline-now)
	}
	for i, s := range t.Seats {
		if s == nil {
			continue
		}
		you := userID != "" && s.UserID == userID
		sv := PokerSeatView{Seat: i, Name: s.Name, Avatar: s.Avatar, House: s.UserID == "" && s.Character >= 0, Stack: s.Stack, Bet: s.Bet,
			InHand: s.InHand, Folded: s.Folded, AllIn: s.AllIn, Won: s.Won, HandName: s.HandName, Last: s.Last,
			You: you, Turn: i == t.Turn, Button: i == t.Button && t.Phase != "idle"}
		if s.InHand && len(s.Hole) == 2 {
			if you || (s.Shown && t.Phase == "showdown") {
				sv.Cards = s.Hole
			} else if !s.Folded {
				sv.Hidden = 2
			}
		}
		if you {
			v.Seated, v.Stack = true, s.Stack
			if i == t.Turn {
				a := t.actions(i)
				v.Actions = &a
			}
		}
		v.Seats = append(v.Seats, sv)
	}
	return v
}

// PokerSettle records a player leaving the table: what they brought in was
// wagered, what they leave with is the payout.
func (e *Engine) PokerSettle(w *Wallet, buyIn, stack int64) {
	e.settle(w, "holdem", buyIn, stack)
}
