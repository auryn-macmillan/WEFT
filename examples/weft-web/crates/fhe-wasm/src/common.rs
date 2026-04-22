// SPDX-License-Identifier: LGPL-3.0-only

use std::sync::Arc;

use e3_fhe_params::{build_bfv_params_from_set_arc, BfvParamSet, BfvPreset};
use fhe::bfv::BfvParameters;

pub(crate) const TRBFV_SMUDGING_LAMBDA: usize = 40;

pub(crate) fn load_secure_params() -> Arc<BfvParameters> {
    // AGENTS.MD §BFV Parameter Specification — wasm bindings use the standard production preset.
    let param_set: BfvParamSet = BfvPreset::SecureThreshold8192.into();
    build_bfv_params_from_set_arc(param_set)
}

pub(crate) fn decode_signed(value: u64, plaintext_modulus: u64) -> i32 {
    let centered = if value > plaintext_modulus / 2 {
        value as i64 - plaintext_modulus as i64
    } else {
        value as i64
    };
    i32::try_from(centered).expect("centered plaintext coefficient exceeds i32 range")
}
