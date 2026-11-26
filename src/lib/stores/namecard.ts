// src/lib/stores/namecard.ts
import { writable } from 'svelte/store';
import { supabase } from '$lib/supabaseClient';
import type { UserProfile } from '$lib/stores/auth';
import type { PlayerEconomyStats } from '$lib/game/economy/worldEconomy';
import {
    renderTransparentAvatar,
    getDefaultAvatarTraits,
    decodeAvatarTraitsUrl
} from '$lib/utils/avatar';

export type NamecardSkinId =
    | 'win98_exec'
    | 'cyber_terminal'
    | 'liquid_titanium'
    | 'casino_royale'
    | 'vapor_grid'
    | 'pocket_lcd'
    | 'sakura_shrine'
    | 'prismatic_chase';

export type NamecardFinishId = 'matte' | 'holo_sweep' | 'scanlines' | 'dot_matrix' | 'halftone';
export type NamecardFrameId = 'win98_bevel' | 'tech_brackets' | 'gold_hairline' | 'holo_rim' | 'minimal';
export type NamecardEmblemId =
    | 'crown'
    | 'diamond'
    | 'dice'
    | 'joystick'
    | 'palette'
    | 'lantern'
    | 'star_crest'
    | 'trophy';

export interface NamecardConfig {
    version: 3;
    userId: string;
    username: string;
    displayName: string;
    tagline: string;
    skinId: NamecardSkinId;
    finishId: NamecardFinishId;
    frameId: NamecardFrameId;
    roleBadge: string;
    emblems: NamecardEmblemId[];
    paintDataUrl: string | null;
    updatedAt: number;
}

export interface NamecardSkinMeta {
    id: NamecardSkinId;
    name: string;
    tag: string;
    tone: 'dark' | 'light';
    primaryText: string;
    secondaryText: string;
    accentColor: string;
    headerBg: string;
    headerText: string;
    dividerColor: string;
    bayBg: string;
    bayBorder: string;
    swatchCss: string;
}

export interface NamecardFinishMeta {
    id: NamecardFinishId;
    name: string;
    desc: string;
}

export interface NamecardFrameMeta {
    id: NamecardFrameId;
    name: string;
    desc: string;
}

export interface NamecardEmblemMeta {
    id: NamecardEmblemId;
    name: string;
    viewBoxPath: string;
}

export const CARD_UI_FONT_STACK = "'Tahoma', 'MS Sans Serif', 'Segoe UI', Arial, sans-serif";
export const CARD_MONO_FONT_STACK = "'JetBrains Mono', 'SFMono-Regular', Consolas, 'Courier New', monospace";

export const NAMECARD_SKINS: NamecardSkinMeta[] = [
    {
        id: 'win98_exec',
        name: 'Win98 Executive',
        tag: 'OS CLASSIC',
        tone: 'dark',
        primaryText: '#0b0e14',
        secondaryText: '#3e4452',
        accentColor: '#000080',
        headerBg: '#000080',
        headerText: '#ffffff',
        dividerColor: 'rgba(0, 0, 0, 0.22)',
        bayBg: '#ebe8df',
        bayBorder: '#808080',
        swatchCss: 'linear-gradient(180deg, #000080 0%, #1084d0 28%, #d6d2c8 29%, #c0c0c0 100%)'
    },
    {
        id: 'cyber_terminal',
        name: 'Midnight Terminal',
        tag: 'NEON SYS',
        tone: 'light',
        primaryText: '#f0fdf4',
        secondaryText: '#86efac',
        accentColor: '#00f0ff',
        headerBg: '#071422',
        headerText: '#00f0ff',
        dividerColor: 'rgba(0, 240, 255, 0.24)',
        bayBg: 'rgba(0, 240, 255, 0.06)',
        bayBorder: 'rgba(0, 240, 255, 0.35)',
        swatchCss: 'linear-gradient(135deg, #070b14 0%, #0b192c 55%, #004e64 100%)'
    },
    {
        id: 'liquid_titanium',
        name: 'Y2K Chrome Foil',
        tag: 'METALLIC',
        tone: 'dark',
        primaryText: '#0f172a',
        secondaryText: '#475569',
        accentColor: '#1d4ed8',
        headerBg: '#1e293b',
        headerText: '#f8fafc',
        dividerColor: 'rgba(15, 23, 42, 0.16)',
        bayBg: 'rgba(255, 255, 255, 0.5)',
        bayBorder: 'rgba(100, 116, 139, 0.5)',
        swatchCss: 'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 42%, #94a3b8 68%, #f1f5f9 100%)'
    },
    {
        id: 'casino_royale',
        name: 'High Roller Gold',
        tag: 'VIP VAULT',
        tone: 'light',
        primaryText: '#fffbeb',
        secondaryText: '#e9d5ff',
        accentColor: '#ffd700',
        headerBg: '#26081c',
        headerText: '#ffd700',
        dividerColor: 'rgba(255, 215, 0, 0.28)',
        bayBg: 'rgba(255, 215, 0, 0.06)',
        bayBorder: 'rgba(255, 215, 0, 0.36)',
        swatchCss: 'linear-gradient(135deg, #16081a 0%, #3b0a26 60%, #78350f 100%)'
    },
    {
        id: 'vapor_grid',
        name: 'Sunset Wireframe',
        tag: 'SYNTH 98',
        tone: 'light',
        primaryText: '#ffffff',
        secondaryText: '#f5d0fe',
        accentColor: '#ff4ecd',
        headerBg: '#1b0b38',
        headerText: '#00f5d4',
        dividerColor: 'rgba(255, 78, 205, 0.32)',
        bayBg: 'rgba(17, 7, 38, 0.55)',
        bayBorder: 'rgba(255, 78, 205, 0.45)',
        swatchCss: 'linear-gradient(180deg, #120829 0%, #4c1d95 55%, #be185d 100%)'
    },
    {
        id: 'pocket_lcd',
        name: 'Pocket 98 LCD',
        tag: 'DOT MATRIX',
        tone: 'dark',
        primaryText: '#0f210b',
        secondaryText: '#324a24',
        accentColor: '#1a3812',
        headerBg: '#1b2e16',
        headerText: '#c4d69c',
        dividerColor: 'rgba(15, 33, 11, 0.24)',
        bayBg: 'rgba(15, 33, 11, 0.08)',
        bayBorder: 'rgba(15, 33, 11, 0.36)',
        swatchCss: 'linear-gradient(135deg, #cbd8a3 0%, #9cb370 100%)'
    },
    {
        id: 'sakura_shrine',
        name: 'Twilight Sakura',
        tag: 'SANCTUARY',
        tone: 'light',
        primaryText: '#fff1f5',
        secondaryText: '#fbcfe8',
        accentColor: '#ff9ebb',
        headerBg: '#231538',
        headerText: '#ffd580',
        dividerColor: 'rgba(255, 158, 187, 0.28)',
        bayBg: 'rgba(255, 158, 187, 0.08)',
        bayBorder: 'rgba(255, 158, 187, 0.36)',
        swatchCss: 'linear-gradient(135deg, #161026 0%, #371b47 60%, #831843 100%)'
    },
    {
        id: 'prismatic_chase',
        name: 'Prismatic Holo',
        tag: 'RARE FOIL',
        tone: 'light',
        primaryText: '#ffffff',
        secondaryText: '#cbd5e1',
        accentColor: '#72efdd',
        headerBg: '#090a10',
        headerText: '#ffffff',
        dividerColor: 'rgba(255, 255, 255, 0.2)',
        bayBg: 'rgba(255, 255, 255, 0.06)',
        bayBorder: 'rgba(114, 239, 221, 0.35)',
        swatchCss: 'linear-gradient(125deg, #0b0d14 0%, #1e1b4b 38%, #0d9488 68%, #db2777 100%)'
    }
];

export const NAMECARD_FINISHES: NamecardFinishMeta[] = [
    { id: 'matte', name: 'Crisp Matte', desc: 'Clean flat ink surface' },
    { id: 'holo_sweep', name: 'Holo Foil Sweep', desc: 'Diagonal iridescent specular sweep' },
    { id: 'scanlines', name: 'CRT Scanlines', desc: 'Subtle horizontal monitor lines' },
    { id: 'dot_matrix', name: 'Pixel Matrix', desc: 'Fine hardware micro-grid texture' },
    { id: 'halftone', name: 'Arcade Halftone', desc: 'Subtle comic print micro-dots' }
];

export const NAMECARD_FRAMES: NamecardFrameMeta[] = [
    { id: 'win98_bevel', name: 'Win98 Bevel', desc: 'Classic OS 3D chiseled border' },
    { id: 'tech_brackets', name: 'Tech Brackets', desc: 'Precision corner reticle brackets' },
    { id: 'gold_hairline', name: 'Gold Hairline', desc: 'Double gilded collector trim' },
    { id: 'holo_rim', name: 'Prismatic Rim', desc: 'Iridescent foil collector edge' },
    { id: 'minimal', name: 'Clean Edge', desc: 'Crisp single hairline border' }
];

export const NAMECARD_ROLE_BADGES: string[] = [
    'OG UNICORN',
    'HIGH ROLLER',
    'MEME ARCHIVIST',
    'MUSEUM ARTIST',
    'ARCADE ACE',
    'WOODS KEEPER',
    'VIP MEMBER',
    'NIGHT OWL'
];

export const TAGLINE_SUGGESTIONS: string[] = [
    'Collecting memes since 98',
    'High stakes at the Craps table',
    'Curating voxel sculptures',
    'Late night arcade grinder',
    'Lantern keeper in the Woods',
    'Verified px-unicorn citizen'
];

export const NAMECARD_EMBLEMS: NamecardEmblemMeta[] = [
    {
        id: 'crown',
        name: 'Crown',
        viewBoxPath: 'M3 18h18v2H3v-2zm0-2L5 7l4.5 4L12 5l2.5 6L19 7l2 9H3z'
    },
    {
        id: 'diamond',
        name: 'Diamond',
        viewBoxPath: 'M6 4h12l4 5-10 12L2 9l4-5zm1.2 2L4.8 9h14.4l-2.4-3H7.2z'
    },
    {
        id: 'dice',
        name: 'High Roller',
        viewBoxPath: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm3 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'
    },
    {
        id: 'joystick',
        name: 'Arcade',
        viewBoxPath: 'M12 2a3 3 0 0 1 1 5.83V13h5a2 2 0 0 1 2 2v4H4v-4a2 2 0 0 1 2-2h5V7.83A3 3 0 0 1 12 2zm-5 14v2h4v-2H7zm7 0v2h3v-2h-3z'
    },
    {
        id: 'palette',
        name: 'Artist',
        viewBoxPath: 'M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1.1.9-2 2-2h2.3A4.7 4.7 0 0 0 21 10.8C21 6.5 17 3 12 3zM7.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 1a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'
    },
    {
        id: 'lantern',
        name: 'Lantern',
        viewBoxPath: 'M9 3h6v2h2v3h1v8h-1v3H7v-3H6V8h1V5h2V3zm1 4v9h4V7h-4zm1 13h2v2h-2v-2z'
    },
    {
        id: 'star_crest',
        name: 'Star Crest',
        viewBoxPath: 'M12 2l2.6 6.4L21 9.2l-5 4.5 1.4 6.6L12 17l-5.4 3.3L8 13.7 3 9.2l6.4-.8L12 2z'
    },
    {
        id: 'trophy',
        name: 'Champion',
        viewBoxPath: 'M6 3h12v3h3v3c0 2.5-1.8 4.4-4 4.8A5.5 5.5 0 0 1 13 17v2h3v2H8v-2h3v-2a5.5 5.5 0 0 1-4-3.2C4.8 13.4 3 11.5 3 9V6h3V3zm-1 5v1c0 1.3.9 2.4 2 2.8V8H5zm12 3.8c1.1-.4 2-1.5 2-2.8V8h-2v3.8z'
    }
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

export function formatMemberSerial(userId: string, username: string): string {
    const h = hashString(`${userId || 'guest'}:${username || 'player'}`);
    return `#${(h & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

export function getSkinMeta(skinId: NamecardSkinId | string): NamecardSkinMeta {
    return NAMECARD_SKINS.find((s) => s.id === skinId) || NAMECARD_SKINS[0];
}

export function resolveCardTextTone(config: NamecardConfig): 'dark' | 'light' {
    return getSkinMeta(config.skinId).tone;
}

export function generateDefaultNamecardConfig(
    userId: string,
    username: string,
    displayName?: string
): NamecardConfig {
    const cleanHandle = (username || 'player').replace(/^@/, '');
    const seed = hashString(`${userId}:${cleanHandle}`);

    return {
        version: 3,
        userId: userId || 'guest',
        username: cleanHandle,
        displayName: (displayName || cleanHandle).slice(0, 26),
        tagline: TAGLINE_SUGGESTIONS[seed % TAGLINE_SUGGESTIONS.length],
        skinId: 'win98_exec',
        finishId: 'matte',
        frameId: 'win98_bevel',
        roleBadge: 'OG UNICORN',
        emblems: ['star_crest', 'crown'],
        paintDataUrl: null,
        updatedAt: Date.now()
    };
}

function mapLegacySkin(raw: any): NamecardSkinId {
    if (NAMECARD_SKINS.some((s) => s.id === raw?.skinId)) {
        return raw.skinId as NamecardSkinId;
    }
    const preset = String(raw?.bgPresetId || '');
    if (preset === 'obsidian_opal' || preset === 'midnight_slate') return 'cyber_terminal';
    if (preset === 'liquid_chrome' || preset === 'sky_glass') return 'liquid_titanium';
    if (preset === 'sunset_prism') return 'vapor_grid';
    if (preset === 'aurora_mint' || preset === 'matcha_milk') return 'pocket_lcd';
    if (preset === 'rose_silk' || preset === 'peach_aura') return 'sakura_shrine';
    if (preset === 'holo_pearl' || preset === 'cotton_candy') return 'prismatic_chase';
    return 'win98_exec';
}

function normalizeConfig(raw: any, userId: string, username: string, displayName?: string): NamecardConfig {
    const fallback = generateDefaultNamecardConfig(userId, username, displayName);
    if (!raw || typeof raw !== 'object') return fallback;

    const skinId = mapLegacySkin(raw);
    const finishId: NamecardFinishId = NAMECARD_FINISHES.some((f) => f.id === raw.finishId)
        ? raw.finishId
        : raw.version === 2
          ? 'holo_sweep'
          : 'matte';
    const frameId: NamecardFrameId = NAMECARD_FRAMES.some((f) => f.id === raw.frameId)
        ? raw.frameId
        : skinId === 'win98_exec'
          ? 'win98_bevel'
          : 'tech_brackets';
    const roleBadge =
        typeof raw.roleBadge === 'string' && NAMECARD_ROLE_BADGES.includes(raw.roleBadge)
            ? raw.roleBadge
            : fallback.roleBadge;

    const emblems: NamecardEmblemId[] = Array.isArray(raw.emblems)
        ? (raw.emblems
              .filter((id: any) => NAMECARD_EMBLEMS.some((e) => e.id === id))
              .slice(0, 3) as NamecardEmblemId[])
        : fallback.emblems;

    return {
        version: 3,
        userId,
        username: username.replace(/^@/, ''),
        displayName: String(raw.displayName || displayName || username).slice(0, 26),
        tagline:
            typeof raw.tagline === 'string'
                ? raw.tagline.slice(0, 44)
                : fallback.tagline,
        skinId,
        finishId,
        frameId,
        roleBadge,
        emblems,
        paintDataUrl: typeof raw.paintDataUrl === 'string' ? raw.paintDataUrl : null,
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
    };
}

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

let namecardRemoteSyncTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRemoteNamecard: NamecardConfig | null = null;

async function flushNamecardRemoteSync(config: NamecardConfig): Promise<void> {
    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: `namecard_${config.userId}`,
                pixels: config,
                updated_by: config.username,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}
}

export async function saveNamecardConfig(
    config: NamecardConfig,
    immediateRemote = false
): Promise<void> {
    if (typeof window === 'undefined' || !config.userId || config.userId === 'guest') return;

    const updated: NamecardConfig = {
        ...config,
        version: 3,
        updatedAt: Date.now()
    };

    const localKey = `${LOCAL_NAMECARD_STORAGE_PREFIX}${config.userId}`;
    try {
        localStorage.setItem(localKey, JSON.stringify(updated));
    } catch {}

    pendingRemoteNamecard = updated;
    if (namecardRemoteSyncTimer) {
        clearTimeout(namecardRemoteSyncTimer);
        namecardRemoteSyncTimer = null;
    }

    if (immediateRemote) {
        pendingRemoteNamecard = null;
        await flushNamecardRemoteSync(updated);
    } else {
        namecardRemoteSyncTimer = setTimeout(() => {
            namecardRemoteSyncTimer = null;
            if (pendingRemoteNamecard) {
                const toSync = pendingRemoteNamecard;
                pendingRemoteNamecard = null;
                void flushNamecardRemoteSync(toSync);
            }
        }, 4500);
    }
}

let cachedDefaultTransparentAvatar: string | null = null;
export async function ensureTransparentAvatarUrl(
    profileOrUrl: UserProfile | string | null
): Promise<string> {
    if (typeof profileOrUrl === 'string') {
        const decoded = decodeAvatarTraitsUrl(profileOrUrl);
        if (decoded) {
            const { dataUrl } = await renderTransparentAvatar(decoded, 256);
            if (dataUrl) return dataUrl;
        }
        if (
            profileOrUrl &&
            profileOrUrl !== '/unicorn.png' &&
            !profileOrUrl.includes('twimg.com')
        ) {
            return profileOrUrl;
        }
        if (cachedDefaultTransparentAvatar) {
            return cachedDefaultTransparentAvatar;
        }
        const { dataUrl } = await renderTransparentAvatar(getDefaultAvatarTraits(), 256);
        cachedDefaultTransparentAvatar = dataUrl;
        return dataUrl;
    }
    const profile = profileOrUrl;
    if (profile?.avatar_traits && Object.keys(profile.avatar_traits).length > 0) {
        const { dataUrl } = await renderTransparentAvatar(profile.avatar_traits, 256);
        if (dataUrl) return dataUrl;
    }
    if (profile?.avatar_url) {
        const decoded = decodeAvatarTraitsUrl(profile.avatar_url);
        if (decoded) {
            const { dataUrl } = await renderTransparentAvatar(decoded, 256);
            if (dataUrl) return dataUrl;
        }
        if (
            profile.avatar_url !== '/unicorn.png' &&
            !profile.avatar_url.includes('twimg.com')
        ) {
            return profile.avatar_url;
        }
    }
    if (cachedDefaultTransparentAvatar) {
        return cachedDefaultTransparentAvatar;
    }
    const { dataUrl } = await renderTransparentAvatar(getDefaultAvatarTraits(), 256);
    cachedDefaultTransparentAvatar = dataUrl;
    return dataUrl;
}

/**
 * Draws a crisp vector/SVG emblem badge onto Canvas using Path2D (zero raw OS emojis).
 */
export function drawVectorEmblem(
    ctx: CanvasRenderingContext2D,
    emblemId: NamecardEmblemId,
    cx: number,
    cy: number,
    sizePx: number,
    fillColor: string,
    badgeBg: string,
    badgeBorder: string
) {
    const meta = NAMECARD_EMBLEMS.find((e) => e.id === emblemId);
    if (!meta) return;

    ctx.save();
    // Crisp square collector pin badge
    const half = sizePx / 2;
    drawRoundedRectPath(ctx, cx - half, cy - half, sizePx, sizePx, 5);
    ctx.fillStyle = badgeBg;
    ctx.fill();
    ctx.strokeStyle = badgeBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const iconSize = sizePx * 0.62;
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(iconSize / 24, iconSize / 24);
    ctx.fillStyle = fillColor;
    if (typeof Path2D !== 'undefined') {
        ctx.fill(new Path2D(meta.viewBoxPath));
    }
    ctx.restore();
}

/**
 * Renders the crisp art-directed Collector Pass background + surface finish onto a 2D canvas.
 */
export function drawNamecardBackgroundFrame(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    config: NamecardConfig,
    timeSec = 0,
    pointerNormX = 0.5
) {
    ctx.save();
    const skin = getSkinMeta(config.skinId);

    // 1. Art-directed Base Background per Skin
    if (skin.id === 'win98_exec') {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#dbd8cf');
        bgGrad.addColorStop(1, '#c4c0b6');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Classic subtle engineering blueprint grid
        ctx.strokeStyle = 'rgba(0, 0, 128, 0.05)';
        ctx.lineWidth = 1;
        const step = Math.round(W / 24);
        ctx.beginPath();
        for (let x = step; x < W; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
        }
        for (let y = step; y < H; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
    } else if (skin.id === 'cyber_terminal') {
        const bgGrad = ctx.createLinearGradient(0, 0, W, H);
        bgGrad.addColorStop(0, '#060a12');
        bgGrad.addColorStop(0.55, '#0b1628');
        bgGrad.addColorStop(1, '#072233');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.lineWidth = 1;
        const step = Math.round(W / 22);
        ctx.beginPath();
        for (let x = step; x < W; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
        }
        for (let y = step; y < H; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
    } else if (skin.id === 'liquid_titanium') {
        const mGrad = ctx.createLinearGradient(0, 0, W, H);
        mGrad.addColorStop(0, '#f1f5f9');
        mGrad.addColorStop(0.32, '#cbd5e1');
        mGrad.addColorStop(0.55, '#f8fafc');
        mGrad.addColorStop(0.82, '#94a3b8');
        mGrad.addColorStop(1, '#e2e8f0');
        ctx.fillStyle = mGrad;
        ctx.fillRect(0, 0, W, H);

        // Fine brushed aluminum horizontal grain
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        for (let y = 0; y < H; y += 4) {
            ctx.fillRect(0, y, W, 1);
        }
    } else if (skin.id === 'casino_royale') {
        const cGrad = ctx.createLinearGradient(0, 0, W, H);
        cGrad.addColorStop(0, '#130716');
        cGrad.addColorStop(0.5, '#290b22');
        cGrad.addColorStop(1, '#1a0a12');
        ctx.fillStyle = cGrad;
        ctx.fillRect(0, 0, W, H);

        // Subtle diamond argyle casino felt lattice
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.07)';
        ctx.lineWidth = 1;
        const d = Math.round(W / 14);
        ctx.beginPath();
        for (let x = -H; x < W + H; x += d) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x + H * 0.65, H);
            ctx.moveTo(x + H * 0.65, 0);
            ctx.lineTo(x, H);
        }
        ctx.stroke();
    } else if (skin.id === 'vapor_grid') {
        const vGrad = ctx.createLinearGradient(0, 0, 0, H);
        vGrad.addColorStop(0, '#0e0724');
        vGrad.addColorStop(0.58, '#2d0f57');
        vGrad.addColorStop(1, '#68124e');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, W, H);

        // Crisp synth horizon + perspective floor wireframe
        const horizonY = H * 0.64;
        ctx.strokeStyle = 'rgba(0, 245, 212, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(W, horizonY);
        for (let row = 1; row <= 5; row++) {
            const ry = horizonY + Math.pow(row / 5, 1.45) * (H - horizonY);
            ctx.moveTo(0, ry);
            ctx.lineTo(W, ry);
        }
        for (let col = -8; col <= 8; col++) {
            ctx.moveTo(W / 2 + col * (W * 0.05), horizonY);
            ctx.lineTo(W / 2 + col * (W * 0.17), H);
        }
        ctx.stroke();
    } else if (skin.id === 'pocket_lcd') {
        const pGrad = ctx.createLinearGradient(0, 0, 0, H);
        pGrad.addColorStop(0, '#c7d49c');
        pGrad.addColorStop(1, '#a9bb7c');
        ctx.fillStyle = pGrad;
        ctx.fillRect(0, 0, W, H);

        // Authentic handheld pixel grid
        ctx.strokeStyle = 'rgba(15, 33, 11, 0.08)';
        ctx.lineWidth = 1;
        const gStep = Math.max(4, Math.round(W / 60));
        ctx.beginPath();
        for (let x = gStep; x < W; x += gStep) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
        }
        for (let y = gStep; y < H; y += gStep) {
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
        }
        ctx.stroke();
    } else if (skin.id === 'sakura_shrine') {
        const sGrad = ctx.createLinearGradient(0, 0, W, H);
        sGrad.addColorStop(0, '#140f24');
        sGrad.addColorStop(0.55, '#2b1840');
        sGrad.addColorStop(1, '#4c1839');
        ctx.fillStyle = sGrad;
        ctx.fillRect(0, 0, W, H);

        // Crisp 4px pixel-art falling blossom petals on right edge
        const pxUnit = Math.max(3, Math.round(W / 140));
        const petalCoords = [
            [0.78, 0.22], [0.85, 0.16], [0.91, 0.28], [0.73, 0.34],
            [0.88, 0.48], [0.94, 0.62], [0.81, 0.56], [0.68, 0.24]
        ];
        ctx.fillStyle = 'rgba(255, 179, 209, 0.45)';
        for (const [px, py] of petalCoords) {
            ctx.fillRect(Math.round(W * px), Math.round(H * py), pxUnit * 2, pxUnit);
            ctx.fillRect(Math.round(W * px + pxUnit), Math.round(H * py + pxUnit), pxUnit * 2, pxUnit);
        }
    } else {
        // prismatic_chase: matte carbon base + controlled diagonal iridescent prism ribbon
        ctx.fillStyle = '#0e1018';
        ctx.fillRect(0, 0, W, H);

        const prismGrad = ctx.createLinearGradient(0, 0, W, H);
        prismGrad.addColorStop(0, 'rgba(114, 239, 221, 0.14)');
        prismGrad.addColorStop(0.35, 'rgba(99, 102, 241, 0.18)');
        prismGrad.addColorStop(0.68, 'rgba(236, 72, 153, 0.18)');
        prismGrad.addColorStop(1, 'rgba(250, 204, 21, 0.12)');
        ctx.fillStyle = prismGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // 2. Micro-Header Strip across the top
    const barH = Math.round(H * 0.115);
    if (skin.id === 'win98_exec') {
        const titleGrad = ctx.createLinearGradient(0, 0, W, 0);
        titleGrad.addColorStop(0, '#000080');
        titleGrad.addColorStop(1, '#1084d0');
        ctx.fillStyle = titleGrad;
    } else {
        ctx.fillStyle = skin.headerBg;
    }
    ctx.fillRect(0, 0, W, barH);
    ctx.fillStyle = skin.dividerColor;
    ctx.fillRect(0, barH, W, Math.max(1, Math.round(H * 0.004)));

    // 3. Curated Surface Finish Overlay
    if (config.finishId === 'holo_sweep') {
        const sweepPos =
            pointerNormX !== 0.5
                ? pointerNormX
                : 0.5 + 0.36 * Math.sin(timeSec * 0.9);
        const cx = W * sweepPos;
        const holo = ctx.createLinearGradient(cx - W * 0.32, 0, cx + W * 0.32, H);
        holo.addColorStop(0, 'rgba(255,255,255,0)');
        holo.addColorStop(0.32, 'rgba(120, 240, 255, 0.12)');
        holo.addColorStop(0.5, 'rgba(255, 255, 255, 0.26)');
        holo.addColorStop(0.68, 'rgba(255, 130, 220, 0.12)');
        holo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = holo;
        ctx.fillRect(0, barH, W, H - barH);
    } else if (config.finishId === 'scanlines') {
        ctx.fillStyle = skin.tone === 'dark' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.16)';
        const stride = Math.max(3, Math.round(H / 95));
        for (let y = barH; y < H; y += stride) {
            ctx.fillRect(0, y, W, 1);
        }
    } else if (config.finishId === 'dot_matrix') {
        ctx.fillStyle = skin.tone === 'dark' ? 'rgba(0, 0, 0, 0.07)' : 'rgba(255, 255, 255, 0.06)';
        const step = Math.max(6, Math.round(W / 72));
        for (let y = barH + 4; y < H; y += step) {
            for (let x = 4; x < W; x += step) {
                ctx.fillRect(x, y, 1.5, 1.5);
            }
        }
    } else if (config.finishId === 'halftone') {
        ctx.fillStyle = skin.tone === 'dark' ? 'rgba(0, 0, 0, 0.055)' : 'rgba(255, 255, 255, 0.05)';
        const step = Math.max(10, Math.round(W / 44));
        for (let row = 0; row * step + barH < H; row++) {
            const y = barH + 6 + row * step;
            const offset = (row % 2) * (step * 0.5);
            for (let x = offset; x < W; x += step) {
                ctx.beginPath();
                ctx.arc(x, y, Math.max(1.2, W / 420), 0, Math.PI * 2);
                ctx.fill();
            }
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
 * Renders the UwU OS Collector Pass onto a crisp 720x420 PNG matching the live preview 1:1.
 */
export async function renderNamecardToCanvas(
    config: NamecardConfig,
    profile: UserProfile | null,
    stats: PlayerEconomyStats | null
): Promise<HTMLCanvasElement> {
    const W = 720;
    const H = 420;
    const R = 10;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    const skin = getSkinMeta(config.skinId);

    ctx.save();
    drawRoundedRectPath(ctx, 0, 0, W, H, R);
    ctx.clip();

    // 1. Skin Background & Finish
    drawNamecardBackgroundFrame(ctx, W, H, config, 1.2, 0.5);

    // 2. Top Header Bar Text: UWU.OS // MEMBER PASS + Role + Serial
    const barH = Math.round(H * 0.115); // 48px
    ctx.fillStyle = skin.headerText;
    ctx.font = `700 13px ${CARD_MONO_FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('UWU.OS // MEMBER PASS', 24, barH / 2 + 1);

    const serial = formatMemberSerial(config.userId, config.username);
    const rightHeader = `${config.roleBadge.toUpperCase()}  •  NO. ${serial}`;
    ctx.textAlign = 'right';
    ctx.font = `700 12px ${CARD_MONO_FONT_STACK}`;
    ctx.fillText(rightHeader, W - 24, barH / 2 + 1);

    // 3. Left Hero Pixel Unicorn Portrait Bay
    const bayX = 28;
    const bayY = 74;
    const baySize = 190;
    drawRoundedRectPath(ctx, bayX, bayY, baySize, baySize, 6);
    ctx.fillStyle = skin.bayBg;
    ctx.fill();
    ctx.strokeStyle = skin.bayBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    const cleanAvatarUrl = await ensureTransparentAvatarUrl(profile);
    const avatarImg = await loadImageHelper(cleanAvatarUrl);
    if (avatarImg) {
        ctx.save();
        ctx.shadowColor = skin.tone === 'dark' ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 5;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(avatarImg, bayX + 11, bayY + 11, baySize - 22, baySize - 22);
        ctx.restore();
    }

    // 4. Right Identity Typography & Vector Emblem Pins
    const textX = 244;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const dispName = (config.displayName || profile?.x_display_name || config.username).slice(0, 20);
    ctx.fillStyle = skin.primaryText;
    ctx.font = `800 34px ${CARD_UI_FONT_STACK}`;
    ctx.fillText(dispName, textX, 118);

    ctx.fillStyle = skin.accentColor;
    ctx.font = `700 17px ${CARD_MONO_FONT_STACK}`;
    ctx.fillText(`@${config.username}`, textX, 148);

    if (config.tagline && config.tagline.trim()) {
        ctx.fillStyle = skin.secondaryText;
        ctx.font = `500 16px ${CARD_UI_FONT_STACK}`;
        ctx.fillText(config.tagline.trim().slice(0, 42), textX, 184);
    }

    // Vector Emblem Pins row (max 3)
    const pinSize = 42;
    config.emblems.slice(0, 3).forEach((emblemId, idx) => {
        const ex = textX + pinSize / 2 + idx * (pinSize + 10);
        const ey = 232;
        drawVectorEmblem(
            ctx,
            emblemId,
            ex,
            ey,
            pinSize,
            skin.accentColor,
            skin.bayBg,
            skin.bayBorder
        );
    });

    // 5. Bottom Tabular Stats Strip + Mini Barcode Seal
    const statsTopY = 290;
    ctx.strokeStyle = skin.dividerColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(28, statsTopY);
    ctx.lineTo(W - 28, statsTopY);
    ctx.stroke();

    const chips = stats?.chips ?? 2500;
    const wins = stats?.wins ?? 0;
    const losses = stats?.losses ?? 0;
    const totalGames = wins + losses;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
    const bestWin = stats?.high_score ?? 0;

    const statCols = [
        { label: '$UWU CHIPS', value: chips.toLocaleString() },
        { label: 'RECORD', value: `${wins}W-${losses}L` },
        { label: 'WIN RATE', value: `${winRate}%` },
        { label: 'BEST WIN', value: bestWin.toLocaleString() }
    ];

    const statsTotalW = W - 130;
    const colWidth = statsTotalW / statCols.length;
    statCols.forEach((sc, idx) => {
        const colX = 28 + idx * colWidth;

        if (idx > 0) {
            ctx.strokeStyle = skin.dividerColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(colX - 12, statsTopY + 24);
            ctx.lineTo(colX - 12, statsTopY + 88);
            ctx.stroke();
        }

        ctx.fillStyle = skin.secondaryText;
        ctx.font = `700 12px ${CARD_MONO_FONT_STACK}`;
        ctx.fillText(sc.label, colX, statsTopY + 42);

        ctx.fillStyle = skin.primaryText;
        ctx.font = `800 25px ${CARD_MONO_FONT_STACK}`;
        ctx.fillText(sc.value, colX, statsTopY + 78);
    });

    // Crisp micro-barcode ornament on bottom right
    const barWidths = [3, 1, 2, 4, 1, 3, 2, 1, 3, 2];
    let bx = W - 80;
    ctx.fillStyle = skin.secondaryText;
    for (const bw of barWidths) {
        ctx.fillRect(bx, statsTopY + 34, bw, 46);
        bx += bw + 3;
    }

    // 6. Optional Autograph Overlay
    const paintImg = config.paintDataUrl ? await loadImageHelper(config.paintDataUrl) : null;
    if (paintImg) {
        ctx.drawImage(paintImg, 0, 0, W, H);
    }

    // 7. Crisp Frame Treatment
    if (config.frameId === 'win98_bevel') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(2, H - 2);
        ctx.lineTo(2, 2);
        ctx.lineTo(W - 2, 2);
        ctx.stroke();

        ctx.strokeStyle = '#404040';
        ctx.beginPath();
        ctx.moveTo(W - 2, 2);
        ctx.lineTo(W - 2, H - 2);
        ctx.lineTo(2, H - 2);
        ctx.stroke();
    } else if (config.frameId === 'gold_hairline') {
        drawRoundedRectPath(ctx, 2, 2, W - 4, H - 4, R - 1);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();

        drawRoundedRectPath(ctx, 8, 8, W - 16, H - 16, 6);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();
    } else if (config.frameId === 'holo_rim') {
        const bGrad = ctx.createLinearGradient(0, 0, W, H);
        bGrad.addColorStop(0, '#72efdd');
        bGrad.addColorStop(0.5, '#a855f7');
        bGrad.addColorStop(1, '#f43f5e');
        drawRoundedRectPath(ctx, 2, 2, W - 4, H - 4, R - 1);
        ctx.strokeStyle = bGrad;
        ctx.lineWidth = 4;
        ctx.stroke();
    } else if (config.frameId === 'tech_brackets') {
        drawRoundedRectPath(ctx, 1, 1, W - 2, H - 2, R);
        ctx.strokeStyle = skin.dividerColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.strokeStyle = skin.accentColor;
        ctx.lineWidth = 4;
        const len = 24;
        const pad = 10;
        ctx.beginPath();
        // Top-left & Top-right
        ctx.moveTo(pad, pad + len); ctx.lineTo(pad, pad); ctx.lineTo(pad + len, pad);
        ctx.moveTo(W - pad - len, pad); ctx.lineTo(W - pad, pad); ctx.lineTo(W - pad, pad + len);
        // Bottom-left & Bottom-right
        ctx.moveTo(pad, H - pad - len); ctx.lineTo(pad, H - pad); ctx.lineTo(pad + len, H - pad);
        ctx.moveTo(W - pad - len, H - pad); ctx.lineTo(W - pad, H - pad); ctx.lineTo(W - pad, H - pad - len);
        ctx.stroke();
    } else {
        drawRoundedRectPath(ctx, 1, 1, W - 2, H - 2, R);
        ctx.strokeStyle = skin.dividerColor;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    ctx.restore();
    return canvas;
}

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
            return { ok: true, message: '✨ Copied Collector Pass to clipboard!' };
        }

        await downloadNamecardPng(config, profile, stats);
        return { ok: true, message: '💾 Saved Collector Pass PNG!' };
    } catch {
        await downloadNamecardPng(config, profile, stats);
        return { ok: true, message: '💾 Downloaded Collector Pass PNG!' };
    }
}

export async function downloadNamecardPng(
    config: NamecardConfig,
    profile: UserProfile | null,
    stats: PlayerEconomyStats | null
): Promise<void> {
    const canvas = await renderNamecardToCanvas(config, profile, stats);
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const cleanHandle = (config.username || 'player').replace(/[^a-zA-Z0-9_-]/g, '');
    link.download = `uwu-pass-${cleanHandle}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
