# Honest Framing & Disclosures

WEFT (Weighted Encrypted Federated Training) is a privacy-preserving federated learning demo. It is designed to illustrate the flow of encrypted gradient updates and threshold decryption using the Interfold's cryptography.

**IMPORTANT: This is a demonstration scaffold, not a production-ready system.**

## Mandatory Disclosures

1. **Simulated vs production committee:** This demo runs 5 web workers within a single browser instance. This does not represent a geographically distributed set of ciphernodes. In a production environment, these nodes would be operated by independent parties with distinct trust boundaries.
2. **No on-chain component:** While WEFT is designed to interact with the Interfold's E3 contracts, this web demo is entirely client-side. Ciphertexts and proofs are not published to Ethereum or any other blockchain.
3. **No RISC Zero proof:** The secure process (homomorphic summation) is reimplemented in WASM for display purposes in this demo. It does not generate or verify RISC Zero zkVM proofs.
4. **Parameters match Interfold SECURE_THRESHOLD_8192 preset but production uses different trust model:** The demo uses BFV parameters aligned with the Interfold's `SECURE_THRESHOLD_8192` preset to ensure cryptographic parity. However, the trust model in this demo is centralized to your browser, whereas production relies on the decentralized ciphernode committee and DKG.
5. **Demo uses seeded randomness for parity testing:** For consistent behavior and easier verification across walkthrough steps, this demo uses seeded (pseudo)randomness. A production implementation must use fresh, high-entropy randomness for all cryptographic operations (key generation, encryption, etc.).

## Intended Use

This demo is intended for:
- Visualizing the lifecycle of a federated learning round.
- Understanding how gradient updates are protected via BFV encryption.
- Demonstrating the "trust no one" property where individual data is never decrypted.

It is **not** intended for:
- Storing or processing actual sensitive data.
- Benchmarking production performance.
- Security audits of the Interfold protocol.
