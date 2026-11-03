// src/lib/stores/namecard.ts
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import type { UserProfile } from '$lib/stores/auth';
import type { PlayerEconomyStats } from '$lib/game/economy/worldEconomy';
import { renderTransparentAvatar, getDefaultAvatarTraits } from '$lib/utils/avatar';

export type NamecardBgMode = 'liquid' | 'gradient' | 'solid';
export type NamecardBorderId =
    | 'glass_rim'
    | 'holo_glow'
    | 'chrome_edge'
    | 'pearl_soft'
    | 'neon_line'
    | 'none';
export type NamecardTextTone = 'auto' | 'dark' | 'light';

export interface NamecardStickerInstance {
    id: string;
    symbol: string;
    x: number; // 0..100 percentage of card width
    y: number; // 0..100 percentage of card height
    scale: number; // 0.6..1.8
    rotation: number; // -45..45 degrees
}

export interface NamecardConfig {
    version: 2;
    userId: string;
    username: string;
    displayName: string;
    tagline: string;
    bgMode: NamecardBgMode;
    bgPresetId: string;
    solidColor: string;
    showSparkles: boolean;
    borderId: NamecardBorderId;
    textTone: NamecardTextTone;
    stickers: NamecardStickerInstance[];
    paintDataUrl: string | null;
    paintLayer?: 'above' | 'behind';
    updatedAt: number;
}

export interface LiquidPreset {
    id: string;
    name: string;
    baseBg: string;
    ribbons: [string, string, string, string, string];
    defaultTextTone: 'dark' | 'light';
    accentColor: string;
    swatchGradient: string;
}

export interface GradientPreset {
    id: string;
    name: string;
    stops: [string, string, string];
    angle: number;
    defaultTextTone: 'dark' | 'light';
    accentColor: string;
}

export interface SolidColorPreset {
    id: string;
    name: string;
    hex: string;
    defaultTextTone: 'dark' | 'light';
}

export interface NamecardBorderOption {
    id: NamecardBorderId;
    name: string;
    desc: string;
}

export const CARD_FONT_STACK =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const LIQUID_PRESETS: LiquidPreset[] = [
    {
        id: 'holo_pearl',
        name: 'Dreamy Holo',
        baseBg: '#f9d8f4',
        ribbons: ['#ffafe6', '#9bf6ff', '#fff3b0', '#c8b6ff', '#ffffff'],
        defaultTextTone: 'dark',
        accentColor: '#9d2ec5',
        swatchGradient: 'linear-gradient(135deg, #ffafe6 0%, #c8b6ff 35%, #9bf6ff 70%, #fff3b0 100%)'
    },
    {
        id: 'liquid_chrome',
        name: 'Liquid Chrome',
        baseBg: '#e8eef7',
        ribbons: ['#ffffff', '#bde0fe', '#d8d2ff', '#a2d2ff', '#f8f9fa'],
        defaultTextTone: 'dark',
        accentColor: '#2563eb',
        swatchGradient: 'linear-gradient(135deg, #ffffff 0%, #bde0fe 40%, #d8d2ff 75%, #94a3b8 100%)'
    },
    {
        id: 'rose_silk',
        name: 'Rose Silk',
        baseBg: '#ffe5ec',
        ribbons: ['#ffb3c6', '#ffd6a5', '#ffcad4', '#e2afff', '#fff0f5'],
        defaultTextTone: 'dark',
        accentColor: '#d62872',
        swatchGradient: 'linear-gradient(135deg, #ffb3c6 0%, #ffd6a5 50%, #e2afff 100%)'
    },
    {
        id: 'aurora_mint',
        name: 'Mint Aurora',
        baseBg: '#e0fbfc',
        ribbons: ['#98f5e1', '#a3c4f3', '#cfbaf0', '#b9fbc0', '#ffffff'],
        defaultTextTone: 'dark',
        accentColor: '#0d9488',
        swatchGradient: 'linear-gradient(135deg, #98f5e1 0%, #a3c4f3 50%, #cfbaf0 100%)'
    },
    {
        id: 'sunset_prism',
        name: 'Sunset Prism',
        baseBg: '#fde2e4',
        ribbons: ['#ff9ebb', '#ffcb77', '#c77dff', '#ff8fa3', '#fff8e8'],
        defaultTextTone: 'dark',
        accentColor: '#b5179e',
        swatchGradient: 'linear-gradient(135deg, #ff9ebb 0%, #ffcb77 50%, #c77dff 100%)'
    },
    {
        id: 'obsidian_opal',
        name: 'Midnight Opal',
        baseBg: '#121324',
        ribbons: ['#241b4b', '#0f4c75', '#5a189a', '#0077b6', '#3c096c'],
        defaultTextTone: 'light',
        accentColor: '#72efdd',
        swatchGradient: 'linear-gradient(135deg, #121324 0%, #3c096c 45%, #0077b6 85%, #72efdd 100%)'
    }
];

export const GRADIENT_PRESETS: GradientPreset[] = [
    {
        id: 'cotton_candy',
        name: 'Cotton Candy',
        stops: ['#ffcbf2', '#e2afff', '#c0fdff'],
        angle: 135,
        defaultTextTone: 'dark',
        accentColor: '#9d2ec5'
    },
    {
        id: 'lavender_haze',
        name: 'Lavender Mist',
        stops: ['#e0c3fc', '#d9d2e9', '#8ec5fc'],
        angle: 135,
        defaultTextTone: 'dark',
        accentColor: '#5a189a'
    },
    {
        id: 'sky_glass',
        name: 'Sky Glass',
        stops: ['#d9f0ff', '#eef8ff', '#c8e7ff'],
        angle: 140,
        defaultTextTone: 'dark',
        accentColor: '#0284c7'
    },
    {
        id: 'peach_aura',
        name: 'Peach Glow',
        stops: ['#ffd8be', '#ffebf0', '#ffc4d6'],
        angle: 130,
        defaultTextTone: 'dark',
        accentColor: '#e11d48'
    },
    {
        id: 'matcha_milk',
        name: 'Matcha Cream',
        stops: ['#d8f3dc', '#f1faee', '#b7e4c7'],
        angle: 135,
        defaultTextTone: 'dark',
        accentColor: '#15803d'
    },
    {
        id: 'midnight_slate',
        name: 'Midnight Glass',
        stops: ['#0f172a', '#1e1b4b', '#1e293b'],
        angle: 135,
        defaultTextTone: 'light',
        accentColor: '#38bdf8'
    }
];

export const SOLID_COLOR_PRESETS: SolidColorPreset[] = [
    { id: 'snow', name: 'Pearl White', hex: '#ffffff', defaultTextTone: 'dark' },
    { id: 'blush', name: 'Soft Blush', hex: '#fff0f6', defaultTextTone: 'dark' },
    { id: 'lilac', name: 'Soft Lilac', hex: '#f3e8ff', defaultTextTone: 'dark' },
    { id: 'ice', name: 'Ice Blue', hex: '#ecfeff', defaultTextTone: 'dark' },
    { id: 'mint', name: 'Soft Mint', hex: '#ecfdf5', defaultTextTone: 'dark' },
    { id: 'butter', name: 'Warm Cream', hex: '#fefce8', defaultTextTone: 'dark' },
    { id: 'plum', name: 'Deep Plum', hex: '#1e142b', defaultTextTone: 'light' },
    { id: 'obsidian', name: 'Obsidian', hex: '#111318', defaultTextTone: 'light' }
];

export const NAMECARD_BORDERS: NamecardBorderOption[] = [
    { id: 'glass_rim', name: 'Specular Glass', desc: 'Frosted translucent rim light' },
    { id: 'holo_glow', name: 'Iridescent Halo', desc: 'Soft pastel rainbow border shimmer' },
    { id: 'chrome_edge', name: 'Liquid Silver', desc: 'Crisp metallic specular frame' },
    { id: 'pearl_soft', name: 'Soft Pearl', desc: 'Warm luminous white border' },
    { id: 'neon_line', name: 'Cyber Glow', desc: 'Luminous neon accent outline' },
    { id: 'none', name: 'Frameless', desc: 'Clean edge-to-edge card' }
];

export const TAGLINE_SUGGESTIONS: string[] = [
    '✨ vibing in uwu world',
    '🦋 firefly catcher',
    '🎲 high roller',
    '🌸 daydreaming',
    '🕹️ arcade regular',
    '💎 diamond hands',
    '🌙 night owl',
    '🫧 floating by'
];

export const NAMECARD_STICKER_CATALOG: { id: string; symbol: string; label: string }[] = [
    { id: 'stk_sparkle', symbol: '✦', label: 'Star Sparkle' },
    { id: 'stk_twinkle', symbol: '✨', label: 'Twinkle' },
    { id: 'stk_heart_w', symbol: '♡', label: 'Outline Heart' },
    { id: 'stk_heart_p', symbol: '💖', label: 'Sparkle Heart' },
    { id: 'stk_butterfly', symbol: '🦋', label: 'Butterfly' },
    { id: 'stk_ribbon', symbol: '🎀', label: 'Ribbon' },
    { id: 'stk_sakura', symbol: '🌸', label: 'Blossom' },
    { id: 'stk_bubbles', symbol: '🫧', label: 'Bubbles' },
    { id: 'stk_crown', symbol: '👑', label: 'Crown' },
    { id: 'stk_gem', symbol: '💎', label: 'Gem' },
    { id: 'stk_clover', symbol: '🍀', label: 'Lucky Clover' },
    { id: 'stk_disc', symbol: '💿', label: 'Holo Disc' },
    { id: 'stk_fire', symbol: '🔥', label: 'Fire' },
    { id: 'stk_bolt', symbol: '⚡', label: 'Bolt' },
    { id: 'stk_moon', symbol: '🌙', label: 'Crescent' },
    { id: 'stk_alien', symbol: '👾', label: 'Pixel Sprite' },
    { id: 'stk_boba', symbol: '🧋', label: 'Boba' },
    { id: 'stk_paw', symbol: '🐾', label: 'Paws' }
];

export const NAMECARD_PAINT_PALETTE: string[] = [
    '#ffffff',
    '#111318',
    '#ff2a85',
    '#ff85c1',
    '#ffcad4',
    '#ff595e',
    '#ff9f1c',
    '#fee440',
    '#fff3b0',
    '#00f5d4',
    '#72efdd',
    '#00bbf9',
    '#a2d2ff',
    '#4361ee',
    '#1e1b4b',
    '#9d4edd',
    '#c8b6ff',
    '#e0aaff',
    '#8ac926',
    '#adb5bd'
];

export const showNamecardStudio = writable<boolean>(false);

const LOCAL_NAMECARD_STORAGE_PREFIX = 'pfpuwu_namecard_v3_';

function hashString(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash);
}

/**
 * Resolves whether text on the card should be dark or light for crisp legibility.
 */
export function resolveCardTextTone(config: NamecardConfig): 'dark' | 'light' {
    if (config.textTone === 'dark' || config.textTone === 'light') {
        return config.textTone;
    }
    if (config.bgMode === 'liquid') {
        const preset = LIQUID_PRESETS.find((p) => p.id === config.bgPresetId) || LIQUID_PRESETS[0];
        return preset.defaultTextTone;
    }
    if (config.bgMode === 'gradient') {
        const preset = GRADIENT_PRESETS.find((p) => p.id === config.bgPresetId) || GRADIENT_PRESETS[0];
        return preset.defaultTextTone;
    }
    // Solid color luminance check
    const hex = (config.solidColor || '#ffffff').replace('#', '');
    if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum < 0.45 ? 'light' : 'dark';
    }
    return 'dark';
}

/**
 * Generates a clean default Namecard config for a user.
 * Defaults to the 'holo_pearl' dynamic liquid chrome background inspired by the reference image.
 */
export function generateDefaultNamecardConfig(
    userId: string,
    username: string,
    displayName?: string
): NamecardConfig {
    const cleanHandle = (username || 'player').replace(/^@/, '');
    const seed = hashString(`${userId}:${cleanHandle}`);
    const tagline = TAGLINE_SUGGESTIONS[seed % TAGLINE_SUGGESTIONS.length];

    return {
        version: 2,
        userId: userId || 'guest',
        username: cleanHandle,
        displayName: (displayName || cleanHandle).slice(0, 26),
        tagline,
        bgMode: 'liquid',
        bgPresetId: 'holo_pearl',
        solidColor: '#fff0f6',
        showSparkles: true,
        borderId: 'glass_rim',
        textTone: 'auto',
        stickers: [],
        paintDataUrl: null,
        paintLayer: 'above',
        updatedAt: Date.now()
    };
}

function normalizeConfig(raw: any, userId: string, username: string, displayName?: string): NamecardConfig {
    const fallback = generateDefaultNamecardConfig(userId, username, displayName);
    if (!raw || typeof raw !== 'object') return fallback;

    // Migrate legacy v1 configs cleanly to v2
    const bgMode: NamecardBgMode =
        raw.bgMode === 'liquid' || raw.bgMode === 'gradient' || raw.bgMode === 'solid'
            ? raw.bgMode
            : 'liquid';

    let bgPresetId = typeof raw.bgPresetId === 'string' ? raw.bgPresetId : 'holo_pearl';
    if (bgMode === 'liquid' && !LIQUID_PRESETS.some((p) => p.id === bgPresetId)) {
        bgPresetId = 'holo_pearl';
    } else if (bgMode === 'gradient' && !GRADIENT_PRESETS.some((p) => p.id === bgPresetId)) {
        bgPresetId = 'cotton_candy';
    }

    const borderId: NamecardBorderId = NAMECARD_BORDERS.some((b) => b.id === raw.borderId)
        ? raw.borderId
        : 'glass_rim';

    const rawStickers = Array.isArray(raw.stickers)
        ? raw.stickers
              .filter((s: any) => s && !s.isStamp && typeof s.symbol === 'string')
              .map((s: any) => ({
                  id: String(s.id || `stk_${Math.random().toString(36).slice(2, 7)}`),
                  symbol: String(s.symbol),
                  x: typeof s.x === 'number' ? s.x : 80,
                  y: typeof s.y === 'number' ? s.y : 25,
                  scale: typeof s.scale === 'number' ? s.scale : 1,
                  rotation: typeof s.rotation === 'number' ? s.rotation : 0
              }))
        : [];

    return {
        version: 2,
        userId,
        username: username.replace(/^@/, ''),
        displayName: (raw.displayName || displayName || username).slice(0, 26),
        tagline:
            typeof raw.tagline === 'string'
                ? raw.tagline.slice(0, 40)
                : typeof raw.moodPill === 'string'
                  ? raw.moodPill.slice(0, 40)
                  : fallback.tagline,
        bgMode,
        bgPresetId,
        solidColor: typeof raw.solidColor === 'string' ? raw.solidColor : '#fff0f6',
        showSparkles: typeof raw.showSparkles === 'boolean' ? raw.showSparkles : true,
        borderId,
        textTone:
            raw.textTone === 'dark' || raw.textTone === 'light' || raw.textTone === 'auto'
                ? raw.textTone
                : 'auto',
        stickers: rawStickers,
        paintDataUrl: typeof raw.paintDataUrl === 'string' ? raw.paintDataUrl : null,
        paintLayer: raw.paintLayer === 'behind' ? 'behind' : 'above',
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
    };
}

/**
 * Loads a user's Namecard configuration from localStorage and Supabase.
 */
export async function loadNamecardConfig(
    userId: string,
    username: string,
    displayName?: string
): Promise<NamecardConfig> {
    const fallback = generateDefaultNamecardConfig(userId, username, displayName);
    if (typeof window === 'undefined' || !userId || userId === 'guest') {
        return fallback;
    }

    const localKey = `${LOCAL_NAMECARD_STORAGE_PREFIX}${userId}`;
    let localConfig: NamecardConfig | null = null;

    try {
        const raw = localStorage.getItem(localKey);
        if (raw) {
            localConfig = normalizeConfig(JSON.parse(raw), userId, username, displayName);
        }
    } catch {}

    try {
        const { data, error } = await supabase
            .from('uwu_graffiti_wall')
            .select('pixels, updated_at')
            .eq('id', `namecard_${userId}`)
            .maybeSingle();

        if (!error && data?.pixels && typeof data.pixels === 'object') {
            const remoteConfig = normalizeConfig(data.pixels, userId, username, displayName);
            if (!localConfig || (remoteConfig.updatedAt || 0) >= (localConfig.updatedAt || 0)) {
                localStorage.setItem(localKey, JSON.stringify(remoteConfig));
                return remoteConfig;
            }
        }
    } catch {}

    if (localConfig) {
        return localConfig;
    }

    try {
        localStorage.setItem(localKey, JSON.stringify(fallback));
    } catch {}
    return fallback;
}

/**
 * Saves the user's Namecard configuration to localStorage and Supabase.
 */
export async function saveNamecardConfig(config: NamecardConfig): Promise<void> {
    if (typeof window === 'undefined' || !config.userId || config.userId === 'guest') return;

    const updated: NamecardConfig = {
        ...config,
        version: 2,
        updatedAt: Date.now()
    };

    const localKey = `${LOCAL_NAMECARD_STORAGE_PREFIX}${config.userId}`;
    try {
        localStorage.setItem(localKey, JSON.stringify(updated));
    } catch {}

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: `namecard_${config.userId}`,
                pixels: updated,
                updated_by: config.username,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}
}

/**
 * Ensures we always have a 100% transparent character PNG (never an opaque square image like /unicorn.png).
 */
let cachedDefaultTransparentAvatar: string | null = null;
export async function ensureTransparentAvatarUrl(profile: UserProfile | null): Promise<string> {
    if (
        profile?.avatar_url &&
        profile.avatar_url !== '/unicorn.png' &&
        !profile.avatar_url.includes('twimg.com')
    ) {
        return profile.avatar_url;
    }
    if (profile?.avatar_traits && Object.keys(profile.avatar_traits).length > 0) {
        const { dataUrl } = await renderTransparentAvatar(profile.avatar_traits, 256);
        if (dataUrl) return dataUrl;
    }
    if (cachedDefaultTransparentAvatar) {
        return cachedDefaultTransparentAvatar;
    }
    const { dataUrl } = await renderTransparentAvatar(getDefaultAvatarTraits(), 256);
    cachedDefaultTransparentAvatar = dataUrl;
    return dataUrl;
}

/**
 * Draws a 4-point star sparkle (✦) at (cx, cy) with outer radius r.
 */
function drawFourPointStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    const inner = r * 0.24;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx + inner * 0.4, cy - inner * 0.4, cx + r, cy);
    ctx.quadraticCurveTo(cx + inner * 0.4, cy + inner * 0.4, cx, cy + r);
    ctx.quadraticCurveTo(cx - inner * 0.4, cy + inner * 0.4, cx - r, cy);
    ctx.quadraticCurveTo(cx - inner * 0.4, cy - inner * 0.4, cx, cy - r);
    ctx.closePath();
    ctx.fill();
}

/**
 * Draws a delicate diamond (◇) at (cx, cy).
 */
function drawDiamondOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.85, cy);
    ctx.closePath();
    ctx.stroke();
}

/**
 * Draws a delicate heart outline/fill (♡) at (cx, cy).
 */
function drawMiniHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill = false) {
    ctx.save();
    ctx.translate(cx, cy - size * 0.35);
    ctx.beginPath();
    ctx.moveTo(0, size * 0.3);
    ctx.bezierCurveTo(0, 0, -size * 0.55, 0, -size * 0.55, size * 0.35);
    ctx.bezierCurveTo(-size * 0.55, size * 0.68, 0, size * 0.9, 0, size * 1.1);
    ctx.bezierCurveTo(0, size * 0.9, size * 0.55, size * 0.68, size * 0.55, size * 0.35);
    ctx.bezierCurveTo(size * 0.55, 0, 0, 0, 0, size * 0.3);
    ctx.closePath();
    if (fill) ctx.fill();
    else ctx.stroke();
    ctx.restore();
}

/**
 * Renders the Namecard background (Dynamic Liquid Holo/Chrome waves, Gradient, or Solid)
 * onto any 2D canvas context. Used both for live 60fps/30fps card animation AND for high-res PNG export!
 */
export function drawNamecardBackgroundFrame(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    config: NamecardConfig,
    timeSec = 0
) {
    ctx.save();

    if (config.bgMode === 'solid') {
        ctx.fillStyle = config.solidColor || '#fff0f6';
        ctx.fillRect(0, 0, W, H);
    } else if (config.bgMode === 'gradient') {
        const preset =
            GRADIENT_PRESETS.find((p) => p.id === config.bgPresetId) || GRADIENT_PRESETS[0];
        const rad = (preset.angle * Math.PI) / 180;
        const cx = W / 2;
        const cy = H / 2;
        const dx = Math.cos(rad) * (W * 0.6);
        const dy = Math.sin(rad) * (H * 0.6);
        const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
        grad.addColorStop(0, preset.stops[0]);
        grad.addColorStop(0.5, preset.stops[1]);
        grad.addColorStop(1, preset.stops[2]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    } else {
        // DYNAMIC LIQUID IRIDESCENT CHROME / HOLOGRAPHIC SWIRL
        const preset = LIQUID_PRESETS.find((p) => p.id === config.bgPresetId) || LIQUID_PRESETS[0];
        ctx.fillStyle = preset.baseBg;
        ctx.fillRect(0, 0, W, H);

        // Soft glowing base blobs that slowly orbit
        const t = timeSec * 0.55;
        for (let i = 0; i < preset.ribbons.length; i++) {
            const phase = i * 1.35;
            const bx = W * (0.5 + 0.38 * Math.sin(t * 0.7 + phase));
            const by = H * (0.5 + 0.38 * Math.cos(t * 0.55 + phase * 1.2));
            const radius = Math.max(W, H) * (0.58 + 0.1 * Math.sin(t + i));
            const rGrad = ctx.createRadialGradient(bx, by, radius * 0.04, bx, by, radius);
            rGrad.addColorStop(0, preset.ribbons[i]);
            rGrad.addColorStop(0.55, preset.ribbons[(i + 1) % preset.ribbons.length] + '88');
            rGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = rGrad;
            ctx.fillRect(0, 0, W, H);
        }

        // Flowing Liquid Chrome / Iridescent Silk Ribbons (like reference image)
        for (let r = 0; r < 5; r++) {
            const colorA = preset.ribbons[r % preset.ribbons.length];
            const colorB = preset.ribbons[(r + 2) % preset.ribbons.length];
            const yBase = H * (0.15 + r * 0.19);
            const amp1 = H * (0.16 + (r % 2) * 0.06);
            const amp2 = H * 0.09;
            const speed = (r % 2 === 0 ? 1 : -1) * 0.45;

            ctx.beginPath();
            for (let x = -20; x <= W + 20; x += 16) {
                const nx = x / W;
                const y =
                    yBase +
                    Math.sin(nx * 4.2 + t * speed + r * 1.1) * amp1 +
                    Math.cos(nx * 7.5 - t * 0.35 + r * 2.0) * amp2;
                if (x === -20) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            for (let x = W + 20; x >= -20; x -= 16) {
                const nx = x / W;
                const thickness = H * (0.14 + 0.05 * Math.sin(nx * 5 + t + r));
                const y =
                    yBase +
                    thickness +
                    Math.sin(nx * 4.2 + t * speed + r * 1.1 + 0.35) * amp1 +
                    Math.cos(nx * 7.5 - t * 0.35 + r * 2.0) * amp2;
                ctx.lineTo(x, y);
            }
            ctx.closePath();

            const ribGrad = ctx.createLinearGradient(0, yBase - amp1, W, yBase + amp1);
            ribGrad.addColorStop(0, colorA + '99');
            ribGrad.addColorStop(0.5, preset.defaultTextTone === 'dark' ? '#ffffffcc' : colorB + 'aa');
            ribGrad.addColorStop(1, colorB + '99');
            ctx.fillStyle = ribGrad;
            ctx.fill();
        }

        // Specular Chrome Highlight Sheen
        const sheenX = W * (0.5 + 0.35 * Math.sin(t * 0.4));
        const sheenGrad = ctx.createLinearGradient(sheenX - W * 0.45, 0, sheenX + W * 0.45, H);
        const sheenAlpha = preset.defaultTextTone === 'dark' ? 0.34 : 0.14;
        sheenGrad.addColorStop(0, 'rgba(255,255,255,0)');
        sheenGrad.addColorStop(0.5, `rgba(255,255,255,${sheenAlpha})`);
        sheenGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheenGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // Delicate Sparkle & Holo Vector Accents (✦, ◇, ♡, fine wave lines)
    if (config.showSparkles) {
        const tone = resolveCardTextTone(config);
        const sparkleColor =
            tone === 'dark' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(255, 255, 255, 0.78)';
        const scale = W / 360;

        ctx.fillStyle = sparkleColor;
        ctx.strokeStyle = sparkleColor;
        ctx.lineWidth = 1.2 * scale;

        // Subtle fine contour wave lines in corners (like reference image)
        ctx.save();
        ctx.globalAlpha = 0.28;
        for (let wLine = 0; wLine < 4; wLine++) {
            ctx.beginPath();
            const offset = wLine * 4.5 * scale;
            ctx.moveTo(0, H * 0.82 + offset);
            ctx.bezierCurveTo(
                W * 0.14,
                H * 0.75 + offset,
                W * 0.22,
                H * 0.92 + offset,
                W * 0.36,
                H + offset
            );
            ctx.stroke();
        }
        ctx.restore();

        // Deterministic sparkle field that gently twinkles over time
        const sparkles = [
            { x: 0.12, y: 0.16, r: 6.5, type: 'star', speed: 1.8, phase: 0.2 },
            { x: 0.28, y: 0.11, r: 4.2, type: 'star', speed: 2.3, phase: 1.4 },
            { x: 0.86, y: 0.15, r: 7.0, type: 'star', speed: 1.5, phase: 2.1 },
            { x: 0.92, y: 0.38, r: 4.5, type: 'heart', speed: 1.9, phase: 0.8 },
            { x: 0.76, y: 0.22, r: 3.8, type: 'diamond', speed: 2.1, phase: 3.0 },
            { x: 0.42, y: 0.14, r: 3.6, type: 'diamond', speed: 1.7, phase: 4.2 },
            { x: 0.64, y: 0.66, r: 5.5, type: 'star', speed: 2.0, phase: 1.1 },
            { x: 0.91, y: 0.72, r: 6.0, type: 'star', speed: 1.6, phase: 2.7 },
            { x: 0.08, y: 0.68, r: 4.8, type: 'star', speed: 2.2, phase: 3.5 },
            { x: 0.82, y: 0.52, r: 3.5, type: 'dot', speed: 2.5, phase: 0.5 },
            { x: 0.34, y: 0.62, r: 2.8, type: 'dot', speed: 1.9, phase: 2.0 },
            { x: 0.55, y: 0.12, r: 4.2, type: 'heart', speed: 1.4, phase: 1.7 }
        ];

        for (const sp of sparkles) {
            const pulse = 0.55 + 0.45 * Math.sin(timeSec * sp.speed + sp.phase);
            ctx.save();
            ctx.globalAlpha = pulse * 0.9;
            const sx = sp.x * W;
            const sy = sp.y * H;
            const sr = sp.r * scale * (0.8 + 0.25 * pulse);

            if (sp.type === 'star') {
                drawFourPointStar(ctx, sx, sy, sr);
            } else if (sp.type === 'diamond') {
                drawDiamondOutline(ctx, sx, sy, sr);
            } else if (sp.type === 'heart') {
                drawMiniHeart(ctx, sx, sy, sr * 1.4, false);
            } else {
                ctx.beginPath();
                ctx.arc(sx, sy, sr * 0.45, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    ctx.restore();
}

function loadImageHelper(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function drawRoundedRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

/**
 * Renders the modern-nostalgic Namecard onto a crisp 720x420 HTML5 Canvas
 * for 1-click Copy Image to Clipboard and Download PNG.
 * Uses a single uniform font family, frameless transparent character cutout, and boxless stats.
 */
export async function renderNamecardToCanvas(
    config: NamecardConfig,
    profile: UserProfile | null,
    stats: PlayerEconomyStats | null
): Promise<HTMLCanvasElement> {
    const W = 720;
    const H = 420;
    const R = 28;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Clip to smooth rounded card corners
    ctx.save();
    drawRoundedRectPath(ctx, 0, 0, W, H, R);
    ctx.clip();

    // 1. Background (Liquid Holo/Chrome, Gradient, or Solid + Sparkles)
    drawNamecardBackgroundFrame(ctx, W, H, config, 2.4);

    // 1b. If user chose 'behind' layer order, draw their artwork behind avatar & text
    const paintImg = config.paintDataUrl ? await loadImageHelper(config.paintDataUrl) : null;
    if (paintImg && config.paintLayer === 'behind') {
        ctx.drawImage(paintImg, 0, 0, W, H);
    }

    const tone = resolveCardTextTone(config);
    const primaryText = tone === 'dark' ? '#161326' : '#ffffff';
    const secondaryText =
        tone === 'dark' ? 'rgba(22, 19, 38, 0.62)' : 'rgba(255, 255, 255, 0.72)';
    const dividerColor =
        tone === 'dark' ? 'rgba(22, 19, 38, 0.12)' : 'rgba(255, 255, 255, 0.18)';

    let accentColor = tone === 'dark' ? '#7c3aed' : '#72efdd';
    if (config.bgMode === 'liquid') {
        accentColor =
            LIQUID_PRESETS.find((p) => p.id === config.bgPresetId)?.accentColor || accentColor;
    } else if (config.bgMode === 'gradient') {
        accentColor =
            GRADIENT_PRESETS.find((p) => p.id === config.bgPresetId)?.accentColor || accentColor;
    }

    // 2. Frameless Transparent Character Cutout (Left Side — Zero Checkerboard, Zero Box)
    const cleanAvatarUrl = await ensureTransparentAvatarUrl(profile);
    const avatarImg = await loadImageHelper(cleanAvatarUrl);
    if (avatarImg) {
        ctx.save();
        // Soft natural character drop shadow
        ctx.shadowColor =
            tone === 'dark' ? 'rgba(22, 19, 38, 0.22)' : 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 6;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(avatarImg, 28, 36, 210, 210);
        ctx.restore();
    }

    // 3. Uniform Typography Identity Section (Right Side)
    const textX = 258;
    ctx.textAlign = 'left';

    // Display Name
    ctx.fillStyle = primaryText;
    ctx.font = `800 38px ${CARD_FONT_STACK}`;
    const dispName = (config.displayName || profile?.x_display_name || config.username).slice(0, 20);
    ctx.fillText(dispName, textX, 102);

    // @username handle
    ctx.fillStyle = accentColor;
    ctx.font = `600 19px ${CARD_FONT_STACK}`;
    ctx.fillText(`@${config.username}`, textX, 134);

    // Optional Tagline / Status (clean floating text, no box)
    if (config.tagline && config.tagline.trim()) {
        ctx.fillStyle = secondaryText;
        ctx.font = `500 18px ${CARD_FONT_STACK}`;
        ctx.fillText(config.tagline.trim().slice(0, 38), textX, 174);
    }

    // 4. Boxless Floating Stats Row at Bottom of Card
    const statsTopY = 286;
    ctx.strokeStyle = dividerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(36, statsTopY);
    ctx.lineTo(W - 36, statsTopY);
    ctx.stroke();

    const chips = stats?.chips ?? 2500;
    const wins = stats?.wins ?? 0;
    const losses = stats?.losses ?? 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const bestWin = stats?.high_score ?? 0;

    const statCols = [
        { label: '$UWU', value: chips.toLocaleString() },
        { label: 'RECORD', value: `${wins}W – ${losses}L` },
        { label: 'WIN RATE', value: `${winRate}%` },
        { label: 'BEST WIN', value: bestWin.toLocaleString() }
    ];

    const colWidth = (W - 72) / statCols.length;
    statCols.forEach((sc, idx) => {
        const colX = 36 + idx * colWidth;

        // Subtle vertical separator between columns
        if (idx > 0) {
            ctx.strokeStyle = dividerColor;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(colX - 16, statsTopY + 26);
            ctx.lineTo(colX - 16, statsTopY + 86);
            ctx.stroke();
        }

        // Micro uppercase label
        ctx.fillStyle = secondaryText;
        ctx.font = `600 13px ${CARD_FONT_STACK}`;
        ctx.fillText(sc.label, colX, statsTopY + 42);

        // Bold crisp value
        ctx.fillStyle = primaryText;
        ctx.font = `800 28px ${CARD_FONT_STACK}`;
        ctx.fillText(sc.value, colX, statsTopY + 78);
    });

    // 5. User's Freehand Drawing Layer (when set to 'above' card text/avatar)
    if (paintImg && config.paintLayer !== 'behind') {
        ctx.drawImage(paintImg, 0, 0, W, H);
    }

    // 6. User's Placed Stickers
    for (const stk of config.stickers) {
        const sx = (stk.x / 100) * W;
        const sy = (stk.y / 100) * H;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((stk.rotation * Math.PI) / 180);
        ctx.scale(stk.scale, stk.scale);
        ctx.font = `36px ${CARD_FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = primaryText;
        ctx.fillText(stk.symbol, 0, 0);
        ctx.restore();
    }

    // 7. Clean Card Border Rim
    if (config.borderId !== 'none') {
        drawRoundedRectPath(ctx, 2, 2, W - 4, H - 4, R - 2);
        if (config.borderId === 'holo_glow') {
            const bGrad = ctx.createLinearGradient(0, 0, W, H);
            bGrad.addColorStop(0, '#ffafe6');
            bGrad.addColorStop(0.5, '#9bf6ff');
            bGrad.addColorStop(1, '#fff3b0');
            ctx.strokeStyle = bGrad;
            ctx.lineWidth = 5;
            ctx.stroke();
        } else if (config.borderId === 'chrome_edge') {
            const cGrad = ctx.createLinearGradient(0, 0, W, H);
            cGrad.addColorStop(0, '#ffffff');
            cGrad.addColorStop(0.5, '#94a3b8');
            cGrad.addColorStop(1, '#e2e8f0');
            ctx.strokeStyle = cGrad;
            ctx.lineWidth = 4;
            ctx.stroke();
        } else if (config.borderId === 'neon_line') {
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = 4;
            ctx.stroke();
        } else if (config.borderId === 'pearl_soft') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
            ctx.lineWidth = 5;
            ctx.stroke();
        } else {
            // glass_rim
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.62)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }

    ctx.restore();
    return canvas;
}

/**
 * Copies the high-res Namecard PNG directly to the user's clipboard.
 */
export async function copyNamecardImageToClipboard(
    config: NamecardConfig,
    profile: UserProfile | null,
    stats: PlayerEconomyStats | null
): Promise<{ ok: boolean; message: string }> {
    try {
        const canvas = await renderNamecardToCanvas(config, profile, stats);
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (!blob) {
            return { ok: false, message: 'Failed to generate image.' };
        }

        if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            return { ok: true, message: '✨ Copied card image to clipboard!' };
        }

        await downloadNamecardPng(config, profile, stats);
        return { ok: true, message: '💾 Saved card image as PNG!' };
    } catch {
        await downloadNamecardPng(config, profile, stats);
        return { ok: true, message: '💾 Downloaded card PNG!' };
    }
}

/**
 * Triggers a browser download of the rendered Namecard PNG.
 */
export async function downloadNamecardPng(
    config: NamecardConfig,
    profile: UserProfile | null,
    stats: PlayerEconomyStats | null
): Promise<void> {
    const canvas = await renderNamecardToCanvas(config, profile, stats);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const cleanHandle = (config.username || 'player').replace(/[^a-zA-Z0-9_-]/g, '');
    link.download = `namecard-${cleanHandle}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
