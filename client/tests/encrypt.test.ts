import { describe, expect, it } from "vitest";

import {
  dequantizeGradients,
  encodeBitplane,
  decodeBitplane,
  quantizeGradients,
  splitIntoChunks,
} from "../src/encrypt";
import {
  BITS_PER_GRADIENT,
  PLAINTEXT_MODULUS,
  SCALE_FACTOR,
  validateOverflowInvariant,
} from "../src/constants";

function simulateHomomorphicSum(clientCoefficients: bigint[][]): bigint[] {
  const len = clientCoefficients[0].length;
  const sums = new Array<bigint>(len).fill(0n);
  for (const coeffs of clientCoefficients) {
    for (let i = 0; i < len; i++) {
      sums[i] += coeffs[i];
    }
  }
  return sums;
}

describe("encodeBitplane", () => {
  it("encodes positive gradient into correct number of bits", () => {
    const bits = encodeBitplane(0.75);
    expect(bits.length).toBe(BITS_PER_GRADIENT);
    expect(bits.every((b) => b === 0 || b === 1)).toBe(true);
  });

  it("encodes zero gradient as the offset value", () => {
    const bits = encodeBitplane(0.0);
    // 0.0 → scaled=0 → unsigned=SCALE_FACTOR*1.0=4096 → binary of 4096
    let reconstructed = 0;
    for (let b = 0; b < bits.length; b++) {
      reconstructed += bits[b] * (1 << b);
    }
    expect(reconstructed).toBe(SCALE_FACTOR);
  });

  it("encodes -1.0 as unsigned 0 (all zero bits)", () => {
    const bits = encodeBitplane(-1.0);
    // -1.0 → scaled=-4096 → unsigned=0
    expect(bits.every((b) => b === 0)).toBe(true);
  });

  it("encodes +1.0 as unsigned 2*SCALE_FACTOR (maximum)", () => {
    const bits = encodeBitplane(1.0);
    // +1.0 → scaled=4096 → unsigned=8192
    let reconstructed = 0;
    for (let b = 0; b < bits.length; b++) {
      reconstructed += bits[b] * (1 << b);
    }
    expect(reconstructed).toBe(2 * SCALE_FACTOR);
  });

  it("clamps gradients beyond [-G, G]", () => {
    const bitsOver = encodeBitplane(5.0);
    const bitsMax = encodeBitplane(1.0);
    expect(bitsOver).toEqual(bitsMax);
  });
});

describe("decodeBitplane", () => {
  it("round-trips a single client gradient", () => {
    const original = 0.75;
    const bits = encodeBitplane(original);
    const tallies = bits; // single client: tally = bit value
    const decoded = decodeBitplane(tallies, 1);
    expect(decoded).toBeCloseTo(original, 3);
  });

  it("round-trips negative gradient", () => {
    const original = -0.5;
    const bits = encodeBitplane(original);
    const decoded = decodeBitplane(bits, 1);
    expect(decoded).toBeCloseTo(original, 3);
  });

  it("decodes zero correctly", () => {
    const bits = encodeBitplane(0.0);
    const decoded = decodeBitplane(bits, 1);
    expect(decoded).toBeCloseTo(0.0, 6);
  });
});

describe("quantizeGradients (bitplane)", () => {
  it("produces BITS_PER_GRADIENT coefficients per gradient", () => {
    const gradients = new Float32Array([0.5, -0.3]);
    const coefficients = quantizeGradients(gradients);
    expect(coefficients.length).toBe(2 * BITS_PER_GRADIENT);
    expect(coefficients.every((c) => c === 0n || c === 1n)).toBe(true);
  });
});

describe("dequantizeGradients (bitplane)", () => {
  it("round-trips quantized gradients for a single client", () => {
    const gradients = new Float32Array([0.5, -0.5, 0.25, -0.25, 1]);
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

describe("validateOverflowInvariant (bitplane)", () => {
  it("passes when numClients < t/2", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 10)).not.toThrow();
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 49)).not.toThrow();
  });

  it("throws when numClients >= t/2", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 50)).toThrow(
      /Bitplane overflow invariant violated/,
    );
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 100)).toThrow(
      /Bitplane overflow invariant violated/,
    );
  });
});
