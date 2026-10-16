// src/lib/game/isometric/pathfinding.ts
/**
 * High-Precision A* (A-Star) Pathfinding & Corner-Safe Smoothing for UwU World
 * Fixes:
 * - Uses Math.floor(x) instead of Math.round(x) so tile-center coordinates (x + 0.5) map to the exact tile [x, x+1)
 * - Escapes gracefully if start tile is ever near/on a solid boundary
 * - Finds the optimal adjacent walkable interaction tile when clicking on solid tables/machines
 * - Prevents diagonal corner-cutting and clamps final waypoints away from solid walls
 */

export interface Point {
    x: number;
    y: number;
}

interface Node {
    x: number;
    y: number;
    g: number;
    h: number;
    f: number;
    parent: Node | null;
}

/**
 * Checks if a point (gx, gy) has clearance from all solid tiles
 */
function hasClearance(gx: number, gy: number, collisionMap: boolean[][], mapSize: number, radius = 0.24): boolean {
    const minTx = Math.floor(gx - radius);
    const maxTx = Math.floor(gx + radius);
    const minTy = Math.floor(gy - radius);
    const maxTy = Math.floor(gy + radius);

    for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
            if (tx < 1 || tx >= mapSize - 1 || ty < 1 || ty >= mapSize - 1) return false;
            if (collisionMap[ty]?.[tx]) {
                const closestX = Math.max(tx, Math.min(gx, tx + 1));
                const closestY = Math.max(ty, Math.min(gy, ty + 1));
                if (Math.hypot(gx - closestX, gy - closestY) < radius) {
                    return false;
                }
            }
        }
    }
    return true;
}

/**
 * Checks if the straight segment between A and B has full obstacle clearance
 */
function hasLineOfSight(a: Point, b: Point, collisionMap: boolean[][], mapSize: number): boolean {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(2, Math.ceil(dist * 6));
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = a.x + (b.x - a.x) * t;
        const py = a.y + (b.y - a.y) * t;
        if (!hasClearance(px, py, collisionMap, mapSize, 0.26)) {
            return false;
        }
    }
    return true;
}

/**
 * Finds nearest walkable tile to (gx, gy)
 */
function findNearestWalkableTile(
    gx: number,
    gy: number,
    refX: number,
    refY: number,
    collisionMap: boolean[][],
    mapSize: number
): { x: number; y: number } | null {
    const baseTx = Math.max(1, Math.min(mapSize - 2, Math.floor(gx)));
    const baseTy = Math.max(1, Math.min(mapSize - 2, Math.floor(gy)));

    if (!collisionMap[baseTy]?.[baseTx]) {
        return { x: baseTx, y: baseTy };
    }

    let bestDist = Infinity;
    let bestTile: { x: number; y: number } | null = null;

    for (let r = 1; r <= 6; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const nx = baseTx + dx;
                const ny = baseTy + dy;
                if (nx >= 1 && nx < mapSize - 1 && ny >= 1 && ny < mapSize - 1) {
                    if (!collisionMap[ny]?.[nx]) {
                        const cx = nx + 0.5;
                        const cy = ny + 0.5;
                        const dTarget = Math.hypot(cx - gx, cy - gy);
                        const dRef = Math.hypot(cx - refX, cy - refY) * 0.15;
                        const score = dTarget + dRef;
                        if (score < bestDist) {
                            bestDist = score;
                            bestTile = { x: nx, y: ny };
                        }
                    }
                }
            }
        }
        if (bestTile) break;
    }

    return bestTile;
}

/**
 * Finds the optimal tile path from start to target using A* search.
 * Returns an array of waypoints to follow.
 */
export function findPath(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    collisionMap: boolean[][],
    mapSize: number
): Point[] {
    // 1. Resolve start tile using Math.floor (since tile [tx, tx+1) has center tx + 0.5)
    const startTile = findNearestWalkableTile(startX, startY, startX, startY, collisionMap, mapSize);
    if (!startTile) return [];

    const sX = startTile.x;
    const sY = startTile.y;

    // 2. Resolve target tile
    const rawTx = Math.max(1, Math.min(mapSize - 2, Math.floor(targetX)));
    const rawTy = Math.max(1, Math.min(mapSize - 2, Math.floor(targetY)));
    const isTargetOriginalSolid = Boolean(collisionMap[rawTy]?.[rawTx]);

    const targetTile = findNearestWalkableTile(targetX, targetY, startX, startY, collisionMap, mapSize);
    if (!targetTile) return [];

    const tX = targetTile.x;
    const tY = targetTile.y;

    // Clamp final float destination so it never sits within 0.26 of a solid tile edge
    let safeTargetX = isTargetOriginalSolid ? tX + 0.5 : Math.max(tX + 0.26, Math.min(tX + 0.74, targetX));
    let safeTargetY = isTargetOriginalSolid ? tY + 0.5 : Math.max(tY + 0.26, Math.min(tY + 0.74, targetY));
    if (!hasClearance(safeTargetX, safeTargetY, collisionMap, mapSize, 0.24)) {
        safeTargetX = tX + 0.5;
        safeTargetY = tY + 0.5;
    }

    if (sX === tX && sY === tY) {
        return [{ x: safeTargetX, y: safeTargetY }];
    }

    const openList: Node[] = [];
    const closedSet = new Set<number>();

    const startNode: Node = {
        x: sX,
        y: sY,
        g: 0,
        h: Math.hypot(tX - sX, tY - sY),
        f: 0,
        parent: null
    };
    startNode.f = startNode.g + startNode.h;
    openList.push(startNode);

    const directions = [
        { dx: 1, dy: 0, cost: 1.0 },
        { dx: -1, dy: 0, cost: 1.0 },
        { dx: 0, dy: 1, cost: 1.0 },
        { dx: 0, dy: -1, cost: 1.0 },
        { dx: 1, dy: 1, cost: 1.4142 },
        { dx: -1, dy: 1, cost: 1.4142 },
        { dx: 1, dy: -1, cost: 1.4142 },
        { dx: -1, dy: -1, cost: 1.4142 }
    ];

    let iterations = 0;
    const maxIterations = 2000;

    while (openList.length > 0 && iterations < maxIterations) {
        iterations++;

        let bestIndex = 0;
        for (let i = 1; i < openList.length; i++) {
            if (openList[i].f < openList[bestIndex].f) {
                bestIndex = i;
            }
        }

        const current = openList.splice(bestIndex, 1)[0];
        const key = current.y * mapSize + current.x;

        if (current.x === tX && current.y === tY) {
            const rawPath: Point[] = [];
            let curr: Node | null = current;
            while (curr && curr.parent) {
                rawPath.unshift({ x: curr.x + 0.5, y: curr.y + 0.5 });
                curr = curr.parent;
            }

            if (rawPath.length > 0) {
                rawPath[rawPath.length - 1] = { x: safeTargetX, y: safeTargetY };
            } else {
                rawPath.push({ x: safeTargetX, y: safeTargetY });
            }

            // Smooth path using corner-safe line-of-sight string pulling
            const smoothed: Point[] = [];
            let anchor: Point = { x: startX, y: startY };
            let idx = 0;

            while (idx < rawPath.length) {
                let furthest = idx;
                for (let probe = rawPath.length - 1; probe > idx; probe--) {
                    if (hasLineOfSight(anchor, rawPath[probe], collisionMap, mapSize)) {
                        furthest = probe;
                        break;
                    }
                }
                smoothed.push(rawPath[furthest]);
                anchor = rawPath[furthest];
                idx = furthest + 1;
            }

            return smoothed;
        }

        closedSet.add(key);

        for (const dir of directions) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;

            if (nx < 1 || nx >= mapSize - 1 || ny < 1 || ny >= mapSize - 1) continue;
            if (collisionMap[ny]?.[nx]) continue;

            // Strict diagonal corner-cutting prevention: both adjacent cardinal tiles must be walkable
            if (dir.dx !== 0 && dir.dy !== 0) {
                if (collisionMap[current.y]?.[nx] || collisionMap[ny]?.[current.x]) {
                    continue;
                }
            }

            const neighborKey = ny * mapSize + nx;
            if (closedSet.has(neighborKey)) continue;

            const gScore = current.g + dir.cost;
            let neighborNode = openList.find((n) => n.x === nx && n.y === ny);

            if (!neighborNode) {
                neighborNode = {
                    x: nx,
                    y: ny,
                    g: gScore,
                    h: Math.hypot(tX - nx, tY - ny),
                    f: 0,
                    parent: current
                };
                neighborNode.f = neighborNode.g + neighborNode.h;
                openList.push(neighborNode);
            } else if (gScore < neighborNode.g) {
                neighborNode.g = gScore;
                neighborNode.f = neighborNode.g + neighborNode.h;
                neighborNode.parent = current;
            }
        }
    }

    return [{ x: safeTargetX, y: safeTargetY }];
}
