<script lang="ts">
  import { MockCryptoEngine, PLAINTEXT_MODULUS } from '$lib/crypto/mock';
  import SandboxControls from '$lib/components/SandboxControls.svelte';
  import RunHistory from '$lib/components/RunHistory.svelte';
  import RoundSummary from '$lib/components/RoundSummary.svelte';

  type RunRecord = {
    id: string;
    timestamp: number;
    clientCount: number;
    threshold: number;
    scaleFactor: number;
    vectorSize: number;
    magnitude: number;
    durationMs: number;
  };

  let clientCount = 3;
  let scaleFactor = 4096;
  let committeeSize = 5;
  let threshold = 3;
  let vectorSize = 256;

  let runs: RunRecord[] = [];
  let isRunning = false;
  let latestRunStats: RunRecord | null = null;
  let latestAveraged: number[] | null = null;

  async function handleRunRound() {
    if (isRunning) return;
    
    // Safety check again
    if (clientCount * scaleFactor * 1.0 >= Number(PLAINTEXT_MODULUS) / 2) {
      return;
    }

    isRunning = true;
    const start = performance.now();

    try {
      const engine = new MockCryptoEngine({ delayMs: 10 });
      const dkg = await engine.runDkg(committeeSize, threshold);
      
      const ciphertexts = [];
      for (let i = 0; i < clientCount; i++) {
        const gradients = new Float32Array(vectorSize);
        for (let j = 0; j < vectorSize; j++) {
          gradients[j] = (Math.random() * 2 - 1) * 0.5; // [-0.5, 0.5]
        }
        const quantized = Int32Array.from(gradients, g => Math.round(g * scaleFactor));
        const ct = await engine.encryptVector(dkg.publicKey, quantized);
        ciphertexts.push(ct);
      }

      const aggregatedCt = await engine.aggregateCiphertexts(ciphertexts);

      const shares = [];
      for (let i = 0; i < threshold; i++) {
        const share = await engine.partialDecrypt(dkg.perPartyShares[i], aggregatedCt);
        shares.push(share);
      }

      const combined = await engine.combineDecryptionShares(shares, aggregatedCt);

      const half = Number(PLAINTEXT_MODULUS) / 2;
      const averaged = Array.from(combined, val => {
        let unwrapped = val > half ? val - Number(PLAINTEXT_MODULUS) : val;
        return unwrapped / (scaleFactor * clientCount);
      });

      const end = performance.now();
      const durationMs = end - start;
      const magnitude = Math.sqrt(averaged.reduce((sum, v) => sum + v * v, 0));

      const record: RunRecord = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        clientCount,
        threshold,
        scaleFactor,
        vectorSize,
        magnitude,
        durationMs
      };

      runs = [record, ...runs].slice(0, 5);
      latestRunStats = record;
      latestAveraged = averaged;

    } catch (err) {
      console.error('Run round failed:', err);
    } finally {
      isRunning = false;
    }
  }
</script>

<div class="sandbox-container">
  <div class="header">
    <h1>WEFT Sandbox</h1>
    <div class="framing-notice">
      <strong>Real FHE math, simulated committee topology.</strong> Test out how different configurations affect precision and runtime. <a href="/walkthrough/1-meet" class="learn-link">Learn mode &rarr;</a>
    </div>
  </div>

  <div class="layout-grid">
    <div class="main-content">
      <SandboxControls 
        bind:clientCount
        bind:scaleFactor
        bind:committeeSize
        bind:threshold
        bind:vectorSize
        {isRunning}
        on:runRound={handleRunRound}
      />

      <div class="results-area">
        {#if isRunning}
          <div class="running-state">
            <div class="spinner"></div>
            <p>Executing round securely...</p>
          </div>
        {:else if latestRunStats && latestAveraged}
          <div data-testid="round-summary">
            <RoundSummary 
              averaged={latestAveraged} 
              nHospitals={latestRunStats.clientCount} 
              roundDurationMs={latestRunStats.durationMs} 
            />
            <div style="display: none;">
              <span data-testid="summary-clients">{latestRunStats.clientCount}</span>
              <span data-testid="summary-threshold">{latestRunStats.threshold}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="sidebar">
      <RunHistory {runs} />
    </div>
  </div>
</div>

<style>
  .sandbox-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-8, 32px) var(--space-4, 16px);
  }

  .header {
    margin-bottom: var(--space-8, 32px);
  }

  h1 {
    font-size: var(--text-3xl, 30px);
    color: var(--color-neutral-100, #fafafa);
    margin: 0 0 var(--space-4, 16px) 0;
  }

  .framing-notice {
    background-color: var(--color-primary-900, #1e3a8a);
    color: var(--color-primary-100, #dbeafe);
    padding: var(--space-4, 16px);
    border-radius: var(--radius-md, 8px);
    font-size: var(--text-sm, 14px);
    border-left: 4px solid var(--color-primary, #3b82f6);
  }

  .learn-link {
    color: var(--color-primary-200, #bfdbfe);
    font-weight: 600;
    text-decoration: underline;
    margin-left: var(--space-2, 8px);
  }

  .learn-link:hover {
    color: var(--color-primary-100, #dbeafe);
  }

  .layout-grid {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: var(--space-8, 32px);
    align-items: start;
  }

  @media (max-width: 900px) {
    .layout-grid {
      grid-template-columns: 1fr;
    }
  }

  .main-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-8, 32px);
  }

  .results-area {
    min-height: 200px;
    display: flex;
    flex-direction: column;
  }

  .running-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    background-color: var(--color-neutral-800, #262626);
    border: 1px dashed var(--color-neutral-600, #737373);
    border-radius: var(--radius-lg, 16px);
    color: var(--color-neutral-300, #e5e5e5);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-neutral-700, #525252);
    border-top-color: var(--color-primary, #1a9e8f);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: var(--space-4, 16px);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sidebar {
    height: 600px;
    position: sticky;
    top: var(--space-8, 32px);
  }
</style>
