// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §BFV Parameter Specification — native fixture generator for WASM parity tests (T7/T23)

use std::fs;
use std::path::Path;
use std::sync::Arc;

use e3_fhe_params::{build_bfv_params_from_set_arc, BfvParamSet, BfvPreset};
use fhe::bfv::{BfvParameters, Ciphertext, Encoding, Plaintext, SecretKey};
use fhe_traits::{DeserializeParametrized, FheDecoder, FheDecrypter, FheEncoder, Serialize};
use rand::RngCore;
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;
use serde::Serialize as SerdeSerialize;

const MASTER_SEED: [u8; 32] = [42u8; 32];

#[derive(SerdeSerialize)]
struct FixtureParams {
    preset: String,
    degree: usize,
    plaintext_modulus: u64,
}

#[derive(SerdeSerialize)]
struct ClientInput {
    #[serde(rename = "plaintextCoeffs")]
    plaintext_coeffs: Vec<u64>,
    client_index: usize,
}

#[derive(SerdeSerialize)]
struct FixtureExpected {
    #[serde(rename = "combinedPlaintext")]
    combined_plaintext: Vec<u64>,
    #[serde(rename = "ciphertextFingerprint")]
    ciphertext_fingerprint: String,
    num_chunks: usize,
}

#[derive(SerdeSerialize)]
struct FixtureMeta {
    id: String,
    seed: String,
    params: FixtureParams,
    inputs: Vec<ClientInput>,
    expected: FixtureExpected,
    format: String,
}

fn encode_coefficient(grad_int: i64, t: u64) -> u64 {
    if grad_int >= 0 {
        grad_int as u64
    } else {
        t - grad_int.unsigned_abs()
    }
}

fn quantize(grad: f64, scale: u64) -> i64 {
    let clamped = grad.clamp(-1.0, 1.0);
    (clamped * scale as f64).round() as i64
}

fn fnv1a(data: &[u8]) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

fn encode_chunks_blob(chunks: &[Vec<u8>]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&(chunks.len() as u32).to_le_bytes());
    for c in chunks {
        out.extend_from_slice(&(c.len() as u32).to_le_bytes());
        out.extend_from_slice(c);
    }
    out
}

struct BfvEnv {
    params: Arc<BfvParameters>,
    sk: SecretKey,
    t: u64,
    degree: usize,
}

impl BfvEnv {
    fn new(rng: &mut ChaCha20Rng) -> Self {
        let param_set: BfvParamSet = BfvPreset::SecureThreshold8192.into();
        let t = param_set.plaintext_modulus;
        let params = build_bfv_params_from_set_arc(param_set);
        let degree = params.degree();
        let sk = SecretKey::random(&params, rng);
        Self {
            params,
            sk,
            t,
            degree,
        }
    }

    /// Encrypt coeffs deterministically using SecretKey::try_encrypt_with_seed.
    // AGENTS.MD §BFV Parameter Specification — determinism: seed drawn from ChaCha20Rng,
    // no PublicKey used (PublicKey::new calls thread_rng() internally via fhe.rs).
    fn encrypt_coeffs(&self, coeffs: &[u64], rng: &mut ChaCha20Rng) -> Vec<u8> {
        let mut padded = coeffs.to_vec();
        padded.resize(self.degree, 0);
        let pt = Plaintext::try_encode(&padded, Encoding::poly(), &self.params).unwrap();
        let mut a_seed = [0u8; 32];
        rng.fill_bytes(&mut a_seed);
        let ct: Ciphertext = self.sk.try_encrypt_with_seed(&pt, a_seed, rng).unwrap();
        ct.to_bytes()
    }

    fn sum_and_decrypt(&self, ct_bytes_list: &[Vec<u8>]) -> Vec<u64> {
        let mut sum = Ciphertext::from_bytes(&ct_bytes_list[0], &self.params).unwrap();
        for bytes in &ct_bytes_list[1..] {
            let ct = Ciphertext::from_bytes(bytes, &self.params).unwrap();
            sum = &sum + &ct;
        }
        let pt = self.sk.try_decrypt(&sum).unwrap();
        Vec::<u64>::try_decode(&pt, Encoding::poly()).unwrap()
    }
}

struct CaseSpec {
    id: &'static str,
    num_clients: usize,
    gradients: Vec<Vec<f64>>,
    scale: u64,
}

fn make_gradients(rng: &mut ChaCha20Rng, num_clients: usize, num_grads: usize) -> Vec<Vec<f64>> {
    use rand::Rng;
    (0..num_clients)
        .map(|_| {
            (0..num_grads)
                .map(|_| rng.gen_range(-1.0f64..=1.0))
                .collect()
        })
        .collect()
}

fn build_case_spec(
    id: &'static str,
    num_clients: usize,
    gradients: Vec<Vec<f64>>,
    scale: u64,
) -> CaseSpec {
    CaseSpec {
        id,
        num_clients,
        gradients,
        scale,
    }
}

fn generate_fixture(env: &BfvEnv, spec: &CaseSpec, rng: &mut ChaCha20Rng, out_dir: &Path) {
    let t = env.t;
    let degree = env.degree;
    let scale = spec.scale;

    let num_grads = spec.gradients[0].len();
    let num_chunks = num_grads.div_ceil(degree);

    let mut per_client_coeffs: Vec<Vec<u64>> = Vec::new();
    for grads in &spec.gradients {
        let coeffs: Vec<u64> = grads
            .iter()
            .map(|&g| encode_coefficient(quantize(g, scale), t))
            .collect();
        per_client_coeffs.push(coeffs);
    }

    let mut combined: Vec<u64> = vec![0u64; num_grads];
    for client_coeffs in &per_client_coeffs {
        for (i, &c) in client_coeffs.iter().enumerate() {
            combined[i] = (combined[i] + c) % t;
        }
    }

    let mut sum_chunk_bytes: Vec<Vec<u8>> = Vec::new();
    for chunk_idx in 0..num_chunks {
        let start = chunk_idx * degree;
        let end = (start + degree).min(num_grads);

        let mut per_client_cts: Vec<Vec<u8>> = Vec::new();
        for client_coeffs in &per_client_coeffs {
            let slice = &client_coeffs[start..end];
            let ct_bytes = env.encrypt_coeffs(slice, rng);
            per_client_cts.push(ct_bytes);
        }

        let decrypted = env.sum_and_decrypt(&per_client_cts);

        let expected_chunk: Vec<u64> = combined[start..end].to_vec();
        for (i, &expected_coeff) in expected_chunk.iter().enumerate() {
            assert_eq!(
                decrypted[i], expected_coeff,
                "case {}: chunk {} coeff {} mismatch: decrypted={} expected={}",
                spec.id, chunk_idx, i, decrypted[i], expected_coeff
            );
        }

        let mut sum_ct_bytes = Ciphertext::from_bytes(&per_client_cts[0], &env.params).unwrap();
        for bytes in &per_client_cts[1..] {
            let ct = Ciphertext::from_bytes(bytes, &env.params).unwrap();
            sum_ct_bytes = &sum_ct_bytes + &ct;
        }
        sum_chunk_bytes.push(sum_ct_bytes.to_bytes());
    }

    let blob = encode_chunks_blob(&sum_chunk_bytes);
    let fingerprint = fnv1a(&blob);

    let inputs: Vec<ClientInput> = per_client_coeffs
        .iter()
        .enumerate()
        .map(|(i, coeffs)| ClientInput {
            plaintext_coeffs: coeffs.clone(),
            client_index: i,
        })
        .collect();

    let meta = FixtureMeta {
        id: spec.id.to_string(),
        seed: hex_seed(&MASTER_SEED),
        params: FixtureParams {
            preset: "SecureThreshold8192".to_string(),
            degree,
            plaintext_modulus: t,
        },
        inputs,
        expected: FixtureExpected {
            combined_plaintext: combined,
            ciphertext_fingerprint: fingerprint,
            num_chunks,
        },
        format: "v1".to_string(),
    };

    let json = serde_json::to_string_pretty(&meta).unwrap();
    fs::write(out_dir.join(format!("{}.json", spec.id)), json).unwrap();
    fs::write(out_dir.join(format!("{}.bin", spec.id)), blob).unwrap();

    println!(
        "  [ok] {} ({} client(s), {} grad(s), {} chunk(s))",
        spec.id, spec.num_clients, num_grads, num_chunks
    );
}

fn hex_seed(seed: &[u8; 32]) -> String {
    seed.iter().map(|b| format!("{b:02x}")).collect()
}

fn main() {
    let default_out = "examples/weft-web/crates/fhe-wasm/fixtures/cases".to_string();
    let out_str = std::env::args().nth(1).unwrap_or(default_out);
    let out_dir = Path::new(&out_str);
    fs::create_dir_all(out_dir).unwrap();

    println!("fixture-gen: initialising BFV env (BfvPreset::SecureThreshold8192)...");
    let mut rng = ChaCha20Rng::from_seed(MASTER_SEED);
    let env = BfvEnv::new(&mut rng);

    let param_set: BfvParamSet = BfvPreset::SecureThreshold8192.into();
    let t = param_set.plaintext_modulus;
    let degree = env.degree;

    assert!(
        (10u64 * 4096) < t / 2,
        "AGENTS.MD overflow invariant violated for demo params: n_max*S*G must be < t/2"
    );

    let scale: u64 = 4096;

    println!("  degree={degree}, t={t}, scale={scale}");
    println!(
        "  overflow invariant: 10 * {scale} = {} < t/2={} ✓",
        10 * scale,
        t / 2
    );
    println!();
    println!("generating fixtures...");

    let cases: Vec<CaseSpec> = vec![
        build_case_spec("single-encrypt-decrypt", 1, vec![vec![0.5]], scale),
        build_case_spec(
            "sum-n2",
            2,
            vec![vec![0.75, -0.5, 0.25], vec![-0.25, 0.75, 0.0]],
            scale,
        ),
        build_case_spec(
            "sum-n3",
            3,
            vec![
                vec![0.75, -0.5, 0.25],
                vec![-0.25, 0.75, 0.0],
                vec![0.5, -0.25, -0.5],
            ],
            scale,
        ),
        build_case_spec(
            "sum-n5",
            5,
            {
                let mut g = ChaCha20Rng::from_seed([43u8; 32]);
                make_gradients(&mut g, 5, 5)
            },
            scale,
        ),
        build_case_spec(
            "sum-n10",
            10,
            {
                let mut g = ChaCha20Rng::from_seed([44u8; 32]);
                make_gradients(&mut g, 10, 5)
            },
            scale,
        ),
        build_case_spec(
            "threshold-3-of-5",
            3,
            {
                let mut g = ChaCha20Rng::from_seed([45u8; 32]);
                make_gradients(&mut g, 3, 5)
            },
            scale,
        ),
        build_case_spec(
            "threshold-3-of-5-negative",
            3,
            vec![vec![-0.75, -1.0], vec![0.5, 0.25], vec![-0.25, 0.75]],
            scale,
        ),
        build_case_spec(
            "threshold-3-of-5-zero",
            3,
            vec![
                vec![0.0, 0.0, 0.0],
                vec![0.0, 0.0, 0.0],
                vec![0.0, 0.0, 0.0],
            ],
            scale,
        ),
        build_case_spec(
            "chunk-boundary-8192",
            1,
            {
                let mut g = ChaCha20Rng::from_seed([46u8; 32]);
                make_gradients(&mut g, 1, degree)
            },
            scale,
        ),
        build_case_spec(
            "chunk-boundary-8193",
            1,
            {
                let mut g = ChaCha20Rng::from_seed([47u8; 32]);
                make_gradients(&mut g, 1, degree + 1)
            },
            scale,
        ),
        build_case_spec("case-01-single-zero", 1, vec![vec![0.0]], scale),
        build_case_spec("case-02-single-max-positive", 1, vec![vec![1.0]], scale),
        build_case_spec("case-03-single-max-negative", 1, vec![vec![-1.0]], scale),
        build_case_spec(
            "case-04-two-clients-cancel",
            2,
            vec![vec![0.5, -0.5, 0.25], vec![-0.5, 0.5, -0.25]],
            scale,
        ),
        build_case_spec(
            "case-05-large-coeffs",
            5,
            {
                let mut g = ChaCha20Rng::from_seed([48u8; 32]);
                make_gradients(&mut g, 5, 8)
            },
            scale,
        ),
        build_case_spec(
            "case-06-alternating-signs",
            3,
            vec![
                vec![0.5, -0.5, 0.5, -0.5],
                vec![-0.25, 0.25, -0.25, 0.25],
                vec![0.1, -0.1, 0.1, -0.1],
            ],
            scale,
        ),
        build_case_spec(
            "case-07-near-overflow-boundary",
            3,
            {
                let max_grad = 1.0f64;
                vec![vec![max_grad; 4], vec![-max_grad; 4], vec![0.5; 4]]
            },
            scale,
        ),
        build_case_spec(
            "case-08-single-chunk-16",
            1,
            {
                let mut g = ChaCha20Rng::from_seed([49u8; 32]);
                make_gradients(&mut g, 1, 16)
            },
            scale,
        ),
        build_case_spec(
            "case-09-multi-client-16",
            3,
            {
                let mut g = ChaCha20Rng::from_seed([50u8; 32]);
                make_gradients(&mut g, 3, 16)
            },
            scale,
        ),
        build_case_spec(
            "case-10-repeated-values",
            3,
            vec![vec![0.25; 8], vec![0.25; 8], vec![0.25; 8]],
            scale,
        ),
        build_case_spec(
            "case-11-ascending",
            2,
            {
                let n = 10usize;
                let grads_a: Vec<f64> = (0..n).map(|i| i as f64 / n as f64 * 2.0 - 1.0).collect();
                let grads_b: Vec<f64> =
                    (0..n).map(|i| -(i as f64 / n as f64 * 2.0 - 1.0)).collect();
                vec![grads_a, grads_b]
            },
            scale,
        ),
        build_case_spec(
            "case-12-five-clients-mixed",
            5,
            {
                let mut g = ChaCha20Rng::from_seed([51u8; 32]);
                make_gradients(&mut g, 5, 12)
            },
            scale,
        ),
    ];

    let total = cases.len();
    for spec in &cases {
        generate_fixture(&env, spec, &mut rng, out_dir);
    }

    println!();
    println!(
        "done: generated {total} fixture cases in {}",
        out_dir.display()
    );
    assert!(total >= 20, "must generate at least 20 cases, got {total}");
}
