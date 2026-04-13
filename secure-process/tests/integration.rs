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

    use weft_secure_process::constants::{
        decode_bitplane, encode_bitplane, BITS_PER_GRADIENT, SCALE_FACTOR,
    };
    use weft_secure_process::fhe_processor;

    const DEGREE: usize = 512;
    const PLAINTEXT_MODULUS: u64 = 100;

    fn test_params() -> Arc<BfvParameters> {
        BfvParametersBuilder::new()
            .set_degree(DEGREE)
            .set_plaintext_modulus(PLAINTEXT_MODULUS)
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

    fn bitplane_encode_gradients(gradients: &[f64]) -> Vec<u64> {
        let mut coeffs = Vec::with_capacity(gradients.len() * BITS_PER_GRADIENT);
        for &g in gradients {
            coeffs.extend_from_slice(&encode_bitplane(g));
        }
        coeffs
    }

    fn bitplane_decode_gradients(coeffs: &[u64], num_clients: u64) -> Vec<f64> {
        let num_gradients = coeffs.len() / BITS_PER_GRADIENT;
        (0..num_gradients)
            .map(|g| {
                let start = g * BITS_PER_GRADIENT;
                decode_bitplane(&coeffs[start..start + BITS_PER_GRADIENT], num_clients)
            })
            .collect()
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

    #[test]
    fn sums_single_chunk_from_three_clients() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let grads_a: &[f64] = &[0.75, -0.5, 0.25];
        let grads_b: &[f64] = &[-0.3, 0.8, 0.1];
        let grads_c: &[f64] = &[0.5, -0.1, -0.6];

        let coeffs_a = bitplane_encode_gradients(grads_a);
        let coeffs_b = bitplane_encode_gradients(grads_b);
        let coeffs_c = bitplane_encode_gradients(grads_c);

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

        let num_coeffs = grads_a.len() * BITS_PER_GRADIENT;
        let recovered = bitplane_decode_gradients(&decoded[..num_coeffs], 3);

        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(&recovered, &[grads_a, grads_b, grads_c], tolerance);
    }

    #[test]
    fn sums_two_chunks_across_three_clients() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        // 40 gradients × 14 bits = 560 coefficients > 512 (DEGREE), so 2 chunks
        let num_gradients = 40;
        let grads_a: Vec<f64> = (0..num_gradients)
            .map(|i| (i as f64 / 100.0) - 0.2)
            .collect();
        let grads_b: Vec<f64> = (0..num_gradients)
            .map(|i| -(i as f64 / 100.0) + 0.1)
            .collect();
        let grads_c: Vec<f64> = (0..num_gradients).map(|i| i as f64 / 200.0).collect();

        let coeffs_a = bitplane_encode_gradients(&grads_a);
        let coeffs_b = bitplane_encode_gradients(&grads_b);
        let coeffs_c = bitplane_encode_gradients(&grads_c);

        assert!(coeffs_a.len() > DEGREE, "need >1 chunk for this test");

        // Split each client's coefficients into 2 chunks of DEGREE
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

        let num_coeffs = num_gradients * BITS_PER_GRADIENT;
        let recovered = bitplane_decode_gradients(&flat_decoded[..num_coeffs], 3);

        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(
            &recovered,
            &[grads_a.as_slice(), grads_b.as_slice(), grads_c.as_slice()],
            tolerance,
        );
    }

    #[test]
    fn preserves_negative_values_via_bitplane_encoding() {
        let params = test_params();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let grads_a: &[f64] = &[-0.75, -1.0];
        let grads_b: &[f64] = &[0.5, 0.3];
        let grads_c: &[f64] = &[-0.25, 0.7];

        let coeffs_a = bitplane_encode_gradients(grads_a);
        let coeffs_b = bitplane_encode_gradients(grads_b);
        let coeffs_c = bitplane_encode_gradients(grads_c);

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

        let num_coeffs = grads_a.len() * BITS_PER_GRADIENT;
        let recovered = bitplane_decode_gradients(&decoded[..num_coeffs], 3);

        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        assert_gradient_avg(&recovered, &[grads_a, grads_b, grads_c], tolerance);

        // Verify the average of grads[1] is (−1.0 + 0.3 + 0.7) / 3 = 0.0
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
        let coeffs = bitplane_encode_gradients(grads);

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

        let num_coeffs = grads.len() * BITS_PER_GRADIENT;
        let recovered = bitplane_decode_gradients(&decoded[..num_coeffs], 3);

        let tolerance = 1.0 / SCALE_FACTOR as f64 + 1e-10;
        for (i, &val) in recovered.iter().enumerate() {
            assert!(
                val.abs() <= tolerance,
                "zero gradient[{i}] decoded to {val}"
            );
        }
    }
}
