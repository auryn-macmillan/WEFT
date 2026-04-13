// SPDX-License-Identifier: LGPL-3.0-only
//
// WEFT Demo — "Three Hospitals, One Model, Zero Data Leaks"
//
// A narrated walkthrough of privacy-preserving federated learning using
// bitplane tally encoding. Designed to be presentable on a call — run it
// and let the story unfold.
//
// Usage:  npx tsx scripts/run-round.ts

import {
  SCALE_FACTOR,
  PLAINTEXT_MODULUS,
  DEFAULT_SLOTS_PER_CT,
  MAX_GRAD_ABS,
  BITS_PER_GRADIENT,
  GRADIENTS_PER_CT,
  validateOverflowInvariant,
} from "../client/src/constants.js";

import {
  encodeBitplane,
  decodeBitplane,
} from "../client/src/encrypt.js";

// ---------------------------------------------------------------------------
// Scenario configuration
// ---------------------------------------------------------------------------

const NUM_CLIENTS = 3;
const GRADIENT_SIZE = 512;
const LEARNING_RATE = 0.01;

// The three hospitals and their "secret" patient population stats.
// These numbers drive the synthetic gradients to make the demo feel grounded.
const HOSPITALS = [
  { name: "St. Mercy General",  patients: 12_400, biasSign: +1, color: "\x1b[33m" },  // yellow
  { name: "Eastside Medical",   patients:  8_200, biasSign: -1, color: "\x1b[35m" },  // magenta
  { name: "Pacific University", patients: 22_000, biasSign: +1, color: "\x1b[36m" },  // cyan
] as const;

// ---------------------------------------------------------------------------
// Terminal formatting — zero dependencies
// ---------------------------------------------------------------------------

const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  bgRed:   "\x1b[41m",
  bgGreen: "\x1b[42m",
};

function banner(text: string) {
  const line = "═".repeat(text.length + 4);
  console.log();
  console.log(`${C.cyan}╔${line}╗${C.reset}`);
  console.log(`${C.cyan}║  ${C.bold}${text}${C.reset}${C.cyan}  ║${C.reset}`);
  console.log(`${C.cyan}╚${line}╝${C.reset}`);
  console.log();
}

function phase(n: number, total: number, title: string) {
  console.log(`${C.bold}${C.blue}  ┌─── Phase ${n}/${total}: ${title} ${"─".repeat(Math.max(0, 48 - title.length))}┐${C.reset}`);
}

function phaseEnd() {
  console.log(`${C.blue}  └${"─".repeat(65)}┘${C.reset}`);
  console.log();
}

function narrate(text: string) {
  console.log(`${C.dim}  │ ${text}${C.reset}`);
}

function dataLine(label: string, value: string) {
  console.log(`  │   ${C.yellow}${label}${C.reset} ${value}`);
}

function attackerSees(label: string, garbled: string) {
  console.log(`  │   ${C.red}${C.bold}🔒 ${label}${C.reset}${C.dim} ${garbled}${C.reset}`);
}

function success(text: string) {
  console.log(`  │ ${C.green}✓ ${text}${C.reset}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Generate fake "encrypted hex" that looks like line noise. */
function fakeEncryptedHex(length = 48): string {
  const chars = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out + "...";
}

// ---------------------------------------------------------------------------
// Core demo
// ---------------------------------------------------------------------------

async function main() {
  validateOverflowInvariant(PLAINTEXT_MODULUS, NUM_CLIENTS);

  const t = Number(PLAINTEXT_MODULUS);
  const coeffsPerClient = GRADIENT_SIZE * BITS_PER_GRADIENT;
  const numChunks = Math.ceil(coeffsPerClient / DEFAULT_SLOTS_PER_CT);

  // =========================================================================
  // TITLE
  // =========================================================================

  banner("WEFT — Three Hospitals, One Model, Zero Data Leaks");

  narrate("Imagine three hospitals want to improve a diabetes risk prediction");
  narrate("model. Each has thousands of patients — but sharing raw medical data");
  narrate("would violate privacy regulations and patient trust.");
  console.log();
  narrate(`${C.bold}What if they could train together without ${C.reset}${C.dim}ever${C.reset}${C.dim} seeing each`);
  narrate(`other's data?${C.reset}`);
  console.log();
  narrate("That's what this demo shows. Using homomorphic encryption, the");
  narrate("hospitals' model updates are encrypted, summed while still encrypted,");
  narrate("and only the aggregate result is decrypted. No individual hospital's");
  narrate("data is ever exposed — not to each other, not to the coordinator,");
  narrate("not even to an attacker who intercepts every message on the network.");
  console.log();

  console.log(`${C.dim}  Technical: BFV lattice encryption · t=${t} · S=${SCALE_FACTOR} · ${BITS_PER_GRADIENT} bits/gradient · ${GRADIENT_SIZE} params · ${numChunks} chunk(s)${C.reset}`);
  console.log(`${C.dim}  Encoding:  Bitplane tally — each gradient decomposed into ${BITS_PER_GRADIENT} individual bit coefficients${C.reset}`);
  console.log(`${C.dim}  Overflow:  n_max < t/2 = ${t / 2} (${NUM_CLIENTS} clients ✓) — precision decoupled from t${C.reset}`);
  console.log();

  await sleep(500);

  // =========================================================================
  // PHASE 1 — Meet the participants
  // =========================================================================

  phase(1, 6, "Meet the Participants");
  narrate("Three hospitals join this training round. Each has private patient");
  narrate("data they will NEVER share directly:");
  console.log("  │");

  for (const h of HOSPITALS) {
    console.log(`  │   ${h.color}${C.bold}🏥 ${h.name}${C.reset}${C.dim} — ${h.patients.toLocaleString()} patients${C.reset}`);
  }
  console.log("  │");
  narrate("A coordinator manages the round but never sees any hospital's data.");
  success("All participants registered.");
  phaseEnd();

  await sleep(300);

  // =========================================================================
  // PHASE 2 — Each hospital trains locally
  // =========================================================================

  phase(2, 6, "Local Training (Private)");
  narrate("Each hospital trains the shared model on its own patient records");
  narrate("and computes gradient updates — the 'directions' to improve the model.");
  narrate("These gradients are the hospital's secret contribution.");
  console.log("  │");

  const clientGradients: Float32Array[] = [];
  for (let c = 0; c < NUM_CLIENTS; c++) {
    const grads = new Float32Array(GRADIENT_SIZE);
    for (let i = 0; i < GRADIENT_SIZE; i++) {
      // Add hospital-specific bias to make each contribution visibly different
      const base = (Math.random() * 2 - 1) * 0.5;
      grads[i] = base * HOSPITALS[c].biasSign;
    }
    clientGradients.push(grads);

    const preview = Array.from(grads.slice(0, 4)).map((v) => v.toFixed(3));
    console.log(`  │   ${HOSPITALS[c].color}${HOSPITALS[c].name}${C.reset} gradients (first 4): [${preview.join(", ")}]`);
  }
  console.log("  │");
  narrate(`${C.bold}These values are sensitive${C.reset}${C.dim} — they encode information about each`);
  narrate("hospital's patient population. If leaked, an adversary could infer");
  narrate("details about patients' health outcomes.");
  success(`${NUM_CLIENTS} hospitals computed local gradients.`);
  phaseEnd();

  await sleep(300);

  // =========================================================================
  // PHASE 3 — Encryption ("the lock")
  // =========================================================================

  phase(3, 6, "Encrypt Gradients (Bitplane Encoding)");
  narrate("Before sending anything, each hospital encrypts its gradients using");
  narrate("BFV homomorphic encryption with bitplane tally encoding.");
  console.log("  │");

  narrate(`${C.bold}How bitplane encoding works:${C.reset}`);
  narrate(`${C.dim}  1. Each gradient is scaled to an integer (×${SCALE_FACTOR}) and offset to unsigned`);
  narrate(`  2. The unsigned integer is decomposed into ${BITS_PER_GRADIENT} individual bits`);
  narrate("  3. Each bit becomes one BFV polynomial coefficient (0 or 1)");
  narrate("  4. After homomorphic addition, each coefficient holds a TALLY COUNT");
  narrate(`     (0..${NUM_CLIENTS}) instead of a gradient magnitude`);
  console.log("  │");
  narrate(`${C.bold}Why this matters:${C.reset}${C.dim} with t=${t}, standard encoding limits scale to S≤4.`);
  narrate(`Bitplane gives us S=${SCALE_FACTOR} — that's ${C.bold}${SCALE_FACTOR / 4}× better precision${C.reset}${C.dim}, because`);
  narrate(`the overflow constraint is just n < t/2 = ${t / 2}, independent of S.`);
  console.log("  │");

  // Simulate encryption (bitplane encoding)
  const simulatedBitplanes: number[][] = [];

  for (let c = 0; c < NUM_CLIENTS; c++) {
    const coefficients: number[] = [];
    for (let i = 0; i < GRADIENT_SIZE; i++) {
      const bits = encodeBitplane(clientGradients[c][i]);
      coefficients.push(...bits);
    }
    simulatedBitplanes.push(coefficients);

    // Show what was private vs what goes on the wire
    const privatePeek = Array.from(clientGradients[c].slice(0, 3)).map((v) => v.toFixed(3));
    const bitPeek = coefficients.slice(0, 14).join("");
    console.log(`  │   ${HOSPITALS[c].color}${C.bold}${HOSPITALS[c].name}${C.reset}`);
    dataLine("Private data:    ", `[${privatePeek.join(", ")}, ...]`);
    dataLine("Bitplane (grad₀):", `[${bitPeek}] (${BITS_PER_GRADIENT} bits)`);
    attackerSees("On the wire: ", fakeEncryptedHex());
    console.log("  │");
  }

  narrate("An eavesdropper sees only random-looking ciphertext. There is no");
  narrate("way to reconstruct the original gradients from the encrypted form");
  narrate("without the decryption key — which no single party holds.");
  success("All gradients encoded and encrypted.");
  phaseEnd();

  await sleep(300);

  // =========================================================================
  // PHASE 4 — Homomorphic summation ("math on ciphertext")
  // =========================================================================

  phase(4, 6, "Homomorphic Aggregation (Math on Ciphertext)");
  narrate("Here's the magic: the encrypted bit-coefficients are added together");
  narrate("WITHOUT decrypting them. The Enclave's secure process sums the");
  narrate("ciphertexts inside a RISC Zero zkVM — producing an encrypted");
  narrate("aggregate that nobody can read yet.");
  console.log("  │");

  narrate("For each bit position, the sum across clients gives a TALLY:");
  narrate(`  bit=1 from ${NUM_CLIENTS} clients → tally=${NUM_CLIENTS}  (all had that bit set)`);
  narrate("  bit=0 from all clients → tally=0  (none had that bit set)");
  narrate(`  Max possible tally: ${NUM_CLIENTS}, well within t/2 = ${t / 2}`);
  console.log("  │");

  // Element-wise sum of all clients' bit-coefficient arrays
  const totalCoeffs = simulatedBitplanes[0].length;
  const simulatedSum = new Array<number>(totalCoeffs).fill(0);
  for (let c = 0; c < NUM_CLIENTS; c++) {
    for (let i = 0; i < totalCoeffs; i++) {
      simulatedSum[i] += simulatedBitplanes[c][i];
    }
  }

  // Show tally stats
  const maxTally = Math.max(...simulatedSum);
  dataLine("Coefficients:    ", `${totalCoeffs} (${GRADIENT_SIZE} gradients × ${BITS_PER_GRADIENT} bits)`);
  dataLine("Max tally value: ", `${maxTally} (limit: ${t / 2})`);
  console.log("  │");

  attackerSees("Encrypted sum:", fakeEncryptedHex(64));
  console.log("  │");
  narrate("Even the coordinator cannot see what's inside. The sum exists only");
  narrate("in encrypted form. No individual hospital's data can be extracted.");
  success("Homomorphic sum computed over all encrypted contributions.");
  phaseEnd();

  await sleep(300);

  // =========================================================================
  // PHASE 5 — Threshold decryption + dequantize
  // =========================================================================

  phase(5, 6, "Threshold Decryption & Recovery");
  narrate("The ciphernode committee (a distributed group of key holders)");
  narrate("threshold-decrypts the aggregate. No single committee member");
  narrate("can decrypt alone — a majority must cooperate.");
  console.log("  │");

  narrate("After decryption, the coordinator recovers the averaged gradient:");
  narrate(`  1. Group every ${BITS_PER_GRADIENT} tally values → one gradient's bit tallies`);
  narrate("  2. Weighted sum: Σ(tally[b] × 2ᵇ) reconstructs the aggregate integer");
  narrate(`  3. Remove offset: subtract n × S × G = ${NUM_CLIENTS} × ${SCALE_FACTOR} × ${MAX_GRAD_ABS}`);
  narrate(`  4. Divide by n × S = ${NUM_CLIENTS} × ${SCALE_FACTOR} = ${NUM_CLIENTS * SCALE_FACTOR} to get the average`);
  console.log("  │");

  const recovered = new Float32Array(GRADIENT_SIZE);
  for (let g = 0; g < GRADIENT_SIZE; g++) {
    const offset = g * BITS_PER_GRADIENT;
    const tallies = simulatedSum.slice(offset, offset + BITS_PER_GRADIENT);
    recovered[g] = decodeBitplane(tallies, NUM_CLIENTS);
  }

  // Compute ground truth
  const expectedAvg = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    for (let c = 0; c < NUM_CLIENTS; c++) {
      expectedAvg[i] += Math.max(-MAX_GRAD_ABS, Math.min(MAX_GRAD_ABS, clientGradients[c][i]));
    }
    expectedAvg[i] /= NUM_CLIENTS;
  }

  // Show the reveal
  narrate(`${C.bold}What was hidden is now revealed — but only the aggregate:${C.reset}`);
  console.log("  │");

  for (let c = 0; c < NUM_CLIENTS; c++) {
    const priv = Array.from(clientGradients[c].slice(0, 4)).map((v) => v.toFixed(3));
    console.log(`  │   ${C.red}✗ ${HOSPITALS[c].name}'s data:${C.reset}${C.dim}  [${priv.join(", ")}]  ← still secret${C.reset}`);
  }
  const aggPreview = Array.from(recovered.slice(0, 4)).map((v) => v.toFixed(6));
  console.log(`  │   ${C.green}${C.bold}✓ Aggregate (public):    [${aggPreview.join(", ")}]  ← only this is visible${C.reset}`);
  console.log("  │");

  // Verify accuracy
  let maxError = 0;
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    maxError = Math.max(maxError, Math.abs(recovered[i] - expectedAvg[i]));
  }
  const precisionBound = 1 / SCALE_FACTOR;

  if (maxError > precisionBound) {
    console.error(`${C.red}ERROR: Quantization error ${maxError.toFixed(6)} exceeds bound ${precisionBound}${C.reset}`);
    process.exit(1);
  }
  success(`Aggregate recovered. Max quantization error: ${maxError.toExponential(2)} (within ±${precisionBound.toFixed(6)})`);
  phaseEnd();

  await sleep(300);

  // =========================================================================
  // PHASE 6 — Model update
  // =========================================================================

  phase(6, 6, "Update Global Model");
  narrate("The coordinator applies the aggregated gradient to the shared model,");
  narrate("nudging it in the direction all three hospitals' data suggests —");
  narrate("without any single hospital's data ever being exposed.");
  console.log("  │");

  const globalWeights = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    globalWeights[i] = Math.random() * 2 - 1;
  }
  const newWeights = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    newWeights[i] = globalWeights[i] - LEARNING_RATE * recovered[i];
  }

  const oldPreview = Array.from(globalWeights.slice(0, 4)).map((v) => v.toFixed(4));
  const newPreview = Array.from(newWeights.slice(0, 4)).map((v) => v.toFixed(4));
  dataLine("Before: ", `[${oldPreview.join(", ")}]`);
  dataLine("After:  ", `[${newPreview.join(", ")}]`);
  console.log("  │");
  narrate(`Learning rate: ${LEARNING_RATE} · Model parameters: ${GRADIENT_SIZE}`);
  success("Global model updated. Round complete.");
  phaseEnd();

  // =========================================================================
  // SUMMARY
  // =========================================================================

  banner("Round Complete — Here's What Happened");

  console.log(`  ${C.green}✓${C.reset} Three hospitals improved a shared model together`);
  console.log(`  ${C.green}✓${C.reset} Each hospital's gradients were encrypted before leaving their walls`);
  console.log(`  ${C.green}✓${C.reset} Bitplane encoding: ${BITS_PER_GRADIENT} bits/gradient, S=${SCALE_FACTOR} (±${(1/SCALE_FACTOR).toFixed(6)} precision)`);
  console.log(`  ${C.green}✓${C.reset} The encrypted values were summed — without anyone decrypting them`);
  console.log(`  ${C.green}✓${C.reset} Only the aggregate (average) was ever decrypted`);
  console.log(`  ${C.green}✓${C.reset} No individual hospital's data was visible to anyone — ever`);
  console.log();
  console.log(`  ${C.bold}${C.cyan}This is WEFT:${C.reset} collaborative machine learning where privacy`);
  console.log(`  isn't a policy — it's ${C.bold}mathematically enforced${C.reset}.`);
  console.log();
  console.log(`${C.dim}  Powered by The Interfold (Enclave) · BFV homomorphic encryption · RISC Zero zkVM${C.reset}`);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
