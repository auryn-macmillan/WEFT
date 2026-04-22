# Decisions — weft-web-app-demo

## [2026-04-22] SvelteKit scaffold
- Chose `@sveltejs/adapter-static` with `fallback: 'index.html'` so the app can deploy to GitHub Pages as a static site.
- Used `BASE_PATH` to drive `kit.paths.base`; empty string remains the local default, while `/weft` is used for GH Pages builds.
- Kept the landing page intentionally placeholder-only per task scope.
