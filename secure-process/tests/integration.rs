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

    use weft_secure_process::fhe_processor;

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

    fn modular_encode(value: i64, plaintext_modulus: i64) -> u64 {
        if value < 0 {
            (plaintext_modulus + value) as u64
        } else {
            value as u64
        }
    }

    fn encrypt_vector(
        params: &Arc<BfvParameters>,
        public_key: &PublicKey,
        values: &[u64],
    ) -> Vec<u8> {
        let mut rng = thread_rng();
        let plaintext = Plaintext::try_encode(values, Encoding::poly(), params).unwrap();
        let ciphertext: Ciphertext = public_key.try_encrypt(&plaintext, &mut rng).unwrap();
        ciphertext.to_bytes()
    }

    #[test]
    fn sums_single_chunk_from_three_clients() {
        let params = BfvParametersBuilder::new()
            .set_degree(512)
            .set_plaintext_modulus(100)
            .set_moduli(&[0xffffee001, 0xffffc4001])
            .build_arc()
            .unwrap();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &[1, 2, 3]), 0),
            (encrypt_vector(&params, &public_key, &[4, 5, 6]), 0),
            (encrypt_vector(&params, &public_key, &[7, 8, 9]), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        let ciphertext = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let plaintext: Plaintext = secret_key.try_decrypt(&ciphertext).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&plaintext, Encoding::poly()).unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(&decoded[..3], &[12, 15, 18]);
    }

    #[test]
    fn sums_two_chunks_across_three_clients() {
        let params = BfvParametersBuilder::new()
            .set_degree(512)
            .set_plaintext_modulus(100)
            .set_moduli(&[0xffffee001, 0xffffc4001])
            .build_arc()
            .unwrap();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &[1, 2]), 0),
            (encrypt_vector(&params, &public_key, &[10, 20]), 1),
            (encrypt_vector(&params, &public_key, &[3, 4]), 0),
            (encrypt_vector(&params, &public_key, &[30, 40]), 1),
            (encrypt_vector(&params, &public_key, &[5, 6]), 0),
            (encrypt_vector(&params, &public_key, &[50, 60]), 1),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        let chunk0 = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let chunk1 = Ciphertext::from_bytes(&chunks[1], &params).unwrap();
        let plaintext0: Plaintext = secret_key.try_decrypt(&chunk0).unwrap();
        let plaintext1: Plaintext = secret_key.try_decrypt(&chunk1).unwrap();
        let decoded0: Vec<u64> = Vec::<u64>::try_decode(&plaintext0, Encoding::poly()).unwrap();
        let decoded1: Vec<u64> = Vec::<u64>::try_decode(&plaintext1, Encoding::poly()).unwrap();
        assert_eq!(chunks.len(), 2);
        assert_eq!(&decoded0[..2], &[9, 12]);
        assert_eq!(&decoded1[..2], &[90, 20]);
    }

    #[test]
    fn preserves_negative_values_via_modular_encoding() {
        let params = BfvParametersBuilder::new()
            .set_degree(512)
            .set_plaintext_modulus(100)
            .set_moduli(&[0xffffee001, 0xffffc4001])
            .build_arc()
            .unwrap();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);
        let plaintext_modulus = 100;

        let entries = vec![
            (
                encrypt_vector(
                    &params,
                    &public_key,
                    &[
                        modular_encode(-1, plaintext_modulus),
                        modular_encode(-2, plaintext_modulus),
                    ],
                ),
                0,
            ),
            (encrypt_vector(&params, &public_key, &[3, 4]), 0),
            (encrypt_vector(&params, &public_key, &[5, 6]), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        let ciphertext = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let plaintext: Plaintext = secret_key.try_decrypt(&ciphertext).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&plaintext, Encoding::poly()).unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(&decoded[..2], &[7, 8]);
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
        let params = BfvParametersBuilder::new()
            .set_degree(512)
            .set_plaintext_modulus(100)
            .set_moduli(&[0xffffee001, 0xffffc4001])
            .build_arc()
            .unwrap();
        let mut rng = thread_rng();
        let secret_key = SecretKey::random(&params, &mut rng);
        let public_key = PublicKey::new(&secret_key, &mut rng);

        let entries = vec![
            (encrypt_vector(&params, &public_key, &[0, 0, 0]), 0),
            (encrypt_vector(&params, &public_key, &[0, 0, 0]), 0),
            (encrypt_vector(&params, &public_key, &[0, 0, 0]), 0),
        ];

        let output = fhe_processor(&FHEInputs {
            params: encode_bfv_params(&params),
            ciphertexts: entries,
        });

        let chunks = decode_chunks(&output);
        let ciphertext = Ciphertext::from_bytes(&chunks[0], &params).unwrap();
        let plaintext: Plaintext = secret_key.try_decrypt(&ciphertext).unwrap();
        let decoded: Vec<u64> = Vec::<u64>::try_decode(&plaintext, Encoding::poly()).unwrap();
        assert_eq!(chunks.len(), 1);
        assert_eq!(&decoded[..3], &[0, 0, 0]);
    }
}
