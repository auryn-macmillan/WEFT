<script lang="ts">
  import { scale, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  export let id: string;
  export let byteCount: number;
  export let status: 'pending' | 'in-flight' | 'arrived' | 'aggregated';

  // Create deterministic noise appearance based on ID
  $: seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Create a randomized but deterministic background pattern
  $: bgPattern = `
    radial-gradient(circle at ${seed % 100}% ${(seed * 7) % 100}%, var(--color-text-muted) 1px, transparent 1px),
    radial-gradient(circle at ${(seed * 13) % 100}% ${(seed * 17) % 100}%, var(--color-border) 1px, transparent 1px),
    radial-gradient(circle at ${(seed * 23) % 100}% ${(seed * 29) % 100}%, var(--color-surface) 1px, transparent 1px)
  `;
  $: bgSize = `${(seed % 20) + 20}px ${(seed % 20) + 20}px`;

  // Provide animation duration through a readable constant referencing tokens
  const duration = 400; // Matches var(--duration-slow) generally
</script>

<div 
  class="ciphertext-tile status-{status}"
  in:scale={{ duration, easing: cubicOut, start: 0.95 }}
  out:fade={{ duration: 200 }}
>
  <div 
    class="noise-layer" 
    style="background-image: {bgPattern}; background-size: {bgSize};"
  ></div>
  <div class="content">
    <div class="header">
      <span class="id" aria-hidden="true">#{id.slice(0, 6)}</span>
      <span class="status-indicator"></span>
    </div>
    <div class="body">
      <span class="byte-count">{byteCount.toLocaleString()}B</span>
      <span class="label">ENCRYPTED</span>
    </div>
  </div>
</div>

<style>
  .ciphertext-tile {
    position: relative;
    width: 100%;
    min-width: 140px;
    height: 80px;
    background-color: var(--color-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
    transition: transform var(--duration-base) var(--ease-out), 
                border-color var(--duration-base) var(--ease-out),
                box-shadow var(--duration-base) var(--ease-out);
  }

  .ciphertext-tile.status-in-flight {
    border-color: var(--color-info);
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.2);
    transform: translateY(-2px);
  }

  .ciphertext-tile.status-arrived {
    border-color: var(--color-primary);
  }

  .ciphertext-tile.status-aggregated {
    border-color: var(--color-phase-7); /* Using threshold-decrypt color for aggregated state */
    background-color: var(--color-surface);
  }

  .noise-layer {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0.4;
    mix-blend-mode: color-dodge;
    pointer-events: none;
    z-index: 1;
  }

  .content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100%;
    padding: var(--space-2) var(--space-3);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .id {
    font-weight: 700;
    letter-spacing: 0.05em;
  }

  .status-indicator {
    width: var(--space-2);
    height: var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-text-muted);
    transition: background-color var(--duration-base) var(--ease-out);
  }

  .status-pending .status-indicator {
    background-color: var(--color-text-muted);
  }

  .status-in-flight .status-indicator {
    background-color: var(--color-info);
    box-shadow: 0 0 8px var(--color-info);
  }

  .status-arrived .status-indicator {
    background-color: var(--color-primary);
  }

  .status-aggregated .status-indicator {
    background-color: var(--color-phase-7);
  }

  .body {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }

  .byte-count {
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .label {
    font-size: 10px;
    font-weight: 700;
    color: var(--color-secondary);
    letter-spacing: 0.1em;
    padding: 2px 4px;
    background-color: rgba(232, 111, 90, 0.15); /* Coral tint */
    border-radius: var(--radius-sm);
  }
</style>
