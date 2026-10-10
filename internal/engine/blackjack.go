package engine

import (
	"math"
	"slices"
)

var (
	bjRanks = []string{"A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"}
	bjSuits = []string{"♠", "♥", "♦", "♣"}
)

type Card struct {
	R string `json:"r"`
	S string `json:"s"`
}

type bjHand struct {
	Cards  []Card `json:"cards"`
	Bet    int64  `json:"bet"`
	Done   bool   `json:"done"`
	Result string `json:"result,omitempty"`
	Payout int64  `json:"payout"`
}

// Blackjack is a hand in progress; it lives in the wallet between two requests.
type Blackjack struct {
	Dealer  []Card   `json:"dealer"`
	Hands   []bjHand `json:"hands"`
	Active  int      `json:"active"`
	Split   bool     `json:"split"`
	Phase   string   `json:"phase"`
	Payout  int64    `json:"payout"`
	Wagered int64    `json:"wagered"`
}

type BlackjackHandView struct {
	Cards  []Card `json:"cards"`
	Bet    int64  `json:"bet"`
	Total  int    `json:"total"`
	Result string `json:"result,omitempty"`
	Payout *int64 `json:"payout,omitempty"`
}

// BlackjackView is what the player may see: the dealer's hole card is never
// sent before the end.
type BlackjackView struct {
	Phase       string              `json:"phase"`
	Dealer      []Card              `json:"dealer"`
	DealerTotal int                 `json:"dealerTotal"`
	Hole        bool                `json:"hole"`
	Hands       []BlackjackHandView `json:"hands"`
	Active      int                 `json:"active"`
	Actions     []string            `json:"actions"`
	Payout      *int64              `json:"payout,omitempty"`
}

// Infinite shoe: every card is drawn independently.
func bjDraw(rng Source) Card { return Card{R: bjRanks[intn(rng, 13)], S: bjSuits[intn(rng, 4)]} }

func (c Card) value() int {
	switch c.R {
	case "A":
		return 11
	case "10", "J", "Q", "K":
		return 10
	}
	return int(c.R[0] - '0')
}

func bjTotal(cards []Card) int {
	t, aces := 0, 0
	for _, c := range cards {
		t += c.value()
		if c.R == "A" {
			aces++
		}
	}
	for t > 21 && aces > 0 {
		t -= 10
		aces--
	}
	return t
}

func bjNatural(cards []Card) bool { return len(cards) == 2 && bjTotal(cards) == 21 }

func bjStart(rng Source, bet int64) *Blackjack {
	s := &Blackjack{
		Dealer: []Card{bjDraw(rng), bjDraw(rng)},
		Hands:  []bjHand{{Cards: []Card{bjDraw(rng), bjDraw(rng)}, Bet: bet}},
		Phase:  "player",
	}
	if bjNatural(s.Hands[0].Cards) || bjNatural(s.Dealer) {
		s.finish(rng)
	}
	return s
}

func (s *Blackjack) allowed() []string {
	if s.Phase != "player" {
		return []string{}
	}
	h := s.Hands[s.Active]
	acts := []string{"hit", "stand"}
	if len(h.Cards) == 2 {
		acts = append(acts, "double")
		if !s.Split && h.Cards[0].value() == h.Cards[1].value() {
			acts = append(acts, "split")
		}
	}
	return acts
}

// act plays one decision. debit is called to double or split and fails when
// the balance is too low; nothing has been dealt at that point.
func (s *Blackjack) act(rng Source, action string, debit func(int64) error) error {
	if !slices.Contains(s.allowed(), action) {
		return Error("Action impossible")
	}
	h := &s.Hands[s.Active]
	switch action {
	case "hit":
		h.Cards = append(h.Cards, bjDraw(rng))
		if bjTotal(h.Cards) >= 21 {
			h.Done = true
		}
	case "stand":
		h.Done = true
	case "double":
		if err := debit(h.Bet); err != nil {
			return err
		}
		h.Bet *= 2
		h.Cards = append(h.Cards, bjDraw(rng))
		h.Done = true
	case "split":
		if err := debit(h.Bet); err != nil {
			return err
		}
		s.Split = true
		second := bjHand{Cards: []Card{h.Cards[1], bjDraw(rng)}, Bet: h.Bet}
		h.Cards = []Card{h.Cards[0], bjDraw(rng)}
		s.Hands = append(s.Hands, second)
		for i := range s.Hands {
			if bjTotal(s.Hands[i].Cards) == 21 {
				s.Hands[i].Done = true
			}
		}
	}
	for s.Active < len(s.Hands) && s.Hands[s.Active].Done {
		s.Active++
	}
	if s.Active >= len(s.Hands) {
		s.finish(rng)
	}
	return nil
}

func (s *Blackjack) finish(rng Source) {
	s.Phase = "done"
	s.Active = min(s.Active, len(s.Hands)-1)
	natural := !s.Split && bjNatural(s.Hands[0].Cards)
	live := slices.ContainsFunc(s.Hands, func(h bjHand) bool { return bjTotal(h.Cards) <= 21 })
	if live && !natural {
		for bjTotal(s.Dealer) < 17 {
			s.Dealer = append(s.Dealer, bjDraw(rng))
		}
	}
	d := bjTotal(s.Dealer)
	dealerBJ := bjNatural(s.Dealer)
	s.Payout, s.Wagered = 0, 0
	for i := range s.Hands {
		h := &s.Hands[i]
		p := bjTotal(h.Cards)
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
		s.Payout += h.Payout
		s.Wagered += h.Bet
	}
}

func (s *Blackjack) view() BlackjackView {
	done := s.Phase == "done"
	dealer := s.Dealer
	if !done {
		dealer = s.Dealer[:1]
	}
	v := BlackjackView{Phase: s.Phase, Dealer: dealer, DealerTotal: bjTotal(dealer), Hole: !done, Active: s.Active, Actions: s.allowed()}
	for _, h := range s.Hands {
		hv := BlackjackHandView{Cards: h.Cards, Bet: h.Bet, Total: bjTotal(h.Cards), Result: h.Result}
		if done {
			p := h.Payout
			hv.Payout = &p
		}
		v.Hands = append(v.Hands, hv)
	}
	if done {
		p := s.Payout
		v.Payout = &p
	}
	return v
}
