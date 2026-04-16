import { describe, expect, it } from "vitest";

import {
  dequantizeGradients,
  encodeCoefficient,
  decodeCoefficient,
  quantizeGradients,
  splitIntoChunks,
} from "../src/encrypt";
import {
  PLAINTEXT_MODULUS,
  SCALE_FACTOR,
  MAX_GRAD_INT,
  validateOverflowInvariant,
} from "../src/constants";

function simulateHomomorphicSum(clientCoefficients: bigint[][]): bigint[] {
  const len = clientCoefficients[0].length;
  const sums = new Array<bigint>(len).fill(0n);
  for (const coeffs of clientCoefficients) {
    for (let i = 0; i < len; i++) {
      // Sum mod t to simulate BFV addition
      sums[i] = (sums[i] + coeffs[i]) % PLAINTEXT_MODULUS;
    }
  }
  return sums;
}

describe("encodeCoefficient", () => {
  it("encodes positive integer as-is", () => {
    expect(encodeCoefficient(2048)).toBe(2048n);
  });

  it("encodes negative integer as t - |x|", () => {
    expect(encodeCoefficient(-2048)).toBe(PLAINTEXT_MODULUS - 2048n);
  });

  it("encodes zero as 0", () => {
    expect(encodeCoefficient(0)).toBe(0n);
  });
});

describe("decodeCoefficient", () => {
  it("decodes small value as positive", () => {
    expect(decodeCoefficient(2048n)).toBe(2048);
  });

  it("decodes value > t/2 as negative", () => {
    expect(decodeCoefficient(PLAINTEXT_MODULUS - 2048n)).toBe(-2048);
  });

  it("round-trips encode/decode", () => {
    for (const val of [0, 1, -1, 4096, -4096, 100, -100]) {
      expect(decodeCoefficient(encodeCoefficient(val))).toBe(val);
    }
  });
});

describe("quantizeGradients", () => {
  it("produces one coefficient per gradient", () => {
    const gradients = new Float32Array([0.5, -0.3]);
    const coefficients = quantizeGradients(gradients);
    expect(coefficients.length).toBe(2);
  });

  it("encodes positive gradient correctly", () => {
    const coefficients = quantizeGradients(new Float32Array([0.5]));
    // 0.5 * 4096 = 2048 → positive → 2048n
    expect(coefficients[0]).toBe(2048n);
  });

  it("encodes negative gradient as two's complement", () => {
    const coefficients = quantizeGradients(new Float32Array([-0.5]));
    // -0.5 * 4096 = -2048 → t - 2048
    expect(coefficients[0]).toBe(PLAINTEXT_MODULUS - 2048n);
  });

  it("clamps gradients beyond [-G, G]", () => {
    const over = quantizeGradients(new Float32Array([5.0]));
    const max = quantizeGradients(new Float32Array([1.0]));
    expect(over[0]).toBe(max[0]);
  });
});

describe("dequantizeGradients", () => {
  it("round-trips quantized gradients for a single client", () => {
    const gradients = new Float32Array([0.5, -0.5, 0.25, -0.25, 1.0]);
    const coefficients = quantizeGradients(gradients);
    const decoded = dequantizeGradients(coefficients, 1);

    for (let i = 0; i < gradients.length; i++) {
      expect(decoded[i]).toBeCloseTo(gradients[i], 3);
    }
  });

  it("round-trips aggregated gradients across multiple clients", () => {
    const clientA = quantizeGradients(new Float32Array([0.25, -0.5]));
    const clientB = quantizeGradients(new Float32Array([0.5, 0.25]));
    const clientC = quantizeGradients(new Float32Array([-0.25, 0.75]));

    const summed = simulateHomomorphicSum([clientA, clientB, clientC]);
    const decoded = dequantizeGradients(summed, 3);

    // (0.25 + 0.5 + -0.25) / 3 ≈ 0.16667
    expect(decoded[0]).toBeCloseTo(1 / 6, 3);
    // (-0.5 + 0.25 + 0.75) / 3 ≈ 0.16667
    expect(decoded[1]).toBeCloseTo(1 / 6, 3);
  });

  it("recovers negative averages correctly", () => {
    const clientA = quantizeGradients(new Float32Array([-0.5]));
    const clientB = quantizeGradients(new Float32Array([-0.5]));
    const clientC = quantizeGradients(new Float32Array([-0.5]));

    const summed = simulateHomomorphicSum([clientA, clientB, clientC]);
    const decoded = dequantizeGradients(summed, 3);

    expect(decoded[0]).toBeCloseTo(-0.5, 3);
  });
});

describe("splitIntoChunks", () => {
  it("splits into fixed-size chunks and pads the final chunk", () => {
    expect(splitIntoChunks([1n, 2n, 3n, 4n, 5n], 4)).toEqual([
      [1n, 2n, 3n, 4n],
      [5n, 0n, 0n, 0n],
    ]);
  });
});

describe("validateOverflowInvariant", () => {
  it("passes when numClients × MAX_GRAD_INT < t/2", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 10)).not.toThrow();
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 15)).not.toThrow();
  });

  it("throws when numClients × MAX_GRAD_INT >= t/2", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 16)).toThrow(
      /Overflow invariant violated/,
    );
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 100)).toThrow(
      /Overflow invariant violated/,
    );
  });
});
