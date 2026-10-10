package engine

var rouletteRed = map[int]bool{1: true, 3: true, 5: true, 7: true, 9: true, 12: true, 14: true, 16: true, 18: true, 19: true, 21: true, 23: true, 25: true, 27: true, 30: true, 32: true, 34: true, 36: true}

type RouletteBet struct {
	Type   string `json:"type"`
	Value  int    `json:"value"`
	Amount int64  `json:"amount"`
}

type RouletteResult struct {
	Number int    `json:"number"`
	Color  string `json:"color"`
	Payout int64  `json:"payout"`
	Bet    int64  `json:"bet"`
}

// rouletteMult is the total multiplier (stake included) of a bet for the
// number drawn, 0 when lost. ok is false for an unknown bet type.
func rouletteMult(kind string, value, n int) (mult int64, ok bool) {
	win := false
	mult = 2
	switch kind {
	case "straight":
		win, mult = n == value, 36
	case "red":
		win = n > 0 && rouletteRed[n]
	case "black":
		win = n > 0 && !rouletteRed[n]
	case "even":
		win = n > 0 && n%2 == 0
	case "odd":
		win = n%2 == 1
	case "low":
		win = n >= 1 && n <= 18
	case "high":
		win = n >= 19
	case "dozen":
		win, mult = n > 0 && (n+11)/12 == value, 3
	case "column":
		win, mult = n > 0 && (n-1)%3+1 == value, 3
	default:
		return 0, false
	}
	if !win {
		mult = 0
	}
	return mult, true
}

func rouletteValidate(bets []RouletteBet) (int64, error) {
	if len(bets) == 0 || len(bets) > 60 {
		return 0, Error("Paris invalides")
	}
	var total int64
	for _, b := range bets {
		if b.Amount <= 0 || b.Amount > maxBet {
			return 0, Error("Mise invalide")
		}
		if b.Type == "straight" && (b.Value < 0 || b.Value > 36) {
			return 0, Error("Numéro invalide")
		}
		if (b.Type == "dozen" || b.Type == "column") && (b.Value < 1 || b.Value > 3) {
			return 0, Error("Pari invalide")
		}
		if _, ok := rouletteMult(b.Type, b.Value, 0); !ok {
			return 0, Error("Type de pari inconnu")
		}
		total += b.Amount
	}
	return total, nil
}

// roulettePlay spins a European wheel (single zero).
func roulettePlay(rng Source, bets []RouletteBet) RouletteResult {
	n := intn(rng, 37)
	res := RouletteResult{Number: n, Color: "black"}
	if n == 0 {
		res.Color = "green"
	} else if rouletteRed[n] {
		res.Color = "red"
	}
	for _, b := range bets {
		m, _ := rouletteMult(b.Type, b.Value, n)
		res.Payout += b.Amount * m
	}
	return res
}
