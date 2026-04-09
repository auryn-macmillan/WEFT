// SPDX-License-Identifier: LGPL-3.0-only

pub mod constants;

use std::collections::BTreeMap;

use e3_compute_provider::FHEInputs;
use e3_fhe_params::decode_bfv_params_arc;
use fhe::bfv::Ciphertext;
use fhe_traits::{DeserializeParametrized, Serialize};

/// AGENTS.MD §Component 1 — Secure Process
/// Output encoding is `[u32 num_chunks][u32 len_0][bytes_0]...[u32 len_k][bytes_k]` in little-endian.
pub fn fhe_processor(fhe_inputs: &FHEInputs) -> Vec<u8> {
    let params = decode_bfv_params_arc(&fhe_inputs.params).unwrap();

    let mut chunks: BTreeMap<u64, Vec<&(Vec<u8>, u64)>> = BTreeMap::new();
    for entry in &fhe_inputs.ciphertexts {
        chunks.entry(entry.1).or_default().push(entry);
    }

    let mut output = Vec::new();
    output.extend_from_slice(&(chunks.len() as u32).to_le_bytes());

    for chunk_ciphertexts in chunks.values() {
        let mut iter = chunk_ciphertexts.iter();
        let (first_bytes, _) = *iter.next().unwrap();
        let mut chunk_sum = Ciphertext::from_bytes(first_bytes, &params).unwrap();

        for entry in iter {
            let (ct_bytes, _) = *entry;
            let ciphertext = Ciphertext::from_bytes(ct_bytes, &params).unwrap();
            chunk_sum += &ciphertext;
        }

        let serialized = chunk_sum.to_bytes();
        output.extend_from_slice(&(serialized.len() as u32).to_le_bytes());
        output.extend_from_slice(&serialized);
    }

    output
}
