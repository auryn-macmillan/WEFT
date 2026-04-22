import { beforeEach, describe, expect, it, vi } from 'vitest';

const remoteApi = vi.hoisted(() => ({
  runDkg: vi.fn(),
  encryptVector: vi.fn(),
  aggregateCiphertexts: vi.fn(),
  partialDecrypt: vi.fn(),
  combineDecryptionShares: vi.fn()
}));

const wrapMock = vi.hoisted(() => vi.fn(() => remoteApi));

vi.mock('comlink', () => ({
  wrap: wrapMock,
  expose: vi.fn(),
  transfer: <T>(value: T) => value,
  proxy: <T>(value: T) => value
}));

const wasmModule = {
  load_params: vi.fn(() => ({ handle: 'params' })),
  dkg_round1: vi.fn(),
  dkg_round2: vi.fn(),
  aggregate_public_key_contributions: vi.fn(),
  encrypt_vector: vi.fn(),
  homomorphic_add: vi.fn(),
  partial_decrypt: vi.fn(),
  combine_decryption_shares: vi.fn()
};

import { WasmCryptoEngine, WasmCryptoWorkerService } from '../wasm';

class TestWorker extends EventTarget implements Worker {
  onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;
  onmessage: ((this: AbstractWorker, ev: MessageEvent) => unknown) | null = null;
  onmessageerror: ((this: AbstractWorker, ev: MessageEvent) => unknown) | null = null;
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();
}

function makeBytes(values: readonly number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe('WasmCryptoEngine', () => {
  let workers: TestWorker[];

  beforeEach(() => {
    workers = [];
    wrapMock.mockClear();
    Object.values(remoteApi).forEach((mockFn) => mockFn.mockReset());
  });

  it('spawns the Comlink worker lazily and reuses it across calls', async () => {
    const engine = new WasmCryptoEngine({
      createWorker: () => {
        const worker = new TestWorker();
        workers.push(worker);
        return worker;
      }
    });

    remoteApi.encryptVector.mockResolvedValue(makeBytes([7, 8, 9]));
    remoteApi.aggregateCiphertexts.mockResolvedValue(makeBytes([10, 11]));

    expect(workers).toHaveLength(0);

    await expect(
      engine.encryptVector({ bytes: makeBytes([1, 2, 3]) }, Int32Array.from([4, -5, 6]))
    ).resolves.toEqual({ bytes: makeBytes([7, 8, 9]) });

    await expect(
      engine.aggregateCiphertexts([{ bytes: makeBytes([1]) }, { bytes: makeBytes([2]) }])
    ).resolves.toEqual({ bytes: makeBytes([10, 11]) });

    expect(workers).toHaveLength(1);
    expect(wrapMock).toHaveBeenCalledTimes(1);
    expect(remoteApi.encryptVector).toHaveBeenCalledWith({
      publicKey: makeBytes([1, 2, 3]),
      plaintext: Int32Array.from([4, -5, 6])
    });
    expect(remoteApi.aggregateCiphertexts).toHaveBeenCalledWith({
      ciphertexts: [makeBytes([1]), makeBytes([2])]
    });
  });

  it('wraps worker failures with a typed phase error', async () => {
    const engine = new WasmCryptoEngine({ createWorker: () => new TestWorker() });
    remoteApi.runDkg.mockRejectedValue(new Error('kaboom'));

    await expect(engine.runDkg(5, 3)).rejects.toMatchObject({
      name: 'WasmCryptoEngineError',
      phase: 'runDkg'
    });
  });
});

describe('WasmCryptoWorkerService', () => {
  beforeEach(() => {
    Object.values(wasmModule).forEach((mockFn) => mockFn.mockReset());
    wasmModule.load_params.mockReturnValue({ handle: 'params' });
  });

  it('runs threshold DKG in the expected wasm call order', async () => {
    const service = new WasmCryptoWorkerService({ importWasm: async () => wasmModule as never });

    wasmModule.dkg_round1.mockImplementation((partyIndex: number, committeeSize: number, threshold: number) => ({
      party_index: partyIndex,
      committee_size: committeeSize,
      threshold,
      crp: [1],
      public_key_share: [partyIndex],
      secret_shares: [],
      smudging_shares: []
    }));
    wasmModule.dkg_round2.mockImplementation((partyIndex: number, round1Outputs: Array<{ party_index: number }>) => ({
      party_index: partyIndex,
      committee_size: round1Outputs.length,
      threshold: 2,
      secret_share: [partyIndex, 99],
      public_key_contribution: [partyIndex, 42]
    }));
    wasmModule.aggregate_public_key_contributions.mockReturnValue(makeBytes([9, 9, 9]));

    const transcript = await service.runDkg({ committeeSize: 5, threshold: 3 });

    expect(wasmModule.dkg_round1).toHaveBeenCalledTimes(5);
    expect(wasmModule.dkg_round2).toHaveBeenCalledTimes(5);
    expect(wasmModule.aggregate_public_key_contributions).toHaveBeenCalledWith([
      makeBytes([1, 42]),
      makeBytes([2, 42]),
      makeBytes([3, 42]),
      makeBytes([4, 42]),
      makeBytes([5, 42])
    ]);
    expect(wasmModule.dkg_round1.mock.invocationCallOrder[4]).toBeLessThan(
      wasmModule.dkg_round2.mock.invocationCallOrder[0]
    );
    expect(transcript.publicKey).toEqual({ bytes: makeBytes([9, 9, 9]) });
    expect(transcript.perPartyShares[2]).toEqual({ bytes: makeBytes([3, 99]), partyIndex: 3 });
    expect(transcript.contributions[4]).toEqual(makeBytes([5, 42]));
  });

  it('loads params lazily once and folds homomorphic adds sequentially', async () => {
    const service = new WasmCryptoWorkerService({ importWasm: async () => wasmModule as never });

    wasmModule.encrypt_vector.mockRejectedValue(new Error('encrypt boom'));
    wasmModule.homomorphic_add
      .mockReturnValueOnce(makeBytes([3]))
      .mockReturnValueOnce(makeBytes([6]));

    await expect(
      service.aggregateCiphertexts({ ciphertexts: [makeBytes([1]), makeBytes([2]), makeBytes([3])] })
    ).resolves.toEqual(makeBytes([6]));
    await expect(
      service.encryptVector({ publicKey: makeBytes([7]), plaintext: Int32Array.from([8]) })
    ).rejects.toMatchObject({
      phase: 'encryptVector'
    });

    expect(wasmModule.load_params).toHaveBeenCalledTimes(1);
    expect(wasmModule.homomorphic_add).toHaveBeenNthCalledWith(1, { handle: 'params' }, makeBytes([1]), makeBytes([2]));
    expect(wasmModule.homomorphic_add).toHaveBeenNthCalledWith(2, { handle: 'params' }, makeBytes([3]), makeBytes([3]));
  });

  it('derives combine threshold from share metadata before calling wasm', async () => {
    const service = new WasmCryptoWorkerService({ importWasm: async () => wasmModule as never });
    const shareBytes = makeBytes(Array.from(new TextEncoder().encode(JSON.stringify({ threshold: 2 }))));
    wasmModule.combine_decryption_shares.mockReturnValue(Int32Array.from([12, -7]));

    await expect(
      service.combineDecryptionShares({
        shares: [
          { bytes: shareBytes, partyIndex: 1 },
          { bytes: shareBytes, partyIndex: 2 },
          { bytes: shareBytes, partyIndex: 3 }
        ],
        ciphertext: makeBytes([5, 6, 7])
      })
    ).resolves.toEqual(Int32Array.from([12, -7]));

    expect(wasmModule.combine_decryption_shares).toHaveBeenCalledWith(
      [shareBytes, shareBytes, shareBytes],
      makeBytes([5, 6, 7]),
      2
    );
  });
});
