<svelte:head>
  <title>WEFT</title>
  <meta
    name="description"
    content="WEFT is a privacy-preserving federated training demo scaffold."
  />
</svelte:head>

<section class="hero">
  <p class="eyebrow">Weighted Encrypted Federated Training</p>
  <h1>WEFT</h1>
  <p class="lead">A minimal SvelteKit scaffold for the federated learning demo.</p>
</section>

<style>
  .hero {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: clamp(3rem, 10vw, 7rem);
    letter-spacing: 0.1em;
  }

  .eyebrow,
  .lead {
    margin: 0;
    color: #475569;
  }
</style>
