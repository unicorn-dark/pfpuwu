// src/lib/game/activities/rouletteGame.ts
/**
 * High Roller Meme Roulette Wheel Simulator with True Casino House Edge (~10% - 25% House Edge)
 * Fixes:
 * - Weighted 100-slot probability distribution + "💀 House Rug (0x)" pocket so EV < 1.0 on every bet
 * - Cumulative targetAngle calculation from currentAngle so the wheel ALWAYS spins 6-8 full turns
 * - Cryptographically unbiased random slot draw (window.crypto.getRandomValues fallback to Math.random)
 */

export interface RouletteSector {
    id: string;
    name: string;
    icon: string;
    multiplier: number;
    weight: number; // Out of 100 total wheel pockets
    color: string;
    bettable: boolean;
    tile: { x: number; y: number };
}

/**
 * 100-Pocket Weighted Roulette Wheel:
 * - 💀 House Zero / Rug (0x): 12% chance -> House sweeps all bets
 * - 🐸 Pepe (3x): 30% chance -> EV = 0.90 (10% House Edge)
 * - 🐕 Doge (4x): 22% chance -> EV = 0.88 (12% House Edge)
 * - 🚀 Moon (6x): 15% chance -> EV = 0.90 (10% House Edge)
 * - 💎 Diamond (8x): 11% chance -> EV = 0.88 (12% House Edge)
 * - 🗿 Gigachad (12x): 7% chance -> EV = 0.84 (16% House Edge)
 * - 🦄 Golden UwU (25x): 3% chance -> EV = 0.75 (25% House Edge)
 * Total weights = 12 + 30 + 22 + 15 + 11 + 7 + 3 = 100%
 */
export const ROULETTE_SECTORS: RouletteSector[] = [
    { id: 'rug', name: 'House Zero (Rug)', icon: '\u{1F480}', multiplier: 0, weight: 12, color: '#1f2937', bettable: false, tile: { x: -1, y: -1 } },
    { id: 'pepe', name: 'Pepe The Frog', icon: '\u{1F438}', multiplier: 3, weight: 30, color: '#00cc66', bettable: true, tile: { x: 18, y: 14 } },
    { id: 'doge', name: 'Doge Coin', icon: '\u{1F415}', multiplier: 4, weight: 22, color: '#e6b800', bettable: true, tile: { x: 19, y: 14 } },
    { id: 'moon', name: 'To The Moon', icon: '\u{1F680}', multiplier: 6, weight: 15, color: '#ff3333', bettable: true, tile: { x: 20, y: 14 } },
    { id: 'diamond', name: 'Diamond Hands', icon: '\u{1F48E}', multiplier: 8, weight: 11, color: '#3399ff', bettable: true, tile: { x: 18, y: 15 } },
    { id: 'chad', name: 'Gigachad', icon: '\u{1F5FF}', multiplier: 12, weight: 7, color: '#9933ff', bettable: true, tile: { x: 19, y: 15 } },
    { id: 'uwu', name: 'Golden UwU Jackpot', icon: '\u{1F984}', multiplier: 25, weight: 3, color: '#ff00aa', bettable: true, tile: { x: 20, y: 15 } }
];

export const BETTABLE_ROULETTE_SECTORS = ROULETTE_SECTORS.filter((s) => s.bettable);

function drawWeightedSectorIndex(): number {
    let rand = Math.random() * 100;
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        rand = (arr[0] / 4294967296) * 100;
    }
    let cumulative = 0;
    for (let i = 0; i < ROULETTE_SECTORS.length; i++) {
        cumulative += ROULETTE_SECTORS[i].weight;
        if (rand < cumulative) {
            return i;
        }
    }
    return 1;
}

export class RouletteGameManager {
    public isSpinning = false;
    public currentAngle = 0;
    public winningSector: RouletteSector | null = null;
    public history: RouletteSector[] = [];
    public countdownSeconds = 30;
    private timerId: number | null = null;

    public onStateChanged: () => void = () => {};
    public onSpinStarted: () => void = () => {};
    public onSpinFinished: (winner: RouletteSector) => void = () => {};

    constructor() {
        this.startTimer();
    }

    private startTimer() {
        if (typeof window === 'undefined') return;
        this.timerId = window.setInterval(() => {
            if (!this.isSpinning) {
                this.countdownSeconds--;
                this.onStateChanged();
                if (this.countdownSeconds <= 0) {
                    this.spin();
                }
            }
        }, 1000);
    }

    public spin(forcedSectorIndex?: number) {
        if (this.isSpinning) return;

        this.isSpinning = true;
        this.countdownSeconds = 30;
        this.winningSector = null;
        this.onSpinStarted();
        this.onStateChanged();

        const targetIndex =
            forcedSectorIndex !== undefined && forcedSectorIndex >= 0 && forcedSectorIndex < ROULETTE_SECTORS.length
                ? forcedSectorIndex
                : drawWeightedSectorIndex();

        const sectorCount = ROULETTE_SECTORS.length;
        const sectorAngle = (Math.PI * 2) / sectorCount;

        // Pointer is at top (-PI/2); align slice center with pointer after 6-8 full rotations from currentAngle
        const sliceCenterAngle = (targetIndex + 0.5) * sectorAngle;
        const desiredFinalMod = (Math.PI * 1.5 - sliceCenterAngle + Math.PI * 4) % (Math.PI * 2);
        const currentMod = ((this.currentAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        let deltaAngle = desiredFinalMod - currentMod;
        if (deltaAngle <= 0) deltaAngle += Math.PI * 2;

        const extraSpins = (6 + Math.floor(Math.random() * 3)) * Math.PI * 2;
        const initialAngle = this.currentAngle;
        const targetAngle = initialAngle + extraSpins + deltaAngle;

        const startTime = performance.now();
        const duration = 3600;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            // Quartic ease-out for realistic roulette wheel deceleration
            const ease = 1 - Math.pow(1 - progress, 4);
            this.currentAngle = initialAngle + (targetAngle - initialAngle) * ease;
            this.onStateChanged();

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isSpinning = false;
                this.winningSector = ROULETTE_SECTORS[targetIndex];
                this.history = [this.winningSector, ...this.history.slice(0, 7)];
                this.onSpinFinished(this.winningSector);
                this.onStateChanged();
            }
        };

        requestAnimationFrame(animate);
    }

    public destroy() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
}
