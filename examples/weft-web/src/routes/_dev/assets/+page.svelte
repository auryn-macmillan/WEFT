<script lang="ts">
  import { assets } from '$lib/assets';
</script>

<svelte:head>
  <title>SVG Asset Gallery | WEFT</title>
</svelte:head>

<div class="gallery">
  <h1>WEFT Illustrated SVG Asset Gallery</h1>
  <p>All assets are inline SVGs rendered using <code>&#123;@html ...&#125;</code>.</p>

  <section>
    <h2>Hospitals</h2>
    <div class="grid">
      {#each Object.entries(assets.hospitals) as [name, svg]}
        <div class="card">
          <div class="svg-container">{@html svg}</div>
          <div class="label">{name}</div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Committee Avatars</h2>
    <div class="grid">
      {#each Object.entries(assets.avatars) as [name, svg]}
        <div class="card">
          <div class="svg-container" style="width: 120px;">{@html svg}</div>
          <div class="label">{name}</div>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Icons & Crypto Elements</h2>
    <div class="grid">
      {#each Object.entries(assets.icons) as [name, svg]}
        {#if Array.isArray(svg)}
          {#each svg as item, index}
            <div class="card">
              <div class="svg-container" style="width: 80px;">{@html item}</div>
              <div class="label">{name}[{index}]</div>
            </div>
          {/each}
        {:else}
          <div class="card">
            <div class="svg-container" style="width: 80px;">{@html svg}</div>
            <div class="label">{name}</div>
          </div>
        {/if}
      {/each}
    </div>
  </section>

  <section>
    <h2>Phase Heroes</h2>
    <div class="grid heroes">
      {#each Object.entries(assets.heroes) as [name, svg]}
        <div class="card">
          <div class="svg-container">{@html svg}</div>
          <div class="label">{name}</div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .gallery {
    padding: 2rem;
    font-family: var(--font-sans, system-ui, sans-serif);
    max-width: 1200px;
    margin: 0 auto;
  }
  
  h1 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }
  
  p {
    color: #666;
    margin-bottom: 2rem;
  }
  
  section {
    margin-bottom: 3rem;
  }
  
  h2 {
    font-size: 1.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #eee;
    padding-bottom: 0.5rem;
  }
  
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1.5rem;
  }
  
  .grid.heroes {
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  }
  
  .card {
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: #fafafa;
  }
  
  .svg-container {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .label {
    font-family: var(--font-mono, monospace);
    font-size: 0.875rem;
    color: #333;
    background: #eee;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }
</style>
