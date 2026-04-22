export interface ParameterDescription {
  symbol: string;
  name: string;
  description: string;
}

export const PARAMETERS: ParameterDescription[] = [
  {
    symbol: 't',
    name: 'Plaintext Modulus',
    description: 'Defines the range of values that can be encoded in a single coefficient. All arithmetic is performed modulo t.'
  },
  {
    symbol: 'N',
    name: 'Polynomial Degree',
    description: 'The degree of the polynomials used in BFV. This determines how many slots (or gradients) can be packed into a single ciphertext.'
  },
  {
    symbol: 'S',
    name: 'Scale Factor',
    description: 'The fixed-point multiplier used to convert floating-point gradients into integers for encryption.'
  },
  {
    symbol: 'λ',
    name: 'Security Parameter',
    description: 'Represents the computational complexity required for an attacker to break the encryption (e.g., 128-bit security).'
  },
  {
    symbol: 'k-of-n',
    name: 'Threshold',
    description: 'The minimum number of committee members (k) required to cooperate to decrypt the aggregate result out of the total members (n).'
  }
];
