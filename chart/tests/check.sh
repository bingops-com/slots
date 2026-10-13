#!/usr/bin/env bash
set -euo pipefail
chart_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
check_dir=$(mktemp -d)
trap 'rm -rf "$check_dir"' EXIT
helm lint "$chart_root"
helm template slots "$chart_root" > "$check_dir/default.yaml"
helm template slots "$chart_root" --set database.sharedAccounts=true --set-string database.existingSecret.name=arcade-database > "$check_dir/shared.yaml"
helm template slots "$chart_root" --set maintenance=true > "$check_dir/maintenance.yaml"
python3 - "$check_dir" <<'PY'
import pathlib, sys
directory = pathlib.Path(sys.argv[1])
default = (directory / 'default.yaml').read_text()
shared = (directory / 'shared.yaml').read_text()
maintenance = (directory / 'maintenance.yaml').read_text()
assert 'name: slots-postgresql-app' in default
assert 'name: arcade-database' in shared
assert 'kind: Cluster' in shared, 'Shared credentials pruned the source cluster'
assert 'replicas: 0' in maintenance
assert 'kind: Cluster' in maintenance, 'Maintenance removed the source database'
assert 'name: SLOTS_SHARED_ACCOUNTS' in shared
print('Chart database preservation checks passed')
PY
