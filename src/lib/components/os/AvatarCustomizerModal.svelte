<script lang="ts">
    import {
        LAYER_ORDER,
        TRAITS,
        getCachedTraitImage
    } from "$lib/utils/traits";
    import {
        userProfile,
        showAvatarCustomizer,
        savePersonaAvatar,
        requireXLogin
    } from "$lib/stores/auth";
    import { getDefaultAvatarTraits } from "$lib/utils/avatar";

    let currentTraits = $state<Record<string, number>>(getDefaultAvatarTraits());
    let activeTab = $state("body");
    let canvasElement: HTMLCanvasElement | null = $state(null);
    let isRendering = $state(false);
    let isSaving = $state(false);
    let lockedCategories = $state<Record<string, boolean>>({});
    let toastMessage = $state("");
    let toastTimeout: ReturnType<typeof setTimeout>;

    function showToast(msg: string) {
        toastMessage = msg;
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastMessage = "";
        }, 2400);
    }

    // Sync traits from current user profile when modal opens
    $effect(() => {
        if ($showAvatarCustomizer) {
            if ($userProfile?.avatar_traits && Object.keys($userProfile.avatar_traits).length > 0) {
                currentTraits = { ...$userProfile.avatar_traits };
            } else {
                currentTraits = getDefaultAvatarTraits();
            }
        }
    });

    async function drawTransparentPreview() {
        if (!canvasElement) return;
        const ctx = canvasElement.getContext("2d");
        if (!ctx) return;

        isRendering = true;
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        const paths: string[] = [];
        LAYER_ORDER.forEach((layer) => {
            const idx = currentTraits[layer] ?? 0;
            const trait = TRAITS[layer]?.[idx];
            if (trait && trait.src) {
                paths.push(trait.src);
            }
        });

        const images = await Promise.all(paths.map(getCachedTraitImage));
        images.forEach((img) => {
            if (img) {
                ctx.drawImage(img, 0, 0, canvasElement!.width, canvasElement!.height);
            }
        });
        isRendering = false;
    }

    $effect(() => {
        // Re-render preview whenever traits change or modal is shown
        if ($showAvatarCustomizer && currentTraits) {
            drawTransparentPreview();
        }
    });

    function randomize() {
        LAYER_ORDER.forEach((layer) => {
            if (!lockedCategories[layer]) {
                const count = TRAITS[layer].length;
                currentTraits[layer] = Math.floor(Math.random() * count);
            }
        });
    }

    async function handleSave() {
        if (!$userProfile) {
            requireXLogin("Sign in with X to save your Persona Avatar.");
            return;
        }

        isSaving = true;
        try {
            const res = await savePersonaAvatar({ ...currentTraits });
            if (res.ok) {
                showToast("Persona Avatar saved! Desktop pet is now active! 🦄");
                setTimeout(() => {
                    showAvatarCustomizer.set(false);
                }, 800);
            }
        } catch (err: any) {
            showToast("Failed to save avatar.");
        } finally {
            isSaving = false;
        }
    }

    function closeModal() {
        showAvatarCustomizer.set(false);
    }
</script>

{#if $showAvatarCustomizer}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="win98-modal-backdrop" onclick={closeModal}>
        <div class="win98-dialog" onclick={(e) => e.stopPropagation()}>
            <div class="title-bar">
                <div class="title-bar-text">
                    🦄 Persona Avatar Setup — {$userProfile ? `@${$userProfile.x_username}` : "Identity"}
                </div>
                <div class="title-bar-controls">
                    <button onclick={closeModal} aria-label="Close">X</button>
                </div>
            </div>

            <div class="dialog-body">
                <div class="explainer-banner">
                    <strong>Your Central Persona:</strong> Customize your character traits (transparent sprite).
                    This avatar appears in <strong>Global Chat</strong>, <strong>MySpace</strong>, and acts as your <strong>Desktop Pet</strong>!
                </div>

                <div class="customizer-split">
                    <!-- Left: Checkerboard Live Preview -->
                    <div class="preview-column">
                        <div class="checkerboard-box">
                            <canvas
                                bind:this={canvasElement}
                                width="300"
                                height="300"
                                class="transparent-canvas"
                            ></canvas>
                            {#if isRendering}
                                <div class="rendering-pill">Drawing...</div>
                            {/if}
                        </div>

                        <div class="preview-actions">
                            <button type="button" class="win98-btn" onclick={randomize}>
                                🎲 Randomize
                            </button>
                            <button
                                type="button"
                                class="win98-btn primary-save-btn"
                                onclick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? "Saving..." : "💾 Save Avatar Persona"}
                            </button>
                        </div>

                        {#if toastMessage}
                            <div class="toast-box">{toastMessage}</div>
                        {/if}
                    </div>

                    <!-- Right: Trait Selection Tabs & Grid -->
                    <div class="traits-column">
                        <!-- Category Tabs -->
                        <div class="category-tabs" role="tablist">
                            {#each LAYER_ORDER as tab}
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab}
                                    class="category-tab {activeTab === tab ? 'active' : ''}"
                                    onclick={() => (activeTab = tab)}
                                >
                                    <span
                                        class="lock-indicator"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            lockedCategories[tab] = !lockedCategories[tab];
                                        }}
                                        title={lockedCategories[tab] ? "Unlock" : "Lock"}
                                    >
                                        {lockedCategories[tab] ? "🔒" : ""}
                                    </span>
                                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            {/each}
                        </div>

                        <!-- Trait Options Grid -->
                        <div class="traits-panel win98-inset">
                            <div class="trait-grid">
                                {#each TRAITS[activeTab] || [] as trait, idx}
                                    <button
                                        type="button"
                                        class="trait-card {currentTraits[activeTab] === idx ? 'selected' : ''}"
                                        onclick={() => (currentTraits[activeTab] = idx)}
                                    >
                                        {#if trait.src}
                                            <img
                                                src={trait.src}
                                                alt={trait.name}
                                                class="trait-thumb"
                                                loading="lazy"
                                            />
                                        {:else}
                                            <div class="trait-none">None</div>
                                        {/if}
                                        <span class="trait-name">{trait.name}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <span class="avatar-rule-hint">
                        💡 Transparent character sprite without ring or background.
                    </span>
                    <button type="button" class="win98-btn" onclick={closeModal}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .win98-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 100000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
    }

    .win98-dialog {
        width: 100%;
        max-width: 720px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 2px 2px 12px rgba(0, 0, 0, 0.6);
        font-family: "Pixelated MS Sans Serif", Arial, sans-serif;
    }

    .title-bar {
        background: #000080;
        color: #ffffff;
        padding: 3px 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        font-size: 11px;
    }

    .title-bar-controls button {
        background: #c0c0c0;
        border: 1px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        font-size: 9px;
        font-weight: bold;
        width: 16px;
        height: 14px;
        line-height: 11px;
        padding: 0;
        cursor: pointer;
    }

    .dialog-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .explainer-banner {
        background: #ffffcc;
        border: 1px solid #808000;
        padding: 6px 10px;
        font-size: 11px;
        color: #000000;
        line-height: 1.4;
    }

    .customizer-split {
        display: flex;
        gap: 12px;
        min-height: 340px;
    }

    .preview-column {
        flex: 0 0 240px;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    /* Classic transparency checkerboard background */
    .checkerboard-box {
        width: 240px;
        height: 240px;
        background-color: #f0f0f0;
        background-image:
            linear-gradient(45deg, #d8d8d8 25%, transparent 25%),
            linear-gradient(-45deg, #d8d8d8 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #d8d8d8 75%),
            linear-gradient(-45deg, transparent 75%, #d8d8d8 75%);
        background-size: 16px 16px;
        background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .transparent-canvas {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .rendering-pill {
        position: absolute;
        bottom: 6px;
        right: 6px;
        background: rgba(0, 0, 0, 0.6);
        color: #ffffff;
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .preview-actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .primary-save-btn {
        background: #000080 !important;
        color: #ffffff !important;
        border-color: #8080ff #000040 #000040 #8080ff !important;
        font-weight: bold;
        padding: 6px 12px;
    }

    .toast-box {
        background: #008000;
        color: #ffffff;
        padding: 4px 6px;
        font-size: 11px;
        text-align: center;
    }

    .traits-column {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .category-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        margin-bottom: -1px;
        z-index: 1;
    }

    .category-tab {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        border-bottom: none;
        padding: 3px 8px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .category-tab.active {
        background: #ffffff;
        font-weight: bold;
        border-color: #808080 #808080 #ffffff #808080;
        box-shadow: inset 0 2px #000080;
    }

    .lock-indicator {
        font-size: 9px;
    }

    .traits-panel {
        flex: 1;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 6px;
        overflow-y: auto;
        max-height: 290px;
    }

    .trait-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
        gap: 6px;
    }

    .trait-card {
        background: #dfdfdf;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        padding: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        cursor: pointer;
        min-height: 72px;
    }

    .trait-card.selected {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
        outline: 1px dotted #ffffff;
    }

    .trait-thumb {
        width: 44px;
        height: 44px;
        object-fit: contain;
    }

    .trait-none {
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        color: #808080;
    }

    .trait-name {
        font-size: 9px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 70px;
    }

    .win98-btn {
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        padding: 4px 10px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
    }

    .win98-btn:active {
        border-color: #000000 #ffffff #ffffff #000000;
        padding: 5px 9px 3px 11px;
    }

    .dialog-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #808080;
        padding-top: 8px;
    }

    .avatar-rule-hint {
        font-size: 10px;
        color: #555555;
    }

    @media (max-width: 600px) {
        .customizer-split {
            flex-direction: column;
        }
        .preview-column {
            flex: none;
            align-items: center;
        }
    }
</style>
