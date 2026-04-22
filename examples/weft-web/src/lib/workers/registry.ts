import * as Comlink from 'comlink';

import type {
  AggregateRequest,
  AggregateResponse,
  AggregatorWorkerApi,
  CommitteeWorkerApi,
  CombineRequest,
  DkgContribution,
  DkgRequest,
  EncryptRequest,
  EncryptResponse,
  HospitalWorkerApi,
  PartialDecryptRequest,
  PartialDecryptResponse,
  PingRequest,
  PingResponse,
  WorkerBootstrap,
  WorkerEngineDescriptor,
  WorkerIdentity,
  WorkerMessage,
  WorkerTelemetrySink
} from './messages';
import { getMessageTransferables } from './messages';

export const COMMITTEE_WORKER_COUNT = 5;
export const HOSPITAL_WORKER_COUNT = 3;

export type EngineFactory = (identity: WorkerIdentity) => WorkerEngineDescriptor;

export interface WorkerEntry<Api> {
  readonly identity: WorkerIdentity;
  readonly worker: Worker;
  readonly api: Comlink.Remote<Api>;
}

export interface WorkerRegistry {
  readonly committee: readonly WorkerEntry<CommitteeWorkerApi>[];
  readonly hospitals: readonly WorkerEntry<HospitalWorkerApi>[];
  readonly aggregator: WorkerEntry<AggregatorWorkerApi>;
  readonly all: readonly WorkerEntry<CommitteeWorkerApi | HospitalWorkerApi | AggregatorWorkerApi>[];
}

export let workerRegistry: WorkerRegistry | null = null;
let workerRegistryPromise: Promise<WorkerRegistry> | null = null;

function createCommitteeWorker(): Worker {
  return new Worker(new URL('./committee.worker.ts', import.meta.url), { type: 'module' });
}

function createHospitalWorker(): Worker {
  return new Worker(new URL('./hospital.worker.ts', import.meta.url), { type: 'module' });
}

function createAggregatorWorker(): Worker {
  return new Worker(new URL('./aggregator.worker.ts', import.meta.url), { type: 'module' });
}

function transferMessage<T extends WorkerMessage>(message: T): T {
  const transferables = getMessageTransferables(message);
  if (transferables.length === 0) {
    return message;
  }

  return Comlink.transfer(message, transferables);
}

async function createWorkerEntry<Api extends object>(
  identity: WorkerIdentity,
  createWorker: () => Worker,
  engineFactory: EngineFactory,
  telemetrySink?: WorkerTelemetrySink
): Promise<WorkerEntry<Api>> {
  const worker = createWorker();
  const api = Comlink.wrap<Api>(worker);
  const bootstrap: WorkerBootstrap = {
    identity,
    engine: engineFactory(identity)
  };
  const configure = (api as unknown as Comlink.Remote<{ configure(bootstrap: WorkerBootstrap, telemetrySink?: WorkerTelemetrySink): Promise<void> }>);

  await configure.configure(
    bootstrap,
    telemetrySink ? Comlink.proxy(telemetrySink) : undefined
  );

  return {
    identity,
    worker,
    api
  };
}

export async function spawnWorkers(
  engineFactory: EngineFactory,
  telemetrySink?: WorkerTelemetrySink
): Promise<WorkerRegistry> {
  if (workerRegistry) {
    throw new Error('workers already spawned; terminate existing registry first');
  }
  if (workerRegistryPromise) {
    throw new Error('workers are already spawning');
  }

  workerRegistryPromise = (async () => {
    const createdWorkers: Worker[] = [];

    try {
      const trackedCreateWorker = (factory: () => Worker): (() => Worker) => {
        return () => {
          const worker = factory();
          createdWorkers.push(worker);
          return worker;
        };
      };

      const committeePromises = Array.from({ length: COMMITTEE_WORKER_COUNT }, (_, index) =>
        createWorkerEntry<CommitteeWorkerApi>(
          {
            workerId: `committee-${index + 1}`,
            role: 'committee',
            partyIndex: index + 1
          },
          trackedCreateWorker(createCommitteeWorker),
          engineFactory,
          telemetrySink
        )
      );

      const hospitalPromises = Array.from({ length: HOSPITAL_WORKER_COUNT }, (_, index) =>
        createWorkerEntry<HospitalWorkerApi>(
          {
            workerId: `hospital-${index + 1}`,
            role: 'hospital',
            partyIndex: index + 1
          },
          trackedCreateWorker(createHospitalWorker),
          engineFactory,
          telemetrySink
        )
      );

      const aggregatorPromise = createWorkerEntry<AggregatorWorkerApi>(
        {
          workerId: 'aggregator-1',
          role: 'aggregator'
        },
        trackedCreateWorker(createAggregatorWorker),
        engineFactory,
        telemetrySink
      );

      const [committee, hospitals, aggregator] = await Promise.all([
        Promise.all(committeePromises),
        Promise.all(hospitalPromises),
        aggregatorPromise
      ]);

      workerRegistry = {
        committee,
        hospitals,
        aggregator,
        all: [...committee, ...hospitals, aggregator]
      };

      return workerRegistry;
    } catch (error) {
      for (const worker of createdWorkers) {
        worker.terminate();
      }
      throw error;
    } finally {
      workerRegistryPromise = null;
    }
  })();

  return workerRegistryPromise;
}

export function terminateWorkers(registry: WorkerRegistry | null = workerRegistry): void {
  if (workerRegistryPromise && !registry) {
    workerRegistryPromise = null;
  }
  if (!registry) {
    workerRegistry = null;
    return;
  }

  for (const entry of registry.all) {
    entry.worker.terminate();
  }

  if (workerRegistry === registry) {
    workerRegistry = null;
  }
}

function createRequestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createRoundId(): string {
  return `round-${crypto.randomUUID()}`;
}

export async function pingWorkers(registry: WorkerRegistry): Promise<PingResponse[]> {
  const startedAt = Date.now();

  return Promise.all(
    registry.all.map((entry) =>
      (entry.api as Comlink.Remote<{ ping(request: PingRequest): Promise<PingResponse> }>).ping({
        type: 'ping-request',
        requestId: createRequestId('ping'),
        sentAt: startedAt
      })
    )
  );
}

export async function requestCommitteeDkg(
  registry: WorkerRegistry,
  request: Omit<DkgRequest, 'type' | 'requestId'>
): Promise<DkgContribution[]> {
  const message: DkgRequest = {
    type: 'dkg-request',
    requestId: createRequestId('dkg'),
    ...request
  };

  return Promise.all(registry.committee.map((entry) => entry.api.runDkg(transferMessage(message))));
}

export async function encryptWithHospital(
  entry: WorkerEntry<HospitalWorkerApi>,
  request: Omit<EncryptRequest, 'type' | 'requestId'>
): Promise<EncryptResponse> {
  const message: EncryptRequest = {
    type: 'encrypt-request',
    requestId: createRequestId('encrypt'),
    ...request
  };

  return entry.api.encrypt(transferMessage(message));
}

export async function aggregateCiphertexts(
  registry: WorkerRegistry,
  ciphertextBuffers: readonly ArrayBuffer[]
): Promise<AggregateResponse> {
  const message: AggregateRequest = {
    type: 'aggregate-request',
    requestId: createRequestId('aggregate'),
    ciphertextBuffers
  };

  const transferables = ciphertextBuffers.map((ciphertextBuffer) => ciphertextBuffer.slice(0));

  return registry.aggregator.api.aggregate(transferMessage({
    ...message,
    ciphertextBuffers: transferables
  }));
}

export async function requestPartialDecryptions(
  registry: WorkerRegistry,
  roundId: string,
  ciphertextBuffer: ArrayBuffer
): Promise<PartialDecryptResponse[]> {
  return Promise.all(
    registry.committee.map((entry) => {
      const request: PartialDecryptRequest = {
        type: 'partial-decrypt-request',
        requestId: createRequestId('partial-decrypt'),
        roundId,
        ciphertextBuffer: ciphertextBuffer.slice(0)
      };

      return entry.api.partialDecrypt(transferMessage(request));
    })
  );
}

export async function combineDecryptionShares(
  entry: WorkerEntry<CommitteeWorkerApi>,
  roundId: string,
  ciphertextBuffer: ArrayBuffer,
  shareBuffers: readonly ArrayBuffer[],
  partyIndices: readonly number[]
): Promise<ArrayBuffer> {
  const request: CombineRequest = {
    type: 'combine-request',
    requestId: createRequestId('combine'),
    roundId,
    ciphertextBuffer,
    shareBuffers,
    partyIndices
  };

  return entry.api.combine(transferMessage(request));
}
