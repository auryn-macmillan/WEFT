// SPDX-License-Identifier: LGPL-3.0-only

pub mod constants;

use std::collections::BTreeMap;

use e3_compute_provider::FHEInputs;
use e3_fhe_params::decode_bfv_params_arc;
use fhe::bfv::Ciphertext;
use fhe_traits::{DeserializeParametrized, Serialize};

fn try_fhe_processor(fhe_inputs: &FHEInputs) -> Result<Vec<u8>, String> {
    let params = decode_bfv_params_arc(&fhe_inputs.params)
        .map_err(|err| format!("failed to decode BFV params: {err}"))?;

    let mut chunks: BTreeMap<u64, Vec<&(Vec<u8>, u64)>> = BTreeMap::new();
    for entry in &fhe_inputs.ciphertexts {
        chunks.entry(entry.1).or_default().push(entry);
    }

    let mut output = Vec::new();
    output.extend_from_slice(&(chunks.len() as u32).to_le_bytes());

    for (chunk_index, chunk_ciphertexts) in &chunks {
        let mut iter = chunk_ciphertexts.iter();
        let (first_bytes, _) = *iter
            .next()
            .ok_or_else(|| format!("missing ciphertexts for chunk index {chunk_index}"))?;
        let mut chunk_sum = Ciphertext::from_bytes(first_bytes, &params).map_err(|err| {
            format!("failed to deserialize ciphertext for chunk {chunk_index}: {err}")
        })?;

        for entry in iter {
            let (ct_bytes, _) = *entry;
            let ciphertext = Ciphertext::from_bytes(ct_bytes, &params).map_err(|err| {
                format!("failed to deserialize ciphertext for chunk {chunk_index}: {err}")
            })?;
            chunk_sum += &ciphertext;
        }

        let serialized = chunk_sum.to_bytes();
        output.extend_from_slice(&(serialized.len() as u32).to_le_bytes());
        output.extend_from_slice(&serialized);
    }

    Ok(output)
}

/// AGENTS.MD §Component 1 — Secure Process
/// Output encoding is `[u32 num_chunks][u32 len_0][bytes_0]...[u32 len_k][bytes_k]` in little-endian.
pub fn fhe_processor(fhe_inputs: &FHEInputs) -> Vec<u8> {
    try_fhe_processor(fhe_inputs).unwrap_or_else(|err| panic!("fhe_processor failed: {err}"))
}
