//go:build js && wasm

// The practice engine: the same rules as the server, compiled to WebAssembly
// and run in the player's browser. Nothing leaves the machine, so nothing
// counts on the leaderboard and everything works offline.
//
// It exposes one object, globalThis.SlotsEngine:
//
//	newWallet()                 -> wallet JSON
//	me(walletJSON)              -> {"user": view, "active": games in progress}
//	play(walletJSON, action, bodyJSON)
//	                            -> {"wallet": ..., "out": ..., "user": view} or {"error": "..."}
package main

import (
	"encoding/json"
	"syscall/js"
	"time"

	"github.com/bingops-com/slots/internal/engine"
)

func encode(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		b, _ = json.Marshal(map[string]string{"error": "Erreur interne"})
	}
	return string(b)
}

func decode(raw string) *engine.Wallet {
	w := engine.NewWallet()
	if json.Unmarshal([]byte(raw), w) != nil {
		return engine.NewWallet()
	}
	return w
}

func main() {
	now := func() int64 { return time.Now().UnixMilli() }
	eng := engine.Engine{Rng: engine.Secure, Now: now}
	js.Global().Set("SlotsEngine", js.ValueOf(map[string]any{
		"newWallet": js.FuncOf(func(js.Value, []js.Value) any { return encode(engine.NewWallet()) }),
		"me": js.FuncOf(func(_ js.Value, args []js.Value) any {
			w := decode(args[0].String())
			return encode(map[string]any{"user": w.View(), "active": w.Active(now())})
		}),
		"play": js.FuncOf(func(_ js.Value, args []js.Value) (result any) {
			defer func() {
				if recover() != nil {
					result = encode(map[string]string{"error": "Erreur interne"})
				}
			}()
			w := decode(args[0].String())
			out, err := eng.Do(w, args[1].String(), []byte(args[2].String()))
			if err != nil {
				return encode(map[string]string{"error": err.Error()})
			}
			return encode(map[string]any{"wallet": w, "out": out, "user": w.View()})
		}),
	}))
	select {}
}
