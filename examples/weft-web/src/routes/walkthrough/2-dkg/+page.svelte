<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { phaseStore } from '$lib/stores/phase';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import { engine } from '$lib/crypto';
  import type { DkgTranscript } from '$lib/crypto';

  onMount(() => {
    phaseStore.markVisited('dkg');
    phaseStore.advancePhase('dkg');
  });

  const committeeNodes = [
    'Node Alpha',
    'Node Beta',
    'Node Gamma',
    'Node Delta',
    'Node Epsilon'
  ];

  let isGenerating = false;
  let dkgTranscript: DkgTranscript | null = null;
  let error: string | null = null;

  async function handleGenerateKey() {
    isGenerating = true;
    error = null;
    dkgTranscript = null;

    try {
      // 5 committee members, threshold of 3
      dkgTranscript = await engine.runDkg(5, 3);
    } catch (err: any) {
      error = err.message || 'Failed to generate keys';
    } finally {
      isGenerating = false;
    }
  }

  function previewHex(bytes: Uint8Array): string {
    return Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
  }
</script>

<PhaseShell phaseId="dkg" onNext={dkgTranscript ? () => goto(`${base}/walkthrough/3-shares`) : undefined} onPrev={() => goto(`${base}/walkthrough/1-meet`)}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
    </div>
    <div class="content-grid">
      <section class="action-section">
        {#if !isGenerating && !dkgTranscript}
          <div class="instructions">
            <p>Click below to simulate the Distributed Key Generation protocol.</p>
            <button class="btn btn-primary generate-btn" on:click={handleGenerateKey}>
              Generate Keys
            </button>
          </div>
        {/if}

        {#if isGenerating}
          <div class="generating-state">
            <div class="spinner"></div>
            <p>Running Distributed Key Generation...</p>
          </div>
        {/if}

        {#if dkgTranscript}
          <div class="success-state" data-testid="dkg-complete">
            <h3>DKG Complete</h3>
            <p>Aggregate Public Key Preview:</p>
            <div class="key-preview">
              0x{previewHex(dkgTranscript.publicKey.bytes)}...
            </div>
            <p class="subtitle">This key is public and shared with all hospitals. Only the committee threshold can decrypt data encrypted with it.</p>
          </div>
        {/if}
        
        {#if error}
          <div class="error-state">
            <p>Error: {error}</p>
          </div>
        {/if}
      </section>

      <section class="committee-section">
        <h2>Committee Shards</h2>
        <div class="cards-container">
          {#each committeeNodes as node, i}
            <div class="card committee-card" class:glowing={isGenerating} class:has-shard={!!dkgTranscript}>
              <div class="node-name">{node}</div>
              <div class="shard-status">
                {#if isGenerating}
                  Generating...
                {:else if dkgTranscript}
                  <span class="shard-bytes">{dkgTranscript.perPartyShares[i].bytes.length} bytes</span>
                {:else}
                  Waiting...
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </section>
    </div>
  </svelte:fragment>
</PhaseShell>

<style>
  .framing-notice {
    background-color: var(--color-surface-muted);
    color: var(--color-primary);
    padding: 1rem;
    border-radius: var(--radius-lg);
    margin-bottom: 2rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--color-primary);
  }

  .content-grid {
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .action-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 150px;
    background-color: var(--color-surface);
    border-radius: var(--radius-lg);
    padding: 2rem;
    border: 1px solid var(--color-border);
    text-align: center;
  }

  .instructions p {
    margin-bottom: 1.5rem;
    color: var(--color-text-muted);
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.375rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    border: none;
  }

  .btn-primary {
    background-color: var(--color-info);
    color: white;
  }

  .btn-primary:hover {
    background-color: var(--color-info);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .success-state h3 {
    color: var(--color-success);
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }

  .key-preview {
    font-family: var(--font-mono, monospace);
    background-color: var(--color-secondary);
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--color-border);
    color: var(--color-text-muted);
    margin-bottom: 1rem;
    word-break: break-all;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .error-state {
    color: var(--color-danger);
  }

  section h2 {
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--color-primary);
  }

  .cards-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
  }

  .card {
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: var(--shadow-sm);
  }

  .node-name {
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .shard-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .shard-bytes {
    color: var(--color-text-muted);
    background-color: rgba(59, 130, 246, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
  }

  .glowing {
    border-color: var(--color-primary);
    animation: shard-glow 2s infinite alternate;
  }

  .has-shard {
    border-color: var(--color-success);
  }

  @keyframes shard-glow {
    0% {
      box-shadow: 0 0 5px rgba(59, 130, 246, 0.2);
    }
    100% {
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.6);
    }
  }
</style>
