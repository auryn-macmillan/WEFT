export interface BfvParams {
  readonly presetId: 'SECURE_THRESHOLD_8192'
  readonly plaintextModulus: bigint   // t
  readonly polyDegree: number         // N
  readonly threshold: number          // 3
  readonly committeeSize: number      // 5
}
export interface PublicKeyBytes { readonly bytes: Uint8Array }
export interface CiphertextBytes { readonly bytes: Uint8Array }
export interface DecryptionShareBytes { readonly bytes: Uint8Array; readonly partyIndex: number }
export interface SecretShareBytes { readonly bytes: Uint8Array; readonly partyIndex: number }

export interface DkgTranscript {
  readonly publicKey: PublicKeyBytes
  readonly perPartyShares: readonly SecretShareBytes[]
  readonly contributions: readonly Uint8Array[]   // redacted-safe for attacker panel
}

export interface CryptoEngine {
  getParams(): BfvParams
  runDkg(committeeSize: number, threshold: number): Promise<DkgTranscript>
  encryptVector(publicKey: PublicKeyBytes, plaintext: Int32Array): Promise<CiphertextBytes>
  aggregateCiphertexts(ciphertexts: readonly CiphertextBytes[]): Promise<CiphertextBytes>
  partialDecrypt(share: SecretShareBytes, ciphertext: CiphertextBytes): Promise<DecryptionShareBytes>
  combineDecryptionShares(shares: readonly DecryptionShareBytes[], ciphertext: CiphertextBytes): Promise<Int32Array>
}

export type TelemetryEventKind = 'dkg-start' | 'dkg-done' | 'encrypt-start' | 'encrypt-done' | 'aggregate-start' | 'aggregate-done' | 'partial-decrypt-start' | 'partial-decrypt-done' | 'combine-start' | 'combine-done'
export interface TelemetryEvent {
  kind: TelemetryEventKind
  timestamp: number
  partyIndex?: number
  ciphertextPreview?: string  // hex of first 16 bytes
}
export type TelemetryEmitter = (event: TelemetryEvent) => void

/**
 * AGENTS.md §Overflow Safety Invariant. maxGradInt = SCALE_FACTOR × MAX_GRAD_ABS (pre-computed by caller).
 */
export function assertOverflowInvariant(params: BfvParams, maxClients: number, maxGradInt: number): void {
  if (BigInt(maxClients) * BigInt(maxGradInt) >= params.plaintextModulus / 2n) {
    throw new Error('overflow invariant violated: n_max * G * S >= t / 2');
  }
}