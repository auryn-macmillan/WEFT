<script context="module" lang="ts">
	import { setContext, getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { DepthLevel } from '$lib/content/phases';

	const DEPTH_CONTEXT_KEY = Symbol('depth-level');

	export function setDepthContext(store: Writable<DepthLevel>) {
		setContext(DEPTH_CONTEXT_KEY, store);
	}

	export function getDepthContext(): Writable<DepthLevel> {
		return getContext<Writable<DepthLevel>>(DEPTH_CONTEXT_KEY);
	}
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { writable } from 'svelte/store';
	import { fade } from 'svelte/transition';

	export let level: DepthLevel = 'novice';
	export let sticky: boolean = false;

	const LEVELS: DepthLevel[] = ['novice', 'learn-more', 'show-math'];
	const LEVEL_LABELS: Record<DepthLevel, string> = {
		novice: 'Novice',
		'learn-more': 'Learn More',
		'show-math': 'Show Math'
	};

	const levelStore = writable<DepthLevel>(level);
	setDepthContext(levelStore);

	$: $levelStore = level;

	import { onMount } from 'svelte';

	onMount(() => {
		if (browser) {
			const hash = window.location.hash.replace('#depth=', '');
			if (LEVELS.includes(hash as DepthLevel)) {
				level = hash as DepthLevel;
			} else if (sticky) {
				const saved = window.localStorage.getItem('weft-depth-level');
				if (saved && LEVELS.includes(saved as DepthLevel)) {
					level = saved as DepthLevel;
				}
			}
		}
	});

	$: if (browser) {
		if (sticky) {
			window.localStorage.setItem('weft-depth-level', level);
		}
		
		const currentHash = window.location.hash.replace('#depth=', '');
		if (currentHash !== level) {
            window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#depth=${level}`);
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		const currentIndex = LEVELS.indexOf(level);
		if (event.key === 'ArrowRight') {
			level = LEVELS[(currentIndex + 1) % LEVELS.length];
			event.preventDefault();
		} else if (event.key === 'ArrowLeft') {
			level = LEVELS[(currentIndex - 1 + LEVELS.length) % LEVELS.length];
			event.preventDefault();
		}
	}
</script>

<div class="progressive-disclosure">
	<div 
		class="pill-toggle" 
		role="tablist" 
		tabindex="0" 
		on:keydown={handleKeydown}
		aria-label="Content Depth Level"
	>
		{#each LEVELS as l}
			<button 
				type="button"
				role="tab"
				aria-selected={level === l}
				aria-expanded={level === l}
				class="pill-segment"
				class:active={level === l}
				on:click={() => level = l}
				tabindex="-1"
			>
				{LEVEL_LABELS[l]}
			</button>
		{/each}
	</div>

	<div class="content-area">
		{#if level === 'novice'}
			<div in:fade={{duration: 200, delay: 200}} out:fade={{duration: 200}} class="content-slot">
				<slot name="novice" />
			</div>
		{:else if level === 'learn-more'}
			<div in:fade={{duration: 200, delay: 200}} out:fade={{duration: 200}} class="content-slot">
				<slot name="learn-more" />
			</div>
		{:else if level === 'show-math'}
			<div in:fade={{duration: 200, delay: 200}} out:fade={{duration: 200}} class="content-slot">
				<slot name="show-math" />
			</div>
		{/if}
	</div>
</div>

<style>
	.progressive-disclosure {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		width: 100%;
	}

	.pill-toggle {
		display: inline-flex;
		background: var(--color-surface);
		border-radius: var(--radius-full);
		padding: var(--space-1);
		align-self: flex-start;
		position: relative;
	}

	.pill-toggle:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.pill-segment {
		border: none;
		background: transparent;
		padding: var(--space-2) var(--space-4);
		border-radius: var(--radius-full);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: all 0.2s ease;
		z-index: 1;
	}

	.pill-segment:hover {
		color: var(--color-primary);
	}

	.pill-segment.active {
		color: var(--color-secondary);
		background: var(--color-primary);
	}

	.content-area {
		position: relative;
		display: grid;
	}

	.content-slot {
		grid-area: 1 / 1;
	}
</style>