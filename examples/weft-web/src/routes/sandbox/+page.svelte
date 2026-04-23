<script lang="ts">
  import { base } from '$app/paths';
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

<div class="sandbox-wrapper">
  <div class="sandbox-container">
    <div class="header">
      <div class="title-row">
        <h1>WEFT Sandbox</h1>
        <a href="{base}/" class="btn btn-secondary">← Back</a>
      </div>
      <div class="framing-notice" data-testid="honest-framing">
        <strong>Real FHE math, simulated committee topology.</strong> Test out how different configurations affect precision and runtime. <a href="{base}/walkthrough/1-meet" class="learn-link">Learn mode &rarr;</a>
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
</div>

<style>
  .sandbox-wrapper {
    min-height: 100dvh;
    background-color: var(--color-secondary); /* Mint drenched */
    padding: 3rem 1.5rem;
    font-family: var(--font-sans);
  }

  .sandbox-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .header {
    margin-bottom: 2rem;
  }

  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  h1 {
    font-size: clamp(2.5rem, 6vw, 4rem);
    letter-spacing: -0.02em;
    color: var(--color-primary);
    margin: 0;
    font-weight: 700;
    line-height: 1.1;
  }

  .btn {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    border-radius: var(--radius-full);
    text-decoration: none;
    font-weight: 600;
    font-size: var(--text-sm);
    transition: transform 0.15s ease, opacity 0.15s ease;
    border: none;
    cursor: pointer;
  }

  .btn:hover {
    transform: translateY(-2px);
  }

  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-primary);
    border: 1px solid var(--color-border);
  }

  .framing-notice {
    background-color: var(--color-surface);
    color: var(--color-primary);
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    font-size: var(--text-base);
    border: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
  }

  .learn-link {
    color: var(--color-text-muted);
    font-weight: 600;
    text-decoration: underline;
    margin-left: 0.5rem;
  }

  .learn-link:hover {
    color: var(--color-primary);
  }

  .layout-grid {
    display: grid;
    grid-template-columns: 1fr 350px;
    gap: 2rem;
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
    gap: 2rem;
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
    background-color: var(--color-surface);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    color: var(--color-text-muted);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid var(--color-border);
    border-top-color: var(--color-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sidebar {
    height: 600px;
    position: sticky;
    top: 2rem;
  }
</style>
