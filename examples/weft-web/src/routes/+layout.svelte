<script>
  import '../app.css';
  import '../lib/tokens.css';
  
  import { page } from '$app/stores';
  import { derived } from 'svelte/store';
  import { PHASES } from '../lib/content/phases';
  
  // Calculate current phase title for the aria-live region
  const currentPhaseTitle = derived(page, ($page) => {
    const routeId = $page.route.id || '';
    if (routeId.startsWith('/walkthrough/')) {
      const match = routeId.match(/\/walkthrough\/\d+-(.+)$/);
      if (match) {
        const phaseId = match[1];
        const content = PHASES.find(p => p.id === phaseId);
        return content ? `Phase: ${content.title}` : '';
      }
    } else if (routeId === '/') {
      return 'Home';
    } else if (routeId === '/sandbox') {
      return 'Sandbox';
    }
    return '';
  });
</script>

<svelte:head>
  <title>{$currentPhaseTitle ? `${$currentPhaseTitle} | WEFT` : 'WEFT Demo'}</title>
</svelte:head>

<a href="#main-content" class="sr-only sr-only-focusable skip-link">Skip to main content</a>

<div aria-live="polite" aria-atomic="true" class="sr-only">
  {$currentPhaseTitle}
</div>

<main id="main-content" tabindex="-1">
  <slot />
</main>

<style>
  .skip-link:focus {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
    white-space: normal;
    padding: 1rem;
    background: var(--color-primary, #000);
    color: white;
    z-index: 9999;
  }
  
  main {
    outline: none;
  }
</style>
