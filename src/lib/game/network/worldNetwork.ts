// src/lib/game/network/worldNetwork.ts
/**
 * Supabase Realtime network synchronization for UwU World
 * Handles:
 * - Presence tracking (who is online in the room & which zone they are in)
 * - Position broadcasting with dead-reckoning interpolation (16Hz -> 60FPS)
 * - 6 Dance moves sync
 * - Text chat speech bubbles
 * - Economy, Leaderboard stats sync, P2P $UWU Chip Transfers & Persistent Graffiti Wall Sync (Broadcast + Postgres Changes)
 * - Mini-game state synchronization (Dice Duel, Roulette, Casino Jackpot, DJ, Forest Social Games)
 * - WebRTC mesh signaling & automatic peer connection lifecycle for proximity voice chat
 */

import { supabase } from '$lib/supabaseClient';
import type { PlayerAvatarState, DanceMoveType } from '../isometric/avatarSprite';
import type { IsoDirection } from '../isometric/isoMath';
import { lerp } from '../isometric/isoMath';
import type { PlayerScore, DiceSeat, DiceDuelSnapshot } from '../activities/diceDuel';
import type { RouletteSector } from '../activities/rouletteGame';
import type { PlayerEconomyStats, UwuTransferRecord } from '../economy/worldEconomy';

export interface RemotePlayer extends PlayerAvatarState {
    targetX: number;
    targetY: number;
    lastNetworkTs: number;
    zone: 'casino' | 'forest' | 'museum';
}

export class WorldNetworkManager {
    private channel: any = null;
    private dbChannel: any = null;
    private channelName = 'uwu_world_lounge_v2';
    private localUserId: string;
    private localPlayerState: PlayerAvatarState;
    private remotePlayers = new Map<string, RemotePlayer>();
    private peerEconomyStats = new Map<string, PlayerEconomyStats>();

    private lastBroadcastTime = 0;
    private broadcastIntervalMs = 60;
    private hasInitialPresenceSynced = false;

    // Event callbacks
    public onChatReceived: (senderId: string, username: string, text: string) => void = () => {};
    public onEmoteReceived: (senderId: string, emote: string) => void = () => {};
    public onDJTrackChanged: (trackId: number, djUser: string) => void = () => {};
    public onGraffitiPixel: (x: number, y: number, color: string, brush?: number) => void = () => {};
    public onGraffitiSnapshot: (dataUrl: string) => void = () => {};
    public onGraffitiSyncRequested: (requesterId: string) => void = () => {};
    public onWebRTCSignal: (fromUserId: string, payload: any) => void = () => {};
    public onPeerJoined: (peerId: string, isNewArrival: boolean) => void = () => {};
    public onPeerLeft: (peerId: string) => void = () => {};
    public onOnlineCountChanged: (count: number) => void = () => {};
    public onCasinoJackpot: (username: string, game: string, amount: number) => void = () => {};
    public onForestEventReceived: (payload: any) => void = () => {};
    public onMuseumEventReceived: (payload: any) => void = () => {};

    // Economy & P2P Transfer Callbacks
    public onStatsUpdated: (stats: PlayerEconomyStats) => void = () => {};
    public onUwuTransferReceived: (record: UwuTransferRecord) => void = () => {};

    // Casino Callbacks
    public onDiceStateSync: (snapshot: DiceDuelSnapshot) => void = () => {};
    public onDiceSeatsUpdate: (seats: DiceSeat[]) => void = () => {};
    public onDiceRollRound: (round: number, scores: PlayerScore[]) => void = () => {};
    public onDiceTournamentWon: (winner: PlayerScore) => void = () => {};
    public onRouletteSpinResult: (winner: RouletteSector) => void = () => {};

    constructor(localUserId: string, initialPlayer: PlayerAvatarState) {
        this.localUserId = localUserId;
        this.localPlayerState = { zone: 'casino', ...initialPlayer };
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
                const isNewArrival = this.hasInitialPresenceSynced;
                this.hasInitialPresenceSynced = true;

                const presenceState = this.channel.presenceState();
                const activeIds = new Set<string>();
                const newlyJoined: string[] = [];

                for (const key of Object.keys(presenceState)) {
                    const presences = presenceState[key];
                    if (presences && presences.length > 0) {
                        const data = presences[0];
                        if (!data?.id || String(data.id).startsWith('user_') || /^anon\d*$/i.test(data.username || '')) {
                            continue;
                        }
                        activeIds.add(data.id);

                        if (data.id !== this.localUserId) {
                            if (!this.remotePlayers.has(data.id)) {
                                this.remotePlayers.set(data.id, {
                                    id: data.id,
                                    username: data.username || 'player',
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
                                    zone: data.zone || 'casino',
                                    lastNetworkTs: Date.now()
                                });
                                newlyJoined.push(data.id);
                            } else {
                                const existing = this.remotePlayers.get(data.id)!;
                                if (data.zone) existing.zone = data.zone;
                            }
                        }
                    }
                }

                for (const [id] of this.remotePlayers.entries()) {
                    if (!activeIds.has(id)) {
                        this.remotePlayers.delete(id);
                        this.onPeerLeft(id);
                    }
                }

                for (const peerId of newlyJoined) {
                    this.onPeerJoined(peerId, isNewArrival);
                }

                this.onOnlineCountChanged(this.remotePlayers.size + 1);
            })
            .on('broadcast', { event: 'pos' }, ({ payload }: any) => {
                if (!payload || payload.id === this.localUserId) return;
                if (String(payload.id).startsWith('user_') || /^anon\d*$/i.test(payload.username || '')) return;
                const p = this.remotePlayers.get(payload.id);
                if (p) {
                    const zoneChanged = payload.zone && payload.zone !== p.zone;
                    p.targetX = payload.x;
                    p.targetY = payload.y;
                    if (zoneChanged) {
                        p.x = payload.x;
                        p.y = payload.y;
                        p.zone = payload.zone;
                    }
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
                        username: payload.username || 'player',
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
                        zone: payload.zone || 'casino',
                        lastNetworkTs: Date.now()
                    });
                    this.onPeerJoined(payload.id, this.hasInitialPresenceSynced);
                    this.onOnlineCountChanged(this.remotePlayers.size + 1);
                }
            })
            .on('broadcast', { event: 'chat' }, ({ payload }: any) => {
                if (!payload) return;
                const p = this.remotePlayers.get(payload.id);
                const senderName = payload.username || p?.username || 'player';
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
            .on('broadcast', { event: 'graffiti_request' }, ({ payload }: any) => {
                if (!payload || !payload.requesterId || payload.requesterId === this.localUserId) return;
                this.onGraffitiSyncRequested(payload.requesterId);
            })
            .on('broadcast', { event: 'forest_event' }, ({ payload }: any) => {
                if (!payload) return;
                this.onForestEventReceived(payload);
            })
            .on('broadcast', { event: 'museum_event' }, ({ payload }: any) => {
                if (!payload) return;
                this.onMuseumEventReceived(payload);
            })
            .on('broadcast', { event: 'dice_state_sync' }, ({ payload }: any) => {
                if (!payload || !payload.snapshot) return;
                this.onDiceStateSync(payload.snapshot);
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
                if (key && !/^anon\d*$/i.test(key)) {
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
                    zone: this.localPlayerState.zone || 'casino',
                    chips: this.localPlayerState.chips ?? 2500,
                    wins: this.localPlayerState.wins ?? 0,
                    losses: this.localPlayerState.losses ?? 0
                });
                // Request authoritative graffiti wall snapshot from any existing peers in the room
                this.channel.send({
                    type: 'broadcast',
                    event: 'graffiti_request',
                    payload: { requesterId: this.localUserId }
                });
            }
        });

        // Also subscribe to Postgres changes on public.uwu_graffiti_wall so any DB save syncs across tabs
        try {
            this.dbChannel = supabase
                .channel('uwu_graffiti_db_sync')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'uwu_graffiti_wall' },
                    (payload: any) => {
                        const row = payload?.new;
                        if (row?.id === 'museum_exhibits_v1' && row?.pixels) {
                            this.onMuseumEventReceived({ kind: 'db_sync', snapshot: row.pixels });
                            return;
                        }
                        const dataUrl = row?.pixels?.data_url || row?.pixels?.dataUrl;
                        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                            this.onGraffitiSnapshot(dataUrl);
                        }
                    }
                )
                .subscribe();
        } catch {}
    }

    public broadcastPosition(
        x: number,
        y: number,
        dir: IsoDirection,
        isWalking: boolean,
        isDancing: boolean,
        isSpeaking: boolean,
        danceMove: DanceMoveType = 'disco',
        force = false,
        zone: 'casino' | 'forest' | 'museum' = 'casino'
    ) {
        this.localPlayerState.x = x;
        this.localPlayerState.y = y;
        this.localPlayerState.dir = dir;
        this.localPlayerState.isWalking = isWalking;
        this.localPlayerState.isDancing = isDancing;
        this.localPlayerState.danceMove = danceMove;
        this.localPlayerState.isSpeaking = isSpeaking;
        this.localPlayerState.zone = zone;

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
                    zone,
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

    public broadcastForestEvent(payload: any) {
        if (!this.channel || !payload) return;
        this.channel.send({
            type: 'broadcast',
            event: 'forest_event',
            payload
        });
    }

    public broadcastMuseumEvent(payload: any) {
        if (!this.channel || !payload) return;
        this.channel.send({
            type: 'broadcast',
            event: 'museum_event',
            payload
        });
    }

    public broadcastDiceState(snapshot: DiceDuelSnapshot) {
        if (!this.channel || !snapshot) return;
        this.channel.send({
            type: 'broadcast',
            event: 'dice_state_sync',
            payload: { snapshot }
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

    public getRemotePlayers(zoneFilter?: 'casino' | 'forest' | 'museum'): RemotePlayer[] {
        const all = Array.from(this.remotePlayers.values());
        if (!zoneFilter) return all;
        return all.filter((p) => (p.zone || 'casino') === zoneFilter);
    }

    public getZonePlayerCounts(myZone: 'casino' | 'forest' | 'museum'): {
        casino: number;
        forest: number;
        museum: number;
    } {
        let casino = myZone === 'casino' ? 1 : 0;
        let forest = myZone === 'forest' ? 1 : 0;
        let museum = myZone === 'museum' ? 1 : 0;
        this.remotePlayers.forEach((p) => {
            if ((p.zone || 'casino') === 'forest') forest++;
            else if (p.zone === 'museum') museum++;
            else casino++;
        });
        return { casino, forest, museum };
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

    public getRemotePositions(zoneFilter?: 'casino' | 'forest' | 'museum'): Map<string, { x: number; y: number }> {
        const map = new Map<string, { x: number; y: number }>();
        this.remotePlayers.forEach((p, id) => {
            if (!zoneFilter || (p.zone || 'casino') === zoneFilter) {
                map.set(id, { x: p.x, y: p.y });
            }
        });
        return map;
    }

    public destroy() {
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }
        if (this.dbChannel) {
            try {
                supabase.removeChannel(this.dbChannel);
            } catch {}
            this.dbChannel = null;
        }
        this.remotePlayers.clear();
        this.peerEconomyStats.clear();
    }
}
