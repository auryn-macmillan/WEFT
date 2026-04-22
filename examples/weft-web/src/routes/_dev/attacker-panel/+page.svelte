<script lang="ts">
  import AttackerPanel from '$lib/components/AttackerPanel.svelte';
  import CiphertextTile from '$lib/components/CiphertextTile.svelte';
  import type { TelemetryEvent, TelemetryEventKind } from '$lib/crypto/engine';
  import { onMount } from 'svelte';

  const KINDS: TelemetryEventKind[] = [
    'dkg-start', 'dkg-done', 'encrypt-start', 'encrypt-done', 
    'aggregate-start', 'aggregate-done', 'partial-decrypt-start', 
    'partial-decrypt-done', 'combine-start', 'combine-done'
  ];

  // Generate 20 mock events
  const mockEvents: TelemetryEvent[] = Array.from({ length: 20 }).map((_, i) => ({
    kind: KINDS[i % KINDS.length],
    timestamp: Date.now() - (20 - i) * 5000,
    partyIndex: i % 3,
    ciphertextPreview: i % 2 === 0 ? 
      Array.from({length: 32}, () => Math.floor(Math.random()*16).toString(16)).join('') : 
      undefined
  }));

  // Create some tiles for the showcase
  const tiles = [
    { id: 'ab12c3', byteCount: 4096, status: 'pending' as const },
    { id: 'df45e6', byteCount: 8192, status: 'in-flight' as const },
    { id: '789abc', byteCount: 4096, status: 'arrived' as const },
    { id: 'def012', byteCount: 16384, status: 'aggregated' as const },
  ];

</script>

<div class="dev-container">
  <div class="main-content">
    <h1>Attacker Panel & Ciphertext Tile Dev Preview</h1>
    
    <section class="tiles-section">
      <h2>Ciphertext Tiles</h2>
      <div class="tiles-grid">
        {#each tiles as tile}
          <div class="tile-wrapper">
            <h3>Status: {tile.status}</h3>
            <CiphertextTile 
              id={tile.id} 
              byteCount={tile.byteCount} 
              status={tile.status} 
            />
          </div>
        {/each}
      </div>
    </section>
  </div>

  <AttackerPanel events={mockEvents} isOpen={true} />
</div>

<style>
  .dev-container {
    display: flex;
    min-height: 100vh;
    background-color: var(--color-neutral-900);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
  }

  .main-content {
    flex: 1;
    padding: var(--space-6);
    /* Leave room for the side panel */
    padding-right: 340px; 
  }

  h1 {
    font-size: var(--text-2xl);
    margin-bottom: var(--space-6);
    color: var(--color-primary);
  }

  h2 {
    font-size: var(--text-xl);
    margin-bottom: var(--space-4);
    border-bottom: 1px solid var(--color-neutral-800);
    padding-bottom: var(--space-2);
  }

  h3 {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-bottom: var(--space-2);
    text-transform: capitalize;
  }

  .tiles-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-6);
  }

  .tile-wrapper {
    display: flex;
    flex-direction: column;
  }

  @media (max-width: 767px) {
    .main-content {
      padding-right: var(--space-4);
      padding-bottom: 60vh;
    }
  }
</style>
