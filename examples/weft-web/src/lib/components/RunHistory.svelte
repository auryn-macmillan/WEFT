<script lang="ts">
  export let runs: Array<{
    id: string;
    timestamp: number;
    clientCount: number;
    threshold: number;
    scaleFactor: number;
    vectorSize: number;
    magnitude: number;
    durationMs: number;
  }> = [];
</script>

<div class="history-panel">
  <h3>Recent Runs (Session)</h3>
  {#if runs.length === 0}
    <p class="empty-state">No runs yet. Run a round to see results here.</p>
  {:else}
    <ul class="runs-list">
      {#each runs as run (run.id)}
        <li class="run-item">
          <div class="run-header">
            <span class="time">{new Date(run.timestamp).toLocaleTimeString()}</span>
            <span class="duration">{(run.durationMs / 1000).toFixed(2)}s</span>
          </div>
          <div class="run-details">
            <span class="param">Clients: {run.clientCount}</span>
            <span class="param">S={run.scaleFactor}</span>
            <span class="param">Dim: {run.vectorSize}</span>
          </div>
          <div class="run-result">
            <span class="label">Magnitude:</span>
            <span class="value">{run.magnitude.toFixed(4)}</span>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .history-panel {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 16px);
    padding: var(--space-6, 24px);
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
    height: 100%;
  }

  h3 {
    margin: 0;
    font-size: var(--text-xl, 20px);
    color: var(--color-primary);
    font-weight: 700;
  }

  .empty-state {
    color: var(--color-text-muted);
    font-size: var(--text-sm, 14px);
    margin: 0;
    font-style: italic;
  }

  .runs-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    overflow-y: auto;
  }

  .run-item {
    background-color: var(--color-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-3, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .run-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: var(--text-xs, 12px);
    color: var(--color-text-muted);
  }

  .run-details {
    display: flex;
    gap: var(--space-3, 12px);
    font-size: var(--text-sm, 14px);
    color: var(--color-text-muted);
    flex-wrap: wrap;
  }

  .param {
    background-color: var(--color-surface);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    border-radius: var(--radius-sm, 4px);
  }

  .run-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--space-1, 4px);
    padding-top: var(--space-2, 8px);
    border-top: 1px dashed var(--color-border);
  }

  .run-result .label {
    font-size: var(--text-sm, 14px);
    color: var(--color-text-muted);
  }

  .run-result .value {
    font-size: var(--text-lg, 18px);
    font-family: var(--font-mono, monospace);
    font-weight: 700;
    color: var(--color-primary);
  }
</style>
