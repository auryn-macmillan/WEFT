<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { CryptoEngine } from '../crypto/engine';
  import { PARAMETERS } from '../content/parameters';

  export let open: boolean = false;
  export let engine: CryptoEngine;
  export let nMax: number = 10;

  let showMath = false;

  $: params = engine.getParams();
  $: S = BigInt(4096);
  $: G = BigInt(1);
  $: t = params.plaintextModulus;
  $: limit = t / 2n;
  $: computed = BigInt(nMax) * S * G;
  $: safe = computed < limit;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      open = false;
    }
  }

  function trapFocus(node: HTMLElement) {
    const focusableElements = node.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    function handleFocus(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    }

    node.addEventListener('keydown', handleFocus);
    firstElement?.focus();

    return {
      destroy() {
        node.removeEventListener('keydown', handleFocus);
      }
    };
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="overlay" transition:fade={{ duration: 200 }}>
    <div 
      class="modal" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="modal-title"
      use:trapFocus
    >
      <div class="header">
        <h2 id="modal-title">BFV Parameters & Overflow Invariant</h2>
        <button class="close-btn" on:click={() => (open = false)} aria-label="Close modal">×</button>
      </div>

      <div class="content">
        <div class="params-grid">
          <div class="param-card">
            <strong>Preset</strong>
            <span>{params.presetId}</span>
          </div>
          <div class="param-card">
            <strong>t (Plaintext Modulus)</strong>
            <span>{params.plaintextModulus.toString()}</span>
          </div>
          <div class="param-card">
            <strong>N (Degree)</strong>
            <span>{params.polyDegree}</span>
          </div>
          <div class="param-card">
            <strong>S (Scale Factor)</strong>
            <span>{S.toString()}</span>
          </div>
          <div class="param-card">
            <strong>Threshold</strong>
            <span>{params.threshold}-of-{params.committeeSize}</span>
          </div>
          <div class="param-card">
            <strong>λ (Security)</strong>
            <span>128-bit</span>
          </div>
        </div>

        <div class="invariant-section">
          <h3>Overflow Invariant</h3>
          <p class="description">
            To prevent silent overflow during homomorphic addition, the accumulated sum of quantized gradients must not wrap around t/2.
          </p>
          <div class="slider-container">
            <label for="nmax-slider">Max Clients (nMax): {nMax}</label>
            <input 
              id="nmax-slider" 
              type="range" 
              min="1" 
              max="50" 
              bind:value={nMax}
            />
          </div>
          <div class="equation" class:safe class:violated={!safe}>
            <div class="math-line">
              <span>nMax × S × G</span>
              <span>&lt;</span>
              <span>t / 2</span>
            </div>
            <div class="math-line numbers">
              <span>{nMax} × {S.toString()} × {G.toString()} = {computed.toString()}</span>
              <span>vs</span>
              <span>{limit.toString()}</span>
            </div>
            <div class="status">
              {#if safe}
                <span class="icon-safe">✓ Safe</span>
              {:else}
                <span class="icon-violated">✗ Violated</span>
              {/if}
            </div>
          </div>
        </div>

        <div class="disclosure-tier">
          <button class="disclosure-btn" on:click={() => showMath = !showMath} aria-expanded={showMath}>
            {showMath ? 'Hide Math' : 'Show Math'}
          </button>
          {#if showMath}
            <div class="math-details" transition:fade={{ duration: 150 }}>
              <h4>BFV Encryption Formula</h4>
              <code>c = (a·s + e + Δ·m, -a)</code>
              <ul class="parameter-descriptions">
                {#each PARAMETERS as param}
                  <li>
                    <strong>{param.symbol} ({param.name}):</strong> {param.description}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: var(--color-neutral-100);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    font-family: var(--font-sans);
    color: var(--color-neutral-900);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-neutral-300);
  }

  .header h2 {
    margin: 0;
    font-size: var(--text-xl);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: var(--text-2xl);
    cursor: pointer;
    color: var(--color-neutral-600);
  }

  .close-btn:hover {
    color: var(--color-neutral-900);
  }

  .content {
    padding: var(--space-6);
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .params-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-4);
  }

  .param-card {
    background-color: var(--color-neutral-200);
    padding: var(--space-3);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .param-card strong {
    font-size: var(--text-sm);
    color: var(--color-neutral-700);
  }

  .param-card span {
    font-size: var(--text-base);
    font-family: var(--font-mono);
  }

  .invariant-section {
    background-color: var(--color-neutral-100);
    border: 1px solid var(--color-neutral-300);
    border-radius: var(--radius-md);
    padding: var(--space-4);
  }

  .invariant-section h3 {
    margin-top: 0;
    margin-bottom: var(--space-2);
  }

  .description {
    font-size: var(--text-sm);
    color: var(--color-neutral-600);
    margin-bottom: var(--space-4);
  }

  .slider-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .slider-container input {
    width: 100%;
  }

  .equation {
    background-color: var(--color-neutral-900);
    color: var(--color-neutral-100);
    padding: var(--space-4);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    position: relative;
    border-left: 4px solid transparent;
  }

  .equation.safe {
    border-left-color: var(--color-success);
  }

  .equation.violated {
    border-left-color: var(--color-danger);
  }

  .math-line {
    display: flex;
    justify-content: space-between;
  }

  .math-line.numbers {
    color: var(--color-neutral-400);
    font-size: var(--text-sm);
  }

  .status {
    margin-top: var(--space-2);
    font-weight: bold;
    text-align: right;
  }

  .icon-safe {
    color: var(--color-success);
  }

  .icon-violated {
    color: var(--color-danger);
  }

  .disclosure-tier {
    border-top: 1px solid var(--color-neutral-300);
    padding-top: var(--space-4);
  }

  .disclosure-btn {
    background: none;
    border: none;
    color: var(--color-info);
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: bold;
    padding: 0;
  }

  .math-details {
    margin-top: var(--space-4);
    background-color: var(--color-neutral-200);
    padding: var(--space-4);
    border-radius: var(--radius-md);
  }

  .math-details h4 {
    margin-top: 0;
    margin-bottom: var(--space-2);
  }

  .math-details code {
    display: block;
    background-color: var(--color-neutral-900);
    color: var(--color-neutral-100);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-4);
  }

  .parameter-descriptions {
    margin: 0;
    padding-left: var(--space-4);
    font-size: var(--text-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
