<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
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

<PhaseShell phaseId="dkg" onNext={dkgTranscript ? () => goto('/walkthrough/3-shares') : undefined} onPrev={() => goto('/walkthrough/1-meet')}>
  <svelte:fragment slot="body" let:level>
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
    background-color: var(--color-neutral-800, #1f2937);
    border-radius: 0.5rem;
    padding: 2rem;
    border: 1px solid var(--color-neutral-700, #374151);
    text-align: center;
  }

  .instructions p {
    margin-bottom: 1.5rem;
    color: var(--color-neutral-300, #d1d5db);
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
    background-color: var(--color-primary-500, #3b82f6);
    color: white;
  }

  .btn-primary:hover {
    background-color: var(--color-primary-400, #60a5fa);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-neutral-700, #374151);
    border-top-color: var(--color-primary-500, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .success-state h3 {
    color: var(--color-success-400, #4ade80);
    margin-bottom: 1rem;
    font-size: 1.25rem;
  }

  .key-preview {
    font-family: var(--font-mono, monospace);
    background-color: var(--color-neutral-900, #111827);
    padding: 1rem;
    border-radius: 0.375rem;
    border: 1px solid var(--color-neutral-700, #374151);
    color: var(--color-primary-300, #93c5fd);
    margin-bottom: 1rem;
    word-break: break-all;
  }

  .subtitle {
    font-size: 0.875rem;
    color: var(--color-neutral-400, #9ca3af);
  }

  .error-state {
    color: var(--color-error-400, #f87171);
  }

  section h2 {
    font-size: 1.25rem;
    margin-bottom: 1.5rem;
    color: var(--color-neutral-100, #f3f4f6);
  }

  .cards-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
  }

  .card {
    background-color: var(--color-neutral-800, #1f2937);
    border: 1px solid var(--color-neutral-700, #374151);
    border-radius: 0.5rem;
    padding: 1.5rem 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    text-align: center;
    position: relative;
    overflow: hidden;
  }

  .node-name {
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: var(--color-neutral-200, #e5e7eb);
    font-weight: 600;
  }

  .shard-status {
    font-size: 0.75rem;
    color: var(--color-neutral-400, #9ca3af);
  }

  .shard-bytes {
    color: var(--color-primary-300, #93c5fd);
    background-color: rgba(59, 130, 246, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono, monospace);
  }

  .glowing {
    border-color: var(--color-primary-500, #3b82f6);
    animation: shard-glow 2s infinite alternate;
  }

  .has-shard {
    border-color: var(--color-success-500, #22c55e);
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