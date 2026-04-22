import type { BfvParams, TelemetryEvent } from '$lib/crypto';

export type WorkerRole = 'committee' | 'hospital' | 'aggregator';

export interface DemoWorkerEngineDescriptor {
  readonly kind: 'demo';
  readonly params: BfvParams;
  readonly latencyMs?: number;
  readonly seed?: number;
}

export type WorkerEngineDescriptor = DemoWorkerEngineDescriptor;

export interface WorkerIdentity {
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly partyIndex?: number;
}

export interface WorkerBootstrap {
  readonly identity: WorkerIdentity;
  readonly engine: WorkerEngineDescriptor;
}

export interface WorkerApi {
  configure(bootstrap: WorkerBootstrap, telemetrySink?: WorkerTelemetrySink): Promise<void>;
  ping(request: PingRequest): Promise<PingResponse>;
}

export interface CommitteeWorkerApi extends WorkerApi {
  runDkg(request: DkgRequest): Promise<DkgContribution>;
  partialDecrypt(request: PartialDecryptRequest): Promise<PartialDecryptResponse>;
  combine(request: CombineRequest): Promise<ArrayBuffer>;
}

export interface HospitalWorkerApi extends WorkerApi {
  encrypt(request: EncryptRequest): Promise<EncryptResponse>;
}

export interface AggregatorWorkerApi extends WorkerApi {
  aggregate(request: AggregateRequest): Promise<AggregateResponse>;
}

export interface PingRequest {
  readonly type: 'ping-request';
  readonly requestId: string;
  readonly sentAt: number;
}

export interface PingResponse {
  readonly type: 'ping-response';
  readonly requestId: string;
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly roundTripMs: number;
  readonly receivedAt: number;
}

export interface DkgRequest {
  readonly type: 'dkg-request';
  readonly requestId: string;
  readonly committeeSize: number;
  readonly threshold: number;
}

export interface DkgContribution {
  readonly type: 'dkg-contribution';
  readonly requestId: string;
  readonly workerId: string;
  readonly partyIndex: number;
  readonly publicKeyBuffer: ArrayBuffer;
  readonly contributionBuffer: ArrayBuffer;
  readonly secretShareBuffer: ArrayBuffer;
}

export interface PartialDecryptRequest {
  readonly type: 'partial-decrypt-request';
  readonly requestId: string;
  readonly ciphertextBuffer: ArrayBuffer;
}

export interface PartialDecryptResponse {
  readonly type: 'partial-decrypt-response';
  readonly requestId: string;
  readonly workerId: string;
  readonly partyIndex: number;
  readonly shareBuffer: ArrayBuffer;
}

export interface EncryptRequest {
  readonly type: 'encrypt-request';
  readonly requestId: string;
  readonly hospitalId: string;
  readonly publicKeyBuffer: ArrayBuffer;
  readonly plaintextBuffer: ArrayBuffer;
}

export interface EncryptResponse {
  readonly type: 'encrypt-response';
  readonly requestId: string;
  readonly workerId: string;
  readonly hospitalId: string;
  readonly ciphertextBuffer: ArrayBuffer;
}

export interface AggregateRequest {
  readonly type: 'aggregate-request';
  readonly requestId: string;
  readonly ciphertextBuffers: readonly ArrayBuffer[];
}

export interface AggregateResponse {
  readonly type: 'aggregate-response';
  readonly requestId: string;
  readonly workerId: string;
  readonly ciphertextBuffer: ArrayBuffer;
}

export interface CombineRequest {
  readonly type: 'combine-request';
  readonly requestId: string;
  readonly ciphertextBuffer: ArrayBuffer;
  readonly shareBuffers: readonly ArrayBuffer[];
  readonly partyIndices: readonly number[];
}

export type WorkerMessage =
  | PingRequest
  | PingResponse
  | DkgRequest
  | DkgContribution
  | PartialDecryptRequest
  | PartialDecryptResponse
  | EncryptRequest
  | EncryptResponse
  | AggregateRequest
  | AggregateResponse
  | CombineRequest;

export interface WorkerTelemetryEnvelope {
  readonly workerId: string;
  readonly role: WorkerRole;
  readonly partyIndex?: number;
  readonly event: TelemetryEvent;
}

export type WorkerTelemetrySink = (event: WorkerTelemetryEnvelope) => void;

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

function pushBuffer(buffers: Transferable[], candidate: unknown): void {
  if (isArrayBuffer(candidate)) {
    buffers.push(candidate);
  }
}

export function getMessageTransferables(message: WorkerMessage): Transferable[] {
  const transferables: Transferable[] = [];

  switch (message.type) {
    case 'ping-request':
    case 'ping-response':
    case 'dkg-request':
      return transferables;
    case 'dkg-contribution':
      pushBuffer(transferables, message.publicKeyBuffer);
      pushBuffer(transferables, message.contributionBuffer);
      pushBuffer(transferables, message.secretShareBuffer);
      return transferables;
    case 'partial-decrypt-request':
      pushBuffer(transferables, message.ciphertextBuffer);
      return transferables;
    case 'partial-decrypt-response':
      pushBuffer(transferables, message.shareBuffer);
      return transferables;
    case 'encrypt-request':
      pushBuffer(transferables, message.publicKeyBuffer);
      pushBuffer(transferables, message.plaintextBuffer);
      return transferables;
    case 'encrypt-response':
      pushBuffer(transferables, message.ciphertextBuffer);
      return transferables;
    case 'aggregate-request':
      for (const ciphertextBuffer of message.ciphertextBuffers) {
        pushBuffer(transferables, ciphertextBuffer);
      }
      return transferables;
    case 'aggregate-response':
      pushBuffer(transferables, message.ciphertextBuffer);
      return transferables;
    case 'combine-request':
      pushBuffer(transferables, message.ciphertextBuffer);
      for (const shareBuffer of message.shareBuffers) {
        pushBuffer(transferables, shareBuffer);
      }
      return transferables;
  }
}

export function getBootstrapTransferables(bootstrap: WorkerBootstrap): Transferable[] {
  const transferables: Transferable[] = [];

  if (bootstrap.engine.kind === 'demo') {
    return transferables;
  }

  return transferables;
}
