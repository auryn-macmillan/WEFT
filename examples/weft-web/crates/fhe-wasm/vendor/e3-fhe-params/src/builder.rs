use crate::constants::secure_8192;
use crate::presets::BfvParamSet;
use fhe::bfv::{BfvParameters, BfvParametersBuilder};
use std::sync::Arc;

pub fn build_bfv_params_from_set(param_set: BfvParamSet) -> BfvParameters {
    build_bfv_params(
        param_set.degree,
        param_set.plaintext_modulus,
        param_set.moduli,
        param_set.error1_variance,
    )
}

pub fn build_bfv_params_from_set_arc(param_set: BfvParamSet) -> Arc<BfvParameters> {
    build_bfv_params_arc(
        param_set.degree,
        param_set.plaintext_modulus,
        param_set.moduli,
        param_set.error1_variance,
    )
}

pub fn build_bfv_params(
    degree: usize,
    plaintext_modulus: u64,
    moduli: &[u64],
    error1_variance: Option<&str>,
) -> BfvParameters {
    let mut builder = BfvParametersBuilder::new();
    builder
        .set_degree(degree)
        .set_plaintext_modulus(plaintext_modulus)
        .set_moduli(moduli);

    if let Some(error1) = error1_variance {
        builder
            .set_error1_variance_str(error1)
            .unwrap_or_else(|error| panic!("failed to set error1_variance: {error}"));
    }

    builder.build().unwrap()
}

pub fn build_bfv_params_arc(
    degree: usize,
    plaintext_modulus: u64,
    moduli: &[u64],
    error1_variance: Option<&str>,
) -> Arc<BfvParameters> {
    let mut builder = BfvParametersBuilder::new();
    builder
        .set_degree(degree)
        .set_plaintext_modulus(plaintext_modulus)
        .set_moduli(moduli);

    if let Some(error1) = error1_variance {
        builder
            .set_error1_variance_str(error1)
            .unwrap_or_else(|error| panic!("failed to set error1_variance: {error}"));
    }

    builder.build_arc().unwrap()
}

pub fn secure_threshold8192_param_set() -> BfvParamSet {
    BfvParamSet {
        degree: secure_8192::DEGREE,
        plaintext_modulus: secure_8192::threshold::PLAINTEXT_MODULUS,
        moduli: secure_8192::threshold::MODULI,
        error1_variance: Some(secure_8192::threshold::ERROR1_VARIANCE),
    }
}
