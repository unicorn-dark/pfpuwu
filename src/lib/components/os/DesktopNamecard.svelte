<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        userProfile,
        showAuthModal,
        authModalReason,
        showAvatarCustomizer,
        updateUserDisplayName
    } from "$lib/stores/auth";
    import {
        loadOrInitPlayerStats,
        type PlayerEconomyStats
    } from "$lib/game/economy/worldEconomy";
    import {
        NAMECARD_SKINS,
        NAMECARD_FINISHES,
        NAMECARD_FRAMES,
        NAMECARD_ROLE_BADGES,
        NAMECARD_EMBLEMS,
        TAGLINE_SUGGESTIONS,
        generateDefaultNamecardConfig,
        loadNamecardConfig,
        saveNamecardConfig,
        getSkinMeta,
        formatMemberSerial,
        ensureTransparentAvatarUrl,
        drawNamecardBackgroundFrame,
        copyNamecardImageToClipboard,
        downloadNamecardPng,
        type NamecardConfig,
        type NamecardEmblemId
    } from "$lib/stores/namecard";
    import { playSuccess, playPop } from "$lib/utils/audio";

    let { isMinimized = false }: { isMinimized?: boolean } = $props();

    let cardConfig = $state<NamecardConfig>(
        generateDefaultNamecardConfig("guest", "player", "Player")
    );
    let playerStats = $state<PlayerEconomyStats | null>(null);
    let cleanAvatarSrc = $state<string>("");

    let studioTab = $state<"theme" | "identity" | "autograph">("theme");
    let pointerNormX = $state(0.5);

    // Live Background Canvas (Static unless Holo Sweep is active, paused when minimized)
    let studioBgCanvasEl: HTMLCanvasElement | null = $state(null);
    let animFrameId: number | null = null;
    let lastFrameDrawMs = 0;
    let startTime = 0;

    // Streamlined Autograph Pad (720x420)
    let paintCanvasEl: HTMLCanvasElement | null = $state(null);
    let isDrawingPaint = $state(false);
    let autographColor = $state("#ffd700");
    let autographNib = $state<3 | 6>(3);
    let paintHistory = $state<string[]>([]);
    let lastDrawPt = { x: 0, y: 0 };

    let toastMsg = $state("");
    let isSaving = $state(false);
    let isCopying = $state(false);
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    let loadedForUserId = "";

    const activeSkin = $derived(getSkinMeta(cardConfig.skinId));
    const memberSerial = $derived(formatMemberSerial(cardConfig.userId, cardConfig.username));

    const autographColors = $derived(
        activeSkin.tone === "dark"
            ? ["#0f172a", "#000080", "#b45309", "#be185d"]
            : ["#ffffff", "#ffd700", "#00f0ff", "#ff4ecd"]
    );

    $effect(() => {
        if (!autographColors.includes(autographColor)) {
            autographColor = autographColors[0];
        }
    });

    function triggerToast(msg: string, ms = 2800) {
        toastMsg = msg;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toastMsg = "";
        }, ms);
    }

    async function hydrateForUser(
        userId: string,
        username: string,
        displayName: string,
        avatarUrl: string
    ) {
        const [cfg, stats, transparentAvatar] = await Promise.all([
            loadNamecardConfig(userId, username, displayName),
            loadOrInitPlayerStats(userId, username, avatarUrl, displayName),
            ensureTransparentAvatarUrl($userProfile)
        ]);
        cardConfig = {
            ...cfg,
            displayName: displayName || cfg.displayName || username
        };
        playerStats = stats;
        cleanAvatarSrc = transparentAvatar;
    }

    $effect(() => {
        const prof = $userProfile;
        if (prof) {
            ensureTransparentAvatarUrl(prof).then((url) => {
                cleanAvatarSrc = url;
            });
            if (prof.id !== loadedForUserId) {
                loadedForUserId = prof.id;
                hydrateForUser(
                    prof.id,
                    prof.x_username,
                    prof.x_display_name || prof.x_username,
                    prof.avatar_url
                );
            }
        } else {
            ensureTransparentAvatarUrl(null).then((url) => {
                cleanAvatarSrc = url;
            });
            if (loadedForUserId !== "") {
                loadedForUserId = "";
                cardConfig = generateDefaultNamecardConfig("guest", "player", "Player");
                playerStats = null;
            }
        }
    });

    // Hydrate autograph layer when paintCanvasEl mounts or saved URL changes
    let hydratedPaintUrl = "";
    $effect(() => {
        const url = cardConfig.paintDataUrl || "";
        if (paintCanvasEl && !isDrawingPaint && url !== hydratedPaintUrl) {
            hydratedPaintUrl = url;
            const ctx = paintCanvasEl.getContext("2d");
            if (!ctx) return;
            ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
            if (url) {
                const img = new Image();
                img.onload = () => {
                    if (!paintCanvasEl) return;
                    ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
                    ctx.drawImage(img, 0, 0, paintCanvasEl.width, paintCanvasEl.height);
                };
                img.src = url;
            }
        }
    });

    function redrawBackgroundOnce(timeSec = 1.2) {
        if (!studioBgCanvasEl) return;
        const ctx = studioBgCanvasEl.getContext("2d");
        if (!ctx) return;
        drawNamecardBackgroundFrame(
            ctx,
            studioBgCanvasEl.width,
            studioBgCanvasEl.height,
            cardConfig,
            timeSec,
            pointerNormX
        );
    }

    // Immediate crisp redraw when config or hover tilt changes
    $effect(() => {
        void cardConfig.skinId;
        void cardConfig.finishId;
        void pointerNormX;
        if (studioBgCanvasEl && !isMinimized) {
            redrawBackgroundOnce(1.2);
        }
    });

    // Throttled 24 FPS foil loop ONLY when Holo Sweep is active and window is visible
    function renderLoop(now: number) {
        if (!isMinimized && typeof document !== "undefined" && !document.hidden) {
            if (cardConfig.finishId === "holo_sweep") {
                if (now - lastFrameDrawMs >= 42) {
                    lastFrameDrawMs = now;
                    if (!startTime) startTime = now;
                    redrawBackgroundOnce((now - startTime) / 1000);
                }
            }
        }
        animFrameId = requestAnimationFrame(renderLoop);
    }

    function handleStatsUpdatedEvent(e: Event) {
        const custom = e as CustomEvent<PlayerEconomyStats>;
        if (custom.detail) {
            playerStats = { ...custom.detail };
        }
    }

    onMount(() => {
        ensureTransparentAvatarUrl($userProfile).then((url) => {
            cleanAvatarSrc = url;
        });
        redrawBackgroundOnce(1.2);
        animFrameId = requestAnimationFrame(renderLoop);
        window.addEventListener("uwu-stats-updated", handleStatsUpdatedEvent);
    });

    onDestroy(() => {
        if (animFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(animFrameId);
        }
        if (typeof window !== "undefined") {
            window.removeEventListener("uwu-stats-updated", handleStatsUpdatedEvent);
        }
        if (toastTimer) clearTimeout(toastTimer);
    });

    function promptSignIn(reason = "Sign in with X to customize and share your Collector Pass!") {
        authModalReason.set(reason);
        showAuthModal.set(true);
    }

    async function handleSaveStudio() {
        if (!$userProfile) {
            promptSignIn("Sign in with X to save your custom Collector Pass!");
            return;
        }
        isSaving = true;
        const cleanName = cardConfig.displayName.trim().slice(0, 26) || $userProfile.x_username;
        cardConfig.displayName = cleanName;
        await Promise.all([
            updateUserDisplayName(cleanName),
            saveNamecardConfig(cardConfig, true)
        ]);
        isSaving = false;
        playSuccess();
        triggerToast("Saved Collector Pass!");
    }

    async function handleCopyCardImage() {
        if (!$userProfile) {
            promptSignIn("Sign in with X to copy and share your Collector Pass!");
            return;
        }
        isCopying = true;
        const res = await copyNamecardImageToClipboard(cardConfig, $userProfile, playerStats);
        isCopying = false;
        playSuccess();
        triggerToast(res.message, 3200);
    }

    async function handleDownloadCardPng() {
        if (!$userProfile) {
            promptSignIn("Sign in with X to download your Collector Pass PNG!");
            return;
        }
        await downloadNamecardPng(cardConfig, $userProfile, playerStats);
        playSuccess();
        triggerToast("Saved Collector Pass PNG!");
    }

    function toggleEmblem(id: NamecardEmblemId) {
        const exists = cardConfig.emblems.includes(id);
        if (exists) {
            cardConfig.emblems = cardConfig.emblems.filter((e) => e !== id);
            playPop("down");
        } else {
            if (cardConfig.emblems.length >= 3) {
                cardConfig.emblems = [...cardConfig.emblems.slice(1), id];
            } else {
                cardConfig.emblems = [...cardConfig.emblems, id];
            }
            playPop("up");
        }
        saveNamecardConfig(cardConfig);
    }

    // --- AUTOGRAPH SIGNATURE PEN ---
    function getPaintCoords(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
        if (!paintCanvasEl) return null;
        const rect = paintCanvasEl.getBoundingClientRect();
        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        return {
            x: ((clientX - rect.left) / rect.width) * paintCanvasEl.width,
            y: ((clientY - rect.top) / rect.height) * paintCanvasEl.height
        };
    }

    function startAutograph(e: MouseEvent | TouchEvent) {
        if (studioTab !== "autograph" || !paintCanvasEl) return;
        e.preventDefault();
        const pt = getPaintCoords(e);
        if (!pt) return;
        paintHistory = [...paintHistory.slice(-14), paintCanvasEl.toDataURL("image/png")];
        isDrawingPaint = true;
        lastDrawPt = pt;
    }

    function moveAutograph(e: MouseEvent | TouchEvent) {
        if (!isDrawingPaint || studioTab !== "autograph" || !paintCanvasEl) return;
        e.preventDefault();
        const pt = getPaintCoords(e);
        if (!pt) return;
        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = autographNib;
        ctx.strokeStyle = autographColor;
        ctx.beginPath();
        ctx.moveTo(lastDrawPt.x, lastDrawPt.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
        lastDrawPt = pt;
    }

    function endAutograph() {
        if (!isDrawingPaint || !paintCanvasEl) return;
        isDrawingPaint = false;
        cardConfig.paintDataUrl = paintCanvasEl.toDataURL("image/png");
        saveNamecardConfig(cardConfig);
    }

    function undoAutograph() {
        if (!paintCanvasEl || paintHistory.length === 0) return;
        const prev = paintHistory[paintHistory.length - 1];
        paintHistory = paintHistory.slice(0, -1);
        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;
        const img = new Image();
        img.onload = () => {
            if (!paintCanvasEl) return;
            ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
            ctx.drawImage(img, 0, 0, paintCanvasEl.width, paintCanvasEl.height);
            cardConfig.paintDataUrl = paintCanvasEl.toDataURL("image/png");
            saveNamecardConfig(cardConfig);
        };
        img.src = prev;
    }

    function clearAutograph() {
        if (!paintCanvasEl) return;
        paintHistory = [...paintHistory.slice(-14), paintCanvasEl.toDataURL("image/png")];
        const ctx = paintCanvasEl.getContext("2d");
        ctx?.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
        cardConfig.paintDataUrl = null;
        saveNamecardConfig(cardConfig);
    }

    function handleStagePointerMove(e: MouseEvent) {
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        pointerNormX = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    }

    const liveChips = $derived(playerStats?.chips ?? 2500);
    const liveWins = $derived(playerStats?.wins ?? 0);
    const liveLosses = $derived(playerStats?.losses ?? 0);
    const liveWinRate = $derived(
        liveWins + liveLosses > 0 ? Math.round((liveWins / (liveWins + liveLosses)) * 100) : 0
    );
    const liveBestWin = $derived(playerStats?.high_score ?? 0);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="nc-app-shell">
    {#if !$userProfile}
        <div class="nc-guest-banner">
            <span class="nc-guest-text">
                🪪 Guest Preview — Sign in with 𝕏 to save your Collector Pass, sync live MMO stats, and export high-res PNGs.
            </span>
            <button
                type="button"
                class="win98-btn primary-save-btn"
                onclick={() => promptSignIn("Sign in with X to save and share your personal Collector Pass!")}
            >
                𝕏 Sign In
            </button>
        </div>
    {/if}

    <div class="dialog-body">
        <div class="customizer-split">
            <!-- LEFT: LIVE COLLECTOR PASS STAGE -->
            <div class="nc-stage-col">
                <div
                    class="nc-stage-desk win98-inset"
                    onmousemove={handleStagePointerMove}
                    onmouseleave={() => (pointerNormX = 0.5)}
                >
                    <div
                        class="nc-pass frame-{cardConfig.frameId} tone-{activeSkin.tone}"
                        style="
                            --nc-primary: {activeSkin.primaryText};
                            --nc-secondary: {activeSkin.secondaryText};
                            --nc-accent: {activeSkin.accentColor};
                            --nc-header-bg: {activeSkin.headerBg};
                            --nc-header-text: {activeSkin.headerText};
                            --nc-divider: {activeSkin.dividerColor};
                            --nc-bay-bg: {activeSkin.bayBg};
                            --nc-bay-border: {activeSkin.bayBorder};
                        "
                    >
                        <canvas
                            bind:this={studioBgCanvasEl}
                            width="720"
                            height="420"
                            class="nc-bg-canvas"
                        ></canvas>

                        <!-- Top Collector Micro-Header -->
                        <div class="nc-pass-header">
                            <span class="nc-pass-brand">UWU.OS // MEMBER PASS</span>
                            <span class="nc-pass-meta">
                                {cardConfig.roleBadge} • NO. {memberSerial}
                            </span>
                        </div>

                        <!-- Main Identity Row -->
                        <div class="nc-pass-main">
                            <button
                                type="button"
                                class="nc-portrait-bay"
                                onclick={() => {
                                    if ($userProfile) showAvatarCustomizer.set(true);
                                    else promptSignIn("Sign in with X to customize your Pixel Unicorn!");
                                }}
                                title="Click to customize Pixel Unicorn avatar"
                            >
                                {#if cleanAvatarSrc}
                                    <img
                                        src={cleanAvatarSrc}
                                        alt={cardConfig.displayName}
                                        class="nc-avatar-cutout"
                                    />
                                {/if}
                            </button>

                            <div class="nc-identity-col">
                                <div class="nc-display-name">
                                    {cardConfig.displayName ||
                                        $userProfile?.x_display_name ||
                                        $userProfile?.x_username ||
                                        "Player"}
                                </div>
                                <div class="nc-handle">@{cardConfig.username}</div>
                                {#if cardConfig.tagline}
                                    <div class="nc-tagline">{cardConfig.tagline}</div>
                                {/if}

                                {#if cardConfig.emblems.length > 0}
                                    <div class="nc-equipped-emblems">
                                        {#each cardConfig.emblems.slice(0, 3) as eId (eId)}
                                            {@const meta = NAMECARD_EMBLEMS.find((e) => e.id === eId)}
                                            {#if meta}
                                                <span class="nc-emblem-pin" title={meta.name}>
                                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                                        <path d={meta.viewBoxPath} />
                                                    </svg>
                                                </span>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Bottom Tabular Stats Strip -->
                        <div class="nc-stats-row">
                            <div class="nc-stat-item">
                                <span class="nc-stat-label">$UWU CHIPS</span>
                                <span class="nc-stat-val">{liveChips.toLocaleString()}</span>
                            </div>
                            <div class="nc-stat-divider"></div>
                            <div class="nc-stat-item">
                                <span class="nc-stat-label">RECORD</span>
                                <span class="nc-stat-val">{liveWins}W-{liveLosses}L</span>
                            </div>
                            <div class="nc-stat-divider"></div>
                            <div class="nc-stat-item">
                                <span class="nc-stat-label">WIN RATE</span>
                                <span class="nc-stat-val">{liveWinRate}%</span>
                            </div>
                            <div class="nc-stat-divider"></div>
                            <div class="nc-stat-item">
                                <span class="nc-stat-label">BEST WIN</span>
                                <span class="nc-stat-val">{liveBestWin.toLocaleString()}</span>
                            </div>
                            <div class="nc-mini-barcode" aria-hidden="true">
                                <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
                            </div>
                        </div>

                        <!-- Autograph Signature Canvas Layer -->
                        <canvas
                            bind:this={paintCanvasEl}
                            width="720"
                            height="420"
                            class="nc-autograph-canvas"
                            class:active={studioTab === "autograph"}
                            onmousedown={startAutograph}
                            onmousemove={moveAutograph}
                            onmouseup={endAutograph}
                            onmouseleave={endAutograph}
                            ontouchstart={startAutograph}
                            ontouchmove={moveAutograph}
                            ontouchend={endAutograph}
                        ></canvas>

                        {#if cardConfig.frameId === "tech_brackets"}
                            <span class="nc-bracket tl" aria-hidden="true"></span>
                            <span class="nc-bracket tr" aria-hidden="true"></span>
                            <span class="nc-bracket bl" aria-hidden="true"></span>
                            <span class="nc-bracket br" aria-hidden="true"></span>
                        {/if}
                    </div>
                </div>

                <!-- Classic OS Action Row -->
                <div class="nc-stage-actions">
                    <button
                        type="button"
                        class="win98-btn primary-save-btn"
                        disabled={isSaving}
                        onclick={handleSaveStudio}
                    >
                        {isSaving ? "Saving..." : "💾 Save Pass"}
                    </button>
                    <button
                        type="button"
                        class="win98-btn"
                        disabled={isCopying}
                        onclick={handleCopyCardImage}
                    >
                        {isCopying ? "Copying..." : "📋 Copy PNG"}
                    </button>
                    <button
                        type="button"
                        class="win98-btn"
                        onclick={handleDownloadCardPng}
                    >
                        ⬇️ Download PNG
                    </button>
                </div>

                {#if toastMsg}
                    <div class="toast-box">{toastMsg}</div>
                {/if}
            </div>

            <!-- RIGHT: 3-TAB ART-DIRECTED CUSTOMIZER -->
            <div class="traits-column">
                <div class="category-tabs" role="tablist">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={studioTab === "theme"}
                        class="category-tab {studioTab === 'theme' ? 'active' : ''}"
                        onclick={() => (studioTab = "theme")}
                    >
                        Theme & Finish
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={studioTab === "identity"}
                        class="category-tab {studioTab === 'identity' ? 'active' : ''}"
                        onclick={() => (studioTab = "identity")}
                    >
                        Identity & Pins
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={studioTab === "autograph"}
                        class="category-tab {studioTab === 'autograph' ? 'active' : ''}"
                        onclick={() => (studioTab = "autograph")}
                    >
                        Autograph
                    </button>
                </div>

                <div class="traits-panel win98-inset">
                    {#if studioTab === "theme"}
                        <div class="nc-section-title">1. Collector Pass Skin (8 Art-Directed Editions)</div>
                        <div class="nc-skin-grid">
                            {#each NAMECARD_SKINS as skin (skin.id)}
                                <button
                                    type="button"
                                    class="trait-card nc-skin-card {cardConfig.skinId === skin.id ? 'selected' : ''}"
                                    data-sfx="flick"
                                    onclick={() => {
                                        cardConfig.skinId = skin.id;
                                        saveNamecardConfig(cardConfig);
                                    }}
                                >
                                    <span class="nc-swatch-preview" style="background: {skin.swatchCss};">
                                        <span class="nc-skin-tag">{skin.tag}</span>
                                    </span>
                                    <span class="trait-name">{skin.name}</span>
                                </button>
                            {/each}
                        </div>

                        <div class="nc-section-title">2. Surface Finish</div>
                        <div class="nc-chip-grid">
                            {#each NAMECARD_FINISHES as fin (fin.id)}
                                <button
                                    type="button"
                                    data-sfx="flick"
                                    class="win98-btn nc-opt-btn {cardConfig.finishId === fin.id ? 'primary-save-btn' : ''}"
                                    title={fin.desc}
                                    onclick={() => {
                                        cardConfig.finishId = fin.id;
                                        saveNamecardConfig(cardConfig);
                                    }}
                                >
                                    {fin.name}
                                </button>
                            {/each}
                        </div>

                        <div class="nc-section-title">3. Hardware Frame</div>
                        <div class="nc-chip-grid">
                            {#each NAMECARD_FRAMES as frm (frm.id)}
                                <button
                                    type="button"
                                    data-sfx="flick"
                                    class="win98-btn nc-opt-btn {cardConfig.frameId === frm.id ? 'primary-save-btn' : ''}"
                                    title={frm.desc}
                                    onclick={() => {
                                        cardConfig.frameId = frm.id;
                                        saveNamecardConfig(cardConfig);
                                    }}
                                >
                                    {frm.name}
                                </button>
                            {/each}
                        </div>
                    {:else if studioTab === "identity"}
                        <div class="nc-identity-fields">
                            <div class="nc-field-group">
                                <label for="nc-name-in">Display Name:</label>
                                <input
                                    id="nc-name-in"
                                    type="text"
                                    class="win98-input"
                                    maxlength="26"
                                    bind:value={cardConfig.displayName}
                                    placeholder="Your display name"
                                />
                            </div>
                            <div class="nc-field-group">
                                <label for="nc-tag-in">Status Line:</label>
                                <input
                                    id="nc-tag-in"
                                    type="text"
                                    class="win98-input"
                                    maxlength="44"
                                    bind:value={cardConfig.tagline}
                                    placeholder="Optional status..."
                                />
                            </div>
                        </div>

                        <div class="nc-section-title">Quick Status Presets</div>
                        <div class="nc-chip-grid">
                            {#each TAGLINE_SUGGESTIONS as sug (sug)}
                                <button
                                    type="button"
                                    class="win98-btn nc-mini-chip"
                                    onclick={() => {
                                        cardConfig.tagline = sug;
                                        saveNamecardConfig(cardConfig);
                                    }}
                                >
                                    {sug}
                                </button>
                            {/each}
                        </div>

                        <div class="nc-section-title">Header Role Title</div>
                        <div class="nc-chip-grid">
                            {#each NAMECARD_ROLE_BADGES as role (role)}
                                <button
                                    type="button"
                                    data-sfx="flick"
                                    class="win98-btn nc-opt-btn {cardConfig.roleBadge === role ? 'primary-save-btn' : ''}"
                                    onclick={() => {
                                        cardConfig.roleBadge = role;
                                        saveNamecardConfig(cardConfig);
                                    }}
                                >
                                    {role}
                                </button>
                            {/each}
                        </div>

                        <div class="nc-section-title">Vector Emblem Pins (Select up to 3)</div>
                        <div class="nc-emblem-picker-grid">
                            {#each NAMECARD_EMBLEMS as item (item.id)}
                                {@const active = cardConfig.emblems.includes(item.id)}
                                <button
                                    type="button"
                                    class="trait-card nc-emblem-pick-btn {active ? 'selected' : ''}"
                                    onclick={() => toggleEmblem(item.id)}
                                >
                                    <svg viewBox="0 0 24 24" class="nc-pick-svg" aria-hidden="true">
                                        <path d={item.viewBoxPath} />
                                    </svg>
                                    <span class="trait-name">{item.name}</span>
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <div class="nc-section-title">Autograph Signature Pen</div>
                        <p class="nc-helper-text">
                            Sign directly on your Collector Pass on the left. Signatures export cleanly on high-res PNGs.
                        </p>

                        <div class="nc-section-title">Matched Ink Colors</div>
                        <div class="nc-solid-row">
                            {#each autographColors as hex (hex)}
                                <button
                                    type="button"
                                    class="nc-color-dot {autographColor === hex ? 'selected' : ''}"
                                    style="background: {hex};"
                                    onclick={() => (autographColor = hex)}
                                    title="Select ink {hex}"
                                ></button>
                            {/each}
                        </div>

                        <div class="nc-section-title">Nib Thickness</div>
                        <div class="nc-segmented-row">
                            <button
                                type="button"
                                class="win98-btn {autographNib === 3 ? 'primary-save-btn' : ''}"
                                onclick={() => (autographNib = 3)}
                            >
                                Fine Pen (3px)
                            </button>
                            <button
                                type="button"
                                class="win98-btn {autographNib === 6 ? 'primary-save-btn' : ''}"
                                onclick={() => (autographNib = 6)}
                            >
                                Bold Marker (6px)
                            </button>
                        </div>

                        <div class="nc-draw-actions">
                            <button
                                type="button"
                                class="win98-btn"
                                disabled={paintHistory.length === 0}
                                onclick={undoAutograph}
                            >
                                ↩ Undo ({paintHistory.length})
                            </button>
                            <button
                                type="button"
                                class="win98-btn"
                                data-sfx="pop-down"
                                onclick={clearAutograph}
                            >
                                🗑️ Clear Signature
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <div class="dialog-footer">
            <span class="avatar-rule-hint">
                💡 Tip: Click your Unicorn portrait on the left to swap traits — every skin guarantees crisp contrast.
            </span>
        </div>
    </div>
</div>

<style>
    .nc-app-shell {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        background: #c0c0c0;
        font-family: 'MS Sans Serif', 'Tahoma', Arial, sans-serif;
        color: #000000;
        box-sizing: border-box;
        user-select: none;
    }

    .nc-guest-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        background: #ffffe1;
        border-bottom: 2px solid #808080;
        padding: 6px 10px;
        font-size: 11px;
        color: #000000;
    }

    .nc-guest-text {
        font-weight: bold;
    }

    .dialog-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .customizer-split {
        display: grid;
        grid-template-columns: 472px 1fr;
        gap: 12px;
        align-items: start;
    }

    @media (max-width: 860px) {
        .customizer-split {
            grid-template-columns: 1fr;
        }
    }

    .nc-stage-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        width: 100%;
    }

    .nc-stage-desk {
        width: 100%;
        padding: 16px 12px;
        background: #1a1d24;
        background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 0);
        background-size: 12px 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
    }

    /* CRISP RETRO OS COLLECTOR PASS CARD (6px/8px HARDWARE GEOMETRY) */
    .nc-pass {
        position: relative;
        width: 444px;
        height: 259px;
        border-radius: 6px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow: 0 12px 28px rgba(0, 0, 0, 0.48);
        color: var(--nc-primary);
        font-family: 'Tahoma', 'MS Sans Serif', Arial, sans-serif;
        box-sizing: border-box;
    }

    .nc-pass.frame-win98_bevel {
        border: 2px solid;
        border-color: #ffffff #404040 #404040 #ffffff;
    }

    .nc-pass.frame-gold_hairline {
        border: 2px solid #ffd700;
        box-shadow:
            inset 0 0 0 4px rgba(255, 215, 0, 0.25),
            0 12px 28px rgba(0, 0, 0, 0.5);
    }

    .nc-pass.frame-holo_rim {
        border: 2px solid #72efdd;
        box-shadow:
            0 0 18px rgba(168, 85, 247, 0.35),
            0 12px 28px rgba(0, 0, 0, 0.5);
    }

    .nc-pass.frame-tech_brackets,
    .nc-pass.frame-minimal {
        border: 1.5px solid var(--nc-divider);
    }

    .nc-bracket {
        position: absolute;
        width: 14px;
        height: 14px;
        z-index: 6;
        pointer-events: none;
        border-color: var(--nc-accent);
        border-style: solid;
    }
    .nc-bracket.tl { top: 6px; left: 6px; border-width: 2.5px 0 0 2.5px; }
    .nc-bracket.tr { top: 6px; right: 6px; border-width: 2.5px 2.5px 0 0; }
    .nc-bracket.bl { bottom: 6px; left: 6px; border-width: 0 0 2.5px 2.5px; }
    .nc-bracket.br { bottom: 6px; right: 6px; border-width: 0 2.5px 2.5px 0; }

    .nc-bg-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 0;
        pointer-events: none;
    }

    /* TOP MICRO-HEADER */
    .nc-pass-header {
        position: relative;
        z-index: 2;
        height: 30px;
        padding: 0 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: var(--nc-header-text);
        font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        flex-shrink: 0;
    }

    .nc-pass-main {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 8px 16px 6px;
        flex: 1;
        min-height: 0;
    }

    .nc-portrait-bay {
        width: 116px;
        height: 116px;
        flex-shrink: 0;
        background: var(--nc-bay-bg);
        border: 1.5px solid var(--nc-bay-border);
        border-radius: 4px;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.14s ease;
    }

    .nc-portrait-bay:hover {
        transform: scale(1.03);
    }

    .nc-avatar-cutout {
        width: 100%;
        height: 100%;
        object-fit: contain;
        image-rendering: pixelated;
        filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.35));
    }

    .nc-identity-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .nc-display-name {
        font-size: 21px;
        font-weight: 800;
        line-height: 1.15;
        color: var(--nc-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nc-handle {
        font-family: 'JetBrains Mono', Consolas, 'Courier New', monospace;
        font-size: 11.5px;
        font-weight: 700;
        color: var(--nc-accent);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nc-tagline {
        margin-top: 3px;
        font-size: 11px;
        color: var(--nc-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nc-equipped-emblems {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
    }

    .nc-emblem-pin {
        width: 26px;
        height: 26px;
        background: var(--nc-bay-bg);
        border: 1px solid var(--nc-bay-border);
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--nc-accent);
    }

    .nc-emblem-pin svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
    }

    /* BOTTOM TABULAR STATS STRIP */
    .nc-stats-row {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 0 16px 12px;
        padding-top: 9px;
        border-top: 1px solid var(--nc-divider);
        gap: 6px;
    }

    .nc-stat-item {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
    }

    .nc-stat-label {
        font-family: 'JetBrains Mono', Consolas, monospace;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: var(--nc-secondary);
    }

    .nc-stat-val {
        font-family: 'JetBrains Mono', Consolas, monospace;
        font-variant-numeric: tabular-nums;
        font-size: 14px;
        font-weight: 800;
        color: var(--nc-primary);
    }

    .nc-stat-divider {
        width: 1px;
        height: 24px;
        background: var(--nc-divider);
        flex-shrink: 0;
    }

    .nc-mini-barcode {
        display: flex;
        align-items: stretch;
        gap: 2px;
        height: 26px;
        opacity: 0.55;
        flex-shrink: 0;
    }
    .nc-mini-barcode i {
        display: block;
        width: 2px;
        background: var(--nc-secondary);
    }
    .nc-mini-barcode i:nth-child(2n) { width: 1px; }
    .nc-mini-barcode i:nth-child(3) { width: 3px; }

    .nc-autograph-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 4;
        pointer-events: none;
    }

    .nc-autograph-canvas.active {
        pointer-events: auto;
        cursor: crosshair;
    }

    .nc-stage-actions {
        width: 100%;
        display: flex;
        gap: 6px;
    }

    .nc-stage-actions .win98-btn {
        flex: 1;
    }

    .primary-save-btn {
        background: #000080 !important;
        color: #ffffff !important;
        border-color: #8080ff #000040 #000040 #8080ff !important;
        font-weight: bold;
    }

    .toast-box {
        width: 100%;
        background: #008000;
        color: #ffffff;
        padding: 4px 6px;
        font-size: 11px;
        text-align: center;
        border: 1px solid #004000;
    }

    /* RIGHT CUSTOMIZER TABS */
    .traits-column {
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
        padding: 5px 10px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
    }

    .category-tab.active {
        background: #ffffff;
        font-weight: bold;
        border-color: #808080 #808080 #ffffff #808080;
        box-shadow: inset 0 2px #000080;
    }

    .traits-panel {
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 10px;
        overflow-y: auto;
        max-height: 360px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .nc-section-title {
        font-size: 11px;
        font-weight: bold;
        color: #000080;
        border-bottom: 1px solid #dfdfdf;
        padding-bottom: 2px;
    }

    .nc-skin-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
        gap: 4px;
        cursor: pointer;
    }

    .trait-card.selected {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
        outline: 1px dotted #ffffff;
    }

    .nc-swatch-preview {
        width: 100%;
        height: 28px;
        border: 1px solid #404040;
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: flex-end;
        padding: 2px 4px;
        box-sizing: border-box;
    }

    .nc-skin-tag {
        font-size: 8px;
        font-weight: bold;
        background: rgba(0, 0, 0, 0.65);
        color: #ffffff;
        padding: 1px 4px;
    }

    .trait-name {
        font-size: 10px;
        font-weight: bold;
        text-align: center;
    }

    .nc-chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .nc-opt-btn {
        font-size: 10.5px;
        padding: 3px 8px;
    }

    .nc-mini-chip {
        font-size: 10px;
        padding: 2px 7px;
    }

    .nc-identity-fields {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
    }

    .nc-field-group {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .nc-field-group label {
        font-size: 11px;
        font-weight: bold;
    }

    .nc-emblem-picker-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 5px;
    }

    .nc-emblem-pick-btn {
        padding: 6px 4px;
    }

    .nc-pick-svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
    }

    .nc-solid-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .nc-color-dot {
        width: 26px;
        height: 26px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        cursor: pointer;
    }

    .nc-color-dot.selected {
        outline: 2px solid #000080;
        outline-offset: 2px;
    }

    .nc-segmented-row,
    .nc-draw-actions {
        display: flex;
        gap: 6px;
    }

    .nc-segmented-row .win98-btn,
    .nc-draw-actions .win98-btn {
        flex: 1;
    }

    .nc-helper-text {
        margin: 0;
        font-size: 11px;
        color: #333333;
        line-height: 1.35;
    }

    .dialog-footer {
        border-top: 1px solid #808080;
        padding-top: 8px;
    }

    .avatar-rule-hint {
        font-size: 10px;
        color: #444444;
    }

    @media (max-width: 560px) {
        .nc-pass {
            width: 100%;
            max-width: 344px;
            height: 202px;
        }
        .nc-pass-header {
            height: 24px;
            font-size: 7.5px;
            padding: 0 10px;
        }
        .nc-pass-main {
            gap: 10px;
            padding: 6px 10px 4px;
        }
        .nc-portrait-bay {
            width: 84px;
            height: 84px;
        }
        .nc-display-name {
            font-size: 16px;
        }
        .nc-stat-val {
            font-size: 11.5px;
        }
        .nc-mini-barcode {
            display: none;
        }
        .nc-identity-fields {
            grid-template-columns: 1fr;
        }
        .traits-panel {
            max-height: none;
        }
    }
</style>
