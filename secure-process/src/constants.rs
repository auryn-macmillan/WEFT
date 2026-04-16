// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants
//
// Standard coefficient encoding: one BFV coefficient per gradient integer.
// Overflow constraint: n_max × S × G < t / 2

/// Fixed-point scale factor: gradient_int = round(grad_float * SCALE_FACTOR)
///
/// S=4096 gives ±0.000244 precision.
pub const SCALE_FACTOR: u64 = 4096;

/// Maximum number of participating clients per FL round.
pub const MAX_CLIENTS: u32 = 10;

/// Absolute gradient clamp before quantization.
/// Gradients are clamped to [-MAX_GRAD_ABS, MAX_GRAD_ABS] before encoding.
pub const MAX_GRAD_ABS: f64 = 1.0;

/// Maximum quantized gradient magnitude as integer: MAX_GRAD_ABS * SCALE_FACTOR.
pub const MAX_GRAD_INT: u64 = (MAX_GRAD_ABS as u64) * SCALE_FACTOR;

/// Default number of polynomial coefficients per ciphertext (ring dimension).
pub const DEFAULT_SLOTS_PER_CT: usize = 8192;

/// Validate the standard overflow safety invariant.
///
/// AGENTS.MD §Overflow Safety Invariant:
///   n_max × MAX_GRAD_INT < t / 2
///
/// where MAX_GRAD_INT = S × G (already computed).
pub fn validate_overflow_invariant(plaintext_modulus: u64, num_clients: u32) {
    let half_t = plaintext_modulus / 2;
    let max_sum = (num_clients as u64) * MAX_GRAD_INT;
    assert!(
        max_sum < half_t,
        "Overflow invariant violated: num_clients({}) × MAX_GRAD_INT({}) = {} >= t/2={}. \
         Max clients for t={}: {}.",
        num_clients,
        MAX_GRAD_INT,
        max_sum,
        half_t,
        plaintext_modulus,
        (half_t - 1) / MAX_GRAD_INT,
    );
}

/// Quantize a floating-point gradient to an integer.
///
/// Clamps to [-G, G], multiplies by S, rounds to nearest integer.
pub fn quantize_gradient(grad: f64) -> i64 {
    let clamped = grad.max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS);
    (clamped * SCALE_FACTOR as f64).round() as i64
}

/// Dequantize an integer gradient sum back to a float.
///
/// Divides by (num_clients × S) to recover the averaged gradient.
pub fn dequantize_gradient(val: i64, num_clients: u64) -> f64 {
    val as f64 / (num_clients as f64 * SCALE_FACTOR as f64)
}

/// Encode a gradient integer as a BFV coefficient using two's complement mod t.
///
/// AGENTS.MD §Gradient Encoding: "Represent negatives as t - |grad_int|"
pub fn encode_coefficient(grad_int: i64, plaintext_modulus: u64) -> u64 {
    if grad_int >= 0 {
        grad_int as u64
    } else {
        plaintext_modulus - (grad_int.unsigned_abs())
    }
}

/// Decode a BFV coefficient back to a signed integer using two's complement mod t.
///
/// AGENTS.MD §Negative Number Handling: "if val > t/2, val = val - t"
pub fn decode_coefficient(coeff: u64, plaintext_modulus: u64) -> i64 {
    let half_t = plaintext_modulus / 2;
    if coeff > half_t {
        coeff as i64 - plaintext_modulus as i64
    } else {
        coeff as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overflow_invariant_holds_for_demo_params() {
        validate_overflow_invariant(131072, MAX_CLIENTS);
    }

    #[test]
    #[should_panic(expected = "Overflow invariant violated")]
    fn overflow_invariant_rejects_when_too_many_clients() {
        validate_overflow_invariant(131072, 16);
    }

    #[test]
    fn overflow_invariant_passes_at_boundary() {
        validate_overflow_invariant(131072, 15);
    }

    #[test]
    fn max_grad_int_is_correct() {
        assert_eq!(MAX_GRAD_INT, 4096);
    }

    #[test]
    fn quantize_positive() {
        assert_eq!(quantize_gradient(0.5), 2048);
    }

    #[test]
    fn quantize_negative() {
        assert_eq!(quantize_gradient(-0.5), -2048);
    }

    #[test]
    fn quantize_clamps() {
        assert_eq!(quantize_gradient(5.0), 4096);
        assert_eq!(quantize_gradient(-5.0), -4096);
    }

    #[test]
    fn quantize_zero() {
        assert_eq!(quantize_gradient(0.0), 0);
    }

    #[test]
    fn encode_positive_coefficient() {
        assert_eq!(encode_coefficient(2048, 131072), 2048);
    }

    #[test]
    fn encode_negative_coefficient() {
        assert_eq!(encode_coefficient(-2048, 131072), 129024);
    }

    #[test]
    fn decode_positive_coefficient() {
        assert_eq!(decode_coefficient(2048, 131072), 2048);
    }

    #[test]
    fn decode_negative_coefficient() {
        assert_eq!(decode_coefficient(129024, 131072), -2048);
    }

    #[test]
    fn encode_decode_round_trips() {
        let t = 131072u64;
        for &grad in &[0.75, -0.5, 0.0, 1.0, -1.0, 0.001] {
            let q = quantize_gradient(grad);
            let encoded = encode_coefficient(q, t);
            let decoded = decode_coefficient(encoded, t);
            assert_eq!(decoded, q, "Round-trip failed for {grad}");
            let recovered = dequantize_gradient(decoded, 1);
            let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
            assert!(
                (recovered - grad).abs() <= tolerance,
                "Float round-trip failed for {grad}: got {recovered}"
            );
        }
    }

    #[test]
    fn three_client_sum_decodes_correctly() {
        let t = 131072u64;
        let _gradients = vec![0.75, -0.5, 0.25];

        let client_grads = [0.75f64, -0.5, 0.25];
        let sum_coeff: u64 = client_grads
            .iter()
            .map(|&g| encode_coefficient(quantize_gradient(g), t))
            .fold(0u64, |acc, c| (acc + c) % t);

        let decoded = decode_coefficient(sum_coeff, t);
        let avg = dequantize_gradient(decoded, 3);
        let expected: f64 = client_grads.iter().sum::<f64>() / 3.0;
        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        assert!(
            (avg - expected).abs() <= tolerance,
            "3-client decode failed: expected {expected}, got {avg}"
        );
    }
}
