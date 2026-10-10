package engine

// "Big Catch" follows the rules of the original Big Bass Bonanza, as its
// public reviews describe them: 5x3, 10 lines, fish carrying values, a
// collecting fisherman wild in free spins only, a level every 4 fishermen, and
// the dynamite that brings fish to a fisherman who has none. The paytable and
// the rules are the game's; its reel strips are not public, so the weights
// below are tuned by simulation on its known figures (return 96.7 %, a win
// every 7.7 spins, free spins every 113 spins).
//
// One addition is ours: the free spins can be bought (BassBuyCost).

const (
	bassCols   = 5
	bassRows   = 3
	BassMaxWin = 2100 // cap, in multiples of the bet

	bassTop           = "FLOAT"
	bassWildsPerLevel = 4
	bassRetrigger     = 10

	bassPDynamite = 0.3 // free spin with a fisherman but no fish: chance of dynamite
)

var bassLines = [][bassCols]int{
	{1, 1, 1, 1, 1}, {0, 0, 0, 0, 0}, {2, 2, 2, 2, 2}, {0, 1, 2, 1, 0}, {2, 1, 0, 1, 2},
	{1, 0, 0, 0, 1}, {1, 2, 2, 2, 1}, {0, 0, 1, 2, 2}, {2, 2, 1, 0, 0}, {1, 0, 1, 2, 1},
}

// Pays in multiples of the total bet, indexed by the number of symbols in line.
var bassPays = map[string][6]float64{
	"T": {0, 0, 0, 0.5, 2.5, 10}, "J": {0, 0, 0, 0.5, 2.5, 10}, "Q": {0, 0, 0, 0.5, 2.5, 10},
	"K": {0, 0, 0, 0.5, 2.5, 10}, "A": {0, 0, 0, 0.5, 2.5, 10},
	"FISH": {0, 0, 0, 1, 5, 20}, "BOX": {0, 0, 0, 2, 10, 50}, "FLY": {0, 0, 0, 2, 10, 50},
	"ROD": {0, 0, 0, 3, 15, 100}, "FLOAT": {0, 0, 0.5, 5, 20, 200},
}

var (
	bassBase = []weight[string]{
		{"T", 16}, {"J", 16}, {"Q", 15}, {"K", 14}, {"A", 13},
		{"FISH", 10}, {"BOX", 7.5}, {"FLY", 7.5}, {"ROD", 6.5}, {"FLOAT", 5.5}, {"SCAT", 4.03},
	}
	bassFree = []weight[string]{
		{"T", 16}, {"J", 16}, {"Q", 15}, {"K", 14}, {"A", 13},
		{"FISH", 19}, {"BOX", 7.5}, {"FLY", 7.5}, {"ROD", 6.5}, {"FLOAT", 5.5}, {"WILD", 1.917},
	}
	bassFishValues = []weight[float64]{{2, 400}, {5, 250}, {10, 150}, {15, 80}, {20, 60}, {25, 35}, {50, 20}, {2000, 0.03}}
	bassFreeSpins  = map[int]int{3: 10, 4: 15, 5: 20}
	bassLevelMult  = []float64{1, 2, 3, 10}
)

// BassCell is one symbol; a fish carries a value.
type BassCell struct {
	S string  `json:"s"`
	V float64 `json:"v,omitempty"`
}

// BassGrid is indexed [column][row].
type BassGrid [][]BassCell

type BassWin struct {
	Line  int     `json:"line"`
	Sym   string  `json:"sym"`
	Count int     `json:"count"`
	Pay   float64 `json:"pay"`
}

type BassFreeSpin struct {
	Grid       BassGrid  `json:"grid"`
	Wins       []BassWin `json:"wins"`
	Mult       float64   `json:"mult"`
	Dynamite   [][2]int  `json:"dynamite,omitempty"`
	After      BassGrid  `json:"after,omitempty"`
	Wilds      int       `json:"wilds"`
	FishSum    float64   `json:"fishSum"`
	Collect    float64   `json:"collect"`
	WildsTotal int       `json:"wildsTotal"`
	Win        float64   `json:"win"`
	Retrigger  bool      `json:"retrigger"`
	Level      int       `json:"level"`
	Left       int       `json:"left"`
}

type BassBonus struct {
	Spins []BassFreeSpin `json:"spins"`
	Total float64        `json:"total"`
}

// BassResult is expressed in multiples of the bet; Round holds the credits.
type BassResult struct {
	Grid      BassGrid   `json:"grid"`
	Wins      []BassWin  `json:"wins"`
	Win       float64    `json:"win"`
	Bonus     *BassBonus `json:"bonus"`
	Scatters  int        `json:"scatters"`
	Awarded   int        `json:"awarded,omitempty"`
	Bought    bool       `json:"bought,omitempty"`
	TotalMult float64    `json:"totalMult"`
	Round
}

func bassCell(rng Source, weights []weight[string], noScatter bool) BassCell {
	s := weighted(rng, weights)
	for noScatter && s == "SCAT" {
		s = weighted(rng, weights)
	}
	if s == "FISH" {
		return BassCell{S: s, V: weighted(rng, bassFishValues)}
	}
	return BassCell{S: s}
}

// A reel holds at most one scatter.
func bassReel(rng Source, weights []weight[string]) []BassCell {
	col := make([]BassCell, 0, bassRows)
	scatter := false
	for range bassRows {
		c := bassCell(rng, weights, scatter)
		scatter = scatter || c.S == "SCAT"
		col = append(col, c)
	}
	return col
}

func bassGrid(rng Source, weights []weight[string]) BassGrid {
	g := make(BassGrid, bassCols)
	for c := range g {
		g[c] = bassReel(rng, weights)
	}
	return g
}

func bassLineWins(grid BassGrid) []BassWin {
	wins := []BassWin{}
	for i, line := range bassLines {
		sym, count := "", 0
		for c := range bassCols {
			s := grid[c][line[c]].S
			if s == "SCAT" {
				break
			}
			if s != "WILD" {
				if sym == "" {
					sym = s
				} else if s != sym {
					break
				}
			}
			count++
		}
		if sym == "" {
			sym = bassTop // a line made of wilds only
		}
		if pay := bassPays[sym][count]; pay > 0 {
			wins = append(wins, BassWin{Line: i, Sym: sym, Count: count, Pay: pay})
		}
	}
	return wins
}

func bassCount(grid BassGrid, sym string) int {
	n := 0
	for _, col := range grid {
		for _, x := range col {
			if x.S == sym {
				n++
			}
		}
	}
	return n
}

func bassSum(wins []BassWin) float64 {
	t := 0.0
	for _, w := range wins {
		t += w.Pay
	}
	return t
}

func bassCopy(grid BassGrid) BassGrid {
	out := make(BassGrid, len(grid))
	for c, col := range grid {
		out[c] = append([]BassCell(nil), col...)
	}
	return out
}

func bassFreeSpinsRun(rng Source, spins int) *BassBonus {
	out := []BassFreeSpin{}
	left, level, wildsTotal := spins, 0, 0
	total := 0.0
	for left > 0 && total < BassMaxWin {
		left--
		grid := bassGrid(rng, bassFree)
		wins := bassLineWins(grid)
		s := BassFreeSpin{Grid: grid, Wins: wins, Mult: bassLevelMult[level]}
		after := grid
		wilds, fish := bassCount(grid, "WILD"), bassCount(grid, "FISH")
		if wilds > 0 && fish == 0 && rng() < bassPDynamite {
			// Dynamite turns random symbols into fish.
			after = bassCopy(grid)
			var spots [][2]int
			for c := range bassCols {
				for r := range bassRows {
					if grid[c][r].S != "WILD" {
						spots = append(spots, [2]int{c, r})
					}
				}
			}
			n := 2 + intn(rng, 4)
			for i := 0; i < n && len(spots) > 0; i++ {
				k := intn(rng, len(spots))
				p := spots[k]
				spots = append(spots[:k], spots[k+1:]...)
				after[p[0]][p[1]] = BassCell{S: "FISH", V: weighted(rng, bassFishValues)}
				s.Dynamite = append(s.Dynamite, p)
			}
			s.After = after
		}
		s.Wilds = bassCount(after, "WILD")
		for _, col := range after {
			for _, x := range col {
				if x.S == "FISH" {
					s.FishSum += x.V
				}
			}
		}
		s.Collect = float64(s.Wilds) * s.FishSum * s.Mult
		wildsTotal += s.Wilds
		s.WildsTotal = wildsTotal
		s.Win = bassSum(wins) + s.Collect
		total += s.Win
		// A level reached is played once the current batch is over.
		if left == 0 && level < len(bassLevelMult)-1 && wildsTotal >= (level+1)*bassWildsPerLevel {
			level++
			left += bassRetrigger
			s.Retrigger = true
		}
		s.Level, s.Left = level, left
		out = append(out, s)
	}
	return &BassBonus{Spins: out, Total: min(total, BassMaxWin)}
}

// BassBuyCost is the price of buying the free spins, in multiples of the bet.
const BassBuyCost = 100

// bassBought draws the grid shown for a bought bonus: three scatters on three
// different reels, and no winning line, since only the free spins are paid.
func bassBought(rng Source) BassGrid {
	for {
		grid := make(BassGrid, bassCols)
		for c := range grid {
			grid[c] = make([]BassCell, bassRows)
			for r := range grid[c] {
				grid[c][r] = bassCell(rng, bassBase, true)
			}
		}
		reels := []int{0, 1, 2, 3, 4}
		for i := range 3 {
			j := i + intn(rng, len(reels)-i)
			reels[i], reels[j] = reels[j], reels[i]
			grid[reels[i]][intn(rng, bassRows)] = BassCell{S: "SCAT"}
		}
		if len(bassLineWins(grid)) == 0 {
			return grid
		}
	}
}

// BassSpin plays one full round, bonus included. buy pays for the free spins
// directly: three scatters, ten spins.
func BassSpin(rng Source, buy bool) *BassResult {
	if buy {
		res := &BassResult{Grid: bassBought(rng), Wins: []BassWin{}, Scatters: 3, Awarded: bassFreeSpins[3], Bought: true}
		res.Bonus = bassFreeSpinsRun(rng, res.Awarded)
		res.TotalMult = min(res.Bonus.Total, BassMaxWin)
		return res
	}
	grid := bassGrid(rng, bassBase)
	wins := bassLineWins(grid)
	res := &BassResult{Grid: grid, Wins: wins, Win: bassSum(wins)}
	total := res.Win
	res.Scatters = bassCount(grid, "SCAT")
	if res.Scatters >= 3 {
		res.Awarded = bassFreeSpins[min(res.Scatters, 5)]
		res.Bonus = bassFreeSpinsRun(rng, res.Awarded)
		total += res.Bonus.Total
	}
	res.TotalMult = min(total, BassMaxWin)
	return res
}
