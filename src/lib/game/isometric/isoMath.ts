// src/lib/game/isometric/isoMath.ts
/**
 * Isometric Math and Coordinate Projection for UwU World
 * Uses standard 2:1 diamond isometric projection (Habbo / SimCity 2000 style)
 */

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

export interface ScreenPos {
    x: number;
    y: number;
}

export interface GridPos {
    x: number;
    y: number;
    z?: number;
}

export type IsoDirection = 'NE' | 'SE' | 'SW' | 'NW';

/**
 * Projects continuous 3D grid coordinates (gx, gy, gz) into 2D canvas screen pixels.
 */
export function gridToScreen(
    gx: number,
    gy: number,
    gz = 0,
    cameraX = 0,
    cameraY = 0,
    canvasW = 800,
    canvasH = 600
): ScreenPos {
    const originX = canvasW / 2 - cameraX;
    const originY = canvasH / 2 - cameraY;

    const screenX = (gx - gy) * (TILE_WIDTH / 2) + originX;
    const screenY = (gx + gy) * (TILE_HEIGHT / 2) - gz * TILE_HEIGHT + originY;

    return { x: screenX, y: screenY };
}

/**
 * Unprojects 2D canvas screen pixels into continuous isometric grid coordinates (gx, gy) at ground level (z=0).
 */
export function screenToGrid(
    screenX: number,
    screenY: number,
    cameraX = 0,
    cameraY = 0,
    canvasW = 800,
    canvasH = 600
): GridPos {
    const originX = canvasW / 2 - cameraX;
    const originY = canvasH / 2 - cameraY;

    const relX = screenX - originX;
    const relY = screenY - originY;

    const gx = (relX / (TILE_WIDTH / 2) + relY / (TILE_HEIGHT / 2)) / 2;
    const gy = (relY / (TILE_HEIGHT / 2) - relX / (TILE_WIDTH / 2)) / 2;

    return { x: gx, y: gy, z: 0 };
}

/**
 * Robust Depth Sorting Metric:
 * Ensures objects in the foreground (higher X and Y coordinates) occlude background tiles & objects.
 */
export function calculateDepth(gx: number, gy: number, gz = 0, offset = 0): number {
    return (gx + gy) * 1000 + gz * 100 + offset;
}

/**
 * Euclidean distance on the isometric grid.
 */
export function gridDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.hypot(x1 - x2, y1 - y2);
}

/**
 * Linear interpolation helper
 */
export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

/**
 * Angle interpolation helper (handles radian wrapping)
 */
export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

/**
 * Determines 4-way isometric direction from vector (dx, dy)
 */
export function getIsoDirection(dx: number, dy: number, fallback: IsoDirection = 'SE'): IsoDirection {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;

    // In grid space:
    // +x is South-East
    // +y is South-West
    // -x is North-West
    // -y is North-East
    if (dx >= 0 && dy >= 0) {
        return dx >= dy ? 'SE' : 'SW';
    } else if (dx >= 0 && dy < 0) {
        return 'NE';
    } else if (dx < 0 && dy >= 0) {
        return 'NW';
    } else {
        return Math.abs(dx) >= Math.abs(dy) ? 'NW' : 'NE';
    }
}
