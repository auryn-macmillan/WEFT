import * as Comlink from 'comlink';

import type {
  CombineRequest,
  CommitteeWorkerApi,
  DkgContribution,
  DkgRequest,
  PartialDecryptRequest,
  PartialDecryptResponse,
  PingRequest,
  PingResponse,
  WorkerBootstrap,
  WorkerTelemetrySink
} from './messages';
import {
  activateWorkerRound,
  assertWorkerRound,
  bufferToBytes,
  bytesToBuffer,
  clearWorkerRound,
  cloneTransferredBuffer,
  configureWorkerRuntime,
  createWorkerRuntimeState,
  ensureRuntimeConfigured
} from './runtime';

const runtimeState = createWorkerRuntimeState();
let activeSecretShareBuffer: ArrayBuffer | null = null;

const committeeApi: CommitteeWorkerApi = {
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

  async runDkg(request: DkgRequest): Promise<DkgContribution> {
    ensureRuntimeConfigured(runtimeState);

    activateWorkerRound(runtimeState, request.roundId);
    const transcript = await runtimeState.engine.runDkg(request.committeeSize, request.threshold);
    const secretShare = transcript.perPartyShares.find(
      (candidate) => candidate.partyIndex === runtimeState.identity.partyIndex
    );
    const contribution =
      transcript.contributions[(runtimeState.identity.partyIndex ?? 1) - 1] ?? transcript.contributions[0];

    if (!secretShare || !contribution) {
      throw new Error(`missing DKG material for ${runtimeState.identity.workerId}`);
    }

    const publicKeyBuffer = bytesToBuffer(transcript.publicKey.bytes);
    const contributionBuffer = bytesToBuffer(contribution);
    const secretShareBuffer = bytesToBuffer(secretShare.bytes);
    activeSecretShareBuffer = cloneTransferredBuffer(secretShareBuffer);

    return Comlink.transfer({
      type: 'dkg-contribution',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      partyIndex: runtimeState.identity.partyIndex ?? secretShare.partyIndex,
      publicKeyBuffer,
      contributionBuffer
    }, [publicKeyBuffer, contributionBuffer]);
  },

  async partialDecrypt(request: PartialDecryptRequest): Promise<PartialDecryptResponse> {
    ensureRuntimeConfigured(runtimeState);
    assertWorkerRound(runtimeState, request.roundId);
    const partyIndex = runtimeState.identity.partyIndex;

    if (!partyIndex) {
      throw new Error(`committee worker ${runtimeState.identity.workerId} missing party index`);
    }

    if (!activeSecretShareBuffer) {
      throw new Error(`committee worker ${runtimeState.identity.workerId} has no active secret share`);
    }

    const share = await runtimeState.engine.partialDecrypt(
      {
        bytes: bufferToBytes(cloneTransferredBuffer(activeSecretShareBuffer)),
        partyIndex
      },
      { bytes: bufferToBytes(cloneTransferredBuffer(request.ciphertextBuffer)) }
    );

    const shareBuffer = bytesToBuffer(share.bytes);
    return Comlink.transfer({
      type: 'partial-decrypt-response',
      requestId: request.requestId,
      workerId: runtimeState.identity.workerId,
      partyIndex: share.partyIndex,
      shareBuffer
    }, [shareBuffer]);
  },

  async combine(request: CombineRequest): Promise<ArrayBuffer> {
    ensureRuntimeConfigured(runtimeState);
    assertWorkerRound(runtimeState, request.roundId);

    const shares = request.shareBuffers.map((shareBuffer, index) => ({
      bytes: bufferToBytes(cloneTransferredBuffer(shareBuffer)),
      partyIndex: request.partyIndices[index] ?? index + 1
    }));
    const plaintext = await runtimeState.engine.combineDecryptionShares(shares, {
      bytes: bufferToBytes(cloneTransferredBuffer(request.ciphertextBuffer))
    });
    const plaintextBuffer = plaintext.buffer.slice(
      plaintext.byteOffset,
      plaintext.byteOffset + plaintext.byteLength
    );
    activeSecretShareBuffer = null;
    clearWorkerRound(runtimeState);
    return Comlink.transfer(plaintextBuffer as ArrayBuffer, [plaintextBuffer as ArrayBuffer]);
  }
};

Comlink.expose(committeeApi);
