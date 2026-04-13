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
| `SCALE_FACTOR` (S) | 4096 | Fixed-point quantization: `grad_int = round(grad × S)`. Precision ≈ ±0.000244. |
| `MAX_CLIENTS` (n_max) | 10 | Maximum participants per round |
| `MAX_GRAD_ABS` (G) | 1.0 | Gradient clamp range `[-G, G]` |
| `BITS_PER_GRADIENT` (B) | 14 | `ceil(log2(2 × S × G + 1))` — bits per gradient in bitplane encoding |
| `GRADIENTS_PER_CT` | 585 | `floor(N / B)` — gradients that fit in one ciphertext |
| `SLOTS_PER_CT` (N) | 8192 / 512 | Ring dimension (secure / insecure preset) |

### Bitplane Tally Encoding

Standard BFV coefficient encoding stores one integer per coefficient, making the overflow invariant
`n_max × S × G < t / 2`. With `t = 100`, this limits precision to `S ≈ 4` — far too coarse for
real gradient values.

**Bitplane tally encoding** decomposes each gradient into `B` individual bit coefficients. After
homomorphic addition across `n` clients, each coefficient holds a tally count (0 to n) rather than
a large accumulated integer. This shifts the overflow constraint to simply:

```
n_max < t / 2
```

Precision (`S`) and gradient range (`G`) drop out entirely. With `t = 100`, we support up to 49
clients at **any** precision — WEFT uses `S = 4096` for 1024× better precision than the naive
approach.

#### Encoding/Decoding Flow

```
Encode (client-side):
  gradient ∈ [-G, G] → clamp → scaled = round(grad × S) → unsigned = scaled + S×G
  → decompose into B bits: coefficient[b] = (unsigned >> b) & 1

Homomorphic sum (secure process — unchanged):
  coefficient-wise addition across all clients
  → each coefficient becomes a tally: how many clients had bit b = 1

Decode (coordinator-side):
  weightedSum = Σ_b (tally[b] × 2^b)
  average = (weightedSum − n × S × G) / (n × S)
```

### Overflow Safety Invariant

With bitplane tally encoding, each BFV coefficient holds a tally count (0 to n), so the constraint
is simply that the tally fits in `Z_t` without ambiguity:

```
n_max < t / 2
10 < 50 ✓
```

This invariant is enforced at runtime in Rust (`validate_overflow_invariant`) and checked in
Solidity (`FLAggregator.validate`). The demo assumes `t = 100` — full Interfold integration should
read the active preset value from the upstream source of truth.

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
3. **Clients** clamp and quantize their gradient vectors, bitplane-encode each gradient into `B`
   bit-coefficients, encrypt the coefficient vector under the public key, and submit via
   `FLAggregator.publishInput()`.
4. **Secure Process** (RISC Zero guest) homomorphically sums all ciphertexts per chunk index.
   Each coefficient becomes a tally of how many clients had that bit set.
5. **Ciphernode committee** threshold-decrypts the aggregated ciphertext.
6. **Coordinator** decodes the plaintext tallies, reconstructs the weighted bit-sums, removes the
   unsigned offset, divides by `n × S` (FedAvg scalar), and updates the global model weights.

### Negative Gradient Encoding

Bitplane encoding uses an **unsigned offset** representation: `unsigned = scaled + S × G`, which
maps the range `[-S×G, +S×G]` to `[0, 2×S×G]`. All values are non-negative, so no two's-complement
unwrap is needed after decryption. The coordinator removes the offset during decoding:
`weightedSum − n × S × G`.

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

**Simulation demo** (`scripts/run-round.ts`) — runs instantly, no Rust needed. Simulates the
bitplane tally encoding pipeline with plaintext integer arithmetic that mirrors BFV's behavior.
Best for quick presentations.

**Encrypted demo** (`secure-process/examples/threshold_demo.rs`) — uses real BFV homomorphic
encryption with threshold key generation (5 committee members, need 3 to decrypt), real
ciphertext addition over bitplane-encoded gradients, and real Shamir-based threshold decryption.
Takes a few seconds to run. Best for demonstrating that the cryptography actually works.

```bash
# Run tests
npx vitest run --dir client/tests
cargo test --manifest-path secure-process/Cargo.toml
forge test --root contracts  # requires Foundry
```

## Testing

### Secure Process (`secure-process/tests/integration.rs`)

- Single-chunk and multi-chunk homomorphic summation with bitplane-encoded gradients
- Negative gradient values (unsigned offset encoding round-trip)
- Zero gradients
- Output framing format verification
- Bitplane encode/decode helpers and overflow invariant

### Solidity (`contracts/test/FLAggregator.t.sol`)

- `validate`: valid config, overflow invariant rejection, duplicate round rejection
- `publishInput`: valid submission, duplicate address, wrong chunk count, round-full rejection
- `verify`: RISC Zero journal verification with mock verifier

### Client SDK (`client/tests/encrypt.test.ts`)

- Bitplane encode / decode round-trip (single bit positions, full gradient)
- Quantize / dequantize round-trip at S=4096
- Multi-client bitplane aggregation simulation (3 clients, tally summation)
- Negative gradient round-trip through unsigned offset arithmetic
- Gradient clamping to `[-G, G]`
- Chunk splitting with zero-padding
- Bitplane overflow invariant validation (`n_max < t/2`)

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
