// src/lib/game/economy/worldEconomy.ts
/**
 * UwU World Economy, 24h Daily Reward, Win/Loss Stats, Leaderboard, Persistent Graffiti Wall & P2P $UWU Transfer Manager
 * Synchronizes with Supabase (`public.uwu_world_players`, `public.uwu_transfers`, `public.uwu_graffiti_wall`)
 * with automatic localStorage + Realtime broadcast fallback.
 */

import { supabase } from '$lib/supabaseClient';
import { toCompactAvatarUrl } from '$lib/utils/avatar';

export const DAILY_REWARD_AMOUNT = 1000;
export const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PlayerEconomyStats {
    user_id: string;
    x_username: string;
    display_name?: string;
    avatar_url: string;
    chips: number;
    wins: number;
    losses: number;
    net_profit: number;
    high_score: number;
    last_daily_claim: string | null;
    updated_at: string;
    isOnline?: boolean;
}

export interface UwuTransferRecord {
    id?: number;
    sender_id: string;
    sender_username: string;
    recipient_username: string;
    amount: number;
    note: string;
    created_at: string;
}

const LOCAL_STATS_KEY = 'pfpuwu_world_economy_v2';
const LOCAL_LEADERBOARD_CACHE_KEY = 'pfpuwu_world_leaderboard_cache_v2';
const LOCAL_TRANSFERS_KEY = 'pfpuwu_world_transfers_v2';
const LOCAL_GRAFFITI_KEY = 'pfpuwu_world_graffiti_dataurl_v2';

/**
 * Validates that a player identity belongs to an authenticated X user (never an anon/random guest)
 */
export function isAuthenticatedWorldUser(userId?: string | null, username?: string | null): boolean {
    if (!userId || !username) return false;
    const cleanId = userId.trim();
    const cleanUser = username.trim().replace(/^@/, '').toLowerCase();
    if (!cleanId || !cleanUser) return false;
    if (cleanId.startsWith('user_') || cleanId.startsWith('visitor-') || cleanId.startsWith('anon')) {
        return false;
    }
    if (/^anon\d*$/i.test(cleanUser) || /^guest\d*$/i.test(cleanUser)) {
        return false;
    }
    return true;
}

/**
 * Loads saved 48x32 Graffiti Wall PNG data URL from Supabase (source of truth) or localStorage fallback
 */
export async function loadSavedGraffitiWall(): Promise<string | null> {
    let localUrl: string | null = null;
    if (typeof window !== 'undefined') {
        try {
            localUrl = localStorage.getItem(LOCAL_GRAFFITI_KEY);
        } catch {}
    }

    try {
        const { data, error } = await supabase
            .from('uwu_graffiti_wall')
            .select('id, pixels, updated_at')
            .eq('id', 'main')
            .maybeSingle();

        if (!error && data?.pixels) {
            const p = data.pixels as any;
            const remoteDataUrl =
                typeof p === 'string'
                    ? p
                    : typeof p?.data_url === 'string'
                      ? p.data_url
                      : typeof p?.dataUrl === 'string'
                        ? p.dataUrl
                        : null;
            if (remoteDataUrl && remoteDataUrl.startsWith('data:image/')) {
                if (typeof window !== 'undefined') {
                    try {
                        localStorage.setItem(LOCAL_GRAFFITI_KEY, remoteDataUrl);
                    } catch {}
                }
                return remoteDataUrl;
            }
        }
    } catch {}

    return localUrl;
}

/**
 * Saves 48x32 Graffiti Wall PNG data URL to localStorage and Supabase (`pixels` JSONB column).
 * Strictly blocks unauthenticated/anon saves so anon sessions can never overwrite the global wall.
 */
export async function saveGraffitiWallState(dataUrl: string, username = ''): Promise<void> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
    const cleanUser = username.trim().replace(/^@/, '').toLowerCase();
    if (!cleanUser || /^anon\d*$/i.test(cleanUser)) return;

    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_GRAFFITI_KEY, dataUrl);
        } catch {}
    }

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: 'main',
                pixels: { data_url: dataUrl },
                updated_by: cleanUser,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}
}

export function formatCooldownRemaining(ms: number): string {
    if (ms <= 0) return 'Ready!';
    const totalSec = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

export function getDailyRewardStatus(lastClaimIso: string | null): {
    canClaim: boolean;
    remainingMs: number;
    formattedRemaining: string;
} {
    if (!lastClaimIso) {
        return { canClaim: true, remainingMs: 0, formattedRemaining: 'Ready!' };
    }
    const lastTs = new Date(lastClaimIso).getTime();
    if (isNaN(lastTs)) {
        return { canClaim: true, remainingMs: 0, formattedRemaining: 'Ready!' };
    }
    const elapsed = Date.now() - lastTs;
    const remainingMs = Math.max(0, DAILY_COOLDOWN_MS - elapsed);
    return {
        canClaim: remainingMs === 0,
        remainingMs,
        formattedRemaining: formatCooldownRemaining(remainingMs)
    };
}

export async function loadOrInitPlayerStats(
    userId: string,
    username: string,
    avatarUrl: string,
    displayName?: string
): Promise<PlayerEconomyStats> {
    const cleanUser = username.replace(/^@/, '').toLowerCase() || 'anon';
    const nowIso = new Date().toISOString();

    let stats: PlayerEconomyStats = {
        user_id: userId,
        x_username: cleanUser,
        display_name: displayName || cleanUser,
        avatar_url: avatarUrl || '/unicorn.png',
        chips: 2500,
        wins: 0,
        losses: 0,
        net_profit: 0,
        high_score: 0,
        last_daily_claim: null,
        updated_at: nowIso
    };

    // Strictly block unauthenticated / anon identities from touching localStorage or Supabase DB
    if (!isAuthenticatedWorldUser(userId, cleanUser)) {
        return stats;
    }

    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_STATS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.user_id === userId && typeof parsed.chips === 'number') {
                    stats = {
                        ...stats,
                        chips: Math.max(0, parsed.chips),
                        wins: parsed.wins || 0,
                        losses: parsed.losses || 0,
                        net_profit: parsed.net_profit || 0,
                        high_score: parsed.high_score || 0,
                        last_daily_claim: parsed.last_daily_claim || null
                    };
                }
            }
        } catch {}
    }

    try {
        const { data: existing, error } = await supabase
            .from('uwu_world_players')
            .select('user_id, x_username, display_name, avatar_url, chips, wins, losses, net_profit, high_score, last_daily_claim, updated_at')
            .eq('user_id', userId)
            .maybeSingle();

        const compactAvatar = toCompactAvatarUrl(avatarUrl || existing?.avatar_url);

        if (!error && existing) {
            stats = {
                user_id: userId,
                x_username: cleanUser,
                display_name: displayName || existing.display_name || cleanUser,
                avatar_url: avatarUrl && !avatarUrl.startsWith('data:image/') ? avatarUrl : compactAvatar,
                chips: Number(existing.chips ?? stats.chips),
                wins: Number(existing.wins ?? stats.wins),
                losses: Number(existing.losses ?? stats.losses),
                net_profit: Number(existing.net_profit ?? stats.net_profit),
                high_score: Math.max(Number(existing.high_score ?? 0), stats.high_score),
                last_daily_claim: existing.last_daily_claim || stats.last_daily_claim,
                updated_at: nowIso
            };
            // Scrub legacy base64 avatar_url in DB if present
            if (existing.avatar_url && existing.avatar_url.startsWith('data:image/')) {
                await supabase
                    .from('uwu_world_players')
                    .update({ avatar_url: compactAvatar, updated_at: nowIso })
                    .eq('user_id', userId);
            }
        } else if (!error && !existing) {
            await supabase.from('uwu_world_players').upsert({
                user_id: stats.user_id,
                x_username: stats.x_username,
                display_name: stats.display_name,
                avatar_url: compactAvatar,
                chips: stats.chips,
                wins: stats.wins,
                losses: stats.losses,
                net_profit: stats.net_profit,
                high_score: stats.high_score,
                last_daily_claim: stats.last_daily_claim,
                updated_at: nowIso
            });
        }
    } catch {}

    saveLocalPlayerStats(stats);
    return stats;
}

export function saveLocalPlayerStats(stats: PlayerEconomyStats) {
    if (typeof window === 'undefined') return;
    if (!isAuthenticatedWorldUser(stats.user_id, stats.x_username)) return;
    try {
        localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
        localStorage.setItem('pfpuwu_world_chips_v1', String(stats.chips));
        upsertPlayerInLocalLeaderboardCache(stats);
        window.dispatchEvent(new CustomEvent('uwu-stats-updated', { detail: stats }));
    } catch {}
}

export async function syncPlayerStatsToSupabase(stats: PlayerEconomyStats): Promise<void> {
    if (!isAuthenticatedWorldUser(stats.user_id, stats.x_username)) return;
    saveLocalPlayerStats(stats);
    try {
        await supabase.from('uwu_world_players').upsert(
            {
                user_id: stats.user_id,
                x_username: stats.x_username,
                display_name: stats.display_name || stats.x_username,
                avatar_url: toCompactAvatarUrl(stats.avatar_url),
                chips: Math.round(stats.chips),
                wins: stats.wins,
                losses: stats.losses,
                net_profit: Math.round(stats.net_profit),
                high_score: Math.round(stats.high_score),
                last_daily_claim: stats.last_daily_claim,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id' }
        );
    } catch {}
}

export function upsertPlayerInLocalLeaderboardCache(entry: PlayerEconomyStats) {
    if (typeof window === 'undefined') return;
    if (!isAuthenticatedWorldUser(entry.user_id, entry.x_username)) return;
    try {
        const raw = localStorage.getItem(LOCAL_LEADERBOARD_CACHE_KEY);
        const map: Record<string, PlayerEconomyStats> = raw ? JSON.parse(raw) : {};
        const key = entry.x_username.replace(/^@/, '').toLowerCase();
        map[key] = {
            ...map[key],
            ...entry,
            x_username: key,
            updated_at: new Date().toISOString()
        };
        localStorage.setItem(LOCAL_LEADERBOARD_CACHE_KEY, JSON.stringify(map));
    } catch {}
}

export async function fetchLeaderboard(
    localStats: PlayerEconomyStats,
    onlinePeers: PlayerEconomyStats[]
): Promise<PlayerEconomyStats[]> {
    const merged = new Map<string, PlayerEconomyStats>();

    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_LEADERBOARD_CACHE_KEY);
            if (raw) {
                const map: Record<string, PlayerEconomyStats> = JSON.parse(raw);
                Object.values(map).forEach((p) => {
                    if (p && isAuthenticatedWorldUser(p.user_id, p.x_username)) {
                        merged.set(p.x_username.toLowerCase(), { ...p, isOnline: false });
                    }
                });
            }
        } catch {}
    }

    try {
        const { data, error } = await supabase
            .from('uwu_world_players')
            .select('user_id, x_username, display_name, avatar_url, chips, wins, losses, net_profit, high_score, last_daily_claim, updated_at')
            .order('chips', { ascending: false })
            .limit(60);

        if (!error && Array.isArray(data)) {
            for (const row of data) {
                const key = (row.x_username || '').replace(/^@/, '').toLowerCase();
                if (!isAuthenticatedWorldUser(row.user_id, key)) continue;
                merged.set(key, {
                    user_id: row.user_id,
                    x_username: key,
                    display_name: row.display_name || key,
                    avatar_url: toCompactAvatarUrl(row.avatar_url),
                    chips: Number(row.chips ?? 0),
                    wins: Number(row.wins ?? 0),
                    losses: Number(row.losses ?? 0),
                    net_profit: Number(row.net_profit ?? 0),
                    high_score: Number(row.high_score ?? 0),
                    last_daily_claim: row.last_daily_claim || null,
                    updated_at: row.updated_at || new Date().toISOString(),
                    isOnline: false
                });
            }
        }
    } catch {}

    try {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, x_username, x_display_name, avatar_url, avatar_traits')
            .limit(30);

        if (Array.isArray(profiles)) {
            for (const prof of profiles) {
                const key = (prof.x_username || '').replace(/^@/, '').toLowerCase();
                if (!isAuthenticatedWorldUser(prof.id, key)) continue;
                const compactProfAvatar = toCompactAvatarUrl(prof.avatar_url, prof.avatar_traits);
                const existing = merged.get(key);
                if (!existing) {
                    merged.set(key, {
                        user_id: prof.id,
                        x_username: key,
                        display_name: prof.x_display_name || key,
                        avatar_url: compactProfAvatar,
                        chips: 2500,
                        wins: 0,
                        losses: 0,
                        net_profit: 0,
                        high_score: 0,
                        last_daily_claim: null,
                        updated_at: new Date().toISOString(),
                        isOnline: false
                    });
                } else if (compactProfAvatar !== '/unicorn.png') {
                    existing.avatar_url = compactProfAvatar;
                }
            }
        }
    } catch {}

    for (const peer of onlinePeers) {
        const key = (peer.x_username || '').replace(/^@/, '').toLowerCase();
        if (!isAuthenticatedWorldUser(peer.user_id, key)) continue;
        const prev = merged.get(key);
        merged.set(key, {
            ...(prev || peer),
            ...peer,
            x_username: key,
            isOnline: true
        });
    }

    const myKey = localStats.x_username.replace(/^@/, '').toLowerCase();
    if (isAuthenticatedWorldUser(localStats.user_id, myKey)) {
        merged.set(myKey, {
            ...localStats,
            x_username: myKey,
            isOnline: true
        });
    }

    return Array.from(merged.values());
}

export async function executeUwuTransfer(
    senderStats: PlayerEconomyStats,
    recipientUsername: string,
    amount: number,
    note = ''
): Promise<{ ok: boolean; error?: string; newBalance: number; record?: UwuTransferRecord }> {
    const cleanRecipient = recipientUsername.trim().replace(/^@/, '').toLowerCase();
    const cleanSender = senderStats.x_username.replace(/^@/, '').toLowerCase();

    if (!cleanRecipient) {
        return { ok: false, error: 'Please enter a valid @username.', newBalance: senderStats.chips };
    }
    if (cleanRecipient === cleanSender) {
        return { ok: false, error: 'You cannot send $UWU to yourself.', newBalance: senderStats.chips };
    }
    const cleanAmount = Math.floor(Number(amount));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
        return { ok: false, error: 'Enter a positive $UWU amount.', newBalance: senderStats.chips };
    }
    if (cleanAmount > senderStats.chips) {
        return { ok: false, error: `Insufficient balance (You have ${senderStats.chips.toLocaleString()} $UWU).`, newBalance: senderStats.chips };
    }

    const newBalance = senderStats.chips - cleanAmount;
    const record: UwuTransferRecord = {
        sender_id: senderStats.user_id,
        sender_username: cleanSender,
        recipient_username: cleanRecipient,
        amount: cleanAmount,
        note: note.trim().slice(0, 100),
        created_at: new Date().toISOString()
    };

    try {
        await supabase
            .from('uwu_world_players')
            .update({ chips: newBalance, updated_at: new Date().toISOString() })
            .eq('user_id', senderStats.user_id);

        const { data: recRow } = await supabase
            .from('uwu_world_players')
            .select('user_id, chips')
            .ilike('x_username', cleanRecipient)
            .maybeSingle();

        if (recRow) {
            await supabase
                .from('uwu_world_players')
                .update({ chips: Number(recRow.chips || 0) + cleanAmount, updated_at: new Date().toISOString() })
                .eq('user_id', recRow.user_id);
        }

        await supabase.from('uwu_transfers').insert({
            sender_id: record.sender_id,
            sender_username: record.sender_username,
            recipient_username: record.recipient_username,
            amount: record.amount,
            note: record.note
        });
    } catch {}

    if (typeof window !== 'undefined') {
        try {
            const rawCache = localStorage.getItem(LOCAL_LEADERBOARD_CACHE_KEY);
            const map: Record<string, PlayerEconomyStats> = rawCache ? JSON.parse(rawCache) : {};
            if (map[cleanRecipient]) {
                map[cleanRecipient].chips = (map[cleanRecipient].chips || 0) + cleanAmount;
                localStorage.setItem(LOCAL_LEADERBOARD_CACHE_KEY, JSON.stringify(map));
            }

            const rawTx = localStorage.getItem(LOCAL_TRANSFERS_KEY);
            const txList: UwuTransferRecord[] = rawTx ? JSON.parse(rawTx) : [];
            localStorage.setItem(LOCAL_TRANSFERS_KEY, JSON.stringify([record, ...txList.slice(0, 29)]));
        } catch {}
    }

    return { ok: true, newBalance, record };
}

// ============================================================================
// 24-HOUR PERSISTENT SKY WISH LANTERNS (Whispering Woods Sanctuary)
// ============================================================================

export type LanternColor = 'gold' | 'sakura' | 'cyan' | 'emerald' | 'violet';

export interface WishLanternRecord {
    id: string;
    user_id: string;
    username: string;
    wish: string;
    color: LanternColor;
    created_at: string;
    expires_at: string; // created_at + 24 hours
    likes: string[]; // @usernames who sent glow
}

export const WISH_LANTERN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const LOCAL_LANTERNS_KEY = 'pfpuwu_world_wish_lanterns_v1';
const SUPABASE_LANTERNS_ROW_ID = 'wish_lanterns_v1';

export function filterActiveLanterns(list: WishLanternRecord[]): WishLanternRecord[] {
    const now = Date.now();
    const byId = new Map<string, WishLanternRecord>();
    for (const item of list) {
        if (!item || !item.id || !item.wish || !item.username) continue;
        const exp = new Date(item.expires_at).getTime();
        if (isNaN(exp) || exp <= now) continue;
        const prev = byId.get(item.id);
        const likes = Array.from(
            new Set([...(prev?.likes || []), ...(Array.isArray(item.likes) ? item.likes : [])])
        );
        byId.set(item.id, {
            id: String(item.id),
            user_id: String(item.user_id || item.username),
            username: String(item.username).replace(/^@/, '').toLowerCase(),
            wish: String(item.wish).slice(0, 140),
            color: (['gold', 'sakura', 'cyan', 'emerald', 'violet'].includes(item.color)
                ? item.color
                : 'gold') as LanternColor,
            created_at: item.created_at,
            expires_at: item.expires_at,
            likes
        });
    }
    return Array.from(byId.values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);
}

export function formatLanternTimeRemaining(expiresAtIso: string): string {
    const exp = new Date(expiresAtIso).getTime();
    if (isNaN(exp)) return 'Expired';
    const remMs = Math.max(0, exp - Date.now());
    if (remMs <= 0) return 'Expired';
    const totalMins = Math.ceil(remMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m left`;
    }
    return `${mins}m left`;
}

export async function loadActiveWishLanterns(): Promise<WishLanternRecord[]> {
    let localList: WishLanternRecord[] = [];
    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_LANTERNS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    localList = filterActiveLanterns(parsed);
                }
            }
        } catch {}
    }

    try {
        const { data, error } = await supabase
            .from('uwu_graffiti_wall')
            .select('id, pixels, updated_at')
            .eq('id', SUPABASE_LANTERNS_ROW_ID)
            .maybeSingle();

        if (!error && data?.pixels) {
            const p = data.pixels as any;
            const remoteArr = Array.isArray(p?.lanterns) ? p.lanterns : Array.isArray(p) ? p : [];
            const merged = filterActiveLanterns([...remoteArr, ...localList]);
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(LOCAL_LANTERNS_KEY, JSON.stringify(merged));
                } catch {}
            }
            return merged;
        }
    } catch {}

    return localList;
}

export async function saveNewWishLantern(
    lantern: WishLanternRecord
): Promise<WishLanternRecord[]> {
    const current = await loadActiveWishLanterns();
    const merged = filterActiveLanterns([lantern, ...current]);

    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_LANTERNS_KEY, JSON.stringify(merged));
        } catch {}
    }

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: SUPABASE_LANTERNS_ROW_ID,
                pixels: { lanterns: merged },
                updated_by: lantern.username.replace(/^@/, '').toLowerCase(),
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}

    return merged;
}

export async function toggleWishLanternGlow(
    lanternId: string,
    username: string
): Promise<WishLanternRecord[]> {
    const cleanUser = username.trim().replace(/^@/, '').toLowerCase();
    const current = await loadActiveWishLanterns();
    if (!cleanUser) return current;

    const updated = current.map((l) => {
        if (l.id !== lanternId) return l;
        const hasLiked = l.likes.includes(cleanUser);
        const nextLikes = hasLiked
            ? l.likes.filter((u) => u !== cleanUser)
            : [...l.likes, cleanUser];
        return { ...l, likes: nextLikes };
    });

    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_LANTERNS_KEY, JSON.stringify(updated));
        } catch {}
    }

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                id: SUPABASE_LANTERNS_ROW_ID,
                pixels: { lanterns: updated },
                updated_by: cleanUser,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'id' }
        );
    } catch {}

    return updated;
}

// ============================================================================
// PERSISTENT GLOBAL ARCADE HIGH SCORE BOARDS (Per-Game Top 10)
// ============================================================================

export type ArcadeScoreGameId = 'brick' | 'snake' | 'coin' | 'whack';

export interface ArcadeHighScoreEntry {
    user_id: string;
    username: string;
    score: number;
    updated_at: string;
}

export type ArcadeLeaderboardMap = Record<ArcadeScoreGameId, ArcadeHighScoreEntry[]>;

const LOCAL_ARCADE_LB_KEY = 'pfpuwu_world_arcade_leaderboards_v1';
const SUPABASE_ARCADE_LB_ROW_ID = 'arcade_leaderboards_v1';
const ARCADE_GAME_KEYS: ArcadeScoreGameId[] = ['brick', 'snake', 'coin', 'whack'];

function createEmptyArcadeLeaderboardMap(): ArcadeLeaderboardMap {
    return {
        brick: [],
        snake: [],
        coin: [],
        whack: []
    };
}

export function normalizeArcadeGameBoard(list: ArcadeHighScoreEntry[]): ArcadeHighScoreEntry[] {
    const byUser = new Map<string, ArcadeHighScoreEntry>();
    for (const item of list || []) {
        if (!item || !item.username || typeof item.score !== 'number' || item.score <= 0) continue;
        const cleanUser = String(item.username).replace(/^@/, '').toLowerCase();
        if (!cleanUser || /^anon\d*$/i.test(cleanUser)) continue;
        const existing = byUser.get(cleanUser);
        if (!existing || item.score > existing.score) {
            byUser.set(cleanUser, {
                user_id: String(item.user_id || cleanUser),
                username: cleanUser,
                score: Math.round(item.score),
                updated_at: item.updated_at || new Date().toISOString()
            });
        }
    }
    return Array.from(byUser.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
}

export function mergeArcadeLeaderboardMaps(
    a: Partial<ArcadeLeaderboardMap> | null | undefined,
    b: Partial<ArcadeLeaderboardMap> | null | undefined
): ArcadeLeaderboardMap {
    const out = createEmptyArcadeLeaderboardMap();
    for (const key of ARCADE_GAME_KEYS) {
        const listA = Array.isArray(a?.[key]) ? a![key]! : [];
        const listB = Array.isArray(b?.[key]) ? b![key]! : [];
        out[key] = normalizeArcadeGameBoard([...listA, ...listB]);
    }
    return out;
}

export async function loadArcadeLeaderboards(): Promise<ArcadeLeaderboardMap> {
    let localMap: ArcadeLeaderboardMap = createEmptyArcadeLeaderboardMap();
    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_ARCADE_LB_KEY);
            if (raw) {
                localMap = mergeArcadeLeaderboardMaps(localMap, JSON.parse(raw));
            }
        } catch {}
    }

    try {
        const { data, error } = await supabase
            .from('uwu_graffiti_wall')
            .select('id, pixels, updated_at')
            .eq('id', SUPABASE_ARCADE_LB_ROW_ID)
            .maybeSingle();

        if (!error && data?.pixels) {
            const p = data.pixels as any;
            const remoteBoards = p?.boards || p;
            const merged = mergeArcadeLeaderboardMaps(remoteBoards, localMap);
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(LOCAL_ARCADE_LB_KEY, JSON.stringify(merged));
                } catch {}
            }
            return merged;
        }
    } catch {}

    return localMap;
}

export async function submitArcadeHighScore(
    gameId: ArcadeScoreGameId,
    entry: ArcadeHighScoreEntry
): Promise<{
    leaderboards: ArcadeLeaderboardMap;
    isNewPersonalBest: boolean;
    isNewGlobalRecord: boolean;
    rank: number | null;
}> {
    const current = await loadArcadeLeaderboards();
    const cleanUser = entry.username.replace(/^@/, '').toLowerCase();
    if (!cleanUser || entry.score <= 0) {
        return {
            leaderboards: current,
            isNewPersonalBest: false,
            isNewGlobalRecord: false,
            rank: null
        };
    }

    const prevBoard = current[gameId] || [];
    const prevTopScore = prevBoard[0]?.score || 0;
    const prevUserEntry = prevBoard.find((e) => e.username.toLowerCase() === cleanUser);
    const isNewPersonalBest = !prevUserEntry || entry.score > prevUserEntry.score;
    const isNewGlobalRecord = entry.score > prevTopScore;

    const updatedBoard = normalizeArcadeGameBoard([
        ...prevBoard,
        {
            user_id: entry.user_id,
            username: cleanUser,
            score: Math.round(entry.score),
            updated_at: entry.updated_at || new Date().toISOString()
        }
    ]);

    const nextMap: ArcadeLeaderboardMap = {
        ...current,
        [gameId]: updatedBoard
    };

    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_ARCADE_LB_KEY, JSON.stringify(nextMap));
        } catch {}
    }

    if (isNewPersonalBest) {
        try {
            await supabase.from('uwu_graffiti_wall').upsert(
                {
                    id: SUPABASE_ARCADE_LB_ROW_ID,
                    pixels: { boards: nextMap },
                    updated_by: cleanUser,
                    updated_at: new Date().toISOString()
                },
                { onConflict: 'id' }
            );
        } catch {}
    }

    const rankIdx = updatedBoard.findIndex((e) => e.username.toLowerCase() === cleanUser);
    return {
        leaderboards: nextMap,
        isNewPersonalBest,
        isNewGlobalRecord,
        rank: rankIdx !== -1 ? rankIdx + 1 : null
    };
}
