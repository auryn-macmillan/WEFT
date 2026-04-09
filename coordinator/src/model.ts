export function applyGradientUpdate(
  weights: Float32Array,
  gradients: Float32Array,
  learningRate: number = 0.01,
): Float32Array {
  if (weights.length !== gradients.length) {
    throw new Error(
      `Weights/gradients length mismatch: ${weights.length} !== ${gradients.length}`,
    );
  }

  const newWeights = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i++) {
    newWeights[i] = weights[i] - learningRate * gradients[i];
  }
  return newWeights;
}
