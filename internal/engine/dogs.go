package engine

// "Chiens de bord" follows the rules of The Dog House: 5x3, 20 lines, wilds on
// the three middle reels that carry a multiplier of 2 or 3 (those on a same
// line add up), and three scatters on reels 1, 3 and 5 that pay 5 times the
// bet and open free spins: nine barrels each give 1, 2 or 3 spins, and every
// wild that lands during them stays in place with its multiplier. Free spins
// do not retrigger. The paytable is the game's; its reels are not public, so
// the layout of the lines is the usual one and the weights below are tuned by
// simulation on its known figures (return 96.51 %, a win on 27.55 % of spins,
// free spins every 180 spins, maximum win 6,750 times the bet).

const (
	dogsCols   = 5
	dogsRows   = 3
	DogsMaxWin = 6750

	dogsScatterPay = 5
)

var dogsLines = [][dogsCols]int{
	{1, 1, 1, 1, 1}, {0, 0, 0, 0, 0}, {2, 2, 2, 2, 2}, {0, 1, 2, 1, 0}, {2, 1, 0, 1, 2},
	{0, 0, 1, 0, 0}, {2, 2, 1, 2, 2}, {1, 2, 2, 2, 1}, {1, 0, 0, 0, 1}, {1, 0, 1, 0, 1},
	{1, 2, 1, 2, 1}, {0, 1, 0, 1, 0}, {2, 1, 2, 1, 2}, {1, 1, 0, 1, 1}, {1, 1, 2, 1, 1},
	{0, 1, 1, 1, 0}, {2, 1, 1, 1, 2}, {0, 2, 0, 2, 0}, {2, 0, 2, 0, 2}, {0, 2, 2, 2, 0},
}

var dogsPays = map[string][6]float64{
	"T": {0, 0, 0, 0.1, 0.25, 1.25}, "J": {0, 0, 0, 0.1, 0.25, 1.25}, "Q": {0, 0, 0, 0.1, 0.25, 1.25},
	"K": {0, 0, 0, 0.25, 0.5, 2.5}, "A": {0, 0, 0, 0.25, 0.5, 2.5},
	"BONE": {0, 0, 0, 0.4, 1, 5}, "COLLAR": {0, 0, 0, 0.6, 1.25, 7.5},
	"DOG1": {0, 0, 0, 1, 2, 10}, "DOG2": {0, 0, 0, 1.25, 3, 15}, "DOG3": {0, 0, 0, 1.75, 5, 25}, "DOG4": {0, 0, 0, 2.5, 7.5, 37.5},
}

// Tuning. Weights are per cell.
var (
	dogsPaying = []weight[string]{
		{"T", 15}, {"J", 15}, {"Q", 15}, {"K", 13}, {"A", 13},
		{"BONE", 10}, {"COLLAR", 9}, {"DOG1", 7.5}, {"DOG2", 6.5}, {"DOG3", 5.5}, {"DOG4", 4.5},
	}
	dogsWild     = 6.8 // middle reels, base game
	dogsFreeWild = 3.0 // middle reels, free spins: every wild stays
	dogsScatter  = 7.8 // reels 1, 3 and 5; at most one per reel
	dogsWildMult = []weight[float64]{{2, 65}, {3, 35}}
	dogsBarrel   = []weight[int]{{1, 50}, {2, 32}, {3, 18}}
)

type DogsCell struct {
	S string  `json:"s"`
	V float64 `json:"v,omitempty"` // multiplier of a wild
}

// DogsGrid is indexed [column][row].
type DogsGrid [][]DogsCell

type DogsWin struct {
	Line  int     `json:"line"`
	Sym   string  `json:"sym"`
	Count int     `json:"count"`
	Pay   float64 `json:"pay"`
	Mult  float64 `json:"mult"`
	Win   float64 `json:"win"`
}

type DogsSpin struct {
	Grid DogsGrid  `json:"grid"`
	Wins []DogsWin `json:"wins"`
	Win  float64   `json:"win"`
	Held [][2]int  `json:"held,omitempty"` // free spins: the wilds kept from earlier spins
	Left int       `json:"left"`
}

type DogsBonus struct {
	Barrels []int      `json:"barrels"` // the nine draws that set the number of spins
	Spins   []DogsSpin `json:"spins"`
	Total   float64    `json:"total"`
}

type DogsResult struct {
	DogsSpin
	Scatters   int        `json:"scatters"`
	ScatterPay float64    `json:"scatterPay"`
	Awarded    int        `json:"awarded,omitempty"`
	Bonus      *DogsBonus `json:"bonus"`
	TotalMult  float64    `json:"totalMult"`
	Round
}

func dogsDraw(rng Source, wild float64, scatters bool) DogsGrid {
	g := make(DogsGrid, dogsCols)
	for c := range g {
		w := append([]weight[string]{}, dogsPaying...)
		if c >= 1 && c <= 3 {
			w = append(w, weight[string]{"WILD", wild})
		}
		if scatters && c%2 == 0 {
			w = append(w, weight[string]{"SCAT", dogsScatter})
		}
		g[c] = make([]DogsCell, dogsRows)
		scatter := false
		for r := range g[c] {
			s := weighted(rng, w)
			for s == "SCAT" && scatter {
				s = weighted(rng, w)
			}
			scatter = scatter || s == "SCAT"
			g[c][r] = DogsCell{S: s}
			if s == "WILD" {
				g[c][r].V = weighted(rng, dogsWildMult)
			}
		}
	}
	return g
}

func dogsEval(grid DogsGrid) ([]DogsWin, float64) {
	wins := []DogsWin{}
	total := 0.0
	for i, line := range dogsLines {
		// Wilds only sit on the middle reels, so a line always starts on a symbol.
		sym := grid[0][line[0]].S
		if _, pays := dogsPays[sym]; !pays {
			continue
		}
		count, mult := 1, 0.0
		for c := 1; c < dogsCols; c++ {
			x := grid[c][line[c]]
			if x.S == "WILD" {
				mult += x.V // the multipliers of the wilds on a line add up
			} else if x.S != sym {
				break
			}
			count++
		}
		pay := dogsPays[sym][count]
		if pay == 0 {
			continue
		}
		// Only the wilds inside the winning part count.
		mult = 0
		for c := 1; c < count; c++ {
			if x := grid[c][line[c]]; x.S == "WILD" {
				mult += x.V
			}
		}
		if mult == 0 {
			mult = 1
		}
		wins = append(wins, DogsWin{Line: i, Sym: sym, Count: count, Pay: pay, Mult: mult, Win: pay * mult})
		total += pay * mult
	}
	return wins, total
}

func dogsFreeSpins(rng Source, budget float64) *DogsBonus {
	b := &DogsBonus{Barrels: make([]int, 9), Spins: []DogsSpin{}}
	count := 0
	for i := range b.Barrels {
		b.Barrels[i] = weighted(rng, dogsBarrel)
		count += b.Barrels[i]
	}
	type held struct {
		c, r int
		v    float64
	}
	var kept []held
	for left := count - 1; left >= 0 && b.Total < budget; left-- {
		grid := dogsDraw(rng, dogsFreeWild, false)
		spin := DogsSpin{Left: left, Held: [][2]int{}}
		for _, h := range kept {
			grid[h.c][h.r] = DogsCell{S: "WILD", V: h.v}
			spin.Held = append(spin.Held, [2]int{h.c, h.r})
		}
		kept = kept[:0]
		for c, col := range grid {
			for r, x := range col {
				if x.S == "WILD" {
					kept = append(kept, held{c, r, x.V})
				}
			}
		}
		spin.Grid = grid
		spin.Wins, spin.Win = dogsEval(grid)
		b.Total += spin.Win
		b.Spins = append(b.Spins, spin)
	}
	return b
}

// DogsSpinRound plays one full round, free spins included.
func DogsSpinRound(rng Source) *DogsResult {
	grid := dogsDraw(rng, dogsWild, true)
	res := &DogsResult{DogsSpin: DogsSpin{Grid: grid}}
	res.Wins, res.Win = dogsEval(grid)
	for _, col := range grid {
		for _, x := range col {
			if x.S == "SCAT" {
				res.Scatters++
			}
		}
	}
	total := res.Win
	if res.Scatters >= 3 {
		res.ScatterPay = dogsScatterPay
		total += res.ScatterPay
		if total < DogsMaxWin {
			res.Bonus = dogsFreeSpins(rng, DogsMaxWin-total)
			res.Bonus.Total = min(res.Bonus.Total, DogsMaxWin-total)
			res.Awarded = len(res.Bonus.Spins)
			for _, n := range res.Bonus.Barrels {
				_ = n
			}
			total += res.Bonus.Total
		}
	}
	res.TotalMult = min(total, DogsMaxWin)
	return res
}
