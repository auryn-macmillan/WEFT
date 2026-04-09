import {
  SCALE_FACTOR,
  PLAINTEXT_MODULUS,
  DEFAULT_SLOTS_PER_CT,
  validateOverflowInvariant,
} from "../client/src/constants.js";

const NUM_CLIENTS = 3;
const GRADIENT_SIZE = 512;
const LEARNING_RATE = 0.01;

async function main() {
  validateOverflowInvariant(PLAINTEXT_MODULUS, NUM_CLIENTS);

  const numChunks = Math.ceil(GRADIENT_SIZE / DEFAULT_SLOTS_PER_CT);
  console.log(`WEFT FL Round Demo`);
  console.log(`  Clients:       ${NUM_CLIENTS}`);
  console.log(`  Gradient size: ${GRADIENT_SIZE}`);
  console.log(`  Chunks/client: ${numChunks}`);
  console.log(`  Scale factor:  ${SCALE_FACTOR}`);
  console.log(`  Plaintext mod: ${PLAINTEXT_MODULUS}`);
  console.log();

  const globalWeights = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    globalWeights[i] = Math.random() * 2 - 1;
  }
  console.log(
    `[1/6] Initialized global weights (first 5): ${Array.from(globalWeights.slice(0, 5)).map((v) => v.toFixed(4))}`,
  );

  const clientGradients: Float32Array[] = [];
  for (let c = 0; c < NUM_CLIENTS; c++) {
    const grads = new Float32Array(GRADIENT_SIZE);
    for (let i = 0; i < GRADIENT_SIZE; i++) {
      grads[i] = (Math.random() * 2 - 1) * 0.5;
    }
    clientGradients.push(grads);
  }
  console.log(`[2/6] Generated synthetic gradients for ${NUM_CLIENTS} clients`);

  const t = Number(PLAINTEXT_MODULUS);
  const expectedAvg = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    let sum = 0;
    for (let c = 0; c < NUM_CLIENTS; c++) {
      const clamped = Math.max(-1, Math.min(1, clientGradients[c][i]));
      sum += clamped;
    }
    expectedAvg[i] = sum / NUM_CLIENTS;
  }
  console.log(
    `[3/6] Computed expected average (first 5): ${Array.from(expectedAvg.slice(0, 5)).map((v) => v.toFixed(4))}`,
  );

  const simulatedSum = new Array(GRADIENT_SIZE).fill(0n);
  for (let c = 0; c < NUM_CLIENTS; c++) {
    for (let i = 0; i < GRADIENT_SIZE; i++) {
      const clamped = Math.max(-1, Math.min(1, clientGradients[c][i]));
      let quantized = Math.round(clamped * SCALE_FACTOR);
      // AGENTS.MD: Negative Gradients — encode as t - |x|
      const encoded = quantized >= 0 ? BigInt(quantized) : BigInt(t) - BigInt(-quantized);
      simulatedSum[i] = (simulatedSum[i] + encoded) % BigInt(t);
    }
  }

  const recovered = new Float32Array(GRADIENT_SIZE);
  const halfT = BigInt(t) / 2n;
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    let val = simulatedSum[i];
    if (val > halfT) val = val - BigInt(t);
    recovered[i] = Number(val) / (NUM_CLIENTS * SCALE_FACTOR);
  }
  console.log(
    `[4/6] Simulated encrypted pipeline (first 5): ${Array.from(recovered.slice(0, 5)).map((v) => v.toFixed(4))}`,
  );

  let maxError = 0;
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    maxError = Math.max(maxError, Math.abs(recovered[i] - expectedAvg[i]));
  }
  // AGENTS.MD: precision bound is 1/S = 0.25 for S=4
  const precisionBound = 1 / SCALE_FACTOR;
  console.log(
    `[5/6] Max quantization error: ${maxError.toFixed(6)} (bound: ${precisionBound})`,
  );
  if (maxError > precisionBound) {
    console.error("ERROR: Quantization error exceeds precision bound!");
    process.exit(1);
  }

  const newWeights = new Float32Array(GRADIENT_SIZE);
  for (let i = 0; i < GRADIENT_SIZE; i++) {
    newWeights[i] = globalWeights[i] - LEARNING_RATE * recovered[i];
  }
  console.log(
    `[6/6] Updated weights (first 5): ${Array.from(newWeights.slice(0, 5)).map((v) => v.toFixed(4))}`,
  );

  console.log("\nWEFT FL round demo completed successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
