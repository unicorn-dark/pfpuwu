// src/lib/game/isometric/worldMap.ts
/**
 * Rich 32x32 Isometric World Map & Corner-Free Collision Engine for UwU World
 * Well-spaced Casino Stations (zero overlap!):
 * - NW Pit (11.5, 13.5): 3-Round Craps / Dice Duel Table + 4 Symmetric Seats P1-P4
 * - NE Pit (19.5, 12.5): Meme Roulette Wheel + 6 Betting Mats at x: 18..20, y: 14..15
 * - SW Pit (11.5, 19.5): Cyber Blackjack 21 Table
 * - SE Pit (20.5, 19.5): Golden UwU Jackpot Slot Machines (7 tiles south of Roulette!)
 * - Center North Pit (15.5, 12.5): Rocket Crash Multiplier Terminal
 * - East Arcade South (27.5, 19.5): Cyber Mines High-Stakes Table
 */

import { TILE_WIDTH, TILE_HEIGHT, clamp } from './isoMath';
import { drawIsoTileSprite, drawIsoDetailSprite } from './isoAssetLoader';

export const MAP_SIZE = 32;

export type WorldZone = 'casino' | 'forest';

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
    VIP_WALKWAY = 15,
    GRASS_LUSH = 16,
    GRASS_MEADOW = 17,
    FLOWER_PATCH = 18,
    STONE_PATH = 19,
    FOREST_PORTAL = 20
}

export interface WorldObject {
    id: string;
    type:
        | 'banner_sign'
        | 'dice_table'
        | 'roulette_wheel'
        | 'blackjack_table'
        | 'slot_machine'
        | 'crash_rocket'
        | 'dj_booth'
        | 'sofa'
        | 'palm_tree'
        | 'bar_counter'
        | 'graffiti_wall'
        | 'fountain'
        | 'street_lamp'
        | 'vip_pillar'
        | 'pine_tree'
        | 'sakura_tree'
        | 'campfire_pit'
        | 'log_bench'
        | 'picnic_table'
        | 'koi_dock'
        | 'firefly_shrine'
        | 'bush'
        | 'rock'
        | 'camp_tent'
        | 'canoe_prop'
        | 'club_speaker'
        | 'arcade_cabinet'
        | 'mines_table';
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
    type: 'casino' | 'nightclub' | 'plaza' | 'vault' | 'arcade' | 'forest';
}

export const WORLD_TILES: number[][] = [];
export const COLLISION_MAP: boolean[][] = [];
export const ANIMATED_TILE_COORDS: Array<{ x: number; y: number; type: TileType }> = [];

for (let y = 0; y < MAP_SIZE; y++) {
    WORLD_TILES[y] = [];
    COLLISION_MAP[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
        // Walkable East Forest Portal Gateway at x === 31, y in 14..17
        if (x === MAP_SIZE - 1 && y >= 14 && y <= 17) {
            WORLD_TILES[y][x] = TileType.FOREST_PORTAL;
            COLLISION_MAP[y][x] = false;
            continue;
        }
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
            if (x >= 26 && x <= 28 && y >= 18 && y <= 20) {
                WORLD_TILES[y][x] = TileType.GOLD_BORDER;
            } else {
                WORLD_TILES[y][x] = TileType.WOOD_PARQUET;
            }
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
            // Central VIP Red/Gold Walkway at x = 15..16 (and cross-walkway at y = 16..17)
            if (((x === 15 || x === 16) && y >= 10 && y <= 21) || ((y === 16 || y === 17) && x >= 9 && x <= 22)) {
                WORLD_TILES[y][x] = TileType.VIP_WALKWAY;
            }
            // NW Dice Duel Pit around (11, 13):
            // 4 Symmetric Player Seats flush with the 4 edges of tile (11, 13)
            else if (
                (x === 10 && y === 13) || // P1 (NW)
                (x === 12 && y === 13) || // P2 (SE)
                (x === 11 && y === 12) || // P3 (NE)
                (x === 11 && y === 14)    // P4 (SW)
            ) {
                WORLD_TILES[y][x] = TileType.DICE_SEAT;
            }
            // NE Meme Roulette Betting Mats at x: 18..20, y: 14..15
            else if (x >= 18 && x <= 20 && y >= 14 && y <= 15) {
                WORLD_TILES[y][x] = TileType.ROULETTE_MAT;
            }
            // Gold Borders around Casino Pits (NW Dice, NE Roulette, SW Blackjack, SE Slots)
            else if (
                (x >= 10 && x <= 12 && y >= 12 && y <= 14) ||
                (x >= 18 && x <= 20 && y >= 11 && y <= 13) ||
                (x >= 10 && x <= 12 && y >= 18 && y <= 20) ||
                (x >= 19 && x <= 21 && y >= 18 && y <= 20)
            ) {
                WORLD_TILES[y][x] = TileType.GOLD_BORDER;
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

for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
        const t = WORLD_TILES[y][x];
        if (
            t === TileType.CHECKER_LIGHT ||
            t === TileType.CHECKER_DARK ||
            t === TileType.WATER ||
            t === TileType.DICE_SEAT ||
            t === TileType.FOREST_PORTAL
        ) {
            ANIMATED_TILE_COORDS.push({ x, y, type: t });
        }
    }
}

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
        subtitle: 'CRAPS • ROULETTE • BLACKJACK • SLOTS • CRASH',
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
        subtitle: 'CLASSICAL • HOUSE • TECHNO • RAVE DJ',
        badgeColor: '#00ffff',
        solidTiles: []
    },
    {
        id: 'banner-vip-lounge',
        type: 'banner_sign',
        x: 5.5,
        y: 10.2,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: 'WEST VIP LOUNGE',
        subtitle: 'CHILL SOFAS & PROXIMITY VOICE HANGOUT',
        badgeColor: '#00ffff',
        solidTiles: []
    },
    {
        id: 'banner-arcade',
        type: 'banner_sign',
        x: 26.5,
        y: 10.2,
        width: 4.2,
        height: 0.6,
        depthOffset: -120,
        title: '90s ARCADE & GRAFFITI',
        subtitle: '5 ARCADE GAMES • CYBER MINES • MURAL • WOODS →',
        badgeColor: '#00ff88',
        solidTiles: []
    },

    // --- WELL-SPACED CASINO DISTRICT STATIONS (ZERO OVERLAP!) ---
    // 1. NW Pit: 3D Craps / Dice Duel Table centered on tile (11, 13) -> (11.5, 13.5)
    // Surrounded by P1 (10,13), P2 (12,13), P3 (11,12), P4 (11,14)
    {
        id: 'dice-duel-table',
        type: 'dice_table',
        x: 11.5,
        y: 13.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 11, y: 13 }],
        data: { active: true }
    },
    // 2. NE Pit: 3D Meme Roulette Wheel centered on tile (19, 12) -> (19.5, 12.5)
    // Betting Mats are directly in front at x: 18..20, y: 14..15
    {
        id: 'meme-roulette-wheel',
        type: 'roulette_wheel',
        x: 19.5,
        y: 12.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 19, y: 12 }]
    },
    // 3. SW Pit: 3D Cyber Blackjack 21 Table centered on tile (11, 19) -> (11.5, 19.5)
    {
        id: 'blackjack-table',
        type: 'blackjack_table',
        x: 11.5,
        y: 19.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 11, y: 19 }]
    },
    // 4. SE Pit: 3D Golden UwU Slot Machines at (20.5, 19.5) and (21.5, 19.5) — 7 tiles away from Roulette!
    {
        id: 'slot-machine-1',
        type: 'slot_machine',
        x: 20.5,
        y: 19.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 20, y: 19 }]
    },
    {
        id: 'slot-machine-2',
        type: 'slot_machine',
        x: 21.5,
        y: 19.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 21, y: 19 }]
    },
    // 5. Center North Pit: Rocket Crash Multiplier Terminal at (15.5, 12.5)
    {
        id: 'crash-rocket-terminal',
        type: 'crash_rocket',
        x: 15.5,
        y: 12.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 15, y: 12 }]
    },
    // Casino VIP Pillars
    {
        id: 'vip-pillar-1',
        type: 'vip_pillar',
        x: 14.5,
        y: 10.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 14, y: 10 }]
    },
    {
        id: 'vip-pillar-2',
        type: 'vip_pillar',
        x: 16.5,
        y: 10.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 16, y: 10 }]
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
        id: 'club-speaker-l',
        type: 'club_speaker',
        x: 13.5,
        y: 2.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 13, y: 2 }]
    },
    {
        id: 'club-speaker-r',
        type: 'club_speaker',
        x: 18.5,
        y: 2.5,
        width: 0.6,
        height: 0.6,
        solidTiles: [{ x: 18, y: 2 }]
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

    // --- WEST VIP LOUNGE (REPLACES VAULT) ---
    {
        id: 'vip-sofa-1',
        type: 'sofa',
        x: 4.5,
        y: 14.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 4, y: 14 }]
    },
    {
        id: 'vip-sofa-2',
        type: 'sofa',
        x: 6.5,
        y: 14.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 6, y: 14 }]
    },
    {
        id: 'vip-sofa-3',
        type: 'sofa',
        x: 5.5,
        y: 18.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 5, y: 18 }]
    },
    {
        id: 'vip-lamp-west',
        type: 'street_lamp',
        x: 5.5,
        y: 16.5,
        width: 0.5,
        height: 0.5,
        solidTiles: [{ x: 5, y: 16 }]
    },

    // --- 90s ARCADE, CYBER MINES, GRAFFITI ALLEY & EAST FOREST PORTAL ---
    {
        id: 'arcade-cabinet-1',
        type: 'arcade_cabinet',
        x: 26.5,
        y: 12.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 26, y: 12 }]
    },
    {
        id: 'arcade-cabinet-2',
        type: 'arcade_cabinet',
        x: 28.5,
        y: 12.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 28, y: 12 }]
    },
    {
        id: 'cyber-mines-table',
        type: 'mines_table',
        x: 27.5,
        y: 19.5,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 27, y: 19 }]
    },
    {
        id: 'graffiti-billboard',
        type: 'graffiti_wall',
        x: 27.5,
        y: 15.5,
        width: 2.0,
        height: 1.0,
        solidTiles: [
            { x: 27, y: 15 },
            { x: 28, y: 15 }
        ]
    }
];

WORLD_OBJECTS.forEach((obj) => {
    if (obj.solidTiles) {
        obj.solidTiles.forEach((t) => {
            if (t.y >= 0 && t.y < MAP_SIZE && t.x >= 0 && t.x < MAP_SIZE) {
                COLLISION_MAP[t.y][t.x] = true;
            }
        });
    }
});

const interactiveWalkableTiles = [
    { x: 10, y: 13 }, { x: 12, y: 13 }, { x: 11, y: 12 }, { x: 11, y: 14 }, // Dice Seats P1-P4
    { x: 18, y: 14 }, { x: 19, y: 14 }, { x: 20, y: 14 }, // Roulette Mats Row 1
    { x: 18, y: 15 }, { x: 19, y: 15 }, { x: 20, y: 15 }, // Roulette Mats Row 2
    { x: 15, y: 16 }, { x: 16, y: 16 },                   // Central Spawn
    { x: 30, y: 14 }, { x: 30, y: 15 }, { x: 30, y: 16 }, { x: 30, y: 17 },
    { x: 31, y: 14 }, { x: 31, y: 15 }, { x: 31, y: 16 }, { x: 31, y: 17 }  // East Forest Portal Trail
];
interactiveWalkableTiles.forEach((t) => {
    COLLISION_MAP[t.y][t.x] = false;
});

// ============================================================================
// CONNECTED SOCIAL ZONE: 🌲 WHISPERING WOODS (32x32 LUSH FOREST & SOCIAL GAMES)
// ============================================================================
export const FOREST_TILES: number[][] = [];
export const FOREST_COLLISION_MAP: boolean[][] = [];
export const FOREST_ANIMATED_TILE_COORDS: Array<{ x: number; y: number; type: TileType }> = [];

for (let y = 0; y < MAP_SIZE; y++) {
    FOREST_TILES[y] = [];
    FOREST_COLLISION_MAP[y] = [];
    for (let x = 0; x < MAP_SIZE; x++) {
        // Walkable West Return Portal back to Casino Plaza (x === 0, y in 14..17)
        if (x === 0 && y >= 14 && y <= 17) {
            FOREST_TILES[y][x] = TileType.FOREST_PORTAL;
            FOREST_COLLISION_MAP[y][x] = false;
            continue;
        }
        // Dense Forest Perimeter Border
        if (x === 0 || x === MAP_SIZE - 1 || y === 0 || y === MAP_SIZE - 1) {
            FOREST_TILES[y][x] = TileType.GRASS_LUSH;
            FOREST_COLLISION_MAP[y][x] = true;
            continue;
        }

        // Stone Cobblestone Cross-Paths (West Portal -> Central Campfire -> North/South/East)
        if (
            (y >= 15 && y <= 16 && x >= 1 && x <= 28) ||
            (x >= 15 && x <= 16 && y >= 5 && y <= 27)
        ) {
            FOREST_TILES[y][x] = TileType.STONE_PATH;
            FOREST_COLLISION_MAP[y][x] = false;
            continue;
        }

        // Central Cozy Campfire Clearing (x: 13..18, y: 13..18)
        if (x >= 13 && x <= 18 && y >= 13 && y <= 18) {
            if (x >= 14 && x <= 17 && y >= 14 && y <= 17) {
                FOREST_TILES[y][x] = TileType.WOOD_PARQUET;
            } else {
                FOREST_TILES[y][x] = TileType.GOLD_BORDER;
            }
            FOREST_COLLISION_MAP[y][x] = false;
            continue;
        }

        // SW Crystal Koi Pond & Wooden Fishing Pier (x: 8..14, y: 20..26)
        if (x >= 8 && x <= 14 && y >= 20 && y <= 26) {
            // Wooden Fishing Dock jutting into the pond
            if (x >= 10 && x <= 12 && y >= 20 && y <= 22) {
                FOREST_TILES[y][x] = TileType.WOOD_PARQUET;
                FOREST_COLLISION_MAP[y][x] = false;
            } else if (x >= 9 && x <= 13 && y >= 22 && y <= 25) {
                FOREST_TILES[y][x] = TileType.WATER;
                FOREST_COLLISION_MAP[y][x] = true;
            } else {
                FOREST_TILES[y][x] = TileType.FLOWER_PATCH;
                FOREST_COLLISION_MAP[y][x] = false;
            }
            continue;
        }

        // NW & NE Meadow Picnic Clearings (Gomoku & Emoji RPS)
        if (
            (x >= 8 && x <= 12 && y >= 7 && y <= 11) ||
            (x >= 21 && x <= 25 && y >= 8 && y <= 12)
        ) {
            FOREST_TILES[y][x] = TileType.FLOWER_PATCH;
            FOREST_COLLISION_MAP[y][x] = false;
            continue;
        }

        // SE Starlight Firefly Sanctuary (x: 20..25, y: 20..25)
        if (x >= 20 && x <= 25 && y >= 20 && y <= 25) {
            if (x >= 21 && x <= 23 && y >= 22 && y <= 24) {
                FOREST_TILES[y][x] = TileType.GOLD_BORDER;
            } else {
                FOREST_TILES[y][x] = TileType.FLOWER_PATCH;
            }
            FOREST_COLLISION_MAP[y][x] = false;
            continue;
        }

        // Natural Alternating Lush Grass, Meadow Grass & Wildflowers
        const hash = (x * 19 + y * 37) % 11;
        if (hash === 0 || hash === 5) {
            FOREST_TILES[y][x] = TileType.FLOWER_PATCH;
        } else if ((x + y) % 2 === 0) {
            FOREST_TILES[y][x] = TileType.GRASS_LUSH;
        } else {
            FOREST_TILES[y][x] = TileType.GRASS_MEADOW;
        }
        FOREST_COLLISION_MAP[y][x] = false;
    }
}

for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
        const t = FOREST_TILES[y][x];
        if (t === TileType.WATER || t === TileType.FOREST_PORTAL) {
            FOREST_ANIMATED_TILE_COORDS.push({ x, y, type: t });
        }
    }
}

export const FOREST_OBJECTS: WorldObject[] = [
    // --- 3D ISOMETRIC FOREST ARCHWAYS / BILLBOARDS (SAME 3D ENGINE AS CASINO) ---
    {
        id: 'forest-banner-campfire',
        type: 'banner_sign',
        x: 15.5,
        y: 12.2,
        width: 4.5,
        height: 0.6,
        depthOffset: -120,
        title: 'COZY CAMPFIRE CIRCLE',
        subtitle: 'LIVE TRIVIA • ICEBREAKERS • CHILL MUSIC',
        badgeColor: '#ffaa00',
        solidTiles: []
    },
    {
        id: 'forest-banner-picnic',
        type: 'banner_sign',
        x: 10.0,
        y: 6.8,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: 'MEADOW PICNIC GAMES',
        subtitle: '1V1 GOMOKU (5-IN-A-ROW) • EMOJI RPS',
        badgeColor: '#ff66b2',
        solidTiles: []
    },
    {
        id: 'forest-banner-pond',
        type: 'banner_sign',
        x: 11.0,
        y: 19.5,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: 'CRYSTAL KOI POND',
        subtitle: 'CAST LINE • CATCH RARE KOI & CRITTERS',
        badgeColor: '#00ffff',
        solidTiles: []
    },
    {
        id: 'forest-banner-shrine',
        type: 'banner_sign',
        x: 22.5,
        y: 19.5,
        width: 4.0,
        height: 0.6,
        depthOffset: -120,
        title: 'STARLIGHT FIREFLY SHRINE',
        subtitle: 'CO-OP SPIRIT LANTERNS • TRIGGER AURORA',
        badgeColor: '#00ff88',
        solidTiles: []
    },

    // --- 1. CENTRAL CAMPFIRE & LOG BENCHES (16, 16) ---
    {
        id: 'forest-campfire',
        type: 'campfire_pit',
        x: 16.0,
        y: 16.0,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 16, y: 16 }]
    },
    {
        id: 'forest-bench-nw',
        type: 'log_bench',
        x: 14.5,
        y: 14.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 14, y: 14 }]
    },
    {
        id: 'forest-bench-ne',
        type: 'log_bench',
        x: 17.5,
        y: 14.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 17, y: 14 }]
    },
    {
        id: 'forest-bench-sw',
        type: 'log_bench',
        x: 14.5,
        y: 17.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 14, y: 17 }]
    },
    {
        id: 'forest-bench-se',
        type: 'log_bench',
        x: 17.5,
        y: 17.5,
        width: 0.9,
        height: 0.9,
        solidTiles: [{ x: 17, y: 17 }]
    },

    // --- 2. MEADOW PICNIC TABLES (10, 9) & (23, 10) ---
    {
        id: 'forest-picnic-1',
        type: 'picnic_table',
        x: 10.0,
        y: 9.0,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 10, y: 9 }]
    },
    {
        id: 'forest-picnic-2',
        type: 'picnic_table',
        x: 23.0,
        y: 10.0,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 23, y: 10 }]
    },

    // --- 3. CRYSTAL KOI POND PIER (11, 22) ---
    {
        id: 'forest-koi-dock',
        type: 'koi_dock',
        x: 11.0,
        y: 22.0,
        width: 1.0,
        height: 1.0,
        solidTiles: []
    },

    // --- 4. STARLIGHT FIREFLY SHRINE (22, 23) ---
    {
        id: 'forest-firefly-shrine',
        type: 'firefly_shrine',
        x: 22.0,
        y: 23.0,
        width: 1.0,
        height: 1.0,
        solidTiles: [{ x: 22, y: 23 }]
    },

    // --- LUSH 3D PINE & SAKURA TREES, TENTS, CANOE, BOULDERS & WARM FOREST LANTERNS ---
    { id: 'f-pine-1', type: 'pine_tree', x: 5.5, y: 5.5, width: 0.8, height: 0.8, solidTiles: [{ x: 5, y: 5 }] },
    { id: 'f-pine-2', type: 'pine_tree', x: 19.5, y: 4.5, width: 0.8, height: 0.8, solidTiles: [{ x: 19, y: 4 }] },
    { id: 'f-pine-3', type: 'pine_tree', x: 27.5, y: 6.5, width: 0.8, height: 0.8, solidTiles: [{ x: 27, y: 6 }] },
    { id: 'f-pine-4', type: 'pine_tree', x: 5.5, y: 26.5, width: 0.8, height: 0.8, solidTiles: [{ x: 5, y: 26 }] },
    { id: 'f-pine-5', type: 'pine_tree', x: 27.5, y: 26.5, width: 0.8, height: 0.8, solidTiles: [{ x: 27, y: 26 }] },
    { id: 'f-pine-6', type: 'pine_tree', x: 3.5, y: 9.5, width: 0.8, height: 0.8, solidTiles: [{ x: 3, y: 9 }] },
    { id: 'f-pine-7', type: 'pine_tree', x: 3.5, y: 21.5, width: 0.8, height: 0.8, solidTiles: [{ x: 3, y: 21 }] },
    { id: 'f-pine-8', type: 'pine_tree', x: 13.5, y: 3.5, width: 0.8, height: 0.8, solidTiles: [{ x: 13, y: 3 }] },
    { id: 'f-pine-9', type: 'pine_tree', x: 28.5, y: 12.5, width: 0.8, height: 0.8, solidTiles: [{ x: 28, y: 12 }] },
    { id: 'f-pine-10', type: 'pine_tree', x: 28.5, y: 19.5, width: 0.8, height: 0.8, solidTiles: [{ x: 28, y: 19 }] },
    { id: 'f-pine-11', type: 'pine_tree', x: 18.5, y: 28.5, width: 0.8, height: 0.8, solidTiles: [{ x: 18, y: 28 }] },
    { id: 'f-sakura-1', type: 'sakura_tree', x: 7.5, y: 11.5, width: 0.8, height: 0.8, solidTiles: [{ x: 7, y: 11 }] },
    { id: 'f-sakura-2', type: 'sakura_tree', x: 25.5, y: 12.5, width: 0.8, height: 0.8, solidTiles: [{ x: 25, y: 12 }] },
    { id: 'f-sakura-3', type: 'sakura_tree', x: 14.5, y: 25.5, width: 0.8, height: 0.8, solidTiles: [{ x: 14, y: 25 }] },
    { id: 'f-sakura-4', type: 'sakura_tree', x: 25.5, y: 21.5, width: 0.8, height: 0.8, solidTiles: [{ x: 25, y: 21 }] },
    { id: 'f-sakura-5', type: 'sakura_tree', x: 8.5, y: 4.5, width: 0.8, height: 0.8, solidTiles: [{ x: 8, y: 4 }] },
    { id: 'f-sakura-6', type: 'sakura_tree', x: 24.5, y: 5.5, width: 0.8, height: 0.8, solidTiles: [{ x: 24, y: 5 }] },
    { id: 'f-sakura-7', type: 'sakura_tree', x: 7.5, y: 19.5, width: 0.8, height: 0.8, solidTiles: [{ x: 7, y: 19 }] },
    { id: 'f-sakura-8', type: 'sakura_tree', x: 19.5, y: 25.5, width: 0.8, height: 0.8, solidTiles: [{ x: 19, y: 25 }] },
    { id: 'f-tent-1', type: 'camp_tent', x: 19.5, y: 12.5, width: 1.0, height: 1.0, solidTiles: [{ x: 19, y: 12 }] },
    { id: 'f-canoe-1', type: 'canoe_prop', x: 12.5, y: 24.2, width: 0.8, height: 0.8, solidTiles: [] },
    { id: 'f-rock-1', type: 'rock', x: 8.8, y: 22.5, width: 0.6, height: 0.6, solidTiles: [] },
    { id: 'f-rock-2', type: 'rock', x: 13.4, y: 22.8, width: 0.6, height: 0.6, solidTiles: [] },
    { id: 'f-rock-3', type: 'rock', x: 20.5, y: 24.5, width: 0.6, height: 0.6, solidTiles: [] },
    { id: 'f-bush-1', type: 'bush', x: 6.5, y: 7.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-bush-2', type: 'bush', x: 12.5, y: 7.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-bush-3', type: 'bush', x: 20.5, y: 8.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-bush-4', type: 'bush', x: 26.2, y: 9.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-bush-5', type: 'bush', x: 8.2, y: 25.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-bush-6', type: 'bush', x: 24.5, y: 24.5, width: 0.5, height: 0.5, solidTiles: [] },
    { id: 'f-lamp-1', type: 'street_lamp', x: 12.5, y: 14.5, width: 0.5, height: 0.5, solidTiles: [{ x: 12, y: 14 }] },
    { id: 'f-lamp-2', type: 'street_lamp', x: 19.5, y: 14.5, width: 0.5, height: 0.5, solidTiles: [{ x: 19, y: 14 }] },
    { id: 'f-lamp-3', type: 'street_lamp', x: 12.5, y: 18.5, width: 0.5, height: 0.5, solidTiles: [{ x: 12, y: 18 }] },
    { id: 'f-lamp-4', type: 'street_lamp', x: 19.5, y: 18.5, width: 0.5, height: 0.5, solidTiles: [{ x: 19, y: 18 }] }
];

FOREST_OBJECTS.forEach((obj) => {
    if (obj.solidTiles) {
        obj.solidTiles.forEach((t) => {
            if (t.y >= 0 && t.y < MAP_SIZE && t.x >= 0 && t.x < MAP_SIZE) {
                FOREST_COLLISION_MAP[t.y][t.x] = true;
            }
        });
    }
});

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
        name: '\u{1F378} West VIP Lounge',
        minX: 1,
        maxX: 8,
        minY: 10,
        maxY: 22,
        type: 'vault'
    },
    {
        id: 'zone-arcade',
        name: '\u{1F3A8} Graffiti Alley & Woods Gate',
        minX: 23,
        maxX: 31,
        minY: 10,
        maxY: 22,
        type: 'arcade'
    }
];

export const FOREST_ZONES: ZoneTrigger[] = [
    {
        id: 'forest-campfire',
        name: '\u{1F525} Cozy Campfire Circle',
        minX: 12,
        maxX: 19,
        minY: 12,
        maxY: 19,
        type: 'forest'
    },
    {
        id: 'forest-picnic-nw',
        name: '\u{1F9FA} Wildflower Picnic Meadow',
        minX: 7,
        maxX: 26,
        minY: 6,
        maxY: 12,
        type: 'forest'
    },
    {
        id: 'forest-pond',
        name: '\u{1F3A3} Crystal Koi Pond Pier',
        minX: 7,
        maxX: 15,
        minY: 19,
        maxY: 27,
        type: 'forest'
    },
    {
        id: 'forest-shrine',
        name: '\u{1F98B} Starlight Firefly Sanctuary',
        minX: 19,
        maxX: 26,
        minY: 19,
        maxY: 27,
        type: 'forest'
    }
];

export function isWalkable(gx: number, gy: number, radius = 0.2, zone: WorldZone = 'casino'): boolean {
    const colMap = zone === 'forest' ? FOREST_COLLISION_MAP : COLLISION_MAP;

    // Allow stepping onto East/West portal tiles at y in 14..17
    if (zone === 'casino' && gx >= MAP_SIZE - 2 && gy >= 14 && gy <= 18) {
        return true;
    }
    if (zone === 'forest' && gx <= 2 && gy >= 14 && gy <= 18) {
        return true;
    }

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
            if (colMap[ty][tx]) {
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

export function resolveMoveWithSliding(
    curX: number,
    curY: number,
    deltaX: number,
    deltaY: number,
    radius = 0.22,
    zone: WorldZone = 'casino'
): { x: number; y: number; moved: boolean } {
    const colMap = zone === 'forest' ? FOREST_COLLISION_MAP : COLLISION_MAP;
    let px = curX;
    let py = curY;

    const curTx = Math.floor(px);
    const curTy = Math.floor(py);
    const inPortalCorridor =
        (zone === 'casino' && curTx >= MAP_SIZE - 2 && curTy >= 14 && curTy <= 17) ||
        (zone === 'forest' && curTx <= 1 && curTy >= 14 && curTy <= 17);

    if (
        !inPortalCorridor &&
        (curTx <= 0 ||
            curTx >= MAP_SIZE - 1 ||
            curTy <= 0 ||
            curTy >= MAP_SIZE - 1 ||
            colMap[curTy]?.[curTx])
    ) {
        for (let r = 1; r <= 5; r++) {
            let escaped = false;
            for (let dy = -r; dy <= r && !escaped; dy++) {
                for (let dx = -r; dx <= r && !escaped; dx++) {
                    const nx = clamp(curTx + dx, 1, MAP_SIZE - 2);
                    const ny = clamp(curTy + dy, 1, MAP_SIZE - 2);
                    if (!colMap[ny]?.[nx]) {
                        px = nx + 0.5;
                        py = ny + 0.5;
                        escaped = true;
                    }
                }
            }
            if (escaped) break;
        }
    }

    const subSteps = 2;
    const stepX = deltaX / subSteps;
    const stepY = deltaY / subSteps;

    for (let s = 0; s < subSteps; s++) {
        const minXBound = zone === 'forest' && py >= 14 && py <= 18 ? 0.2 : 1 + radius;
        const maxXBound = zone === 'casino' && py >= 14 && py <= 18 ? MAP_SIZE - 0.2 : MAP_SIZE - 1 - radius;
        px = clamp(px + stepX, minXBound, maxXBound);
        py = clamp(py + stepY, 1 + radius, MAP_SIZE - 1 - radius);

        const baseTx = Math.floor(px);
        const baseTy = Math.floor(py);

        for (let pass = 0; pass < 2; pass++) {
            for (let ty = baseTy - 1; ty <= baseTy + 1; ty++) {
                for (let tx = baseTx - 1; tx <= baseTx + 1; tx++) {
                    if (tx < 0 || tx >= MAP_SIZE || ty < 0 || ty >= MAP_SIZE) continue;
                    if (!colMap[ty][tx]) continue;

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

export function getCurrentZone(gx: number, gy: number, zone: WorldZone = 'casino'): ZoneTrigger | null {
    const list = zone === 'forest' ? FOREST_ZONES : ZONES;
    for (const z of list) {
        if (gx >= z.minX && gx <= z.maxX && gy >= z.minY && gy <= z.maxY) {
            return z;
        }
    }
    return null;
}

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

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, isAlt ? 'wood_parquet' : 'planks_plaza', sx, sy, 0.88, 1.04);
            if (!isAlt) {
                ctx.fillStyle = 'rgba(40, 20, 5, 0.14)';
                ctx.fill();
            }
            ctx.restore();
            break;
        }

        case TileType.CASINO_FELT: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#6b0d22' : '#5e0a1d';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'casino_carpet', sx, sy, 0.38, 1.05);
            ctx.fillStyle = isAlt ? 'rgba(107, 13, 34, 0.52)' : 'rgba(85, 8, 25, 0.58)';
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 215, 0, 0.32)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy - 6);
            ctx.lineTo(sx + 10, sy);
            ctx.lineTo(sx, sy + 6);
            ctx.lineTo(sx - 10, sy);
            ctx.closePath();
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            ctx.fillRect(sx - 1, sy - 1, 2, 2);
            break;
        }

        case TileType.VIP_WALKWAY: {
            ctx.fillStyle = '#9e112b';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'casino_carpet', sx, sy, 0.65, 1.05);
            ctx.fillStyle = 'rgba(165, 15, 42, 0.35)';
            ctx.fill();
            ctx.restore();

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
            ctx.fillStyle = '#1d192b';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'stone_inset', sx, sy, 0.42, 1.04);
            ctx.fillStyle = 'rgba(29, 25, 43, 0.55)';
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 215, 0, 0.78)';
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
            const pulse = 0.7 + 0.3 * Math.sin(timeMs / 240);
            ctx.fillStyle = '#092b24';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'stone_inset', sx, sy, 0.35, 1.04);
            ctx.restore();

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.stroke();

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
            if (gx === 12 && gy === 13) seatLabel = 'P2';
            else if (gx === 11 && gy === 12) seatLabel = 'P3';
            else if (gx === 11 && gy === 14) seatLabel = 'P4';

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
            // 6 Distinct Meme Betting Mats at x: 18..20, y: 14..15
            let memeBg = '#0a5c36';
            let icon = '\u{1F438}';
            let label = '3x';

            if (gx === 18 && gy === 14) {
                memeBg = '#0a5c36';
                icon = '\u{1F438}';
                label = '3x';
            } else if (gx === 19 && gy === 14) {
                memeBg = '#7a6000';
                icon = '\u{1F415}';
                label = '4x';
            } else if (gx === 20 && gy === 14) {
                memeBg = '#8b1c1c';
                icon = '\u{1F680}';
                label = '6x';
            } else if (gx === 18 && gy === 15) {
                memeBg = '#1c4d8b';
                icon = '\u{1F48E}';
                label = '8x';
            } else if (gx === 19 && gy === 15) {
                memeBg = '#541c8b';
                icon = '\u{1F5FF}';
                label = '12x';
            } else if (gx === 20 && gy === 15) {
                memeBg = '#8b1c6d';
                icon = '\u{1F984}';
                label = '25x';
            }

            ctx.fillStyle = memeBg;
            ctx.fill();

            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(icon, sx - 8, sy);

            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#ffd700';
            ctx.fillText(label, sx + 9, sy + 0.5);
            break;
        }

        case TileType.MARBLE_WHITE: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#ebe6dc' : '#dfd9ce';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, isAlt ? 'marble_tile' : 'plaza_stone', sx, sy, 0.72, 1.04);
            ctx.fillStyle = isAlt ? 'rgba(245, 240, 232, 0.35)' : 'rgba(220, 212, 200, 0.38)';
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(130, 120, 110, 0.32)';
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

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'plaza_stone', sx, sy, 0.5, 1.04);
            ctx.fillStyle = isAlt ? 'rgba(44, 51, 61, 0.55)' : 'rgba(32, 38, 48, 0.6)';
            ctx.fill();
            ctx.restore();

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

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, (gx + gy) % 2 === 0 ? 'river_water' : 'river_tile', sx, sy, 0.72, 1.05);
            ctx.fillStyle = `rgba(0, ${g}, ${b}, 0.32)`;
            ctx.fill();
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(sx, sy, 7 + wave * 3, 0, Math.PI);
            ctx.stroke();

            // Render 3D Kenney water lilies on select Koi Pond tiles
            if ((gx === 9 && gy === 23) || (gx === 13 && gy === 24)) {
                drawIsoDetailSprite(ctx, 'lily_large', sx, sy, 1.15, wave * 1.2, 0);
            } else if ((gx === 10 && gy === 25) || (gx === 12 && gy === 22)) {
                drawIsoDetailSprite(ctx, 'lily_small', sx, sy, 1.1, -wave, 1);
            }
            break;
        }

        case TileType.CARPET_PURPLE: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#32124a' : '#2a0e3f';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'plaza_stone', sx, sy, 0.28, 1.04);
            ctx.fillStyle = isAlt ? 'rgba(50, 18, 74, 0.65)' : 'rgba(42, 14, 63, 0.68)';
            ctx.fill();
            ctx.restore();
            break;
        }

        case TileType.CARPET_TEAL: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#0c3b40' : '#093034';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'stone_inset', sx, sy, 0.3, 1.04);
            ctx.fillStyle = isAlt ? 'rgba(12, 59, 64, 0.62)' : 'rgba(9, 48, 52, 0.66)';
            ctx.fill();
            ctx.restore();
            break;
        }

        case TileType.WALL_BRICK: {
            const wallH = 18;
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

            ctx.fillStyle = '#191926';
            ctx.beginPath();
            ctx.moveTo(sx - TILE_WIDTH / 2, sy - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - wallH);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2);
            ctx.lineTo(sx - TILE_WIDTH / 2, sy);
            ctx.closePath();
            ctx.fill();

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

        case TileType.GRASS_LUSH:
        case TileType.GRASS_MEADOW: {
            const isLush = type === TileType.GRASS_LUSH;
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isLush
                ? isAlt
                    ? '#236e38'
                    : '#1d5e2f'
                : isAlt
                  ? '#2b7d42'
                  : '#256e39';
            ctx.fill();

            // Render pre-rendered 3D Kenney grass tile texture clipped cleanly to diamond
            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'grass_lush', sx, sy, 0.9, 1.04);
            ctx.fillStyle = isLush
                ? isAlt
                    ? 'rgba(20, 75, 38, 0.22)'
                    : 'rgba(14, 58, 28, 0.28)'
                : isAlt
                  ? 'rgba(55, 155, 75, 0.14)'
                  : 'rgba(35, 115, 55, 0.18)';
            ctx.fill();
            ctx.restore();

            // Crisp grass blade detail tufts
            ctx.strokeStyle = isLush ? 'rgba(65, 185, 95, 0.65)' : 'rgba(90, 210, 115, 0.65)';
            ctx.lineWidth = 1.1;
            const offset = ((gx * 7 + gy * 13) % 5) - 2;
            ctx.beginPath();
            ctx.moveTo(sx - 6 + offset, sy + 2);
            ctx.lineTo(sx - 8 + offset, sy - 3);
            ctx.moveTo(sx + 5 - offset, sy + 3);
            ctx.lineTo(sx + 7 - offset, sy - 2);
            ctx.stroke();
            break;
        }

        case TileType.FLOWER_PATCH: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#26733b' : '#206332';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'grass_lush', sx, sy, 0.92, 1.04);
            ctx.fillStyle = 'rgba(35, 120, 58, 0.18)';
            ctx.fill();
            ctx.restore();

            // Render real 3D Kenney flower & mushroom sprites on top of the grass diamond
            const flowerKeys = ['flower_red', 'flower_purple', 'flower_yellow', 'mushroom_red'];
            const k1 = flowerKeys[(gx * 3 + gy) % flowerKeys.length];
            const k2 = flowerKeys[(gx + gy * 5 + 1) % flowerKeys.length];
            const drewSprite = drawIsoDetailSprite(ctx, k1, sx, sy, 1.15, -7, -2);
            drawIsoDetailSprite(ctx, k2, sx, sy, 1.05, 7, 2);

            if (!drewSprite) {
                const flowerColors = ['#ff80ab', '#ffd740', '#80d8ff', '#ffffff'];
                ctx.fillStyle = flowerColors[(gx * 3 + gy) % flowerColors.length];
                ctx.beginPath();
                ctx.arc(sx - 7, sy - 1, 2.2, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        }

        case TileType.STONE_PATH: {
            const isAlt = (gx + gy) % 2 === 0;
            ctx.fillStyle = isAlt ? '#7a7467' : '#6e685c';
            ctx.fill();

            ctx.save();
            ctx.clip();
            const pathKey = (gx + gy) % 3 === 0 ? 'grass_path_rocks' : 'grass_path_tile';
            drawIsoTileSprite(ctx, pathKey, sx, sy, 0.92, 1.04);
            ctx.restore();

            // Overlay 3D Kenney cobblestone stepping stones
            drawIsoDetailSprite(
                ctx,
                isAlt ? 'path_stone' : 'path_stone_circle',
                sx,
                sy,
                1.08,
                0,
                0,
                0.92
            );
            break;
        }

        case TileType.FOREST_PORTAL: {
            const pulse = 0.65 + 0.35 * Math.sin(timeMs / 220);
            ctx.fillStyle = '#0d3d28';
            ctx.fill();

            ctx.save();
            ctx.clip();
            drawIsoTileSprite(ctx, 'grass_path_tile', sx, sy, 0.6, 1.04);
            ctx.restore();

            ctx.strokeStyle = `rgba(0, 255, 136, ${0.9 * pulse})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = `rgba(0, 255, 160, ${0.25 * pulse})`;
            ctx.beginPath();
            ctx.moveTo(sx, sy - TILE_HEIGHT / 2 + 3);
            ctx.lineTo(sx + TILE_WIDTH / 2 - 6, sy);
            ctx.lineTo(sx, sy + TILE_HEIGHT / 2 - 3);
            ctx.lineTo(sx - TILE_WIDTH / 2 + 6, sy);
            ctx.closePath();
            ctx.fill();

            ctx.font = 'bold 9px monospace';
            ctx.fillStyle = '#a7ffeb';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(gx === 0 ? '← CASINO' : 'WOODS →', sx, sy);
            break;
        }

        default:
            ctx.fillStyle = '#111111';
            ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(sx - TILE_WIDTH / 2, sy);
    ctx.lineTo(sx, sy - TILE_HEIGHT / 2);
    ctx.lineTo(sx + TILE_WIDTH / 2, sy);
    ctx.stroke();

    ctx.restore();
}

export class StaticFloorCache {
    public canvas: HTMLCanvasElement | null = null;
    public originX = 0;
    public originY = 0;
    public width = 0;
    public height = 0;

    public build(zone: WorldZone = 'casino') {
        if (typeof document === 'undefined') return;

        const tiles = zone === 'forest' ? FOREST_TILES : WORLD_TILES;
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
                const tileType = tiles[y][x];
                if (!tileType) continue;

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
