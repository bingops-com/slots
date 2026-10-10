package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/bingops-com/slots/internal/store"
	"github.com/bingops-com/slots/internal/store/storetest"
)

func TestMain(m *testing.M) { os.Exit(storetest.Main(m)) }

type client struct {
	t    *testing.T
	http *http.Client
	base string
}

func (c *client) do(method, path, body string, headers ...string) (int, map[string]any) {
	c.t.Helper()
	req, _ := http.NewRequest(method, c.base+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	var out map[string]any
	json.Unmarshal(raw, &out)
	return res.StatusCode, out
}

func start(t *testing.T) (*client, *store.Store) {
	t.Helper()
	st := storetest.New(t)
	web := fstest.MapFS{
		"index.html":          {Data: []byte("<html>home</html>")},
		"g/beard/index.html":  {Data: []byte("<html>beard</html>")},
		"404.html":            {Data: []byte("<html>nowhere</html>")},
		"_next/static/app.js": {Data: []byte(strings.Repeat("console.log('x');", 200))},
	}
	srv, err := New(st, web, Config{Log: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	jar, _ := cookiejar.New(nil)
	return &client{t: t, http: &http.Client{Jar: jar}, base: ts.URL}, st
}

func TestAccountAndRankedPlay(t *testing.T) {
	c, st := start(t)

	if code, _ := c.do("GET", "/api/me", ""); code != 401 {
		t.Fatalf("me without session: %d", code)
	}
	if code, _ := c.do("POST", "/api/dice", `{"bet":100,"target":50}`); code != 401 {
		t.Fatalf("play without session: %d", code)
	}
	if code, _ := c.do("POST", "/api/register", `{"name":"x","password":"long enough"}`); code != 400 {
		t.Fatalf("short name accepted: %d", code)
	}
	if code, _ := c.do("POST", "/api/register", `{"name":"Anne","password":"short"}`); code != 400 {
		t.Fatalf("short password accepted: %d", code)
	}
	code, out := c.do("POST", "/api/register", `{"name":"Anne","password":"correct horse"}`)
	if code != 200 || out["token"] != nil {
		t.Fatalf("register: %d %v (the token must only travel in the cookie)", code, out)
	}
	if code, _ := c.do("POST", "/api/register", `{"name":"anne","password":"correct horse"}`); code != 409 {
		t.Fatalf("duplicate name, different case: %d", code)
	}

	code, out = c.do("POST", "/api/slots/beard", `{"bet":100,"buy":"fsr"}`)
	if code != 200 {
		t.Fatalf("spin: %d %v", code, out)
	}
	user := out["user"].(map[string]any)
	if out["bonus"] == nil || out["cost"].(float64) != 20000 || user["name"] != "Anne" || user["rounds"].(float64) != 1 {
		t.Fatalf("spin answer: %v", out)
	}
	if code, out = c.do("POST", "/api/dice", `{"bet":1,"target":50}`); code != 400 || out["error"] != "Mise invalide" {
		t.Fatalf("bad bet: %d %v", code, out)
	}
	if code, _ = c.do("POST", "/api/nothing", `{}`); code != 404 {
		t.Fatalf("unknown action: %d", code)
	}

	// A game in progress survives between two requests, without its secrets.
	code, out = c.do("POST", "/api/mines/start", `{"bet":100,"mines":3}`)
	if code != 200 || out["game"].(map[string]any)["bombs"] != nil {
		t.Fatalf("mines start: %d %v", code, out)
	}
	_, out = c.do("GET", "/api/me", "")
	if out["active"].(map[string]any)["mines"] == nil {
		t.Fatalf("game in progress lost: %v", out)
	}

	_, out = c.do("GET", "/api/leaderboard?type=nonsense", "")
	if out["players"].(float64) != 1 || out["type"] != "score" || out["you"].(map[string]any)["rank"].(float64) != 1 {
		t.Fatalf("leaderboard: %v", out)
	}

	_, out = c.do("GET", "/api/leaderboard/beard", "")
	if out["players"].(float64) != 1 || out["you"] == nil || out["game"] != "beard" {
		t.Fatalf("game board: %v", out)
	}
	if code, _ = c.do("GET", "/api/leaderboard/chess", ""); code != 404 {
		t.Fatalf("board of an unknown game: %d", code)
	}

	// Another site cannot play with the player's cookie.
	if code, _ = c.do("POST", "/api/dice", `{"bet":100,"target":50}`, "Origin", "https://evil.example", "Sec-Fetch-Site", "cross-site"); code != 403 {
		t.Fatalf("cross-site request: %d", code)
	}

	closed, podium, err := st.NewSeason(context.Background())
	if err != nil || closed.ID != 1 || len(podium) != 1 || podium[0].Name != "Anne" {
		t.Fatalf("new season: %v %v %v", closed, podium, err)
	}
	_, out = c.do("GET", "/api/me", "")
	user = out["user"].(map[string]any)
	if user["balance"].(float64) != 1_000_000 || user["rounds"].(float64) != 0 || user["season"].(map[string]any)["id"].(float64) != 2 {
		t.Fatalf("wallet after the new season: %v", user)
	}

	c.do("POST", "/api/logout", "")
	if code, _ = c.do("GET", "/api/me", ""); code != 401 {
		t.Fatalf("me after logout: %d", code)
	}
	if code, _ = c.do("POST", "/api/login", `{"name":"ANNE","password":"wrong horse"}`); code != 401 {
		t.Fatalf("wrong password: %d", code)
	}
	if code, _ = c.do("POST", "/api/login", `{"name":"nobody","password":"correct horse"}`); code != 401 {
		t.Fatalf("unknown account: %d", code)
	}
	if code, _ = c.do("POST", "/api/login", `{"name":"ANNE","password":"correct horse"}`); code != 200 {
		t.Fatalf("login: %d", code)
	}
}

func TestStatic(t *testing.T) {
	c, _ := start(t)
	for path, want := range map[string]int{"/": 200, "/g/beard": 200, "/g/beard/": 200, "/nowhere": 404, "/../etc/passwd": 404, "/healthz": 200} {
		res, err := http.Get(c.base + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		if res.StatusCode != want {
			t.Errorf("%s: %d, want %d", path, res.StatusCode, want)
		}
		if path == "/" && (res.Header.Get("Content-Security-Policy") == "" || res.Header.Get("Cache-Control") != "no-cache") {
			t.Errorf("headers of /: %v", res.Header)
		}
	}
	res, _ := http.Get(c.base + "/_next/static/app.js")
	res.Body.Close()
	if !strings.Contains(res.Header.Get("Cache-Control"), "immutable") {
		t.Errorf("hashed asset is not cached: %v", res.Header)
	}
}

func TestSessionCookie(t *testing.T) {
	c, _ := start(t)
	req, _ := http.NewRequest("POST", c.base+"/api/register", strings.NewReader(`{"name":"Bob","password":"correct horse"}`))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	cookies := res.Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || len(cookies[0].Value) != 64 {
		t.Fatalf("session cookie: %+v", cookies)
	}
}

// Two players at the shared table: the first bet opens it, both are dealt, the
// books balance at the end, and a spectator never sees the hole card.
func TestSharedTable(t *testing.T) {
	a, st := start(t)
	jar, _ := cookiejar.New(nil)
	b := &client{t: t, http: &http.Client{Jar: jar}, base: a.base}
	a.do("POST", "/api/register", `{"name":"Alice","password":"correct horse"}`)
	b.do("POST", "/api/register", `{"name":"Basile","password":"correct horse"}`)

	_, out := a.do("GET", "/api/table", "")
	if tb := out["table"].(map[string]any); tb["phase"] != "waiting" || tb["canBet"] != true {
		t.Fatalf("empty table: %v", tb)
	}
	if code, _ := (&client{t: t, http: http.DefaultClient, base: a.base}).do("POST", "/api/table/bet", `{"bet":100}`); code != 401 {
		t.Fatalf("bet without an account: %d", code)
	}
	code, out := a.do("POST", "/api/table/bet", `{"bet":1000}`)
	if code != 200 || out["table"].(map[string]any)["phase"] != "betting" || out["user"].(map[string]any)["balance"].(float64) != 999_000 {
		t.Fatalf("first bet: %d %v", code, out)
	}
	if code, _ = a.do("POST", "/api/table/bet", `{"bet":1000}`); code != 400 {
		t.Fatalf("second bet by the same player: %d", code)
	}
	if code, _ = b.do("POST", "/api/table/action", `{"action":"hit"}`); code != 400 {
		t.Fatalf("action before the deal: %d", code)
	}
	b.do("POST", "/api/table/bet", `{"bet":500}`)

	// Play the deal through by standing whenever it is our turn.
	deadline := time.Now().Add(20 * time.Second)
	for {
		if time.Now().After(deadline) {
			t.Fatal("the deal never ended")
		}
		done := false
		for _, c := range []*client{a, b} {
			_, out := c.do("GET", "/api/table", "")
			tb := out["table"].(map[string]any)
			if tb["phase"] == "playing" && tb["hole"] == true && len(tb["dealer"].([]any)) != 1 {
				t.Fatalf("hole card shown: %v", tb)
			}
			if len(tb["actions"].([]any)) > 0 {
				c.do("POST", "/api/table/action", `{"action":"stand"}`)
			}
			done = done || tb["phase"] == "done"
		}
		if done {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	_, out = a.do("GET", "/api/table", "")
	seats := out["table"].(map[string]any)["seats"].([]any)
	if len(seats) != 2 {
		t.Fatalf("seats: %v", seats)
	}
	for i, c := range []*client{a, b} {
		_, me := c.do("GET", "/api/me", "")
		u := me["user"].(map[string]any)
		seat := seats[i].(map[string]any)
		if want := 1_000_000 - seat["bet"].(float64) + seat["payout"].(float64); u["balance"].(float64) != want || u["rounds"].(float64) != 1 {
			t.Fatalf("player %d: balance %v, want %v (%v)", i, u["balance"], want, seat)
		}
	}
	_ = st
}
