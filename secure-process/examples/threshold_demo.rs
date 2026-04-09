// SPDX-License-Identifier: LGPL-3.0-only
//
// WEFT Encrypted Federated Learning Demo — Threshold BFV (t-of-n)
//
// This demo performs a full threshold-encrypted FL round:
//   1. Threshold DKG (5 parties, threshold=2, need 3 to decrypt)
//   2. Shamir secret sharing of each party's secret key
//   3. Smudging noise generation and sharing
//   4. BFV encryption of quantized gradient vectors under collective public key
//   5. Homomorphic summation of ciphertexts (simulating fhe_processor)
//   6. Threshold decryption with only 3-of-5 parties
//   7. Comparison against plaintext shadow for verification
//
// Uses fhe::trbfv (ShareManager, TRBFV) for true threshold decryption with
// Shamir secret sharing and Lagrange interpolation.
// Protocol follows fhe.rs examples/trbfv_add.rs pattern.
//
// No blockchain, no RISC Zero, no E3 infrastructure required.
// AGENTS.MD: §Component 1 (Secure Process), §BFV Parameter Specification

use std::sync::Arc;

use fhe::bfv::{BfvParametersBuilder, Ciphertext, Encoding, Plaintext, PublicKey, SecretKey};
use fhe::mbfv::{AggregateIter, CommonRandomPoly, PublicKeyShare};
use fhe::trbfv::{ShareManager, TRBFV};
use fhe_math::rq::{Poly, Representation};
use fhe_traits::{FheDecoder, FheEncoder, FheEncrypter};
use ndarray::{Array2, ArrayView};
use rand::rngs::OsRng;
use rand::thread_rng;

// ---------------------------------------------------------------------------
// AGENTS.MD §BFV Parameter Specification — Application-Level Constants
// ---------------------------------------------------------------------------

/// Fixed-point scale factor: grad_int = round(grad_float * SCALE_FACTOR)
const SCALE_FACTOR: u64 = 4;
/// Maximum number of participating clients per FL round.
const MAX_CLIENTS: u32 = 10;
/// Absolute gradient clamp before quantization.
const MAX_GRAD_ABS: f64 = 1.0;
/// Total parties in the threshold committee.
const NUM_PARTIES: usize = 5;
/// Threshold degree for Shamir polynomial. Need threshold+1 = 3 parties to decrypt.
/// Constraint: threshold <= (n-1)/2, so 2 <= (5-1)/2 = 2. OK.
const THRESHOLD: usize = 2;
/// Number of simulated FL clients submitting gradients.
const NUM_CLIENTS: usize = 3;
/// Size of the gradient vector (number of model parameters).
const GRADIENT_SIZE: usize = 512;
/// Learning rate for model update.
const LEARNING_RATE: f64 = 0.01;
/// Statistical security parameter for smudging noise.
/// Using 80 for the demo; production would use 128+.
const LAMBDA: usize = 80;

// ---------------------------------------------------------------------------
// BFV parameters — degree=8192 with 4 moduli, matching the fhe.rs trbfv_add.rs
// reference example. The smudging bound calculator requires sufficient ciphertext
// modulus space for the noise flooding to work correctly.
// We keep t=100 for WEFT's FL application needs.
// AGENTS.MD: "The insecure counterpart exists for fast local testing only."
// ---------------------------------------------------------------------------

/// Plaintext modulus — small enough for WEFT's overflow invariant with S=4.
const PLAINTEXT_MODULUS: u64 = 100;
/// Polynomial degree — 8192, matching trbfv_add.rs reference.
const DEGREE: usize = 8192;
/// Ciphertext moduli — from fhe.rs trbfv_add.rs reference example (4 moduli for degree=8192).
const MODULI: &[u64] = &[
    0x00800000022a0001,
    0x00800000021a0001,
    0x0080000002120001,
    0x0080000001f60001,
];
/// Variance for BFV error distribution — from trbfv_add.rs reference.
const VARIANCE: usize = 10;
/// Error1 variance string — from trbfv_add.rs reference. This is the variance for the
/// first error polynomial in the BFV scheme, sized for smudging noise compatibility.
const ERROR1_VARIANCE_STR: &str =
    "52309181128222339698631578526730685514457152477762943514050560000";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut rng = thread_rng();

    // -----------------------------------------------------------------------
    // 0. Overflow safety invariant
    // AGENTS.MD: "n_max * S * G < t / 2"
    // -----------------------------------------------------------------------
    let half_t = PLAINTEXT_MODULUS / 2;
    let max_sum = (MAX_CLIENTS as u64) * SCALE_FACTOR * (MAX_GRAD_ABS as u64);
    assert!(
        max_sum < half_t,
        "Overflow safety invariant violated: {max_sum} >= t/2 = {half_t}"
    );

    println!("=== WEFT Encrypted FL Round Demo (Threshold BFV) ===");
    println!(
        "  Parties:         {NUM_PARTIES} (threshold={THRESHOLD}, need {} to decrypt)",
        THRESHOLD + 1
    );
    println!("  Clients:         {NUM_CLIENTS}");
    println!("  Gradient size:   {GRADIENT_SIZE}");
    println!("  Scale factor:    {SCALE_FACTOR}");
    println!("  Plaintext mod:   {PLAINTEXT_MODULUS}");
    println!("  Degree:          {DEGREE}");
    println!("  Lambda:          {LAMBDA}");
    println!("  Overflow check:  {max_sum} < {half_t} (t/2) OK");
    println!();

    // -----------------------------------------------------------------------
    // 1. Build BFV parameters
    // -----------------------------------------------------------------------
    print!("[1/9] Building BFV parameters... ");
    let params = BfvParametersBuilder::new()
        .set_degree(DEGREE)
        .set_plaintext_modulus(PLAINTEXT_MODULUS)
        .set_moduli(MODULI)
        .set_variance(VARIANCE)
        .set_error1_variance_str(ERROR1_VARIANCE_STR)?
        .build_arc()?;
    println!(
        "done (degree={}, t={}, moduli={})",
        params.degree(),
        params.plaintext(),
        params.moduli().len()
    );

    // -----------------------------------------------------------------------
    // 2. Threshold DKG — each party generates SK share, PK share, and
    //    Shamir secret shares of their SK + smudging noise
    //
    // Pattern follows fhe.rs examples/trbfv_add.rs exactly.
    // AGENTS.MD §Component 4 (Coordinator) — "Activate E3: get committee public key"
    // -----------------------------------------------------------------------
    print!("[2/9] Threshold DKG ({NUM_PARTIES} parties, threshold={THRESHOLD})... ");

    // Number of ciphertexts summed per chunk (= number of clients).
    // This is passed to generate_smudging_error for noise bound calculation.
    let num_chunks = (GRADIENT_SIZE + DEGREE - 1) / DEGREE;

    let crp = CommonRandomPoly::new(&params, &mut rng)?;
    let trbfv = TRBFV::new(NUM_PARTIES, THRESHOLD, params.clone())?;

    struct Party {
        pk_share: PublicKeyShare,
        sk_sss: Vec<Array2<u64>>,
        esi_sss: Vec<Array2<u64>>,
        sk_sss_collected: Vec<Array2<u64>>,
        es_sss_collected: Vec<Array2<u64>>,
        sk_poly_sum: Poly,
        es_poly_sum: Poly,
    }

    let ctx = params.ctx_at_level(0)?;
    let zero_poly = Poly::zero(ctx, Representation::PowerBasis);

    let mut parties: Vec<Party> = Vec::with_capacity(NUM_PARTIES);

    for _ in 0..NUM_PARTIES {
        let mut party_rng = OsRng;
        let sk_share = SecretKey::random(&params, &mut party_rng);
        let pk_share = PublicKeyShare::new(&sk_share, crp.clone(), &mut thread_rng())?;

        let mut share_manager = ShareManager::new(NUM_PARTIES, THRESHOLD, params.clone());
        let sk_poly = share_manager.coeffs_to_poly_level0(sk_share.coeffs.clone().as_ref())?;

        let temp_trbfv = trbfv.clone();
        let sk_sss = temp_trbfv.generate_secret_shares_from_poly(sk_poly, party_rng)?;

        let esi_coeffs =
            trbfv
                .clone()
                .generate_smudging_error(NUM_CLIENTS, LAMBDA, &mut party_rng)?;
        let esi_poly = share_manager.bigints_to_poly(&esi_coeffs)?;
        let esi_sss = share_manager.generate_secret_shares_from_poly(esi_poly, party_rng)?;

        parties.push(Party {
            pk_share,
            sk_sss,
            esi_sss,
            sk_sss_collected: Vec::with_capacity(NUM_PARTIES),
            es_sss_collected: Vec::with_capacity(NUM_PARTIES),
            sk_poly_sum: zero_poly.clone(),
            es_poly_sum: zero_poly.clone(),
        });
    }
    println!("done (keys + Shamir shares generated)");

    // -----------------------------------------------------------------------
    // 3. Simulate share distribution (network swap)
    //
    // Each party i collects row i from every other party's sk_sss and esi_sss.
    // Row i across all moduli matrices forms party i's collected share.
    // Pattern follows fhe.rs examples/trbfv_add.rs share swapping.
    // -----------------------------------------------------------------------
    print!("[3/9] Distributing Shamir shares... ");
    let num_moduli = params.moduli().len();

    for i in 0..NUM_PARTIES {
        for j in 0..NUM_PARTIES {
            // Party i collects its row from party j's Shamir shares
            let mut node_share = Array2::zeros((0, DEGREE));
            let mut es_node_share = Array2::zeros((0, DEGREE));
            for m in 0..num_moduli {
                node_share
                    .push_row(ArrayView::from(&parties[j].sk_sss[m].row(i)))
                    .unwrap();
                es_node_share
                    .push_row(ArrayView::from(&parties[j].esi_sss[m].row(i)))
                    .unwrap();
            }
            parties[i].sk_sss_collected.push(node_share);
            parties[i].es_sss_collected.push(es_node_share);
        }
    }

    // Each party aggregates their collected shares into summed polynomials
    for party in &mut parties {
        party.sk_poly_sum = trbfv.aggregate_collected_shares(&party.sk_sss_collected)?;
        party.es_poly_sum = trbfv.aggregate_collected_shares(&party.es_sss_collected)?;
    }
    println!("done (shares distributed and aggregated)");

    // -----------------------------------------------------------------------
    // 4. Aggregate public key from all party PK shares
    // -----------------------------------------------------------------------
    print!("[4/9] Aggregating public key... ");
    let pk: PublicKey = parties.iter().map(|p| p.pk_share.clone()).aggregate()?;
    println!("done");

    // -----------------------------------------------------------------------
    // 5. Generate synthetic client gradients
    // -----------------------------------------------------------------------
    print!("[5/9] Generating {NUM_CLIENTS} client gradient vectors (size {GRADIENT_SIZE})... ");
    let client_gradients: Vec<Vec<f64>> = (0..NUM_CLIENTS)
        .map(|_| {
            (0..GRADIENT_SIZE)
                .map(|_| {
                    let raw = rand::random::<f64>() - 0.5;
                    raw.max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS)
                })
                .collect()
        })
        .collect();
    println!("done");

    // -----------------------------------------------------------------------
    // 6. Plaintext shadow — compute expected average directly
    // AGENTS.MD: "use the current example as a plaintext shadow"
    // -----------------------------------------------------------------------
    print!("[6/9] Computing plaintext shadow (expected average)... ");
    let t = PLAINTEXT_MODULUS;
    let t_signed = t as i64;

    let expected_avg: Vec<f64> = (0..GRADIENT_SIZE)
        .map(|i| {
            let sum: f64 = client_gradients.iter().map(|g| g[i]).sum();
            sum / (NUM_CLIENTS as f64)
        })
        .collect();

    // Quantized-plaintext shadow (integer arithmetic in Z_t)
    let shadow_sum: Vec<u64> = (0..GRADIENT_SIZE)
        .map(|i| {
            let mut acc: u64 = 0;
            for c in 0..NUM_CLIENTS {
                let clamped = client_gradients[c][i].max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS);
                let quantized = (clamped * SCALE_FACTOR as f64).round() as i64;
                // AGENTS.MD §Negative Gradients: encode as t - |x|
                let encoded = if quantized >= 0 {
                    quantized as u64
                } else {
                    (t_signed + quantized) as u64
                };
                acc = (acc + encoded) % t;
            }
            acc
        })
        .collect();
    println!(
        "done (first 5 avg: [{}])",
        expected_avg[..5]
            .iter()
            .map(|v| format!("{v:.4}"))
            .collect::<Vec<_>>()
            .join(", ")
    );

    // -----------------------------------------------------------------------
    // 7. Encrypt gradients under threshold public key
    // AGENTS.MD §Component 3 (Client SDK) — "quantize and encrypt"
    // -----------------------------------------------------------------------
    print!("[7/9] Encrypting client gradients (BFV threshold)... ");

    let mut all_ciphertexts: Vec<Vec<Ciphertext>> = Vec::new(); // [client][chunk]

    for client_grads in &client_gradients {
        let mut client_cts = Vec::with_capacity(num_chunks);
        for chunk_idx in 0..num_chunks {
            let start = chunk_idx * DEGREE;
            let end = (start + DEGREE).min(GRADIENT_SIZE);

            let mut slot_values: Vec<u64> = Vec::with_capacity(DEGREE);
            for i in start..end {
                let clamped = client_grads[i].max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS);
                let quantized = (clamped * SCALE_FACTOR as f64).round() as i64;
                // AGENTS.MD §Negative Gradients: negative as t - |x|
                let encoded = if quantized >= 0 {
                    quantized as u64
                } else {
                    (t_signed + quantized) as u64
                };
                slot_values.push(encoded);
            }
            // Zero-pad to DEGREE if needed
            while slot_values.len() < DEGREE {
                slot_values.push(0);
            }

            let pt = Plaintext::try_encode(&slot_values, Encoding::poly(), &params)?;
            let ct = pk.try_encrypt(&pt, &mut rng)?;
            client_cts.push(ct);
        }
        all_ciphertexts.push(client_cts);
    }
    println!(
        "done ({NUM_CLIENTS} clients x {num_chunks} chunks = {} ciphertexts)",
        NUM_CLIENTS * num_chunks
    );

    // -----------------------------------------------------------------------
    // 8. Homomorphic summation — simulate fhe_processor
    // AGENTS.MD §Component 1: "For each chunk index, sum all client ciphertexts"
    // AGENTS.MD: "Do not divide by n inside the encrypted domain."
    // -----------------------------------------------------------------------
    print!("[8/9] Homomorphic summation (per-chunk)... ");
    let mut chunk_sums: Vec<Arc<Ciphertext>> = Vec::with_capacity(num_chunks);

    for chunk_idx in 0..num_chunks {
        let mut sum = all_ciphertexts[0][chunk_idx].clone();
        for client_idx in 1..NUM_CLIENTS {
            sum = &sum + &all_ciphertexts[client_idx][chunk_idx];
        }
        chunk_sums.push(Arc::new(sum));
    }
    println!("done ({num_chunks} chunk sums)");

    // -----------------------------------------------------------------------
    // 9. Threshold decryption — only 3-of-5 parties decrypt each chunk sum
    //
    // AGENTS.MD §Component 4: "Collect output: listen for PlaintextOutputPublished"
    //
    // fhe::trbfv uses Shamir secret sharing + Lagrange interpolation.
    // threshold=2 means we need threshold+1 = 3 parties to reconstruct.
    // We pick parties 0, 2, 4 (arbitrary non-contiguous subset).
    // -----------------------------------------------------------------------
    print!(
        "[9/9] Threshold decryption ({}-of-{})... ",
        THRESHOLD + 1,
        NUM_PARTIES
    );

    // Pick arbitrary non-contiguous subset of parties (0-based indices)
    let chosen_parties: Vec<usize> = vec![0, 2, 4];
    assert_eq!(chosen_parties.len(), THRESHOLD + 1);

    // 1-based party IDs for Shamir reconstruction (ShareManager expects 1-based)
    let reconstructing_parties: Vec<usize> = chosen_parties.iter().map(|&i| i + 1).collect();

    let mut decrypted_sums: Vec<Vec<u64>> = Vec::with_capacity(num_chunks);

    for chunk_sum in &chunk_sums {
        let d_share_polys: Vec<Poly> = chosen_parties
            .iter()
            .map(|&i| {
                trbfv
                    .decryption_share(
                        chunk_sum.clone(),
                        parties[i].sk_poly_sum.clone(),
                        parties[i].es_poly_sum.clone(),
                    )
                    .expect("decryption share failed")
            })
            .collect();

        let pt = trbfv.decrypt(
            d_share_polys,
            reconstructing_parties.clone(),
            chunk_sum.clone(),
        )?;
        let values = Vec::<u64>::try_decode(&pt, Encoding::poly())?;
        decrypted_sums.push(values);
    }
    println!("done (parties {:?} participated)", chosen_parties);

    // -----------------------------------------------------------------------
    // Decode, dequantize, compare with plaintext shadow
    // AGENTS.MD §Component 4: "Dequantize: grad_float = grad_int / (n * S)"
    // AGENTS.MD §Negative Number Handling: "values in (t/2, t) are negative"
    // -----------------------------------------------------------------------
    println!();
    print!("Decoding and verifying... ");

    let half_t_u64 = t / 2;
    let mut recovered = vec![0.0f64; GRADIENT_SIZE];
    let mut max_shadow_error: u64 = 0;

    for chunk_idx in 0..num_chunks {
        let start = chunk_idx * DEGREE;
        let end = (start + DEGREE).min(GRADIENT_SIZE);

        for (i, slot_idx) in (start..end).enumerate() {
            let raw = decrypted_sums[chunk_idx][i];

            // Verify against plaintext shadow (integer domain)
            let shadow_val = shadow_sum[slot_idx];
            let error = if raw >= shadow_val {
                raw - shadow_val
            } else {
                shadow_val - raw
            };
            // Account for wrap-around near 0/t boundary
            let error = error.min(t - error);
            if error > max_shadow_error {
                max_shadow_error = error;
            }

            // AGENTS.MD §Negative Number Handling: two's complement unwrap
            let signed = if raw > half_t_u64 {
                raw as i64 - t_signed
            } else {
                raw as i64
            };

            // AGENTS.MD: "grad_float = grad_int / (n * scaleFactor)"
            recovered[slot_idx] = signed as f64 / (NUM_CLIENTS as f64 * SCALE_FACTOR as f64);
        }
    }

    // Compute max error vs floating-point expected average
    let mut max_float_error: f64 = 0.0;
    for i in 0..GRADIENT_SIZE {
        let err = (recovered[i] - expected_avg[i]).abs();
        if err > max_float_error {
            max_float_error = err;
        }
    }

    // AGENTS.MD: "precision bound is 1/S"
    let precision_bound = 1.0 / SCALE_FACTOR as f64;

    println!("done\n");
    println!("=== Results ===");
    println!(
        "  First 5 recovered:  [{}]",
        recovered[..5]
            .iter()
            .map(|v| format!("{v:.4}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "  First 5 expected:   [{}]",
        expected_avg[..5]
            .iter()
            .map(|v| format!("{v:.4}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!("  Shadow match error: {max_shadow_error} (should be 0)");
    println!("  Float error (max):  {max_float_error:.6} (bound: {precision_bound:.6})");
    println!(
        "  Threshold config:   {}-of-{} (parties {:?})",
        THRESHOLD + 1,
        NUM_PARTIES,
        chosen_parties,
    );

    // Verify shadow match — encrypted result must exactly match plaintext integer arithmetic
    assert_eq!(
        max_shadow_error, 0,
        "Encrypted result does not match plaintext shadow! Error: {max_shadow_error}"
    );

    // Verify precision bound
    assert!(
        max_float_error <= precision_bound,
        "Float error {max_float_error:.6} exceeds precision bound {precision_bound:.6}"
    );

    // Demonstrate model update
    let mut global_weights = vec![0.0f64; GRADIENT_SIZE];
    for i in 0..GRADIENT_SIZE {
        global_weights[i] = rand::random::<f64>() * 2.0 - 1.0;
    }
    let new_weights: Vec<f64> = global_weights
        .iter()
        .zip(recovered.iter())
        .map(|(w, g)| w - LEARNING_RATE * g)
        .collect();

    println!("\n  Model update applied (lr={LEARNING_RATE}):");
    println!(
        "    Old weights[0..5]:  [{}]",
        global_weights[..5]
            .iter()
            .map(|v| format!("{v:.4}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "    New weights[0..5]:  [{}]",
        new_weights[..5]
            .iter()
            .map(|v| format!("{v:.4}"))
            .collect::<Vec<_>>()
            .join(", ")
    );

    println!("\n=== WEFT threshold-encrypted FL round completed successfully ===");
    Ok(())
}
