export * from './engine';
export * from './mock';

import { MockCryptoEngine } from './mock';
import type { CryptoEngine } from './engine';

export const engine: CryptoEngine = new MockCryptoEngine({ delayMs: 1500 });

