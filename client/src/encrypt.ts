import {
  DEFAULT_SLOTS_PER_CT,
  MAX_CLIENTS,
  MAX_GRAD_ABS,
  PLAINTEXT_MODULUS,
  SCALE_FACTOR,
  validateOverflowInvariant,
} from "./constants";

const INSECURE_PRESET_NAME = "INSECURE_THRESHOLD_512";
const SECURE_PRESET_NAME = "SECURE_THRESHOLD_8192";

function clampGradient(value: number, maxGradAbs: number): number {
  return Math.min(Math.max(value, -maxGradAbs), maxGradAbs);
}

function normalizeMod(value: bigint, plaintextModulus: bigint): bigint {
  return ((value % plaintextModulus) + plaintextModulus) % plaintextModulus;
}

function resolvePlaintextModulus(bfvParams: Uint8Array): bigint {
  const decoded = new TextDecoder().decode(bfvParams);
  const match = decoded.match(/(?:plaintextModulus|plain_modulus|\bt\b)\D+(\d+)/i);
  return match ? BigInt(match[1]) : PLAINTEXT_MODULUS;
}

function resolvePresetName(bfvParams: Uint8Array): string {
  const decoded = new TextDecoder().decode(bfvParams);
  if (decoded.includes(INSECURE_PRESET_NAME)) {
    return INSECURE_PRESET_NAME;
  }
  if (decoded.includes(SECURE_PRESET_NAME)) {
    return SECURE_PRESET_NAME;
  }
  return DEFAULT_SLOTS_PER_CT === 512 ? INSECURE_PRESET_NAME : SECURE_PRESET_NAME;
}

// AGENTS.MD: Gradient Encoding
export function quantizeGradients(
  gradients: Float32Array,
  scaleFactor: number = SCALE_FACTOR,
  maxGradAbs: number = MAX_GRAD_ABS,
  plaintextModulus: bigint = PLAINTEXT_MODULUS,
): bigint[] {
  return Array.from(gradients, (gradient) => {
    const clamped = clampGradient(gradient, maxGradAbs);
    const quantized = Math.round(clamped * scaleFactor);
    if (quantized < 0) {
      return normalizeMod(plaintextModulus - BigInt(Math.abs(quantized)), plaintextModulus);
    }
    return normalizeMod(BigInt(quantized), plaintextModulus);
  });
}

export function dequantizeGradients(
  quantized: bigint[],
  numClients: number,
  scaleFactor: number = SCALE_FACTOR,
  plaintextModulus: bigint = PLAINTEXT_MODULUS,
): Float32Array {
  if (numClients <= 0) {
    throw new Error("numClients must be greater than zero");
  }

  const denominator = numClients * scaleFactor;
  const halfModulus = plaintextModulus / 2n;

  return Float32Array.from(
    quantized.map((value) => {
      const normalized = normalizeMod(value, plaintextModulus);
      const signed = normalized > halfModulus ? normalized - plaintextModulus : normalized;
      return Number(signed) / denominator;
    }),
  );
}

export function splitIntoChunks(
  quantized: bigint[],
  slotsPerCt: number = DEFAULT_SLOTS_PER_CT,
): bigint[][] {
  if (slotsPerCt <= 0) {
    throw new Error("slotsPerCt must be greater than zero");
  }

  const chunks: bigint[][] = [];
  for (let index = 0; index < quantized.length; index += slotsPerCt) {
    const chunk = quantized.slice(index, index + slotsPerCt);
    while (chunk.length < slotsPerCt) {
      chunk.push(0n);
    }
    chunks.push(chunk);
  }
  return chunks;
}

export async function encryptGradients(
  gradients: Float32Array,
  publicKey: Uint8Array,
  bfvParams: Uint8Array,
  scaleFactor: number = SCALE_FACTOR,
): Promise<Uint8Array[]> {
  const { encryptVector } = await import("@enclave-e3/sdk");
  const plaintextModulus = resolvePlaintextModulus(bfvParams);
  validateOverflowInvariant(plaintextModulus, MAX_CLIENTS);

  const quantized = quantizeGradients(
    gradients,
    scaleFactor,
    MAX_GRAD_ABS,
    plaintextModulus,
  );
  const chunks = splitIntoChunks(quantized, DEFAULT_SLOTS_PER_CT);
  const presetName = resolvePresetName(bfvParams);

  return Promise.all(
    chunks.map((chunk) =>
      Promise.resolve(
        encryptVector(BigUint64Array.from(chunk), publicKey, presetName),
      ),
    ),
  );
}
