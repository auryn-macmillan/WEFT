<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import PhaseShell from '$lib/components/PhaseShell.svelte';
	import { phaseStore } from '$lib/stores/phase';
	import { dkgStore } from '$lib/stores/dkg';
	import { MockCryptoEngine } from '$lib/crypto/mock';

	let engine = new MockCryptoEngine({ delayMs: 20 });
	let showCombined = false;

	onMount(async () => {
		phaseStore.markVisited('aggregate-pk');
		if (!$dkgStore) {
			const transcript = await engine.runDkg(5, 3);
			dkgStore.set(transcript);
		}

		// Trigger combined state after fragments finish showing
		setTimeout(() => {
			showCombined = true;
		}, 1200);
	});

	function handleNext() {
		goto('/walkthrough/5-train-encrypt');
	}

	function handlePrev() {
		goto('/walkthrough/3-shares');
	}

	const nodeNames = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];

	function getFullHex(bytes: Uint8Array): string {
		return Array.from(bytes)
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');
	}

	function getPreview(hex: string, length: number = 64): string {
		if (hex.length <= length) return hex;
		return hex.slice(0, length);
	}
</script>

<PhaseShell phaseId="aggregate-pk" onNext={handleNext} onPrev={handlePrev}>
	<svelte:fragment slot="body" let:level>
		<div class="visual-container">
			{#if level === 'novice'}
				<div class="explainer" in:fade>
					<p><strong>Big Reveal:</strong> "This key everyone can see. You can even take a photo of it &mdash; hospitals will encrypt under this."</p>
				</div>
			{/if}

			{#if $dkgStore}
				{@const pkHex = getFullHex($dkgStore.publicKey.bytes)}
				
				<div class="animation-stage">
					<div class="fragments">
						{#each Array(5) as _, i}
							<div 
								class="fragment-tile" 
								class:merging={showCombined}
								style="--i: {i};"
								in:fly={{ y: -20, x: (i - 2) * 20, delay: i * 150, duration: 400 }}
							>
								<div class="fragment-icon">
									<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
								</div>
								Node {nodeNames[i] || i + 1}
							</div>
						{/each}
					</div>

					{#if showCombined}
						<div class="combined-key" in:fly={{ y: 30, duration: 600 }}>
							<div class="key-header">
								<div class="combined-icon">
									<svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path></svg>
								</div>
								<h2>Aggregated Committee Public Key</h2>
							</div>
							
							<div class="key-body">
								<div 
									class="hex-preview" 
									data-testid="aggregated-pk-preview"
								>{getPreview(pkHex, 64)}...</div>
							</div>
							
							<div class="key-meta">
								<span>Size: {$dkgStore.publicKey.bytes.length} bytes</span>
								<span class="badge">Safe to share</span>
							</div>
						</div>
					{/if}
				</div>
			{:else}
				<div class="loading">Generating fragments...</div>
			{/if}
		</div>
	</svelte:fragment>
</PhaseShell>

<style>
	.visual-container {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		padding: var(--space-4) 0;
	}

	.explainer {
		background: var(--color-neutral-800);
		border-left: 4px solid var(--phase-accent);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		color: var(--color-neutral-200);
		font-size: var(--text-lg);
	}

	.animation-stage {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-8);
		padding: var(--space-8) 0;
		min-height: 400px;
	}

	.fragments {
		display: flex;
		justify-content: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		position: relative;
		height: 60px;
	}

	.fragment-tile {
		background: var(--color-neutral-800);
		border: 1px solid var(--phase-accent);
		color: var(--color-neutral-100);
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-md);
		font-size: var(--text-sm);
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		box-shadow: 0 0 10px rgba(14, 165, 233, 0.2);
		transition: all 0.6s var(--ease-in-out);
		z-index: 10;
	}

	.fragment-icon {
		color: var(--phase-accent);
		display: flex;
		align-items: center;
	}

	.fragment-tile.merging {
		opacity: 0;
		transform: translateY(40px) scale(0.5);
		pointer-events: none;
	}

	.combined-key {
		background: linear-gradient(135deg, var(--color-neutral-900), var(--color-neutral-950));
		border: 2px solid var(--phase-accent);
		border-radius: var(--radius-lg);
		padding: var(--space-6);
		width: 100%;
		max-width: 600px;
		box-shadow: 0 0 30px rgba(14, 165, 233, 0.15), inset 0 0 20px rgba(14, 165, 233, 0.05);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		z-index: 20;
	}

	.key-header {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.combined-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: rgba(14, 165, 233, 0.1);
		color: var(--phase-accent);
		border-radius: var(--radius-md);
	}

	.key-header h2 {
		margin: 0;
		font-size: var(--text-xl);
		color: var(--color-neutral-100);
		font-weight: 700;
	}

	.key-body {
		background: var(--color-neutral-950);
		border-radius: var(--radius-sm);
		padding: var(--space-4);
		border: 1px solid var(--color-neutral-800);
	}

	.hex-preview {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--phase-accent);
		word-break: break-all;
		line-height: var(--leading-relaxed);
		letter-spacing: 1px;
	}

	.key-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: var(--text-sm);
		color: var(--color-neutral-400);
	}

	.badge {
		background: var(--color-success);
		color: var(--color-neutral-900);
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-full);
		font-weight: 700;
		font-size: var(--text-xs);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.loading {
		text-align: center;
		padding: var(--space-8);
		color: var(--color-neutral-500);
		font-style: italic;
	}
</style>
