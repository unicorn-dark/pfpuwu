// src/lib/game/economy/worldEconomy.ts
/**
 * UwU World Economy, 24h Daily Reward, Win/Loss Stats, Leaderboard, Persistent Graffiti Wall & P2P $UWU Transfer Manager
 * Synchronizes with Supabase (`public.uwu_world_players`, `public.uwu_transfers`, `public.uwu_graffiti_wall`)
 * with automatic localStorage + Realtime broadcast fallback.
 */

import { supabase } from '$lib/supabaseClient';

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
 * Loads saved 48x32 Graffiti Wall PNG data URL from Supabase or localStorage so it never resets on join
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
            .select('data_url')
            .eq('room_id', 'main')
            .maybeSingle();

        if (!error && data?.data_url) {
            if (typeof window !== 'undefined') {
                try {
                    localStorage.setItem(LOCAL_GRAFFITI_KEY, data.data_url);
                } catch {}
            }
            return data.data_url;
        }
    } catch {}

    return localUrl;
}

/**
 * Saves 48x32 Graffiti Wall PNG data URL to localStorage and Supabase
 */
export async function saveGraffitiWallState(dataUrl: string, username = 'anon'): Promise<void> {
    if (!dataUrl) return;
    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(LOCAL_GRAFFITI_KEY, dataUrl);
        } catch {}
    }

    try {
        await supabase.from('uwu_graffiti_wall').upsert(
            {
                room_id: 'main',
                data_url: dataUrl,
                updated_by: username,
                updated_at: new Date().toISOString()
            },
            { onConflict: 'room_id' }
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

    if (typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem(LOCAL_STATS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.chips === 'number') {
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
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (!error && existing) {
            stats = {
                user_id: userId,
                x_username: cleanUser,
                display_name: displayName || existing.display_name || cleanUser,
                avatar_url: avatarUrl || existing.avatar_url || '/unicorn.png',
                chips: Number(existing.chips ?? stats.chips),
                wins: Number(existing.wins ?? stats.wins),
                losses: Number(existing.losses ?? stats.losses),
                net_profit: Number(existing.net_profit ?? stats.net_profit),
                high_score: Math.max(Number(existing.high_score ?? 0), stats.high_score),
                last_daily_claim: existing.last_daily_claim || stats.last_daily_claim,
                updated_at: nowIso
            };
        } else if (!error && !existing) {
            await supabase.from('uwu_world_players').upsert({
                user_id: stats.user_id,
                x_username: stats.x_username,
                display_name: stats.display_name,
                avatar_url: stats.avatar_url,
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
    try {
        localStorage.setItem(LOCAL_STATS_KEY, JSON.stringify(stats));
        localStorage.setItem('pfpuwu_world_chips_v1', String(stats.chips));
        upsertPlayerInLocalLeaderboardCache(stats);
    } catch {}
}

export async function syncPlayerStatsToSupabase(stats: PlayerEconomyStats): Promise<void> {
    saveLocalPlayerStats(stats);
    try {
        await supabase.from('uwu_world_players').upsert(
            {
                user_id: stats.user_id,
                x_username: stats.x_username,
                display_name: stats.display_name || stats.x_username,
                avatar_url: stats.avatar_url,
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
                    if (p && p.x_username) {
                        merged.set(p.x_username.toLowerCase(), { ...p, isOnline: false });
                    }
                });
            }
        } catch {}
    }

    try {
        const { data, error } = await supabase
            .from('uwu_world_players')
            .select('*')
            .order('chips', { ascending: false })
            .limit(50);

        if (!error && Array.isArray(data)) {
            for (const row of data) {
                const key = (row.x_username || '').replace(/^@/, '').toLowerCase();
                if (!key) continue;
                merged.set(key, {
                    user_id: row.user_id,
                    x_username: key,
                    display_name: row.display_name || key,
                    avatar_url: row.avatar_url || '/unicorn.png',
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
            .select('id, x_username, x_display_name, avatar_url')
            .limit(30);

        if (Array.isArray(profiles)) {
            for (const prof of profiles) {
                const key = (prof.x_username || '').replace(/^@/, '').toLowerCase();
                if (!key) continue;
                const existing = merged.get(key);
                if (!existing) {
                    merged.set(key, {
                        user_id: prof.id,
                        x_username: key,
                        display_name: prof.x_display_name || key,
                        avatar_url: prof.avatar_url || '/unicorn.png',
                        chips: 2500,
                        wins: 0,
                        losses: 0,
                        net_profit: 0,
                        high_score: 0,
                        last_daily_claim: null,
                        updated_at: new Date().toISOString(),
                        isOnline: false
                    });
                } else if (prof.avatar_url && prof.avatar_url !== '/unicorn.png' && !prof.avatar_url.includes('twimg.com')) {
                    existing.avatar_url = prof.avatar_url;
                }
            }
        }
    } catch {}

    for (const peer of onlinePeers) {
        const key = (peer.x_username || '').replace(/^@/, '').toLowerCase();
        if (!key) continue;
        const prev = merged.get(key);
        merged.set(key, {
            ...(prev || peer),
            ...peer,
            x_username: key,
            isOnline: true
        });
    }

    const myKey = localStats.x_username.replace(/^@/, '').toLowerCase();
    merged.set(myKey, {
        ...localStats,
        x_username: myKey,
        isOnline: true
    });

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
