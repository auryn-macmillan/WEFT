export * from './engine';
export * from './mock';

import { MockCryptoEngine } from './mock';
import type { CryptoEngine } from './engine';

export const cryptoEngineKind = import.meta.env.VITE_CRYPTO_ENGINE === 'wasm' ? 'wasm' : 'mock';

// AGENTS.md §Known Constraints and Gotchas: keep the production bundle free of WASM imports unless
// the app explicitly opts into that path at runtime.
export const engine: CryptoEngine = new MockCryptoEngine({ delayMs: 1500 });
