# fhe.rs WASM feasibility spike report

- Build success: YES (`wasm-pack build --target web --release --no-opt`)
- Verdict: PROCEED
- Interfold source SHA: `b147924f3a375c635fc2aefc9c036ba5bf35c3ab`
- fhe.rs source SHA used: `3824c52cb457c55551ffcdaeeaef9f3c53145a93`

## What was proven

- A throwaway BFV spike was created at `examples/weft-web/spikes/fhe-wasm-spike/`.
- The vendored `fhe.rs` subset compiled to `wasm32-unknown-unknown` without SharedArrayBuffer or COOP/COEP headers.
- The browser demo runs inside a plain Web Worker from `python3 -m http.server` and returns:
  - `decrypt-ok: [2, 4, 6, 8, 10, 12, 14, 16] | timings(ms): encrypt=50.00, add=0.00, decrypt=10.00`

## Measurements

- Raw wasm size: `375266` bytes
- Gzip wasm size: `137444` bytes
- Timing estimate from browser worker:
  - encrypt = `50.00ms`
  - add = `0.00ms`
  - decrypt = `10.00ms`

## Evidence

- Screenshot: `.sisyphus/evidence/task-1-spike-chrome.png`
- Console log: `.sisyphus/evidence/task-1-spike-console.log`
- No-COOP/COEP headers capture: `.sisyphus/evidence/task-1-no-coop-headers.txt`
- Network log: `.sisyphus/evidence/task-1-network.log`
- Gzipped wasm artifact: `.sisyphus/evidence/task-1-wasm.gz`

## Rayon / threading sites stripped or gated

- `vendor/fhe-rs/Cargo.toml`
  - reduced workspace membership to minimal crates
  - removed workspace `rayon` dependency
- `vendor/fhe-rs/crates/fhe/Cargo.toml`
  - removed direct `rayon.workspace = true`
- `vendor/fhe-rs/crates/fhe-util/Cargo.toml`
  - removed direct `rayon.workspace = true`
- `vendor/fhe-rs/crates/fhe-util/src/lib.rs`
  - removed `rayon::prelude` import
  - replaced `.par_iter()` with `.iter()` in `get_smallest_prime_factor`
- `vendor/fhe-rs/crates/fhe/src/trbfv/normal.rs`
  - removed `rayon::prelude` import
  - replaced `.into_par_iter()` with `.into_iter()`
- `vendor/fhe-rs/crates/fhe/src/trbfv/shamir.rs`
  - removed `rayon::prelude` import
  - replaced all `.into_par_iter()` usage with sequential `.into_iter()`
  - replaced rayon reduction with iterator `fold`
- `vendor/fhe-rs/crates/fhe/src/trbfv/shares.rs`
  - removed `rayon::prelude` import
  - replaced `.par_iter()` / `.into_par_iter()` usage with sequential iterators
  - replaced rayon `reduce` with iterator `fold`

## Other wasm-specific changes

- Added `getrandom = { features = ["js"] }` in the spike crate.
- Replaced `std::time::Instant` timing in exported wasm code with `js_sys::Date::now()` under `wasm32`.
- Added a minimal local `vendor/e3-fhe-params` subset to preserve the verified `BfvPreset::SecureThreshold8192` path without pulling the whole Interfold workspace.

## Headers / hosting result

- `python3 -m http.server` response headers contained no `Cross-Origin-Opener-Policy` and no `Cross-Origin-Embedder-Policy`.
- The worker demo still succeeded, so this spike does not require SharedArrayBuffer or threaded wasm.

## Blockers encountered and resolutions

1. Cargo workspace mismatch with repo root workspace
   - Resolved by adding a local empty `[workspace]` table in the spike manifest.
2. Vendored `fhe.rs` manifests inherited workspace metadata
   - Resolved by supplying compatible local workspace package/dependency metadata in the spike manifest.
3. `std::time::Instant::now()` panicked in wasm at runtime
   - Resolved by switching to `js_sys::Date::now()` on `wasm32`.
4. Initial Playwright/browser run hit `WebAssembly.Table.grow()` failure from stale build/runtime state
   - Resolved after rebuilding the package with the wasm timing fix and reloading the page.

## Notes

- This spike intentionally uses single-key decrypt only; threshold decrypt remains deferred.
- `wasm-pack build --target web --release` succeeded earlier with wasm-opt; final validated browser run used `--no-opt` after the runtime-timer fix.
- Size remains well below the 8 MB gzip concern threshold.
