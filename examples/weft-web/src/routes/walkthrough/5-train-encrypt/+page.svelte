<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { phaseStore } from '$lib/stores/phase';
  import { dkgStore } from '$lib/stores/dkg';
  import { HOSPITALS } from '$lib/content/hospitals';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import CiphertextTile from '$lib/components/CiphertextTile.svelte';
  import { MockCryptoEngine, PLAINTEXT_MODULUS } from '$lib/crypto/mock';
  import type { CiphertextBytes, PublicKeyBytes } from '$lib/crypto/engine';
  import { fade, slide } from 'svelte/transition';

  const SCALE_FACTOR = 4096;

  const engine = new MockCryptoEngine();

  let publicKey: PublicKeyBytes | null = null;
  let pkHex = 'Loading...';

  type SwimlaneState = 'idle' | 'training' | 'quantizing' | 'encrypting' | 'done';

  interface SwimlaneData {
    hospitalId: string;
    name: string;
    state: SwimlaneState;
    gradientsFloat: number[];
    gradientsInt: number[];
    ciphertext: CiphertextBytes | null;
  }

  // Scripted gradients
  const fakeGradients = [
    [0.12, -0.45, 0.88],
    [-0.05, 0.33, -0.71],
    [0.91, -0.11, 0.54]
  ];

  let swimlanes: SwimlaneData[] = HOSPITALS.slice(0, 3).map((h, i) => {
    return {
      hospitalId: h.id,
      name: h.name,
      state: 'idle',
      gradientsFloat: fakeGradients[i],
      gradientsInt: fakeGradients[i].map(g => {
        let x = Math.round(g * SCALE_FACTOR);
        if (x < 0) x = Number(PLAINTEXT_MODULUS) + x;
        return x;
      }),
      ciphertext: null,
    };
  });

  let isRunning = false;
  let allDone = false;

  onMount(async () => {
    phaseStore.markVisited('train-encrypt');

    if ($dkgStore) {
      publicKey = $dkgStore.publicKey;
    } else {
      const transcript = await engine.runDkg(5, 3);
      dkgStore.set(transcript);
      publicKey = transcript.publicKey;
    }

    pkHex = Array.from(publicKey.bytes.slice(0, 16))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('') + '...';
  });

  async function processSwimlane(index: number) {
    swimlanes[index].state = 'training';
    swimlanes = swimlanes;
    await new Promise(r => setTimeout(r, 1200 + Math.random() * 400));

    swimlanes[index].state = 'quantizing';
    swimlanes = swimlanes;
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 500));

    swimlanes[index].state = 'encrypting';
    swimlanes = swimlanes;
    
    if (publicKey) {
      const ptArray = new Int32Array(swimlanes[index].gradientsInt);
      // simulate latency
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 600));
      const ct = await engine.encryptVector(publicKey, ptArray);
      swimlanes[index].ciphertext = ct;
    }

    swimlanes[index].state = 'done';
    swimlanes = swimlanes;
  }

  async function startAll() {
    if (isRunning || !publicKey) return;
    isRunning = true;
    
    await Promise.all(swimlanes.map((_, i) => processSwimlane(i)));
    
    allDone = true;
    isRunning = false;
  }
</script>

<PhaseShell phaseId="train-encrypt" onNext={() => goto('/walkthrough/6-aggregate')} onPrev={() => goto('/walkthrough/4-aggregate-pk')}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
    </div>

    <div class="pk-banner">
      <span class="pk-label">Shared Aggregate Public Key</span>
      <span class="pk-value">{pkHex}</span>
    </div>

    <div class="actions">
      <button class="btn btn-primary" on:click={startAll} disabled={isRunning || allDone}>
        {allDone ? 'Encryption Complete' : isRunning ? 'Processing...' : 'Train & Encrypt'}
      </button>
    </div>

    <div class="swimlanes">
      {#each swimlanes as lane, i}
        <div class="swimlane">
          <div class="lane-header">
            <h3>{lane.name}</h3>
            <span class="status-badge" class:active={lane.state !== 'idle' && lane.state !== 'done'} class:done={lane.state === 'done'}>
              {lane.state.toUpperCase()}
            </span>
          </div>

          <div class="lane-content">
            {#if lane.state === 'idle'}
              <div class="idle-state" in:fade>Waiting to start...</div>
            {:else if lane.state === 'training'}
              <div class="step training" in:slide>
                <div class="loader"></div>
                <div class="data-preview">
                  <span class="label">Local Gradients (Float32):</span>
                  <code>[{lane.gradientsFloat.join(', ')}...]</code>
                </div>
              </div>
            {:else if lane.state === 'quantizing'}
              <div class="step quantizing" in:slide>
                <div class="math-visualization" class:show-math={level === 'show-math'}>
                  {#each lane.gradientsFloat as g, j}
                    <div class="calc-row">
                      <span class="float">{g.toFixed(2)}</span> &times; <span class="scale">S({SCALE_FACTOR})</span> =
                      {#if g < 0}
                        {#if level === 'show-math'}
                          <span class="equation">t({Number(PLAINTEXT_MODULUS)}) - {Math.abs(Math.round(g * SCALE_FACTOR))} &rarr;</span>
                        {/if}
                      {/if}
                      <span class="int">{lane.gradientsInt[j]}</span>
                    </div>
                  {/each}
                  {#if level === 'show-math' && lane.gradientsFloat.some(g => g < 0)}
                    <div class="note">Negatives: x &rarr; t - |x| (two's-complement mod t)</div>
                  {/if}
                </div>
              </div>
            {:else if lane.state === 'encrypting'}
              <div class="step encrypting" in:slide>
                <div class="loader"></div>
                <div class="encryption-details">
                  <span>Encrypting with Aggregate PK...</span>
                  {#if level === 'show-math'}
                    <div class="equation">c = (a&middot;s + e + &Delta;&middot;m, -a)</div>
                  {/if}
                </div>
              </div>
            {:else if lane.state === 'done' && lane.ciphertext}
              <div class="step done" in:slide data-testid="hospital-ct-done">
                <CiphertextTile id={lane.hospitalId} byteCount={lane.ciphertext.bytes.length} status="arrived" />
              </div>
            {/if}
          </div>
        </div>
      {/each}
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

  .pk-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 0.5rem);
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
  }

  .pk-label {
    font-weight: 600;
    color: var(--color-text-muted);
  }

  .pk-value {
    font-family: var(--font-mono);
    color: var(--color-phase-4);
    background: var(--color-primary);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
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

  .swimlanes {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .swimlane {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 0.75rem);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .lane-header {
    background: var(--color-primary);
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--color-border);
  }

  .lane-header h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--color-text-muted);
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 9999px;
    background: var(--color-border);
    color: var(--color-text-muted);
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .status-badge.active {
    background: var(--color-info);
    color: var(--color-secondary);
  }

  .status-badge.done {
    background: var(--color-success);
    color: var(--color-secondary);
  }

  .lane-content {
    padding: 1.5rem;
    min-height: 110px;
    display: flex;
    align-items: center;
  }

  .idle-state {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
  }

  .loader {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--color-text-muted);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .data-preview, .encryption-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .data-preview .label {
    font-size: 0.75rem;
    color: var(--color-text-muted);
  }

  .data-preview code {
    font-family: var(--font-mono);
    color: var(--color-primary);
    font-size: 0.875rem;
  }

  .math-visualization {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-family: var(--font-mono);
    font-size: 0.875rem;
  }

  .calc-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .float { color: var(--color-primary); }
  .scale { color: var(--color-text-muted); }
  .equation { color: var(--color-warning); font-size: 0.875rem; font-family: var(--font-mono); }
  .int { color: var(--color-success); font-weight: bold; }
  
  .note {
    font-size: 0.75rem;
    color: var(--color-warning);
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px dashed var(--color-border);
  }

  /* Specific fix for CiphertextTile step */
  .step.done {
    width: auto;
    flex: 1;
  }
</style>
