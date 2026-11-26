// src/lib/game/isometric/atmosphere.ts
/**
 * High-FPS Cached Glow Sprite Atlas, Pre-Rendered Zone Backdrops & Ambient Atmosphere
 * Replaces 25-50 per-frame createRadialGradient/createLinearGradient allocations with
 * pre-baked 64x64 offscreen sprites and a resize-cached backdrop canvas.
 */

import type { WorldZone } from './worldMap';

export type GlowColor =
    | 'gold'
    | 'cyan'
    | 'magenta'
    | 'emerald'
    | 'warmOrange'
    | 'violet'
    | 'white';

const GLOW_RGBA: Record<GlowColor, string> = {
    gold: '255, 215, 110',
    cyan: '0, 235, 255',
    magenta: '255, 65, 195',
    emerald: '130, 255, 155',
    warmOrange: '255, 145, 45',
    violet: '185, 150, 255',
    white: '255, 255, 255'
};

const glowAtlas = new Map<GlowColor, HTMLCanvasElement>();

function getGlowSprite(color: GlowColor): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    const cached = glowAtlas.get(color);
    if (cached) return cached;

    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const rgb = GLOW_RGBA[color];
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb}, 1)`);
    grad.addColorStop(0.42, `rgba(${rgb}, 0.42)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    glowAtlas.set(color, c);
    return c;
}

/**
 * Stamps a pre-baked elliptical radial glow in a single GPU-accelerated drawImage call.
 */
export function drawCachedGlow(
    ctx: CanvasRenderingContext2D,
    color: GlowColor,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    alpha = 1
) {
    const sprite = getGlowSprite(color);
    if (!sprite || alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(sprite, cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();
}

// --- RESIZE-CACHED ZONE BACKDROP CANVAS ---
let backdropCanvas: HTMLCanvasElement | null = null;
let backdropKey = '';

function buildZoneBackdrop(zone: WorldZone, width: number, height: number): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || width <= 0 || height <= 0) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    if (zone === 'forest') {
        grad.addColorStop(0, '#04120f');
        grad.addColorStop(0.55, '#09241e');
        grad.addColorStop(1, '#113328');
    } else if (zone === 'museum') {
        grad.addColorStop(0, '#0d0b18');
        grad.addColorStop(0.55, '#17122a');
        grad.addColorStop(1, '#231b3d');
    } else {
        grad.addColorStop(0, '#050512');
        grad.addColorStop(0.55, '#100724');
        grad.addColorStop(1, '#1c0a33');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Subtle soft atmospheric horizon glow
    const horizonGlow = ctx.createRadialGradient(
        width * 0.5,
        height * 0.45,
        20,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.65
    );
    if (zone === 'forest') {
        horizonGlow.addColorStop(0, 'rgba(65, 195, 130, 0.12)');
        horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else if (zone === 'museum') {
        horizonGlow.addColorStop(0, 'rgba(255, 210, 120, 0.11)');
        horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    } else {
        horizonGlow.addColorStop(0, 'rgba(180, 50, 255, 0.14)');
        horizonGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    }
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, width, height);

    // Crisp deterministic starfield
    let seed = zone === 'forest' ? 1337 : zone === 'museum' ? 4242 : 7777;
    const nextRand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
    };

    const starCount = Math.min(75, Math.floor((width * height) / 9500));
    for (let i = 0; i < starCount; i++) {
        const sx = Math.floor(nextRand() * width);
        const sy = Math.floor(nextRand() * (height * 0.85));
        const size = nextRand() > 0.82 ? 2 : 1;
        const alpha = 0.15 + nextRand() * 0.45;
        ctx.fillStyle =
            zone === 'forest'
                ? `rgba(180, 255, 210, ${alpha})`
                : zone === 'museum'
                  ? `rgba(255, 232, 180, ${alpha})`
                  : `rgba(195, 235, 255, ${alpha})`;
        ctx.fillRect(sx, sy, size, size);
    }

    // Distant horizon silhouette (skyline bokeh for Casino, pine ridge for Woods, colonnade ridge for Museum)
    ctx.fillStyle =
        zone === 'forest'
            ? 'rgba(5, 18, 14, 0.45)'
            : zone === 'museum'
              ? 'rgba(12, 10, 24, 0.42)'
              : 'rgba(8, 4, 20, 0.48)';
    if (zone === 'forest') {
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width + 32; x += 28) {
            const peak = height - 42 - Math.abs(Math.sin(x * 0.025)) * 34;
            ctx.lineTo(x, peak);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
    } else if (zone === 'casino') {
        for (let x = 12; x < width; x += 52) {
            const h = 28 + Math.floor(nextRand() * 54);
            ctx.fillRect(x, height - h, 34, h);
        }
    }

    return c;
}

export function drawCachedBackdrop(
    ctx: CanvasRenderingContext2D,
    zone: WorldZone,
    width: number,
    height: number
) {
    const key = `${zone}:${width}x${height}`;
    if (!backdropCanvas || backdropKey !== key) {
        backdropCanvas = buildZoneBackdrop(zone, width, height);
        backdropKey = key;
    }
    if (backdropCanvas) {
        ctx.drawImage(backdropCanvas, 0, 0);
    }
}

/**
 * Renders subtle live atmospheric lighting beams and floating ambient dust/petals per zone.
 */
export function drawZoneAtmosphere(
    ctx: CanvasRenderingContext2D,
    zone: WorldZone,
    width: number,
    height: number,
    cameraX: number,
    cameraY: number,
    timeMs: number
) {
    const t = timeMs / 1000;

    // 1. Subtle screen-space atmospheric beams
    ctx.save();
    if (zone === 'casino') {
        // Gentle sweeping club beams from top-center DJ area
        for (let b = 0; b < 2; b++) {
            const angle = Math.sin(t * 0.75 + b * 2.1) * 0.35;
            const originX = width * (0.42 + b * 0.16);
            ctx.fillStyle = b === 0 ? 'rgba(0, 235, 255, 0.035)' : 'rgba(255, 0, 170, 0.035)';
            ctx.beginPath();
            ctx.moveTo(originX, 0);
            ctx.lineTo(originX + Math.sin(angle - 0.18) * height, height);
            ctx.lineTo(originX + Math.sin(angle + 0.18) * height, height);
            ctx.closePath();
            ctx.fill();
        }
    } else if (zone === 'forest') {
        // Soft diagonal twilight moonbeams
        ctx.fillStyle = 'rgba(180, 255, 210, 0.03)';
        for (let i = 0; i < 2; i++) {
            const bx = width * (0.24 + i * 0.45);
            ctx.beginPath();
            ctx.moveTo(bx, 0);
            ctx.lineTo(bx + 70, 0);
            ctx.lineTo(bx + 230, height);
            ctx.lineTo(bx + 110, height);
            ctx.closePath();
            ctx.fill();
        }
    }
    ctx.restore();

    // 2. Ambient Floating Motes / Petals / Fireflies
    const count = zone === 'forest' ? 22 : zone === 'casino' ? 16 : 12;
    ctx.save();
    for (let i = 0; i < count; i++) {
        const pxBase = ((i * 197 + 43) % 1000) / 1000;
        const pyBase = ((i * 313 + 71) % 1000) / 1000;
        const driftX = Math.sin(t * (0.35 + (i % 4) * 0.12) + i) * 28 - cameraX * 0.12;
        const driftY =
            zone === 'forest'
                ? ((t * 14 + pyBase * height) % (height + 40)) - 20
                : Math.cos(t * 0.4 + i * 1.4) * 22 - cameraY * 0.12;

        const sx = ((pxBase * width + driftX) % width + width) % width;
        const sy = ((pyBase * height + driftY) % height + height) % height;
        const pulse = 0.35 + 0.45 * Math.sin(t * 1.8 + i * 1.7);

        if (zone === 'forest') {
            if (i % 3 === 0) {
                // Soft drifting sakura petal
                ctx.fillStyle = `rgba(255, 182, 212, ${0.42 * pulse})`;
                ctx.fillRect(sx, sy, 3, 2);
            } else {
                // Distant forest spark
                ctx.fillStyle = `rgba(205, 255, 120, ${0.5 * pulse})`;
                ctx.fillRect(sx, sy, 2, 2);
            }
        } else if (zone === 'museum') {
            // Golden sunlit gallery dust mote
            ctx.fillStyle = `rgba(255, 226, 150, ${0.35 * pulse})`;
            ctx.fillRect(sx, sy, 2, 2);
        } else {
            // Subtle casino neon dust
            ctx.fillStyle =
                i % 2 === 0
                    ? `rgba(0, 240, 255, ${0.34 * pulse})`
                    : `rgba(255, 215, 0, ${0.34 * pulse})`;
            ctx.fillRect(sx, sy, 2, 2);
        }
    }
    ctx.restore();
}
