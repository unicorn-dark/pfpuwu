// src/lib/game/isometric/worldMap.ts
/**
 * Rich 32x32 Isometric World Map & Corner-Free Collision Engine for UwU World
 * Features:
 * - Mathematically exact tile alignment: tile (x, y) spans [x, x+1] x [y, y+1] with center at (x + 0.5, y + 0.5)
 * - Offscreen static floor & 3D perimeter wall caching for 60FPS zero-lag rendering
 * - Circle-vs-AABB corner-sliding physics so characters never snag on corners or get stuck
 * - Symmetric Casino Pit layouts for Dice Duel, Meme Roulette, Cyber Blackjack 21, and Lucky Slots
 */

import { TILE_WIDTH, TILE_HEIGHT, gridToScreen, clamp } from './isoMath';

export const MAP_SIZE = 32;

export enum TileType {
    EMPTY = 0,
    CARPET_TEAL = 1,
    CARPET_PURPLE = 2,
    CHECKER_LIGHT = 3,
    CHECKER_DARK = 4,
    MARBLE_WHITE = 5,
    WOOD_PARQUET = 6,
    CASINO_FELT = 7,
    STEEL_GRID = 8,
    WATER = 9,
    DOCK_WOOD = 10,
    WALL_BRICK = 11,
    GOLD_BORDER = 12,
    ROULETTE_MAT = 13,
    DICE_SEAT = 14,
    VIP_WALKWAY = 15
}

export interface WorldObject {
    id: string;
    type:
        | 'banner_sign'
        | 'dice_table'
        | 'roulette_wheel'
        | 'blackjack_table'
        | 'slot_machine'
        | 'vault'
        | 'pressure_pad'
        | 'dj_booth'
        | 'sofa'
        | 'palm_tree'
        | 'arcade'
        | 'bar_counter'
        | 'graffiti_wall'
        | 'fountain'
        | 'street_lamp'
        | 'vip_pillar';
    x: number;
    y: number;
    z?: number;
    width: number;
    height: number;
    depthOffset?: number;
    title?: string;
    subtitle?: string;
    badgeColor?: string;
    solidTiles?: Array<{ x: number; y: number }>;
    data?: any;
}

export interface ZoneTrigger {
    id: string;
    name: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    type: 'casino' | 'nightclub' | 'plaza' | 'vault' | 'arcade';
}

// 32x32 Grid Definitions
export const WORLD_TILES: number[][] = [];
export const COLLISION_MAP: boolean[][] = [];
export const ANIMATED_TILE_COORDS: Array<{ x: number; y: number; type: TileType }> = [];

// Initialize 32x32 Grid
for (let y = 0; y < MAP_SIZE; y++) {
    WORLD_TILES[y] = [];
    COLLISION_MAP[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
        // Outer Boundaries
        if (x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1) {
            WORLD_TILES[y][x] = TileType.WALL_BRICK;
            COLLISION_MAP[y][x] = true;
            continue;
        }

        // Zone 1: Cyber Nightclub & DJ Stage (North: y: 1..9, x: 8..24)
        if (y <= 9 && x >= 8 && x <= 24) {
            if (x >= 11 && x <= 21 && y >= 4 && y <= 8) {
                WORLD_TILES[y][x] = (x + y) % 2 === 0 ? TileType.CHECKER_LIGHT : TileType.CHECKER_DARK;
            } else if (x === 16 && y === 9) {
                WORLD_TILES[y][x] = TileType.VIP_WALKWAY;
            } else {
                WORLD_TILES[y][x] = TileType.CARPET_TEAL;
            }
            COLLISION_MAP[y][x] = false;
            continue;
        }

        // Zone 2: Bank Vault (West: x: 1..8, y: 10..22)
        if (x <= 8 && y >= 10 && y <= 22) {
            if (x >= 3 && x <= 7 && y >= 13 && y <= 19) {
                WORLD_TILES[y][x] = TileType.GOLD_BORDER;
            } else {
                WORLD_TILES[y][x] = TileType.STEEL_GRID;
            }
            COLLISION_MAP[y][x] = false;
            continue;
        }

        // Zone 3: 90s Arcade & Graffiti Alley (East: x: 23..30, y: 10..22)
        if (x >= 23 && y >= 10 && y <= 22) {
            WORLD_TILES[y][x] = TileType.WOOD_PARQUET;
            COLLISION_MAP[y][x] = false;
            continue;
        }

        // Zone 4: Central Plaza & Water Fountain (South: y: 22..30, x: 9..23)
        if (y >= 22 && x >= 9 && x <= 23) {
            if (x >= 15 && x <= 16 && y >= 25 && y <= 26) {
                WORLD_TILES[y][x] = TileType.WATER;
                COLLISION_MAP[y][x] = true;
            } else if (x >= 14 && x <= 17 && y >= 24 && y <= 27) {
                WORLD_TILES[y][x] = TileType.GOLD_BORDER;
                COLLISION_MAP[y][x] = false;
            } else {
                WORLD_TILES[y][x] = TileType.MARBLE_WHITE;
                COLLISION_MAP[y][x] = false;
            }
            continue;
        }

        // Zone 5: Central High Roller Casino Lounge (Center: x: 9..22, y: 10..21)
        if (x >= 9 && x <= 22 && y >= 10 && y <= 21) {
            // Central VIP Red/Gold Walkway at x = 15..16
            if ((x === 15 || x === 16) && y >= 10 && y <= 21) {
                WORLD_TILES[y][x] = TileType.VIP_WALKWAY;
            }
            // Dice Duel Pit around (12, 14):
            // 4 Symmetric Player Seats flush with the 4 edges of tile (12, 14)
            else if (
                (x === 11 && y === 14) || // P1 (NW)
                (x === 13 && y === 14) || // P2 (SE)
                (x === 12 && y === 13) || // P3 (NE)
                (x === 12 && y === 15)    // P4 (SW)
            ) {
                WORLD_TILES[y][x] = TileType.DICE_SEAT;
            }
            // Corner Gold Borders of Dice Pit & Blackjack Pit & Roulette Pit
            else if (
                (x >= 11 && x <= 13 && y >= 13 && y <= 15) ||
                (x >= 11 && x <= 13 && y >= 17 && y <= 19) ||
                (x >= 18 && x <= 20 && y >= 12 && y <= 14)
            ) {
                WORLD_TILES[y][x] = TileType.GOLD_BORDER;
            }
            // 6 Meme Roulette Betting Mats at x: 18..20, y: 15..16
            else if (x >= 18 && x <= 20 && y >= 15 && y <= 16) {
                WORLD_TILES[y][x] = TileType.ROULETTE_MAT;
            } else {
                WORLD_TILES[y][x] = TileType.CASINO_FELT;
            }
            COLLISION_MAP[y][x] = false;
            continue;
        }

        WORLD_TILES[y][x] = TileType.CARPET_PURPLE;
        COLLISION_MAP[y][x] = false;
    }
}

// Collect animated tiles for fast partial redraws
for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
        const t = WORLD_TILES[y][x];
        if (
            t === TileType.CHECKER_LIGHT ||
            t === TileType.CHECKER_DARK ||
            t === TileType.WATER ||
            t === TileType.DICE_SEAT
        ) {
            ANIMATED_TILE_COORDS.push({ x, y, type: t });
        }
    }
}

// Interactive & Decorative World Objects with Explicit, Tight Tile Collision Footprints
export const WORLD_OBJECTS: WorldObject[] = [
    // --- 3D ISOMETRIC DISTRICT ARCHWAYS / BILLBOARDS ---
    {
        id: 'banner-casino',
        type: 'banner_sign',
        x: 15.5,
        y: 10.2,
        width: 4.5,
        height: 0.6,
        depthOffset: -120,
        title: 'HIGH ROLLER CASINO',
        subtitle: 'CRAPS • ROULETTE • BLACKJACK • SLOTS',
        badgeColor: '#ffd700',
        solidTiles: []
    },
    {
        id: 'banner-club',
        type: 'banner_sign',
        x: 16.0,
        y: 1.8,
        width: 4.5,
        height: 0.6,
        depthOffset: -120,
        title: 'CYBER NIGHTCLUB',
        subtitle: 'LIVE 8-BIT SYNTH DJ & DANCE FLOOR',
        badgeColor: '#00ffff',
        solidTiles: []
    },
    {
        id: 'banner-vault',
        type: 'banner_sign',
        x: 5.5,
        y: 10.2,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: 'ARMORED BANK VAULT',
        subtitle: 'CO-OP PAD HEIST & LASER HACK',
        badgeColor: '#ff3366',
        solidTiles: []
    },
    {
        id: 'banner-arcade',
        type: 'banner_sign',
        x: 26.5,
        y: 10.2,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: '90s RETRO ARCADE',
        subtitle: 'CABINETS & LIVE PIXEL MURAL',
        badgeColor: '#ff00ff',
        solidTiles: []
    },

    // --- CASINO DISTRICT ---
    // 1. 3D Craps / Dice Duel Table centered on tile (12, 14) -> (12.5, 14.5)
    // Surrounded by P1 (11,14), P2 (13,14), P3 (12,13), P4 (12,15)
    {
        id: 'dice-duel-table',
        type: 'dice_table',
        x: 12.5,
        y: 14.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 12, y: 14 }],
        data: { active: true }
    },
    // 2. 3D Meme Roulette Wheel centered on tile (19, 13) -> (19.5, 13.5)
    {
        id: 'meme-roulette-wheel',
        type: 'roulette_wheel',
        x: 19.5,
        y: 13.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 19, y: 13 }]
    },
    // 3. 3D Cyber Blackjack 21 Table centered on tile (12, 18) -> (12.5, 18.5)
    {
        id: 'blackjack-table',
        type: 'blackjack_table',
        x: 12.5,
        y: 18.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 12, y: 18 }]
    },
    // 4. 3D Golden UwU Slot Machines at (16.5, 12.5) and (21.5, 13.5)
    {
        id: 'slot-machine-1',
        type: 'slot_machine',
        x: 21.5,
        y: 13.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 21, y: 13 }]
    },
    {
        id: 'slot-machine-2',
        type: 'slot_machine',
        x: 21.5,
        y: 15.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 21, y: 15 }]
    },
    // Casino VIP Sofas & Pillars
    {
        id: 'casino-sofa-1',
        type: 'sofa',
        x: 9.5,
        y: 20.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 9, y: 20 }]
    },
    {
        id: 'vip-pillar-1',
        type: 'vip_pillar',
        x: 14.5,
        y: 11.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 14, y: 11 }]
    },
    {
        id: 'vip-pillar-2',
        type: 'vip_pillar',
        x: 17.5,
        y: 11.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 17, y: 11 }]
    },

    // --- CYBER NIGHTCLUB ---
    {
        id: 'dj-stage',
        type: 'dj_booth',
        x: 16.0,
        y: 2.5,
        width: 2.0,
        height: 1.0,
        solidTiles: [
            { x: 15, y: 2 },
            { x: 16, y: 2 }
        ],
        data: { activeTrack: 1 }
    },
    {
        id: 'bar-1',
        type: 'bar_counter',
        x: 9.5,
        y: 4.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 9, y: 4 }]
    },

    // --- CENTRAL PLAZA ---
    {
        id: 'central-fountain',
        type: 'fountain',
        x: 16.0,
        y: 26.0,
        width: 2.0,
        height: 2.0,
        solidTiles: [
            { x: 15, y: 25 },
            { x: 16, y: 25 },
            { x: 15, y: 26 },
            { x: 16, y: 26 }
        ]
    },
    {
        id: 'lamp-1',
        type: 'street_lamp',
        x: 12.5,
        y: 24.5,
        width: 0.5,
        height: 0.5,
        solidTiles: [{ x: 12, y: 24 }]
    },
    {
        id: 'lamp-2',
        type: 'street_lamp',
        x: 19.5,
        y: 24.5,
        width: 0.5,
        height: 0.5,
        solidTiles: [{ x: 19, y: 24 }]
    },
    {
        id: 'tree-1',
        type: 'palm_tree',
        x: 11.5,
        y: 28.5,
        width: 0.7,
        height: 0.7,
        solidTiles: [{ x: 11, y: 28 }]
    },
    {
        id: 'tree-2',
        type: 'palm_tree',
        x: 20.5,
        y: 28.5,
        width: 0.7,
        height: 0.7,
        solidTiles: [{ x: 20, y: 28 }]
    },

    // --- BANK VAULT ---
    {
        id: 'the-vault-door',
        type: 'vault',
        x: 5.5,
        y: 16.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 5, y: 16 }],
        data: { unlocked: false }
    },
    { id: 'pad-1', type: 'pressure_pad', x: 4.5, y: 14.5, width: 0.8, height: 0.8, solidTiles: [], data: { index: 1, pressed: false } },
    { id: 'pad-2', type: 'pressure_pad', x: 6.5, y: 14.5, width: 0.8, height: 0.8, solidTiles: [], data: { index: 2, pressed: false } },
    { id: 'pad-3', type: 'pressure_pad', x: 4.5, y: 18.5, width: 0.8, height: 0.8, solidTiles: [], data: { index: 3, pressed: false } },
    { id: 'pad-4', type: 'pressure_pad', x: 6.5, y: 18.5, width: 0.8, height: 0.8, solidTiles: [], data: { index: 4, pressed: false } },

    // --- ARCADE & GRAFFITI ALLEY ---
    {
        id: 'graffiti-billboard',
        type: 'graffiti_wall',
        x: 27.5,
        y: 16.5,
        width: 2.0,
        height: 1.0,
        solidTiles: [
            { x: 27, y: 16 },
            { x: 28, y: 16 }
        ]
    },
    {
        id: 'arcade-1',
        type: 'arcade',
        x: 26.5,
        y: 12.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 26, y: 12 }]
    },
    {
        id: 'arcade-2',
        type: 'arcade',
        x: 28.5,
        y: 12.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 28, y: 12 }]
    }
];

// Apply exact solid tile footprints from WORLD_OBJECTS
WORLD_OBJECTS.forEach((obj) => {
    if (obj.solidTiles) {
        obj.solidTiles.forEach((t) => {
            if (t.y >= 0 && t.y < MAP_SIZE && t.x >= 0 && t.x < MAP_SIZE) {
                COLLISION_MAP[t.y][t.x] = true;
            }
        });
    }
});

// Guarantee that all 4 Dice Seats, 6 Roulette Mats, and 4 Vault Pads are 100% walkable
const interactiveWalkableTiles = [
    { x: 11, y: 14 }, { x: 13, y: 14 }, { x: 12, y: 13 }, { x: 12, y: 15 }, // Dice Seats P1-P4
    { x: 18, y: 15 }, { x: 19, y: 15 }, { x: 20, y: 15 }, // Roulette Mats Row 1
    { x: 18, y: 16 }, { x: 19, y: 16 }, { x: 20, y: 16 }, // Roulette Mats Row 2
    { x: 4, y: 14 }, { x: 6, y: 14 }, { x: 4, y: 18 }, { x: 6, y: 18 },     // Vault Pressure Pads
    { x: 16, y: 17 }, { x: 15, y: 17 }, { x: 12, y: 19 }                    // Spawn & Blackjack Seat
];
interactiveWalkableTiles.forEach((t) => {
    COLLISION_MAP[t.y][t.x] = false;
});

// Districts
export const ZONES: ZoneTrigger[] = [
    {
        id: 'zone-casino',
        name: '\u{1F3B2} High Roller Casino Lounge',
        minX: 9,
        maxX: 22,
        minY: 10,
        maxY: 21,
        type: 'casino'
    },
    {
        id: 'zone-nightclub',
        name: '\u{1FA99} Cyber Mega Nightclub',
        minX: 8,
        maxX: 24,
        minY: 1,
        maxY: 9,
        type: 'nightclub'
    },
    {
        id: 'zone-plaza',
        name: '\u{26F2} Grand Atrium & Fountain',
        minX: 9,
        maxX: 23,
        minY: 22,
        maxY: 30,
        type: 'plaza'
    },
    {
        id: 'zone-vault',
        name: '\u{1F48E} The Armored Bank Vault',
        minX: 1,
        maxX: 8,
        minY: 10,
        maxY: 22,
        type: 'vault'
    },
    {
        id: 'zone-arcade',
        name: '\u{1F579}\u{FE0F} 90s Arcade & Graffiti Alley',
        minX: 23,
        maxX: 30,
        minY: 10,
        maxY: 22,
        type: 'arcade'
    }
];

export function isWalkable(gx: number, gy: number, radius = 0.2): boolean {
    if (gx < 1 + radius || gx >= MAP_SIZE - 1 - radius || gy < 1 + radius || gy >= MAP_SIZE - 1 - radius) {
        return false;
    }

    const minTx = Math.floor(gx - radius);
    const maxTx = Math.floor(gx + radius);
    const minTy = Math.floor(gy - radius);
    const maxTy = Math.floor(gy + radius);

    for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
            if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) return false;
            if (COLLISION_MAP[ty][tx]) {
                const closestX = clamp(gx, tx, tx + 1);
                const closestY = clamp(gy, ty, ty + 1);
                if (Math.hypot(gx - closestX, gy - closestY) < radius) {
                    return false;
                }
            }
        }
    }

    return true;
}

/**
 * Continuous Circle-vs-Tile AABB Collision Resolver with Smooth Corner Deflection.
 * Guarantees that:
 * 1. If a player ever starts inside a solid tile, they are smoothly ejected to the nearest open tile.
 * 2. Grazing or walking diagonally into any corner of a table/wall deflects the player radially around the corner with zero snagging.
 */
export function resolveMoveWithSliding(
    curX: number,
    curY: number,
    deltaX: number,
    deltaY: number,
    radius = 0.22
): { x: number; y: number; moved: boolean } {
    let px = curX;
    let py = curY;

    // 1. Emergency Unstuck Guard: If current tile is solid, snap to nearest walkable tile center
    const curTx = Math.floor(px);
    const curTy = Math.floor(py);
    if (
        curTx <= 0 ||
        curTx >= MAP_SIZE - 1 ||
        curTy <= 0 ||
        curTy >= MAP_SIZE - 1 ||
        COLLISION_MAP[curTy]?.[curTx]
    ) {
        for (let r = 1; r <= 5; r++) {
            let escaped = false;
            for (let dy = -r; dy <= r && !escaped; dy++) {
                for (let dx = -r; dx <= r && !escaped; dx++) {
                    const nx = clamp(curTx + dx, 1, MAP_SIZE - 2);
                    const ny = clamp(curTy + dy, 1, MAP_SIZE - 2);
                    if (!COLLISION_MAP[ny]?.[nx]) {
                        px = nx + 0.5;
                        py = ny + 0.5;
                        escaped = true;
                    }
                }
            }
            if (escaped) break;
        }
    }

    // 2. Apply desired step and resolve Circle-vs-AABB overlaps iteratively
    const subSteps = 2;
    const stepX = deltaX / subSteps;
    const stepY = deltaY / subSteps;

    for (let s = 0; s < subSteps; s++) {
        px = clamp(px + stepX, 1 + radius, MAP_SIZE - 1 - radius);
        py = clamp(py + stepY, 1 + radius, MAP_SIZE - 1 - radius);

        const baseTx = Math.floor(px);
        const baseTy = Math.floor(py);

        // 2 passes of circle-vs-AABB resolution for butter-smooth corner sliding
        for (let pass = 0; pass < 2; pass++) {
            for (let ty = baseTy - 1; ty <= baseTy + 1; ty++) {
                for (let tx = baseTx - 1; tx <= baseTx + 1; tx++) {
                    if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) continue;
                    if (!COLLISION_MAP[ty][tx]) continue;

                    const closestX = clamp(px, tx, tx + 1);
                    const closestY = clamp(py, ty, ty + 1);
                    const diffX = px - closestX;
                    const diffY = py - closestY;
                    const dist = Math.hypot(diffX, diffY);

                    if (dist < radius) {
                        if (dist > 0.0001) {
                            const overlap = radius - dist;
                            px += (diffX / dist) * overlap;
                            py += (diffY / dist) * overlap;
                        } else {
                            // Exact center overlap fallback: push away from tile center
                            const cx = tx + 0.5;
                            const cy = ty + 0.5;
                            const odx = px - cx;
                            const ody = py - cy;
                            if (Math.abs(odx) >= Math.abs(ody)) {
                                px = odx >= 0 ? tx + 1 + radius : tx - radius;
                            } else {
                                py = ody >= 0 ? ty + 1 + radius : ty - radius;
                            }
                        }
                    }
                }
            }
        }
    }

    const actualMoved = Math.hypot(px - curX, py - curY) > 0.0005;
    return { x: px, y: py, moved: actualMoved };
}

export function getCurrentZone(gx: number, gy: number): ZoneTrigger | null {
    for (const z of ZONES) {
        if (gx >= z.minX && gx <= z.maxX && gy >= z.minY && gy <= z.maxY) {
            return z;
        }
    }
    return null;
}

/**
 * Rich Procedural Isometric Tile Renderer
 * Note: (sx, sy) is the exact screen center of tile (gx, gy), i.e., gridToScreen(gx + 0.5, gy + 0.5).
 */
export function drawRichIsometricTile(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    type: TileType,
    gx: number,
    gy: number,
    timeMs: number
) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, sy - TILE_HEIGHT / 2);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy);
    ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
    ctx.lineTo(sx - TILE_WIDTH / 2, sy);
    ctx.closePath();

    switch (type) {
        case TileType.WOOD_PARQUET: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#b87a3d' : '#a3682f';
            ctx.fill();

            ctx.strokeStyle = 'rgba(70, 35, 10, 0.55)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - TILE_WIDTH / 4, sy - TILE_HEIGHT / 4);
            ctx.lineTo(sx + TILE_WIDTH / 4, sy + TILE_HEIGHT / 4);
            ctx.moveTo(sx + TILE_WIDTH / 4, sy - TILE_HEIGHT / 4);
            ctx.lineTo(sx - TILE_WIDTH / 4, sy + TILE_HEIGHT / 4);
            ctx.stroke();
            break;
        }

        case TileType.CASINO_FELT: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#6b0d22' : '#5e0a1d';
            ctx.fill();

            // Subtle royal diamond motif
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy - 6);
            ctx.lineTo(sx + 10, sy);
            ctx.lineTo(sx, sy + 6);
            ctx.lineTo(sx - 10, sy);
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 215, 0, 0.45)';
            ctx.fillRect(sx - 1, sy - 1, 2, 2);
            break;
        }

        case TileType.VIP_WALKWAY: {
            // Plush Royal Crimson & Gold Carpet Runner
            ctx.fillStyle = '#9e112b';
            ctx.fill();

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy - TILE_HEIGHT / 2 + 3);
            ctx.lineTo(sx + TILE_WIDTH / 2 - 6, sy);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - 3);
            ctx.lineTo(sx - TILE_WIDTH / 2 + 6, sy);
            ctx.closePath();
            ctx.stroke();
            break;
        }

        case TileType.GOLD_BORDER: {
            // Ornate Obsidian & Gold Casino Pit Border Tile
            ctx.fillStyle = '#1d192b';
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy - TILE_HEIGHT / 2 + 3);
            ctx.lineTo(sx + TILE_WIDTH / 2 - 6, sy);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - 3);
            ctx.lineTo(sx - TILE_WIDTH / 2 + 6, sy);
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(sx, sy, 2, 0, Math.PI * 2);
            ctx.fill();
            break;
        }

        case TileType.DICE_SEAT: {
            // Glowing Isometric Casino Player Seat Pad flush with the Dice Table
            const pulse = 0.7 + 0.3 * Math.sin(timeMs / 240);
            ctx.fillStyle = '#092b24';
            ctx.fill();

            // Outer Gold Rim
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner Pulsing Neon Cyan Diamond
            ctx.fillStyle = `rgba(0, 255, 200, ${0.18 * pulse})`;
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.9 * pulse})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy - TILE_HEIGHT / 2 + 4);
            ctx.lineTo(sx + TILE_WIDTH / 2 - 8, sy);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - 4);
            ctx.lineTo(sx - TILE_WIDTH / 2 + 8, sy);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            let seatLabel = 'P1';
            if (gx === 13 && gy === 14) seatLabel = 'P2';
            else if (gx === 12 && gy === 13) seatLabel = 'P3';
            else if (gx === 12 && gy === 15) seatLabel = 'P4';

            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.ellipse(sx, sy, 11, 6.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#002233';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#000000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(seatLabel, sx, sy + 0.5);
            break;
        }

        case TileType.ROULETTE_MAT: {
            // 6 Distinct Meme Betting Mats at x: 18..20, y: 15..16
            let memeBg = '#0a5c36';
            let icon = '\u{1F438}';
            let label = '2x';

            if (gx === 18 && gy === 15) {
                memeBg = '#0a5c36';
                icon = '\u{1F438}';
                label = '2x';
            } else if (gx === 19 && gy === 15) {
                memeBg = '#7a6000';
                icon = '\u{1F415}';
                label = '2x';
            } else if (gx === 20 && gy === 15) {
                memeBg = '#8b1c1c';
                icon = '\u{1F680}';
                label = '3x';
            } else if (gx === 18 && gy === 16) {
                memeBg = '#1c4d8b';
                icon = '\u{1F48E}';
                label = '3x';
            } else if (gx === 19 && gy === 16) {
                memeBg = '#541c8b';
                icon = '\u{1F5FF}';
                label = '5x';
            } else if (gx === 20 && gy === 16) {
                memeBg = '#8b1c6d';
                icon = '\u{1F984}';
                label = '10x';
            }

            ctx.fillStyle = memeBg;
            ctx.fill();

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, sx - 7, sy);

            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(label, sx + 9, sy + 0.5);
            break;
        }

        case TileType.MARBLE_WHITE: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#ebe6dc' : '#dfd9ce';
            ctx.fill();

            ctx.strokeStyle = 'rgba(130, 120, 110, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx - 12, sy - 3);
            ctx.bezierCurveTo(sx - 4, sy + 4, sx + 4, sy - 2, sx + 13, sy + 3);
            ctx.stroke();
            break;
        }

        case TileType.CHECKER_LIGHT: {
            const beat = Math.sin(timeMs / 200 + (gx + gy) * 0.5);
            const g = Math.floor(200 + 50 * beat);
            const b = Math.floor(235 + 20 * beat);
            ctx.fillStyle = `rgb(15, ${g}, ${b})`;
            ctx.fill();
            break;
        }

        case TileType.CHECKER_DARK: {
            const beat = Math.cos(timeMs / 200 + (gx + gy) * 0.5);
            const r = Math.floor(210 + 40 * beat);
            const b = Math.floor(175 + 65 * beat);
            ctx.fillStyle = `rgb(${r}, 20, ${b})`;
            ctx.fill();
            break;
        }

        case TileType.STEEL_GRID: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#2c333d' : '#252b34';
            ctx.fill();
            ctx.fillStyle = '#4e5a6b';
            ctx.fillRect(sx - 4, sy - 2, 2, 2);
            ctx.fillRect(sx + 3, sy + 1, 2, 2);
            break;
        }

        case TileType.WATER: {
            const wave = Math.sin(timeMs / 280 + gx * 0.8 + gy * 0.8);
            const g = Math.floor(165 + 30 * wave);
            const b = Math.floor(225 + 30 * wave);
            ctx.fillStyle = `rgb(0, ${g}, ${b})`;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(sx, sy, 7 + wave * 3, 0, Math.PI);
            ctx.stroke();
            break;
        }

        case TileType.CARPET_PURPLE: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#32124a' : '#2a0e3f';
            ctx.fill();
            break;
        }

        case TileType.CARPET_TEAL: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#0c3b40' : '#093034';
            ctx.fill();
            break;
        }

        case TileType.WALL_BRICK: {
            // 3D Raised Isometric Perimeter Wall Block
            const wallH = 18;
            // Top cap
            ctx.fillStyle = '#252538';
            ctx.beginPath();
            ctx.moveTo(sx, sy - TILE_HEIGHT / 2 - wallH);
            ctx.lineTo(sx + TILE_WIDTH / 2, sy - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - wallH);
            ctx.lineTo(sx - TILE_WIDTH / 2, sy - wallH);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Left face
            ctx.fillStyle = '#191926';
            ctx.beginPath();
            ctx.moveTo(sx - TILE_WIDTH / 2, sy - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
            ctx.lineTo(sx - TILE_WIDTH / 2, sy);
            ctx.closePath();
            ctx.fill();

            // Right face
            ctx.fillStyle = '#12121c';
            ctx.beginPath();
            ctx.moveTo(sx + TILE_WIDTH / 2, sy - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
            ctx.lineTo(sx + TILE_WIDTH / 2, sy);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
            return;
        }

        default:
            ctx.fillStyle = '#111111';
            ctx.fill();
    }

    // Crisp Isometric Tile Outlines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle 3D Top Bevel Highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.moveTo(sx - TILE_WIDTH / 2, sy);
    ctx.lineTo(sx, sy - TILE_HEIGHT / 2);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy);
    ctx.stroke();

    ctx.restore();
}

/**
 * Pre-renders the entire static 32x32 isometric floor map into an offscreen canvas once,
 * reducing per-frame tile draw calls from 1,024 to ~70 animated tiles!
 */
export class StaticFloorCache {
    public canvas: HTMLCanvasElement | null = null;
    public originX = 0;
    public originY = 0;
    public width = 0;
    public height = 0;

    public build() {
        if (typeof document === 'undefined') return;

        const padX = TILE_WIDTH * 2;
        const padY = TILE_HEIGHT * 3;
        this.width = MAP_SIZE * TILE_WIDTH + padX * 2;
        this.height = MAP_SIZE * TILE_HEIGHT + padY * 2;
        this.originX = this.width / 2;
        this.originY = padY;

        const c = document.createElement('canvas');
        c.width = this.width;
        c.height = this.height;
        const ctx = c.getContext('2d');
        if (!ctx) return;

        for (let y = 0; y < MAP_SIZE; y++) {
            for (let x = 0; x < MAP_SIZE; x++) {
                const tileType = WORLD_TILES[y][x];
                if (!tileType) continue;

                // Center of tile [x, x+1] x [y, y+1] in cache coordinates
                const gx = x + 0.5;
                const gy = y + 0.5;
                const sx = (gx - gy) * (TILE_WIDTH / 2) + this.originX;
                const sy = (gx + gy) * (TILE_HEIGHT / 2) + this.originY;

                drawRichIsometricTile(ctx, sx, sy, tileType, x, y, 0);
            }
        }

        this.canvas = c;
    }
}
