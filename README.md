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
resolve to a plaintext modulus of **t = 131,072** in the local development environment used for this
repository.

This value is treated as a checked demo assumption in the current codebase, not a verified,
future-proof upstream contract. Full Interfold integration should re-read the active preset values
from the upstream source of truth rather than relying on this README.

### Application Constants

| Constant | Value | Rationale |
|---|---|---|
| `SCALE_FACTOR` (S) | 4096 | Fixed-point quantization: `grad_int = round(grad × S)`. Precision ≈ ±0.000244. |
| `MAX_CLIENTS` (n_max) | 10 | Maximum participants per round |
| `MAX_GRAD_ABS` (G) | 1.0 | Gradient clamp range `[-G, G]` |
| `MAX_GRAD_INT` | 4096 | `MAX_GRAD_ABS × SCALE_FACTOR` |
| `SLOTS_PER_CT` (N) | 8192 / 512 | gradients per ciphertext = SLOTS_PER_CT (one coefficient per gradient) |

### Standard Coefficient Encoding

Standard BFV coefficient encoding stores one integer per coefficient. Negative gradients are
represented using two's complement modulo `t`: positive `x → x`, negative `-x → t - x`.

After homomorphic summation of `n` clients, each coefficient holds the sum of quantized gradients.
This shifts the overflow constraint to ensuring the sum does not wrap around `t/2`.

#### Encoding/Decoding Flow

```
Encode (client-side):
  gradient ∈ [-G, G] → clamp → scaled = round(grad × S)
  → two's complement mod t: if scaled < 0 then scaled + t else scaled

Homomorphic sum (secure process — unchanged):
  coefficient-wise addition across all clients
  → each coefficient holds the accumulated sum of quantized gradients

Decode (coordinator-side):
  if val > t/2 then val = val - t
  average = val / (n × S)
```

With `t = 131,072`, `S = 4096`, and `G = 1.0`, the system supports up to `floor((t/2 - 1) / (S × G)) = 15` clients.

### Overflow Safety Invariant

The sum of quantized gradients must fit in `Z_t` without ambiguity. The invariant is:

```
n_max × S × G < t / 2
```

or equivalently:

```
n_max × MAX_GRAD_INT < t / 2
10 × 4096 = 40,960 < 65,536 ✓
```

The maximum number of clients supported with these parameters is 15. This invariant is enforced at
runtime in Rust (`validate_overflow_invariant`) and checked in Solidity (`FLAggregator.validate`).
The demo assumes `t = 131,072` — full Interfold integration should read the active preset value from
the upstream source of truth.

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
3. **Clients** clamp and quantize their gradient vectors, encode as two's complement coefficients,
   encrypt the coefficient vector under the public key, and submit via
   `FLAggregator.publishInput()`.
4. **Secure Process** (RISC Zero guest) homomorphically sums all ciphertexts per chunk index.
   Each coefficient holds the accumulated sum of quantized gradients.
5. **Ciphernode committee** threshold-decrypts the aggregated ciphertext.
6. **Coordinator** decodes the plaintext coefficients via two's complement unwrap,
   divides by `n × S` (FedAvg scalar), and updates the global model weights.

### Negative Gradient Encoding

Negative gradients use **two's complement modulo t**. For a plaintext modulus `t`, a value `-x` is
represented as `t - x`. The coordinator performs the unwrap after decryption: if `val > t/2`,
then `val = val - t`.

### Division is NOT Homomorphic

`1/n` division is deferred to post-decryption plaintext arithmetic. BFV supports exact integer
arithmetic only — fractional scalars in the encrypted domain would corrupt results.

## Quick Start

```bash
# Install Node dependencies
npm install

# Run the narrated demo (no Rust required — fast, great for presentations)
npx tsx scripts/run-round.ts

# Run the encrypted demo (real BFV encryption — requires Rust toolchain)
cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml
```

### The Demos

Both demos tell the same story: **three hospitals training a shared diabetes prediction model
without exposing any patient data**. They walk through each phase with narrated explanations,
show what an attacker would see (encrypted gibberish), and reveal that only the aggregate — never
individual contributions — is decrypted.

**Simulation demo** (`scripts/run-round.ts`) — runs instantly, no Node-Rust bindings needed.
Simulates the coefficient encoding pipeline with plaintext integer arithmetic that mirrors BFV's
behavior. Best for quick presentations.

**Encrypted demo** (`secure-process/examples/threshold_demo.rs`) — uses real BFV homomorphic
encryption with threshold key generation (5 committee members, need 3 to decrypt), real
ciphertext addition over standard encoded gradients, and real Shamir-based threshold decryption.
Takes a few seconds to run. Best for demonstrating that the cryptography actually works.

```bash
# Run tests
npx vitest run --dir client/tests
cargo test --manifest-path secure-process/Cargo.toml
forge test --root contracts  # requires Foundry
```

## Testing

### Secure Process (`secure-process/tests/integration.rs`)

- Single-chunk and multi-chunk homomorphic summation with standard coefficient encoding
- Negative gradient values (two's complement mod t round-trip)
- Zero gradients
- Output framing format verification
- Encode/decode helpers and overflow invariant

### Solidity (`contracts/test/FLAggregator.t.sol`)

- `validate`: valid config, overflow invariant rejection, duplicate round rejection
- `publishInput`: valid submission, duplicate address, wrong chunk count, round-full rejection
- `verify`: RISC Zero journal verification with mock verifier

### Client SDK (`client/tests/encrypt.test.ts`)

- Coefficient encode / decode round-trip (positive and negative values)
- Quantize / dequantize round-trip at S=4096
- Multi-client aggregation simulation (3 clients, sum of coefficients)
- Negative gradient round-trip through two's complement modulo t arithmetic
- Gradient clamping to `[-G, G]`
- Chunk splitting with zero-padding
- Overflow invariant validation (`n_max * MAX_GRAD_INT < t/2`)

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
