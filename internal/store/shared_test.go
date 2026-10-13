package store

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"os"
	"testing"
	"time"
)

func TestSharedAccountsNeverBootstrapAnUnpreparedDatabase(t *testing.T) {
	dsn := os.Getenv("SLOTS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires an isolated PostgreSQL test database")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var absent bool
	if err := db.QueryRow("SELECT to_regnamespace('identity') IS NULL").Scan(&absent); err != nil {
		t.Fatal(err)
	}
	if !absent {
		t.Fatal("test database already has shared identity data")
	}
	if st, err := OpenShared(context.Background(), dsn); err == nil || st != nil {
		t.Fatal("shared startup accepted an unprepared database")
	}
	if err := db.QueryRow("SELECT to_regnamespace('identity') IS NULL").Scan(&absent); err != nil || !absent {
		t.Fatal("failed startup changed the database")
	}
}

// Emulate hashing finishing after a concurrent common-password reset.
func TestSessionCreationRejectsStalePassword(t *testing.T) {
	dsn := os.Getenv("SLOTS_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires an isolated PostgreSQL test database")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	schema := "test_password_" + newID()
	if _, err := db.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatal(err)
	}
	defer db.Exec("DROP SCHEMA " + schema + " CASCADE")
	uRL, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := uRL.Query()
	query.Set("search_path", schema)
	uRL.RawQuery = query.Encode()
	st, err := Open(context.Background(), uRL.String())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	u, err := st.CreateUser(context.Background(), "RaceOwner", "old synthetic hash")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := st.db.Exec("UPDATE users SET password = 'new synthetic hash' WHERE id = $1", u.ID); err != nil {
		t.Fatal(err)
	}
	if err := st.CreateSessionForPassword(context.Background(), u.ID, "stale", "old synthetic hash", time.Now().Add(time.Hour)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("stale verified password created a session: %v", err)
	}
	if err := st.CreateSessionForPassword(context.Background(), u.ID, "current", "new synthetic hash", time.Now().Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
}
