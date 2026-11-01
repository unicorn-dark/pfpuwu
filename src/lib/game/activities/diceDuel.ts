// src/lib/game/activities/diceDuel.ts
/**
 * Turn-Based 3-Round Craps / Dice Duel Engine (2-4 Player Multiplayer Party PvP & Solo vs House Dealer)
 *
 * Flow:
 * 1. Lobby / Ready Phase:
 *    - 2 to 4 players sit at the Craps table and click "Ready to Duel" (or 1 player starts a Solo Duel vs House Dealer).
 * 2. Turn-by-Turn Manual Rolling (Rounds 1, 2, 3):
 *    - In each of the 3 rounds, parties roll ONE AFTER ANOTHER manually:
 *      Party 1 clicks "Roll Dice" -> dice shake & land -> Party 2's turn unlocks -> Party 3's turn (if 3+ players) -> Party 4's turn (if 4 players).
 *    - After all parties finish Round 1, Round 2 begins with Party 1, then Round 3.
 * 3. Winner Declaration:
 *    - After the final party rolls in Round 3, the highest 3-round total sum wins the pot!
 */

import { gridDistance } from '../isometric/isoMath';

export interface DiceSeat {
    seatIndex: number;
    label: string;
    coord: { x: number; y: number };
    tile: { x: number; y: number };
    occupant: { id: string; username: string; avatarUrl: string } | null;
    isReady: boolean;
    wager?: number;
}

export interface PlayerScore {
    id: string;
    username: string;
    avatarUrl: string;
    roundRolls: number[];
    roundDicePairs?: Array<[number, number]>;
    currentDice: [number, number];
    totalSum: number;
    isDealer?: boolean;
}

export type DiceGamePhase = 'idle' | 'countdown' | 'round1' | 'round2' | 'round3' | 'finished';

export interface DiceDuelSnapshot {
    matchId: string;
    phase: DiceGamePhase;
    mode: 'solo_dealer' | 'pvp';
    wager: number;
    potAmount: number;
    currentRound: number;
    currentTurnIndex: number;
    activeRollerId: string | null;
    lastRollerId: string | null;
    lastRollSummary: string;
    rollSequence: number;
    tableDice: [number, number];
    winnerId: string | null;
    winnerName: string | null;
    winnerIds: string[];
    seats: DiceSeat[];
    participants: PlayerScore[];
    turnStartedAt: number;
}

export class DiceDuelManager {
    public matchId = '';
    public phase: DiceGamePhase = 'idle';
    public mode: 'solo_dealer' | 'pvp' = 'solo_dealer';
    public wager = 50;
    public potAmount = 0;
    public countdownSeconds = 0;
    public currentRound = 0;
    public currentTurnIndex = 0;
    public activeRollerId: string | null = null;
    public lastRollerId: string | null = null;
    public lastRollSummary = 'Sit at a seat with friends for PvP, or start a 3-round duel vs the House Dealer!';
    public rollSequence = 0;
    public turnStartedAt = 0;

    public winnerId: string | null = null;
    public winnerName: string | null = null;
    public winnerIds: string[] = [];
    public lastRollTimestamp = 0;
    public tableDice: [number, number] = [6, 6];

    // 4 Symmetric Human Player Seats around the Casino Craps Table at (11.5, 13.5)
    public seats: DiceSeat[] = [
        { seatIndex: 0, label: 'Party 1 (NW)', coord: { x: 10.5, y: 13.5 }, tile: { x: 10, y: 13 }, occupant: null, isReady: false, wager: 50 },
        { seatIndex: 1, label: 'Party 2 (SE)', coord: { x: 12.5, y: 13.5 }, tile: { x: 12, y: 13 }, occupant: null, isReady: false, wager: 50 },
        { seatIndex: 2, label: 'Party 3 (NE)', coord: { x: 11.5, y: 12.5 }, tile: { x: 11, y: 12 }, occupant: null, isReady: false, wager: 50 },
        { seatIndex: 3, label: 'Party 4 (SW)', coord: { x: 11.5, y: 14.5 }, tile: { x: 11, y: 14 }, occupant: null, isReady: false, wager: 50 }
    ];

    public scores = new Map<string, PlayerScore>();
    private dealerTurnTimer: number | null = null;

    public onStateChanged: () => void = () => {};
    public onRoundRoll: (round: number, scores: PlayerScore[]) => void = () => {};
    public onTournamentWon: (winner: PlayerScore) => void = () => {};

    /**
     * Gentle proximity seating for the local player:
     * - Never kicks out remote players or Ready players due to network interpolation jitter!
     * - Automatically seats a player who walks directly onto an empty seat tile while idle.
     * - Only frees a non-ready local seat if the player walks > 4.2 tiles away from the Craps table.
     */
    public updateOccupants(
        players: Array<{ id: string; username: string; avatarUrl: string; x: number; y: number }>,
        localPlayerId?: string
    ) {
        if (this.phase !== 'idle' && this.phase !== 'finished') return;

        let changed = false;
        const playerMap = new Map(players.map((p) => [p.id, p]));

        // 1. Only clear a seat if the occupant completely left the room or (if local & not ready) walked far away
        for (const seat of this.seats) {
            if (!seat.occupant) continue;
            const livePlayer = playerMap.get(seat.occupant.id);
            if (!livePlayer) {
                seat.occupant = null;
                seat.isReady = false;
                changed = true;
            } else if (
                localPlayerId &&
                seat.occupant.id === localPlayerId &&
                !seat.isReady &&
                gridDistance(livePlayer.x, livePlayer.y, 11.5, 13.5) > 4.2
            ) {
                seat.occupant = null;
                seat.isReady = false;
                changed = true;
            }
        }

        // 2. If a player walks directly onto an unoccupied seat tile (and isn't already seated), seat them
        const alreadySeatedIds = new Set(
            this.seats.map((s) => s.occupant?.id).filter((id): id is string => Boolean(id))
        );

        for (const seat of this.seats) {
            if (seat.occupant) continue;
            for (const p of players) {
                if (alreadySeatedIds.has(p.id)) continue;
                if (gridDistance(p.x, p.y, seat.coord.x, seat.coord.y) <= 0.72) {
                    seat.occupant = { id: p.id, username: p.username, avatarUrl: p.avatarUrl };
                    seat.isReady = false;
                    alreadySeatedIds.add(p.id);
                    changed = true;
                    break;
                }
            }
        }

        if (changed) {
            this.onStateChanged();
        }
    }

    /**
     * Explicitly seats a player at a specific seat index (or moves them from their current seat).
     */
    public assignPlayerToSeat(
        player: { id: string; username: string; avatarUrl: string },
        seatIndex: number,
        wager = 50
    ): boolean {
        if (this.phase !== 'idle' && this.phase !== 'finished') return false;
        const targetSeat = this.seats[seatIndex];
        if (!targetSeat) return false;
        if (targetSeat.occupant && targetSeat.occupant.id !== player.id) return false;

        // Remove from any previous seat
        for (const s of this.seats) {
            if (s.occupant?.id === player.id && s.seatIndex !== seatIndex) {
                s.occupant = null;
                s.isReady = false;
            }
        }

        targetSeat.occupant = {
            id: player.id,
            username: player.username,
            avatarUrl: player.avatarUrl
        };
        targetSeat.wager = wager;
        this.onStateChanged();
        return true;
    }

    /**
     * Leaves the player's current seat when idle/finished.
     */
    public leaveSeat(playerId: string): boolean {
        if (this.phase !== 'idle' && this.phase !== 'finished') return false;
        let changed = false;
        for (const s of this.seats) {
            if (s.occupant?.id === playerId) {
                s.occupant = null;
                s.isReady = false;
                changed = true;
            }
        }
        if (changed) this.onStateChanged();
        return changed;
    }

    /**
     * Starts a 3-Round Turn-Based Solo Duel against the standing Unicorn House Dealer.
     * Round 1 begins on the human player's turn — they must click "Roll Dice" each round!
     */
    public startSoloDuelVsHouse(
        player: { id: string; username: string; avatarUrl: string },
        wager = 50
    ) {
        if (this.phase !== 'idle' && this.phase !== 'finished') return;
        this.clearTimers();

        this.matchId = `solo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.mode = 'solo_dealer';
        this.wager = wager;
        this.potAmount = Math.round(wager * 1.8);
        this.winnerId = null;
        this.winnerName = null;
        this.winnerIds = [];
        this.scores.clear();

        this.scores.set(player.id, {
            id: player.id,
            username: player.username,
            avatarUrl: player.avatarUrl,
            roundRolls: [],
            roundDicePairs: [],
            currentDice: [6, 6],
            totalSum: 0,
            isDealer: false
        });

        this.scores.set('house_dealer', {
            id: 'house_dealer',
            username: '🦄 House Dealer',
            avatarUrl: 'dealer_unicorn',
            roundRolls: [],
            roundDicePairs: [],
            currentDice: [6, 6],
            totalSum: 0,
            isDealer: true
        });

        this.currentRound = 1;
        this.phase = 'round1';
        this.currentTurnIndex = 0;
        this.activeRollerId = player.id;
        this.lastRollerId = null;
        this.turnStartedAt = Date.now();
        this.lastRollSummary = `🎲 Round 1 of 3 — Your turn, @${player.username}! Click "Roll Dice" to throw!`;

        this.onStateChanged();
    }

    /**
     * Toggles Ready state for multiplayer PvP duel (2-4 human players).
     * Automatically seats the player if an open seat is available.
     */
    public toggleReady(
        playerId: string,
        playerInfo?: { username: string; avatarUrl: string },
        wager = 50
    ): boolean {
        if (this.phase !== 'idle' && this.phase !== 'finished') return false;

        let seat = this.seats.find((s) => s.occupant?.id === playerId);
        if (!seat && playerInfo) {
            const openSeat = this.seats.find((s) => !s.occupant);
            if (openSeat) {
                openSeat.occupant = {
                    id: playerId,
                    username: playerInfo.username,
                    avatarUrl: playerInfo.avatarUrl
                };
                seat = openSeat;
            }
        }
        if (!seat) return false;

        if (this.phase === 'finished') {
            this.phase = 'idle';
            this.winnerId = null;
            this.winnerName = null;
            this.winnerIds = [];
            this.scores.clear();
        }

        seat.isReady = !seat.isReady;
        seat.wager = wager;
        this.wager = wager;

        const readyCount = this.seats.filter((s) => s.occupant && s.isReady).length;
        const seatedCount = this.seats.filter((s) => s.occupant !== null).length;

        if (seat.isReady) {
            this.lastRollSummary = `✅ @${seat.occupant?.username} is READY (${readyCount}/${Math.max(2, seatedCount)} parties ready)!`;
        } else {
            this.lastRollSummary = `⏳ @${seat.occupant?.username} unchecked Ready (${readyCount}/${Math.max(2, seatedCount)} ready).`;
        }

        this.onStateChanged();

        // Automatically launch the PvP duel when all seated players (at least 2) are Ready!
        if (this.canAutoStartPvP()) {
            this.startPvPDuel(wager);
        }

        return seat.isReady;
    }

    public isPlayerSeated(playerId: string): boolean {
        return this.seats.some((s) => s.occupant?.id === playerId);
    }

    public getSeatedPlayerSeat(playerId: string): number {
        return this.seats.findIndex((s) => s.occupant?.id === playerId);
    }

    public getReadySeats(): DiceSeat[] {
        return this.seats.filter((s) => s.occupant !== null && s.isReady);
    }

    public canAutoStartPvP(): boolean {
        const seated = this.seats.filter((s) => s.occupant !== null);
        if (seated.length < 2 || seated.length > 4) return false;
        return seated.every((s) => s.isReady);
    }

    public canManualStartPvP(): boolean {
        return this.getReadySeats().length >= 2;
    }

    /**
     * Starts a 2-to-4 player turn-based PvP Duel with all Ready seated parties!
     */
    public startPvPDuel(wager = this.wager): boolean {
        if (this.phase !== 'idle' && this.phase !== 'finished') return false;
        const readySeats = this.getReadySeats();
        if (readySeats.length < 2) return false;

        this.clearTimers();
        this.matchId = `pvp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        this.mode = 'pvp';
        this.wager = wager;
        // 10% casino table rake on multiplayer pot (e.g. 2 players -> 1.8x, 3 players -> 2.7x, 4 players -> 3.6x)
        this.potAmount = Math.round(wager * readySeats.length * 0.9);
        this.winnerId = null;
        this.winnerName = null;
        this.winnerIds = [];
        this.scores.clear();

        for (const seat of readySeats) {
            if (seat.occupant) {
                this.scores.set(seat.occupant.id, {
                    id: seat.occupant.id,
                    username: seat.occupant.username,
                    avatarUrl: seat.occupant.avatarUrl,
                    roundRolls: [],
                    roundDicePairs: [],
                    currentDice: [6, 6],
                    totalSum: 0,
                    isDealer: false
                });
            }
        }

        const participants = Array.from(this.scores.values());
        this.currentRound = 1;
        this.phase = 'round1';
        this.currentTurnIndex = 0;
        this.activeRollerId = participants[0]?.id || null;
        this.lastRollerId = null;
        this.turnStartedAt = Date.now();
        this.lastRollSummary = `🔥 ${participants.length}-Party Duel Started! Round 1/3 — @${participants[0]?.username}'s turn to roll!`;

        this.onStateChanged();
        return true;
    }

    /**
     * Executes a single manual dice roll for the current party's turn!
     * Returns true if the roll was accepted.
     */
    public rollForCurrentTurn(rollerId: string, allowForceAfk = false): boolean {
        if (this.phase !== 'round1' && this.phase !== 'round2' && this.phase !== 'round3') {
            return false;
        }

        const participants = Array.from(this.scores.values());
        if (participants.length === 0) return false;

        const currentParty = participants[this.currentTurnIndex] || participants[0];
        if (!currentParty) return false;

        if (currentParty.id !== rollerId && !allowForceAfk) {
            return false;
        }

        const die1 = Math.floor(Math.random() * 6) + 1;
        let die2 = Math.floor(Math.random() * 6) + 1;
        // Subtle House Edge only in solo mode vs House Dealer
        if (currentParty.isDealer && Math.random() < 0.08 && die2 < 6) {
            die2 += 1;
        }
        const sum = die1 + die2;

        currentParty.currentDice = [die1, die2];
        currentParty.roundRolls = [...currentParty.roundRolls, sum];
        currentParty.roundDicePairs = [...(currentParty.roundDicePairs || []), [die1, die2]];
        currentParty.totalSum = currentParty.roundRolls.reduce((a, b) => a + b, 0);

        this.tableDice = [die1, die2];
        this.lastRollerId = currentParty.id;
        this.lastRollTimestamp = performance.now();
        this.rollSequence++;

        const rolledRound = this.currentRound;
        const nextTurnIdx = this.currentTurnIndex + 1;

        if (nextTurnIdx < participants.length) {
            // Next party's turn in the SAME round!
            this.currentTurnIndex = nextTurnIdx;
            const nextParty = participants[nextTurnIdx];
            this.activeRollerId = nextParty.id;
            this.turnStartedAt = Date.now();
            this.lastRollSummary = `🎲 @${currentParty.username} rolled ${die1} + ${die2} = ${sum} (R${rolledRound})! Now it's @${nextParty.username}'s turn!`;

            this.onRoundRoll(rolledRound, Array.from(this.scores.values()));
            this.onStateChanged();

            // If the next party is the AI House Dealer in solo mode, schedule their roll after a suspenseful pause!
            if (nextParty.isDealer) {
                this.clearTimers();
                this.dealerTurnTimer = window.setTimeout(() => {
                    this.rollForCurrentTurn('house_dealer', true);
                }, 1150);
            }
            return true;
        }

        // All parties have rolled in this round!
        if (this.currentRound < 3) {
            this.currentRound += 1;
            this.phase = this.currentRound === 2 ? 'round2' : 'round3';
            this.currentTurnIndex = 0;
            const firstParty = participants[0];
            this.activeRollerId = firstParty.id;
            this.turnStartedAt = Date.now();
            this.lastRollSummary = `🎲 @${currentParty.username} rolled ${die1} + ${die2} = ${sum}! Round ${this.currentRound}/3 begins — @${firstParty.username}'s turn!`;

            this.onRoundRoll(rolledRound, Array.from(this.scores.values()));
            this.onStateChanged();
            return true;
        }

        // Final party just rolled in Round 3 -> Finish the tournament!
        this.onRoundRoll(rolledRound, Array.from(this.scores.values()));
        this.finishTournament(`${currentParty.username} rolled ${die1} + ${die2} = ${sum}`);
        return true;
    }

    private finishTournament(lastRollText = '') {
        this.clearTimers();
        this.phase = 'finished';
        this.activeRollerId = null;

        const scoreList = Array.from(this.scores.values());
        // Sort by totalSum descending; in Solo mode, House Dealer wins exact ties
        scoreList.sort((a, b) => {
            if (b.totalSum !== a.totalSum) return b.totalSum - a.totalSum;
            return (b.isDealer ? 1 : 0) - (a.isDealer ? 1 : 0);
        });

        const winner = scoreList[0];
        if (winner) {
            const topSum = winner.totalSum;
            const tiedTop =
                this.mode === 'pvp'
                    ? scoreList.filter((s) => s.totalSum === topSum)
                    : [winner];

            this.winnerId = winner.id;
            this.winnerIds = tiedTop.map((s) => s.id);
            this.winnerName =
                tiedTop.length > 1
                    ? tiedTop.map((s) => `@${s.username}`).join(' & ')
                    : winner.username;

            const prefix = lastRollText ? `🎲 ${lastRollText}! ` : '';
            if (tiedTop.length > 1) {
                this.lastRollSummary = `${prefix}🤝 TIE AT ${topSum} PTS! ${this.winnerName} split the ${this.potAmount} $UWU pot!`;
            } else {
                this.lastRollSummary = `${prefix}👑 ${winner.username} WINS with ${winner.totalSum} pts (+${this.potAmount} $UWU)!`;
            }

            // Reset seat ready flags so players can Ready Up again for a rematch
            this.seats.forEach((s) => {
                s.isReady = false;
            });

            this.onStateChanged();
            this.onTournamentWon(winner);
        } else {
            this.onStateChanged();
        }
    }

    /**
     * Serializes full authoritative state for real-time multiplayer sync.
     */
    public getSnapshot(): DiceDuelSnapshot {
        return {
            matchId: this.matchId,
            phase: this.phase,
            mode: this.mode,
            wager: this.wager,
            potAmount: this.potAmount,
            currentRound: this.currentRound,
            currentTurnIndex: this.currentTurnIndex,
            activeRollerId: this.activeRollerId,
            lastRollerId: this.lastRollerId,
            lastRollSummary: this.lastRollSummary,
            rollSequence: this.rollSequence,
            tableDice: [...this.tableDice] as [number, number],
            winnerId: this.winnerId,
            winnerName: this.winnerName,
            winnerIds: [...this.winnerIds],
            seats: this.seats.map((s) => ({
                ...s,
                occupant: s.occupant ? { ...s.occupant } : null
            })),
            participants: Array.from(this.scores.values()).map((p) => ({
                ...p,
                roundRolls: [...p.roundRolls],
                roundDicePairs: (p.roundDicePairs || []).map((pair) => [...pair] as [number, number]),
                currentDice: [...p.currentDice] as [number, number]
            })),
            turnStartedAt: this.turnStartedAt
        };
    }

    /**
     * Applies an authoritative multiplayer snapshot received from a peer.
     * Returns { isNewRoll, justFinished, winner } so the UI can play sounds/animations/payouts.
     */
    public applySnapshot(snap: DiceDuelSnapshot): {
        isNewRoll: boolean;
        justFinished: boolean;
        winner: PlayerScore | null;
    } {
        if (!snap) return { isNewRoll: false, justFinished: false, winner: null };

        // Do not let a solo_dealer game on another player's screen overwrite an active PvP game we are in
        if (
            snap.mode === 'solo_dealer' &&
            this.mode === 'pvp' &&
            this.phase !== 'idle' &&
            this.phase !== 'finished'
        ) {
            return { isNewRoll: false, justFinished: false, winner: null };
        }

        const prevRollSeq = this.rollSequence;
        const prevPhase = this.phase;
        const prevMatchId = this.matchId;

        this.matchId = snap.matchId || '';
        this.phase = snap.phase;
        this.mode = snap.mode;
        this.wager = snap.wager ?? 50;
        this.potAmount = snap.potAmount ?? Math.round(this.wager * 1.8);
        this.currentRound = snap.currentRound ?? 0;
        this.currentTurnIndex = snap.currentTurnIndex ?? 0;
        this.activeRollerId = snap.activeRollerId ?? null;
        this.lastRollerId = snap.lastRollerId ?? null;
        this.lastRollSummary = snap.lastRollSummary || '';
        this.rollSequence = snap.rollSequence ?? 0;
        this.tableDice = snap.tableDice ? ([...snap.tableDice] as [number, number]) : [6, 6];
        this.winnerId = snap.winnerId ?? null;
        this.winnerName = snap.winnerName ?? null;
        this.winnerIds = Array.isArray(snap.winnerIds) ? [...snap.winnerIds] : [];
        this.turnStartedAt = snap.turnStartedAt || Date.now();

        if (Array.isArray(snap.seats) && snap.seats.length === 4) {
            this.seats = snap.seats.map((s) => ({
                ...s,
                occupant: s.occupant ? { ...s.occupant } : null
            }));
        }

        this.scores.clear();
        if (Array.isArray(snap.participants)) {
            for (const p of snap.participants) {
                this.scores.set(p.id, {
                    ...p,
                    roundRolls: Array.isArray(p.roundRolls) ? [...p.roundRolls] : [],
                    roundDicePairs: Array.isArray(p.roundDicePairs)
                        ? p.roundDicePairs.map((pair) => [...pair] as [number, number])
                        : [],
                    currentDice: Array.isArray(p.currentDice)
                        ? ([p.currentDice[0], p.currentDice[1]] as [number, number])
                        : [6, 6]
                });
            }
        }

        const isNewRoll = snap.rollSequence > prevRollSeq || (snap.matchId !== prevMatchId && snap.rollSequence > 0);
        if (isNewRoll) {
            this.lastRollTimestamp = performance.now();
        }

        const justFinished =
            snap.phase === 'finished' && (prevPhase !== 'finished' || snap.matchId !== prevMatchId);

        const winner =
            snap.winnerId && this.scores.has(snap.winnerId)
                ? this.scores.get(snap.winnerId) || null
                : null;

        this.onStateChanged();
        return { isNewRoll, justFinished, winner };
    }

    private clearTimers() {
        if (this.dealerTurnTimer) {
            clearTimeout(this.dealerTurnTimer);
            this.dealerTurnTimer = null;
        }
    }

    public reset() {
        this.clearTimers();
        this.phase = 'idle';
        this.currentRound = 0;
        this.currentTurnIndex = 0;
        this.activeRollerId = null;
        this.lastRollerId = null;
        this.winnerId = null;
        this.winnerName = null;
        this.winnerIds = [];
        this.scores.clear();
        this.seats.forEach((s) => {
            s.isReady = false;
        });
        this.lastRollSummary = 'Sit at a seat with friends for PvP, or start a 3-round duel vs the House Dealer!';
        this.onStateChanged();
    }

    public destroy() {
        this.clearTimers();
    }
}
