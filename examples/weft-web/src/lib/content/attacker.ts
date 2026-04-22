export const ATTACKER_COPY = {
  title: 'Attacker Perspective',
  overview: 'What the attacker sees: only encrypted noise. Even with access to the network traffic, the private data remains protected by mathematical guarantees.',
  phases: {
    meet: 'Network traffic shows hospital registration, but no patient data is transmitted.',
    dkg: 'Public key fragments are visible, but the collective secret key is never exposed.',
    shares: 'Encrypted fragments being exchanged look like random bits.',
    'aggregate-pk': 'The public key is known, but it only allows encryption, not decryption.',
    'train-encrypt': 'Ciphertexts leaving the hospitals are indistinguishable from random noise.',
    'homomorphic-add': 'Operating on ciphertexts produces more encrypted noise.',
    'threshold-decrypt': 'Only the final aggregate is revealed; individual shares remain protected.',
    'update-model': 'The global model update is public, but individual contributions are permanently masked.'
  }
};
