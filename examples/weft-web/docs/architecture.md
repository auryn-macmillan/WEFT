# WEFT Web Architecture

This document describes the internal architecture of the WEFT web demo. The goal of this demo is to simulate a Weighted Encrypted Federated Training round within the browser.

## Worker Topology

To simulate independent parties (hospitals and committee nodes), the demo uses a fleet of [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) orchestrated via [Comlink](https://github.com/GoogleChromeLabs/comlink).

- **Coordinator (Main Thread):** Manages the application state, UI routing, and coordinates the FL round phases.
- **Hospital Workers (3):** Represent the data providers. They perform local "training" (simulated) and encrypt gradient updates.
- **Committee Workers (5):** Represent the Interfold ciphernodes. They participate in the Distributed Key Generation (DKG) and provide partial decryption shares.
- **Aggregator Worker (1):** Simulates the Secure Process (RISC Zero guest) by homomorphically summing the ciphertexts from all hospitals.

Communication between workers is strictly defined via message-passing interfaces, ensuring that "private" keys and local "data" never leave the worker boundary unless explicitly part of the protocol.

## CryptoEngine Abstraction

The core cryptographic operations are abstracted behind the `CryptoEngine` interface. This allows the demo to switch between a high-performance Rust/WASM implementation and a simplified mock implementation for development.

### Interface: `src/lib/crypto/engine.ts`

The `CryptoEngine` provides methods for:
- `runDkg`: Collaborative public key generation.
- `encryptVector`: BFV encryption of gradient tensors.
- `aggregateCiphertexts`: Homomorphic summation (addition).
- `partialDecrypt`: Generating decryption shares from a secret key.
- `combineDecryptionShares`: Recovering the plaintext aggregate.

### Feature Flag

The engine implementation is controlled by the `VITE_CRYPTO_ENGINE` environment variable:
- `wasm`: Uses `WasmCryptoEngine` which calls the `fhe-wasm` crate.
- `mock`: Uses `MockCryptoEngine` with simulated delays (default for fast UI iteration).

## Phase-to-Route Mapping

The FL round is structured as a narrated walkthrough across the following routes:

| Phase | Route | Description |
|---|---|---|
| 1 | `/walkthrough/1-meet` | Introduction to the three hospitals and the goal. |
| 2 | `/walkthrough/2-dkg` | Distributed Key Generation by the committee. |
| 3 | `/walkthrough/3-shares` | Hospitals receive the threshold public key. |
| 4 | `/walkthrough/4-aggregate-pk` | Finalizing the round's public parameters. |
| 5 | `/walkthrough/5-train-encrypt` | Hospitals train locally and encrypt gradients. |
| 6 | `/walkthrough/6-aggregate` | Committee aggregates encrypted updates (homomorphic sum). |
| 7 | `/walkthrough/7-decrypt` | Threshold decryption of the aggregate. |
| 8 | `/walkthrough/8-update` | Applying the update to the global model. |

## Build Pipeline

The WASM component is built using `wasm-pack`:
1. **Rust Source:** Located in `examples/weft-web/crates/fhe-wasm`.
2. **Compilation:** `wasm-pack build --target bundler`
3. **Integration:** Vite handles the `.wasm` asset loading and bundling via the `vite-plugin-wasm` or standard ESM imports.
