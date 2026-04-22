<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { phaseStore } from '$lib/stores/phase';
  import PhaseShell from '$lib/components/PhaseShell.svelte';
  import { HOSPITALS } from '$lib/content/hospitals';

  onMount(() => {
    phaseStore.markVisited('meet');
  });

  const committeeNodes = [
    'Node Alpha',
    'Node Beta',
    'Node Gamma',
    'Node Delta',
    'Node Epsilon'
  ];
</script>

<PhaseShell phaseId="meet" onNext={() => goto('/walkthrough/2-dkg')}>
  <svelte:fragment slot="body" let:level>
    <div class="framing-notice" data-testid="honest-framing">
      <strong>Real FHE math, simulated committee topology.</strong> <strong>What's real:</strong> the cryptography. <strong>What's simulated:</strong> the committee runs as 5 Web Workers on your machine; in production these would be 5 independent organizations.
    </div>

    <div class="content-grid">
      <section class="hospitals-section">
        <h2>Participating Hospitals</h2>
        <div class="cards-container">
          {#each HOSPITALS as hospital}
            <div class="card hospital-card">
              <div class="card-icon">{hospital.avatarKey}</div>
              <div class="card-details">
                <h3>{hospital.name}</h3>
                <p>Patients: {hospital.patientCount.toLocaleString()}</p>
                <p class="specialty">{hospital.specialty}</p>
              </div>
            </div>
          {/each}
        </div>
      </section>

      <section class="committee-section">
        <h2>Ciphernode Committee</h2>
        <p class="explainer">No single one can decrypt. A threshold majority is required to reveal any aggregate data.</p>
        <div class="cards-container committee-container">
          {#each committeeNodes as node}
            <div class="card committee-card">
              <div class="node-name">{node}</div>
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
    display: grid;
    gap: 3rem;
  }

  section h2 {
    font-size: var(--text-lg);
    font-weight: 600;
    margin-bottom: 1rem;
    color: var(--color-primary);
  }

  .explainer {
    font-size: 0.875rem;
    color: var(--color-text-muted);
    margin-bottom: 1rem;
  }

  .cards-container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .committee-container {
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
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

  .hospital-card .card-icon {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .hospital-card h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--color-primary);
  }

  .hospital-card p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }

  .hospital-card .specialty {
    color: var(--color-text-muted);
    font-style: italic;
  }

  .committee-card {
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 1.5rem 1rem;
  }

  .node-name {
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: var(--color-text-muted);
  }
</style>