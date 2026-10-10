package engine

// Two machines share this file: both play on a 6x5 grid where a symbol pays as
// soon as 8 of it are in view, wherever they are, and where winning symbols
// disappear so that the rest tumbles down and new ones fall in.
//
//   - "Neptune" follows Gates of Olympus: multiplier orbs of 2 to 500 land on
//     any spin and their sum multiplies the win of the whole tumble; in the 15
//     free spins the orbs of winning spins add up into a multiplier that never
//     goes back down. Maximum win 5,000 times the bet.
//   - "Le Récif" follows Sweet Bonanza: multiplier bombs of 2 to 100 only land
//     in the 10 free spins and multiply the win of their own spin. Maximum win
//     21,100 times the bet.
//
// Paytables, scatter pays, free spins, retriggers, the ante bet and the price
// of the bonus are the games'. Their reels are not public: the weights below
// are tuned by simulation on their known figures (return 96.5 %, free spins
// every 450 spins or so, a win on 28.8 % and 22.3 % of spins).

const (
	tumbleCols    = 6
	tumbleRows    = 5
	tumbleMinPay  = 8
	tumbleRetrig  = 5   // spins added by 3 scatters or more during free spins
	TumbleBuyCost = 100 // price of the free spins, in multiples of the bet
	TumbleAnte    = 1.25
)

// TumbleSpec is what tells the two machines apart.
type TumbleSpec struct {
	ID        string
	Symbols   []weight[string] // nine paying symbols, the best first
	Pays      [][3]float64     // for 8-9, 10-11 and 12 or more, same order
	Scatter   float64          // weight of the scatter in the base game
	FreeScat  float64          // and during free spins
	AnteScat  float64          // factor on the scatter under the ante bet
	Orb       float64          // weight of the multiplier in the base game (0: none)
	FreeOrb   float64          // and during free spins
	OrbValues []weight[float64]
	FreeSpins int
	Global    bool // free spins: multipliers add up from spin to spin
	// Clump is the chance that a position repeats the symbol above it when that
	// symbol is one of the ClumpTop best: the best symbols then come in stacks,
	// which makes wins rarer but bigger for a same return.
	Clump    float64
	ClumpTop int
	MaxWin   float64
}

var tumblePays = [][3]float64{
	{10, 25, 50}, {2.5, 10, 25}, {2, 5, 15}, {1.5, 2, 12}, {1, 1.5, 10}, {0.8, 1.2, 8}, {0.5, 1, 5}, {0.4, 0.9, 4}, {0.25, 0.75, 2},
}

var tumbleScatterPays = map[int]float64{4: 3, 5: 5, 6: 100}

// TumbleSpecs holds the machines by id.
var TumbleSpecs = map[string]*TumbleSpec{
	"neptune": {
		ID: "neptune",
		Symbols: []weight[string]{
			{"S1", 4.9}, {"S2", 6.3}, {"S3", 7.5}, {"S4", 8.7}, {"S5", 10.3}, {"S6", 11.5}, {"S7", 13.4}, {"S8", 14.5}, {"S9", 16.9},
		},
		Pays: tumblePays, Scatter: 1.6, FreeScat: 2.3, AnteScat: 1.26, Orb: 1.165, FreeOrb: 7,
		OrbValues: []weight[float64]{
			{2, 300}, {3, 220}, {4, 160}, {5, 130}, {6, 90}, {8, 70}, {10, 55}, {12, 35}, {15, 28},
			{20, 18}, {25, 12}, {50, 5}, {100, 1.6}, {250, 0.3}, {500, 0.1},
		},
		FreeSpins: 15, Global: true, MaxWin: 5000,
	},
	"reef": {
		ID: "reef",
		Symbols: []weight[string]{
			{"S1", 9}, {"S2", 10}, {"S3", 11}, {"S4", 11}, {"S5", 11}, {"S6", 11}, {"S7", 12}, {"S8", 12}, {"S9", 13},
		},
		Pays: tumblePays, Scatter: 1.9, FreeScat: 1.9, AnteScat: 1.248, Orb: 0, FreeOrb: 15.1,
		OrbValues: []weight[float64]{
			{2, 300}, {3, 220}, {5, 150}, {8, 80}, {10, 60}, {15, 35}, {20, 22}, {25, 14}, {50, 5}, {100, 1.5},
		},
		FreeSpins: 10, Global: false, MaxWin: 21_100, Clump: 0.221, ClumpTop: 4,
	},
}

// TumbleCell is one position: a symbol, the scatter, or a multiplier and its value.
type TumbleCell struct {
	S string  `json:"s"`
	V float64 `json:"v,omitempty"`
}

// TumbleGrid is indexed [column][row].
type TumbleGrid [][]TumbleCell

type TumbleWin struct {
	Sym   string  `json:"sym"`
	Count int     `json:"count"`
	Pay   float64 `json:"pay"`
}

// TumbleStep is one grid of a spin: the first one, then one per tumble.
type TumbleStep struct {
	Grid TumbleGrid  `json:"grid"`
	Wins []TumbleWin `json:"wins"`
	Win  float64     `json:"win"`
}

// TumbleSpin is a whole spin, tumbles included.
type TumbleSpin struct {
	Steps      []TumbleStep `json:"steps"`
	Base       float64      `json:"base"`             // what the symbols paid
	Orbs       float64      `json:"orbs"`             // sum of the multipliers in view at the end
	Mult       float64      `json:"mult"`             // what the win was multiplied by
	Global     float64      `json:"global,omitempty"` // free spins: the multiplier carried on
	Scatters   int          `json:"scatters"`
	ScatterPay float64      `json:"scatterPay"`
	Win        float64      `json:"win"`
	Retrigger  bool         `json:"retrigger,omitempty"`
	Left       int          `json:"left"`
}

type TumbleBonus struct {
	Spins []TumbleSpin `json:"spins"`
	Total float64      `json:"total"`
}

type TumbleOptions struct {
	Ante bool // costs 25 % more, free spins twice as often
	Buy  bool // pays for the free spins directly
}

type TumbleResult struct {
	TumbleSpin
	Awarded   int          `json:"awarded,omitempty"`
	Bought    bool         `json:"bought,omitempty"`
	Bonus     *TumbleBonus `json:"bonus"`
	TotalMult float64      `json:"totalMult"`
	Round
}

func (s *TumbleSpec) weights(scatter, orb float64) []weight[string] {
	w := append([]weight[string]{}, s.Symbols...)
	if scatter > 0 {
		w = append(w, weight[string]{"SCAT", scatter})
	}
	if orb > 0 {
		w = append(w, weight[string]{"ORB", orb})
	}
	return w
}

// cell draws a position; above is the one just over it in the same column, when
// it has just been drawn too.
func (s *TumbleSpec) cell(rng Source, w []weight[string], above *TumbleCell) TumbleCell {
	if above != nil && s.Clump > 0 {
		for _, top := range s.Symbols[:s.ClumpTop] {
			if top.v == above.S && rng() < s.Clump {
				return *above
			}
		}
	}
	c := TumbleCell{S: weighted(rng, w)}
	if c.S == "ORB" {
		c.V = weighted(rng, s.OrbValues)
	}
	return c
}

// play runs one spin with all its tumbles and counts what is left in view.
func (s *TumbleSpec) play(rng Source, w []weight[string]) TumbleSpin {
	grid := make(TumbleGrid, tumbleCols)
	for c := range grid {
		grid[c] = make([]TumbleCell, tumbleRows)
		for r := range grid[c] {
			var above *TumbleCell
			if r > 0 {
				above = &grid[c][r-1]
			}
			grid[c][r] = s.cell(rng, w, above)
		}
	}
	spin := TumbleSpin{Steps: []TumbleStep{}, Mult: 1}
	for {
		count := map[string]int{}
		for _, col := range grid {
			for _, x := range col {
				count[x.S]++
			}
		}
		step := TumbleStep{Grid: grid, Wins: []TumbleWin{}}
		paid := map[string]bool{}
		for i, sym := range s.Symbols {
			n := count[sym.v]
			if n < tumbleMinPay {
				continue
			}
			tier := 0
			if n >= 12 {
				tier = 2
			} else if n >= 10 {
				tier = 1
			}
			step.Wins = append(step.Wins, TumbleWin{Sym: sym.v, Count: n, Pay: s.Pays[i][tier]})
			step.Win += s.Pays[i][tier]
			paid[sym.v] = true
		}
		spin.Steps = append(spin.Steps, step)
		spin.Base += step.Win
		if len(step.Wins) == 0 {
			break
		}
		// The winning symbols go, the rest falls, new ones come in from the top.
		// Scatters and multipliers stay where they are until the spin is over.
		next := make(TumbleGrid, tumbleCols)
		for c, col := range grid {
			kept := make([]TumbleCell, 0, tumbleRows)
			for _, x := range col {
				if !paid[x.S] {
					kept = append(kept, x)
				}
			}
			fresh := make([]TumbleCell, tumbleRows-len(kept))
			for i := range fresh {
				var above *TumbleCell
				if i > 0 {
					above = &fresh[i-1]
				}
				fresh[i] = s.cell(rng, w, above)
			}
			next[c] = append(fresh, kept...)
		}
		grid = next
	}
	for _, col := range grid {
		for _, x := range col {
			switch x.S {
			case "SCAT":
				spin.Scatters++
			case "ORB":
				spin.Orbs += x.V
			}
		}
	}
	return spin
}

func (s *TumbleSpec) freeSpins(rng Source, count int, budget float64) *TumbleBonus {
	b := &TumbleBonus{Spins: []TumbleSpin{}}
	w := s.weights(s.FreeScat, s.FreeOrb)
	global := 0.0
	for left := count; left > 0 && b.Total < budget; {
		left--
		spin := s.play(rng, w)
		if spin.Base > 0 && spin.Orbs > 0 {
			if s.Global {
				// The multipliers of a winning spin join the total, which then
				// multiplies the win.
				global += spin.Orbs
				spin.Mult = global
			} else {
				spin.Mult = spin.Orbs
			}
		}
		spin.Global = global
		spin.Win = spin.Base * spin.Mult
		if spin.Scatters >= 3 {
			spin.Retrigger = true
			left += tumbleRetrig
		}
		spin.Left = left
		b.Total += spin.Win
		b.Spins = append(b.Spins, spin)
	}
	return b
}

// TumbleCost is the price of a spin, in multiples of the bet.
func TumbleCost(o TumbleOptions) float64 {
	switch {
	case o.Buy:
		return TumbleBuyCost
	case o.Ante:
		return TumbleAnte
	}
	return 1
}

// Spin plays one full round, free spins included.
func (s *TumbleSpec) Spin(rng Source, o TumbleOptions) *TumbleResult {
	if o.Buy {
		// The grid shown for a bought bonus: four scatters and no win.
		plain := s.weights(0, 0)
		var spin TumbleSpin
		for {
			spin = s.play(rng, plain)
			if spin.Base == 0 {
				break
			}
		}
		grid := spin.Steps[0].Grid
		cols := []int{0, 1, 2, 3, 4, 5}
		for i := range 4 {
			j := i + intn(rng, len(cols)-i)
			cols[i], cols[j] = cols[j], cols[i]
			grid[cols[i]][intn(rng, tumbleRows)] = TumbleCell{S: "SCAT"}
		}
		spin.Scatters, spin.ScatterPay = 4, 0
		res := &TumbleResult{TumbleSpin: spin, Awarded: s.FreeSpins, Bought: true}
		res.Bonus = s.freeSpins(rng, s.FreeSpins, s.MaxWin)
		res.Bonus.Total = min(res.Bonus.Total, s.MaxWin)
		res.TotalMult = res.Bonus.Total
		return res
	}
	scatter := s.Scatter
	if o.Ante {
		scatter *= s.AnteScat
	}
	spin := s.play(rng, s.weights(scatter, s.Orb))
	if spin.Base > 0 && spin.Orbs > 0 {
		spin.Mult = spin.Orbs
	}
	spin.ScatterPay = tumbleScatterPays[min(spin.Scatters, 6)]
	spin.Win = spin.Base*spin.Mult + spin.ScatterPay
	res := &TumbleResult{TumbleSpin: spin}
	total := spin.Win
	if spin.Scatters >= 4 && total < s.MaxWin {
		res.Awarded = s.FreeSpins
		res.Bonus = s.freeSpins(rng, s.FreeSpins, s.MaxWin-total)
		res.Bonus.Total = min(res.Bonus.Total, s.MaxWin-total)
		total += res.Bonus.Total
	}
	res.TotalMult = min(total, s.MaxWin)
	return res
}
