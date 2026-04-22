import { EventEmitter } from 'node:events';
import type {
  BfvParams,
  CiphertextBytes,
  CryptoEngine,
  DecryptionShareBytes,
  DkgTranscript,
  PublicKeyBytes,
  SecretShareBytes,
  TelemetryEmitter,
  TelemetryEvent,
  TelemetryEventKind,
} from './engine';

/** UI dev only; not cryptographically meaningful. */
export const DEFAULT_PARAMS: BfvParams = {
  presetId: 'SECURE_THRESHOLD_8192',
  plaintextModulus: 131072n,
  polyDegree: 8192,
  threshold: 3,
  committeeSize: 5,
};

export const PLAINTEXT_MODULUS = DEFAULT_PARAMS.plaintextModulus;

type MockCiphertextPayload = {
  kind: 'mock-ciphertext';
  seed: string;
  nonce: string;
  plaintextInts: number[];
};

type MockSharePayload = {
  kind: 'mock-share';
  seed: string;
  nonce: string;
  partyIndex: number;
  threshold: number;
  plaintextInts: number[];
};

type MockDkgSharePayload = {
  kind: 'mock-dkg-share';
  seed: string;
  partyIndex: number;
  threshold: number;
};

export interface MockCryptoEngineOptions {
  delayMs?: number;
  telemetry?: TelemetryEmitter;
  eventEmitter?: EventEmitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDelay(ms: number | undefined): number {
  if (ms === undefined) return 100;
  if (!Number.isFinite(ms) || ms < 0) throw new Error('delayMs must be a finite non-negative number');
  return Math.max(50, Math.min(200, Math.round(ms)));
}

function emitTelemetry(
  telemetry: TelemetryEmitter | undefined,
  eventEmitter: EventEmitter | undefined,
  kind: TelemetryEventKind,
  partyIndex?: number,
  ciphertextPreview?: string,
): void {
  const event: TelemetryEvent = {
    kind,
    timestamp: Date.now(),
    ...(partyIndex === undefined ? {} : { partyIndex }),
    ...(ciphertextPreview === undefined ? {} : { ciphertextPreview }),
  };
  telemetry?.(event);
  eventEmitter?.emit('telemetry', event);
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function previewHex(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

function hashString(input: string): Uint8Array {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + i;
    h2 = Math.imul(h2, 0x27d4eb2d);
  }
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, h1 >>> 0);
  view.setUint32(4, h2 >>> 0);
  view.setUint32(8, (h1 ^ h2) >>> 0);
  view.setUint32(12, (Math.imul(h1, 33) ^ Math.imul(h2, 17)) >>> 0);
  return out;
}

function seedString(parts: readonly (string | number | bigint)[]): string {
  return parts.map((part) => String(part)).join(':');
}

function encodePayload(payload: MockCiphertextPayload | MockSharePayload | MockDkgSharePayload): Uint8Array {
  return textBytes(JSON.stringify(payload));
}

function decodePayload<T>(bytes: Uint8Array): T {
  return JSON.parse(bytesText(bytes)) as T;
}

function modNormalize(value: number): number {
  const mod = Number(PLAINTEXT_MODULUS);
  const normalized = value % mod;
  return normalized < 0 ? normalized + mod : normalized;
}

function unwrapSigned(value: number): number {
  const half = Number(PLAINTEXT_MODULUS / 2n);
  return value > half ? value - Number(PLAINTEXT_MODULUS) : value;
}

function splitIntoShares(values: readonly number[], threshold: number, seed: string): number[][] {
  const shares: number[][] = Array.from({ length: threshold }, () => new Array(values.length).fill(0));
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const base = Math.trunc(value / threshold);
    const remainder = value - base * threshold;
    for (let party = 0; party < threshold; party += 1) {
      shares[party][i] = base;
    }
    const target = hashString(`${seed}:${i}`).reduce((acc, byte) => acc + byte, 0) % threshold;
    for (let r = 0; r < Math.abs(remainder); r += 1) {
      const party = (target + r) % threshold;
      shares[party][i] += remainder > 0 ? 1 : -1;
    }
  }
  return shares;
}

function sumVectors(vectors: readonly number[][], modulus: number): number[] {
  if (vectors.length === 0) return [];
  const result = new Array(vectors[0].length).fill(0);
  for (const vector of vectors) {
    if (vector.length !== result.length) throw new Error('ciphertext length mismatch');
    for (let i = 0; i < vector.length; i += 1) {
      result[i] = (result[i] + vector[i]) % modulus;
    }
  }
  return result.map((value) => (value < 0 ? value + modulus : value));
}

function encodeCombined(values: readonly number[]): Int32Array {
  return Int32Array.from(values);
}

function expectedSum(values: readonly number[]): number[] {
  return values.map((value) => (value > Number(PLAINTEXT_MODULUS / 2n) ? value - Number(PLAINTEXT_MODULUS) : value));
}

export class MockCryptoEngine implements CryptoEngine {
  readonly #delayMs: number;

  readonly #telemetry?: TelemetryEmitter;

  readonly #eventEmitter?: EventEmitter;

  constructor(options: MockCryptoEngineOptions = {}) {
    this.#delayMs = normalizeDelay(options.delayMs);
    this.#telemetry = options.telemetry;
    this.#eventEmitter = options.eventEmitter;
  }

  getParams(): BfvParams {
    return DEFAULT_PARAMS;
  }

  async runDkg(committeeSize: number, threshold: number): Promise<DkgTranscript> {
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'dkg-start');
    await sleep(this.#delayMs);

    const publicKey: PublicKeyBytes = {
      bytes: hashString(seedString(['mock-pk', committeeSize, threshold])),
    };

    const perPartyShares: SecretShareBytes[] = [];
    const contributions: Uint8Array[] = [];
    for (let partyIndex = 1; partyIndex <= committeeSize; partyIndex += 1) {
      const payload: MockDkgSharePayload = {
        kind: 'mock-dkg-share',
        seed: seedString(['mock-dkg', committeeSize, threshold, partyIndex]),
        partyIndex,
        threshold,
      };
      const bytes = encodePayload(payload);
      perPartyShares.push({ bytes, partyIndex });
      contributions.push(bytes);
    }

    emitTelemetry(this.#telemetry, this.#eventEmitter, 'dkg-done');
    return { publicKey, perPartyShares, contributions };
  }

  async encryptVector(publicKey: PublicKeyBytes, plaintext: Int32Array): Promise<CiphertextBytes> {
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'encrypt-start', undefined, previewHex(publicKey.bytes));
    await sleep(this.#delayMs);

    const encoded = Array.from(plaintext, (value) => modNormalize(value));
    const payload: MockCiphertextPayload = {
      kind: 'mock-ciphertext',
      seed: previewHex(publicKey.bytes),
      nonce: seedString(['mock-nonce', publicKey.bytes.length, plaintext.length, encoded.reduce((acc, v) => acc + v, 0)]),
      plaintextInts: encoded,
    };

    const bytes = encodePayload(payload);
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'encrypt-done', undefined, previewHex(bytes));
    return { bytes };
  }

  async aggregateCiphertexts(ciphertexts: readonly CiphertextBytes[]): Promise<CiphertextBytes> {
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'aggregate-start');
    await sleep(this.#delayMs);

    if (ciphertexts.length === 0) {
      const empty = encodePayload({ kind: 'mock-ciphertext', seed: 'empty', nonce: 'empty', plaintextInts: [] });
      emitTelemetry(this.#telemetry, this.#eventEmitter, 'aggregate-done', undefined, previewHex(empty));
      return { bytes: empty };
    }

    const decoded = ciphertexts.map((ciphertext) => decodePayload<MockCiphertextPayload>(ciphertext.bytes));
    const seed = decoded[0].seed;
    const nonce = decoded[0].nonce;
    const plaintextInts = sumVectors(decoded.map((item) => item.plaintextInts), Number(PLAINTEXT_MODULUS));

    const bytes = encodePayload({ kind: 'mock-ciphertext', seed, nonce, plaintextInts });
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'aggregate-done', undefined, previewHex(bytes));
    return { bytes };
  }

  async partialDecrypt(share: SecretShareBytes, ciphertext: CiphertextBytes): Promise<DecryptionShareBytes> {
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'partial-decrypt-start', share.partyIndex, previewHex(ciphertext.bytes));
    await sleep(this.#delayMs);

    const sharePayload = decodePayload<MockDkgSharePayload>(share.bytes);
    const ciphertextPayload = decodePayload<MockCiphertextPayload>(ciphertext.bytes);
    const signed = ciphertextPayload.plaintextInts.map(unwrapSigned);
    const threshold = Math.max(1, sharePayload.threshold);
    const split = splitIntoShares(signed, threshold, sharePayload.seed);
    const index = Math.min(Math.max(share.partyIndex - 1, 0), split.length - 1);
    const payload: MockSharePayload = {
      kind: 'mock-share',
      seed: sharePayload.seed,
      nonce: ciphertextPayload.nonce,
      partyIndex: share.partyIndex,
      threshold: sharePayload.threshold,
      plaintextInts: share.partyIndex <= threshold ? split[index] : new Array(signed.length).fill(0),
    };

    const bytes = encodePayload(payload);
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'partial-decrypt-done', share.partyIndex, previewHex(bytes));
    return { bytes, partyIndex: share.partyIndex };
  }

  async combineDecryptionShares(
    shares: readonly DecryptionShareBytes[],
    ciphertext: CiphertextBytes
  ): Promise<Int32Array> {
    emitTelemetry(this.#telemetry, this.#eventEmitter, 'combine-start');
    await sleep(this.#delayMs);

    const threshold = DEFAULT_PARAMS.threshold;

    if (shares.length < threshold) throw new Error(`below threshold: need ${threshold}, got ${shares.length}`);

    const ciphertextPayload = decodePayload<MockCiphertextPayload>(ciphertext.bytes);
    const decodedShares = shares.map((share) => decodePayload<MockSharePayload>(share.bytes));
    for (const share of decodedShares) {
      if (share.nonce !== ciphertextPayload.nonce) throw new Error('share/ciphertext mismatch');
    }

    const length = decodedShares[0]?.plaintextInts.length ?? ciphertextPayload.plaintextInts.length;
    for (const share of decodedShares) {
      if (share.plaintextInts.length !== length) throw new Error('share length mismatch');
      if (share.threshold !== threshold) throw new Error('share threshold mismatch');
    }

    const combined = Int32Array.from(expectedSum(ciphertextPayload.plaintextInts));

    emitTelemetry(this.#telemetry, this.#eventEmitter, 'combine-done', undefined, previewHex(ciphertext.bytes));
    return encodeCombined(Array.from(combined));
  }
}
