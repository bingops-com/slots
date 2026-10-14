package server

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/store"
	"github.com/bingops-com/slots/internal/store/storetest"
)

func TestLiveTableValidatesSplitCostAndRefundsAllBets(t *testing.T) {
	st := storetest.New(t)
	srv, err := New(st, fstest.MapFS{"index.html": {Data: []byte("home")}}, Config{Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv)
	t.Cleanup(func() { ts.Close(); srv.Close(context.Background()) })
	jar, _ := cookiejar.New(nil)
	c := &client{t: t, http: &http.Client{Jar: jar}, base: ts.URL}
	c.do("POST", "/api/register", `{"name":"LivePlayer","password":"synthetic password"}`)
	id, _, err := st.Credentials(context.Background(), "LivePlayer")
	if err != nil {
		t.Fatal(err)
	}
	_, err = st.Play(context.Background(), id, func(u *store.User) (*store.Round, error) {
		u.Wallet = &engine.Wallet{Stake: 80, Loot: 70}
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`{"bet":100,"sideBets":{"pairs":-1}}`, `{"bet":100,"sideBets":{"trio":101}}`, `{"bet":100,"sideBets":{"pairs":100,"trio":100}}`} {
		if code, _ := c.do("POST", "/api/table/bet", body); code != 400 {
			t.Fatalf("invalid or unaffordable sides: %d", code)
		}
	}
	code, out := c.do("POST", "/api/table/bet", `{"bet":100,"sideBets":{"pairs":10,"trio":10}}`)
	if code != 200 || out["user"].(map[string]any)["balance"] != float64(30) {
		t.Fatal("full commitment was not debited")
	}
	// Deterministic real-engine deal: player's eights, dealer 10+7.
	values := []float64{7.25 / 13, .25 / 4, 9.25 / 13, .25 / 4, 7.25 / 13, 1.25 / 4, 6.25 / 13, 1.25 / 4}
	srv.room.mu.Lock()
	srv.room.table.SetReady(id, nowMs())
	srv.room.table.Tick(func() float64 { v := values[0]; values = values[1:]; return v }, nowMs())
	srv.room.moved()
	srv.room.mu.Unlock()
	if code, _ := c.do("POST", "/api/table/action", `{"action":"split"}`); code != 400 {
		t.Fatal("split without funds accepted")
	}
	srv.room.mu.Lock()
	split := srv.room.table.Seats[0].Split
	srv.room.mu.Unlock()
	if split != nil {
		t.Fatal("rejected split changed the table")
	}
	_, err = st.Play(context.Background(), id, func(u *store.User) (*store.Round, error) { u.Wallet.Loot += 100; return nil, nil })
	if err != nil {
		t.Fatal(err)
	}
	code, out = c.do("POST", "/api/table/action", `{"action":"split"}`)
	if code != 200 || out["user"].(map[string]any)["balance"] != float64(30) {
		t.Fatal("split did not debit exactly one extra main bet")
	}
	table := out["table"].(map[string]any)
	seat := table["seats"].([]any)[0].(map[string]any)
	if table["free"] != float64(4) || len(seat["hands"].([]any)) != 2 || len(table["dealer"].([]any)) != 1 {
		t.Fatal("split lost a place or exposed the dealer hole card")
	}
	if code, _ := c.do("POST", "/api/table/action", `{"action":"split"}`); code != 400 {
		t.Fatal("second split accepted")
	}
	srv.Close(context.Background())
	u, err := st.User(context.Background(), id)
	if err != nil || u.Wallet.Stake != 80 || u.Wallet.Loot != 170 || u.Wallet.Rounds != 0 {
		t.Fatal("closing did not refund all sides and split bets exactly")
	}
}
