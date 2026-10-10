# syntax=docker/dockerfile:1

# 1. The practice engine, compiled for the browser.
FROM golang:1.26 AS wasm
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/wasm cmd/wasm
COPY internal/engine internal/engine
RUN GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o /out/engine.wasm ./cmd/wasm \
 && install -m 644 "$(go env GOROOT)/lib/wasm/wasm_exec.js" /out/wasm_exec.js

# 2. The interface, exported as static files.
FROM node:22-slim AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
COPY --from=wasm /out/engine.wasm /out/wasm_exec.js public/
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 3. The server, with the interface embedded.
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd cmd
COPY internal internal
COPY web/embed.go web/embed.go
COPY --from=web /src/web/out web/out
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/slots ./cmd/slots

# The container keeps nothing: everything is in PostgreSQL (SLOTS_DATABASE_URL).
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/slots /slots
ENV SLOTS_ADDR=:3777
EXPOSE 3777
ENTRYPOINT ["/slots"]
