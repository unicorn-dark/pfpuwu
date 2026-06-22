<script lang="ts">
    import { onMount } from "svelte";

    const LAYER_ORDER = [
        "background",
        "body",
        "face_accessory",
        "eyes",
        "eyewear",
        "hair",
        "costume",
        "accessory",
        "headgear",
        "horn",
    ];

    // 1. The Vite Magic: Auto-discover every PNG
    const allTraitFiles = import.meta.glob("/static/traits/**/*.png");
    const filePaths = Object.keys(allTraitFiles);

    const TRAITS: Record<string, any[]> = {};
    const RING_OPTIONS: any[] = [{ name: "None", id: null }];

    LAYER_ORDER.forEach((layer) => {
        TRAITS[layer] = layer === "body" ? [] : [{ name: "None", src: null }];
    });

    filePaths.forEach((path) => {
        const parts = path.split("/");
        const fileName = parts.pop() as string;
        const folderName = parts.pop() as string;

        let cleanName = fileName.replace(".png", "").replace(/[-_]/g, " ");
        cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        const publicUrl = path.replace("/static", "");

        if (folderName === "ring") {
            if (fileName.startsWith("top-ring")) {
                const colorId = fileName
                    .replace("top-ring-", "")
                    .replace(".png", "");
                RING_OPTIONS.push({ name: `Color ${colorId}`, id: colorId });
            }
        } else if (TRAITS[folderName]) {
            TRAITS[folderName].push({ name: cleanName, src: publicUrl });
        }
    });

    RING_OPTIONS.sort((a, b) => {
        if (!a.id) return -1;
        if (!b.id) return 1;
        return parseInt(a.id) - parseInt(b.id);
    });

    // --- 🚀 PERFORMANCE OPTIMIZATION: IN-MEMORY CACHE ---
    // This stores fully decoded image objects. Svelte doesn't need to track this,
    // so we intentionally leave out $state to keep it blazing fast.
    const imageCache = new Map<string, HTMLImageElement>();

    function getCachedImage(src: string): Promise<HTMLImageElement | null> {
        if (!src) return Promise.resolve(null);

        // Instant return if we already decoded this image!
        if (imageCache.has(src)) {
            return Promise.resolve(imageCache.get(src)!);
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                imageCache.set(src, img); // Save it for next time
                resolve(img);
            };
            img.onerror = () => {
                console.warn(`Failed to load: ${src}`);
                resolve(null);
            };
            img.src = src;
        });
    }

    // Silently loads all assets into memory in the background
    function preloadAllAssets() {
        console.log("🚀 Preloading assets in background...");
        // Preload standard traits
        Object.values(TRAITS).forEach((traitCategory) => {
            traitCategory.forEach((trait) => {
                if (trait.src) getCachedImage(trait.src);
            });
        });
        // Preload rings
        RING_OPTIONS.forEach((ring) => {
            if (ring.id) {
                getCachedImage(`/traits/ring/top-ring-${ring.id}.png`);
                getCachedImage(`/traits/ring/bottom-ring-${ring.id}.png`);
            }
        });
    }

    // Set Initial State
    let currentTraits: Record<string, number> = $state({});
    LAYER_ORDER.forEach((layer) => {
        currentTraits[layer] =
            layer !== "body" && TRAITS[layer].length > 1 ? 1 : 0;
    });

    let activeTab = $state("body");
    let canvasElement: HTMLCanvasElement | null = $state(null);
    let isRendering = $state(false);
    let currentRing = $state(0);

    async function renderPfp() {
        if (!canvasElement) return;

        // Only show the loading blur if the image ISN'T in the cache yet.
        // Once the background preloader catches up, this will be instantaneous.
        isRendering = true;
        const ctx = canvasElement.getContext("2d");
        if (!ctx) return;

        const imagePathsToLoad: string[] = [];

        LAYER_ORDER.forEach((layerName) => {
            if (layerName === "body" && currentRing > 0) {
                imagePathsToLoad.push(
                    `/traits/ring/top-ring-${RING_OPTIONS[currentRing].id}.png`,
                );
            }

            if (layerName === "accessory" && currentRing > 0) {
                imagePathsToLoad.push(
                    `/traits/ring/bottom-ring-${RING_OPTIONS[currentRing].id}.png`,
                );
            }

            const selectedTraitIndex = currentTraits[layerName];
            const traitObj = TRAITS[layerName][selectedTraitIndex];

            if (traitObj && traitObj.src !== null) {
                imagePathsToLoad.push(traitObj.src);
            }
        });

        // Use our new caching engine!
        const images = await Promise.all(imagePathsToLoad.map(getCachedImage));

        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        images.forEach((img) => {
            if (img) {
                ctx.drawImage(
                    img,
                    0,
                    0,
                    canvasElement.width,
                    canvasElement.height,
                );
            }
        });

        isRendering = false;
    }

    $effect(() => {
        if (currentTraits || currentRing > -1) renderPfp();
    });

    onMount(() => {
        renderPfp();
        // Start the background preloader 500ms after the initial load
        // so it doesn't block the first render!
        setTimeout(preloadAllAssets, 500);
    });

    function randomize() {
        LAYER_ORDER.forEach((layer) => {
            currentTraits[layer] = Math.floor(
                Math.random() * TRAITS[layer].length,
            );
        });
    }

    function exportPng() {
        if (!canvasElement) return;
        const link = document.createElement("a");
        link.download = "win98-avatar.png";
        link.href = canvasElement.toDataURL();
        link.click();
    }
</script>

<div class="pfp-maker-layout">
    <div class="preview-box field-row">
        <div class="canvas-container">
            <canvas
                bind:this={canvasElement}
                class:is-loading={isRendering}
                width="2048"
                height="2048"
            ></canvas>
        </div>
        <div class="action-row">
            <button class="win98-btn" onclick={randomize}>🎲 Randomize</button>
            <button class="win98-btn save-btn" onclick={exportPng}
                >💾 Save Avatar</button
            >
        </div>
    </div>

    <div class="control-box">
        <menu role="tablist" class="win98-tabs">
            {#each Object.keys(TRAITS) as tab}
                <li role="tab" aria-selected={activeTab === tab}>
                    <button onclick={() => (activeTab = tab)}>
                        {tab.charAt(0).toUpperCase() +
                            tab.slice(1).replace("_", " ")}
                    </button>
                </li>
            {/each}

            <div class="tab-separator"></div>

            <li
                role="tab"
                aria-selected={activeTab === "ring"}
                class="ring-tab"
            >
                <button onclick={() => (activeTab = "ring")}>
                    ✨ 3D Ring
                </button>
            </li>
        </menu>

        <div role="tabpanel" class="tab-panel">
            <div class="trait-grid">
                {#if activeTab === "ring"}
                    {#each RING_OPTIONS as ringOption, idx}
                        <button
                            class="trait-option"
                            class:selected={currentRing === idx}
                            onclick={() => (currentRing = idx)}
                        >
                            <span class="option-title">{ringOption.name}</span>
                        </button>
                    {/each}
                {:else}
                    {#each TRAITS[activeTab] as trait, idx}
                        <button
                            class="trait-option"
                            class:selected={currentTraits[activeTab] === idx}
                            onclick={() => (currentTraits[activeTab] = idx)}
                        >
                            <span class="option-title">{trait.name}</span>
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .pfp-maker-layout {
        display: flex;
        gap: 14px;
        height: 100%;
        width: 100%;
        background: #c0c0c0;
        box-sizing: border-box;
        flex-grow: 1;
        min-height: 0;
    }

    .preview-box {
        display: flex;
        flex-direction: column;
        background: #ececec;
        padding: 6px;
        border: 2px solid;
        border-color: #000000 #ffffff #ffffff #000000;
        flex-grow: 1;
        min-width: 250px;
    }

    .canvas-container {
        flex-grow: 1;
        width: 100%;
        min-height: 0;
        background: #000;
        border: 2px solid;
        border-color: #000000 #ffffff #ffffff #000000;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }

    canvas {
        max-width: 100%;
        max-height: 100%;
        aspect-ratio: 1;
        object-fit: contain;
        image-rendering: pixelated;

        transition:
            filter 0.15s ease-in-out,
            opacity 0.15s ease-in-out;
    }

    canvas.is-loading {
        filter: blur(6px);
        opacity: 0.6;
    }

    .action-row {
        display: flex;
        flex-direction: row;
        gap: 6px;
        margin-top: 8px;
    }

    .action-row button {
        flex: 1;
    }

    .control-box {
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: row;
        flex-grow: 1;
        min-width: 0;
    }

    .win98-btn {
        font-family: inherit;
        font-weight: bold;
        padding: 6px 12px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
    }

    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
    }

    .save-btn {
        background: #000080;
        color: white;
        border-color: #fff #000 #000 #fff;
    }

    .win98-tabs {
        list-style-type: none;
        margin: 0 -2px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 2;
    }

    .win98-tabs li {
        margin: 0;
    }

    .win98-tabs button {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        border-top-left-radius: 3px;
        border-bottom-left-radius: 3px;
        padding: 8px 12px;
        font-weight: bold;
        cursor: pointer;
        width: 100%;
        text-align: left;
    }

    .win98-tabs li[aria-selected="true"] button {
        background: #c0c0c0;
        border-right: 2px solid #c0c0c0;
        margin-right: -2px;
        padding-right: 14px;
    }

    /* Styles specifically for the new distinct Ring Tab */
    .tab-separator {
        height: 2px;
        background: #808080;
        border-bottom: 1px solid #ffffff;
        margin: 4px 4px 4px 0;
    }

    .ring-tab button {
        color: #000080;
        background: #d4d0c8;
    }

    .tab-panel {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        flex-grow: 1;
        padding: 12px;
        overflow-y: auto;
        z-index: 1;
    }

    .trait-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .trait-option {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 10px;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
    }

    .trait-option:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 11px 9px 9px 11px;
    }

    .trait-option.selected {
        background: #000080;
        color: white;
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 11px 9px 9px 11px;
        outline: 1px dotted #e0e0e0;
        outline-offset: -4px;
    }

    .option-title {
        font-weight: bold;
        font-size: 0.95rem;
    }

    @media (max-width: 768px) {
        :global(.win98-window .window-body) {
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            padding: 4px !important;
            flex: 1 !important;
            min-height: 0 !important;
        }

        .pfp-maker-layout {
            flex-direction: column;
            flex: 1;
            min-height: 0;
            height: 100%;
        }

        .preview-box {
            width: 100%;
            max-height: 45vh;
            box-sizing: border-box;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .canvas-container {
            flex: 1;
            min-height: 0;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        canvas {
            max-width: 100%;
            max-height: 100%;
            aspect-ratio: 1;
            object-fit: contain;
        }

        .action-row {
            flex-shrink: 0;
        }

        .control-box {
            display: flex;
            flex-direction: column;
            width: 100%;
            flex: 1;
            min-height: 0;
        }

        .win98-tabs {
            display: flex;
            flex-direction: row;
            margin: 0 0 -2px 0;
            overflow-x: auto;
            white-space: nowrap;
            flex-shrink: 0;
            width: 100%;
        }

        /* Adjust the separator for mobile's horizontal scroll layout */
        .tab-separator {
            height: auto;
            width: 2px;
            background: #808080;
            border-bottom: none;
            border-right: 1px solid #ffffff;
            margin: 0 4px 0 4px;
        }

        .win98-tabs button {
            border-radius: 3px 3px 0 0;
            text-align: center;
        }

        .win98-tabs li[aria-selected="true"] button {
            border-right: 2px solid #000000;
            border-bottom: 2px solid #c0c0c0;
            margin-right: 0;
            margin-bottom: -2px;
            padding-right: 12px;
            padding-bottom: 10px;
        }

        .tab-panel {
            flex: 1;
            width: 100%;
            box-sizing: border-box;
            overflow-y: auto;
            min-height: 0;
            height: 0;
            -webkit-overflow-scrolling: touch;
        }
    }
</style>
