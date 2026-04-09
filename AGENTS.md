# AGENTS.MD — WEFT: Weighted Encrypted Federated Training

## Project Overview

Build **WEFT** (Weighted Encrypted Federated Training), a privacy-preserving federated learning
(FL) system, on top of [The Interfold](https://theinterfold.com)
(GitHub: `github.com/gnosisguild/enclave`).

Each FL training round is mapped to a single **Encrypted Execution Environment (E3)**. Participating
clients encrypt their quantized gradient updates under the committee's threshold BFV public key and
submit them via `publishInput`. The Interfold's ciphernode committee homomorphically sums all
ciphertexts in the Secure Process (RISC Zero zkVM), then threshold-decrypts the result. The
coordinator receives the plaintext aggregated gradient, applies the scalar `1/n` division, and
applies the update to the global model. No plaintext gradients are ever visible to any single party.

### Key References

| Resource | URL |
|---|---|
| Interfold docs | https://docs.theinterfold.com |
| GitHub monorepo | https://github.com/gnosisguild/enclave |
| Secure Process guide | https://docs.theinterfold.com/write-secure-program |
| E3 Contract guide | https://docs.theinterfold.com/write-e3-contract |
| Cryptography deep-dive | https://docs.theinterfold.com/cryptography |
| CRISP reference example | https://docs.theinterfold.com/CRISP/introduction |

---

## Repository Layout

Create a new directory `examples/weft/` inside the Interfold monorepo. Mirror the structure of
`examples/CRISP/` where applicable.

```
examples/weft/
├── AGENTS.md                          # this file
├── README.md
├── contracts/                         # Solidity — E3 Program contract
│   ├── FLAggregator.sol               # IE3Program implementation
│   └── test/
│       └── FLAggregator.t.sol
├── secure-process/                    # Rust — computation inside zkVM
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs                     # fhe_processor function
│   │   └── main.rs                    # RISC Zero guest entry point
│   └── tests/
│       └── integration.rs
├── client/                            # TypeScript — data provider SDK
│   ├── package.json
│   ├── src/
│   │   ├── encrypt.ts                 # gradient → BFV ciphertext
│   │   ├── submit.ts                  # publishInput wrapper
│   │   └── index.ts
│   └── tests/
├── coordinator/                       # TypeScript — FL round orchestrator
│   ├── package.json
│   └── src/
│       ├── round.ts                   # request/activate/collect lifecycle
│       ├── model.ts                   # weight update application
│       └── index.ts
└── scripts/
    ├── deploy.ts                      # deploy FLAggregator contract
    └── run-round.ts                   # end-to-end round demo
```

---

## BFV Parameter Specification

### Use the Interfold's Standard Production Preset

**Do not define custom BFV parameters.** The Interfold ships pre-configured parameter sets via the
`e3_fhe_params` crate. Always load the production preset:

```rust
use e3_fhe_params::BfvPreset;

let params = BfvPreset::SecureThreshold8192.params(); // verify exact method name in crate
```

`BfvPreset::SecureThreshold8192` provides:
- **Ring dimension N = 8192** — meaning up to 8192 integer slots per ciphertext
- A ciphertext modulus sized for 128-bit post-quantum security under the RLWE assumption
- Parameters that are consistent with the Interfold's Noir circuits (C0–C7), the `config` circuit
  preset, and the ciphernode DKG process — custom parameters would silently break this consistency

The insecure counterpart (something like `BfvPreset::Insecure` or `BfvPreset::InsecureThreshold`)
exists for fast local testing only. **Never use it outside of unit tests.** Gate it behind a
`#[cfg(test)]` attribute or a `debug_assert!` so it cannot be compiled into a release binary.

**Before writing any code**, open `crates/fhe-params/src/lib.rs` and read:
- The exact variant names of the `BfvPreset` enum
- The exact method or function for obtaining `Arc<BfvParameters>` from a preset
- The plaintext modulus `t` embedded in `SecureThreshold8192` — you will need this value to
  verify the overflow safety invariant below and to pass it in `e3ProgramParams`

### Application-Level Constants

These are *not* BFV parameters — they are FL application constants. Define them in a shared
`constants.rs` (Rust) and `constants.ts` (TypeScript) and import from those files everywhere:

```
SCALE_FACTOR  S     = 2^20      // fixed-point: gradient_int = round(grad_float × S)
MAX_CLIENTS   n_max = 256       // max participants per round
MAX_GRAD_ABS  G     = 1.0       // absolute gradient clamp before quantization
SLOTS_PER_CT  N     = 8192      // must match BfvPreset::SecureThreshold8192 ring dimension
```

### Overflow Safety Invariant

This must hold, or the accumulated sum silently wraps modulo `t` and corrupts the result:

```
n_max × S × G  <  t / 2
```

Read `t` from the preset at startup — do not hardcode it. Enforce the invariant in two places:

- **Rust** (`constants.rs`): a `const` or startup `assert!` after loading the preset
- **Solidity** (`FLAggregator.sol`): inside `validate()`, using the `t` value the coordinator
  encodes into `e3ProgramParams` at round-request time

### Gradient Encoding

A gradient tensor of `M` floats is flattened row-major to a 1-D array and split into chunks of
`SLOTS_PER_CT = 8192` integers per ciphertext. Each client therefore submits `ceil(M / 8192)`
ciphertexts. All ciphertexts for one client must arrive in a single `publishInput` call,
ABI-encoded as `(bytes[] ciphertexts, uint256 numChunks)`.

---

## Component 1 — Secure Process (`secure-process/`)

### Dependencies (`Cargo.toml`)

```toml
[dependencies]
e3-compute-provider = { path = "../../../../crates/compute-provider" }
e3-fhe-params       = { path = "../../../../crates/fhe-params" }
fhe                 = { git = "https://github.com/gnosisguild/fhe.rs" }
fhe-traits          = { git = "https://github.com/gnosisguild/fhe.rs" }
risc0-zkvm          = { version = "1.0" }
```

### `src/lib.rs` — Core Computation

Implement `fhe_processor(fhe_inputs: &FHEInputs) -> Vec<u8>`.

The function must:

1. Decode BFV parameters using `e3_fhe_params::decode_bfv_params_arc`.
2. Group input ciphertexts by chunk index (the `u64` index in each tuple).
3. For each chunk index, sum all client ciphertexts homomorphically:
   ```rust
   let mut chunk_sum = Ciphertext::zero(&params);
   for (ct_bytes, _idx) in chunk_ciphertexts {
       let ct = Ciphertext::from_bytes(ct_bytes, &params)?;
       chunk_sum += &ct;
   }
   ```
4. Serialize each chunk sum and return all chunk sums concatenated with a length prefix:
   `[u32 num_chunks][u32 len_0][bytes_0]...[u32 len_k][bytes_k]`

**Do not divide by `n` inside the encrypted domain.** Division by the scalar `n` is performed by
the coordinator after decryption (plaintext arithmetic). This avoids the need for a multiplicative
inverse in the BFV plaintext ring.

**Parallel processing**: pass `use_parallel = true` to `ComputeManager` and set
`batch_size = Some(64)` for large models. Parallelize over chunk indices, not over clients per
chunk (chunk sums are sequential additions).

### `src/main.rs` — RISC Zero Guest

Follow the CRISP example guest entry point. Deserialize `FHEInputs` from RISC Zero's input stream,
call `fhe_processor`, and commit the output bytes to the RISC Zero journal.

---

## Component 2 — E3 Program Contract (`contracts/FLAggregator.sol`)

Implement the `IE3Program` interface. Reference:
`packages/enclave-contracts/contracts/test/MockE3Program.sol`

### Storage

```solidity
struct RoundConfig {
    uint32  numClients;       // expected number of participating clients
    uint32  numChunks;        // number of BFV ciphertext chunks per client
    uint32  scaleFactor;      // S, for off-chain verification
    uint32  maxGradInt;       // G × S as integer, for bounds checking
    address coordinator;      // address allowed to request and finalize
}

mapping(uint256 => RoundConfig) public rounds;
mapping(uint256 => uint256)     public inputCounts;  // e3Id → submissions so far
```

### `validate`

Called when a new E3 is requested. Decode `e3ProgramParams` as
`(uint32 numClients, uint32 numChunks, uint32 scaleFactor, uint32 maxGradInt, address coordinator)`.
Validate:
- `numClients >= 2`
- `numChunks >= 1`
- `scaleFactor > 0`
- `coordinator != address(0)`
- Overflow invariant: `uint256(numClients) * scaleFactor * maxGradInt < PLAINTEXT_MOD / 2`

Store the config in `rounds[e3Id]`. Return the BFV encryption scheme ID
(`keccak256("bfv")` or the Interfold-defined constant — check `enclave-contracts` for the correct
identifier string).

### `publishInput`

Called by each FL client to submit their encrypted gradient.

Decode `data` as `(bytes[] ciphertexts, uint256 numChunks)`. Validate:
- `ciphertexts.length == rounds[e3Id].numChunks`
- `inputCounts[e3Id] < rounds[e3Id].numClients`
- Each `ciphertexts[i].length > 0`
- Reject duplicate submissions from the same `msg.sender` per round (use a
  `mapping(uint256 => mapping(address => bool)) submitted` guard).

Increment `inputCounts[e3Id]`. Emit an event `InputReceived(e3Id, msg.sender, inputCounts[e3Id])`.

The function does **not** need to verify a ZKP for input correctness in the initial version. Mark
this as a `// TODO: add GRECO-style input validity proof (P3 circuit)` comment for future work.

### `verify`

Called with the `ciphertextOutputHash` and RISC Zero proof. Delegate proof verification to the
Interfold's `IRisc0Verifier` contract (follow the CRISP example for the correct interface). Return
`true` on success; revert on failure.

---

## Component 3 — Client SDK (`client/`)

### `src/encrypt.ts`

```typescript
import { BfvEncryptor } from "@enclave/sdk";  // or the current package name in enclave-sdk

/**
 * Quantize a Float32Array of gradients and encrypt into BFV ciphertexts.
 *
 * @param gradients  - flat Float32Array of model gradient values
 * @param publicKey  - threshold public key bytes from the E3 activation event
 * @param bfvParams  - serialized BFV parameter bytes (from the E3 config)
 * @param scaleFactor - fixed-point scale S (default 2^20)
 * @returns array of serialized ciphertext bytes, one per N-slot chunk
 */
export async function encryptGradients(
  gradients: Float32Array,
  publicKey: Uint8Array,
  bfvParams: Uint8Array,
  scaleFactor = 1 << 20,
): Promise<Uint8Array[]>
```

Steps:
1. Clamp each gradient to `[-G, G]` where `G = 1.0`.
2. Quantize: `grad_int = Math.round(grad * scaleFactor)`. Represent negatives as `t - |grad_int|`
   (two's complement modulo `t`).
3. Split into chunks of `N = 4096` integers.
4. For each chunk, encode as a BFV plaintext and encrypt under `publicKey`.
5. Return array of serialized ciphertext bytes.

Use the `@enclave/sdk` WASM bindings for BFV encryption. If the SDK does not yet expose a
TypeScript BFV encrypt API, fall back to calling a small Rust CLI helper compiled to WASM.

### `src/submit.ts`

Wrap the Interfold SDK's `publishInput` call. ABI-encode the ciphertext array and `numChunks` as
`(bytes[], uint256)` before submission. Follow the pattern in the CRISP client example.

---

## Component 4 — Coordinator (`coordinator/`)

### `src/round.ts` — Round Lifecycle

Implement `runRound(globalWeights: Float32Array, clients: ClientInfo[]): Promise<Float32Array>`.

1. **Request E3**: call `Enclave.request(e3ProgramAddress, e3ProgramParams, computeProviderParams)`
   using the Interfold SDK. Encode `RoundConfig` as `e3ProgramParams`.
2. **Activate E3**: call `Enclave.activate(e3Id)` to get the committee public key.
3. **Broadcast**: send the public key and `e3Id` to all clients out-of-band (WebSocket, REST, etc.).
4. **Wait for inputs**: poll `inputCounts[e3Id]` until it reaches `numClients`, or listen for
   `InputReceived` events.
5. **Trigger compute**: the Interfold protocol handles this automatically once all inputs are
   received. Optionally monitor for the `CiphertextOutputPublished` event.
6. **Collect output**: listen for `PlaintextOutputPublished(e3Id, output)`.
7. **Decode and dequantize**:
   - Parse the output bytes (same length-prefix format as the Secure Process output).
   - For each chunk, decode the plaintext integer vector.
   - Dequantize: `grad_float = grad_int / (n * scaleFactor)` (applying the `1/n` FedAvg scalar).
   - Reconstruct the full gradient tensor from chunks.
8. **Update model**: `W_new = W_old - lr * aggregated_gradients`.
9. Return `W_new`.

### Negative Number Handling

After decryption, values in `(t/2, t)` represent negative integers. Apply:
```typescript
if (val > PLAINTEXT_MOD / 2n) val = val - PLAINTEXT_MOD;
```
before dequantizing.

---

## Testing Requirements

### Unit Tests

- `secure-process/tests/integration.rs`: generate synthetic encrypted gradients from 3 clients,
  run `fhe_processor`, decrypt the output, and verify the sum matches hand-computed expectations.
  Cover: single chunk, multi-chunk, negative gradient values, zero gradients.

- `contracts/test/FLAggregator.t.sol`: use Foundry. Test `validate` (valid config, overflow
  rejection), `publishInput` (valid, duplicate address, wrong chunk count), `verify` (mock proof).

- `client/tests/`: test quantize/dequantize round-trip at `S = 2^20`. Verify clamping behavior.
  Test that negative gradients round-trip correctly through modular arithmetic.

### Integration Test

`tests/integration/` (root level, follow Interfold convention): spin up a local devnet, deploy
`FLAggregator`, run a 3-client round with synthetic 512-element gradient vectors, and assert:
- Final decoded gradient magnitude is within `1/S = ~1e-6` of the true average.
- No plaintext gradient is ever logged or emitted by any contract event.

Run with `pnpm test:integration`.

---

## Known Constraints and Gotchas

### Plaintext Modulus Sizing

The BFV plaintext modulus `t` is set by `BfvPreset::SecureThreshold8192` — do not override it.
The overflow safety invariant `n_max × S × G < t / 2` must be verified against the preset's
actual `t` value at startup. If you need to support more clients, a larger scale factor, or larger
gradient magnitudes than the invariant allows, you must reduce one of the other variables — you
cannot simply increase `t` without abandoning the standard preset and breaking circuit compatibility.

### `1/n` Division is NOT Homomorphic

Do not attempt to multiply ciphertexts by a fractional plaintext scalar `1/n` in the encrypted
domain in BFV. BFV supports exact integer arithmetic only. Always defer the averaging scalar to
post-decryption plaintext arithmetic in the coordinator.

### Chunk Index Alignment

The Secure Process receives a flat list of `(ciphertext_bytes, index)` tuples from all clients
mixed together. The `index` field is the chunk index (0..numChunks-1), not a client identifier.
The processor must group by chunk index before summing. Verify in unit tests that two clients
contributing chunk 0 are summed together, not concatenated.

### Encoding Convention

Agree on and document the byte encoding of the output blob (length-prefix format specified above)
before writing the Secure Process and the coordinator decoder. A mismatch here is the most common
integration bug.

### Negative Gradients

BFV works over `Z_t`. A negative integer `-x` is stored as `t - x`. The coordinator decoder must
apply the two's-complement unwrap *before* dividing by `n × S`. Write a test that sends a gradient
of `-0.5` and verifies the coordinator recovers `-0.5 ± epsilon`.

### RISC Zero Proof Latency

On devnet, Boundless proof generation can take tens of seconds. In the integration test, set a
generous timeout (5 minutes). Do not poll the chain in a tight loop; use event subscriptions.

### Duplicate Input Prevention

The contract's `submitted[e3Id][msg.sender]` guard prevents replay within a round, but clients can
still call `publishInput` from a fresh address. Access control (allowlist of client addresses) is
out of scope for v1 but should be noted in the contract's NatSpec as a future extension.

---

## Out of Scope (v1)

The following are deliberate exclusions. Note them in code comments and `README.md` but do not
implement them:

- **GRECO-style input validity ZKP** (P3 circuit): proving that a submitted ciphertext is a valid
  BFV encryption is the correct production extension; stub the `publishInput` verify hook.
- **Differential privacy noise injection**: DP-noise added before encryption is a client-side
  concern and does not affect the E3 logic.
- **Byzantine-robust aggregation** (e.g., coordinate-wise median): requires polynomial-depth
  comparisons and is not feasible in BFV at this multiplicative depth.
- **Model parameter distribution**: broadcasting the updated global weights to clients is the
  coordinator's responsibility and is out-of-band from the E3 protocol.
- **Multiple simultaneous rounds**: each `e3Id` is one round; parallel rounds are supported by
  the Interfold but not tested here.
- **Gradient compression** (top-k, quantization below 20 bits): compatible with this design but
  not included.

---

## Implementation Order

Work through components in this order to unblock dependencies:

1. **Read `crates/fhe-params/src/lib.rs`** — confirm `BfvPreset::SecureThreshold8192` API, read
   the value of `t`, then write `constants.rs` and `constants.ts`. Verify the overflow invariant
   in a standalone test before touching any other file.
2. **Secure Process** — implement and unit-test `fhe_processor` without the zkVM wrapper first
   (pure Rust). Add the RISC Zero guest wrapper once the logic is verified.
3. **E3 Program Contract** — implement and test with Foundry. Use `MockComputeProvider` from the
   Interfold test utilities.
4. **Client SDK** — implement quantization and encryption. Integration-test against a local BFV
   keypair before connecting to the E3 lifecycle.
5. **Coordinator** — implement the round lifecycle against a local devnet.
6. **End-to-end integration test** — wire all components together.

---

## Commands Reference

```bash
# Install all dependencies (from repo root)
pnpm i

# Build
pnpm build

# Run all tests
pnpm test

# Run only Rust tests (includes secure-process unit tests)
pnpm rust:test

# Run only smart contract tests
pnpm evm:test

# Run integration tests
pnpm test:integration

# Deploy to local devnet
cd examples/weft && npx hardhat run scripts/deploy.ts --network localhost

# Run a demo round
npx ts-node scripts/run-round.ts
```

---

## Checklist for the Coding Agent

- [ ] Read `examples/CRISP/` in full before writing any code — it is the canonical reference
      implementation and the FL example should follow the same structural patterns.
- [ ] Read `crates/compute-provider/` to understand `ComputeProvider`, `ComputeManager`,
      `FHEInputs`, and `ComputeResult` before implementing the Secure Process.
- [ ] Read `crates/fhe-params/src/lib.rs` **first** to confirm the exact `BfvPreset` variant
      names, the method for obtaining `Arc<BfvParameters>`, and the value of `t` in
      `SecureThreshold8192`. All parameter decisions flow from this.
- [ ] Ensure the insecure preset variant is gated behind `#[cfg(test)]` — it must not be
      reachable from production code paths.
- [ ] Confirm the current `@enclave/sdk` (or `@interfold/sdk`) package name and BFV API surface
      by inspecting `packages/enclave-sdk/` before writing `client/src/encrypt.ts`.
- [ ] Confirm the correct `encryptionSchemeId` constant for BFV by searching
      `packages/enclave-contracts/` — do not hardcode a string without verifying.
- [ ] Run `pnpm rust:test` after each Rust change and `pnpm evm:test` after each Solidity change.
- [ ] Add `// AGENTS.MD §<section>` comments in code pointing back to this spec for any non-obvious
      design decision (e.g., deferred division, chunk indexing, negative number encoding).
- [ ] Do not introduce new external Rust crates without checking whether the Interfold monorepo
      already provides the same functionality in `crates/`.

