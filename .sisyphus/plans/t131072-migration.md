# Migration: Bitplane Encoding → Standard Coefficient Encoding (t=131072)

## TL;DR

> **Quick Summary**: Remove bitplane tally encoding (workaround for t=100) and revert to standard one-coefficient-per-gradient BFV encoding, now that The Interfold upgraded to t=131,072 via PR #1520. This simplifies the codebase and yields 14× fewer ciphertexts per client.
> 
> **Deliverables**:
> - All bitplane encode/decode code removed from Rust, TypeScript, and Solidity
> - Standard two's-complement gradient encoding throughout
> - Updated overflow invariant: `n_max × S × G < t/2`
> - All tests passing with new encoding
> - Both demos updated and working
> - README updated with new constants and encoding explanation
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (update /tmp/enclave) → Task 2 (Rust constants) → Task 5 (Rust tests) → Task 10 (demos)

---

## Context

### Original Request
The Interfold upgraded BFV parameters in PR #1520, changing the plaintext modulus from t=100 to t=131,072 (2^17). The user wants to update WEFT to leverage this larger plaintext space by removing the bitplane tally encoding workaround and reverting to standard coefficient encoding.

### Interview Summary
**Key Discussions**:
- Scaling analysis confirmed 14× improvement in chunks/bandwidth/decryptions when dropping bitplane
- Noise budget is not a constraint for addition-only BFV (effectively unlimited)
- Crossover analysis: standard encoding works for any t ≥ 81,921 at S=4096, n_max=10, G=1.0
- New client limit under standard encoding: 16 (sufficient for demo's 10)
- `fhe_processor` in lib.rs needs NO changes — it just sums ciphertexts

**Research Findings**:
- PR #1520 parameters: PLAINTEXT_MODULUS=131072, 3 CRT moduli (was 4), NUM_PARTIES=7 (was 100)
- 11 files need modification, exact line numbers identified by explore agent
- Insecure preset (t=100) is unchanged upstream

### Metis Review
**Identified Gaps** (addressed):
- **S=4096 vs S=2^20 discrepancy**: AGENTS.md spec says S=2^20 but codebase uses S=4096. The codebase is canonical — S=4096 was a deliberate implementation choice. Overflow check passes: 10 × 4096 × 1 = 40,960 < 65,536 ✓
- **Insecure preset test strategy**: Insecure preset still has t=100. Tests that use real FHE with insecure preset will use smaller SCALE_FACTOR or mock t values to keep standard encoding valid. Integration tests already use insecure preset for BFV operations — they'll need adjusted constants.
- **No persisted bitplane data**: No fixture files or cached ciphertexts exist — safe to change encoding.
- **Wire format unchanged**: The `(bytes[], uint256)` ABI encoding between contract and secure-process is encoding-agnostic — ciphertexts are opaque bytes.

---

## Work Objectives

### Core Objective
Remove bitplane tally encoding and revert to standard one-coefficient-per-gradient BFV encoding, leveraging the new t=131,072 plaintext modulus.

### Concrete Deliverables
- Updated constants in `constants.ts`, `constants.rs`, `FLAggregator.sol`
- Removed `encodeBitplane`, `decodeBitplane`, `encode_bitplane`, `decode_bitplane` and all call sites
- Removed `BITS_PER_GRADIENT`, `GRADIENTS_PER_CT` constants
- Standard two's-complement quantize/dequantize in TypeScript and Rust
- Updated overflow invariant: `n_max × S × G < t/2` (was `numClients < t/2`)
- All tests rewritten for standard encoding
- Both demos (run-round.ts, threshold_demo.rs) updated
- README updated
- `scripts/bitplane-prototype.ts` deleted
- `/tmp/enclave` updated to latest main

### Definition of Done
- [ ] `npx vitest run --dir client/tests` passes
- [ ] `cargo test --manifest-path secure-process/Cargo.toml` passes
- [ ] `forge test --root contracts` passes
- [ ] `npx tsx scripts/run-round.ts` runs to completion
- [ ] `cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml` runs to completion
- [ ] `grep -rn "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" --include="*.ts" --include="*.rs" --include="*.sol" .` returns empty (excluding AGENTS.md, git history)
- [ ] `grep -rn "PLAINTEXT_MODULUS.*=.*100[^0-9]" --include="*.ts" --include="*.rs" --include="*.sol" .` returns empty (no hardcoded t=100 outside insecure-preset test contexts)

### Must Have
- Standard two's-complement encoding: negative `-x` stored as `t - x`, decoded with `if val > t/2 then val -= t`
- Runtime overflow invariant check: `n_max × S × G < t/2`
- Correct gradient round-trip within `±1/S ≈ ±2.4e-4` precision
- Negative gradient correctness (e.g., -0.5 round-trips correctly)

### Must NOT Have (Guardrails)
- Do NOT change `fhe_processor` public signature or ciphertext addition logic in `lib.rs`
- Do NOT modify anything in `/tmp/enclave` — only pull latest
- Do NOT define custom BFV parameters — use the preset
- Do NOT hardcode t — read from preset at runtime (AGENTS.md constraint)
- Do NOT divide by n inside the encrypted domain
- Do NOT add new features, optimizations, or abstractions during this migration
- Do NOT rearchitect test harness — update values in place
- Do NOT change the `(bytes[], uint256)` ABI wire format
- Do NOT update NUM_PARTIES/CRT/security lambda concerns — those are upstream

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest for TS, cargo test for Rust, Foundry for Solidity)
- **Automated tests**: Tests-after (rewriting existing tests for new encoding)
- **Framework**: Vitest (TS), cargo test (Rust), Foundry/forge (Solidity)

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Rust tests**: Use Bash — `cargo test` with specific test names
- **TS tests**: Use Bash — `npx vitest run` with specific test files
- **Solidity tests**: Use Bash — `forge test` with specific test contracts
- **Demos**: Use Bash — run scripts and verify output contains expected values
- **Cleanup verification**: Use Bash — grep for bitplane residue

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — update deps and constants):
├── Task 1: Update /tmp/enclave to latest main [quick]
├── Task 2: Update Rust constants.rs — remove bitplane, add standard encoding [quick]
├── Task 3: Update TypeScript constants.ts — remove bitplane constants [quick]
├── Task 4: Update Solidity FLAggregator.sol — new PLAINTEXT_MOD and invariant [quick]

Wave 2 (Core encoding + tests — after Wave 1):
├── Task 5: Rewrite Rust integration tests for standard encoding (depends: 2) [unspecified-high]
├── Task 6: Rewrite TS encrypt.ts — standard quantize/dequantize (depends: 3) [unspecified-high]
├── Task 7: Rewrite TS encrypt.test.ts (depends: 6) [unspecified-high]
├── Task 8: Update coordinator round.ts — standard decode (depends: 3) [quick]
├── Task 9: Update Solidity test FLAggregator.t.sol (depends: 4) [quick]

Wave 3 (Demos, docs, cleanup — after Wave 2):
├── Task 10: Rewrite threshold_demo.rs for standard encoding (depends: 2) [unspecified-high]
├── Task 11: Rewrite run-round.ts demo (depends: 6, 8) [unspecified-high]
├── Task 12: Update README.md (depends: all) [writing]
├── Task 13: Delete bitplane-prototype.ts + final grep cleanup (depends: all) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 5, 10 |
| 2 | 1 | 5, 10 |
| 3 | — | 6, 7, 8, 11 |
| 4 | — | 9 |
| 5 | 2 | 10 |
| 6 | 3 | 7, 11 |
| 7 | 6 | — |
| 8 | 3 | 11 |
| 9 | 4 | — |
| 10 | 2, 5 | — |
| 11 | 6, 8 | — |
| 12 | all | — |
| 13 | all | — |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1→`quick`, T2→`quick`, T3→`quick`, T4→`quick`
- **Wave 2**: 5 tasks — T5→`unspecified-high`, T6→`unspecified-high`, T7→`unspecified-high`, T8→`quick`, T9→`quick`
- **Wave 3**: 4 tasks — T10→`unspecified-high`, T11→`unspecified-high`, T12→`writing`, T13→`quick`
- **FINAL**: 4 tasks — F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. Update /tmp/enclave to latest main

  **What to do**:
  - Run `cd /tmp/enclave && git pull origin main` to get PR #1520 changes
  - Verify the new parameters are present: `grep "PLAINTEXT_MODULUS" /tmp/enclave/crates/fhe-params/src/constants.rs` should show `131072`
  - Verify `Cargo.toml` in secure-process still correctly references `/tmp/enclave/crates/` paths

  **Must NOT do**:
  - Do NOT modify any files in /tmp/enclave
  - Do NOT change branch — stay on main

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 2, 5, 10
  - **Blocked By**: None

  **References**:
  - `/tmp/enclave/crates/fhe-params/src/constants.rs` — New parameter values to verify (PLAINTEXT_MODULUS=131072, 3 moduli, NUM_PARTIES=7)
  - `/home/dev/repo/secure-process/Cargo.toml` — Has `path = "/tmp/enclave/crates/..."` dependencies

  **Acceptance Criteria**:

  **QA Scenarios:**

  ```
  Scenario: Verify new parameters present after pull
    Tool: Bash
    Preconditions: /tmp/enclave exists as a git clone
    Steps:
      1. Run: cd /tmp/enclave && git pull origin main
      2. Run: grep "PLAINTEXT_MODULUS" /tmp/enclave/crates/fhe-params/src/constants.rs
      3. Assert output contains "131072"
      4. Run: grep -c "MODULI" /tmp/enclave/crates/fhe-params/src/constants.rs
      5. Assert moduli array has 3 entries
    Expected Result: Pull succeeds, PLAINTEXT_MODULUS=131072 confirmed
    Failure Indicators: Pull fails, PLAINTEXT_MODULUS still shows 100
    Evidence: .sisyphus/evidence/task-1-enclave-pull.txt
  ```

  **Commit**: NO (infrastructure step)

- [x] 2. Update Rust constants.rs — remove bitplane, add standard encoding helpers

  **What to do**:
  - Remove `BITS_PER_GRADIENT` constant and its calculation
  - Remove `encode_bitplane()` function entirely
  - Remove `decode_bitplane()` function entirely
  - Remove bitplane-related unit tests in the `#[cfg(test)]` block
  - Update `validate_overflow_invariant()` to enforce the standard invariant: `(num_clients as u64) * SCALE_FACTOR * MAX_GRAD_INT < plaintext_modulus / 2`. Update the error message to remove "Bitplane" wording.
  - Add `quantize_gradient(grad: f64) -> i64` — clamp to [-G,G], multiply by S, round to integer
  - Add `dequantize_gradient(val: i64, num_clients: u64) -> f64` — return `val as f64 / (num_clients as f64 * SCALE_FACTOR as f64)`
  - Add `encode_coefficient(grad_int: i64, plaintext_modulus: u64) -> u64` — two's complement: if negative, return `plaintext_modulus - |grad_int|`
  - Add `decode_coefficient(coeff: u64, plaintext_modulus: u64) -> i64` — if coeff > t/2, return `coeff as i64 - plaintext_modulus as i64`
  - Keep `SCALE_FACTOR = 4096`, `MAX_CLIENTS = 10`, `MAX_GRAD_ABS = 1.0`, `MAX_GRAD_INT`
  - Add standard encoding unit tests: quantize round-trip, negative values, zero, clamping, overflow invariant pass/fail

  **Must NOT do**:
  - Do NOT change SCALE_FACTOR value
  - Do NOT add any new external crate dependencies
  - Do NOT change the public API used by lib.rs (fhe_processor is encoding-agnostic)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5, 10
  - **Blocked By**: Task 1 (needs updated /tmp/enclave for cargo check)

  **References**:
  - `/home/dev/repo/secure-process/src/constants.rs` — Current file with bitplane functions to remove, lines 25-85
  - `/home/dev/repo/secure-process/src/constants.rs:13-23` — Constants to keep (SCALE_FACTOR, MAX_CLIENTS, etc.)
  - `/home/dev/repo/secure-process/src/constants.rs:43-57` — Current `validate_overflow_invariant` — change from `num_clients < half_t` to `num_clients * S * G < half_t`
  - AGENTS.md §Gradient Encoding — "Represent negatives as `t - |grad_int|` (two's complement modulo t)"

  **Acceptance Criteria**:
  - [ ] `cargo test --manifest-path secure-process/Cargo.toml` passes
  - [ ] No `bitplane` references in constants.rs
  - [ ] No `BITS_PER_GRADIENT` in constants.rs

  **QA Scenarios:**

  ```
  Scenario: Standard encoding round-trip for positive gradient
    Tool: Bash
    Preconditions: Task 1 complete (enclave updated)
    Steps:
      1. Run: cargo test --manifest-path secure-process/Cargo.toml -- test_quantize_positive 2>&1
      2. Assert exit code 0
    Expected Result: Test passes — gradient 0.5 quantizes to 2048, encodes to 2048, decodes back to 0.5
    Failure Indicators: Test fails or panics
    Evidence: .sisyphus/evidence/task-2-rust-tests.txt

  Scenario: Standard encoding round-trip for negative gradient
    Tool: Bash
    Steps:
      1. Run: cargo test --manifest-path secure-process/Cargo.toml -- test_quantize_negative 2>&1
      2. Assert exit code 0
    Expected Result: gradient -0.5 quantizes to -2048, encodes to t-2048=129024, decodes back to -0.5
    Failure Indicators: Test fails
    Evidence: .sisyphus/evidence/task-2-rust-negative.txt

  Scenario: Overflow invariant rejects bad config
    Tool: Bash
    Steps:
      1. Run: cargo test --manifest-path secure-process/Cargo.toml -- test_overflow_rejects 2>&1
      2. Assert exit code 0
    Expected Result: validate_overflow_invariant(131072, 17) panics (17*4096*4096 > 65536)
    Failure Indicators: Test doesn't panic as expected
    Evidence: .sisyphus/evidence/task-2-overflow.txt
  ```

  **Commit**: YES (groups with Task 3, 4)
  - Message: `refactor(weft): replace bitplane encoding with standard coefficient encoding`
  - Files: `secure-process/src/constants.rs`

- [x] 3. Update TypeScript constants.ts — remove bitplane constants, update overflow invariant

  **What to do**:
  - Change `PLAINTEXT_MODULUS` from `100n` to `131072n`
  - Remove `BITS_PER_GRADIENT` constant and its calculation
  - Remove `GRADIENTS_PER_CT` constant and its calculation
  - Update `validateOverflowInvariant()` to enforce standard invariant: `BigInt(numClients) * BigInt(SCALE_FACTOR) * BigInt(SCALE_FACTOR) >= plaintextModulus / 2n` should throw. (Check is: `n * S * G_int < t/2` where G_int = S * G = 4096)
  - Update the error message to say "Standard overflow invariant violated" (not "Bitplane")
  - Keep `SCALE_FACTOR = 4096`, `MAX_CLIENTS = 10`, `MAX_GRAD_ABS = 1.0`, `DEFAULT_SLOTS_PER_CT = 8192`

  **Must NOT do**:
  - Do NOT change SCALE_FACTOR
  - Do NOT remove DEFAULT_SLOTS_PER_CT — it's still needed for chunking

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 6, 7, 8, 11
  - **Blocked By**: None

  **References**:
  - `/home/dev/repo/client/src/constants.ts` — Current file; line 46 has `PLAINTEXT_MODULUS = 100n`, lines 53-62 have BITS_PER_GRADIENT/GRADIENTS_PER_CT, lines 74-85 have validateOverflowInvariant
  - AGENTS.md §BFV Parameter Specification — overflow invariant formula: `n_max × S × G < t / 2`

  **Acceptance Criteria**:
  - [ ] No `BITS_PER_GRADIENT` or `GRADIENTS_PER_CT` in constants.ts
  - [ ] `PLAINTEXT_MODULUS` equals `131072n`
  - [ ] `validateOverflowInvariant` checks `n * S * MAX_GRAD_INT < t/2`

  **QA Scenarios:**

  ```
  Scenario: Constants file has no bitplane references
    Tool: Bash
    Steps:
      1. Run: grep -c "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" client/src/constants.ts
      2. Assert output is "0" or command exits with code 1 (no matches)
    Expected Result: Zero bitplane references
    Failure Indicators: Any matches found
    Evidence: .sisyphus/evidence/task-3-constants-clean.txt

  Scenario: PLAINTEXT_MODULUS is 131072n
    Tool: Bash
    Steps:
      1. Run: grep "PLAINTEXT_MODULUS" client/src/constants.ts
      2. Assert output contains "131072n"
    Expected Result: PLAINTEXT_MODULUS = 131072n
    Failure Indicators: Shows 100n or other value
    Evidence: .sisyphus/evidence/task-3-plaintext-mod.txt
  ```

  **Commit**: YES (groups with Task 2, 4)
  - Files: `client/src/constants.ts`

- [x] 4. Update Solidity FLAggregator.sol — PLAINTEXT_MOD=131072, standard overflow check — new PLAINTEXT_MOD and standard overflow invariant

  **What to do**:
  - Change `PLAINTEXT_MOD` from `100` to `131072`
  - Replace the overflow check in `validate()` from `if (uint256(numClients) >= PLAINTEXT_MOD / 2)` to `if (uint256(numClients) * uint256(scaleFactor) * uint256(maxGradInt) >= PLAINTEXT_MOD / 2)`
  - Update the comment above the check from "bitplane" to "standard overflow invariant: n × S × G_int < t/2"
  - Keep the `OverflowInvariantViolated` error name (it's still an overflow invariant, just different formula)

  **Must NOT do**:
  - Do NOT change the `IE3Program` interface
  - Do NOT change the `(bytes[], uint256)` ABI encoding for publishInput
  - Do NOT add new storage variables or events

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `/home/dev/repo/contracts/FLAggregator.sol:20` — `uint256 public constant PLAINTEXT_MOD = 100;`
  - `/home/dev/repo/contracts/FLAggregator.sol:80-85` — Current bitplane overflow check to replace
  - AGENTS.md §Component 2 — `validate` function spec with standard overflow invariant

  **Acceptance Criteria**:
  - [ ] `PLAINTEXT_MOD` equals `131072`
  - [ ] Overflow check uses `numClients * scaleFactor * maxGradInt >= PLAINTEXT_MOD / 2`

  **QA Scenarios:**

  ```
  Scenario: Contract compiles with new invariant
    Tool: Bash
    Steps:
      1. Run: cd contracts && forge build 2>&1
      2. Assert exit code 0
    Expected Result: Compilation succeeds
    Failure Indicators: Compilation errors
    Evidence: .sisyphus/evidence/task-4-forge-build.txt

  Scenario: No bitplane references in contract
    Tool: Bash
    Steps:
      1. Run: grep -ci "bitplane" contracts/FLAggregator.sol
      2. Assert output is "0"
    Expected Result: Zero bitplane references in contract
    Evidence: .sisyphus/evidence/task-4-no-bitplane.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Files: `contracts/FLAggregator.sol`

- [x] 5. Rewrite Rust integration tests for standard encoding

  **What to do**:
  - Update `const PLAINTEXT_MODULUS: u64 = 100` to read from the BFV preset or use `131072`
  - Replace all `encode_bitplane`/`decode_bitplane` calls with standard `encode_coefficient`/`decode_coefficient` from updated constants.rs
  - Rewrite test vectors: 3 clients with known gradients → encode each as standard coefficients → encrypt → run fhe_processor → decrypt → decode with two's-complement → verify sum matches expected within ±1/S
  - Test cases to cover: (a) single chunk with positive gradients, (b) negative gradients, (c) zero gradients, (d) mixed positive/negative, (e) max gradient value G=1.0
  - Update overflow invariant test assertions

  **Must NOT do**:
  - Do NOT change fhe_processor logic in lib.rs
  - Do NOT change the test harness structure — just update values and encoding calls

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Task 10
  - **Blocked By**: Task 2 (needs new constants.rs functions)

  **References**:
  - `/home/dev/repo/secure-process/tests/integration.rs` — Current test file; line 22 has `PLAINTEXT_MODULUS = 100`, uses encode_bitplane throughout
  - `/home/dev/repo/secure-process/src/constants.rs` — New standard encoding functions from Task 2
  - `/home/dev/repo/secure-process/src/lib.rs` — `fhe_processor` signature and behavior (encoding-agnostic, just sums ciphertexts)

  **Acceptance Criteria**:
  - [ ] `cargo test --manifest-path secure-process/Cargo.toml` passes all tests
  - [ ] No `encode_bitplane` or `decode_bitplane` in integration.rs

  **QA Scenarios:**

  ```
  Scenario: All Rust tests pass with standard encoding
    Tool: Bash
    Steps:
      1. Run: cargo test --manifest-path secure-process/Cargo.toml 2>&1
      2. Assert exit code 0
      3. Assert output contains "test result: ok"
    Expected Result: All tests pass
    Failure Indicators: Any test failure or compilation error
    Evidence: .sisyphus/evidence/task-5-rust-tests.txt

  Scenario: Negative gradient round-trip through FHE
    Tool: Bash
    Steps:
      1. Run: cargo test --manifest-path secure-process/Cargo.toml -- test_negative_gradients 2>&1
      2. Assert output contains "ok"
    Expected Result: Gradient -0.5 from 3 clients sums to -1.5 within ±1/4096 precision
    Failure Indicators: Precision exceeds threshold or sign is wrong
    Evidence: .sisyphus/evidence/task-5-negative-roundtrip.txt
  ```

  **Commit**: YES
  - Message: `test(weft): rewrite Rust integration tests for standard coefficient encoding`
  - Files: `secure-process/tests/integration.rs`

- [x] 6. Rewrite TypeScript encrypt.ts — standard quantize/dequantize

  **What to do**:
  - Remove `encodeBitplane()` function entirely
  - Remove `decodeBitplane()` function entirely
  - Remove `bitsNeeded()` helper if it exists
  - Remove imports of `BITS_PER_GRADIENT`, `GRADIENTS_PER_CT`
  - Rewrite `quantizeGradients(gradients: Float32Array, scaleFactor, maxGradAbs, plaintextModulus)`:
    - Clamp each gradient to [-G, G]
    - Quantize: `gradInt = Math.round(grad * scaleFactor)`
    - Two's complement: if `gradInt < 0`, store as `plaintextModulus + gradInt` (i.e. `t - |gradInt|`)
    - Return array of BigInt coefficients, one per gradient
  - Rewrite `dequantizeGradients(coefficients: bigint[], numClients, scaleFactor, plaintextModulus)`:
    - Two's complement unwrap: if `coeff > plaintextModulus / 2n`, then `val = coeff - plaintextModulus`
    - Dequantize: `gradFloat = Number(val) / (numClients * scaleFactor)`
    - Return Float32Array
  - Update `splitIntoChunks()` to chunk by `DEFAULT_SLOTS_PER_CT` (8192) coefficients per chunk (not `GRADIENTS_PER_CT`)
  - Update `encryptGradients()` to call new quantize function and use standard chunking
  - Keep `clampGradient()` helper
  - Keep `resolvePlaintextModulus()` — update fallback to 131072n

  **Must NOT do**:
  - Do NOT change the function signatures that are used by submit.ts or coordinator
  - Do NOT change the BFV encryption call pattern

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7, 8, 9)
  - **Blocks**: Tasks 7, 11
  - **Blocked By**: Task 3 (needs updated constants.ts)

  **References**:
  - `/home/dev/repo/client/src/encrypt.ts` — Current file with encodeBitplane (lines 44-58), decodeBitplane (lines 66-78), quantizeGradients (lines 87-99), dequantizeGradients (lines 108-131), encryptGradients (lines 152-173)
  - `/home/dev/repo/client/src/constants.ts` — Updated constants from Task 3 (PLAINTEXT_MODULUS=131072n, no BITS_PER_GRADIENT)
  - AGENTS.md §Client SDK §src/encrypt.ts — Standard encoding spec: clamp, quantize, two's complement, chunk by N=8192

  **Acceptance Criteria**:
  - [ ] No `encodeBitplane` or `decodeBitplane` in encrypt.ts
  - [ ] `quantizeGradients` produces one coefficient per gradient
  - [ ] Negative gradients encoded as `t - |x|`

  **QA Scenarios:**

  ```
  Scenario: No bitplane functions remain
    Tool: Bash
    Steps:
      1. Run: grep -c "encodeBitplane\|decodeBitplane\|bitsNeeded" client/src/encrypt.ts
      2. Assert output is "0" or exit code 1
    Expected Result: Zero bitplane function references
    Evidence: .sisyphus/evidence/task-6-no-bitplane.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run: npx tsc --noEmit --project client/tsconfig.json 2>&1 (or equivalent)
      2. Assert no type errors
    Expected Result: Clean compilation
    Evidence: .sisyphus/evidence/task-6-compile.txt
  ```

  **Commit**: YES
  - Files: `client/src/encrypt.ts`

- [x] 7. Rewrite TypeScript encrypt.test.ts for standard encoding

  **What to do**:
  - Remove all `encodeBitplane`/`decodeBitplane` test cases
  - Add tests for new `quantizeGradients`:
    - Positive gradient 0.5 → coefficient 2048
    - Negative gradient -0.5 → coefficient 131072 - 2048 = 129024
    - Zero gradient → coefficient 0
    - Gradient at clamp boundary 1.0 → coefficient 4096
    - Gradient beyond clamp 1.5 → clamped to 1.0 → coefficient 4096
  - Add tests for `dequantizeGradients`:
    - Coefficient 2048 with n=1 → gradient 0.5
    - Coefficient 129024 (negative) with n=1 → gradient -0.5
    - Sum of 3 clients: coefficient 6144 with n=3 → gradient 0.5
  - Update `validateOverflowInvariant` tests:
    - `validateOverflowInvariant(131072n, 10)` should pass (10*4096*4096 = 167,772,160... wait, that's wrong)
    - Actually: the invariant is `n * S * G_int < t/2` where G_int = MAX_GRAD_INT = S * G = 4096. So `10 * 4096 * 4096`? No — re-read. The invariant from AGENTS.md is `n_max × S × G < t/2`. With S=4096, G=1.0: `n * 4096 * 1.0 < 65536` → `n < 16`. So the TS check should be `BigInt(numClients) * BigInt(SCALE_FACTOR) * BigInt(Math.round(MAX_GRAD_ABS)) < plaintextModulus / 2n`. Wait, G is 1.0 not 4096. Let me re-derive: max single-client value = S × G = 4096. Sum of n clients = n × 4096. Must be < t/2 = 65536. So n < 16.
    - Test: `validateOverflowInvariant(131072n, 15)` passes, `validateOverflowInvariant(131072n, 16)` throws
  - Add round-trip test: quantize → dequantize should recover original within ±1/S

  **Must NOT do**:
  - Do NOT restructure the test file — update test cases in place

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 6 (needs new encrypt.ts functions)

  **References**:
  - `/home/dev/repo/client/tests/encrypt.test.ts` — Current test file; lines 146-159 have validateOverflowInvariant tests expecting t/2=50 boundaries
  - `/home/dev/repo/client/src/encrypt.ts` — New functions from Task 6
  - `/home/dev/repo/client/src/constants.ts` — Updated constants from Task 3

  **Acceptance Criteria**:
  - [ ] `npx vitest run --dir client/tests` passes all tests
  - [ ] No `encodeBitplane`/`decodeBitplane` in test file

  **QA Scenarios:**

  ```
  Scenario: All TS tests pass
    Tool: Bash
    Steps:
      1. Run: npx vitest run --dir client/tests 2>&1
      2. Assert exit code 0
      3. Assert output shows all tests passing
    Expected Result: All tests pass with standard encoding
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-vitest.txt

  Scenario: Negative gradient round-trip test exists and passes
    Tool: Bash
    Steps:
      1. Run: npx vitest run --dir client/tests -t "negative" 2>&1
      2. Assert at least one test matches and passes
    Expected Result: Negative gradient -0.5 round-trips correctly
    Evidence: .sisyphus/evidence/task-7-negative.txt
  ```

  **Commit**: YES
  - Files: `client/tests/encrypt.test.ts`

- [x] 8. Update coordinator round.ts — standard two's-complement decode

  **What to do**:
  - Update `dequantizeChunks()` (or equivalent decode function) to use standard two's-complement:
    - For each coefficient in the decrypted output: if `val > plaintextModulus / 2`, then `val = val - plaintextModulus`
    - Divide by `numClients * SCALE_FACTOR` to get the averaged gradient
  - Remove any imports of `BITS_PER_GRADIENT`, `GRADIENTS_PER_CT`, `decodeBitplane`
  - Update chunk count calculation: `numChunks = Math.ceil(gradientSize / DEFAULT_SLOTS_PER_CT)` (not dividing by GRADIENTS_PER_CT)
  - Update any comments referencing bitplane encoding

  **Must NOT do**:
  - Do NOT change the round lifecycle (request → activate → wait → collect → decode → update)
  - Do NOT change model.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 9)
  - **Blocks**: Task 11
  - **Blocked By**: Task 3 (needs updated constants)

  **References**:
  - `/home/dev/repo/coordinator/src/round.ts` — Decode logic with bitplane-aware dequantize
  - AGENTS.md §Component 4 §Negative Number Handling — `if (val > PLAINTEXT_MOD / 2n) val = val - PLAINTEXT_MOD`

  **Acceptance Criteria**:
  - [ ] No `bitplane` references in round.ts
  - [ ] Two's-complement decode present: `if (val > t/2) val -= t`

  **QA Scenarios:**

  ```
  Scenario: No bitplane references in coordinator
    Tool: Bash
    Steps:
      1. Run: grep -ci "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" coordinator/src/round.ts
      2. Assert output is "0" or exit code 1
    Expected Result: Zero bitplane references
    Evidence: .sisyphus/evidence/task-8-no-bitplane.txt
  ```

  **Commit**: YES
  - Files: `coordinator/src/round.ts`

- [x] 9. Update Solidity test FLAggregator.t.sol for new invariant

  **What to do**:
  - Update test params to reflect new PLAINTEXT_MOD=131072
  - Update overflow test: construct params where `numClients * scaleFactor * maxGradInt >= 131072 / 2 = 65536` and expect revert
  - Example: `_roundParams(16, 1, 4096, 4096, address(this))` should revert (16 * 4096 * 4096 = 268,435,456 >= 65536)
  - Update valid params test: `_roundParams(10, 1, 4096, 4096, address(this))` should pass (10 * 4096 * 4096 = 167,772,160... wait that's also >= 65536)
  - Re-derive: the Solidity check is `numClients * scaleFactor * maxGradInt >= PLAINTEXT_MOD / 2`. With S=4096 and maxGradInt=4096 (which is S*G=4096*1), 10 * 4096 * 4096 = 167M >> 65536. That can't be right.
  - **Correction**: maxGradInt in the contract is `G × S` as an integer = `1.0 × 4096 = 4096`. The invariant is `n × maxGradInt < t/2` which simplifies to `n × 4096 < 65536` → `n < 16`. The scaleFactor is already baked into maxGradInt. So the Solidity check should be: `uint256(numClients) * uint256(maxGradInt) >= PLAINTEXT_MOD / 2`. 
  - Actually re-reading AGENTS.md: `e3ProgramParams` encodes `(uint32 numClients, uint32 numChunks, uint32 scaleFactor, uint32 maxGradInt, address coordinator)` and the validate check is `uint256(numClients) * scaleFactor * maxGradInt < PLAINTEXT_MOD / 2`. With scaleFactor=4096 and maxGradInt=4096 (which is G*S), that gives 10 * 4096 * 4096 = 167M which is way more than 65536. This doesn't work.
  - **The issue**: AGENTS.md specifies maxGradInt = G × S = 4096. But the overflow invariant `n × S × G < t/2` is `n × 4096 < 65536` when you substitute S×G = 4096. The contract shouldn't multiply scaleFactor × maxGradInt again — maxGradInt already IS S×G. So the Solidity check should be: `uint256(numClients) * uint256(maxGradInt) >= PLAINTEXT_MOD / 2`.
  - Update test accordingly: `_roundParams(16, 1, 4096, 4096, address(this))` should revert since 16 * 4096 = 65536 >= 65536. And `_roundParams(15, 1, 4096, 4096, address(this))` should pass since 15 * 4096 = 61440 < 65536.

  **Must NOT do**:
  - Do NOT change test infrastructure or helpers
  - Do NOT add new test contracts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 7, 8)
  - **Blocks**: None
  - **Blocked By**: Task 4 (needs updated contract)

  **References**:
  - `/home/dev/repo/contracts/test/FLAggregator.t.sol` — Current test; lines 74-79 use `_roundParams(100, 1, 100, 100, ...)` with old t=100
  - `/home/dev/repo/contracts/FLAggregator.sol` — Updated contract from Task 4

  **Acceptance Criteria**:
  - [ ] `forge test --root contracts` passes all tests
  - [ ] Overflow rejection test uses new invariant formula

  **QA Scenarios:**

  ```
  Scenario: Solidity tests pass with new invariant
    Tool: Bash
    Steps:
      1. Run: forge test --root contracts -vv 2>&1
      2. Assert exit code 0
      3. Assert output contains "PASS"
    Expected Result: All Foundry tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-9-forge-test.txt
  ```

  **Commit**: YES
  - Files: `contracts/test/FLAggregator.t.sol`

- [x] 10. Rewrite threshold_demo.rs for standard encoding

  **What to do**:
  - Change `const PLAINTEXT_MODULUS: u64 = 100` to `131072`
  - Replace `encode_bitplane` calls with `encode_coefficient` from constants.rs
  - Replace `decode_bitplane` calls with `decode_coefficient` + `dequantize_gradient`
  - Update the narration text: remove bitplane explanations, explain standard coefficient encoding and two's-complement
  - Update the overflow invariant assertion from `num_clients < half_t` to `num_clients * SCALE_FACTOR * MAX_GRAD_INT < half_t`... correction: `MAX_CLIENTS as u64 * MAX_GRAD_INT < half_t` (since MAX_GRAD_INT = S * G already)
  - Update printed values and tables to reflect new encoding (1 coefficient per gradient, not 14)
  - Update the "what the committee sees" section — they see coefficient values mod t, not bit tallies
  - Keep the hospital gradient scenario narrative

  **Must NOT do**:
  - Do NOT change the FHE encryption/decryption flow — just the encode/decode wrappers
  - Do NOT add new scenarios or expand the demo

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 2, 5 (needs new constants and passing tests)

  **References**:
  - `/home/dev/repo/secure-process/examples/threshold_demo.rs` — Current demo; line 38 has `PLAINTEXT_MODULUS = 100`, uses encode_bitplane/decode_bitplane throughout, has hospital narrative
  - `/home/dev/repo/secure-process/src/constants.rs` — New encode_coefficient/decode_coefficient from Task 2

  **Acceptance Criteria**:
  - [ ] `cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml` completes
  - [ ] No `bitplane` references in threshold_demo.rs
  - [ ] Output shows standard encoding values (not bit tallies)

  **QA Scenarios:**

  ```
  Scenario: Threshold demo runs to completion with standard encoding
    Tool: Bash
    Steps:
      1. Run: cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml 2>&1
      2. Assert exit code 0
      3. Assert output contains "Privacy preserved" or equivalent success message
      4. Assert output does NOT contain "bitplane" or "bit-plane"
    Expected Result: Demo completes successfully showing standard coefficient encoding
    Failure Indicators: Panic, compilation error, or bitplane text in output
    Evidence: .sisyphus/evidence/task-10-threshold-demo.txt
  ```

  **Commit**: YES
  - Files: `secure-process/examples/threshold_demo.rs`

- [x] 11. Rewrite run-round.ts demo for standard encoding

  **What to do**:
  - Remove imports of `BITS_PER_GRADIENT`, `GRADIENTS_PER_CT`, `encodeBitplane`, `decodeBitplane`
  - Update the technical parameters display: show `t=131072`, `S=4096`, `1 coeff/gradient`, `8192 gradients/chunk`
  - Update overflow narrative: `n_max × S × G < t/2 = 65536` (was `n_max < t/2 = 50`)
  - Update encoding section: show standard two's-complement encoding instead of bitplane
  - Update decoding section: show two's-complement unwrap and division by n×S
  - Update chunk count calculation to use `Math.ceil(gradientSize / DEFAULT_SLOTS_PER_CT)`
  - Keep the hospital scenario and narrated style

  **Must NOT do**:
  - Do NOT change the simulation flow structure
  - Do NOT add new narrative sections

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 12, 13)
  - **Blocks**: None
  - **Blocked By**: Tasks 6, 8 (needs new encrypt.ts and round.ts)

  **References**:
  - `/home/dev/repo/scripts/run-round.ts` — Current demo; line 114 calls validateOverflowInvariant, line 116 defines `t = Number(PLAINTEXT_MODULUS)`, prints bitplane narrative
  - `/home/dev/repo/client/src/encrypt.ts` — New quantize/dequantize functions from Task 6
  - `/home/dev/repo/coordinator/src/round.ts` — Updated decode from Task 8

  **Acceptance Criteria**:
  - [ ] `npx tsx scripts/run-round.ts` completes without error
  - [ ] No `bitplane` references in run-round.ts
  - [ ] Output shows t=131072

  **QA Scenarios:**

  ```
  Scenario: Run-round demo completes with standard encoding
    Tool: Bash
    Steps:
      1. Run: npx tsx scripts/run-round.ts 2>&1
      2. Assert exit code 0
      3. Assert output contains "131072" (new t value)
      4. Assert output does NOT contain "bitplane"
    Expected Result: Demo runs showing standard coefficient encoding
    Failure Indicators: Error, crash, or bitplane references in output
    Evidence: .sisyphus/evidence/task-11-run-round.txt
  ```

  **Commit**: YES
  - Files: `scripts/run-round.ts`

- [x] 12. Update README.md for standard encoding

  **What to do**:
  - Update the plaintext modulus statement from `t = 100` to `t = 131,072`
  - Remove the entire bitplane encoding explanation section
  - Add standard encoding explanation: one coefficient per gradient, two's-complement for negatives
  - Update the constants table: remove BITS_PER_GRADIENT, GRADIENTS_PER_CT; add `Coefficients per gradient: 1`, `Gradients per ciphertext: 8192`
  - Update overflow invariant explanation: `n_max × S × G < t/2 = 65,536` → max 15 clients
  - Update the "where invariants are enforced" section
  - Mention the 14× scaling improvement over the previous bitplane approach as historical context (brief)
  - Update any bandwidth/ciphertext count numbers

  **Must NOT do**:
  - Do NOT rewrite the entire README — update sections in place
  - Do NOT add new sections beyond what's needed for the encoding change

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 13)
  - **Blocks**: None
  - **Blocked By**: All previous tasks (needs final encoding decisions)

  **References**:
  - `/home/dev/repo/README.md` — Lines 55-61 (t=100 statement), 76-86 (overflow invariant), 108-116 (enforcement)

  **Acceptance Criteria**:
  - [ ] README mentions t=131,072 (not t=100)
  - [ ] No "bitplane" references in README (except possibly brief historical note)
  - [ ] Overflow invariant documented as `n_max × S × G < t/2`

  **QA Scenarios:**

  ```
  Scenario: README has no stale t=100 references
    Tool: Bash
    Steps:
      1. Run: grep -c "t = 100\|t=100\|t = 100" README.md
      2. Assert output is "0" or exit code 1
    Expected Result: No t=100 references
    Evidence: .sisyphus/evidence/task-12-readme.txt
  ```

  **Commit**: YES
  - Files: `README.md`

- [x] 13. Delete bitplane-prototype.ts + final bitplane residue grep

  **What to do**:
  - Delete `scripts/bitplane-prototype.ts`
  - Run `grep -rn "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" --include="*.ts" --include="*.rs" --include="*.sol" .` and fix any remaining references (excluding AGENTS.md which is the upstream spec)
  - Run `grep -rn "PLAINTEXT_MODULUS.*=.*100[^0-9]" --include="*.ts" --include="*.rs" --include="*.sol" .` and fix any remaining hardcoded t=100

  **Must NOT do**:
  - Do NOT modify AGENTS.md
  - Do NOT delete any file other than bitplane-prototype.ts

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10, 11, 12)
  - **Blocks**: None
  - **Blocked By**: All previous tasks

  **References**:
  - `/home/dev/repo/scripts/bitplane-prototype.ts` — File to delete

  **Acceptance Criteria**:
  - [ ] `scripts/bitplane-prototype.ts` does not exist
  - [ ] Bitplane grep returns empty

  **QA Scenarios:**

  ```
  Scenario: No bitplane residue in codebase
    Tool: Bash
    Steps:
      1. Run: test ! -f scripts/bitplane-prototype.ts && echo "DELETED"
      2. Assert output contains "DELETED"
      3. Run: grep -rn "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" --include="*.ts" --include="*.rs" --include="*.sol" . | grep -v AGENTS.md | grep -v node_modules
      4. Assert empty output
    Expected Result: File deleted, zero bitplane references remain
    Failure Indicators: File still exists or grep finds matches
    Evidence: .sisyphus/evidence/task-13-cleanup.txt

  Scenario: No hardcoded t=100 remains
    Tool: Bash
    Steps:
      1. Run: grep -rn "PLAINTEXT_MODULUS.*=.*100[^0-9]" --include="*.ts" --include="*.rs" --include="*.sol" . | grep -v AGENTS.md | grep -v node_modules
      2. Assert empty output
    Expected Result: No hardcoded t=100 outside AGENTS.md
    Evidence: .sisyphus/evidence/task-13-no-t100.txt
  ```

  **Commit**: YES
  - Message: `chore(weft): remove bitplane prototype and verify clean migration`
  - Files: `scripts/bitplane-prototype.ts` (deleted)

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `cargo test`, `npx vitest run`, `forge test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Execute EVERY QA scenario from EVERY task. Run both demos end-to-end. Test negative gradients, zero gradients, max gradients, boundary conditions. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Demos [2/2] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect unaccounted changes. Verify `grep -rn "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT"` returns empty.
  Output: `Tasks [N/N compliant] | Bitplane Residue [CLEAN/N hits] | VERDICT`

---

## Commit Strategy

After all tasks complete successfully:
- **Single commit**: `refactor(weft): replace bitplane encoding with standard coefficient encoding for t=131072`
- **Files**: All modified files across client/, secure-process/, coordinator/, contracts/, scripts/, README.md
- **Pre-commit**: `cargo test --manifest-path secure-process/Cargo.toml && npx vitest run --dir client/tests && forge test --root contracts`

---

## Success Criteria

### Verification Commands
```bash
# All tests pass
cargo test --manifest-path secure-process/Cargo.toml  # Expected: all tests pass
npx vitest run --dir client/tests                      # Expected: all tests pass
forge test --root contracts                             # Expected: all tests pass

# Demos run
npx tsx scripts/run-round.ts                           # Expected: completes without error
cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml  # Expected: completes

# No bitplane residue
grep -rn "bitplane\|BITS_PER_GRADIENT\|GRADIENTS_PER_CT" --include="*.ts" --include="*.rs" --include="*.sol" .  # Expected: empty (excluding AGENTS.md)

# No hardcoded t=100
grep -rn "PLAINTEXT_MODULUS.*=.*100[^0-9]" --include="*.ts" --include="*.rs" --include="*.sol" .  # Expected: empty
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Both demos run successfully
- [ ] No bitplane code remains
- [ ] README accurately describes new encoding
