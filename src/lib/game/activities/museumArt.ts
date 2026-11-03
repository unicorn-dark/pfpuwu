// src/lib/game/activities/museumArt.ts
/**
 * UwU Grand Art Museum — 2D Gallery Easel & 3D IsoLego / Voxel Sculpture Engine
 * Handles:
 * - Permanent Personal Art Inventory ("My Art Vault") so creators never lose any artwork
 * - 25 Fixed Museum Pedestal Spots (#1 - #25) across 5 Gallery Wings
 * - Undecided / Pending Submissions Queue when spots are full or submitted for curation
 * - Curator Admin Powers for @0xsha3 to place, swap, approve, or vacate any pedestal
 * - True 2:1 Isometric 3D Voxel / Lego Renderer with Top Studs, Slopes, Cylinders, and 5 Materials
 * - Smart 3D Surface-Snapping Raycast Picker + 8 Starter 3D Blueprints
 */

import { supabase } from '$lib/supabaseClient';

export const MUSEUM_CURATOR_ADMIN = '0xsha3';
export const MUSEUM_SPOT_COUNT = 25;
export const MUSEUM_GALLERY_FEE = 250;
export const VOXEL_GRID_SIZE = 16;

export type BrickMaterial = 'lego' | 'smooth' | 'neon' | 'glass' | 'gold';
export type BrickShape = 'block' | 'slope_n' | 'slope_e' | 'slope_s' | 'slope_w' | 'cylinder';
export type LegoPieceType = '1x1' | '1x2' | '2x2' | '2x4' | 'slope' | 'cylinder';
export type FrameStyle = 'gold' | 'obsidian' | 'neon' | 'frameless';

export interface VoxelBrick {
    x: number; // 0..15
    y: number; // 0..15
    z: number; // 0..15
    color: string;
    material?: BrickMaterial;
    shape?: BrickShape;
}

export interface ArtworkItem {
    id: string;
    artType: '2d' | '3d';
    title: string;
    description?: string;
    artistId: string;
    artistUsername: string;
    artistDisplayName: string;
    artistAvatarUrl: string;
    signatureDataUrl?: string | null;
    frameStyle: FrameStyle;
    imageDataUrl: string; // High-res 2D canvas PNG or pre-rendered 3D isometric preview PNG
    voxels?: VoxelBrick[]; // Sparse 3D brick array for 3D IsoLego sculptures
    gridSize?: number;
    likes: string[]; // @usernames who applauded
    submissionStatus?: 'vault' | 'pending_review' | 'exhibited';
    createdAt: string;
    updatedAt: string;
}

export interface MuseumStateSnapshot {
    spots: Record<number, ArtworkItem>; // spotNumber (1..25) -> ArtworkItem
    pendingQueue: ArtworkItem[]; // Undecided submissions awaiting @0xsha3 review
    artworksById: Record<string, ArtworkItem>; // Global artwork vault so no piece is ever lost
}

export interface MuseumPedestalMeta {
    spotNumber: number;
    wingName: string;
    x: number;
    y: number;
}

export const MUSEUM_PEDESTAL_LOCATIONS: MuseumPedestalMeta[] = [
    // Wing 1: NW Renaissance Hall (Spots #1 - #5)
    { spotNumber: 1, wingName: 'NW Renaissance Hall', x: 5.5, y: 5.5 },
    { spotNumber: 2, wingName: 'NW Renaissance Hall', x: 9.5, y: 5.5 },
    { spotNumber: 3, wingName: 'NW Renaissance Hall', x: 13.5, y: 5.5 },
    { spotNumber: 4, wingName: 'NW Renaissance Hall', x: 5.5, y: 9.5 },
    { spotNumber: 5, wingName: 'NW Renaissance Hall', x: 9.5, y: 9.5 },

    // Wing 2: NE Voxel Pavilion (Spots #6 - #10)
    { spotNumber: 6, wingName: 'NE Voxel Pavilion', x: 18.5, y: 5.5 },
    { spotNumber: 7, wingName: 'NE Voxel Pavilion', x: 22.5, y: 5.5 },
    { spotNumber: 8, wingName: 'NE Voxel Pavilion', x: 26.5, y: 5.5 },
    { spotNumber: 9, wingName: 'NE Voxel Pavilion', x: 22.5, y: 9.5 },
    { spotNumber: 10, wingName: 'NE Voxel Pavilion', x: 26.5, y: 9.5 },

    // Wing 3: Central Grand Rotunda (Spots #11 - #15)
    { spotNumber: 11, wingName: 'Central Grand Rotunda', x: 16.0, y: 11.5 },
    { spotNumber: 12, wingName: 'Central Grand Rotunda', x: 11.5, y: 14.0 },
    { spotNumber: 13, wingName: 'Central Grand Rotunda', x: 20.5, y: 14.0 },
    { spotNumber: 14, wingName: 'Central Grand Rotunda', x: 11.5, y: 18.5 },
    { spotNumber: 15, wingName: 'Central Grand Rotunda', x: 20.5, y: 18.5 },

    // Wing 4: SW Contemporary Wing (Spots #16 - #20)
    { spotNumber: 16, wingName: 'SW Contemporary Wing', x: 5.5, y: 21.5 },
    { spotNumber: 17, wingName: 'SW Contemporary Wing', x: 9.5, y: 21.5 },
    { spotNumber: 18, wingName: 'SW Contemporary Wing', x: 5.5, y: 25.5 },
    { spotNumber: 19, wingName: 'SW Contemporary Wing', x: 9.5, y: 25.5 },
    { spotNumber: 20, wingName: 'SW Contemporary Wing', x: 13.5, y: 25.5 },

    // Wing 5: SE Digital & Holo Wing (Spots #21 - #25)
    { spotNumber: 21, wingName: 'SE Digital & Holo Wing', x: 22.5, y: 21.5 },
    { spotNumber: 22, wingName: 'SE Digital & Holo Wing', x: 26.5, y: 21.5 },
    { spotNumber: 23, wingName: 'SE Digital & Holo Wing', x: 18.5, y: 25.5 },
    { spotNumber: 24, wingName: 'SE Digital & Holo Wing', x: 22.5, y: 25.5 },
    { spotNumber: 25, wingName: 'SE Digital & Holo Wing', x: 26.5, y: 25.5 }
];

const LOCAL_MUSEUM_STATE_KEY = 'pfpuwu_world_museum_state_v1';
const LOCAL_PERSONAL_VAULT_PREFIX = 'pfpuwu_personal_art_vault_v1_';
export const SUPABASE_MUSEUM_ROW_ID = 'museum_exhibits_v1';

export function cleanMuseumUsername(u?: string | null): string {
    return (u || '').trim().replace(/^@/, '').toLowerCase();
}

export function isMuseumCuratorAdmin(username?: string | null): boolean {
    return cleanMuseumUsername(username) === MUSEUM_CURATOR_ADMIN;
}

// ============================================================================
// COLOR SHADING & LEGO PIECE GEOMETRY HELPERS
// ============================================================================

const shadeColorCache = new Map<string, string>();

export function shadeHexColor(hex: string, percent: number): string {
    const key = `${hex}_${percent}`;
    const cached = shadeColorCache.get(key);
    if (cached) return cached;

    const clean = (hex || '#ffffff').replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
    if (isNaN(num)) return hex;
    const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(2.55 * percent)));
    const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(2.55 * percent)));
    const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(2.55 * percent)));
    const out = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    if (shadeColorCache.size > 2000) shadeColorCache.clear();
    shadeColorCache.set(key, out);
    return out;
}

/**
 * Returns the relative (dx, dy) footprint cells and default shape for a multi-stud Lego piece
 */
export function getLegoPieceFootprint(
    piece: LegoPieceType,
    orientation: 0 | 1 | 2 | 3 = 0
): Array<{ dx: number; dy: number; shape: BrickShape }> {
    const rot = orientation % 4;
    const slopeShapes: BrickShape[] = ['slope_s', 'slope_e', 'slope_n', 'slope_w'];

    if (piece === '1x1') {
        return [{ dx: 0, dy: 0, shape: 'block' }];
    }
    if (piece === 'cylinder') {
        return [{ dx: 0, dy: 0, shape: 'cylinder' }];
    }
    if (piece === 'slope') {
        const sh = slopeShapes[rot];
        if (rot % 2 === 0) {
            return [
                { dx: 0, dy: 0, shape: sh },
                { dx: 1, dy: 0, shape: sh }
            ];
        } else {
            return [
                { dx: 0, dy: 0, shape: sh },
                { dx: 0, dy: 1, shape: sh }
            ];
        }
    }
    if (piece === '1x2') {
        return rot % 2 === 0
            ? [
                  { dx: 0, dy: 0, shape: 'block' },
                  { dx: 1, dy: 0, shape: 'block' }
              ]
            : [
                  { dx: 0, dy: 0, shape: 'block' },
                  { dx: 0, dy: 1, shape: 'block' }
              ];
    }
    if (piece === '2x2') {
        return [
            { dx: 0, dy: 0, shape: 'block' },
            { dx: 1, dy: 0, shape: 'block' },
            { dx: 0, dy: 1, shape: 'block' },
            { dx: 1, dy: 1, shape: 'block' }
        ];
    }
    if (piece === '2x4') {
        const coords: Array<{ dx: number; dy: number; shape: BrickShape }> = [];
        const w = rot % 2 === 0 ? 4 : 2;
        const h = rot % 2 === 0 ? 2 : 4;
        for (let dx = 0; dx < w; dx++) {
            for (let dy = 0; dy < h; dy++) {
                coords.push({ dx, dy, shape: 'block' });
            }
        }
        return coords;
    }
    return [{ dx: 0, dy: 0, shape: 'block' }];
}

export function getSymmetryCoords3D(
    x: number,
    y: number,
    z: number,
    symmetry: 'none' | 'x' | 'y' | 'quad',
    gridSize = VOXEL_GRID_SIZE
): Array<{ x: number; y: number; z: number }> {
    const mirrorX = gridSize - 1 - x;
    const mirrorY = gridSize - 1 - y;
    const pts: Array<{ x: number; y: number; z: number }> = [{ x, y, z }];
    if (symmetry === 'x' || symmetry === 'quad') {
        pts.push({ x: mirrorX, y, z });
    }
    if (symmetry === 'y' || symmetry === 'quad') {
        pts.push({ x, y: mirrorY, z });
    }
    if (symmetry === 'quad') {
        pts.push({ x: mirrorX, y: mirrorY, z });
    }
    const seen = new Set<string>();
    return pts.filter((p) => {
        if (p.x < 0 || p.x >= gridSize || p.y < 0 || p.y >= gridSize || p.z < 0 || p.z >= gridSize) {
            return false;
        }
        const k = `${p.x},${p.y},${p.z}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// ============================================================================
// 3D GEOMETRIC PRIMITIVE GENERATORS (Stamps & Walls)
// ============================================================================

export function generate3DStampVoxels(
    kind: 'sphere' | 'dome' | 'pyramid' | 'heart' | 'pillar',
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    color: string,
    material: BrickMaterial = 'lego',
    gridSize = VOXEL_GRID_SIZE
): VoxelBrick[] {
    const out: VoxelBrick[] = [];
    const r = Math.max(1, Math.min(6, Math.round(radius)));

    for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dz = -r; dz <= r; dz++) {
                const x = cx + dx;
                const y = cy + dy;
                const z = cz + dz;
                if (x < 0 || x >= gridSize || y < 0 || y >= gridSize || z < 0 || z >= gridSize) continue;

                if (kind === 'sphere') {
                    if (dx * dx + dy * dy + dz * dz <= r * r + 0.4) {
                        out.push({ x, y, z, color, material, shape: 'block' });
                    }
                } else if (kind === 'dome') {
                    if (dz >= 0 && dx * dx + dy * dy + dz * dz <= r * r + 0.4) {
                        out.push({ x, y, z, color, material, shape: 'block' });
                    }
                } else if (kind === 'pyramid') {
                    if (dz >= 0 && dz <= r) {
                        const allowed = r - dz;
                        if (Math.abs(dx) <= allowed && Math.abs(dy) <= allowed) {
                            out.push({ x, y, z, color, material, shape: 'block' });
                        }
                    }
                } else if (kind === 'pillar') {
                    if (dx === 0 && dy === 0 && dz >= 0 && dz <= r * 2) {
                        out.push({ x, y, z, color, material, shape: 'cylinder' });
                    }
                } else if (kind === 'heart') {
                    // Upright 3D heart oriented across X and Z (thickness 2 in Y)
                    if (Math.abs(dy) <= 1 && dz >= 0 && dz <= r * 2) {
                        const nx = dx / (r + 0.5);
                        const nz = (dz - r * 0.85) / (r + 0.5);
                        const eq = Math.pow(nx * nx + nz * nz - 0.65, 3) - nx * nx * Math.pow(nz, 3);
                        if (eq <= 0.02) {
                            out.push({ x, y, z, color, material, shape: 'block' });
                        }
                    }
                }
            }
        }
    }
    return out;
}

// ============================================================================
// TRUE ISOMETRIC 3D VOXEL / LEGO RENDERER & RAYCAST HIT-TESTER
// ============================================================================

export function rotateGridCoord(
    x: number,
    y: number,
    rotStep: number,
    gridSize = VOXEL_GRID_SIZE
): { rx: number; ry: number } {
    const r = ((rotStep % 4) + 4) % 4;
    const max = gridSize - 1;
    if (r === 1) return { rx: max - y, ry: x };
    if (r === 2) return { rx: max - x, ry: max - y };
    if (r === 3) return { rx: y, ry: max - x };
    return { rx: x, ry: y };
}

export function projectIsoVoxel(
    rx: number,
    ry: number,
    z: number,
    originX: number,
    originY: number,
    tileW: number,
    tileH: number,
    voxelH: number
): { sx: number; sy: number } {
    const sx = originX + (rx - ry) * (tileW / 2);
    const sy = originY + (rx + ry) * (tileH / 2) - z * voxelH;
    return { sx, sy };
}

export interface VoxelRenderOptions {
    rotation?: number; // 0, 1, 2, 3
    zoom?: number;
    panX?: number;
    panY?: number;
    showBaseplate?: boolean;
    sliceZ?: number | null; // Optional elevated floor guide
    ghostVoxels?: VoxelBrick[];
    gridSize?: number;
    transparentBg?: boolean;
    bgColor?: string;
}

export interface VoxelHitCandidate {
    x: number;
    y: number;
    z: number;
    normal: { dx: number; dy: number; dz: number };
    isBaseplate: boolean;
    poly: Array<{ x: number; y: number }>;
}

function pointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x,
            yi = poly[i].y;
        const xj = poly[j].x,
            yj = poly[j].y;
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0.00001) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function drawSingleVoxelBrick(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    hw: number,
    hh: number,
    vh: number,
    brick: VoxelBrick,
    hasBrickAbove: boolean,
    isGhost = false
) {
    const mat = brick.material || 'lego';
    const shape = brick.shape || 'block';
    const baseColor = brick.color || '#ff3366';

    ctx.save();
    if (isGhost) {
        ctx.globalAlpha = 0.58;
    } else if (mat === 'glass') {
        ctx.globalAlpha = 0.68;
    }

    const topColor =
        mat === 'gold'
            ? shadeHexColor(baseColor, 26)
            : mat === 'neon'
              ? shadeHexColor(baseColor, 24)
              : shadeHexColor(baseColor, 10);
    const leftColor =
        mat === 'gold'
            ? shadeHexColor(baseColor, -8)
            : mat === 'neon'
              ? shadeHexColor(baseColor, 6)
              : shadeHexColor(baseColor, -14);
    const rightColor =
        mat === 'gold'
            ? shadeHexColor(baseColor, -26)
            : mat === 'neon'
              ? shadeHexColor(baseColor, -8)
              : shadeHexColor(baseColor, -30);

    const strokeStyle = isGhost
        ? '#00ffff'
        : mat === 'neon'
          ? shadeHexColor(baseColor, 48)
          : mat === 'glass'
            ? 'rgba(255,255,255,0.65)'
            : mat === 'gold'
              ? 'rgba(255,245,190,0.65)'
              : 'rgba(0,0,0,0.28)';

    // Bottom diamond vertices:
    // Top: (sx, sy - hh), Right: (sx + hw, sy), Bottom: (sx, sy + hh), Left: (sx - hw, sy)
    // Raised by vh:
    const topN = { x: sx, y: sy - hh - vh };
    const topE = { x: sx + hw, y: sy - vh };
    const topS = { x: sx, y: sy + hh - vh };
    const topW = { x: sx - hw, y: sy - vh };

    const botE = { x: sx + hw, y: sy };
    const botS = { x: sx, y: sy + hh };
    const botW = { x: sx - hw, y: sy };

    if (shape === 'cylinder') {
        // Cylindrical Lego Column
        const rx = hw * 0.72;
        const ry = hh * 0.72;
        const bodyGrad = ctx.createLinearGradient(sx - rx, sy, sx + rx, sy);
        bodyGrad.addColorStop(0, leftColor);
        bodyGrad.addColorStop(0.45, topColor);
        bodyGrad.addColorStop(1, rightColor);

        ctx.fillStyle = bodyGrad;
        ctx.beginPath();
        ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI);
        ctx.lineTo(sx - rx, sy - vh);
        ctx.ellipse(sx, sy - vh, rx, ry, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.ellipse(sx, sy - vh, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else if (shape.startsWith('slope_')) {
        // 45-degree Lego Roof Slope
        // Draw left & right faces first, then angled ramp face
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        if (shape === 'slope_s') {
            ctx.moveTo(topW.x, topW.y);
            ctx.lineTo(botS.x, botS.y);
            ctx.lineTo(botW.x, botW.y);
        } else {
            ctx.moveTo(topW.x, topW.y);
            ctx.lineTo(topS.x, topS.y);
            ctx.lineTo(botS.x, botS.y);
            ctx.lineTo(botW.x, botW.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.fillStyle = rightColor;
        ctx.beginPath();
        if (shape === 'slope_e') {
            ctx.moveTo(topN.x, topN.y);
            ctx.lineTo(botE.x, botE.y);
            ctx.lineTo(botS.x, botS.y);
            ctx.lineTo(topS.x, topS.y);
        } else {
            ctx.moveTo(topE.x, topE.y);
            ctx.lineTo(topS.x, topS.y);
            ctx.lineTo(botS.x, botS.y);
            ctx.lineTo(botE.x, botE.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Sloped Top Face
        ctx.fillStyle = topColor;
        ctx.beginPath();
        if (shape === 'slope_s') {
            ctx.moveTo(topN.x, topN.y);
            ctx.lineTo(topE.x, topE.y);
            ctx.lineTo(botS.x, botS.y);
            ctx.lineTo(topW.x, topW.y);
        } else if (shape === 'slope_e') {
            ctx.moveTo(topN.x, topN.y);
            ctx.lineTo(botE.x, botE.y);
            ctx.lineTo(topS.x, topS.y);
            ctx.lineTo(topW.x, topW.y);
        } else if (shape === 'slope_n') {
            ctx.moveTo(sx, sy - hh);
            ctx.lineTo(topE.x, topE.y);
            ctx.lineTo(topS.x, topS.y);
            ctx.lineTo(topW.x, topW.y);
        } else {
            ctx.moveTo(topN.x, topN.y);
            ctx.lineTo(topE.x, topE.y);
            ctx.lineTo(topS.x, topS.y);
            ctx.lineTo(botW.x, botW.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        // Standard Isometric Cube / Lego Block
        // 1. Left Face (SW)
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        ctx.moveTo(topW.x, topW.y);
        ctx.lineTo(topS.x, topS.y);
        ctx.lineTo(botS.x, botS.y);
        ctx.lineTo(botW.x, botW.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = isGhost ? 1.3 : 0.75;
        ctx.stroke();

        // 2. Right Face (SE)
        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(topE.x, topE.y);
        ctx.lineTo(topS.x, topS.y);
        ctx.lineTo(botS.x, botS.y);
        ctx.lineTo(botE.x, botE.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3. Top Face
        if (mat === 'gold') {
            const g = ctx.createLinearGradient(topW.x, topN.y, topE.x, topS.y);
            g.addColorStop(0, shadeHexColor(baseColor, 36));
            g.addColorStop(0.5, '#fff9d2');
            g.addColorStop(1, shadeHexColor(baseColor, -10));
            ctx.fillStyle = g;
        } else {
            ctx.fillStyle = topColor;
        }
        ctx.beginPath();
        ctx.moveTo(topN.x, topN.y);
        ctx.lineTo(topE.x, topE.y);
        ctx.lineTo(topS.x, topS.y);
        ctx.lineTo(topW.x, topW.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Draw Iconic Cylindrical Lego Stud on top if exposed (or if cylinder/lego material)
    if (mat !== 'smooth' && !shape.startsWith('slope_') && !hasBrickAbove) {
        const studRx = Math.max(2.2, hw * 0.42);
        const studRy = Math.max(1.2, hh * 0.42);
        const studH = Math.max(1.8, vh * 0.24);
        const studY = sy - vh;

        // Stud cylinder side
        ctx.fillStyle = leftColor;
        ctx.beginPath();
        ctx.ellipse(sx, studY, studRx, studRy, 0, 0, Math.PI);
        ctx.lineTo(sx - studRx, studY - studH);
        ctx.ellipse(sx, studY - studH, studRx, studRy, 0, Math.PI, 0, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = 0.65;
        ctx.stroke();

        // Stud top cap
        ctx.fillStyle = shadeHexColor(topColor, 10);
        ctx.beginPath();
        ctx.ellipse(sx, studY - studH, studRx, studRy, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.stroke();
    }

    ctx.restore();
}

// Offscreen Baseplate Cache (eliminates 768 path draw calls per frame during 60fps mobile touch!)
let cachedBaseplateCanvas: HTMLCanvasElement | null = null;
let cachedBaseplateKey = '';
let cachedBaseplateHits: VoxelHitCandidate[] = [];

/**
 * Renders a 3D IsoLego / Voxel sculpture onto any 2D canvas and optionally returns hit-test polygons
 */
export function renderVoxelSculptureToCanvas(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    voxels: VoxelBrick[],
    options: VoxelRenderOptions = {},
    collectHitCandidates = false
): VoxelHitCandidate[] {
    const rot = ((options.rotation || 0) % 4 + 4) % 4;
    const zoom = options.zoom || 1;
    const panX = options.panX || 0;
    const panY = options.panY || 0;
    const gridSize = options.gridSize || VOXEL_GRID_SIZE;
    const showBaseplate = options.showBaseplate ?? false;
    const sliceZ = options.sliceZ ?? null;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    if (!options.transparentBg) {
        ctx.fillStyle = options.bgColor || '#101426';
        ctx.fillRect(0, 0, width, height);
    }

    const baseTileW = Math.min(width / (gridSize * 1.15), height / (gridSize * 0.92)) * zoom;
    const tileW = Math.max(8, baseTileW);
    const tileH = tileW * 0.5;
    const voxelH = tileW * 0.56;
    const hw = tileW / 2;
    const hh = tileH / 2;

    const originX = width / 2 + panX;
    const originY = height * 0.58 - (gridSize * tileH) / 2 + panY;

    const hitCandidates: VoxelHitCandidate[] = [];

    // 1. Optional Studded Lego Baseplate (Cached on offscreen canvas for 60fps mobile touch)
    if (showBaseplate) {
        const bpKey = `${width}_${height}_${rot}_${zoom.toFixed(3)}_${Math.round(panX)}_${Math.round(panY)}_${gridSize}`;
        if (typeof document !== 'undefined' && (cachedBaseplateKey !== bpKey || !cachedBaseplateCanvas)) {
            if (!cachedBaseplateCanvas) {
                cachedBaseplateCanvas = document.createElement('canvas');
            }
            cachedBaseplateCanvas.width = width;
            cachedBaseplateCanvas.height = height;
            const bCtx = cachedBaseplateCanvas.getContext('2d');
            const newBpHits: VoxelHitCandidate[] = [];

            if (bCtx) {
                bCtx.clearRect(0, 0, width, height);
                const pRight = projectIsoVoxel(gridSize - 1, 0, 0, originX, originY, tileW, tileH, voxelH);
                const pBot = projectIsoVoxel(gridSize - 1, gridSize - 1, 0, originX, originY, tileW, tileH, voxelH);
                const pLeft = projectIsoVoxel(0, gridSize - 1, 0, originX, originY, tileW, tileH, voxelH);

                const plateDepth = Math.max(6, voxelH * 0.45);
                bCtx.fillStyle = '#1e293b';
                bCtx.beginPath();
                bCtx.moveTo(pLeft.sx - hw, pLeft.sy);
                bCtx.lineTo(pBot.sx, pBot.sy + hh);
                bCtx.lineTo(pBot.sx, pBot.sy + hh + plateDepth);
                bCtx.lineTo(pLeft.sx - hw, pLeft.sy + plateDepth);
                bCtx.closePath();
                bCtx.fill();

                bCtx.fillStyle = '#0f172a';
                bCtx.beginPath();
                bCtx.moveTo(pRight.sx + hw, pRight.sy);
                bCtx.lineTo(pBot.sx, pBot.sy + hh);
                bCtx.lineTo(pBot.sx, pBot.sy + hh + plateDepth);
                bCtx.lineTo(pRight.sx + hw, pRight.sy + plateDepth);
                bCtx.closePath();
                bCtx.fill();

                for (let x = 0; x < gridSize; x++) {
                    for (let y = 0; y < gridSize; y++) {
                        const { rx, ry } = rotateGridCoord(x, y, rot, gridSize);
                        const { sx, sy } = projectIsoVoxel(rx, ry, 0, originX, originY, tileW, tileH, voxelH);
                        const isAlt = (x + y) % 2 === 0;

                        const poly = [
                            { x: sx, y: sy - hh },
                            { x: sx + hw, y: sy },
                            { x: sx, y: sy + hh },
                            { x: sx - hw, y: sy }
                        ];

                        bCtx.fillStyle = isAlt ? '#283548' : '#222e40';
                        bCtx.beginPath();
                        bCtx.moveTo(poly[0].x, poly[0].y);
                        bCtx.lineTo(poly[1].x, poly[1].y);
                        bCtx.lineTo(poly[2].x, poly[2].y);
                        bCtx.lineTo(poly[3].x, poly[3].y);
                        bCtx.closePath();
                        bCtx.fill();
                        bCtx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
                        bCtx.lineWidth = 0.7;
                        bCtx.stroke();

                        bCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
                        bCtx.beginPath();
                        bCtx.ellipse(sx, sy, hw * 0.34, hh * 0.34, 0, 0, Math.PI * 2);
                        bCtx.stroke();

                        newBpHits.push({
                            x,
                            y,
                            z: 0,
                            normal: { dx: 0, dy: 0, dz: 0 },
                            isBaseplate: true,
                            poly
                        });
                    }
                }
            }
            cachedBaseplateKey = bpKey;
            cachedBaseplateHits = newBpHits;
        }

        if (cachedBaseplateCanvas) {
            ctx.drawImage(cachedBaseplateCanvas, 0, 0);
        }
        if (collectHitCandidates && (sliceZ === null || sliceZ === 0)) {
            for (let i = 0; i < cachedBaseplateHits.length; i++) {
                hitCandidates.push(cachedBaseplateHits[i]);
            }
        }
    }

    // Fast lookup set for occupied coordinates (so we only draw studs and hit-test exposed faces)
    const occupiedSet = new Set<string>();
    for (const v of voxels) {
        if (sliceZ !== null && v.z > sliceZ) continue;
        occupiedSet.add(`${v.x},${v.y},${v.z}`);
    }

    // Map screen-space normal directions back to world (dx, dy) based on rotation
    const unrotateDelta = (drx: number, dry: number): { dx: number; dy: number } => {
        if (rot === 1) return { dx: dry, dy: -drx };
        if (rot === 2) return { dx: -drx, dy: -dry };
        if (rot === 3) return { dx: -dry, dy: drx };
        return { dx: drx, dy: dry };
    };
    const leftNormal = unrotateDelta(0, 1);
    const rightNormal = unrotateDelta(1, 0);

    // Combine real bricks + ghost preview bricks and depth-sort back-to-front, bottom-to-top
    const combined: Array<{ brick: VoxelBrick; isGhost: boolean; rx: number; ry: number; sortKey: number }> = [];
    for (const v of voxels) {
        if (sliceZ !== null && v.z > sliceZ) continue;
        const { rx, ry } = rotateGridCoord(v.x, v.y, rot, gridSize);
        combined.push({
            brick: v,
            isGhost: false,
            rx,
            ry,
            sortKey: (rx + ry) * 100 + v.z
        });
    }

    if (options.ghostVoxels) {
        for (const gv of options.ghostVoxels) {
            const { rx, ry } = rotateGridCoord(gv.x, gv.y, rot, gridSize);
            combined.push({
                brick: gv,
                isGhost: true,
                rx,
                ry,
                sortKey: (rx + ry) * 100 + gv.z + 0.1
            });
        }
    }

    combined.sort((a, b) => a.sortKey - b.sortKey);

    for (const item of combined) {
        const { brick, isGhost, rx, ry } = item;
        const hasAbove = !isGhost && occupiedSet.has(`${brick.x},${brick.y},${brick.z + 1}`);
        const hasLeftNeighbor =
            !isGhost && occupiedSet.has(`${brick.x + leftNormal.dx},${brick.y + leftNormal.dy},${brick.z}`);
        const hasRightNeighbor =
            !isGhost && occupiedSet.has(`${brick.x + rightNormal.dx},${brick.y + rightNormal.dy},${brick.z}`);

        // Skip drawing & hit-testing completely buried interior blocks
        if (!isGhost && hasAbove && hasLeftNeighbor && hasRightNeighbor && brick.material !== 'glass') {
            continue;
        }

        const { sx, sy } = projectIsoVoxel(rx, ry, brick.z, originX, originY, tileW, tileH, voxelH);
        drawSingleVoxelBrick(ctx, sx, sy, hw, hh, voxelH, brick, hasAbove, isGhost);

        if (collectHitCandidates && !isGhost && sliceZ === null) {
            const topN = { x: sx, y: sy - hh - voxelH };
            const topE = { x: sx + hw, y: sy - voxelH };
            const topS = { x: sx, y: sy + hh - voxelH };
            const topW = { x: sx - hw, y: sy - voxelH };
            const botE = { x: sx + hw, y: sy };
            const botS = { x: sx, y: sy + hh };
            const botW = { x: sx - hw, y: sy };

            // Left Face (+ry in screen space) — only if exposed
            if (!hasLeftNeighbor) {
                hitCandidates.push({
                    x: brick.x,
                    y: brick.y,
                    z: brick.z,
                    normal: { dx: leftNormal.dx, dy: leftNormal.dy, dz: 0 },
                    isBaseplate: false,
                    poly: [topW, topS, botS, botW]
                });
            }

            // Right Face (+rx in screen space) — only if exposed
            if (!hasRightNeighbor) {
                hitCandidates.push({
                    x: brick.x,
                    y: brick.y,
                    z: brick.z,
                    normal: { dx: rightNormal.dx, dy: rightNormal.dy, dz: 0 },
                    isBaseplate: false,
                    poly: [topE, topS, botS, botE]
                });
            }

            // Top Face (+z) — only if exposed
            if (!hasAbove) {
                hitCandidates.push({
                    x: brick.x,
                    y: brick.y,
                    z: brick.z,
                    normal: { dx: 0, dy: 0, dz: 1 },
                    isBaseplate: false,
                    poly: [topN, topE, topS, topW]
                });
            }
        }
    }

    // 3. Optional Elevated Slice Plane Guide (when sliceZ > 0)
    if (showBaseplate && sliceZ !== null && sliceZ > 0) {
        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const { rx, ry } = rotateGridCoord(x, y, rot, gridSize);
                const { sx, sy } = projectIsoVoxel(rx, ry, sliceZ, originX, originY, tileW, tileH, voxelH);
                const poly = [
                    { x: sx, y: sy - hh },
                    { x: sx + hw, y: sy },
                    { x: sx, y: sy + hh },
                    { x: sx - hw, y: sy }
                ];

                ctx.strokeStyle = 'rgba(0, 255, 255, 0.26)';
                ctx.lineWidth = 0.8;
                ctx.beginPath();
                ctx.moveTo(poly[0].x, poly[0].y);
                ctx.lineTo(poly[1].x, poly[1].y);
                ctx.lineTo(poly[2].x, poly[2].y);
                ctx.lineTo(poly[3].x, poly[3].y);
                ctx.closePath();
                ctx.stroke();

                if (collectHitCandidates) {
                    hitCandidates.push({
                        x,
                        y,
                        z: sliceZ,
                        normal: { dx: 0, dy: 0, dz: 0 },
                        isBaseplate: true,
                        poly
                    });
                }
            }
        }
    }

    ctx.restore();
    return hitCandidates;
}

/**
 * Picks the topmost voxel face or baseplate stud under the pointer (px, py)
 */
export function pickVoxelAtScreenCoord(
    px: number,
    py: number,
    candidates: VoxelHitCandidate[]
): VoxelHitCandidate | null {
    for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (pointInPolygon(px, py, c.poly)) {
            return c;
        }
    }
    return null;
}

/**
 * Pre-renders a 3D Voxel Sculpture into a transparent PNG data URL for museum pedestal display & thumbnails
 */
export function exportVoxelSculptureDataUrl(
    voxels: VoxelBrick[],
    rotation = 0,
    size = 320
): string {
    if (typeof document === 'undefined') return '';
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return '';

    renderVoxelSculptureToCanvas(
        ctx,
        size,
        size,
        voxels,
        {
            rotation,
            zoom: 1.15,
            panY: 16,
            showBaseplate: false,
            transparentBg: true
        },
        false
    );
    return c.toDataURL('image/png');
}

// ============================================================================
// OFFSCREEN PEDESTAL RENDER CACHE (For 60 FPS Isometric Map Rendering)
// ============================================================================

const pedestalCanvasCache = new Map<string, { updatedAt: string; canvas: HTMLCanvasElement }>();

export function getCachedPedestalArtworkCanvas(artwork: ArtworkItem): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || !artwork) return null;
    const cacheKey = `${artwork.id}_${artwork.frameStyle}`;
    const existing = pedestalCanvasCache.get(cacheKey);
    if (existing && existing.updatedAt === artwork.updatedAt) {
        return existing.canvas;
    }

    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return null;

    if (artwork.artType === '3d' && Array.isArray(artwork.voxels) && artwork.voxels.length > 0) {
        renderVoxelSculptureToCanvas(
            ctx,
            160,
            160,
            artwork.voxels,
            {
                rotation: 0,
                zoom: 1.18,
                panY: 10,
                showBaseplate: false,
                transparentBg: true
            },
            false
        );
        pedestalCanvasCache.set(cacheKey, { updatedAt: artwork.updatedAt, canvas: c });
        return c;
    }

    // For 2D paintings or fallback imageDataUrl
    if (artwork.imageDataUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.clearRect(0, 0, 160, 160);
            ctx.drawImage(img, 0, 0, 160, 160);
        };
        img.src = artwork.imageDataUrl;
    }

    pedestalCanvasCache.set(cacheKey, { updatedAt: artwork.updatedAt, canvas: c });
    return c;
}

// ============================================================================
// 8 BUILT-IN 3D ISOLEGO STARTER BLUEPRINTS (Instant Creative Starting Points)
// ============================================================================

export interface VoxelBlueprint {
    id: string;
    name: string;
    icon: string;
    description: string;
    build: () => VoxelBrick[];
}

export const STARTER_3D_BLUEPRINTS: VoxelBlueprint[] = [
    {
        id: 'unicorn',
        name: 'UwU Unicorn',
        icon: '🦄',
        description: 'Pastel unicorn bust with golden spiral horn & rainbow mane',
        build: () => {
            const b: VoxelBrick[] = [];
            // Pedestal base
            for (let x = 5; x <= 10; x++) {
                for (let y = 5; y <= 10; y++) {
                    b.push({ x, y, z: 0, color: '#f8fafc', material: 'lego' });
                }
            }
            // Neck & Head (white)
            for (let z = 1; z <= 5; z++) {
                for (let x = 6; x <= 9; x++) {
                    for (let y = 6; y <= 9; y++) {
                        b.push({ x, y, z, color: '#ffffff', material: 'lego' });
                    }
                }
            }
            // Snout protruding forward (+x)
            for (let z = 3; z <= 4; z++) {
                for (let x = 10; x <= 11; x++) {
                    for (let y = 7; y <= 8; y++) {
                        b.push({ x, y, z, color: '#ffb6c1', material: 'lego' });
                    }
                }
            }
            // Eyes
            b.push({ x: 9, y: 6, z: 4, color: '#1e1b4b', material: 'smooth' });
            b.push({ x: 9, y: 9, z: 4, color: '#1e1b4b', material: 'smooth' });
            // Ears
            b.push({ x: 7, y: 6, z: 6, color: '#ffffff', material: 'lego' });
            b.push({ x: 7, y: 9, z: 6, color: '#ffffff', material: 'lego' });
            // Golden Horn
            b.push({ x: 9, y: 7, z: 6, color: '#ffd700', material: 'gold', shape: 'cylinder' });
            b.push({ x: 10, y: 7, z: 7, color: '#ffd700', material: 'gold', shape: 'cylinder' });
            b.push({ x: 10, y: 7, z: 8, color: '#fffbeb', material: 'neon', shape: 'cylinder' });
            // Rainbow Mane along back
            const rainbow = ['#ff007f', '#ff8800', '#ffee00', '#00ff88', '#00ffff', '#a855f7'];
            for (let i = 0; i < 6; i++) {
                b.push({ x: 5, y: 7, z: 1 + i, color: rainbow[i], material: 'neon' });
                b.push({ x: 5, y: 8, z: 1 + i, color: rainbow[i], material: 'neon' });
            }
            return b;
        }
    },
    {
        id: 'castle',
        name: 'Cyber Castle',
        icon: '🏰',
        description: 'Four corner battlements, royal keep, and glowing neon moat',
        build: () => {
            const b: VoxelBrick[] = [];
            // Neon cyan moat rim
            for (let x = 3; x <= 12; x++) {
                for (let y = 3; y <= 12; y++) {
                    const isEdge = x === 3 || x === 12 || y === 3 || y === 12;
                    b.push({
                        x,
                        y,
                        z: 0,
                        color: isEdge ? '#00ffff' : '#475569',
                        material: isEdge ? 'neon' : 'lego'
                    });
                }
            }
            // 4 Corner Towers
            const corners = [
                [4, 4],
                [10, 4],
                [4, 10],
                [10, 10]
            ];
            for (const [cx, cy] of corners) {
                for (let z = 1; z <= 5; z++) {
                    for (let dx = 0; dx <= 1; dx++) {
                        for (let dy = 0; dy <= 1; dy++) {
                            b.push({ x: cx + dx, y: cy + dy, z, color: '#94a3b8', material: 'lego' });
                        }
                    }
                }
                b.push({ x: cx, y: cy, z: 6, color: '#ff007f', material: 'lego', shape: 'slope_s' });
                b.push({ x: cx + 1, y: cy + 1, z: 6, color: '#ffd700', material: 'gold', shape: 'cylinder' });
            }
            // Central Tall Keep
            for (let z = 1; z <= 7; z++) {
                for (let x = 7; x <= 8; x++) {
                    for (let y = 7; y <= 8; y++) {
                        b.push({ x, y, z, color: '#cbd5e1', material: 'lego' });
                    }
                }
            }
            b.push({ x: 7, y: 7, z: 8, color: '#ffd700', material: 'gold' });
            b.push({ x: 8, y: 8, z: 8, color: '#ffd700', material: 'gold' });
            return b;
        }
    },
    {
        id: 'mecha',
        name: 'Mecha Bot',
        icon: '🤖',
        description: 'Symmetrical retro anime robot with glowing visor & jetpack',
        build: () => {
            const b: VoxelBrick[] = [];
            // Legs
            for (let z = 0; z <= 3; z++) {
                b.push({ x: 7, y: 5, z, color: '#3b82f6', material: 'lego' });
                b.push({ x: 8, y: 5, z, color: '#3b82f6', material: 'lego' });
                b.push({ x: 7, y: 10, z, color: '#3b82f6', material: 'lego' });
                b.push({ x: 8, y: 10, z, color: '#3b82f6', material: 'lego' });
            }
            // Torso
            for (let z = 4; z <= 7; z++) {
                for (let x = 6; x <= 9; x++) {
                    for (let y = 5; y <= 10; y++) {
                        b.push({ x, y, z, color: '#ef4444', material: 'lego' });
                    }
                }
            }
            // Glowing Chest Core
            b.push({ x: 9, y: 7, z: 6, color: '#00ffff', material: 'neon' });
            b.push({ x: 9, y: 8, z: 6, color: '#00ffff', material: 'neon' });
            // Shoulders & Arms
            for (let z = 5; z <= 7; z++) {
                b.push({ x: 7, y: 3, z, color: '#eab308', material: 'gold' });
                b.push({ x: 7, y: 4, z, color: '#94a3b8', material: 'lego' });
                b.push({ x: 7, y: 12, z, color: '#eab308', material: 'gold' });
                b.push({ x: 7, y: 11, z, color: '#94a3b8', material: 'lego' });
            }
            // Head & Neon Visor
            for (let z = 8; z <= 10; z++) {
                for (let x = 7; x <= 8; x++) {
                    for (let y = 6; y <= 9; y++) {
                        const isVisor = z === 9 && x === 8 && (y === 7 || y === 8);
                        b.push({
                            x,
                            y,
                            z,
                            color: isVisor ? '#00ff88' : '#f8fafc',
                            material: isVisor ? 'neon' : 'lego'
                        });
                    }
                }
            }
            // Antennae
            b.push({ x: 7, y: 6, z: 11, color: '#ffd700', material: 'gold', shape: 'cylinder' });
            b.push({ x: 7, y: 9, z: 11, color: '#ffd700', material: 'gold', shape: 'cylinder' });
            return b;
        }
    },
    {
        id: 'racer',
        name: 'Arcade Racer',
        icon: '🏎️',
        description: 'OutRun-style red turbo supercar with glass cockpit & spoiler',
        build: () => {
            const b: VoxelBrick[] = [];
            // Wheels
            const wheels = [
                [4, 4],
                [11, 4],
                [4, 11],
                [11, 11]
            ];
            for (const [wx, wy] of wheels) {
                b.push({ x: wx, y: wy, z: 0, color: '#1e293b', material: 'smooth' });
                b.push({ x: wx, y: wy, z: 1, color: '#1e293b', material: 'smooth' });
            }
            // Chassis
            for (let x = 3; x <= 12; x++) {
                for (let y = 5; y <= 10; y++) {
                    b.push({ x, y, z: 1, color: '#dc2626', material: 'lego' });
                    if (x >= 5 && x <= 10) {
                        b.push({
                            x,
                            y,
                            z: 2,
                            color: x >= 7 && x <= 9 && y >= 6 && y <= 9 ? '#38bdf8' : '#ef4444',
                            material: x >= 7 && x <= 9 && y >= 6 && y <= 9 ? 'glass' : 'lego'
                        });
                    }
                }
            }
            // Headlights & Taillights
            b.push({ x: 12, y: 5, z: 1, color: '#fef08a', material: 'neon' });
            b.push({ x: 12, y: 10, z: 1, color: '#fef08a', material: 'neon' });
            b.push({ x: 3, y: 5, z: 2, color: '#ff0055', material: 'neon' });
            b.push({ x: 3, y: 10, z: 2, color: '#ff0055', material: 'neon' });
            // Rear Spoiler
            for (let y = 5; y <= 10; y++) {
                b.push({ x: 3, y, z: 3, color: '#facc15', material: 'gold' });
            }
            return b;
        }
    },
    {
        id: 'shrine',
        name: 'Sakura Shrine',
        icon: '⛩️',
        description: 'Crimson Torii gate with stone lanterns & cherry blossom tree',
        build: () => {
            const b: VoxelBrick[] = [];
            // Stone base
            for (let x = 3; x <= 12; x++) {
                for (let y = 3; y <= 12; y++) {
                    b.push({ x, y, z: 0, color: '#64748b', material: 'lego' });
                }
            }
            // Two Crimson Torii Pillars
            for (let z = 1; z <= 7; z++) {
                b.push({ x: 8, y: 5, z, color: '#dc2626', material: 'lego', shape: 'cylinder' });
                b.push({ x: 8, y: 10, z, color: '#dc2626', material: 'lego', shape: 'cylinder' });
            }
            // Crossbars (Kasagi & Nuki)
            for (let y = 4; y <= 11; y++) {
                b.push({ x: 8, y, z: 6, color: '#ef4444', material: 'lego' });
                b.push({ x: 8, y, z: 8, color: '#1e293b', material: 'smooth' });
            }
            b.push({ x: 8, y: 7, z: 7, color: '#ffd700', material: 'gold' });
            b.push({ x: 8, y: 8, z: 7, color: '#ffd700', material: 'gold' });
            // Sakura Tree in corner
            for (let z = 1; z <= 4; z++) {
                b.push({ x: 5, y: 5, z, color: '#78350f', material: 'lego' });
            }
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    b.push({ x: 5 + dx, y: 5 + dy, z: 5, color: '#f472b6', material: 'lego' });
                    if (Math.abs(dx) + Math.abs(dy) <= 1) {
                        b.push({ x: 5 + dx, y: 5 + dy, z: 6, color: '#fbcfe8', material: 'neon' });
                    }
                }
            }
            return b;
        }
    },
    {
        id: 'alien',
        name: '3D Pixel Alien',
        icon: '👾',
        description: 'Classic arcade space invader sculpted in glowing neon bricks',
        build: () => {
            const rows = [
                '  #     #  ',
                '   #   #   ',
                '  #######  ',
                ' ## ### ## ',
                '###########',
                '# ####### #',
                '# #     # #',
                '   ## ##   '
            ];
            const b: VoxelBrick[] = [];
            for (let r = 0; r < rows.length; r++) {
                const line = rows[rows.length - 1 - r];
                for (let c = 0; c < line.length; c++) {
                    if (line[c] === '#') {
                        const y = 2 + c;
                        const z = 1 + r;
                        b.push({ x: 7, y, z, color: '#00ff88', material: 'neon' });
                        b.push({ x: 8, y, z, color: '#10b981', material: 'lego' });
                    }
                }
            }
            return b;
        }
    },
    {
        id: 'crystal',
        name: 'Crystal Totem',
        icon: '💎',
        description: 'Translucent glass & neon floating crystal spire over gold altar',
        build: () => {
            const b: VoxelBrick[] = [];
            for (let x = 5; x <= 10; x++) {
                for (let y = 5; y <= 10; y++) {
                    b.push({ x, y, z: 0, color: '#ffd700', material: 'gold' });
                }
            }
            for (let z = 2; z <= 10; z++) {
                const rad = z <= 6 ? z - 2 : 10 - z;
                for (let dx = -rad; dx <= rad; dx++) {
                    for (let dy = -rad; dy <= rad; dy++) {
                        if (Math.abs(dx) + Math.abs(dy) <= rad) {
                            b.push({
                                x: 7 + dx,
                                y: 7 + dy,
                                z,
                                color: z % 2 === 0 ? '#00ffff' : '#c084fc',
                                material: Math.abs(dx) + Math.abs(dy) === 0 ? 'neon' : 'glass'
                            });
                        }
                    }
                }
            }
            return b;
        }
    },
    {
        id: 'cake',
        name: 'UwU Party Cake',
        icon: '🍰',
        description: 'Three-tier strawberry frosting cake with glowing candles',
        build: () => {
            const b: VoxelBrick[] = [];
            // Tier 1 (Bottom)
            for (let x = 4; x <= 11; x++) {
                for (let y = 4; y <= 11; y++) {
                    for (let z = 0; z <= 2; z++) {
                        b.push({
                            x,
                            y,
                            z,
                            color: z === 2 ? '#ffffff' : '#f472b6',
                            material: 'lego'
                        });
                    }
                }
            }
            // Tier 2 (Middle)
            for (let x = 5; x <= 10; x++) {
                for (let y = 5; y <= 10; y++) {
                    for (let z = 3; z <= 5; z++) {
                        b.push({
                            x,
                            y,
                            z,
                            color: z === 5 ? '#fef08a' : '#c084fc',
                            material: 'lego'
                        });
                    }
                }
            }
            // Candles
            const candles = [
                [6, 6],
                [9, 6],
                [6, 9],
                [9, 9],
                [7, 7]
            ];
            for (const [cx, cy] of candles) {
                b.push({ x: cx, y: cy, z: 6, color: '#ffffff', material: 'lego', shape: 'cylinder' });
                b.push({ x: cx, y: cy, z: 7, color: '#ffaa00', material: 'neon', shape: 'cylinder' });
            }
            return b;
        }
    }
];

// ============================================================================
// PERSONAL ART VAULT, CURATOR QUEUE & 25-SPOT MUSEUM STORAGE ENGINE
// ============================================================================

function createDefaultCuratedExhibits(): Record<number, ArtworkItem> {
    // Pre-populate 3 welcoming showcase pieces on Spots #11, #12, #13 in the Central Rotunda
    // if the museum has no saved state yet (they can be replaced anytime!)
    return {};
}

export function createEmptyMuseumState(): MuseumStateSnapshot {
    return {
        spots: createDefaultCuratedExhibits(),
        pendingQueue: [],
        artworksById: {}
    };
}

export function normalizeMuseumSnapshot(raw: any): MuseumStateSnapshot {
    const out = createEmptyMuseumState();
    if (!raw || typeof raw !== 'object') return out;

    if (raw.artworksById && typeof raw.artworksById === 'object') {
        for (const [id, item] of Object.entries(raw.artworksById)) {
            if (item && typeof item === 'object' && (item as any).id) {
                out.artworksById[id] = normalizeArtworkItem(item as ArtworkItem);
            }
        }
    }

    if (raw.spots && typeof raw.spots === 'object') {
        for (const [spotStr, item] of Object.entries(raw.spots)) {
            const spotNum = Number(spotStr);
            if (
                spotNum >= 1 &&
                spotNum <= MUSEUM_SPOT_COUNT &&
                item &&
                typeof item === 'object' &&
                (item as any).id
            ) {
                const norm = normalizeArtworkItem({
                    ...(item as ArtworkItem),
                    submissionStatus: 'exhibited'
                });
                out.spots[spotNum] = norm;
                out.artworksById[norm.id] = norm;
            }
        }
    }

    if (Array.isArray(raw.pendingQueue)) {
        const seen = new Set<string>();
        for (const item of raw.pendingQueue) {
            if (item && typeof item === 'object' && item.id && !seen.has(item.id)) {
                seen.add(item.id);
                const norm = normalizeArtworkItem({
                    ...item,
                    submissionStatus: 'pending_review'
                });
                out.pendingQueue.push(norm);
                out.artworksById[norm.id] = norm;
            }
        }
    }

    return out;
}

export function normalizeArtworkItem(item: Partial<ArtworkItem>): ArtworkItem {
    const nowIso = new Date().toISOString();
    const cleanUser = cleanMuseumUsername(item.artistUsername) || 'artist';
    return {
        id: String(item.id || `art_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
        artType: item.artType === '3d' ? '3d' : '2d',
        title: String(item.title || 'Untitled Masterpiece').slice(0, 44),
        description: String(item.description || '').slice(0, 140),
        artistId: String(item.artistId || cleanUser),
        artistUsername: cleanUser,
        artistDisplayName: String(item.artistDisplayName || cleanUser),
        artistAvatarUrl: String(item.artistAvatarUrl || '/unicorn.png'),
        signatureDataUrl: item.signatureDataUrl || null,
        frameStyle: (['gold', 'obsidian', 'neon', 'frameless'].includes(item.frameStyle as string)
            ? item.frameStyle
            : 'gold') as FrameStyle,
        imageDataUrl: String(item.imageDataUrl || ''),
        voxels: Array.isArray(item.voxels) ? item.voxels : undefined,
        gridSize: item.gridSize || VOXEL_GRID_SIZE,
        likes: Array.from(new Set(Array.isArray(item.likes) ? item.likes.map(cleanMuseumUsername).filter(Boolean) : [])),
        submissionStatus: item.submissionStatus || 'vault',
        createdAt: item.createdAt || nowIso,
        updatedAt: item.updatedAt || nowIso
    };
}

/**
 * Loads personal local vault items for a specific user so their art is backed up in localStorage as well
 */
export function loadLocalPersonalVault(username: string): Record<string, ArtworkItem> {
    const cleanUser = cleanMuseumUsername(username);
    if (!cleanUser || typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(`${LOCAL_PERSONAL_VAULT_PREFIX}${cleanUser}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                const map: Record<string, ArtworkItem> = {};
                for (const [k, v] of Object.entries(parsed)) {
                    if (v && typeof v === 'object') {
                        map[k] = normalizeArtworkItem(v as ArtworkItem);
                    }
                }
                return map;
            }
        }
    } catch {}
    return {};
}

export function saveLocalPersonalVault(username: string, vaultMap: Record<string, ArtworkItem>) {
    const cleanUser = cleanMuseumUsername(username);
    if (!cleanUser || typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${LOCAL_PERSONAL_VAULT_PREFIX}${cleanUser}`, JSON.stringify(vaultMap));
    } catch {}
}

/**
 * Merges two MuseumStateSnapshots without ever losing personal artworks
 */
export function mergeMuseumSnapshots(
    a: MuseumStateSnapshot | null | undefined,
    b: MuseumStateSnapshot | null | undefined
): MuseumStateSnapshot {
    const normA = normalizeMuseumSnapshot(a);
    const normB = normalizeMuseumSnapshot(b);
    const out = createEmptyMuseumState();

    // 1. Merge global artworks registry (newest updatedAt wins)
    const allIds = new Set([...Object.keys(normA.artworksById), ...Object.keys(normB.artworksById)]);
    for (const id of allIds) {
        const itemA = normA.artworksById[id];
        const itemB = normB.artworksById[id];
        if (itemA && itemB) {
            const tsA = new Date(itemA.updatedAt).getTime() || 0;
            const tsB = new Date(itemB.updatedAt).getTime() || 0;
            const newer = tsA >= tsB ? itemA : itemB;
            const mergedLikes = Array.from(new Set([...itemA.likes, ...itemB.likes]));
            out.artworksById[id] = { ...newer, likes: mergedLikes };
        } else {
            out.artworksById[id] = (itemA || itemB)!;
        }
    }

    // 2. Use authoritative spots from primary snapshot (a), falling back to (b)
    const hasPrimarySpots = a && a.spots && Object.keys(a.spots).length > 0;
    const spotsSource = hasPrimarySpots ? normA.spots : { ...normB.spots, ...normA.spots };
    for (const [spotStr, item] of Object.entries(spotsSource)) {
        const spotNum = Number(spotStr);
        if (spotNum >= 1 && spotNum <= MUSEUM_SPOT_COUNT && item) {
            const latest = out.artworksById[item.id] || item;
            const exhibited = { ...latest, submissionStatus: 'exhibited' as const };
            out.spots[spotNum] = exhibited;
            out.artworksById[exhibited.id] = exhibited;
        }
    }

    // 3. Merge pending queue (excluding any artwork already exhibited on a spot)
    const exhibitedIds = new Set(Object.values(out.spots).map((s) => s.id));
    const queueMap = new Map<string, ArtworkItem>();
    for (const qItem of [...normA.pendingQueue, ...normB.pendingQueue]) {
        if (!qItem || exhibitedIds.has(qItem.id)) continue;
        if (!queueMap.has(qItem.id)) {
            const latest = out.artworksById[qItem.id] || qItem;
            queueMap.set(qItem.id, { ...latest, submissionStatus: 'pending_review' });
        }
    }
    out.pendingQueue = Array.from(queueMap.values());

    return out;
}

/**
 * Loads the complete Museum state from Supabase (`uwu_graffiti_wall` row `museum_exhibits_v1`) + localStorage
 */
export async function loadMuseumState(currentUsername?: string): Promise<MuseumStateSnapshot> {
    let localSnap = createEmptyMuseumState();
    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_MUSEUM_STATE_KEY);
            if (raw) {
                localSnap = normalizeMuseumSnapshot(JSON.parse(raw));
            }
        } catch {}
    }

    if (currentUsername) {
        const personalMap = loadLocalPersonalVault(currentUsername);
        for (const [id, art] of Object.entries(personalMap)) {
            if (!localSnap.artworksById[id]) {
                localSnap.artworksById[id] = art;
            }
        }
    }

    try {
        const { data, error } = await supabase
            .from('uwu_graffiti_wall')
            .select('id, pixels, updated_at')
            .eq('id', SUPABASE_MUSEUM_ROW_ID)
            .maybeSingle();

        if (!error && data?.pixels) {
            const remoteSnap = normalizeMuseumSnapshot(data.pixels);
            const merged = mergeMuseumSnapshots(remoteSnap, localSnap);
            persistMuseumStateLocally(merged, currentUsername);
            return merged;
        }
    } catch {}

    return localSnap;
}

export function persistMuseumStateLocally(snapshot: MuseumStateSnapshot, currentUsername?: string) {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(LOCAL_MUSEUM_STATE_KEY, JSON.stringify(snapshot));
    } catch {}

    if (currentUsername) {
        const cleanUser = cleanMuseumUsername(currentUsername);
        const existingPersonal = loadLocalPersonalVault(cleanUser);
        for (const art of Object.values(snapshot.artworksById)) {
            if (cleanMuseumUsername(art.artistUsername) === cleanUser) {
                existingPersonal[art.id] = art;
            }
        }
        saveLocalPersonalVault(cleanUser, existingPersonal);
    }
}

export async function persistMuseumStateToSupabase(
    snapshot: MuseumStateSnapshot,
    actorUsername: string
): Promise<MuseumStateSnapshot> {
    const cleanActor = cleanMuseumUsername(actorUsername) || 'curator';
    persistMuseumStateLocally(snapshot, cleanActor);

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: SUPABASE_MUSEUM_ROW_ID,
                pixels: snapshot,
                updated_by: cleanActor,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}

    return snapshot;
}

/**
 * Returns all artworks belonging to a specific user (Personal Art Inventory / Vault),
 * annotated with their live status (on Spot #N, in Pending Queue, or in Personal Vault).
 */
export function getMyPersonalArtworks(
    username: string,
    snapshot: MuseumStateSnapshot
): Array<{ artwork: ArtworkItem; activeSpotNumber: number | null; inPendingQueue: boolean }> {
    const cleanUser = cleanMuseumUsername(username);
    if (!cleanUser) return [];

    const byId = new Map<string, ArtworkItem>();
    const localVault = loadLocalPersonalVault(cleanUser);
    for (const art of Object.values(localVault)) {
        if (cleanMuseumUsername(art.artistUsername) === cleanUser) {
            byId.set(art.id, art);
        }
    }
    for (const art of Object.values(snapshot.artworksById)) {
        if (cleanMuseumUsername(art.artistUsername) === cleanUser) {
            byId.set(art.id, art);
        }
    }
    for (const art of Object.values(snapshot.spots)) {
        if (art && cleanMuseumUsername(art.artistUsername) === cleanUser) {
            byId.set(art.id, art);
        }
    }
    for (const art of snapshot.pendingQueue) {
        if (art && cleanMuseumUsername(art.artistUsername) === cleanUser) {
            byId.set(art.id, art);
        }
    }

    const spotByArtId = new Map<string, number>();
    for (const [spotStr, art] of Object.entries(snapshot.spots)) {
        if (art) spotByArtId.set(art.id, Number(spotStr));
    }
    const pendingSet = new Set(snapshot.pendingQueue.map((q) => q.id));

    return Array.from(byId.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((artwork) => ({
            artwork,
            activeSpotNumber: spotByArtId.get(artwork.id) ?? null,
            inPendingQueue: pendingSet.has(artwork.id)
        }));
}

/**
 * Finds which spot (1..25) a user currently occupies, if any
 */
export function findPlayerActiveSpot(username: string, snapshot: MuseumStateSnapshot): number | null {
    const cleanUser = cleanMuseumUsername(username);
    if (!cleanUser) return null;
    for (const [spotStr, art] of Object.entries(snapshot.spots)) {
        if (art && cleanMuseumUsername(art.artistUsername) === cleanUser) {
            return Number(spotStr);
        }
    }
    return null;
}

/**
 * Finds the first open pedestal spot (1..25), or null if all 25 spots are occupied
 */
export function findFirstOpenSpot(snapshot: MuseumStateSnapshot): number | null {
    for (let i = 1; i <= MUSEUM_SPOT_COUNT; i++) {
        if (!snapshot.spots[i]) return i;
    }
    return null;
}

/**
 * Saves an artwork into the player's Permanent Personal Art Vault (0 $UWU).
 * If the artwork is already on a pedestal or in the pending queue, updates it in-place as well!
 */
export async function saveArtworkToPersonalVault(
    artwork: ArtworkItem,
    currentSnapshot?: MuseumStateSnapshot
): Promise<{ snapshot: MuseumStateSnapshot; saved: ArtworkItem }> {
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(artwork.artistUsername);
    const norm = normalizeArtworkItem({
        ...artwork,
        updatedAt: new Date().toISOString()
    });

    snap.artworksById[norm.id] = norm;

    // Also update live pedestal if this artwork is currently exhibited
    for (const [spotStr, spotArt] of Object.entries(snap.spots)) {
        if (spotArt && spotArt.id === norm.id) {
            snap.spots[Number(spotStr)] = { ...norm, submissionStatus: 'exhibited' };
        }
    }

    // Also update pending queue if this artwork is in the queue
    snap.pendingQueue = snap.pendingQueue.map((q) =>
        q.id === norm.id ? { ...norm, submissionStatus: 'pending_review' } : q
    );

    await persistMuseumStateToSupabase(snap, norm.artistUsername);
    return { snapshot: snap, saved: norm };
}

/**
 * Exhibits an artwork onto a Museum Pedestal Spot (#1..#25).
 * - Enforces 1 active spot per regular player (vacates their previous spot automatically while keeping the old piece in their Personal Vault).
 * - Admin @0xsha3 can exhibit on any number of spots and can overwrite any occupied spot (returning the displaced artwork safely to its creator's Personal Vault).
 */
export async function exhibitArtworkOnSpot(
    artwork: ArtworkItem,
    spotNumber: number,
    actorUsername: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<{
    ok: boolean;
    error?: string;
    snapshot: MuseumStateSnapshot;
    chargedFee: boolean;
}> {
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(actorUsername);
    const cleanActor = cleanMuseumUsername(actorUsername);
    const isAdmin = isMuseumCuratorAdmin(cleanActor);

    if (spotNumber < 1 || spotNumber > MUSEUM_SPOT_COUNT) {
        return { ok: false, error: 'Invalid pedestal spot number (#1 - #25).', snapshot: snap, chargedFee: false };
    }

    const existingOnSpot = snap.spots[spotNumber];
    if (
        existingOnSpot &&
        cleanMuseumUsername(existingOnSpot.artistUsername) !== cleanActor &&
        !isAdmin
    ) {
        return {
            ok: false,
            error: `Spot #${spotNumber} is currently occupied by @${existingOnSpot.artistUsername}. Pick an open spot or submit to the Curator Queue!`,
            snapshot: snap,
            chargedFee: false
        };
    }

    let alreadyHeldSpot = false;
    // If regular player (not @0xsha3), enforce 1 active spot per player by moving/vacating their previous spot
    if (!isAdmin) {
        for (const [spotStr, spotArt] of Object.entries(snap.spots)) {
            const sNum = Number(spotStr);
            if (spotArt && cleanMuseumUsername(spotArt.artistUsername) === cleanActor) {
                alreadyHeldSpot = true;
                if (sNum !== spotNumber) {
                    // Return previous artwork safely to Personal Vault
                    snap.artworksById[spotArt.id] = { ...spotArt, submissionStatus: 'vault' };
                    delete snap.spots[sNum];
                }
            }
        }
    }

    // If @0xsha3 replaces another player's spot, ensure the displaced artwork remains intact in artworksById
    if (existingOnSpot && existingOnSpot.id !== artwork.id) {
        snap.artworksById[existingOnSpot.id] = {
            ...existingOnSpot,
            submissionStatus: 'vault'
        };
    }

    const exhibited = normalizeArtworkItem({
        ...artwork,
        submissionStatus: 'exhibited',
        updatedAt: new Date().toISOString()
    });

    snap.spots[spotNumber] = exhibited;
    snap.artworksById[exhibited.id] = exhibited;
    // Remove from pendingQueue if it was waiting in the queue
    snap.pendingQueue = snap.pendingQueue.filter((q) => q.id !== exhibited.id);

    await persistMuseumStateToSupabase(snap, cleanActor);

    return {
        ok: true,
        snapshot: snap,
        chargedFee: !isAdmin && !alreadyHeldSpot
    };
}

/**
 * Submits an artwork to the Undecided / Curator Submissions Queue so @0xsha3 can review and place it
 */
export async function submitArtworkToCuratorQueue(
    artwork: ArtworkItem,
    currentSnapshot?: MuseumStateSnapshot
): Promise<MuseumStateSnapshot> {
    const snap = currentSnapshot
        ? normalizeMuseumSnapshot(currentSnapshot)
        : await loadMuseumState(artwork.artistUsername);

    const queued = normalizeArtworkItem({
        ...artwork,
        submissionStatus: 'pending_review',
        updatedAt: new Date().toISOString()
    });

    snap.artworksById[queued.id] = queued;
    const existsIdx = snap.pendingQueue.findIndex((q) => q.id === queued.id);
    if (existsIdx >= 0) {
        snap.pendingQueue[existsIdx] = queued;
    } else {
        snap.pendingQueue = [queued, ...snap.pendingQueue];
    }

    await persistMuseumStateToSupabase(snap, queued.artistUsername);
    return snap;
}

/**
 * Curator (@0xsha3) approves a submission (or any vault artwork) and places it onto targetSpotNumber (#1..#25)
 */
export async function curatorApproveSubmissionToSpot(
    artworkId: string,
    targetSpotNumber: number,
    curatorUsername: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<{ ok: boolean; error?: string; snapshot: MuseumStateSnapshot }> {
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(curatorUsername);
    if (!isMuseumCuratorAdmin(curatorUsername)) {
        return { ok: false, error: 'Only Curator @0xsha3 can approve submissions onto museum spots.', snapshot: snap };
    }

    const art =
        snap.pendingQueue.find((q) => q.id === artworkId) || snap.artworksById[artworkId];
    if (!art) {
        return { ok: false, error: 'Artwork not found in queue or vault.', snapshot: snap };
    }

    const res = await exhibitArtworkOnSpot(art, targetSpotNumber, curatorUsername, snap);
    return { ok: res.ok, error: res.error, snapshot: res.snapshot };
}

/**
 * Removes an artwork from the Undecided Queue while keeping it safely in the creator's Personal Art Vault
 */
export async function removeArtworkFromCuratorQueue(
    artworkId: string,
    actorUsername: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<MuseumStateSnapshot> {
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(actorUsername);
    const item = snap.pendingQueue.find((q) => q.id === artworkId);
    if (item) {
        snap.artworksById[item.id] = { ...item, submissionStatus: 'vault' };
    }
    snap.pendingQueue = snap.pendingQueue.filter((q) => q.id !== artworkId);
    await persistMuseumStateToSupabase(snap, actorUsername);
    return snap;
}

/**
 * Vacates a Museum Pedestal Spot (#1..#25), returning the artwork safely to its creator's Personal Art Vault
 */
export async function vacateMuseumSpot(
    spotNumber: number,
    actorUsername: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<MuseumStateSnapshot> {
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(actorUsername);
    const cleanActor = cleanMuseumUsername(actorUsername);
    const isAdmin = isMuseumCuratorAdmin(cleanActor);

    const current = snap.spots[spotNumber];
    if (!current) return snap;

    if (cleanMuseumUsername(current.artistUsername) !== cleanActor && !isAdmin) {
        return snap;
    }

    // Keep safely in creator's Personal Art Vault!
    snap.artworksById[current.id] = {
        ...current,
        submissionStatus: 'vault',
        updatedAt: new Date().toISOString()
    };
    delete snap.spots[spotNumber];

    await persistMuseumStateToSupabase(snap, cleanActor);
    return snap;
}

/**
 * Deletes an artwork from the creator's own Personal Art Vault (only if explicitly requested by its creator)
 */
export async function deleteArtworkFromPersonalVault(
    artworkId: string,
    ownerUsername: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<MuseumStateSnapshot> {
    const cleanOwner = cleanMuseumUsername(ownerUsername);
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(cleanOwner);
    const art = snap.artworksById[artworkId];

    if (art && cleanMuseumUsername(art.artistUsername) !== cleanOwner && !isMuseumCuratorAdmin(cleanOwner)) {
        return snap;
    }

    for (const [spotStr, spotArt] of Object.entries(snap.spots)) {
        if (spotArt && spotArt.id === artworkId) {
            delete snap.spots[Number(spotStr)];
        }
    }
    snap.pendingQueue = snap.pendingQueue.filter((q) => q.id !== artworkId);
    delete snap.artworksById[artworkId];

    const localVault = loadLocalPersonalVault(cleanOwner);
    delete localVault[artworkId];
    saveLocalPersonalVault(cleanOwner, localVault);

    await persistMuseumStateToSupabase(snap, cleanOwner);
    return snap;
}

/**
 * Toggles an Applaud / Like on an artwork (works for both Pedestal Exhibits and Pending Queue items)
 */
export async function toggleMuseumArtworkLike(
    artworkId: string,
    username: string,
    currentSnapshot?: MuseumStateSnapshot
): Promise<{ snapshot: MuseumStateSnapshot; liked: boolean; count: number }> {
    const cleanUser = cleanMuseumUsername(username);
    const snap = currentSnapshot ? normalizeMuseumSnapshot(currentSnapshot) : await loadMuseumState(cleanUser);
    if (!cleanUser) return { snapshot: snap, liked: false, count: 0 };

    let target: ArtworkItem | undefined = snap.artworksById[artworkId];
    if (!target) {
        target = Object.values(snap.spots).find((s) => s.id === artworkId) ||
            snap.pendingQueue.find((q) => q.id === artworkId);
    }
    if (!target) return { snapshot: snap, liked: false, count: 0 };

    const hasLiked = target.likes.includes(cleanUser);
    const nextLikes = hasLiked
        ? target.likes.filter((u) => u !== cleanUser)
        : [...target.likes, cleanUser];
    const updated: ArtworkItem = {
        ...target,
        likes: nextLikes
    };

    snap.artworksById[artworkId] = updated;
    for (const [spotStr, spotArt] of Object.entries(snap.spots)) {
        if (spotArt && spotArt.id === artworkId) {
            snap.spots[Number(spotStr)] = updated;
        }
    }
    snap.pendingQueue = snap.pendingQueue.map((q) => (q.id === artworkId ? updated : q));

    await persistMuseumStateToSupabase(snap, cleanUser);
    return { snapshot: snap, liked: !hasLiked, count: nextLikes.length };
}
