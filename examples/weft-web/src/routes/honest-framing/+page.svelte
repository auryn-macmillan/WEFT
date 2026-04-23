<script>
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>Honest Framing & Disclosures — WEFT</title>
  <meta
    name="description"
    content="Honest framing and disclosures for the WEFT federated learning demo."
  />
</svelte:head>

<article class="page" data-testid="honest-framing-page">
  <p class="back"><a href="{base}/">← Back to home</a></p>

  <h1>Honest Framing &amp; Disclosures</h1>

  <p>
    WEFT (Weighted Encrypted Federated Training) is a privacy-preserving federated learning demo.
    It is designed to illustrate the flow of encrypted gradient updates and threshold decryption
    using the Interfold's cryptography.
  </p>

  <p class="callout">
    <strong>IMPORTANT:</strong> This is a demonstration scaffold, not a production-ready system.
  </p>

  <h2>Mandatory Disclosures</h2>
  <ol>
    <li>
      <strong>Simulated vs production committee:</strong> This demo runs 5 web workers within a
      single browser instance. This does not represent a geographically distributed set of
      ciphernodes. In a production environment, these nodes would be operated by independent
      parties with distinct trust boundaries.
    </li>
    <li>
      <strong>No on-chain component:</strong> While WEFT is designed to interact with the
      Interfold's E3 contracts, this web demo is entirely client-side. Ciphertexts and proofs are
      not published to Ethereum or any other blockchain.
    </li>
    <li>
      <strong>No RISC Zero proof:</strong> The secure process (homomorphic summation) is
      reimplemented in WASM for display purposes in this demo. It does not generate or verify
      RISC Zero zkVM proofs.
    </li>
    <li>
      <strong>Parameters match Interfold SECURE_THRESHOLD_8192 preset but production uses
      different trust model:</strong> The demo uses BFV parameters aligned with the Interfold's
      <code>SECURE_THRESHOLD_8192</code> preset to ensure cryptographic parity. However, the trust
      model in this demo is centralized to your browser, whereas production relies on the
      decentralized ciphernode committee and DKG.
    </li>
    <li>
      <strong>Demo uses seeded randomness for parity testing:</strong> For consistent behavior and
      easier verification across walkthrough steps, this demo uses seeded (pseudo)randomness.
      A production implementation must use fresh, high-entropy randomness for all cryptographic
      operations (key generation, encryption, etc.).
    </li>
  </ol>

  <h2>Intended Use</h2>
  <p>This demo is intended for:</p>
  <ul>
    <li>Visualizing the lifecycle of a federated learning round.</li>
    <li>Understanding how gradient updates are protected via BFV encryption.</li>
    <li>
      Demonstrating the "trust no one" property where individual data is never decrypted.
    </li>
  </ul>

  <p>It is <strong>not</strong> intended for:</p>
  <ul>
    <li>Storing or processing actual sensitive data.</li>
    <li>Benchmarking production performance.</li>
    <li>Security audits of the Interfold protocol.</li>
  </ul>

  <p class="proceed">
    <a class="cta" href="{base}/walkthrough/1-meet" data-testid="proceed-to-walkthrough">
      I understand — start the walkthrough →
    </a>
  </p>
</article>

<style>
  .page {
    max-width: 44rem;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    line-height: 1.6;
    color: var(--color-primary);
  }
  .back {
    margin: 0 0 1.5rem;
    font-size: 0.9rem;
  }
  .back a {
    color: var(--color-text-muted);
    text-decoration: none;
  }
  .back a:hover {
    text-decoration: underline;
  }
  h1 {
    font-size: 2rem;
    margin: 0 0 1rem;
  }
  h2 {
    margin-top: 2rem;
    font-size: 1.25rem;
  }
  .callout {
    background: var(--color-warning); color: var(--color-secondary);
    border: 1px solid var(--color-warning);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
  }
  code {
    background: var(--color-surface-muted);
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    font-size: 0.9em;
  }
  ol li,
  ul li {
    margin-bottom: 0.5rem;
  }
  .proceed {
    margin-top: 2.5rem;
    text-align: center;
  }
  .cta {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    background: var(--color-primary);
    color: var(--color-secondary);
    border-radius: 0.5rem;
    text-decoration: none;
    font-weight: 600;
  }
  .cta:hover {
    background: var(--color-primary); color: var(--color-secondary);
  }
</style>
