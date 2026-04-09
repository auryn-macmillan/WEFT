# WEFT — Weighted Encrypted Federated Training

WEFT is a privacy-preserving federated learning (FL) system built on
[The Interfold](https://theinterfold.com) (Enclave). Each FL training round maps to a single
Encrypted Execution Environment (E3): participating clients encrypt their quantized gradient updates
under the committee's threshold BFV public key and submit them on-chain. The ciphernode committee
homomorphically sums all ciphertexts inside a RISC Zero zkVM, then threshold-decrypts the result.
The coordinator receives the plaintext aggregated gradient, applies the `1/n` FedAvg scalar, and
updates the global model. No plaintext gradients are ever visible to any single party.

## Project Structure

```
├── secure-process/          # Rust — FHE computation inside RISC Zero zkVM
│   ├── src/
│   │   ├── lib.rs           # fhe_processor: homomorphic gradient summation
│   │   ├── main.rs          # RISC Zero guest entry point
│   │   └── constants.rs     # Shared FL application constants
│   ├── examples/
│   │   └── threshold_demo.rs # Encrypted FL round with threshold BFV (2-of-3)
│   └── tests/
│       └── integration.rs   # Synthetic gradient encryption + sum verification
├── contracts/               # Solidity — E3 Program contract
│   ├── FLAggregator.sol     # IE3Program: validate, publishInput, verify
│   └── test/
│       └── FLAggregator.t.sol
├── client/                  # TypeScript — data provider SDK
│   ├── src/
│   │   ├── encrypt.ts       # Gradient quantization + BFV encryption
│   │   ├── submit.ts        # publishInput wrapper
│   │   ├── constants.ts     # Shared FL application constants
│   │   └── index.ts
│   └── tests/
│       └── encrypt.test.ts
├── coordinator/             # TypeScript — FL round orchestrator
│   ├── src/
│   │   ├── round.ts         # E3 lifecycle: request → activate → collect → decode
│   │   ├── model.ts         # W_new = W_old - lr * aggregated_gradients
│   │   └── index.ts
└── scripts/
    ├── deploy.ts            # Deploy FLAggregator contract
    └── run-round.ts         # End-to-end round demo (synthetic gradients)
```

## Prerequisites

- [Rust](https://rust-lang.org/tools/install/) (stable)
- [Foundry](https://getfoundry.sh) (for Solidity tests)
- [RISC Zero](https://dev.risczero.com/api/zkvm/install) (for zkVM guest)
- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io)

## BFV Parameters

WEFT currently documents and tests a **demo configuration** that assumes the Interfold BFV presets
resolve to a plaintext modulus of **t = 100** in the local development environment used for this
repository.

This value is treated as a checked demo assumption in the current codebase, not a verified,
future-proof upstream contract. Full Interfold integration should re-read the active preset values
from the upstream source of truth rather than relying on this README.

### Application Constants

| Constant | Value | Rationale |
|---|---|---|
| `SCALE_FACTOR` (S) | 4 | Fixed-point quantization: `grad_int = round(grad × S)` |
| `MAX_CLIENTS` (n_max) | 10 | Maximum participants per round |
| `MAX_GRAD_ABS` (G) | 1.0 | Gradient clamp range `[-G, G]` |
| `SLOTS_PER_CT` (N) | 8192 / 512 | Ring dimension (secure / insecure preset) |

### Overflow Safety Invariant

The accumulated homomorphic sum must not wrap modulo `t`:

```
n_max × S × G < t / 2
10 × 4 × 1 = 40 < 50 ✓
```

This invariant is enforced at runtime in Rust (`validate_overflow_invariant`) and checked against
the current demo contract configuration in Solidity (`FLAggregator.validate`). In this repository,
some paths still rely on the demo assumption `t = 100`; treat that as local demo wiring rather than
a stable upstream guarantee.

## How It Works

```
┌─────────┐     encrypted      ┌──────────────┐    homomorphic    ┌───────────┐
│ Client 1 │──── gradients ───→│              │───── sum ────────→│           │
│ Client 2 │──── gradients ───→│  FLAggregator │                  │ Ciphernode│
│ Client n │──── gradients ───→│  (on-chain)   │                  │ Committee │
└─────────┘                    └──────────────┘                   └─────┬─────┘
                                                                        │
                                                               threshold decrypt
                                                                        │
                                                                  ┌─────▼─────┐
                                                                  │Coordinator│
                                                                  │ ÷n, ×lr   │
                                                                  │ W -= lr·g │
                                                                  └───────────┘
```

1. **Coordinator** requests a new E3 round via `Enclave.request()`.
2. **Enclave** activates the round; ciphernode committee publishes a threshold BFV public key.
3. **Clients** clamp, quantize, and encrypt their gradient vectors under the public key, then
   submit via `FLAggregator.publishInput()`.
4. **Secure Process** (RISC Zero guest) homomorphically sums all ciphertexts per chunk index.
5. **Ciphernode committee** threshold-decrypts the aggregated ciphertext.
6. **Coordinator** decodes the plaintext, applies two's-complement unwrap for negative values,
   divides by `n × S` (FedAvg scalar), and updates the global model weights.

### Negative Gradient Encoding

BFV operates over `Z_t`. A negative integer `-x` is stored as `t - x`. After decryption, the
coordinator applies:

```typescript
if (val > t / 2n) val = val - t;
```

### Division is NOT Homomorphic

`1/n` division is deferred to post-decryption plaintext arithmetic. BFV supports exact integer
arithmetic only — fractional scalars in the encrypted domain would corrupt results.

## Quick Start

```bash
# Install Node dependencies
npm install

# Run the plaintext simulation demo
npx tsx scripts/run-round.ts

# Run the encrypted threshold demo (requires Rust toolchain)
cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml

# Run client SDK tests
npx vitest run --dir client/tests

# Run Rust tests (includes secure-process unit tests)
cargo test --manifest-path secure-process/Cargo.toml

# Run Solidity tests (requires Foundry)
forge test --root contracts
```

### Encrypted Demo

The encrypted demo (`secure-process/examples/threshold_demo.rs`) performs a real
threshold-encrypted FL round locally:

1. **Threshold DKG** — 5 parties generate secret keys, Shamir-share them, and aggregate a collective BFV public key
2. **Smudging noise** — each party generates and shares smudging noise for decryption privacy
3. **Gradient encryption** — 3 simulated clients quantize and encrypt 512-element gradient vectors
4. **Homomorphic summation** — ciphertexts are summed per chunk (same logic as `fhe_processor`)
5. **Threshold decryption** — only 3-of-5 parties (non-contiguous subset) provide decryption shares
6. **Verification** — decrypted result is compared against a plaintext shadow for correctness

Uses `fhe::trbfv` (Shamir secret sharing + Lagrange interpolation) for true threshold (t-of-n)
decryption. BFV parameters: degree=8192, t=100, 4 ciphertext moduli (from fhe.rs reference).
No blockchain, RISC Zero, or E3 infrastructure required.

```bash
cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml
```

## Testing

### Secure Process (`secure-process/tests/integration.rs`)

- Single-chunk and multi-chunk homomorphic summation
- Negative gradient values (modular encoding round-trip)
- Zero gradients
- Output framing format verification

### Solidity (`contracts/test/FLAggregator.t.sol`)

- `validate`: valid config, overflow invariant rejection, duplicate round rejection
- `publishInput`: valid submission, duplicate address, wrong chunk count, round-full rejection
- `verify`: RISC Zero journal verification with mock verifier

### Client SDK (`client/tests/encrypt.test.ts`)

- Quantize / dequantize round-trip at S=4
- Negative gradient round-trip through modular arithmetic
- Multi-client aggregation simulation
- Gradient clamping to `[-G, G]`
- Chunk splitting with zero-padding
- Overflow invariant validation

## Out of Scope (v1)

These are deliberate exclusions for the initial implementation:

- **GRECO-style input validity ZKP** — proving submitted ciphertexts are valid BFV encryptions
  (stubbed with a TODO in `publishInput`)
- **Differential privacy** — DP-noise injection is a client-side concern
- **Byzantine-robust aggregation** — coordinate-wise median requires infeasible BFV depth
- **Model distribution** — broadcasting updated weights to clients is out-of-band
- **Gradient compression** — top-k / sub-20-bit quantization is compatible but not included

## License

LGPL-3.0-only
