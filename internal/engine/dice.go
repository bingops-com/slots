package engine

import "math"

const diceEdge = 0.01

type DiceResult struct {
	Roll       float64 `json:"roll"`
	Win        bool    `json:"win"`
	Multiplier float64 `json:"multiplier"`
	PayoutMult float64 `json:"payoutMult"`
}

// dicePlay rolls 0.00..99.99. target is the threshold; over wins above it.
func dicePlay(rng Source, target float64, over bool) (DiceResult, error) {
	if math.IsNaN(target) || math.IsInf(target, 0) {
		return DiceResult{}, Error("Seuil invalide")
	}
	target = math.Round(target*100) / 100
	chance := target // in percent
	if over {
		chance = 99.99 - target
	}
	if chance < 0.01 || chance > 98 {
		return DiceResult{}, Error("Seuil hors limites")
	}
	roll := math.Floor(rng()*10000) / 100
	win := roll < target
	if over {
		win = roll > target
	}
	res := DiceResult{Roll: roll, Win: win, Multiplier: math.Floor(100*(1-diceEdge)/chance*10000) / 10000}
	if win {
		res.PayoutMult = res.Multiplier
	}
	return res, nil
}
