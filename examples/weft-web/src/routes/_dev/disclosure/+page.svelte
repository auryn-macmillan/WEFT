<script lang="ts">
	import ProgressiveDisclosure from '$lib/components/ProgressiveDisclosure.svelte';
</script>

<div class="container">
	<h1>Progressive Disclosure Demo</h1>

	<section>
		<h2>Sticky Enabled (LocalStorage + URL Sync)</h2>
		<ProgressiveDisclosure sticky={true}>
			<div slot="novice" class="content-box novice">
				<h3>Novice Level</h3>
				<p>This is the high-level summary suitable for beginners. It explains what is happening without the technical details.</p>
			</div>
			
			<div slot="learn-more" class="content-box learn-more">
				<h3>Learn More Level</h3>
				<p>This provides more technical context, explaining how the process works conceptually, suitable for developers or technical users.</p>
			</div>
			
			<div slot="show-math" class="content-box show-math">
				<h3>Show Math Level</h3>
				<p>This shows the actual cryptographic math, equations, and implementation details for those who want to see exactly how it works.</p>
			</div>
		</ProgressiveDisclosure>
	</section>

	<section>
		<h2>Non-Sticky (Default)</h2>
		<ProgressiveDisclosure level="learn-more">
			<div slot="novice" class="content-box novice">
				<p>Non-sticky Novice</p>
			</div>
			<div slot="learn-more" class="content-box learn-more">
				<p>Non-sticky Learn More (Default)</p>
			</div>
			<div slot="show-math" class="content-box show-math">
				<p>Non-sticky Show Math</p>
			</div>
		</ProgressiveDisclosure>
	</section>
</div>

<style>
	.container {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--space-8);
		display: flex;
		flex-direction: column;
		gap: var(--space-8);
		font-family: var(--font-sans);
	}

	section {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.content-box {
		padding: var(--space-6);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-neutral-300);
		background: var(--color-neutral-100);
	}

	h1 {
		font-size: var(--text-2xl, 24px);
		font-weight: 700;
	}

	h2 {
		font-size: var(--text-xl, 20px);
		font-weight: 600;
		color: var(--color-neutral-800);
	}

	h3 {
		font-size: var(--text-lg, 18px);
		font-weight: 600;
		margin-bottom: var(--space-2);
	}

	.novice { border-left: 4px solid var(--color-success); }
	.learn-more { border-left: 4px solid var(--color-info); }
	.show-math { border-left: 4px solid var(--color-phase-1); }
</style>