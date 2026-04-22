const output = document.getElementById("output");
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

worker.addEventListener("message", (event) => {
  output.textContent = event.data;
});

worker.addEventListener("error", (event) => {
  output.textContent = `worker-error: ${event.message}`;
});
