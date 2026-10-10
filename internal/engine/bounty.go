package engine

// "Mort ou Vif" follows the rules of Wanted Dead or a Wild (Hacksaw Gaming),
// as its public reviews describe them: 5x5, 15 lines, a duel symbol that
// expands into a wild reel carrying a multiplier of 2 to 100 when it takes
// part in a win (several duels add up), and three bonuses: sticky wilds for 10
// spins, 10 spins loaded with duels, and a two-part bonus that first collects
// wilds and a multiplier, then plays three spins with them. Each can be
// bought. The paytable is the game's; its lines, its reels and the odds of
// each multiplier are not public, so the layout of the lines is ours and the
// weights below are tuned by simulation on its known figures (return 96.4 %,
// a win every 5 spins, a bonus every 265 spins, bonuses worth about 96 % of
// their price).

const (
	bountyCols   = 5
	bountyRows   = 5
	BountyMaxWin = 12_500 // cap, in multiples of the bet

	bountySpins        = 10 // free spins of the first two bonuses
	bountyRespins      = 3  // empty spins that end the collection
	bountyShowdown     = 3  // spins played with what was collected
	bountyMaxWilds     = 20
	bountyMaxCollected = 31
)

var bountyLines = [][bountyCols]int{
	{0, 0, 0, 0, 0}, {1, 1, 1, 1, 1}, {2, 2, 2, 2, 2}, {3, 3, 3, 3, 3}, {4, 4, 4, 4, 4},
	{0, 1, 2, 1, 0}, {4, 3, 2, 3, 4}, {1, 2, 3, 2, 1}, {3, 2, 1, 2, 3},
	{0, 1, 0, 1, 0}, {4, 3, 4, 3, 4}, {1, 0, 1, 0, 1}, {3, 4, 3, 4, 3}, {2, 1, 2, 1, 2}, {2, 3, 2, 3, 2},
}

// Pays in multiples of the total bet, indexed by the number of symbols in line.
var bountyPays = map[string][6]float64{
	"T": {0, 0, 0, 0.1, 0.5, 1}, "J": {0, 0, 0, 0.1, 0.5, 1}, "Q": {0, 0, 0, 0.1, 0.5, 1},
	"K": {0, 0, 0, 0.1, 0.5, 1}, "A": {0, 0, 0, 0.1, 0.5, 1},
	"SKULL": {0, 0, 0, 0.5, 2.5, 5}, "OUTLAW": {0, 0, 0, 0.5, 2.5, 5},
	"PURSE": {0, 0, 0, 1, 5, 10}, "BOTTLE": {0, 0, 0, 1, 5, 10},
	"PISTOL": {0, 0, 0, 2, 10, 20},
	"WILD":   {0, 0, 0, 0, 0, 20}, // a line of five wilds
}

// The three bonuses, named after their scatter.
const (
	BountySticky  = "GALLEON" // sticky wilds
	BountyDuels   = "DUEL"    // loaded with duels
	BountyCollect = "DEAD"    // collection, then showdown
)

// BountyCosts is the price of buying each bonus, in multiples of the bet.
var BountyCosts = map[string]float64{BountySticky: 80, BountyDuels: 200, BountyCollect: 400}

// Tuning. Weights are per cell; a reel holds at most one duel and one scatter.
var (
	bountyPaying = []weight[string]{
		{"T", 13.5}, {"J", 13.5}, {"Q", 13.5}, {"K", 13.5}, {"A", 13.5},
		{"SKULL", 10.5}, {"OUTLAW", 10.5}, {"PURSE", 8}, {"BOTTLE", 8}, {"PISTOL", 6},
	}
	bountyWild        = 0.63 // base game
	bountyVS          = 0.563
	bountyStickyWild  = 4.85 // sticky-wild bonus: every wild stays
	bountyDuelVS      = 3.92 // duel bonus
	bountyShowdownMix = 1.0  // wilds landing on their own during the showdown
	bountyScatters    = []weight[string]{{BountySticky, 1.76}, {BountyDuels, 0.685}, {BountyCollect, 0.611}}

	// The multiplier each duellist carries.
	bountyDuelMults = []weight[float64]{
		{2, 300}, {3, 220}, {4, 160}, {5, 120}, {6, 80}, {7, 60}, {8, 45}, {9, 35},
		{10, 60}, {20, 25}, {25, 12}, {50, 5}, {100, 1.5},
	}
	// Collection: what may land on an empty position at each spin.
	bountyPCollectWild = 0.032
	bountyPCollectMult = 0.02
	bountyCollectMults = []weight[float64]{{1, 50}, {2, 30}, {3, 12}, {5, 6}, {10, 2}}
)

// BountyGrid is indexed [column][row].
type BountyGrid [][]string

// BountyDuel is a duel symbol in view: two duellists, each with a multiplier;
// the survivor's applies to the wins that cross its reel.
type BountyDuel struct {
	Reel     int     `json:"reel"`
	Row      int     `json:"row"`
	A        float64 `json:"a"`
	B        float64 `json:"b"`
	Mult     float64 `json:"mult"`
	Expanded bool    `json:"expanded"` // it took part in a win and covers its reel
}

type BountyWin struct {
	Line  int     `json:"line"`
	Sym   string  `json:"sym"`
	Count int     `json:"count"`
	Pay   float64 `json:"pay"`
	Mult  float64 `json:"mult"`
	Win   float64 `json:"win"`
}

// BountySpin is one grid and what it pays.
type BountySpin struct {
	Grid  BountyGrid   `json:"grid"`
	Duels []BountyDuel `json:"duels"`
	Wins  []BountyWin  `json:"wins"`
	Win   float64      `json:"win"`
	// Sticky-wild bonus: the wilds held from earlier spins. Showdown: where the
	// collected wilds were placed.
	Held [][2]int `json:"held,omitempty"`
	Left int      `json:"left"`
}

// BountyDrop is something landing during the collection.
type BountyDrop struct {
	Col   int     `json:"col"`
	Row   int     `json:"row"`
	Wild  bool    `json:"wild,omitempty"`
	Value float64 `json:"value,omitempty"` // multiplier added
}

type BountyCollectSpin struct {
	Drops []BountyDrop `json:"drops"`
	Wilds int          `json:"wilds"`
	Mult  float64      `json:"mult"`
	Left  int          `json:"left"` // spins left before the collection ends
}

type BountyBonus struct {
	Type    string              `json:"type"`
	Collect []BountyCollectSpin `json:"collect,omitempty"`
	Wilds   int                 `json:"wilds,omitempty"`
	Mult    float64             `json:"mult,omitempty"`
	Spins   []BountySpin        `json:"spins"`
	Total   float64             `json:"total"`
}

type BountyResult struct {
	BountySpin
	Scatter   string       `json:"scatter,omitempty"` // the bonus triggered
	Bought    string       `json:"bought,omitempty"`
	Bonus     *BountyBonus `json:"bonus"`
	TotalMult float64      `json:"totalMult"`
	Round
}

type bountyReels struct {
	weights  []weight[string]
	scatters bool
}

func bountyWeights(wild, vs float64, scatters bool) bountyReels {
	w := append([]weight[string]{}, bountyPaying...)
	w = append(w, weight[string]{"WILD", wild})
	if vs > 0 {
		w = append(w, weight[string]{"VS", vs})
	}
	if scatters {
		w = append(w, bountyScatters...)
	}
	return bountyReels{w, scatters}
}

func bountyIsScatter(s string) bool {
	return s == BountySticky || s == BountyDuels || s == BountyCollect
}

func bountyDraw(rng Source, reels bountyReels) BountyGrid {
	g := make(BountyGrid, bountyCols)
	for c := range g {
		g[c] = make([]string, bountyRows)
		duel, scatter := false, false
		for r := range g[c] {
			s := weighted(rng, reels.weights)
			for (s == "VS" && duel) || (bountyIsScatter(s) && scatter) {
				s = weighted(rng, reels.weights)
			}
			duel = duel || s == "VS"
			scatter = scatter || bountyIsScatter(s)
			g[c][r] = s
		}
	}
	return g
}

// bountyEval pays a grid. reelMult[c] > 0 means reel c is a wild reel carrying
// that multiplier; mult multiplies every win (the collected multiplier).
func bountyEval(grid BountyGrid, reelMult [bountyCols]float64, mult float64) ([]BountyWin, float64) {
	wins := []BountyWin{}
	total := 0.0
	for i, line := range bountyLines {
		sym, count := "", 0
		for c := range bountyCols {
			s := grid[c][line[c]]
			if reelMult[c] > 0 {
				s = "WILD"
			}
			if s != "WILD" {
				if _, pays := bountyPays[s]; !pays {
					break // a scatter, or a duel that did not expand
				}
				if sym == "" {
					sym = s
				} else if s != sym {
					break
				}
			}
			count++
		}
		if sym == "" {
			sym = "WILD"
		}
		pay := bountyPays[sym][count]
		if pay == 0 {
			continue
		}
		// The multipliers of the wild reels the win crosses add up.
		m := 0.0
		for c := range count {
			m += reelMult[c]
		}
		if m == 0 {
			m = 1
		}
		m *= mult
		wins = append(wins, BountyWin{Line: i, Sym: sym, Count: count, Pay: pay, Mult: m, Win: pay * m})
		total += pay * m
	}
	return wins, total
}

// bountyPlay settles a grid: every duel draws its two multipliers, and those
// that take part in a win expand over their reel.
func bountyPlay(rng Source, grid BountyGrid, mult float64) BountySpin {
	spin := BountySpin{Grid: grid, Duels: []BountyDuel{}}
	var reelMult [bountyCols]float64
	for c, col := range grid {
		for r, s := range col {
			if s != "VS" {
				continue
			}
			d := BountyDuel{Reel: c, Row: r, A: weighted(rng, bountyDuelMults), B: weighted(rng, bountyDuelMults)}
			d.Mult = d.A
			if rng() < 0.5 {
				d.Mult = d.B
			}
			reelMult[c] = d.Mult
			spin.Duels = append(spin.Duels, d)
		}
	}
	spin.Wins, spin.Win = bountyEval(grid, reelMult, mult)
	// A win is read from the left: it crosses reel c when it is longer than c.
	reach := 0
	for _, w := range spin.Wins {
		reach = max(reach, w.Count)
	}
	for i := range spin.Duels {
		spin.Duels[i].Expanded = spin.Duels[i].Reel < reach
	}
	return spin
}

// Sticky-wild bonus: every wild that lands stays for the remaining spins.
func bountySticky(rng Source, budget float64) *BountyBonus {
	b := &BountyBonus{Type: BountySticky, Spins: []BountySpin{}}
	reels := bountyWeights(bountyStickyWild, bountyVS, false)
	held := [][2]int{}
	for left := bountySpins - 1; left >= 0 && b.Total < budget; left-- {
		grid := bountyDraw(rng, reels)
		for _, p := range held {
			grid[p[0]][p[1]] = "WILD"
		}
		spin := bountyPlay(rng, grid, 1)
		spin.Held = append([][2]int{}, held...)
		spin.Left = left
		held = held[:0]
		for c, col := range grid {
			for r, s := range col {
				if s == "WILD" {
					held = append(held, [2]int{c, r})
				}
			}
		}
		b.Total += spin.Win
		b.Spins = append(b.Spins, spin)
	}
	return b
}

// Duel bonus: the reels are loaded with duels.
func bountyDuels(rng Source, budget float64) *BountyBonus {
	b := &BountyBonus{Type: BountyDuels, Spins: []BountySpin{}}
	reels := bountyWeights(bountyWild, bountyDuelVS, false)
	for left := bountySpins - 1; left >= 0 && b.Total < budget; left-- {
		spin := bountyPlay(rng, bountyDraw(rng, reels), 1)
		spin.Left = left
		b.Total += spin.Win
		b.Spins = append(b.Spins, spin)
	}
	return b
}

// Collection bonus. First part: on an empty grid, wilds and multipliers land
// and are collected; each one resets the counter to three spins. Second part:
// three spins where the collected wilds are thrown on the grid and every win
// is multiplied by the collected multiplier.
func bountyCollect(rng Source, budget float64) *BountyBonus {
	b := &BountyBonus{Type: BountyCollect, Collect: []BountyCollectSpin{}, Spins: []BountySpin{}, Mult: 1}
	var taken [bountyCols][bountyRows]bool
	free := bountyCols * bountyRows
	for left := bountyRespins; left > 0 && free > 0; {
		step := BountyCollectSpin{Drops: []BountyDrop{}}
		for c := range bountyCols {
			for r := range bountyRows {
				if taken[c][r] {
					continue
				}
				x := rng()
				switch {
				case x < bountyPCollectWild && b.Wilds < bountyMaxWilds:
					b.Wilds++
					step.Drops = append(step.Drops, BountyDrop{Col: c, Row: r, Wild: true})
				case x >= bountyPCollectWild && x < bountyPCollectWild+bountyPCollectMult && b.Mult < bountyMaxCollected:
					v := min(weighted(rng, bountyCollectMults), bountyMaxCollected-b.Mult)
					b.Mult += v
					step.Drops = append(step.Drops, BountyDrop{Col: c, Row: r, Value: v})
				default:
					continue
				}
				taken[c][r] = true
				free--
			}
		}
		if len(step.Drops) > 0 {
			left = bountyRespins
		} else {
			left--
		}
		step.Wilds, step.Mult, step.Left = b.Wilds, b.Mult, left
		b.Collect = append(b.Collect, step)
	}
	reels := bountyWeights(bountyShowdownMix, 0, false)
	for left := bountyShowdown - 1; left >= 0 && b.Total < budget; left-- {
		grid := bountyDraw(rng, reels)
		// The collected wilds land on positions drawn without replacement.
		spots := make([][2]int, 0, bountyCols*bountyRows)
		for c := range bountyCols {
			for r := range bountyRows {
				spots = append(spots, [2]int{c, r})
			}
		}
		placed := make([][2]int, 0, b.Wilds)
		for range b.Wilds {
			k := intn(rng, len(spots))
			placed = append(placed, spots[k])
			grid[spots[k][0]][spots[k][1]] = "WILD"
			spots = append(spots[:k], spots[k+1:]...)
		}
		spin := bountyPlay(rng, grid, b.Mult)
		spin.Held, spin.Left = placed, left
		b.Total += spin.Win
		b.Spins = append(b.Spins, spin)
	}
	return b
}

func bountyBonus(rng Source, kind string, budget float64) *BountyBonus {
	switch kind {
	case BountySticky:
		return bountySticky(rng, budget)
	case BountyDuels:
		return bountyDuels(rng, budget)
	}
	return bountyCollect(rng, budget)
}

// bountyBought draws the grid shown for a bought bonus: three scatters of its
// kind on three reels, nothing else special, and no winning line, since only
// the bonus is paid.
func bountyBought(rng Source, kind string) BountyGrid {
	plain := bountyReels{bountyPaying, false}
	for {
		grid := bountyDraw(rng, plain)
		reels := []int{0, 1, 2, 3, 4}
		for i := range 3 {
			j := i + intn(rng, len(reels)-i)
			reels[i], reels[j] = reels[j], reels[i]
			grid[reels[i]][intn(rng, bountyRows)] = kind
		}
		if wins, _ := bountyEval(grid, [bountyCols]float64{}, 1); len(wins) == 0 {
			return grid
		}
	}
}

// BountySpinRound plays one full round, bonus included. buy is empty, or the
// bonus to pay for directly (a key of BountyCosts).
func BountySpinRound(rng Source, buy string) *BountyResult {
	if buy != "" {
		res := &BountyResult{BountySpin: BountySpin{Grid: bountyBought(rng, buy), Duels: []BountyDuel{}, Wins: []BountyWin{}}, Scatter: buy, Bought: buy}
		res.Bonus = bountyBonus(rng, buy, BountyMaxWin)
		res.Bonus.Total = min(res.Bonus.Total, BountyMaxWin)
		res.TotalMult = res.Bonus.Total
		return res
	}
	res := &BountyResult{BountySpin: bountyPlay(rng, bountyDraw(rng, bountyWeights(bountyWild, bountyVS, true)), 1)}
	total := res.Win
	// Three scatters of the same kind open its bonus. Two kinds at once cannot
	// happen with at most one scatter on each of five reels... unless three and
	// two: the three win.
	count := map[string]int{}
	for _, col := range res.Grid {
		for _, s := range col {
			if bountyIsScatter(s) {
				count[s]++
			}
		}
	}
	for _, kind := range []string{BountyCollect, BountyDuels, BountySticky} {
		if count[kind] >= 3 && total < BountyMaxWin {
			res.Scatter = kind
			res.Bonus = bountyBonus(rng, kind, BountyMaxWin-total)
			res.Bonus.Total = min(res.Bonus.Total, BountyMaxWin-total)
			total += res.Bonus.Total
			break
		}
	}
	res.TotalMult = min(total, BountyMaxWin)
	return res
}
