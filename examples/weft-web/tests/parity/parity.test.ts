// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §Parity Test Harness — T23

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEFT_WEB_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(WEFT_WEB_ROOT, 'crates', 'fhe-wasm', 'fixtures', 'cases');
const WASM_PKG_DIR = path.join(WEFT_WEB_ROOT, 'packages', 'fhe-wasm', 'pkg');
const EVIDENCE_DIR = path.resolve(WEFT_WEB_ROOT, '.sisyphus', 'evidence');

interface FixtureParams {
  preset: string;
  degree: number;
  plaintext_modulus: number;
}
interface FixtureInput {
  plaintextCoeffs: number[];
  client_index: number;
}
interface FixtureExpected {
  combinedPlaintext: number[];
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

type WasmBg = Record<string, unknown> & {
  __wbg_set_wasm: (exports: Record<string, unknown>) => void;
  load_params: () => { free(): void };
  generate_secret_key: (p: ReturnType<WasmBg['load_params']>) => { free(): void };
  derive_public_key: (p: ReturnType<WasmBg['load_params']>, sk: ReturnType<WasmBg['generate_secret_key']>) => Uint8Array;
  encrypt_vector: (p: ReturnType<WasmBg['load_params']>, pk: Uint8Array, pt: Int32Array) => Uint8Array;
  homomorphic_add: (p: ReturnType<WasmBg['load_params']>, a: Uint8Array, b: Uint8Array) => Uint8Array;
  decrypt: (p: ReturnType<WasmBg['load_params']>, sk: ReturnType<WasmBg['generate_secret_key']>, ct: Uint8Array) => Int32Array;
};

let bgMod: WasmBg | null = null;

async function loadWasm(): Promise<WasmBg> {
  if (bgMod) return bgMod;
  const bgJsPath = path.join(WASM_PKG_DIR, 'fhe_wasm_bg.js');
  const wasmBinPath = path.join(WASM_PKG_DIR, 'fhe_wasm_bg.wasm');
  const wasmBuf = fs.readFileSync(wasmBinPath);
  const mod = (await import(bgJsPath)) as WasmBg;
  const wasmModule = new WebAssembly.Module(wasmBuf.buffer as ArrayBuffer);
  const imports = WebAssembly.Module.imports(wasmModule);
  const importObj: Record<string, Record<string, unknown>> = {};
  for (const imp of imports) {
    if (!importObj[imp.module]) importObj[imp.module] = {};
    const fn = (mod as Record<string, unknown>)[imp.name];
    if (fn) importObj[imp.module][imp.name] = fn;
  }
  const instance = await WebAssembly.instantiate(wasmBuf.buffer as ArrayBuffer, importObj as WebAssembly.Imports);
  mod.__wbg_set_wasm(instance.instance.exports as Record<string, unknown>);
  bgMod = mod;
  return mod;
}

const PLAINTEXT_MODULUS = 131_072;

/**
 * AGENTS.MD §Negative Number Handling — two's complement mod t.
 * Fixture stores u64 where negative values are t - |x|; WASM needs signed i32.
 */
function u64CoeffToSigned(val: number, t: number): number {
  return val > t / 2 ? val - t : val;
}

/**
 * AGENTS.MD §Negative Number Handling — inverse of u64CoeffToSigned.
 * Re-encodes decrypted signed i32 back to u64 for comparison with fixture.
 */
function signedToU64Coeff(val: number, t: number): number {
  return val < 0 ? t + val : val;
}

function loadAllFixtures(): FixtureCase[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8')) as FixtureCase);
}

async function runWasmPipeline(fixture: FixtureCase, wasm: WasmBg): Promise<number[]> {
  const { degree, plaintext_modulus: t } = fixture.params;
  const numGrads = fixture.expected.combinedPlaintext.length;
  const numChunks = Math.ceil(numGrads / degree);

  const params = wasm.load_params();
  const sk = wasm.generate_secret_key(params);
  const pk = wasm.derive_public_key(params, sk);

  try {
    const combined: number[] = [];

    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      const start = chunkIdx * degree;
      const end = Math.min(start + degree, numGrads);

      let accCt: Uint8Array | null = null;
      for (const input of fixture.inputs) {
        const sliceU64 = input.plaintextCoeffs.slice(start, end);
        const signedCoeffs = new Int32Array(sliceU64.map((v) => u64CoeffToSigned(v, t)));
        const ct = wasm.encrypt_vector(params, pk, signedCoeffs);
        accCt = accCt === null ? ct : wasm.homomorphic_add(params, accCt, ct);
      }
      if (!accCt) throw new Error('no client inputs in fixture');

      const decrypted = wasm.decrypt(params, sk, accCt);
      for (let i = 0; i < decrypted.length; i++) {
        combined.push(signedToU64Coeff(decrypted[i], t));
      }
    }

    return combined.slice(0, numGrads);
  } finally {
    params.free();
    sk.free();
  }
}

function writeParityReport(report: ParityReport): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const outPath = path.join(EVIDENCE_DIR, 'task-23-parity-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[parity] report → ${outPath}`);
}

const allFixtures = loadAllFixtures();
const results: FixtureResult[] = [];

test.beforeAll(async () => {
  await loadWasm();
});

test.afterAll(() => {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  writeParityReport({
    generatedAt: new Date().toISOString(),
    fixtureDir: FIXTURES_DIR,
    results,
    summary: { total: results.length, passed, failed },
  });
  console.log(`[parity] ${passed}/${results.length} passed, ${failed} failed`);
});

test('fixture inventory: at least 20 fixtures loaded', () => {
  expect(allFixtures.length).toBeGreaterThanOrEqual(20);
  console.log(`[parity] ${allFixtures.length} fixture(s) from ${FIXTURES_DIR}`);
});

for (const fixture of allFixtures) {
  test(`parity: ${fixture.id}`, async () => {
    const wasm = await loadWasm();

    if (fixture.params.preset !== 'SecureThreshold8192') {
      const r: FixtureResult = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'params-preset',
        error: `unexpected preset: ${fixture.params.preset}`,
      };
      results.push(r);
      throw new Error(r.error!);
      return;
    }

    let actual: number[];
    try {
      actual = await runWasmPipeline(fixture, wasm);
    } catch (err) {
      const r: FixtureResult = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'wasm-pipeline',
        error: String(err),
      };
      results.push(r);
      throw err;
    }

    const expected = fixture.expected.combinedPlaintext;
    const t = fixture.params.plaintext_modulus;

    let diffCount = 0;
    let firstDivergenceIdx = -1;
    const minLen = Math.min(expected.length, actual.length);
    for (let i = 0; i < minLen; i++) {
      if (expected[i] !== actual[i]) {
        diffCount++;
        if (firstDivergenceIdx === -1) firstDivergenceIdx = i;
      }
    }
    diffCount += Math.abs(expected.length - actual.length);

    if (diffCount > 0) {
      const r: FixtureResult = {
        fixtureId: fixture.id,
        passed: false,
        divergedAtPhase: 'combined-plaintext',
        diffBytes: diffCount,
        error: `first divergence at coeff[${firstDivergenceIdx}]: expected ${expected[firstDivergenceIdx]}, got ${actual[firstDivergenceIdx]}`,
      };
      results.push(r);
      expect(actual, `fixture ${fixture.id} combined-plaintext mismatch`).toEqual(expected);
      return;
    }

    for (let i = 0; i < actual.length; i++) {
      if (actual[i] < 0 || actual[i] >= t) {
        const r: FixtureResult = {
          fixtureId: fixture.id,
          passed: false,
          divergedAtPhase: 'coeff-range',
          error: `coeff[${i}]=${actual[i]} out of [0,${t})`,
        };
        results.push(r);
        throw new Error(r.error!);
        return;
      }
    }

    results.push({ fixtureId: fixture.id, passed: true });
    expect(diffCount).toBe(0);
  });
}
