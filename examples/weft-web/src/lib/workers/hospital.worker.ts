import * as Comlink from 'comlink';

import type {
  EncryptRequest,
  EncryptResponse,
  HospitalWorkerApi,
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

const hospitalApi: HospitalWorkerApi = {
  async configure(bootstrap: WorkerBootstrap, telemetrySink?: WorkerTelemetrySink): Promise<void> {
    await configureWorkerRuntime(runtimeState, bootstrap, telemetrySink);
  },

  async ping(request: PingRequest): Promise<PingResponse> {
    ensureRuntimeConfigured(runtimeState);

    const now = Date.now();
    return {
      type: 'ping-response',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      role: runtimeState.identity.role,
      roundTripMs: now - request.sentAt,
      receivedAt: now
    };
  },

  async encrypt(request: EncryptRequest): Promise<EncryptResponse> {
    ensureRuntimeConfigured(runtimeState);

    const plaintext = new Int32Array(cloneTransferredBuffer(request.plaintextBuffer));
    const ciphertext = await runtimeState.engine.encryptVector(
      { bytes: bufferToBytes(cloneTransferredBuffer(request.publicKeyBuffer)) },
      plaintext
    );
    const ciphertextBuffer = bytesToBuffer(ciphertext.bytes);

    return Comlink.transfer({
      type: 'encrypt-response',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      hospitalId: request.hospitalId,
      ciphertextBuffer
    }, [ciphertextBuffer]);
  }
};

Comlink.expose(hospitalApi);
