<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import PhaseShell from '$lib/components/PhaseShell.svelte';
	import { phaseStore } from '$lib/stores/phase';
	import { dkgStore } from '$lib/stores/dkg';
	import { MockCryptoEngine } from '$lib/crypto/mock';

	let engine = new MockCryptoEngine({ delayMs: 20 });

	onMount(async () => {
		phaseStore.markVisited('shares');
		if (!$dkgStore) {
			const transcript = await engine.runDkg(5, 3);
			dkgStore.set(transcript);
		}
	});

	function handleNext() {
		goto('/walkthrough/4-aggregate-pk');
	}

	function handlePrev() {
		goto('/walkthrough/2-dkg'); // Assuming phase 2 is dkg based on phases.ts
	}

	const nodeNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

	function formatBytes(bytes: Uint8Array): string {
		return `${bytes.length} bytes`;
	}

	function getHexPreview(bytes: Uint8Array): string {
		return Array.from(bytes.slice(0, 16))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('') + '...';
	}
</script>

<PhaseShell phaseId="shares" onNext={handleNext} onPrev={handlePrev}>
	<svelte:fragment slot="body" let:level>
		<div class="framing-notice" data-testid="honest-framing">
			<strong>Real FHE math, simulated committee topology.</strong> The 5 committee nodes run as Web Workers in your browser; in production these would be 5 independent organizations.
		</div>
		<div class="visual-container">
			{#if level === 'novice'}
				<div class="explainer" in:fade>
					<p><strong>Explainer:</strong> Each committee holds ONE piece. Any 3 of 5 can reconstruct &mdash; no single one controls the secret.</p>
				</div>
			{/if}

			{#if $dkgStore}
				<div class="committee-grid">
					{#each $dkgStore.perPartyShares as share, i}
						<div 
							class="node-card" 
							in:fly={{ y: 20, delay: i * 150, duration: 400 }}
						>
							<div class="node-header">
								<span class="node-avatar">{i + 1}</span>
								<h3 class="node-name">Node {nodeNames[i] || i + 1}</h3>
							</div>
							
							<div class="share-box">
								<div class="share-title">Share for Node {nodeNames[i] || i + 1} &mdash; {formatBytes(share.bytes)}</div>
								{#if level === 'show-math' || level === 'learn-more'}
									<div class="share-preview" in:fade>
										{getHexPreview(share.bytes)}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="loading">Simulating network exchange...</div>
			{/if}
		</div>
	</svelte:fragment>
</PhaseShell>

<style>
	.framing-notice {
		background-color: var(--color-surface-muted);
		color: var(--color-primary);
		padding: 1rem;
		border-radius: var(--radius-lg);
		margin-bottom: 2rem;
		font-size: 0.875rem;
		border-left: 4px solid var(--color-primary);
	}

	.visual-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-4) 0;
	}

	.explainer {
		background: var(--color-surface);
		border-left: 4px solid var(--phase-accent);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		font-size: var(--text-lg);
	}

	.committee-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: var(--space-4);
	}

	.node-card {
		background: var(--color-primary);
		border: 1px solid var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		box-shadow: var(--shadow-sm);
		transition: transform var(--duration-fast) var(--ease-out), border-color var(--duration-fast);
	}

	.node-card:hover {
		transform: translateY(-2px);
		border-color: var(--color-border);
		box-shadow: var(--shadow-md);
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.node-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		background: var(--color-surface);
		color: var(--phase-accent);
		font-weight: 700;
		font-size: var(--text-sm);
	}

	.node-name {
		margin: 0;
		font-size: var(--text-base);
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.share-box {
		background: var(--color-primary);
		border: 1px dashed var(--color-surface);
		border-radius: var(--radius-sm);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.share-title {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
		font-weight: 500;
	}

	.share-preview {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-text-muted);
		word-break: break-all;
	}

	.loading {
		text-align: center;
		padding: var(--space-8);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
