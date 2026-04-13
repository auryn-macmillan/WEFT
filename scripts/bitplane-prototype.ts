#!/usr/bin/env npx tsx
/**
 * Bitplane Tally Encoding — Proof of Concept
 *
 * Demonstrates that decomposing each gradient into individual bits
 * across separate BFV coefficients shifts the overflow constraint
 * from  n_max × S × G < t/2  to just  n_max < t/2,
 * decoupling precision from the plaintext modulus entirely.
 *
 * With t = 100 (demo BFV preset):
 *   Standard encoding: S = 4  → ±0.25 precision (25% granularity!)
 *   Bitplane at S=4096 → ±0.000244 precision (1024× improvement)
 */

import { PLAINTEXT_MODULUS, MAX_GRAD_ABS } from "../client/src/constants.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const t = BigInt(PLAINTEXT_MODULUS);
const G = MAX_GRAD_ABS; // 1.0

function bitsNeeded(scaleFactor: number): number {
  const maxUnsigned = 2 * scaleFactor * G;
  return Math.ceil(Math.log2(maxUnsigned + 1));
}

function encodeBitplane(gradient: number, scaleFactor: number): number[] {
  const clamped = Math.max(-G, Math.min(G, gradient));
  const scaled = Math.round(clamped * scaleFactor);
  const unsigned = scaled + scaleFactor * G; // offset to [0, 2*S*G]
  const B = bitsNeeded(scaleFactor);
  const bits: number[] = [];
  for (let b = 0; b < B; b++) {
    bits.push((unsigned >> b) & 1);
  }
  return bits;
}

function decodeBitplane(
  tallies: number[],
  numClients: number,
  scaleFactor: number,
): number {
  let weightedSum = 0;
  for (let b = 0; b < tallies.length; b++) {
    weightedSum += tallies[b] * (1 << b);
  }
  const offsetRemoved = weightedSum - numClients * scaleFactor * G;
  return offsetRemoved / (numClients * scaleFactor);
}

function simulateHomomorphicSum(clientBits: number[][]): number[] {
  const B = clientBits[0].length;
  const tallies = new Array(B).fill(0);
  for (const bits of clientBits) {
    for (let b = 0; b < B; b++) {
      tallies[b] += bits[b];
    }
  }
  return tallies;
}

// ─── Phase 1: Comparison Table ──────────────────────────────────────────────

console.log(
  "╔══════════════════════════════════════════════════════════════════╗",
);
console.log(
  "║        BITPLANE TALLY ENCODING — PROOF OF CONCEPT              ║",
);
console.log(
  "║        Overcoming t=100 precision limits in BFV                 ║",
);
console.log(
  "╚══════════════════════════════════════════════════════════════════╝",
);
console.log();

console.log(
  "┌─────────────────────────────────────────────────────────────────┐",
);
console.log(
  "│ Phase 1: Scale Factor Comparison                               │",
);
console.log(
  "│ Standard encoding: n_max × S × G < t/2 = 50                   │",
);
console.log(
  "│ Bitplane encoding: n_max < t/2 = 50 (S doesn't matter!)       │",
);
console.log(
  "└─────────────────────────────────────────────────────────────────┘",
);
console.log();

const scaleFactors = [4, 16, 64, 256, 1024, 4096, 65536, 1048576];

console.log(
  "┌──────────┬────────────┬─────────────┬───────────┬──────────┬──────────────┐",
);
console.log(
  "│ Scale(S) │ Precision  │ Std max_n   │ Bits/grad │ Grads/CT │ BP max_n     │",
);
console.log(
  "├──────────┼────────────┼─────────────┼───────────┼──────────┼──────────────┤",
);

for (const S of scaleFactors) {
  const precision = (1 / S).toFixed(6);
  const stdMaxN = Math.floor(49 / (S * G)); // t/2 = 50, so < 50 means max 49
  const B = bitsNeeded(S);
  const gradsPerCT = Math.floor(8192 / B); // using secure preset slots
  const bpMaxN = 49; // always n < t/2 = 50

  console.log(
    `│ ${String(S).padStart(8)} │ ±${precision.padStart(9)} │ ${String(stdMaxN || "OVERFLOW").padStart(11)} │ ${String(B).padStart(9)} │ ${String(gradsPerCT).padStart(8)} │ ${String(bpMaxN).padStart(12)} │`,
  );
}

console.log(
  "└──────────┴────────────┴─────────────┴───────────┴──────────┴──────────────┘",
);
console.log();
console.log(
  "  Key insight: Standard encoding becomes useless past S=49 (0 clients!).",
);
console.log(
  "  Bitplane supports 49 clients at ANY scale factor — even S=1,048,576.",
);
console.log();

// ─── Phase 2: Round-Trip Tests ──────────────────────────────────────────────

console.log(
  "┌─────────────────────────────────────────────────────────────────┐",
);
console.log(
  "│ Phase 2: Round-Trip Encoding/Decoding Tests                    │",
);
console.log(
  "└─────────────────────────────────────────────────────────────────┘",
);
console.log();

const testCases = [
  { gradient: 0.75, clients: [0.75, 0.75, 0.75] },
  { gradient: -0.5, clients: [-0.5, -0.5, -0.5] },
  { gradient: 0.0, clients: [0.0, 0.0, 0.0] },
  { gradient: 1.0, clients: [1.0, -1.0, 0.5] },
  { gradient: -0.001, clients: [-0.001, -0.001, -0.001] },
];

for (const S of [16, 256, 4096]) {
  console.log(
    `  Scale Factor S = ${S} (precision ±${(1 / S).toFixed(6)}, ${bitsNeeded(S)} bits/gradient):`,
  );

  let allPass = true;
  for (const tc of testCases) {
    const clientBits = tc.clients.map((g) => encodeBitplane(g, S));
    const tallies = simulateHomomorphicSum(clientBits);

    // Verify no tally exceeds t/2
    const maxTally = Math.max(...tallies);
    const tallyOk = maxTally < Number(t) / 2;

    const decoded = decodeBitplane(tallies, tc.clients.length, S);
    const expected =
      tc.clients.reduce((a, b) => a + b, 0) / tc.clients.length;
    const error = Math.abs(decoded - expected);
    const tolerance = 1 / S + 1e-10;
    const ok = error <= tolerance && tallyOk;

    if (!ok) allPass = false;

    console.log(
      `    inputs=${JSON.stringify(tc.clients).padEnd(24)} → decoded=${decoded.toFixed(6).padStart(10)}, expected=${expected.toFixed(6).padStart(10)}, error=${error.toExponential(2).padStart(9)}, maxTally=${String(maxTally).padStart(2)} ${ok ? "✅" : "❌"}`,
    );
  }
  console.log(`  ${allPass ? "  ALL PASSED ✅" : "  SOME FAILED ❌"}`);
  console.log();
}

// ─── Phase 3: Full Simulation ───────────────────────────────────────────────

console.log(
  "┌─────────────────────────────────────────────────────────────────┐",
);
console.log(
  "│ Phase 3: Full Simulation — 512 gradients, 3 clients, S=4096   │",
);
console.log(
  "└─────────────────────────────────────────────────────────────────┘",
);
console.log();

const NUM_GRADIENTS = 512;
const NUM_CLIENTS = 3;
const SIM_SCALE = 4096;
const B = bitsNeeded(SIM_SCALE);

// Generate random gradients for each client
const rng = (seed: number) => {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff; // [0, 1)
  };
};

const clientGradients: number[][] = [];
for (let c = 0; c < NUM_CLIENTS; c++) {
  const random = rng(42 + c);
  const grads: number[] = [];
  for (let i = 0; i < NUM_GRADIENTS; i++) {
    grads.push(random() * 2 - 1); // [-1, 1]
  }
  clientGradients.push(grads);
}

// Encode all gradients to bitplanes
const allClientBits: number[][][] = []; // [client][gradient][bit]
for (let c = 0; c < NUM_CLIENTS; c++) {
  const gradBits: number[][] = [];
  for (let i = 0; i < NUM_GRADIENTS; i++) {
    gradBits.push(encodeBitplane(clientGradients[c][i], SIM_SCALE));
  }
  allClientBits.push(gradBits);
}

// Simulate homomorphic addition per gradient
const decodedAverages: number[] = [];
const expectedAverages: number[] = [];
let maxError = 0;
let sumError = 0;
let maxTallyValue = 0;

for (let i = 0; i < NUM_GRADIENTS; i++) {
  // Gather bits from all clients for this gradient
  const bitsPerClient = allClientBits.map((cBits) => cBits[i]);
  const tallies = simulateHomomorphicSum(bitsPerClient);

  maxTallyValue = Math.max(maxTallyValue, ...tallies);

  const decoded = decodeBitplane(tallies, NUM_CLIENTS, SIM_SCALE);
  decodedAverages.push(decoded);

  const expected =
    clientGradients.reduce((sum, cg) => sum + cg[i], 0) / NUM_CLIENTS;
  expectedAverages.push(expected);

  const error = Math.abs(decoded - expected);
  maxError = Math.max(maxError, error);
  sumError += error;
}

const coefficientsUsed = NUM_GRADIENTS * B;
const ciphertextsNeeded = Math.ceil(coefficientsUsed / 8192);

console.log(`  Configuration:`);
console.log(`    Gradients:       ${NUM_GRADIENTS}`);
console.log(`    Clients:         ${NUM_CLIENTS}`);
console.log(
  `    Scale Factor:    ${SIM_SCALE} (precision ±${(1 / SIM_SCALE).toFixed(6)})`,
);
console.log(`    Bits/gradient:   ${B}`);
console.log(
  `    Total coeffs:    ${coefficientsUsed} (${NUM_GRADIENTS} × ${B})`,
);
console.log(`    Ciphertexts:     ${ciphertextsNeeded} (at 8192 slots/CT)`);
console.log();
console.log(`  Results:`);
console.log(
  `    Max tally value: ${maxTallyValue} (must be < t/2 = ${Number(t) / 2})`,
);
console.log(
  `    Tally overflow:  ${maxTallyValue >= Number(t) / 2 ? "❌ OVERFLOW!" : "✅ Safe"}`,
);
console.log(`    Max error:       ${maxError.toExponential(4)}`);
console.log(
  `    Mean error:      ${(sumError / NUM_GRADIENTS).toExponential(4)}`,
);
console.log(
  `    Error < 1/S:     ${maxError <= 1 / SIM_SCALE + 1e-10 ? "✅ Yes" : "❌ No"}`,
);
console.log();

// Show a few example gradients
console.log(`  Sample gradients (first 8):`);
console.log(
  `  ${"Expected".padStart(12)} ${"Decoded".padStart(12)} ${"Error".padStart(12)}`,
);
for (let i = 0; i < 8; i++) {
  console.log(
    `  ${expectedAverages[i].toFixed(6).padStart(12)} ${decodedAverages[i].toFixed(6).padStart(12)} ${Math.abs(decodedAverages[i] - expectedAverages[i]).toExponential(2).padStart(12)}`,
  );
}
console.log();

// ─── Phase 4: Summary ──────────────────────────────────────────────────────

console.log(
  "╔══════════════════════════════════════════════════════════════════╗",
);
console.log(
  "║  CONCLUSION                                                    ║",
);
console.log(
  "╠══════════════════════════════════════════════════════════════════╣",
);
console.log(
  "║                                                                ║",
);
console.log(
  "║  Bitplane tally encoding WORKS. Key results:                   ║",
);
console.log(
  "║                                                                ║",
);
console.log(
  `║  • Precision: ±${(1 / SIM_SCALE).toFixed(6)} (was ±0.250000 with standard)     ║`,
);
console.log(
  `║  • Improvement: ${SIM_SCALE / 4}× better precision                          ║`,
);
console.log(
  `║  • Max clients: 49 (was 12 with standard at S=4)               ║`,
);
console.log(
  `║  • Cost: ${B} coefficients per gradient (was 1)                 ║`,
);
console.log(
  `║  • Ciphertexts: ${ciphertextsNeeded} per client for ${NUM_GRADIENTS} gradients (was 1)         ║`,
);
console.log(
  "║                                                                ║",
);
console.log(
  "║  The tradeoff is clear: use more coefficients per gradient     ║",
);
console.log(
  "║  to unlock arbitrary precision within BFV's t=100 constraint.  ║",
);
console.log(
  "║                                                                ║",
);
console.log(
  "╚══════════════════════════════════════════════════════════════════╝",
);

// Exit with error if anything failed
if (maxTallyValue >= Number(t) / 2) {
  console.error("\n❌ TALLY OVERFLOW DETECTED — prototype failed!");
  process.exit(1);
}
if (maxError > 1 / SIM_SCALE + 1e-10) {
  console.error("\n❌ PRECISION EXCEEDED — prototype failed!");
  process.exit(1);
}

console.log("\n✅ All checks passed. Bitplane tally encoding is viable.\n");
