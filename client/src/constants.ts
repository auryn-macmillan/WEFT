// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants
//
// Bitplane tally encoding: each gradient is decomposed into B individual bits
// across separate BFV coefficients. This shifts the overflow constraint from
//   n_max × S × G < t/2   (standard)
// to just:
//   n_max < t/2            (bitplane)
// decoupling precision from the plaintext modulus entirely.

/**
 * Fixed-point scale factor: gradient_int = Math.round(grad_float * SCALE_FACTOR)
 *
 * With bitplane tally encoding, SCALE_FACTOR no longer participates in the
 * overflow constraint — we can use high precision without limiting client count.
 * S=4096 gives ±0.000244 precision (1024× better than the old S=4).
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
 * With bitplane encoding, each gradient uses BITS_PER_GRADIENT coefficients,
 * so gradients per ciphertext = floor(SLOTS / BITS_PER_GRADIENT).
 */
export const DEFAULT_SLOTS_PER_CT = 8192;

/**
 * Demo fallback plaintext modulus.
 *
 * AGENTS.MD: "Read t from the preset at startup — do not hardcode it."
 * This constant is used only as a fallback; the actual value should be read
 * from BFV parameters or other verified upstream configuration when available.
 */
export const PLAINTEXT_MODULUS = 100n;

/**
 * Number of bits needed to represent one gradient in bitplane encoding.
 * Each gradient maps to an unsigned integer in [0, 2 * SCALE_FACTOR * MAX_GRAD_ABS],
 * requiring ceil(log2(2 * S * G + 1)) bits.
 */
export const BITS_PER_GRADIENT = Math.ceil(
  Math.log2(2 * SCALE_FACTOR * MAX_GRAD_ABS + 1),
); // 14 at S=4096, G=1.0

/**
 * Number of gradients that fit in one ciphertext with bitplane encoding.
 */
export const GRADIENTS_PER_CT = Math.floor(
  DEFAULT_SLOTS_PER_CT / BITS_PER_GRADIENT,
);

/**
 * Validate the bitplane overflow safety invariant.
 *
 * With bitplane encoding, each coefficient holds a tally count (0..numClients),
 * so the constraint is simply: numClients < t / 2.
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
  if (BigInt(numClients) >= halfT) {
    throw new Error(
      `Bitplane overflow invariant violated: numClients=${numClients} >= t/2=${halfT}. ` +
        `With bitplane tally encoding, max clients = t/2 - 1 = ${halfT - 1n}.`,
    );
  }
}
