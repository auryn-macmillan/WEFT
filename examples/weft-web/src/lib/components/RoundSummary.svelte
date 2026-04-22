<script lang="ts">
  export let averaged: number[];
  export let nHospitals: number;
  export let roundDurationMs: number | undefined = undefined;

  $: gradientMagnitude = Math.sqrt(averaged.reduce((sum, val) => sum + val * val, 0));
  $: formattedMagnitude = gradientMagnitude.toFixed(4);
  $: durationSecs = roundDurationMs ? (roundDurationMs / 1000).toFixed(1) : undefined;
</script>

<div class="round-summary">
  <div class="header">
    <h3>Round Complete</h3>
    {#if durationSecs}
      <span class="duration">Completed in {durationSecs}s</span>
    {/if}
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <span class="stat-label">Hospitals Participated</span>
      <span class="stat-value">{nHospitals}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Gradient Magnitude</span>
      <span class="stat-value">{formattedMagnitude}</span>
    </div>
    <div class="stat-card">
      <span class="stat-label">Data Leaked</span>
      <span class="stat-value highlight">0 bytes</span>
    </div>
  </div>

  <div class="honest-framing">
    <div class="icon">ℹ️</div>
    <p>
      <strong>What really happened?</strong> The encryption, threshold decryption, and homomorphic operations you saw were executed via simulated local workers. Real participant data would remain private in production. The ML "update" here is an illustrative visualization of the computed average gradient.
    </p>
  </div>
</div>

<style>
  .round-summary {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  h3 {
    margin: 0;
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-muted);
  }

  .duration {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    background-color: var(--color-primary);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
  }

  .stat-card {
    background-color: var(--color-primary);
    border-radius: var(--radius-md);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .stat-label {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .stat-value {
    font-size: var(--text-3xl);
    font-weight: 700;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .stat-value.highlight {
    color: var(--color-success);
  }

  .honest-framing {
    display: flex;
    gap: var(--space-3);
    background-color: color-mix(in srgb, var(--color-info) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-info) 30%, transparent);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    align-items: flex-start;
  }

  .icon {
    font-size: var(--text-xl);
    line-height: 1;
  }

  .honest-framing p {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    line-height: var(--leading-relaxed);
  }

  strong {
    color: var(--color-text-muted);
  }
</style>