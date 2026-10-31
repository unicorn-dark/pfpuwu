// src/lib/game/isometric/isoAssetLoader.ts
/**
 * Pre-rendered 2:1 Isometric CC0 Sprite Loader, Auto-Cropper & Variant Generator
 * Loads curated Kenney 3D-rendered isometric sprites from `/assets/iso/...`,
 * crops transparent padding into tight offscreen canvases for fast 60 FPS blitting,
 * and synthesizes foliage-selective Sakura Blossom tree variants.
 */

import { TILE_WIDTH, TILE_HEIGHT } from './isoMath';

export interface CroppedIsoSprite {
    key: string;
    canvas: HTMLCanvasElement;
    cropW: number;
    cropH: number;
    origW: number;
    origH: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

const ASSET_MANIFEST: Record<string, string> = {
    // Terrain & Floor Tiles
    grass_lush: '/assets/iso/tiles/grass_lush.png',
    grass_path_straight: '/assets/iso/tiles/grass_path_straight.png',
    grass_path_tile: '/assets/iso/tiles/grass_path_tile.png',
    grass_path_rocks: '/assets/iso/tiles/grass_path_rocks.png',
    path_stone: '/assets/iso/tiles/path_stone.png',
    path_stone_circle: '/assets/iso/tiles/path_stone_circle.png',
    path_wood: '/assets/iso/tiles/path_wood.png',
    river_water: '/assets/iso/tiles/river_water.png',
    river_tile: '/assets/iso/tiles/river_tile.png',
    river_rocks: '/assets/iso/tiles/river_rocks.png',
    river_bank: '/assets/iso/tiles/river_bank.png',
    beach_sand: '/assets/iso/tiles/beach_sand.png',
    landscape_grass: '/assets/iso/tiles/landscape_grass.png',
    landscape_water: '/assets/iso/tiles/landscape_water.png',

    // Casino & Plaza Floor Tiles
    casino_carpet: '/assets/iso/tiles/casino_carpet.png',
    plaza_stone: '/assets/iso/tiles/plaza_stone.png',
    stone_inset: '/assets/iso/tiles/stone_inset.png',
    wood_parquet: '/assets/iso/tiles/wood_parquet.png',
    marble_tile: '/assets/iso/tiles/marble_tile.png',
    road_plaza: '/assets/iso/tiles/road_plaza.png',
    road_curb: '/assets/iso/tiles/road_curb.png',
    planks_plaza: '/assets/iso/tiles/planks_plaza.png',

    // Trees & Canopy
    tree_pine_tall: '/assets/iso/nature/tree_pine_tall.png',
    tree_pine_round: '/assets/iso/nature/tree_pine_round.png',
    tree_pine_default: '/assets/iso/nature/tree_pine_default.png',
    tree_oak: '/assets/iso/nature/tree_oak.png',
    tree_detailed: '/assets/iso/nature/tree_detailed.png',
    tree_fat: '/assets/iso/nature/tree_fat.png',
    tree_autumn: '/assets/iso/nature/tree_autumn.png',
    tree_palm: '/assets/iso/nature/tree_palm.png',
    tree_palm_bend: '/assets/iso/nature/tree_palm_bend.png',

    // Bushes, Flowers, Rocks & Lilies
    bush_large: '/assets/iso/nature/bush_large.png',
    bush_detailed: '/assets/iso/nature/bush_detailed.png',
    hedge: '/assets/iso/nature/hedge.png',
    flower_red: '/assets/iso/nature/flower_red.png',
    flower_purple: '/assets/iso/nature/flower_purple.png',
    flower_yellow: '/assets/iso/nature/flower_yellow.png',
    mushroom_red: '/assets/iso/nature/mushroom_red.png',
    lily_large: '/assets/iso/nature/lily_large.png',
    lily_small: '/assets/iso/nature/lily_small.png',
    rock_large: '/assets/iso/nature/rock_large.png',
    rock_tall: '/assets/iso/nature/rock_tall.png',
    stone_moss: '/assets/iso/nature/stone_moss.png',

    // Forest Social Stations
    campfire_stones: '/assets/iso/nature/campfire_stones.png',
    campfire_logs: '/assets/iso/nature/campfire_logs.png',
    log_seat_ne: '/assets/iso/nature/log_seat_ne.png',
    log_seat_nw: '/assets/iso/nature/log_seat_nw.png',
    log_stack: '/assets/iso/nature/log_stack.png',
    stump_round: '/assets/iso/nature/stump_round.png',
    tent_open: '/assets/iso/nature/tent_open.png',
    bridge_wood: '/assets/iso/nature/bridge_wood.png',
    bridge_center: '/assets/iso/nature/bridge_center.png',
    canoe: '/assets/iso/nature/canoe.png',
    statue_column: '/assets/iso/nature/statue_column.png',
    statue_obelisk: '/assets/iso/nature/statue_obelisk.png',

    // Casino & Lounge Props
    fountain_round: '/assets/iso/props/fountain_round.png',
    fountain_square: '/assets/iso/props/fountain_square.png',
    pillar_stone: '/assets/iso/props/pillar_stone.png',
    pillar_ornate: '/assets/iso/props/pillar_ornate.png',
    pillar_gold: '/assets/iso/props/pillar_gold.png',
    lantern_street: '/assets/iso/props/lantern_street.png',
    lightpost_double: '/assets/iso/props/lightpost_double.png',
    lantern_glass: '/assets/iso/props/lantern_glass.png',
    candle_stand: '/assets/iso/props/candle_stand.png',
    sofa_vip_ne: '/assets/iso/props/sofa_vip_ne.png',
    sofa_vip_se: '/assets/iso/props/sofa_vip_se.png',
    sofa_long_ne: '/assets/iso/props/sofa_long_ne.png',
    chair_casino: '/assets/iso/props/chair_casino.png',
    stool_bar: '/assets/iso/props/stool_bar.png',
    bar_counter: '/assets/iso/props/bar_counter.png',
    table_round: '/assets/iso/props/table_round.png',
    table_cloth: '/assets/iso/props/table_cloth.png',
    table_decorated: '/assets/iso/props/table_decorated.png',
    table_round_chairs: '/assets/iso/props/table_round_chairs.png',
    rug_rectangle: '/assets/iso/props/rug_rectangle.png',
    rug_round: '/assets/iso/props/rug_round.png',
    lamp_floor: '/assets/iso/props/lamp_floor.png',
    speaker_club: '/assets/iso/props/speaker_club.png',
    slot_machine: '/assets/iso/props/slot_machine.png',
    arcade_machine: '/assets/iso/props/arcade_machine.png',
    radio_deck: '/assets/iso/props/radio_deck.png'
};

const spriteCache = new Map<string, CroppedIsoSprite>();
let loadingPromise: Promise<void> | null = null;
let assetsReady = false;
const readyListeners: Array<() => void> = [];

export function areIsoAssetsReady(): boolean {
    return assetsReady;
}

export function getIsoSprite(key: string): CroppedIsoSprite | undefined {
    return spriteCache.get(key);
}

function cropImageToSprite(key: string, img: HTMLImageElement): CroppedIsoSprite | null {
    if (typeof document === 'undefined') return null;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;

    const temp = document.createElement('canvas');
    temp.width = w;
    temp.height = h;
    const tctx = temp.getContext('2d');
    if (!tctx) return null;
    tctx.drawImage(img, 0, 0);

    const imgData = tctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
        const rowOffset = y * w * 4;
        for (let x = 0; x < w; x++) {
            const alpha = data[rowOffset + x * 4 + 3];
            if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) return null;

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(temp, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    return {
        key,
        canvas: out,
        cropW,
        cropH,
        origW: w,
        origH: h,
        minX,
        minY,
        maxX: maxX + 1,
        maxY: maxY + 1
    };
}

/**
 * Creates a selective pink cherry-blossom Sakura variant from a green 3D tree sprite,
 * preserving the warm wooden trunk while transforming green canopy pixels into multi-tone sakura pink.
 */
function createSakuraTreeVariant(
    newKey: string,
    source: CroppedIsoSprite,
    pinkPreset: 'soft' | 'vibrant'
): CroppedIsoSprite | null {
    if (typeof document === 'undefined') return null;
    const out = document.createElement('canvas');
    out.width = source.cropW;
    out.height = source.cropH;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(source.canvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, source.cropW, source.cropH);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3];
        if (a <= 10) continue;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        // Detect green/olive canopy foliage while leaving brown bark untouched
        if (g > r * 0.92 && g > b) {
            const lum = (r * 0.25 + g * 0.6 + b * 0.15) / 255;
            if (pinkPreset === 'soft') {
                d[i] = Math.min(255, Math.round(185 + lum * 75));
                d[i + 1] = Math.min(255, Math.round(88 + lum * 105));
                d[i + 2] = Math.min(255, Math.round(145 + lum * 95));
            } else {
                d[i] = Math.min(255, Math.round(195 + lum * 65));
                d[i + 1] = Math.min(255, Math.round(70 + lum * 95));
                d[i + 2] = Math.min(255, Math.round(135 + lum * 100));
            }
        }
    }

    ctx.putImageData(imgData, 0, 0);
    return {
        ...source,
        key: newKey,
        canvas: out
    };
}

export function preloadIsoAssets(onReady?: () => void): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (assetsReady) {
        onReady?.();
        return Promise.resolve();
    }
    if (onReady) {
        readyListeners.push(onReady);
    }
    if (loadingPromise) return loadingPromise;

    const entries = Object.entries(ASSET_MANIFEST);
    loadingPromise = Promise.all(
        entries.map(
            ([key, url]) =>
                new Promise<void>((resolve) => {
                    const img = new Image();
                    img.decoding = 'async';
                    img.onload = () => {
                        const cropped = cropImageToSprite(key, img);
                        if (cropped) {
                            spriteCache.set(key, cropped);
                        }
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = url;
                })
        )
    ).then(() => {
        // Synthesize 3D Sakura Blossom Tree variants from 3D Oak & Detailed Trees
        const oak = spriteCache.get('tree_oak');
        if (oak) {
            const s1 = createSakuraTreeVariant('tree_sakura_1', oak, 'soft');
            if (s1) spriteCache.set('tree_sakura_1', s1);
        }
        const detailed = spriteCache.get('tree_detailed');
        if (detailed) {
            const s2 = createSakuraTreeVariant('tree_sakura_2', detailed, 'vibrant');
            if (s2) spriteCache.set('tree_sakura_2', s2);
        }
        const fat = spriteCache.get('tree_fat');
        if (fat) {
            const s3 = createSakuraTreeVariant('tree_sakura_3', fat, 'soft');
            if (s3) spriteCache.set('tree_sakura_3', s3);
        }

        assetsReady = true;
        while (readyListeners.length > 0) {
            const cb = readyListeners.shift();
            cb?.();
        }
    });

    return loadingPromise;
}

/**
 * Draws a cropped 2:1 isometric floor tile sprite aligned to the `(sx, sy)` tile diamond.
 * Supports optional color tint overlay and alpha blending.
 */
export function drawIsoTileSprite(
    ctx: CanvasRenderingContext2D,
    key: string,
    sx: number,
    sy: number,
    alpha = 1,
    scaleMultiplier = 1.02
): boolean {
    const sp = spriteCache.get(key);
    if (!sp) return false;

    const drawW = TILE_WIDTH * scaleMultiplier;
    const scale = drawW / sp.cropW;
    const drawH = sp.cropH * scale;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, sx - drawW / 2, sy - (TILE_HEIGHT * scaleMultiplier) / 2, drawW, drawH);
    ctx.restore();
    return true;
}

/**
 * Draws a sub-tile detail sprite (such as stepping stones, lily pads, or flowers)
 * scaled proportionally to the 130px Kenney base diamond.
 */
export function drawIsoDetailSprite(
    ctx: CanvasRenderingContext2D,
    key: string,
    sx: number,
    sy: number,
    scaleMultiplier = 1,
    offsetX = 0,
    offsetY = 0,
    alpha = 1
): boolean {
    const sp = spriteCache.get(key);
    if (!sp) return false;

    const baseScale = (TILE_WIDTH / 130) * scaleMultiplier;
    const drawW = sp.cropW * baseScale;
    const drawH = sp.cropH * baseScale;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.drawImage(sp.canvas, sx + offsetX - drawW / 2, sy + offsetY - drawH / 2, drawW, drawH);
    ctx.restore();
    return true;
}

/**
 * Draws a 3D isometric world object sprite anchored by its horizontal center and ground contact base.
 */
export function drawIsoObjectSprite(
    ctx: CanvasRenderingContext2D,
    key: string,
    x: number,
    y: number,
    targetWidthPx: number,
    groundOffsetY = 8,
    alpha = 1,
    flipX = false
): boolean {
    const sp = spriteCache.get(key);
    if (!sp) return false;

    const scale = targetWidthPx / sp.cropW;
    const drawW = targetWidthPx;
    const drawH = sp.cropH * scale;

    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (flipX) {
        ctx.translate(x, y + groundOffsetY);
        ctx.scale(-1, 1);
        ctx.drawImage(sp.canvas, -drawW / 2, -drawH, drawW, drawH);
    } else {
        ctx.drawImage(sp.canvas, x - drawW / 2, y + groundOffsetY - drawH, drawW, drawH);
    }
    ctx.restore();
    return true;
}
