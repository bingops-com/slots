package engine

import "math"

// "Barbe-Rouge" follows the rules of Barbarossa DoubleMax: 5x3, 243 ways,
// cascades that leave a wild, a multiplier doubled by every winning cascade
// (no cap, kept during free spins), multiplier jumps, golden bet and bonus
// buy. The rules are the game's; its detailed paytable and reels are not
// public, so the values below are tuned by simulation on its known figures
// (5 of a kind: 2.5 to 10 times the bet, return close to 96 %, a win every 4
// spins or so).

const (
	beardCols   = 5
	beardRows   = 3
	BeardMaxWin = 20000 // cap, in multiples of the bet

	beardSkew     = 0.9    // how much reels 4 and 5 lean towards opposite halves of the symbols
	beardWild     = 0.3    // weight of "natural" wilds, reels 2 to 4 only
	beardScat     = 2.23   // weight of the scatter
	beardGolden   = 1.26   // factor applied to the scatter by the golden bet (bonus about twice as frequent)
	beardWildFrom = 2      // first reel (from 0) that may receive the wild left by a cascade
	beardJump     = 0.0155 // chance of a multiplier jump after a win, up to 3 in a row
	beardFSJump   = 0.095  // the same during free spins, where jumps are more frequent
	beardMaxJumps = 3
)

// Pays per "way", in multiples of the total bet, indexed by the number of reels.
var beardPays = map[string][6]float64{
	"BOTTLE": {0, 0, 0, 0.04, 0.12, 2.5}, "ANCHOR": {0, 0, 0, 0.04, 0.12, 2.5}, "HELM": {0, 0, 0, 0.04, 0.12, 2.5},
	"COMPASS": {0, 0, 0, 0.06, 0.16, 3}, "PISTOL": {0, 0, 0, 0.06, 0.16, 3},
	"SAILOR": {0, 0, 0, 0.1, 0.24, 5}, "GUNNER": {0, 0, 0, 0.1, 0.24, 5}, "LOOKOUT": {0, 0, 0, 0.12, 0.32, 6},
	"CORSAIR": {0, 0, 0, 0.16, 0.4, 8}, "CAPTAIN": {0, 0, 0, 0.2, 0.58, 10},
}

var (
	beardWeights = []weight[string]{
		{"BOTTLE", 14}, {"ANCHOR", 14}, {"HELM", 13}, {"COMPASS", 12}, {"PISTOL", 12},
		{"SAILOR", 9}, {"GUNNER", 9}, {"LOOKOUT", 8}, {"CORSAIR", 7}, {"CAPTAIN", 5.5},
	}
	beardFreeSpins = map[int]int{3: 7, 4: 10, 5: 13}
	// "Random spins" buy: number of scatters drawn with these weights.
	beardBuyRandom = []weight[int]{{3, 68}, {4, 25}, {5, 7}}
	beardCosts     = map[string]float64{"fs7": 100, "fsr": 200}
)

// BeardGrid is indexed [column][row].
type BeardGrid [][]string

type BeardWin struct {
	Sym   string   `json:"sym"`
	Len   int      `json:"len"`
	Ways  int      `json:"ways"`
	Pay   float64  `json:"pay"`
	Cells [][2]int `json:"cells"`
}

// BeardStep is one grid of a spin: the first one, then one per cascade.
type BeardStep struct {
	Grid  BeardGrid  `json:"grid"`
	Wins  []BeardWin `json:"wins"`
	Wild  *[2]int    `json:"wild"`
	Mult  float64    `json:"mult"`
	Win   float64    `json:"win"`
	Jumps int        `json:"jumps"`
}

type BeardSpinResult struct {
	Steps    []BeardStep `json:"steps"`
	Win      float64     `json:"win"`
	Mult     float64     `json:"mult"`
	Scatters int         `json:"scatters"`
	Left     *int        `json:"left,omitempty"`
}

type BeardBonus struct {
	Spins []BeardSpinResult `json:"spins"`
	Total float64           `json:"total"`
}

// BeardOptions are the ways to pay for a spin.
type BeardOptions struct {
	Golden bool   // costs 50 % more, bonus twice as frequent
	Buy    string // "fs7" (7 free spins) or "fsr" (3 to 5 scatters at random)
}

type BeardResult struct {
	BeardSpinResult
	Bonus     *BeardBonus `json:"bonus"`
	Awarded   int         `json:"awarded,omitempty"`
	Bought    string      `json:"bought,omitempty"`
	TotalMult float64     `json:"totalMult"`
	Round
}

// The last two reels each favour a different half of the symbols: 5 of a kind
// stay rare, as their pay requires.
func beardWeightsFor(c int, scat float64) []weight[string] {
	side := -1
	if c == beardCols-2 {
		side = 0
	} else if c == beardCols-1 {
		side = 1
	}
	w := make([]weight[string], 0, len(beardWeights)+2)
	for i, e := range beardWeights {
		if side >= 0 {
			if i%2 == side {
				e.w *= 1 + beardSkew
			} else {
				e.w *= 1 - beardSkew
			}
		}
		w = append(w, e)
	}
	if c > 0 && c < beardCols-1 {
		w = append(w, weight[string]{"WILD", beardWild})
	}
	if scat > 0 {
		w = append(w, weight[string]{"SCAT", scat})
	}
	return w
}

// beardDraw draws n symbols of a reel, top to bottom.
func beardDraw(rng Source, c int, scat float64, n int) []string {
	w := beardWeightsFor(c, scat)
	out := make([]string, n)
	for i := range out {
		out[i] = weighted(rng, w)
	}
	return out
}

func beardGrid(rng Source, scat float64) BeardGrid {
	g := make(BeardGrid, beardCols)
	for c := range g {
		g[c] = beardDraw(rng, c, scat, beardRows)
	}
	return g
}

func beardFindWins(grid BeardGrid) []BeardWin {
	wins := []BeardWin{}
	for _, e := range beardWeights {
		sym := e.v
		ways, length, real := 1, 0, false
		var cells [][2]int
		for c := range beardCols {
			rows := 0
			for r := range beardRows {
				if grid[c][r] == sym {
					real = true
				}
				if grid[c][r] == sym || grid[c][r] == "WILD" {
					rows++
					cells = append(cells, [2]int{c, r})
				}
			}
			if rows == 0 {
				break
			}
			ways *= rows
			length++
		}
		if pay := beardPays[sym][length] * float64(ways); real && pay > 0 {
			wins = append(wins, BeardWin{Sym: sym, Len: length, Ways: ways, Pay: pay, Cells: cells})
		}
	}
	return wins
}

// beardCascade removes the winning cells, drops the rest and fills from the
// top; one of the freed cells receives a wild.
func beardCascade(rng Source, grid BeardGrid, wins []BeardWin, scat float64) (BeardGrid, *[2]int) {
	var hit [beardCols][beardRows]bool
	for _, w := range wins {
		for _, p := range w.Cells {
			hit[p[0]][p[1]] = true
		}
	}
	next := make(BeardGrid, beardCols)
	var spots [][2]int
	for c, col := range grid {
		var kept []string
		for r, s := range col {
			if !hit[c][r] {
				kept = append(kept, s)
			}
		}
		fresh := beardDraw(rng, c, scat, beardRows-len(kept))
		if c >= beardWildFrom {
			for r := range fresh {
				spots = append(spots, [2]int{c, r})
			}
		}
		next[c] = append(fresh, kept...)
	}
	// A win always spans the first three reels, so a spot always exists.
	wild := spots[intn(rng, len(spots))]
	next[wild[0]][wild[1]] = "WILD"
	return next, &wild
}

// beardPlaySpin plays a full spin (all its cascades) from the given multiplier.
func beardPlaySpin(rng Source, mult, scat, budget float64, free bool) BeardSpinResult {
	steps := []BeardStep{}
	grid := beardGrid(rng, scat)
	var wild *[2]int
	win := 0.0
	pJump := beardJump
	if free {
		pJump = beardFSJump
	}
	for {
		wins := beardFindWins(grid)
		if len(wins) == 0 {
			steps = append(steps, BeardStep{Grid: grid, Wins: wins, Wild: wild, Mult: mult})
			break
		}
		stepWin := 0.0
		for _, w := range wins {
			stepWin += w.Pay
		}
		stepWin *= mult
		jumps := 0
		for jumps < beardMaxJumps && rng() < pJump {
			jumps++
		}
		steps = append(steps, BeardStep{Grid: grid, Wins: wins, Wild: wild, Mult: mult, Win: stepWin, Jumps: jumps})
		win += stepWin
		mult *= math.Pow(2, float64(1+jumps))
		if win >= budget {
			break
		}
		grid, wild = beardCascade(rng, grid, wins, scat)
	}
	scatters := 0
	for _, col := range grid {
		for _, s := range col {
			if s == "SCAT" {
				scatters++
			}
		}
	}
	return BeardSpinResult{Steps: steps, Win: win, Mult: mult, Scatters: scatters}
}

func beardFreeSpinsRun(rng Source, count int, budget float64) *BeardBonus {
	spins := []BeardSpinResult{}
	mult, total := 1.0, 0.0
	for left := count - 1; left >= 0 && total < budget; left-- {
		s := beardPlaySpin(rng, mult, 0, budget-total, true)
		mult = s.Mult
		total += s.Win
		l := left
		s.Left = &l
		spins = append(spins, s)
	}
	return &BeardBonus{Spins: spins, Total: total}
}

// BeardCost is the price of a spin, in multiples of the bet.
func BeardCost(o BeardOptions) (float64, error) {
	if o.Buy != "" {
		c, ok := beardCosts[o.Buy]
		if !ok {
			return 0, Error("Achat inconnu")
		}
		return c, nil
	}
	if o.Golden {
		return 1.5, nil
	}
	return 1, nil
}

// BeardSpin plays one full round, bonus included. Options must have been
// accepted by BeardCost.
func BeardSpin(rng Source, o BeardOptions) *BeardResult {
	if o.Buy != "" {
		scatters := 3
		if o.Buy == "fsr" {
			scatters = weighted(rng, beardBuyRandom)
		}
		awarded := beardFreeSpins[scatters]
		bonus := beardFreeSpinsRun(rng, awarded, BeardMaxWin)
		return &BeardResult{
			BeardSpinResult: BeardSpinResult{Steps: []BeardStep{}, Scatters: scatters},
			Bonus:           bonus, Awarded: awarded, Bought: o.Buy, TotalMult: min(bonus.Total, BeardMaxWin),
		}
	}
	scat := beardScat
	if o.Golden {
		scat *= beardGolden
	}
	res := &BeardResult{BeardSpinResult: beardPlaySpin(rng, 1, scat, BeardMaxWin, false)}
	total := res.Win
	if res.Scatters >= 3 && total < BeardMaxWin {
		res.Awarded = beardFreeSpins[min(res.Scatters, 5)]
		res.Bonus = beardFreeSpinsRun(rng, res.Awarded, BeardMaxWin-total)
		total += res.Bonus.Total
	}
	res.TotalMult = min(total, BeardMaxWin)
	return res
}
