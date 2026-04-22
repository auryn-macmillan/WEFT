#![crate_name = "fhe"]
#![crate_type = "lib"]
#![warn(missing_docs, unused_imports)]
#![allow(clippy::unwrap_used)]
#![allow(clippy::useless_conversion)]
#![allow(clippy::unnecessary_unwrap)]
#![doc = include_str!("../README.md")]

mod errors;

pub mod bfv;
pub mod mbfv;
pub mod proto;
pub mod trbfv;
pub use errors::{Error, ParametersError, Result};

// Test the source code included in the README.
#[macro_use]
extern crate doc_comment;
doctest!("../README.md");
