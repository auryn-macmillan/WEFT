<svelte:head>
  <title>WEFT - Weighted Encrypted Federated Training</title>
  <meta
    name="description"
    content="WEFT is a privacy-preserving federated training demo scaffold built on The Interfold."
  />
</svelte:head>

<section class="hero">
  <div class="hero-content">
    <p class="eyebrow">Weighted Encrypted Federated Training</p>
    <h1>WEFT</h1>
    <p class="lead">
      A privacy-preserving federated learning (FL) system built on 
      <a href="https://www.theinterfold.com" target="_blank" rel="noopener noreferrer">The Interfold</a> — 
      infrastructure for confidential coordination.
    </p>

    <div class="description-card">
      <p>
        In WEFT, multiple participating clients (like hospitals or research labs) train a shared machine learning model without ever exposing their raw data. They encrypt their quantized gradient updates under a committee's threshold BFV public key and submit them on-chain.
      </p>
      <p>
        The ciphernode committee homomorphically sums all ciphertexts inside a RISC Zero zkVM, then threshold-decrypts the result. The coordinator receives the plaintext aggregated gradient, applies the average, and updates the global model. <strong>No plaintext gradients are ever visible to any single party.</strong>
      </p>
    </div>

    <div class="preview-section">
      <h2>What you'll see in the walkthrough:</h2>
      <ul>
        <li><strong>Client Registration:</strong> Meet the clients participating in the FL round.</li>
        <li><strong>Key Generation:</strong> Distributed Key Generation (DKG) to create the shared threshold BFV key.</li>
        <li><strong>Local Training:</strong> Clients compute local gradients and encrypt them with BFV.</li>
        <li><strong>Homomorphic Aggregation:</strong> Ciphernodes securely sum the encrypted updates in the zkVM.</li>
        <li><strong>Global Update:</strong> Threshold decryption of the aggregate to update the shared model.</li>
      </ul>
    </div>

    <nav class="actions">
      <a class="cta primary" href="/walkthrough/1-meet" data-testid="start-walkthrough">
        Start the walkthrough →
      </a>
      <a class="cta secondary" href="/sandbox" data-testid="open-sandbox">
        Open sandbox
      </a>
    </nav>

    <section data-testid="about-demo" class="about">
      <p>
        This is a <strong>simulated</strong> demonstration of privacy-preserving federated training.
        Please read the <a href="/honest-framing" data-testid="honest-framing-link">Honest Framing & Disclosures</a> before proceeding.
      </p>
    </section>
  </div>
</section>

<style>
  .hero {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 3rem 1.5rem;
    background: var(--color-secondary); /* Mint Drenched */
    color: var(--color-primary);
  }

  .hero-content {
    max-width: 48rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  h1 {
    margin: 0;
    font-size: clamp(3rem, 8vw, 5.5rem);
    letter-spacing: -0.02em;
    font-weight: 700;
    line-height: 1.1;
  }

  .eyebrow {
    margin: 0;
    color: var(--color-text-muted);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: var(--text-sm);
  }

  .lead {
    margin: 0;
    font-size: var(--text-xl);
    line-height: var(--leading-snug);
  }

  .lead a {
    color: var(--color-primary);
    text-decoration: underline;
    text-decoration-color: var(--color-text-muted);
    text-underline-offset: 4px;
    font-weight: 600;
  }

  .description-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    box-shadow: var(--shadow-sm);
  }

  .description-card p {
    margin: 0 0 1rem 0;
  }
  .description-card p:last-child {
    margin-bottom: 0;
  }

  .preview-section {
    background: rgba(255, 255, 255, 0.4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
  }

  .preview-section h2 {
    margin: 0 0 1rem 0;
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .preview-section ul {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preview-section li {
    line-height: var(--leading-snug);
  }

  .actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-top: 1rem;
  }

  .cta {
    display: inline-block;
    padding: 0.875rem 1.75rem;
    border-radius: var(--radius-full);
    text-decoration: none;
    font-weight: 600;
    font-size: var(--text-base);
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .cta:hover {
    transform: translateY(-2px);
  }

  .cta.primary {
    background: var(--color-accent);
    color: var(--color-secondary); /* Text color inside CTA is mint */
  }

  .cta.secondary {
    background: var(--color-surface);
    color: var(--color-primary);
    border: 1px solid var(--color-border);
  }

  .about {
    margin-top: 2rem;
    font-size: var(--text-sm);
    line-height: 1.5;
    padding: 1rem;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
  }

  .about a {
    color: var(--color-primary);
    text-decoration: underline;
  }
</style>
