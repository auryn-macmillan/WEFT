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
            Previous
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
            Next
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
    min-height: 100vh;
    background-color: var(--color-neutral-900);
    color: var(--color-neutral-100);
    font-family: var(--font-sans);
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4);
  }

  .header {
    margin-bottom: var(--space-8);
    border-bottom: 2px solid var(--phase-accent);
    padding-bottom: var(--space-4);
  }

  .phase-indicator {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .phase-number {
    font-size: var(--text-sm);
    color: var(--phase-accent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .phase-title {
    font-size: var(--text-3xl);
    font-weight: 700;
    margin: 0;
    color: var(--color-neutral-100);
  }

  .phase-tagline {
    font-size: var(--text-lg);
    color: var(--color-neutral-400);
    margin: 0;
  }

  .phase-description {
    font-size: var(--text-base);
    color: var(--color-neutral-300);
    line-height: var(--leading-relaxed);
    margin-bottom: var(--space-4);
  }

  .equations {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .math-block {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    background-color: var(--color-neutral-800);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    border-left: 2px solid var(--phase-accent);
    overflow-x: auto;
  }

  .body-container {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .footer {
    margin-top: var(--space-8);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-neutral-800);
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-4);
  }

  .spacer {
    flex: 1;
  }

  .btn {
    padding: var(--space-2) var(--space-6);
    border-radius: var(--radius-md);
    font-weight: 600;
    font-size: var(--text-base);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-in-out);
    border: none;
  }

  .btn-primary {
    background-color: var(--phase-accent);
    color: var(--color-neutral-900);
  }

  .btn-primary:hover {
    filter: brightness(1.1);
  }

  .btn-secondary {
    background-color: var(--color-neutral-800);
    color: var(--color-neutral-100);
    border: 1px solid var(--color-neutral-700);
  }

  .btn-secondary:hover {
    background-color: var(--color-neutral-700);
  }

  .btn-ghost {
    background-color: transparent;
    color: var(--color-neutral-400);
  }

  .btn-ghost:hover {
    color: var(--color-neutral-100);
  }
</style>