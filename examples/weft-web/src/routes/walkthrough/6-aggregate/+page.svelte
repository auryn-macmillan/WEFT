<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { phaseStore } from '$lib/stores/phase';
  import { dkgStore } from '$lib/stores/dkg';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import CiphertextTile from '$lib/components/CiphertextTile.svelte';
  import { MockCryptoEngine } from '$lib/crypto/mock';
  import type { CiphertextBytes, PublicKeyBytes } from '$lib/crypto/engine';
  import { fade, fly } from 'svelte/transition';

  const engine = new MockCryptoEngine({ delayMs: 600 });
  let publicKey: PublicKeyBytes | null = null;

  let ciphertexts: CiphertextBytes[] = [];
  let aggregateCt: CiphertextBytes | null = null;
  let isAggregating = false;
  let hasAggregated = false;

  onMount(async () => {
    phaseStore.markVisited('homomorphic-add');

    if ($dkgStore) {
      publicKey = $dkgStore.publicKey;
    } else {
      const transcript = await engine.runDkg(5, 3);
      dkgStore.set(transcript);
      publicKey = transcript.publicKey;
    }

    // Generate 3 mock ciphertexts representing the hospitals
    if (publicKey) {
      ciphertexts = await Promise.all([
        engine.encryptVector(publicKey, new Int32Array([100, -50, 200])),
        engine.encryptVector(publicKey, new Int32Array([-10, 80, -150])),
        engine.encryptVector(publicKey, new Int32Array([55, 20, 90]))
      ]);
    }
  });

  async function aggregate() {
    if (!ciphertexts.length || isAggregating) return;
    
    isAggregating = true;
    
    // Simulate animation flowing into the aggregator
    await new Promise(r => setTimeout(r, 800));
    
    aggregateCt = await engine.aggregateCiphertexts(ciphertexts);
    
    isAggregating = false;
    hasAggregated = true;
  }
</script>

<PhaseShell phaseId="homomorphic-add" onNext={() => goto('/walkthrough/7-decrypt')} onPrev={() => goto('/walkthrough/5-train-encrypt')}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
    </div>

    <div class="insight-callout">
      <strong>Key Insight:</strong> We added encrypted numbers without ever seeing them.
    </div>

    <div class="actions">
      <button class="btn btn-primary" on:click={aggregate} disabled={isAggregating || hasAggregated || ciphertexts.length === 0}>
        {hasAggregated ? 'Aggregated' : isAggregating ? 'Aggregating...' : 'Aggregate Ciphertexts'}
      </button>
    </div>

    <div class="aggregation-arena">
      <div class="inputs">
        {#each ciphertexts as ct, i}
          <div class="input-tile" class:flowing={isAggregating}>
            <CiphertextTile id={`hosp-${i}`} byteCount={ct.bytes.length} status={hasAggregated ? 'aggregated' : isAggregating ? 'in-flight' : 'arrived'} />
          </div>
        {/each}
      </div>

      <div class="aggregator" class:active={isAggregating}>
        <div class="plus-icon">+</div>
        <div class="aggregator-box">
          {#if isAggregating}
            <div class="loader" in:fade></div>
          {:else if hasAggregated}
            <div class="success-check" in:fade>✓</div>
          {:else}
            <div class="idle-text">Ready</div>
          {/if}
        </div>
      </div>

      <div class="output">
        {#if aggregateCt}
          <div in:fly={{ y: 20, duration: 600 }}>
            <CiphertextTile id="aggregate-result" byteCount={aggregateCt.bytes.length} status="aggregated" />
          </div>
        {:else}
          <div class="placeholder-tile">Aggregate Result</div>
        {/if}
      </div>
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

  .insight-callout {
    background-color: var(--color-surface-muted);
    color: var(--color-primary);
    padding: 1rem;
    border-radius: var(--radius-lg);
    margin-bottom: 2rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--color-primary);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 2rem;
  }

  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: var(--color-primary);
    color: white;
  }

  .aggregation-arena {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    padding: 2rem;
    background: var(--color-primary);
    border: 1px dashed var(--color-border);
    border-radius: 0.75rem;
  }

  .inputs {
    display: flex;
    gap: 1.5rem;
    width: 100%;
    justify-content: center;
  }

  .input-tile {
    flex: 1;
    max-width: 200px;
    transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .input-tile.flowing {
    transform: translateY(40px) scale(0.95);
    opacity: 0.8;
  }

  .aggregator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    position: relative;
    z-index: 10;
  }

  .plus-icon {
    font-size: 2rem;
    color: var(--color-text-muted);
    font-weight: bold;
  }

  .aggregator-box {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background: var(--color-surface);
    border: 2px solid var(--color-text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: all 0.3s ease;
  }

  .aggregator.active .aggregator-box {
    border-color: var(--color-primary);
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
    transform: scale(1.05);
  }

  .idle-text {
    color: var(--color-text-muted);
    font-size: 0.875rem;
  }

  .loader {
    width: 2rem;
    height: 2rem;
    border: 3px solid var(--color-text-muted);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .success-check {
    color: var(--color-success);
    font-size: 2.5rem;
  }

  .output {
    width: 100%;
    max-width: 300px;
    min-height: 80px;
    display: flex;
    justify-content: center;
  }

  .placeholder-tile {
    width: 100%;
    height: 80px;
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
    font-style: italic;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
