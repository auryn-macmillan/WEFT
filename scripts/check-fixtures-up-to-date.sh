#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURES_DIR="$REPO_ROOT/examples/weft-web/crates/fhe-wasm/fixtures/cases"
TEMP_DIR="$(mktemp -d)"

trap 'rm -rf "$TEMP_DIR"' EXIT

echo "check-fixtures-up-to-date: regenerating fixtures to $TEMP_DIR ..."
cd "$REPO_ROOT"
cargo run --release -p fhe-wasm --bin fixture-gen -- "$TEMP_DIR" 2>&1

echo "diffing $FIXTURES_DIR vs $TEMP_DIR ..."
diff -r "$FIXTURES_DIR" "$TEMP_DIR"

echo "fixtures are up-to-date."
