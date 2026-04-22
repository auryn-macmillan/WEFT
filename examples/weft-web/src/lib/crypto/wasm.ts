import * as Comlink from 'comlink';

import { DEFAULT_PARAMS } from './mock';
import type {
  BfvParams,
  CiphertextBytes,
  CryptoEngine,
  DecryptionShareBytes,
  DkgTranscript,
  PublicKeyBytes,
  SecretShareBytes
} from './engine';

type WasmModule = typeof import('../../../packages/fhe-wasm/pkg/fhe_wasm.js');
type WasmParamsHandle = ReturnType<WasmModule['load_params']>;

const importFheWasm = (): Promise<WasmModule> => import('../../../packages/fhe-wasm/pkg/fhe_wasm.js');

interface WasmDkgRound1Output {
  readonly party_index: number;
  readonly committee_size: number;
  readonly threshold: number;
  readonly crp: number[];
  readonly public_key_share: number[];
  readonly secret_shares: number[][];
  readonly smudging_shares: number[][];
}

interface WasmDkgRound2Output {
  readonly party_index: number;
  readonly committee_size: number;
  readonly threshold: number;
  readonly secret_share: number[];
  readonly public_key_contribution: number[];
}

interface WasmDecryptionShareBundle {
  readonly party_index: number;
  readonly committee_size: number;
  readonly threshold: number;
  readonly decryption_share: number[];
}

export interface WasmCryptoWorkerApi {
  runDkg(request: { committeeSize: number; threshold: number }): Promise<DkgTranscript>;
  encryptVector(request: { publicKey: Uint8Array; plaintext: Int32Array }): Promise<Uint8Array>;
  aggregateCiphertexts(request: { ciphertexts: readonly Uint8Array[] }): Promise<Uint8Array>;
  partialDecrypt(request: { share: Uint8Array; ciphertext: Uint8Array; partyIndex: number }): Promise<DecryptionShareBytes>;
  combineDecryptionShares(request: {
    shares: readonly DecryptionShareBytes[];
    ciphertext: Uint8Array;
  }): Promise<Int32Array>;
}

export interface WasmCryptoEngineOptions {
  createWorker?: () => Worker;
}

export interface WasmCryptoWorkerServiceOptions {
  importWasm?: () => Promise<WasmModule>;
}

type WasmCryptoPhase =
  | 'spawn-worker'
  | 'load-wasm'
  | 'load-params'
  | 'runDkg'
  | 'encryptVector'
  | 'aggregateCiphertexts'
  | 'partialDecrypt'
  | 'combineDecryptionShares';

export class WasmCryptoEngineError extends Error {
  readonly phase: WasmCryptoPhase;

  override readonly cause?: unknown;

  constructor(phase: WasmCryptoPhase, message: string, cause?: unknown) {
    super(message);
    this.name = 'WasmCryptoEngineError';
    this.phase = phase;
    this.cause = cause;
  }
}

function createCryptoWorker(): Worker {
  return new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), { type: 'module' });
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toUint8Array(bytes: ArrayLike<number>): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}

function decodeShareThreshold(share: DecryptionShareBytes): number {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(share.bytes)) as WasmDecryptionShareBundle;
    if (!Number.isInteger(parsed.threshold) || parsed.threshold < 0) {
      throw new Error('invalid threshold metadata');
    }
    return parsed.threshold;
  } catch (error) {
    throw new WasmCryptoEngineError(
      'combineDecryptionShares',
      `Failed to decode decryption share threshold metadata: ${normalizeErrorMessage(error)}`,
      error
    );
  }
}

export class WasmCryptoWorkerService implements WasmCryptoWorkerApi {
  readonly #importWasm: () => Promise<WasmModule>;

  #wasmPromise: Promise<WasmModule> | null = null;

  #paramsPromise: Promise<WasmParamsHandle> | null = null;

  constructor(options: WasmCryptoWorkerServiceOptions = {}) {
    this.#importWasm = options.importWasm ?? importFheWasm;
  }

  async runDkg(request: { committeeSize: number; threshold: number }): Promise<DkgTranscript> {
    return this.#wrap('runDkg', async () => {
      const wasm = await this.#getWasm();
      const wasmThreshold = this.#toWasmThreshold(request.threshold);
      const round1Outputs = Array.from({ length: request.committeeSize }, (_, index) =>
        wasm.dkg_round1(index + 1, request.committeeSize, wasmThreshold) as WasmDkgRound1Output
      );
      const round2Outputs = Array.from({ length: request.committeeSize }, (_, index) =>
        wasm.dkg_round2(index + 1, round1Outputs) as WasmDkgRound2Output
      );

      return {
        publicKey: {
          bytes: wasm.aggregate_public_key_contributions(
            round2Outputs.map((output) => toUint8Array(output.public_key_contribution))
          )
        },
        perPartyShares: round2Outputs.map((output) => ({
          bytes: toUint8Array(output.secret_share),
          partyIndex: output.party_index
        })),
        contributions: round2Outputs.map((output) => toUint8Array(output.public_key_contribution))
      };
    });
  }

  async encryptVector(request: { publicKey: Uint8Array; plaintext: Int32Array }): Promise<Uint8Array> {
    return this.#wrap('encryptVector', async () => {
      const wasm = await this.#getWasm();
      const params = await this.#getParams();
      return wasm.encrypt_vector(params, request.publicKey, request.plaintext);
    });
  }

  async aggregateCiphertexts(request: { ciphertexts: readonly Uint8Array[] }): Promise<Uint8Array> {
    return this.#wrap('aggregateCiphertexts', async () => {
      if (request.ciphertexts.length === 0) {
        return new Uint8Array();
      }

      const wasm = await this.#getWasm();
      const params = await this.#getParams();
      let aggregate = request.ciphertexts[0];

      for (const ciphertext of request.ciphertexts.slice(1)) {
        aggregate = wasm.homomorphic_add(params, aggregate, ciphertext);
      }

      return aggregate;
    });
  }

  async partialDecrypt(request: {
    share: Uint8Array;
    ciphertext: Uint8Array;
    partyIndex: number;
  }): Promise<DecryptionShareBytes> {
    return this.#wrap('partialDecrypt', async () => {
      const wasm = await this.#getWasm();
      return {
        bytes: wasm.partial_decrypt(request.share, request.ciphertext),
        partyIndex: request.partyIndex
      };
    });
  }

  async combineDecryptionShares(request: {
    shares: readonly DecryptionShareBytes[];
    ciphertext: Uint8Array;
  }): Promise<Int32Array> {
    return this.#wrap('combineDecryptionShares', async () => {
      if (request.shares.length === 0) {
        throw new Error('no decryption shares provided');
      }

      const wasm = await this.#getWasm();
      return wasm.combine_decryption_shares(
        request.shares.map((share) => share.bytes),
        request.ciphertext,
        decodeShareThreshold(request.shares[0])
      );
    });
  }

  async #getWasm(): Promise<WasmModule> {
    if (!this.#wasmPromise) {
      this.#wasmPromise = this.#wrap('load-wasm', async () => this.#importWasm());
    }

    return this.#wasmPromise;
  }

  async #getParams(): Promise<WasmParamsHandle> {
    if (!this.#paramsPromise) {
      this.#paramsPromise = this.#wrap('load-params', async () => {
        const wasm = await this.#getWasm();
        return wasm.load_params();
      });
    }

    return this.#paramsPromise;
  }

  #toWasmThreshold(threshold: number): number {
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new Error(`threshold must be a positive integer, received ${threshold}`);
    }

    return threshold - 1;
  }

  async #wrap<T>(phase: WasmCryptoPhase, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof WasmCryptoEngineError) {
        throw error;
      }

      throw new WasmCryptoEngineError(phase, `${phase} failed: ${normalizeErrorMessage(error)}`, error);
    }
  }
}

export function createWasmCryptoWorkerApi(options?: WasmCryptoWorkerServiceOptions): WasmCryptoWorkerApi {
  return new WasmCryptoWorkerService(options);
}

export class WasmCryptoEngine implements CryptoEngine {
  readonly #createWorker: () => Worker;

  #workerApiPromise: Promise<Comlink.Remote<WasmCryptoWorkerApi>> | null = null;

  constructor(options: WasmCryptoEngineOptions = {}) {
    this.#createWorker = options.createWorker ?? createCryptoWorker;
  }

  getParams(): BfvParams {
    return DEFAULT_PARAMS;
  }

  async runDkg(committeeSize: number, threshold: number): Promise<DkgTranscript> {
    return this.#call('runDkg', (api) => api.runDkg({ committeeSize, threshold }));
  }

  async encryptVector(publicKey: PublicKeyBytes, plaintext: Int32Array): Promise<CiphertextBytes> {
    const bytes = await this.#call('encryptVector', (api) =>
      api.encryptVector({ publicKey: publicKey.bytes, plaintext })
    );
    return { bytes };
  }

  async aggregateCiphertexts(ciphertexts: readonly CiphertextBytes[]): Promise<CiphertextBytes> {
    const bytes = await this.#call('aggregateCiphertexts', (api) =>
      api.aggregateCiphertexts({ ciphertexts: ciphertexts.map((ciphertext) => ciphertext.bytes) })
    );
    return { bytes };
  }

  async partialDecrypt(share: SecretShareBytes, ciphertext: CiphertextBytes): Promise<DecryptionShareBytes> {
    return this.#call('partialDecrypt', (api) =>
      api.partialDecrypt({ share: share.bytes, ciphertext: ciphertext.bytes, partyIndex: share.partyIndex })
    );
  }

  async combineDecryptionShares(
    shares: readonly DecryptionShareBytes[],
    ciphertext: CiphertextBytes
  ): Promise<Int32Array> {
    return this.#call('combineDecryptionShares', (api) =>
      api.combineDecryptionShares({ shares, ciphertext: ciphertext.bytes })
    );
  }

  async #getWorkerApi(): Promise<Comlink.Remote<WasmCryptoWorkerApi>> {
    if (!this.#workerApiPromise) {
      this.#workerApiPromise = (async () => {
        try {
          return Comlink.wrap<WasmCryptoWorkerApi>(this.#createWorker());
        } catch (error) {
          throw new WasmCryptoEngineError(
            'spawn-worker',
            `spawn-worker failed: ${normalizeErrorMessage(error)}`,
            error
          );
        }
      })();
    }

    return this.#workerApiPromise;
  }

  async #call<T>(
    phase: Extract<
      WasmCryptoPhase,
      'runDkg' | 'encryptVector' | 'aggregateCiphertexts' | 'partialDecrypt' | 'combineDecryptionShares'
    >,
    fn: (api: Comlink.Remote<WasmCryptoWorkerApi>) => Promise<T>
  ): Promise<T> {
    try {
      const api = await this.#getWorkerApi();
      return await fn(api);
    } catch (error) {
      if (error instanceof WasmCryptoEngineError) {
        throw error;
      }

      throw new WasmCryptoEngineError(phase, `${phase} failed: ${normalizeErrorMessage(error)}`, error);
    }
  }
}
