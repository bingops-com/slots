// slots serves the game: the API, ranked play and the embedded interface.
//
//	slots            start the server
//	slots season     close the current season and open the next one
//	slots sim [n] [bass|beard]
//	                 estimate the return of the slot machines
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/bingops-com/slots/internal/engine"
	"github.com/bingops-com/slots/internal/server"
	"github.com/bingops-com/slots/internal/store"
	"github.com/bingops-com/slots/web"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	cmd := ""
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	var err error
	switch cmd {
	case "":
		err = serve(log)
	case "season":
		err = season()
	case "sim":
		sim(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q (expected nothing, season or sim)", cmd)
	}
	if err != nil {
		log.Error("slots stopped", "err", err)
		os.Exit(1)
	}
}

func open() (*store.Store, error) {
	url := os.Getenv("SLOTS_DATABASE_URL")
	if url == "" {
		return nil, errors.New("SLOTS_DATABASE_URL is not set (postgres://user:password@host:5432/database)")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	return store.Open(ctx, url)
}

func serve(log *slog.Logger) error {
	st, err := open()
	if err != nil {
		return err
	}
	defer st.Close()
	srv, err := server.New(st, web.Files(), server.Config{TrustProxy: os.Getenv("SLOTS_TRUST_PROXY") == "true", Log: log})
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go srv.Housekeeping(ctx)

	hs := &http.Server{
		Addr:              env("SLOTS_ADDR", ":3777"),
		Handler:           srv,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    16 << 10,
		ErrorLog:          slog.NewLogLogger(log.Handler(), slog.LevelWarn),
	}
	failed := make(chan error, 1)
	go func() { failed <- hs.ListenAndServe() }()
	log.Info("slots listening (fictional credits, no real money)", "addr", hs.Addr)
	select {
	case err := <-failed:
		return err
	case <-ctx.Done():
	}
	// Let the rounds being played finish before closing the database.
	shut, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := hs.Shutdown(shut); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	srv.Close(shut)
	log.Info("slots stopped")
	return nil
}

func season() error {
	st, err := open()
	if err != nil {
		return err
	}
	defer st.Close()
	closed, podium, err := st.NewSeason(context.Background())
	if err != nil {
		return err
	}
	fmt.Printf("Saison %d clôturée.\n", closed.ID)
	for i, p := range podium {
		fmt.Printf("  %d. %s (%.2f)\n", i+1, p.Name, float64(p.Score)/100)
	}
	fmt.Printf("Saison %d ouverte.\n", closed.ID+1)
	return nil
}

func sim(args []string) {
	n := 2_000_000
	if len(args) > 0 {
		if v, err := strconv.Atoi(args[0]); err == nil && v > 0 {
			n = v
		}
	}
	only := ""
	if len(args) > 1 {
		only = args[1]
	}
	run := func(label string, n int, cost float64, spin func() (total float64, bonus *float64), cap float64) {
		var total, bonusTotal, top float64
		var hits, bonuses, capped int
		for range n {
			t, b := spin()
			total += t
			if t > 0 {
				hits++
			}
			if b != nil {
				bonuses++
				bonusTotal += *b
			}
			top = max(top, t)
			if t >= cap {
				capped++
			}
		}
		every := "∞"
		if bonuses > 0 {
			every = fmt.Sprintf("%.0f", float64(n)/float64(bonuses))
		}
		fmt.Printf("%s: retour %.2f %% | un gain tous les %.2f tours | bonus 1/%s (moyenne %.1f×) | max %.0f× | plafonnés %d\n",
			label, 100*total/float64(n)/cost, float64(n)/float64(max(hits, 1)), every, bonusTotal/float64(max(bonuses, 1)), top, capped)
	}
	rng := engine.Source(rand.Float64)
	if only == "" || only == "bass" {
		for _, c := range []struct {
			label string
			buy   bool
			n     int
			cost  float64
		}{{"bass", false, n, 1}, {"bass, achat des tours gratuits", true, n/20 + 1, engine.BassBuyCost}} {
			run(c.label, c.n, c.cost, func() (float64, *float64) {
				r := engine.BassSpin(rng, c.buy)
				if r.Bonus != nil {
					return r.TotalMult, &r.Bonus.Total
				}
				return r.TotalMult, nil
			}, engine.BassMaxWin)
		}
	}
	for _, id := range []string{"neptune", "reef"} {
		if only != "" && only != id {
			continue
		}
		spec := engine.TumbleSpecs[id]
		for _, c := range []struct {
			label string
			opts  engine.TumbleOptions
			n     int
		}{{id, engine.TumbleOptions{}, n}, {id + ", mise ante", engine.TumbleOptions{Ante: true}, n}, {id + ", achat", engine.TumbleOptions{Buy: true}, n/40 + 1}} {
			run(c.label, c.n, engine.TumbleCost(c.opts), func() (float64, *float64) {
				r := spec.Spin(rng, c.opts)
				if r.Bonus != nil {
					return r.TotalMult, &r.Bonus.Total
				}
				return r.TotalMult, nil
			}, spec.MaxWin)
		}
	}
	if only == "" || only == "dogs" {
		run("dogs", n, 1, func() (float64, *float64) {
			r := engine.DogsSpinRound(rng)
			if r.Bonus != nil {
				return r.TotalMult, &r.Bonus.Total
			}
			return r.TotalMult, nil
		}, engine.DogsMaxWin)
		run("dogs, achat", n/40+1, engine.DogsBuyCost, func() (float64, *float64) {
			r := engine.DogsPlay(rng, true)
			return r.TotalMult, &r.Bonus.Total
		}, engine.DogsMaxWin)
	}
	if only == "" || only == "bounty" {
		for _, c := range []struct {
			label string
			buy   string
			n     int
		}{
			{"bounty", "", n},
			{"bounty, achat des wilds collants", engine.BountySticky, n/40 + 1},
			{"bounty, achat des duels", engine.BountyDuels, n/40 + 1},
			{"bounty, achat de la collecte", engine.BountyCollect, n/40 + 1},
		} {
			cost := 1.0
			if c.buy != "" {
				cost = engine.BountyCosts[c.buy]
			}
			kinds := map[string]int{}
			run(c.label, c.n, cost, func() (float64, *float64) {
				r := engine.BountySpinRound(rng, c.buy)
				if r.Bonus != nil {
					kinds[r.Scatter]++
					return r.TotalMult, &r.Bonus.Total
				}
				return r.TotalMult, nil
			}, engine.BountyMaxWin)
			if c.buy == "" {
				for _, k := range []string{engine.BountySticky, engine.BountyDuels, engine.BountyCollect} {
					fmt.Printf("  %s 1/%.0f", k, float64(c.n)/float64(max(kinds[k], 1)))
				}
				fmt.Println()
			}
		}
	}
	if only == "" || only == "beard" {
		for _, c := range []struct {
			label string
			opts  engine.BeardOptions
			n     int
		}{
			{"beard", engine.BeardOptions{}, n},
			{"beard, mise dorée", engine.BeardOptions{Golden: true}, n},
			{"beard, achat 7 tours", engine.BeardOptions{Buy: "fs7"}, n/20 + 1},
			{"beard, achat à la roue", engine.BeardOptions{Buy: "fsr"}, n/20 + 1},
		} {
			cost, _ := engine.BeardCost(c.opts)
			run(c.label, c.n, cost, func() (float64, *float64) {
				r := engine.BeardSpin(rng, c.opts)
				if r.Bonus != nil {
					return r.TotalMult, &r.Bonus.Total
				}
				return r.TotalMult, nil
			}, engine.BeardMaxWin)
		}
	}
}
