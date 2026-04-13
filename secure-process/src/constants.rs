// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD: BFV Parameter Specification / Application-Level Constants
//
// Bitplane tally encoding: the overflow constraint shifts from
//   n_max × S × G < t/2   (standard)
// to:
//   n_max < t/2            (bitplane)

/// Fixed-point scale factor: gradient_int = round(grad_float * SCALE_FACTOR)
///
/// With bitplane tally encoding, SCALE_FACTOR no longer participates in the
/// overflow constraint. S=4096 gives ±0.000244 precision.
pub const SCALE_FACTOR: u64 = 4096;

/// Maximum number of participating clients per FL round.
pub const MAX_CLIENTS: u32 = 10;

/// Absolute gradient clamp before quantization.
/// Gradients are clamped to [-MAX_GRAD_ABS, MAX_GRAD_ABS] before encoding.
pub const MAX_GRAD_ABS: f64 = 1.0;

/// Maximum quantized gradient magnitude as integer: MAX_GRAD_ABS * SCALE_FACTOR.
pub const MAX_GRAD_INT: u64 = (MAX_GRAD_ABS as u64) * SCALE_FACTOR;

/// Number of bits per gradient in bitplane encoding.
/// ceil(log2(2 * S * G + 1)) = 14 at S=4096, G=1.0
pub const BITS_PER_GRADIENT: usize = {
    let max_unsigned = 2 * SCALE_FACTOR * (MAX_GRAD_ABS as u64);
    let mut bits = 0u32;
    let mut val = max_unsigned;
    while val > 0 {
        bits += 1;
        val >>= 1;
    }
    bits as usize
};

/// Number of gradients that fit in one ciphertext with bitplane encoding.
pub const fn gradients_per_ct(slots: usize) -> usize {
    slots / BITS_PER_GRADIENT
}

/// Validate the bitplane overflow safety invariant.
///
/// With bitplane encoding, each coefficient holds a tally count (0..numClients),
/// so the constraint is: numClients < t / 2.
pub fn validate_overflow_invariant(plaintext_modulus: u64, num_clients: u32) {
    let half_t = plaintext_modulus / 2;
    assert!(
        (num_clients as u64) < half_t,
        "Bitplane overflow invariant violated: num_clients={} >= t/2={}. \
         With bitplane tally encoding, max clients = t/2 - 1 = {}.",
        num_clients,
        half_t,
        half_t - 1,
    );
}

/// Default number of polynomial coefficients per ciphertext (ring dimension).
pub const DEFAULT_SLOTS_PER_CT: usize = 8192;

/// Bitplane-encode a single gradient into B coefficient values.
///
/// Returns a Vec of 0/1 values, one per bit position.
pub fn encode_bitplane(gradient: f64) -> Vec<u64> {
    let clamped = gradient.max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS);
    let scaled = (clamped * SCALE_FACTOR as f64).round() as i64;
    let unsigned = (scaled + (SCALE_FACTOR as f64 * MAX_GRAD_ABS) as i64) as u64;
    let mut bits = Vec::with_capacity(BITS_PER_GRADIENT);
    for b in 0..BITS_PER_GRADIENT {
        bits.push((unsigned >> b) & 1);
    }
    bits
}

/// Decode bitplane tallies back to a float gradient.
pub fn decode_bitplane(tallies: &[u64], num_clients: u64) -> f64 {
    let mut weighted_sum: i64 = 0;
    for (b, &tally) in tallies.iter().enumerate() {
        weighted_sum += (tally as i64) * (1i64 << b);
    }
    let offset_removed =
        weighted_sum - (num_clients as i64) * (SCALE_FACTOR as i64) * (MAX_GRAD_ABS as i64);
    offset_removed as f64 / (num_clients as f64 * SCALE_FACTOR as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overflow_invariant_holds_for_demo_params() {
        validate_overflow_invariant(100, MAX_CLIENTS);
    }

    #[test]
    #[should_panic(expected = "Bitplane overflow invariant violated")]
    fn overflow_invariant_rejects_when_clients_exceed_half_t() {
        validate_overflow_invariant(100, 50);
    }

    #[test]
    fn bits_per_gradient_is_14() {
        assert_eq!(BITS_PER_GRADIENT, 14);
    }

    #[test]
    fn max_grad_int_is_correct() {
        assert_eq!(MAX_GRAD_INT, 4096);
    }

    #[test]
    fn encode_decode_round_trips() {
        for &grad in &[0.75, -0.5, 0.0, 1.0, -1.0, 0.001] {
            let bits = encode_bitplane(grad);
            let decoded = decode_bitplane(&bits, 1);
            let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
            assert!(
                (decoded - grad).abs() <= tolerance,
                "Round-trip failed for {grad}: got {decoded}"
            );
        }
    }

    #[test]
    fn encode_zero_gives_offset() {
        let bits = encode_bitplane(0.0);
        let mut reconstructed: u64 = 0;
        for (b, &bit) in bits.iter().enumerate() {
            reconstructed += bit << b;
        }
        assert_eq!(reconstructed, SCALE_FACTOR);
    }

    #[test]
    fn encode_neg_one_gives_zero() {
        let bits = encode_bitplane(-1.0);
        assert!(bits.iter().all(|&b| b == 0));
    }

    #[test]
    fn three_client_sum_decodes_correctly() {
        let gradients = vec![0.75, -0.5, 0.25];
        let client_bits: Vec<Vec<u64>> = gradients.iter().map(|&g| encode_bitplane(g)).collect();

        let mut tallies = vec![0u64; BITS_PER_GRADIENT];
        for bits in &client_bits {
            for (b, &bit) in bits.iter().enumerate() {
                tallies[b] += bit;
            }
        }

        let decoded = decode_bitplane(&tallies, 3);
        let expected: f64 = gradients.iter().sum::<f64>() / 3.0;
        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        assert!(
            (decoded - expected).abs() <= tolerance,
            "3-client decode failed: expected {expected}, got {decoded}"
        );
    }
}
