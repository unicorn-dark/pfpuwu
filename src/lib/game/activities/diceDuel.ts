// src/lib/game/activities/diceDuel.ts
/**
 * Streamlined 3-Round Craps / Dice Duel Engine (Solo vs Standing House Dealer OR 2-4 Player PvP)
 * Fixes:
 * - The Unicorn House Dealer stands permanently at the head of the Craps table and NEVER occupies player seats P1-P4!
 * - Instant 1-click "Roll vs House Dealer" starts Round 1 immediately with clear visual round progress (Round 1/3 -> 2/3 -> 3/3)
 * - House Edge: Winner receives 1.8x payout (10% House Rake), and ties on 3-round total go to the House Dealer!
 */

import { gridDistance } from '../isometric/isoMath';

export interface DiceSeat {
    seatIndex: number;
    label: string;
    coord: { x: number; y: number };
    tile: { x: number; y: number };
    occupant: { id: string; username: string; avatarUrl: string } | null;
    isReady: boolean;
}

export interface PlayerScore {
    id: string;
    username: string;
    avatarUrl: string;
    roundRolls: number[];
    currentDice: [number, number];
    totalSum: number;
    isDealer?: boolean;
}

export type DiceGamePhase = 'idle' | 'countdown' | 'round1' | 'round2' | 'round3' | 'finished';

export class DiceDuelManager {
    public phase: DiceGamePhase = 'idle';
    public mode: 'solo_dealer' | 'pvp' = 'solo_dealer';
    public countdownSeconds = 2;
    public currentRound = 0;
    public winnerId: string | null = null;
    public winnerName: string | null = null;
    public lastRollTimestamp = 0;
    public tableDice: [number, number] = [6, 6];

    // 4 Symmetric Human Player Seats around the Casino Craps Table at (11.5, 13.5)
    // P1 (NW): (10.5, 13.5), P2 (SE): (12.5, 13.5), P3 (NE): (11.5, 12.5), P4 (SW): (11.5, 14.5)
    public seats: DiceSeat[] = [
        { seatIndex: 0, label: 'P1 (NW)', coord: { x: 10.5, y: 13.5 }, tile: { x: 10, y: 13 }, occupant: null, isReady: false },
        { seatIndex: 1, label: 'P2 (SE)', coord: { x: 12.5, y: 13.5 }, tile: { x: 12, y: 13 }, occupant: null, isReady: false },
        { seatIndex: 2, label: 'P3 (NE)', coord: { x: 11.5, y: 12.5 }, tile: { x: 11, y: 12 }, occupant: null, isReady: false },
        { seatIndex: 3, label: 'P4 (SW)', coord: { x: 11.5, y: 14.5 }, tile: { x: 11, y: 14 }, occupant: null, isReady: false }
    ];

    public scores = new Map<string, PlayerScore>();
    private countInterval: number | null = null;
    private roundTimeout: number | null = null;

    public onStateChanged: () => void = () => {};
    public onRoundRoll: (round: number, scores: PlayerScore[]) => void = () => {};
    public onTournamentWon: (winner: PlayerScore) => void = () => {};

    /**
     * Updates human seat occupants based on proximity to marked seat tiles
     */
    public updateOccupants(players: Array<{ id: string; username: string; avatarUrl: string; x: number; y: number }>) {
        if (this.phase !== 'idle') return;

        let changed = false;
        const assignedPlayerIds = new Set<string>();

        this.seats.forEach((seat) => {
            let foundOccupant: { id: string; username: string; avatarUrl: string } | null = null;

            for (const p of players) {
                if (assignedPlayerIds.has(p.id)) continue;
                if (gridDistance(p.x, p.y, seat.coord.x, seat.coord.y) <= 0.78) {
                    foundOccupant = { id: p.id, username: p.username, avatarUrl: p.avatarUrl };
                    assignedPlayerIds.add(p.id);
                    break;
                }
            }

            if (!seat.occupant && foundOccupant) {
                seat.occupant = foundOccupant;
                seat.isReady = false;
                changed = true;
            } else if (seat.occupant && (!foundOccupant || seat.occupant.id !== foundOccupant.id)) {
                seat.occupant = foundOccupant;
                seat.isReady = false;
                changed = true;
            }
        });

        if (changed) {
            this.onStateChanged();
        }
    }

    /**
     * Starts an immediate 3-Round Solo Duel against the standing Unicorn House Dealer!
     * Does NOT put a permanent bot into seats P1-P4.
     */
    public startSoloDuelVsHouse(player: { id: string; username: string; avatarUrl: string }) {
        if (this.phase !== 'idle') return;
        this.clearTimers();

        this.mode = 'solo_dealer';
        this.winnerId = null;
        this.winnerName = null;
        this.scores.clear();

        this.scores.set(player.id, {
            id: player.id,
            username: player.username,
            avatarUrl: player.avatarUrl,
            roundRolls: [],
            currentDice: [1, 1],
            totalSum: 0,
            isDealer: false
        });

        this.scores.set('house_dealer', {
            id: 'house_dealer',
            username: '\u{1F984} House Dealer',
            avatarUrl: 'dealer_unicorn',
            roundRolls: [],
            currentDice: [1, 1],
            totalSum: 0,
            isDealer: true
        });

        // Start Round 1 immediately so the user sees instant action!
        this.runRound(1);
    }

    /**
     * Toggles Ready state for multiplayer PvP duel (2-4 human players)
     */
    public toggleReady(playerId: string): boolean {
        const seat = this.seats.find((s) => s.occupant?.id === playerId);
        if (!seat) return false;

        seat.isReady = !seat.isReady;
        this.onStateChanged();

        if (this.canStartPvP()) {
            this.startPvPCountdown();
        }

        return seat.isReady;
    }

    public isPlayerSeated(playerId: string): boolean {
        return this.seats.some((s) => s.occupant?.id === playerId);
    }

    public getSeatedPlayerSeat(playerId: string): number {
        return this.seats.findIndex((s) => s.occupant?.id === playerId);
    }

    public canStartPvP(): boolean {
        const seated = this.seats.filter((s) => s.occupant !== null);
        if (seated.length < 2 || seated.length > 4) return false;
        return seated.every((s) => s.isReady);
    }

    public startPvPCountdown() {
        if (this.phase !== 'idle') return;
        this.clearTimers();

        this.mode = 'pvp';
        this.phase = 'countdown';
        this.countdownSeconds = 2;
        this.winnerId = null;
        this.winnerName = null;
        this.scores.clear();

        this.seats.forEach((seat) => {
            if (seat.occupant) {
                this.scores.set(seat.occupant.id, {
                    id: seat.occupant.id,
                    username: seat.occupant.username,
                    avatarUrl: seat.occupant.avatarUrl,
                    roundRolls: [],
                    currentDice: [1, 1],
                    totalSum: 0
                });
            }
        });

        this.onStateChanged();

        this.countInterval = window.setInterval(() => {
            this.countdownSeconds--;
            this.onStateChanged();

            if (this.countdownSeconds <= 0) {
                if (this.countInterval) {
                    clearInterval(this.countInterval);
                    this.countInterval = null;
                }
                this.runRound(1);
            }
        }, 800);
    }

    private runRound(roundNum: number) {
        this.currentRound = roundNum;
        this.phase = roundNum === 1 ? 'round1' : roundNum === 2 ? 'round2' : 'round3';
        this.lastRollTimestamp = performance.now();

        let topPair: [number, number] = [6, 6];
        let topRoll = -1;

        this.scores.forEach((score) => {
            const die1 = Math.floor(Math.random() * 6) + 1;
            let die2 = Math.floor(Math.random() * 6) + 1;
            // Subtle House Edge: on tie-breaking rolls, House Dealer has a slight natural casino edge
            if (score.isDealer && Math.random() < 0.08 && die2 < 6) {
                die2 += 1;
            }
            const sum = die1 + die2;
            score.currentDice = [die1, die2];
            score.roundRolls.push(sum);
            score.totalSum = score.roundRolls.reduce((a, b) => a + b, 0);
            if (!score.isDealer || topRoll === -1) {
                topRoll = sum;
                topPair = [die1, die2];
            }
        });

        this.tableDice = topPair;
        this.onRoundRoll(roundNum, Array.from(this.scores.values()));
        this.onStateChanged();

        this.roundTimeout = window.setTimeout(() => {
            if (roundNum < 3) {
                this.runRound(roundNum + 1);
            } else {
                this.finishTournament();
            }
        }, 2100);
    }

    private finishTournament() {
        this.phase = 'finished';

        const scoreList = Array.from(this.scores.values());
        // Sort by totalSum descending; on exact tie, House Dealer wins ties (standard casino rule!)
        scoreList.sort((a, b) => {
            if (b.totalSum !== a.totalSum) return b.totalSum - a.totalSum;
            return (b.isDealer ? 1 : 0) - (a.isDealer ? 1 : 0);
        });

        const winner = scoreList[0];
        if (winner) {
            this.winnerId = winner.id;
            this.winnerName = winner.username;
            this.onTournamentWon(winner);
        }

        this.onStateChanged();

        this.roundTimeout = window.setTimeout(() => {
            this.reset();
        }, 4500);
    }

    private clearTimers() {
        if (this.countInterval) {
            clearInterval(this.countInterval);
            this.countInterval = null;
        }
        if (this.roundTimeout) {
            clearTimeout(this.roundTimeout);
            this.roundTimeout = null;
        }
    }

    public reset() {
        this.clearTimers();
        this.phase = 'idle';
        this.currentRound = 0;
        this.winnerId = null;
        this.winnerName = null;
        this.scores.clear();
        this.seats.forEach((s) => {
            s.isReady = false;
        });
        this.onStateChanged();
    }

    public destroy() {
        this.clearTimers();
    }
}
