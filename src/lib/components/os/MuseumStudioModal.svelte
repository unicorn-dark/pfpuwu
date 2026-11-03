<!-- src/lib/components/os/MuseumStudioModal.svelte -->
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import {
        MUSEUM_SPOT_COUNT,
        MUSEUM_GALLERY_FEE,
        VOXEL_GRID_SIZE,
        MUSEUM_PEDESTAL_LOCATIONS,
        STARTER_3D_BLUEPRINTS,
        isMuseumCuratorAdmin,
        cleanMuseumUsername,
        getLegoPieceFootprint,
        getSymmetryCoords3D,
        generate3DStampVoxels,
        renderVoxelSculptureToCanvas,
        pickVoxelAtScreenCoord,
        exportVoxelSculptureDataUrl,
        getMyPersonalArtworks,
        findPlayerActiveSpot,
        findFirstOpenSpot,
        type BrickMaterial,
        type BrickShape,
        type LegoPieceType,
        type FrameStyle,
        type VoxelBrick,
        type ArtworkItem,
        type MuseumStateSnapshot,
        type VoxelHitCandidate
    } from '$lib/game/activities/museumArt';
    import { ensureTransparentAvatarUrl } from '$lib/stores/namecard';

    interface Props {
        museumState: MuseumStateSnapshot;
        initialTab?: 'inspect' | 'studio' | 'vault' | 'queue';
        initialSpotNumber?: number;
        myUserId: string;
        myUsername: string;
        myDisplayName: string;
        myAvatarUrl: string;
        myChips: number;
        onClose: () => void;
        onSaveToVault: (artwork: ArtworkItem) => Promise<void>;
        onExhibitOnSpot: (artwork: ArtworkItem, spotNumber: number) => Promise<void>;
        onSubmitToQueue: (artwork: ArtworkItem) => Promise<void>;
        onCuratorApproveToSpot: (artworkId: string, spotNumber: number) => Promise<void>;
        onRemoveFromQueue: (artworkId: string) => Promise<void>;
        onVacateSpot: (spotNumber: number) => Promise<void>;
        onDeleteFromVault: (artworkId: string) => Promise<void>;
        onToggleLike: (artworkId: string) => Promise<void>;
        onTipArtist: (artistUsername: string) => void;
    }

    let {
        museumState,
        initialTab = 'inspect',
        initialSpotNumber = 1,
        myUserId,
        myUsername,
        myDisplayName,
        myAvatarUrl,
        myChips,
        onClose,
        onSaveToVault,
        onExhibitOnSpot,
        onSubmitToQueue,
        onCuratorApproveToSpot,
        onRemoveFromQueue,
        onVacateSpot,
        onDeleteFromVault,
        onToggleLike,
        onTipArtist
    }: Props = $props();

    let activeTab = $state<'inspect' | 'studio' | 'vault' | 'queue'>(initialTab);
    let selectedSpotNumber = $state<number>(initialSpotNumber || 1);
    let statusBanner = $state<string>('');
    let isBusy = $state(false);

    const isCurator = $derived(isMuseumCuratorAdmin(myUsername));
    const cleanMe = $derived(cleanMuseumUsername(myUsername));
    const myVaultEntries = $derived(getMyPersonalArtworks(myUsername, museumState));
    const myCurrentSpot = $derived(findPlayerActiveSpot(myUsername, museumState));
    const firstOpenSpot = $derived(findFirstOpenSpot(museumState));
    const occupiedSpotCount = $derived(Object.keys(museumState.spots).length);
    const inspectedArtwork = $derived(museumState.spots[selectedSpotNumber] || null);
    const inspectedWing = $derived(
        MUSEUM_PEDESTAL_LOCATIONS.find((l) => l.spotNumber === selectedSpotNumber)?.wingName ||
            'Grand Rotunda'
    );

    // Transparent Artist Avatar URL cache for Brass Plaque
    let plaqueAvatarUrl = $state('/unicorn.png');
    $effect(() => {
        const rawUrl = inspectedArtwork?.artistAvatarUrl || myAvatarUrl || '/unicorn.png';
        ensureTransparentAvatarUrl(rawUrl).then((u) => {
            plaqueAvatarUrl = u;
        });
    });

    // --- INSPECTOR 3D TURNTABLE STATE ---
    let inspectCanvas: HTMLCanvasElement | null = $state(null);
    let inspectRotation = $state(0);
    let inspectZoom = $state(1.15);
    let inspectAutoSpin = $state(false);
    let inspectSpinInterval: number | null = null;

    function toggleInspectAutoSpin() {
        inspectAutoSpin = !inspectAutoSpin;
        if (inspectSpinInterval) {
            clearInterval(inspectSpinInterval);
            inspectSpinInterval = null;
        }
        if (inspectAutoSpin) {
            inspectSpinInterval = window.setInterval(() => {
                inspectRotation = (inspectRotation + 1) % 4;
                renderInspector3D();
            }, 950);
        }
    }

    function renderInspector3D() {
        if (!inspectCanvas || !inspectedArtwork || inspectedArtwork.artType !== '3d') return;
        const ctx = inspectCanvas.getContext('2d');
        if (!ctx) return;
        renderVoxelSculptureToCanvas(
            ctx,
            inspectCanvas.width,
            inspectCanvas.height,
            inspectedArtwork.voxels || [],
            {
                rotation: inspectRotation,
                zoom: inspectZoom,
                panY: 16,
                showBaseplate: true,
                bgColor: '#101426'
            },
            false
        );
    }

    $effect(() => {
        if (activeTab === 'inspect' && inspectedArtwork?.artType === '3d' && inspectCanvas) {
            const _rot = inspectRotation;
            const _zm = inspectZoom;
            setTimeout(() => renderInspector3D(), 15);
        }
    });

    // ============================================================================
    // ART STUDIO STATE (3D ISOLEGO BUILDER + 2D GALLERY EASEL + SIGNATURE PAD)
    // ============================================================================
    let editingArtworkId = $state<string | null>(null);
    let artMedium = $state<'3d' | '2d'>('3d');
    let artTitle = $state('Untitled UwU Masterpiece');
    let frameStyle = $state<FrameStyle>('gold');
    let targetExhibitSpot = $state<number>(initialSpotNumber || firstOpenSpot || 1);

    // --- 3D ISOLEGO BUILDER STATE ---
    let voxelCanvas: HTMLCanvasElement | null = $state(null);
    let voxels = $state<VoxelBrick[]>(STARTER_3D_BLUEPRINTS[0].build());
    let voxelUndoStack = $state<VoxelBrick[][]>([]);
    let voxelRedoStack = $state<VoxelBrick[][]>([]);
    let voxelRotation = $state(0);
    let voxelZoom = $state(1.08);
    let voxelPanX = $state(0);
    let voxelPanY = $state(14);
    let isVoxelPanning = $state(false);
    let voxelPanStart = { x: 0, y: 0, panX: 0, panY: 0 };

    type VoxelToolId =
        | 'place'
        | 'extrude'
        | 'sphere'
        | 'pyramid'
        | 'dome'
        | 'heart'
        | 'paint'
        | 'erase';
    let voxelTool = $state<VoxelToolId>('place');
    let legoPiece = $state<LegoPieceType>('1x1');
    let pieceOrientation = $state<0 | 1 | 2 | 3>(0);
    let brickMaterial = $state<BrickMaterial>('lego');
    let brickColor = $state('#ff3366');
    let voxelSymmetry = $state<'none' | 'x' | 'y' | 'quad'>('none');
    let stampRadius = $state(2);
    let useSliceZ = $state(false);
    let sliceZLevel = $state(0);

    let hitCandidates: VoxelHitCandidate[] = [];
    let ghostPreviewBricks = $state<VoxelBrick[]>([]);
    let hoveredHit: VoxelHitCandidate | null = null;
    let isVoxelDragging = false;
    let lastDraggedCoordKey = '';

    const STUDIO_PALETTE_24 = [
        '#ff0055', '#ff3366', '#ff66b2', '#ffb6c1',
        '#ff7700', '#ffaa00', '#ffd700', '#fef08a',
        '#00ff88', '#10b981', '#22c55e', '#84cc16',
        '#00ffff', '#38bdf8', '#3b82f6', '#1d4ed8',
        '#a855f7', '#c084fc', '#e0b0ff', '#7c3aed',
        '#ffffff', '#cbd5e1', '#64748b', '#1e293b'
    ];

    function pushVoxelUndo() {
        voxelUndoStack = [
            ...voxelUndoStack.slice(-24),
            voxels.map((v) => ({ ...v }))
        ];
        voxelRedoStack = [];
    }

    function undoVoxel() {
        if (voxelUndoStack.length === 0) return;
        const prev = voxelUndoStack[voxelUndoStack.length - 1];
        voxelUndoStack = voxelUndoStack.slice(0, -1);
        voxelRedoStack = [...voxelRedoStack, voxels.map((v) => ({ ...v }))];
        voxels = prev;
        redrawVoxelStudio();
    }

    function redoVoxel() {
        if (voxelRedoStack.length === 0) return;
        const next = voxelRedoStack[voxelRedoStack.length - 1];
        voxelRedoStack = voxelRedoStack.slice(0, -1);
        voxelUndoStack = [...voxelUndoStack, voxels.map((v) => ({ ...v }))];
        voxels = next;
        redrawVoxelStudio();
    }

    function clearVoxelBaseplate() {
        pushVoxelUndo();
        voxels = [];
        ghostPreviewBricks = [];
        redrawVoxelStudio();
    }

    function loadStarterBlueprint(bpId: string) {
        const bp = STARTER_3D_BLUEPRINTS.find((b) => b.id === bpId);
        if (!bp) return;
        pushVoxelUndo();
        voxels = bp.build();
        if (artTitle === 'Untitled UwU Masterpiece' || STARTER_3D_BLUEPRINTS.some((b) => b.name === artTitle)) {
            artTitle = bp.name;
        }
        redrawVoxelStudio();
        showLocalNotice(`🧱 Loaded "${bp.name}" 3D Lego blueprint! Customize it freely.`);
    }

    function rotateLegoPieceOrientation() {
        pieceOrientation = ((pieceOrientation + 1) % 4) as 0 | 1 | 2 | 3;
        if (hoveredHit) updateGhostPreviewFromHit(hoveredHit);
        redrawVoxelStudio();
    }

    function computePlacementBricksFromHit(hit: VoxelHitCandidate): VoxelBrick[] {
        const targetX = hit.isBaseplate ? hit.x : hit.x + hit.normal.dx;
        const targetY = hit.isBaseplate ? hit.y : hit.y + hit.normal.dy;
        const targetZ = hit.isBaseplate ? hit.z : hit.z + hit.normal.dz;

        if (
            targetX < 0 ||
            targetX >= VOXEL_GRID_SIZE ||
            targetY < 0 ||
            targetY >= VOXEL_GRID_SIZE ||
            targetZ < 0 ||
            targetZ >= VOXEL_GRID_SIZE
        ) {
            return [];
        }

        if (['sphere', 'pyramid', 'dome', 'heart'].includes(voxelTool)) {
            const rawStamp = generate3DStampVoxels(
                voxelTool as 'sphere' | 'pyramid' | 'dome' | 'heart',
                targetX,
                targetY,
                targetZ,
                stampRadius,
                brickColor,
                brickMaterial,
                VOXEL_GRID_SIZE
            );
            const out: VoxelBrick[] = [];
            for (const sv of rawStamp) {
                const symPts = getSymmetryCoords3D(sv.x, sv.y, sv.z, voxelSymmetry, VOXEL_GRID_SIZE);
                for (const pt of symPts) {
                    out.push({
                        x: pt.x,
                        y: pt.y,
                        z: pt.z,
                        color: sv.color,
                        material: sv.material,
                        shape: sv.shape
                    });
                }
            }
            return out;
        }

        const footprint = getLegoPieceFootprint(legoPiece, pieceOrientation);
        const heightCount = voxelTool === 'extrude' ? 3 : 1;
        const result: VoxelBrick[] = [];

        for (let h = 0; h < heightCount; h++) {
            const z = targetZ + h;
            if (z >= VOXEL_GRID_SIZE) continue;
            for (const cell of footprint) {
                const bx = targetX + cell.dx;
                const by = targetY + cell.dy;
                const symCoords = getSymmetryCoords3D(bx, by, z, voxelSymmetry, VOXEL_GRID_SIZE);
                for (const pt of symCoords) {
                    result.push({
                        x: pt.x,
                        y: pt.y,
                        z: pt.z,
                        color: brickColor,
                        material: brickMaterial,
                        shape: cell.shape
                    });
                }
            }
        }
        return result;
    }

    function updateGhostPreviewFromHit(hit: VoxelHitCandidate | null) {
        if (!hit || voxelTool === 'erase' || voxelTool === 'paint') {
            ghostPreviewBricks = [];
            return;
        }
        ghostPreviewBricks = computePlacementBricksFromHit(hit);
    }

    function applyVoxelActionAtHit(hit: VoxelHitCandidate, isRightClickErase = false) {
        if (isRightClickErase || voxelTool === 'erase') {
            if (hit.isBaseplate) return;
            const symTargets = getSymmetryCoords3D(hit.x, hit.y, hit.z, voxelSymmetry, VOXEL_GRID_SIZE);
            const removeSet = new Set(symTargets.map((p) => `${p.x},${p.y},${p.z}`));
            voxels = voxels.filter((v) => !removeSet.has(`${v.x},${v.y},${v.z}`));
            redrawVoxelStudio();
            return;
        }

        if (voxelTool === 'paint') {
            if (hit.isBaseplate) return;
            const symTargets = getSymmetryCoords3D(hit.x, hit.y, hit.z, voxelSymmetry, VOXEL_GRID_SIZE);
            const paintSet = new Set(symTargets.map((p) => `${p.x},${p.y},${p.z}`));
            voxels = voxels.map((v) =>
                paintSet.has(`${v.x},${v.y},${v.z}`)
                    ? { ...v, color: brickColor, material: brickMaterial }
                    : v
            );
            redrawVoxelStudio();
            return;
        }

        const newBricks = computePlacementBricksFromHit(hit);
        if (newBricks.length === 0) return;

        const byKey = new Map<string, VoxelBrick>();
        for (const v of voxels) {
            byKey.set(`${v.x},${v.y},${v.z}`, v);
        }
        for (const nb of newBricks) {
            byKey.set(`${nb.x},${nb.y},${nb.z}`, nb);
        }
        voxels = Array.from(byKey.values());
        redrawVoxelStudio();
    }

    function redrawVoxelStudio() {
        if (!voxelCanvas) return;
        const ctx = voxelCanvas.getContext('2d');
        if (!ctx) return;

        hitCandidates = renderVoxelSculptureToCanvas(
            ctx,
            voxelCanvas.width,
            voxelCanvas.height,
            voxels,
            {
                rotation: voxelRotation,
                zoom: voxelZoom,
                panX: voxelPanX,
                panY: voxelPanY,
                showBaseplate: true,
                sliceZ: useSliceZ ? sliceZLevel : null,
                ghostVoxels: ghostPreviewBricks,
                bgColor: '#101426'
            },
            true
        );
    }

    function getVoxelCanvasCoords(e: MouseEvent | TouchEvent): { x: number; y: number } {
        if (!voxelCanvas) return { x: 0, y: 0 };
        const rect = voxelCanvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: ((clientX - rect.left) / rect.width) * voxelCanvas.width,
            y: ((clientY - rect.top) / rect.height) * voxelCanvas.height
        };
    }

    function handleVoxelPointerMove(e: MouseEvent | TouchEvent) {
        if (!voxelCanvas) return;
        if (isVoxelPanning && 'clientX' in e) {
            voxelPanX = voxelPanStart.panX + (e.clientX - voxelPanStart.x);
            voxelPanY = voxelPanStart.panY + (e.clientY - voxelPanStart.y);
            redrawVoxelStudio();
            return;
        }

        const pt = getVoxelCanvasCoords(e);
        const hit = pickVoxelAtScreenCoord(pt.x, pt.y, hitCandidates);
        hoveredHit = hit;
        updateGhostPreviewFromHit(hit);

        if (isVoxelDragging && hit) {
            const key = `${hit.x},${hit.y},${hit.z},${hit.isBaseplate}`;
            if (key !== lastDraggedCoordKey) {
                lastDraggedCoordKey = key;
                applyVoxelActionAtHit(hit, false);
            }
        } else {
            redrawVoxelStudio();
        }
    }

    function handleVoxelPointerDown(e: MouseEvent | TouchEvent) {
        if (!voxelCanvas) return;
        const isRightClick = 'button' in e && e.button === 2;
        const isMiddleClick = 'button' in e && e.button === 1;

        if (isMiddleClick || ('shiftKey' in e && e.shiftKey)) {
            if ('clientX' in e) {
                isVoxelPanning = true;
                voxelPanStart = { x: e.clientX, y: e.clientY, panX: voxelPanX, panY: voxelPanY };
            }
            return;
        }

        const pt = getVoxelCanvasCoords(e);
        const hit = pickVoxelAtScreenCoord(pt.x, pt.y, hitCandidates);
        if (!hit) return;

        pushVoxelUndo();
        isVoxelDragging = true;
        lastDraggedCoordKey = `${hit.x},${hit.y},${hit.z},${hit.isBaseplate}`;
        applyVoxelActionAtHit(hit, isRightClick);
    }

    function handleVoxelPointerUp() {
        isVoxelDragging = false;
        isVoxelPanning = false;
        lastDraggedCoordKey = '';
    }

    // ============================================================================
    // 2D GALLERY EASEL STUDIO STATE (Apple Pencil / Pro Canvas Tools)
    // ============================================================================
    let easelCanvas: HTMLCanvasElement | null = $state(null);
    let easelBgColor = $state('#111827');
    type EaselToolId =
        | 'pen'
        | 'pencil'
        | 'marker'
        | 'airbrush'
        | 'neon'
        | 'pixel'
        | 'rainbow'
        | 'sparkle'
        | 'line'
        | 'rect'
        | 'circle'
        | 'fill'
        | 'eyedropper'
        | 'eraser';
    let easelTool = $state<EaselToolId>('pen');
    let easelColor = $state('#00ffff');
    let easelSize = $state(8);
    let easelOpacity = $state(100);
    let easelSmoothing = $state(35);
    let easelSymmetry = $state<'none' | 'x' | 'y' | 'quad'>('none');
    let easelZoom = $state(1);
    let easelPanX = $state(0);
    let easelPanY = $state(0);
    let easelUndoStack = $state<string[]>([]);
    let easelRedoStack = $state<string[]>([]);

    let isEaselDrawing = false;
    let easelSmoothPt = { x: 0, y: 0 };
    let easelLastPt = { x: 0, y: 0 };
    let easelShapeStartPt = { x: 0, y: 0 };
    let easelShapeSnapshot: ImageData | null = null;
    let rainbowHue = 0;

    function initEaselCanvas(existingDataUrl?: string) {
        if (!easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;

        if (existingDataUrl && existingDataUrl.startsWith('data:image/')) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, easelCanvas!.width, easelCanvas!.height);
                ctx.drawImage(img, 0, 0, easelCanvas!.width, easelCanvas!.height);
                easelUndoStack = [easelCanvas!.toDataURL('image/png')];
                easelRedoStack = [];
            };
            img.src = existingDataUrl;
        } else if (easelUndoStack.length === 0) {
            ctx.fillStyle = easelBgColor;
            ctx.fillRect(0, 0, easelCanvas.width, easelCanvas.height);
            easelUndoStack = [easelCanvas.toDataURL('image/png')];
            easelRedoStack = [];
        } else {
            const lastUrl = easelUndoStack[easelUndoStack.length - 1];
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, easelCanvas!.width, easelCanvas!.height);
                ctx.drawImage(img, 0, 0);
            };
            img.src = lastUrl;
        }
    }

    function pushEaselUndo() {
        if (!easelCanvas) return;
        const url = easelCanvas.toDataURL('image/png');
        easelUndoStack = [...easelUndoStack.slice(-24), url];
        easelRedoStack = [];
    }

    function undoEasel() {
        if (!easelCanvas || easelUndoStack.length <= 1) return;
        const cur = easelUndoStack[easelUndoStack.length - 1];
        const prev = easelUndoStack[easelUndoStack.length - 2];
        easelUndoStack = easelUndoStack.slice(0, -1);
        easelRedoStack = [...easelRedoStack, cur];
        const img = new Image();
        img.onload = () => {
            const ctx = easelCanvas?.getContext('2d');
            if (!ctx || !easelCanvas) return;
            ctx.clearRect(0, 0, easelCanvas.width, easelCanvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = prev;
    }

    function redoEasel() {
        if (!easelCanvas || easelRedoStack.length === 0) return;
        const next = easelRedoStack[easelRedoStack.length - 1];
        easelRedoStack = easelRedoStack.slice(0, -1);
        easelUndoStack = [...easelUndoStack, next];
        const img = new Image();
        img.onload = () => {
            const ctx = easelCanvas?.getContext('2d');
            if (!ctx || !easelCanvas) return;
            ctx.clearRect(0, 0, easelCanvas.width, easelCanvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = next;
    }

    function clearEaselCanvas() {
        if (!easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = easelBgColor;
        ctx.fillRect(0, 0, easelCanvas.width, easelCanvas.height);
        pushEaselUndo();
    }

    function getEaselCoords(e: MouseEvent | TouchEvent): { x: number; y: number } {
        if (!easelCanvas) return { x: 0, y: 0 };
        const rect = easelCanvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        return {
            x: ((clientX - rect.left) / rect.width) * easelCanvas.width,
            y: ((clientY - rect.top) / rect.height) * easelCanvas.height
        };
    }

    function getEaselSymmetrySegments(
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ): Array<{ x1: number; y1: number; x2: number; y2: number }> {
        const w = easelCanvas?.width || 480;
        const h = easelCanvas?.height || 480;
        const segs = [{ x1, y1, x2, y2 }];
        if (easelSymmetry === 'x' || easelSymmetry === 'quad') {
            segs.push({ x1: w - x1, y1, x2: w - x2, y2 });
        }
        if (easelSymmetry === 'y' || easelSymmetry === 'quad') {
            segs.push({ x1, y1: h - y1, x2, y2: h - y2 });
        }
        if (easelSymmetry === 'quad') {
            segs.push({ x1: w - x1, y1: h - y1, x2: w - x2, y2: h - y2 });
        }
        return segs;
    }

    function floodFillEasel(startX: number, startY: number, fillHex: string) {
        if (!easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;
        const w = easelCanvas.width;
        const h = easelCanvas.height;
        const sx = Math.max(0, Math.min(w - 1, Math.floor(startX)));
        const sy = Math.max(0, Math.min(h - 1, Math.floor(startY)));

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const clean = fillHex.replace('#', '');
        const num = parseInt(clean, 16);
        const fr = (num >> 16) & 255;
        const fg = (num >> 8) & 255;
        const fb = num & 255;

        const startIdx = (sy * w + sx) * 4;
        const sr = data[startIdx];
        const sg = data[startIdx + 1];
        const sb = data[startIdx + 2];

        if (Math.abs(sr - fr) <= 4 && Math.abs(sg - fg) <= 4 && Math.abs(sb - fb) <= 4) return;

        const visited = new Uint8Array(w * h);
        const stack: number[] = [sx, sy];

        while (stack.length > 0) {
            const cy = stack.pop()!;
            const cx = stack.pop()!;
            const pIdx = cy * w + cx;
            if (visited[pIdx]) continue;
            visited[pIdx] = 1;

            const idx = pIdx * 4;
            if (
                Math.abs(data[idx] - sr) <= 22 &&
                Math.abs(data[idx + 1] - sg) <= 22 &&
                Math.abs(data[idx + 2] - sb) <= 22
            ) {
                data[idx] = fr;
                data[idx + 1] = fg;
                data[idx + 2] = fb;
                data[idx + 3] = 255;

                if (cx > 0) stack.push(cx - 1, cy);
                if (cx < w - 1) stack.push(cx + 1, cy);
                if (cy > 0) stack.push(cx, cy - 1);
                if (cy < h - 1) stack.push(cx, cy + 1);
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    function handleEaselPointerDown(e: MouseEvent | TouchEvent) {
        if (!easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;

        const pt = getEaselCoords(e);

        if (easelTool === 'eyedropper') {
            const pixel = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
            easelColor = `#${((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1)}`;
            easelTool = 'pen';
            return;
        }

        if (easelTool === 'fill') {
            floodFillEasel(pt.x, pt.y, easelColor);
            pushEaselUndo();
            return;
        }

        isEaselDrawing = true;
        easelSmoothPt = { ...pt };
        easelLastPt = { ...pt };
        easelShapeStartPt = { ...pt };

        if (['line', 'rect', 'circle'].includes(easelTool)) {
            easelShapeSnapshot = ctx.getImageData(0, 0, easelCanvas.width, easelCanvas.height);
        } else {
            drawEaselStrokeSegment(pt.x, pt.y, pt.x + 0.1, pt.y + 0.1);
        }
    }

    function handleEaselPointerMove(e: MouseEvent | TouchEvent) {
        if (!isEaselDrawing || !easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;

        const rawPt = getEaselCoords(e);

        if (['line', 'rect', 'circle'].includes(easelTool)) {
            if (easelShapeSnapshot) {
                ctx.putImageData(easelShapeSnapshot, 0, 0);
            }
            const segs = getEaselSymmetrySegments(
                easelShapeStartPt.x,
                easelShapeStartPt.y,
                rawPt.x,
                rawPt.y
            );
            ctx.save();
            ctx.globalAlpha = easelOpacity / 100;
            ctx.strokeStyle = easelColor;
            ctx.lineWidth = easelSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const s of segs) {
                ctx.beginPath();
                if (easelTool === 'line') {
                    ctx.moveTo(s.x1, s.y1);
                    ctx.lineTo(s.x2, s.y2);
                } else if (easelTool === 'rect') {
                    ctx.strokeRect(s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1);
                } else if (easelTool === 'circle') {
                    const rx = Math.abs(s.x2 - s.x1) / 2;
                    const ry = Math.abs(s.y2 - s.y1) / 2;
                    ctx.ellipse((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, rx, ry, 0, 0, Math.PI * 2);
                }
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        const factor = 1 - (easelSmoothing / 100) * 0.82;
        easelSmoothPt = {
            x: easelSmoothPt.x + (rawPt.x - easelSmoothPt.x) * factor,
            y: easelSmoothPt.y + (rawPt.y - easelSmoothPt.y) * factor
        };

        drawEaselStrokeSegment(easelLastPt.x, easelLastPt.y, easelSmoothPt.x, easelSmoothPt.y);
        easelLastPt = { ...easelSmoothPt };
    }

    function handleEaselPointerUp() {
        if (!isEaselDrawing) return;
        isEaselDrawing = false;
        easelShapeSnapshot = null;
        pushEaselUndo();
    }

    function drawEaselStrokeSegment(x1: number, y1: number, x2: number, y2: number) {
        if (!easelCanvas) return;
        const ctx = easelCanvas.getContext('2d');
        if (!ctx) return;

        const segs = getEaselSymmetrySegments(x1, y1, x2, y2);
        ctx.save();
        ctx.globalAlpha = easelOpacity / 100;

        if (easelTool === 'eraser') {
            ctx.strokeStyle = easelBgColor;
            ctx.lineWidth = easelSize * 1.4;
            ctx.lineCap = 'round';
            for (const s of segs) {
                ctx.beginPath();
                ctx.moveTo(s.x1, s.y1);
                ctx.lineTo(s.x2, s.y2);
                ctx.stroke();
            }
            ctx.restore();
            return;
        }

        if (easelTool === 'pixel') {
            const cell = Math.max(8, Math.round(easelSize * 1.5));
            ctx.fillStyle = easelColor;
            for (const s of segs) {
                const gx = Math.floor(s.x2 / cell) * cell;
                const gy = Math.floor(s.y2 / cell) * cell;
                ctx.fillRect(gx, gy, cell, cell);
            }
            ctx.restore();
            return;
        }

        if (easelTool === 'airbrush') {
            ctx.fillStyle = easelColor;
            const density = Math.max(10, easelSize * 2);
            for (const s of segs) {
                for (let i = 0; i < density; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const rad = Math.random() * easelSize * 1.3;
                    ctx.fillRect(s.x2 + Math.cos(ang) * rad, s.y2 + Math.sin(ang) * rad, 1.5, 1.5);
                }
            }
            ctx.restore();
            return;
        }

        if (easelTool === 'sparkle') {
            for (const s of segs) {
                ctx.fillStyle = easelColor;
                ctx.font = `${Math.max(10, easelSize * 1.6)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(['✦', '✧', '★', '♡'][Math.floor(Math.random() * 4)], s.x2, s.y2);
            }
            ctx.restore();
            return;
        }

        rainbowHue = (rainbowHue + 5) % 360;
        const activeStroke =
            easelTool === 'rainbow' ? `hsl(${rainbowHue}, 95%, 60%)` : easelColor;

        if (easelTool === 'neon') {
            ctx.shadowColor = activeStroke;
            ctx.shadowBlur = easelSize * 1.6;
        } else if (easelTool === 'marker') {
            ctx.globalAlpha = (easelOpacity / 100) * 0.45;
        } else if (easelTool === 'pencil') {
            ctx.globalAlpha = (easelOpacity / 100) * 0.78;
        }

        ctx.strokeStyle = activeStroke;
        ctx.lineWidth = easelTool === 'pencil' ? Math.max(1.5, easelSize * 0.65) : easelSize;
        ctx.lineCap = easelTool === 'marker' ? 'square' : 'round';
        ctx.lineJoin = 'round';

        for (const s of segs) {
            ctx.beginPath();
            ctx.moveTo(s.x1, s.y1);
            ctx.lineTo(s.x2, s.y2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ============================================================================
    // ARTIST HAND-DRAWN SIGNATURE PAD STATE
    // ============================================================================
    let sigCanvas: HTMLCanvasElement | null = $state(null);
    let sigInkColor = $state('#ffd700');
    let hasSignatureInk = $state(false);
    let isSigning = false;
    let sigLastPt = { x: 0, y: 0 };

    function clearSignaturePad() {
        if (!sigCanvas) return;
        const ctx = sigCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        hasSignatureInk = false;
    }

    function generateAutoCalligraphySignature() {
        if (!sigCanvas) return;
        const ctx = sigCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
        ctx.save();
        ctx.font = 'italic bold 22px "Georgia", "Times New Roman", cursive, serif';
        ctx.fillStyle = sigInkColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const nameText = myDisplayName || `@${cleanMe}`;
        ctx.fillText(nameText, sigCanvas.width / 2, sigCanvas.height / 2 - 2);

        // Elegant flourish underline
        ctx.strokeStyle = sigInkColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(32, sigCanvas.height - 12);
        ctx.quadraticCurveTo(sigCanvas.width / 2, sigCanvas.height - 4, sigCanvas.width - 32, sigCanvas.height - 14);
        ctx.stroke();
        ctx.restore();
        hasSignatureInk = true;
    }

    function handleSigPointerDown(e: MouseEvent | TouchEvent) {
        if (!sigCanvas) return;
        isSigning = true;
        const rect = sigCanvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        sigLastPt = {
            x: ((clientX - rect.left) / rect.width) * sigCanvas.width,
            y: ((clientY - rect.top) / rect.height) * sigCanvas.height
        };
        hasSignatureInk = true;
    }

    function handleSigPointerMove(e: MouseEvent | TouchEvent) {
        if (!isSigning || !sigCanvas) return;
        const ctx = sigCanvas.getContext('2d');
        if (!ctx) return;
        const rect = sigCanvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const pt = {
            x: ((clientX - rect.left) / rect.width) * sigCanvas.width,
            y: ((clientY - rect.top) / rect.height) * sigCanvas.height
        };

        ctx.save();
        ctx.strokeStyle = sigInkColor;
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(sigLastPt.x, sigLastPt.y);
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();

        sigLastPt = pt;
    }

    function handleSigPointerUp() {
        isSigning = false;
    }

    // ============================================================================
    // LOAD EXISTING ARTWORK INTO STUDIO FOR EDITING
    // ============================================================================
    function openArtworkInStudio(art: ArtworkItem) {
        editingArtworkId = art.id;
        artMedium = art.artType;
        artTitle = art.title;
        frameStyle = art.frameStyle || 'gold';
        activeTab = 'studio';

        setTimeout(() => {
            if (art.artType === '3d' && Array.isArray(art.voxels)) {
                voxels = art.voxels.map((v) => ({ ...v }));
                voxelUndoStack = [];
                voxelRedoStack = [];
                redrawVoxelStudio();
            } else if (art.artType === '2d' && art.imageDataUrl) {
                initEaselCanvas(art.imageDataUrl);
            }

            if (art.signatureDataUrl && sigCanvas) {
                const sImg = new Image();
                sImg.onload = () => {
                    const sCtx = sigCanvas?.getContext('2d');
                    if (sCtx && sigCanvas) {
                        sCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
                        sCtx.drawImage(sImg, 0, 0, sigCanvas.width, sigCanvas.height);
                        hasSignatureInk = true;
                    }
                };
                sImg.src = art.signatureDataUrl;
            }
        }, 30);
    }

    function startNewArtworkForSpot(spotNum: number, medium: '3d' | '2d' = '3d') {
        editingArtworkId = null;
        targetExhibitSpot = spotNum;
        artMedium = medium;
        artTitle = medium === '3d' ? 'IsoLego Sculpture' : 'Gallery Canvas';
        activeTab = 'studio';
        setTimeout(() => {
            if (medium === '3d') redrawVoxelStudio();
            else initEaselCanvas();
        }, 30);
    }

    function buildCurrentArtworkObject(): ArtworkItem | null {
        if (artMedium === '3d' && voxels.length === 0) {
            showLocalNotice('🧱 Place at least 1 Lego brick on the baseplate first!');
            return null;
        }
        const imageDataUrl =
            artMedium === '3d'
                ? exportVoxelSculptureDataUrl(voxels, voxelRotation, 320)
                : easelCanvas?.toDataURL('image/png') || '';

        const sigDataUrl =
            hasSignatureInk && sigCanvas ? sigCanvas.toDataURL('image/png') : null;

        const nowIso = new Date().toISOString();
        return {
            id: editingArtworkId || `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            artType: artMedium,
            title: artTitle.trim() || 'Untitled UwU Masterpiece',
            artistId: myUserId || cleanMe,
            artistUsername: cleanMe,
            artistDisplayName: myDisplayName || cleanMe,
            artistAvatarUrl: myAvatarUrl || '/unicorn.png',
            signatureDataUrl: sigDataUrl,
            frameStyle,
            imageDataUrl,
            voxels: artMedium === '3d' ? voxels.map((v) => ({ ...v })) : undefined,
            gridSize: VOXEL_GRID_SIZE,
            likes: [],
            createdAt: nowIso,
            updatedAt: nowIso
        };
    }

    async function handleSaveToPersonalVaultClick() {
        if (isBusy) return;
        const art = buildCurrentArtworkObject();
        if (!art) return;
        isBusy = true;
        await onSaveToVault(art);
        editingArtworkId = art.id;
        isBusy = false;
        showLocalNotice(`📁 Saved "${art.title}" permanently to your Personal Art Vault!`);
    }

    async function handleExhibitFromStudioClick() {
        if (isBusy) return;
        const art = buildCurrentArtworkObject();
        if (!art) return;
        isBusy = true;
        await onExhibitOnSpot(art, targetExhibitSpot);
        editingArtworkId = art.id;
        selectedSpotNumber = targetExhibitSpot;
        isBusy = false;
    }

    async function handleSubmitToCuratorQueueClick() {
        if (isBusy) return;
        const art = buildCurrentArtworkObject();
        if (!art) return;
        isBusy = true;
        await onSubmitToQueue(art);
        editingArtworkId = art.id;
        isBusy = false;
        activeTab = 'queue';
    }

    function downloadArtworkPng(art: ArtworkItem) {
        if (!art.imageDataUrl) return;
        const a = document.createElement('a');
        a.href = art.imageDataUrl;
        a.download = `${art.title.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}_uwu_museum.png`;
        a.click();
    }

    function showLocalNotice(msg: string) {
        statusBanner = msg;
        setTimeout(() => {
            if (statusBanner === msg) statusBanner = '';
        }, 4500);
    }

    // Curator spot selector map (artworkId -> targetSpot)
    let curatorSpotTargets = $state<Record<string, number>>({});

    function getCuratorTargetSpot(artId: string): number {
        return curatorSpotTargets[artId] || firstOpenSpot || selectedSpotNumber || 1;
    }

    function handleGlobalKeyDown(e: KeyboardEvent) {
        if (activeTab !== 'studio') return;
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if (artMedium === '3d') {
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                rotateLegoPieceOrientation();
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redoVoxel();
                else undoVoxel();
            }
        } else if (artMedium === '2d') {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redoEasel();
                else undoEasel();
            }
        }
    }

    $effect(() => {
        if (activeTab === 'studio') {
            const _med = artMedium;
            setTimeout(() => {
                if (_med === '3d') redrawVoxelStudio();
                else initEaselCanvas();
            }, 25);
        }
    });

    onMount(() => {
        window.addEventListener('keydown', handleGlobalKeyDown);
        setTimeout(() => {
            if (activeTab === 'studio') {
                if (artMedium === '3d') redrawVoxelStudio();
                else initEaselCanvas();
            } else if (activeTab === 'inspect') {
                renderInspector3D();
            }
        }, 35);
    });

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('keydown', handleGlobalKeyDown);
        }
        if (inspectSpinInterval) clearInterval(inspectSpinInterval);
    });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="museum-modal-backdrop" onclick={onClose}>
    <div class="museum-window win98-window" onclick={(e) => e.stopPropagation()}>
        <!-- Classic Windows XP/98 Title Bar -->
        <div class="win98-title-bar">
            <div class="title-left">
                <span class="win98-title">
                    🏛️ UwU Grand Art Museum — {occupiedSpotCount}/{MUSEUM_SPOT_COUNT} Spots Exhibited
                </span>
                {#if isCurator}
                    <span class="curator-crown-badge">👑 CURATOR ADMIN (@0xsha3)</span>
                {/if}
            </div>
            <button class="win98-close-btn" onclick={onClose} title="Close Museum Window">✕</button>
        </div>

        <!-- Top Navigation Tabs -->
        <div class="museum-tabs-bar">
            <button
                class="win98-tab-btn"
                class:active={activeTab === 'inspect'}
                onclick={() => (activeTab = 'inspect')}
            >
                🔍 Spot #{selectedSpotNumber} Inspector
            </button>
            <button
                class="win98-tab-btn"
                class:active={activeTab === 'studio'}
                onclick={() => (activeTab = 'studio')}
            >
                🎨 2D & 3D Art Studio
            </button>
            <button
                class="win98-tab-btn"
                class:active={activeTab === 'vault'}
                onclick={() => (activeTab = 'vault')}
            >
                📁 My Art Vault ({myVaultEntries.length})
            </button>
            <button
                class="win98-tab-btn"
                class:active={activeTab === 'queue'}
                onclick={() => (activeTab = 'queue')}
            >
                ⏳ Undecided Queue ({museumState.pendingQueue.length})
                {#if isCurator && museumState.pendingQueue.length > 0}
                    <span class="queue-alert-dot">!</span>
                {/if}
            </button>
        </div>

        {#if statusBanner}
            <div class="museum-status-toast">{statusBanner}</div>
        {/if}

        <!-- ================================================================ -->
        <!-- TAB 1: PEDESTAL SPOT INSPECTOR (#1 - #25)                        -->
        <!-- ================================================================ -->
        {#if activeTab === 'inspect'}
            <div class="museum-tab-body inspect-layout">
                <!-- Left Column: Artwork Viewport & Spot Selector -->
                <div class="inspect-viewport-col">
                    <div class="spot-switcher-bar win98-inset">
                        <button
                            class="win98-btn mini-btn"
                            onclick={() => {
                                selectedSpotNumber =
                                    selectedSpotNumber <= 1 ? MUSEUM_SPOT_COUNT : selectedSpotNumber - 1;
                            }}
                        >
                            ◀ Prev
                        </button>

                        <select
                            class="win98-select spot-select"
                            bind:value={selectedSpotNumber}
                        >
                            {#each MUSEUM_PEDESTAL_LOCATIONS as loc}
                                {@const occupant = museumState.spots[loc.spotNumber]}
                                <option value={loc.spotNumber}>
                                    Spot #{loc.spotNumber} ({loc.wingName}) — {occupant
                                        ? `${occupant.artType === '3d' ? '🧱' : '🖼️'} "${occupant.title}" by @${occupant.artistUsername}`
                                        : '🟢 OPEN SPOT'}
                                </option>
                            {/each}
                        </select>

                        <button
                            class="win98-btn mini-btn"
                            onclick={() => {
                                selectedSpotNumber =
                                    selectedSpotNumber >= MUSEUM_SPOT_COUNT ? 1 : selectedSpotNumber + 1;
                            }}
                        >
                            Next ▶
                        </button>
                    </div>

                    {#if inspectedArtwork}
                        <div class="artwork-showcase-box win98-inset frame-{inspectedArtwork.frameStyle}">
                            {#if inspectedArtwork.artType === '3d'}
                                <canvas
                                    bind:this={inspectCanvas}
                                    width="420"
                                    height="360"
                                    class="inspect-3d-canvas"
                                ></canvas>
                                <div class="turntable-toolbar">
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => {
                                            inspectRotation = (inspectRotation + 3) % 4;
                                            renderInspector3D();
                                        }}
                                    >
                                        ↺ Rotate 90°
                                    </button>
                                    <button
                                        class="win98-btn mini-btn"
                                        class:active-toggle={inspectAutoSpin}
                                        onclick={toggleInspectAutoSpin}
                                    >
                                        {inspectAutoSpin ? '⏸️ Stop Spin' : '🔄 Auto-Turntable'}
                                    </button>
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => {
                                            inspectRotation = (inspectRotation + 1) % 4;
                                            renderInspector3D();
                                        }}
                                    >
                                        ↻ Rotate 90°
                                    </button>
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => {
                                            inspectZoom = Math.max(0.7, inspectZoom - 0.15);
                                            renderInspector3D();
                                        }}
                                    >
                                        🔍-
                                    </button>
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => {
                                            inspectZoom = Math.min(2.2, inspectZoom + 0.15);
                                            renderInspector3D();
                                        }}
                                    >
                                        🔍+
                                    </button>
                                </div>
                            {:else}
                                <img
                                    src={inspectedArtwork.imageDataUrl}
                                    alt={inspectedArtwork.title}
                                    class="inspect-2d-img"
                                />
                            {/if}
                        </div>
                    {:else}
                        <div class="empty-pedestal-box win98-inset">
                            <div class="empty-pedestal-icon">🏛️✨</div>
                            <h3>Pedestal Spot #{selectedSpotNumber} is Open!</h3>
                            <p class="empty-pedestal-sub">
                                Located in <strong>{inspectedWing}</strong>. Exhibit a 3D IsoLego Sculpture or 2D
                                Gallery Painting with your Avatar & Signature Plaque!
                            </p>
                            <div class="empty-pedestal-actions">
                                <button
                                    class="win98-btn primary-gold-btn"
                                    onclick={() => startNewArtworkForSpot(selectedSpotNumber, '3d')}
                                >
                                    🧱 Build 3D IsoLego Sculpture
                                </button>
                                <button
                                    class="win98-btn primary-cyan-btn"
                                    onclick={() => startNewArtworkForSpot(selectedSpotNumber, '2d')}
                                >
                                    🎨 Paint 2D Gallery Canvas
                                </button>
                                {#if myVaultEntries.length > 0}
                                    <button
                                        class="win98-btn"
                                        onclick={() => {
                                            targetExhibitSpot = selectedSpotNumber;
                                            activeTab = 'vault';
                                        }}
                                    >
                                        📁 Pick from My Art Vault ({myVaultEntries.length})
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Right Column: Brass Museum Plaque, Artist Avatar, Signature & Curator Actions -->
                <div class="inspect-plaque-col">
                    {#if inspectedArtwork}
                        <div class="brass-plaque-card">
                            <div class="plaque-screw tl"></div>
                            <div class="plaque-screw tr"></div>
                            <div class="plaque-screw bl"></div>
                            <div class="plaque-screw br"></div>

                            <div class="plaque-wing-tag">
                                SPOT #{selectedSpotNumber} • {inspectedWing.toUpperCase()}
                            </div>
                            <h2 class="plaque-art-title">“{inspectedArtwork.title}”</h2>
                            <div class="plaque-medium-tag">
                                {inspectedArtwork.artType === '3d'
                                    ? `🧱 Isometric 3D Lego Sculpture (${inspectedArtwork.voxels?.length || 0} Bricks)`
                                    : '🎨 2D Original Gallery Canvas'}
                            </div>

                            <div class="plaque-artist-row">
                                <img
                                    src={plaqueAvatarUrl}
                                    alt={inspectedArtwork.artistUsername}
                                    class="plaque-artist-avatar"
                                />
                                <div class="plaque-artist-meta">
                                    <span class="plaque-created-by">EXHIBITED BY</span>
                                    <span class="plaque-artist-name">{inspectedArtwork.artistDisplayName}</span>
                                    <span class="plaque-artist-handle">@{inspectedArtwork.artistUsername}</span>
                                </div>
                            </div>

                            {#if inspectedArtwork.signatureDataUrl}
                                <div class="plaque-signature-box">
                                    <span class="sig-caption">ARTIST SIGNATURE</span>
                                    <img
                                        src={inspectedArtwork.signatureDataUrl}
                                        alt="Artist Signature"
                                        class="plaque-sig-img"
                                    />
                                </div>
                            {/if}
                        </div>

                        <!-- Visitor Appreciation & Tip Buttons -->
                        <div class="plaque-actions-panel win98-inset">
                            <button
                                class="win98-btn applaud-btn"
                                class:liked={inspectedArtwork.likes.includes(cleanMe)}
                                onclick={() => onToggleLike(inspectedArtwork.id)}
                            >
                                ❤️ {inspectedArtwork.likes.includes(cleanMe) ? 'Applauded' : 'Applaud Art'} ({inspectedArtwork
                                    .likes.length})
                            </button>

                            {#if cleanMuseumUsername(inspectedArtwork.artistUsername) !== cleanMe}
                                <button
                                    class="win98-btn tip-artist-btn"
                                    onclick={() => onTipArtist(inspectedArtwork.artistUsername)}
                                >
                                    💸 Tip @{inspectedArtwork.artistUsername} $UWU
                                </button>
                            {/if}

                            <button
                                class="win98-btn"
                                onclick={() => downloadArtworkPng(inspectedArtwork)}
                            >
                                💾 Download PNG
                            </button>
                        </div>

                        <!-- Artist Owner Controls -->
                        {#if cleanMuseumUsername(inspectedArtwork.artistUsername) === cleanMe || isCurator}
                            <div class="owner-curator-box win98-inset">
                                <div class="box-header-label">
                                    {isCurator && cleanMuseumUsername(inspectedArtwork.artistUsername) !== cleanMe
                                        ? '👑 Curator @0xsha3 Pedestal Controls'
                                        : '🎨 Artist Pedestal Controls'}
                                </div>
                                <div class="owner-btns-stack">
                                    {#if cleanMuseumUsername(inspectedArtwork.artistUsername) === cleanMe}
                                        <button
                                            class="win98-btn"
                                            onclick={() => openArtworkInStudio(inspectedArtwork)}
                                        >
                                            ✏️ Edit Artwork in Studio (Free)
                                        </button>
                                    {/if}
                                    <button
                                        class="win98-btn"
                                        onclick={() => {
                                            targetExhibitSpot = selectedSpotNumber;
                                            activeTab = 'vault';
                                        }}
                                    >
                                        🔄 Swap with Art from My Vault
                                    </button>
                                    <button
                                        class="win98-btn warn-btn"
                                        onclick={() => onVacateSpot(selectedSpotNumber)}
                                    >
                                        📁 Vacate Spot #{selectedSpotNumber} (Art Stays Safe in Vault)
                                    </button>
                                </div>
                            </div>
                        {/if}
                    {:else}
                        <div class="brass-plaque-card empty-plaque">
                            <div class="plaque-wing-tag">SPOT #{selectedSpotNumber} • AVAILABLE</div>
                            <h2 class="plaque-art-title">Unclaimed Pedestal</h2>
                            <p class="plaque-empty-desc">
                                All artworks you create are saved permanently in your <strong>📁 My Art Vault</strong>.
                                Claiming an open pedestal costs <strong>{isCurator || myCurrentSpot ? '0' : MUSEUM_GALLERY_FEE} $UWU</strong>
                                {myCurrentSpot ? `(moves from your Spot #${myCurrentSpot} for free)` : ''}.
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- ================================================================ -->
        <!-- TAB 2: 2D & 3D ART STUDIO (ISOLEGO BUILDER + 2D EASEL)           -->
        <!-- ================================================================ -->
        {#if activeTab === 'studio'}
            <div class="museum-tab-body studio-layout">
                <!-- Left Column: Interactive 3D IsoLego Viewport OR 2D Gallery Easel -->
                <div class="studio-canvas-col">
                    <!-- Medium Switcher Bar -->
                    <div class="medium-switcher-bar win98-inset">
                        <button
                            class="win98-btn medium-btn"
                            class:active-medium={artMedium === '3d'}
                            onclick={() => (artMedium = '3d')}
                        >
                            🧱 3D IsoLego Builder ({voxels.length} Bricks)
                        </button>
                        <button
                            class="win98-btn medium-btn"
                            class:active-medium={artMedium === '2d'}
                            onclick={() => (artMedium = '2d')}
                        >
                            🎨 2D Gallery Easel
                        </button>
                    </div>

                    {#if artMedium === '3d'}
                        <!-- 3D IsoLego Interactive Viewport -->
                        <div class="voxel-viewport-wrap win98-inset">
                            <canvas
                                bind:this={voxelCanvas}
                                width="460"
                                height="370"
                                class="voxel-studio-canvas"
                                onmousedown={handleVoxelPointerDown}
                                onmousemove={handleVoxelPointerMove}
                                onmouseup={handleVoxelPointerUp}
                                onmouseleave={() => {
                                    handleVoxelPointerUp();
                                    hoveredHit = null;
                                    ghostPreviewBricks = [];
                                    redrawVoxelStudio();
                                }}
                                ontouchstart={handleVoxelPointerDown}
                                ontouchmove={handleVoxelPointerMove}
                                ontouchend={handleVoxelPointerUp}
                                oncontextmenu={(e) => e.preventDefault()}
                            ></canvas>

                            <div class="viewport-overlay-top">
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => {
                                        voxelRotation = (voxelRotation + 3) % 4;
                                        redrawVoxelStudio();
                                    }}
                                    title="Rotate Baseplate 90° Left"
                                >
                                    ↺ 90°
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => {
                                        voxelRotation = (voxelRotation + 1) % 4;
                                        redrawVoxelStudio();
                                    }}
                                    title="Rotate Baseplate 90° Right"
                                >
                                    ↻ 90°
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => {
                                        voxelZoom = Math.max(0.65, voxelZoom - 0.15);
                                        redrawVoxelStudio();
                                    }}
                                >
                                    🔍-
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => {
                                        voxelZoom = 1.08;
                                        voxelPanX = 0;
                                        voxelPanY = 14;
                                        redrawVoxelStudio();
                                    }}
                                >
                                    Reset View
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => {
                                        voxelZoom = Math.min(2.4, voxelZoom + 0.15);
                                        redrawVoxelStudio();
                                    }}
                                >
                                    🔍+
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    disabled={voxelUndoStack.length === 0}
                                    onclick={undoVoxel}
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    disabled={voxelRedoStack.length === 0}
                                    onclick={redoVoxel}
                                >
                                    ↪ Redo
                                </button>
                                <button class="win98-btn mini-btn warn-btn" onclick={clearVoxelBaseplate}>
                                    🗑️ Clear
                                </button>
                            </div>

                            <div class="viewport-hint-bar">
                                💡 <strong>Click/Drag</strong> any stud or brick face to stack • <strong>Right-Click</strong> to erase • <strong>Shift+Drag</strong> to pan • <strong>R</strong> to rotate Lego piece
                            </div>
                        </div>
                    {:else}
                        <!-- 2D Gallery Easel Interactive Viewport -->
                        <div class="easel-viewport-wrap win98-inset frame-{frameStyle}">
                            <div
                                class="easel-zoom-stage"
                                style="transform: scale({easelZoom}) translate({easelPanX}px, {easelPanY}px);"
                            >
                                <canvas
                                    bind:this={easelCanvas}
                                    width="440"
                                    height="350"
                                    class="easel-studio-canvas"
                                    onmousedown={handleEaselPointerDown}
                                    onmousemove={handleEaselPointerMove}
                                    onmouseup={handleEaselPointerUp}
                                    onmouseleave={handleEaselPointerUp}
                                    ontouchstart={handleEaselPointerDown}
                                    ontouchmove={handleEaselPointerMove}
                                    ontouchend={handleEaselPointerUp}
                                ></canvas>
                            </div>

                            <div class="viewport-overlay-top">
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => (easelZoom = Math.max(1, easelZoom - 0.5))}
                                >
                                    🔍-
                                </button>
                                <span class="zoom-readout">{Math.round(easelZoom * 100)}%</span>
                                <button
                                    class="win98-btn mini-btn"
                                    onclick={() => (easelZoom = Math.min(3.5, easelZoom + 0.5))}
                                >
                                    🔍+
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    disabled={easelUndoStack.length <= 1}
                                    onclick={undoEasel}
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    class="win98-btn mini-btn"
                                    disabled={easelRedoStack.length === 0}
                                    onclick={redoEasel}
                                >
                                    ↪ Redo
                                </button>
                                <button class="win98-btn mini-btn warn-btn" onclick={clearEaselCanvas}>
                                    🗑️ Clear
                                </button>
                            </div>
                        </div>
                    {/if}

                    <!-- Bottom Attribution & Signature Row -->
                    <div class="studio-attribution-bar win98-inset">
                        <div class="attr-left-col">
                            <label class="studio-label">
                                Artwork Title:
                                <input
                                    type="text"
                                    class="win98-input title-input"
                                    maxlength="44"
                                    bind:value={artTitle}
                                    placeholder="Name your creation..."
                                />
                            </label>

                            <div class="publish-spot-row">
                                <span class="studio-label">Target Spot:</span>
                                <select class="win98-select compact-select" bind:value={targetExhibitSpot}>
                                    {#each MUSEUM_PEDESTAL_LOCATIONS as loc}
                                        {@const occ = museumState.spots[loc.spotNumber]}
                                        <option
                                            value={loc.spotNumber}
                                            disabled={Boolean(
                                                occ &&
                                                    cleanMuseumUsername(occ.artistUsername) !== cleanMe &&
                                                    !isCurator
                                            )}
                                        >
                                            Spot #{loc.spotNumber} — {occ
                                                ? cleanMuseumUsername(occ.artistUsername) === cleanMe
                                                    ? '★ Your Spot'
                                                    : `@${occ.artistUsername}`
                                                : '🟢 Open'}
                                        </option>
                                    {/each}
                                </select>
                            </div>
                        </div>

                        <!-- Optional Hand-Drawn Signature Pad -->
                        <div class="attr-sig-col">
                            <div class="sig-header-row">
                                <span>✍️ Optional Artist Signature:</span>
                                <div class="sig-mini-btns">
                                    <button
                                        class="win98-btn tiny-btn"
                                        onclick={generateAutoCalligraphySignature}
                                        title="Auto-generate calligraphic signature"
                                    >
                                        ✒️ Auto
                                    </button>
                                    <button class="win98-btn tiny-btn" onclick={clearSignaturePad}>
                                        Clear
                                    </button>
                                </div>
                            </div>
                            <canvas
                                bind:this={sigCanvas}
                                width="210"
                                height="52"
                                class="signature-pad-canvas"
                                onmousedown={handleSigPointerDown}
                                onmousemove={handleSigPointerMove}
                                onmouseup={handleSigPointerUp}
                                onmouseleave={handleSigPointerUp}
                                ontouchstart={handleSigPointerDown}
                                ontouchmove={handleSigPointerMove}
                                ontouchend={handleSigPointerUp}
                            ></canvas>
                        </div>
                    </div>

                    <!-- Save to Vault / Exhibit / Submit to Curator Queue Buttons -->
                    <div class="studio-publish-footer">
                        <button
                            class="win98-btn save-vault-btn"
                            disabled={isBusy}
                            onclick={handleSaveToPersonalVaultClick}
                        >
                            💾 Save to My Art Vault (Free)
                        </button>

                        {#if firstOpenSpot !== null || myCurrentSpot !== null || isCurator}
                            <button
                                class="win98-btn primary-gold-btn"
                                disabled={isBusy}
                                onclick={handleExhibitFromStudioClick}
                            >
                                🏛️ Exhibit on Spot #{targetExhibitSpot} ({isCurator || myCurrentSpot
                                    ? 'Free'
                                    : `${MUSEUM_GALLERY_FEE} $UWU`})
                            </button>
                        {/if}

                        <button
                            class="win98-btn submit-queue-btn"
                            disabled={isBusy}
                            onclick={handleSubmitToCuratorQueueClick}
                        >
                            📨 Submit to Curator Queue
                        </button>
                    </div>
                </div>

                <!-- Right Column: Toolbars for 3D IsoLego OR 2D Easel (Overflow-X Locked!) -->
                <div class="studio-tools-col win98-inset">
                    {#if artMedium === '3d'}
                        <!-- 1. 8 Starter 3D Blueprints -->
                        <div class="tool-section">
                            <div class="section-heading">🎁 1-Click 3D Starter Blueprints</div>
                            <div class="blueprint-grid">
                                {#each STARTER_3D_BLUEPRINTS as bp}
                                    <button
                                        class="win98-btn bp-btn"
                                        onclick={() => loadStarterBlueprint(bp.id)}
                                        title={bp.description}
                                    >
                                        <span>{bp.icon}</span>
                                        <span>{bp.name}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- 2. Lego Brick Piece Selector -->
                        <div class="tool-section">
                            <div class="section-heading-row">
                                <span class="section-heading">🧱 Lego Brick Piece</span>
                                <button
                                    class="win98-btn tiny-btn"
                                    onclick={rotateLegoPieceOrientation}
                                    title="Shortcut: Press R"
                                >
                                    ↻ Rotate ({pieceOrientation * 90}°)
                                </button>
                            </div>
                            <div class="tools-grid-3">
                                {#each [
                                    { id: '1x1', label: '1×1 Stud' },
                                    { id: '1x2', label: '1×2 Brick' },
                                    { id: '2x2', label: '2×2 Brick' },
                                    { id: '2x4', label: '2×4 Brick' },
                                    { id: 'slope', label: '📐 Slope' },
                                    { id: 'cylinder', label: '🛢️ Pillar' }
                                ] as piece}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={legoPiece === piece.id &&
                                            (voxelTool === 'place' || voxelTool === 'extrude')}
                                        onclick={() => {
                                            legoPiece = piece.id as LegoPieceType;
                                            if (voxelTool !== 'place' && voxelTool !== 'extrude') {
                                                voxelTool = 'place';
                                            }
                                        }}
                                    >
                                        {piece.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- 3. 3D Sculpting & Stamp Tools -->
                        <div class="tool-section">
                            <div class="section-heading">🛠️ 3D Build & Stamp Tools</div>
                            <div class="tools-grid-2">
                                {#each [
                                    { id: 'place', label: '🧱 Stack Brick' },
                                    { id: 'extrude', label: '📏 3-Tall Column' },
                                    { id: 'sphere', label: '⚪ 3D Sphere' },
                                    { id: 'pyramid', label: '🔺 3D Pyramid' },
                                    { id: 'dome', label: '🏛️ 3D Dome' },
                                    { id: 'heart', label: '❤️ 3D Heart' },
                                    { id: 'paint', label: '🪣 Paint Brick' },
                                    { id: 'erase', label: '🧽 Chisel / Erase' }
                                ] as t}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={voxelTool === t.id}
                                        onclick={() => (voxelTool = t.id as VoxelToolId)}
                                    >
                                        {t.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- 4. 5 Surface Materials -->
                        <div class="tool-section">
                            <div class="section-heading">✨ Brick Material</div>
                            <div class="tools-grid-3">
                                {#each [
                                    { id: 'lego', label: '🧱 Lego ABS' },
                                    { id: 'smooth', label: '🟦 Smooth' },
                                    { id: 'neon', label: '✨ Neon Glow' },
                                    { id: 'glass', label: '🧊 Glass' },
                                    { id: 'gold', label: '🪙 Metallic' }
                                ] as mat}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={brickMaterial === mat.id}
                                        onclick={() => (brickMaterial = mat.id as BrickMaterial)}
                                    >
                                        {mat.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <!-- 5. 24-Color Palette + Custom Picker -->
                        <div class="tool-section">
                            <div class="section-heading">🎨 Brick Color</div>
                            <div class="palette-grid">
                                {#each STUDIO_PALETTE_24 as c}
                                    <button
                                        class="color-swatch"
                                        class:active-swatch={brickColor.toLowerCase() === c.toLowerCase()}
                                        style="background: {c};"
                                        onclick={() => (brickColor = c)}
                                        aria-label={c}
                                    ></button>
                                {/each}
                                <input
                                    type="color"
                                    class="custom-color-input"
                                    bind:value={brickColor}
                                    title="Custom Color"
                                />
                            </div>
                        </div>

                        <!-- 6. 3D Mirror Symmetry & Height Slicer -->
                        <div class="tool-section">
                            <div class="section-heading">🪞 Live 3D Mirror Symmetry</div>
                            <div class="tools-grid-4">
                                {#each [
                                    { id: 'none', label: 'Off' },
                                    { id: 'x', label: '↔ X' },
                                    { id: 'y', label: '↕ Y' },
                                    { id: 'quad', label: '✥ 4-Way' }
                                ] as sym}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={voxelSymmetry === sym.id}
                                        onclick={() =>
                                            (voxelSymmetry = sym.id as 'none' | 'x' | 'y' | 'quad')}
                                    >
                                        {sym.label}
                                    </button>
                                {/each}
                            </div>

                            <div class="stacked-sliders">
                                {#if ['sphere', 'pyramid', 'dome', 'heart'].includes(voxelTool)}
                                    <div class="slider-row">
                                        <span>Stamp Size: {stampRadius}</span>
                                        <input
                                            type="range"
                                            min="1"
                                            max="5"
                                            bind:value={stampRadius}
                                        />
                                    </div>
                                {/if}

                                <div class="slice-toggle-row">
                                    <label class="checkbox-label">
                                        <input
                                            type="checkbox"
                                            bind:checked={useSliceZ}
                                            onchange={redrawVoxelStudio}
                                        />
                                        Lock Height Layer (Z-Slice)
                                    </label>
                                    {#if useSliceZ}
                                        <span class="slice-badge">Floor Z: {sliceZLevel}</span>
                                    {/if}
                                </div>
                                {#if useSliceZ}
                                    <div class="slider-row">
                                        <span>Z-Level ({sliceZLevel})</span>
                                        <input
                                            type="range"
                                            min="0"
                                            max="15"
                                            bind:value={sliceZLevel}
                                            oninput={redrawVoxelStudio}
                                        />
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <!-- 2D GALLERY EASEL TOOLS -->
                        <div class="tool-section">
                            <div class="section-heading">🖌️ 2D Gallery Brushes & Tools</div>
                            <div class="tools-grid-3">
                                {#each [
                                    { id: 'pen', label: '🖋️ Ink Pen' },
                                    { id: 'pencil', label: '✏️ Pencil' },
                                    { id: 'marker', label: '🖌️ Marker' },
                                    { id: 'airbrush', label: '🎨 Airbrush' },
                                    { id: 'neon', label: '✨ Neon' },
                                    { id: 'pixel', label: '👾 Pixel' },
                                    { id: 'rainbow', label: '🌈 Rainbow' },
                                    { id: 'sparkle', label: '✦ Sparkle' },
                                    { id: 'line', label: '📏 Line' },
                                    { id: 'rect', label: '▭ Box' },
                                    { id: 'circle', label: '◯ Circle' },
                                    { id: 'fill', label: '🪣 Fill' },
                                    { id: 'eyedropper', label: '🧪 Pick' },
                                    { id: 'eraser', label: '🧽 Eraser' }
                                ] as t}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={easelTool === t.id}
                                        onclick={() => (easelTool = t.id as EaselToolId)}
                                    >
                                        {t.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="tool-section">
                            <div class="section-heading">🎨 Paint Color</div>
                            <div class="palette-grid">
                                {#each STUDIO_PALETTE_24 as c}
                                    <button
                                        class="color-swatch"
                                        class:active-swatch={easelColor.toLowerCase() === c.toLowerCase()}
                                        style="background: {c};"
                                        onclick={() => (easelColor = c)}
                                        aria-label={c}
                                    ></button>
                                {/each}
                                <input type="color" class="custom-color-input" bind:value={easelColor} />
                            </div>
                        </div>

                        <div class="tool-section">
                            <div class="section-heading">⚙️ Brush Dynamics</div>
                            <div class="stacked-sliders">
                                <div class="slider-row">
                                    <span>Size: {easelSize}px</span>
                                    <input type="range" min="1" max="44" bind:value={easelSize} />
                                </div>
                                <div class="slider-row">
                                    <span>Opacity: {easelOpacity}%</span>
                                    <input type="range" min="10" max="100" bind:value={easelOpacity} />
                                </div>
                                <div class="slider-row">
                                    <span>Smooth: {easelSmoothing}%</span>
                                    <input type="range" min="0" max="90" bind:value={easelSmoothing} />
                                </div>
                            </div>
                        </div>

                        <div class="tool-section">
                            <div class="section-heading">🪞 Mirror Symmetry</div>
                            <div class="tools-grid-4">
                                {#each [
                                    { id: 'none', label: 'Off' },
                                    { id: 'x', label: '↔ X' },
                                    { id: 'y', label: '↕ Y' },
                                    { id: 'quad', label: '✥ 4-Way' }
                                ] as sym}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={easelSymmetry === sym.id}
                                        onclick={() =>
                                            (easelSymmetry = sym.id as 'none' | 'x' | 'y' | 'quad')}
                                    >
                                        {sym.label}
                                    </button>
                                {/each}
                            </div>
                        </div>

                        <div class="tool-section">
                            <div class="section-heading">🖼️ Museum Frame Style</div>
                            <div class="tools-grid-2">
                                {#each [
                                    { id: 'gold', label: '🖼️ Louvre Gold' },
                                    { id: 'obsidian', label: '🖤 Obsidian MoMA' },
                                    { id: 'neon', label: '⚡ Cyber Neon' },
                                    { id: 'frameless', label: '🪟 Frameless' }
                                ] as fr}
                                    <button
                                        class="win98-btn tool-chip"
                                        class:selected={frameStyle === fr.id}
                                        onclick={() => (frameStyle = fr.id as FrameStyle)}
                                    >
                                        {fr.label}
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- ================================================================ -->
        <!-- TAB 3: PERSONAL ART VAULT (PERMANENT INVENTORY)                  -->
        <!-- ================================================================ -->
        {#if activeTab === 'vault'}
            <div class="museum-tab-body vault-layout">
                <div class="vault-banner win98-inset">
                    <div>
                        <strong>📁 Your Personal Art Vault ({myVaultEntries.length} Creations)</strong>
                        <p>
                            Every 2D painting and 3D IsoLego sculpture you create is stored here permanently.
                            Even if an artwork is rotated off a Museum pedestal, you never lose it!
                        </p>
                    </div>
                    <div class="vault-banner-btns">
                        <button
                            class="win98-btn primary-gold-btn"
                            onclick={() => startNewArtworkForSpot(firstOpenSpot || 1, '3d')}
                        >
                            + New 3D IsoLego
                        </button>
                        <button
                            class="win98-btn primary-cyan-btn"
                            onclick={() => startNewArtworkForSpot(firstOpenSpot || 1, '2d')}
                        >
                            + New 2D Painting
                        </button>
                    </div>
                </div>

                {#if myVaultEntries.length === 0}
                    <div class="empty-vault-state win98-inset">
                        <div class="empty-pedestal-icon">🎨🧱</div>
                        <h3>Your Personal Art Vault is Empty</h3>
                        <p>Open the <strong>2D & 3D Art Studio</strong> to create your first piece!</p>
                        <button
                            class="win98-btn primary-gold-btn"
                            onclick={() => (activeTab = 'studio')}
                        >
                            🎨 Launch Art Studio
                        </button>
                    </div>
                {:else}
                    <div class="vault-cards-grid">
                        {#each myVaultEntries as entry (entry.artwork.id)}
                            {@const art = entry.artwork}
                            <div class="vault-art-card win98-inset">
                                <div class="vault-card-thumb">
                                    <img src={art.imageDataUrl} alt={art.title} />
                                    <span class="vault-type-pill">
                                        {art.artType === '3d' ? '🧱 3D IsoLego' : '🎨 2D Canvas'}
                                    </span>
                                    {#if entry.activeSpotNumber}
                                        <span class="vault-status-pill exhibited">
                                            🏛️ On Spot #{entry.activeSpotNumber}
                                        </span>
                                    {:else if entry.inPendingQueue}
                                        <span class="vault-status-pill queued">
                                            ⏳ In Curator Queue
                                        </span>
                                    {:else}
                                        <span class="vault-status-pill stored">📁 In Personal Vault</span>
                                    {/if}
                                </div>

                                <div class="vault-card-info">
                                    <div class="vault-card-title">{art.title}</div>
                                    <div class="vault-card-sub">
                                        ❤️ {art.likes.length} Applauds • {new Date(art.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>

                                <div class="vault-card-actions">
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => openArtworkInStudio(art)}
                                    >
                                        ✏️ Edit
                                    </button>

                                    {#if entry.activeSpotNumber}
                                        <button
                                            class="win98-btn mini-btn"
                                            onclick={() => {
                                                selectedSpotNumber = entry.activeSpotNumber!;
                                                activeTab = 'inspect';
                                            }}
                                        >
                                            🔍 View Spot #{entry.activeSpotNumber}
                                        </button>
                                    {:else if firstOpenSpot !== null || myCurrentSpot !== null || isCurator}
                                        <button
                                            class="win98-btn mini-btn primary-gold-btn"
                                            onclick={() =>
                                                onExhibitOnSpot(
                                                    art,
                                                    targetExhibitSpot || myCurrentSpot || firstOpenSpot || 1
                                                )}
                                        >
                                            🏛️ Display on Spot #{targetExhibitSpot || myCurrentSpot || firstOpenSpot || 1}
                                        </button>
                                    {/if}

                                    {#if !entry.activeSpotNumber && !entry.inPendingQueue}
                                        <button
                                            class="win98-btn mini-btn"
                                            onclick={() => onSubmitToQueue(art)}
                                        >
                                            📨 Submit to Queue
                                        </button>
                                    {/if}

                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => downloadArtworkPng(art)}
                                    >
                                        💾 PNG
                                    </button>
                                    <button
                                        class="win98-btn mini-btn warn-btn"
                                        onclick={() => onDeleteFromVault(art.id)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}

        <!-- ================================================================ -->
        <!-- TAB 4: UNDECIDED SUBMISSIONS QUEUE & @0xsha3 CURATOR DESK        -->
        <!-- ================================================================ -->
        {#if activeTab === 'queue'}
            <div class="museum-tab-body vault-layout">
                <div class="vault-banner win98-inset">
                    <div>
                        <strong>
                            ⏳ Undecided Submissions Area & Curator Desk ({museumState.pendingQueue.length} Pending)
                        </strong>
                        <p>
                            {#if isCurator}
                                👑 <strong>Welcome Curator @0xsha3!</strong> Approve any submitted artwork below and
                                assign it to any of the 25 Museum spots (if a spot is occupied, the previous artist's
                                work stays safely in their Personal Art Vault).
                            {:else}
                                Artworks submitted when pedestals are full or awaiting curation appear here. Curator
                                <strong>@0xsha3</strong> reviews and exhibits selections onto the 25 Museum pedestals!
                            {/if}
                        </p>
                    </div>
                </div>

                {#if museumState.pendingQueue.length === 0}
                    <div class="empty-vault-state win98-inset">
                        <div class="empty-pedestal-icon">⏳🏛️</div>
                        <h3>No Artworks Waiting in the Undecided Queue</h3>
                        <p>
                            Submit an artwork from the <strong>Art Studio</strong> or your
                            <strong>📁 Personal Art Vault</strong> to propose it for curation!
                        </p>
                    </div>
                {:else}
                    <div class="vault-cards-grid">
                        {#each museumState.pendingQueue as qArt (qArt.id)}
                            <div class="vault-art-card win98-inset">
                                <div class="vault-card-thumb">
                                    <img src={qArt.imageDataUrl} alt={qArt.title} />
                                    <span class="vault-type-pill">
                                        {qArt.artType === '3d' ? '🧱 3D IsoLego' : '🎨 2D Canvas'}
                                    </span>
                                    <span class="vault-status-pill queued">⏳ Awaiting Curation</span>
                                </div>

                                <div class="vault-card-info">
                                    <div class="vault-card-title">“{qArt.title}”</div>
                                    <div class="vault-card-sub">
                                        by <strong>@{qArt.artistUsername}</strong> • ❤️ {qArt.likes.length}
                                    </div>
                                </div>

                                <div class="vault-card-actions">
                                    <button
                                        class="win98-btn mini-btn"
                                        onclick={() => onToggleLike(qArt.id)}
                                    >
                                        ❤️ Applaud ({qArt.likes.length})
                                    </button>

                                    {#if cleanMuseumUsername(qArt.artistUsername) !== cleanMe}
                                        <button
                                            class="win98-btn mini-btn"
                                            onclick={() => onTipArtist(qArt.artistUsername)}
                                        >
                                            💸 Tip
                                        </button>
                                    {/if}

                                    {#if isCurator}
                                        <div class="curator-approve-row">
                                            <select
                                                class="win98-select compact-select"
                                                value={getCuratorTargetSpot(qArt.id)}
                                                onchange={(e) => {
                                                    curatorSpotTargets = {
                                                        ...curatorSpotTargets,
                                                        [qArt.id]: Number((e.currentTarget as HTMLSelectElement).value)
                                                    };
                                                }}
                                            >
                                                {#each MUSEUM_PEDESTAL_LOCATIONS as loc}
                                                    {@const occ = museumState.spots[loc.spotNumber]}
                                                    <option value={loc.spotNumber}>
                                                        Spot #{loc.spotNumber} ({occ ? `@${occ.artistUsername}` : 'Open'})
                                                    </option>
                                                {/each}
                                            </select>
                                            <button
                                                class="win98-btn mini-btn primary-gold-btn"
                                                onclick={() =>
                                                    onCuratorApproveToSpot(
                                                        qArt.id,
                                                        getCuratorTargetSpot(qArt.id)
                                                    )}
                                            >
                                                👑 Place on Spot #{getCuratorTargetSpot(qArt.id)}
                                            </button>
                                        </div>
                                    {/if}

                                    {#if isCurator || cleanMuseumUsername(qArt.artistUsername) === cleanMe}
                                        <button
                                            class="win98-btn mini-btn warn-btn"
                                            onclick={() => onRemoveFromQueue(qArt.id)}
                                        >
                                            ↩️ Return to Vault
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .museum-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(5, 5, 16, 0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 3200;
        padding: 12px;
    }

    .museum-window {
        width: min(940px, 97vw);
        max-height: 92vh;
        background: #c0c0c0;
        border-top: 2px solid #ffffff;
        border-left: 2px solid #ffffff;
        border-right: 2px solid #404040;
        border-bottom: 2px solid #404040;
        box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.65);
        display: flex;
        flex-direction: column;
        font-family: 'MS Sans Serif', Tahoma, Geneva, sans-serif;
        color: #111111;
        overflow: hidden;
    }

    .win98-title-bar {
        background: linear-gradient(90deg, #000080, #1084d0);
        color: #ffffff;
        padding: 4px 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: bold;
        font-size: 12px;
    }

    .title-left {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .curator-crown-badge {
        background: #ffd700;
        color: #000000;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: bold;
        border: 1px solid #000000;
    }

    .win98-close-btn {
        background: #c0c0c0;
        border-top: 1.5px solid #ffffff;
        border-left: 1.5px solid #ffffff;
        border-right: 1.5px solid #404040;
        border-bottom: 1.5px solid #404040;
        width: 20px;
        height: 18px;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .museum-tabs-bar {
        display: flex;
        gap: 4px;
        padding: 6px 8px 0 8px;
        background: #c0c0c0;
        border-bottom: 2px solid #808080;
        flex-wrap: wrap;
    }

    .win98-tab-btn {
        background: #b8b8b8;
        border-top: 2px solid #ffffff;
        border-left: 2px solid #ffffff;
        border-right: 2px solid #404040;
        border-bottom: none;
        padding: 5px 12px;
        font-size: 11px;
        font-weight: bold;
        cursor: pointer;
        color: #222222;
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .win98-tab-btn.active {
        background: #dcdcdc;
        color: #000080;
        transform: translateY(1px);
    }

    .queue-alert-dot {
        background: #ff0055;
        color: #ffffff;
        border-radius: 50%;
        width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 9px;
    }

    .museum-status-toast {
        background: #000080;
        color: #ffd700;
        padding: 5px 10px;
        font-size: 11px;
        font-weight: bold;
        text-align: center;
        border-bottom: 1px solid #ffffff;
    }

    .museum-tab-body {
        padding: 10px;
        overflow-y: auto;
        overflow-x: hidden;
        flex: 1;
        min-height: 0;
    }

    .win98-inset {
        background: #d4d0c8;
        border-top: 2px solid #808080;
        border-left: 2px solid #808080;
        border-right: 2px solid #ffffff;
        border-bottom: 2px solid #ffffff;
    }

    .win98-btn {
        background: #c0c0c0;
        border-top: 2px solid #ffffff;
        border-left: 2px solid #ffffff;
        border-right: 2px solid #404040;
        border-bottom: 2px solid #404040;
        padding: 4px 9px;
        font-size: 11px;
        font-weight: bold;
        color: #111111;
        cursor: pointer;
    }

    .win98-btn:active:not(:disabled) {
        border-top: 2px solid #404040;
        border-left: 2px solid #404040;
        border-right: 2px solid #ffffff;
        border-bottom: 2px solid #ffffff;
    }

    .win98-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .mini-btn {
        padding: 3px 7px;
        font-size: 10px;
    }

    .tiny-btn {
        padding: 2px 5px;
        font-size: 9.5px;
    }

    .primary-gold-btn {
        background: #ffd700;
        color: #000000;
    }

    .primary-cyan-btn {
        background: #00e5ff;
        color: #000000;
    }

    .warn-btn {
        background: #fca5a5;
        color: #7f1d1d;
    }

    .win98-select,
    .win98-input {
        background: #ffffff;
        border-top: 2px solid #808080;
        border-left: 2px solid #808080;
        border-right: 2px solid #ffffff;
        border-bottom: 2px solid #ffffff;
        padding: 3px 6px;
        font-size: 11px;
        color: #111111;
    }

    /* INSPECTOR LAYOUT */
    .inspect-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.9fr);
        gap: 10px;
    }

    .inspect-viewport-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .spot-switcher-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px;
    }

    .spot-select {
        flex: 1;
        min-width: 0;
        font-weight: bold;
    }

    .artwork-showcase-box {
        position: relative;
        background: #0d1021;
        min-height: 360px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 10px;
    }

    .artwork-showcase-box.frame-gold {
        border: 6px ridge #ffd700;
        box-shadow: inset 0 0 18px rgba(255, 215, 0, 0.28);
    }

    .artwork-showcase-box.frame-obsidian {
        border: 6px solid #1e293b;
    }

    .artwork-showcase-box.frame-neon {
        border: 4px solid #00ffff;
        box-shadow: inset 0 0 16px rgba(0, 255, 255, 0.35);
    }

    .inspect-3d-canvas {
        width: 100%;
        max-width: 420px;
        height: auto;
        display: block;
    }

    .inspect-2d-img {
        max-width: 100%;
        max-height: 350px;
        object-fit: contain;
        image-rendering: auto;
    }

    .turntable-toolbar {
        display: flex;
        gap: 5px;
        margin-top: 6px;
        flex-wrap: wrap;
        justify-content: center;
    }

    .active-toggle {
        background: #000080;
        color: #ffffff;
    }

    .empty-pedestal-box {
        min-height: 350px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 20px;
        background: #141829;
        color: #f8fafc;
        gap: 10px;
    }

    .empty-pedestal-icon {
        font-size: 38px;
    }

    .empty-pedestal-sub {
        max-width: 360px;
        font-size: 12px;
        color: #cbd5e1;
        line-height: 1.4;
    }

    .empty-pedestal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin-top: 6px;
    }

    /* BRASS PLAQUE */
    .inspect-plaque-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .brass-plaque-card {
        position: relative;
        background: linear-gradient(145deg, #3b2d13 0%, #241a08 55%, #171004 100%);
        border: 3px ridge #d4af37;
        padding: 14px;
        color: #fef3c7;
        box-shadow: inset 0 0 15px rgba(212, 175, 55, 0.25);
    }

    .plaque-screw {
        position: absolute;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #eab308;
        border: 1px solid #713f12;
    }
    .plaque-screw.tl { top: 5px; left: 5px; }
    .plaque-screw.tr { top: 5px; right: 5px; }
    .plaque-screw.bl { bottom: 5px; left: 5px; }
    .plaque-screw.br { bottom: 5px; right: 5px; }

    .plaque-wing-tag {
        font-size: 10px;
        font-weight: bold;
        color: #facc15;
        letter-spacing: 0.6px;
    }

    .plaque-art-title {
        margin: 4px 0;
        font-size: 17px;
        color: #ffffff;
        font-family: Georgia, serif;
    }

    .plaque-medium-tag {
        font-size: 11px;
        color: #fde68a;
        margin-bottom: 10px;
    }

    .plaque-artist-row {
        display: flex;
        align-items: center;
        gap: 10px;
        background: rgba(0, 0, 0, 0.38);
        border: 1px solid rgba(250, 204, 21, 0.4);
        padding: 8px;
    }

    .plaque-artist-avatar {
        width: 52px;
        height: 52px;
        object-fit: contain;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7));
    }

    .plaque-artist-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
    }

    .plaque-created-by {
        font-size: 9px;
        color: #eab308;
        letter-spacing: 0.5px;
    }

    .plaque-artist-name {
        font-size: 13px;
        font-weight: bold;
        color: #ffffff;
    }

    .plaque-artist-handle {
        font-size: 11px;
        color: #38bdf8;
    }

    .plaque-signature-box {
        margin-top: 10px;
        padding-top: 6px;
        border-top: 1px dashed rgba(250, 204, 21, 0.35);
        display: flex;
        flex-direction: column;
        align-items: center;
    }

    .sig-caption {
        font-size: 8.5px;
        color: #fde047;
        letter-spacing: 1px;
    }

    .plaque-sig-img {
        max-width: 190px;
        height: 44px;
        object-fit: contain;
    }

    .plaque-actions-panel {
        padding: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .applaud-btn.liked {
        background: #ff0055;
        color: #ffffff;
    }

    .tip-artist-btn {
        background: #00ff88;
        color: #052e16;
    }

    .owner-curator-box {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .box-header-label {
        font-size: 10.5px;
        font-weight: bold;
        color: #000080;
    }

    .owner-btns-stack {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    /* STUDIO LAYOUT */
    .studio-layout {
        display: grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(270px, 0.85fr);
        gap: 10px;
    }

    .studio-canvas-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    }

    .medium-switcher-bar {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 4px;
    }

    .medium-btn {
        padding: 6px;
        font-size: 11.5px;
    }

    .medium-btn.active-medium {
        background: #000080;
        color: #ffd700;
    }

    .voxel-viewport-wrap,
    .easel-viewport-wrap {
        position: relative;
        background: #101426;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 360px;
    }

    .voxel-studio-canvas {
        width: 100%;
        max-width: 460px;
        height: auto;
        cursor: crosshair;
        display: block;
    }

    .easel-zoom-stage {
        transform-origin: center center;
    }

    .easel-studio-canvas {
        display: block;
        cursor: crosshair;
        background: #111827;
    }

    .viewport-overlay-top {
        position: absolute;
        top: 6px;
        left: 6px;
        right: 6px;
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: center;
        pointer-events: auto;
    }

    .zoom-readout {
        background: #000000;
        color: #00ffff;
        font-size: 10px;
        padding: 2px 6px;
        font-family: monospace;
    }

    .viewport-hint-bar {
        width: 100%;
        background: rgba(0, 0, 0, 0.82);
        color: #e2e8f0;
        font-size: 10px;
        padding: 4px 8px;
        text-align: center;
    }

    .studio-attribution-bar {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 6px 8px;
        align-items: center;
    }

    .attr-left-col {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
    }

    .studio-label {
        font-size: 10.5px;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .title-input {
        flex: 1;
        min-width: 0;
    }

    .publish-spot-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .compact-select {
        flex: 1;
        min-width: 0;
    }

    .attr-sig-col {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .sig-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 9.5px;
        font-weight: bold;
        gap: 4px;
    }

    .sig-mini-btns {
        display: flex;
        gap: 3px;
    }

    .signature-pad-canvas {
        background: #181826;
        border: 1px solid #ffd700;
        cursor: crosshair;
    }

    .studio-publish-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .save-vault-btn {
        background: #dbeafe;
        color: #1e3a8a;
    }

    .submit-queue-btn {
        background: #f3e8ff;
        color: #581c87;
    }

    /* RIGHT TOOLS PANEL (STRICT OVERFLOW-X HIDDEN) */
    .studio-tools-col {
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
        overflow-x: hidden;
        min-width: 0;
        max-height: 510px;
    }

    .tool-section {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-bottom: 6px;
        border-bottom: 1px solid #9ca3af;
        min-width: 0;
    }

    .section-heading-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
    }

    .section-heading {
        font-size: 10.5px;
        font-weight: bold;
        color: #000080;
    }

    .blueprint-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px;
    }

    .bp-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        padding: 3px 5px;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .tools-grid-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px;
    }

    .tools-grid-3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
    }

    .tools-grid-4 {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 4px;
    }

    .tool-chip {
        font-size: 10px;
        padding: 4px 4px;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .tool-chip.selected {
        background: #000080;
        color: #ffffff;
    }

    .palette-grid {
        display: grid;
        grid-template-columns: repeat(8, minmax(0, 1fr));
        gap: 3px;
        align-items: center;
    }

    .color-swatch {
        width: 100%;
        aspect-ratio: 1;
        border: 1.5px solid #333333;
        cursor: pointer;
    }

    .color-swatch.active-swatch {
        border: 2px solid #ffffff;
        outline: 2px solid #000080;
    }

    .custom-color-input {
        width: 100%;
        height: 22px;
        padding: 0;
        border: none;
        cursor: pointer;
    }

    .stacked-sliders {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        min-width: 0;
    }

    .slider-row {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr);
        align-items: center;
        gap: 6px;
        font-size: 10px;
        font-weight: bold;
        width: 100%;
        min-width: 0;
    }

    .slider-row input[type='range'] {
        width: 100%;
        min-width: 0;
        margin: 0;
    }

    .slice-toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        font-weight: bold;
        margin-top: 3px;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
    }

    .slice-badge {
        background: #000080;
        color: #00ffff;
        padding: 1px 5px;
        font-size: 9.5px;
    }

    /* VAULT & QUEUE LAYOUT */
    .vault-layout {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .vault-banner {
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
    }

    .vault-banner p {
        margin: 2px 0 0 0;
        font-size: 11px;
        color: #333333;
    }

    .vault-banner-btns {
        display: flex;
        gap: 6px;
    }

    .empty-vault-state {
        min-height: 260px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-align: center;
        padding: 20px;
    }

    .vault-cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 10px;
    }

    .vault-art-card {
        display: flex;
        flex-direction: column;
        padding: 6px;
        gap: 6px;
        background: #dcdcdc;
    }

    .vault-card-thumb {
        position: relative;
        height: 150px;
        background: #101426;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }

    .vault-card-thumb img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }

    .vault-type-pill {
        position: absolute;
        top: 4px;
        left: 4px;
        background: rgba(0, 0, 0, 0.78);
        color: #ffffff;
        font-size: 9px;
        padding: 2px 5px;
        font-weight: bold;
    }

    .vault-status-pill {
        position: absolute;
        bottom: 4px;
        right: 4px;
        font-size: 9px;
        padding: 2px 5px;
        font-weight: bold;
    }
    .vault-status-pill.exhibited {
        background: #ffd700;
        color: #000000;
    }
    .vault-status-pill.queued {
        background: #a855f7;
        color: #ffffff;
    }
    .vault-status-pill.stored {
        background: #1e293b;
        color: #cbd5e1;
    }

    .vault-card-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .vault-card-title {
        font-weight: bold;
        font-size: 12px;
        color: #000080;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .vault-card-sub {
        font-size: 10px;
        color: #444444;
    }

    .vault-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: auto;
    }

    .curator-approve-row {
        display: flex;
        gap: 4px;
        width: 100%;
        margin-top: 2px;
    }

    @media (max-width: 780px) {
        .inspect-layout,
        .studio-layout {
            grid-template-columns: 1fr;
        }
        .studio-attribution-bar {
            grid-template-columns: 1fr;
        }
    }
</style>
