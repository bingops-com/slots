package engine

import (
	"encoding/json"
	"math"
	"testing"
)

func TestRepaymentTransfersBalanceToScore(t *testing.T) {
	for _, c := range []struct {
		name                      string
		wallet                    Wallet
		amount                    int64
		stake, loot, debt, banked int64
	}{
		{"grant", Wallet{Stake: 100000, Debt: 100000}, 30000, 70000, 0, 70000, 0},
		{"loot", Wallet{Loot: 150000, Debt: 100000}, 100000, 0, 50000, 0, 100000},
		{"mixed", Wallet{Stake: 20000, Loot: 150000, Debt: 100000, Banked: 1000}, 70000, 0, 100000, 30000, 51000},
		{"one cent", Wallet{Loot: 1, Debt: 1}, 1, 0, 0, 0, 1},
	} {
		t.Run(c.name, func(t *testing.T) {
			w := c.wallet
			balance, score := w.Balance(), w.Score()
			settled := false
			e := Engine{OnSettle: func(Settled) { settled = true }}
			body, _ := json.Marshal(map[string]int64{"amount": c.amount})
			out, err := e.Do(&w, "repay", body)
			if err != nil {
				t.Fatal(err)
			}
			if w.Balance() != balance-c.amount || w.Score() != score+c.amount || w.Stake != c.stake || w.Loot != c.loot || w.Debt != c.debt || w.Banked != c.banked {
				t.Fatalf("unexpected repayment: %+v", w)
			}
			if settled || w.Rounds != 0 || w.Wagered != 0 || w.Won != 0 || w.Best != nil {
				t.Fatal("repayment was counted as a game")
			}
			encoded, _ := json.Marshal(out)
			var result struct {
				Repaid int64 `json:"repaid"`
			}
			if json.Unmarshal(encoded, &result) != nil || result.Repaid != c.amount {
				t.Fatal("missing receipt")
			}
		})
	}
}

func TestInvalidRepaymentLeavesWalletUntouched(t *testing.T) {
	for _, body := range []string{``, `{}`, `null`, `{"amount":0}`, `{"amount":-1}`, `{"amount":1.5}`, `{"amount":"1"}`, `{"amount":null}`, `{"amount":101}`, `{"amount":9223372036854775808}`} {
		w := Wallet{Loot: 50, Debt: 100}
		before, _ := json.Marshal(w)
		if _, err := (&Engine{}).Do(&w, "repay", []byte(body)); err == nil {
			t.Fatalf("accepted %s", body)
		}
		after, _ := json.Marshal(w)
		if string(before) != string(after) {
			t.Fatalf("invalid repayment changed wallet: %s", body)
		}
	}
	for _, w := range []Wallet{{Loot: 100}, {Loot: 100, Debt: 50}, {Loot: 100, Debt: 100, Banked: math.MaxInt64}} {
		before, _ := json.Marshal(w)
		if _, err := (&Engine{}).Do(&w, "repay", []byte(`{"amount":100}`)); err == nil {
			t.Fatal("invalid debt or overflowing score accepted")
		}
		after, _ := json.Marshal(w)
		if string(before) != string(after) {
			t.Fatal("rejected repayment changed wallet")
		}
	}
}

func TestBorrowRepayCycleDoesNotCreatePoints(t *testing.T) {
	w := &Wallet{}
	e := &Engine{}
	for range 100 {
		if _, err := e.Do(w, "advance", nil); err != nil {
			t.Fatal(err)
		}
		if _, err := e.Do(w, "repay", []byte(`{"amount":100000}`)); err != nil {
			t.Fatal(err)
		}
		if w.Balance() != 0 || w.Debt != 0 || w.Score() != 0 || w.Banked != 0 {
			t.Fatalf("cycle created points: %+v", w)
		}
	}
}

func TestRepaymentKeepsActiveGameAndOldWallets(t *testing.T) {
	var w Wallet
	if err := json.Unmarshal([]byte(`{"stake":0,"loot":500,"debt":100}`), &w); err != nil {
		t.Fatal(err)
	}
	if w.Banked != 0 || w.Score() != 400 {
		t.Fatal("legacy score changed")
	}
	w.Mines = &Mines{Bet: 100}
	active := w.Mines
	if _, err := (&Engine{}).Do(&w, "repay", []byte(`{"amount":100}`)); err != nil {
		t.Fatal(err)
	}
	if w.Mines != active || w.Mines.Bet != 100 {
		t.Fatal("repayment touched the pending stake")
	}
	encoded, _ := json.Marshal(w)
	var restored Wallet
	if json.Unmarshal(encoded, &restored) != nil || restored.Score() != 500 || restored.Banked != 100 {
		t.Fatal("banked score was lost on reload")
	}
}
