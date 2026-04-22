<script lang="ts">
  import '../../../lib/tokens.css';
</script>

<!-- 
  DEV-ONLY ROUTE: This page serves as a design system reference for all CSS custom properties.
  It is not intended for production usage.
-->

<div class="palette-container">
  <header class="header">
    <h1>WEFT Design Tokens</h1>
    <p>Developer Reference Palette (DEV ONLY)</p>
  </header>

  <section class="section">
    <h2>1. Colors</h2>
    
    <h3>Core & Semantic</h3>
    <div class="swatch-grid">
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-primary);"></div>
        <code>--color-primary</code>
      </div>
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-secondary);"></div>
        <code>--color-secondary</code>
      </div>
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-success);"></div>
        <code>--color-success</code>
      </div>
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-warning);"></div>
        <code>--color-warning</code>
      </div>
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-danger);"></div>
        <code>--color-danger</code>
      </div>
      <div class="swatch-item">
        <div class="swatch" style="background: var(--color-info);"></div>
        <code>--color-info</code>
      </div>
    </div>

    <h3>Neutral Scale</h3>
    <div class="swatch-grid">
      {#each [100, 200, 300, 400, 500, 600, 700, 800, 900] as step}
        <div class="swatch-item">
          <div class="swatch" style="background: var(--color-neutral-{step});"></div>
          <code>--color-neutral-{step}</code>
        </div>
      {/each}
    </div>

    <h3>Phase Accent Hues</h3>
    <div class="swatch-grid">
      {#each [1, 2, 3, 4, 5, 6, 7, 8] as step}
        <div class="swatch-item">
          <div class="swatch" style="background: var(--color-phase-{step});"></div>
          <code>--color-phase-{step}</code>
        </div>
      {/each}
    </div>
  </section>

  <section class="section">
    <h2>2. Typography</h2>
    
    <div class="typo-examples">
      <div style="font-family: var(--font-sans); font-size: var(--text-4xl); font-weight: 700;">
        var(--text-4xl) - Sans Bold
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-3xl);">
        var(--text-3xl) - The quick brown fox
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-2xl);">
        var(--text-2xl) - The quick brown fox
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-xl);">
        var(--text-xl) - The quick brown fox
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-lg);">
        var(--text-lg) - The quick brown fox
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-base);">
        var(--text-base) - The quick brown fox jumps over the lazy dog
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-sm);">
        var(--text-sm) - The quick brown fox jumps over the lazy dog
      </div>
      <div style="font-family: var(--font-sans); font-size: var(--text-xs);">
        var(--text-xs) - The quick brown fox jumps over the lazy dog
      </div>
      <div style="font-family: var(--font-mono); font-size: var(--text-base); margin-top: 1rem;">
        var(--font-mono) - The quick brown fox
      </div>
    </div>
  </section>

  <section class="section">
    <h2>3. Spacing</h2>
    <div class="spacing-grid">
      {#each [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as space}
        <div class="space-item">
          <code>--space-{space}</code>
          <div class="space-box" style="width: var(--space-{space}); height: var(--space-{space});"></div>
        </div>
      {/each}
    </div>
  </section>

  <section class="section">
    <h2>4. Shadows & Radius</h2>
    <div class="shadow-grid">
      <div class="shadow-box" style="border-radius: var(--radius-sm); box-shadow: var(--shadow-xs);">xs / radius-sm</div>
      <div class="shadow-box" style="border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">sm / radius-md</div>
      <div class="shadow-box" style="border-radius: var(--radius-lg); box-shadow: var(--shadow-md);">md / radius-lg</div>
      <div class="shadow-box" style="border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);">lg / radius-xl</div>
      <div class="shadow-box" style="border-radius: var(--radius-full); box-shadow: var(--shadow-md);">full radius</div>
    </div>
  </section>

</div>

<style>
  .palette-container {
    font-family: var(--font-sans, system-ui);
    padding: var(--space-8, 32px);
    max-width: 1200px;
    margin: 0 auto;
    color: var(--color-secondary);
    background: var(--color-primary);
  }
  
  .header {
    margin-bottom: var(--space-10, 40px);
    padding-bottom: var(--space-4, 16px);
    border-bottom: 1px solid var(--color-text-muted);
  }
  
  .header h1 {
    font-size: var(--text-3xl, 30px);
    margin: 0 0 var(--space-2, 8px) 0;
  }
  
  .header p {
    color: var(--color-danger, #ef4444);
    font-weight: bold;
    margin: 0;
  }
  
  .section {
    margin-bottom: var(--space-12, 48px);
  }
  
  .section h2 {
    font-size: var(--text-2xl, 24px);
    margin-bottom: var(--space-6, 24px);
    color: var(--color-primary);
  }
  
  h3 {
    font-size: var(--text-lg, 18px);
    margin-top: var(--space-6, 24px);
    margin-bottom: var(--space-4, 16px);
  }

  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--space-4, 16px);
  }

  .swatch-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .swatch {
    width: 100%;
    height: 80px;
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow-sm);
    border: 1px solid var(--color-text-muted);
  }

  code {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 12px);
    background: var(--color-text-muted);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    border-radius: var(--radius-sm, 4px);
    text-align: center;
  }

  .typo-examples {
    display: flex;
    flex-direction: column;
    gap: var(--space-4, 16px);
  }

  .spacing-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6, 24px);
    align-items: flex-end;
  }

  .space-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .space-box {
    background: var(--color-info, #3b82f6);
    border-radius: 2px;
  }

  .shadow-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-8, 32px);
  }

  .shadow-box {
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: white;
    font-size: var(--text-sm, 14px);
    color: var(--color-border);
  }
</style>
