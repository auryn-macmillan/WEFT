<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  import type { BfvParams, TelemetryEventKind } from '$lib/crypto';
  import { DEFAULT_PARAMS } from '$lib/crypto/mock';
  import {
    aggregateCiphertexts,
    combineDecryptionShares,
    COMMITTEE_WORKER_COUNT,
    createRoundId,
    encryptWithHospital,
    HOSPITAL_WORKER_COUNT,
    pingWorkers,
    requestCommitteeDkg,
    requestPartialDecryptions,
    spawnWorkers,
    terminateWorkers,
    type EngineFactory,
    type WorkerRegistry
  } from '$lib/workers/registry';
  import type { WorkerIdentity, WorkerTelemetryEnvelope } from '$lib/workers/messages';

  const demoParams: BfvParams = {
    ...DEFAULT_PARAMS,
    polyDegree: 8192,
    threshold: 3,
    committeeSize: COMMITTEE_WORKER_COUNT
  };

  const telemetryKindOrder: readonly TelemetryEventKind[] = [
    'dkg-start',
    'dkg-done',
    'encrypt-start',
    'encrypt-done',
    'aggregate-start',
    'aggregate-done',
    'partial-decrypt-start',
    'partial-decrypt-done',
    'combine-start',
    'combine-done'
  ];

  const engineFactory: EngineFactory = (identity: WorkerIdentity) => ({
    kind: 'demo',
    params: {
      ...demoParams,
      threshold: 3,
      committeeSize: COMMITTEE_WORKER_COUNT
    },
    latencyMs: 2,
    seed: identity.partyIndex ?? 0
  });

  type PingResult = {
    workerId: string;
    role: string;
    roundTripMs: number;
  };

  type TelemetrySummary = {
    kind: TelemetryEventKind;
    count: number;
  };

  let registry: WorkerRegistry | null = null;
  let status = 'idle';
  let errorMessage = '';
  let pingResults: PingResult[] = [];
  let telemetryEvents: WorkerTelemetryEnvelope[] = [];
  let telemetrySummary: TelemetrySummary[] = telemetryKindOrder.map((kind) => ({ kind, count: 0 }));
  let demoOutput = '';

  function syncWorkerCount(): void {
    if (typeof window !== 'undefined') {
      window.__worker_count = registry?.all.length ?? 0;
    }
  }

  function cleanupRegistry(): void {
    terminateWorkers(registry);
    registry = null;
    syncWorkerCount();
  }

  function recordTelemetry(event: WorkerTelemetryEnvelope): void {
    const nextEvents = [event, ...telemetryEvents].slice(0, 20);
    telemetryEvents = nextEvents;
    telemetrySummary = telemetryKindOrder.map((kind) => ({
      kind,
      count: nextEvents.filter((entry) => entry.event.kind === kind).length
    }));
  }

  async function handleSpawn(): Promise<void> {
    cleanupRegistry();
    pingResults = [];
    telemetryEvents = [];
    telemetrySummary = telemetryKindOrder.map((kind) => ({ kind, count: 0 }));
    demoOutput = '';
    errorMessage = '';
    status = 'spawning';

    try {
      registry = await spawnWorkers(engineFactory, recordTelemetry);
      syncWorkerCount();
      status = 'ready';
    } catch (error) {
      cleanupRegistry();
      errorMessage = error instanceof Error ? error.message : 'Failed to spawn workers';
      status = 'error';
    }
  }

  async function handlePingAll(): Promise<void> {
    if (!registry) {
      return;
    }

    status = 'pinging';
    errorMessage = '';
    try {
      const responses = await pingWorkers(registry);
      pingResults = responses
        .map((response) => ({
          workerId: response.workerId,
          role: response.role,
          roundTripMs: Number(response.roundTripMs.toFixed(3))
        }))
        .sort((left, right) => left.workerId.localeCompare(right.workerId));
      status = 'ready';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to ping workers';
      status = 'error';
    }
  }

  async function handleRunDemo(): Promise<void> {
    if (!registry) {
      return;
    }

    status = 'running-demo';
    errorMessage = '';
    const roundId = createRoundId();
    try {
      const dkg = await requestCommitteeDkg(registry, {
        roundId,
        committeeSize: COMMITTEE_WORKER_COUNT,
        threshold: demoParams.threshold
      });

      const publicKeyBuffer = dkg[0]?.publicKeyBuffer;
      if (!publicKeyBuffer) {
        throw new Error('missing committee public key');
      }

      const gradients = [
        new Int32Array([11, -3, 4, 2]),
        new Int32Array([5, 1, -7, 6]),
        new Int32Array([-2, 8, 3, -1])
      ];

      const encryptResponses = await Promise.all(
        registry.hospitals.map((entry, index) =>
          encryptWithHospital(entry, {
            hospitalId: entry.identity.workerId,
            publicKeyBuffer: publicKeyBuffer.slice(0),
            plaintextBuffer: gradients[index].buffer.slice(0)
          })
        )
      );

      const aggregateResponse = await aggregateCiphertexts(
        registry,
        encryptResponses.map((response) => response.ciphertextBuffer)
      );
      const partialDecryptions = await requestPartialDecryptions(
        registry,
        roundId,
        aggregateResponse.ciphertextBuffer
      );
      const plaintextBuffer = await combineDecryptionShares(
        registry.committee[0],
        roundId,
        aggregateResponse.ciphertextBuffer.slice(0),
        partialDecryptions.slice(0, demoParams.threshold).map((response) => response.shareBuffer),
        partialDecryptions.slice(0, demoParams.threshold).map((response) => response.partyIndex)
      );
      const plaintext = Array.from(new Int32Array(plaintextBuffer));

      demoOutput = JSON.stringify(
        {
          aggregate: plaintext,
          expected: [14, 6, 0, 7]
        },
        null,
        2
      );
      status = 'ready';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to run worker demo';
      status = 'error';
    }
  }

  function handleTerminate(): void {
    cleanupRegistry();
    pingResults = [];
    demoOutput = '';
    status = 'terminated';
  }

  onMount(() => {
    syncWorkerCount();

    const handlePageHide = (): void => {
      cleanupRegistry();
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      cleanupRegistry();
    };
  });

  onDestroy(() => {
    cleanupRegistry();
  });
</script>

<svelte:head>
  <title>WEFT Worker Mesh Dev Route</title>
</svelte:head>

<section class="page-shell">
  <header class="hero-card">
    <p class="eyebrow">_dev/workers</p>
    <h1>Worker mesh + Comlink RPC</h1>
    <p class="lead">Main-thread orchestrator managing 5 committee workers, 3 hospital workers, and 1 aggregator worker.</p>
  </header>

  <div class="action-row">
    <button id="spawn" on:click={handleSpawn} disabled={status === 'spawning'}>Spawn workers</button>
    <button id="ping-all" on:click={handlePingAll} disabled={!registry || status === 'pinging' || status === 'running-demo'}>Ping all</button>
    <button id="run-demo" on:click={handleRunDemo} disabled={!registry || status === 'running-demo' || status === 'pinging'}>Run round demo</button>
    <button id="terminate" on:click={handleTerminate} disabled={!registry}>Terminate workers</button>
  </div>

  {#if errorMessage}
    <p class="error-banner">{errorMessage}</p>
  {/if}

  <div class="summary-grid">
    <article>
      <h2>Registry</h2>
      <dl>
        <div><dt>Status</dt><dd>{status}</dd></div>
        <div><dt>Worker count</dt><dd>{registry?.all.length ?? 0}</dd></div>
        <div><dt>Expected</dt><dd>{COMMITTEE_WORKER_COUNT + HOSPITAL_WORKER_COUNT + 1}</dd></div>
      </dl>
    </article>

    <article>
      <h2>Telemetry bridge</h2>
      <ul class="telemetry-summary">
        {#each telemetrySummary as item}
          <li>
            <span>{item.kind}</span>
            <strong>{item.count}</strong>
          </li>
        {/each}
      </ul>
    </article>
  </div>

  <article class="panel">
    <h2>Round-trip latency</h2>
    <ol id="results" class="results-list">
      {#each pingResults as result}
        <li>{result.workerId} · {result.role} · ok {result.roundTripMs}ms</li>
      {/each}
    </ol>
  </article>

  <div class="panel-grid">
    <article class="panel telemetry-panel">
      <h2>Telemetry events</h2>
      <ol class="event-list">
        {#each telemetryEvents as telemetry}
          <li>
            <div>
              <strong>{telemetry.workerId}</strong>
              <span>{telemetry.event.kind}</span>
            </div>
            <small>{telemetry.event.ciphertextPreview ?? 'redacted'}</small>
          </li>
        {/each}
      </ol>
    </article>

    <article class="panel">
      <h2>Demo output</h2>
      <pre>{demoOutput || 'Run the demo to exercise DKG → encrypt → aggregate → threshold decrypt.'}</pre>
    </article>
  </div>
</section>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #08111f;
    color: #e2e8f0;
  }

  .page-shell {
    max-width: 72rem;
    margin: 0 auto;
    padding: 2rem;
    display: grid;
    gap: 1.5rem;
  }

  .hero-card,
  .panel,
  .summary-grid article {
    background: rgba(15, 23, 42, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 1rem;
    padding: 1.25rem;
    box-shadow: 0 18px 60px rgba(8, 15, 28, 0.4);
  }

  .eyebrow {
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #38bdf8;
    font-size: 0.75rem;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  .lead {
    margin-top: 0.75rem;
    color: #cbd5e1;
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  button {
    border: 0;
    border-radius: 999px;
    padding: 0.75rem 1rem;
    font: inherit;
    font-weight: 600;
    background: linear-gradient(135deg, #14b8a6, #0ea5e9);
    color: #03111b;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .summary-grid,
  .panel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1rem;
  }

  .error-banner {
    margin: 0;
    border-radius: 0.75rem;
    border: 1px solid rgba(248, 113, 113, 0.4);
    background: rgba(127, 29, 29, 0.35);
    color: #fecaca;
    padding: 0.9rem 1rem;
  }

  dl,
  .telemetry-summary,
  .results-list,
  .event-list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  dl div,
  .telemetry-summary li,
  .results-list li,
  .event-list li {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .results-list li {
    justify-content: flex-start;
  }

  .event-list li {
    flex-direction: column;
    align-items: flex-start;
  }

  .event-list div {
    display: flex;
    width: 100%;
    justify-content: space-between;
    gap: 1rem;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.9rem;
    color: #bfdbfe;
  }
</style>
