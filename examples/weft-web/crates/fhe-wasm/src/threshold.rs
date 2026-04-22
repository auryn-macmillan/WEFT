// SPDX-License-Identifier: LGPL-3.0-only

use std::sync::Arc;

use fhe::bfv::{Ciphertext, Encoding, PublicKey, SecretKey};
use fhe::mbfv::{AggregateIter, CommonRandomPoly, PublicKeyShare};
use fhe::proto::trbfv::{
    deserialize_decryption_share, deserialize_secret_share, deserialize_smudging_data,
    serialize_decryption_share, serialize_secret_share, serialize_smudging_data,
};
use fhe::trbfv::{ShareManager, TRBFV};
use fhe_traits::{DeserializeParametrized, FheDecoder, Serialize};
use js_sys::{Array, Reflect, Uint8Array, JSON};
use rand::{thread_rng, CryptoRng, RngCore};
use serde::{Deserialize, Serialize as SerdeSerialize};
use wasm_bindgen::prelude::*;

use crate::common::{decode_signed, load_secure_params, TRBFV_SMUDGING_LAMBDA};

#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
struct DkgRound1Output {
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    crp: Vec<u8>,
    public_key_share: Vec<u8>,
    secret_shares: Vec<Vec<u8>>,
    smudging_shares: Vec<Vec<u8>>,
}

#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
struct SecretShareBundle {
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    sk_poly: Vec<u8>,
    es_poly: Vec<u8>,
}

#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
struct PublicKeyContributionBundle {
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    crp: Vec<u8>,
    p0_share: Vec<u8>,
}

#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
struct DkgRound2Output {
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    secret_share: Vec<u8>,
    public_key_contribution: Vec<u8>,
}

#[derive(Debug, Clone, SerdeSerialize, Deserialize)]
struct DecryptionShareBundle {
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    decryption_share: Vec<u8>,
}

#[wasm_bindgen]
pub fn dkg_round1(party_index: u32, committee_size: u32, threshold: u32) -> JsValue {
    let output = dkg_round1_inner(party_index, committee_size, threshold, &mut thread_rng())
        .unwrap_or_else(|error| panic!("dkg_round1 failed: {error}"));
    json_to_js_value(&output)
}

#[wasm_bindgen]
pub fn dkg_round2(party_index: u32, round1_inputs: &JsValue) -> JsValue {
    let round1_inputs = parse_round1_inputs_js(round1_inputs)
        .unwrap_or_else(|error| panic!("dkg_round2 input decode failed: {error}"));
    let output = dkg_round2_inner(party_index, &round1_inputs)
        .unwrap_or_else(|error| panic!("dkg_round2 failed: {error}"));
    json_to_js_value(&output)
}

#[wasm_bindgen]
pub fn aggregate_public_key_contributions(contributions: &Array) -> Vec<u8> {
    let contributions = js_array_to_bytes(contributions).unwrap_or_else(|error| {
        panic!("aggregate_public_key_contributions input decode failed: {error}")
    });
    aggregate_public_key_contributions_inner(&contributions)
        .unwrap_or_else(|error| panic!("aggregate_public_key_contributions failed: {error}"))
}

#[wasm_bindgen]
pub fn partial_decrypt(secret_share: &[u8], ciphertext: &[u8]) -> Vec<u8> {
    partial_decrypt_inner(secret_share, ciphertext)
        .unwrap_or_else(|error| panic!("partial_decrypt failed: {error}"))
}

#[wasm_bindgen]
pub fn combine_decryption_shares(shares: &Array, ciphertext: &[u8], threshold: u32) -> Vec<i32> {
    let shares = js_array_to_bytes(shares)
        .unwrap_or_else(|error| panic!("combine_decryption_shares input decode failed: {error}"));
    combine_decryption_shares_inner(&shares, ciphertext, threshold)
        .unwrap_or_else(|error| panic!("combine_decryption_shares failed: {error}"))
}

fn dkg_round1_inner<R: RngCore + CryptoRng>(
    party_index: u32,
    committee_size: u32,
    threshold: u32,
    rng: &mut R,
) -> Result<DkgRound1Output, String> {
    validate_party_inputs(party_index, committee_size, threshold)?;

    let params = load_secure_params();
    let trbfv = TRBFV::new(committee_size as usize, threshold as usize, params.clone())
        .map_err(|error| error.to_string())?;
    let crp = CommonRandomPoly::new_deterministic(&params, dkg_crp_seed(committee_size, threshold))
        .map_err(|error| error.to_string())?;

    let sk_share = SecretKey::random(&params, rng);
    let public_key_share =
        PublicKeyShare::new(&sk_share, crp.clone(), rng).map_err(|error| error.to_string())?;

    let mut share_manager =
        ShareManager::new(committee_size as usize, threshold as usize, params.clone());
    let sk_poly = share_manager
        .coeffs_to_poly_level0(sk_share.coeffs.clone().as_ref())
        .map_err(|error| error.to_string())?;
    let sk_sss = trbfv
        .generate_secret_shares_from_poly(sk_poly, &mut *rng)
        .map_err(|error| error.to_string())?;

    let esi_coeffs = trbfv
        .generate_smudging_error(1, TRBFV_SMUDGING_LAMBDA, rng)
        .map_err(|error| error.to_string())?;
    let esi_poly = share_manager
        .bigints_to_poly(&esi_coeffs)
        .map_err(|error| error.to_string())?;
    let esi_sss = share_manager
        .generate_secret_shares_from_poly(esi_poly, &mut *rng)
        .map_err(|error| error.to_string())?;

    Ok(DkgRound1Output {
        party_index,
        committee_size,
        threshold,
        crp: crp.to_bytes(),
        public_key_share: public_key_share.to_bytes(),
        secret_shares: share_matrices_by_recipient(&sk_sss),
        smudging_shares: share_matrices_by_recipient(&esi_sss),
    })
}

fn dkg_round2_inner(
    party_index: u32,
    round1_inputs: &[DkgRound1Output],
) -> Result<DkgRound2Output, String> {
    let first = round1_inputs
        .first()
        .ok_or_else(|| "round1_inputs cannot be empty".to_string())?;
    validate_party_inputs(party_index, first.committee_size, first.threshold)?;
    ensure_round1_consistency(round1_inputs)?;
    if round1_inputs.len() != first.committee_size as usize {
        return Err(format!(
            "expected {} round1 inputs, received {}",
            first.committee_size,
            round1_inputs.len()
        ));
    }

    let params = load_secure_params();
    let trbfv = TRBFV::new(
        first.committee_size as usize,
        first.threshold as usize,
        params.clone(),
    )
    .map_err(|error| error.to_string())?;

    let share_index = (party_index - 1) as usize;
    let collected_secret_shares: Result<Vec<_>, _> = round1_inputs
        .iter()
        .map(|output| {
            deserialize_secret_share(&output.secret_shares[share_index])
                .map_err(|error| error.to_string())
        })
        .collect();
    let collected_smudging_shares: Result<Vec<_>, _> = round1_inputs
        .iter()
        .map(|output| {
            deserialize_secret_share(&output.smudging_shares[share_index])
                .map_err(|error| error.to_string())
        })
        .collect();

    let sk_poly = trbfv
        .aggregate_collected_shares(&collected_secret_shares?)
        .map_err(|error| error.to_string())?;
    let es_poly = trbfv
        .aggregate_collected_shares(&collected_smudging_shares?)
        .map_err(|error| error.to_string())?;

    let own_round1 = round1_inputs
        .iter()
        .find(|output| output.party_index == party_index)
        .ok_or_else(|| format!("missing round1 output for party {party_index}"))?;

    let secret_share = serde_json::to_vec(&SecretShareBundle {
        party_index,
        committee_size: first.committee_size,
        threshold: first.threshold,
        sk_poly: serialize_smudging_data(&sk_poly),
        es_poly: serialize_smudging_data(&es_poly),
    })
    .map_err(|error| error.to_string())?;
    let public_key_contribution = serde_json::to_vec(&PublicKeyContributionBundle {
        party_index,
        committee_size: first.committee_size,
        threshold: first.threshold,
        crp: own_round1.crp.clone(),
        p0_share: own_round1.public_key_share.clone(),
    })
    .map_err(|error| error.to_string())?;

    Ok(DkgRound2Output {
        party_index,
        committee_size: first.committee_size,
        threshold: first.threshold,
        secret_share,
        public_key_contribution,
    })
}

fn aggregate_public_key_contributions_inner(contributions: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    let first = contributions
        .first()
        .ok_or_else(|| "contributions cannot be empty".to_string())?;
    let first_bundle: PublicKeyContributionBundle =
        serde_json::from_slice(first).map_err(|error| error.to_string())?;
    let params = load_secure_params();
    let first_crp = CommonRandomPoly::deserialize(&first_bundle.crp, &params)
        .map_err(|error| error.to_string())?;

    let mut pk_shares = Vec::with_capacity(contributions.len());
    for contribution in contributions {
        let bundle: PublicKeyContributionBundle =
            serde_json::from_slice(contribution).map_err(|error| error.to_string())?;
        if bundle.committee_size != first_bundle.committee_size
            || bundle.threshold != first_bundle.threshold
        {
            return Err("public key contribution metadata mismatch".to_string());
        }
        if bundle.crp != first_bundle.crp {
            return Err("public key contribution CRP mismatch".to_string());
        }

        let share = PublicKeyShare::deserialize(&bundle.p0_share, &params, first_crp.clone())
            .map_err(|error| error.to_string())?;
        pk_shares.push(share);
    }

    let pk: PublicKey = pk_shares
        .into_iter()
        .aggregate()
        .map_err(|error| error.to_string())?;
    Ok(pk.to_bytes())
}

fn partial_decrypt_inner(secret_share: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let bundle: SecretShareBundle =
        serde_json::from_slice(secret_share).map_err(|error| error.to_string())?;
    let params = load_secure_params();
    let ctx = params.ctx_at_level(0).map_err(|error| error.to_string())?;
    let trbfv = TRBFV::new(
        bundle.committee_size as usize,
        bundle.threshold as usize,
        params.clone(),
    )
    .map_err(|error| error.to_string())?;
    let ciphertext =
        Ciphertext::from_bytes(ciphertext, &params).map_err(|error| error.to_string())?;
    let sk_poly =
        deserialize_smudging_data(&bundle.sk_poly, ctx).map_err(|error| error.to_string())?;
    let es_poly =
        deserialize_smudging_data(&bundle.es_poly, ctx).map_err(|error| error.to_string())?;
    let share = trbfv
        .decryption_share(Arc::new(ciphertext), sk_poly, es_poly)
        .map_err(|error| error.to_string())?;

    serde_json::to_vec(&DecryptionShareBundle {
        party_index: bundle.party_index,
        committee_size: bundle.committee_size,
        threshold: bundle.threshold,
        decryption_share: serialize_decryption_share(&share),
    })
    .map_err(|error| error.to_string())
}

fn combine_decryption_shares_inner(
    shares: &[Vec<u8>],
    ciphertext: &[u8],
    threshold: u32,
) -> Result<Vec<i32>, String> {
    if shares.len() < (threshold as usize + 1) {
        return Err(format!(
            "insufficient shares: got {}, need at least {}",
            shares.len(),
            threshold + 1
        ));
    }

    let first: DecryptionShareBundle =
        serde_json::from_slice(&shares[0]).map_err(|error| error.to_string())?;
    if first.threshold != threshold {
        return Err(format!(
            "threshold mismatch: share bundle uses {}, combine requested {}",
            first.threshold, threshold
        ));
    }

    let params = load_secure_params();
    let ctx = params.ctx_at_level(0).map_err(|error| error.to_string())?;
    let trbfv = TRBFV::new(
        first.committee_size as usize,
        threshold as usize,
        params.clone(),
    )
    .map_err(|error| error.to_string())?;
    let ciphertext =
        Ciphertext::from_bytes(ciphertext, &params).map_err(|error| error.to_string())?;

    let mut reconstructing_parties = Vec::with_capacity(threshold as usize + 1);
    let mut decryption_shares = Vec::with_capacity(threshold as usize + 1);
    for share_bytes in shares.iter().take(threshold as usize + 1) {
        let bundle: DecryptionShareBundle =
            serde_json::from_slice(share_bytes).map_err(|error| error.to_string())?;
        if bundle.committee_size != first.committee_size || bundle.threshold != threshold {
            return Err("decryption share metadata mismatch".to_string());
        }
        reconstructing_parties.push(bundle.party_index as usize);
        decryption_shares.push(
            deserialize_decryption_share(&bundle.decryption_share, ctx)
                .map_err(|error| error.to_string())?,
        );
    }

    let plaintext = trbfv
        .decrypt(
            decryption_shares,
            reconstructing_parties,
            Arc::new(ciphertext),
        )
        .map_err(|error| error.to_string())?;
    let decoded =
        Vec::<u64>::try_decode(&plaintext, Encoding::poly()).map_err(|error| error.to_string())?;
    Ok(decoded
        .into_iter()
        .map(|value| decode_signed(value, params.plaintext()))
        .collect())
}

fn validate_party_inputs(
    party_index: u32,
    committee_size: u32,
    threshold: u32,
) -> Result<(), String> {
    if committee_size == 0 {
        return Err("committee_size must be > 0".to_string());
    }
    if party_index == 0 || party_index > committee_size {
        return Err(format!(
            "party_index must be in 1..={committee_size}, got {party_index}"
        ));
    }
    TRBFV::new(
        committee_size as usize,
        threshold as usize,
        load_secure_params(),
    )
    .map(|_| ())
    .map_err(|error| error.to_string())
}

fn ensure_round1_consistency(round1_inputs: &[DkgRound1Output]) -> Result<(), String> {
    let first = round1_inputs
        .first()
        .ok_or_else(|| "round1_inputs cannot be empty".to_string())?;

    for (expected_party, output) in (1..=round1_inputs.len()).zip(round1_inputs.iter()) {
        if output.party_index as usize != expected_party {
            return Err(format!(
                "round1 input ordering mismatch: expected party {}, got {}",
                expected_party, output.party_index
            ));
        }
        if output.committee_size != first.committee_size || output.threshold != first.threshold {
            return Err("round1 input metadata mismatch".to_string());
        }
        if output.crp != first.crp {
            return Err("round1 input CRP mismatch".to_string());
        }
        if output.secret_shares.len() != first.committee_size as usize
            || output.smudging_shares.len() != first.committee_size as usize
        {
            return Err("round1 share fanout mismatch".to_string());
        }
    }

    Ok(())
}

fn share_matrices_by_recipient(shares_by_modulus: &[ndarray::Array2<u64>]) -> Vec<Vec<u8>> {
    let committee_size = shares_by_modulus
        .first()
        .map(|matrix| matrix.nrows())
        .unwrap_or_default();
    let degree = shares_by_modulus
        .first()
        .map(|matrix| matrix.ncols())
        .unwrap_or_default();

    (0..committee_size)
        .map(|recipient_index| {
            let mut flat = Vec::with_capacity(shares_by_modulus.len() * degree);
            for shares_m in shares_by_modulus {
                flat.extend(shares_m.row(recipient_index).iter().copied());
            }
            let matrix = ndarray::Array2::from_shape_vec((shares_by_modulus.len(), degree), flat)
                .expect("share matrix shape mismatch");
            serialize_secret_share(&matrix)
        })
        .collect()
}

fn dkg_crp_seed(committee_size: u32, threshold: u32) -> [u8; 32] {
    let mut seed = [0u8; 32];
    seed[..8].copy_from_slice(b"wefttrbf");
    seed[8..12].copy_from_slice(&committee_size.to_le_bytes());
    seed[12..16].copy_from_slice(&threshold.to_le_bytes());
    seed[16..24].copy_from_slice(b"crp-seed");
    seed
}

#[cfg(test)]
fn seeded_party_rng(
    party_index: u32,
    committee_size: u32,
    threshold: u32,
) -> rand_chacha::ChaCha20Rng {
    let mut seed = [0u8; 32];
    seed[..8].copy_from_slice(b"trbfv-dk");
    seed[8..12].copy_from_slice(&party_index.to_le_bytes());
    seed[12..16].copy_from_slice(&committee_size.to_le_bytes());
    seed[16..20].copy_from_slice(&threshold.to_le_bytes());
    seed[20..29].copy_from_slice(b"party-rng");
    <rand_chacha::ChaCha20Rng as rand::SeedableRng>::from_seed(seed)
}

fn json_to_js_value<T: SerdeSerialize>(value: &T) -> JsValue {
    let json = serde_json::to_string(value).expect("json serialization failed");
    JSON::parse(&json).expect("JSON parse failed")
}

fn parse_round1_inputs_js(value: &JsValue) -> Result<Vec<DkgRound1Output>, String> {
    let json = JSON::stringify(value)
        .map_err(|_| "failed to stringify round1_inputs".to_string())?
        .as_string()
        .ok_or_else(|| "round1_inputs stringify result was not a string".to_string())?;
    serde_json::from_str(&json).map_err(|error| error.to_string())
}

fn js_array_to_bytes(values: &Array) -> Result<Vec<Vec<u8>>, String> {
    (0..values.length())
        .map(|index| js_value_to_bytes(&values.get(index)))
        .collect()
}

fn js_value_to_bytes(value: &JsValue) -> Result<Vec<u8>, String> {
    if value.is_undefined() || value.is_null() {
        return Err("expected byte array, got null/undefined".to_string());
    }

    if value.is_string() {
        return serde_json::from_str::<Vec<u8>>(
            &value.as_string().expect("checked string variant above"),
        )
        .map_err(|error| error.to_string());
    }

    if Array::is_array(value) {
        let array = Array::from(value);
        return (0..array.length())
            .map(|idx| {
                array
                    .get(idx)
                    .as_f64()
                    .ok_or_else(|| format!("byte array entry {idx} was not numeric"))
                    .and_then(|value| {
                        if (0.0..=255.0).contains(&value) {
                            Ok(value as u8)
                        } else {
                            Err(format!("byte array entry {idx} out of range: {value}"))
                        }
                    })
            })
            .collect();
    }

    if Uint8Array::instanceof(value) {
        return Ok(Uint8Array::new(value).to_vec());
    }

    if Reflect::has(value, &JsValue::from_str("length")).unwrap_or(false) {
        return Ok(Uint8Array::new(value).to_vec());
    }

    Err("unsupported JS byte array shape".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    use fhe::bfv::Plaintext;
    use fhe_traits::{FheEncoder, FheEncrypter};
    use rand::SeedableRng;
    use rand_chacha::ChaCha20Rng;
    use serde::Deserialize;

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
    }

    #[derive(Debug, Deserialize)]
    struct FixtureCase {
        id: String,
        params: FixtureParams,
        inputs: Vec<FixtureInput>,
        expected: FixtureExpected,
    }

    #[test]
    fn threshold_round_3_of_5() {
        let fixture = read_fixture("threshold-3-of-5");
        let (round1, round2, pk) = deterministic_dkg(5, 2);

        assert_eq!(fixture.params.preset, "SecureThreshold8192");
        let params = load_secure_params();
        assert_eq!(fixture.params.degree, params.degree());
        assert_eq!(fixture.params.plaintext_modulus, params.plaintext());

        let pk = PublicKey::from_bytes(&pk, &params).expect("public key decode failed");
        let mut rng = ChaCha20Rng::from_seed([99u8; 32]);
        let mut sum: Option<Ciphertext> = None;

        for (expected_index, input) in fixture.inputs.iter().enumerate() {
            assert_eq!(
                input.client_index, expected_index,
                "fixture input order drifted"
            );
            let mut padded = input.plaintext_coeffs.clone();
            padded.resize(params.degree(), 0);
            let pt = Plaintext::try_encode(&padded, Encoding::poly(), &params).unwrap();
            let ct = pk.try_encrypt(&pt, &mut rng).unwrap();
            sum = Some(match sum {
                Some(ref acc) => acc + &ct,
                None => ct,
            });
        }

        let ciphertext = sum.expect("missing ciphertext sum").to_bytes();
        let shares = vec![
            partial_decrypt_inner(&round2[0].secret_share, &ciphertext).unwrap(),
            partial_decrypt_inner(&round2[2].secret_share, &ciphertext).unwrap(),
            partial_decrypt_inner(&round2[4].secret_share, &ciphertext).unwrap(),
        ];
        let decrypted = combine_decryption_shares_inner(&shares, &ciphertext, 2).unwrap();
        let recovered: Vec<u64> = decrypted[..fixture.expected.combined_plaintext.len()]
            .iter()
            .map(|value| {
                if *value >= 0 {
                    *value as u64
                } else {
                    params.plaintext() - value.unsigned_abs() as u64
                }
            })
            .collect();

        assert_eq!(round1.len(), 5);
        assert_eq!(round2.len(), 5);
        assert_eq!(recovered, fixture.expected.combined_plaintext);
        assert!(
            decrypted[fixture.expected.combined_plaintext.len()..]
                .iter()
                .all(|value| *value == 0),
            "threshold decrypt should only populate the fixture prefix"
        );
        assert_eq!(fixture.id, "threshold-3-of-5");
    }

    #[test]
    fn below_threshold_fails() {
        let fixture = read_fixture("threshold-3-of-5");
        let (_round1, round2, pk) = deterministic_dkg(5, 2);
        let params = load_secure_params();
        let pk = PublicKey::from_bytes(&pk, &params).unwrap();
        let mut rng = ChaCha20Rng::from_seed([100u8; 32]);

        let ciphertext = fixture
            .inputs
            .iter()
            .map(|input| {
                let mut padded = input.plaintext_coeffs.clone();
                padded.resize(params.degree(), 0);
                let pt = Plaintext::try_encode(&padded, Encoding::poly(), &params).unwrap();
                pk.try_encrypt(&pt, &mut rng).unwrap()
            })
            .reduce(|acc, ct| &acc + &ct)
            .unwrap()
            .to_bytes();

        let shares = vec![
            partial_decrypt_inner(&round2[0].secret_share, &ciphertext).unwrap(),
            partial_decrypt_inner(&round2[2].secret_share, &ciphertext).unwrap(),
        ];
        let error = combine_decryption_shares_inner(&shares, &ciphertext, 2)
            .expect_err("combine should fail below threshold");
        assert!(
            error.contains("insufficient shares"),
            "unexpected error: {error}"
        );
    }

    fn deterministic_dkg(
        committee_size: u32,
        threshold: u32,
    ) -> (Vec<DkgRound1Output>, Vec<DkgRound2Output>, Vec<u8>) {
        let round1: Vec<DkgRound1Output> = (1..=committee_size)
            .map(|party_index| {
                dkg_round1_inner(
                    party_index,
                    committee_size,
                    threshold,
                    &mut seeded_party_rng(party_index, committee_size, threshold),
                )
                .unwrap()
            })
            .collect();
        let round2: Vec<DkgRound2Output> = (1..=committee_size)
            .map(|party_index| dkg_round2_inner(party_index, &round1).unwrap())
            .collect();
        let contributions = round2
            .iter()
            .map(|output| output.public_key_contribution.clone())
            .collect::<Vec<_>>();
        let pk = aggregate_public_key_contributions_inner(&contributions).unwrap();
        (round1, round2, pk)
    }

    fn read_fixture(id: &str) -> FixtureCase {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures/cases")
            .join(format!("{id}.json"));
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }
}
