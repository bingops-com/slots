// Package storetest gives tests a real PostgreSQL. Each test gets its own
// schema, so tests do not see each other's rows.
//
// With SLOTS_TEST_DATABASE_URL set (as in CI, where a service container
// runs), that database is used. Without it, a PostgreSQL is downloaded once
// and started for the duration of the test binary; nothing has to be
// installed.
package storetest

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net"
	"net/url"
	"os"
	"sync"
	"testing"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/bingops-com/slots/internal/store"
)

var (
	once    sync.Once
	baseURL string
	bootErr error
	stop    = func() {}
)

func boot() {
	if baseURL = os.Getenv("SLOTS_TEST_DATABASE_URL"); baseURL != "" {
		return
	}
	// Any free port: several test binaries may run at once.
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		bootErr = err
		return
	}
	port := uint32(l.Addr().(*net.TCPAddr).Port)
	l.Close()
	dir, err := os.MkdirTemp("", "slots-pg-")
	if err != nil {
		bootErr = err
		return
	}
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().Port(port).RuntimePath(dir).Logger(nil))
	if bootErr = pg.Start(); bootErr != nil {
		return
	}
	stop = func() {
		pg.Stop()
		os.RemoveAll(dir)
	}
	baseURL = fmt.Sprintf("postgres://postgres:postgres@127.0.0.1:%d/postgres?sslmode=disable", port)
}

// Main runs the tests of a package and stops the database afterwards. Call it
// from TestMain: func TestMain(m *testing.M) { os.Exit(storetest.Main(m)) }
func Main(m *testing.M) int {
	code := m.Run()
	stop()
	return code
}

// New opens a store on an empty schema, dropped when the test ends.
func New(t *testing.T) *store.Store {
	t.Helper()
	once.Do(boot)
	if bootErr != nil {
		t.Fatalf("storetest: no PostgreSQL: %v", bootErr)
	}
	raw := make([]byte, 6)
	rand.Read(raw)
	schema := "t_" + hex.EncodeToString(raw)
	admin, err := sql.Open("pgx", baseURL)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := admin.Exec("CREATE SCHEMA " + schema); err != nil {
		t.Fatalf("storetest: %v", err)
	}
	u, _ := url.Parse(baseURL)
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()
	st, err := store.Open(context.Background(), u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		st.Close()
		admin.Exec("DROP SCHEMA " + schema + " CASCADE")
		admin.Close()
	})
	return st
}
