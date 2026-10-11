// Package server exposes the game over HTTP: accounts, ranked play, the
// leaderboard, and the embedded interface.
package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/store"
)

const (
	cookieName  = "slots_session"
	sessionLife = 30 * 24 * time.Hour
	maxBody     = 20_000

	// A win is announced from ten times the bet, or 5 000 credits of profit.
	feedMult   = 10
	feedProfit = 500_000
)

type Config struct {
	// TrustProxy says a reverse proxy sits in front and sets X-Forwarded-For
	// and X-Forwarded-Proto. Never set it when the server is reached directly.
	TrustProxy bool
	Log        *slog.Logger
}

type Server struct {
	cfg    Config
	store  *store.Store
	static *static
	log    *slog.Logger
	// Sign-ups and logins per address, rounds per account.
	authLimit *limiter
	playLimit *limiter
	room      *room
	poker     *pokerRoom
	handler   http.Handler
}

// New builds the server. web holds the built interface.
func New(st *store.Store, web fs.FS, cfg Config) (*Server, error) {
	if cfg.Log == nil {
		cfg.Log = slog.Default()
	}
	files, err := newStatic(web)
	if err != nil {
		return nil, err
	}
	s := &Server{
		cfg: cfg, store: st, static: files, log: cfg.Log,
		authLimit: newLimiter(30.0/600, 30), // 30 attempts, then one every 20 s
		playLimit: newLimiter(20, 60),       // far above what a player clicks
	}
	s.room = &room{table: engine.NewTable(), srv: s}
	s.poker = &pokerRoom{table: engine.NewPoker(), srv: s}

	api := http.NewServeMux()
	api.HandleFunc("POST /api/register", s.handle(s.register))
	api.HandleFunc("POST /api/login", s.handle(s.login))
	api.HandleFunc("POST /api/logout", s.handle(s.logout))
	api.HandleFunc("GET /api/me", s.handle(s.me))
	api.HandleFunc("GET /api/leaderboard", s.handle(s.leaderboard))
	api.HandleFunc("GET /api/leaderboard/{game}", s.handle(s.gameBoard))
	api.HandleFunc("GET /api/feed", s.handle(s.feed))
	api.HandleFunc("GET /api/table", s.handle(s.tableState))
	api.HandleFunc("POST /api/table/bet", s.handle(s.tableBet))
	api.HandleFunc("POST /api/table/ready", s.handle(s.tableReady))
	api.HandleFunc("POST /api/table/action", s.handle(s.tableAction))
	api.HandleFunc("GET /api/poker", s.handle(s.pokerState))
	api.HandleFunc("POST /api/poker/sit", s.handle(s.pokerSit))
	api.HandleFunc("POST /api/poker/leave", s.handle(s.pokerLeave))
	api.HandleFunc("POST /api/poker/action", s.handle(s.pokerAction))
	api.HandleFunc("POST /api/{action...}", s.handle(s.play))
	api.HandleFunc("/api/", s.handle(func(http.ResponseWriter, *http.Request) (any, error) {
		return nil, httpError{http.StatusNotFound, "Route inconnue"}
	}))

	// The session travels in a cookie, so a request that changes anything must
	// come from our own pages.
	sameOrigin := http.NewCrossOriginProtection()
	sameOrigin.SetDenyHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Requête refusée : origine étrangère"})
	}))

	mux := http.NewServeMux()
	mux.Handle("/api/", sameOrigin.Handler(api))
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		if err := st.Ping(r.Context()); err != nil {
			http.Error(w, "database unavailable", http.StatusServiceUnavailable)
			return
		}
		io.WriteString(w, "ok\n")
	})
	mux.Handle("/", files)
	s.handler = s.middleware(mux)
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) { s.handler.ServeHTTP(w, r) }

// Close gives back the bets of a blackjack deal in progress. Call it once the
// HTTP server has stopped, before closing the store.
func (s *Server) Close(ctx context.Context) {
	s.room.close(ctx)
	s.poker.close(ctx)
}

// Housekeeping keeps the shared table moving and forgets expired sessions and
// idle rate-limit entries, until ctx is done.
func (s *Server) Housekeeping(ctx context.Context) {
	go s.room.run(ctx)
	go s.poker.run(ctx)
	tick := time.NewTicker(10 * time.Minute)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if err := s.store.PurgeSessions(ctx); err != nil && ctx.Err() == nil {
				s.log.Error("purge sessions", "err", err)
			}
			s.authLimit.sweep()
			s.playLimit.sweep()
		}
	}
}

// ---------- plumbing ----------

type httpError struct {
	status int
	msg    string
}

func (e httpError) Error() string { return e.msg }

func bad(msg string) error { return httpError{http.StatusBadRequest, msg} }

var errAuth = httpError{http.StatusUnauthorized, "Connexion requise"}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func (s *Server) handle(fn func(http.ResponseWriter, *http.Request) (any, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBody)
		out, err := fn(w, r)
		if err == nil {
			writeJSON(w, http.StatusOK, out)
			return
		}
		status, msg := http.StatusInternalServerError, "Erreur interne"
		var he httpError
		var ee engine.Error
		var tooBig *http.MaxBytesError
		switch {
		case errors.As(err, &he):
			status, msg = he.status, he.msg
		case errors.As(err, &ee):
			status, msg = http.StatusBadRequest, string(ee)
		case errors.As(err, &tooBig):
			status, msg = http.StatusRequestEntityTooLarge, "Requête trop volumineuse"
		case errors.Is(err, context.Canceled):
			status, msg = 499, "Requête abandonnée"
		default:
			s.log.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err)
		}
		writeJSON(w, status, map[string]string{"error": msg})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

// The interface loads nothing from another site. Next.js starts its pages
// with inline scripts, and the practice engine is WebAssembly.
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		if s.secure(r) {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				s.log.Error("panic", "method", r.Method, "path", r.URL.Path, "panic", v)
				if sw.status == http.StatusOK {
					writeJSON(sw, http.StatusInternalServerError, map[string]string{"error": "Erreur interne"})
				}
			}
			// One line per API call; never the body, which may hold a password.
			// The table is polled every second by everyone watching it: only its
			// failures are worth a line.
			if strings.HasPrefix(r.URL.Path, "/api/") && ((r.URL.Path != "/api/table" && r.URL.Path != "/api/poker") || sw.status >= 400) {
				s.log.Info("api", "method", r.Method, "path", r.URL.Path, "status", sw.status, "ms", time.Since(start).Milliseconds(), "ip", s.clientIP(r))
			}
		}()
		next.ServeHTTP(sw, r)
	})
}

func (s *Server) secure(r *http.Request) bool {
	return r.TLS != nil || (s.cfg.TrustProxy && r.Header.Get("X-Forwarded-Proto") == "https")
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		// The last entry is the one our own proxy wrote; earlier ones are the
		// client's word.
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func readJSON(r *http.Request, v any) error {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(body) == 0 {
		return nil
	}
	if err := json.Unmarshal(body, v); err != nil {
		return bad("JSON invalide")
	}
	return nil
}

// ---------- accounts ----------

var nameRule = regexp.MustCompile(`^[A-Za-z0-9_-]{3,16}$`)

type credentials struct {
	Name     string `json:"name"`
	Password string `json:"password"`
}

type account struct {
	Name string `json:"name"`
	engine.View
	Season store.Season `json:"season"`
}

func (s *Server) account(ctx context.Context, u *store.User) (account, error) {
	season, err := s.store.Season(ctx)
	return account{Name: u.Name, View: u.Wallet.View(), Season: season}, err
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (s *Server) openSession(w http.ResponseWriter, r *http.Request, userID string) error {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return err
	}
	token := hex.EncodeToString(raw)
	if err := s.store.CreateSession(r.Context(), userID, tokenHash(token), time.Now().Add(sessionLife)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", MaxAge: int(sessionLife.Seconds()),
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: s.secure(r),
	})
	return nil
}

// user returns the signed-in account, or nil.
func (s *Server) user(r *http.Request) (*store.User, error) {
	c, err := r.Cookie(cookieName)
	if err != nil || len(c.Value) != 64 {
		return nil, nil
	}
	u, err := s.store.UserBySession(r.Context(), tokenHash(c.Value))
	if errors.Is(err, store.ErrNotFound) {
		return nil, nil
	}
	return u, err
}

func (s *Server) throttleAuth(r *http.Request) error {
	if !s.authLimit.allow(s.clientIP(r)) {
		return httpError{http.StatusTooManyRequests, "Trop de tentatives, réessayez plus tard"}
	}
	return nil
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) (any, error) {
	if err := s.throttleAuth(r); err != nil {
		return nil, err
	}
	var c credentials
	if err := readJSON(r, &c); err != nil {
		return nil, err
	}
	if !nameRule.MatchString(c.Name) {
		return nil, bad("Pseudo : 3 à 16 caractères (lettres, chiffres, _ et -)")
	}
	if len(c.Password) < 8 || len(c.Password) > 128 {
		return nil, bad("Mot de passe : 8 caractères minimum")
	}
	u, err := s.store.CreateUser(r.Context(), c.Name, hashPassword(c.Password))
	if errors.Is(err, store.ErrNameTaken) {
		return nil, httpError{http.StatusConflict, "Ce pseudo est déjà pris"}
	}
	if err != nil {
		return nil, err
	}
	if err := s.openSession(w, r, u.ID); err != nil {
		return nil, err
	}
	acc, err := s.account(r.Context(), u)
	return map[string]any{"user": acc}, err
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) (any, error) {
	if err := s.throttleAuth(r); err != nil {
		return nil, err
	}
	var c credentials
	if err := readJSON(r, &c); err != nil {
		return nil, err
	}
	id, hash, err := s.store.Credentials(r.Context(), c.Name)
	if errors.Is(err, store.ErrNotFound) {
		id, hash, err = "", dummyHash, nil
	}
	if err != nil {
		return nil, err
	}
	if len(c.Password) > 128 || !checkPassword(hash, c.Password) || id == "" {
		return nil, httpError{http.StatusUnauthorized, "Pseudo ou mot de passe incorrect"}
	}
	if err := s.openSession(w, r, id); err != nil {
		return nil, err
	}
	u, err := s.store.User(r.Context(), id)
	if err != nil {
		return nil, err
	}
	acc, err := s.account(r.Context(), u)
	return map[string]any{"user": acc}, err
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) (any, error) {
	if c, err := r.Cookie(cookieName); err == nil {
		if err := s.store.DeleteSession(r.Context(), tokenHash(c.Value)); err != nil {
			return nil, err
		}
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: s.secure(r)})
	return struct{}{}, nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, errAuth
	}
	acc, err := s.account(r.Context(), u)
	return map[string]any{"user": acc, "active": u.Wallet.Active(time.Now().UnixMilli())}, err
}

// ---------- leaderboard ----------

func (s *Server) leaderboard(w http.ResponseWriter, r *http.Request) (any, error) {
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	viewer := ""
	if u != nil {
		viewer = u.ID
	}
	return s.store.Leaderboard(r.Context(), r.URL.Query().Get("type"), viewer)
}

// The games that have a board of their own, as the engine names them when it
// settles a round.
var games = []string{"bass", "beard", "bounty", "neptune", "reef", "dogs", "blackjack", "roulette", "dice", "mines", "crash", "plinko", "holdem"}

func (s *Server) gameBoard(w http.ResponseWriter, r *http.Request) (any, error) {
	game := r.PathValue("game")
	if !slices.Contains(games, game) {
		return nil, httpError{http.StatusNotFound, "Jeu inconnu"}
	}
	u, err := s.user(r)
	if err != nil {
		return nil, err
	}
	viewer := ""
	if u != nil {
		viewer = u.ID
	}
	return s.store.GameBoard(r.Context(), game, viewer)
}

func (s *Server) feed(w http.ResponseWriter, r *http.Request) (any, error) {
	feed, err := s.store.Feed(r.Context())
	return map[string]any{"feed": feed}, err
}

// ---------- ranked play ----------

func (s *Server) play(w http.ResponseWriter, r *http.Request) (any, error) {
	action := r.PathValue("action")
	if !slices.Contains(engine.Actions, action) {
		return nil, httpError{http.StatusNotFound, "Route inconnue"}
	}
	viewer, err := s.user(r)
	if err != nil {
		return nil, err
	}
	if viewer == nil {
		return nil, errAuth
	}
	if !s.playLimit.allow(viewer.ID) {
		return nil, httpError{http.StatusTooManyRequests, "Trop de manches à la fois, ralentissez"}
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return nil, err
	}
	var out any
	u, err := s.store.Play(r.Context(), viewer.ID, func(u *store.User) (*store.Round, error) {
		var round *store.Round
		eng := engine.Engine{Rng: engine.Secure, Now: func() int64 { return time.Now().UnixMilli() }, OnSettle: func(r engine.Settled) {
			round = &store.Round{Game: r.Game, Wagered: r.Wagered, Payout: r.Payout, Mult: r.Mult,
				Announce: r.Mult >= feedMult || r.Payout-r.Wagered >= feedProfit}
		}}
		var err error
		out, err = eng.Do(u.Wallet, action, body)
		return round, err
	})
	if err != nil {
		return nil, err
	}
	acc, err := s.account(r.Context(), u)
	if err != nil {
		return nil, err
	}
	// The answer is the result of the round plus the wallet after it.
	res, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	user, err := json.Marshal(acc)
	if err != nil {
		return nil, err
	}
	merged := make([]byte, 0, len(res)+len(user)+10)
	merged = append(merged, res[:len(res)-1]...)
	if len(res) > 2 {
		merged = append(merged, ',')
	}
	merged = append(merged, `"user":`...)
	merged = append(merged, user...)
	merged = append(merged, '}')
	return json.RawMessage(merged), nil
}
