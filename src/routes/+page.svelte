<script lang="ts">
    import { isBooting } from '$lib/stores/os';
    import BiosLoader from '$lib/components/os/BiosLoader.svelte';
    import Desktop from '$lib/components/os/Desktop.svelte';
</script>

{#if $isBooting}
    <BiosLoader />
{:else}
    <Desktop />
{/if}