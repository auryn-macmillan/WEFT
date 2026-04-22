## [2026-04-22] SvelteKit scaffold
- `app.html` must live under `src/` for SvelteKit 2.x; placing it at the project root breaks `svelte-kit sync`.
- `kit.strict` is not a valid config option in current SvelteKit; remove it to avoid config errors.
- `vite.config.ts` should only hold Vite plugins and dependency exclusions; Vitest config belongs in `vitest.config.ts` to keep `svelte-check` happy.
- Matching Vite versions across workspace packages matters; mixed Vite 5/6 types caused `svelte-check` failures until aligned.
