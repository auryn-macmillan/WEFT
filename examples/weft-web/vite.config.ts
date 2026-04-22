import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';
import { visualizer } from 'rollup-plugin-visualizer';

// AGENTS.MD §T26 — bundle visualizer; output path controlled by BUNDLE_STATS_OUT env var
const bundleStatsOut = process.env.BUNDLE_STATS_OUT ?? 'stats.html';

export default defineConfig({
  plugins: [
    sveltekit(),
    wasm(),
    topLevelAwait(),
    visualizer({
      filename: bundleStatsOut,
      gzipSize: true,
      brotliSize: false,
      open: false,
    }) as import('vite').Plugin,
  ],
  optimizeDeps: {
    exclude: ['@weft/fhe-wasm']
  }
});
