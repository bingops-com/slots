package engine

import (
	"math"
	"slices"
)

const (
	minesCells = 25
	minesEdge  = 0.01
)

// Mines is a game in progress; it lives in the wallet between two requests.
type Mines struct {
	Bet      int64 `json:"bet"`
	Mines    int   `json:"mines"`
	Bombs    []int `json:"bombs"`
	Revealed []int `json:"revealed"`
}

// MinesView is what the player may see: never the bombs before the end.
type MinesView struct {
	Bet        int64   `json:"bet"`
	Mines      int     `json:"mines"`
	Revealed   []int   `json:"revealed"`
	Multiplier float64 `json:"multiplier"`
	Next       float64 `json:"next"`
	Done       bool    `json:"done,omitempty"`
	Hit        *int    `json:"hit,omitempty"`
	Bombs      []int   `json:"bombs,omitempty"`
	Payout     *int64  `json:"payout,omitempty"`
}

func minesMultiplier(mines, revealed int) float64 {
	if revealed == 0 {
		return 1
	}
	m := 1.0
	for i := range revealed {
		m *= float64(minesCells-i) / float64(minesCells-mines-i)
	}
	return math.Floor(m*(1-minesEdge)*100) / 100
}

func minesStart(rng Source, bet int64, mines int) (*Mines, error) {
	if mines < 1 || mines > 24 {
		return nil, Error("Nombre de mines invalide")
	}
	cells := make([]int, minesCells)
	for i := range cells {
		cells[i] = i
	}
	for i := minesCells - 1; i > 0; i-- {
		j := intn(rng, i+1)
		cells[i], cells[j] = cells[j], cells[i]
	}
	return &Mines{Bet: bet, Mines: mines, Bombs: cells[:mines], Revealed: []int{}}, nil
}

func (m *Mines) reveal(cell int) (hit, done bool, err error) {
	if cell < 0 || cell >= minesCells {
		return false, false, Error("Case invalide")
	}
	if slices.Contains(m.Revealed, cell) {
		return false, false, Error("Case déjà révélée")
	}
	if slices.Contains(m.Bombs, cell) {
		return true, true, nil
	}
	m.Revealed = append(m.Revealed, cell)
	return false, len(m.Revealed) == minesCells-m.Mines, nil
}

func (m *Mines) view() MinesView {
	return MinesView{
		Bet:        m.Bet,
		Mines:      m.Mines,
		Revealed:   m.Revealed,
		Multiplier: minesMultiplier(m.Mines, len(m.Revealed)),
		Next:       minesMultiplier(m.Mines, len(m.Revealed)+1),
	}
}
