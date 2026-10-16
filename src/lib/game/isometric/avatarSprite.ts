// src/lib/game/isometric/avatarSprite.ts
/**
 * Avatar rendering, transparent Unicorn figure compositor (zero black background!),
 * walk cycle animations, 6 distinct dance moves, speech bubbles, PTT voice ripples, and name tags.
 */

import { gridToScreen, type IsoDirection } from './isoMath';

export type DanceMoveType = 'disco' | 'spin' | 'robot' | 'wave' | 'windmill' | 'headbang';

export interface PlayerAvatarState {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl: string;
    x: number;
    y: number;
    dir: IsoDirection;
    isWalking: boolean;
    isDancing: boolean;
    danceMove?: DanceMoveType;
    isSpeaking: boolean;
    walkAnimTick: number;
    speechBubble?: {
        text: string;
        expiresAt: number;
    };
    currentEmote?: {
        icon: string;
        expiresAt: number;
    };
    hasVaultCrown?: boolean;
    hasHighRollerCrown?: boolean;
    chips?: number;
    wins?: number;
    losses?: number;
    isHouseDealer?: boolean;
}

// Image / Canvas cache to avoid re-decoding images every frame
const avatarDrawableCache = new Map<string, HTMLCanvasElement | HTMLImageElement>();
const loadingUrls = new Set<string>();
let cachedDealerDataUrl = '';

const DEALER_TRAIT_LAYERS = [
    '/traits/body/classic.png',
    '/traits/eyes/deal with it.png',
    '/traits/head/fedora.png',
    '/traits/costume/suit.png',
    '/traits/accessory/cash.png',
    '/traits/horn/gold.png'
];

const DEFAULT_UNICORN_TRAIT_LAYERS = [
    '/traits/body/classic.png',
    '/traits/eyes/classic.png',
    '/traits/head/classic.png',
    '/traits/horn/classic.png'
];

function loadRawImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

/**
 * Composites multiple transparent trait PNGs into a single 100% transparent offscreen canvas
 */
async function buildTransparentCompositeCanvas(layerUrls: string[], cacheKey: string, isDealer = false) {
    if (typeof document === 'undefined' || loadingUrls.has(cacheKey)) return;
    loadingUrls.add(cacheKey);

    try {
        const loaded = await Promise.all(layerUrls.map(loadRawImage));
        const valid = loaded.filter((i): i is HTMLImageElement => i !== null && i.naturalWidth > 0);
        if (valid.length > 0) {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 128;
            const ctx = c.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, 128, 128);
                ctx.imageSmoothingEnabled = false;
                for (const img of valid) {
                    ctx.drawImage(img, 0, 0, 128, 128);
                }
                avatarDrawableCache.set(cacheKey, c);
                if (isDealer) {
                    cachedDealerDataUrl = c.toDataURL('image/png');
                }
                return;
            }
        }
    } catch {}
}

/**
 * Removes solid black/near-black background pixels from an image if it has an opaque dark border
 */
function stripBlackBackgroundToCanvas(img: HTMLImageElement): HTMLCanvasElement {
    const w = img.naturalWidth || 128;
    const h = img.naturalHeight || 128;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return c;

    ctx.drawImage(img, 0, 0, w, h);
    try {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Check if top-left corner pixel is opaque and dark (black background)
        const r0 = data[0];
        const g0 = data[1];
        const b0 = data[2];
        const a0 = data[3];

        if (a0 > 200 && r0 < 30 && g0 < 30 && b0 < 30) {
            // Flood-fill from outer edges to remove contiguous dark background without erasing inner dark outlines
            const visited = new Uint8Array(w * h);
            const queue = new Int32Array(w * h);
            let head = 0;
            let tail = 0;

            const pushIfDark = (x: number, y: number) => {
                if (x < 0 || x >= w || y < 0 || y >= h) return;
                const idx = y * w + x;
                if (visited[idx]) return;
                const p = idx * 4;
                if (data[p + 3] > 0 && data[p] < 28 && data[p + 1] < 28 && data[p + 2] < 28) {
                    visited[idx] = 1;
                    queue[tail++] = idx;
                }
            };

            for (let x = 0; x < w; x++) {
                pushIfDark(x, 0);
                pushIfDark(x, h - 1);
            }
            for (let y = 0; y < h; y++) {
                pushIfDark(0, y);
                pushIfDark(w - 1, y);
            }

            while (head < tail) {
                const curr = queue[head++];
                const p = curr * 4;
                data[p + 3] = 0; // Make transparent
                const cx = curr % w;
                const cy = (curr / w) | 0;
                pushIfDark(cx + 1, cy);
                pushIfDark(cx - 1, cy);
                pushIfDark(cx, cy + 1);
                pushIfDark(cx, cy - 1);
            }

            ctx.putImageData(imgData, 0, 0);
        }
    } catch {}

    return c;
}

/**
 * Returns the cached transparent House Dealer Unicorn data URL for UI badges
 */
export function getTransparentDealerDataUrl(): string {
    if (!cachedDealerDataUrl && typeof window !== 'undefined') {
        buildTransparentCompositeCanvas(DEALER_TRAIT_LAYERS, 'dealer_unicorn', true);
    }
    return cachedDealerDataUrl || '/traits/body/classic.png';
}

export function getCachedAvatarImage(url: string): HTMLCanvasElement | HTMLImageElement | null {
    if (typeof window === 'undefined') return null;

    // 1. Special transparent House Dealer Unicorn composite
    if (url === 'dealer_unicorn') {
        const cached = avatarDrawableCache.get('dealer_unicorn');
        if (cached) return cached;
        buildTransparentCompositeCanvas(DEALER_TRAIT_LAYERS, 'dealer_unicorn', true);
        return null;
    }

    // 2. Replace '/unicorn.png' (which has a black background) with our 100% transparent layered Unicorn figure
    if (!url || url === '/unicorn.png') {
        const cached = avatarDrawableCache.get('default_unicorn');
        if (cached) return cached;
        buildTransparentCompositeCanvas(DEFAULT_UNICORN_TRAIT_LAYERS, 'default_unicorn', false);
        return null;
    }

    const existing = avatarDrawableCache.get(url);
    if (existing) return existing;

    if (!loadingUrls.has(url)) {
        loadingUrls.add(url);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const cleanCanvas = stripBlackBackgroundToCanvas(img);
            avatarDrawableCache.set(url, cleanCanvas);
        };
        img.src = url;
    }

    return null;
}

/**
 * Renders a player or House Dealer Unicorn avatar at its current isometric position
 */
export function renderPlayerAvatar(
    ctx: CanvasRenderingContext2D,
    player: PlayerAvatarState,
    cameraX: number,
    cameraY: number,
    canvasW: number,
    canvasH: number,
    isLocalPlayer: boolean
) {
    const screen = gridToScreen(player.x, player.y, 0, cameraX, cameraY, canvasW, canvasH);
    const sx = Math.round(screen.x);
    const sy = Math.round(screen.y);

    // Frustum culling for offscreen avatars
    if (sx < -120 || sx > canvasW + 120 || sy < -120 || sy > canvasH + 140) {
        return;
    }

    ctx.save();
    ctx.translate(sx, sy);

    // 1. Local Player / House Dealer Ground Ring & Drop Shadow
    ctx.save();
    if (isLocalPlayer) {
        const ringPulse = Math.sin(performance.now() / 220) * 1.5;
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.78)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 3, 20 + ringPulse, 10 + ringPulse * 0.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    } else if (player.isHouseDealer) {
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(0, 3, 19, 9.5, 0, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 16, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Calculate animation offsets & Dance Moves
    let bobY = 0;
    let tiltAngle = 0;
    let scaleX = player.dir === 'NW' || player.dir === 'SW' ? -1 : 1;
    let scaleY = 1;

    if (player.isDancing) {
        const move = player.danceMove || 'disco';

        switch (move) {
            case 'disco':
                bobY = -Math.abs(Math.sin(player.walkAnimTick * 8)) * 14;
                tiltAngle = Math.sin(player.walkAnimTick * 6) * 0.16;
                break;

            case 'spin':
                bobY = -Math.sin(player.walkAnimTick * 5) * 6;
                scaleX = Math.cos(player.walkAnimTick * 8);
                tiltAngle = Math.sin(player.walkAnimTick * 8) * 0.18;
                break;

            case 'robot': {
                const snap = Math.floor(player.walkAnimTick * 4) % 4;
                tiltAngle = snap === 0 ? 0.22 : snap === 2 ? -0.22 : 0;
                bobY = snap % 2 === 0 ? -5 : 0;
                break;
            }

            case 'wave':
                bobY = Math.sin(player.walkAnimTick * 6) * 8;
                tiltAngle = Math.cos(player.walkAnimTick * 6) * 0.24;
                break;

            case 'windmill':
                bobY = 6 + Math.sin(player.walkAnimTick * 12) * 5;
                tiltAngle = (player.walkAnimTick * 8) % (Math.PI * 2);
                break;

            case 'headbang':
                bobY = -Math.abs(Math.sin(player.walkAnimTick * 14)) * 11;
                tiltAngle = -Math.sin(player.walkAnimTick * 14) * 0.35;
                break;
        }
    } else if (player.isWalking) {
        bobY = -Math.abs(Math.sin(player.walkAnimTick * 8)) * 5.5;
        tiltAngle = Math.sin(player.walkAnimTick * 8) * 0.08 * (scaleX > 0 ? 1 : -1);
    } else {
        bobY = Math.sin(performance.now() / 500 + (player.id.charCodeAt(0) || 0)) * 1.2;
    }

    // 3. Draw Speaking Audio Pulse Rings (if PTT active)
    if (player.isSpeaking) {
        ctx.save();
        const pulse = (performance.now() % 1000) / 1000;
        ctx.strokeStyle = `rgba(0, 255, 128, ${1 - pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -32 + bobY, 24 + pulse * 18, 14 + pulse * 10, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(0, 255, 200, ${Math.max(0, 0.7 - pulse)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -32 + bobY, 32 + pulse * 22, 18 + pulse * 14, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // 4. Draw Transparent Avatar Sprite (Zero Black Background!)
    const effectiveUrl = player.isHouseDealer ? 'dealer_unicorn' : player.avatarUrl || '/unicorn.png';
    const drawable = getCachedAvatarImage(effectiveUrl);

    ctx.save();
    ctx.translate(0, bobY);
    ctx.rotate(tiltAngle);
    ctx.scale(scaleX, scaleY);

    const AVATAR_SIZE = 62;
    if (drawable) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(drawable, -AVATAR_SIZE / 2, -AVATAR_SIZE + 5, AVATAR_SIZE, AVATAR_SIZE);
    } else {
        // Transparent vector unicorn silhouette while PNG layers finish loading (takes <20ms)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -28, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(-4, -40);
        ctx.lineTo(0, -54);
        ctx.lineTo(4, -40);
        ctx.closePath();
        ctx.fill();
    }

    // Crowns above head
    if (player.hasHighRollerCrown) {
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F451}', 0, -AVATAR_SIZE + 1);
    } else if (player.hasVaultCrown) {
        ctx.font = '17px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u{1F48E}', 0, -AVATAR_SIZE + 1);
    }

    ctx.restore();

    // 5. Name Tag & PTT Badge
    ctx.save();
    const tagY = -AVATAR_SIZE - 4 + bobY;
    const crownPrefix = player.hasHighRollerCrown
        ? '\u{1F451} '
        : player.hasVaultCrown
          ? '\u{1F48E} '
          : '';
    const rawUser = player.username || 'anon';
    const tagText =
        crownPrefix +
        (player.isHouseDealer || rawUser.startsWith('@') || rawUser.startsWith('\u{1F984}') || rawUser.startsWith('\u{1F916}')
            ? rawUser
            : '@' + rawUser);

    ctx.font = 'bold 11px "MS Sans Serif", Tahoma, Arial, sans-serif';
    const textMetrics = ctx.measureText(tagText);
    const tagW = textMetrics.width + 14;
    const tagH = 17;

    ctx.fillStyle = player.isHouseDealer
        ? 'rgba(45, 10, 65, 0.92)'
        : isLocalPlayer
          ? 'rgba(0, 18, 90, 0.92)'
          : 'rgba(10, 10, 22, 0.85)';
    ctx.fillRect(-tagW / 2, tagY - tagH, tagW, tagH);

    ctx.strokeStyle = player.isHouseDealer
        ? '#ffd700'
        : isLocalPlayer
          ? '#00ffff'
          : '#a0a0b8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-tagW / 2, tagY - tagH, tagW, tagH);

    ctx.fillStyle = player.isHouseDealer ? '#ffd700' : isLocalPlayer ? '#ffff80' : '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, 0, tagY - tagH / 2 + 0.5);

    if (player.isSpeaking) {
        ctx.font = '11px sans-serif';
        ctx.fillText(' \u{1F399}\u{FE0F}', tagW / 2 + 8, tagY - tagH / 2);
    }
    ctx.restore();

    // 6. Floating Reaction Emote
    if (player.currentEmote && player.currentEmote.expiresAt > Date.now()) {
        ctx.save();
        const emoteBob = Math.sin(performance.now() / 160) * 5;
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.currentEmote.icon, 0, tagY - tagH - 14 + emoteBob);
        ctx.restore();
    }

    // 7. Speech Bubble
    if (player.speechBubble && player.speechBubble.expiresAt > Date.now()) {
        renderSpeechBubble(ctx, player.speechBubble.text, 0, tagY - tagH - 10);
    }

    ctx.restore();
}

/**
 * Renders an authentic Windows 98 comic speech bubble with bevels and tail
 */
function renderSpeechBubble(
    ctx: CanvasRenderingContext2D,
    text: string,
    anchorX: number,
    anchorY: number
) {
    ctx.save();
    ctx.font = 'bold 11px "MS Sans Serif", Tahoma, Arial, sans-serif';

    const maxWidth = 165;
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        if (ctx.measureText(testLine).width < maxWidth) {
            currentLine = testLine;
        } else {
            lines.push(currentLine);
            currentLine = words[i];
        }
    }
    lines.push(currentLine);

    const lineHeight = 14;
    const padding = 7;
    let bubbleW = 0;
    for (const line of lines) {
        bubbleW = Math.max(bubbleW, ctx.measureText(line).width);
    }
    bubbleW += padding * 2;
    const bubbleH = lines.length * lineHeight + padding * 2;

    const bx = anchorX - bubbleW / 2;
    const by = anchorY - bubbleH - 8;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(bx + 3, by + 3, bubbleW, bubbleH);

    ctx.fillStyle = '#ffffe1';
    ctx.fillRect(bx, by, bubbleW, bubbleH);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    ctx.fillStyle = '#ffffe1';
    ctx.beginPath();
    ctx.moveTo(anchorX - 5, by + bubbleH);
    ctx.lineTo(anchorX, anchorY);
    ctx.lineTo(anchorX + 5, by + bubbleH);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(anchorX - 5, by + bubbleH);
    ctx.lineTo(anchorX, anchorY);
    ctx.lineTo(anchorX + 5, by + bubbleH);
    ctx.stroke();

    ctx.fillStyle = '#ffffe1';
    ctx.fillRect(anchorX - 4, by + bubbleH - 1, 8, 2);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, index) => {
        ctx.fillText(line, bx + padding, by + padding + index * lineHeight);
    });

    ctx.restore();
}
