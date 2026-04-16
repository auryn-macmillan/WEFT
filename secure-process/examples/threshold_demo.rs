// SPDX-License-Identifier: LGPL-3.0-only
//
// WEFT Encrypted Demo — "Three Hospitals, Real Encryption, Zero Data Leaks"
//
// A narrated walkthrough of privacy-preserving federated learning with REAL
// threshold BFV encryption and standard coefficient encoding. Unlike the TypeScript
// simulation, this demo actually encrypts, sums ciphertexts homomorphically,
// and threshold-decrypts.
//
// Usage:  cargo run --example threshold_demo --manifest-path secure-process/Cargo.toml

use std::sync::Arc;

use fhe::bfv::{BfvParametersBuilder, Ciphertext, Encoding, Plaintext, PublicKey, SecretKey};
use fhe::mbfv::{AggregateIter, CommonRandomPoly, PublicKeyShare};
use fhe::trbfv::{ShareManager, TRBFV};
use fhe_math::rq::{Poly, Representation};
use fhe_traits::{FheDecoder, FheEncoder, FheEncrypter};
use ndarray::{Array2, ArrayView};
use rand::rngs::OsRng;
use rand::thread_rng;

use weft_secure_process::constants::{
    decode_coefficient, dequantize_gradient, encode_coefficient, quantize_gradient, MAX_GRAD_ABS,
    SCALE_FACTOR,
};

const MAX_CLIENTS: u32 = 10;
const NUM_PARTIES: usize = 5;
// threshold=2 means need threshold+1 = 3 parties to decrypt
// Constraint: threshold <= (n-1)/2, so 2 <= (5-1)/2 = 2. OK.
const THRESHOLD: usize = 2;
const NUM_CLIENTS: usize = 3;
const GRADIENT_SIZE: usize = 512;
const LEARNING_RATE: f64 = 0.01;
// Statistical security param for smudging noise (80 for demo; production uses 128+)
const LAMBDA: usize = 80;

const PLAINTEXT_MODULUS: u64 = 131072;
const DEGREE: usize = 8192;
// Ciphertext moduli (3 moduli for degree=8192)
const MODULI: &[u64] = &[0x0400000001460001, 0x0400000000ea0001, 0x0400000000920001];
const VARIANCE: usize = 10;
// Error1 variance for smudging noise compatibility
const ERROR1_VARIANCE_STR: &str = "2331171231419734472395201298275918858425592709120";

// ANSI terminal colors
const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";
const DIM: &str = "\x1b[2m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const BLUE: &str = "\x1b[34m";
const MAGENTA: &str = "\x1b[35m";
const CYAN: &str = "\x1b[36m";

struct Hospital {
    name: &'static str,
    patients: u32,
    bias_sign: f64,
    color: &'static str,
}

const HOSPITALS: [Hospital; 3] = [
    Hospital {
        name: "St. Mercy General",
        patients: 12_400,
        bias_sign: 1.0,
        color: YELLOW,
    },
    Hospital {
        name: "Eastside Medical",
        patients: 8_200,
        bias_sign: -1.0,
        color: MAGENTA,
    },
    Hospital {
        name: "Pacific University",
        patients: 22_000,
        bias_sign: 1.0,
        color: CYAN,
    },
];

fn banner(text: &str) {
    let line = "═".repeat(text.len() + 4);
    println!();
    println!("{CYAN}╔{line}╗{RESET}");
    println!("{CYAN}║  {BOLD}{text}{RESET}{CYAN}  ║{RESET}");
    println!("{CYAN}╚{line}╝{RESET}");
    println!();
}

fn phase(n: usize, total: usize, title: &str) {
    let pad = 48usize.saturating_sub(title.len());
    println!(
        "{BOLD}{BLUE}  ┌─── Phase {n}/{total}: {title} {}┐{RESET}",
        "─".repeat(pad)
    );
}

fn phase_end() {
    println!("{BLUE}  └{}┘{RESET}", "─".repeat(65));
    println!();
}

fn narrate(text: &str) {
    println!("{DIM}  │ {text}{RESET}");
}

fn data_line(label: &str, value: &str) {
    println!("  │   {YELLOW}{label}{RESET} {value}");
}

fn attacker_sees(label: &str, garbled: &str) {
    println!("  │   {RED}{BOLD}🔒 {label}{RESET}{DIM} {garbled}{RESET}");
}

fn success(text: &str) {
    println!("  │ {GREEN}✓ {text}{RESET}");
}

fn fake_encrypted_hex(len: usize) -> String {
    use rand::Rng;
    let mut rng = thread_rng();
    let hex: String = (0..len)
        .map(|_| format!("{:x}", rng.gen::<u8>() % 16))
        .collect();
    format!("0x{hex}...")
}

fn format_floats(vals: &[f64], count: usize) -> String {
    vals.iter()
        .take(count)
        .map(|v| format!("{v:.3}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut rng = thread_rng();

    // Standard coefficient overflow safety invariant: n_max × S × G < t / 2
    // AGENTS.MD §Overflow Safety Invariant
    let half_t = PLAINTEXT_MODULUS / 2;
    let max_sum = (MAX_CLIENTS as u64) * SCALE_FACTOR;
    assert!(
        max_sum < half_t,
        "Overflow invariant violated: {MAX_CLIENTS} × S({SCALE_FACTOR}) = {max_sum} >= t/2 = {half_t}"
    );

    // =========================================================================
    // TITLE
    // =========================================================================

    banner("WEFT — Three Hospitals, Real Encryption, Zero Data Leaks");

    narrate("Imagine three hospitals want to improve a diabetes risk prediction");
    narrate("model. Each has thousands of patients — but sharing raw medical data");
    narrate("would violate privacy regulations and patient trust.");
    println!();
    narrate(&format!(
        "{BOLD}What if they could train together without {RESET}{DIM}ever{RESET}{DIM} seeing each"
    ));
    narrate(&format!("other's data?{RESET}"));
    println!();
    narrate("This demo answers that question with REAL cryptography:");
    narrate("  • Real BFV homomorphic encryption (not a simulation)");
    narrate("  • Real threshold key generation (5 parties, need 3 to decrypt)");
    narrate("  • Real homomorphic addition of ciphertexts");
    narrate("  • Real threshold decryption with Shamir secret sharing");
    narrate(&format!(
        "  • Standard coefficient encoding: one coefficient per gradient, S={SCALE_FACTOR}"
    ));
    println!();
    println!(
        "{DIM}  Technical: degree={DEGREE} · t={PLAINTEXT_MODULUS} · S={SCALE_FACTOR} · \
         {GRADIENT_SIZE} params · λ={LAMBDA} · {NUM_PARTIES} committee members{RESET}"
    );
    println!("{DIM}  Overflow:  n_max × S < t/2 = {half_t} ({NUM_CLIENTS} clients ✓){RESET}");
    println!();

    // =========================================================================
    // PHASE 1 — Meet the participants
    // =========================================================================

    phase(1, 8, "Meet the Participants");
    narrate("Three hospitals join this training round:");
    println!("  │");
    for h in &HOSPITALS {
        println!(
            "  │   {}{BOLD}🏥 {}{RESET}{DIM} — {} patients{RESET}",
            h.color, h.name, h.patients
        );
    }
    println!("  │");
    narrate(&format!(
        "A committee of {BOLD}{NUM_PARTIES} independent key holders{RESET}{DIM} will manage encryption."
    ));
    narrate(&format!(
        "At least {BOLD}{}{RESET}{DIM} must cooperate to decrypt — no single party can peek.",
        THRESHOLD + 1
    ));
    success("All participants registered.");
    phase_end();

    // =========================================================================
    // PHASE 2 — Threshold DKG
    // =========================================================================

    phase(2, 8, "Distributed Key Generation (DKG)");
    narrate("The committee generates a shared encryption key WITHOUT any single");
    narrate("member knowing the full secret. Each member:");
    narrate("  1. Generates their own secret key piece");
    narrate("  2. Shares it via Shamir secret sharing (split into fragments)");
    narrate("  3. Generates smudging noise (protects against partial leakage)");
    println!("  │");

    // Standard coefficient encoding: one coefficient per gradient
    let total_coefficients = GRADIENT_SIZE;
    let num_chunks = (GRADIENT_SIZE + DEGREE - 1) / DEGREE;

    let crp = CommonRandomPoly::new(&params_builder()?, &mut rng)?;
    let params = params_builder()?;
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

    for i in 0..NUM_PARTIES {
        let mut party_rng = OsRng;
        let sk_share = SecretKey::random(&params, &mut party_rng);
        let pk_share = PublicKeyShare::new(&sk_share, crp.clone(), &mut thread_rng())?;

        let mut share_manager = ShareManager::new(NUM_PARTIES, THRESHOLD, params.clone());
        let sk_poly = share_manager.coeffs_to_poly_level0(sk_share.coeffs.clone().as_ref())?;
        let sk_sss = trbfv
            .clone()
            .generate_secret_shares_from_poly(sk_poly, party_rng)?;

        let esi_coeffs =
            trbfv
                .clone()
                .generate_smudging_error(NUM_CLIENTS, LAMBDA, &mut party_rng)?;
        let esi_poly = share_manager.bigints_to_poly(&esi_coeffs)?;
        let esi_sss = share_manager.generate_secret_shares_from_poly(esi_poly, party_rng)?;

        println!(
            "  │   {DIM}Committee member {} — key share + Shamir fragments generated{RESET}",
            i + 1
        );

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
    println!("  │");
    success(&format!(
        "DKG complete. {} key holders, threshold {}-of-{}.",
        NUM_PARTIES,
        THRESHOLD + 1,
        NUM_PARTIES
    ));
    phase_end();

    // =========================================================================
    // PHASE 3 — Share distribution
    // =========================================================================

    phase(3, 8, "Share Distribution (Simulated Network)");
    narrate("Committee members exchange their Shamir fragments securely.");
    narrate("Each member collects one fragment from every other member,");
    narrate("then aggregates them into their working key.");
    println!("  │");

    let num_moduli = params.moduli().len();
    for i in 0..NUM_PARTIES {
        for j in 0..NUM_PARTIES {
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

    for party in &mut parties {
        party.sk_poly_sum = trbfv.aggregate_collected_shares(&party.sk_sss_collected)?;
        party.es_poly_sum = trbfv.aggregate_collected_shares(&party.es_sss_collected)?;
    }
    success("Shamir shares distributed and aggregated across all members.");
    phase_end();

    // =========================================================================
    // PHASE 4 — Aggregate public key
    // =========================================================================

    phase(4, 8, "Aggregate Public Key");
    narrate("All committee members' public key shares combine into ONE shared");
    narrate("public key. Anyone can encrypt with it, but decryption requires");
    narrate(&format!(
        "{BOLD}cooperation of at least {} members{RESET}{DIM}.",
        THRESHOLD + 1
    ));
    println!("  │");

    let pk: PublicKey = parties.iter().map(|p| p.pk_share.clone()).aggregate()?;
    success("Shared public key assembled. Hospitals can now encrypt.");
    phase_end();

    // =========================================================================
    // PHASE 5 — Local training + encryption (standard coefficient encoding)
    // =========================================================================

    phase(5, 8, "Local Training & Standard Coefficient Encryption");
    narrate("Each hospital trains on its private patient data, then encodes");
    narrate("gradients using standard two's complement coefficient encoding:");
    narrate(&format!(
        "  1. Clamp each gradient to [-{MAX_GRAD_ABS}, {MAX_GRAD_ABS}]"
    ));
    narrate(&format!(
        "  2. Quantize: grad_int = round(grad × S={SCALE_FACTOR})"
    ));
    narrate("  3. Encode: negative values stored as t - |grad_int| (two's complement mod t)");
    narrate("  4. Encrypt the coefficient vector under the threshold public key");
    println!("  │");

    let client_gradients: Vec<Vec<f64>> = (0..NUM_CLIENTS)
        .map(|c| {
            (0..GRADIENT_SIZE)
                .map(|_| {
                    let raw = (rand::random::<f64>() - 0.5) * HOSPITALS[c].bias_sign;
                    raw.max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS)
                })
                .collect()
        })
        .collect();

    // Plaintext shadow for later verification: element-wise sum of encoded coefficients mod t
    // AGENTS.MD §Standard coefficient encoding
    let mut shadow_sum = vec![0u64; total_coefficients];
    for c in 0..NUM_CLIENTS {
        for i in 0..GRADIENT_SIZE {
            let grad_int = quantize_gradient(client_gradients[c][i]);
            let encoded = encode_coefficient(grad_int, PLAINTEXT_MODULUS);
            shadow_sum[i] = (shadow_sum[i] + encoded) % PLAINTEXT_MODULUS;
        }
    }

    let expected_avg: Vec<f64> = (0..GRADIENT_SIZE)
        .map(|i| {
            let sum: f64 = client_gradients.iter().map(|g| g[i]).sum();
            sum / (NUM_CLIENTS as f64)
        })
        .collect();

    let mut all_ciphertexts: Vec<Vec<Ciphertext>> = Vec::new();

    for (c, client_grads) in client_gradients.iter().enumerate() {
        // Standard coefficient encoding: one coefficient per gradient
        let mut all_coeffs: Vec<u64> = Vec::with_capacity(total_coefficients);
        for i in 0..GRADIENT_SIZE {
            let grad_int = quantize_gradient(client_grads[i]);
            let encoded = encode_coefficient(grad_int, PLAINTEXT_MODULUS);
            all_coeffs.push(encoded);
        }

        // Split into chunks of DEGREE and encrypt each
        let mut client_cts = Vec::with_capacity(num_chunks);
        for chunk_idx in 0..num_chunks {
            let start = chunk_idx * DEGREE;
            let end = (start + DEGREE).min(all_coeffs.len());

            let mut slot_values: Vec<u64> = all_coeffs[start..end].to_vec();
            while slot_values.len() < DEGREE {
                slot_values.push(0);
            }

            let pt = Plaintext::try_encode(&slot_values, Encoding::poly(), &params)?;
            let ct = pk.try_encrypt(&pt, &mut rng)?;
            client_cts.push(ct);
        }
        all_ciphertexts.push(client_cts);

        let h = &HOSPITALS[c];
        println!("  │   {}{BOLD}🏥 {}{RESET}", h.color, h.name);
        data_line(
            "Private gradients: ",
            &format!("[{}]", format_floats(&client_grads[..4], 4)),
        );
        let grad0_int = quantize_gradient(client_grads[0]);
        let grad0_encoded = encode_coefficient(grad0_int, PLAINTEXT_MODULUS);
        data_line(
            "Coefficient (grad₀):",
            &format!("grad_int={grad0_int} → encoded={grad0_encoded} (two's complement mod t)"),
        );
        attacker_sees("Encrypted (on wire):", &fake_encrypted_hex(48));
        println!("  │");
    }

    narrate("An eavesdropper intercepts the network traffic and sees... gibberish.");
    narrate("The ciphertexts are ~100KB each and reveal NOTHING about the");
    narrate("original gradient values. This is real BFV encryption, not a simulation.");
    success(&format!(
        "{NUM_CLIENTS} hospitals × {num_chunks} chunks = {} ciphertexts encrypted.",
        NUM_CLIENTS * num_chunks
    ));
    phase_end();

    // =========================================================================
    // PHASE 6 — Homomorphic summation
    // =========================================================================

    phase(6, 8, "Homomorphic Aggregation (Math on Ciphertext)");
    narrate("The ciphertexts are ADDED TOGETHER without decrypting them.");
    narrate("Each BFV coefficient holds one encoded gradient integer. After adding");
    narrate(&format!(
        "{NUM_CLIENTS} clients' ciphertexts, each coefficient holds the gradient sum (mod t)."
    ));
    println!("  │");
    narrate(&format!(
        "{BOLD}Encrypt(coeff_A) + Encrypt(coeff_B) = Encrypt(coeff_A + coeff_B){RESET}"
    ));
    println!("  │");

    let mut chunk_sums: Vec<Arc<Ciphertext>> = Vec::with_capacity(num_chunks);
    for chunk_idx in 0..num_chunks {
        let mut sum = all_ciphertexts[0][chunk_idx].clone();
        for client_idx in 1..NUM_CLIENTS {
            sum = &sum + &all_ciphertexts[client_idx][chunk_idx];
        }
        chunk_sums.push(Arc::new(sum));
    }

    attacker_sees("Encrypted aggregate:", &fake_encrypted_hex(64));
    println!("  │");
    narrate("Nobody can read this — not the coordinator, not any single committee");
    narrate("member, not an attacker. It contains the SUM of all hospitals'");
    narrate("encoded gradient coefficients, but extracting individual contributions");
    narrate("is computationally infeasible.");
    success(&format!("Homomorphic sum computed ({num_chunks} chunks)."));
    phase_end();

    // =========================================================================
    // PHASE 7 — Threshold decryption
    // =========================================================================

    phase(7, 8, "Threshold Decryption (The Reveal)");
    narrate(&format!(
        "Only {BOLD}{}{RESET}{DIM} of the {} committee members need to cooperate to decrypt.",
        THRESHOLD + 1,
        NUM_PARTIES
    ));
    narrate("We pick members 1, 3, and 5 (a non-contiguous subset) to prove");
    narrate("that ANY valid subset works — not just the first three.");
    println!("  │");

    let chosen_parties: Vec<usize> = vec![0, 2, 4];
    let reconstructing_parties: Vec<usize> = chosen_parties.iter().map(|&i| i + 1).collect();

    for &i in &chosen_parties {
        println!(
            "  │   {DIM}Committee member {} provides their decryption share...{RESET}",
            i + 1
        );
    }
    println!("  │");

    let mut decrypted_coeffs: Vec<Vec<u64>> = Vec::with_capacity(num_chunks);
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
        decrypted_coeffs.push(values);
    }

    narrate("After decryption, the coordinator decodes the standard coefficients:");
    narrate("  1. Each coefficient is the sum of all client gradient integers (mod t)");
    narrate("  2. Two's complement unwrap: if coeff > t/2, value = coeff - t (negative)");
    narrate(&format!(
        "  3. Divide by n × S = {} × {} = {} to get the average",
        NUM_CLIENTS,
        SCALE_FACTOR,
        NUM_CLIENTS as u64 * SCALE_FACTOR
    ));
    println!("  │");
    narrate(&format!(
        "{BOLD}The aggregate is revealed — but ONLY the aggregate:{RESET}"
    ));
    println!("  │");

    // Flatten decrypted chunks into one coefficient array
    let mut flat_coeffs: Vec<u64> = Vec::with_capacity(total_coefficients);
    for chunk in &decrypted_coeffs {
        flat_coeffs.extend_from_slice(chunk);
    }

    // Verify against shadow sum
    let mut max_shadow_error: u64 = 0;
    for i in 0..total_coefficients {
        let decrypted = flat_coeffs[i];
        let expected = shadow_sum[i];
        let error = if decrypted >= expected {
            decrypted - expected
        } else {
            expected - decrypted
        };
        if error > max_shadow_error {
            max_shadow_error = error;
        }
    }

    // Decode standard coefficients: two's complement unwrap, then dequantize
    // AGENTS.MD §Negative Number Handling
    let mut recovered = vec![0.0f64; GRADIENT_SIZE];
    for i in 0..GRADIENT_SIZE {
        let signed = decode_coefficient(flat_coeffs[i], PLAINTEXT_MODULUS);
        recovered[i] = dequantize_gradient(signed, NUM_CLIENTS as u64);
    }

    for (c, h) in HOSPITALS.iter().enumerate() {
        println!(
            "  │   {RED}✗ {}'s data:{RESET}{DIM}  [{}]  ← still secret{RESET}",
            h.name,
            format_floats(&client_gradients[c][..4], 4),
        );
    }
    println!(
        "  │   {GREEN}{BOLD}✓ Aggregate (public):    [{}]  ← only this is visible{RESET}",
        format_floats(&recovered[..4], 4),
    );
    println!("  │");

    let mut max_float_error: f64 = 0.0;
    for i in 0..GRADIENT_SIZE {
        let err = (recovered[i] - expected_avg[i]).abs();
        if err > max_float_error {
            max_float_error = err;
        }
    }
    let precision_bound = 1.0 / SCALE_FACTOR as f64;

    assert_eq!(
        max_shadow_error, 0,
        "Encrypted result doesn't match plaintext shadow! Error: {max_shadow_error}"
    );
    assert!(
        max_float_error <= precision_bound,
        "Float error {max_float_error:.6} exceeds precision bound {precision_bound:.6}"
    );

    success(&format!(
        "Decryption verified. Shadow match: exact. Float error: {max_float_error:.6} (bound: {precision_bound:.6})"
    ));
    phase_end();

    // =========================================================================
    // PHASE 8 — Model update
    // =========================================================================

    phase(8, 8, "Update Global Model");
    narrate("The coordinator applies the decrypted aggregate gradient to the");
    narrate("shared model. The model improves based on ALL hospitals' data —");
    narrate("without any hospital's data ever leaving their walls.");
    println!("  │");

    let global_weights: Vec<f64> = (0..GRADIENT_SIZE)
        .map(|_| rand::random::<f64>() * 2.0 - 1.0)
        .collect();
    let new_weights: Vec<f64> = global_weights
        .iter()
        .zip(recovered.iter())
        .map(|(w, g)| w - LEARNING_RATE * g)
        .collect();

    data_line(
        "Before: ",
        &format!("[{}]", format_floats(&global_weights[..4], 4)),
    );
    data_line(
        "After:  ",
        &format!("[{}]", format_floats(&new_weights[..4], 4)),
    );
    println!("  │");
    narrate(&format!(
        "Learning rate: {LEARNING_RATE} · Model parameters: {GRADIENT_SIZE}"
    ));
    success("Global model updated. Round complete.");
    phase_end();

    // =========================================================================
    // SUMMARY
    // =========================================================================

    banner("Round Complete — Here's What Happened");

    println!("  {GREEN}✓{RESET} Three hospitals improved a shared model together");
    println!("  {GREEN}✓{RESET} Gradients were encrypted with REAL BFV homomorphic encryption");
    println!("  {GREEN}✓{RESET} Standard coefficient encoding: S={SCALE_FACTOR} (±{precision_bound:.6} precision)");
    println!("  {GREEN}✓{RESET} Ciphertexts were summed — math on encrypted data, no decryption");
    println!(
        "  {GREEN}✓{RESET} Threshold decryption: {}-of-{} committee members cooperated",
        THRESHOLD + 1,
        NUM_PARTIES,
    );
    println!("  {GREEN}✓{RESET} Only the aggregate was decrypted — individual data stays private");
    println!(
        "  {GREEN}✓{RESET} Result verified: encrypted path matches plaintext computation exactly"
    );
    println!();
    println!("  {BOLD}{CYAN}This is WEFT:{RESET} collaborative machine learning where privacy");
    println!("  isn't a policy — it's {BOLD}mathematically enforced{RESET}.");
    println!();
    println!("{DIM}  Powered by The Interfold (Enclave) · BFV homomorphic encryption · Threshold DKG · RISC Zero zkVM{RESET}");
    println!();

    Ok(())
}

fn params_builder() -> Result<Arc<fhe::bfv::BfvParameters>, Box<dyn std::error::Error>> {
    Ok(BfvParametersBuilder::new()
        .set_degree(DEGREE)
        .set_plaintext_modulus(PLAINTEXT_MODULUS)
        .set_moduli(MODULI)
        .set_variance(VARIANCE)
        .set_error1_variance_str(ERROR1_VARIANCE_STR)?
        .build_arc()?)
}
