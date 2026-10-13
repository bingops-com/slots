package engine

import (
	"encoding/json"
	"slices"
	"testing"
)

func cardSequence(spec string) Source {
	values := []float64{}
	for _, c := range cards(spec) {
		values = append(values, (float64(slices.Index(bjRanks, c.R))+.25)/13, (float64(slices.Index(bjSuits, c.S))+.25)/4)
	}
	fallback := seeded(71)
	return func() float64 {
		if len(values) == 0 {
			return fallback()
		}
		v := values[0]
		values = values[1:]
		return v
	}
}

func TestTableDealsAndPlaysRightToLeft(t *testing.T) {
	tb := NewTable()
	tb.Bet("left", "Left", 100, 100, 0, 0)
	tb.Bet("right", "Right", 100, 100, 4, 0)
	tb.SetReady("left", 0)
	tb.SetReady("right", 0)
	rng := cardSequence("2h 5c 9s 3d 6h 8c")
	tb.Tick(rng, 1)
	view := tb.View("right", 1)
	if view.Seats[0].Pos != 4 || !view.Seats[0].Turn || view.Seats[0].Cards[0].R != "2" || view.Seats[1].Cards[0].R != "5" || len(view.Dealer) != 1 || view.Dealer[0].R != "9" || !view.Hole {
		t.Fatalf("wrong deal: %+v", view)
	}
	tb.Act(rng, "stand", 0, 2)
	if tb.current().UserID != "left" {
		t.Fatal("next turn did not move left")
	}
	other := NewTable()
	other.Bet("auto", "Auto", 100, 100, -1, 0)
	if other.Seats[0].Pos != 4 {
		t.Fatal("automatic bet did not take the rightmost free place")
	}
}

func TestTableSplitStaysAtItsPlace(t *testing.T) {
	s := &TableSeat{Pos: 4, UserID: "a", Name: "Alice", Bet: 100, Cards: cards("8h 8s")}
	tb := &Table{Phase: "playing", Dealer: cards("10s 7d"), Seats: []*TableSeat{s}}
	if extra, err := tb.CanAct("a", "split"); err != nil || extra != 100 {
		t.Fatal("pair cannot be split")
	}
	tb.Act(cardSequence("8c 2c"), "split", 80, 1)
	if len(tb.Seats) != 1 || len(s.hands()) != 2 || tb.View("a", 1).Free != 4 || len(tb.View("a", 1).Seats[0].Hands) != 2 || s.Split.FromStake != 80 {
		t.Fatal("split consumed a betting place or lost the debit")
	}
	if _, err := tb.CanAct("a", "split"); err == nil {
		t.Fatal("re-split accepted")
	}
	tb.Act(seeded(1), "stand", 0, 2)
	if tb.Hand != 1 || !tb.View("a", 2).Seats[0].Hands[1].Turn {
		t.Fatal("second split hand did not get its turn")
	}
	if _, err := tb.CanAct("other", "hit"); err == nil {
		t.Fatal("another player can play this hand")
	}
	results := tb.Act(seeded(1), "stand", 0, 3)
	if tb.Phase != "done" || len(results) != 2 {
		t.Fatal("split hands did not settle exactly once")
	}
	if len(tb.Tick(seeded(1), 4)) != 0 {
		t.Fatal("settlement repeated")
	}
}

func TestSplitAcesReceiveOneCardAndNoNaturalBonus(t *testing.T) {
	s := &TableSeat{Pos: 4, UserID: "a", Bet: 100, Cards: cards("As Ah")}
	tb := &Table{Phase: "playing", Dealer: cards("Qh 9s"), Seats: []*TableSeat{s}}
	results := tb.Act(cardSequence("Kc 9d"), "split", 100, 1)
	if len(results) != 2 || results[0].Payout != 200 || results[1].Payout != 200 || s.Result != "win" || tb.Phase != "done" {
		t.Fatalf("split aces: %+v", results)
	}
	if len(s.Cards) != 2 || len(s.Split.Cards) != 2 || len(tb.allowed("a")) != 0 {
		t.Fatal("split aces can receive extra cards")
	}
}

func TestSideBetPaytables(t *testing.T) {
	for _, c := range []struct {
		cards, result string
		mult          int64
	}{
		{"7h 7h", "perfect", 26}, {"7h 7d", "colored", 13}, {"7h 7s", "mixed", 7}, {"Kh Qh", "lose", 0},
	} {
		result, mult := pairPrize(cards(c.cards))
		if result != c.result || mult != c.mult {
			t.Fatalf("pair %s: %s %d", c.cards, result, mult)
		}
	}
	for _, c := range []struct {
		cards, result string
		mult          int64
	}{
		{"7h 7h 7h", "suited-trips", 101}, {"Qh Kh Ah", "straight-flush", 41}, {"7h 7d 7s", "trips", 31},
		{"Ah 2d 3s", "straight", 11}, {"Qh Kd As", "straight", 11}, {"2h 7h Jh", "flush", 6}, {"Kh Ad 2s", "lose", 0}, {"Kh Qd Qs", "lose", 0},
	} {
		cs := cards(c.cards)
		result, mult := trioPrize(cs[:2], cs[2])
		if result != c.result || mult != c.mult {
			t.Fatalf("trio %s: %s %d", c.cards, result, mult)
		}
	}
	for _, side := range []TableSideBets{{Pairs: -1}, {Trio: 1}, {Pairs: 101}, {Trio: 9223372036854775807}} {
		if _, err := TableBetCost(100, side); err == nil {
			t.Fatal("invalid side bet accepted")
		}
	}
}

func TestSideBetsUseOriginalCardsAfterSplitAndHit(t *testing.T) {
	s := &TableSeat{Pos: 4, UserID: "a", Bet: 100, Cards: cards("Kc Kc"), SideBets: TableSideBets{Pairs: 10, Trio: 10}}
	s.sideResults(cards("Ac")[0])
	before, _ := json.Marshal(s.SideResults)
	tb := &Table{Phase: "playing", Dealer: cards("Ac 6h"), Seats: []*TableSeat{s}}
	tb.Act(cardSequence("8c 7d"), "split", 100, 1)
	tb.Act(cardSequence("2s"), "hit", 0, 2)
	tb.Act(seeded(1), "stand", 0, 3)
	results := tb.Act(seeded(1), "stand", 0, 4)
	after, _ := json.Marshal(s.SideResults)
	if string(before) != string(after) || len(results) != 2 || results[0].Wagered != 120 || results[0].Payout != 520 || results[1].Wagered != 100 || results[1].Payout != 100 {
		t.Fatalf("side bets or split settlement changed: %+v", results)
	}
	if view := tb.View("a", 4).Seats[0]; view.Bet != 220 || *view.Payout != 620 {
		t.Fatal("view does not show the full commitment and payout")
	}
}

func TestTableCloseRefundsSplitAndSideBetsExactly(t *testing.T) {
	w := &Wallet{Stake: 80, Loot: 500}
	first, _ := TableDebit(w, 120)
	s := &TableSeat{Pos: 4, UserID: "a", Bet: 100, FromStake: first, Cards: cards("8h 8s"), SideBets: TableSideBets{Pairs: 10, Trio: 10}}
	tb := &Table{Phase: "playing", Dealer: cards("10s 7d"), Seats: []*TableSeat{s}}
	extra, _ := TableDebit(w, 100)
	tb.Act(cardSequence("3h 2s"), "split", extra, 1)
	for _, hand := range tb.Pending() {
		TableRefund(w, hand.Committed(), hand.FromStake)
	}
	if w.Stake != 80 || w.Loot != 500 || w.Rounds != 0 {
		t.Fatalf("refund changed the original wallet: %+v", w)
	}
}

func TestLiveTableConservesWalletWithSideBetsAndSplits(t *testing.T) {
	rng := seeded(91)
	for round := range 3000 {
		w := &Wallet{Stake: 1000000}
		debits, payouts := int64(0), int64(0)
		tb := NewTable()
		for _, pos := range []int{0, 4} {
			cost, err := TableBetCost(100, TableSideBets{Pairs: 10, Trio: 10})
			if err != nil {
				t.Fatal(err)
			}
			from, err := TableDebit(w, cost)
			if err != nil {
				t.Fatal(err)
			}
			debits += cost
			tb.BetWithSides("a", "Alice", 100, from, TableSideBets{Pairs: 10, Trio: 10}, pos, 0)
		}
		tb.SetReady("a", 0)
		results := tb.Tick(rng, 1)
		for now := int64(2); tb.Phase == "playing"; now++ {
			if now > 200 {
				t.Fatal("table did not terminate")
			}
			actions := tb.allowed("a")
			action := actions[intn(rng, len(actions))]
			extra, err := tb.CanAct("a", action)
			if err != nil {
				t.Fatal(err)
			}
			from, err := TableDebit(w, extra)
			if err != nil {
				t.Fatal(err)
			}
			debits += extra
			results = tb.Act(rng, action, from, now)
		}
		for _, result := range results {
			(&Engine{}).TableSettle(w, result.Wagered, result.Payout)
			payouts += result.Payout
		}
		if w.Balance() != 1000000-debits+payouts || w.Wagered != debits || w.Won != payouts || w.Stake < 0 || w.Loot < 0 {
			t.Fatalf("round %d: accounting mismatch %+v", round, w)
		}
	}
}
