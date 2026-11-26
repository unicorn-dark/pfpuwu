<script lang="ts">
    import { onMount } from "svelte";
    import {
        playHover,
        playClick,
        playPop,
        playPaperFlick,
        playDetent,
        playAppOpen,
        playWindowClose,
        playSuccess
    } from "$lib/utils/audio";

    onMount(() => {
        const interactiveSelectors = `
            button, a, select, input[type="button"], input[type="submit"], input[type="checkbox"],
            .shortcut, .win-btn, .win98-btn, .close-btn, .title-bar,
            .asset-sticker-wrapper, .dot, .roadmap-dot, .milestone, .node, .step, .grid-item
        `;

        let lastHoveredElement: Element | null = null;
        let lastTouchTs = 0;

        const handleTouchStart = () => {
            lastTouchTs = Date.now();
        };

        const handleMouseOver = (e: MouseEvent) => {
            // Suppress synthetic mouseover triggered immediately after mobile taps
            if (Date.now() - lastTouchTs < 700) return;
            const rawTarget = e.target as HTMLElement | null;
            if (!rawTarget || rawTarget.tagName === "INPUT" && (rawTarget as HTMLInputElement).type === "range") {
                return;
            }
            const target = rawTarget.closest(interactiveSelectors);

            if (target !== lastHoveredElement) {
                lastHoveredElement = target;
                if (target && !(target as HTMLButtonElement).disabled) {
                    playHover();
                }
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            const rawTarget = e.target as HTMLElement | null;
            if (!rawTarget) return;

            if (rawTarget.tagName === "INPUT" && (rawTarget as HTMLInputElement).type === "range") {
                playDetent();
                return;
            }

            const target = rawTarget.closest(interactiveSelectors) as HTMLElement | null;
            if (!target || (target as HTMLButtonElement).disabled) return;

            const sfxTag = target.dataset.sfx;
            if (sfxTag === "pop-up") {
                playPop("up");
            } else if (sfxTag === "pop-down") {
                playPop("down");
            } else if (sfxTag === "flick") {
                playPaperFlick();
            } else if (sfxTag === "close") {
                playWindowClose();
            } else if (sfxTag === "success") {
                playSuccess();
            } else if (
                target.matches('.close-btn, .win98-close, button[aria-label="Close"], button[aria-label="Minimize"]')
            ) {
                playWindowClose();
            } else if (
                target.matches('.tab-btn, .category-tab, .reels-tab, .arcade-tab-btn, .menu-btn, select')
            ) {
                playPaperFlick();
            } else if (target.matches('.shortcut')) {
                playClick("soft");
            } else if (target.matches('input[type="checkbox"]')) {
                // Checkbox change event handles exact checked direction; keep silent on mousedown
                return;
            } else {
                playClick("primary");
            }
        };

        const handleInput = (e: Event) => {
            const rawTarget = e.target as HTMLElement | null;
            if (rawTarget?.tagName === "INPUT" && (rawTarget as HTMLInputElement).type === "range") {
                playDetent();
            }
        };

        const handleChange = (e: Event) => {
            const rawTarget = e.target as HTMLElement | null;
            if (!rawTarget) return;
            if (rawTarget.tagName === "INPUT" && (rawTarget as HTMLInputElement).type === "checkbox") {
                playPop((rawTarget as HTMLInputElement).checked ? "up" : "down");
            } else if (rawTarget.tagName === "SELECT") {
                playPaperFlick();
            }
        };

        const handleDoubleClick = (e: MouseEvent) => {
            const target = (e.target as HTMLElement | null)?.closest(interactiveSelectors);
            if (target?.closest('.shortcut')) {
                playAppOpen();
            }
        };

        document.addEventListener("touchstart", handleTouchStart, { passive: true });
        document.addEventListener("mouseover", handleMouseOver, { passive: true });
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("input", handleInput);
        document.addEventListener("change", handleChange);
        document.addEventListener("dblclick", handleDoubleClick);

        return () => {
            document.removeEventListener("touchstart", handleTouchStart);
            document.removeEventListener("mouseover", handleMouseOver);
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("input", handleInput);
            document.removeEventListener("change", handleChange);
            document.removeEventListener("dblclick", handleDoubleClick);
        };
    });
</script>
