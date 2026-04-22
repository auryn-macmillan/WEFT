<script lang="ts">
  import type { PhaseId } from '../content/phases';
  import { PHASES } from '../content/phases';
  import AttackerPanel from './AttackerPanel.svelte';
  import ProgressiveDisclosure from './ProgressiveDisclosure.svelte';

  export let phaseId: PhaseId;
  export let onNext: (() => void) | undefined = undefined;
  export let onPrev: (() => void) | undefined = undefined;
  export let onPause: (() => void) | undefined = undefined;

  $: phaseIndex = PHASES.findIndex(p => p.id === phaseId);
  $: phase = PHASES[phaseIndex];
  $: accentColor = `var(--color-phase-${phaseIndex + 1})`;
  $: totalPhases = PHASES.length;

  let attackerPanelOpen = false;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && onNext) {
      onNext();
    } else if (event.key === 'Escape' && onPause) {
      onPause();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="phase-shell" style:--phase-accent={accentColor}>
  <div class="main-content">
    <header class="header">
      <div class="phase-indicator">
        <span class="phase-number">Phase {phaseIndex + 1} of {totalPhases}</span>
        <h1 class="phase-title">{phase.title}</h1>
        {#if phase.tagline}
          <p class="phase-tagline">{phase.tagline}</p>
        {/if}
      </div>
    </header>

    <main class="body-container">
      <ProgressiveDisclosure>
        <div slot="novice">
          <p class="phase-description">{phase.body.novice}</p>
          <slot name="body" level="novice" />
        </div>
        <div slot="learn-more">
          <p class="phase-description">{phase.body['learn-more']}</p>
          <slot name="body" level="learn-more" />
        </div>
        <div slot="show-math">
          <p class="phase-description">{phase.body['show-math']}</p>
          {#if phase.equations}
            <div class="equations">
              {#each phase.equations as eq}
                <div class="math-block">{eq}</div>
              {/each}
            </div>
          {/if}
          <slot name="body" level="show-math" />
        </div>
      </ProgressiveDisclosure>
    </main>

    <footer class="footer">
      <div class="controls">
        {#if onPrev}
          <button class="btn btn-secondary" on:click={onPrev}>
            ← Previous
          </button>
        {:else}
          <div class="spacer"></div>
        {/if}
        
        {#if onPause}
          <button class="btn btn-ghost" on:click={onPause}>
            Pause
          </button>
        {/if}

        {#if onNext}
          <button class="btn btn-primary" on:click={onNext}>
            Next phase →
          </button>
        {/if}
      </div>
    </footer>
  </div>

  <AttackerPanel bind:isOpen={attackerPanelOpen} events={[]} />
</div>

<style>
  .phase-shell {
    display: flex;
    width: 100%;
    min-height: 100dvh;
    background-color: var(--color-secondary); /* Mint Drenched */
    color: var(--color-primary);
    font-family: var(--font-sans);
    justify-content: center;
    padding: 3rem 1.5rem;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 48rem;
    margin: 0 auto;
    width: 100%;
    gap: 1.5rem;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .phase-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .phase-number {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .phase-title {
    margin: 0;
    font-size: clamp(3rem, 8vw, 5.5rem);
    letter-spacing: -0.02em;
    font-weight: 700;
    line-height: 1.1;
    color: var(--color-primary);
  }

  .phase-tagline {
    margin: 0;
    font-size: var(--text-xl);
    line-height: var(--leading-snug);
    color: var(--color-primary);
    margin-top: 1rem;
  }

  .phase-description {
    font-size: var(--text-base);
    color: var(--color-primary);
    line-height: var(--leading-normal);
    margin-bottom: 1.5rem;
  }

  .equations {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .math-block {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background-color: var(--color-surface);
    color: var(--color-primary);
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--phase-accent);
    overflow-x: auto;
    box-shadow: var(--shadow-sm);
  }

  .body-container {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .footer {
    margin-top: 2rem;
    padding-top: 1rem;
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .btn {
    display: inline-block;
    padding: 0.875rem 1.75rem;
    border-radius: var(--radius-full);
    text-decoration: none;
    font-weight: 600;
    font-size: var(--text-base);
    transition: transform 0.15s ease, opacity 0.15s ease;
    border: none;
    cursor: pointer;
  }

  .btn:hover {
    transform: translateY(-2px);
  }

  .btn-primary {
    background-color: var(--color-accent);
    color: var(--color-secondary);
  }

  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-primary);
    border: 1px solid var(--color-border);
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--color-text-muted);
    font-weight: 600;
  }

  .btn-ghost:hover {
    color: var(--color-primary);
  }
</style>
