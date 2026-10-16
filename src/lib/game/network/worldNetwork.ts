// src/lib/game/network/worldNetwork.ts
/**
 * Supabase Realtime network synchronization for UwU World
 * Handles:
 * - Presence tracking (who is online in the room)
 * - Position broadcasting with dead-reckoning interpolation (16Hz -> 60FPS)
 * - 6 Dance moves sync
 * - Text chat speech bubbles
 * - Economy, Leaderboard stats sync, P2P $UWU Chip Transfers & Persistent Graffiti Wall Sync
 * - Mini-game state synchronization (Dice Duel, Roulette, Blackjack/Slots/Crash/Mines Jackpot, Vault, DJ)
 * - WebRTC signaling for proximity voice chat
 */

import { supabase } from '$lib/supabaseClient';
import type { PlayerAvatarState, DanceMoveType } from '../isometric/avatarSprite';
import type { IsoDirection } from '../isometric/isoMath';
import { lerp } from '../isometric/isoMath';
import type { PlayerScore, DiceSeat } from '../activities/diceDuel';
import type { RouletteSector } from '../activities/rouletteGame';
import type { PlayerEconomyStats, UwuTransferRecord } from '../economy/worldEconomy';

export interface RemotePlayer extends PlayerAvatarState {
    targetX: number;
    targetY: number;
    lastNetworkTs: number;
}

export class WorldNetworkManager {
    private channel: any = null;
    private channelName = 'uwu_world_lounge_v2';
    private localUserId: string;
    private localPlayerState: PlayerAvatarState;
    private remotePlayers = new Map<string, RemotePlayer>();
    private peerEconomyStats = new Map<string, PlayerEconomyStats>();

    private lastBroadcastTime = 0;
    private broadcastIntervalMs = 60;

    // Event callbacks
    public onChatReceived: (senderId: string, username: string, text: string) => void = () => {};
    public onEmoteReceived: (senderId: string, emote: string) => void = () => {};
    public onVaultUnlocked: (heroes: string[]) => void = () => {};
    public onDJTrackChanged: (trackId: number, djUser: string) => void = () => {};
    public onGraffitiPixel: (x: number, y: number, color: string, brush?: number) => void = () => {};
    public onGraffitiSnapshot: (dataUrl: string) => void = () => {};
    public onWebRTCSignal: (fromUserId: string, payload: any) => void = () => {};
    public onOnlineCountChanged: (count: number) => void = () => {};
    public onCasinoJackpot: (username: string, game: string, amount: number) => void = () => {};

    // Economy & P2P Transfer Callbacks
    public onStatsUpdated: (stats: PlayerEconomyStats) => void = () => {};
    public onUwuTransferReceived: (record: UwuTransferRecord) => void = () => {};

    // Casino Callbacks
    public onDiceSeatsUpdate: (seats: DiceSeat[]) => void = () => {};
    public onDiceRollRound: (round: number, scores: PlayerScore[]) => void = () => {};
    public onDiceTournamentWon: (winner: PlayerScore) => void = () => {};
    public onRouletteSpinResult: (winner: RouletteSector) => void = () => {};

    constructor(localUserId: string, initialPlayer: PlayerAvatarState) {
        this.localUserId = localUserId;
        this.localPlayerState = { ...initialPlayer };
    }

    public init() {
        if (typeof window === 'undefined') return;

        this.channel = supabase.channel(this.channelName, {
            config: {
                presence: { key: this.localUserId },
                broadcast: { ack: false, self: false }
            }
        });

        this.channel
            .on('presence', { event: 'sync' }, () => {
                const presenceState = this.channel.presenceState();
                const activeIds = new Set<string>();

                for (const key of Object.keys(presenceState)) {
                    const presences = presenceState[key];
                    if (presences && presences.length > 0) {
                        const data = presences[0];
                        activeIds.add(data.id);

                        if (data.id !== this.localUserId) {
                            if (!this.remotePlayers.has(data.id)) {
                                this.remotePlayers.set(data.id, {
                                    id: data.id,
                                    username: data.username || 'anon',
                                    displayName: data.displayName,
                                    avatarUrl: data.avatarUrl || '/unicorn.png',
                                    x: data.x || 16.0,
                                    y: data.y || 16.5,
                                    targetX: data.x || 16.0,
                                    targetY: data.y || 16.5,
                                    dir: data.dir || 'SE',
                                    isWalking: false,
                                    isDancing: false,
                                    danceMove: 'disco',
                                    isSpeaking: false,
                                    walkAnimTick: 0,
                                    chips: data.chips ?? 2500,
                                    wins: data.wins ?? 0,
                                    losses: data.losses ?? 0,
                                    lastNetworkTs: Date.now()
                                });
                            }
                        }
                    }
                }

                for (const [id] of this.remotePlayers.entries()) {
                    if (!activeIds.has(id)) {
                        this.remotePlayers.delete(id);
                    }
                }

                this.onOnlineCountChanged(this.remotePlayers.size + 1);
            })
            .on('broadcast', { event: 'pos' }, ({ payload }: any) => {
                if (!payload || payload.id === this.localUserId) return;
                const p = this.remotePlayers.get(payload.id);
                if (p) {
                    p.targetX = payload.x;
                    p.targetY = payload.y;
                    p.dir = payload.dir;
                    p.isWalking = payload.isWalking;
                    p.isDancing = payload.isDancing;
                    if (payload.danceMove) p.danceMove = payload.danceMove;
                    p.isSpeaking = payload.isSpeaking;
                    if (typeof payload.chips === 'number') p.chips = payload.chips;
                    if (typeof payload.wins === 'number') p.wins = payload.wins;
                    if (typeof payload.losses === 'number') p.losses = payload.losses;
                    p.lastNetworkTs = Date.now();
                } else {
                    this.remotePlayers.set(payload.id, {
                        id: payload.id,
                        username: payload.username || 'anon',
                        avatarUrl: payload.avatarUrl || '/unicorn.png',
                        x: payload.x,
                        y: payload.y,
                        targetX: payload.x,
                        targetY: payload.y,
                        dir: payload.dir,
                        isWalking: payload.isWalking,
                        isDancing: payload.isDancing,
                        danceMove: payload.danceMove || 'disco',
                        isSpeaking: payload.isSpeaking,
                        walkAnimTick: 0,
                        chips: payload.chips ?? 2500,
                        wins: payload.wins ?? 0,
                        losses: payload.losses ?? 0,
                        lastNetworkTs: Date.now()
                    });
                }
            })
            .on('broadcast', { event: 'chat' }, ({ payload }: any) => {
                if (!payload) return;
                const p = this.remotePlayers.get(payload.id);
                const senderName = payload.username || p?.username || 'anon';
                this.onChatReceived(payload.id, senderName, payload.text);

                if (p) {
                    p.speechBubble = {
                        text: payload.text,
                        expiresAt: Date.now() + 6500
                    };
                }
            })
            .on('broadcast', { event: 'emote' }, ({ payload }: any) => {
                if (!payload) return;
                this.onEmoteReceived(payload.id, payload.emote);

                const p = this.remotePlayers.get(payload.id);
                if (p) {
                    p.currentEmote = {
                        icon: payload.emote,
                        expiresAt: Date.now() + 5000
                    };
                }
            })
            .on('broadcast', { event: 'vault_unlocked' }, ({ payload }: any) => {
                if (!payload) return;
                this.onVaultUnlocked(payload.heroes || []);
            })
            .on('broadcast', { event: 'dj_track' }, ({ payload }: any) => {
                if (!payload) return;
                this.onDJTrackChanged(payload.trackId, payload.djUser);
            })
            .on('broadcast', { event: 'graffiti_pixel' }, ({ payload }: any) => {
                if (!payload) return;
                this.onGraffitiPixel(payload.x, payload.y, payload.color, payload.brush || 1);
            })
            .on('broadcast', { event: 'graffiti_snapshot' }, ({ payload }: any) => {
                if (!payload || !payload.dataUrl) return;
                this.onGraffitiSnapshot(payload.dataUrl);
            })
            .on('broadcast', { event: 'dice_seat_update' }, ({ payload }: any) => {
                if (!payload) return;
                this.onDiceSeatsUpdate(payload.seats);
            })
            .on('broadcast', { event: 'dice_round_roll' }, ({ payload }: any) => {
                if (!payload) return;
                this.onDiceRollRound(payload.round, payload.scores);
            })
            .on('broadcast', { event: 'dice_tournament_won' }, ({ payload }: any) => {
                if (!payload) return;
                this.onDiceTournamentWon(payload.winner);
            })
            .on('broadcast', { event: 'roulette_spin' }, ({ payload }: any) => {
                if (!payload) return;
                this.onRouletteSpinResult(payload.winner);
            })
            .on('broadcast', { event: 'casino_jackpot' }, ({ payload }: any) => {
                if (!payload) return;
                this.onCasinoJackpot(payload.username, payload.game, payload.amount);
            })
            .on('broadcast', { event: 'stats_sync' }, ({ payload }: any) => {
                if (!payload || !payload.stats) return;
                const st: PlayerEconomyStats = payload.stats;
                const key = (st.x_username || '').replace(/^@/, '').toLowerCase();
                if (key) {
                    this.peerEconomyStats.set(key, st);
                    const p = this.remotePlayers.get(st.user_id);
                    if (p) {
                        p.chips = st.chips;
                        p.wins = st.wins;
                        p.losses = st.losses;
                    }
                    this.onStatsUpdated(st);
                }
            })
            .on('broadcast', { event: 'uwu_transfer' }, ({ payload }: any) => {
                if (!payload || !payload.record) return;
                this.onUwuTransferReceived(payload.record);
            })
            .on('broadcast', { event: 'webrtc_signal' }, ({ payload }: any) => {
                if (!payload || payload.to !== this.localUserId) return;
                this.onWebRTCSignal(payload.from, payload.data);
            });

        this.channel.subscribe(async (status: string) => {
            if (status === 'SUBSCRIBED') {
                await this.channel.track({
                    id: this.localUserId,
                    username: this.localPlayerState.username,
                    displayName: this.localPlayerState.displayName,
                    avatarUrl: this.localPlayerState.avatarUrl,
                    x: this.localPlayerState.x,
                    y: this.localPlayerState.y,
                    dir: this.localPlayerState.dir,
                    chips: this.localPlayerState.chips ?? 2500,
                    wins: this.localPlayerState.wins ?? 0,
                    losses: this.localPlayerState.losses ?? 0
                });
            }
        });
    }

    public broadcastPosition(
        x: number,
        y: number,
        dir: IsoDirection,
        isWalking: boolean,
        isDancing: boolean,
        isSpeaking: boolean,
        danceMove: DanceMoveType = 'disco',
        force = false
    ) {
        this.localPlayerState.x = x;
        this.localPlayerState.y = y;
        this.localPlayerState.dir = dir;
        this.localPlayerState.isWalking = isWalking;
        this.localPlayerState.isDancing = isDancing;
        this.localPlayerState.danceMove = danceMove;
        this.localPlayerState.isSpeaking = isSpeaking;

        const now = Date.now();
        if (!force && now - this.lastBroadcastTime < this.broadcastIntervalMs) {
            return;
        }
        this.lastBroadcastTime = now;

        if (this.channel) {
            this.channel.send({
                type: 'broadcast',
                event: 'pos',
                payload: {
                    id: this.localUserId,
                    username: this.localPlayerState.username,
                    avatarUrl: this.localPlayerState.avatarUrl,
                    x: Math.round(x * 100) / 100,
                    y: Math.round(y * 100) / 100,
                    dir,
                    isWalking,
                    isDancing,
                    danceMove,
                    isSpeaking,
                    chips: this.localPlayerState.chips,
                    wins: this.localPlayerState.wins,
                    losses: this.localPlayerState.losses
                }
            });
        }
    }

    public broadcastStats(stats: PlayerEconomyStats) {
        this.localPlayerState.chips = stats.chips;
        this.localPlayerState.wins = stats.wins;
        this.localPlayerState.losses = stats.losses;

        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'stats_sync',
            payload: { stats }
        });
    }

    public broadcastUwuTransfer(record: UwuTransferRecord) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'uwu_transfer',
            payload: { record }
        });
    }

    public broadcastChat(text: string) {
        if (!this.channel) return;
        this.localPlayerState.speechBubble = {
            text,
            expiresAt: Date.now() + 6500
        };

        this.channel.send({
            type: 'broadcast',
            event: 'chat',
            payload: {
                id: this.localUserId,
                username: this.localPlayerState.username,
                text
            }
        });
    }

    public broadcastEmote(emote: string) {
        if (!this.channel) return;
        this.localPlayerState.currentEmote = {
            icon: emote,
            expiresAt: Date.now() + 5000
        };

        this.channel.send({
            type: 'broadcast',
            event: 'emote',
            payload: {
                id: this.localUserId,
                emote
            }
        });
    }

    public broadcastVaultUnlocked(heroes: string[]) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'vault_unlocked',
            payload: { heroes }
        });
    }

    public broadcastDJTrack(trackId: number, djUser: string) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'dj_track',
            payload: { trackId, djUser }
        });
    }

    public broadcastGraffitiPixel(x: number, y: number, color: string, brush = 1) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'graffiti_pixel',
            payload: { x, y, color, brush }
        });
    }

    public broadcastGraffitiSnapshot(dataUrl: string) {
        if (!this.channel || !dataUrl) return;
        this.channel.send({
            type: 'broadcast',
            event: 'graffiti_snapshot',
            payload: { dataUrl }
        });
    }

    public broadcastDiceSeats(seats: DiceSeat[]) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'dice_seat_update',
            payload: { seats }
        });
    }

    public broadcastDiceRollRound(round: number, scores: PlayerScore[]) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'dice_round_roll',
            payload: { round, scores }
        });
    }

    public broadcastDiceTournamentWon(winner: PlayerScore) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'dice_tournament_won',
            payload: { winner }
        });
    }

    public broadcastRouletteSpin(winner: RouletteSector) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'roulette_spin',
            payload: { winner }
        });
    }

    public broadcastCasinoJackpot(username: string, game: string, amount: number) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'casino_jackpot',
            payload: { username, game, amount }
        });
    }

    public sendWebRTCSignal(toUserId: string, data: any) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'webrtc_signal',
            payload: {
                from: this.localUserId,
                to: toUserId,
                data
            }
        });
    }

    public tickInterpolation(deltaSec: number) {
        const lerpFactor = Math.min(1, deltaSec * 16);

        this.remotePlayers.forEach((p) => {
            p.x = lerp(p.x, p.targetX, lerpFactor);
            p.y = lerp(p.y, p.targetY, lerpFactor);

            if (p.isWalking || p.isDancing) {
                p.walkAnimTick += deltaSec * 6;
            }
        });
    }

    public getRemotePlayers(): RemotePlayer[] {
        return Array.from(this.remotePlayers.values());
    }

    public getOnlinePeerEconomyStats(): PlayerEconomyStats[] {
        const list: PlayerEconomyStats[] = [];
        this.remotePlayers.forEach((p) => {
            const key = (p.username || '').replace(/^@/, '').toLowerCase();
            const cached = this.peerEconomyStats.get(key);
            list.push({
                user_id: p.id,
                x_username: key || 'anon',
                display_name: p.displayName || key,
                avatar_url: p.avatarUrl || '/unicorn.png',
                chips: cached?.chips ?? p.chips ?? 2500,
                wins: cached?.wins ?? p.wins ?? 0,
                losses: cached?.losses ?? p.losses ?? 0,
                net_profit: cached?.net_profit ?? 0,
                high_score: cached?.high_score ?? 0,
                last_daily_claim: cached?.last_daily_claim ?? null,
                updated_at: new Date().toISOString(),
                isOnline: true
            });
        });
        return list;
    }

    public getRemotePositions(): Map<string, { x: number; y: number }> {
        const map = new Map<string, { x: number; y: number }>();
        this.remotePlayers.forEach((p, id) => {
            map.set(id, { x: p.x, y: p.y });
        });
        return map;
    }

    public destroy() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        this.remotePlayers.clear();
        this.peerEconomyStats.clear();
    }
}
