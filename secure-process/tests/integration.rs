// SPDX-License-Identifier: LGPL-3.0-only

#[cfg(test)]
mod tests {
    use e3_compute_provider::FHEInputs;
    use e3_fhe_params::encode_bfv_params;
    use fhe::bfv::{
        BfvParameters, BfvParametersBuilder, Ciphertext, Encoding, Plaintext, PublicKey, SecretKey,
    };
    use fhe_traits::{
        DeserializeParametrized, FheDecoder, FheDecrypter, FheEncoder, FheEncrypter, Serialize,
    };
    use rand::thread_rng;
    use std::sync::Arc;

    use weft_secure_process::constants::{decode_coefficient, encode_coefficient, MAX_GRAD_ABS};
    use weft_secure_process::fhe_processor;

    const DEGREE: usize = 512;
    // Insecure test preset (t=100). Standard encoding: n × S × G < t/2 = 50.
    // With 3 clients and G=1.0, use S=4: 3 × 4 × 1.0 = 12 < 50. ✓
    // Named INSECURE_T to distinguish from production INSECURE_T = 131072.
    const INSECURE_T: u64 = 100;
    const TEST_SCALE_FACTOR: u64 = 4;

    fn test_params() -> Arc<BfvParameters> {
        BfvParametersBuilder::new()
            .set_degree(DEGREE)
            .set_plaintext_modulus(INSECURE_T)
            .set_moduli(&[0xffffee001, 0xffffc4001])
            .build_arc()
            .unwrap()
    }

    fn encode_chunks(ciphertexts: &[Vec<u8>]) -> Vec<u8> {
        let mut encoded = Vec::new();
        encoded.extend_from_slice(&(ciphertexts.len() as u32).to_le_bytes());
        for ciphertext in ciphertexts {
            encoded.extend_from_slice(&(ciphertext.len() as u32).to_le_bytes());
            encoded.extend_from_slice(ciphertext);
        }
        encoded
    }

    fn decode_chunks(blob: &[u8]) -> Vec<Vec<u8>> {
        let mut offset = 0usize;
        let read_u32 = |bytes: &[u8], offset: &mut usize| {
            let value = u32::from_le_bytes(bytes[*offset..*offset + 4].try_into().unwrap());
            *offset += 4;
            value as usize
        };

        let num_chunks = read_u32(blob, &mut offset);
        let mut chunks = Vec::with_capacity(num_chunks);

        for _ in 0..num_chunks {
            let len = read_u32(blob, &mut offset);
            chunks.push(blob[offset..offset + len].to_vec());
            offset += len;
        }

        chunks
    }

    /// Quantize a gradient with the test scale factor (S=4 to fit within t=100).
    fn test_quantize(grad: f64) -> i64 {
        let clamped = grad.max(-MAX_GRAD_ABS).min(MAX_GRAD_ABS);
        (clamped * TEST_SCALE_FACTOR as f64).round() as i64
    }

    /// Encode a gradient vector as BFV coefficients using standard two's complement mod t.
    /// One coefficient per gradient.
    fn encode_gradient_vector(gradients: &[f64]) -> Vec<u64> {
        gradients
            .iter()
            .map(|&g| encode_coefficient(test_quantize(g), INSECURE_T))
            .collect()
    }

    fn encrypt_vector(
        params: &Arc<BfvParameters>,
        public_key: &PublicKey,
        values: &[u64],
    ) -> Vec<u8> {
        let mut rng = thread_rng();
        let mut padded = values.to_vec();
        while padded.len() < DEGREE {
            padded.push(0);
        }
        let plaintext = Plaintext::try_encode(&padded, Encoding::poly(), params).unwrap();
        let ciphertext: Ciphertext = public_key.try_encrypt(&plaintext, &mut rng).unwrap();
        ciphertext.to_bytes()
    }

    fn assert_gradient_avg(recovered: &[f64], client_grads: &[&[f64]], tolerance: f64) {
        let n = client_grads.len() as f64;
        for (i, &val) in recovered.iter().enumerate() {
            let expected: f64 = client_grads.iter().map(|g| g[i]).sum::<f64>() / n;
            assert!(
                (val - expected).abs() <= tolerance,
                "gradient[{i}]: expected {expected:.6}, got {val:.6}, diff {}",
                (val - expected).abs()
            );
        }
    }

    /// Decode aggregated coefficients back to float gradients.
    /// Standard encoding: decode two's complement, then divide by n × S.
    fn decode_gradient_vector(coeffs: &[u64], num_gradients: usize, num_clients: u64) -> Vec<f64> {
        (0..num_gradients)
            .map(|i| {
                let signed = decode_coefficient(coeffs[i], INSECURE_T);
                signed as f64 / (num_clients as f64 * TEST_SCALE_FACTOR as f64)
            })
            .collect()
    }

    #[test]
    fn sums_single_chunk_from_three_clients() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let grads_a: &[f64] = &[0.75, -0.5, 0.25];
        let grads_b: &[f64] = &[-0.25, 0.75, 0.0];
        let grads_c: &[f64] = &[0.5, -0.25, -0.5];

        let coeffs_a = encode_gradient_vector(grads_a);
        let coeffs_b = encode_gradient_vector(grads_b);
        let coeffs_c = encode_gradient_vector(grads_c);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &coeffs_a), 0),
            (encrypt_vector(&params, &public_key, &coeffs_b), 0),
            (encrypt_vector(&params, &public_key, &coeffs_c), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        assert_eq!(chunks.len(), 1);

        let ciphertext = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let plaintext: Plaintext = secret_key.try_decrypt(&ciphertext).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&plaintext, Encoding::poly()).unwrap();

        let recovered = decode_gradient_vector(&decoded, 3, 3);

        let tolerance = 1.0 / TEST_SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(&recovered, &[grads_a, grads_b, grads_c], tolerance);
    }

    #[test]
    fn sums_two_chunks_across_three_clients() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        // 600 gradients > 512 (DEGREE), so 2 chunks with standard encoding
        let num_gradients = 600;
        let grads_a: Vec<f64> = (0..num_gradients)
            .map(|i| ((i as f64 / 600.0) - 0.5).max(-1.0).min(1.0))
            .collect();
        let grads_b: Vec<f64> = (0..num_gradients)
            .map(|i| (-(i as f64 / 600.0) + 0.3).max(-1.0).min(1.0))
            .collect();
        let grads_c: Vec<f64> = (0..num_gradients)
            .map(|i| (i as f64 / 1200.0).max(-1.0).min(1.0))
            .collect();

        let coeffs_a = encode_gradient_vector(&grads_a);
        let coeffs_b = encode_gradient_vector(&grads_b);
        let coeffs_c = encode_gradient_vector(&grads_c);

        assert!(coeffs_a.len() > DEGREE, "need >1 chunk for this test");

        fn split_and_encrypt(
            coeffs: &[u64],
            params: &Arc<BfvParameters>,
            pk: &PublicKey,
        ) -> Vec<(Vec<u8>, u64)> {
            let mut entries = Vec::new();
            let mut chunk_idx = 0u64;
            let mut pos = 0;
            while pos < coeffs.len() {
                let end = (pos + DEGREE).min(coeffs.len());
                let slice = &coeffs[pos..end];
                entries.push((encrypt_vector(params, pk, slice), chunk_idx));
                chunk_idx += 1;
                pos = end;
            }
            entries
        }

        let mut all_entries = Vec::new();
        all_entries.extend(split_and_encrypt(&coeffs_a, &params, &public_key));
        all_entries.extend(split_and_encrypt(&coeffs_b, &params, &public_key));
        all_entries.extend(split_and_encrypt(&coeffs_c, &params, &public_key));

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: all_entries,
        });

        let chunks = decode_chunks(&output);
        assert_eq!(chunks.len(), 2);

        // Flatten decrypted chunks
        let mut flat_decoded: Vec<u64> = Vec::new();
        for chunk_bytes in &chunks {
            let ct = Ciphertext::from_bytes(chunk_bytes, &params).unwrap();
            let pt: Plaintext = secret_key.try_decrypt(&ct).unwrap();
            let vals: Vec<u64> = Vec::<u64>::try_decode(&pt, Encoding::poly()).unwrap();
            flat_decoded.extend_from_slice(&vals);
        }

        let recovered = decode_gradient_vector(&flat_decoded, num_gradients, 3);

        let tolerance = 1.0 / TEST_SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(
            &recovered,
            &[grads_a.as_slice(), grads_b.as_slice(), grads_c.as_slice()],
            tolerance,
        );
    }

    #[test]
    fn preserves_negative_values_via_twos_complement() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let grads_a: &[f64] = &[-0.75, -1.0];
        let grads_b: &[f64] = &[0.5, 0.25];
        let grads_c: &[f64] = &[-0.25, 0.75];

        let coeffs_a = encode_gradient_vector(grads_a);
        let coeffs_b = encode_gradient_vector(grads_b);
        let coeffs_c = encode_gradient_vector(grads_c);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &coeffs_a), 0),
            (encrypt_vector(&params, &public_key, &coeffs_b), 0),
            (encrypt_vector(&params, &public_key, &coeffs_c), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        assert_eq!(chunks.len(), 1);

        let ct = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let pt: Plaintext = secret_key.try_decrypt(&ct).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&pt, Encoding::poly()).unwrap();

        let recovered = decode_gradient_vector(&decoded, 2, 3);

        let tolerance = 1.0 / TEST_SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(&recovered, &[grads_a, grads_b, grads_c], tolerance);

        // Verify the average of grads[1] is (−1.0 + 0.25 + 0.75) / 3 = 0.0
        assert!(
            recovered[1].abs() <= tolerance,
            "expected ~0.0, got {}",
            recovered[1]
        );
    }

    #[test]
    fn output_uses_length_prefixed_chunk_encoding() {
        let chunk_a = vec![1, 2, 3];
        let chunk_b = vec![4, 5];
        let encoded = encode_chunks(&[chunk_a.clone(), chunk_b.clone()]);
        assert_eq!(decode_chunks(&encoded), vec![chunk_a, chunk_b]);
    }

    #[test]
    fn sums_zero_gradients_without_modifying_other_slots() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let grads: &[f64] = &[0.0, 0.0, 0.0];
        let coeffs = encode_gradient_vector(grads);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &coeffs), 0),
            (encrypt_vector(&params, &public_key, &coeffs), 0),
            (encrypt_vector(&params, &public_key, &coeffs), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        assert_eq!(chunks.len(), 1);

        let ct = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let pt: Plaintext = secret_key.try_decrypt(&ct).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&pt, Encoding::poly()).unwrap();

        let recovered = decode_gradient_vector(&decoded, 3, 3);

        let tolerance = 1.0 / TEST_SCALE_FACTOR as f64 + 1e-10;
        for (i, &val) in recovered.iter().enumerate() {
            assert!(
                val.abs() <= tolerance,
                "zero gradient[{i}] decoded to {val}"
            );
        }
    }
}
