import init, { run_spike } from "./pkg/fhe_wasm_spike.js";

async function main() {
  await init();
  const result = run_spike();
  postMessage(result);
}

main().catch((error) => {
  postMessage(`worker-error: ${error instanceof Error ? error.message : String(error)}`);
});
