// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants

/**
 * Fixed-point scale factor: gradient_int = Math.round(grad_float * SCALE_FACTOR)
 *
 * Demo assumption: with t=100 (the plaintext modulus used by this repository's
 * current local test/demo setup), the overflow safety invariant
 * requires: MAX_CLIENTS * SCALE_FACTOR * MAX_GRAD_ABS < t / 2 = 50.
 * Using S=4, n_max=10, G=1.0: 10 * 4 * 1 = 40 < 50. OK.
 *
 * This yields ~25% quantization granularity -- sufficient for the local demo.
 * Full Interfold integration should source the active preset parameters from
 * the upstream environment instead of treating these comments as authoritative.
 */
export const SCALE_FACTOR = 4;

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
 * AGENTS.MD: We use coefficient encoding (not SIMD batching) because
 * t=100 does not support NTT-based batching. Each coefficient holds
 * one quantized gradient value in [0, t-1].
 */
export const DEFAULT_SLOTS_PER_CT = 8192;

/**
 * Demo fallback plaintext modulus.
 *
 * The current repository's tests and local scripts assume t=100. Treat this as
 * demo wiring only; full Interfold integration should prefer upstream preset data.
 *
 * AGENTS.MD: "Read t from the preset at startup -- do not hardcode it."
 * This constant is used only as a fallback; the actual value should be read
 * from BFV parameters or other verified upstream configuration when available.
 */
export const PLAINTEXT_MODULUS = 100n;

/**
 * Validate the overflow safety invariant.
 *
 * Invariant: numClients * SCALE_FACTOR * MAX_GRAD_ABS < t / 2
 *
 * @param plaintextModulus - The plaintext modulus t from the BFV preset
 * @param numClients - Number of clients in this round
 * @throws Error if invariant is violated
 */
export function validateOverflowInvariant(
  plaintextModulus: bigint,
  numClients: number,
): void {
  const maxSum = BigInt(numClients) * BigInt(SCALE_FACTOR) * BigInt(Math.floor(MAX_GRAD_ABS));
  const halfT = plaintextModulus / 2n;
  if (maxSum >= halfT) {
    throw new Error(
      `Overflow safety invariant violated: ${numClients} * ${SCALE_FACTOR} * ${Math.floor(MAX_GRAD_ABS)} = ${maxSum} >= t/2 = ${halfT}. ` +
        `Reduce SCALE_FACTOR, MAX_CLIENTS, or MAX_GRAD_ABS.`,
    );
  }
}
