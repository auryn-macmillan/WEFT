<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { PLAINTEXT_MODULUS } from '$lib/crypto/mock';

  export let clientCount = 3;
  export let scaleFactor = 4096;
  export let committeeSize = 5;
  export let threshold = 3;
  export let vectorSize = 256;
  export let isRunning = false;

  const dispatch = createEventDispatcher<{ runRound: void }>();
  $: maxClients = Math.floor((Number(PLAINTEXT_MODULUS) / 2 - 1) / scaleFactor);
  $: isOverflow = clientCount > maxClients;

  const topologies = [
    { t: 2, n: 2, label: '2-of-2' },
    { t: 2, n: 3, label: '2-of-3' },
    { t: 3, n: 5, label: '3-of-5' },
    { t: 4, n: 7, label: '4-of-7' },
  ];

  let selectedTopology = '3,5';
  $: {
    const [t, n] = selectedTopology.split(',').map(Number);
    threshold = t;
    committeeSize = n;
  }

  function applyPreset(preset: 'default' | 'stress' | 'high_prec') {
    if (preset === 'default') {
      clientCount = 3;
      scaleFactor = 4096;
      selectedTopology = '3,5';
      vectorSize = 256;
    } else if (preset === 'stress') {
      clientCount = 10;
      scaleFactor = 4096;
      selectedTopology = '3,5';
      vectorSize = 512;
    } else if (preset === 'high_prec') {
      clientCount = 3;
      scaleFactor = 16384;
      selectedTopology = '4,7';
      vectorSize = 256;
    }
  }
</script>

<div class="controls-panel">
  <div class="presets">
    <button on:click={() => applyPreset('default')}>Default demo</button>
    <button on:click={() => applyPreset('stress')}>Stress test (10 clients)</button>
    <button on:click={() => applyPreset('high_prec')}>High precision (S=16384)</button>
  </div>

  <div class="control-group">
    <label for="client-count">
      Client Count (2-10): <span class="value-display">{clientCount}</span>
    </label>
    <input 
      id="client-count"
      type="range" 
      min="2" 
      max="10" 
      bind:value={clientCount} 
      data-testid="client-count" 
    />
  </div>

  <div class="control-group">
    <label for="scale-factor">Scale Factor (S)</label>
    <select id="scale-factor" bind:value={scaleFactor} data-testid="scale-factor">
      <option value={1024}>1024 (2^10)</option>
      <option value={4096}>4096 (2^12)</option>
      <option value={16384}>16384 (2^14)</option>
    </select>
  </div>

  <div class="control-group">
    <label for="topology">Committee Topology</label>
    <select id="topology" bind:value={selectedTopology} data-testid="threshold">
      {#each topologies as top}
        <option value="{top.t},{top.n}">{top.label}</option>
      {/each}
    </select>
  </div>

  <div class="control-group">
    <label for="vector-size">Vector Size</label>
    <select id="vector-size" bind:value={vectorSize} data-testid="vector-size">
      <option value={64}>64 floats</option>
      <option value={256}>256 floats</option>
      <option value={512}>512 floats</option>
    </select>
  </div>

  <div class="invariant-check" class:error={isOverflow}>
    <strong>Constraint Indicator:</strong>
    {#if isOverflow}
      <span class="error-text" title="numClients × scaleFactor × maxGradAbs &ge; t/2">
        Overflow risk! Max allowed clients for S={scaleFactor} is {maxClients}.
      </span>
    {:else}
      <span class="safe-text">Safe (max {maxClients} clients)</span>
    {/if}
  </div>

  <button 
    class="run-button"
    disabled={isOverflow || isRunning} 
    on:click={() => dispatch('runRound')}
    data-testid="run-round"
    title={isOverflow ? "Overflow invariant violated: decrease clients or scale factor" : ""}
  >
    {isRunning ? 'Running...' : 'Run round'}
  </button>
</div>

<style>
  .controls-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-6, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-5, 20px);
  }

  .presets {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
    margin-bottom: var(--space-2, 8px);
  }

  .presets button {
    background-color: var(--color-border);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 4px);
    padding: var(--space-2, 8px) var(--space-4, 16px);
    font-size: var(--text-sm, 14px);
    cursor: pointer;
    transition: background-color var(--duration-fast, 100ms) var(--ease-out, ease-out);
  }

  .presets button:hover {
    background-color: var(--color-border);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  label {
    font-size: var(--text-sm, 14px);
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .value-display {
    color: var(--color-primary);
  }

  input[type="range"] {
    width: 100%;
    accent-color: var(--color-primary);
  }

  select {
    background-color: var(--color-secondary);
    color: var(--color-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 4px);
    padding: var(--space-2, 8px);
    font-size: var(--text-base, 16px);
  }

  .invariant-check {
    font-size: var(--text-sm, 14px);
    padding: var(--space-3, 12px);
    border-radius: var(--radius-sm, 4px);
    background-color: color-mix(in srgb, var(--color-success) 10%, transparent);
    color: var(--color-success);
    border: 1px solid color-mix(in srgb, var(--color-success) 30%, transparent);
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
  }

  .invariant-check.error {
    background-color: color-mix(in srgb, var(--color-danger) 10%, transparent);
    color: var(--color-danger);
    border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
  }

  .run-button {
    background-color: var(--color-primary);
    color: var(--color-secondary);
    font-weight: 700;
    font-size: var(--text-lg, 18px);
    padding: var(--space-3, 12px);
    border: none;
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition: opacity var(--duration-fast, 100ms) var(--ease-out, ease-out);
    margin-top: var(--space-2, 8px);
  }

  .run-button:hover:not(:disabled) {
    opacity: 0.9;
  }

  .run-button:disabled {
    background-color: var(--color-border);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }
</style>
