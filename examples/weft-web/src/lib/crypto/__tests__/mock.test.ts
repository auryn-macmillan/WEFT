import { describe, expect, it } from 'vitest';
import { MockCryptoEngine } from '../mock';
import type { TelemetryEvent } from '../engine';

function toInts(values: readonly number[]): Int32Array {
  return new Int32Array(values.map((value) => Math.trunc(value)));
}

describe('MockCryptoEngine', () => {
  it('round-trips 3 clients through aggregate and threshold combine', async () => {
    const events: TelemetryEvent[] = [];
    const engine = new MockCryptoEngine({ delayMs: 0, telemetry: (event) => events.push(event) });
    const params = engine.getParams();
    expect(params.plaintextModulus).toBe(131072n);

    const { publicKey, perPartyShares } = await engine.runDkg(5, 3);

    const clients = [
      toInts([10, -20, 30, 40]),
      toInts([5, 15, -25, 35]),
      toInts([-2, 4, 6, -8]),
    ];

    const ciphertexts = [] as Awaited<ReturnType<typeof engine.encryptVector>>[];
    for (const client of clients) {
      ciphertexts.push(await engine.encryptVector(publicKey, client));
    }

    const aggregated = await engine.aggregateCiphertexts(ciphertexts);
    const shares = await Promise.all(perPartyShares.slice(0, 3).map((share) => engine.partialDecrypt(share, aggregated)));
    const combined = await engine.combineDecryptionShares(shares, aggregated);

    expect(Array.from(combined)).toEqual([13, -1, 11, 67]);
    expect(events).toHaveLength(18);
  });

  it('unwraps negative values correctly', async () => {
    const engine = new MockCryptoEngine({ delayMs: 0 });
    const { publicKey, perPartyShares } = await engine.runDkg(5, 3);

    const aggregated = await engine.aggregateCiphertexts([
      await engine.encryptVector(publicKey, toInts([-50, 0, 50])),
      await engine.encryptVector(publicKey, toInts([-25, 0, 25])),
      await engine.encryptVector(publicKey, toInts([-5, 0, 5])),
    ]);

    const shares = await Promise.all(perPartyShares.slice(0, 3).map((share) => engine.partialDecrypt(share, aggregated)));
    expect(Array.from(await engine.combineDecryptionShares(shares, aggregated))).toEqual([-80, 0, 80]);
  });

  it('fails below threshold', async () => {
    const engine = new MockCryptoEngine({ delayMs: 0 });
    const { publicKey, perPartyShares } = await engine.runDkg(5, 3);
    const aggregated = await engine.aggregateCiphertexts([await engine.encryptVector(publicKey, toInts([1, 2, 3]))]);
    const shares = await Promise.all(perPartyShares.slice(0, 2).map((share) => engine.partialDecrypt(share, aggregated)));
    await expect(engine.combineDecryptionShares(shares, aggregated)).rejects.toThrow(/below threshold/i);
  });
});
