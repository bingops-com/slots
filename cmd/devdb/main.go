// devdb runs a local PostgreSQL for development, without Docker or a system
// install: the first run downloads it, the data stays in data/pg. Leave it
// running next to the server, which reads SLOTS_DATABASE_URL:
//
//	postgres://slots:slots@127.0.0.1:5433/slots?sslmode=disable
//
// It is a development convenience only; production uses a real database.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
)

func main() {
	dir, err := filepath.Abs("data/pg")
	if err != nil {
		panic(err)
	}
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Port(5433).Username("slots").Password("slots").Database("slots").
		RuntimePath(filepath.Join(dir, "run")).DataPath(filepath.Join(dir, "data")).BinariesPath(filepath.Join(dir, "bin")))
	if err := pg.Start(); err != nil {
		fmt.Fprintln(os.Stderr, "devdb:", err)
		os.Exit(1)
	}
	fmt.Println("devdb: postgres://slots:slots@127.0.0.1:5433/slots?sslmode=disable (Ctrl+C pour arrêter)")
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	if err := pg.Stop(); err != nil {
		fmt.Fprintln(os.Stderr, "devdb:", err)
		os.Exit(1)
	}
}
