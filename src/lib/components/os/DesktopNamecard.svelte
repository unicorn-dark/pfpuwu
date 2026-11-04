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
        LIQUID_PRESETS,
        GRADIENT_PRESETS,
        SOLID_COLOR_PRESETS,
        NAMECARD_BORDERS,
        TAGLINE_SUGGESTIONS,
        NAMECARD_STICKER_CATALOG,
        NAMECARD_PAINT_PALETTE,
        generateDefaultNamecardConfig,
        loadNamecardConfig,
        saveNamecardConfig,
        resolveCardTextTone,
        ensureTransparentAvatarUrl,
        drawNamecardBackgroundFrame,
        copyNamecardImageToClipboard,
        downloadNamecardPng,
        type NamecardConfig
    } from "$lib/stores/namecard";

    let cardConfig = $state<NamecardConfig>(
        generateDefaultNamecardConfig("guest", "player", "Player")
    );
    let playerStats = $state<PlayerEconomyStats | null>(null);
    let cleanAvatarSrc = $state<string>("");

    // Customizer Studio State
    let studioTab = $state<"background" | "style" | "draw" | "stickers">("background");
    let selectedStickerId = $state<string | null>(null);
    let draggingStickerId = $state<string | null>(null);
    let previewContainerEl: HTMLDivElement | null = $state(null);

    // Animated Background Canvas
    let studioBgCanvasEl: HTMLCanvasElement | null = $state(null);
    let animFrameId: number | null = null;
    let startTime = 0;

    // Creative Drawing Studio State (720x420 High-Res Native Canvas)
    type DrawToolId =
        | "pen"
        | "neon"
        | "airbrush"
        | "pixel"
        | "rainbow"
        | "sparkle"
        | "line"
        | "rect"
        | "circle"
        | "fill"
        | "picker"
        | "eraser"
        | "pan";
    type SymmetryMode = "none" | "horiz" | "vert" | "quad";

    let paintCanvasEl: HTMLCanvasElement | null = $state(null);
    let shapeOverlayCanvasEl: HTMLCanvasElement | null = $state(null);
    let isDrawingPaint = $state(false);
    let drawTool = $state<DrawToolId>("pen");
    let brushColor = $state("#ffffff");
    let brushSize = $state(5);
    let brushOpacity = $state(100);
    let brushStabilizer = $state(45);
    let symmetryMode = $state<SymmetryMode>("none");
    let shapeFilled = $state(false);
    let customSwatches = $state<string[]>([]);

    // Undo / Redo Stacks (25 steps)
    let paintHistory = $state<string[]>([]);
    let paintRedoStack = $state<string[]>([]);

    // Zoom, Pan & Expanded Workspace State
    let canvasZoom = $state(1);
    let canvasPanX = $state(0);
    let canvasPanY = $state(0);
    let isPanningCanvas = $state(false);
    let isSpaceHeld = $state(false);
    let panStartClient = { x: 0, y: 0, startX: 0, startY: 0 };
    let isExpandedDrawView = $state(false);
    let dimCardUiWhileDrawing = $state(false);

    // Stroke Interpolation State
    let lastDrawPt = { x: 0, y: 0 };
    let smoothedPt = { x: 0, y: 0 };
    let shapeStartPt = { x: 0, y: 0 };
    let rainbowHue = 0;

    // Toast Feedback
    let toastMsg = $state("");
    let isSaving = $state(false);
    let isCopying = $state(false);
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    let loadedForUserId = "";

    const textTone = $derived(resolveCardTextTone(cardConfig));
    const selectedSticker = $derived(
        cardConfig.stickers.find((s) => s.id === selectedStickerId) || null
    );

    const accentColor = $derived.by(() => {
        if (cardConfig.bgMode === "liquid") {
            return (
                LIQUID_PRESETS.find((p) => p.id === cardConfig.bgPresetId)?.accentColor ||
                "#9d2ec5"
            );
        }
        if (cardConfig.bgMode === "gradient") {
            return (
                GRADIENT_PRESETS.find((p) => p.id === cardConfig.bgPresetId)?.accentColor ||
                "#9d2ec5"
            );
        }
        return textTone === "dark" ? "#7c3aed" : "#72efdd";
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

    // Keep transparent avatar synced whenever userProfile or its avatar_url updates
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

    // Hydrate freehand drawing canvas when paintCanvasEl mounts or user switches
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

    function renderLoop(now: number) {
        if (!startTime) startTime = now;
        const elapsedSec = (now - startTime) / 1000;

        if (studioBgCanvasEl) {
            const ctx = studioBgCanvasEl.getContext("2d");
            if (ctx) {
                drawNamecardBackgroundFrame(
                    ctx,
                    studioBgCanvasEl.width,
                    studioBgCanvasEl.height,
                    cardConfig,
                    elapsedSec
                );
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

    function handleStorageEvent(e: StorageEvent) {
        if (e.key === "pfpuwu_world_economy_v2" && e.newValue) {
            try {
                playerStats = JSON.parse(e.newValue);
            } catch {}
        }
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (studioTab !== "draw") return;
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

        if (e.code === "Space" && !isSpaceHeld) {
            isSpaceHeld = true;
            e.preventDefault();
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
            e.preventDefault();
            if (e.shiftKey) {
                redoPaintStroke();
            } else {
                undoPaintStroke();
            }
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
            e.preventDefault();
            redoPaintStroke();
        }
    }

    function handleKeyUp(e: KeyboardEvent) {
        if (e.code === "Space") {
            isSpaceHeld = false;
            isPanningCanvas = false;
        }
    }

    onMount(() => {
        ensureTransparentAvatarUrl($userProfile).then((url) => {
            cleanAvatarSrc = url;
        });
        animFrameId = requestAnimationFrame(renderLoop);
        window.addEventListener("uwu-stats-updated", handleStatsUpdatedEvent);
        window.addEventListener("storage", handleStorageEvent);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
    });

    onDestroy(() => {
        if (animFrameId !== null && typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(animFrameId);
        }
        if (typeof window !== "undefined") {
            window.removeEventListener("uwu-stats-updated", handleStatsUpdatedEvent);
            window.removeEventListener("storage", handleStorageEvent);
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        }
        if (toastTimer) clearTimeout(toastTimer);
    });

    function promptSignIn(reason = "Sign in with 𝕏 to customize and share your Namecard!") {
        authModalReason.set(reason);
        showAuthModal.set(true);
    }

    async function handleSaveStudio() {
        if (!$userProfile) {
            promptSignIn("Sign in with 𝕏 to save your custom Namecard!");
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
        triggerToast("✨ Saved Namecard!");
    }

    async function handleCopyCardImage() {
        if (!$userProfile) {
            promptSignIn("Sign in with 𝕏 to copy and share your Namecard!");
            return;
        }
        isCopying = true;
        const res = await copyNamecardImageToClipboard(cardConfig, $userProfile, playerStats);
        isCopying = false;
        triggerToast(res.message, 3200);
    }

    async function handleDownloadCardPng() {
        if (!$userProfile) {
            promptSignIn("Sign in with 𝕏 to download your Namecard PNG!");
            return;
        }
        await downloadNamecardPng(cardConfig, $userProfile, playerStats);
        triggerToast("💾 Saved Namecard PNG!");
    }

    // --- STICKER INTERACTION ---
    function addSticker(symbol: string) {
        if (cardConfig.stickers.length >= 14) {
            triggerToast("Max 14 stickers — remove one first!");
            return;
        }
        const newId = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const offsetX = 56 + Math.floor((Math.random() - 0.5) * 32);
        const offsetY = 38 + Math.floor((Math.random() - 0.5) * 32);

        cardConfig.stickers = [
            ...cardConfig.stickers,
            {
                id: newId,
                symbol,
                x: Math.max(10, Math.min(90, offsetX)),
                y: Math.max(12, Math.min(88, offsetY)),
                scale: 1.0,
                rotation: 0
            }
        ];
        selectedStickerId = newId;
        saveNamecardConfig(cardConfig);
    }

    function removeSticker(id: string) {
        cardConfig.stickers = cardConfig.stickers.filter((s) => s.id !== id);
        if (selectedStickerId === id) selectedStickerId = null;
        saveNamecardConfig(cardConfig);
    }

    function startDraggingSticker(e: MouseEvent | TouchEvent, stickerId: string) {
        if (studioTab === "draw") return;
        e.stopPropagation();
        selectedStickerId = stickerId;
        draggingStickerId = stickerId;
    }

    function handlePreviewPointerMove(e: MouseEvent | TouchEvent) {
        if (draggingStickerId && previewContainerEl) {
            const rect = previewContainerEl.getBoundingClientRect();
            const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
            const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
            const pctX = Math.max(6, Math.min(94, ((clientX - rect.left) / rect.width) * 100));
            const pctY = Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100));
            cardConfig.stickers = cardConfig.stickers.map((s) =>
                s.id === draggingStickerId
                    ? { ...s, x: Math.round(pctX * 10) / 10, y: Math.round(pctY * 10) / 10 }
                    : s
            );
        }
    }

    function stopDraggingSticker() {
        if (draggingStickerId) {
            draggingStickerId = null;
            saveNamecardConfig(cardConfig);
        }
    }

    // --- PRO CREATIVE DRAWING STUDIO ENGINE (720x420 NATIVE) ---
    function setZoomLevel(nextZoom: number) {
        const clamped = Math.max(1, Math.min(4, Math.round(nextZoom * 100) / 100));
        canvasZoom = clamped;
        if (clamped === 1) {
            canvasPanX = 0;
            canvasPanY = 0;
        }
    }

    function handleStageWheel(e: WheelEvent) {
        if (studioTab !== "draw") return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        setZoomLevel(canvasZoom + delta);
    }

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

    function pushUndoSnapshot() {
        if (!paintCanvasEl) return;
        paintHistory = [...paintHistory.slice(-24), paintCanvasEl.toDataURL("image/png")];
        paintRedoStack = [];
    }

    function getSymmetryPoints(
        x: number,
        y: number,
        W: number,
        H: number
    ): { x: number; y: number }[] {
        const pts = [{ x, y }];
        if (symmetryMode === "horiz" || symmetryMode === "quad") {
            pts.push({ x: W - x, y });
        }
        if (symmetryMode === "vert" || symmetryMode === "quad") {
            pts.push({ x, y: H - y });
        }
        if (symmetryMode === "quad") {
            pts.push({ x: W - x, y: H - y });
        }
        return pts;
    }

    function hexToRgb(hex: string): { r: number; g: number; b: number } {
        const clean = hex.replace("#", "");
        if (clean.length !== 6) return { r: 255, g: 255, b: 255 };
        return {
            r: parseInt(clean.slice(0, 2), 16),
            g: parseInt(clean.slice(2, 4), 16),
            b: parseInt(clean.slice(4, 6), 16)
        };
    }

    function rgbToHex(r: number, g: number, b: number): string {
        const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    function sampleCanvasColorAt(pt: { x: number; y: number }) {
        if (!paintCanvasEl) return;
        const px = Math.floor(pt.x);
        const py = Math.floor(pt.y);
        const pCtx = paintCanvasEl.getContext("2d");
        if (pCtx) {
            const data = pCtx.getImageData(px, py, 1, 1).data;
            if (data[3] > 20) {
                const picked = rgbToHex(data[0], data[1], data[2]);
                brushColor = picked;
                drawTool = "pen";
                triggerToast(`🧪 Picked color ${picked}`);
                return;
            }
        }
        if (studioBgCanvasEl) {
            const bCtx = studioBgCanvasEl.getContext("2d");
            if (bCtx) {
                const bx = Math.floor((pt.x / paintCanvasEl.width) * studioBgCanvasEl.width);
                const by = Math.floor((pt.y / paintCanvasEl.height) * studioBgCanvasEl.height);
                const bData = bCtx.getImageData(bx, by, 1, 1).data;
                const picked = rgbToHex(bData[0], bData[1], bData[2]);
                brushColor = picked;
                drawTool = "pen";
                triggerToast(`🧪 Picked background color ${picked}`);
            }
        }
    }

    function floodFillPaintCanvas(startX: number, startY: number, fillHex: string, alphaPct: number) {
        if (!paintCanvasEl) return;
        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;
        const W = paintCanvasEl.width;
        const H = paintCanvasEl.height;
        const sx = Math.max(0, Math.min(W - 1, Math.floor(startX)));
        const sy = Math.max(0, Math.min(H - 1, Math.floor(startY)));

        const imgData = ctx.getImageData(0, 0, W, H);
        const data = imgData.data;
        const startIdx = (sy * W + sx) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];

        const fillRgb = hexToRgb(fillHex);
        const fillA = Math.round((alphaPct / 100) * 255);

        if (
            Math.abs(targetR - fillRgb.r) < 5 &&
            Math.abs(targetG - fillRgb.g) < 5 &&
            Math.abs(targetB - fillRgb.b) < 5 &&
            Math.abs(targetA - fillA) < 5
        ) {
            return;
        }

        const tolerance = 32;
        const visited = new Uint8Array(W * H);
        const stack: number[] = [sx, sy];

        const matchesTarget = (idx: number) =>
            Math.abs(data[idx] - targetR) <= tolerance &&
            Math.abs(data[idx + 1] - targetG) <= tolerance &&
            Math.abs(data[idx + 2] - targetB) <= tolerance &&
            Math.abs(data[idx + 3] - targetA) <= tolerance;

        while (stack.length > 0) {
            const cy = stack.pop()!;
            const cx = stack.pop()!;
            const pIdx = cy * W + cx;
            if (visited[pIdx]) continue;

            const byteIdx = pIdx * 4;
            if (!matchesTarget(byteIdx)) continue;

            visited[pIdx] = 1;
            data[byteIdx] = fillRgb.r;
            data[byteIdx + 1] = fillRgb.g;
            data[byteIdx + 2] = fillRgb.b;
            data[byteIdx + 3] = fillA;

            if (cx > 0) stack.push(cx - 1, cy);
            if (cx < W - 1) stack.push(cx + 1, cy);
            if (cy > 0) stack.push(cx, cy - 1);
            if (cy < H - 1) stack.push(cx, cy + 1);
        }

        ctx.putImageData(imgData, 0, 0);
    }

    function drawMiniSparkleStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
        const inner = r * 0.25;
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.quadraticCurveTo(cx + inner * 0.4, cy - inner * 0.4, cx + r, cy);
        ctx.quadraticCurveTo(cx + inner * 0.4, cy + inner * 0.4, cx, cy + r);
        ctx.quadraticCurveTo(cx - inner * 0.4, cy + inner * 0.4, cx - r, cy);
        ctx.quadraticCurveTo(cx - inner * 0.4, cy - inner * 0.4, cx, cy - r);
        ctx.closePath();
        ctx.fill();
    }

    function drawSingleSegment(
        ctx: CanvasRenderingContext2D,
        from: { x: number; y: number },
        to: { x: number; y: number },
        strokeCol: string
    ) {
        ctx.save();
        ctx.globalAlpha = brushOpacity / 100;

        if (drawTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = brushSize * 2.5;
            ctx.strokeStyle = "rgba(0,0,0,1)";
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        } else if (drawTool === "pixel") {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = strokeCol;
            const grid = Math.max(2, Math.round(brushSize * 1.4));
            const dist = Math.hypot(to.x - from.x, to.y - from.y);
            const steps = Math.max(1, Math.ceil(dist / (grid * 0.5)));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const px = Math.floor((from.x + (to.x - from.x) * t) / grid) * grid;
                const py = Math.floor((from.y + (to.y - from.y) * t) / grid) * grid;
                ctx.fillRect(px, py, grid, grid);
            }
        } else if (drawTool === "neon") {
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.shadowColor = strokeCol;
            ctx.shadowBlur = brushSize * 2.8;
            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = brushSize * 1.5;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();

            // Bright white-hot inner core
            ctx.shadowBlur = 4;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(1.2, brushSize * 0.5);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        } else if (drawTool === "airbrush") {
            const radius = brushSize * 2.8;
            const dist = Math.hypot(to.x - from.x, to.y - from.y);
            const steps = Math.max(1, Math.ceil(dist / Math.max(2, radius * 0.25)));
            const rgb = hexToRgb(strokeCol);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const cx = from.x + (to.x - from.x) * t;
                const cy = from.y + (to.y - from.y) * t;
                const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
                const peakAlpha = (brushOpacity / 100) * 0.22;
                grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${peakAlpha})`);
                grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${peakAlpha * 0.45})`);
                grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (drawTool === "sparkle") {
            ctx.fillStyle = strokeCol;
            ctx.shadowColor = strokeCol;
            ctx.shadowBlur = 6;
            const r = Math.max(4, brushSize * 1.4);
            drawMiniSparkleStar(ctx, to.x, to.y, r);
            // Tiny companion stardust dots
            for (let d = 0; d < 2; d++) {
                const ang = Math.random() * Math.PI * 2;
                const dist = r * (0.8 + Math.random() * 1.4);
                ctx.beginPath();
                ctx.arc(
                    to.x + Math.cos(ang) * dist,
                    to.y + Math.sin(ang) * dist,
                    Math.max(1, r * 0.18),
                    0,
                    Math.PI * 2
                );
                ctx.fill();
            }
        } else {
            // 'pen' or 'rainbow'
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = brushSize * 1.5;
            ctx.strokeStyle = strokeCol;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawWithSymmetry(
        ctx: CanvasRenderingContext2D,
        from: { x: number; y: number },
        to: { x: number; y: number }
    ) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        let strokeCol = brushColor;
        if (drawTool === "rainbow") {
            rainbowHue = (rainbowHue + 4) % 360;
            strokeCol = `hsl(${rainbowHue}, 92%, 64%)`;
        }

        const fromPts = getSymmetryPoints(from.x, from.y, W, H);
        const toPts = getSymmetryPoints(to.x, to.y, W, H);
        for (let i = 0; i < fromPts.length; i++) {
            drawSingleSegment(ctx, fromPts[i], toPts[i], strokeCol);
        }
    }

    function renderGeometricShape(
        ctx: CanvasRenderingContext2D,
        start: { x: number; y: number },
        end: { x: number; y: number }
    ) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const startPts = getSymmetryPoints(start.x, start.y, W, H);
        const endPts = getSymmetryPoints(end.x, end.y, W, H);

        ctx.save();
        ctx.globalAlpha = brushOpacity / 100;
        ctx.strokeStyle = brushColor;
        ctx.fillStyle = brushColor;
        ctx.lineWidth = brushSize * 1.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let i = 0; i < startPts.length; i++) {
            const s = startPts[i];
            const e = endPts[i];
            ctx.beginPath();
            if (drawTool === "line") {
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(e.x, e.y);
                ctx.stroke();
            } else if (drawTool === "rect") {
                const rx = Math.min(s.x, e.x);
                const ry = Math.min(s.y, e.y);
                const rw = Math.abs(e.x - s.x);
                const rh = Math.abs(e.y - s.y);
                if (shapeFilled) ctx.fillRect(rx, ry, rw, rh);
                else ctx.strokeRect(rx, ry, rw, rh);
            } else if (drawTool === "circle") {
                const cx = (s.x + e.x) / 2;
                const cy = (s.y + e.y) / 2;
                const rx = Math.abs(e.x - s.x) / 2;
                const ry = Math.abs(e.y - s.y) / 2;
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (shapeFilled) ctx.fill();
                else ctx.stroke();
            }
        }
        ctx.restore();
    }

    function startPaintStroke(e: MouseEvent | TouchEvent) {
        if (studioTab !== "draw" || !paintCanvasEl) return;
        e.preventDefault();

        const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
        const isMiddleBtn = "button" in e && e.button === 1;

        if (drawTool === "pan" || isSpaceHeld || isMiddleBtn) {
            isPanningCanvas = true;
            panStartClient = { x: clientX, y: clientY, startX: canvasPanX, startY: canvasPanY };
            return;
        }

        const pt = getPaintCoords(e);
        if (!pt) return;

        if (drawTool === "picker") {
            sampleCanvasColorAt(pt);
            return;
        }

        if (drawTool === "fill") {
            pushUndoSnapshot();
            floodFillPaintCanvas(pt.x, pt.y, brushColor, brushOpacity);
            cardConfig.paintDataUrl = paintCanvasEl.toDataURL("image/png");
            saveNamecardConfig(cardConfig);
            return;
        }

        pushUndoSnapshot();
        isDrawingPaint = true;
        lastDrawPt = { ...pt };
        smoothedPt = { ...pt };
        shapeStartPt = { ...pt };

        if (drawTool === "line" || drawTool === "rect" || drawTool === "circle") {
            return;
        }

        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;
        drawWithSymmetry(ctx, pt, { x: pt.x + 0.1, y: pt.y + 0.1 });
    }

    function movePaintStroke(e: MouseEvent | TouchEvent) {
        if (isPanningCanvas) {
            e.preventDefault();
            const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
            const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
            canvasPanX = panStartClient.startX + (clientX - panStartClient.x);
            canvasPanY = panStartClient.startY + (clientY - panStartClient.y);
            return;
        }

        if (!isDrawingPaint || studioTab !== "draw" || !paintCanvasEl) return;
        e.preventDefault();
        const rawPt = getPaintCoords(e);
        if (!rawPt) return;

        if (drawTool === "line" || drawTool === "rect" || drawTool === "circle") {
            if (shapeOverlayCanvasEl) {
                const oCtx = shapeOverlayCanvasEl.getContext("2d");
                if (oCtx) {
                    oCtx.clearRect(0, 0, shapeOverlayCanvasEl.width, shapeOverlayCanvasEl.height);
                    renderGeometricShape(oCtx, shapeStartPt, rawPt);
                }
            }
            lastDrawPt = rawPt;
            return;
        }

        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;

        // Apply pointer stabilizer / smoothing
        const weight = (brushStabilizer / 100) * 0.85;
        const nextPt = {
            x: smoothedPt.x * weight + rawPt.x * (1 - weight),
            y: smoothedPt.y * weight + rawPt.y * (1 - weight)
        };

        if (drawTool === "sparkle") {
            const dist = Math.hypot(nextPt.x - lastDrawPt.x, nextPt.y - lastDrawPt.y);
            if (dist < Math.max(8, brushSize * 2.2)) return;
        }

        drawWithSymmetry(ctx, smoothedPt, nextPt);
        smoothedPt = nextPt;
        lastDrawPt = nextPt;
    }

    function endPaintStroke() {
        if (isPanningCanvas) {
            isPanningCanvas = false;
            return;
        }
        if (!isDrawingPaint || !paintCanvasEl) return;
        isDrawingPaint = false;

        if (drawTool === "line" || drawTool === "rect" || drawTool === "circle") {
            const ctx = paintCanvasEl.getContext("2d");
            if (ctx) {
                renderGeometricShape(ctx, shapeStartPt, lastDrawPt);
            }
            if (shapeOverlayCanvasEl) {
                const oCtx = shapeOverlayCanvasEl.getContext("2d");
                oCtx?.clearRect(0, 0, shapeOverlayCanvasEl.width, shapeOverlayCanvasEl.height);
            }
        }

        cardConfig.paintDataUrl = paintCanvasEl.toDataURL("image/png");
        saveNamecardConfig(cardConfig);
    }

    function restoreCanvasFromDataUrl(dataUrl: string | null) {
        if (!paintCanvasEl) return;
        const ctx = paintCanvasEl.getContext("2d");
        if (!ctx) return;
        if (!dataUrl) {
            ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
            cardConfig.paintDataUrl = null;
            saveNamecardConfig(cardConfig);
            return;
        }
        const img = new Image();
        img.onload = () => {
            if (!paintCanvasEl) return;
            ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
            ctx.drawImage(img, 0, 0, paintCanvasEl.width, paintCanvasEl.height);
            cardConfig.paintDataUrl = paintCanvasEl.toDataURL("image/png");
            saveNamecardConfig(cardConfig);
        };
        img.src = dataUrl;
    }

    function undoPaintStroke() {
        if (!paintCanvasEl || paintHistory.length === 0) return;
        const currentUrl = paintCanvasEl.toDataURL("image/png");
        paintRedoStack = [...paintRedoStack.slice(-24), currentUrl];
        const prev = paintHistory[paintHistory.length - 1];
        paintHistory = paintHistory.slice(0, -1);
        restoreCanvasFromDataUrl(prev);
    }

    function redoPaintStroke() {
        if (!paintCanvasEl || paintRedoStack.length === 0) return;
        const currentUrl = paintCanvasEl.toDataURL("image/png");
        paintHistory = [...paintHistory.slice(-24), currentUrl];
        const next = paintRedoStack[paintRedoStack.length - 1];
        paintRedoStack = paintRedoStack.slice(0, -1);
        restoreCanvasFromDataUrl(next);
    }

    function clearPaintLayer() {
        if (!paintCanvasEl) return;
        pushUndoSnapshot();
        const ctx = paintCanvasEl.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, paintCanvasEl.width, paintCanvasEl.height);
        }
        cardConfig.paintDataUrl = null;
        saveNamecardConfig(cardConfig);
    }

    // Derived Live Stats
    const liveChips = $derived(playerStats?.chips ?? 2500);
    const liveWins = $derived(playerStats?.wins ?? 0);
    const liveLosses = $derived(playerStats?.losses ?? 0);
    const liveWinRate = $derived(
        liveWins + liveLosses > 0 ? Math.round((liveWins / (liveWins + liveLosses)) * 100) : 0
    );
    const liveBestWin = $derived(playerStats?.high_score ?? 0);
</script>

<!-- EMBEDDED OS APP WINDOW FOR MY NAMECARD -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    class="nc-app-shell"
    class:expanded-draw={isExpandedDrawView && studioTab === "draw"}
    onmousemove={handlePreviewPointerMove}
    onmouseup={stopDraggingSticker}
    ontouchmove={handlePreviewPointerMove}
    ontouchend={stopDraggingSticker}
>
    {#if !$userProfile}
        <div class="nc-guest-banner">
            <span class="nc-guest-text">
                🪪 Previewing in Guest Mode — Sign in with 𝕏 to save your custom Namecard, unlock live MMO stats, and share your card!
            </span>
            <button
                type="button"
                class="win98-btn primary-save-btn"
                onclick={() => promptSignIn("Sign in with 𝕏 to unlock and save your personal Namecard!")}
            >
                𝕏 Sign In
            </button>
        </div>
    {/if}

    <div class="dialog-body">
        <div class="customizer-split">
            <!-- LEFT: Live Interactive Card Stage + Zoom/Pan Bar + Name/Tagline Inputs -->
            <div class="nc-stage-col">
                {#if studioTab === "draw"}
                    <!-- Zoom, Pan & Workspace Toolbar -->
                    <div class="nc-viewport-toolbar">
                        <div class="nc-vp-group">
                            <button
                                type="button"
                                class="win98-btn vp-mini-btn"
                                onclick={() => setZoomLevel(canvasZoom - 0.5)}
                                disabled={canvasZoom <= 1}
                                title="Zoom Out"
                            >
                                🔍−
                            </button>
                                    {#each [1, 1.5, 2, 3, 4] as zLvl (zLvl)}
                                        <button
                                            type="button"
                                            class="win98-btn vp-mini-btn {canvasZoom === zLvl ? 'primary-save-btn' : ''}"
                                            onclick={() => setZoomLevel(zLvl)}
                                        >
                                            {zLvl}x
                                        </button>
                                    {/each}
                                    <button
                                        type="button"
                                        class="win98-btn vp-mini-btn"
                                        onclick={() => setZoomLevel(canvasZoom + 0.5)}
                                        disabled={canvasZoom >= 4}
                                        title="Zoom In"
                                    >
                                        🔍+
                                    </button>
                                </div>

                                <div class="nc-vp-group">
                                    <button
                                        type="button"
                                        class="win98-btn vp-mini-btn {drawTool === 'pan' || isSpaceHeld ? 'primary-save-btn' : ''}"
                                        onclick={() => (drawTool = drawTool === "pan" ? "pen" : "pan")}
                                        title="Pan View (or hold Spacebar + drag)"
                                    >
                                        ✋ Pan
                                    </button>
                                    {#if canvasZoom > 1 || canvasPanX !== 0 || canvasPanY !== 0}
                                        <button
                                            type="button"
                                            class="win98-btn vp-mini-btn"
                                            onclick={() => setZoomLevel(1)}
                                            title="Reset Zoom & Pan"
                                        >
                                            Reset
                                        </button>
                                    {/if}
                                    <button
                                        type="button"
                                        class="win98-btn vp-mini-btn {dimCardUiWhileDrawing ? 'primary-save-btn' : ''}"
                                        onclick={() => (dimCardUiWhileDrawing = !dimCardUiWhileDrawing)}
                                        title="Dim Avatar & Text while drawing so you can see strokes clearly"
                                    >
                                        👁️ Dim Text
                                    </button>
                                    <button
                                        type="button"
                                        class="win98-btn vp-mini-btn {isExpandedDrawView ? 'primary-save-btn' : ''}"
                                        onclick={() => (isExpandedDrawView = !isExpandedDrawView)}
                                        title="Expand Drawing Canvas Workspace"
                                    >
                                        {isExpandedDrawView ? "🗗 Compact" : "⛶ Expand"}
                                    </button>
                                </div>
                            </div>
                        {/if}

                        <!-- Zoomable & Pannable Card Viewport -->
                        <div
                            class="nc-zoom-viewport win98-inset"
                            class:expanded-vp={isExpandedDrawView && studioTab === "draw"}
                            onwheel={handleStageWheel}
                        >
                            <div
                                bind:this={previewContainerEl}
                                class="nc-card studio-stage border-{cardConfig.borderId} tone-{textTone}"
                                class:expanded-card={isExpandedDrawView && studioTab === "draw"}
                                style="
                                    --nc-accent: {accentColor};
                                    transform: translate({canvasPanX}px, {canvasPanY}px) scale({canvasZoom});
                                "
                            >
                                <canvas
                                    bind:this={studioBgCanvasEl}
                                    width="720"
                                    height="420"
                                    class="nc-bg-canvas"
                                ></canvas>

                                <div
                                    class="nc-upper-row studio-upper"
                                    class:dimmed-ui={studioTab === "draw" && dimCardUiWhileDrawing}
                                >
                                    <button
                                        type="button"
                                        class="nc-avatar-wrap studio-avatar interactive"
                                        onclick={() => {
                                            if ($userProfile) {
                                                showAvatarCustomizer.set(true);
                                            } else {
                                                promptSignIn("Sign in with 𝕏 to customize your Persona Avatar!");
                                            }
                                        }}
                                        title="Click to customize your Avatar"
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
                                        <div class="nc-display-name studio-name">
                                            {cardConfig.displayName ||
                                                $userProfile?.x_display_name ||
                                                $userProfile?.x_username ||
                                                "Player"}
                                        </div>
                                        <div class="nc-handle studio-handle">@{cardConfig.username}</div>
                                        {#if cardConfig.tagline}
                                            <div class="nc-tagline studio-tagline">{cardConfig.tagline}</div>
                                        {/if}
                                    </div>
                                </div>

                                <div
                                    class="nc-stats-row studio-stats"
                                    class:dimmed-ui={studioTab === "draw" && dimCardUiWhileDrawing}
                                >
                                    <div class="nc-stat-item">
                                        <span class="nc-stat-label">$UWU</span>
                                        <span class="nc-stat-val">{liveChips.toLocaleString()}</span>
                                    </div>
                                    <div class="nc-stat-divider"></div>
                                    <div class="nc-stat-item">
                                        <span class="nc-stat-label">RECORD</span>
                                        <span class="nc-stat-val">{liveWins}W–{liveLosses}L</span>
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
                                </div>

                                <!-- Symmetry Mirror Guide Lines -->
                                {#if studioTab === "draw" && symmetryMode !== "none"}
                                    {#if symmetryMode === "horiz" || symmetryMode === "quad"}
                                        <div class="nc-sym-guide vert-axis"></div>
                                    {/if}
                                    {#if symmetryMode === "vert" || symmetryMode === "quad"}
                                        <div class="nc-sym-guide horiz-axis"></div>
                                    {/if}
                                {/if}

                                <!-- High-Res 720x420 Interactive Drawing Canvas Layer -->
                                <canvas
                                    bind:this={paintCanvasEl}
                                    width="720"
                                    height="420"
                                    class="nc-stage-paint-canvas"
                                    class:layer-behind={cardConfig.paintLayer === "behind"}
                                    class:paint-interactive={studioTab === "draw"}
                                    class:cursor-pan={studioTab === "draw" && (drawTool === "pan" || isSpaceHeld)}
                                    onmousedown={startPaintStroke}
                                    onmousemove={movePaintStroke}
                                    onmouseup={endPaintStroke}
                                    onmouseleave={endPaintStroke}
                                    ontouchstart={startPaintStroke}
                                    ontouchmove={movePaintStroke}
                                    ontouchend={endPaintStroke}
                                ></canvas>

                                <!-- Live Geometric Shape Preview Canvas (720x420) -->
                                <canvas
                                    bind:this={shapeOverlayCanvasEl}
                                    width="720"
                                    height="420"
                                    class="nc-shape-overlay-canvas"
                                    class:layer-behind={cardConfig.paintLayer === "behind"}
                                ></canvas>

                                <!-- Draggable Stickers on Stage -->
                                {#each cardConfig.stickers as stk (stk.id)}
                                    <div
                                        class="nc-sticker-item stage-sticker"
                                        class:selected-sticker={selectedStickerId === stk.id && studioTab !== "draw"}
                                        style="
                                            left: {stk.x}%;
                                            top: {stk.y}%;
                                            transform: translate(-50%, -50%) rotate({stk.rotation}deg) scale({stk.scale});
                                            pointer-events: {studioTab === 'draw' ? 'none' : 'auto'};
                                        "
                                        onmousedown={(e) => startDraggingSticker(e, stk.id)}
                                        ontouchstart={(e) => startDraggingSticker(e, stk.id)}
                                    >
                                        {stk.symbol}
                                    </div>
                                {/each}
                            </div>
                        </div>

                        <!-- Classic OS Inputs for Name & Status -->
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
                                <label for="nc-tag-in">Status / Tagline:</label>
                                <input
                                    id="nc-tag-in"
                                    type="text"
                                    class="win98-input"
                                    maxlength="40"
                                    bind:value={cardConfig.tagline}
                                    placeholder="Optional short status..."
                                />
                            </div>
                        </div>

                        <!-- Classic OS Action Buttons -->
                        <div class="nc-stage-actions">
                            <button
                                type="button"
                                class="win98-btn primary-save-btn"
                                disabled={isSaving}
                                onclick={handleSaveStudio}
                            >
                                {isSaving ? "Saving..." : "💾 Save Changes"}
                            </button>
                            <button
                                type="button"
                                class="win98-btn"
                                disabled={isCopying}
                                onclick={handleCopyCardImage}
                            >
                                {isCopying ? "Copying..." : "📋 Copy Image"}
                            </button>
                            <button
                                type="button"
                                class="win98-btn"
                                onclick={handleDownloadCardPng}
                            >
                                ⬇️ Save PNG
                            </button>
                        </div>

                        {#if toastMsg}
                            <div class="toast-box">{toastMsg}</div>
                        {/if}
                    </div>

                    <!-- RIGHT: Classic OS Tabbed Controls -->
                    <div class="traits-column">
                        <div class="category-tabs" role="tablist">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioTab === "background"}
                                class="category-tab {studioTab === 'background' ? 'active' : ''}"
                                onclick={() => (studioTab = "background")}
                            >
                                Background
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioTab === "style"}
                                class="category-tab {studioTab === 'style' ? 'active' : ''}"
                                onclick={() => (studioTab = "style")}
                            >
                                Border & Text
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioTab === "draw"}
                                class="category-tab {studioTab === 'draw' ? 'active' : ''}"
                                onclick={() => (studioTab = "draw")}
                            >
                                Draw Studio
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={studioTab === "stickers"}
                                class="category-tab {studioTab === 'stickers' ? 'active' : ''}"
                                onclick={() => (studioTab = "stickers")}
                            >
                                Stickers
                            </button>
                        </div>

                        <div class="traits-panel win98-inset">
                            {#if studioTab === "background"}
                                <!-- 1. Dynamic Liquid Chrome / Holo Shimmer -->
                                <div class="nc-section-title">Dynamic Liquid Chrome (Animated)</div>
                                <div class="nc-swatch-grid">
                                    {#each LIQUID_PRESETS as lp (lp.id)}
                                        <button
                                            type="button"
                                            class="trait-card {cardConfig.bgMode === 'liquid' && cardConfig.bgPresetId === lp.id ? 'selected' : ''}"
                                            onclick={() => {
                                                cardConfig.bgMode = "liquid";
                                                cardConfig.bgPresetId = lp.id;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        >
                                            <span
                                                class="nc-swatch-preview"
                                                style="background: {lp.swatchGradient};"
                                            ></span>
                                            <span class="trait-name">{lp.name}</span>
                                        </button>
                                    {/each}
                                </div>

                                <!-- 2. Smooth Gradients -->
                                <div class="nc-section-title">Gradients</div>
                                <div class="nc-swatch-grid">
                                    {#each GRADIENT_PRESETS as gp (gp.id)}
                                        <button
                                            type="button"
                                            class="trait-card {cardConfig.bgMode === 'gradient' && cardConfig.bgPresetId === gp.id ? 'selected' : ''}"
                                            onclick={() => {
                                                cardConfig.bgMode = "gradient";
                                                cardConfig.bgPresetId = gp.id;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        >
                                            <span
                                                class="nc-swatch-preview"
                                                style="background: linear-gradient({gp.angle}deg, {gp.stops[0]}, {gp.stops[1]}, {gp.stops[2]});"
                                            ></span>
                                            <span class="trait-name">{gp.name}</span>
                                        </button>
                                    {/each}
                                </div>

                                <!-- 3. Solid Colors + Custom Color Picker -->
                                <div class="nc-section-title">Solid Color</div>
                                <div class="nc-solid-row">
                                    {#each SOLID_COLOR_PRESETS as sp (sp.id)}
                                        <button
                                            type="button"
                                            class="nc-color-dot"
                                            class:selected={cardConfig.bgMode === "solid" && cardConfig.solidColor.toLowerCase() === sp.hex.toLowerCase()}
                                            style="background: {sp.hex};"
                                            title={sp.name}
                                            onclick={() => {
                                                cardConfig.bgMode = "solid";
                                                cardConfig.solidColor = sp.hex;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        ></button>
                                    {/each}

                                    <label class="win98-btn nc-custom-color-label" title="Custom Solid Color">
                                        <input
                                            type="color"
                                            value={cardConfig.solidColor}
                                            oninput={(e) => {
                                                cardConfig.bgMode = "solid";
                                                cardConfig.solidColor = (e.currentTarget as HTMLInputElement).value;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        />
                                        <span>Custom...</span>
                                    </label>
                                </div>

                                <!-- Sparkle Accents Toggle -->
                                <div class="nc-toggle-row">
                                    <label class="nc-checkbox-label">
                                        <input
                                            type="checkbox"
                                            bind:checked={cardConfig.showSparkles}
                                            onchange={() => saveNamecardConfig(cardConfig)}
                                        />
                                        <span>✦ Show twinkling star & heart sparkles</span>
                                    </label>
                                </div>
                            {:else if studioTab === "style"}
                                <div class="nc-section-title">Card Border</div>
                                <div class="nc-border-list">
                                    {#each NAMECARD_BORDERS as bd (bd.id)}
                                        <button
                                            type="button"
                                            class="trait-card nc-border-item {cardConfig.borderId === bd.id ? 'selected' : ''}"
                                            onclick={() => {
                                                cardConfig.borderId = bd.id;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        >
                                            <div class="nc-border-name">{bd.name}</div>
                                            <div class="nc-border-desc">{bd.desc}</div>
                                        </button>
                                    {/each}
                                </div>

                                <div class="nc-section-title">Text Contrast</div>
                                <div class="nc-segmented-row">
                                    {#each ["auto", "dark", "light"] as toneOpt (toneOpt)}
                                        <button
                                            type="button"
                                            class="win98-btn {cardConfig.textTone === toneOpt ? 'primary-save-btn' : ''}"
                                            onclick={() => {
                                                cardConfig.textTone = toneOpt as "auto" | "dark" | "light";
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        >
                                            {toneOpt === "auto"
                                                ? "Auto"
                                                : toneOpt === "dark"
                                                  ? "Dark Text"
                                              : "Light Text"}
                                        </button>
                                    {/each}
                                </div>

                                <div class="nc-section-title">Quick Status Ideas</div>
                                <div class="nc-chips-wrap">
                                    {#each TAGLINE_SUGGESTIONS as sug (sug)}
                                        <button
                                            type="button"
                                            class="win98-btn"
                                            onclick={() => {
                                                cardConfig.tagline = sug;
                                                saveNamecardConfig(cardConfig);
                                            }}
                                        >
                                            {sug}
                                        </button>
                                    {/each}
                                </div>
                            {:else if studioTab === "draw"}
                                <!-- 1. Brushes, Shapes & Fill Tools Grid -->
                                <div class="nc-section-title">Brushes & Creative Tools</div>
                                <div class="nc-tools-grid">
                                    {#each [
                                        { id: "pen", icon: "🖋️", label: "Ink Pen" },
                                        { id: "neon", icon: "✨", label: "Neon Glow" },
                                        { id: "airbrush", icon: "🎨", label: "Airbrush" },
                                        { id: "pixel", icon: "👾", label: "Pixel Art" },
                                        { id: "rainbow", icon: "🌈", label: "Rainbow" },
                                        { id: "sparkle", icon: "✦", label: "Sparkle" },
                                        { id: "line", icon: "📏", label: "Line" },
                                        { id: "rect", icon: "▭", label: "Box" },
                                        { id: "circle", icon: "◯", label: "Circle" },
                                        { id: "fill", icon: "🪣", label: "Fill" },
                                        { id: "picker", icon: "🧪", label: "Picker" },
                                        { id: "eraser", icon: "🧽", label: "Eraser" }
                                    ] as t (t.id)}
                                        <button
                                            type="button"
                                            class="trait-card nc-tool-card {drawTool === t.id ? 'selected' : ''}"
                                            onclick={() => (drawTool = t.id as DrawToolId)}
                                            title={t.label}
                                        >
                                            <span class="nc-tool-ico">{t.icon}</span>
                                            <span class="trait-name">{t.label}</span>
                                        </button>
                                    {/each}
                                </div>

                                {#if drawTool === "rect" || drawTool === "circle"}
                                    <div class="nc-segmented-row">
                                        <button
                                            type="button"
                                            class="win98-btn {!shapeFilled ? 'primary-save-btn' : ''}"
                                            onclick={() => (shapeFilled = false)}
                                        >
                                            ▭ Outline Shape
                                        </button>
                                        <button
                                            type="button"
                                            class="win98-btn {shapeFilled ? 'primary-save-btn' : ''}"
                                            onclick={() => (shapeFilled = true)}
                                        >
                                            ▬ Filled Shape
                                        </button>
                                    </div>
                                {/if}

                                <!-- 2. Color Swatches + Custom Color Picker + Saved Custom Colors -->
                                <div class="nc-section-title">Color Palette</div>
                                <div class="nc-solid-row">
                                    {#each NAMECARD_PAINT_PALETTE as hex (hex)}
                                        <button
                                            type="button"
                                            class="nc-color-dot"
                                            class:selected={drawTool !== "eraser" && brushColor.toLowerCase() === hex.toLowerCase()}
                                            style="background: {hex};"
                                            onclick={() => {
                                                if (drawTool === "eraser" || drawTool === "pan") drawTool = "pen";
                                                brushColor = hex;
                                            }}
                                        ></button>
                                    {/each}

                                    {#each customSwatches as cHex (cHex)}
                                        <button
                                            type="button"
                                            class="nc-color-dot"
                                            class:selected={drawTool !== "eraser" && brushColor.toLowerCase() === cHex.toLowerCase()}
                                            style="background: {cHex};"
                                            onclick={() => {
                                                if (drawTool === "eraser" || drawTool === "pan") drawTool = "pen";
                                                brushColor = cHex;
                                            }}
                                        ></button>
                                    {/each}

                                    <label class="win98-btn nc-custom-color-label" title="Pick Any Color">
                                        <input
                                            type="color"
                                            value={brushColor}
                                            oninput={(e) => {
                                                const val = (e.currentTarget as HTMLInputElement).value;
                                                if (drawTool === "eraser" || drawTool === "pan") drawTool = "pen";
                                                brushColor = val;
                                            }}
                                            onchange={(e) => {
                                                const val = (e.currentTarget as HTMLInputElement).value;
                                                if (!NAMECARD_PAINT_PALETTE.includes(val) && !customSwatches.includes(val)) {
                                                    customSwatches = [...customSwatches.slice(-5), val];
                                                }
                                            }}
                                        />
                                        <span>Color...</span>
                                    </label>
                                </div>

                                <!-- 3. Brush Size, Opacity & Stabilizer Sliders -->
                                <div class="nc-sliders-grid">
                                    <div class="nc-slider-group">
                                        <label for="nc-brush-sz">Size: {brushSize}px</label>
                                        <input
                                            id="nc-brush-sz"
                                            type="range"
                                            min="1"
                                            max="48"
                                            step="1"
                                            bind:value={brushSize}
                                        />
                                    </div>
                                    <div class="nc-slider-group">
                                        <label for="nc-brush-op">Opacity: {brushOpacity}%</label>
                                        <input
                                            id="nc-brush-op"
                                            type="range"
                                            min="5"
                                            max="100"
                                            step="5"
                                            bind:value={brushOpacity}
                                        />
                                    </div>
                                    <div class="nc-slider-group">
                                        <label for="nc-brush-stab">Smoothing: {brushStabilizer}%</label>
                                        <input
                                            id="nc-brush-stab"
                                            type="range"
                                            min="0"
                                            max="90"
                                            step="5"
                                            bind:value={brushStabilizer}
                                        />
                                    </div>
                                </div>

                                <!-- 4. Symmetry Mirror & Drawing Layer Order -->
                                <div class="nc-section-title">Symmetry Mirror & Layer Order</div>
                                <div class="nc-segmented-row">
                                    {#each [
                                        { id: "none", label: "Off" },
                                        { id: "horiz", label: "↔ Mirror X" },
                                        { id: "vert", label: "↕ Mirror Y" },
                                        { id: "quad", label: "✥ 4-Way" }
                                    ] as sym (sym.id)}
                                        <button
                                            type="button"
                                            class="win98-btn {symmetryMode === sym.id ? 'primary-save-btn' : ''}"
                                            onclick={() => (symmetryMode = sym.id as SymmetryMode)}
                                        >
                                            {sym.label}
                                        </button>
                                    {/each}
                                </div>

                                <div class="nc-segmented-row">
                                    <button
                                        type="button"
                                        class="win98-btn {cardConfig.paintLayer !== 'behind' ? 'primary-save-btn' : ''}"
                                        onclick={() => {
                                            cardConfig.paintLayer = "above";
                                            saveNamecardConfig(cardConfig);
                                        }}
                                        title="Draw over Avatar & Text"
                                    >
                                        🔼 Draw Over Card
                                    </button>
                                    <button
                                        type="button"
                                        class="win98-btn {cardConfig.paintLayer === 'behind' ? 'primary-save-btn' : ''}"
                                        onclick={() => {
                                            cardConfig.paintLayer = "behind";
                                            saveNamecardConfig(cardConfig);
                                        }}
                                        title="Draw behind Avatar & Text (Custom Background Illustration)"
                                    >
                                        🔽 Behind Avatar & Text
                                    </button>
                                </div>

                                <!-- 5. Undo / Redo / Clear Bar -->
                                <div class="nc-draw-actions">
                                    <button
                                        type="button"
                                        class="win98-btn"
                                        disabled={paintHistory.length === 0}
                                        onclick={undoPaintStroke}
                                        title="Undo (Ctrl+Z)"
                                    >
                                        ↩ Undo ({paintHistory.length})
                                    </button>
                                    <button
                                        type="button"
                                        class="win98-btn"
                                        disabled={paintRedoStack.length === 0}
                                        onclick={redoPaintStroke}
                                        title="Redo (Ctrl+Y)"
                                    >
                                        ↪ Redo ({paintRedoStack.length})
                                    </button>
                                    <button
                                        type="button"
                                        class="win98-btn"
                                        onclick={clearPaintLayer}
                                    >
                                        🗑️ Clear
                                    </button>
                                </div>
                            {:else if studioTab === "stickers"}
                                <div class="nc-section-title">Click to Add • Drag on Card to Move</div>
                                <div class="nc-sticker-grid">
                                    {#each NAMECARD_STICKER_CATALOG as item (item.id)}
                                        <button
                                            type="button"
                                            class="trait-card nc-sticker-btn"
                                            title={item.label}
                                            onclick={() => addSticker(item.symbol)}
                                        >
                                            {item.symbol}
                                        </button>
                                    {/each}
                                </div>

                                {#if selectedSticker}
                                    <div class="nc-selected-sticker-box">
                                        <div class="nc-sel-header">
                                            <span>Selected: <strong>{selectedSticker.symbol}</strong></span>
                                            <button
                                                type="button"
                                                class="win98-btn"
                                                onclick={() => removeSticker(selectedSticker.id)}
                                            >
                                                ✕ Remove
                                            </button>
                                        </div>
                                        <div class="nc-slider-group">
                                            <label for="stk-scale">Size: {selectedSticker.scale.toFixed(1)}x</label>
                                            <input
                                                id="stk-scale"
                                                type="range"
                                                min="0.6"
                                                max="1.8"
                                                step="0.1"
                                                value={selectedSticker.scale}
                                                oninput={(e) => {
                                                    const val = parseFloat((e.currentTarget as HTMLInputElement).value);
                                                    cardConfig.stickers = cardConfig.stickers.map((s) =>
                                                        s.id === selectedSticker.id ? { ...s, scale: val } : s
                                                    );
                                                    saveNamecardConfig(cardConfig);
                                                }}
                                            />
                                        </div>
                                        <div class="nc-slider-group">
                                            <label for="stk-rot">Rotation: {selectedSticker.rotation}°</label>
                                            <input
                                                id="stk-rot"
                                                type="range"
                                                min="-45"
                                                max="45"
                                                step="5"
                                                value={selectedSticker.rotation}
                                                oninput={(e) => {
                                                    const val = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                                                    cardConfig.stickers = cardConfig.stickers.map((s) =>
                                                        s.id === selectedSticker.id ? { ...s, rotation: val } : s
                                                    );
                                                    saveNamecardConfig(cardConfig);
                                                }}
                                            />
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="dialog-footer">
                    <span class="avatar-rule-hint">
                        💡 Tip: Tap the avatar to change your persona, drag stickers on the card, or switch to Draw Studio to sign it.
                    </span>
                </div>
            </div>
</div>

<style>
    /* 100% UNIFORM MODERN SANS-SERIF FONT STACK ACROSS THE NAMECARD */
    .nc-card,
    .nc-card * {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        box-sizing: border-box;
    }

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

    /* MAIN NAMECARD CONTAINER */
    .nc-card {
        position: relative;
        width: 340px;
        height: 198px;
        border-radius: 18px;
        overflow: hidden;
        padding: 14px 16px 12px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        box-shadow:
            0 14px 34px rgba(15, 23, 42, 0.22),
            0 2px 8px rgba(15, 23, 42, 0.1);
        transition: box-shadow 0.2s ease;
    }

    .nc-card.tone-dark {
        --nc-text-primary: #161326;
        --nc-text-secondary: rgba(22, 19, 38, 0.64);
        --nc-divider: rgba(22, 19, 38, 0.12);
        --nc-pill-bg: rgba(255, 255, 255, 0.55);
        --nc-pill-hover: rgba(255, 255, 255, 0.85);
        color: #161326;
    }

    .nc-card.tone-light {
        --nc-text-primary: #ffffff;
        --nc-text-secondary: rgba(255, 255, 255, 0.72);
        --nc-divider: rgba(255, 255, 255, 0.18);
        --nc-pill-bg: rgba(255, 255, 255, 0.14);
        --nc-pill-hover: rgba(255, 255, 255, 0.28);
        color: #ffffff;
    }

    /* BORDER VARIATIONS */
    .nc-card.border-glass_rim {
        border: 1.5px solid rgba(255, 255, 255, 0.72);
        box-shadow:
            inset 0 1px 1px rgba(255, 255, 255, 0.85),
            0 14px 34px rgba(15, 23, 42, 0.22);
    }

    .nc-card.border-holo_glow {
        border: 2px solid rgba(255, 255, 255, 0.85);
        box-shadow:
            0 0 0 2px rgba(200, 182, 255, 0.6),
            0 12px 32px rgba(157, 46, 197, 0.24);
    }

    .nc-card.border-chrome_edge {
        border: 2px solid #e2e8f0;
        box-shadow:
            inset 0 0 0 1px rgba(148, 163, 184, 0.5),
            0 14px 34px rgba(15, 23, 42, 0.25);
    }

    .nc-card.border-pearl_soft {
        border: 2.5px solid rgba(255, 255, 255, 0.92);
    }

    .nc-card.border-neon_line {
        border: 2px solid var(--nc-accent);
        box-shadow:
            0 0 16px rgba(157, 46, 197, 0.28),
            0 14px 34px rgba(15, 23, 42, 0.22);
    }

    .nc-card.border-none {
        border: none;
    }

    /* ANIMATED BACKGROUND CANVAS */
    .nc-bg-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        z-index: 0;
        pointer-events: none;
    }

    /* TOP-RIGHT FLOATING ACTION PILLS */
    .nc-top-actions {
        position: absolute;
        top: 10px;
        right: 12px;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 4px;
        opacity: 0.78;
        transition: opacity 0.15s ease;
    }

    .nc-card:hover .nc-top-actions {
        opacity: 1;
    }

    .nc-pill-btn {
        background: var(--nc-pill-bg);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.45);
        color: var(--nc-text-primary);
        border-radius: 999px;
        padding: 3px 9px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.1s ease;
    }

    .nc-pill-btn.icon-only {
        padding: 3px 7px;
    }

    .nc-pill-btn.active-pin {
        background: var(--nc-accent);
        color: #ffffff;
    }

    .nc-pill-btn:hover:not(:disabled) {
        background: var(--nc-pill-hover);
        transform: translateY(-1px);
    }

    /* UPPER ROW: FRAMELESS TRANSPARENT AVATAR + IDENTITY */
    .nc-upper-row {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 14px;
        margin-top: 6px;
    }

    /* ZERO CHECKERBOARD, ZERO BOX — PURE TRANSPARENT CHARACTER CUTOUT */
    .nc-avatar-wrap {
        width: 96px;
        height: 96px;
        flex-shrink: 0;
        background: transparent;
        border: none;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .nc-avatar-wrap.interactive {
        cursor: pointer;
        transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .nc-avatar-wrap.interactive:hover {
        transform: scale(1.05);
    }

    .nc-avatar-cutout {
        width: 96px;
        height: 96px;
        object-fit: contain;
        image-rendering: pixelated;
        filter: drop-shadow(0 6px 12px rgba(15, 23, 42, 0.2));
    }

    .nc-identity-col {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-right: 4px;
    }

    .nc-name-trigger {
        background: transparent;
        border: none;
        padding: 0;
        color: var(--nc-text-primary);
        display: inline-flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        text-align: left;
        max-width: 100%;
    }

    .nc-display-name {
        font-size: 19px;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1.15;
        color: var(--nc-text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nc-edit-hint {
        font-size: 11px;
        opacity: 0;
        transition: opacity 0.15s ease;
    }

    .nc-name-trigger:hover .nc-edit-hint {
        opacity: 0.65;
    }

    .nc-handle {
        font-size: 12px;
        font-weight: 600;
        color: var(--nc-accent);
        letter-spacing: -0.01em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .nc-tagline-trigger,
    .nc-tagline {
        background: transparent;
        border: none;
        padding: 0;
        margin-top: 3px;
        font-size: 11.5px;
        font-weight: 500;
        color: var(--nc-text-secondary);
        text-align: left;
        cursor: pointer;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 100%;
    }

    .nc-tagline-trigger:hover {
        color: var(--nc-text-primary);
    }

    .nc-inline-form {
        width: 100%;
    }

    .nc-inline-input {
        width: 100%;
        background: rgba(255, 255, 255, 0.85);
        border: 1px solid var(--nc-accent);
        border-radius: 6px;
        padding: 2px 6px;
        font-size: 14px;
        font-weight: 700;
        color: #161326;
        outline: none;
    }

    .nc-inline-input.small {
        font-size: 11.5px;
        font-weight: 500;
    }

    .nc-signin-btn {
        margin-top: 8px;
        align-self: flex-start;
        background: #161326;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
    }

    /* BOXLESS FLOATING STATS ROW AT BOTTOM OF CARD */
    .nc-stats-row {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 10px;
        border-top: 1px solid var(--nc-divider);
    }

    .nc-stat-item {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .nc-stat-label {
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--nc-text-secondary);
    }

    .nc-stat-val {
        font-size: 13.5px;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--nc-text-primary);
    }

    .nc-stat-divider {
        width: 1px;
        height: 22px;
        background: var(--nc-divider);
    }

    /* OVERLAYS: PAINT & STICKERS */
    .nc-paint-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: fill;
        pointer-events: none;
        z-index: 3;
    }

    .nc-paint-overlay.layer-behind {
        z-index: 1;
    }

    .nc-sticker-item {
        position: absolute;
        z-index: 4;
        font-size: 24px;
        line-height: 1;
        pointer-events: none;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.14));
    }

    .nc-toast {
        position: absolute;
        bottom: 8px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10;
        background: rgba(22, 19, 38, 0.88);
        color: #ffffff;
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
    }

    /* =====================================================================
       RETRO OS WINDOW CUSTOMIZER DIALOG (MATCHES SITE-WIDE OS DIALOGS)
       ===================================================================== */
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

    .win98-dialog.nc-studio-dialog {
        width: 100%;
        max-width: 850px;
        background: #c0c0c0;
        border: 2px solid;
        border-color: #ffffff #000000 #000000 #ffffff;
        box-shadow: 2px 2px 12px rgba(0, 0, 0, 0.6);
        font-family: 'MS Sans Serif', 'Tahoma', Arial, sans-serif;
        color: #000000;
        transition: max-width 0.15s ease;
    }

    .win98-dialog.nc-studio-dialog.expanded-draw {
        max-width: 1080px;
    }

    .title-bar {
        background: linear-gradient(90deg, #000080, #1084d0);
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

    .customizer-split {
        display: grid;
        grid-template-columns: 468px 1fr;
        gap: 12px;
        align-items: start;
    }

    .expanded-draw .customizer-split {
        grid-template-columns: 620px 1fr;
    }

    @media (max-width: 860px) {
        .customizer-split,
        .expanded-draw .customizer-split {
            grid-template-columns: 1fr;
        }
    }

    /* STAGE COLUMN & ZOOM VIEWPORT */
    .nc-stage-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        width: 100%;
    }

    .nc-viewport-toolbar {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 4px;
        background: #dfdfdf;
        border: 1px solid #808080;
        padding: 3px 4px;
    }

    .nc-vp-group {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-wrap: wrap;
    }

    .vp-mini-btn {
        padding: 2px 6px !important;
        font-size: 10px !important;
    }

    .nc-zoom-viewport {
        width: 100%;
        height: 282px;
        background: #2b2d38;
        background-image: radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0);
        background-size: 14px 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;
    }

    .nc-zoom-viewport.expanded-vp {
        height: 374px;
    }

    .nc-card.studio-stage {
        width: 450px;
        height: 262px;
        padding: 20px 22px 16px;
        border-radius: 22px;
        flex-shrink: 0;
        transform-origin: center center;
    }

    .nc-card.studio-stage.expanded-card {
        width: 580px;
        height: 338px;
        padding: 24px 28px 20px;
    }

    .dimmed-ui {
        opacity: 0.2;
        transition: opacity 0.15s ease;
    }

    .studio-upper {
        gap: 18px;
        margin-top: 8px;
    }

    .studio-avatar,
    .studio-avatar .nc-avatar-cutout {
        width: 126px;
        height: 126px;
    }

    .studio-name {
        font-size: 24px;
    }

    .studio-handle {
        font-size: 14px;
    }

    .studio-tagline {
        font-size: 13.5px;
        margin-top: 4px;
    }

    .studio-stats .nc-stat-label {
        font-size: 10px;
    }

    .studio-stats .nc-stat-val {
        font-size: 17px;
    }

    .nc-sym-guide {
        position: absolute;
        pointer-events: none;
        z-index: 6;
    }

    .nc-sym-guide.vert-axis {
        top: 0;
        bottom: 0;
        left: 50%;
        border-left: 1px dashed rgba(255, 255, 255, 0.75);
    }

    .nc-sym-guide.horiz-axis {
        left: 0;
        right: 0;
        top: 50%;
        border-top: 1px dashed rgba(255, 255, 255, 0.75);
    }

    .nc-stage-paint-canvas,
    .nc-shape-overlay-canvas {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
        pointer-events: none;
    }

    .nc-stage-paint-canvas.layer-behind,
    .nc-shape-overlay-canvas.layer-behind {
        z-index: 1;
    }

    .nc-stage-paint-canvas.paint-interactive {
        pointer-events: auto;
        cursor: crosshair;
    }

    .nc-stage-paint-canvas.paint-interactive.cursor-pan {
        cursor: grab;
    }

    .nc-stage-paint-canvas.paint-interactive.cursor-pan:active {
        cursor: grabbing;
    }

    .stage-sticker {
        font-size: 28px;
        cursor: grab;
        padding: 3px;
        border-radius: 8px;
    }

    .stage-sticker.selected-sticker {
        outline: 1.5px dashed rgba(255, 255, 255, 0.9);
        background: rgba(255, 255, 255, 0.18);
    }

    /* CLASSIC OS INPUTS BELOW PREVIEW */
    .nc-identity-fields {
        width: 100%;
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
        color: #000000;
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

    /* RIGHT CONTROLS COLUMN (CLASSIC OS TABS & INSET PANEL) */
    .traits-column {
        display: flex;
        flex-direction: column;
        min-width: 0;
        height: 100%;
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
        padding: 4px 10px;
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

    .traits-panel {
        flex: 1;
        background: #ffffff;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        padding: 8px;
        overflow-y: auto;
        overflow-x: hidden;
        max-height: 390px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .expanded-draw .traits-panel {
        max-height: 460px;
    }

    .nc-tools-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
    }

    .nc-tool-card {
        padding: 4px 2px;
        min-height: 44px;
        gap: 2px;
        min-width: 0;
    }

    .nc-tool-ico {
        font-size: 15px;
        line-height: 1;
    }

    .nc-sliders-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        min-width: 0;
    }

    .nc-section-title {
        font-size: 11px;
        font-weight: bold;
        color: #000080;
        border-bottom: 1px solid #dfdfdf;
        padding-bottom: 2px;
    }

    .nc-swatch-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
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
    }

    .trait-card.selected {
        background: #000080;
        color: #ffffff;
        border-color: #000000 #ffffff #ffffff #000000;
        outline: 1px dotted #ffffff;
    }

    .nc-swatch-preview {
        width: 100%;
        height: 26px;
        border: 1px solid #808080;
    }

    .trait-name {
        font-size: 10px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    .nc-solid-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
    }

    .nc-color-dot {
        width: 24px;
        height: 24px;
        border: 2px solid;
        border-color: #808080 #ffffff #ffffff #808080;
        cursor: pointer;
    }

    .nc-color-dot.selected {
        outline: 2px solid #000080;
        outline-offset: 1px;
    }

    .nc-custom-color-label {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        font-size: 11px;
        cursor: pointer;
    }

    .nc-custom-color-label input[type="color"] {
        width: 16px;
        height: 16px;
        border: none;
        padding: 0;
        background: transparent;
        cursor: pointer;
    }

    .nc-toggle-row {
        margin-top: 2px;
    }

    .nc-checkbox-label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: bold;
        color: #000000;
        cursor: pointer;
    }

    .nc-border-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px;
    }

    .nc-border-item {
        align-items: flex-start;
        text-align: left;
        padding: 6px;
    }

    .nc-border-name {
        font-size: 11px;
        font-weight: bold;
    }

    .nc-border-desc {
        font-size: 9.5px;
        opacity: 0.8;
    }

    .nc-segmented-row {
        display: flex;
        gap: 4px;
        width: 100%;
        min-width: 0;
    }

    .nc-segmented-row .win98-btn {
        flex: 1;
        min-width: 0;
        padding: 4px 4px;
        font-size: 10.5px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .nc-chips-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .nc-helper-text {
        margin: 0;
        font-size: 11px;
        color: #333333;
        line-height: 1.35;
    }

    .nc-slider-group {
        display: grid;
        grid-template-columns: 98px minmax(0, 1fr);
        align-items: center;
        gap: 6px;
        width: 100%;
        min-width: 0;
    }

    .nc-slider-group label {
        font-size: 11px;
        font-weight: bold;
        color: #000000;
        white-space: nowrap;
    }

    .nc-slider-group input[type="range"] {
        width: 100%;
        min-width: 0;
        margin: 0;
        cursor: pointer;
    }

    .nc-draw-actions {
        display: flex;
        gap: 4px;
        width: 100%;
        min-width: 0;
    }

    .nc-draw-actions .win98-btn {
        flex: 1;
        min-width: 0;
        padding: 4px 4px;
        font-size: 10.5px;
    }

    .nc-sticker-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 4px;
    }

    .nc-sticker-btn {
        height: 36px;
        font-size: 18px;
    }

    .nc-selected-sticker-box {
        padding: 8px;
        background: #dfdfdf;
        border: 2px solid;
        border-color: #ffffff #808080 #808080 #ffffff;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .nc-sel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
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
        color: #444444;
    }

    @media (max-width: 560px) {
        .nc-zoom-viewport,
        .nc-zoom-viewport.expanded-vp {
            height: 224px;
            padding: 8px;
        }

        .nc-card.studio-stage,
        .nc-card.studio-stage.expanded-card {
            width: 100%;
            max-width: 336px;
            height: 196px;
            padding: 14px 16px 12px;
            border-radius: 18px;
        }

        .studio-upper {
            gap: 12px;
            margin-top: 4px;
        }

        .studio-avatar,
        .studio-avatar .nc-avatar-cutout {
            width: 90px;
            height: 90px;
        }

        .studio-name {
            font-size: 18px;
        }

        .studio-handle {
            font-size: 12px;
        }

        .studio-tagline {
            font-size: 11px;
        }

        .studio-stats .nc-stat-label {
            font-size: 8.5px;
        }

        .studio-stats .nc-stat-val {
            font-size: 13px;
        }

        .nc-identity-fields {
            grid-template-columns: 1fr;
        }

        .traits-panel,
        .expanded-draw .traits-panel {
            max-height: none;
        }
    }
</style>
