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

## [2026-04-22] fixture-gen determinism (T7)
- `PublicKey::new` and `SecretKey::try_encrypt` in fhe.rs both call `thread_rng()` internally to seed the `a` polynomial — passing a deterministic `rng` to them does NOT prevent non-determinism.
- `SecretKey::try_encrypt_with_seed(pt, seed, rng)` is the only deterministic encryption path; both `seed` ([u8; 32]) and `rng` must be drawn from the same `ChaCha20Rng` to guarantee bit-identical output across runs.
- Do not use `PublicKey` at all in the fixture generator — remove it entirely and rely on secret-key-mode encryption.

## [2026-04-22] T13: PhaseShell + phase store
- Created `phaseStore` utilizing Svelte's `writable` with `sessionStorage` for persistence, avoiding SSR errors with `$app/environment` `browser` check.
- Added `PhaseShell` which serves as the layout wrapper utilizing `ProgressiveDisclosure` via named slots for various depth levels, mapping content using the `PHASES` array from `content/phases.ts`.
- Developed `PhaseProgress` demonstrating a visual track of 8 dots, enabling navigation between completed phases but disabling future ones.
- Keyboard bindings (Enter, Escape) handle jump and playback controls properly across these elements.
- Ensure slots correctly pass along attributes to match `ProgressiveDisclosure`'s nested scoped patterns.

## [2026-04-22] T15: trbfv WASM port
- The vendored `fhe-rs` threshold code was already wasm-safe enough once `fhe::lib` re-exported `mbfv`, `trbfv`, and `proto::trbfv`; no extra rayon stripping was needed in this crate because the vendored trbfv path already runs sequentially.
- For wasm bindings, the cleanest boundary is JSON envelopes plus vendored protobuf helpers: round-1 emits serialized per-recipient share matrices, round-2 returns serialized `(sk_poly, es_poly)` bundles, and partial decrypt / combine reuse `serialize_*` and `deserialize_*` from `fhe::proto::trbfv`.
- Deterministic parity tests need a deterministic CRP seed shared by all parties and deterministic per-party RNG seeds; below-threshold combine must fail before decryption instead of trying to interpolate with too few shares.
- Creating local phase stores for sharing global simulated state (`dkgStore`) lets us keep MockCryptoEngine responses around for later phases like public key aggregation without recalculating them on every page load.
- Avoid passing sensitive simulated bytes to LocalStorage or SessionStorage entirely; a local `writable` Svelte store initialized via `await engine.runDkg(...)` is safer and fits the client-side session model perfectly for the demo.
- Using staggered CSS animations (`in:fly` with `delay: i * 150`) produces smooth visual storytelling for sharing/combining fragments.

### Phase 1 & 2 implementation
- Implemented Phase 1 (Meet Participants) and Phase 2 (Distributed Keygen) using `PhaseShell` which wraps the existing `ProgressiveDisclosure` and Phase content structures.
- Exposed a shared `engine` instance of `MockCryptoEngine` from `$lib/crypto/index.ts`.
- In SvelteKit, used `goto('/walkthrough/...')` for routing inside the shell.
- Ensured `onMount` triggers `phaseStore.markVisited` and `advancePhase`.
- Animated the DKG progress using keyframes and updated `committee-card` classes conditionally to indicate shards generation.
- Phase 5 implemented utilizing three swimlanes to parallelize fake training and encryption logic, leveraging the MockCryptoEngine and showing Two's Complement math steps directly.

### Phase 8 implementation
- Used `Array.from` on the decrypted `Int32Array` followed by two's-complement unwrapping logic (`if (val > t/2) val = val - t`) *before* division.
- Multiplicative factors (`n * S`) were cleanly decoupled to standard Float mapping directly in the JS/TS layer, perfectly aligning with the "division by n is NOT homomorphic" architectural decision.
- Built a `<RoundSummary>` UI component presenting magnitude metrics alongside explicit "Honest Framing" disclaimers.

### T22: Sandbox mode
- When implementing reactive parameter controls in Svelte (like threshold picking dependent on committee size), avoid cyclical dependencies in `$:` blocks by updating dependencies sequentially in click handlers and only providing a one-way reactive conversion.
- BFV invariant validation `numClients * scaleFactor * maxGradAbs < t / 2` should disable "Run round" to prevent silent overflow corruption. Max clients for S=4096 is 15.
- The `MockCryptoEngine` can be run cleanly synchronously inside `+page.svelte` script tags.
