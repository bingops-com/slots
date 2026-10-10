// Package engine holds the rules of every game and of the wallet. It has no
// dependency on the network or on storage: the server runs it for ranked play
// and the browser runs the very same code, compiled to WebAssembly, for
// practice. All amounts are fictional credits, in hundredths.
package engine

import (
	"crypto/rand"
	"encoding/binary"
)

// Source returns a uniform float in [0, 1). Games take it as a parameter so
// the simulator can inject a faster generator.
type Source func() float64

// Secure draws from the operating system's (or the browser's) CSPRNG.
func Secure() float64 {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("engine: no randomness available: " + err.Error())
	}
	return float64(binary.LittleEndian.Uint32(b[:])) / (1 << 32)
}

func intn(rng Source, n int) int { return int(rng() * float64(n)) }

type weight[T any] struct {
	v T
	w float64
}

func weighted[T any](rng Source, table []weight[T]) T {
	total := 0.0
	for _, e := range table {
		total += e.w
	}
	x := rng() * total
	for _, e := range table {
		if x -= e.w; x < 0 {
			return e.v
		}
	}
	return table[len(table)-1].v
}

// Error is a rule violation the player may read ("Mise invalide"). Anything
// else returned by the engine is a bug.
type Error string

func (e Error) Error() string { return string(e) }
