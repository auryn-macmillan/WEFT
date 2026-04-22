<script lang="ts">
  import PhaseShell from '$lib/components/PhaseShell.svelte';
</script>

<PhaseShell
  phaseId="meet"
  onNext={() => {}}
  onPrev={() => {}}
  onPause={() => {}}
>
  <div slot="body" style="padding: 2rem; background: var(--color-neutral-800); border-radius: var(--radius-md); text-align: center;">
    This is the custom body slot content. It would contain phase-specific visualization.
  </div>
</PhaseShell>
