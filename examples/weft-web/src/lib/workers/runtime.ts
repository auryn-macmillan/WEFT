import type {
  BfvParams,
  CiphertextBytes,
  CryptoEngine,
  DecryptionShareBytes,
  DkgTranscript,
  PublicKeyBytes,
  SecretShareBytes,
  TelemetryEventKind
} from '$lib/crypto/engine';
import type {
  DemoWorkerEngineDescriptor,
  WorkerBootstrap,
  WorkerIdentity,
  WorkerTelemetryEnvelope,
  WorkerTelemetrySink
} from './messages';

interface DemoCiphertextPayload {
  readonly kind: 'demo-ciphertext';
  readonly workerId: string;
  readonly nonce: string;
  readonly plaintextInts: readonly number[];
}

interface DemoSecretSharePayload {
  readonly kind: 'demo-secret-share';
  readonly workerId: string;
  readonly partyIndex: number;
  readonly threshold: number;
  readonly seed: number;
}

interface DemoContributionPayload {
  readonly kind: 'demo-dkg-contribution';
  readonly workerId: string;
  readonly partyIndex: number;
  readonly threshold: number;
  readonly committeeSize: number;
  readonly seed: number;
}

interface DemoPartialSharePayload {
  readonly kind: 'demo-partial-share';
  readonly workerId: string;
  readonly partyIndex: number;
  readonly threshold: number;
  readonly nonce: string;
  readonly plaintextInts: readonly number[];
}

interface WorkerRuntimeState {
  identity: WorkerIdentity | null;
  telemetrySink?: WorkerTelemetrySink;
  engine: CryptoEngine | null;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeDelay(latencyMs: number | undefined): number {
  if (latencyMs === undefined) {
    return 6;
  }

  if (!Number.isFinite(latencyMs) || latencyMs < 0) {
    throw new Error('latencyMs must be a finite non-negative number');
  }

  return Math.round(latencyMs);
}

function cloneBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return buffer.slice(0);
}

export function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function bufferToBytes(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

export function bufferToInt32Array(buffer: ArrayBuffer): Int32Array {
  return new Int32Array(buffer.slice(0));
}

export function int32ArrayToBuffer(values: Int32Array): ArrayBuffer {
  return (values.buffer as ArrayBuffer).slice(values.byteOffset, values.byteOffset + values.byteLength);
}

function encodePayload(payload: object): Uint8Array {
  return textEncoder.encode(JSON.stringify(payload));
}

function decodePayload<T>(bytes: Uint8Array): T {
  return JSON.parse(textDecoder.decode(bytes)) as T;
}

function previewHex(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function modNormalize(modulus: bigint, value: number): number {
  const modulusNumber = Number(modulus);
  const normalized = value % modulusNumber;
  return normalized < 0 ? normalized + modulusNumber : normalized;
}

function unwrapSigned(modulus: bigint, value: number): number {
  const half = Number(modulus / 2n);
  return value > half ? value - Number(modulus) : value;
}

function hashSeed(input: string): number {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function splitIntoShares(values: readonly number[], threshold: number, seed: number): number[][] {
  const shares = Array.from({ length: threshold }, () => new Array<number>(values.length).fill(0));

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const base = Math.trunc(value / threshold);
    const remainder = value - base * threshold;

    for (let partyIndex = 0; partyIndex < threshold; partyIndex += 1) {
      shares[partyIndex][index] = base;
    }

    const startIndex = hashSeed(`${seed}:${index}`) % threshold;
    for (let remainderIndex = 0; remainderIndex < Math.abs(remainder); remainderIndex += 1) {
      const partyIndex = (startIndex + remainderIndex) % threshold;
      shares[partyIndex][index] += remainder > 0 ? 1 : -1;
    }
  }

  return shares;
}

function sumVectors(vectors: readonly (readonly number[])[], modulus: bigint): number[] {
  if (vectors.length === 0) {
    return [];
  }

  const length = vectors[0].length;
  const sum = new Array<number>(length).fill(0);
  const modulusNumber = Number(modulus);

  for (const vector of vectors) {
    if (vector.length !== length) {
      throw new Error('vector length mismatch during aggregation');
    }

    for (let index = 0; index < vector.length; index += 1) {
      sum[index] = (sum[index] + vector[index]) % modulusNumber;
    }
  }

  return sum.map((value) => (value < 0 ? value + modulusNumber : value));
}

function emitTelemetry(
  state: WorkerRuntimeState,
  kind: TelemetryEventKind,
  ciphertextPreview?: string
): void {
  if (!state.identity || !state.telemetrySink) {
    return;
  }

  const envelope: WorkerTelemetryEnvelope = {
    workerId: state.identity.workerId,
    role: state.identity.role,
    ...(state.identity.partyIndex === undefined ? {} : { partyIndex: state.identity.partyIndex }),
    event: {
      kind,
      timestamp: Date.now(),
      ...(state.identity.partyIndex === undefined ? {} : { partyIndex: state.identity.partyIndex }),
      ...(ciphertextPreview === undefined ? {} : { ciphertextPreview })
    }
  };

  state.telemetrySink(envelope);
}

class DemoWorkerCryptoEngine implements CryptoEngine {
  readonly #descriptor: DemoWorkerEngineDescriptor;

  readonly #state: WorkerRuntimeState;

  constructor(descriptor: DemoWorkerEngineDescriptor, state: WorkerRuntimeState) {
    this.#descriptor = descriptor;
    this.#state = state;
  }

  getParams(): BfvParams {
    return this.#descriptor.params;
  }

  async runDkg(committeeSize: number, threshold: number): Promise<DkgTranscript> {
    emitTelemetry(this.#state, 'dkg-start');
    await sleep(normalizeDelay(this.#descriptor.latencyMs));

    const seed = this.#descriptor.seed ?? 11;
    const publicKeyBytes = encodePayload({
      kind: 'demo-public-key',
      committeeSize,
      threshold,
      seed
    });

    const shares: SecretShareBytes[] = [];
    const contributions: Uint8Array[] = [];

    for (let partyIndex = 1; partyIndex <= committeeSize; partyIndex += 1) {
      const partySeed = hashSeed(`${seed}:party:${partyIndex}`);
      const shareBytes = encodePayload({
        kind: 'demo-secret-share',
        workerId: `committee-${partyIndex}`,
        partyIndex,
        threshold,
        seed: partySeed
      } satisfies DemoSecretSharePayload);
      const contributionBytes = encodePayload({
        kind: 'demo-dkg-contribution',
        workerId: `committee-${partyIndex}`,
        partyIndex,
        threshold,
        committeeSize,
        seed: partySeed
      } satisfies DemoContributionPayload);

      shares.push({ bytes: shareBytes, partyIndex });
      contributions.push(contributionBytes);
    }

    emitTelemetry(this.#state, 'dkg-done', previewHex(publicKeyBytes));

    return {
      publicKey: { bytes: publicKeyBytes },
      perPartyShares: shares,
      contributions
    };
  }

  async encryptVector(publicKey: PublicKeyBytes, plaintext: Int32Array): Promise<CiphertextBytes> {
    emitTelemetry(this.#state, 'encrypt-start', previewHex(publicKey.bytes));
    await sleep(normalizeDelay(this.#descriptor.latencyMs));

    const payload = {
      kind: 'demo-ciphertext',
      workerId: this.#state.identity?.workerId ?? 'unknown-worker',
      nonce: `${hashSeed(`${plaintext.length}:${previewHex(publicKey.bytes)}`)}`,
      plaintextInts: Array.from(plaintext, (value) => modNormalize(this.#descriptor.params.plaintextModulus, value))
    } satisfies DemoCiphertextPayload;
    const ciphertext = encodePayload(payload);

    emitTelemetry(this.#state, 'encrypt-done', previewHex(ciphertext));
    return { bytes: ciphertext };
  }

  async aggregateCiphertexts(ciphertexts: readonly CiphertextBytes[]): Promise<CiphertextBytes> {
    emitTelemetry(this.#state, 'aggregate-start');
    await sleep(normalizeDelay(this.#descriptor.latencyMs));

    const decoded = ciphertexts.map((ciphertext) => decodePayload<DemoCiphertextPayload>(ciphertext.bytes));
    const aggregatePayload = {
      kind: 'demo-ciphertext',
      workerId: this.#state.identity?.workerId ?? 'aggregator',
      nonce: decoded[0]?.nonce ?? 'aggregate-empty',
      plaintextInts: sumVectors(
        decoded.map((item) => item.plaintextInts),
        this.#descriptor.params.plaintextModulus
      )
    } satisfies DemoCiphertextPayload;
    const aggregateBytes = encodePayload(aggregatePayload);

    emitTelemetry(this.#state, 'aggregate-done', previewHex(aggregateBytes));
    return { bytes: aggregateBytes };
  }

  async partialDecrypt(
    share: SecretShareBytes,
    ciphertext: CiphertextBytes
  ): Promise<DecryptionShareBytes> {
    const sharePayload = decodePayload<DemoSecretSharePayload>(share.bytes);
    const ciphertextPayload = decodePayload<DemoCiphertextPayload>(ciphertext.bytes);

    emitTelemetry(this.#state, 'partial-decrypt-start', previewHex(ciphertext.bytes));
    await sleep(normalizeDelay(this.#descriptor.latencyMs));

    const signed = ciphertextPayload.plaintextInts.map((value) =>
      unwrapSigned(this.#descriptor.params.plaintextModulus, value)
    );
    const splitShares = splitIntoShares(signed, sharePayload.threshold, sharePayload.seed);
    const shareValues =
      sharePayload.partyIndex <= sharePayload.threshold
        ? splitShares[sharePayload.partyIndex - 1]
        : new Array<number>(signed.length).fill(0);
    const partialShareBytes = encodePayload({
      kind: 'demo-partial-share',
      workerId: this.#state.identity?.workerId ?? sharePayload.workerId,
      partyIndex: sharePayload.partyIndex,
      threshold: sharePayload.threshold,
      nonce: ciphertextPayload.nonce,
      plaintextInts: shareValues
    } satisfies DemoPartialSharePayload);

    emitTelemetry(this.#state, 'partial-decrypt-done', previewHex(partialShareBytes));
    return {
      bytes: partialShareBytes,
      partyIndex: sharePayload.partyIndex
    };
  }

  async combineDecryptionShares(
    shares: readonly DecryptionShareBytes[],
    ciphertext: CiphertextBytes
  ): Promise<Int32Array> {
    emitTelemetry(this.#state, 'combine-start', previewHex(ciphertext.bytes));
    await sleep(normalizeDelay(this.#descriptor.latencyMs));

    if (shares.length === 0) {
      throw new Error('no decryption shares provided');
    }

    const decodedShares = shares.map((share) => decodePayload<DemoPartialSharePayload>(share.bytes));
    const threshold = decodedShares[0]?.threshold ?? 0;
    if (shares.length < threshold) {
      throw new Error(`below threshold: need ${threshold}, got ${shares.length}`);
    }

    const nonce = decodedShares[0]?.nonce;
    for (const share of decodedShares) {
      if (share.threshold !== threshold) {
        throw new Error('share threshold mismatch');
      }
      if (share.nonce !== nonce) {
        throw new Error('share nonce mismatch');
      }
    }

    const combined = sumVectors(
      decodedShares.slice(0, threshold).map((share) => share.plaintextInts),
      this.#descriptor.params.plaintextModulus
    ).map((value) => unwrapSigned(this.#descriptor.params.plaintextModulus, value));

    emitTelemetry(this.#state, 'combine-done', previewHex(ciphertext.bytes));
    return Int32Array.from(combined);
  }
}

export function createEngineFromDescriptor(
  descriptor: DemoWorkerEngineDescriptor,
  state: WorkerRuntimeState
): CryptoEngine {
  return new DemoWorkerCryptoEngine(descriptor, state);
}

export function createWorkerRuntimeState(): WorkerRuntimeState {
  return {
    identity: null,
    telemetrySink: undefined,
    engine: null
  };
}

export function ensureRuntimeConfigured(
  state: WorkerRuntimeState
): asserts state is WorkerRuntimeState & { identity: WorkerIdentity; engine: CryptoEngine } {
  if (!state.identity || !state.engine) {
    throw new Error('worker must be configured before use');
  }
}

export async function configureWorkerRuntime(
  state: WorkerRuntimeState,
  bootstrap: WorkerBootstrap,
  telemetrySink?: WorkerTelemetrySink
): Promise<void> {
  state.identity = bootstrap.identity;
  state.telemetrySink = telemetrySink;
  state.engine = createEngineFromDescriptor(bootstrap.engine, state);
}

export function cloneTransferredBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return cloneBuffer(buffer);
}
