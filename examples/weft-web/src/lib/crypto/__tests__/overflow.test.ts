import { describe, it, expect } from 'vitest';
import { assertOverflowInvariant, type BfvParams } from '../engine';

describe('assertOverflowInvariant', () => {
  const params = { plaintextModulus: 131072n } as BfvParams;

  it('10 clients, 4096 maxGradInt -> 40960 < 65536 -> MUST NOT throw', () => {
    expect(() => assertOverflowInvariant(params, 10, 4096)).not.toThrow();
  });

  it('20 clients, 4096 maxGradInt -> 81920 > 65536 -> MUST throw', () => {
    expect(() => assertOverflowInvariant(params, 20, 4096)).toThrow(/overflow/i);
  });

  it('16 clients, 4096 maxGradInt -> 65536 NOT < 65536 -> MUST throw (boundary)', () => {
    expect(() => assertOverflowInvariant(params, 16, 4096)).toThrow(/overflow/i);
  });

  it('2 clients, 4096 maxGradInt -> 8192 < 65536 -> MUST NOT throw', () => {
    expect(() => assertOverflowInvariant(params, 2, 4096)).not.toThrow();
  });

  it('15 clients, 4096 maxGradInt -> 61440 < 65536 -> MUST NOT throw', () => {
    expect(() => assertOverflowInvariant(params, 15, 4096)).not.toThrow();
  });
});
