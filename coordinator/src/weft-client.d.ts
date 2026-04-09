declare module "@weft/client" {
  export const SCALE_FACTOR: number;
  export const MAX_CLIENTS: number;
  export const MAX_GRAD_ABS: number;
  export const MAX_GRAD_INT: number;
  export const DEFAULT_SLOTS_PER_CT: number;
  export const PLAINTEXT_MODULUS: bigint;

  export function validateOverflowInvariant(
    plaintextModulus: bigint,
    numClients: number,
  ): void;

  export function quantizeGradients(
    gradients: Float32Array,
    scaleFactor?: number,
    maxGradAbs?: number,
    plaintextModulus?: bigint,
  ): bigint[];

  export function dequantizeGradients(
    quantized: bigint[],
    numClients: number,
    scaleFactor?: number,
    plaintextModulus?: bigint,
  ): Float32Array;

  export function splitIntoChunks(
    quantized: bigint[],
    slotsPerCt?: number,
  ): bigint[][];

  export function encryptGradients(
    gradients: Float32Array,
    publicKey: Uint8Array,
    bfvParams: Uint8Array,
    scaleFactor?: number,
  ): Promise<Uint8Array[]>;

  export interface SubmitConfig {
    e3Id: bigint;
    flAggregatorAddress: string;
    signer: import("ethers").Signer;
  }

  export function submitGradients(
    ciphertexts: Uint8Array[],
    config: SubmitConfig,
  ): Promise<import("ethers").TransactionReceipt>;
}
