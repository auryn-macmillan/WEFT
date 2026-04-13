import {
  BITS_PER_GRADIENT,
  DEFAULT_SLOTS_PER_CT,
  GRADIENTS_PER_CT,
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

function resolvePlaintextModulus(bfvParams: Uint8Array): bigint {
  const decoded = new TextDecoder().decode(bfvParams);
  const match = decoded.match(/(?:plaintextModulus|plain_modulus|\bt\b)\D+(\d+)/i);
  return match ? BigInt(match[1]) : PLAINTEXT_MODULUS;
}

function resolvePresetName(bfvParams: Uint8Array): string {
  const decoded = new TextDecoder().decode(bfvParams);
  if (decoded.includes(INSECURE_PRESET_NAME)) return INSECURE_PRESET_NAME;
  if (decoded.includes(SECURE_PRESET_NAME)) return SECURE_PRESET_NAME;
  return DEFAULT_SLOTS_PER_CT === 512 ? INSECURE_PRESET_NAME : SECURE_PRESET_NAME;
}

function bitsNeeded(scaleFactor: number, maxGradAbs: number): number {
  return Math.ceil(Math.log2(2 * scaleFactor * maxGradAbs + 1));
}

/**
 * Bitplane-encode a single gradient into B coefficient values (each 0 or 1).
 *
 * Encoding: clamp → scale → offset to unsigned → decompose into bits.
 * Each bit becomes one BFV coefficient. After homomorphic addition across N
 * clients, coefficient[b] holds a tally count in [0, N] rather than a gradient
 * magnitude, which is why the overflow constraint reduces to n_max < t/2.
 */
export function encodeBitplane(
  gradient: number,
  scaleFactor: number = SCALE_FACTOR,
  maxGradAbs: number = MAX_GRAD_ABS,
): number[] {
  const clamped = clampGradient(gradient, maxGradAbs);
  const scaled = Math.round(clamped * scaleFactor);
  const unsigned = scaled + scaleFactor * maxGradAbs;
  const B = bitsNeeded(scaleFactor, maxGradAbs);
  const bits: number[] = new Array(B);
  for (let b = 0; b < B; b++) {
    bits[b] = (unsigned >> b) & 1;
  }
  return bits;
}

/**
 * Decode bitplane tallies back to a float gradient (post-decryption).
 *
 * After threshold decryption, each coefficient holds the sum of that bit
 * position across all clients. Reconstruct: weighted sum → remove offset → divide.
 */
export function decodeBitplane(
  tallies: number[],
  numClients: number,
  scaleFactor: number = SCALE_FACTOR,
  maxGradAbs: number = MAX_GRAD_ABS,
): number {
  let weightedSum = 0;
  for (let b = 0; b < tallies.length; b++) {
    weightedSum += tallies[b] * (1 << b);
  }
  const offsetRemoved = weightedSum - numClients * scaleFactor * maxGradAbs;
  return offsetRemoved / (numClients * scaleFactor);
}

/**
 * Quantize an array of gradients into bitplane-encoded BFV coefficients.
 *
 * Returns a flat bigint[] where every BITS_PER_GRADIENT consecutive values
 * represent one gradient's bit decomposition. This flat array maps directly
 * to BFV polynomial coefficients.
 */
export function quantizeGradients(
  gradients: Float32Array,
  scaleFactor: number = SCALE_FACTOR,
  maxGradAbs: number = MAX_GRAD_ABS,
): bigint[] {
  const coefficients: bigint[] = [];
  for (let i = 0; i < gradients.length; i++) {
    const bits = encodeBitplane(gradients[i], scaleFactor, maxGradAbs);
    for (const bit of bits) {
      coefficients.push(BigInt(bit));
    }
  }
  return coefficients;
}

/**
 * Dequantize bitplane-encoded coefficients back to float gradients.
 *
 * The input is a flat array of tally values (post-homomorphic-sum, post-decryption).
 * Every BITS_PER_GRADIENT consecutive values form one gradient's tallies.
 */
export function dequantizeGradients(
  coefficients: bigint[],
  numClients: number,
  scaleFactor: number = SCALE_FACTOR,
  maxGradAbs: number = MAX_GRAD_ABS,
): Float32Array {
  if (numClients <= 0) {
    throw new Error("numClients must be greater than zero");
  }

  const B = bitsNeeded(scaleFactor, maxGradAbs);
  const numGradients = Math.floor(coefficients.length / B);
  const result = new Float32Array(numGradients);

  for (let g = 0; g < numGradients; g++) {
    const tallies: number[] = new Array(B);
    for (let b = 0; b < B; b++) {
      tallies[b] = Number(coefficients[g * B + b]);
    }
    result[g] = decodeBitplane(tallies, numClients, scaleFactor, maxGradAbs);
  }

  return result;
}

export function splitIntoChunks(
  coefficients: bigint[],
  slotsPerCt: number = DEFAULT_SLOTS_PER_CT,
): bigint[][] {
  if (slotsPerCt <= 0) {
    throw new Error("slotsPerCt must be greater than zero");
  }

  const chunks: bigint[][] = [];
  for (let index = 0; index < coefficients.length; index += slotsPerCt) {
    const chunk = coefficients.slice(index, index + slotsPerCt);
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

  const quantized = quantizeGradients(gradients, scaleFactor, MAX_GRAD_ABS);
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
