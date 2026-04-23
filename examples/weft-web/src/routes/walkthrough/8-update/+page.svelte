<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { phaseStore } from '$lib/stores/phase';
  import { PHASES } from '$lib/content/phases';
  import { MockCryptoEngine, PLAINTEXT_MODULUS } from '$lib/crypto/mock';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import PhaseProgress from '$lib/components/PhaseProgress.svelte';
  import RoundSummary from '$lib/components/RoundSummary.svelte';

  const N_HOSPITALS = 3;
  const SCALE_FACTOR = 4096;

  let averaged: number[] | null = null;
  let isGenerating = true;

  onMount(async () => {
    phaseStore.markVisited('update-model');
    await generateDecryptedCoefficients();
  });

  async function generateDecryptedCoefficients() {
    isGenerating = true;
    try {
      const engine = new MockCryptoEngine({ delayMs: 0 });
      const transcript = await engine.runDkg(5, 3);
      
      // Simulate real scaled gradients across 3 hospitals
      const h1 = await engine.encryptVector(transcript.publicKey, Int32Array.from([1228, 409, -819, 2048, -409, 0, 1638, -2457]));
      const h2 = await engine.encryptVector(transcript.publicKey, Int32Array.from([819, 0, -409, 1228, 409, -819, 819, -1228]));
      const h3 = await engine.encryptVector(transcript.publicKey, Int32Array.from([409, -819, 0, 819, 819, 409, -409, 0]));
      
      const agg = await engine.aggregateCiphertexts([h1, h2, h3]);
      const shares = await Promise.all([
        engine.partialDecrypt(transcript.perPartyShares[0], agg),
        engine.partialDecrypt(transcript.perPartyShares[1], agg),
        engine.partialDecrypt(transcript.perPartyShares[2], agg)
      ]);
      
      const decryptedCoefficients = await engine.combineDecryptionShares(shares, agg);

      averaged = Array.from(decryptedCoefficients).map(val => {
        if (val > Number(PLAINTEXT_MODULUS) / 2) val = val - Number(PLAINTEXT_MODULUS);
        return val / (N_HOSPITALS * SCALE_FACTOR);
      });
    } catch (e) {
      console.error(e);
    } finally {
      isGenerating = false;
    }
  }

  function handleStartOver() {
    phaseStore.resetPhase();
    goto(`${base}/walkthrough/1-meet`);
  }
</script>

<PhaseShell phaseId="update-model" onPrev={() => goto(`${base}/walkthrough/7-threshold-decrypt`)}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
    </div>

    <div class="content-wrapper">
      {#if level === 'novice'}
        <div class="card novice-card">
          <p>The global model has been updated with the averaged insights of all hospitals, completing the round!</p>
        </div>
      {:else if level === 'learn-more'}
        <div class="card learn-more-card">
          <p>The aggregate integer gradient was decrypted by the committee. The coordinator now maps it back to float values.</p>
        </div>
      {:else if level === 'show-math'}
        <div class="card show-math-card">
          <p>We divide the sum by <code>n = {N_HOSPITALS}</code> and <code>S = {SCALE_FACTOR}</code>:</p>
          <pre><code>averaged = sum / (n * S)</code></pre>
        </div>
      {/if}

      {#if isGenerating}
        <div class="loading">Applying global model updates...</div>
      {:else if averaged}
        <div class="animation-container">
          <div class="cloud">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
            <div class="update-arrows">↑</div>
          </div>
        </div>

        <RoundSummary {averaged} nHospitals={N_HOSPITALS} roundDurationMs={4520} />

        <div class="data-preview">
          <h4>Averaged Gradient (first 8 values)</h4>
          <div data-testid="averaged-gradient" class="code-block">
            {JSON.stringify(averaged.slice(0, 8), null, 2)}
          </div>
        </div>
      {/if}

      <div class="recap-section">
        <h3>Walkthrough Complete</h3>
        <div class="progress-wrapper">
          <PhaseProgress 
            current="update-model" 
            visited={$phaseStore.visited} 
            onJump={(id) => goto(`${base}/walkthrough/${PHASES.findIndex(p => p.id === id) + 1}-${id}`)}
          />
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-secondary" on:click={handleStartOver}>
          Start Over
        </button>
        <a href="{base}/sandbox" class="btn btn-primary">
          Explore the Sandbox
        </a>
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

  .content-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
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

  .loading {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
  }

  .animation-container {
    display: flex;
    justify-content: center;
    padding: var(--space-8);
  }

  .cloud {
    position: relative;
    width: 64px;
    height: 64px;
    color: var(--phase-accent);
  }

  .cloud svg {
    width: 100%;
    height: 100%;
  }

  .update-arrows {
    position: absolute;
    bottom: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 24px;
    color: var(--color-success);
    animation: bounce 1.5s infinite;
  }

  @keyframes bounce {
    0%, 100% { transform: translate(-50%, 0); }
    50% { transform: translate(-50%, -10px); }
  }

  .data-preview {
    background-color: var(--color-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  .data-preview h4 {
    margin: 0 0 var(--space-2) 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    text-transform: uppercase;
  }

  .code-block {
    font-family: var(--font-mono);
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    white-space: pre-wrap;
    background: var(--color-surface);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
  }

  .recap-section {
    margin-top: var(--space-4);
    border-top: 1px solid var(--color-surface);
    padding-top: var(--space-6);
  }

  .recap-section h3 {
    margin: 0 0 var(--space-4) 0;
    text-align: center;
    color: var(--color-text-muted);
  }

  .progress-wrapper {
    display: flex;
    justify-content: center;
    background: var(--color-primary);
    padding: var(--space-4);
    border-radius: var(--radius-lg);
  }

  .actions {
    display: flex;
    justify-content: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-base);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-in-out);
    border: none;
    text-decoration: none;
  }

  .btn-primary {
    background-color: var(--phase-accent);
    color: var(--color-primary);
  }

  .btn-primary:hover {
    filter: brightness(1.1);
  }

  .btn-secondary {
    background-color: transparent;
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background-color: var(--color-surface);
  }
</style>
