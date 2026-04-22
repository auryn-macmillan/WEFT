<script lang="ts">
  import type { PhaseId } from '../content/phases';
  import { PHASES } from '../content/phases';

  export let phases: PhaseId[] = PHASES.map(p => p.id);
  export let current: PhaseId;
  export let visited: Set<PhaseId>;
  export let onJump: ((id: PhaseId) => void) | undefined = undefined;

  function handleJump(id: PhaseId) {
    if (visited.has(id) && onJump) {
      onJump(id);
    }
  }

  function handleKeydown(event: KeyboardEvent, id: PhaseId) {
    if ((event.key === 'Enter' || event.key === ' ') && visited.has(id)) {
      event.preventDefault();
      handleJump(id);
    }
  }
</script>

<div class="phase-progress" role="group" aria-label="Phase navigation">
  {#each phases as id, index}
    {@const isCurrent = current === id}
    {@const isVisited = visited.has(id)}
    {@const isLocked = !isVisited}
    
    <button
      type="button"
      class="dot" 
      class:current={isCurrent}
      class:visited={isVisited}
      class:locked={isLocked}
      style:--dot-color="var(--color-phase-{index + 1})"
      aria-disabled={isLocked}
      aria-current={isCurrent ? 'step' : undefined}
      on:click={() => handleJump(id)}
      on:keydown={(e) => handleKeydown(e, id)}
      title={PHASES.find(p => p.id === id)?.title}
    >
      <div class="inner-dot"></div>
    </button>
    
    {#if index < phases.length - 1}
      <div 
        class="connector" 
        class:active={visited.has(phases[index + 1])}
      ></div>
    {/if}
  {/each}
</div>

<style>
  .phase-progress {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
  }

  .dot {
    width: 24px;
    height: 24px;
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-surface);
    border: 2px solid var(--color-border);
    transition: all var(--duration-base) var(--ease-out);
    padding: 0;
    cursor: default;
  }

  .dot.visited {
    cursor: pointer;
    border-color: var(--dot-color);
  }
  
  .dot.visited:hover {
    transform: scale(1.1);
  }

  .dot.locked {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .inner-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-full);
    background-color: transparent;
    transition: all var(--duration-base) var(--ease-out);
  }

  .dot.current {
    border-color: var(--dot-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--dot-color) 20%, transparent);
  }

  .dot.current .inner-dot {
    background-color: var(--dot-color);
  }
  
  .dot.visited:not(.current) .inner-dot {
    background-color: var(--dot-color);
    opacity: 0.4;
  }

  .connector {
    flex: 1;
    height: 2px;
    background-color: var(--color-border);
    min-width: 12px;
    transition: background-color var(--duration-base) var(--ease-out);
  }

  .connector.active {
    background-color: var(--color-text-muted);
  }
</style>