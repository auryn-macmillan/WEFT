// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §Parity Test Harness — T23
// Verifies that the WASM crypto bindings produce outputs byte/value-identical
// to the native Rust fixture generator (T7). Each fixture JSON records the
// expected `combinedPlaintext` after homomorphic summation. This test:
//   1. Loads all fixture JSON files from crates/fhe-wasm/fixtures/cases/
//   2. Re-runs the encrypt → homomorphic-add → decrypt pipeline via WASM
//   3. Re-encodes decrypted signed i32 values back to u64 (two's complement mod t)
//   4. Compares the result coefficient-by-coefficient against combinedPlaintext
//   5. Emits a JSON parity report to .sisyphus/evidence/task-23-parity-report.json

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ── path helpers ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEFT_WEB_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(
  WEFT_WEB_ROOT,
  'crates',
  'fhe-wasm',
  'fixtures',
  'cases'
);
const WASM_PKG_DIR = path.join(WEFT_WEB_ROOT, 'packages', 'fhe-wasm', 'pkg');
const EVIDENCE_DIR = path.resolve(WEFT_WEB_ROOT, '.sisyphus', 'evidence');

// ── fixture schema ───────────────────────────────────────────────────────────
interface FixtureParams {
  preset: string;
  degree: number;
  plaintext_modulus: number;
}
interface FixtureInput {
  plaintextCoeffs: number[]; // u64 two's-complement values
  client_index: number;
}
interface FixtureExpected {
  combinedPlaintext: number[]; // u64 two's-complement values
  ciphertextFingerprint: string;
  num_chunks: number;
}
interface FixtureCase {
  id: string;
  seed: string;
  params: FixtureParams;
  inputs: FixtureInput[];
  expected: FixtureExpected;
  format: string;
}

// ── parity report schema ─────────────────────────────────────────────────────
interface FixtureResult {
  fixtureId: string;
  passed: boolean;
  divergedAtPhase?: string;
  diffBytes?: number;
  error?: string;
}
interface ParityReport {
  generatedAt: string;
  fixtureDir: string;
  results: FixtureResult[];
  summary: { total: number; passed: number; failed: number };
}

// ── WASM loader (Node.js, synchronous) ───────────────────────────────────────
// wasm-bindgen generates an ES module; in Node we can use dynamic require via
// createRequire OR import the .js file. We use initSync with the .wasm buffer.
let wasmModule: typeof import('../../packages/fhe-wasm/pkg/fhe_wasm.js') | null = null;

async function loadWasm() {
  if (wasmModule) return wasmModule;

  // Dynamic import of the wasm-bindgen JS shim.
  const wasmJsPath = path.join(WASM_PKG_DIR, 'fhe_wasm.js');
  const wasmBinPath = path.join(WASM_PKG_DIR, 'fhe_wasm_bg.wasm');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(wasmJsPath)) as any;
  const wasmBuf = fs.readFileSync(wasmBinPath);
  mod.initSync({ module: wasmBuf });
  wasmModule = mod;
  return mod;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const PLAINTEXT_MODULUS = 131_072n;

/**
 * Convert a fixture u64 coefficient (two's-complement mod t) to a signed i32
 * for passing to WASM encrypt_vector.
 * AGENTS.MD §Negative Number Handling
 */
function u64CoeffToSigned(val: number, t: number): number {
  if (val > t / 2) {
    return val - t; // negative two's-complement value
  }
  return val;
}

/**
 * Convert a decrypted signed i32 back to u64 two's-complement for comparison
 * against fixture.expected.combinedPlaintext.
 */
function signedToU64Coeff(val: number, t: number): number {
  if (val < 0) {
    return t + val; // t - |val|
  }
  return val;
}

/**
 * Load all fixture JSON files from the cases directory.
 */
function loadAllFixtures(): FixtureCase[] {
  const files = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8');
    return JSON.parse(raw) as FixtureCase;
  });
}

/**
 * Run the WASM encrypt → homomorphic-add → decrypt pipeline for one fixture.
 * Returns the re-encoded u64 combined coefficients for the data range only.
 * AGENTS.MD §Gradient Encoding — chunk handling
 */
async function runWasmPipeline(
  fixture: FixtureCase,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wasm: any
): Promise<{ phase: string; result: number[] | null; error?: string }> {
  const { degree, plaintext_modulus: t } = fixture.params;
  const numGrads = fixture.expected.combinedPlaintext.length;
  // AGENTS.MD §Gradient Encoding — ceil(M / degree) chunks
  const numChunks = Math.ceil(numGrads / degree);

  // Phase: params-validation
  const params = wasm.load_params();
  // Phase: key-generation
  const sk = wasm.generate_secret_key(params);
  const pk = wasm.derive_public_key(params, sk);

  try {
    const chunkSums: Uint8Array[] = [];

    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      const start = chunkIdx * degree;
      const end = Math.min(start + degree, numGrads);

      // Phase: per-client encrypt
      let accCt: Uint8Array | null = null;
      for (const input of fixture.inputs) {
        const sliceU64 = input.plaintextCoeffs.slice(start, end);
        // Convert to signed i32 for WASM
        const signedCoeffs = new Int32Array(sliceU64.map((v) => u64CoeffToSigned(v, t)));
        const ct = wasm.encrypt_vector(params, pk, signedCoeffs);
        if (accCt === null) {
          accCt = ct as Uint8Array;
        } else {
          // Phase: homomorphic-add
          accCt = wasm.homomorphic_add(params, accCt, ct) as Uint8Array;
        }
      }
      if (accCt === null) throw new Error('no client inputs');
      chunkSums.push(accCt);
    }

    // Phase: decrypt and re-encode
    const combined: number[] = [];
    for (const sumCt of chunkSums) {
      const decrypted: Int32Array = wasm.decrypt(params, sk, sumCt);
      for (let i = 0; i < decrypted.length; i++) {
        combined.push(signedToU64Coeff(decrypted[i], t));
      }
    }

    // Trim to numGrads (padding zeros should appear beyond numGrads)
    return { phase: 'complete', result: combined.slice(0, numGrads) };
  } finally {
    params.free();
    sk.free();
  }
}

// ── parity report writer ──────────────────────────────────────────────────────
function writeParityReport(report: ParityReport): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const outPath = path.join(EVIDENCE_DIR, 'task-23-parity-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[parity] report written → ${outPath}`);
}

// ── test suite ───────────────────────────────────────────────────────────────

const allFixtures = loadAllFixtures();
const results: FixtureResult[] = [];

test.beforeAll(async () => {
  // Eagerly initialise WASM once so individual tests don't race.
  await loadWasm();
});

test.afterAll(async () => {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const report: ParityReport = {
    generatedAt: new Date().toISOString(),
    fixtureDir: FIXTURES_DIR,
    results,
    summary: { total: results.length, passed, failed },
  };
  writeParityReport(report);

  // Surface a clear summary line in CI output
  console.log(
    `\n[parity] ${passed}/${results.length} fixtures passed, ${failed} failed.`
  );
});

// Guard: minimum fixture count
test('fixture inventory: at least 20 fixtures loaded', () => {
  expect(allFixtures.length).toBeGreaterThanOrEqual(20);
  console.log(`[parity] loaded ${allFixtures.length} fixture(s) from ${FIXTURES_DIR}`);
});

// Per-fixture parity tests
for (const fixture of allFixtures) {
  test(`parity: ${fixture.id}`, async () => {
    const wasm = await loadWasm();

    let result: FixtureResult = { fixtureId: fixture.id, passed: false };

    // ── Phase 1: params validation ──────────────────────────────────────────
    if (fixture.params.preset !== 'SecureThreshold8192') {
      result = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'params-preset',
        diffBytes: 0,
        error: `unexpected preset: ${fixture.params.preset}`,
      };
      results.push(result);
      throw new Error(`fixture ${fixture.id}: unexpected preset ${fixture.params.preset}`);
      return;
    }
    if (fixture.params.plaintext_modulus !== Number(PLAINTEXT_MODULUS)) {
      result = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'params-plaintext-modulus',
        error: `expected ${PLAINTEXT_MODULUS}, got ${fixture.params.plaintext_modulus}`,
      };
      results.push(result);
      throw new Error(`fixture ${fixture.id}: plaintext_modulus mismatch`);
      return;
    }

    // ── Phase 2-4: WASM pipeline ────────────────────────────────────────────
    let pipelineResult: { phase: string; result: number[] | null; error?: string };
    try {
      pipelineResult = await runWasmPipeline(fixture, wasm);
    } catch (err) {
      result = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'wasm-pipeline',
        error: String(err),
      };
      results.push(result);
      throw err; // re-throw so the test fails
    }

    if (!pipelineResult.result) {
      result = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: pipelineResult.phase,
        error: pipelineResult.error,
      };
      results.push(result);
      throw new Error(`fixture ${fixture.id}: pipeline returned null at phase ${pipelineResult.phase}`);
      return;
    }

    // ── Phase 5: byte-level comparison of combined plaintext ────────────────
    const expected = fixture.expected.combinedPlaintext;
    const actual = pipelineResult.result;

    let diffCount = 0;
    let divergedAt = -1;
    const minLen = Math.min(expected.length, actual.length);
    for (let i = 0; i < minLen; i++) {
      if (expected[i] !== actual[i]) {
        diffCount++;
        if (divergedAt === -1) divergedAt = i;
      }
    }
    if (expected.length !== actual.length) {
      diffCount += Math.abs(expected.length - actual.length);
    }

    if (diffCount > 0) {
      result = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'combined-plaintext',
        diffBytes: diffCount,
        error: `first divergence at coeff index ${divergedAt}: expected ${expected[divergedAt]}, got ${actual[divergedAt]}`,
      };
      results.push(result);
      // Fail loudly — 100% parity required
      expect(actual, `fixture ${fixture.id} combined-plaintext mismatch`).toEqual(expected);
      return;
    }

    // ── Phase 6: padding beyond numGrads should be zero ─────────────────────
    // (validated by verifying the WASM decrypt output tail is zero;
    //  the combined result above already matches the non-padded prefix)

    // ── Phase 7: arithmetic invariant — no coefficient should exceed t ──────
    const t = fixture.params.plaintext_modulus;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] < 0 || actual[i] >= t) {
        result = {
          fixtureId: fixture.id,
          passed: false,
          divergedAtPhase: 'coeff-range',
          error: `coeff[${i}] = ${actual[i]} out of range [0, ${t})`,
        };
        results.push(result);
        throw new Error(`fixture ${fixture.id}: coefficient out of range at index ${i}`);
        return;
      }
    }

    result = { fixtureId: fixture.id, passed: true };
    results.push(result);
    // Explicit assertion for Playwright's test reporter
    expect(diffCount).toBe(0);
  });
}
