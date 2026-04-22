## [2026-04-22] SvelteKit scaffold
- `app.html` must live under `src/` for SvelteKit 2.x; placing it at the project root breaks `svelte-kit sync`.
- `kit.strict` is not a valid config option in current SvelteKit; remove it to avoid config errors.
- `vite.config.ts` should only hold Vite plugins and dependency exclusions; Vitest config belongs in `vitest.config.ts` to keep `svelte-check` happy.
- Matching Vite versions across workspace packages matters; mixed Vite 5/6 types caused `svelte-check` failures until aligned.

## [2026-04-22] fhe.rs wasm spike
- `BfvPreset::SecureThreshold8192` is confirmed in `/tmp/enclave/crates/fhe-params/src/presets.rs`; plaintext modulus is `131072` and the builder path is via `BfvParamSet -> build_bfv_params_from_set_arc`.
- A minimal vendored subset (`fhe`, `fhe-math`, `fhe-traits`, `fhe-util`) can compile to `wasm32-unknown-unknown` once rayon-backed iterators in `fhe-util` and `fhe::trbfv::*` are rewritten to sequential iterators.
- Browser-safe timing in wasm must avoid `std::time::Instant::now()` here; `js_sys::Date::now()` worked in the worker demo while the std Instant path panicked at runtime.
- Plain `python3 -m http.server` served the worker demo without COOP/COEP headers, and the final Worker output showed `decrypt-ok` from BFV encrypt + add + decrypt.
