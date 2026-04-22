use crate::builder::secure_threshold8192_param_set;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum BfvPreset {
    #[default]
    SecureThreshold8192,
}

#[derive(Debug, Clone, Copy)]
pub struct BfvParamSet {
    pub degree: usize,
    pub plaintext_modulus: u64,
    pub moduli: &'static [u64],
    pub error1_variance: Option<&'static str>,
}

impl From<BfvPreset> for BfvParamSet {
    fn from(value: BfvPreset) -> Self {
        match value {
            BfvPreset::SecureThreshold8192 => secure_threshold8192_param_set(),
        }
    }
}
