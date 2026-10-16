// src/lib/game/activities/diceDuel.ts
/**
 * 2-4 Player Synchronized 3-Round Dice Duel Tournament Engine
 * Seats are aligned flush with the 4 isometric edges of the Craps Table at (12.5, 14.5):
 * - Seat P1 (NW): (11.5, 14.5) [Tile 11, 14]
 * - Seat P2 (SE): (13.5, 14.5) [Tile 13, 14]
 * - Seat P3 (NE): (12.5, 13.5) [Tile 12, 13]
 * - Seat P4 (SW): (12.5, 15.5) [Tile 12, 15]
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
}

export type DiceGamePhase = 'idle' | 'countdown' | 'round1' | 'round2' | 'round3' | 'finished';

export class DiceDuelManager {
    public phase: DiceGamePhase = 'idle';
    public countdownSeconds = 3;
    public currentRound = 0;
    public winnerId: string | null = null;
    public winnerName: string | null = null;
    public lastRollTimestamp = 0;
    public tableDice: [number, number] = [6, 6];

    // 4 Symmetric Player Seats around the Casino Craps Table at (12.5, 14.5)
    public seats: DiceSeat[] = [
        { seatIndex: 0, label: 'P1 (NW)', coord: { x: 11.5, y: 14.5 }, tile: { x: 11, y: 14 }, occupant: null, isReady: false },
        { seatIndex: 1, label: 'P2 (SE)', coord: { x: 13.5, y: 14.5 }, tile: { x: 13, y: 14 }, occupant: null, isReady: false },
        { seatIndex: 2, label: 'P3 (NE)', coord: { x: 12.5, y: 13.5 }, tile: { x: 12, y: 13 }, occupant: null, isReady: false },
        { seatIndex: 3, label: 'P4 (SW)', coord: { x: 12.5, y: 15.5 }, tile: { x: 12, y: 15 }, occupant: null, isReady: false }
    ];

    public scores = new Map<string, PlayerScore>();
    private countInterval: number | null = null;
    private roundTimeout: number | null = null;

    // Callbacks
    public onStateChanged: () => void = () => {};
    public onRoundRoll: (round: number, scores: PlayerScore[]) => void = () => {};
    public onTournamentWon: (winner: PlayerScore) => void = () => {};

    /**
     * Updates seat occupants based on proximity to marked seat tiles
     */
    public updateOccupants(players: Array<{ id: string; username: string; avatarUrl: string; x: number; y: number }>) {
        if (this.phase !== 'idle') return; // Lock roster during active tournament

        let changed = false;
        const assignedPlayerIds = new Set<string>();

        this.seats.forEach((seat) => {
            // Preserve AI bot if present
            if (seat.occupant && seat.occupant.id.startsWith('bot_')) {
                assignedPlayerIds.add(seat.occupant.id);
                return;
            }

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
     * Spawns an AI bot challenger to play solo or fill the table
     */
    public addBotPlayer(autoStartWithPlayerId?: string) {
        let botSeat = this.seats.find((s) => s.occupant?.id === 'bot_dealer');
        if (!botSeat) {
            botSeat = this.seats.find((s) => !s.occupant);
            if (!botSeat) return;
            botSeat.occupant = {
                id: 'bot_dealer',
                username: '\u{1F984} House Dealer',
                avatarUrl: 'dealer_unicorn'
            };
        }
        botSeat.isReady = true;

        if (autoStartWithPlayerId) {
            const pSeat = this.seats.find((s) => s.occupant?.id === autoStartWithPlayerId);
            if (pSeat) {
                pSeat.isReady = true;
            }
        }

        this.onStateChanged();
        if (this.canStart()) {
            this.startCountdown();
        }
    }

    public removeBotPlayer() {
        const botSeat = this.seats.find((s) => s.occupant?.id === 'bot_dealer');
        if (botSeat) {
            botSeat.occupant = null;
            botSeat.isReady = false;
            this.onStateChanged();
        }
    }

    /**
     * Toggles the Ready / Start state for a player in a seat
     */
    public toggleReady(playerId: string): boolean {
        const seat = this.seats.find((s) => s.occupant?.id === playerId);
        if (!seat) return false;

        seat.isReady = !seat.isReady;
        this.onStateChanged();

        if (this.canStart()) {
            this.startCountdown();
        }

        return seat.isReady;
    }

    public isPlayerSeated(playerId: string): boolean {
        return this.seats.some((s) => s.occupant?.id === playerId);
    }

    public getSeatedPlayerSeat(playerId: string): number {
        return this.seats.findIndex((s) => s.occupant?.id === playerId);
    }

    public canStart(): boolean {
        const seated = this.seats.filter((s) => s.occupant !== null);
        if (seated.length < 2 || seated.length > 4) return false;
        return seated.every((s) => s.isReady);
    }

    /**
     * Starts the 3-second tournament countdown
     */
    public startCountdown() {
        if (this.phase !== 'idle') return;
        this.clearTimers();

        this.phase = 'countdown';
        this.countdownSeconds = 3;
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
        }, 850);
    }

    /**
     * Executes a round of simultaneous dice rolling
     */
    private runRound(roundNum: number) {
        this.currentRound = roundNum;
        this.phase = roundNum === 1 ? 'round1' : roundNum === 2 ? 'round2' : 'round3';
        this.lastRollTimestamp = performance.now();

        let topPair: [number, number] = [6, 6];
        let topRoll = -1;

        this.scores.forEach((score) => {
            const die1 = Math.floor(Math.random() * 6) + 1;
            const die2 = Math.floor(Math.random() * 6) + 1;
            const sum = die1 + die2;
            score.currentDice = [die1, die2];
            score.roundRolls.push(sum);
            score.totalSum = score.roundRolls.reduce((a, b) => a + b, 0);
            if (sum > topRoll) {
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
        }, 2800);
    }

    /**
     * Concludes tournament, breaks ties if needed, and crowns winner
     */
    private finishTournament() {
        this.phase = 'finished';

        const scoreList = Array.from(this.scores.values());
        scoreList.sort((a, b) => b.totalSum - a.totalSum);

        // If top 2 players tied, give leader a sudden-death tiebreaker +1 roll
        if (scoreList.length >= 2 && scoreList[0].totalSum === scoreList[1].totalSum) {
            scoreList[0].totalSum += 1;
            scoreList[0].roundRolls[scoreList[0].roundRolls.length - 1] += 1;
        }

        const winner = scoreList[0];
        if (winner) {
            this.winnerId = winner.id;
            this.winnerName = winner.username;
            this.onTournamentWon(winner);
        }

        this.onStateChanged();

        this.roundTimeout = window.setTimeout(() => {
            this.reset();
        }, 8000);
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
            if (s.occupant?.id === 'bot_dealer') {
                s.isReady = true;
            } else {
                s.isReady = false;
            }
        });
        this.onStateChanged();
    }

    public destroy() {
        this.clearTimers();
    }
}
