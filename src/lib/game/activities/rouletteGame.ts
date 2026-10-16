// src/lib/game/activities/rouletteGame.ts
/**
 * Meme Roulette Wheel Simulator for the High Roller Casino
 * Synchronized wheel spins with 6 meme sectors and history tracking
 */

export interface RouletteSector {
    id: string;
    name: string;
    icon: string;
    multiplier: number;
    color: string;
    tile: { x: number; y: number };
}

export const ROULETTE_SECTORS: RouletteSector[] = [
    { id: 'pepe', name: 'Pepe The Frog', icon: '\u{1F438}', multiplier: 2, color: '#00cc66', tile: { x: 18, y: 15 } },
    { id: 'doge', name: 'Doge Coin', icon: '\u{1F415}', multiplier: 2, color: '#e6b800', tile: { x: 19, y: 15 } },
    { id: 'moon', name: 'To The Moon', icon: '\u{1F680}', multiplier: 3, color: '#ff3333', tile: { x: 20, y: 15 } },
    { id: 'diamond', name: 'Diamond Hands', icon: '\u{1F48E}', multiplier: 3, color: '#3399ff', tile: { x: 18, y: 16 } },
    { id: 'chad', name: 'Gigachad', icon: '\u{1F5FF}', multiplier: 5, color: '#9933ff', tile: { x: 19, y: 16 } },
    { id: 'uwu', name: 'Golden UwU Jackpot', icon: '\u{1F984}', multiplier: 10, color: '#ff00aa', tile: { x: 20, y: 16 } }
];

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
            forcedSectorIndex !== undefined
                ? forcedSectorIndex
                : Math.floor(Math.random() * ROULETTE_SECTORS.length);
        const sectorAngle = (Math.PI * 2) / ROULETTE_SECTORS.length;
        const totalRotations = 6 + Math.random() * 2;
        const targetAngle = totalRotations * Math.PI * 2 + targetIndex * sectorAngle;

        const startTime = performance.now();
        const duration = 3800;
        const initialAngle = this.currentAngle;

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            // Smooth ease-out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            this.currentAngle = initialAngle + (targetAngle - initialAngle) * ease;

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
