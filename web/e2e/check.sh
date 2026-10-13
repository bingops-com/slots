#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
: "${SLOTS_DATABASE_URL:?Set SLOTS_DATABASE_URL to an isolated development database}"
regression_port=${SLOTS_E2E_PORT:-55462}
if [[ ! $regression_port =~ ^[0-9]+$ ]] || (( regression_port < 1024 || regression_port > 65535 )); then
  echo 'SLOTS_E2E_PORT must be an unprivileged local port' >&2
  exit 1
fi
regression_tmp=$(mktemp -d)
regression_pid=''
cleanup() {
  if [[ -n $regression_pid ]]; then
    kill "$regression_pid" 2>/dev/null || true
    wait "$regression_pid" 2>/dev/null || true
  fi
  rm -rf "$regression_tmp"
}
trap cleanup EXIT
go build -o "$regression_tmp/slots" ./cmd/slots
SLOTS_ADDR="127.0.0.1:$regression_port" "$regression_tmp/slots" >"$regression_tmp/server.log" 2>&1 &
regression_pid=$!
regression_ready=false
for attempt in {1..50}; do
  sleep 0.2
  if ! kill -0 "$regression_pid" 2>/dev/null; then break; fi
  if curl --silent --fail "http://127.0.0.1:$regression_port/healthz" >/dev/null; then regression_ready=true; break; fi
done
if [[ $regression_ready != true ]]; then
  echo 'The isolated Slots server did not become ready; check the test database and port' >&2
  exit 1
fi
SLOTS_URL="http://127.0.0.1:$regression_port" node web/e2e/regressions.mjs
