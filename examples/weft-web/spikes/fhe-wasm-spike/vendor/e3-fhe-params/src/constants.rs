pub mod secure_8192 {
    pub const DEGREE: usize = 8192;

    pub mod threshold {
        pub const PLAINTEXT_MODULUS: u64 = 131072;
        pub const MODULI: &[u64] = &[0x0400000001460001, 0x0400000000ea0001, 0x0400000000920001];
        pub const ERROR1_VARIANCE: &str = "2331171231419734472395201298275918858425592709120";
    }
}
