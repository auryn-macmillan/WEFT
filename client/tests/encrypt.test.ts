import { describe, expect, it } from "vitest";

import {
  dequantizeGradients,
  quantizeGradients,
  splitIntoChunks,
} from "../src/encrypt";
import { PLAINTEXT_MODULUS, validateOverflowInvariant } from "../src/constants";

function sumModulo(values: bigint[]): bigint {
  return values.reduce(
    (accumulator, value) =>
      ((accumulator + value) % PLAINTEXT_MODULUS + PLAINTEXT_MODULUS) % PLAINTEXT_MODULUS,
    0n,
  );
}

describe("quantizeGradients", () => {
  it("quantizes positive, negative, and clamped gradients", () => {
    const gradients = new Float32Array([0.5, -0.5, 2, -2, 0.26]);

    expect(quantizeGradients(gradients)).toEqual([2n, 98n, 4n, 96n, 1n]);
  });
});

describe("dequantizeGradients", () => {
  it("round-trips quantized gradients for a single client", () => {
    const gradients = new Float32Array([0.5, -0.5, 0.25, -0.25, 1]);

    const decoded = dequantizeGradients(quantizeGradients(gradients), 1);

    expect(Array.from(decoded)).toEqual([0.5, -0.5, 0.25, -0.25, 1]);
  });

  it("round-trips aggregated gradients across multiple clients", () => {
    const clientA = quantizeGradients(new Float32Array([0.25, -0.5]));
    const clientB = quantizeGradients(new Float32Array([0.5, 0.25]));
    const clientC = quantizeGradients(new Float32Array([-0.25, 0.75]));

    const summed = clientA.map((_, index) =>
      sumModulo([clientA[index], clientB[index], clientC[index]]),
    );
    const decoded = dequantizeGradients(summed, 3);

    expect(decoded[0]).toBeCloseTo(1 / 6, 6);
    expect(decoded[1]).toBeCloseTo(1 / 6, 6);
  });

  it("unwraps negative gradients before dequantization", () => {
    const decoded = dequantizeGradients(quantizeGradients(new Float32Array([-0.5])), 1);

    expect(decoded[0]).toBeCloseTo(-0.5, 6);
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
  it("passes for valid parameters", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 10)).not.toThrow();
  });

  it("throws for invalid parameters", () => {
    expect(() => validateOverflowInvariant(PLAINTEXT_MODULUS, 13)).toThrow(
      /Overflow safety invariant violated/,
    );
  });
});
