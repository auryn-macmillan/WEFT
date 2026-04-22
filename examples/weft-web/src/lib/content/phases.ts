export type PhaseId = 'meet' | 'dkg' | 'shares' | 'aggregate-pk' | 'train-encrypt' | 'homomorphic-add' | 'threshold-decrypt' | 'update-model';
export type DepthLevel = 'novice' | 'learn-more' | 'show-math';

export interface PhaseContent {
  id: PhaseId;
  title: string;
  tagline: string;
  body: Record<DepthLevel, string>;
  equations?: string[];
}

export const PHASES: PhaseContent[] = [
  {
    id: 'meet',
    title: 'Meet the Participants',
    tagline: 'Three hospitals, one model, zero data leaks.',
    body: {
      novice: "Three hospitals join this training round to improve a diabetes risk prediction model. Each has private patient data they will NEVER share directly. What's real: the cryptography. What's simulated: the committee runs as 5 Web Workers on your machine; in production these would be 5 independent organizations.",
      'learn-more': "Imagine three hospitals want to improve a diabetes risk prediction model. Each has thousands of patients — but sharing raw medical data would violate privacy regulations and patient trust. A coordinator manages the round but never sees any hospital's data. All participants are registered and ready to collaborate.",
      'show-math': "Participants $P = \{H_1, H_2, H_3\}$ register for a federated training round. Each hospital $H_i$ holds a private dataset $D_i$. The goal is to compute an aggregate update without revealing $D_i$ or its derived gradients $g_i$. The committee $C$ provides the threshold encryption infrastructure."
    }
  },
  {
    id: 'dkg',
    title: 'Distributed Key Generation',
    tagline: 'Generating a shared secret without a single point of failure.',
    body: {
      novice: "The committee generates a shared encryption key without any single member knowing the full secret. This ensures that no single party can peek at the data.",
      'learn-more': "Distributed Key Generation (DKG) allows a group of nodes to collectively generate a public-private key pair. Each member generates their own secret key piece, shares it via Shamir secret sharing (split into fragments), and generates smudging noise to protect against partial leakage.",
      'show-math': "The committee uses a Shamir Secret Sharing scheme where a polynomial $f(x) = a_0 + a_1x + \dots + a_tx^t \pmod{q}$ is generated. Each member $i$ receives a share $s_i = f(i)$. Decryption requires $t+1$ shares to reconstruct $a_0$ via Lagrange interpolation."
    },
    equations: ["f(x) = \sum_{i=0}^{t} a_i x^i \pmod{q}"]
  },
  {
    id: 'shares',
    title: 'Share Distribution',
    tagline: 'Exchanging fragments to build the collective key.',
    body: {
      novice: "Committee members exchange their fragments securely. Each member collects one fragment from every other member, then combines them into their working key.",
      'learn-more': "In this phase, the Shamir fragments generated during DKG are distributed across the network. This 'simulated network' exchange ensures that every committee member holds enough information to participate in a threshold decryption, but not enough to act alone.",
      'show-math': "Each party $P_i$ distributes shares $s_{ij}$ to party $P_j$. After receiving $n$ shares, party $P_j$ computes its aggregate share $S_j = \sum_{i=1}^{n} s_{ij} \pmod{q}$. This aggregate share is used for threshold decryption shares."
    }
  },
  {
    id: 'aggregate-pk',
    title: 'Aggregate Public Key',
    tagline: 'One key to encrypt them all.',
    body: {
      novice: "All committee members' public key shares combine into one shared public key. Anyone can encrypt with it, but decryption requires the cooperation of a majority of the committee.",
      'learn-more': "The individual public key shares from the committee are homomorphically combined to form a single, unified public key for the BFV encryption scheme. This key is broadcast to all participating hospitals, allowing them to encrypt their local updates.",
      'show-math': "The aggregate public key $PK$ is the sum of individual public key shares: $PK = \sum_{i \in \text{committee}} PK_i$. In BFV, this public key allows encryption of plaintexts into the same ciphertext space."
    }
  },
  {
    id: 'train-encrypt',
    title: 'Local Training & Encryption',
    tagline: 'Training locally, encrypting globally.',
    body: {
      novice: "Each hospital trains the model on its own patient records. Before sending anything, they encrypt their gradients. The gradients here are scripted; the encryption is real.",
      'learn-more': "Hospitals compute gradients to improve the model. These values are sensitive — they encode information about patient health. Each gradient is clamped and quantized before being encrypted using the BFV scheme. This ensures that only random-looking noise is sent over the wire.",
      'show-math': "Gradients $g \in [-1, 1]$ are quantized: $m = \text{round}(g \cdot S)$. The BFV encryption of message $m$ is a ciphertext $c = (a \cdot s + e + \Delta \cdot m, -a)$, where $s$ is the secret key, $e$ is noise, and $a$ is random."
    },
    equations: ["c = (a \cdot s + e + \Delta \cdot m, -a)"]
  },
  {
    id: 'homomorphic-add',
    title: 'Homomorphic Aggregation',
    tagline: 'Computing on encrypted data.',
    body: {
      novice: "The encrypted updates are added together WITHOUT decrypting them. This produces an encrypted aggregate that nobody can read yet.",
      'learn-more': "Using the homomorphic properties of the BFV scheme, we can sum ciphertexts directly. The Enclave's secure process sums the ciphertexts inside a RISC Zero zkVM. An eavesdropper sees only random-looking ciphertext, as the sum exists only in encrypted form.",
      'show-math': "Homomorphic addition of two ciphertexts $c_1 = (u_1, v_1)$ and $c_2 = (u_2, v_2)$ is defined as $c_{sum} = (u_1 + u_2, v_1 + v_2)$. By the linearity of the BFV scheme, $D(c_1 + c_2) = D(c_1) + D(c_2) = m_1 + m_2 \pmod{t}$."
    }
  },
  {
    id: 'threshold-decrypt',
    title: 'Threshold Decryption',
    tagline: 'Revealing the aggregate, keeping the secrets.',
    body: {
      novice: "The committee cooperates to decrypt the aggregate result. No single member can decrypt alone — a majority must cooperate. Only the final average is revealed.",
      'learn-more': "The ciphernode committee performs a threshold decryption of the aggregated ciphertext. Each member provides a decryption share. These shares are then combined to recover the plaintext sum of gradients. This ensures that individual contributions remain hidden within the aggregate.",
      'show-math': "Decryption shares $d_i$ are combined using Lagrange coefficients $L_i$: $M = \sum_{i \in \text{subset}} d_i L_i \pmod{q}$. This recovers the scaled sum $\sum g_i \cdot S$ which is then dequantized."
    },
    equations: ["M = \sum_{i \in S} d_i L_i \pmod{q}"]
  },
  {
    id: 'update-model',
    title: 'Update Global Model',
    tagline: 'Collaborative intelligence, mathematically enforced.',
    body: {
      novice: "The coordinator applies the averaged gradient to the shared model. The model improves based on all hospitals' data — without any data ever leaving their walls.",
      'learn-more': "The recovered aggregate gradient is divided by the number of participants and the scale factor to get the true average. This averaged gradient is then used to update the global model weights via stochastic gradient descent.",
      'show-math': "The model weights are updated as $W_{new} = W_{old} - \eta \cdot \frac{1}{n} \sum g_i$, where $\eta$ is the learning rate and $n$ is the number of clients. This 'nudges' the model in the optimal direction for all participants."
    },
    equations: ["W_{new} = W_{old} - \eta \cdot \frac{1}{n} \sum g_i"]
  }
];
