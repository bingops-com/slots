package engine

import "math"

// Plinko: a ball falls through rows of pegs, going left or right at each one
// with equal chances, and lands in a bucket that carries a multiplier. The
// middle buckets, where most balls end, pay less than the bet; the edges pay
// a lot and are rarely reached. The player picks the number of rows and the
// risk, which spreads the multipliers more or less.
//
// The tables are those commonly published for this game; each returns about
// 99 % of the bets (TestPlinkoTables checks it).

var plinkoTables = map[int]map[string][]float64{
	8: {
		"low":    {5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6},
		"medium": {13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13},
		"high":   {29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29},
	},
	12: {
		"low":    {10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10},
		"medium": {33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33},
		"high":   {170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170},
	},
	16: {
		"low":    {16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16},
		"medium": {110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110},
		"high":   {1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000},
	},
}

type PlinkoResult struct {
	Rows       int     `json:"rows"`
	Risk       string  `json:"risk"`
	Path       []int   `json:"path"` // at each row: 0 to the left, 1 to the right
	Bucket     int     `json:"bucket"`
	Multiplier float64 `json:"multiplier"`
	Bet        int64   `json:"bet"`
	Payout     int64   `json:"payout"`
}

// PlinkoTable returns the multipliers of the buckets, left to right.
func PlinkoTable(rows int, risk string) ([]float64, error) {
	t, ok := plinkoTables[rows][risk]
	if !ok {
		return nil, Error("Réglage de plinko inconnu")
	}
	return t, nil
}

func plinkoDrop(rng Source, rows int, risk string, bet int64) (*PlinkoResult, error) {
	table, err := PlinkoTable(rows, risk)
	if err != nil {
		return nil, err
	}
	res := &PlinkoResult{Rows: rows, Risk: risk, Path: make([]int, rows), Bet: bet}
	for i := range res.Path {
		if rng() >= 0.5 {
			res.Path[i] = 1
			res.Bucket++
		}
	}
	res.Multiplier = table[res.Bucket]
	res.Payout = int64(math.Floor(float64(bet) * res.Multiplier))
	return res, nil
}
