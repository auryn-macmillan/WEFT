import * as Comlink from 'comlink';

import type {
  AggregateRequest,
  AggregateResponse,
  AggregatorWorkerApi,
  PingRequest,
  PingResponse,
  WorkerBootstrap,
  WorkerTelemetrySink
} from './messages';
import {
  bufferToBytes,
  bytesToBuffer,
  cloneTransferredBuffer,
  configureWorkerRuntime,
  createWorkerRuntimeState,
  ensureRuntimeConfigured
} from './runtime';

const runtimeState = createWorkerRuntimeState();

const aggregatorApi: AggregatorWorkerApi = {
  async configure(bootstrap: WorkerBootstrap, telemetrySink?: WorkerTelemetrySink): Promise<void> {
    await configureWorkerRuntime(runtimeState, bootstrap, telemetrySink);
  },

  async ping(request: PingRequest): Promise<PingResponse> {
    ensureRuntimeConfigured(runtimeState);

    const now = performance.now();
    return {
      type: 'ping-response',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      role: runtimeState.identity.role,
      roundTripMs: now - request.sentAt,
      receivedAt: now
    };
  },

  async aggregate(request: AggregateRequest): Promise<AggregateResponse> {
    ensureRuntimeConfigured(runtimeState);

    const ciphertexts = request.ciphertextBuffers.map((ciphertextBuffer) => ({
      bytes: bufferToBytes(cloneTransferredBuffer(ciphertextBuffer))
    }));
    const aggregateCiphertext = await runtimeState.engine.aggregateCiphertexts(ciphertexts);
    const ciphertextBuffer = bytesToBuffer(aggregateCiphertext.bytes);

    return {
      type: 'aggregate-response',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      ciphertextBuffer: Comlink.transfer(ciphertextBuffer, [ciphertextBuffer])
    };
  }
};

Comlink.expose(aggregatorApi);
