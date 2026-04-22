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
      <strong>What's real:</strong> the cryptography. <strong>What's simulated:</strong> the committee runs as 5 Web Workers on your machine; in production these would be 5 independent organizations.
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
    background-color: var(--color-primary-900, #1e3a8a);
    color: var(--color-primary-100, #dbeafe);
    padding: 1rem;
    border-radius: 0.5rem;
    margin-bottom: 2rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--color-primary-500, #3b82f6);
  }

  .content-grid {
    display: grid;
    gap: 3rem;
  }

  section h2 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--color-neutral-100, #f3f4f6);
  }

  .explainer {
    font-size: 0.875rem;
    color: var(--color-neutral-400, #9ca3af);
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
    background-color: var(--color-neutral-800, #1f2937);
    border: 1px solid var(--color-neutral-700, #374151);
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hospital-card .card-icon {
    font-size: 0.75rem;
    color: var(--color-neutral-400, #9ca3af);
    text-transform: uppercase;
  }

  .hospital-card h3 {
    margin: 0;
    font-size: 1rem;
    color: var(--color-neutral-100, #f3f4f6);
  }

  .hospital-card p {
    margin: 0;
    font-size: 0.875rem;
    color: var(--color-neutral-300, #d1d5db);
  }

  .hospital-card .specialty {
    color: var(--color-neutral-400, #9ca3af);
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
    color: var(--color-neutral-200, #e5e7eb);
  }
</style>