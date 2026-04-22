// SPDX-License-Identifier: LGPL-3.0-only

use std::sync::Arc;

use e3_fhe_params::{build_bfv_params_from_set_arc, BfvParamSet, BfvPreset};
use fhe::bfv::{BfvParameters, Ciphertext, Encoding, Plaintext, PublicKey, SecretKey};
use fhe_traits::{
    DeserializeParametrized, FheDecoder, FheDecrypter, FheEncoder, FheEncrypter, Serialize,
};
use rand::thread_rng;
use wasm_bindgen::prelude::*;

const SECURE_PLAINTEXT_MODULUS: u64 = 131_072;

#[wasm_bindgen]
pub struct ParamsHandle {
    inner: Arc<BfvParameters>,
}

#[wasm_bindgen]
pub struct SecretKeyHandle {
    inner: SecretKey,
    params: Arc<BfvParameters>,
}

#[wasm_bindgen]
pub fn load_params() -> ParamsHandle {
    // AGENTS.MD §BFV Parameter Specification — production wasm uses SecureThreshold8192 only.
    let param_set: BfvParamSet = BfvPreset::SecureThreshold8192.into();
    debug_assert_eq!(param_set.plaintext_modulus, SECURE_PLAINTEXT_MODULUS);
    ParamsHandle {
        inner: build_bfv_params_from_set_arc(param_set),
    }
}

#[wasm_bindgen]
pub fn generate_secret_key(params: &ParamsHandle) -> SecretKeyHandle {
    let mut rng = thread_rng();
    SecretKeyHandle {
        inner: SecretKey::random(&params.inner, &mut rng),
        params: params.inner.clone(),
    }
}

#[wasm_bindgen]
pub fn derive_public_key(params: &ParamsHandle, sk: &SecretKeyHandle) -> Vec<u8> {
    assert_same_params(params, &sk.params, "derive_public_key");
    let mut rng = thread_rng();
    PublicKey::new(&sk.inner, &mut rng).to_bytes()
}

#[wasm_bindgen]
pub fn encrypt_vector(params: &ParamsHandle, pk: &[u8], plaintext: &[i32]) -> Vec<u8> {
    let pk = PublicKey::from_bytes(pk, &params.inner)
        .unwrap_or_else(|error| panic!("encrypt_vector public key decode failed: {error}"));
    let encoded = encode_signed_vector(plaintext, &params.inner);
    let pt = Plaintext::try_encode(&encoded, Encoding::poly(), &params.inner)
        .unwrap_or_else(|error| panic!("encrypt_vector plaintext encode failed: {error}"));
    let mut rng = thread_rng();
    pk.try_encrypt(&pt, &mut rng)
        .unwrap_or_else(|error| panic!("encrypt_vector encryption failed: {error}"))
        .to_bytes()
}

#[wasm_bindgen]
pub fn homomorphic_add(params: &ParamsHandle, a: &[u8], b: &[u8]) -> Vec<u8> {
    let lhs = Ciphertext::from_bytes(a, &params.inner)
        .unwrap_or_else(|error| panic!("homomorphic_add lhs decode failed: {error}"));
    let rhs = Ciphertext::from_bytes(b, &params.inner)
        .unwrap_or_else(|error| panic!("homomorphic_add rhs decode failed: {error}"));
    (&lhs + &rhs).to_bytes()
}

#[wasm_bindgen]
pub fn decrypt(params: &ParamsHandle, sk: &SecretKeyHandle, ct: &[u8]) -> Vec<i32> {
    assert_same_params(params, &sk.params, "decrypt");
    let ct = Ciphertext::from_bytes(ct, &params.inner)
        .unwrap_or_else(|error| panic!("decrypt ciphertext decode failed: {error}"));
    let pt = sk
        .inner
        .try_decrypt(&ct)
        .unwrap_or_else(|error| panic!("decrypt failed: {error}"));
    let values = Vec::<u64>::try_decode(&pt, Encoding::poly())
        .unwrap_or_else(|error| panic!("decrypt decode failed: {error}"));
    values
        .into_iter()
        .map(|value| decode_signed(value, params.inner.plaintext()))
        .collect()
}

fn assert_same_params(params: &ParamsHandle, other: &Arc<BfvParameters>, op: &str) {
    assert_eq!(
        params.inner.as_ref(),
        other.as_ref(),
        "{op}: mismatched BFV parameters"
    );
}

fn encode_signed_vector(plaintext: &[i32], params: &Arc<BfvParameters>) -> Vec<u64> {
    let t = params.plaintext();
    let half_t = (t / 2) as i64;
    plaintext
        .iter()
        .map(|value| {
            let signed = i64::from(*value);
            assert!(
                signed.abs() < half_t,
                "plaintext coefficient {signed} exceeds centered range for t={t}"
            );
            encode_signed(signed, t)
        })
        .collect()
}

fn encode_signed(value: i64, plaintext_modulus: u64) -> u64 {
    if value >= 0 {
        value as u64
    } else {
        plaintext_modulus - value.unsigned_abs()
    }
}

fn decode_signed(value: u64, plaintext_modulus: u64) -> i32 {
    let centered = if value > plaintext_modulus / 2 {
        value as i64 - plaintext_modulus as i64
    } else {
        value as i64
    };
    i32::try_from(centered).expect("centered plaintext coefficient exceeds i32 range")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    use rand::{RngCore, SeedableRng};
    use rand_chacha::ChaCha20Rng;
    use serde::Deserialize;

    const MASTER_SEED: [u8; 32] = [42u8; 32];

    #[derive(Debug, Deserialize)]
    struct FixtureParams {
        preset: String,
        degree: usize,
        plaintext_modulus: u64,
    }

    #[derive(Debug, Deserialize)]
    struct FixtureInput {
        #[serde(rename = "plaintextCoeffs")]
        plaintext_coeffs: Vec<u64>,
        client_index: usize,
    }

    #[derive(Debug, Deserialize)]
    struct FixtureExpected {
        #[serde(rename = "combinedPlaintext")]
        combined_plaintext: Vec<u64>,
        #[serde(rename = "ciphertextFingerprint")]
        ciphertext_fingerprint: String,
        num_chunks: usize,
    }

    #[derive(Debug, Deserialize)]
    struct FixtureCase {
        id: String,
        params: FixtureParams,
        inputs: Vec<FixtureInput>,
        expected: FixtureExpected,
    }

    struct DeterministicEnv {
        params: Arc<BfvParameters>,
        sk: SecretKey,
        degree: usize,
    }

    impl DeterministicEnv {
        fn new(rng: &mut ChaCha20Rng) -> Self {
            let params = load_params().inner;
            let degree = params.degree();
            let sk = SecretKey::random(&params, rng);
            Self { params, sk, degree }
        }

        fn encrypt_coeffs(&self, coeffs: &[u64], rng: &mut ChaCha20Rng) -> Vec<u8> {
            let mut padded = coeffs.to_vec();
            padded.resize(self.degree, 0);
            let pt = Plaintext::try_encode(&padded, Encoding::poly(), &self.params).unwrap();
            let mut seed = [0u8; 32];
            rng.fill_bytes(&mut seed);
            self.sk
                .try_encrypt_with_seed(&pt, seed, rng)
                .unwrap()
                .to_bytes()
        }
    }

    #[test]
    fn public_api_roundtrip_matches_selected_fixtures() {
        let params = load_params();
        let sk = generate_secret_key(&params);
        let pk = derive_public_key(&params, &sk);

        for fixture_id in ["single-encrypt-decrypt", "sum-n2", "sum-n3"] {
            let fixture = read_fixture(fixture_id);
            assert_eq!(fixture.params.preset, "SecureThreshold8192");
            assert_eq!(fixture.params.degree, params.inner.degree());
            assert_eq!(fixture.params.plaintext_modulus, params.inner.plaintext());

            let mut sum: Option<Vec<u8>> = None;
            for input in &fixture.inputs {
                let signed: Vec<i32> = input
                    .plaintext_coeffs
                    .iter()
                    .map(|value| decode_signed(*value, fixture.params.plaintext_modulus))
                    .collect();
                let ct = encrypt_vector(&params, &pk, &signed);
                sum = Some(match sum {
                    Some(ref acc) => homomorphic_add(&params, acc, &ct),
                    None => ct,
                });
            }

            let decrypted = decrypt(&params, &sk, sum.as_ref().expect("missing ciphertext sum"));
            let recovered: Vec<u64> = decrypted[..fixture.expected.combined_plaintext.len()]
                .iter()
                .map(|value| encode_signed(i64::from(*value), fixture.params.plaintext_modulus))
                .collect();
            assert_eq!(
                recovered, fixture.expected.combined_plaintext,
                "fixture {} roundtrip mismatch",
                fixture.id
            );
            assert!(
                decrypted[fixture.expected.combined_plaintext.len()..]
                    .iter()
                    .all(|value| *value == 0),
                "fixture {} should only populate prefix coefficients",
                fixture.id
            );
        }
    }

    #[test]
    fn deterministic_fixture_blobs_match_selected_cases() {
        let mut rng = ChaCha20Rng::from_seed(MASTER_SEED);
        let env = DeterministicEnv::new(&mut rng);

        for fixture_id in ["single-encrypt-decrypt", "sum-n2", "sum-n3"] {
            let fixture = read_fixture(fixture_id);
            let expected_blob = std::fs::read(fixture_blob_path(fixture_id)).unwrap();

            let chunk_bytes = vec![build_sum_ciphertext_bytes(&env, &fixture.inputs, &mut rng)];
            let actual_blob = encode_chunks_blob(&chunk_bytes);
            assert_eq!(
                actual_blob, expected_blob,
                "fixture {} blob mismatch",
                fixture.id
            );
            assert_eq!(fnv1a(&actual_blob), fixture.expected.ciphertext_fingerprint);
            assert_eq!(fixture.expected.num_chunks, 1);

            let decrypted = decrypt_sum_blob(&env, &actual_blob);
            assert_eq!(
                &decrypted[..fixture.expected.combined_plaintext.len()],
                fixture.expected.combined_plaintext.as_slice(),
                "fixture {} combined plaintext mismatch",
                fixture.id
            );
        }
    }

    fn build_sum_ciphertext_bytes(
        env: &DeterministicEnv,
        inputs: &[FixtureInput],
        rng: &mut ChaCha20Rng,
    ) -> Vec<u8> {
        let mut sum = Ciphertext::from_bytes(
            &env.encrypt_coeffs(&inputs[0].plaintext_coeffs, rng),
            &env.params,
        )
        .unwrap();
        for input in &inputs[1..] {
            let ct = Ciphertext::from_bytes(
                &env.encrypt_coeffs(&input.plaintext_coeffs, rng),
                &env.params,
            )
            .unwrap();
            sum = &sum + &ct;
        }
        sum.to_bytes()
    }

    fn decrypt_sum_blob(env: &DeterministicEnv, blob: &[u8]) -> Vec<u64> {
        let chunks = decode_chunks_blob(blob);
        assert_eq!(chunks.len(), 1);
        let ct = Ciphertext::from_bytes(&chunks[0], &env.params).unwrap();
        let pt = env.sk.try_decrypt(&ct).unwrap();
        Vec::<u64>::try_decode(&pt, Encoding::poly()).unwrap()
    }

    fn encode_chunks_blob(chunks: &[Vec<u8>]) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(&(chunks.len() as u32).to_le_bytes());
        for chunk in chunks {
            out.extend_from_slice(&(chunk.len() as u32).to_le_bytes());
            out.extend_from_slice(chunk);
        }
        out
    }

    fn decode_chunks_blob(blob: &[u8]) -> Vec<Vec<u8>> {
        let mut offset = 0usize;
        let num_chunks = read_u32(blob, &mut offset) as usize;
        let mut chunks = Vec::with_capacity(num_chunks);
        for _ in 0..num_chunks {
            let len = read_u32(blob, &mut offset) as usize;
            let end = offset + len;
            chunks.push(blob[offset..end].to_vec());
            offset = end;
        }
        assert_eq!(
            offset,
            blob.len(),
            "unexpected trailing bytes in fixture blob"
        );
        chunks
    }

    fn read_u32(bytes: &[u8], offset: &mut usize) -> u32 {
        let end = *offset + 4;
        let value = u32::from_le_bytes(bytes[*offset..end].try_into().unwrap());
        *offset = end;
        value
    }

    fn fnv1a(data: &[u8]) -> String {
        let mut hash: u64 = 0xcbf29ce484222325;
        for byte in data {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        format!("{hash:016x}")
    }

    fn read_fixture(id: &str) -> FixtureCase {
        let path = fixture_json_path(id);
        let contents = std::fs::read_to_string(path).unwrap();
        let fixture: FixtureCase = serde_json::from_str(&contents).unwrap();
        for (expected_index, input) in fixture.inputs.iter().enumerate() {
            assert_eq!(
                input.client_index, expected_index,
                "fixture {} input order drifted",
                fixture.id
            );
        }
        fixture
    }

    fn fixture_json_path(id: &str) -> PathBuf {
        fixture_cases_dir().join(format!("{id}.json"))
    }

    fn fixture_blob_path(id: &str) -> PathBuf {
        fixture_cases_dir().join(format!("{id}.bin"))
    }

    fn fixture_cases_dir() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures/cases")
    }
}
