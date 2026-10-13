package server

import (
	"context"
	"sync"
	"testing"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/store"
)

func TestRepaymentAPIAndConcurrentRequests(t *testing.T) {
	c, st := start(t)
	if code, _ := c.do("POST", "/api/repay", `{"amount":100}`); code != 401 {
		t.Fatalf("unauthenticated: %d", code)
	}
	code, out := c.do("POST", "/api/register", `{"name":"Repayer","password":"synthetic password"}`)
	if code != 200 {
		t.Fatal("registration failed")
	}
	// Identify only this synthetic account; no real credentials are read.
	id, _, err := st.Credentials(context.Background(), "Repayer")
	if err != nil {
		t.Fatal(err)
	}
	seed := func() {
		t.Helper()
		_, err := st.Play(context.Background(), id, func(u *store.User) (*store.Round, error) {
			u.Wallet = &engine.Wallet{Loot: 30000, Debt: 10000, Rounds: 1}
			return nil, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	seed()
	if code, _ := c.do("POST", "/api/repay", `{"amount":10000}`, "Origin", "https://evil.example", "Sec-Fetch-Site", "cross-site"); code != 403 {
		t.Fatalf("cross-origin: %d", code)
	}
	code, out = c.do("POST", "/api/repay", `{"amount":1250}`)
	if code != 200 || out["repaid"] != float64(1250) {
		t.Fatalf("partial repayment: %d", code)
	}
	u := out["user"].(map[string]any)
	if u["balance"] != float64(28750) || u["debt"] != float64(8750) || u["score"] != float64(21250) || u["banked"] != float64(1250) {
		t.Fatal("wrong updated wallet")
	}
	_, out = c.do("GET", "/api/me", "")
	if out["user"].(map[string]any)["banked"] != float64(1250) {
		t.Fatal("repayment not persisted")
	}
	_, out = c.do("GET", "/api/leaderboard", "")
	if out["you"].(map[string]any)["score"] != float64(21250) {
		t.Fatal("leaderboard was not updated")
	}
	seed()
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); code, _ := c.do("POST", "/api/repay", `{"amount":10000}`); statuses <- code }()
	}
	wg.Wait()
	close(statuses)
	counts := map[int]int{}
	for code := range statuses {
		counts[code]++
	}
	if counts[200] != 1 || counts[400] != 1 {
		t.Fatalf("concurrent repayments: %v", counts)
	}
	stored, err := st.User(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Wallet.Balance() != 20000 || stored.Wallet.Debt != 0 || stored.Wallet.Score() != 30000 || stored.Wallet.Banked != 10000 || stored.Wallet.Rounds != 1 {
		t.Fatal("concurrent repayment changed more than once")
	}
	if _, _, err := st.NewSeason(context.Background()); err != nil {
		t.Fatal(err)
	}
	stored, err = st.User(context.Background(), id)
	if err != nil || stored.Wallet.Banked != 0 || stored.Wallet.Score() != 0 {
		t.Fatal("new season did not reset banked points")
	}
}
