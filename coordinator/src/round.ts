import { ethers } from "ethers";

import * as weftClient from "@weft/client";

import { applyGradientUpdate } from "./model.js";

const {
  DEFAULT_SLOTS_PER_CT,
  PLAINTEXT_MODULUS,
  SCALE_FACTOR,
} = weftClient;

const ENCLAVE_ABI = [
  "function request(address e3ProgramAddress, bytes e3ProgramParams, bytes computeProviderParams) external returns (uint256 e3Id)",
  "function activate(uint256 e3Id) external returns (bytes publicKey)",
  "event CiphertextOutputPublished(uint256 indexed e3Id, bytes output)",
  "event PlaintextOutputPublished(uint256 indexed e3Id, bytes output)",
] as const;

const FL_AGGREGATOR_ABI = [
  "function inputCounts(uint256 e3Id) external view returns (uint256)",
] as const;

const DEFAULT_COMPUTE_PROVIDER_PARAMS = "0x";
const INPUT_POLL_INTERVAL_MS = 2_000;
const EVENT_TIMEOUT_MS = 300_000;

export interface RoundConfig {
  e3ProgramAddress: string;
  enclaveAddress: string;
  numClients: number;
  numChunks: number;
  scaleFactor: number;
  maxGradInt: number;
  coordinatorAddress: string;
  signer: ethers.Signer;
}

export interface RoundResult {
  aggregatedGradients: Float32Array;
  newWeights: Float32Array;
}

export async function runRound(
  globalWeights: Float32Array,
  config: RoundConfig,
): Promise<RoundResult> {
  if (!config.signer.provider) {
    throw new Error("Round signer must be connected to a provider");
  }

  const enclave = new ethers.Contract(
    config.enclaveAddress,
    ENCLAVE_ABI,
    config.signer,
  );
  const aggregator = new ethers.Contract(
    config.e3ProgramAddress,
    FL_AGGREGATOR_ABI,
    config.signer,
  );

  const scaleFactor = config.scaleFactor || SCALE_FACTOR;
  const plaintextModulus = PLAINTEXT_MODULUS;
  const expectedGradientCapacity = config.numChunks * DEFAULT_SLOTS_PER_CT;
  if (globalWeights.length > expectedGradientCapacity) {
    throw new Error(
      `Global weights length ${globalWeights.length} exceeds round capacity ${expectedGradientCapacity}`,
    );
  }

  // 1. Request E3.
  const e3ProgramParams = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint32", "uint32", "uint32", "uint32", "address"],
    [
      config.numClients,
      config.numChunks,
      scaleFactor,
      config.maxGradInt,
      config.coordinatorAddress,
    ],
  );
  const e3Id = await requestE3(enclave, config.e3ProgramAddress, e3ProgramParams);

  // 2. Activate E3.
  const committeePublicKey = await activateE3(enclave, e3Id);
  void committeePublicKey;

  // 3. Wait for inputs.
  await waitForInputs(aggregator, e3Id, config.numClients);

  // 4. Wait for compute.
  await waitForEvent(enclave, "CiphertextOutputPublished", [e3Id]);

  // 5. Collect output.
  const [, output] = await waitForEvent(enclave, "PlaintextOutputPublished", [e3Id]);
  const chunks = decodeOutput(toUint8Array(output), plaintextModulus);

  // 6-8. Decode, dequantize, reconstruct.
  // AGENTS.MD §Coordinator: apply 1/n FedAvg scalar post-decryption.
  const dequantized = dequantizeChunks(chunks, config.numClients, scaleFactor, plaintextModulus);
  const aggregatedGradients = dequantized.slice(0, globalWeights.length);

  // 9. AGENTS.MD §Coordinator / Model update.
  const newWeights = applyGradientUpdate(globalWeights, aggregatedGradients);

  return { aggregatedGradients, newWeights };
}

export function decodeOutput(
  outputBytes: Uint8Array,
  plaintextModulus: bigint,
): bigint[][] {
  if (outputBytes.length < 4) {
    throw new Error("Output payload too short to contain chunk count");
  }

  let offset = 0;
  const numChunks = readU32LE(outputBytes, offset);
  offset += 4;

  const chunks: bigint[][] = [];
  for (let i = 0; i < numChunks; i++) {
    if (offset + 4 > outputBytes.length) {
      throw new Error(`Missing byte length for chunk ${i}`);
    }

    const chunkLength = readU32LE(outputBytes, offset);
    offset += 4;

    if (offset + chunkLength > outputBytes.length) {
      throw new Error(`Chunk ${i} exceeds output payload bounds`);
    }

    const chunkBytes = outputBytes.slice(offset, offset + chunkLength);
    const chunk = decodePlaintextChunk(chunkBytes);
    for (const value of chunk) {
      if (value < 0n || value >= plaintextModulus) {
        throw new Error(`Decoded plaintext value ${value} outside modulus range`);
      }
    }
    chunks.push(chunk);
    offset += chunkLength;
  }

  if (offset !== outputBytes.length) {
    throw new Error("Output payload contains trailing bytes");
  }

  return chunks;
}

export function dequantizeChunks(
  chunks: bigint[][],
  numClients: number,
  scaleFactor: number,
  plaintextModulus: bigint,
): Float32Array {
  if (numClients <= 0) {
    throw new Error("numClients must be greater than zero");
  }
  if (scaleFactor <= 0) {
    throw new Error("scaleFactor must be greater than zero");
  }

  const halfModulus = plaintextModulus / 2n;
  const divisor = numClients * scaleFactor;
  const gradients = new Float32Array(countValues(chunks));

  let index = 0;
  for (const chunk of chunks) {
    for (const rawValue of chunk) {
      let value = rawValue;
      if (value > halfModulus) {
        value -= plaintextModulus;
      }

      gradients[index] = Number(value) / divisor;
      index += 1;
    }
  }

  return gradients;
}

function decodePlaintextChunk(chunkBytes: Uint8Array): bigint[] {
  if (chunkBytes.length === 0) {
    return [];
  }

  if (chunkBytes.length >= 4) {
    const count = readU32LE(chunkBytes, 0);
    if (chunkBytes.length === 4 + count * 8) {
      return readWordArray(chunkBytes, 4, 8, count);
    }
    if (chunkBytes.length === 4 + count * 4) {
      return readWordArray(chunkBytes, 4, 4, count);
    }
  }

  if (chunkBytes.length % 8 === 0) {
    return readWordArray(chunkBytes, 0, 8, chunkBytes.length / 8);
  }

  if (chunkBytes.length % 4 === 0) {
    return readWordArray(chunkBytes, 0, 4, chunkBytes.length / 4);
  }

  return Array.from(chunkBytes, (value) => BigInt(value));
}

function readWordArray(
  bytes: Uint8Array,
  start: number,
  wordSize: 4 | 8,
  count: number,
): bigint[] {
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + start,
    bytes.byteLength - start,
  );
  const values = new Array<bigint>(count);

  for (let i = 0; i < count; i++) {
    const offset = i * wordSize;
    values[i] =
      wordSize === 8
        ? view.getBigUint64(offset, true)
        : BigInt(view.getUint32(offset, true));
  }

  return values;
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    throw new Error("Unexpected end of buffer while reading u32");
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    offset,
    true,
  );
}

function toUint8Array(bytesLike: Uint8Array | string): Uint8Array {
  return bytesLike instanceof Uint8Array ? bytesLike : ethers.getBytes(bytesLike);
}

async function requestE3(
  enclave: ethers.Contract,
  e3ProgramAddress: string,
  e3ProgramParams: string,
): Promise<bigint> {
  const result = await enclave.request(
    e3ProgramAddress,
    e3ProgramParams,
    DEFAULT_COMPUTE_PROVIDER_PARAMS,
  );

  return extractRoundId(result);
}

async function activateE3(
  enclave: ethers.Contract,
  e3Id: bigint,
): Promise<Uint8Array> {
  const result = await enclave.activate(e3Id);
  if (typeof result === "string" || result instanceof Uint8Array) {
    return toUint8Array(result);
  }
  if (result && typeof result === "object" && "publicKey" in result) {
    return toUint8Array((result as { publicKey: string | Uint8Array }).publicKey);
  }

  throw new Error("Unable to derive committee public key from activate() result");
}

async function waitForInputs(
  aggregator: ethers.Contract,
  e3Id: bigint,
  numClients: number,
): Promise<void> {
  const required = BigInt(numClients);

  for (;;) {
    const inputCount = BigInt(await aggregator.inputCounts(e3Id));
    if (inputCount >= required) {
      return;
    }

    await sleep(INPUT_POLL_INTERVAL_MS);
  }
}

async function waitForEvent(
  contract: ethers.Contract,
  eventName: string,
  expectedArgs: readonly bigint[],
): Promise<unknown[]> {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      contract.off(eventName, listener);
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, EVENT_TIMEOUT_MS);

    const listener = (...args: unknown[]) => {
      const matches = expectedArgs.every((expected, index) => {
        try {
          return BigInt(args[index] as bigint | number | string) === expected;
        } catch {
          return false;
        }
      });

      if (!matches) {
        return;
      }

      clearTimeout(timeout);
      contract.off(eventName, listener);
      resolve(args);
    };

    contract.on(eventName, listener);
  });
}

function extractRoundId(result: unknown): bigint {
  if (typeof result === "bigint") {
    return result;
  }
  if (typeof result === "number" || typeof result === "string") {
    return BigInt(result);
  }
  if (result && typeof result === "object" && "e3Id" in result) {
    return BigInt((result as { e3Id: bigint | number | string }).e3Id);
  }

  throw new Error("Unable to derive e3Id from request() result");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countValues(chunks: bigint[][]): number {
  let total = 0;
  for (const chunk of chunks) {
    total += chunk.length;
  }
  return total;
}
