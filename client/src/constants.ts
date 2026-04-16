// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants
//
// Standard coefficient encoding: one BFV coefficient per gradient integer.
// Overflow constraint: n_max × MAX_GRAD_INT < t / 2

/**
 * Fixed-point scale factor: gradient_int = Math.round(grad_float * SCALE_FACTOR)
 *
 * S=4096 gives ±0.000244 precision.
 */
export const SCALE_FACTOR = 4096;

/** Maximum number of participating clients per FL round. */
export const MAX_CLIENTS = 10;

/** Absolute gradient clamp before quantization. */
export const MAX_GRAD_ABS = 1.0;

/** Maximum quantized gradient magnitude as integer: MAX_GRAD_ABS * SCALE_FACTOR. */
export const MAX_GRAD_INT = Math.floor(MAX_GRAD_ABS * SCALE_FACTOR);

/**
 * Default number of polynomial coefficients per ciphertext.
 * Equals the ring dimension (degree) of the BFV preset.
 * For SecureThreshold8192: 8192. For InsecureThreshold512: 512.
 *
 * With standard encoding, each gradient uses 1 coefficient,
 * so gradients per ciphertext = SLOTS_PER_CT.
 */
export const DEFAULT_SLOTS_PER_CT = 8192;

/**
 * Demo fallback plaintext modulus.
 *
 * AGENTS.MD: "Read t from the preset at startup — do not hardcode it."
 * This constant is used only as a fallback; the actual value should be read
 * from BFV parameters or other verified upstream configuration when available.
 */
export const PLAINTEXT_MODULUS = 131072n;

/**
 * Validate the standard overflow safety invariant.
 *
 * AGENTS.MD §Overflow Safety Invariant:
 *   n_max × MAX_GRAD_INT < t / 2
 *
 * @param plaintextModulus - The plaintext modulus t from the BFV preset
 * @param numClients - Number of clients in this round
 * @throws Error if invariant is violated
 */
export function validateOverflowInvariant(
  plaintextModulus: bigint,
  numClients: number,
): void {
  const halfT = plaintextModulus / 2n;
  const maxSum = BigInt(numClients) * BigInt(MAX_GRAD_INT);
  if (maxSum >= halfT) {
    throw new Error(
      `Overflow invariant violated: numClients(${numClients}) × MAX_GRAD_INT(${MAX_GRAD_INT}) = ${maxSum} >= t/2=${halfT}. ` +
        `Max clients for t=${plaintextModulus}: ${(halfT - 1n) / BigInt(MAX_GRAD_INT)}.`,
    );
  }
}
