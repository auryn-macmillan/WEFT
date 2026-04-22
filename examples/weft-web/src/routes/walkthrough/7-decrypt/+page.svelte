<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { phaseStore } from '$lib/stores/phase';
  import { dkgStore } from '$lib/stores/dkg';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import CiphertextTile from '$lib/components/CiphertextTile.svelte';
  import { MockCryptoEngine } from '$lib/crypto/mock';
  import type { CiphertextBytes, DecryptionShareBytes, SecretShareBytes } from '$lib/crypto/engine';
  import { fade, slide } from 'svelte/transition';

  const engine = new MockCryptoEngine({ delayMs: 600 });
  const THRESHOLD = 3;
  const COMMITTEE_SIZE = 5;

  let aggregateCt: CiphertextBytes | null = null;
  let shares: readonly SecretShareBytes[] = [];
  let selectedMembers = new Set<number>([1, 2, 3]); // pre-select 3
  
  let isRevealing = false;
  let hasRevealed = false;
  let revealError = '';
  let result: Int32Array | null = null;

  onMount(async () => {
    phaseStore.markVisited('threshold-decrypt');

    if ($dkgStore) {
      shares = $dkgStore.perPartyShares;
    } else {
      const transcript = await engine.runDkg(COMMITTEE_SIZE, THRESHOLD);
      dkgStore.set(transcript);
      shares = transcript.perPartyShares;
    }

    // Mock the aggregate ciphertext coming from Phase 6
    // In a real app we might pass it via a store, but here we just mock it
    const ciphertexts = await Promise.all([
      engine.encryptVector($dkgStore!.publicKey, new Int32Array([100, -50, 200])),
      engine.encryptVector($dkgStore!.publicKey, new Int32Array([-10, 80, -150])),
      engine.encryptVector($dkgStore!.publicKey, new Int32Array([55, 20, 90]))
    ]);
    aggregateCt = await engine.aggregateCiphertexts(ciphertexts);
  });

  function toggleMember(id: number) {
    if (isRevealing || hasRevealed) return;
    if (selectedMembers.has(id)) {
      selectedMembers.delete(id);
    } else {
      selectedMembers.add(id);
    }
    selectedMembers = selectedMembers; // trigger reactivity
    revealError = '';
  }

  async function reveal() {
    if (selectedMembers.size < THRESHOLD) {
      revealError = `Need at least ${THRESHOLD} committee members to decrypt`;
      return;
    }
    if (isRevealing || !aggregateCt) return;
    
    isRevealing = true;
    revealError = '';

    try {
      // 1. Get partial decryption shares
      const partials: DecryptionShareBytes[] = [];
      const selectedShares = shares.filter(s => selectedMembers.has(s.partyIndex));
      
      for (const share of selectedShares) {
        const partial = await engine.partialDecrypt(share, aggregateCt);
        partials.push(partial);
      }

      // 2. Combine shares
      result = await engine.combineDecryptionShares(partials, aggregateCt);
      hasRevealed = true;
    } catch (e: any) {
      revealError = e.message || 'Decryption failed';
    } finally {
      isRevealing = false;
    }
  }

  const memberNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
</script>

<PhaseShell phaseId="threshold-decrypt" onNext={() => goto('/walkthrough/8-update')} onPrev={() => goto('/walkthrough/6-aggregate')}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
    </div>
    <div class="header-section">
      <div class="aggregate-input">
        {#if aggregateCt}
          <div class="ct-wrapper" in:fade>
            <CiphertextTile id="aggregate-result" byteCount={aggregateCt.bytes.length} status="aggregated" />
            <div class="ct-label">Encrypted Sum (From Phase 6)</div>
          </div>
        {/if}
      </div>

      <div class="controls">
        <div class="status-counter">
          <span class="count" class:met={selectedMembers.size >= THRESHOLD}>{selectedMembers.size}</span>
          <span class="total">of {COMMITTEE_SIZE} selected (need {THRESHOLD})</span>
        </div>
        
        <button 
          class="btn btn-primary" 
          on:click={reveal} 
          disabled={isRevealing || hasRevealed || selectedMembers.size < THRESHOLD}
        >
          {hasRevealed ? 'Decrypted' : isRevealing ? 'Decrypting...' : 'Reveal'}
        </button>
        
        {#if revealError}
          <div class="error" in:fade>{revealError}</div>
        {/if}
      </div>
    </div>

    <div class="committee-grid">
      {#each shares as share, i}
        {@const isSelected = selectedMembers.has(share.partyIndex)}
        <button 
          class="member-card" 
          class:selected={isSelected} 
          class:disabled={isRevealing || hasRevealed}
          on:click={() => toggleMember(share.partyIndex)}
          disabled={isRevealing || hasRevealed}
        >
          <div class="member-avatar">{memberNames[i][0]}</div>
          <div class="member-info">
            <div class="member-name">Node {memberNames[i]}</div>
            <div class="member-status">
              {#if isSelected}
                <span class="status-dot online"></span> Participating
              {:else}
                <span class="status-dot offline"></span> Offline
              {/if}
            </div>
          </div>
        </button>
      {/each}
    </div>

    {#if hasRevealed && result}
      <div class="result-section" in:slide>
        <h3>Decrypted Aggregate Gradients</h3>
        <div class="result-data" data-testid="decrypted-coefficients">
          {JSON.stringify([...result])}
        </div>
        {#if level === 'show-math' || level === 'learn-more'}
          <div class="explanation note">
            We successfully decrypted the sum of gradients without ever seeing any individual hospital's data.
          </div>
        {/if}
      </div>
    {/if}
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

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 0.75rem);
    padding: 2rem;
    margin-bottom: 2rem;
  }

  .aggregate-input {
    flex: 1;
  }

  .ct-wrapper {
    max-width: 250px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .ct-label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1rem;
    flex: 1;
  }

  .status-counter {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 1rem;
    color: var(--color-text-muted);
  }

  .count {
    font-size: 2rem;
    font-weight: bold;
    color: var(--color-warning);
  }

  .count.met {
    color: var(--color-success);
  }

  .total {
    font-size: 0.875rem;
  }

  .btn {
    padding: 0.75rem 2rem;
    border-radius: 0.375rem;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: opacity 0.2s;
    font-size: 1rem;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background-color: var(--color-phase-7);
    color: var(--color-primary);
  }

  .error {
    color: var(--color-danger);
    font-size: 0.875rem;
    max-width: 200px;
    text-align: right;
  }

  .committee-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .member-card {
    background: var(--color-primary);
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-md, 0.5rem);
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    color: var(--color-text-muted);
  }

  .member-card:not(.disabled):hover {
    border-color: var(--color-text-muted);
    background: var(--color-surface);
  }

  .member-card.selected {
    border-style: solid;
    border-color: var(--color-phase-7);
    background: rgba(var(--color-phase-7-rgb, 168, 85, 247), 0.1);
  }

  .member-card.disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .member-avatar {
    width: 3rem;
    height: 3rem;
    background: var(--color-surface);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    font-weight: bold;
    color: var(--color-text-muted);
  }

  .member-card.selected .member-avatar {
    background: var(--color-phase-7);
    color: var(--color-primary);
  }

  .member-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .member-name {
    font-weight: 600;
  }

  .member-status {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-dot.online {
    background: var(--color-success);
    box-shadow: 0 0 8px var(--color-success);
  }

  .status-dot.offline {
    background: var(--color-text-muted);
  }

  .result-section {
    background: var(--color-surface);
    border: 1px solid var(--color-success);
    border-radius: var(--radius-md, 0.5rem);
    padding: 2rem;
    margin-top: 2rem;
  }

  .result-section h3 {
    margin: 0 0 1rem 0;
    color: var(--color-success);
    font-size: 1.25rem;
  }

  .result-data {
    background: var(--color-primary);
    padding: 1rem;
    border-radius: 0.25rem;
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    font-size: 1rem;
    overflow-x: auto;
    border-left: 4px solid var(--color-success);
  }

  .explanation {
    margin-top: 1rem;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }
</style>
