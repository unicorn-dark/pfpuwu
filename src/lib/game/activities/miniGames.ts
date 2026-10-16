// src/lib/game/activities/miniGames.ts
/**
 * Collaborative activities, multi-genre Web Audio synthesizer (Classical, House, Electronic, Techno, Rave),
 * casino sound effects, and Vault Heist manager for UwU World.
 */

import { gridDistance } from '../isometric/isoMath';
export { DiceDuelManager, type DiceSeat, type PlayerScore, type DiceGamePhase } from './diceDuel';
export { RouletteGameManager, ROULETTE_SECTORS, BETTABLE_ROULETTE_SECTORS, type RouletteSector } from './rouletteGame';

export interface VaultState {
    pads: [boolean, boolean, boolean, boolean];
    padOccupants: [string | null, string | null, string | null, string | null];
    holoDecoysActive: boolean;
    isUnlocked: boolean;
    unlockedAt?: number;
    heroes?: string[];
}

export type MusicGenre = 'Classical' | 'House' | 'Electronic' | 'Techno' | 'Rave';

export interface DJTrack {
    id: number;
    genre: MusicGenre;
    title: string;
    bpm: number;
    wave: OscillatorType;
    bassWave: OscillatorType;
    notes: number[];
    bassNotes: number[];
    drumPattern: 'none' | 'four_floor' | 'electro' | 'techno' | 'rave';
}

export const DJ_TRACKS: DJTrack[] = [
    // --- CLASSICAL ---
    {
        id: 1,
        genre: 'Classical',
        title: '\u{1F3BB} Bach — Toccata & Fugue in D Minor',
        bpm: 112,
        wave: 'sawtooth',
        bassWave: 'triangle',
        notes: [587.33, 523.25, 587.33, 440.0, 349.23, 392.0, 440.0, 293.66, 440.0, 523.25, 466.16, 440.0, 392.0, 349.23, 329.63, 293.66],
        bassNotes: [146.83, 146.83, 110.0, 110.0, 174.61, 146.83, 110.0, 146.83],
        drumPattern: 'none'
    },
    {
        id: 2,
        genre: 'Classical',
        title: '\u{1F3BC} Beethoven — Für Elise & Moonlight Arpeggio',
        bpm: 118,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [659.25, 622.25, 659.25, 622.25, 659.25, 493.88, 587.33, 523.25, 440.0, 261.63, 329.63, 440.0, 493.88, 329.63, 415.3, 493.88],
        bassNotes: [110.0, 164.81, 220.0, 164.81, 82.41, 164.81, 207.65, 164.81],
        drumPattern: 'none'
    },

    // --- HOUSE ---
    {
        id: 3,
        genre: 'House',
        title: '\u{1F3E0} Ibiza Sunset Deep House Groove',
        bpm: 124,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [329.63, 392.0, 493.88, 587.33, 493.88, 392.0, 369.99, 440.0, 523.25, 440.0, 392.0, 329.63],
        bassNotes: [82.41, 82.41, 98.0, 110.0, 73.42, 73.42, 87.31, 98.0],
        drumPattern: 'four_floor'
    },
    {
        id: 4,
        genre: 'House',
        title: '\u{1F3B9} French Filter Piano House',
        bpm: 126,
        wave: 'sawtooth',
        bassWave: 'triangle',
        notes: [440.0, 554.37, 659.25, 880.0, 659.25, 554.37, 493.88, 587.33, 739.99, 659.25, 587.33, 493.88],
        bassNotes: [110.0, 110.0, 146.83, 164.81, 98.0, 123.47, 146.83, 123.47],
        drumPattern: 'four_floor'
    },

    // --- ELECTRONIC ---
    {
        id: 5,
        genre: 'Electronic',
        title: '\u{26A1} Daft Cyber Funk Odyssey',
        bpm: 120,
        wave: 'square',
        bassWave: 'sawtooth',
        notes: [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23, 440.0, 587.33, 440.0, 349.23],
        bassNotes: [65.41, 130.81, 65.41, 130.81, 73.42, 146.83, 87.31, 174.61],
        drumPattern: 'electro'
    },
    {
        id: 6,
        genre: 'Electronic',
        title: '\u{1F30C} Synthwave Midnight Horizon',
        bpm: 128,
        wave: 'sawtooth',
        bassWave: 'sawtooth',
        notes: [196.0, 246.94, 293.66, 392.0, 493.88, 392.0, 293.66, 246.94, 220.0, 261.63, 329.63, 440.0],
        bassNotes: [98.0, 98.0, 98.0, 98.0, 82.41, 82.41, 110.0, 110.0],
        drumPattern: 'electro'
    },

    // --- TECHNO ---
    {
        id: 7,
        genre: 'Techno',
        title: '\u{1F50A} Berlin Underground Acid 303',
        bpm: 135,
        wave: 'sawtooth',
        bassWave: 'square',
        notes: [146.83, 293.66, 155.56, 146.83, 220.0, 146.83, 311.13, 293.66, 146.83, 174.61, 293.66, 220.0],
        bassNotes: [73.42, 73.42, 73.42, 77.78, 73.42, 73.42, 110.0, 73.42],
        drumPattern: 'techno'
    },
    {
        id: 8,
        genre: 'Techno',
        title: '\u{1F916} Industrial Warehouse Peak-Time',
        bpm: 138,
        wave: 'square',
        bassWave: 'sawtooth',
        notes: [130.81, 138.59, 130.81, 196.0, 130.81, 261.63, 196.0, 155.56],
        bassNotes: [65.41, 65.41, 65.41, 65.41, 69.3, 69.3, 65.41, 77.78],
        drumPattern: 'techno'
    },

    // --- RAVE ---
    {
        id: 9,
        genre: 'Rave',
        title: '\u{1F386} 90s Euphoric Hardcore Rave Anthem',
        bpm: 148,
        wave: 'sawtooth',
        bassWave: 'square',
        notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 698.46, 880.0, 1174.66, 880.0, 783.99],
        bassNotes: [130.81, 261.63, 146.83, 293.66, 164.81, 329.63, 174.61, 349.23],
        drumPattern: 'rave'
    },
    {
        id: 10,
        genre: 'Rave',
        title: '\u{1F6A8} Big Room Laser Rave Strobe Drop',
        bpm: 145,
        wave: 'square',
        bassWave: 'sawtooth',
        notes: [440.0, 440.0, 523.25, 587.33, 659.25, 659.25, 587.33, 523.25, 493.88, 440.0, 392.0, 440.0],
        bassNotes: [110.0, 110.0, 130.81, 146.83, 164.81, 164.81, 146.83, 110.0],
        drumPattern: 'rave'
    }
];

export const RETRO_PALETTE_16 = [
    '#000000', '#808080', '#c0c0c0', '#ffffff',
    '#800000', '#ff0000', '#808000', '#ffff00',
    '#008000', '#00ff00', '#008080', '#00ffff',
    '#000080', '#0000ff', '#800080', '#ff00ff'
];

/**
 * Multi-Genre Web Audio Synthesizer & Casino SFX Engine
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

        // 16th-note / 8th-note step clock
        const intervalMs = (60 / track.bpm / 2) * 1000;
        this.timerId = window.setInterval(() => {
            this.playNextStep(track);
        }, intervalMs);
    }

    private playNextStep(track: DJTrack) {
        if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;

        const now = this.ctx.currentTime;
        const noteFreq = track.notes[this.step % track.notes.length];
        const bassFreq = track.bassNotes[Math.floor(this.step / 2) % track.bassNotes.length];
        const stepIdx = this.step;
        this.step++;

        try {
            // 1. Lead Synth Channel
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = track.wave;
            osc.frequency.setValueAtTime(noteFreq, now);

            const leadVol = track.genre === 'Classical' ? 0.042 : 0.032;
            const leadDur = track.genre === 'Classical' ? 0.24 : 0.16;
            gain.gain.setValueAtTime(leadVol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + leadDur);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + leadDur + 0.02);

            // 2. Bassline / Counterpoint Channel
            if (stepIdx % 2 === 0 || track.drumPattern === 'rave' || track.drumPattern === 'techno') {
                const bass = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                bass.type = track.bassWave;
                bass.frequency.setValueAtTime(bassFreq, now);

                bassGain.gain.setValueAtTime(0.045, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

                bass.connect(bassGain);
                bassGain.connect(this.ctx.destination);
                bass.start(now);
                bass.stop(now + 0.2);
            }

            // 3. Drum / Percussion Synthesis
            if (track.drumPattern !== 'none') {
                // Four-on-the-floor kick on even steps
                if (stepIdx % 2 === 0) {
                    const kick = this.ctx.createOscillator();
                    const kickGain = this.ctx.createGain();
                    kick.type = 'sine';
                    const startPitch = track.drumPattern === 'rave' || track.drumPattern === 'techno' ? 145 : 115;
                    kick.frequency.setValueAtTime(startPitch, now);
                    kick.frequency.exponentialRampToValueAtTime(32, now + 0.12);

                    kickGain.gain.setValueAtTime(0.11, now);
                    kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

                    kick.connect(kickGain);
                    kickGain.connect(this.ctx.destination);
                    kick.start(now);
                    kick.stop(now + 0.15);
                } else {
                    // Off-beat open hi-hat / synth tick for House, Techno & Rave
                    const hat = this.ctx.createOscillator();
                    const hatGain = this.ctx.createGain();
                    hat.type = 'square';
                    hat.frequency.setValueAtTime(3200 + (stepIdx % 3) * 600, now);

                    hatGain.gain.setValueAtTime(0.012, now);
                    hatGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.045);

                    hat.connect(hatGain);
                    hatGain.connect(this.ctx.destination);
                    hat.start(now);
                    hat.stop(now + 0.05);
                }
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
            const notes = [523.25, 659.25, 783.99, 1046.5];
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
