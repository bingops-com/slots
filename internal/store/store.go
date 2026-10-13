// Package store keeps accounts, wallets, sessions and the leaderboards in
// PostgreSQL. Every change to a wallet happens inside one transaction that
// holds the player's row, so a round is either fully played and recorded or
// not at all, and two rounds of the same player never overlap.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/bingops-com/slots/internal/engine"
)

var (
	ErrNameTaken = errors.New("store: name already taken")
	ErrNotFound  = errors.New("store: not found")
)

const (
	feedSize = 30
	topSize  = 50
	// One instance at a time applies the migrations.
	migrationLock = 7_710_377
)

// Each entry runs once, in order; its index + 1 is the schema version.
var migrations = []string{`
CREATE TABLE users (
	id         TEXT PRIMARY KEY,
	name       TEXT NOT NULL,
	name_key   TEXT NOT NULL UNIQUE,
	password   TEXT NOT NULL,
	created_at BIGINT NOT NULL,
	wallet     JSONB NOT NULL,
	-- Copies of wallet figures, kept in step with it, for the leaderboard.
	score      BIGINT NOT NULL DEFAULT 0,
	best_mult  DOUBLE PRECISION NOT NULL DEFAULT 0,
	best_game  TEXT NOT NULL DEFAULT '',
	wagered    BIGINT NOT NULL DEFAULT 0,
	rounds     BIGINT NOT NULL DEFAULT 0,
	stake      BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX users_score ON users (score DESC) WHERE rounds > 0;
CREATE INDEX users_best ON users (best_mult DESC) WHERE rounds > 0;
CREATE INDEX users_wagered ON users (wagered DESC) WHERE rounds > 0;

CREATE TABLE sessions (
	token_hash TEXT PRIMARY KEY,
	user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_expiry ON sessions (expires_at);

CREATE TABLE feed (
	id     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name   TEXT NOT NULL,
	game   TEXT NOT NULL,
	bet    BIGINT NOT NULL,
	payout BIGINT NOT NULL,
	mult   DOUBLE PRECISION NOT NULL,
	t      BIGINT NOT NULL
);

CREATE TABLE seasons (
	id         BIGINT PRIMARY KEY,
	started_at BIGINT NOT NULL,
	ended_at   BIGINT,
	podium     JSONB
);
INSERT INTO seasons (id, started_at) VALUES (1, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT);

-- What each player did on each game this season, for the per-game boards.
CREATE TABLE game_stats (
	user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
	game        TEXT NOT NULL,
	rounds      BIGINT NOT NULL DEFAULT 0,
	wagered     BIGINT NOT NULL DEFAULT 0,
	won         BIGINT NOT NULL DEFAULT 0,
	best_mult   DOUBLE PRECISION NOT NULL DEFAULT 0,
	best_payout BIGINT NOT NULL DEFAULT 0,
	PRIMARY KEY (user_id, game)
);
CREATE INDEX game_stats_best ON game_stats (game, best_mult DESC);
`}

type Store struct {
	db *sql.DB
}

// Open connects to the database at url (postgres://user:password@host/db) and
// creates or upgrades its schema. It waits a little for a database that is
// still starting, as happens when both are deployed together.
func Open(ctx context.Context, url string) (*Store, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)
	for attempt := 0; ; attempt++ {
		if err = db.PingContext(ctx); err == nil {
			break
		}
		if attempt == 30 || ctx.Err() != nil {
			db.Close()
			return nil, fmt.Errorf("store: database unreachable: %w", err)
		}
		time.Sleep(time.Second)
	}
	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("store: migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

func (s *Store) migrate(ctx context.Context) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, "SELECT pg_advisory_xact_lock($1)", migrationLock); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations (version INT PRIMARY KEY)"); err != nil {
		return err
	}
	var version int
	if err := tx.QueryRowContext(ctx, "SELECT COALESCE(MAX(version), 0) FROM schema_migrations").Scan(&version); err != nil {
		return err
	}
	if version > len(migrations) {
		return fmt.Errorf("database is at version %d, this binary knows %d", version, len(migrations))
	}
	for i := version; i < len(migrations); i++ {
		if _, err := tx.ExecContext(ctx, migrations[i]); err != nil {
			return fmt.Errorf("version %d: %w", i+1, err)
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO schema_migrations (version) VALUES ($1)", i+1); err != nil {
			return err
		}
	}
	return tx.Commit()
}

type User struct {
	ID     string
	Name   string
	Wallet *engine.Wallet
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}

func nameKey(name string) string { return strings.ToLower(name) }

func now() int64 { return time.Now().UnixMilli() }

// CreateUser registers an account with a fresh wallet: an account created
// during a season gets the same grant as everyone else.
func (s *Store) CreateUser(ctx context.Context, name, password string) (*User, error) {
	u := &User{ID: newID(), Name: name, Wallet: engine.NewWallet()}
	wallet, _ := json.Marshal(u.Wallet)
	_, err := s.db.ExecContext(ctx,
		"INSERT INTO users (id, name, name_key, password, created_at, wallet, stake) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)",
		u.ID, name, nameKey(name), password, now(), string(wallet), u.Wallet.Stake)
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return nil, ErrNameTaken
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

// Credentials returns the id and the password hash of an account.
func (s *Store) Credentials(ctx context.Context, name string) (id, password string, err error) {
	err = s.db.QueryRowContext(ctx, "SELECT id, password FROM users WHERE name_key = $1", nameKey(name)).Scan(&id, &password)
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return
}

func (s *Store) CreateSession(ctx context.Context, userID, tokenHash string, expires time.Time) error {
	_, err := s.db.ExecContext(ctx, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", tokenHash, userID, expires.UnixMilli())
	return err
}

// Serialize login with password changes from either game. A password verified
// before a recovery must not create a live session after that recovery.
func (s *Store) CreateSessionForPassword(ctx context.Context, userID, tokenHash, passwordHash string, expires time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var current string
	if err := tx.QueryRowContext(ctx, "SELECT password FROM users WHERE id = $1 FOR UPDATE", userID).Scan(&current); err != nil {
		return err
	}
	if current != passwordHash {
		return ErrNotFound
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", tokenHash, userID, expires.UnixMilli()); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = $1", tokenHash)
	return err
}

// PurgeSessions forgets the sessions that have expired.
func (s *Store) PurgeSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM sessions WHERE expires_at < $1", now())
	return err
}

type scanner interface{ Scan(...any) error }

func scanUser(row scanner) (*User, error) {
	u := &User{Wallet: &engine.Wallet{}}
	var wallet []byte
	if err := row.Scan(&u.ID, &u.Name, &wallet); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if err := json.Unmarshal(wallet, u.Wallet); err != nil {
		return nil, fmt.Errorf("store: wallet of %s: %w", u.ID, err)
	}
	return u, nil
}

// UserBySession returns the account a live session belongs to.
func (s *Store) UserBySession(ctx context.Context, tokenHash string) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx,
		"SELECT u.id, u.name, u.wallet FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2",
		tokenHash, now()))
}

// User returns an account by id.
func (s *Store) User(ctx context.Context, id string) (*User, error) {
	return scanUser(s.db.QueryRowContext(ctx, "SELECT id, name, wallet FROM users WHERE id = $1", id))
}

type FeedEntry struct {
	Name   string  `json:"name"`
	Game   string  `json:"game"`
	Bet    int64   `json:"bet"`
	Payout int64   `json:"payout"`
	Mult   float64 `json:"mult"`
	T      int64   `json:"t"`
}

func saveWallet(ctx context.Context, tx *sql.Tx, u *User) error {
	w := u.Wallet
	wallet, err := json.Marshal(w)
	if err != nil {
		return err
	}
	var bestMult float64
	var bestGame string
	if w.Best != nil {
		bestMult, bestGame = w.Best.Mult, w.Best.Game
	}
	_, err = tx.ExecContext(ctx,
		"UPDATE users SET wallet = $1::jsonb, score = $2, best_mult = $3, best_game = $4, wagered = $5, rounds = $6, stake = $7 WHERE id = $8",
		string(wallet), w.Score(), bestMult, bestGame, w.Wagered, w.Rounds, w.Stake, u.ID)
	return err
}

// Round is a round that has just been settled.
type Round struct {
	Game     string
	Wagered  int64
	Payout   int64
	Mult     float64
	Announce bool // worth a line in the feed of big wins
}

// Play loads a user, lets fn change the wallet and saves it, all in one
// transaction that holds the player's row. When fn fails nothing is saved. fn
// returns the round it settled, if any, to be counted on the game's board.
func (s *Store) Play(ctx context.Context, userID string, fn func(*User) (*Round, error)) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	u, err := scanUser(tx.QueryRowContext(ctx, "SELECT id, name, wallet FROM users WHERE id = $1 FOR UPDATE", userID))
	if err != nil {
		return nil, err
	}
	round, err := fn(u)
	if err != nil {
		return nil, err
	}
	if err := saveWallet(ctx, tx, u); err != nil {
		return nil, err
	}
	if round != nil {
		// Only a round that paid more than it cost can be a "best" one.
		var bestMult float64
		var bestPayout int64
		if round.Payout > round.Wagered {
			bestMult, bestPayout = round.Mult, round.Payout
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO game_stats AS g (user_id, game, rounds, wagered, won, best_mult, best_payout) VALUES ($1, $2, 1, $3, $4, $5, $6)
			ON CONFLICT (user_id, game) DO UPDATE SET
				rounds = g.rounds + 1, wagered = g.wagered + excluded.wagered, won = g.won + excluded.won,
				best_payout = CASE WHEN excluded.best_mult > g.best_mult THEN excluded.best_payout ELSE g.best_payout END,
				best_mult = GREATEST(g.best_mult, excluded.best_mult)`,
			u.ID, round.Game, round.Wagered, round.Payout, bestMult, bestPayout); err != nil {
			return nil, err
		}
	}
	if round != nil && round.Announce {
		if _, err := tx.ExecContext(ctx, "INSERT INTO feed (name, game, bet, payout, mult, t) VALUES ($1, $2, $3, $4, $5, $6)",
			u.Name, round.Game, round.Wagered, round.Payout, round.Mult, now()); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM feed WHERE id <= (SELECT MAX(id) FROM feed) - $1", feedSize); err != nil {
			return nil, err
		}
	}
	return u, tx.Commit()
}

type GameRanked struct {
	Rank   int     `json:"rank"`
	Name   string  `json:"name"`
	Mult   float64 `json:"mult"`
	Payout int64   `json:"payout"`
	Rounds int64   `json:"rounds"`
}

type GameBoard struct {
	Season  Season       `json:"season"`
	Game    string       `json:"game"`
	Players int          `json:"players"`
	Top     []GameRanked `json:"top"`
	You     *GameRanked  `json:"you"`
}

// GameBoard ranks the players of one game by their best win of the season,
// in multiples of what the round cost. viewerID may be empty.
func (s *Store) GameBoard(ctx context.Context, game, viewerID string) (*GameBoard, error) {
	gb := &GameBoard{Game: game, Top: []GameRanked{}}
	var err error
	if gb.Season, err = s.Season(ctx); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM game_stats WHERE game = $1", game).Scan(&gb.Players); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, u.name, g.best_mult, g.best_payout, g.rounds FROM game_stats g JOIN users u ON u.id = g.user_id
		WHERE g.game = $1 AND g.best_mult > 0 ORDER BY g.best_mult DESC, u.name_key LIMIT 10`, game)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		r := GameRanked{Rank: len(gb.Top) + 1}
		if err := rows.Scan(&id, &r.Name, &r.Mult, &r.Payout, &r.Rounds); err != nil {
			return nil, err
		}
		gb.Top = append(gb.Top, r)
		if id == viewerID {
			you := r
			gb.You = &you
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if viewerID != "" && gb.You == nil {
		var r GameRanked
		var key string
		err := s.db.QueryRowContext(ctx, `
			SELECT u.name, u.name_key, g.best_mult, g.best_payout, g.rounds FROM game_stats g JOIN users u ON u.id = g.user_id
			WHERE g.game = $1 AND g.user_id = $2`, game, viewerID).Scan(&r.Name, &key, &r.Mult, &r.Payout, &r.Rounds)
		if err == nil && r.Mult > 0 {
			err = s.db.QueryRowContext(ctx, `
				SELECT COUNT(*) + 1 FROM game_stats g JOIN users u ON u.id = g.user_id
				WHERE g.game = $1 AND (g.best_mult > $2 OR (g.best_mult = $2 AND u.name_key < $3))`, game, r.Mult, key).Scan(&r.Rank)
		}
		if err == nil {
			gb.You = &r // rank 0: has played, has not won yet
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	return gb, nil
}

func (s *Store) Feed(ctx context.Context) ([]FeedEntry, error) {
	rows, err := s.db.QueryContext(ctx, "SELECT name, game, bet, payout, mult, t FROM feed ORDER BY id DESC LIMIT $1", feedSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FeedEntry{}
	for rows.Next() {
		var e FeedEntry
		if err := rows.Scan(&e.Name, &e.Game, &e.Bet, &e.Payout, &e.Mult, &e.T); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

type Season struct {
	ID        int64 `json:"id"`
	StartedAt int64 `json:"startedAt"`
}

func (s *Store) Season(ctx context.Context) (Season, error) {
	var se Season
	err := s.db.QueryRowContext(ctx, "SELECT id, started_at FROM seasons WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1").Scan(&se.ID, &se.StartedAt)
	return se, err
}

type Ranked struct {
	Rank   int     `json:"rank"`
	Name   string  `json:"name"`
	Score  float64 `json:"score"`
	Rounds int64   `json:"rounds"`
	Stake  int64   `json:"stake"`
	Game   string  `json:"game,omitempty"`
}

type PodiumEntry struct {
	Name  string `json:"name"`
	Score int64  `json:"score"`
}

type PastSeason struct {
	Season  int64         `json:"season"`
	EndedAt int64         `json:"endedAt"`
	Podium  []PodiumEntry `json:"podium"`
}

type Leaderboard struct {
	Season     Season       `json:"season"`
	Type       string       `json:"type"`
	Players    int          `json:"players"`
	Top        []Ranked     `json:"top"`
	You        *Ranked      `json:"you"`
	HallOfFame []PastSeason `json:"hallOfFame"`
}

// The column each board ranks by. Keys are the only values accepted from a
// request; the column names never come from outside.
var boards = map[string]string{"score": "score", "multi": "best_mult", "wagered": "wagered"}

// Leaderboard ranks the players who have played at least one round this
// season. viewerID may be empty.
func (s *Store) Leaderboard(ctx context.Context, board, viewerID string) (*Leaderboard, error) {
	col, ok := boards[board]
	if !ok {
		board, col = "score", boards["score"]
	}
	// Every board is read as a float: the multiplier is one, the others fit.
	col += "::DOUBLE PRECISION"
	lb := &Leaderboard{Type: board, Top: []Ranked{}, HallOfFame: []PastSeason{}}
	var err error
	if lb.Season, err = s.Season(ctx); err != nil {
		return nil, err
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE rounds > 0").Scan(&lb.Players); err != nil {
		return nil, err
	}
	game := "''"
	if board == "multi" {
		game = "best_game"
	}
	rows, err := s.db.QueryContext(ctx, "SELECT id, name, "+col+", rounds, stake, "+game+" FROM users WHERE rounds > 0 ORDER BY "+col+" DESC, name_key LIMIT $1", topSize)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		r := Ranked{Rank: len(lb.Top) + 1}
		if err := rows.Scan(&id, &r.Name, &r.Score, &r.Rounds, &r.Stake, &r.Game); err != nil {
			return nil, err
		}
		lb.Top = append(lb.Top, r)
		if id == viewerID {
			you := r
			lb.You = &you
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if viewerID != "" && lb.You == nil {
		var r Ranked
		var key string
		err := s.db.QueryRowContext(ctx, "SELECT name, name_key, "+col+", rounds, stake, "+game+" FROM users WHERE id = $1 AND rounds > 0", viewerID).
			Scan(&r.Name, &key, &r.Score, &r.Rounds, &r.Stake, &r.Game)
		if err == nil {
			err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) + 1 FROM users WHERE rounds > 0 AND ("+col+" > $1 OR ("+col+" = $1 AND name_key < $2))", r.Score, key).Scan(&r.Rank)
			lb.You = &r
		}
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
	}
	past, err := s.db.QueryContext(ctx, "SELECT id, ended_at, podium FROM seasons WHERE ended_at IS NOT NULL ORDER BY id DESC LIMIT 5")
	if err != nil {
		return nil, err
	}
	defer past.Close()
	for past.Next() {
		var p PastSeason
		var podium []byte
		if err := past.Scan(&p.Season, &p.EndedAt, &podium); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(podium, &p.Podium); err != nil {
			return nil, err
		}
		lb.HallOfFame = append(lb.HallOfFame, p)
	}
	return lb, past.Err()
}

// NewSeason closes the current season: it records the podium, then gives
// everyone the same grant again. Games in progress are dropped with the old
// wallets. It is safe to run while the server is up.
func (s *Store) NewSeason(ctx context.Context) (closed Season, podium []PodiumEntry, err error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return closed, nil, err
	}
	defer tx.Rollback()
	if err = tx.QueryRowContext(ctx, "SELECT id, started_at FROM seasons WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE").Scan(&closed.ID, &closed.StartedAt); err != nil {
		return closed, nil, err
	}
	rows, err := tx.QueryContext(ctx, "SELECT name, score FROM users WHERE rounds > 0 ORDER BY score DESC, name_key LIMIT 3")
	if err != nil {
		return closed, nil, err
	}
	podium = []PodiumEntry{}
	for rows.Next() {
		var p PodiumEntry
		if err = rows.Scan(&p.Name, &p.Score); err != nil {
			rows.Close()
			return closed, nil, err
		}
		podium = append(podium, p)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return closed, nil, err
	}
	at := now()
	encoded, _ := json.Marshal(podium)
	fresh := engine.NewWallet()
	wallet, _ := json.Marshal(fresh)
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{"UPDATE seasons SET ended_at = $1, podium = $2::jsonb WHERE id = $3", []any{at, string(encoded), closed.ID}},
		{"INSERT INTO seasons (id, started_at) VALUES ($1, $2)", []any{closed.ID + 1, at}},
		{"UPDATE users SET wallet = $1::jsonb, score = 0, best_mult = 0, best_game = '', wagered = 0, rounds = 0, stake = $2", []any{string(wallet), fresh.Stake}},
		{"DELETE FROM feed", nil},
		{"DELETE FROM game_stats", nil},
	} {
		if _, err = tx.ExecContext(ctx, q.sql, q.args...); err != nil {
			return closed, nil, err
		}
	}
	return closed, podium, tx.Commit()
}
