// src/lib/game/activities/miniGames.ts
/**
 * Collaborative activities, casino sound effects, Vault Heist manager, and Web Audio retro synthesizer for UwU World
 */

import { gridDistance } from '../isometric/isoMath';
export { DiceDuelManager, type DiceSeat, type PlayerScore, type DiceGamePhase } from './diceDuel';
export { RouletteGameManager, ROULETTE_SECTORS, type RouletteSector } from './rouletteGame';

export interface VaultState {
    pads: [boolean, boolean, boolean, boolean];
    padOccupants: [string | null, string | null, string | null, string | null];
    holoDecoysActive: boolean;
    isUnlocked: boolean;
    unlockedAt?: number;
    heroes?: string[];
}

export interface DJTrack {
    id: number;
    title: string;
    bpm: number;
    notes: number[];
}

export const DJ_TRACKS: DJTrack[] = [
    { id: 1, title: '\u{1F3B5} 8-Bit Cyber Funk', bpm: 124, notes: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63] },
    { id: 2, title: '\u{1FA99} Neon Disco Wave', bpm: 128, notes: [220.0, 277.18, 329.63, 440.0, 329.63, 277.18] },
    { id: 3, title: '\u{1F47E} Glitch Hop 98', bpm: 110, notes: [174.61, 220.0, 261.63, 349.23, 261.63, 220.0] },
    { id: 4, title: '\u{26A1} Synthwave Midnight', bpm: 130, notes: [196.0, 246.94, 293.66, 392.0, 293.66, 246.94] }
];

export const RETRO_PALETTE_16 = [
    '#000000', '#808080', '#c0c0c0', '#ffffff',
    '#800000', '#ff0000', '#808000', '#ffff00',
    '#008000', '#00ff00', '#008080', '#00ffff',
    '#000080', '#0000ff', '#800080', '#ff00ff'
];

/**
 * Procedural Web Audio 8-bit Synthesizer & Casino SFX Engine
 */
export class RetroSynthesizer {
    private ctx: AudioContext | null = null;
    private timerId: number | null = null;
    private currentTrackIndex = 0;
    private isMuted = false;
    private step = 0;

    constructor() {}

    private initContext() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    public playTrack(trackId: number) {
        this.initContext();
        this.stop();

        const track = DJ_TRACKS.find((t) => t.id === trackId) || DJ_TRACKS[0];
        this.currentTrackIndex = DJ_TRACKS.indexOf(track);
        this.step = 0;

        const intervalMs = (60 / track.bpm / 2) * 1000;
        this.timerId = window.setInterval(() => {
            this.playNextStep(track);
        }, intervalMs);
    }

    private playNextStep(track: DJTrack) {
        if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;

        const noteFreq = track.notes[this.step % track.notes.length];
        this.step++;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(noteFreq, this.ctx.currentTime);

            gain.gain.setValueAtTime(0.032, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + 0.2);

            if (this.step % 2 === 0) {
                const kick = this.ctx.createOscillator();
                const kickGain = this.ctx.createGain();
                kick.type = 'sine';
                kick.frequency.setValueAtTime(115, this.ctx.currentTime);
                kick.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.12);

                kickGain.gain.setValueAtTime(0.09, this.ctx.currentTime);
                kickGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14);

                kick.connect(kickGain);
                kickGain.connect(this.ctx.destination);

                kick.start();
                kick.stop(this.ctx.currentTime + 0.15);
            }
        } catch {}
    }

    public playDiceRollSfx() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            for (let i = 0; i < 4; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(220 + Math.random() * 320, this.ctx.currentTime + i * 0.04);

                gain.gain.setValueAtTime(0.08, this.ctx.currentTime + i * 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.04 + 0.06);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(this.ctx.currentTime + i * 0.04);
                osc.stop(this.ctx.currentTime + i * 0.04 + 0.07);
            }
        } catch {}
    }

    public playChipSfx() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, this.ctx.currentTime);
            osc.frequency.setValueAtTime(1320, this.ctx.currentTime + 0.04);

            gain.gain.setValueAtTime(0.07, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.13);
        } catch {}
    }

    public playCardSfx() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(480, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(180, this.ctx.currentTime + 0.06);

            gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.07);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        } catch {}
    }

    public playSlotTickSfx(pitch = 400) {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(pitch, this.ctx.currentTime);

            gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.06);
        } catch {}
    }

    public playWinFanfare() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.11);

                gain.gain.setValueAtTime(0.09, this.ctx!.currentTime + idx * 0.11);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + idx * 0.11 + 0.32);

                osc.connect(gain);
                gain.connect(this.ctx!.destination);
                osc.start(this.ctx!.currentTime + idx * 0.11);
                osc.stop(this.ctx!.currentTime + idx * 0.11 + 0.35);
            });
        } catch {}
    }

    public setMute(mute: boolean) {
        this.isMuted = mute;
    }

    public stop() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
}

/**
 * Manages 4-player Co-op Vault logic + Holo-Decoy Bots for Solo/Small-Group Play
 * Pad coordinates match the 32x32 map around Vault Door (5.5, 16.5):
 * - Pad 1 (NW): (4.5, 14.5)
 * - Pad 2 (NE): (6.5, 14.5)
 * - Pad 3 (SW): (4.5, 18.5)
 * - Pad 4 (SE): (6.5, 18.5)
 */
export class VaultManager {
    public state: VaultState = {
        pads: [false, false, false, false],
        padOccupants: [null, null, null, null],
        holoDecoysActive: false,
        isUnlocked: false
    };

    public readonly padCoordinates = [
        { x: 4.5, y: 14.5, label: 'Pad 1 (NW)' },
        { x: 6.5, y: 14.5, label: 'Pad 2 (NE)' },
        { x: 4.5, y: 18.5, label: 'Pad 3 (SW)' },
        { x: 6.5, y: 18.5, label: 'Pad 4 (SE)' }
    ];

    public onStateChanged: () => void = () => {};

    public toggleHoloDecoys() {
        this.state.holoDecoysActive = !this.state.holoDecoysActive;
        this.onStateChanged();
    }

    public forceUnlock(heroName: string, onUnlock: (heroes: string[]) => void) {
        if (this.state.isUnlocked) return;
        this.state.isUnlocked = true;
        this.state.unlockedAt = Date.now();
        this.state.pads = [true, true, true, true];
        const heroes = [heroName];
        this.state.heroes = heroes;
        this.onStateChanged();
        onUnlock(heroes);
    }

    public update(
        players: Array<{ id: string; username: string; x: number; y: number }>,
        onUnlock: (heroes: string[]) => void
    ) {
        const newOccupants: [string | null, string | null, string | null, string | null] = [null, null, null, null];
        const newPads: [boolean, boolean, boolean, boolean] = [false, false, false, false];

        let changed = false;

        this.padCoordinates.forEach((coord, index) => {
            for (const p of players) {
                if (gridDistance(p.x, p.y, coord.x, coord.y) <= 0.85) {
                    newPads[index] = true;
                    newOccupants[index] = p.username;
                    break;
                }
            }
            if (!newPads[index] && this.state.holoDecoysActive && index > 0) {
                newPads[index] = true;
                newOccupants[index] = `HoloClone-${index}`;
            }
            if (newPads[index] !== this.state.pads[index] || newOccupants[index] !== this.state.padOccupants[index]) {
                changed = true;
            }
        });

        this.state.pads = newPads;
        this.state.padOccupants = newOccupants;

        const allActive = newPads[0] && newPads[1] && newPads[2] && newPads[3];

        if (allActive && !this.state.isUnlocked) {
            this.state.isUnlocked = true;
            this.state.unlockedAt = Date.now();
            const heroes = newOccupants.filter((u): u is string => u !== null);
            this.state.heroes = heroes;
            this.state.holoDecoysActive = false;
            changed = true;
            onUnlock(heroes);
        } else if (!allActive && this.state.isUnlocked && Date.now() - (this.state.unlockedAt || 0) > 20000) {
            this.state.isUnlocked = false;
            changed = true;
        }

        if (changed) {
            this.onStateChanged();
        }
    }
}
