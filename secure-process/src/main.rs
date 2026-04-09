#[cfg(target_os = "zkvm")]
use e3_compute_provider::ComputeInput;
#[cfg(target_os = "zkvm")]
use risc0_zkvm::guest::env;

#[cfg(target_os = "zkvm")]
fn main() {
    let input: ComputeInput = env::read();
    let result = input.process(weft_secure_process::fhe_processor);
    env::commit(&result);
}

#[cfg(not(target_os = "zkvm"))]
fn main() {}
