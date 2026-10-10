.PHONY: wasm web build db run dev test check sim season docker chart

# The local database started by "make db".
export SLOTS_DATABASE_URL ?= postgres://slots:slots@127.0.0.1:5433/slots?sslmode=disable

# The practice engine: the Go rules compiled for the browser.
wasm:
	install -m 644 "$$(go env GOROOT)/lib/wasm/wasm_exec.js" web/public/wasm_exec.js
	GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o web/public/engine.wasm ./cmd/wasm

web: wasm
	cd web && npm ci --no-audit --no-fund && npm run build

build: web
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/slots ./cmd/slots

# A local PostgreSQL on :5433, without Docker (downloaded on first run, data in
# data/pg). Leave it running in another terminal.
db:
	go run ./cmd/devdb

# Serve the built interface and the API on http://localhost:3777. Needs "make db"
# or SLOTS_DATABASE_URL pointing at another PostgreSQL.
run: build
	./bin/slots

# API on :3777 plus the Next.js dev server (hot reload) on http://localhost:3000.
# Needs "make db" too.
dev: wasm
	@test -d web/out || mkdir -p web/out
	@test -d web/node_modules || (cd web && npm ci --no-audit --no-fund)
	go run ./cmd/slots & cd web && npm run dev

test:
	go test -race ./...

check: test
	go vet ./...
	cd web && npm run typecheck

# Estimate the return of the slot machines: make sim N=5000000
sim:
	go run ./cmd/slots sim $(N)

# Close the season and open the next one (safe while the server runs).
season:
	go run ./cmd/slots season

docker:
	docker build -t slots .

chart:
	helm lint chart
	helm template slots chart > /dev/null
