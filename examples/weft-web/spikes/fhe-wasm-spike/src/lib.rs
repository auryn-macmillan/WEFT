use e3_fhe_params::{build_bfv_params_from_set_arc, BfvParamSet, BfvPreset};
use fhe::bfv::{Ciphertext, Encoding, Plaintext, PublicKey, SecretKey};
use fhe_traits::{
    DeserializeParametrized, FheDecoder, FheDecrypter, FheEncoder, FheEncrypter, Serialize,
};
use rand::thread_rng;
use wasm_bindgen::prelude::*;

const INPUT_A: [u64; 8] = [1, 2, 3, 4, 5, 6, 7, 8];
const INPUT_B: [u64; 8] = [1, 2, 3, 4, 5, 6, 7, 8];

#[wasm_bindgen]
pub fn run_spike() -> String {
    match run_spike_inner() {
        Ok(result) => result,
        Err(error) => format!("spike-error: {error}"),
    }
}

fn run_spike_inner() -> Result<String, String> {
    // AGENTS.MD §BFV Parameter Specification
    let param_set: BfvParamSet = BfvPreset::SecureThreshold8192.into();
    let params = build_bfv_params_from_set_arc(param_set);
    let mut rng = thread_rng();

    let sk = SecretKey::random(&params, &mut rng);
    let pk = PublicKey::new(&sk, &mut rng);

    let start_encrypt = now_ms();
    let pt_a = Plaintext::try_encode(&INPUT_A, Encoding::poly(), &params)
        .map_err(|error| format!("encode a failed: {error}"))?;
    let pt_b = Plaintext::try_encode(&INPUT_B, Encoding::poly(), &params)
        .map_err(|error| format!("encode b failed: {error}"))?;
    let ct_a = pk
        .try_encrypt(&pt_a, &mut rng)
        .map_err(|error| format!("encrypt a failed: {error}"))?;
    let ct_b = pk
        .try_encrypt(&pt_b, &mut rng)
        .map_err(|error| format!("encrypt b failed: {error}"))?;
    let encrypt_ms = now_ms() - start_encrypt;

    let ciphertext_roundtrip = Ciphertext::from_bytes(&ct_a.to_bytes(), &params)
        .map_err(|error| format!("ciphertext roundtrip failed: {error}"))?;

    let start_add = now_ms();
    let ct_sum = &ciphertext_roundtrip + &ct_b;
    let add_ms = now_ms() - start_add;

    let start_decrypt = now_ms();
    let decrypted = sk
        .try_decrypt(&ct_sum)
        .map_err(|error| format!("decrypt failed: {error}"))?;
    let decoded = Vec::<u64>::try_decode(&decrypted, Encoding::poly())
        .map_err(|error| format!("decode failed: {error}"))?;
    let decrypt_ms = now_ms() - start_decrypt;

    let expected: Vec<u64> = INPUT_A
        .iter()
        .zip(INPUT_B.iter())
        .map(|(lhs, rhs)| lhs + rhs)
        .collect();

    if decoded[..expected.len()] != expected {
        return Err(format!(
            "unexpected decrypted values: got {:?}, expected {:?}",
            &decoded[..expected.len()],
            expected
        ));
    }

    Ok(format!(
        "decrypt-ok: {:?} | timings(ms): encrypt={encrypt_ms:.2}, add={add_ms:.2}, decrypt={decrypt_ms:.2}",
        &decoded[..expected.len()]
    ))
}

#[cfg(target_arch = "wasm32")]
fn now_ms() -> f64 {
    js_sys::Date::now()
}

#[cfg(not(target_arch = "wasm32"))]
fn now_ms() -> f64 {
    use std::sync::OnceLock;
    use std::time::Instant;

    static START: OnceLock<Instant> = OnceLock::new();
    START.get_or_init(Instant::now).elapsed().as_secs_f64() * 1000.0
}
