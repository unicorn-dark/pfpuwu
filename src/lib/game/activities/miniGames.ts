// src/lib/game/activities/miniGames.ts
/**
 * Collaborative activities, multi-genre Web Audio synthesizer (Ambient Forest, Classical, House, Electronic, Techno, Rave),
 * casino & nature sound effects, and Forest Social Game banks (Campfire Trivia/Icebreakers, Koi Pond Fishing, Picnic Gomoku).
 */

export { DiceDuelManager, type DiceSeat, type PlayerScore, type DiceGamePhase } from './diceDuel';
export { RouletteGameManager, ROULETTE_SECTORS, BETTABLE_ROULETTE_SECTORS, type RouletteSector } from './rouletteGame';

export type MusicGenre = 'Lo-Fi' | 'Synthwave' | 'House' | 'Techno' | 'DnB' | 'Chiptune' | 'Classical' | 'Ambient';

export interface DJTrack {
    id: number;
    genre: MusicGenre;
    title: string;
    artist: string;
    vibe: string;
    bpm: number;
    wave: OscillatorType;
    bassWave: OscillatorType;
    notes: number[];
    bassNotes: number[];
    chords?: number[][];
    drumPattern: 'none' | 'lofi_swing' | 'synthwave' | 'four_floor' | 'techno' | 'dnb_break' | 'chiptune';
    filterCutoff?: number;
    detuneCents?: number;
}

export const DJ_TRACKS: DJTrack[] = [
    // --- LO-FI CHILLHOP / JAZZ HOP ---
    {
        id: 1,
        genre: 'Lo-Fi',
        title: '☕ Midnight Tokyo Rain & Rhodes',
        artist: 'UwU Beats Collective',
        vibe: 'Warm Rhodes 9th Chords • Vinyl Boom-Bap',
        bpm: 84,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [523.25, 0, 659.25, 587.33, 493.88, 0, 440.0, 392.0, 523.25, 587.33, 659.25, 0, 493.88, 440.0, 392.0, 0],
        bassNotes: [130.81, 130.81, 110.0, 110.0, 146.83, 146.83, 98.0, 98.0],
        chords: [
            [261.63, 329.63, 392.0, 493.88], // Cmaj7
            [220.0, 261.63, 329.63, 392.0],  // Am7
            [293.66, 349.23, 440.0, 523.25], // Dm7
            [196.0, 246.94, 293.66, 349.23]  // G7
        ],
        drumPattern: 'lofi_swing',
        filterCutoff: 1100
    },
    {
        id: 2,
        genre: 'Lo-Fi',
        title: '🌙 Rooftop Cassette Dreams',
        artist: 'Neko Vinyl',
        vibe: 'Mellow Jazz Guitar • Dusty Snare',
        bpm: 78,
        wave: 'sine',
        bassWave: 'triangle',
        notes: [440.0, 523.25, 0, 659.25, 587.33, 0, 523.25, 440.0, 392.0, 440.0, 523.25, 0, 392.0, 349.23, 329.63, 0],
        bassNotes: [146.83, 146.83, 196.0, 196.0, 130.81, 130.81, 110.0, 110.0],
        chords: [
            [293.66, 349.23, 440.0, 523.25],
            [196.0, 246.94, 329.63, 392.0],
            [261.63, 329.63, 392.0, 493.88],
            [220.0, 261.63, 329.63, 440.0]
        ],
        drumPattern: 'lofi_swing',
        filterCutoff: 950
    },

    // --- SYNTHWAVE / OUTRUN ---
    {
        id: 3,
        genre: 'Synthwave',
        title: '🌆 Miami 1986 Testarossa Sunset',
        artist: 'Kavinsky Cyber',
        vibe: 'Detuned Analog Brass • Gated 80s Snare',
        bpm: 108,
        wave: 'sawtooth',
        bassWave: 'sawtooth',
        notes: [440.0, 0, 523.25, 587.33, 659.25, 0, 587.33, 523.25, 493.88, 0, 440.0, 392.0, 440.0, 0, 329.63, 0],
        bassNotes: [110.0, 220.0, 110.0, 220.0, 87.31, 174.61, 130.81, 196.0],
        chords: [
            [220.0, 261.63, 329.63],
            [174.61, 220.0, 261.63],
            [261.63, 329.63, 392.0],
            [196.0, 246.94, 293.66]
        ],
        drumPattern: 'synthwave',
        filterCutoff: 2400,
        detuneCents: 14
    },
    {
        id: 4,
        genre: 'Synthwave',
        title: '🌌 Cyber Blade Runner 2049',
        artist: 'Vangelis Protocol',
        vibe: 'Wide CS-80 Lead • Rolling Arpeggio',
        bpm: 102,
        wave: 'sawtooth',
        bassWave: 'triangle',
        notes: [293.66, 349.23, 440.0, 587.33, 523.25, 440.0, 349.23, 293.66, 261.63, 329.63, 392.0, 523.25, 440.0, 392.0, 329.63, 261.63],
        bassNotes: [73.42, 146.83, 73.42, 146.83, 58.27, 116.54, 65.41, 130.81],
        drumPattern: 'synthwave',
        filterCutoff: 1900,
        detuneCents: 18
    },

    // --- HOUSE ---
    {
        id: 5,
        genre: 'House',
        title: '🏝️ Ibiza Terrace Deep Organ Groove',
        artist: 'Solomun UwU',
        vibe: 'M1 Organ Chords • 4x4 Club Kick',
        bpm: 124,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [329.63, 0, 392.0, 493.88, 0, 587.33, 493.88, 392.0, 369.99, 0, 440.0, 523.25, 0, 440.0, 392.0, 329.63],
        bassNotes: [82.41, 82.41, 98.0, 110.0, 73.42, 73.42, 87.31, 98.0],
        chords: [
            [329.63, 392.0, 493.88],
            [293.66, 369.99, 440.0],
            [261.63, 329.63, 392.0],
            [293.66, 369.99, 440.0]
        ],
        drumPattern: 'four_floor',
        filterCutoff: 1800
    },
    {
        id: 6,
        genre: 'House',
        title: '🥂 French Touch Filter Disco',
        artist: 'Stardust 98',
        vibe: 'Funky Slap Bass • Sweeping Filter Chords',
        bpm: 126,
        wave: 'sawtooth',
        bassWave: 'triangle',
        notes: [440.0, 554.37, 659.25, 880.0, 0, 659.25, 554.37, 493.88, 587.33, 739.99, 659.25, 0, 587.33, 493.88, 440.0, 0],
        bassNotes: [110.0, 220.0, 146.83, 164.81, 98.0, 196.0, 146.83, 123.47],
        chords: [
            [440.0, 554.37, 659.25],
            [392.0, 493.88, 587.33],
            [369.99, 440.0, 554.37],
            [329.63, 415.3, 493.88]
        ],
        drumPattern: 'four_floor',
        filterCutoff: 2200,
        detuneCents: 8
    },

    // --- TECHNO ---
    {
        id: 7,
        genre: 'Techno',
        title: '🔊 Berghain 4AM Acid 303 Squelch',
        artist: 'Kobosil 303',
        vibe: 'Resonant TB-303 Acid Line • Dark Rumble',
        bpm: 136,
        wave: 'sawtooth',
        bassWave: 'square',
        notes: [146.83, 293.66, 155.56, 146.83, 220.0, 146.83, 311.13, 293.66, 146.83, 174.61, 293.66, 146.83, 220.0, 311.13, 293.66, 146.83],
        bassNotes: [73.42, 73.42, 73.42, 77.78, 73.42, 73.42, 73.42, 65.41],
        drumPattern: 'techno',
        filterCutoff: 2800
    },

    // --- JUNGLE / DRUM & BASS ---
    {
        id: 8,
        genre: 'DnB',
        title: '💿 1997 Liquid Jungle Breakbeat',
        artist: 'LTJ Bukem UwU',
        vibe: '166 BPM Amen Break • Deep Reese Sub & Pads',
        bpm: 164,
        wave: 'sine',
        bassWave: 'sawtooth',
        notes: [587.33, 0, 698.46, 880.0, 0, 783.99, 698.46, 587.33, 523.25, 0, 659.25, 783.99, 0, 659.25, 587.33, 0],
        bassNotes: [73.42, 73.42, 58.27, 58.27, 65.41, 65.41, 82.41, 82.41],
        chords: [
            [293.66, 349.23, 440.0, 523.25],
            [233.08, 293.66, 349.23, 440.0],
            [261.63, 329.63, 392.0, 493.88],
            [329.63, 392.0, 493.88, 587.33]
        ],
        drumPattern: 'dnb_break',
        filterCutoff: 1400,
        detuneCents: 12
    },

    // --- 8-BIT CHIPTUNE ---
    {
        id: 9,
        genre: 'Chiptune',
        title: '🕹️ Mega Boss Stage 1992 (8-Bit NES)',
        artist: ' Famitracker Hero',
        vibe: 'Fast Square Arpeggios • Triangle Bass',
        bpm: 144,
        wave: 'square',
        bassWave: 'triangle',
        notes: [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 698.46, 880.0, 1174.66, 880.0, 698.46, 659.25, 783.99, 987.77, 1318.5],
        bassNotes: [130.81, 261.63, 146.83, 293.66, 164.81, 329.63, 196.0, 392.0],
        drumPattern: 'chiptune',
        filterCutoff: 4200
    },

    // --- CLASSICAL ---
    {
        id: 10,
        genre: 'Classical',
        title: '🎻 Vivaldi — Winter Allegro Chamber',
        artist: 'Venice Strings',
        vibe: 'Baroque Harpsichord & Cello Counterpoint',
        bpm: 116,
        wave: 'triangle',
        bassWave: 'sawtooth',
        notes: [698.46, 659.25, 698.46, 523.25, 440.0, 466.16, 523.25, 349.23, 523.25, 587.33, 622.25, 587.33, 523.25, 466.16, 440.0, 392.0],
        bassNotes: [174.61, 174.61, 130.81, 130.81, 116.54, 130.81, 174.61, 130.81],
        chords: [
            [349.23, 415.3, 523.25],
            [261.63, 329.63, 392.0],
            [233.08, 293.66, 349.23],
            [261.63, 329.63, 400.0]
        ],
        drumPattern: 'none',
        filterCutoff: 2200
    },

    // --- AMBIENT / WHISPERING WOODS ---
    {
        id: 11,
        genre: 'Ambient',
        title: '🌲 Whispering Pine Kalimba & Stream',
        artist: 'Forest Sanctuary',
        vibe: 'Pentatonic Kalimba Plucks • Warm Choir Pad',
        bpm: 72,
        wave: 'sine',
        bassWave: 'triangle',
        notes: [329.63, 392.0, 440.0, 523.25, 587.33, 523.25, 440.0, 392.0, 293.66, 349.23, 440.0, 523.25, 493.88, 440.0, 392.0, 329.63],
        bassNotes: [130.81, 164.81, 146.83, 196.0, 110.0, 146.83, 130.81, 164.81],
        chords: [
            [261.63, 329.63, 392.0],
            [220.0, 293.66, 349.23]
        ],
        drumPattern: 'none',
        filterCutoff: 1200
    },
    {
        id: 12,
        genre: 'Ambient',
        title: '🌸 Sakura Moonlight Harp',
        artist: 'Kyoto Garden',
        vibe: 'Crystal Harp Harmonics • Firefly Shimmer',
        bpm: 66,
        wave: 'triangle',
        bassWave: 'sine',
        notes: [523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25, 440.0, 523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0],
        bassNotes: [130.81, 130.81, 174.61, 174.61, 110.0, 110.0, 146.83, 196.0],
        drumPattern: 'none',
        filterCutoff: 1400
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
        const stepIdx = this.step;
        this.step++;

        const noteFreq = track.notes[stepIdx % track.notes.length];
        const bassFreq = track.bassNotes[Math.floor(stepIdx / 2) % track.bassNotes.length];

        try {
            // 1. AMBIENT / FOREST: Soft Kalimba plucks + long warm breathing pads
            if (track.genre === 'Ambient') {
                if (noteFreq > 0) {
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
                }

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

            // 2. POLYPHONIC CHORD STABS / RHODES / PADS (Lo-Fi, House, Synthwave, DnB, Classical)
            if (track.chords && track.chords.length > 0) {
                const isChordTrigger =
                    track.genre === 'Lo-Fi'
                        ? stepIdx % 4 === 0 || stepIdx % 8 === 3
                        : track.genre === 'House'
                          ? stepIdx % 2 === 1 // Classic off-beat House organ stab
                          : stepIdx % 4 === 0;

                if (isChordTrigger) {
                    const chordNotes = track.chords[Math.floor(stepIdx / 4) % track.chords.length];
                    const filter = this.ctx.createBiquadFilter();
                    filter.type = 'lowpass';
                    const cutoff = track.filterCutoff || 1600;
                    filter.frequency.setValueAtTime(
                        track.genre === 'House' ? cutoff * (0.7 + 0.4 * Math.sin(stepIdx * 0.4)) : cutoff,
                        now
                    );
                    filter.connect(this.ctx.destination);

                    const chordDur = track.genre === 'House' ? 0.14 : track.genre === 'Lo-Fi' ? 0.48 : 0.38;
                    const chordVol = track.genre === 'Lo-Fi' ? 0.018 : 0.014;

                    chordNotes.forEach((cFreq) => {
                        if (!this.ctx) return;
                        const cOsc = this.ctx.createOscillator();
                        const cGain = this.ctx.createGain();
                        cOsc.type = track.genre === 'Lo-Fi' ? 'triangle' : 'sawtooth';
                        cOsc.frequency.setValueAtTime(cFreq, now);
                        cGain.gain.setValueAtTime(0.001, now);
                        cGain.gain.linearRampToValueAtTime(chordVol, now + 0.015);
                        cGain.gain.exponentialRampToValueAtTime(0.0008, now + chordDur);
                        cOsc.connect(cGain);
                        cGain.connect(filter);
                        cOsc.start(now);
                        cOsc.stop(now + chordDur + 0.02);
                    });
                }
            }

            // 3. LEAD SYNTH / ACID 303 / CHIPTUNE ARPEGGIO CHANNEL
            if (noteFreq > 0) {
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                if (track.genre === 'Techno') {
                    // Resonant TB-303 Acid Filter Sweep!
                    filter.Q.setValueAtTime(9.5, now);
                    const sweepStart = stepIdx % 3 === 0 ? 2900 : 950;
                    filter.frequency.setValueAtTime(sweepStart, now);
                    filter.frequency.exponentialRampToValueAtTime(280, now + 0.14);
                } else {
                    filter.frequency.setValueAtTime(track.filterCutoff || 2600, now);
                }
                filter.connect(this.ctx.destination);

                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = track.wave;
                osc.frequency.setValueAtTime(noteFreq, now);

                const leadVol =
                    track.genre === 'Classical'
                        ? 0.038
                        : track.genre === 'Lo-Fi'
                          ? 0.024
                          : track.genre === 'Chiptune'
                            ? 0.028
                            : 0.03;
                const leadDur =
                    track.genre === 'Classical' || track.genre === 'Synthwave'
                        ? 0.25
                        : track.genre === 'Chiptune'
                          ? 0.11
                          : 0.16;

                gain.gain.setValueAtTime(leadVol, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + leadDur);

                osc.connect(gain);
                gain.connect(filter);
                osc.start(now);
                osc.stop(now + leadDur + 0.02);

                // Detuned second chorus oscillator for rich Synthwave / DnB width
                if (track.detuneCents) {
                    const osc2 = this.ctx.createOscillator();
                    const gain2 = this.ctx.createGain();
                    osc2.type = track.wave;
                    osc2.frequency.setValueAtTime(noteFreq, now);
                    osc2.detune.setValueAtTime(track.detuneCents, now);
                    gain2.gain.setValueAtTime(leadVol * 0.65, now);
                    gain2.gain.exponentialRampToValueAtTime(0.001, now + leadDur);
                    osc2.connect(gain2);
                    gain2.connect(filter);
                    osc2.start(now);
                    osc2.stop(now + leadDur + 0.02);
                }
            }

            // 4. BASSLINE CHANNEL
            const shouldPlayBass =
                track.genre === 'Synthwave' || track.genre === 'Techno' || track.genre === 'Chiptune'
                    ? true
                    : stepIdx % 2 === 0;
            if (shouldPlayBass && bassFreq > 0) {
                const bass = this.ctx.createOscillator();
                const bassGain = this.ctx.createGain();
                const bassFilter = this.ctx.createBiquadFilter();
                bassFilter.type = 'lowpass';
                bassFilter.frequency.setValueAtTime(track.genre === 'DnB' ? 320 : 650, now);

                bass.type = track.bassWave;
                const activeBassFreq =
                    track.genre === 'Synthwave' && stepIdx % 2 === 1 ? bassFreq * 2 : bassFreq;
                bass.frequency.setValueAtTime(activeBassFreq, now);

                const bassDur = track.genre === 'DnB' ? 0.28 : 0.18;
                bassGain.gain.setValueAtTime(0.048, now);
                bassGain.gain.exponentialRampToValueAtTime(0.001, now + bassDur);

                bass.connect(bassFilter);
                bassFilter.connect(bassGain);
                bassGain.connect(this.ctx.destination);
                bass.start(now);
                bass.stop(now + bassDur + 0.02);
            }

            // 5. DISTINCT GENRE DRUM GROOVES
            const dp = track.drumPattern;
            if (dp === 'none') return;

            const barStep = stepIdx % 8;

            if (dp === 'lofi_swing') {
                // Boom-bap swung kick on 0, 3 and dusty snare on 2, 6
                if (barStep === 0 || barStep === 3) {
                    this.triggerKick(now, 95, 36, 0.085);
                } else if (barStep === 2 || barStep === 6) {
                    this.triggerSnare(now, 0.04, 0.09);
                }
                this.triggerHiHat(now + (stepIdx % 2 === 1 ? 0.03 : 0), 0.008, 2400);
            } else if (dp === 'synthwave') {
                // Big 80s kick on 0, 4 and gated snare on 2, 6
                if (barStep % 4 === 0) {
                    this.triggerKick(now, 120, 34, 0.11);
                } else if (barStep % 4 === 2) {
                    this.triggerSnare(now, 0.065, 0.16);
                }
                this.triggerHiHat(now, 0.01, 3800);
            } else if (dp === 'four_floor') {
                // Punchy House 4x4 kick on even steps + offbeat open hat on odd steps
                if (barStep % 2 === 0) {
                    this.triggerKick(now, 125, 35, 0.11);
                } else {
                    this.triggerHiHat(now, 0.016, 4200, 0.08);
                }
                if (barStep === 2 || barStep === 6) {
                    this.triggerSnare(now, 0.035, 0.08);
                }
            } else if (dp === 'techno') {
                // Hard 136 BPM industrial kick + rumble sub + crisp 909 hat
                if (barStep % 2 === 0) {
                    this.triggerKick(now, 150, 30, 0.13);
                } else {
                    this.triggerHiHat(now, 0.018, 4800, 0.06);
                }
            } else if (dp === 'dnb_break') {
                // Syncopated 164 BPM Jungle / Amen break: Kick on 0 & 5, Snare on 2 & 6
                if (barStep === 0 || barStep === 5) {
                    this.triggerKick(now, 130, 38, 0.1);
                } else if (barStep === 2 || barStep === 6 || barStep === 7) {
                    this.triggerSnare(now, barStep === 7 ? 0.028 : 0.055, 0.07);
                }
                this.triggerHiHat(now, 0.012, 5200, 0.035);
            } else if (dp === 'chiptune') {
                if (barStep % 4 === 0) {
                    this.triggerKick(now, 140, 45, 0.08);
                } else if (barStep % 4 === 2) {
                    this.triggerSnare(now, 0.04, 0.06);
                }
            }
        } catch {}
    }

    private triggerKick(now: number, startFreq: number, endFreq: number, vol: number) {
        if (!this.ctx) return;
        const kick = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(startFreq, now);
        kick.frequency.exponentialRampToValueAtTime(endFreq, now + 0.12);
        kickGain.gain.setValueAtTime(vol, now);
        kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        kick.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kick.start(now);
        kick.stop(now + 0.15);
    }

    private triggerSnare(now: number, vol: number, dur: number) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + dur);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + dur + 0.01);

        // Crisp high-frequency snare snap
        const snap = this.ctx.createOscillator();
        const snapGain = this.ctx.createGain();
        snap.type = 'sawtooth';
        snap.frequency.setValueAtTime(1650, now);
        snap.frequency.exponentialRampToValueAtTime(420, now + dur * 0.7);
        snapGain.gain.setValueAtTime(vol * 0.45, now);
        snapGain.gain.exponentialRampToValueAtTime(0.0008, now + dur * 0.75);
        snap.connect(snapGain);
        snapGain.connect(this.ctx.destination);
        snap.start(now);
        snap.stop(now + dur);
    }

    private triggerHiHat(now: number, vol: number, freq: number, dur = 0.04) {
        if (!this.ctx) return;
        const hat = this.ctx.createOscillator();
        const hatGain = this.ctx.createGain();
        hat.type = 'square';
        hat.frequency.setValueAtTime(freq, now);
        hatGain.gain.setValueAtTime(vol, now);
        hatGain.gain.exponentialRampToValueAtTime(0.0005, now + dur);
        hat.connect(hatGain);
        hatGain.connect(this.ctx.destination);
        hat.start(now);
        hat.stop(now + dur + 0.01);
    }

    /**
     * Dramatic escalating psychedelic Shepard-style synth pulse as Rocket Crash climbs!
     */
    public playCrashClimbSfx(multiplier: number) {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            const intensity = Math.min(1, (multiplier - 1) / 6);
            const baseFreq = Math.min(1600, 220 * Math.pow(1.18, Math.min(14, multiplier - 1)));

            const osc = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = intensity > 0.4 ? 'sawtooth' : 'triangle';
            osc2.type = 'sine';
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.08, now + 0.09);

            // Harmonic fifth/octave shimmer as intensity rises
            osc2.frequency.setValueAtTime(baseFreq * (intensity > 0.5 ? 1.5 : 1.25), now);

            const vol = 0.022 + intensity * 0.035;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

            osc.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc2.start(now);
            osc.stop(now + 0.11);
            osc2.stop(now + 0.11);
        } catch {}
    }

    /**
     * Massive sub-bass boom + explosion synth when the Rocket crashes!
     */
    public playCrashExplosionSfx() {
        this.initContext();
        if (this.isMuted || !this.ctx) return;

        try {
            const now = this.ctx.currentTime;
            // 1. Sub-bass shockwave drop
            const sub = this.ctx.createOscillator();
            const subGain = this.ctx.createGain();
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(160, now);
            sub.frequency.exponentialRampToValueAtTime(24, now + 0.48);

            subGain.gain.setValueAtTime(0.14, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

            sub.connect(subGain);
            subGain.connect(this.ctx.destination);
            sub.start(now);
            sub.stop(now + 0.55);

            // 2. Chaotic dissonant debris bursts
            [310, 465, 620, 890].forEach((freq, i) => {
                if (!this.ctx) return;
                const dOsc = this.ctx.createOscillator();
                const dGain = this.ctx.createGain();
                dOsc.type = 'square';
                dOsc.frequency.setValueAtTime(freq, now + i * 0.03);
                dOsc.frequency.exponentialRampToValueAtTime(55 + i * 15, now + 0.35);

                dGain.gain.setValueAtTime(0.05, now + i * 0.03);
                dGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.38);

                dOsc.connect(dGain);
                dGain.connect(this.ctx.destination);
                dOsc.start(now + i * 0.03);
                dOsc.stop(now + 0.4);
            });
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
