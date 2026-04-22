<script lang="ts">
  import type { TelemetryEvent } from '../crypto/engine';
  import { ATTACKER_COPY } from '../content/attacker';

  export let events: TelemetryEvent[] = [];
  export let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  }

  function formatTime(ts: number) {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
  }

  function getEventLabel(kind: string): string {
    switch(kind) {
      case 'dkg-start': return 'Keygen Init';
      case 'dkg-done': return 'Keygen Done';
      case 'encrypt-start': return 'Encrypting';
      case 'encrypt-done': return 'Encrypted';
      case 'aggregate-start': return 'Aggregating';
      case 'aggregate-done': return 'Aggregated';
      case 'partial-decrypt-start': return 'Decrypt Start';
      case 'partial-decrypt-done': return 'Decrypt Done';
      case 'combine-start': return 'Combine Init';
      case 'combine-done': return 'Combined';
      default: return kind;
    }
  }

  function getEventSource(event: TelemetryEvent): string {
    if (event.partyIndex !== undefined) {
      return `P${event.partyIndex}`;
    }
    return 'Sys';
  }
</script>

<div class="attacker-panel" class:is-open={isOpen}>
  <div 
    class="panel-header" 
    role="button" 
    tabindex="0" 
    on:click={toggle}
    on:keydown={handleKeydown}
    aria-expanded={isOpen}
  >
    <div class="header-title">
      <svg aria-hidden="true" class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      {ATTACKER_COPY.title}
    </div>
    <div class="toggle-icon">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>

  <div class="panel-content" aria-hidden={!isOpen}>
    <div class="overview">
      <p>{ATTACKER_COPY.overview}</p>
    </div>

    <div class="event-list" aria-live="polite">
      {#each events as event (event.timestamp + event.kind)}
        <div class="event-item">
          <div class="event-meta">
            <span class="time">{formatTime(event.timestamp)}</span>
            <span class="source">{getEventSource(event)} &rarr; Net</span>
          </div>
          <div class="event-body">
            <span class="operation">[{getEventLabel(event.kind)}]</span>
            {#if event.ciphertextPreview}
              <span class="hex-preview">{event.ciphertextPreview.slice(0, 32)}...</span>
            {:else}
              <span class="hex-preview">no payload</span>
            {/if}
          </div>
        </div>
      {/each}
      {#if events.length === 0}
        <div class="empty-state">No network traffic detected.</div>
      {/if}
    </div>

    <div class="footer">
      <p class="footer-text">What the attacker sees: only this</p>
      <!-- T16 fills -->
    </div>
  </div>
</div>

<style>
  .attacker-panel {
    position: fixed;
    z-index: 50;
    background-color: var(--color-primary);
    border: 1px solid var(--color-danger);
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
    transition: transform var(--duration-base) var(--ease-in-out);
  }

  /* Desktop layout: Right side panel */
  @media (min-width: 768px) {
    .attacker-panel {
      top: 0;
      right: 0;
      bottom: 0;
      width: 320px;
      border-right: none;
      border-top: none;
      border-bottom: none;
      transform: translateX(100%);
    }

    .attacker-panel.is-open {
      transform: translateX(0);
    }
    
    .panel-header {
      border-bottom: 1px solid var(--color-danger);
    }
  }

  /* Mobile layout: Bottom sheet */
  @media (max-width: 767px) {
    .attacker-panel {
      bottom: 0;
      left: 0;
      right: 0;
      height: 60vh;
      border-bottom: none;
      border-left: none;
      border-right: none;
      border-top-left-radius: var(--radius-lg);
      border-top-right-radius: var(--radius-lg);
      transform: translateY(100%);
    }

    .attacker-panel.is-open {
      transform: translateY(0);
    }
    
    .panel-header {
      position: absolute;
      top: -48px; /* Stick out above the panel when closed */
      left: 0;
      right: 0;
      background-color: var(--color-primary);
      border: 1px solid var(--color-danger);
      border-bottom: none;
      border-top-left-radius: var(--radius-lg);
      border-top-right-radius: var(--radius-lg);
    }
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    background-color: rgba(239, 68, 68, 0.1);
    color: var(--color-danger);
    font-weight: 700;
    letter-spacing: 0.05em;
    user-select: none;
  }

  .panel-header:hover, .panel-header:focus {
    background-color: rgba(239, 68, 68, 0.2);
    outline: none;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    text-transform: uppercase;
  }

  .icon {
    width: 16px;
    height: 16px;
  }

  .toggle-icon {
    width: 20px;
    height: 20px;
    transition: transform var(--duration-base);
  }

  .is-open .toggle-icon {
    transform: rotate(180deg);
  }
  
  /* On desktop, rotate icon for side panel */
  @media (min-width: 768px) {
    .toggle-icon {
      transform: rotate(90deg);
    }
    .is-open .toggle-icon {
      transform: rotate(-90deg);
    }
    
    /* On desktop, header doesn't stick out, but we need a tab to open it */
    .attacker-panel:not(.is-open) .panel-header {
      position: absolute;
      left: -48px;
      top: 50%;
      transform: translateY(-50%) rotate(-90deg);
      transform-origin: right top;
      width: max-content;
      border: 1px solid var(--color-danger);
      border-bottom: none;
      border-radius: var(--radius-md) var(--radius-md) 0 0;
    }
  }

  .panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transition: opacity var(--duration-base);
  }

  .is-open .panel-content {
    opacity: 1;
  }

  .overview {
    padding: var(--space-4);
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    line-height: var(--leading-relaxed);
    border-bottom: 1px solid var(--color-surface);
  }

  .event-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    background-color: var(--color-primary);
  }

  .event-item {
    font-size: var(--text-xs);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    border-left: 2px solid var(--color-danger);
  }

  .event-meta {
    display: flex;
    justify-content: space-between;
    color: var(--color-text-muted);
    margin-bottom: var(--space-1);
    font-size: 10px;
  }

  .event-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .operation {
    color: var(--color-warning);
    font-weight: 700;
  }

  .hex-preview {
    color: var(--color-text-muted);
    word-break: break-all;
    font-size: 11px;
    letter-spacing: 0.05em;
  }

  .empty-state {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-muted);
    font-style: italic;
    font-size: var(--text-xs);
  }

  .footer {
    padding: var(--space-3);
    text-align: center;
    border-top: 1px solid var(--color-surface);
    background-color: rgba(239, 68, 68, 0.05);
  }

  .footer-text {
    font-size: var(--text-xs);
    color: var(--color-danger);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }
</style>
