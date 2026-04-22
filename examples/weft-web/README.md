# WEFT Web Demo

WEFT (Weighted Encrypted Federated Training) is a privacy-preserving federated learning demo scaffold built with SvelteKit. It visualizes how multiple parties (e.g., hospitals) can collaboratively train a shared model without ever exposing their individual raw data.

**Note:** This is a **simulated demonstration**. Please read the [Honest Framing & Disclosures](./docs/honest-framing.md) before use.

## Architecture Overview

The demo simulates a complete FL round within your browser:
- **Topology:** 3 Hospital workers (data providers) + 5 Committee workers (trustees) + 1 Aggregator worker.
- **Cryptography:** Uses BFV homomorphic encryption with threshold decryption (3-of-5).
- **Execution:** Operations run in background Web Workers via Comlink to keep the UI responsive.
- **Engine:** Flexible `CryptoEngine` interface supporting both pure-JS mocks and high-performance Rust/WASM.

See [Architecture Docs](./docs/architecture.md) for more detail.

## Browser Support Matrix

The demo relies on modern browser features including Web Workers, BigInt, and WebAssembly.

| Browser | Version |
|---|---|
| Chrome | ≥ 90 |
| Firefox | ≥ 89 |
| Safari | ≥ 15 |

## Quick Start

### 1. Install Dependencies
From the repository root:
```bash
pnpm install
```

### 2. Run in Development Mode
```bash
pnpm --filter weft-web dev
```
Open `http://localhost:5173` to view the demo.

### 3. Build for Production
```bash
pnpm --filter weft-web build
```

## Development Commands

### Rebuilding WASM
If you modify the Rust code in `crates/fhe-wasm`, you must rebuild the WASM package:
```bash
# From repository root
wasm-pack build --target bundler examples/weft-web/crates/fhe-wasm
```

### Switching Crypto Engines
The engine is controlled by the `VITE_CRYPTO_ENGINE` environment variable in `.env` (or via shell):
- `VITE_CRYPTO_ENGINE=mock` (Default, fast UI iteration)
- `VITE_CRYPTO_ENGINE=wasm` (Real BFV encryption)

## Contributing

For detailed implementation notes and cryptographic constraints, see the [AGENTS.md](../../AGENTS.md) in the root of the repository.
