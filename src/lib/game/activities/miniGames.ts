// src/lib/game/activities/miniGames.ts
/**
 * Collaborative activities, multi-genre Web Audio synthesizer (Ambient Forest, Classical, House, Electronic, Techno, Rave),
 * casino & nature sound effects, and Forest Social Game banks (Campfire Trivia/Icebreakers, Koi Pond Fishing, Picnic Gomoku).
 */

export { DiceDuelManager, type DiceSeat, type PlayerScore, type DiceGamePhase } from './diceDuel';
export { RouletteGameManager, ROULETTE_SECTORS, BETTABLE_ROULETTE_SECTORS, type RouletteSector } from './rouletteGame';

export type MusicGenre = 'Ambient' | 'Classical' | 'House' | 'Electronic' | 'Techno' | 'Rave';

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
    // --- AMBIENT / FOREST (Calm Nature Soundtrack) ---
    {
        id: 11,
        genre: 'Ambient',
        title: '\u{1F332} Whispering Pine Lullaby (Forest Calm)',
        bpm: 72,
        wave: 'sine',
        bassWave: 'triangle',
        notes: [
            329.63, 392.0, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0,
            293.66, 349.23, 440.0, 523.25, 493.88, 440.0, 392.0, 329.63
        ],
        bassNotes: [130.81, 164.81, 146.83, 196.0, 110.0, 146.83, 130.81, 164.81],
        drumPattern: 'none'
    },
    {
        id: 12,
        genre: 'Ambient',
        title: '\u{1F338} Sakura Stream & Kalimba Chimes',
        bpm: 68,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [
            523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25,
            440.0, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0
        ],
        bassNotes: [130.81, 130.81, 174.61, 174.61, 110.0, 110.0, 146.83, 196.0],
        drumPattern: 'none'
    },
    {
        id: 13,
        genre: 'Ambient',
        title: '\u{1F525} Starlight Campfire Reverie',
        bpm: 76,
        wave: 'sine',
        bassWave: 'sine',
        notes: [
            261.63, 329.63, 392.0, 493.88, 523.25, 493.88, 392.0, 329.63,
            220.0, 293.66, 349.23, 440.0, 392.0, 349.23, 293.66, 261.63
        ],
        bassNotes: [130.81, 98.0, 110.0, 87.31, 130.81, 98.0, 87.31, 98.0],
        drumPattern: 'none'
    },

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

// ============================================================================
// FOREST SOCIAL GAMES DATA BANKS (Campfire Trivia, Icebreakers, Koi Pond)
// ============================================================================

export interface CampfireTriviaQuestion {
    id: number;
    category: string;
    question: string;
    options: [string, string, string, string];
    correctIndex: number;
}

export interface CampfireIcebreakerPrompt {
    id: number;
    prompt: string;
    optionA: string;
    optionB: string;
}

export const CAMPFIRE_TRIVIA_BANK: CampfireTriviaQuestion[] = [
    {
        id: 1,
        category: 'Crypto & Web3 Lore',
        question: 'In what year was the Bitcoin whitepaper published by Satoshi Nakamoto?',
        options: ['2006', '2008', '2010', '2011'],
        correctIndex: 1
    },
    {
        id: 2,
        category: 'Retro OS & Tech',
        question: 'What was the default desktop background color hex of classic Windows 98?',
        options: ['Teal (#008080)', 'Navy (#000080)', 'Olive (#808000)', 'Slate (#404040)'],
        correctIndex: 0
    },
    {
        id: 3,
        category: 'Nature & Forest',
        question: 'Which tree species is famous for its pink spring blossoms ("Sakura") in Japan?',
        options: ['Red Maple', 'Weeping Willow', 'Cherry Blossom', 'Silver Birch'],
        correctIndex: 2
    },
    {
        id: 4,
        category: 'Gaming History',
        question: 'Which 1997 MMORPG popularized isometric open-world player housing and socializing?',
        options: ['Ultima Online', 'Quake II', 'StarCraft', 'GoldenEye 007'],
        correctIndex: 0
    },
    {
        id: 5,
        category: 'Nature & Wildlife',
        question: 'How do fireflies produce their signature warm bioluminescent glow at night?',
        options: ['Static electricity', 'Luciferin chemical reaction', 'Moonlight reflection', 'Phosphor pollen'],
        correctIndex: 1
    },
    {
        id: 6,
        category: 'Internet Culture',
        question: 'What does the classic Japanese emoticon / internet expression "UwU" represent?',
        options: ['A happy/cozy face with closed eyes', 'An angry owl', 'Ultra Wide Universe', 'Under Water Unit'],
        correctIndex: 0
    },
    {
        id: 7,
        category: 'Aquatic Lore',
        question: 'How long can prized Japanese Koi fish live in a well-kept garden pond?',
        options: ['Up to 5 years', '10 to 15 years', '40 to 100+ years', 'Only 2 summers'],
        correctIndex: 2
    },
    {
        id: 8,
        category: 'Retro Computing',
        question: 'How much data could a standard 3.5-inch high-density floppy disk store?',
        options: ['1.44 MB', '64 MB', '512 KB', '10 MB'],
        correctIndex: 0
    }
];

export const CAMPFIRE_ICEBREAKER_BANK: CampfireIcebreakerPrompt[] = [
    {
        id: 1,
        prompt: 'Would you rather hang out in a cozy rainy forest cabin or a neon cyberpunk penthouse?',
        optionA: '🌲 Cozy Forest Cabin',
        optionB: '🌆 Neon Penthouse'
    },
    {
        id: 2,
        prompt: 'What is your ideal late-night gaming vibe with friends?',
        optionA: '🎧 Chill Voice Chat & Lo-Fi',
        optionB: '🔥 High-Stakes Competitive'
    },
    {
        id: 3,
        prompt: 'If you could time-travel your setup, which era do you pick?',
        optionA: '💾 1998 CRT & LAN Parties',
        optionB: '🛸 2099 Neural Full-Dive VR'
    },
    {
        id: 4,
        prompt: 'Pick a mythical forest companion to follow your Unicorn avatar:',
        optionA: '🦊 Glowing Spirit Fox',
        optionB: '🐉 Pocket Emerald Dragon'
    },
    {
        id: 5,
        prompt: 'Campfire snack showdown: what are you roasting over the fire tonight?',
        optionA: '🍫 Golden S’mores',
        optionB: '🍵 Matcha Mochi Skewers'
    }
];

export interface KoiSpecimen {
    id: string;
    name: string;
    icon: string;
    rarity: 'Common' | 'Uncommon' | 'Rare' | 'Mythic';
    color: string;
    description: string;
}

export const KOI_POND_SPECIMENS: KoiSpecimen[] = [
    {
        id: 'kohaku_koi',
        name: 'Kohaku Red-White Koi',
        icon: '🐟',
        rarity: 'Common',
        color: '#ff6b4a',
        description: 'Classic crimson and snow-white pond swimmer.'
    },
    {
        id: 'jade_frog',
        name: 'Mossy Jade Treefrog',
        icon: '🐸',
        rarity: 'Common',
        color: '#4ade80',
        description: 'Loves sitting on lilypads listening to lo-fi chimes.'
    },
    {
        id: 'pond_turtle',
        name: 'Ancient Terrapin Turtle',
        icon: '🐢',
        rarity: 'Uncommon',
        color: '#34d399',
        description: 'Has been vibing in Whispering Woods since Windows 95.'
    },
    {
        id: 'sakura_axolotl',
        name: 'Sakura Pink Axolotl',
        icon: '🦎',
        rarity: 'Rare',
        color: '#f472b6',
        description: 'Smiles perpetually under drifting cherry blossom petals.'
    },
    {
        id: 'emperor_gold_koi',
        name: 'Golden Emperor Yamabuki Koi',
        icon: '🐠',
        rarity: 'Rare',
        color: '#facc15',
        description: 'Scales shimmer like pure 24k gold in the moonlight.'
    },
    {
        id: 'celestial_dragonfish',
        name: 'Emerald Spirit Dragonfish',
        icon: '🐉',
        rarity: 'Mythic',
        color: '#38bdf8',
        description: 'A legendary guardian of the Whispering Woods spring!'
    }
];

/**
 * Multi-Genre Web Audio Synthesizer & Casino/Nature SFX Engine
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

        // 8th-note step clock
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
            // Special calm polyphonic synthesis for Forest Ambient tracks
            if (track.genre === 'Ambient') {
                // Soft harp / kalimba pluck with gentle attack and long warm decay
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = track.wave;
                osc.frequency.setValueAtTime(noteFreq, now);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.032, now + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + 0.68);

                // Warm fifth/octave shimmer on every 4th step
                if (stepIdx % 4 === 0) {
                    const pad = this.ctx.createOscillator();
                    const padGain = this.ctx.createGain();
                    pad.type = 'sine';
                    pad.frequency.setValueAtTime(bassFreq * 2, now);

                    padGain.gain.setValueAtTime(0.001, now);
                    padGain.gain.linearRampToValueAtTime(0.024, now + 0.12);
                    padGain.gain.exponentialRampToValueAtTime(0.0008, now + 1.1);

                    pad.connect(padGain);
                    padGain.connect(this.ctx.destination);
                    pad.start(now);
                    pad.stop(now + 1.15);
                }
                return;
            }

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

    public playNatureChimeSfx() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, idx) => {
                const osc = this.ctx!.createOscillator();
                const gain = this.ctx!.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, this.ctx!.currentTime + idx * 0.09);

                gain.gain.setValueAtTime(0.05, this.ctx!.currentTime + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.0008, this.ctx!.currentTime + idx * 0.09 + 0.45);

                osc.connect(gain);
                gain.connect(this.ctx!.destination);
                osc.start(this.ctx!.currentTime + idx * 0.09);
                osc.stop(this.ctx!.currentTime + idx * 0.09 + 0.48);
            });
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
