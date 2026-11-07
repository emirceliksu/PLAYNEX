#!/bin/sh
# Builds the creator engine for the browser into packages/creator-engine-wasm/pkg.
# Needs the wasm32-unknown-unknown target and wasm-bindgen-cli 0.2.130
# (the version pinned in crates/creator-wasm/Cargo.toml).
set -eu

cd "$(dirname "$0")/../.."
target_dir="${CARGO_TARGET_DIR:-target}"

cargo build -p playnex-creator-wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-name engine \
  --out-dir packages/creator-engine-wasm/pkg \
  "$target_dir/wasm32-unknown-unknown/release/playnex_creator_wasm.wasm"
