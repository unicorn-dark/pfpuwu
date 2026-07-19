<script lang="ts">
    import { onMount } from "svelte";
    import { playHover, playClick, playAppOpen } from "$lib/utils/audio";

    onMount(() => {
        // Expanded to include custom app-level interactive classes
        const interactiveSelectors = `
            button, a, input[type="button"], input[type="submit"],
            .shortcut, .win-btn, .close-btn, .title-bar,
            .asset-sticker-wrapper, .dot, .roadmap-dot, .milestone, .node, .step
        `;

        let lastHoveredElement: Element | null = null;

        const handleMouseOver = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest(interactiveSelectors);

            if (target !== lastHoveredElement) {
                lastHoveredElement = target;

                if (target) {
                    playHover();
                }
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest(interactiveSelectors);
            if (target) {
                playClick();
            }
        };

        const handleDoubleClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest(interactiveSelectors);
            if (target?.closest('.shortcut')) {
                playAppOpen();
            }
        };

        document.addEventListener('mouseover', handleMouseOver);
        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('dblclick', handleDoubleClick);

        return () => {
            document.removeEventListener('mouseover', handleMouseOver);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('dblclick', handleDoubleClick);
        };
    });
</script>
