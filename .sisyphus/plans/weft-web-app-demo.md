# WEFT Web App Demo — Browser-Based Federated Learning Showcase

## TL;DR

> **Quick Summary**: Turn the existing WEFT terminal demos into a statically-hostable (GitHub Pages) SvelteKit web app that runs the full 8-phase threshold-BFV federated learning flow entirely in-browser, with real FHE cryptography compiled from the Interfold's `fhe.rs` fork to single-threaded WebAssembly. Five simulated committee members and three hospitals run as isolated Web Workers exchanging byte-serialized messages, producing real ciphertexts, real homomorphic sums, and real 3-of-5 threshold decryption. UI is playful/illustrated with progressive disclosure (novice / learn-more / show-math) and a guided-then-sandbox interaction model.
>
> **Deliverables**:
> - `examples/weft-web/` — SvelteKit (adapter-static) app
> - `examples/weft-web/crates/fhe-wasm/` — Rust workspace producing `@weft/fhe-wasm` (wasm-bindgen)
> - 8-phase guided walkthrough + sandbox mode
> - Illustrated hospital narrative reusing St. Mercy / Eastside / Pacific University numbers verbatim
> - Progressive-disclosure content (3 depth levels per phase)
> - Parity test harness: WASM outputs match native Rust fixtures byte-for-byte
> - GitHub Actions workflow deploying to GitHub Pages
> - README + architectural docs explaining "real FHE math, simulated committee topology"
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves, ~7 tasks per wave average
> **Critical Path**: Feasibility spike (T1) → Crypto interface freeze (T6) → WASM port (T14, T15, T16) → UI integration (T24) → Final verification

---

## Context

### Original Request

> "Ok, I'd now like to turn this demo into a web app. Ideally this demo is something that can be statically hosted on GitHub pages. The application should give a visually appealing graphical experience to the this federated learning example, such that both someone familiar or unfamiliar with the problem space and/or the underlying cryptography and/or computer science can appreciate what is happening under. Ideally, the whole thing runs in browsers (presumably that means compiling the FHE components down to WASM."

### Interview Summary

**Key Decisions**:
- **Crypto approach**: Option D — Full port of `gnosisguild/fhe.rs` (Interfold fork) to WASM; real 5-party committee simulated across Web Workers; real DKG, real BFV, real threshold decryption. No stack swap to node-seal/SEAL.
- **Framework**: SvelteKit with `@sveltejs/adapter-static`.
- **Interactivity**: Hybrid — guided narrative first (8 phases), sandbox mode after.
- **Aesthetic**: Playful/illustrated (cartoon hospitals, warm colors, ncase.me-style accessibility).
- **Scenario**: Hospital only (3 hospitals verbatim: St. Mercy General 12,400 / Eastside Medical 8,200 / Pacific University 22,000).
- **Educational depth**: Progressive disclosure — default plain-English, "Learn more" expands crypto details, "Show math" reveals equations.
- **Content reuse**: Reuse narrative + hospital names + numbers verbatim from existing demos.

**Research Findings**:
- `gnosisguild/fhe.rs` has a `rayon` dependency that blocks vanilla WASM compilation — must be stripped or conditionally compiled.
- `@enclave-e3/sdk/crypto` already exposes WASM bindings for client-side encryption (`generatePublicKey`, `encryptNumber`, `encryptVector`), but NOT homomorphic addition, DKG, or threshold decryption — those must be newly bound.
- `trbfv` (threshold BFV) layer may have additional WASM blockers beyond `rayon` (unknown — must be audited in the feasibility spike).
- BFV preset to use: `BfvPreset::SecureThreshold8192` (t=131072, degree=8192, λ=40, 3-of-5 threshold). AGENTS.md mandates reading `t` from the preset at runtime; no custom parameters.
- Existing Rust reference: `secure-process/examples/threshold_demo.rs` already implements the 8 phases with real crypto single-threaded — can be the direct porting template.
- TypeScript narrative source: `scripts/run-round.ts` for audience-friendly copy.
- Shared constants: `client/src/constants.ts`, `secure-process/src/constants.rs`.

### Oracle Review (Gap Analysis)

**Addressed gaps** (incorporated into scope and guardrails):

- **GitHub Pages + SharedArrayBuffer incompatibility** — GH Pages cannot set COOP/COEP response headers reliably, so WASM threads / SAB-backed memory are OUT. Design is single-threaded WASM + `postMessage`/`Comlink` only.
- **Feasibility spike must gate downstream investment** — Added as Wave-1 Task 1; if it fails, project pivots to Option A (simulated aggregation/decrypt) rather than wasting UI work.
- **Parity contract** — WASM outputs must match native Rust fixtures byte-for-byte on fixed seeds; codified as Task 7 (fixture generation) + Task 23 (parity test).
- **CryptoEngine interface** — Frozen early (Task 6) so UI and Rust tracks can proceed in parallel against a mock.
- **Honest crypto framing** — "Real FHE math, simulated committee topology" is a mandatory disclosure copy string, surfaced in Phase 1 and Sandbox (Task 19).
- **Desktop-first v1** — Mobile Safari quirks and worker throttling push mobile to "view-only or unsupported" for v1.
- **Concrete performance budgets** — DKG p50 ≤12s, per-encrypt ≤750ms, 3-of-5 decrypt ≤8s, E2E ≤30s on reference hardware (M1 / recent i5 laptop, Chrome stable).

---

## Reference Paths (READ THIS FIRST)

Throughout this plan, references fall into two categories:

1. **Local WEFT repo** — files at `/home/dev/repo/`. These exist and are the primary codebase.
2. **Interfold monorepo clone** — files at `/tmp/enclave/`. The full `gnosisguild/enclave` monorepo is cloned here for reference. When a task references paths like `crates/fhe-params/`, `crates/trbfv/`, `examples/CRISP/`, or `packages/enclave-contracts/`, they are located at `/tmp/enclave/<path>` — **NOT in `/home/dev/repo/`**.

**Before starting any task, verify Interfold paths exist at `/tmp/enclave/` via `ls /tmp/enclave/<path>`.** If the clone is missing, re-clone with `git clone https://github.com/gnosisguild/enclave /tmp/enclave` before proceeding.

Key Interfold reference paths used across tasks:
- `/tmp/enclave/crates/fhe-params/src/lib.rs` — BFV preset definitions (the `SECURE_THRESHOLD_8192` preset is the canonical source of `t`, degree, ciphertext modulus)
- `/tmp/enclave/crates/trbfv/` — threshold BFV implementation (DKG, partial decryption, share combination)
- `/tmp/enclave/examples/CRISP/` — canonical reference example; structural template for `examples/weft-web/`
- `/tmp/enclave/packages/enclave-contracts/contracts/test/MockE3Program.sol` — IE3Program reference (not used in this web demo since it is off-chain, but referenced for parameter contract parity)
- `/tmp/enclave/Cargo.toml` — reference for workspace Cargo.toml layout (used by Task 3)

---

## Work Objectives

### Core Objective

Ship a visually compelling, statically-hosted SvelteKit web app that executes the full 8-phase WEFT threshold-BFV federated learning flow in-browser using real cryptography compiled from the Interfold's fhe.rs fork, making the system appreciable to both technical and non-technical audiences through progressive disclosure and illustrated narrative.

### Concrete Deliverables

- `examples/weft-web/` SvelteKit project (adapter-static) that builds to `examples/weft-web/build/` for GitHub Pages
- `examples/weft-web/crates/fhe-wasm/` Rust workspace member producing `pkg/` via `wasm-pack` → consumed as `@weft/fhe-wasm` npm workspace package
- Forked subset of `gnosisguild/fhe.rs` + `trbfv` (or equivalent from Interfold monorepo) vendored under `examples/weft-web/crates/fhe-wasm/vendor/` with `rayon` stripped and `wasm32-unknown-unknown` target supported
- 8 phase components: `MeetParticipants.svelte`, `DistributedKeygen.svelte`, `ShareDistribution.svelte`, `AggregatePublicKey.svelte`, `LocalTrainingEncryption.svelte`, `HomomorphicAggregation.svelte`, `ThresholdDecryption.svelte`, `GlobalModelUpdate.svelte`
- `Sandbox.svelte` with controls: number of hospitals (2–10), threshold selection, trigger re-run
- Progressive disclosure at 3 levels (novice / learn-more / show-math) per phase
- Persistent `AttackerPanel.svelte` showing redacted ciphertext traffic
- `ParametersModal.svelte` displaying t, degree, S, λ, threshold, overflow invariant numerically
- Illustrated asset pack: hospital buildings, committee member avatars, lock/key icons, ciphertext tiles — SVG-based for scalability
- `CryptoEngine` TypeScript interface with both mock and real (WASM-backed) implementations
- Worker topology: 5 committee workers + 3 hospital workers + 1 aggregator worker + 1 orchestrator (main thread)
- Parity test harness (`examples/weft-web/tests/parity/`) validating ≥20 vectors against native Rust fixtures
- Playwright E2E covering complete guided walkthrough
- GitHub Actions workflow `.github/workflows/deploy-weft-web.yml` building and deploying on push to main
- `examples/weft-web/README.md` with architecture, dev instructions, honest framing disclosure, and browser support matrix

### Definition of Done

- [ ] `pnpm --filter weft-web build` produces static bundle with gzip-compressed JS/CSS ≤400 KB (initial route) and wasm ≤8 MB gzip (lazy-loaded)
- [ ] First contentful paint <2.5s, interactive shell <4s, crypto engine ready <6s on reference desktop (M1 / recent i5, Chrome stable, broadband)
- [ ] DKG p50 ≤12s / p95 ≤20s, per-hospital encrypt ≤750ms, homomorphic aggregation ≤2s, 3-of-5 decrypt ≤8s, full E2E ≤30s for scripted scenario (3 hospitals, 512-float gradient, SECURE_THRESHOLD_8192)
- [ ] Parity tests pass: WASM output equals native Rust output byte-for-byte on ≥20 vectors (including negatives and chunk boundaries)
- [ ] Playwright E2E completes all 8 phases in Chrome + Firefox headless
- [ ] Manual QA passes on Chrome/Edge/Firefox latest-2 desktop; Safari desktop best-effort
- [ ] Progressive disclosure works at all 3 levels on every phase
- [ ] Attacker panel always shows only redacted ciphertext hex, never plaintext
- [ ] "Real FHE math, simulated committee topology" disclosure visible in Phase 1 and Sandbox entry
- [ ] Deploys live to GitHub Pages via CI on push to `main`
- [ ] README documents architecture, limitations, and honest framing

### Must Have

- Single-threaded WASM only (no `SharedArrayBuffer`, no wasm threads, no COOP/COEP requirements)
- BFV parameters loaded from `BfvPreset::SecureThreshold8192` — no hardcoded params
- Overflow invariant `n_max × S × G < t / 2` checked at runtime using `t` read from the preset
- Byte-level parity with native Rust reference on fixed seeds for encrypt / add / threshold-decrypt
- `CryptoEngine` interface implemented by both `MockCryptoEngine` (fast, deterministic, for UI dev) and `WasmCryptoEngine` (real)
- Honest disclosure copy whenever the "distributed" nature of the committee is represented visually
- Reuse of hospital names + patient counts + gradient examples from existing `scripts/run-round.ts` and `secure-process/examples/threshold_demo.rs`

### Must NOT Have (Guardrails)

- **No custom BFV parameters** — use `SecureThreshold8192` preset exclusively; any deviation breaks Noir circuit compatibility per AGENTS.md §BFV Parameter Specification
- **No division by `n` inside encrypted domain** — averaging scalar applied post-decrypt in plaintext; BFV does not support fractional multiplications (AGENTS.md §Known Constraints)
- **No `SharedArrayBuffer` / wasm threads / COOP-COEP-dependent features** — GH Pages cannot serve the required headers
- **No on-chain interaction** — no E3 contract calls, no Enclave SDK `request`/`activate`/`publishInput` wiring, no wallet prompts
- **No real ML training** — gradients are synthetic scripted values; no TensorFlow.js, no PyTorch, no actual model backprop
- **No backend services** — no API server, no auth, no database, no websocket gateway; entirely static assets
- **No new external Rust crates** without first checking whether `crates/` in the Interfold monorepo already provides the functionality (AGENTS.md checklist)
- **No insecure BFV preset** in production builds — any `InsecureThreshold` variant must be gated behind `#[cfg(test)]` or `#[cfg(debug_assertions)]` and must not compile into the shipped wasm
- **No multiple scenarios** — hospital narrative only; no keyboards, no ads, no IoT
- **No mobile-first commitment for v1** — desktop-only supported officially; mobile is best-effort observation mode at most
- **No second planning session** — everything in this ONE plan; do not split into phase-2 plans
- **No AI-slop patterns** — no superfluous comments, no premature abstraction, no generic names (`data`/`result`/`item`/`temp`), no over-validation, no commented-out code, no `as any` / `@ts-ignore` without explicit justification
- **No real threshold-party security claims** — must always frame as "simulated committee topology" when describing the worker-based DKG

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision

- **Infrastructure exists**: YES — repo already has bun test (TypeScript), Rust cargo test, and Playwright usage patterns
- **Automated tests**: YES — tests-after for UI components; TDD for crypto port (correctness is paramount)
- **Frameworks**:
  - Rust crypto: `cargo test` in `examples/weft-web/crates/fhe-wasm/`
  - TypeScript unit: `vitest` (SvelteKit default)
  - Parity: custom harness running both `cargo test` fixtures and WASM via `wasm-bindgen-test` headless Chrome
  - E2E: Playwright with `@playwright/test`
- **TDD for crypto tasks**: RED (write parity fixture test) → GREEN (implement WASM binding) → REFACTOR

### QA Policy

Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **SvelteKit UI pages**: Playwright — navigate, interact, assert DOM, screenshot
- **Svelte components (isolated)**: Vitest + @testing-library/svelte — render, fire events, assert
- **WASM crypto**: `wasm-pack test --headless --chrome` + `cargo test` for native reference
- **Build artifacts**: Bash — run build, inspect `build/` output, verify bundle sizes with `gzip -9` piped through `wc -c`
- **Workers**: Playwright — trigger worker interactions, assert `postMessage` flows via `page.waitForEvent`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, can all run in parallel):
├── Task 1:  Feasibility spike: single encrypt+add+decrypt in WASM worker [deep] — GATE
├── Task 2:  SvelteKit scaffolding + Vite config + GH Pages base path [quick]
├── Task 3:  Repo structure + pnpm workspace + TypeScript config [quick]
├── Task 4:  Illustrated asset inventory + SVG token palette [visual-engineering]
├── Task 5:  Narrative content extraction from existing demos [writing]
├── Task 6:  CryptoEngine TypeScript interface (frozen contract) [artistry]
└── Task 7:  Native Rust fixture generator for parity tests [unspecified-high]

Wave 2 (After Wave 1 — build against frozen contract, MAX PARALLEL):
├── Task 8:  MockCryptoEngine implementation [quick]
├── Task 9:  Worker topology + message bus (Comlink or hand-rolled) [deep]
├── Task 10: AttackerPanel.svelte + ciphertext tile component [visual-engineering]
├── Task 11: ParametersModal.svelte + overflow invariant display [visual-engineering]
├── Task 12: ProgressiveDisclosure.svelte primitive (3-level toggle) [visual-engineering]
├── Task 13: PhaseShell.svelte layout + phase progress bar [visual-engineering]
├── Task 14: fhe.rs WASM port — strip rayon, target wasm32, wasm-bindgen core BFV [deep]
├── Task 15: trbfv WASM port — DKG + decryption_share + share combine bindings [deep]
└── Task 16: Illustrated asset implementation (hospitals, committee, locks) [visual-engineering]

Wave 3 (After Wave 2 — phase components + integration):
├── Task 17: MeetParticipants + DistributedKeygen phase components [visual-engineering]
├── Task 18: ShareDistribution + AggregatePublicKey phase components [visual-engineering]
├── Task 19: LocalTrainingEncryption + Encoding animation [visual-engineering]
├── Task 20: HomomorphicAggregation + ThresholdDecryption phase components [visual-engineering]
├── Task 21: GlobalModelUpdate + round-complete summary [visual-engineering]
├── Task 22: Sandbox.svelte + parameter controls + re-run harness [deep]
├── Task 23: Parity test harness: WASM vs native Rust fixtures [unspecified-high]
└── Task 24: WasmCryptoEngine wiring + worker integration [deep]

Wave 4 (After Wave 3 — polish + ship):
├── Task 25: Playwright E2E for full guided walkthrough [unspecified-high]
├── Task 26: Performance profiling + bundle-size enforcement [unspecified-high]
├── Task 27: GitHub Actions deploy workflow [quick]
├── Task 28: README + architecture docs + honest framing disclosure [writing]
└── Task 29: Accessibility pass (WCAG 2.2 AA for guided walkthrough) [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA — full walkthrough + sandbox on 3 browsers (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 (feasibility gate) → T6 (interface freeze) → T14 + T15 (WASM port) → T24 (real wiring) → T25 (E2E) → FINAL wave
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 9 (Wave 2)
```

### Dependency Matrix (abbreviated — executor should read each task's "Blocked By" field)

- **1**: — → gates everything; its outcome determines whether plan proceeds as-is or pivots to simulated-aggregate fallback
- **2, 3, 4, 5**: independent → can start concurrently with T1
- **6**: depends on T3 skeleton existing
- **7**: depends on T1 outcome (format of fixture bytes)
- **8**: depends on T6
- **9**: depends on T6
- **10–13**: depend on T2, T4
- **14, 15**: depend on T1, T6, T7
- **16**: depends on T4
- **17–21**: depend on T8 (mock) + T10–13 (primitives) + T16 (assets)
- **22**: depends on T17–21, T8
- **23**: depends on T7, T14, T15
- **24**: depends on T14, T15, T9, T23 (parity passing)
- **25**: depends on T24
- **26**: depends on T24
- **27**: depends on T2
- **28**: depends on all shipped surfaces (T24, T22)
- **29**: depends on T17–22
- **F1–F4**: depend on all 1–29

### Agent Dispatch Summary

- **Wave 1**: 7 tasks — T1 → `deep`, T2/T3 → `quick`, T4 → `visual-engineering`, T5 → `writing`, T6 → `artistry`, T7 → `unspecified-high`
- **Wave 2**: 9 tasks — T8 → `quick`, T9 → `deep`, T10–13 → `visual-engineering`, T14/T15 → `deep`, T16 → `visual-engineering`
- **Wave 3**: 8 tasks — T17–21 → `visual-engineering`, T22 → `deep`, T23 → `unspecified-high`, T24 → `deep`
- **Wave 4**: 5 tasks — T25/T26 → `unspecified-high`, T27 → `quick`, T28 → `writing`, T29 → `visual-engineering`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> Every task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> All new files live under `examples/weft-web/` unless explicitly noted.

- [x] 1. **Feasibility spike: single encrypt + add + decrypt in WASM worker** — GATE

  **What to do**:
  - Create throwaway `examples/weft-web/spikes/fhe-wasm-spike/` with minimal Cargo + wasm-pack setup
  - Vendor only the smallest subset of `gnosisguild/fhe.rs` required to: generate a BFV keypair at `SECURE_THRESHOLD_8192`, encrypt a 512-int vector, homomorphically add two ciphertexts, decrypt (no threshold — single-key for the spike)
  - Strip or `#[cfg]`-gate every `rayon` / `std::thread` / `SharedArrayBuffer` dependency
  - Compile to `wasm32-unknown-unknown`; run inside a dedicated Web Worker loaded from a minimal `index.html`
  - Measure: compile succeeds, wasm size (gzip), single-encrypt wall time, single-add wall time, single-decrypt wall time on reference hardware
  - Record findings in `examples/weft-web/spikes/fhe-wasm-spike/REPORT.md` with go/no-go verdict against budgets

  **Must NOT do**:
  - No threshold cryptography in the spike (deferred to T15)
  - No UI beyond a bare "click to run" button
  - No integration into the main SvelteKit app — this is sacrificial code

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: highest-risk gating task; needs deep codebase understanding of fhe.rs internals + WASM toolchain troubleshooting
  - **Skills**: none required by default (crypto/WASM work is in-scope for `deep`)

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 with Tasks 2, 3, 4, 5, 6, 7
  - **Blocks**: T7 (fixture format), T14 (full port), T15 (threshold port)
  - **Blocked By**: None

  **References**:
  - `gnosisguild/fhe.rs` GitHub (upstream) — identify `rayon` usage sites: `grep -rn "rayon::" fhe.rs/`
  - `secure-process/examples/threshold_demo.rs` — canonical params usage pattern for `BfvPreset::SecureThreshold8192`
  - `crates/fhe-params/src/lib.rs` in Interfold monorepo — confirm preset API before use
  - `@enclave-e3/wasm` npm package — reference for existing wasm-bindgen BFV shapes
  - Official wasm-bindgen book: `https://rustwasm.github.io/wasm-bindgen/` — target & build patterns

  **Acceptance Criteria**:
  - [ ] `wasm-pack build --target web` succeeds with `--release`
  - [ ] Resulting `.wasm` ≤ 8 MB gzip (or documented overrun with mitigation plan)
  - [ ] Spike HTML loads in Chrome stable without COOP/COEP headers
  - [ ] Click-to-run completes encrypt + add + decrypt; decrypted plaintext matches input within expected BFV noise
  - [ ] REPORT.md contains: build success flag, wasm size, timings, go/no-go verdict, list of rayon/thread sites stripped

  **QA Scenarios**:

  ```
  Scenario: Spike runs end-to-end in Chrome
    Tool: Playwright
    Preconditions: `wasm-pack build` has run; static server serves spike dir on localhost:8080
    Steps:
      1. page.goto("http://localhost:8080/spikes/fhe-wasm-spike/")
      2. page.click("button#run-spike")
      3. page.waitForSelector("#output:not(:empty)", { timeout: 60000 })
      4. assert page.textContent("#output") contains "decrypt-ok"
      5. assert page.textContent("#timings") matches /encrypt=\d+ms add=\d+ms decrypt=\d+ms/
    Expected Result: All three ops complete; decrypted bytes match input; timings logged
    Failure Indicators: console error mentioning "rayon", "thread", or "SharedArrayBuffer"; output contains "mismatch"
    Evidence: .sisyphus/evidence/task-1-spike-chrome.png (screenshot) + .sisyphus/evidence/task-1-spike-console.log

  Scenario: No COOP/COEP required
    Tool: Bash (curl + static server)
    Preconditions: spike built
    Steps:
      1. Launch static server with NO custom headers: `python3 -m http.server 8080 --directory examples/weft-web/spikes/fhe-wasm-spike/`
      2. curl -I http://localhost:8080/index.html | grep -i "cross-origin" || echo "no COOP/COEP headers"
      3. Repeat Chrome scenario above and confirm success
    Expected Result: Spike works without any cross-origin isolation headers
    Evidence: .sisyphus/evidence/task-1-no-coop-headers.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web): feasibility spike for fhe.rs WASM port`
  - Files: `examples/weft-web/spikes/fhe-wasm-spike/**`
  - Pre-commit: `wasm-pack build --release examples/weft-web/spikes/fhe-wasm-spike`

- [x] 2. **SvelteKit scaffolding + Vite config + GH Pages base path**

  **What to do**:
  - `pnpm create svelte@latest examples/weft-web` (Skeleton project, TypeScript, ESLint, Prettier, Vitest, Playwright)
  - Install `@sveltejs/adapter-static` and configure `svelte.config.js` with `adapter: adapter({ fallback: 'index.html', strict: true })`
  - Set `kit.paths.base` from `process.env.BASE_PATH` (default `/weft` for GH Pages, empty for local preview)
  - Configure Vite with `vite-plugin-wasm` + `vite-plugin-top-level-await` (required for wasm-bindgen ES modules)
  - Add `optimizeDeps.exclude: ['@weft/fhe-wasm']` placeholder
  - Create `app.html` with explicit `<meta>` tags for description + OpenGraph (scenario-neutral for now; T28 fills copy)
  - Add minimal root layout `src/routes/+layout.svelte` rendering a children slot
  - Add landing page `src/routes/+page.svelte` with placeholder hero
  - Verify `pnpm --filter weft-web dev` serves on port 5173 and `pnpm --filter weft-web build` produces `build/`

  **Must NOT do**:
  - No real content yet (landing page is a placeholder; T17+ fill content)
  - No component library (no Tailwind plugin tree, no UI kit) — use plain Svelte + CSS custom properties driven from T4 tokens

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: mechanical scaffolding, well-documented by SvelteKit CLI

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (all)
  - **Blocks**: T10–13, T17–22, T27
  - **Blocked By**: None

  **References**:
  - SvelteKit docs: `https://svelte.dev/docs/kit/adapter-static`
  - GH Pages base path guide: `https://svelte.dev/docs/kit/configuration#paths`
  - `vite-plugin-wasm` README on npm

  **Acceptance Criteria**:
  - [ ] `pnpm --filter weft-web build` exits 0 and populates `examples/weft-web/build/`
  - [ ] `build/index.html` contains `<base href="/weft/">` when `BASE_PATH=/weft`
  - [ ] Dev server runs without console errors
  - [ ] `svelte-check` passes

  **QA Scenarios**:

  ```
  Scenario: Build produces static artifacts with correct base path
    Tool: Bash
    Preconditions: T2 complete
    Steps:
      1. BASE_PATH=/weft pnpm --filter weft-web build
      2. grep -q 'href="/weft/' examples/weft-web/build/index.html
      3. ls examples/weft-web/build/_app/
    Expected Result: exit 0; base path baked in; `_app/` directory present with hashed asset files
    Evidence: .sisyphus/evidence/task-2-build-output.txt

  Scenario: Dev server reachable
    Tool: Playwright
    Preconditions: `pnpm --filter weft-web dev` running
    Steps:
      1. page.goto("http://localhost:5173/")
      2. assert page.title() contains "WEFT" (placeholder is fine)
      3. expect no console.error messages
    Expected Result: page loads; no console errors
    Evidence: .sisyphus/evidence/task-2-dev-server.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web): scaffold SvelteKit app with adapter-static and base-path config`
  - Files: `examples/weft-web/package.json`, `examples/weft-web/svelte.config.js`, `examples/weft-web/vite.config.ts`, `examples/weft-web/src/**`, `examples/weft-web/tsconfig.json`
  - Pre-commit: `pnpm --filter weft-web build && pnpm --filter weft-web check`

- [x] 3. **Repo structure + pnpm workspace + TypeScript config**

  **What to do**:
  - **CREATE** `pnpm-workspace.yaml` at repo root (does not currently exist — repo uses single `package.json` today). Declare `packages: [".", "examples/weft-web", "examples/weft-web/packages/*"]`.
  - **CREATE** root `Cargo.toml` at repo root as a cargo workspace (does not currently exist — `secure-process/Cargo.toml` is a standalone crate today). Members: `["secure-process", "examples/weft-web/crates/fhe-wasm"]`. Preserve `secure-process/Cargo.toml` as a workspace member (package manifest only, not workspace root).
  - Create `examples/weft-web/crates/fhe-wasm/` directory placeholder with `Cargo.toml` stub (populated by T14 with BFV bindings + T15 with threshold BFV bindings — single crate, two submodules)
  - Add npm workspace package `examples/weft-web/packages/fhe-wasm/` that will wrap the fhe-wasm wasm-pack output (single package exports both BFV + threshold bindings)
  - Root `package.json` scripts:
    - `"weft-web:dev": "pnpm --filter weft-web dev"`
    - `"weft-web:build": "pnpm --filter weft-web build"`
    - `"weft-web:test": "pnpm --filter weft-web test"`
    - `"weft-web:wasm:build": "wasm-pack build --release --target web examples/weft-web/crates/fhe-wasm --out-dir ../../packages/fhe-wasm/pkg"`
  - Shared TS config: `examples/weft-web/tsconfig.json` extends `.svelte-kit/tsconfig.json`, adds path alias `$lib/*`
  - `.gitignore` entries for `build/`, `.svelte-kit/`, `pkg/`, `target/`
  - Verify existing `secure-process/Cargo.toml` still builds under new workspace root (it must become a regular member manifest without `[workspace]` declaration of its own)

  **Must NOT do**:
  - No actual Rust source in T3 — scaffolding only
  - No published npm package — all workspace-internal
  - Do NOT create a separate `trbfv-wasm` crate — threshold code lives in `fhe-wasm/src/threshold/**` as a submodule (per T15 design)
  - Do NOT break `secure-process/` builds — `cargo test --manifest-path secure-process/Cargo.toml` must still pass (or migrate to `cargo test -p weft-secure-process` via workspace)

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: pure config wiring

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T14, T15, T24 (WasmCryptoEngine needs the wrapper package), T23 (parity harness imports the package)
  - **Blocked By**: None (can start concurrently with T2; merge order with T2 via git is fine)

  **References**:
  - Repo root `/home/dev/repo/package.json` (existing — read to preserve existing scripts)
  - Repo root `/home/dev/repo/pnpm-lock.yaml` (existing — verify compatible with new workspace)
  - `/home/dev/repo/secure-process/Cargo.toml` (existing — will become workspace member)
  - `/tmp/enclave/Cargo.toml` — reference for workspace Cargo.toml layout (Interfold monorepo clone)

  **Acceptance Criteria**:
  - [ ] `pnpm-workspace.yaml` created with 3 entries
  - [ ] Root `Cargo.toml` created with 2 workspace members (`secure-process`, `examples/weft-web/crates/fhe-wasm`)
  - [ ] Placeholder crate present: `examples/weft-web/crates/fhe-wasm/`
  - [ ] Placeholder npm package present: `examples/weft-web/packages/fhe-wasm/`
  - [ ] `pnpm install` at repo root completes without errors
  - [ ] `cargo metadata --format-version 1 | jq '.workspace_members[]' | grep fhe-wasm` returns a match
  - [ ] `cargo test --manifest-path secure-process/Cargo.toml` still passes (existing WEFT tests unaffected)
  - [ ] Root scripts run: `pnpm run weft-web:build` delegates correctly

  **QA Scenarios**:

  ```
  Scenario: Workspace recognizes new members and existing crate still builds
    Tool: Bash
    Preconditions: T3 complete
    Steps:
      1. pnpm install
      2. pnpm ls --filter weft-web --depth 0
      3. cargo metadata --format-version 1 | jq '.workspace_members | map(select(contains("fhe-wasm") or contains("secure-process")))'
      4. cargo test --manifest-path secure-process/Cargo.toml --lib
    Expected Result: 2 cargo members listed; weft-web npm workspace resolves; secure-process tests pass
    Failure Indicators: Missing workspace member; secure-process build/test regression
    Evidence: .sisyphus/evidence/task-3-workspace-layout.txt
  ```

  **Commit**: YES
  - Message: `chore(weft-web): introduce pnpm + cargo workspaces for svelte app and wasm crate`
  - Files: `pnpm-workspace.yaml` (new), `Cargo.toml` (new, at repo root), `package.json`, `examples/weft-web/crates/fhe-wasm/Cargo.toml`, `examples/weft-web/packages/fhe-wasm/package.json`, `.gitignore`
  - Pre-commit: `pnpm install && cargo metadata > /dev/null && cargo test --manifest-path secure-process/Cargo.toml --lib`

- [x] 4. **Illustrated asset inventory + SVG token palette**

  **What to do**:
  - Design system source of truth: `examples/weft-web/src/lib/tokens.css` with CSS custom properties
    - Color palette: primary (warm teal), secondary (coral), neutral scale (9 steps), semantic (success/warning/danger/info), phase accent (8 distinct hues for phase progress indicator)
    - Typography: display, heading, body, mono; size scale (xs…4xl); line-height scale
    - Spacing: 4px base grid; radius scale; shadow scale
    - Motion: duration tokens (fast/base/slow); easing tokens
  - Asset inventory doc `examples/weft-web/src/lib/assets/INVENTORY.md` listing every illustration to be produced by T16:
    - 3 hospital exterior illustrations (St. Mercy General, Eastside Medical, Pacific University)
    - 5 committee member avatars (distinct, inclusive, cartoon style)
    - Lock (closed/open), key, ciphertext-tile, gradient-vector-tile, share-shard, aggregated-ciphertext, global-model cloud
    - 8 phase-specific hero illustrations
  - Pick one font pairing (e.g., Inter + JetBrains Mono) and vendor via CSS `@font-face` self-hosted subset (no external requests for GH Pages)
  - Produce a stub Storybook-style `examples/weft-web/src/routes/_dev/palette/+page.svelte` displaying every token (gated behind dev-only route — can be removed before deploy)

  **Must NOT do**:
  - No actual illustration SVGs yet — those are T16. This task produces the *palette and inventory only*.
  - No external CDN fonts or icons

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: design-system design
  - **Skills**: [`frontend-ui-ux`] — design-system + illustration direction overlap

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T10–13, T16, T17–21, T29
  - **Blocked By**: None

  **References**:
  - `scripts/run-round.ts` — current narrative colors/metaphors (emoji-based 🏥 currently)
  - ncase.me (external reference for playful illustrated style) — aesthetic only, no copying
  - Existing demo README hospital descriptions

  **Acceptance Criteria**:
  - [ ] `tokens.css` loads and is consumed by `+layout.svelte` (verified by visiting palette route)
  - [ ] Palette page renders all tokens visually
  - [ ] INVENTORY.md lists ≥ 20 assets with size + purpose + which phase(s) use it
  - [ ] All fonts self-hosted; no network calls to fonts.googleapis.com etc.

  **QA Scenarios**:

  ```
  Scenario: Palette route renders every token
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. page.goto("http://localhost:5173/_dev/palette")
      2. assert page.$$eval(".token-swatch", els => els.length) >= 30
      3. screenshot full page
    Expected Result: All tokens visible with labels; no missing-font flashes (FOUT)
    Evidence: .sisyphus/evidence/task-4-palette.png

  Scenario: No external font requests
    Tool: Playwright
    Preconditions: dev server running
    Steps:
      1. page.route("**/*", route => { if (/fonts\.(googleapis|gstatic)/.test(route.request().url())) throw new Error("external font request"); route.continue(); })
      2. page.goto("http://localhost:5173/")
      3. wait 2s, assert no error thrown
    Expected Result: zero external font requests
    Evidence: .sisyphus/evidence/task-4-no-external-fonts.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): design tokens and illustrated asset inventory`
  - Files: `examples/weft-web/src/lib/tokens.css`, `examples/weft-web/src/lib/assets/INVENTORY.md`, `examples/weft-web/src/lib/assets/fonts/**`, `examples/weft-web/src/routes/_dev/palette/+page.svelte`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 5. **Narrative content extraction from existing demos**

  **What to do**:
  - Extract all user-facing narrative from `scripts/run-round.ts` and `secure-process/examples/threshold_demo.rs` into structured TypeScript content modules:
    - `examples/weft-web/src/lib/content/hospitals.ts`: hospital metadata (name, location, patient count, specialty, avatar key) — verbatim: St. Mercy General (12,400 patients), Eastside Medical (8,200), Pacific University (22,000)
    - `examples/weft-web/src/lib/content/phases.ts`: per-phase content at 3 depth levels:
      ```ts
      export type PhaseId = 'meet' | 'dkg' | 'shares' | 'aggregate-pk' | 'train-encrypt' | 'homomorphic-add' | 'threshold-decrypt' | 'update-model'
      export type DepthLevel = 'novice' | 'learn-more' | 'show-math'
      export interface PhaseContent { id: PhaseId; title: string; tagline: string; body: Record<DepthLevel, string>; equations?: string[]; ... }
      ```
    - `examples/weft-web/src/lib/content/parameters.ts`: human-readable descriptions of t, degree, S, λ, threshold with tooltips
    - `examples/weft-web/src/lib/content/attacker.ts`: copy for attacker panel (what they see, what they can't see)
  - For each phase, write 3 tiers:
    - **novice**: 1-2 sentences, plain English, metaphor-friendly
    - **learn-more**: 1 paragraph, introduces crypto terms (ciphertext, public key, threshold)
    - **show-math**: 2-3 paragraphs + LaTeX equations rendered via KaTeX
  - Install KaTeX as a dependency for math rendering; pre-render at build time where possible

  **Must NOT do**:
  - No changes to `scripts/run-round.ts` or `secure-process/examples/threshold_demo.rs` (source-only reads)
  - No new hospital names or scenarios

  **Recommended Agent Profile**:
  - **Category**: `writing` — Reason: content + copywriting
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T17–21 (phase components consume this), T22 (sandbox tooltips)
  - **Blocked By**: None

  **References**:
  - `scripts/run-round.ts` — hospital names + numbers + phase banners (verbatim source)
  - `secure-process/examples/threshold_demo.rs` — 8-phase structure + crypto explanation comments
  - `README.md` — existing overview copy
  - KaTeX docs: `https://katex.org/docs/api.html`

  **Acceptance Criteria**:
  - [ ] Every `PhaseId` has all 3 depth levels populated with non-empty strings
  - [ ] Hospital numbers match existing demos exactly (string comparison test)
  - [ ] At least 4 phases include at least 1 LaTeX equation
  - [ ] A Vitest snapshot test locks the hospital content

  **QA Scenarios**:

  ```
  Scenario: Content modules export all required phases
    Tool: Vitest
    Preconditions: T5 complete
    Steps:
      1. Run `vitest run src/lib/content/__tests__/phases.test.ts`
      2. Assert imported `PHASES` contains keys: meet, dkg, shares, aggregate-pk, train-encrypt, homomorphic-add, threshold-decrypt, update-model
      3. For each phase, assert all 3 depth levels are non-empty
    Expected Result: 8 phases × 3 levels = 24 non-empty strings
    Evidence: .sisyphus/evidence/task-5-content-test.txt

  Scenario: Hospital numbers match source of truth
    Tool: Vitest
    Preconditions: T5 complete
    Steps:
      1. Import HOSPITALS from content module
      2. Assert HOSPITALS[0] = { name: "St. Mercy General", patientCount: 12400, ... }
      3. Assert HOSPITALS[1].patientCount === 8200
      4. Assert HOSPITALS[2].patientCount === 22000
    Expected Result: exact match
    Evidence: .sisyphus/evidence/task-5-hospitals-test.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-content): extract phase and hospital narrative with 3-level disclosure`
  - Files: `examples/weft-web/src/lib/content/**`, `examples/weft-web/src/lib/content/__tests__/**`, `examples/weft-web/package.json` (katex dep)
  - Pre-commit: `pnpm --filter weft-web test:unit src/lib/content`

- [x] 6. **CryptoEngine TypeScript interface (frozen contract)**

  **What to do**:
  - Define `examples/weft-web/src/lib/crypto/engine.ts`:
    ```ts
    export interface BfvParams {
      readonly presetId: 'SECURE_THRESHOLD_8192'
      readonly plaintextModulus: bigint   // t
      readonly polyDegree: number         // N
      readonly threshold: number          // 3
      readonly committeeSize: number      // 5
    }
    export interface PublicKeyBytes { readonly bytes: Uint8Array }
    export interface CiphertextBytes { readonly bytes: Uint8Array }
    export interface DecryptionShareBytes { readonly bytes: Uint8Array; readonly partyIndex: number }
    export interface SecretShareBytes { readonly bytes: Uint8Array; readonly partyIndex: number }

    export interface DkgTranscript {
      readonly publicKey: PublicKeyBytes
      readonly perPartyShares: readonly SecretShareBytes[]
      readonly contributions: readonly Uint8Array[]   // redacted-safe for attacker panel
    }

    export interface CryptoEngine {
      getParams(): BfvParams
      runDkg(committeeSize: number, threshold: number): Promise<DkgTranscript>
      encryptVector(publicKey: PublicKeyBytes, plaintext: Int32Array): Promise<CiphertextBytes>
      aggregateCiphertexts(ciphertexts: readonly CiphertextBytes[]): Promise<CiphertextBytes>
      partialDecrypt(share: SecretShareBytes, ciphertext: CiphertextBytes): Promise<DecryptionShareBytes>
      combineDecryptionShares(shares: readonly DecryptionShareBytes[], ciphertext: CiphertextBytes): Promise<Int32Array>
    }
    ```
  - Add `TelemetryEvent` union type for the attacker panel + progress UI (encrypt-start, encrypt-done, aggregate-start, etc.) with timestamps + redacted ciphertext previews (`bytes.slice(0, 16)` + hex)
  - Add overflow invariant helper: `assertOverflowInvariant(params: BfvParams, maxClients: number, maxGradInt: number): void` — throws if `BigInt(maxClients) * BigInt(maxGradInt) >= params.plaintextModulus / 2n`. `maxGradInt = scaleFactor × maxGradAbs` is pre-computed by the caller (see `client/src/constants.ts`: `MAX_GRAD_INT = SCALE_FACTOR * MAX_GRAD_ABS`). Invariant: `n × maxGradInt < t/2`.
  - Add documentation comments citing AGENTS.md sections
  - Export from `src/lib/crypto/index.ts` barrel

  **Must NOT do**:
  - No implementations yet (those are T8 mock + T24 wasm)
  - No concrete parameter values hardcoded — params only flow in from engine impl

  **Recommended Agent Profile**:
  - **Category**: `artistry` — Reason: interface-contract design needs careful API shape thinking that affects multiple downstream tracks

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T9, T14, T15, T24
  - **Blocked By**: T3 (needs workspace structure)

  **References**:
  - `secure-process/examples/threshold_demo.rs` — canonical op list (DKG, encrypt, aggregate, partial-decrypt, combine)
  - `@enclave-e3/sdk/crypto` — existing TS types for BFV (reference shape only)
  - AGENTS.md §Known Constraints — "No 1/n division in encrypted domain"; interface must not offer such a method

  **Acceptance Criteria**:
  - [ ] `pnpm --filter weft-web check` passes (svelte-check + tsc)
  - [ ] No `any` types in engine.ts
  - [ ] All methods return `Promise<...>` (worker-ready)
  - [ ] `assertOverflowInvariant` has vitest unit test covering boundary, over, under cases

  **QA Scenarios**:

  ```
  Scenario: Overflow invariant asserts correctly
    Tool: Vitest
    Preconditions: T6 complete
    Notes: Signature is `assertOverflowInvariant(params, n, maxGradInt)` matching the implementation section above. `maxGradInt = SCALE_FACTOR × MAX_GRAD_ABS` (pre-computed by caller; from `client/src/constants.ts`). Invariant: `n × maxGradInt < plaintextModulus / 2`. For all test cases below, `params` is constructed as a stub `{ plaintextModulus: 131072n }` (t=131072 is the demo assumption per AGENTS.md §"BFV Parameter Specification" and README.md — production code re-reads this from the active preset). t/2 = 65536.
    Steps:
      1. Call `assertOverflowInvariant({ plaintextModulus: 131072n }, 10, 4096)` → 10 × 4096 = 40960 < 65536 → MUST NOT throw
      2. Call `assertOverflowInvariant({ plaintextModulus: 131072n }, 20, 4096)` → 20 × 4096 = 81920 > 65536 → MUST throw with error message containing "overflow"
      3. Boundary: Call `assertOverflowInvariant({ plaintextModulus: 131072n }, 16, 4096)` → 16 × 4096 = 65536 NOT strictly < 65536 → MUST throw
      4. Small: Call `assertOverflowInvariant({ plaintextModulus: 131072n }, 2, 4096)` → 2 × 4096 = 8192 < 65536 → MUST NOT throw
      5. Edge: Call `assertOverflowInvariant({ plaintextModulus: 131072n }, 15, 4096)` → 15 × 4096 = 61440 < 65536 → MUST NOT throw (matches README.md "supports up to 15 clients")
    Expected Result: throws exactly when invariant violated (cases 2 and 3); does not throw otherwise (cases 1, 4, 5)
    Evidence: .sisyphus/evidence/task-6-overflow-invariant.txt

  Scenario: Interface compiles with no any
    Tool: Bash
    Preconditions: T6 complete
    Steps:
      1. Run `pnpm --filter weft-web check --fail-on-warnings`
      2. grep -r "any" examples/weft-web/src/lib/crypto/engine.ts | grep -v "^\s*\*" | grep -v "// " # permit in comments only
    Expected Result: check passes; grep finds no code-level `any`
    Evidence: .sisyphus/evidence/task-6-type-check.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-crypto): freeze CryptoEngine interface contract`
  - Files: `examples/weft-web/src/lib/crypto/engine.ts`, `examples/weft-web/src/lib/crypto/index.ts`, `examples/weft-web/src/lib/crypto/__tests__/overflow.test.ts`
  - Pre-commit: `pnpm --filter weft-web check && pnpm --filter weft-web test:unit src/lib/crypto`

- [x] 7. **Native Rust fixture generator for parity tests**

  **What to do**:
  - Create `examples/weft-web/crates/fhe-wasm/fixtures/` containing a binary `fixture-gen` (separate `[[bin]]` target) that:
    - Uses the same `BfvPreset::SecureThreshold8192` path the WASM crate will use
    - Seeds RNG deterministically (e.g., `ChaCha20Rng::from_seed([42u8; 32])`)
    - Generates ≥ 20 fixture vectors covering:
      - single ciphertext encrypt + immediate decrypt (key-only, no threshold)
      - encrypt+add for N=2, 3, 5, 10 clients with various gradients
      - threshold DKG + encrypt + partial decrypts + combine for 3-of-5
      - negative gradient round-trip
      - zero-gradient round-trip
      - chunk-boundary vector (length at 8192 and 8193)
    - Serializes each fixture to JSON + binary blob under `fixtures/cases/<case-id>.json` and `fixtures/cases/<case-id>.bin`
    - **Canonical case-id naming** (lowercase, hyphen-separated, stable across regenerations — downstream tasks reference these exact names):
      - `single-encrypt-decrypt` — key-only encrypt + decrypt, no threshold
      - `sum-n2`, `sum-n3`, `sum-n5`, `sum-n10` — encrypt+add for N clients
      - `threshold-3-of-5` — full DKG + encrypt + partial decrypts + combine
      - `threshold-3-of-5-negative` — threshold with negative gradients
      - `threshold-3-of-5-zero` — threshold with zero gradients
      - `chunk-boundary-8192`, `chunk-boundary-8193` — ring-dimension boundary vectors
      - Additional cases as needed to reach ≥20, prefixed `case-NN-<descriptor>` (e.g. `case-11-mixed-signs`)
    - JSON schema: `{ id, seed, params, inputs: { plaintextCoeffs, ... }, expected: { ciphertextHash, combinedPlaintext, ... }, format: "v1" }`
    - Binary blobs contain raw ciphertext/share bytes (large — Git LFS if > 5 MB total)
  - Add `cargo xtask gen-fixtures` via `cargo-make` OR simple `cargo run --release --bin fixture-gen`
  - CI script to regenerate and diff: `scripts/check-fixtures-up-to-date.sh`

  **Must NOT do**:
  - No non-deterministic fixture generation
  - No dependency on WASM-specific code in the fixture generator (it's native Rust only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Reason: correctness-critical, needs careful seed + byte-format discipline

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1 — can start now; finalizes after T1 confirms exact fhe.rs commit SHA to pin)
  - **Parallel Group**: Wave 1
  - **Blocks**: T14, T15, T23
  - **Blocked By**: T1 (needs the locked-down fhe.rs commit SHA from spike), T3 (workspace)

  **References**:
  - `secure-process/tests/integration.rs` — existing fixture patterns
  - `secure-process/examples/threshold_demo.rs` — threshold API usage
  - `rand_chacha` crate — already in Interfold deps (check before adding)

  **Acceptance Criteria**:
  - [ ] `cargo run --release --bin fixture-gen` produces deterministic output (two runs produce identical bytes)
  - [ ] At least 20 fixture cases present in `fixtures/cases/`
  - [ ] JSON schema documented in `fixtures/README.md`
  - [ ] Diff script exits 0 on freshly regenerated fixtures, non-zero if any drift

  **QA Scenarios**:

  ```
  Scenario: Fixtures are deterministic
    Tool: Bash
    Preconditions: T7 complete
    Steps:
      1. cargo run --release -p fhe-wasm --bin fixture-gen -- --out /tmp/fx1
      2. cargo run --release -p fhe-wasm --bin fixture-gen -- --out /tmp/fx2
      3. diff -r /tmp/fx1 /tmp/fx2
    Expected Result: diff exits 0
    Evidence: .sisyphus/evidence/task-7-fixtures-deterministic.txt

  Scenario: Fixtures cover required cases
    Tool: Bash
    Preconditions: fixtures generated
    Steps:
      1. ls examples/weft-web/crates/fhe-wasm/fixtures/cases/*.json | wc -l
      2. jq -r '.id' examples/weft-web/crates/fhe-wasm/fixtures/cases/*.json | sort -u
    Expected Result: ≥ 20 files; the canonical case-id set defined in the "What to do" section MUST all be present: `single-encrypt-decrypt`, `sum-n2`, `sum-n3`, `sum-n5`, `sum-n10`, `threshold-3-of-5`, `threshold-3-of-5-negative`, `threshold-3-of-5-zero`, `chunk-boundary-8192`, `chunk-boundary-8193`. Assert each string appears in the sorted output; remaining ≥10 cases use the `case-NN-<descriptor>` fillers.
    Evidence: .sisyphus/evidence/task-7-fixture-coverage.txt
  ```

  **Commit**: YES
  - Message: `test(fhe-wasm): native Rust fixture generator for WASM parity`
  - Files: `examples/weft-web/crates/fhe-wasm/src/bin/fixture-gen.rs`, `examples/weft-web/crates/fhe-wasm/fixtures/**`, `examples/weft-web/crates/fhe-wasm/fixtures/README.md`, `scripts/check-fixtures-up-to-date.sh`
  - Pre-commit: `cargo run --release -p fhe-wasm --bin fixture-gen && scripts/check-fixtures-up-to-date.sh`

- [x] 8. **MockCryptoEngine implementation**

  **What to do**:
  - Implement `examples/weft-web/src/lib/crypto/mock.ts` conforming to `CryptoEngine`:
    - Deterministic pseudo-crypto: public key is a 32-byte seed; "ciphertext" is `{ seed, plaintextInts, nonce }` serialized to bytes
    - `runDkg` returns deterministic 5 shares (just indices 1..5 with derived seeds)
    - `encryptVector` produces a "ciphertext" that pretends to be opaque but is trivially unlockable by the mock partial-decrypt
    - `aggregateCiphertexts` element-wise sums the encoded plaintexts (modulo t)
    - `combineDecryptionShares` verifies we have ≥ threshold shares, then returns the element-wise sum as Int32Array
    - All methods resolve with a simulated delay (configurable, default 50-200ms) so UI animations get realistic pacing in mock mode
    - All methods emit `TelemetryEvent`s via a pluggable emitter so the attacker panel shows real traffic
  - Add unit tests: encrypt → aggregate → decrypt round-trip matches hand-computed sum

  **Must NOT do**:
  - No use of any real crypto library — this is a deterministic mock for UI development
  - No claims of security — docstring must say "UI dev only; not cryptographically meaningful"

  **Recommended Agent Profile**:
  - **Category**: `quick` — Reason: straightforward implementation against frozen contract

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17–22 (phase components wire against mock first)
  - **Blocked By**: T6

  **References**:
  - `examples/weft-web/src/lib/crypto/engine.ts` — interface to implement
  - `scripts/run-round.ts` — mock arithmetic semantics (plaintext int sum then /n/S)

  **Acceptance Criteria**:
  - [ ] `encrypt → aggregate → decrypt` round-trip matches hand-computed sum for 3 clients
  - [ ] Negative gradients round-trip through mock (two's complement mod t)
  - [ ] Telemetry emits events for every operation
  - [ ] Deterministic: same seed ⇒ same bytes

  **QA Scenarios**:

  ```
  Scenario: Round-trip correctness on 3 clients
    Tool: Vitest
    Preconditions: T8 complete
    Steps:
      1. Create MockCryptoEngine; runDkg(5, 3) → transcript
      2. encryptVector(pk, [100, -200, 300]) for each of 3 clients with different vectors
      3. aggregateCiphertexts(cts) → aggregated
      4. For 3 of 5 shares: partialDecrypt(share, aggregated)
      5. combineDecryptionShares(3 shares, aggregated) → Int32Array
      6. Assert element-wise equals hand-computed sum with negative wrap
    Expected Result: exact match
    Evidence: .sisyphus/evidence/task-8-mock-roundtrip.txt

  Scenario: Telemetry emitted
    Tool: Vitest
    Preconditions: T8 complete
    Steps:
      1. Attach emitter; run full round
      2. Assert events include: dkg-start, dkg-done, encrypt-start×3, encrypt-done×3, aggregate-start, aggregate-done, partial-decrypt×3, combine-done
    Expected Result: all 13+ events captured
    Evidence: .sisyphus/evidence/task-8-telemetry.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-crypto): MockCryptoEngine for UI development`
  - Files: `examples/weft-web/src/lib/crypto/mock.ts`, `examples/weft-web/src/lib/crypto/__tests__/mock.test.ts`
  - Pre-commit: `pnpm --filter weft-web test:unit src/lib/crypto/__tests__/mock.test.ts`

- [x] 9. **Worker topology + message bus**

  **What to do**:
  - Design worker mesh:
    - 1 orchestrator (main thread) — drives UI, owns phase state machine
    - 5 committee workers (`src/lib/workers/committee.worker.ts`) — each simulates a ciphernode (owns one secret share)
    - 3 hospital workers (`src/lib/workers/hospital.worker.ts`) — each encrypts that hospital's gradient
    - 1 aggregator worker (`src/lib/workers/aggregator.worker.ts`) — performs homomorphic sum
  - Message bus: use **Comlink** (MIT, small, wasm-friendly, mature) for RPC
  - Define message types `src/lib/workers/messages.ts` as discriminated unions for:
    - orchestrator → committee: `DkgRequest`, `PartialDecryptRequest`, `CombineRequest`
    - committee → orchestrator: `DkgContribution`, `PartialDecryptResponse`
    - orchestrator → hospital: `EncryptRequest`
    - hospital → orchestrator: `EncryptResponse`
    - orchestrator → aggregator: `AggregateRequest`
    - aggregator → orchestrator: `AggregateResponse`
  - Zero-copy where possible: transfer `ArrayBuffer` (not `Uint8Array` which copies)
  - Each worker hosts a `CryptoEngine` instance internally (mock in dev, wasm in prod — swap via dep injection)
  - Add lifecycle: `spawnWorkers()`, `terminateWorkers()`, `workerRegistry`
  - Add event bridging: worker telemetry flows back to orchestrator for the attacker panel

  **Must NOT do**:
  - No `SharedArrayBuffer` — all messages via `postMessage` + transferables only
  - No global singleton workers — lifecycle must be driven by phase state machine

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: concurrency + serialization + type-safe RPC design is tricky

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T24 (wiring step), T22 (sandbox needs teardown/re-spawn)
  - **Blocked By**: T6

  **References**:
  - Comlink README + examples
  - Vite worker docs: `https://vite.dev/guide/features.html#web-workers`
  - `secure-process/examples/threshold_demo.rs` — reference for committee + hospital role separation

  **Acceptance Criteria**:
  - [ ] Spawning 5+3+1 workers works in Chrome
  - [ ] RPC round-trip < 10ms on empty payload
  - [ ] All workers terminate cleanly on page hide/unload
  - [ ] No `postMessage` copies for >1 KB payloads (verified by transferable usage)

  **QA Scenarios**:

  ```
  Scenario: Spawn + RPC ping-pong round-trip
    Tool: Playwright
    Preconditions: dev server running, worker mesh registered at /dev/workers test route
    Steps:
      1. page.goto("http://localhost:5173/_dev/workers")
      2. page.click("button#spawn")
      3. page.waitForFunction(() => window.__worker_count === 9)
      4. page.click("button#ping-all")
      5. page.waitForSelector("#results li:nth-child(9)")
      6. assert each <li> ends with "ok<10ms"
    Expected Result: all 9 workers respond < 10ms
    Evidence: .sisyphus/evidence/task-9-workers-rpc.png

  Scenario: Workers terminate on unload
    Tool: Playwright
    Preconditions: workers spawned
    Steps:
      1. const beforeWorkers = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('worker')).length)
      2. page.goto("about:blank")
      3. Wait 500ms
      4. Check via chrome devtools protocol that worker targets = 0
    Expected Result: all workers gone after navigation
    Evidence: .sisyphus/evidence/task-9-workers-cleanup.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web): worker topology with Comlink RPC message bus`
  - Files: `examples/weft-web/src/lib/workers/**`, `examples/weft-web/src/routes/_dev/workers/+page.svelte`
  - Pre-commit: `pnpm --filter weft-web check && pnpm --filter weft-web test:unit src/lib/workers`

- [x] 10. **AttackerPanel.svelte + ciphertext tile component**

  **What to do**:
  - Component: `examples/weft-web/src/lib/components/AttackerPanel.svelte`
    - Always-visible collapsible side panel (desktop) or bottom sheet (narrow viewports)
    - Subscribes to telemetry event stream from the crypto engine
    - Renders each event as a log entry with timestamp, from→to, operation, and a truncated hex preview of payload (first 16 bytes of ciphertext)
    - Payload is opened-by-default-collapsed; expanding shows more hex (never the plaintext)
    - Footer shows a defiant "What the attacker sees: only this" message with cartoon sneaky-attacker illustration placeholder (T16 fills)
  - Ciphertext tile: `examples/weft-web/src/lib/components/CiphertextTile.svelte`
    - Small card (~200px) showing: 6-char hex ID, byte-count, a "noise pattern" visual using a deterministic hash-to-pattern mapping
    - Variants: pending / in-flight / arrived / aggregated
    - Animated arrival (ease-out scale + fade)
  - Both components pull all strings from `content/attacker.ts` (T5)

  **Must NOT do**:
  - NEVER show any plaintext integer or gradient value in AttackerPanel — test explicitly that plaintext numbers do not appear in rendered HTML
  - No real-time updates dropping below 30fps on reference hardware

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: Svelte components + animation + accessibility
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17–22 (walkthrough phases embed AttackerPanel; they only import it)
  - **Blocked By**: T2, T4, T5

  **References**:
  - `scripts/run-round.ts` — attacker narrative copy
  - `content/attacker.ts` from T5
  - `content/phases.ts` for telemetry-event labels

  **Acceptance Criteria**:
  - [ ] Component-test (testing-library/svelte): renders ≥ 10 events without overflow
  - [ ] No raw plaintext numbers present in DOM (assert via regex over `innerHTML`)
  - [ ] Keyboard-accessible (Tab to focus, Enter to expand)
  - [ ] aria-live=polite on the event list

  **QA Scenarios**:

  ```
  Scenario: AttackerPanel never reveals plaintext
    Tool: Playwright
    Preconditions: MockCryptoEngine available
    Steps:
      1. page.goto("http://localhost:5173/_dev/attacker-panel")
      2. Trigger 20 simulated events covering all phases
      3. Capture page.innerHTML of panel
      4. Assert no match for plaintext values 12400, 8200, 22000 (hospital numbers) or any 4-digit patient count
    Expected Result: zero matches
    Evidence: .sisyphus/evidence/task-10-attacker-no-plaintext.html

  Scenario: Ciphertext tile animates on arrival
    Tool: Playwright
    Preconditions: same
    Steps:
      1. page.goto("http://localhost:5173/_dev/ciphertext-tile")
      2. page.click("#arrive")
      3. Screenshot at 0ms, 200ms, 500ms
      4. Compare — scale+opacity must differ
    Expected Result: animation visible
    Evidence: .sisyphus/evidence/task-10-tile-{0,200,500}.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): AttackerPanel and CiphertextTile with telemetry subscription`
  - Files: `examples/weft-web/src/lib/components/AttackerPanel.svelte`, `examples/weft-web/src/lib/components/CiphertextTile.svelte`, `examples/weft-web/src/lib/components/__tests__/**`, `examples/weft-web/src/routes/_dev/**`
  - Pre-commit: `pnpm --filter weft-web test:unit src/lib/components`

- [x] 11. **ParametersModal.svelte + overflow invariant display**

  **What to do**:
  - Modal component `examples/weft-web/src/lib/components/ParametersModal.svelte`:
    - Trigger: "ℹ︎ Parameters" button in top nav
    - Displays: preset name (SECURE_THRESHOLD_8192), `t` (read from engine at runtime), polynomial degree N=8192, scale factor S=4096, max clients G_int=4096, threshold 3-of-5, security level λ=128 PQ equivalent
    - Overflow invariant widget: shows `n_max × S × G_int = actual` vs `t/2 = limit`; green check if holds, red warning if violated (user-slidable `n_max` to show the limit in sandbox mode)
    - Progressive disclosure tie-in: show-math level reveals BFV encryption formula c = (a·s + e + Δ·m, -a) etc.
    - Pulls `t` from `engine.getParams()` — AGENTS.md §BFV Parameter Specification explicitly forbids hardcoding
  - Accessible: trap focus when open, Escape closes, `role="dialog"` + `aria-modal="true"` + labelled title

  **Must NOT do**:
  - No hardcoded `131072` literal in JSX — read from engine params
  - No modal framework dependency — hand-roll with Svelte transitions

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T22 (sandbox uses sliders from this modal), T17–21 (link to open from any phase)
  - **Blocked By**: T2, T4, T5, T6

  **References**:
  - `content/parameters.ts` from T5
  - `engine.ts` from T6
  - AGENTS.md §BFV Parameter Specification

  **Acceptance Criteria**:
  - [ ] Modal opens + closes + traps focus
  - [ ] Overflow invariant updates reactively when n_max changes
  - [ ] No `131072` literal in the component source (verified by grep)
  - [ ] `pnpm --filter weft-web test:unit src/lib/components/__tests__/parameters-modal.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Modal shows correct params and invariant
    Tool: Playwright
    Preconditions: dev server, mock engine wired
    Steps:
      1. page.goto("http://localhost:5173/")
      2. page.click("button:has-text('Parameters')")
      3. assert page.isVisible("[role='dialog']")
      4. assert page.textContent("[data-testid='plaintext-modulus']") contains "131,072"
      5. page.fill("input#n-max", "20"); assert invariant shows red state
      6. page.keyboard.press("Escape"); assert modal closed
    Expected Result: all assertions pass
    Evidence: .sisyphus/evidence/task-11-parameters-modal.png

  Scenario: No hardcoded constants
    Tool: Bash
    Preconditions: T11 complete
    Steps:
      1. grep -Rn "131072" examples/weft-web/src/lib/components/ParametersModal.svelte || echo "clean"
    Expected Result: output is "clean"
    Evidence: .sisyphus/evidence/task-11-no-hardcoded.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): ParametersModal with runtime overflow invariant display`
  - Files: `examples/weft-web/src/lib/components/ParametersModal.svelte`, `examples/weft-web/src/lib/components/__tests__/parameters-modal.test.ts`
  - Pre-commit: `pnpm --filter weft-web check && pnpm --filter weft-web test:unit`

- [x] 12. **ProgressiveDisclosure.svelte primitive (3-level toggle)**

  **What to do**:
  - Primitive component `examples/weft-web/src/lib/components/ProgressiveDisclosure.svelte` with slots:
    - Named slots `novice`, `learn-more`, `show-math`
    - Prop `level: DepthLevel` (bindable, syncs with URL hash `#depth=novice|learn-more|show-math`)
    - Prop `sticky: boolean` — sticks depth choice across phases via `localStorage`
    - Renders level selector as 3-way pill toggle with keyboard arrow-key navigation
    - Animates content swap with crossfade (200ms)
  - Expose context `setDepthContext` / `getDepthContext` so nested components (equations, callouts) can react to depth without prop drilling

  **Must NOT do**:
  - No dependency on JS-only markdown rendering at runtime — content is pre-rendered Svelte

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17–21, T22
  - **Blocked By**: T2, T4

  **References**:
  - `content/phases.ts` from T5 (consumer of levels)
  - Svelte context API docs

  **Acceptance Criteria**:
  - [ ] Toggling level swaps content with crossfade
  - [ ] Keyboard arrows cycle levels
  - [ ] URL hash syncs with selected level
  - [ ] localStorage persistence works with `sticky=true`

  **QA Scenarios**:

  ```
  Scenario: Level switching persists across navigation
    Tool: Playwright
    Preconditions: dev server
    Steps:
      1. page.goto("http://localhost:5173/_dev/disclosure")
      2. page.click("button[data-level='show-math']")
      3. assert page.url() contains "#depth=show-math"
      4. page.reload()
      5. assert [data-level='show-math'] still has aria-pressed="true"
    Expected Result: level persisted across reload
    Evidence: .sisyphus/evidence/task-12-disclosure-persist.png

  Scenario: Keyboard navigation
    Tool: Playwright
    Steps:
      1. focus pill toggle, press ArrowRight twice
      2. assert show-math selected
    Evidence: .sisyphus/evidence/task-12-disclosure-kbd.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): ProgressiveDisclosure primitive with 3-level content toggle`
  - Files: `examples/weft-web/src/lib/components/ProgressiveDisclosure.svelte`, test file, dev route
  - Pre-commit: `pnpm --filter weft-web test:unit`

- [x] 13. **PhaseShell.svelte layout + phase progress bar**

  **What to do**:
  - `examples/weft-web/src/lib/components/PhaseShell.svelte`:
    - Standard layout used by every phase: phase-accent-colored header with icon+title+phase index, body slot, footer nav (prev/next, `Enter` → next, `Escape` → pause)
    - Integrates `ProgressiveDisclosure` around the body slot
    - Shows `AttackerPanel` docked (collapsible)
  - `examples/weft-web/src/lib/components/PhaseProgress.svelte`:
    - Horizontal 8-step indicator (one dot per phase) with accent colors from tokens
    - Clickable to jump to completed phases; disabled for locked phases
  - Phase state store `examples/weft-web/src/lib/stores/phase.ts`:
    - Svelte store of `{ currentPhase: PhaseId, visited: Set<PhaseId>, completedAt: Record<PhaseId, number> }`
    - Persisted to sessionStorage so refresh mid-walkthrough doesn't drop progress

  **Must NOT do**:
  - No router coupling inside PhaseShell — phases use `goto()` from the parent route, shell is route-agnostic

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17–21
  - **Blocked By**: T2, T4, T10, T12

  **References**:
  - `content/phases.ts` from T5
  - SvelteKit `$app/navigation` for `goto()`

  **Acceptance Criteria**:
  - [ ] Using shell in a test route renders header + body + nav
  - [ ] Keyboard: Enter advances, Escape pauses
  - [ ] Progress bar highlights current + completed phases
  - [ ] Refresh preserves progress

  **QA Scenarios**:

  ```
  Scenario: Phase state persists across reload
    Tool: Playwright
    Steps:
      1. Visit 3 phases in sequence
      2. page.reload()
      3. assert 3 dots marked completed
    Evidence: .sisyphus/evidence/task-13-phase-persist.png

  Scenario: Keyboard advance
    Tool: Playwright
    Steps:
      1. page.keyboard.press("Enter") from phase 1
      2. assert URL is phase 2
    Evidence: .sisyphus/evidence/task-13-kbd-advance.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): PhaseShell layout, progress bar, and persistent phase store`
  - Files: `examples/weft-web/src/lib/components/PhaseShell.svelte`, `examples/weft-web/src/lib/components/PhaseProgress.svelte`, `examples/weft-web/src/lib/stores/phase.ts`, tests
  - Pre-commit: `pnpm --filter weft-web test:unit`

- [x] 14. **fhe.rs WASM port — strip rayon, target wasm32, wasm-bindgen core BFV**

  **What to do**:
  - Populate `examples/weft-web/crates/fhe-wasm/` (stub from T3):
    - Vendor the minimal subset of `gnosisguild/fhe.rs` under `vendor/fhe-rs/` at the exact commit SHA determined by T1
    - In the vendored sources, replace every `use rayon::prelude::*` + `.par_iter()` with sequential equivalents via a `cfg!(target_arch = "wasm32")` switch (OR feature-flag `single-threaded`)
    - Remove all `std::thread`, `std::sync::mpsc` usage — serial only
    - Ensure `getrandom` is configured for `wasm32-unknown-unknown` with `js` feature
  - Public wasm-bindgen surface in `src/lib.rs`:
    - `#[wasm_bindgen] pub fn load_params() -> ParamsHandle`
    - `#[wasm_bindgen] pub fn generate_secret_key(params: &ParamsHandle) -> SecretKeyHandle`
    - `#[wasm_bindgen] pub fn derive_public_key(params: &ParamsHandle, sk: &SecretKeyHandle) -> Vec<u8>`
    - `#[wasm_bindgen] pub fn encrypt_vector(params: &ParamsHandle, pk: &[u8], plaintext: &[i32]) -> Vec<u8>`
    - `#[wasm_bindgen] pub fn homomorphic_add(params: &ParamsHandle, ciphertexts: &Array) -> Vec<u8>`  — JS Array of Uint8Array
    - `#[wasm_bindgen] pub fn decrypt(params: &ParamsHandle, sk: &SecretKeyHandle, ct: &[u8]) -> Vec<i32>`  // single-key, no threshold — threshold in T15
  - Build script: `wasm-pack build --release --target web --out-dir ../../packages/fhe-wasm/pkg`
  - Native `cargo test` target using real BFV encrypt/add/decrypt round-trip against fixtures from T7
  - Ship insecure-preset branch only under `#[cfg(test)]`

  **Must NOT do**:
  - No threshold operations (those are T15)
  - No speed-hack shortcuts that break determinism
  - No new Rust crates without checking Interfold monorepo first (AGENTS.md checklist)
  - No insecure preset compiled into release wasm

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: deepest Rust + WASM work in the plan; needs ability to navigate + patch fhe.rs internals

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2) — with T15; both modify `crates/fhe-wasm/` but T15 adds new files rather than overlapping source. Agree with T15 on a module split upfront.
  - **Parallel Group**: Wave 2
  - **Blocks**: T23 (parity needs real crypto), T24 (WasmCryptoEngine)
  - **Blocked By**: T1, T3, T6, T7

  **References**:
  - `gnosisguild/fhe.rs` upstream (GitHub) — pinned commit from T1
  - `secure-process/examples/threshold_demo.rs` — reference native usage
  - `crates/fhe-params/src/lib.rs` — preset API from Interfold monorepo
  - AGENTS.md §BFV Parameter Specification + §Known Constraints
  - `wasm-bindgen` + `js-sys` book

  **Acceptance Criteria**:
  - [ ] `cargo check --target wasm32-unknown-unknown -p fhe-wasm` exits 0
  - [ ] `wasm-pack build --release` produces `pkg/fhe_wasm_bg.wasm`
  - [ ] Native `cargo test -p fhe-wasm` passes fixture parity for single-key encrypt/add/decrypt
  - [ ] `wasm-pack test --headless --chrome` passes at least one encrypt/add/decrypt round-trip
  - [ ] No `rayon` string in vendored code compiled for wasm (grep w/ cfg expansion)

  **QA Scenarios**:

  ```
  Scenario: Native parity against T7 fixtures (encrypt/add/decrypt)
    Tool: Bash (cargo test)
    Preconditions: T7 fixtures exist
    Steps:
      1. cargo test -p fhe-wasm --release parity_single_key -- --nocapture
    Expected Result: each of ≥ 5 fixture cases prints "OK" and test passes
    Evidence: .sisyphus/evidence/task-14-native-parity.txt

  Scenario: WASM headless parity
    Tool: Bash
    Preconditions: wasm-pack installed, Chrome available
    Steps:
      1. wasm-pack test --headless --chrome examples/weft-web/crates/fhe-wasm -- --release
    Expected Result: all wasm tests pass
    Evidence: .sisyphus/evidence/task-14-wasm-pack-test.txt

  Scenario: Bundle size within budget
    Tool: Bash
    Steps:
      1. wasm-pack build --release --target web examples/weft-web/crates/fhe-wasm --out-dir /tmp/pkg
      2. gzip -9 -c /tmp/pkg/fhe_wasm_bg.wasm | wc -c
    Expected Result: ≤ 8000000 bytes (gzipped)
    Evidence: .sisyphus/evidence/task-14-wasm-size.txt
  ```

  **Commit**: YES
  - Message: `feat(fhe-wasm): port gnosisguild/fhe.rs core BFV to wasm32 (single-threaded)`
  - Files: `examples/weft-web/crates/fhe-wasm/Cargo.toml`, `examples/weft-web/crates/fhe-wasm/src/**`, `examples/weft-web/crates/fhe-wasm/vendor/**`, `examples/weft-web/packages/fhe-wasm/**`
  - Pre-commit: `cargo test -p fhe-wasm --release && wasm-pack build --release examples/weft-web/crates/fhe-wasm`

- [x] 15. **trbfv WASM port — DKG + decryption_share + share combine bindings**

  **What to do**:
  - Extend `examples/weft-web/crates/fhe-wasm/src/threshold.rs`:
    - Vendor minimal subset of the Interfold `trbfv` logic (from `crates/` in the monorepo) OR re-implement on top of fhe.rs primitives — choose the one that requires fewer vendored lines (decision recorded in a code comment referencing AGENTS.md checklist)
    - Public wasm-bindgen functions:
      - `dkg_round1(party_index, committee_size, threshold) -> DkgRound1Output`
      - `dkg_round2(party_index, round1_inputs) -> DkgRound2Output` (produces secret share + public-key contribution)
      - `aggregate_public_key_contributions(contributions) -> Vec<u8>`
      - `partial_decrypt(secret_share: &[u8], ciphertext: &[u8]) -> Vec<u8>`
      - `combine_decryption_shares(shares: Array, ciphertext: &[u8], threshold: u32) -> Vec<i32>`
  - All byte formats exactly match native Rust fixtures from T7
  - `#[cfg(test)]` integration test running full 3-of-5 threshold round natively
  - Parallelization contract with T14: T14 owns `src/bfv/**`; T15 owns `src/threshold/**`; shared types in `src/common.rs`

  **Must NOT do**:
  - No 1/n division in encrypted domain (AGENTS.md §Known Constraints) — `combine_decryption_shares` returns raw sum as Int32
  - No new external crypto crates without checking Interfold `crates/`

  **Recommended Agent Profile**:
  - **Category**: `deep` — Reason: threshold crypto is the trickiest correctness area

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T23, T24
  - **Blocked By**: T1, T3, T6, T7

  **References**:
  - Interfold monorepo `crates/trbfv` (or equivalent threshold crate) — primary port source
  - `secure-process/examples/threshold_demo.rs` — native reference implementation
  - AGENTS.md §Known Constraints

  **Acceptance Criteria**:
  - [ ] Native `cargo test -p fhe-wasm threshold_round` passes fixture parity for 3-of-5
  - [ ] WASM `wasm-pack test --headless --chrome` passes at least one full 3-of-5 round
  - [ ] Combining 2 shares (below threshold) returns error / panics in test (reconstruction must require exactly threshold shares)

  **QA Scenarios**:

  ```
  Scenario: Native 3-of-5 threshold round matches fixture
    Tool: Bash
    Steps:
      1. cargo test -p fhe-wasm --release threshold_parity -- --nocapture
    Expected Result: all threshold fixtures pass
    Evidence: .sisyphus/evidence/task-15-threshold-parity.txt

  Scenario: Below-threshold combine fails
    Tool: Bash
    Steps:
      1. cargo test -p fhe-wasm --release below_threshold_fails
    Expected Result: test asserts error returned when only 2 of 5 shares supplied
    Evidence: .sisyphus/evidence/task-15-below-threshold.txt
  ```

  **Commit**: YES
  - Message: `feat(fhe-wasm): threshold BFV DKG + partial decrypt + share combine bindings`
  - Files: `examples/weft-web/crates/fhe-wasm/src/threshold/**`, `examples/weft-web/crates/fhe-wasm/src/common.rs`
  - Pre-commit: `cargo test -p fhe-wasm --release && wasm-pack test --headless --chrome examples/weft-web/crates/fhe-wasm`

- [x] 16. **Illustrated asset implementation (hospitals, committee, locks)**

  **What to do**:
  - Produce all SVG assets listed in T4's INVENTORY.md under `examples/weft-web/src/lib/assets/svg/`:
    - 3 hospital exteriors (St. Mercy = classical red-brick, Eastside = modern glass, Pacific University = campus/academic) — distinct silhouettes so viewers identify by shape
    - 5 committee-member avatars — diverse, cartoon, each with a distinct color-coded hat/badge matching phase accents
    - Lock (closed / open / half-open), key (5 shard variants), ciphertext-tile (noise pattern), gradient-tile (arrow pattern), cloud (global model)
    - 8 phase heroes — one compelling illustration per phase
  - All SVGs:
    - Hand-optimized (SVGO applied; `<title>` and `<desc>` for screen readers)
    - Use CSS custom properties from T4's token file (allows light/dark/high-contrast)
    - Max 1 file > 20 KB; total asset budget ≤ 400 KB uncompressed
  - Registry module `src/lib/assets/index.ts` exports typed asset references

  **Must NOT do**:
  - No raster images (PNG/JPG) in v1 (SVG only for scalability)
  - No external icon libraries (Lucide etc.) — everything hand-produced OR adapted from permissively licensed sources with attribution in README

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — Reason: visual illustration work
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: T17–21, T29
  - **Blocked By**: T4

  **References**:
  - T4 INVENTORY.md
  - `scripts/run-round.ts` — hospital descriptors for correct visual cues

  **Acceptance Criteria**:
  - [ ] Every entry in INVENTORY.md has a corresponding SVG file
  - [ ] Total uncompressed asset size ≤ 400 KB (measured by `du -cb src/lib/assets/svg/`)
  - [ ] Each SVG has non-empty `<title>` and `<desc>`
  - [ ] Visual QA screenshot gallery at `_dev/assets` route

  **QA Scenarios**:

  ```
  Scenario: Every inventory asset exists and renders
    Tool: Playwright
    Steps:
      1. page.goto("http://localhost:5173/_dev/assets")
      2. Count img tags matching inventory → ≥ 20
      3. Screenshot full page
    Expected Result: gallery visible; no broken-image icons
    Evidence: .sisyphus/evidence/task-16-asset-gallery.png

  Scenario: Accessibility metadata present
    Tool: Bash
    Steps:
      1. For each SVG in src/lib/assets/svg/, grep -L "<title>" — must be empty
    Expected Result: every SVG has a title
    Evidence: .sisyphus/evidence/task-16-svg-a11y.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): illustrated SVG assets for hospitals, committee, and phases`
  - Files: `examples/weft-web/src/lib/assets/svg/**`, `examples/weft-web/src/lib/assets/index.ts`, `examples/weft-web/src/routes/_dev/assets/+page.svelte`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 17. **MeetParticipants + DistributedKeygen phase components**

  **What to do**:
  - Route `examples/weft-web/src/routes/walkthrough/1-meet/+page.svelte`:
    - Introduces 3 hospitals using T16 illustrations and T5 content
    - Introduces 5 committee members (playful characters) with "no single one can decrypt" explainer
    - Novice/learn-more/show-math disclosure tiers active
    - Includes mandatory honest-framing disclosure: "What's real: the cryptography. What's simulated: the committee runs as 5 Web Workers on your machine; in production these would be 5 independent organizations."
  - Route `examples/weft-web/src/routes/walkthrough/2-dkg/+page.svelte`:
    - Animates DKG: each committee member generates a secret (shown as a glowing shard); they exchange polynomial evaluations; a combined public key emerges
    - Uses `CryptoEngine.runDkg()` (mock in dev; real wasm when T24 lands)
    - "Show math" reveals Shamir secret sharing formula + Lagrange interpolation
  - Both routes use `PhaseShell`, `ProgressiveDisclosure`, `AttackerPanel`

  **Must NOT do**:
  - No reveal of secret shares in plaintext UI (tile shows indexed shard with byte-count only)
  - No real hospital logos or copyrighted imagery

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 with T18–21
  - **Blocks**: T22 (sandbox link), T25 (E2E), T29 (a11y)
  - **Blocked By**: T5, T8, T10, T11, T12, T13, T16

  **References**:
  - `secure-process/examples/threshold_demo.rs` Phase 1-2
  - `content/phases.ts` keys `meet`, `dkg`
  - T16 assets

  **Acceptance Criteria**:
  - [ ] Both routes render without console errors under mock engine
  - [ ] DKG animation completes in ≤ 6s (mock) / ≤ 20s p95 (real)
  - [ ] Honest-framing disclosure visible at top of Phase 1
  - [ ] All 3 disclosure levels have content

  **QA Scenarios**:

  ```
  Scenario: Meet + DKG walkthrough
    Tool: Playwright
    Steps:
      1. page.goto("http://localhost:5173/walkthrough/1-meet")
      2. assert page.textContent("body") contains "St. Mercy General" and "12,400"
      3. assert page.isVisible("[data-testid='honest-framing']")
      4. page.click("button:has-text('Next')")
      5. page.waitForURL("**/walkthrough/2-dkg")
      6. page.click("button:has-text('Generate key')")
      7. page.waitForSelector("[data-testid='dkg-complete']", { timeout: 30000 })
    Expected Result: both phases complete end-to-end
    Evidence: .sisyphus/evidence/task-17-{meet,dkg}.png

  Scenario: No plaintext share leaks
    Tool: Playwright
    Steps:
      1. Trigger DKG
      2. Assert attacker-panel innerHTML contains no plaintext large ints (regex /[0-9]{8,}/ on redacted payload only)
    Evidence: .sisyphus/evidence/task-17-no-share-leak.txt
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): phase 1-2 (meet participants + distributed keygen)`
  - Files: `examples/weft-web/src/routes/walkthrough/1-meet/**`, `examples/weft-web/src/routes/walkthrough/2-dkg/**`
  - Pre-commit: `pnpm --filter weft-web test:unit && pnpm --filter weft-web check`

- [x] 18. **ShareDistribution + AggregatePublicKey phase components**

  **What to do**:
  - Route `3-shares/+page.svelte`: animates secret shares being distributed across committee workers. Visualizes that each committee has ONLY its own share; no single party has the full secret. "Learn more" explains Shamir recovery threshold.
  - Route `4-aggregate-pk/+page.svelte`: each committee contributes a public-key fragment; they combine into the aggregated committee public key. Big reveal: "This key everyone can see. You can even take a photo of it — hospitals will encrypt under this."
  - Consumes `DkgTranscript.perPartyShares` and `DkgTranscript.publicKey` from T8/T24
  - 3 disclosure levels per phase

  **Must NOT do**:
  - No storage of secret shares in any localStorage / sessionStorage / IndexedDB
  - No log of share bytes to console

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: T22, T25, T29
  - **Blocked By**: T5, T8, T10–13, T16

  **References**:
  - `secure-process/examples/threshold_demo.rs` Phase 3-4
  - `content/phases.ts` keys `shares`, `aggregate-pk`

  **Acceptance Criteria**:
  - [ ] Both routes render and animate
  - [ ] Shares visualized but never readable
  - [ ] Aggregate public key rendered as a QR-like visual hash (optional) + hex preview

  **QA Scenarios**:

  ```
  Scenario: Shares never persisted
    Tool: Playwright
    Steps:
      1. Walk through phase 3
      2. Dump localStorage + sessionStorage + indexedDB; assert zero byte entries contain share data
    Evidence: .sisyphus/evidence/task-18-no-share-persist.txt

  Scenario: Aggregated PK displayed
    Tool: Playwright
    Steps:
      1. Complete phase 4
      2. Assert page.isVisible("[data-testid='aggregated-pk-preview']")
      3. Assert preview hex ≥ 32 chars
    Evidence: .sisyphus/evidence/task-18-pk-preview.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): phase 3-4 (share distribution + public-key aggregation)`
  - Files: `examples/weft-web/src/routes/walkthrough/3-shares/**`, `examples/weft-web/src/routes/walkthrough/4-aggregate-pk/**`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 19. **LocalTrainingEncryption + Encoding animation phase component**

  **What to do**:
  - Route `5-train-encrypt/+page.svelte`:
    - Three parallel swimlanes (one per hospital). Each swimlane:
      - Shows synthetic "training happening" animation (scripted fake gradient values — DO NOT claim real ML)
      - Shows quantization: `grad_float × S = grad_int`, clamped to [-G, G], negative mapped to `t - |x|` (two's complement mod t)
      - Shows encryption: plaintext coeffs → ciphertext tile
      - Uses `CryptoEngine.encryptVector()`
    - Shows the aggregate public key (same for all hospitals) at top of page to reinforce "same key for all"
    - "Show math" reveals BFV encryption: `c = (a·s + e + Δ·m, -a)`
    - Honest-framing reminder: "The gradients here are scripted; the encryption is real."

  **Must NOT do**:
  - No implication of real ML training happening
  - No division by `n` anywhere in the encrypt path

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: T22, T25, T29
  - **Blocked By**: T5, T8, T10–13, T16

  **References**:
  - `scripts/run-round.ts` — encoding semantics
  - `client/src/encrypt.ts` — quantize/clamp/encode logic

  **Acceptance Criteria**:
  - [ ] 3 swimlanes visible and encrypt concurrently
  - [ ] Negative gradient value visibly animates through two's-complement transform
  - [ ] Each hospital produces its own ciphertext tile

  **QA Scenarios**:

  ```
  Scenario: Three hospitals encrypt in parallel
    Tool: Playwright
    Steps:
      1. Navigate to phase 5
      2. page.click("button:has-text('Train & Encrypt')")
      3. Wait for 3 [data-testid='hospital-ct-done'] elements
      4. Assert timing: wall time < 3s for mock; < 3s for wasm (p50)
    Evidence: .sisyphus/evidence/task-19-encrypt-3.png

  Scenario: Negative gradient two's-complement step visible
    Tool: Playwright
    Steps:
      1. In show-math mode, trigger encrypt with known negative value
      2. Assert visible transform label "x → t - |x|"
    Evidence: .sisyphus/evidence/task-19-neg-twoscomp.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): phase 5 (local training simulation + BFV encryption)`
  - Files: `examples/weft-web/src/routes/walkthrough/5-train-encrypt/**`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 20. **HomomorphicAggregation + ThresholdDecryption phase components**

  **What to do**:
  - Route `6-aggregate/+page.svelte`: ciphertexts flow into aggregator worker; visualizes homomorphic addition (gears turning; encrypted ciphertext tiles merging). Key insight box: "We added encrypted numbers without ever seeing them." Uses `CryptoEngine.aggregateCiphertexts()`.
  - Route `7-decrypt/+page.svelte`:
    - Only 3 of 5 committee members come online (user can click to choose which 3)
    - Animation: each chosen committee produces a partial decryption share; shares combine into final plaintext sum
    - "Learn more": explains threshold — 2 can't, 3 can
    - "Show math": Lagrange coefficients + decryption share formula
    - Uses `CryptoEngine.partialDecrypt()` + `combineDecryptionShares()`

  **Must NOT do**:
  - No revelation of individual hospital contributions post-decrypt — only the sum
  - No division by `n` at this step (that's phase 8)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: T22, T25, T29
  - **Blocked By**: T5, T8, T10–13, T16

  **References**:
  - `secure-process/examples/threshold_demo.rs` Phase 6-7
  - `scripts/run-round.ts` for aggregation narrative

  **Acceptance Criteria**:
  - [ ] Phase 6 visualizes add for 3 ciphertexts
  - [ ] Phase 7 lets user pick 3 of 5 parties; combine succeeds
  - [ ] Combining with < 3 shows clear error / re-ask UI (not a crash)
  - [ ] Decrypted output shown at coefficient level (not "averaged" yet)

  **QA Scenarios**:

  ```
  Scenario: 3-of-5 threshold success
    Tool: Playwright
    Steps:
      1. Navigate phase 7
      2. Select committee members 1, 3, 5
      3. click "Reveal"
      4. Assert [data-testid='decrypted-coefficients'] visible with Int32 array
    Evidence: .sisyphus/evidence/task-20-decrypt-3of5.png

  Scenario: Below-threshold rejected
    Tool: Playwright
    Steps:
      1. Select only members 1, 3
      2. click "Reveal"
      3. Assert page.textContent contains "Need at least 3"
    Evidence: .sisyphus/evidence/task-20-below-threshold.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): phase 6-7 (homomorphic aggregation + threshold decryption)`
  - Files: `examples/weft-web/src/routes/walkthrough/6-aggregate/**`, `examples/weft-web/src/routes/walkthrough/7-decrypt/**`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 21. **GlobalModelUpdate + round-complete summary phase component**

  **What to do**:
  - Route `8-update/+page.svelte`:
    - Takes decrypted sum from phase 7; applies `/n` (3) and `/S` (4096) in plaintext TypeScript to get the averaged gradient vector
    - Animates global model cloud "updating" with the averaged gradient values
    - Shows a scoreboard: "What was learned (aggregate)" vs "What stayed private (per-hospital)"
    - Displays the full 8-phase journey recap with mini-timeline
    - Offers two CTAs: "Explore the sandbox" (→ T22) and "Start over" (reset phase store)
  - Round summary component `examples/weft-web/src/lib/components/RoundSummary.svelte` reused in sandbox

  **Must NOT do**:
  - No division by `n` in any ciphertext stage (only post-decrypt plaintext)
  - No celebration of "real ML training" — keep honest framing

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: T22, T25, T29
  - **Blocked By**: T5, T8, T10–13, T16

  **References**:
  - `scripts/run-round.ts` end-of-round narrative
  - `coordinator/src/round.ts` for decoding semantics

  **Acceptance Criteria**:
  - [ ] Phase 8 shows averaged gradient vector
  - [ ] Recap timeline shows 8 dots, all completed
  - [ ] CTAs work (sandbox / restart)

  **QA Scenarios**:

  ```
  Scenario: Full walkthrough ends with correct averaged gradient
    Tool: Playwright
    Preconditions: full walkthrough run (mock engine, seeded)
    Steps:
      1. Arrive at phase 8
      2. Read [data-testid='averaged-gradient'] values
      3. Compare element-wise against hand-computed expected average
    Expected Result: exact match (mock is deterministic)
    Evidence: .sisyphus/evidence/task-21-avg-correct.txt

  Scenario: Restart resets phase store
    Tool: Playwright
    Steps:
      1. click "Start over"
      2. Assert URL goes to /walkthrough/1-meet
      3. Assert phase progress bar shows 0 completed
    Evidence: .sisyphus/evidence/task-21-restart.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): phase 8 (global model update + round summary)`
  - Files: `examples/weft-web/src/routes/walkthrough/8-update/**`, `examples/weft-web/src/lib/components/RoundSummary.svelte`
  - Pre-commit: `pnpm --filter weft-web check`

- [x] 22. **Sandbox mode with parameter controls**

  **What to do**:
  - Create `/sandbox` route with interactive controls (non-guided, free play)
  - Parameter controls: client count slider (2-10), threshold t-of-n picker (constrained t ≤ n), scale factor dropdown (2^10 / 2^12 / 2^14), gradient vector size (64 / 256 / 512)
  - "Run round" button triggers full 8-phase pipeline with chosen params
  - Reuse `RoundSummary.svelte` from T21 to display aggregated result
  - Show parameter-dependent constraints live (e.g., "max clients @ S=4096: 15" computed from `n_max × S × G < t/2`)
  - Preset buttons: "Default demo", "Stress test (10 clients)", "High precision (S=16384)"
  - Display rolling history of last 5 runs in a sidebar with key stats (duration, clients, threshold)
  - Keep guided walkthrough content accessible via "Learn mode" link

  **Must NOT do**:
  - Do NOT allow parameters that violate overflow invariant — validate client-side and disable "Run"
  - Do NOT reimplement phase logic — reuse `CryptoEngine` + worker topology from T9/T24
  - Do NOT persist history to localStorage (session-only per plan scope)
  - Do NOT expose `BfvPreset::Insecure` — only `SecureThreshold8192` variants

  **Recommended Agent Profile**:
  - **Category**: `deep` — Integrates T17-21 phase components with dynamic parameters; requires understanding of constraint validation and engine reconfiguration
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Sandbox UI must balance density of controls with clarity

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 23, 24, 25, 26, 27, 28, 29)
  - **Blocks**: T28 (docs reference sandbox), T29 (a11y covers sandbox), F3 (QA hits sandbox)
  - **Blocked By**: T8 (MockCryptoEngine for dev), T9 (worker topology), T11 (ParametersModal shares logic), T17-T21 (phase components to reuse)

  **References**:
  - `examples/weft-web/src/lib/crypto/engine.ts` (T6) — interface for re-runs
  - `examples/weft-web/src/lib/workers/` (T9) — worker orchestration
  - `examples/weft-web/src/lib/components/ParametersModal.svelte` (T11) — shared constraint display
  - `examples/weft-web/src/routes/walkthrough/*/` (T17-21) — phase panels to embed
  - `client/src/constants.ts` — overflow invariant formula
  - AGENTS.md §"Overflow Safety Invariant" — client-side validation reference
  - `scripts/run-round.ts` — orchestration reference

  **Acceptance Criteria**:
  - [ ] `/sandbox` route loads with controls rendered
  - [ ] Changing client count from 3 to 10 updates "max clients" constraint indicator
  - [ ] Setting parameters that violate invariant disables "Run round" with tooltip explaining why
  - [ ] "Run round" with default params completes in ≤30s and renders `RoundSummary`
  - [ ] Preset buttons load valid parameter sets
  - [ ] History sidebar shows last run stats
  - [ ] `pnpm --filter weft-web check` passes
  - [ ] `pnpm --filter weft-web test:unit src/routes/sandbox` passes

  **QA Scenarios**:

  ```
  Scenario: Run sandbox round with non-default parameters
    Tool: Playwright
    Preconditions: Dev server running at http://localhost:5173; WasmCryptoEngine feature flag ON
    Steps:
      1. goto('/sandbox')
      2. setSlider('[data-testid="client-count"]', 5)
      3. selectOption('[data-testid="threshold"]', '3-of-5')
      4. selectOption('[data-testid="scale-factor"]', '4096')
      5. click('[data-testid="run-round"]')
      6. waitForSelector('[data-testid="round-summary"]', { timeout: 35000 })
      7. expect(textContent('[data-testid="summary-clients"]')).toBe('5')
      8. expect(textContent('[data-testid="summary-threshold"]')).toBe('3-of-5')
    Expected Result: Round completes; summary shows 5 clients, 3-of-5 threshold, decoded aggregate within tolerance
    Failure Indicators: Timeout; error banner; summary missing; parameter mismatch
    Evidence: .sisyphus/evidence/task-22-sandbox-run.png

  Scenario: Invalid parameters block Run
    Tool: Playwright
    Preconditions: /sandbox loaded
    Steps:
      1. setSlider('[data-testid="client-count"]', 10)
      2. selectOption('[data-testid="scale-factor"]', '16384')
      3. expect(isDisabled('[data-testid="run-round"]')).toBe(true)
      4. hover('[data-testid="run-round"]')
      5. expect(textContent('[role="tooltip"]')).toContain('overflow')
    Expected Result: Button disabled; tooltip explains invariant violation
    Evidence: .sisyphus/evidence/task-22-sandbox-invalid.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web-ui): sandbox mode with parameter controls`
  - Files: `examples/weft-web/src/routes/sandbox/**`, `examples/weft-web/src/lib/components/SandboxControls.svelte`, `examples/weft-web/src/lib/components/RunHistory.svelte`
  - Pre-commit: `pnpm --filter weft-web check && pnpm --filter weft-web test:unit src/routes/sandbox`

- [x] 23. **Parity test harness: WASM vs native Rust**

  **What to do**:
  - Create `examples/weft-web/tests/parity/` with Playwright-driven test runner
  - Load ≥20 fixture vectors generated by T7 (native Rust reference)
  - For each fixture: instantiate `WasmCryptoEngine` in headless Chrome, run full 8-phase flow with deterministic seed, capture ciphertexts, partial decryption shares, and final plaintext
  - Byte-for-byte compare WASM outputs against native fixtures at each phase boundary
  - Generate parity report `.sisyphus/evidence/task-23-parity-report.json` with per-fixture pass/fail and diff locations
  - Fixtures must cover: varied client counts (3, 5, 7), varied gradient sizes (64, 256, 512), edge cases (all zeros, near-clamp values, negative heavy)
  - Fail the test suite if ANY fixture diverges (goal: 100% parity, not ≥95%)

  **Must NOT do**:
  - Do NOT use approximate/epsilon comparison — ciphertexts are deterministic given seed; require byte equality
  - Do NOT skip fixtures that fail — surface each divergence with full context
  - Do NOT run against production preset with insecure randomness — use seeded RNG per fixture

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Requires deep understanding of both native Rust crypto and WASM binding behavior; test infrastructure must be rock-solid
  - **Skills**: [`playwright`]
    - `playwright`: Headless browser orchestration for WASM execution

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: T24 (WasmCryptoEngine wiring needs parity validated before integration)
  - **Blocked By**: T7 (fixture generator), T14 (fhe-wasm BFV bindings), T15 (fhe-wasm threshold submodule)

  **References**:
  - `examples/weft-web/crates/fhe-wasm/fixtures/` (T7 output) — native reference vectors
  - `examples/weft-web/packages/fhe-wasm/` (T14 BFV + T15 threshold) — single unified WASM package to exercise
  - `secure-process/examples/threshold_demo.rs` — canonical 8-phase flow to mirror
  - AGENTS.md §"BFV Parameter Specification" — shared preset contract

  **Acceptance Criteria**:
  - [ ] ≥20 fixtures loaded from T7 output
  - [ ] Playwright config launches headless Chrome with WASM support
  - [ ] Per-phase byte comparison: DKG output, committee PK, ciphertexts per client, aggregated ciphertext, partial shares, final plaintext
  - [ ] Parity report JSON written with schema `{ fixtureId, passed, divergedAtPhase?, diffBytes? }`
  - [ ] Test suite fails loudly if any fixture diverges
  - [ ] `pnpm --filter weft-web test:parity` runs in CI and locally
  - [ ] Report committed to `.sisyphus/evidence/task-23-parity-report.json`

  **QA Scenarios**:

  ```
  Scenario: All fixtures pass parity
    Tool: Bash
    Preconditions: T7 fixtures generated; T14 and T15 WASM built
    Steps:
      1. run `pnpm --filter weft-web test:parity`
      2. parse `.sisyphus/evidence/task-23-parity-report.json`
      3. assert `report.summary.failed === 0`
      4. assert `report.summary.total >= 20`
    Expected Result: Exit code 0; all fixtures pass byte-for-byte
    Failure Indicators: Non-zero exit; divergedAtPhase populated for any fixture
    Evidence: .sisyphus/evidence/task-23-parity-report.json

  Scenario: Fixture divergence is surfaced clearly
    Tool: Bash
    Preconditions: Deliberately inject a 1-byte mutation into a WASM fixture file to simulate divergence. Use the canonical `threshold-3-of-5` case from T7 (path: `examples/weft-web/crates/fhe-wasm/fixtures/cases/threshold-3-of-5.bin`).
    Steps:
      1. back up original: `cp examples/weft-web/crates/fhe-wasm/fixtures/cases/threshold-3-of-5.bin /tmp/threshold-3-of-5.bin.bak`
      2. mutate one byte: `printf '\xff' | dd of=examples/weft-web/crates/fhe-wasm/fixtures/cases/threshold-3-of-5.bin bs=1 count=1 seek=0 conv=notrunc`
      3. run `pnpm --filter weft-web test:parity`
      4. assert exit code is non-zero
      5. assert report shows `threshold-3-of-5` with `divergedAtPhase` set and `diffBytes > 0`
      6. restore: `cp /tmp/threshold-3-of-5.bin.bak examples/weft-web/crates/fhe-wasm/fixtures/cases/threshold-3-of-5.bin`
    Expected Result: Test suite fails loudly with precise location of divergence; restoration returns the suite to passing
    Evidence: .sisyphus/evidence/task-23-divergence-detection.log
  ```

  **Commit**: YES
  - Message: `test(weft-web): byte-level parity harness WASM vs native Rust`
  - Files: `examples/weft-web/tests/parity/**`, `examples/weft-web/playwright.parity.config.ts`, `examples/weft-web/package.json` (add `test:parity` script)
  - Pre-commit: `pnpm --filter weft-web test:parity`

- [x] 24. **WasmCryptoEngine wiring + worker integration**

  **What to do**:
  - Implement `WasmCryptoEngine` class in `examples/weft-web/src/lib/crypto/wasm.ts` satisfying `CryptoEngine` interface (T6 — interface defined in `engine.ts`)
  - Wire the single `@weft/fhe-wasm` package (T14 BFV + T15 threshold submodule) via dynamic `import()` for code splitting
  - Dispatch each committee member to a dedicated Web Worker via Comlink (T9) — 5 workers for 5-party committee
  - Implement RPC methods: `generateKeyShare`, `aggregatePublicKey`, `partialDecrypt`, `combineShares`
  - Handle WASM memory lifecycle: instantiate once per worker, transfer ciphertext bytes via `Transferable`
  - Feature flag `VITE_CRYPTO_ENGINE=wasm|mock` in `src/lib/crypto/index.ts` selects implementation at runtime
  - Progress callbacks propagate via Comlink proxy so UI can show per-phase progress
  - Error handling: catch WASM panics, surface as typed `CryptoEngineError` with phase + cause

  **Must NOT do**:
  - Do NOT block main thread — all crypto runs in workers
  - Do NOT copy ciphertext bytes across worker boundaries when `Transferable` is available
  - Do NOT load WASM modules eagerly — lazy-load when first crypto call is made
  - Do NOT bypass `CryptoEngine` interface — sandbox and walkthrough must both work identically

  **Recommended Agent Profile**:
  - **Category**: `deep` — Integration glue across Rust WASM / Web Workers / Comlink / Svelte stores with strict perf and lifecycle constraints
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: T25 (E2E needs real engine), T26 (perf profiling needs real engine), T28 (docs reference real engine)
  - **Blocked By**: T6 (interface), T9 (worker topology), T14 (fhe-wasm BFV bindings), T15 (fhe-wasm threshold submodule), T23 (parity validation)

  **References**:
  - `examples/weft-web/src/lib/crypto/engine.ts` (T6) — interface to implement
  - `examples/weft-web/src/lib/crypto/mock.ts` (T8) — reference implementation (`MockCryptoEngine` class)
  - `examples/weft-web/src/lib/workers/` (T9) — Comlink topology
  - `examples/weft-web/packages/fhe-wasm/` (T14 BFV + T15 threshold submodule) — single unified WASM package
  - Comlink docs: https://github.com/GoogleChromeLabs/comlink
  - MDN Transferable: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

  **Acceptance Criteria**:
  - [ ] `WasmCryptoEngine` implements full `CryptoEngine` interface
  - [ ] 5 workers spawned for 5-party committee, each loads WASM lazily
  - [ ] Ciphertext bytes transferred via `Transferable` (measured: no memcpy in hot path)
  - [ ] Feature flag swaps mock ↔ wasm without code changes
  - [ ] Error thrown in worker surfaces to UI with phase context preserved
  - [ ] Unit tests mock Comlink boundary and verify orchestration logic
  - [ ] `pnpm --filter weft-web check` passes
  - [ ] `pnpm --filter weft-web test:unit src/lib/crypto/__tests__/wasm.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Full round completes with WasmCryptoEngine
    Tool: Playwright
    Preconditions: Dev server running; VITE_CRYPTO_ENGINE=wasm
    Steps:
      1. goto('/walkthrough/1-meet')
      2. click through phases 1→8 with default params
      3. waitForSelector('[data-testid="round-summary"]', { timeout: 35000 })
      4. expect(consoleErrors).toHaveLength(0)
      5. expect(textContent('[data-testid="engine-label"]')).toBe('WASM')
    Expected Result: Guided walkthrough completes with real crypto; no console errors
    Failure Indicators: WASM load failure; timeout; mock engine active by mistake
    Evidence: .sisyphus/evidence/task-24-wasm-full-round.png

  Scenario: Worker crash is reported gracefully
    Tool: Playwright
    Preconditions: Inject a worker that throws during partialDecrypt (test-only override)
    Steps:
      1. goto('/walkthrough/7-decrypt')
      2. trigger partial decryption
      3. expect(textContent('[data-testid="error-banner"]')).toContain('threshold decryption')
      4. expect(textContent('[data-testid="error-phase"]')).toBe('partialDecrypt')
    Expected Result: UI shows typed error with phase context; no unhandled promise rejections
    Evidence: .sisyphus/evidence/task-24-worker-error.png
  ```

  **Commit**: YES
  - Message: `feat(weft-web): wire WasmCryptoEngine into worker topology`
  - Files: `examples/weft-web/src/lib/crypto/wasm.ts`, `examples/weft-web/src/lib/crypto/index.ts`, `examples/weft-web/src/lib/workers/committee-member.ts`, `examples/weft-web/.env.example`
  - Pre-commit: `pnpm --filter weft-web check && pnpm --filter weft-web test:unit src/lib/crypto`

- [x] 25. **Playwright E2E test suite (Chrome + Firefox)**

  **What to do**:
  - Create `examples/weft-web/tests/e2e/` with Playwright config targeting Chrome + Firefox
  - Happy-path test: full guided walkthrough phases 1→8 with default hospital scenario
  - Deep-link test: direct navigation to each phase preserves state correctly
  - Sandbox test: parameter change + re-run produces new summary
  - Progressive disclosure test: toggle novice → learn-more → show-math at every phase
  - Attacker panel test: verify ciphertext view shows opaque bytes at every ciphertext-holding phase
  - Keyboard-only test: tab through walkthrough, assert focus ring visible and next-button activation works
  - Reduced-motion test: `prefers-reduced-motion: reduce` disables animations but flow still completes
  - Fail fast on console errors (hook into `page.on('pageerror')` and `page.on('console', msg => msg.type() === 'error')`)
  - CI artifacts: screenshots on failure, video recording, trace files

  **Must NOT do**:
  - Do NOT use flaky timeouts — use `waitForSelector` with specific data-testids and meaningful timeouts
  - Do NOT test mock engine in E2E — E2E runs against real WASM engine only
  - Do NOT skip Firefox even though WASM perf may be slower
  - Do NOT assert on specific decoded gradient values (determinism not guaranteed across committee randomness) — assert on structural properties (summary renders, aggregate within tolerance of expected direction)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Cross-browser E2E requires careful handling of timing and browser-specific behavior
  - **Skills**: [`playwright`]
    - `playwright`: Core test framework skill

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F3 (final QA)
  - **Blocked By**: T24 (WasmCryptoEngine), T17-22 (all UI phases)

  **References**:
  - Playwright docs: https://playwright.dev/docs/test-configuration
  - `examples/weft-web/src/routes/walkthrough/` — pages under test
  - `examples/weft-web/src/routes/sandbox/` — sandbox under test
  - T23 parity harness — reference for Playwright config patterns

  **Acceptance Criteria**:
  - [ ] `pnpm --filter weft-web test:e2e` runs Chrome + Firefox
  - [ ] 8+ test cases covering happy path, deep links, sandbox, disclosure, attacker, a11y, reduced motion
  - [ ] CI integration: artifacts uploaded on failure
  - [ ] No `page.waitForTimeout` calls — only selector or event waits
  - [ ] Tests tolerate p95 crypto timings from perf budget (allow 35s per full round)
  - [ ] Zero console errors during happy path on both browsers

  **QA Scenarios**:

  ```
  Scenario: Full E2E passes on Chrome and Firefox
    Tool: Bash
    Preconditions: App built; workers bundled
    Steps:
      1. run `pnpm --filter weft-web build`
      2. run `pnpm --filter weft-web test:e2e`
      3. assert exit code 0
      4. inspect `test-results/` for both browser projects
      5. verify no .failed artifacts
    Expected Result: All tests pass on both browsers; artifacts clean
    Failure Indicators: Browser-specific failure; console error; timeout
    Evidence: .sisyphus/evidence/task-25-e2e-report/

  Scenario: Keyboard-only walkthrough completes
    Tool: Playwright (within suite)
    Preconditions: Walkthrough open at phase 1
    Steps:
      1. press 'Tab' until next-button focused
      2. press 'Enter' to advance
      3. repeat until phase 8 reached
      4. assert `document.activeElement` is visible and has focus ring
    Expected Result: Full walkthrough traversable by keyboard with visible focus
    Evidence: .sisyphus/evidence/task-25-keyboard.webm
  ```

  **Commit**: YES
  - Message: `test(weft-web): Playwright E2E suite for Chrome + Firefox`
  - Files: `examples/weft-web/tests/e2e/**`, `examples/weft-web/playwright.config.ts`, `examples/weft-web/package.json` (add `test:e2e` script)
  - Pre-commit: `pnpm --filter weft-web test:e2e`

- [x] 26. **Performance profiling + bundle-size enforcement**

  **What to do**:
  - Add `vite-bundle-visualizer` (or `rollup-plugin-visualizer`) to generate bundle reports
  - Create `examples/weft-web/scripts/check-bundle-size.ts` asserting:
    - Initial JS+CSS ≤ 400KB gzip
    - Total WASM assets ≤ 8MB gzip
    - No single chunk > 1MB uncompressed
  - Create Playwright perf harness `examples/weft-web/tests/perf/` measuring:
    - FCP (First Contentful Paint) ≤ 2.5s
    - TTI (Time to Interactive) ≤ 4s
    - Crypto-ready time (first WASM module ready) ≤ 6s
    - DKG p50 ≤ 12s / p95 ≤ 20s (10 runs)
    - Per-client encryption ≤ 750ms
    - Homomorphic add (3-client) ≤ 2s
    - 3-of-5 threshold decrypt ≤ 8s
    - End-to-end round ≤ 30s
  - Report `.sisyphus/evidence/task-26-perf-report.json` with percentiles per metric
  - Fail build if any budget exceeded
  - Use Chrome DevTools Protocol via Playwright for precise timing

  **Must NOT do**:
  - Do NOT average across runs — report p50 and p95 separately
  - Do NOT run perf on mock engine — real WASM only
  - Do NOT use synthetic benchmarks disconnected from user flow — measure inside actual walkthrough pages
  - Do NOT rely on single-run measurements — ≥10 iterations per metric

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — Requires careful instrumentation and statistical rigor
  - **Skills**: [`playwright`]
    - `playwright`: Perf measurement via CDP

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F2 (code quality review references perf), F3 (final QA)
  - **Blocked By**: T24 (real WASM engine)

  **References**:
  - Playwright perf APIs: https://playwright.dev/docs/api/class-page#page-evaluate
  - Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
  - `vite-bundle-visualizer`: https://github.com/KusStar/vite-bundle-visualizer
  - Plan §"Perf budgets" (Execution Strategy) — all thresholds

  **Acceptance Criteria**:
  - [ ] `pnpm --filter weft-web check:bundle` enforces size budgets
  - [ ] `pnpm --filter weft-web test:perf` runs 10+ iterations per metric
  - [ ] Report JSON includes p50, p95, max per metric
  - [ ] CI fails if any budget violated
  - [ ] Bundle visualization artifact saved to `.sisyphus/evidence/task-26-bundle.html`
  - [ ] Perf report saved to `.sisyphus/evidence/task-26-perf-report.json`

  **QA Scenarios**:

  ```
  Scenario: All perf budgets met
    Tool: Bash
    Preconditions: Production build completed
    Steps:
      1. run `pnpm --filter weft-web build`
      2. run `pnpm --filter weft-web check:bundle`
      3. run `pnpm --filter weft-web test:perf`
      4. parse `.sisyphus/evidence/task-26-perf-report.json`
      5. assert every budget listed as `passed: true`
    Expected Result: All budgets pass; report shows healthy margin
    Failure Indicators: Any `passed: false`; bundle check exit non-zero
    Evidence: .sisyphus/evidence/task-26-perf-report.json

  Scenario: Budget violation fails CI
    Tool: Bash
    Preconditions: Temporarily lower bundle budget to 10KB to force failure
    Steps:
      1. set `INITIAL_BUDGET_KB=10` in check-bundle-size.ts
      2. run `pnpm --filter weft-web check:bundle`
      3. assert non-zero exit code
      4. assert stderr contains "Budget exceeded"
      5. revert budget
    Expected Result: Clear failure message identifies which budget was violated
    Evidence: .sisyphus/evidence/task-26-budget-violation.log
  ```

  **Commit**: YES
  - Message: `test(weft-web): bundle-size + runtime perf budgets`
  - Files: `examples/weft-web/scripts/check-bundle-size.ts`, `examples/weft-web/tests/perf/**`, `examples/weft-web/package.json` (add `check:bundle`, `test:perf` scripts)
  - Pre-commit: `pnpm --filter weft-web check:bundle && pnpm --filter weft-web test:perf`

- [x] 27. **GitHub Actions deploy workflow**

  **What to do**:
  - Create `.github/workflows/deploy-weft-web.yml`
  - Trigger on push to `main` when `examples/weft-web/**` changes, and on manual `workflow_dispatch`
  - Steps: checkout → setup Node 20 + pnpm → setup Rust + wasm-pack → install deps → build WASM (`wasm-pack build --release` for T14 and T15) → run `pnpm --filter weft-web build` with `BASE_PATH=/weft` → run `pnpm --filter weft-web check:bundle` → upload to `actions/deploy-pages`
  - Use concurrency group to avoid deploy race
  - Cache: pnpm store, cargo registry + target/, wasm-pack output
  - Configure SvelteKit `adapter-static` with `paths.base = process.env.BASE_PATH ?? ''`
  - Add `404.html` copy of `index.html` for SPA fallback on GitHub Pages
  - Document required GitHub Pages settings in job summary

  **Must NOT do**:
  - Do NOT skip bundle-size check in CI — it's the safety net
  - Do NOT hardcode `BASE_PATH` in source — env-driven only
  - Do NOT deploy on PR previews (out of scope v1)
  - Do NOT expose secrets in workflow — no secrets required for static deploy

  **Recommended Agent Profile**:
  - **Category**: `quick` — Standard GitHub Actions workflow with well-documented patterns
  - **Skills**: [`git-master`]
    - `git-master`: Workflow file authoring

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T2 (SvelteKit scaffold with adapter-static)

  **References**:
  - SvelteKit adapter-static docs: https://svelte.dev/docs/kit/adapter-static
  - GitHub Pages deploy action: https://github.com/actions/deploy-pages
  - `actions/upload-pages-artifact`
  - Example Rust + WASM CI: https://github.com/rustwasm/wasm-pack-template/blob/main/.github/workflows/ci.yml

  **Acceptance Criteria**:
  - [ ] Workflow file present and syntactically valid (`actionlint`)
  - [ ] `BASE_PATH` correctly wired through `svelte.config.js`
  - [ ] 404.html fallback copied during build
  - [ ] Caches reduce cold CI to <10min
  - [ ] Bundle check enforced in CI path
  - [ ] Manual `workflow_dispatch` works from Actions UI

  **QA Scenarios**:

  ```
  Scenario: Workflow validates and builds locally with act
    Tool: Bash
    Preconditions: `act` installed (or fall back to actionlint + local build reproduction)
    Steps:
      1. run `actionlint .github/workflows/deploy-weft-web.yml`
      2. assert exit code 0
      3. run locally: `BASE_PATH=/weft pnpm --filter weft-web build`
      4. assert `examples/weft-web/build/index.html` exists
      5. assert `examples/weft-web/build/404.html` exists
      6. assert built HTML references `/weft/_app/` paths
    Expected Result: Workflow lint-clean; local build reproduces CI output
    Failure Indicators: actionlint errors; missing 404.html; wrong base path in built HTML
    Evidence: .sisyphus/evidence/task-27-build-output.txt

  Scenario: Deployed site loads on GitHub Pages (post-merge manual check)
    Tool: Playwright
    Preconditions: Workflow run complete; Pages environment populated
    Steps:
      1. goto('https://<org>.github.io/weft/')
      2. waitForSelector('[data-testid="landing-hero"]')
      3. click link to /walkthrough
      4. expect(url()).toContain('/weft/walkthrough')
    Expected Result: Site loads; routing works with base path
    Evidence: .sisyphus/evidence/task-27-deployed.png
  ```

  **Commit**: YES
  - Message: `ci(weft-web): GitHub Actions deploy to Pages`
  - Files: `.github/workflows/deploy-weft-web.yml`, `examples/weft-web/svelte.config.js` (BASE_PATH wiring), `examples/weft-web/static/404.html`
  - Pre-commit: `actionlint .github/workflows/deploy-weft-web.yml`

- [x] 28. **README + architecture docs + honest framing**

  **What to do**:
  - Create `examples/weft-web/README.md` with: project intent, quickstart, dev commands, browser support matrix, architecture overview
  - Create `examples/weft-web/docs/architecture.md` describing: worker topology, CryptoEngine abstraction, phase-to-route mapping, build pipeline
  - Create `examples/weft-web/docs/honest-framing.md` with explicit disclosures:
    - Simulated vs production committee (5 workers in one browser ≠ geographically distributed ciphernodes)
    - No on-chain component — ciphertexts not published to Ethereum
    - No RISC Zero proof — secure process reimplemented in WASM for display
    - Parameters match Interfold `SECURE_THRESHOLD_8192` preset but production uses different trust model
    - Demo uses seeded randomness for parity testing — production must use fresh entropy
  - Browser support matrix: Chrome ≥ 90, Firefox ≥ 89, Safari ≥ 15 (WASM + Workers + top-level await)
  - Dev instructions: `pnpm install`, `pnpm --filter weft-web dev`, how to rebuild WASM
  - Link to Interfold docs and upstream `fhe.rs`
  - Add visible "About this demo" section on landing page linking to honest-framing doc

  **Must NOT do**:
  - Do NOT claim "production-ready" or "bulletproof"
  - Do NOT hide the simulated-committee disclosure — must be linked from landing page
  - Do NOT use marketing language — technical accuracy over polish
  - Do NOT duplicate AGENTS.md content — link to it for contributor guidance

  **Recommended Agent Profile**:
  - **Category**: `writing` — Pure documentation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T22 (sandbox must exist to document), T24 (engine must exist to document)

  **References**:
  - Repo-root `README.md` — tone + structure reference
  - `AGENTS.md` §"Known Constraints and Gotchas" — honest framing seed content
  - `secure-process/examples/threshold_demo.rs` — canonical flow to mirror in architecture doc
  - Interfold docs: https://docs.theinterfold.com

  **Acceptance Criteria**:
  - [ ] `examples/weft-web/README.md` present with all required sections
  - [ ] `docs/architecture.md` covers topology, engine, build
  - [ ] `docs/honest-framing.md` lists all 5 disclosure items verbatim
  - [ ] Landing page UI links to honest-framing doc
  - [ ] Browser support matrix is concrete (not "modern browsers")
  - [ ] Markdown linter (`markdownlint`) passes

  **QA Scenarios**:

  ```
  Scenario: Honest framing disclosures are complete and discoverable
    Tool: Bash
    Preconditions: Docs written
    Steps:
      1. grep for each disclosure item in `docs/honest-framing.md`:
         - "simulated", "no on-chain", "no RISC Zero", "seeded randomness", "production"
      2. verify landing page source references `/docs/honest-framing` or equivalent
      3. run `markdownlint examples/weft-web/docs examples/weft-web/README.md`
    Expected Result: All 5 disclosures present; landing page links; lint clean
    Failure Indicators: Missing disclosure; no landing-page link; lint errors
    Evidence: .sisyphus/evidence/task-28-docs-check.log

  Scenario: Landing page surfaces honest framing
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. goto('/')
      2. expect(textContent('[data-testid="about-demo"]')).toContain('simulated')
      3. click('[data-testid="honest-framing-link"]')
      4. expect(url()).toContain('honest-framing')
      5. screenshot
    Expected Result: Honest framing reachable in ≤2 clicks from landing
    Evidence: .sisyphus/evidence/task-28-landing-framing.png
  ```

  **Commit**: YES
  - Message: `docs(weft-web): README, architecture, and honest framing`
  - Files: `examples/weft-web/README.md`, `examples/weft-web/docs/architecture.md`, `examples/weft-web/docs/honest-framing.md`, `examples/weft-web/src/routes/+page.svelte` (landing link)
  - Pre-commit: `markdownlint examples/weft-web/docs examples/weft-web/README.md`

- [x] 29. **Accessibility WCAG 2.2 AA pass**

  **What to do**:
  - Integrate `@axe-core/playwright` into E2E suite (T25) — scan every walkthrough phase and sandbox
  - Fix all AA violations surfaced by axe
  - Manual keyboard-only traversal of entire walkthrough (no mouse) — add `skip to content` link, logical tab order, visible focus rings
  - Screen reader pass with VoiceOver (macOS) or NVDA (Windows) — verify ARIA labels on illustrations, phase progress, attacker panel
  - Respect `prefers-reduced-motion: reduce` — disable phase transitions, ciphertext scramble animations
  - Respect `prefers-contrast: more` — swap tokens to high-contrast palette (T4 must define both)
  - Color contrast: all text ≥ 4.5:1, large text ≥ 3:1, UI components ≥ 3:1
  - All illustrations have meaningful `<title>`/`<desc>` (SVG) or `alt` text, or are marked `aria-hidden` if purely decorative
  - All interactive controls have accessible names (button text or `aria-label`)
  - Forms in sandbox have associated labels
  - Progressive disclosure toggles announce state changes (`aria-expanded`)

  **Must NOT do**:
  - Do NOT rely solely on axe — include manual keyboard + SR verification
  - Do NOT use `aria-hidden="true"` on interactive elements
  - Do NOT suppress axe violations without documented justification
  - Do NOT remove illustrations for a11y — describe them instead

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering` — A11y is deeply tied to UI implementation; requires design + implementation skills
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Design-level understanding of contrast, focus, and motion tokens

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: None
  - **Blocked By**: T17-T22 (all UI phases + sandbox must exist to audit)

  **References**:
  - WCAG 2.2 AA: https://www.w3.org/TR/WCAG22/
  - axe-core rules: https://dequeuniversity.com/rules/axe/
  - `@axe-core/playwright`: https://github.com/dequelabs/axe-core-npm
  - MDN `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
  - `examples/weft-web/src/lib/tokens.css` (T4) — contrast palette source (CSS custom properties; high-contrast overrides go here via `@media (prefers-contrast: more)`)

  **Acceptance Criteria**:
  - [ ] `pnpm --filter weft-web test:a11y` runs axe on all routes
  - [ ] Zero `critical` or `serious` axe violations on walkthrough, sandbox, landing
  - [ ] Keyboard-only walkthrough completes (verified in T25 scenario)
  - [ ] `prefers-reduced-motion` disables all non-essential animation
  - [ ] `prefers-contrast: more` swaps palette successfully
  - [ ] All SVG illustrations have title/desc or aria-hidden
  - [ ] Progressive disclosure controls have `aria-expanded`
  - [ ] A11y report saved `.sisyphus/evidence/task-29-axe-report.json`

  **QA Scenarios**:

  ```
  Scenario: axe passes on all routes with zero serious+ violations
    Tool: Bash
    Preconditions: Dev server running; axe integrated into Playwright
    Steps:
      1. run `pnpm --filter weft-web test:a11y`
      2. parse `.sisyphus/evidence/task-29-axe-report.json`
      3. assert `report.violations.filter(v => v.impact in ['serious','critical']).length === 0`
      4. assert routes covered: /, /walkthrough/1..8, /sandbox
    Expected Result: Zero serious/critical violations across all routes
    Failure Indicators: Any serious/critical violation; missing route coverage
    Evidence: .sisyphus/evidence/task-29-axe-report.json

  Scenario: Reduced motion is respected
    Tool: Playwright
    Preconditions: Playwright emulates `prefers-reduced-motion: reduce`
    Steps:
      1. setEmulatedMedia({ reducedMotion: 'reduce' })
      2. goto('/walkthrough/6-aggregate')
      3. trigger phase animation
      4. measure animation duration via CSS computed style
      5. expect(computedAnimationDuration).toBeLessThan(100) // ms
    Expected Result: Animations shortened or disabled under reduced-motion
    Evidence: .sisyphus/evidence/task-29-reduced-motion.png

  Scenario: Screen reader announces phase changes
    Tool: Playwright
    Preconditions: Walkthrough open; live region configured
    Steps:
      1. advance from phase 3 to phase 4
      2. read `[aria-live="polite"]` content
      3. expect it to contain phase 4 title
    Expected Result: Phase change is announced via live region
    Evidence: .sisyphus/evidence/task-29-aria-live.log
  ```

  **Commit**: YES
  - Message: `feat(weft-web): WCAG 2.2 AA accessibility pass`
  - Files: `examples/weft-web/tests/a11y/**`, `examples/weft-web/src/lib/tokens.css` (contrast variants via `@media (prefers-contrast: more)`), `examples/weft-web/src/app.css` (reduced-motion queries), updates across `src/lib/components/**` and `src/routes/**` for ARIA fixes
  - Pre-commit: `pnpm --filter weft-web test:a11y`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`

  Read this plan end-to-end. For each "Must Have": verify implementation exists (inspect file, run build command, execute script). For each "Must NOT Have" guardrail: search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables list against plan.

  Specific checks:
  - Confirm no hardcoded BFV params (grep for literal 131072, 8192 outside preset-loading code)
  - Confirm no `SharedArrayBuffer` usage (grep)
  - Confirm no `as any` without justification comment
  - Confirm insecure preset gated behind `#[cfg]`
  - Confirm honest disclosure copy present in Phase 1 and Sandbox

  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`

  Run `pnpm --filter weft-web lint`, `pnpm --filter weft-web check` (svelte-check), `cargo check --target wasm32-unknown-unknown -p fhe-wasm`, `cargo clippy -p fhe-wasm`, `vitest run`, `wasm-pack test --headless --chrome`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in production, commented-out code, unused imports, AI slop (excessive comments, over-abstraction, generic names like `data`/`result`/`item`/`temp`).

  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Unit tests [N pass/N fail] | WASM tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)

  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Cross-browser: Chrome + Firefox + Safari desktop. Test cross-task integration (phases chained, sandbox after walkthrough, re-runs). Test edge cases: 2-client round, 10-client round, zero-magnitude gradient, negative gradient, rapid phase navigation, page refresh mid-walkthrough. Save to `.sisyphus/evidence/final-qa/`.

  Also verify on reference hardware (or closest approximation):
  - Cold start <6s
  - Full E2E <30s
  - Bundle sizes within budget (measure with `gzip -9 | wc -c`)

  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | Browsers [3/3] | Perf [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`

  For each task: read "What to do", read actual diff (`git log`/`git diff`). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination (Task N touching Task M's files without declared dependency). Flag unaccounted changes to existing `secure-process/`, `client/`, `coordinator/`, `contracts/` directories (those are out of scope for this plan — only NEW files under `examples/weft-web/` should be added).

  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- Group commits per task unless explicitly noted otherwise
- Conventional Commits: `type(scope): description`
- Scope prefixes: `weft-web`, `fhe-wasm`, `weft-web-ui`, `weft-web-crypto`, `weft-web-content`, `weft-web-ci`
- Examples:
  - `feat(weft-web): scaffold SvelteKit with adapter-static and gh-pages base path`
  - `feat(fhe-wasm): strip rayon from fhe.rs fork, add wasm32 target support`
  - `feat(weft-web-crypto): WasmCryptoEngine with 5-worker committee topology`
  - `test(fhe-wasm): parity fixtures for encrypt/add/threshold-decrypt`
- Pre-commit: run the task-specific verification command (build / lint / test)

---

## Success Criteria

### Verification Commands

```bash
# Build succeeds
pnpm --filter weft-web build  # Expected: no errors, build/ populated

# Bundle size enforcement
find examples/weft-web/build -name "*.js" -exec gzip -9 -c {} \; | wc -c
# Expected: initial route JS+CSS ≤ 400 KB gzip

find examples/weft-web/build -name "*.wasm" -exec gzip -9 -c {} \; | wc -c
# Expected: wasm ≤ 8 MB gzip

# Rust tests pass natively
cargo test -p fhe-wasm --release

# WASM tests pass headless
wasm-pack test --headless --chrome examples/weft-web/crates/fhe-wasm

# Parity passes
pnpm --filter weft-web test:parity
# Expected: ≥20 vectors pass, 0 mismatches

# E2E passes
pnpm --filter weft-web test:e2e
# Expected: full walkthrough completes in <60s per browser, no failures

# Deploy dry-run
pnpm --filter weft-web preview
# Expected: guided walkthrough and sandbox usable at http://localhost:4173/weft/
```

### Final Checklist

- [ ] All "Must Have" present (verified by F1)
- [ ] All "Must NOT Have" absent (verified by F1)
- [ ] Build artifacts within size budgets (verified by F3)
- [ ] Parity tests pass (verified by F2 via WASM test run)
- [ ] Full E2E passes in Chrome + Firefox (verified by F3)
- [ ] GitHub Pages deploy succeeds (verified by F3 visiting live URL)
- [ ] Honest disclosure copy present (verified by F1)
- [ ] No out-of-scope touches to `secure-process/`, `client/`, `coordinator/`, `contracts/` (verified by F4)
- [ ] User's explicit "okay" received after reviewing F1–F4 results
