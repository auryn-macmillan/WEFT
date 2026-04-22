// SPDX-License-Identifier: LGPL-3.0-only

mod bfv;
pub mod common;
pub mod threshold;

pub use bfv::*;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {}
