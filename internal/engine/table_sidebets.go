package engine

import "sort"

// Optional wagers on the original two cards, unaffected by later hits/splits.
type TableSideBets struct {
	Pairs int64 `json:"pairs"`
	Trio  int64 `json:"trio"`
}

type TableSideResult struct {
	Kind   string `json:"kind"`
	Bet    int64  `json:"bet"`
	Result string `json:"result"`
	Payout int64  `json:"payout"`
}

// TableBetCost validates the complete commitment before a wallet is debited.
func TableBetCost(main int64, sides TableSideBets) (int64, error) {
	if main < minBet || main > maxBet {
		return 0, Error("Mise invalide")
	}
	for _, bet := range []int64{sides.Pairs, sides.Trio} {
		if bet < 0 || bet > main || (bet > 0 && bet < minBet) {
			return 0, Error("Chaque mise secondaire doit être nulle ou comprise entre la mise minimale et la mise principale")
		}
	}
	return main + sides.Pairs + sides.Trio, nil
}

func pairPrize(cards []Card) (string, int64) {
	if len(cards) != 2 || cards[0].R != cards[1].R {
		return "lose", 0
	}
	if cards[0].S == cards[1].S {
		return "perfect", 26
	}
	red := func(s string) bool { return s == "♥" || s == "♦" }
	if red(cards[0].S) == red(cards[1].S) {
		return "colored", 13
	}
	return "mixed", 7
}

func trioPrize(cards []Card, up Card) (string, int64) {
	if len(cards) != 2 {
		return "lose", 0
	}
	cards = []Card{cards[0], cards[1], up}
	suited := cards[0].S == cards[1].S && cards[1].S == cards[2].S
	trips := cards[0].R == cards[1].R && cards[1].R == cards[2].R
	if suited && trips {
		return "suited-trips", 101
	}
	ranks := make([]int, 3)
	for i, card := range cards {
		switch card.R {
		case "A":
			ranks[i] = 14
		case "K":
			ranks[i] = 13
		case "Q":
			ranks[i] = 12
		case "J":
			ranks[i] = 11
		default:
			ranks[i] = card.value()
		}
	}
	sort.Ints(ranks)
	straight := (ranks[0]+1 == ranks[1] && ranks[1]+1 == ranks[2]) || (ranks[0] == 2 && ranks[1] == 3 && ranks[2] == 14)
	switch {
	case suited && straight:
		return "straight-flush", 41
	case trips:
		return "trips", 31
	case straight:
		return "straight", 11
	case suited:
		return "flush", 6
	default:
		return "lose", 0
	}
}

func (s *TableSeat) sideResults(up Card) {
	s.SideResults = []TableSideResult{}
	if s.SideBets.Pairs > 0 {
		result, mult := pairPrize(s.Cards)
		s.SideResults = append(s.SideResults, TableSideResult{"pairs", s.SideBets.Pairs, result, s.SideBets.Pairs * mult})
	}
	if s.SideBets.Trio > 0 {
		result, mult := trioPrize(s.Cards, up)
		s.SideResults = append(s.SideResults, TableSideResult{"trio", s.SideBets.Trio, result, s.SideBets.Trio * mult})
	}
}

// Committed is this hand plus its original side bets, excluding the split hand.
func (s *TableSeat) Committed() int64 { return s.Bet + s.SideBets.Pairs + s.SideBets.Trio }

func (s *TableSeat) hands() []*TableSeat {
	if s.Split != nil {
		return []*TableSeat{s, s.Split}
	}
	return []*TableSeat{s}
}
