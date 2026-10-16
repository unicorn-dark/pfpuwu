<script lang="ts">
    import {
        LAYER_ORDER,
        BACKGROUND_OPTIONS,
        TRAITS,
        RING_OPTIONS,
        getCachedTraitImage
    } from "$lib/utils/traits";
    import {
        userProfile,
        requireXLogin,
        savePersonaAvatar
    } from "$lib/stores/auth";

    let currentTraits: Record<string, number> = $state({});
    LAYER_ORDER.forEach((layer) => {
        currentTraits[layer] =
            layer !== "body" && TRAITS[layer].length > 1 ? 1 : 0;
    });

    let currentBgIndex = $state(0);
    let activeTab = $state("body");
    let canvasElement: HTMLCanvasElement | null = $state(null);
    let isRendering = $state(false);
    let currentRing = $state(RING_OPTIONS.length > 1 ? 1 : 0);

    let lockedCategories: Record<string, boolean> = $state({});
    let showTooltip = $state(false);
    let tooltipText = $state("Unlock the category first to change traits!");
    let tooltipTimeout: ReturnType<typeof setTimeout>;
    let isSavingAvatar = $state(false);

    function triggerTooltip(msg = "Unlock the category first to change traits!") {
        tooltipText = msg;
        showTooltip = true;
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => {
            showTooltip = false;
        }, 2200);
    }

    async function drawComposite(
        targetCanvas: HTMLCanvasElement,
        activeTraits: Record<string, number>,
        activeBg: number,
        activeRing: number
    ) {
        const ctx = targetCanvas.getContext("2d");
        if (!ctx) return;

        const imagePathsToLoad: string[] = [];

        LAYER_ORDER.forEach((layerName) => {
            if (layerName === "body" && activeRing > 0) {
                imagePathsToLoad.push(
                    `/traits/ring/top-ring-${RING_OPTIONS[activeRing].id}.png`
                );
            }
            if (layerName === "accessory" && activeRing > 0) {
                imagePathsToLoad.push(
                    `/traits/ring/bottom-ring-${RING_OPTIONS[activeRing].id}.png`
                );
            }

            const selectedTraitIndex = activeTraits[layerName];
            const traitObj = TRAITS[layerName][selectedTraitIndex];

            if (traitObj && traitObj.src !== null) {
                imagePathsToLoad.push(traitObj.src);
            }
        });

        const images = await Promise.all(imagePathsToLoad.map(getCachedTraitImage));

        const bgHex = BACKGROUND_OPTIONS[activeBg].hex;
        ctx.fillStyle = bgHex;
        ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

        images.forEach((img) => {
            if (img) {
                ctx.drawImage(img, 0, 0, targetCanvas.width, targetCanvas.height);
            }
        });
    }

    async function renderPfp() {
        if (!canvasElement) return;

        const activeTraits = { ...currentTraits };
        const activeRing = currentRing;
        const activeBg = currentBgIndex;

        isRendering = true;
        await drawComposite(canvasElement, activeTraits, activeBg, activeRing);
        isRendering = false;
    }

    $effect(() => {
        renderPfp();
    });

    function randomize() {
        LAYER_ORDER.forEach((layer) => {
            if (!lockedCategories[layer]) {
                currentTraits[layer] = Math.floor(
                    Math.random() * TRAITS[layer].length
                );
            }
        });
    }

    async function exportPng() {
        const hiRes = document.createElement("canvas");
        hiRes.width = 2048;
        hiRes.height = 2048;
        await drawComposite(hiRes, { ...currentTraits }, currentBgIndex, currentRing);
        const link = document.createElement("a");
        link.download = "win98-avatar.png";
        link.href = hiRes.toDataURL("image/png");
        link.click();
    }

    async function saveAsMyAvatar() {
        if (!requireXLogin("Login with X (Twitter) to set this character as your persona avatar across Chat, MySpace, and Desktop.")) {
            return;
        }
        isSavingAvatar = true;
        try {
            const res = await savePersonaAvatar({ ...currentTraits });
            if (res.ok) {
                triggerTooltip("Persona Avatar saved! (Transparent character sprite for Chat & Desktop Pet)");
            } else {
                triggerTooltip("Failed to save avatar.");
            }
        } finally {
            isSavingAvatar = false;
        }
    }
</script>

<div class="pfp-maker-layout">
    <div class="preview-box field-row">
        <div class="canvas-container">
            <div class="canvas-wrapper">
                <canvas
                    bind:this={canvasElement}
                    class:is-loading={isRendering}
                    width="512"
                    height="512"
                ></canvas>

                <!-- Classic Windows 98 Blue Bar Artist Credit on Image Preview -->
                <div class="artist-credit-bar">
                    <span>Artist - </span>
                    <a
                        href="https://x.com/muzen28"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Artist: @muzen28 on X"
                    >
                        muzen
                    </a>
                </div>
            </div>
        </div>
        <div class="action-row">
            <button class="win98-btn" onclick={randomize}>🎲 Randomize</button>
            <button class="win98-btn" onclick={exportPng}>💾 Export PNG</button>
            <button
                class="win98-btn save-btn"
                onclick={saveAsMyAvatar}
                disabled={isSavingAvatar}
                title="Save this character as your persona avatar across X profile, Global Chat, and Desktop Pet"
            >
                {isSavingAvatar ? "Saving..." : "⭐ Set Persona Avatar"}
            </button>
        </div>
    </div>

    <div class="control-box">
        <menu role="tablist" class="win98-tabs">
            {#each LAYER_ORDER as tab}
                <li
                    role="tab"
                    aria-selected={activeTab === tab}
                    class="tab-item"
                >
                    <button
                        class="mini-lock-btn"
                        class:locked={lockedCategories[tab]}
                        onclick={(e) => {
                            e.stopPropagation();
                            lockedCategories[tab] = !lockedCategories[tab];
                        }}
                        title={lockedCategories[tab]
                            ? "Unlock Trait"
                            : "Lock Trait"}
                    >
                        {lockedCategories[tab] ? "🔒" : "🔓"}
                    </button>

                    <button
                        class="tab-name-btn"
                        class:locked={lockedCategories[tab]}
                        onclick={() => (activeTab = tab)}
                    >
                        {tab.charAt(0).toUpperCase() +
                            tab.slice(1).replace("_", " ")}
                    </button>
                </li>
            {/each}

            <div class="tab-separator"></div>

            <li
                role="tab"
                aria-selected={activeTab === "background"}
                class="tab-item special-tab"
            >
                <button
                    class="tab-name-btn full-width"
                    onclick={() => (activeTab = "background")}
                >
                    🎨 Background
                </button>
            </li>

            <li
                role="tab"
                aria-selected={activeTab === "ring"}
                class="tab-item special-tab ring-tab"
            >
                <button
                    class="tab-name-btn full-width"
                    onclick={() => (activeTab = "ring")}
                >
                    ✨ 3D Ring
                </button>
            </li>
        </menu>

        <div role="tabpanel" class="tab-panel">
            <div class="tooltip-toast" class:show={showTooltip}>
                {tooltipText}
            </div>

            <div
                class="trait-grid"
                class:locked-grid={lockedCategories[activeTab]}
            >
                {#if lockedCategories[activeTab] && activeTab !== "background" && activeTab !== "ring"}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="locked-overlay" onclick={() => triggerTooltip()}></div>
                {/if}

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
                {:else if activeTab === "background"}
                    {#each BACKGROUND_OPTIONS as bgOption, idx}
                        <button
                            class="trait-option"
                            class:selected={currentBgIndex === idx}
                            onclick={() => (currentBgIndex = idx)}
                        >
                            <span class="option-title title-with-swatch">
                                <span
                                    class="color-swatch"
                                    style="background-color: {bgOption.hex};"
                                ></span>
                                {bgOption.name}
                            </span>
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
        gap: 8px;
        height: 100%;
        width: 100%;
        background: #c0c0c0;
        box-sizing: border-box;
        flex-grow: 1;
        min-height: 0;
        position: relative;
    }

    .preview-box {
        display: flex;
        flex-direction: column;
        background: #c0c0c0;
        padding: 4px;
        flex-grow: 1;
        min-width: 250px;
    }

    .canvas-container {
        flex-grow: 1;
        width: 100%;
        min-height: 0;
        background: #000;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }

    .canvas-wrapper {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        max-width: 100%;
        max-height: 100%;
        aspect-ratio: 1;
        width: 100%;
        height: 100%;
    }

    canvas {
        width: 100%;
        height: 100%;
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
        gap: 4px;
        margin-top: 6px;
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
        padding: 6px 8px;
        background: #c0c0c0;
        color: #000000;
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

    /* --- TABS --- */
    .win98-tabs {
        list-style-type: none;
        margin: 0 -2px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        z-index: 2;
    }

    .win98-tabs li.tab-item {
        display: flex;
        flex-direction: row;
        align-items: center;
        margin: 0 0 2px 0;
        gap: 4px;
    }

    .mini-lock-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        cursor: pointer;
        padding: 0;
        font-size: 0.95rem;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        width: 34px;
        flex-shrink: 0;
    }

    .mini-lock-btn.locked {
        border-color: #000000 #ffffff #ffffff #000000;
        background: #888888;
        padding-top: 2px;
        padding-left: 2px;
    }

    .tab-name-btn {
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 8px 12px;
        font-family: inherit;
        font-weight: bold;
        cursor: pointer;
        flex-grow: 1;
        text-align: left;
    }

    .tab-name-btn.locked {
        color: #555555;
        text-shadow: 1px 1px 0px #e0e0e0;
        background: repeating-linear-gradient(
            45deg,
            #c0c0c0,
            #c0c0c0 4px,
            #a8a8a8 4px,
            #a8a8a8 8px
        );
    }

    .tab-name-btn.full-width {
        width: 100%;
    }

    .win98-tabs li[aria-selected="true"] .tab-name-btn {
        border-right: 2px solid #c0c0c0;
        margin-right: -2px;
        padding-right: 14px;
    }

    .win98-tabs li[aria-selected="true"] .tab-name-btn.locked {
        border-right-color: transparent;
    }

    .tab-separator {
        height: 2px;
        background: #808080;
        border-bottom: 1px solid #ffffff;
        margin: 4px 4px 4px 0;
    }

    .ring-tab .tab-name-btn {
        color: #000080;
        background: #d4d0c8;
    }

    /* --- PANEL & GRID --- */
    .tab-panel {
        flex: 1 1 auto;
        width: 100%;
        box-sizing: border-box;
        overflow-y: auto;
        min-height: 0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 8px;
        padding-bottom: calc(40px + env(safe-area-inset-bottom));
        -webkit-overflow-scrolling: touch;
    }

    .locked-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
        cursor: not-allowed;
        background-image: repeating-linear-gradient(
            45deg,
            transparent,
            transparent 6px,
            rgba(0, 0, 0, 0.08) 6px,
            rgba(0, 0, 0, 0.08) 12px
        );
    }

    .trait-grid {
        display: flex;
        flex-direction: column;
        gap: 6px;
        position: relative;
    }

    .locked-grid {
        opacity: 0.6;
        filter: grayscale(100%);
    }

    /* --- TOOLTIP --- */
    .tooltip-toast {
        position: fixed;
        bottom: 45px;
        left: 50%;
        transform: translateX(-50%);
        background: #ffffe1;
        border: 1px solid #000000;
        padding: 4px 8px;
        font-size: 0.85rem;
        color: #000000;
        box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        z-index: 100;
        white-space: nowrap;
    }

    .tooltip-toast.show {
        opacity: 1;
    }

    .trait-option {
        background: #c0c0c0;
        color: #000000;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 9px 10px;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
    }

    .trait-option:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 10px 9px 8px 11px;
    }

    .trait-option.selected {
        background: #000080;
        color: white;
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 10px 9px 8px 11px;
        outline: 1px dotted #e0e0e0;
        outline-offset: -4px;
    }

    .option-title {
        font-weight: bold;
        font-size: 0.9rem;
    }

    .title-with-swatch {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .color-swatch {
        width: 14px;
        height: 14px;
        display: inline-block;
        border: 1px solid #808080;
        box-shadow:
            inset -1px -1px 0px #ffffff,
            inset 1px 1px 0px #000000;
        flex-shrink: 0;
    }

    .trait-option.selected .color-swatch {
        border-color: #ffffff;
        box-shadow:
            inset -1px -1px 0px rgba(255, 255, 255, 0.4),
            inset 1px 1px 0px #000000;
    }

    /* --- Classic Windows 98 Blue Bar Artist Credit --- */
    .artist-credit-bar {
        position: absolute;
        bottom: 8px;
        right: 8px;
        z-index: 10;
        display: inline-flex;
        align-items: center;
        background: #000080;
        color: #ffffff;
        font-family: 'MS Sans Serif', 'Tahoma', sans-serif;
        font-size: 11px;
        font-weight: bold;
        padding: 3px 8px;
        border: 1px solid #000040;
        box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.4);
        user-select: none;
        white-space: nowrap;
        line-height: 1.2;
    }

    .artist-credit-bar a {
        color: #ffffff;
        text-decoration: underline;
        margin-left: 3px;
        cursor: pointer;
    }

    .artist-credit-bar a:hover {
        color: #ffff00;
        text-decoration: underline;
    }

    @media (max-width: 768px) {
        .pfp-maker-layout {
            flex-direction: column;
            flex: 1;
            min-height: 0;
            height: 100%;
        }

        .preview-box {
            width: 100%;
            max-height: 44vh;
            box-sizing: border-box;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }

        .canvas-container {
            flex: 1;
            min-height: 0;
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

        .win98-tabs li.tab-item {
            flex-direction: column;
            align-items: center;
            margin-right: 4px;
            gap: 2px;
        }

        .mini-lock-btn {
            height: 26px;
            width: 100%;
        }

        .tab-name-btn {
            text-align: center;
            width: 100%;
            padding: 6px 10px;
        }

        .win98-tabs li[aria-selected="true"] .tab-name-btn {
            border-right: 2px solid #000000;
            border-bottom: 2px solid #c0c0c0;
            margin-right: 0;
            margin-bottom: -2px;
            padding-right: 10px;
            padding-bottom: 8px;
        }

        .tab-separator {
            height: auto;
            width: 2px;
            background: #808080;
            border-bottom: none;
            border-right: 1px solid #ffffff;
            margin: 0 4px;
        }

        .tab-panel {
            flex: 1;
            width: 100%;
            box-sizing: border-box;
            overflow-y: auto;
            min-height: 0;
            height: 0;
        }

        .tooltip-toast {
            bottom: 20px;
            position: absolute;
        }

        .artist-credit-bar {
            bottom: 4px;
            right: 6px;
            padding: 2px 6px;
            font-size: 10px;
            z-index: 50;
        }
    }
</style>
