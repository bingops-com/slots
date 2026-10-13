package store

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
)

// OpenShared uses an explicitly prepared common database. Startup must never
// silently import, merge or replace existing accounts.
func OpenShared(ctx context.Context, dsn string) (*Store, error) {
	u, err := url.Parse(dsn)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") {
		return nil, errors.New("shared accounts require a PostgreSQL URL")
	}
	q := u.Query()
	q.Set("search_path", "slots,identity")
	u.RawQuery = q.Encode()
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		return nil, errors.New("cannot open shared accounts database")
	}
	defer db.Close()
	var version int
	if err := db.QueryRowContext(ctx, "SELECT version FROM identity.schema_version WHERE version = 1").Scan(&version); err != nil {
		return nil, errors.New("shared accounts database is not prepared; follow the LabOps arcade runbook")
	}
	return Open(ctx, u.String())
}
