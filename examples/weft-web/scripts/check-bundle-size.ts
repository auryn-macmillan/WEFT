// SPDX-License-Identifier: LGPL-3.0-only
// AGENTS.MD §T26 — bundle size budget enforcement
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const BUDGET_INITIAL_JS_CSS_GZIP = 400 * 1024;
const BUDGET_WASM_GZIP = 8 * 1024 * 1024;
const BUDGET_SINGLE_CHUNK_UNCOMPRESSED = 1 * 1024 * 1024;

const buildDir = join(fileURLToPath(new URL('..', import.meta.url)), 'build');

interface FileEntry {
  path: string;
  name: string;
  uncompressed: number;
  gzip: number;
}

function walk(dir: string): string[] {
  const entries: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...walk(full));
    } else {
      entries.push(full);
    }
  }
  return entries;
}

function measure(filePath: string): FileEntry {
  const buf = readFileSync(filePath);
  const gz = gzipSync(buf);
  return {
    path: filePath,
    name: filePath.replace(buildDir + '/', ''),
    uncompressed: buf.byteLength,
    gzip: gz.byteLength,
  };
}

const allFiles = walk(buildDir).map(measure);

const jsAndCss = allFiles.filter((f) => {
  const ext = extname(f.name);
  return ext === '.js' || ext === '.css';
});

const wasmFiles = allFiles.filter((f) => extname(f.name) === '.wasm');

const totalJsCssGzip = jsAndCss.reduce((s, f) => s + f.gzip, 0);
const totalWasmGzip = wasmFiles.reduce((s, f) => s + f.gzip, 0);

const failures: string[] = [];

if (totalJsCssGzip > BUDGET_INITIAL_JS_CSS_GZIP) {
  failures.push(
    `Budget exceeded: initial JS+CSS gzip ${(totalJsCssGzip / 1024).toFixed(1)}KB > ${BUDGET_INITIAL_JS_CSS_GZIP / 1024}KB`
  );
}

if (totalWasmGzip > BUDGET_WASM_GZIP) {
  failures.push(
    `Budget exceeded: WASM total gzip ${(totalWasmGzip / 1024 / 1024).toFixed(2)}MB > ${BUDGET_WASM_GZIP / 1024 / 1024}MB`
  );
}

for (const f of jsAndCss) {
  if (f.uncompressed > BUDGET_SINGLE_CHUNK_UNCOMPRESSED) {
    failures.push(
      `Budget exceeded: ${f.name} ${(f.uncompressed / 1024).toFixed(1)}KB > ${BUDGET_SINGLE_CHUNK_UNCOMPRESSED / 1024}KB uncompressed`
    );
  }
}

console.log(`\nBundle size report`);
console.log(`==================`);
console.log(`JS+CSS gzip total : ${(totalJsCssGzip / 1024).toFixed(1)} KB  (budget: ${BUDGET_INITIAL_JS_CSS_GZIP / 1024} KB)`);
console.log(`WASM gzip total   : ${(totalWasmGzip / 1024 / 1024).toFixed(2)} MB  (budget: ${BUDGET_WASM_GZIP / 1024 / 1024} MB)`);
console.log(`\nTop JS/CSS chunks (uncompressed):`);
const sorted = [...jsAndCss].sort((a, b) => b.uncompressed - a.uncompressed).slice(0, 10);
for (const f of sorted) {
  const flag = f.uncompressed > BUDGET_SINGLE_CHUNK_UNCOMPRESSED ? ' ❌ OVER BUDGET' : '';
  console.log(`  ${(f.uncompressed / 1024).toFixed(1).padStart(7)} KB  ${f.name}${flag}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} budget violation(s):`);
  for (const msg of failures) {
    console.error(`  ✗ ${msg}`);
  }
  process.exit(1);
} else {
  console.log('\n✓ All bundle budgets pass');
}
