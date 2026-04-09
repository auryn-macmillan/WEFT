// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants

/// Fixed-point scale factor: gradient_int = round(grad_float * SCALE_FACTOR)
///
/// Demo assumption: with t=100 (the plaintext modulus used by this repository's
/// current local test/demo setup), the overflow safety invariant
/// requires: MAX_CLIENTS * SCALE_FACTOR * MAX_GRAD_ABS < t / 2 = 50.
/// Using S=4, n_max=10, G=1.0: 10 * 4 * 1 = 40 < 50. OK.
///
/// This yields ~25% quantization granularity — sufficient for the local demo.
/// Full Interfold integration should source the active preset parameters from the
/// upstream environment instead of treating this comment as authoritative.
pub const SCALE_FACTOR: u64 = 4;

/// Maximum number of participating clients per FL round.
pub const MAX_CLIENTS: u32 = 10;

/// Absolute gradient clamp before quantization.
/// Gradients are clamped to [-MAX_GRAD_ABS, MAX_GRAD_ABS] before encoding.
pub const MAX_GRAD_ABS: f64 = 1.0;

/// Maximum quantized gradient magnitude as integer: MAX_GRAD_ABS * SCALE_FACTOR.
pub const MAX_GRAD_INT: u64 = (MAX_GRAD_ABS as u64) * SCALE_FACTOR;

/// Validate the overflow safety invariant against the actual plaintext modulus.
/// This MUST be called at startup before any encryption or aggregation.
///
/// Invariant: n_max * S * G < t / 2
///
/// AGENTS.MD: "Read t from the preset at startup — do not hardcode it."
/// In this repository, callers still pass the demo modulus explicitly during
/// tests, so this helper validates the assumption without embedding a fixed
/// production source of truth here.
pub fn validate_overflow_invariant(plaintext_modulus: u64, num_clients: u32) {
    let max_sum = (num_clients as u64) * SCALE_FACTOR * (MAX_GRAD_ABS as u64);
    let half_t = plaintext_modulus / 2;
    assert!(
        max_sum < half_t,
        "Overflow safety invariant violated: {} * {} * {} = {} >= t/2 = {}. \
         Reduce SCALE_FACTOR, MAX_CLIENTS, or MAX_GRAD_ABS.",
        num_clients,
        SCALE_FACTOR,
        MAX_GRAD_ABS as u64,
        max_sum,
        half_t,
    );
}

/// Number of polynomial coefficients per ciphertext.
/// This equals the ring dimension (degree) of the BFV preset.
/// For SecureThreshold8192: 8192 coefficients.
/// For InsecureThreshold512: 512 coefficients.
///
/// AGENTS.MD: We use coefficient encoding (not SIMD batching) because
/// t=100 does not support NTT-based batching. Each coefficient holds
/// one quantized gradient value in [0, t-1].
///
/// This value is read from the preset at runtime, not hardcoded here.
/// The constant below is the default for the secure preset.
pub const DEFAULT_SLOTS_PER_CT: usize = 8192;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overflow_invariant_holds_for_demo_params() {
        // Demo assumption used across this repository's current tests.
        validate_overflow_invariant(100, MAX_CLIENTS);
    }

    #[test]
    #[should_panic(expected = "Overflow safety invariant violated")]
    fn overflow_invariant_rejects_large_clients() {
        // Demo assumption: 100 clients * 4 * 1 = 400 >= 50
        validate_overflow_invariant(100, 100);
    }

    #[test]
    fn max_grad_int_is_correct() {
        assert_eq!(MAX_GRAD_INT, 4);
    }
}
