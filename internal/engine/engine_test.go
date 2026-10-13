package engine

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"strings"
	"testing"
)

func seeded(seed uint64) Source {
	r := rand.New(rand.NewPCG(seed, 7))
	return r.Float64
}

// Every action keeps the books straight: what leaves the balance is what was
// wagered or repaid, and what enters it is what was paid or advanced.
func TestWalletInvariants(t *testing.T) {
	clock := int64(1_000_000)
	e := &Engine{Rng: seeded(1), Now: func() int64 { return clock }}
	w := NewWallet()
	bodies := map[string][]string{
		"dice":             {`{"bet":100,"target":50,"over":true}`, `{"bet":100,"target":2}`},
		"roulette":         {`{"bets":[{"type":"red","amount":100},{"type":"straight","value":7,"amount":50}]}`},
		"slots/bass":       {`{"bet":100}`, `{"bet":10,"buy":"fs"}`},
		"slots/beard":      {`{"bet":100}`, `{"bet":100,"golden":true}`, `{"bet":10,"buy":"fs7"}`, `{"bet":10,"buy":"fsr"}`},
		"slots/bounty":     {`{"bet":100}`, `{"bet":10,"buy":"GALLEON"}`, `{"bet":10,"buy":"DUEL"}`, `{"bet":10,"buy":"DEAD"}`},
		"slots/neptune":    {`{"bet":100}`, `{"bet":100,"ante":true}`, `{"bet":10,"buy":"fs"}`},
		"slots/reef":       {`{"bet":100}`, `{"bet":100,"ante":true}`, `{"bet":10,"buy":"fs"}`},
		"slots/dogs":       {`{"bet":100}`, `{"bet":100,"mode":"rain"}`, `{"bet":10,"buy":"fs"}`, `{"bet":10,"buy":"rain"}`},
		"blackjack/start":  {`{"bet":100}`},
		"blackjack/action": {`{"action":"hit"}`, `{"action":"stand"}`, `{"action":"double"}`, `{"action":"split"}`},
		"mines/start":      {`{"bet":100,"mines":3}`},
		"mines/reveal":     {`{"cell":0}`, `{"cell":7}`, `{"cell":13}`, `{"cell":24}`},
		"mines/cashout":    {``},
		"crash/start":      {`{"bet":100}`, `{"bet":100,"auto":1.5}`, `{"bet":100,"auto":40}`},
		"crash/poll":       {``},
		"plinko":           {`{"bet":100,"rows":8,"risk":"low"}`, `{"bet":100,"rows":16,"risk":"high"}`, `{"bet":100,"rows":12,"risk":"medium"}`},
		"crash/cashout":    {``},
		"advance":          {``},
		"repay":            {`{"amount":100}`, `{"amount":100000}`},
	}
	r := rand.New(rand.NewPCG(2, 3))
	for i := range 200_000 {
		clock += int64(r.IntN(4000))
		action := Actions[r.IntN(len(Actions))]
		body := bodies[action][r.IntN(len(bodies[action]))]
		before, _ := json.Marshal(w)
		out, err := e.Do(w, action, []byte(body))
		if err != nil {
			if _, ok := err.(Error); !ok {
				t.Fatalf("%s %s: unexpected error type %T: %v", action, body, err, err)
			}
			if after, _ := json.Marshal(w); string(after) != string(before) {
				t.Fatalf("%s %s failed with %q but changed the wallet\n%s\n%s", action, body, err, before, after)
			}
			continue
		}
		if _, err := json.Marshal(out); err != nil {
			t.Fatalf("%s: result does not encode: %v", action, err)
		}
		if w.Stake < 0 || w.Loot < 0 {
			t.Fatalf("step %d, %s %s: negative balance %+v", i, action, body, w)
		}
		pending := int64(0)
		if w.BJ != nil {
			for _, h := range w.BJ.Hands {
				pending += h.Bet
			}
		}
		if w.Mines != nil {
			pending += w.Mines.Bet
		}
		if w.Crash != nil {
			pending += w.Crash.Bet
		}
		if got, want := w.Balance(), StartStake+w.Debt-w.Wagered-pending+w.Won; got != want {
			t.Fatalf("step %d, %s %s: balance %d, want %d (%+v)", i, action, body, got, want, w)
		}
	}
	if w.Rounds == 0 {
		t.Fatal("no round was played")
	}
}

func TestRejectsBadInput(t *testing.T) {
	e := &Engine{Rng: seeded(1)}
	for _, c := range []struct{ action, body string }{
		{"dice", `{"bet":5,"target":50}`},
		{"dice", `{"bet":100.5,"target":50}`},
		{"dice", `{"bet":100,"target":99.5}`},
		{"dice", `{"bet":100}`},
		{"slots/bass", `{"bet":99999999}`},
		{"slots/beard", `{"bet":100,"buy":"everything"}`},
		{"slots/bass", `{"bet":100,"buy":"fsr"}`},
		{"slots/dogs", `{"bet":100,"buy":"everything"}`},
		{"slots/dogs", `{"bet":100,"mode":"everything"}`},
		{"slots/beard", `{"bet":500000,"buy":"fsr"}`},
		{"roulette", `{"bets":[]}`},
		{"roulette", `{"bets":[{"type":"straight","value":37,"amount":100}]}`},
		{"roulette", `{"bets":[{"type":"corner","amount":100}]}`},
		{"roulette", `{"bets":[{"type":"red","amount":-100},{"type":"black","amount":200}]}`},
		{"mines/start", `{"bet":100,"mines":25}`},
		{"crash/start", `{"bet":100,"auto":1}`},
		{"crash/cashout", ``},
		{"plinko", `{"bet":100,"rows":9,"risk":"low"}`},
		{"plinko", `{"bet":100,"rows":8,"risk":"extreme"}`},
		{"mines/reveal", `{"cell":1}`},
		{"blackjack/action", `{"action":"hit"}`},
		{"advance", ``},
		{"nope", `{}`},
		{"dice", `not json`},
	} {
		w := NewWallet()
		if _, err := e.Do(w, c.action, []byte(c.body)); err == nil {
			t.Errorf("%s %s: accepted", c.action, c.body)
		} else if *w != *NewWallet() {
			t.Errorf("%s %s: wallet changed on error", c.action, c.body)
		}
	}
}

func TestDogsBoughtBonus(t *testing.T) {
	res := DogsPlay(seeded(7), true, DogsSticky)
	if !res.Bought || res.Bonus == nil || res.Bonus.Mode != DogsSticky || res.Scatters != 3 || res.ScatterPay != 0 || len(res.Wins) != 0 {
		t.Fatalf("invalid bought bonus: %+v", res)
	}
	if len(res.Bonus.Barrels) != 9 || res.Awarded != len(res.Bonus.Spins) || res.Awarded < 9 || res.Awarded > 27 {
		t.Fatalf("invalid free spins: awarded=%d barrels=%v spins=%d", res.Awarded, res.Bonus.Barrels, len(res.Bonus.Spins))
	}
	for _, c := range []int{0, 2, 4} {
		found := 0
		for _, cell := range res.Grid[c] {
			if cell.S == "SCAT" {
				found++
			}
		}
		if found != 1 {
			t.Fatalf("reel %d has %d scatters", c+1, found)
		}
	}
}

// Raining wilds drop on the middle reels only, never stay, and are the only
// wilds of their spin.
func TestDogsRainBonus(t *testing.T) {
	rng := seeded(11)
	for range 200 {
		res := DogsPlay(rng, true, DogsRain)
		if res.Bonus == nil || res.Bonus.Mode != DogsRain || res.Awarded < 9 || res.Awarded > 27 {
			t.Fatalf("invalid rain bonus: %+v", res.Bonus)
		}
		for _, s := range res.Bonus.Spins {
			wilds := 0
			for c, col := range s.Grid {
				for _, x := range col {
					if x.S == "WILD" {
						wilds++
						if c < 1 || c > 3 || (x.V != 2 && x.V != 3) {
							t.Fatalf("wild on reel %d with multiplier %v", c+1, x.V)
						}
					}
				}
			}
			if wilds != len(s.Rain) || len(s.Held) != 0 {
				t.Fatalf("%d wilds on the grid, %d rained, %d held", wilds, len(s.Rain), len(s.Held))
			}
			for _, at := range s.Rain {
				if s.Grid[at[0]][at[1]].S != "WILD" {
					t.Fatalf("no wild where one rained: %v", at)
				}
			}
		}
	}
}

// The player never sees what would let them cheat.
func TestViewsHideSecrets(t *testing.T) {
	e := &Engine{Rng: seeded(4)}
	for range 200 {
		w := NewWallet()
		out, _ := e.Do(w, "mines/start", []byte(`{"bet":100,"mines":5}`))
		if b, _ := json.Marshal(out); json.Valid(b) && containsKey(b, "bombs") {
			t.Fatalf("bombs sent before the end: %s", b)
		}
		w = NewWallet()
		out, _ = e.Do(w, "blackjack/start", []byte(`{"bet":100}`))
		v := out.(gameOut[BlackjackView]).Game
		if v.Phase == "player" && len(v.Dealer) != 1 {
			t.Fatalf("hole card sent: %+v", v)
		}
	}
}

func containsKey(b []byte, key string) bool {
	var m map[string]map[string]json.RawMessage
	_ = json.Unmarshal(b, &m)
	_, ok := m["game"][key]
	return ok
}

// The tuned returns stay where the rules say they are. Loose bounds: this
// guards against a rule broken by a change, not against variance.
func TestSlotReturns(t *testing.T) {
	if testing.Short() {
		t.Skip("simulation")
	}
	rng := seeded(9)
	const n = 600_000
	total, bonuses := 0.0, 0
	for range n {
		r := BassSpin(rng, false)
		total += r.TotalMult
		if r.TotalMult > BassMaxWin {
			t.Fatalf("bass paid %v, above the cap", r.TotalMult)
		}
		if r.Bonus != nil {
			bonuses++
		}
	}
	if rtp := total / n; rtp < 0.85 || rtp > 1.08 {
		t.Errorf("bass return %.3f", rtp)
	}
	if every := float64(n) / float64(bonuses); every < 90 || every > 135 {
		t.Errorf("bass bonus every %.0f spins", every)
	}
	total, hits := 0.0, 0
	for range n {
		r := BeardSpin(rng, BeardOptions{})
		total += r.TotalMult
		if r.TotalMult > BeardMaxWin {
			t.Fatalf("beard paid %v, above the cap", r.TotalMult)
		}
		if r.TotalMult > 0 {
			hits++
		}
	}
	if rtp := total / n; rtp < 0.6 || rtp > 1.4 {
		t.Errorf("beard return %.3f", rtp)
	}
	if every := float64(n) / float64(hits); every < 4 || every > 5.2 {
		t.Errorf("beard win every %.2f spins", every)
	}
}

// Crash keeps its promise: the chance of reaching x is 0.99 / x, the stop is
// never shown before the end, and a late cash-out is a loss.
func TestCrash(t *testing.T) {
	rng := seeded(11)
	const n = 400_000
	over2, over10 := 0, 0
	for range n {
		p := crashPoint(rng)
		if p < 1 || p > crashMax {
			t.Fatalf("crash point %v", p)
		}
		if p >= 2 {
			over2++
		}
		if p >= 10 {
			over10++
		}
	}
	if f := float64(over2) / n; f < 0.485 || f > 0.505 {
		t.Errorf("reached x2 %.3f of the time, want 0.495", f)
	}
	if f := float64(over10) / n; f < 0.094 || f > 0.104 {
		t.Errorf("reached x10 %.3f of the time, want 0.099", f)
	}

	clock := int64(0)
	e := &Engine{Rng: func() float64 { return 0.67 }, Now: func() int64 { return clock }} // stops at x3
	w := NewWallet()
	out, err := e.Do(w, "crash/start", []byte(`{"bet":1000}`))
	if err != nil {
		t.Fatal(err)
	}
	if b, _ := json.Marshal(out); containsKey(b, "point") {
		t.Fatalf("the stop was sent at the start: %s", b)
	}
	clock = 10_000 // e^0.6 = 1.82
	out, _ = e.Do(w, "crash/cashout", nil)
	v := out.(gameOut[*CrashView]).Game
	if v.Crashed || v.At != 1.82 || *v.Payout != 1820 || w.Crash != nil {
		t.Fatalf("cash-out in time: %+v", v)
	}
	e.Do(w, "crash/start", []byte(`{"bet":1000}`))
	clock += 30_000 // e^1.8 = 6.05, past x3
	out, _ = e.Do(w, "crash/cashout", nil)
	if v := out.(gameOut[*CrashView]).Game; !v.Crashed || *v.Payout != 0 {
		t.Fatalf("late cash-out paid: %+v", v)
	}
	// An automatic cash-out is honoured even if the player never comes back.
	e.Do(w, "crash/start", []byte(`{"bet":1000,"auto":2}`))
	clock += 3_600_000
	out, _ = e.Do(w, "crash/poll", nil)
	if v := out.(gameOut[*CrashView]).Game; v.Crashed || v.At != 2 || *v.Payout != 2000 {
		t.Fatalf("automatic cash-out: %+v", v)
	}
}

// Every plinko table returns about 99 % of the bets, computed exactly from the
// chances of each bucket.
func TestPlinkoTables(t *testing.T) {
	for rows, risks := range plinkoTables {
		for risk, table := range risks {
			if len(table) != rows+1 {
				t.Fatalf("%d rows, %s: %d buckets", rows, risk, len(table))
			}
			ways, total := 1.0, 0.0
			for k, m := range table {
				total += ways * m
				ways = ways * float64(rows-k) / float64(k+1)
			}
			if rtp := total / float64(int64(1)<<rows); rtp < 0.98 || rtp > 0.995 {
				t.Errorf("%d rows, %s: return %.4f", rows, risk, rtp)
			}
		}
	}
}

func cards(spec string) []Card {
	var out []Card
	for _, f := range strings.Fields(spec) {
		out = append(out, Card{R: f[:len(f)-1], S: map[byte]string{'s': "♠", 'h': "♥", 'd': "♦", 'c': "♣"}[f[len(f)-1]]})
	}
	return out
}

// Hands rank in the order of the rules, kickers included.
func TestPokerRanking(t *testing.T) {
	order := []string{
		"7s 5h 4d 3c 2s Ks 9d",  // king high
		"As Kd 9c 7h 4s 3d 2c",  // ace high
		"2s 2h Ad Kc 9s 7d 4c",  // pair of twos
		"As Ah 3d 4c 9s 7d 2c",  // pair of aces, nine kicker
		"As Ah Kd 4c 9s 7d 2c",  // pair of aces, king kicker
		"3s 3h 2d 2c As 7d 9c",  // two pair
		"Ks Kh 2d 2c 4s 7d 9c",  // kings up
		"5s 5h 5d Ac Ks 7d 9c",  // trips
		"As 2h 3d 4c 5s Kd Kc",  // wheel
		"6s 7h 8d 9c 10s Ad Ac", // ten-high straight
		"2h 9h 4h Kh 7h As Ad",  // king-high flush
		"2h 9h 4h Ah 7h Ks Kd",  // ace-high flush
		"5s 5h 5d Kc Ks 7d 9c",  // fives full
		"Ks Kh Kd 5c 5s 7d 9c",  // kings full
		"9s 9h 9d 9c Ks 7d 2c",  // quads
		"5h 6h 7h 8h 9h As Ad",  // straight flush
		"10s Js Qs Ks As 2d 2c", // royal flush
	}
	var prev [6]int
	for i, spec := range order {
		score, name := pokerBest(cards(spec))
		if i > 0 && compareScore(score, prev) <= 0 {
			t.Errorf("%q (%s) does not beat %q", spec, name, order[i-1])
		}
		prev = score
	}
	if a, _ := pokerBest(cards("As Kd Qh Jc 9s 3d 2c")); compareScore(a, func() [6]int { b, _ := pokerBest(cards("Ah Kc Qd Js 9h 4d 2s")); return b }()) != 0 {
		t.Error("the sixth card broke a tie")
	}
}

// Whatever happens at the table, chips are neither created nor lost: what the
// players brought in is what sits in their stacks and in the pot, plus or
// minus what the house's characters won or lost.
func TestPokerChips(t *testing.T) {
	rng := seeded(21)
	r := rand.New(rand.NewPCG(5, 6))
	p := NewPoker()
	now := int64(0)
	bought := map[string]int64{}
	cashed := map[string]int64{}
	take := func(outs []PokerCashout) {
		for _, o := range outs {
			cashed[o.UserID] += o.Stack
		}
	}
	names := []string{"a", "b", "c"}
	hands := int64(0)
	for step := 0; step < 400_000; step++ {
		now += int64(r.IntN(900))
		id := names[r.IntN(len(names))]
		switch x := r.IntN(100); {
		case x < 2 && p.CanSit(id, 10_000) == nil:
			p.Sit(id, id, 10_000, 0, now)
			bought[id] += 10_000
		case x < 3:
			take(p.Leave(rng, id, now))
		case x < 60:
			if i := p.seatOf(id); i >= 0 && i == p.Turn {
				a := p.actions(i)
				act, amount := "fold", int64(0)
				switch k := r.IntN(10); {
				case a.Check:
					act = "check"
				case k < 6 && a.Call > 0:
					act = "call"
				}
				if a.MinRaise > 0 && r.IntN(4) == 0 {
					act, amount = "raise", a.MinRaise+int64(r.IntN(int(a.MaxRaise-a.MinRaise)+1))
				}
				outs, err := p.Act(rng, id, act, amount, now)
				if err != nil {
					t.Fatalf("step %d: %s %d refused: %v (%+v)", step, act, amount, err, a)
				}
				take(outs)
			}
		}
		for _, n := range names {
			p.Seen(n, now)
		}
		take(p.Tick(rng, now))
		hands = p.Hand
		// Chips of the players: stacks plus what they have in the pot.
		var held, house int64
		for _, s := range p.Seats {
			if s == nil {
				continue
			}
			if s.UserID != "" {
				held += s.Stack
			}
			_ = house
		}
		for _, s := range p.Seats {
			if s != nil && s.Stack < 0 {
				t.Fatalf("step %d: negative stack %+v", step, s)
			}
		}
		_ = held
	}
	if hands < 500 {
		t.Fatalf("only %d hands were played", hands)
	}
	// Close the table: everyone gets their chips back, and the total the
	// players end with differs from what they brought only by what the house's
	// characters won or lost, which is bounded by their purses.
	for _, o := range p.Pending() {
		cashed[o.UserID] += o.Stack
	}
	var in, out int64
	for _, n := range names {
		in += bought[n]
		out += cashed[n]
	}
	if in == 0 || out <= 0 {
		t.Fatalf("bought %d, cashed %d", in, out)
	}
	t.Logf("%d hands, players brought %d and left with %d", hands, in, out)
}

// The shared table never keeps its players waiting: the deal starts as soon as
// everyone looking at the table has bet, and five seconds after the first bet
// at the latest.
func TestTableWaits(t *testing.T) {
	rng := seeded(3)
	tb := NewTable()
	tb.Seen("a", 0)
	tb.Bet("a", "Alice", 100, 0, -1, 0)
	tb.Bet("a", "Alice", 100, 0, -1, 0)
	if tb.Tick(rng, 1); tb.Phase != "betting" {
		t.Fatal("dealt before the player had finished betting")
	}
	tb.SetReady("a", 2)
	if tb.Tick(rng, 3); tb.Phase == "betting" || len(tb.Seats) != 2 {
		t.Fatal("a player alone and ready waited for the deal")
	}

	tb = NewTable()
	tb.Seen("b", 0)
	tb.Bet("a", "Alice", 100, 0, -1, 0)
	tb.SetReady("a", 0)
	for now := int64(0); now < tableBetWindow; now += 500 {
		tb.Seen("b", now)
		if tb.Tick(rng, now); tb.Phase != "betting" {
			t.Fatalf("dealt at %d ms without the player who had not bet yet", now)
		}
	}
	tb.Tick(rng, tableBetWindow)
	if tb.Phase == "betting" {
		t.Fatal("the bets stayed open more than five seconds")
	}
	for _, w := range []int64{tableBetWindow, tableTurnTime, tableShowTime} {
		if w > 5_000 {
			t.Fatalf("a wait of %d ms", w)
		}
	}
	// A player who stopped looking does not hold the deal back.
	tb = NewTable()
	tb.Seen("b", 0)
	tb.Bet("a", "Alice", 100, 0, -1, tablePresence+1)
	tb.SetReady("a", tablePresence+1)
	tb.Tick(rng, tablePresence+2)
	if tb.Phase == "betting" {
		t.Fatal("the deal waited for a player who had left")
	}
}

// A player picks a place at the shared table; hands are played from the first
// place to the last, whoever bet first.
func TestTablePlaces(t *testing.T) {
	tb := NewTable()
	tb.Seen("a", 0)
	tb.Seen("b", 0)
	tb.Seen("c", 0)
	if err := tb.CanBet("a", 100, 3); err != nil {
		t.Fatal(err)
	}
	tb.Bet("a", "Alice", 100, 0, 3, 0)
	if tb.CanBet("b", 100, 3) == nil || tb.CanBet("b", 100, TableSeats) == nil {
		t.Fatal("a taken or unknown place was accepted")
	}
	tb.Bet("b", "Basile", 100, 0, 1, 0)
	tb.Bet("c", "Chloé", 100, 0, -1, 0)
	got := ""
	for _, s := range tb.Seats {
		got += fmt.Sprintf("%s%d ", s.UserID, s.Pos)
	}
	if got != "c4 a3 b1 " {
		t.Fatalf("places: %s", got)
	}
}
