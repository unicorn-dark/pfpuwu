// src/lib/utils/audio.ts
import { writable, get } from 'svelte/store';

export type SoundPackId = 'mechanical' | 'crystal' | 'retro98' | 'wooden';

export interface SoundPackMeta {
    id: SoundPackId;
    icon: string;
    name: string;
    desc: string;
}

export const SOUND_PACKS: SoundPackMeta[] = [
    {
        id: 'mechanical',
        icon: '⌨️',
        name: 'Creamy Mechanical',
        desc: 'Tactile PBT keycap thocks & ceramic ticks'
    },
    {
        id: 'crystal',
        icon: '💧',
        name: 'Crystal Droplet',
        desc: 'Glassy water drops & kalimba chimes'
    },
    {
        id: 'retro98',
        icon: '📼',
        name: 'Retro 98 Switch',
        desc: 'Vintage mouse micro-switch & FM chimes'
    },
    {
        id: 'wooden',
        icon: '🪵',
        name: 'Soft Wooden',
        desc: 'Warm marimba taps & brushed paper'
    }
];

const LS_ENABLED = 'pfpuwu_sfx_enabled';
const LS_PACK = 'pfpuwu_sfx_pack';
const LS_VOL = 'pfpuwu_sfx_vol';

function readBoolStorage(key: string, fallback: boolean): boolean {
    if (typeof window === 'undefined') return fallback;
    try {
        const val = localStorage.getItem(key);
        if (val === 'false') return false;
        if (val === 'true') return true;
    } catch {}
    return fallback;
}

function readPackStorage(): SoundPackId {
    if (typeof window === 'undefined') return 'mechanical';
    try {
        const val = localStorage.getItem(LS_PACK) as SoundPackId | null;
        if (val && SOUND_PACKS.some((p) => p.id === val)) return val;
    } catch {}
    return 'mechanical';
}

function readVolStorage(): number {
    if (typeof window === 'undefined') return 0.75;
    try {
        const num = parseFloat(localStorage.getItem(LS_VOL) || '0.75');
        if (!Number.isNaN(num) && num >= 0.1 && num <= 1.2) return num;
    } catch {}
    return 0.75;
}

export const soundEnabled = writable<boolean>(readBoolStorage(LS_ENABLED, true));
export const soundPack = writable<SoundPackId>(readPackStorage());
export const soundVolume = writable<number>(readVolStorage());

if (typeof window !== 'undefined') {
    soundEnabled.subscribe((v) => {
        try {
            localStorage.setItem(LS_ENABLED, String(v));
        } catch {}
    });
    soundPack.subscribe((v) => {
        try {
            localStorage.setItem(LS_PACK, v);
        } catch {}
    });
    soundVolume.subscribe((v) => {
        try {
            localStorage.setItem(LS_VOL, String(v));
        } catch {}
        if (masterGain && audioCtx) {
            masterGain.gain.setTargetAtTime(v, audioCtx.currentTime, 0.015);
        }
    });
}

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let whiteNoiseBuf: AudioBuffer | null = null;
let pinkNoiseBuf: AudioBuffer | null = null;
let velvetNoiseBuf: AudioBuffer | null = null;

function buildNoiseBuffer(ctx: AudioContext, seconds: number, kind: 'white' | 'pink' | 'velvet'): AudioBuffer {
    const len = Math.max(256, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);

    if (kind === 'white') {
        for (let i = 0; i < len; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    } else if (kind === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.14;
            b6 = white * 0.115926;
        }
    } else {
        // Sparse crisp impulse crackle / velvet grain for keycap & ceramic transients
        for (let i = 0; i < len; i++) {
            const env = Math.pow(1 - i / len, 1.8);
            data[i] = (Math.random() < 0.28 ? (Math.random() * 2 - 1) : (Math.random() * 0.3 - 0.15)) * env;
        }
    }
    return buf;
}

const initAudio = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();

        masterGain = audioCtx.createGain();
        masterGain.gain.value = get(soundVolume);

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-16, audioCtx.currentTime);
        compressor.knee.setValueAtTime(12, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(6, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.002, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.08, audioCtx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(audioCtx.destination);

        whiteNoiseBuf = buildNoiseBuffer(audioCtx, 0.06, 'white');
        pinkNoiseBuf = buildNoiseBuffer(audioCtx, 0.08, 'pink');
        velvetNoiseBuf = buildNoiseBuffer(audioCtx, 0.05, 'velvet');
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
    }
    return audioCtx;
};

function jitter(val: number, spread = 0.04): number {
    return val * (1 + (Math.random() * 2 - 1) * spread);
}

function playNoiseBurst(
    ctx: AudioContext,
    buf: AudioBuffer | null,
    filterType: BiquadFilterType,
    freqStart: number,
    freqEnd: number,
    q: number,
    gainPeak: number,
    durationSec: number,
    startOffset = 0
) {
    if (!buf || !masterGain) return;
    const t = ctx.currentTime + startOffset;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(q, t);
    filter.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t + durationSec);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    src.start(t);
    src.stop(t + durationSec + 0.005);
}

function playTone(
    ctx: AudioContext,
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    gainPeak: number,
    durationSec: number,
    startOffset = 0,
    attackSec = 0.002
) {
    if (!masterGain) return;
    const t = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(35, freqEnd), t + durationSec);
    }

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(gainPeak, t + attackSec);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationSec);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(t);
    osc.stop(t + durationSec + 0.005);
}

// Pentatonic ratio progression for ultra-pleasing rapid hover runs
const HOVER_SCALE = [1.0, 1.125, 1.25, 1.5, 1.667, 2.0];
let lastHoverMs = 0;
let hoverStreak = 0;

export const playHover = () => {
    if (!get(soundEnabled)) return;
    const now = performance.now();
    if (now - lastHoverMs < 32) return;
    if (now - lastHoverMs > 460) {
        hoverStreak = 0;
    } else {
        hoverStreak = (hoverStreak + 1) % HOVER_SCALE.length;
    }
    lastHoverMs = now;

    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    const ratio = HOVER_SCALE[hoverStreak];

    if (pack === 'crystal') {
        playTone(ctx, 'sine', jitter(1480 * ratio, 0.02), jitter(1820 * ratio, 0.02), 0.022, 0.024);
        playNoiseBurst(ctx, velvetNoiseBuf, 'highpass', 4800, 4800, 1.5, 0.015, 0.01);
    } else if (pack === 'retro98') {
        playNoiseBurst(ctx, whiteNoiseBuf, 'bandpass', jitter(3400 * Math.sqrt(ratio), 0.04), 2200, 3.2, 0.028, 0.011);
    } else if (pack === 'wooden') {
        playTone(ctx, 'sine', jitter(540 * ratio, 0.03), jitter(460 * ratio, 0.03), 0.03, 0.016);
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', 1800 * Math.sqrt(ratio), 1400, 2.0, 0.018, 0.012);
    } else {
        // Creamy Mechanical: crisp ceramic micro-tick + air whisper
        playNoiseBurst(ctx, velvetNoiseBuf, 'bandpass', jitter(3600 * Math.sqrt(ratio), 0.03), 4200, 2.4, 0.032, 0.011);
        playTone(ctx, 'triangle', jitter(1120 * ratio, 0.02), jitter(900 * ratio, 0.02), 0.014, 0.014);
    }
};

export const playClick = (variant: 'primary' | 'soft' | 'heavy' = 'primary') => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    const volScale = variant === 'soft' ? 0.72 : variant === 'heavy' ? 1.15 : 1.0;

    if (pack === 'crystal') {
        playTone(ctx, 'sine', jitter(960, 0.04), jitter(420, 0.04), 0.075 * volScale, 0.036);
        playNoiseBurst(ctx, velvetNoiseBuf, 'bandpass', jitter(4200), 2600, 2.5, 0.055 * volScale, 0.014);
    } else if (pack === 'retro98') {
        // Crisp 90s tactile micro-switch double snap
        playNoiseBurst(ctx, whiteNoiseBuf, 'bandpass', jitter(3200), 1700, 2.2, 0.085 * volScale, 0.013);
        playTone(ctx, 'triangle', jitter(720), jitter(190), 0.065 * volScale, 0.024);
    } else if (pack === 'wooden') {
        // Warm hollow rosewood / marimba tap
        playTone(ctx, 'sine', jitter(390, 0.04), jitter(155, 0.04), 0.095 * volScale, 0.042);
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', jitter(1650), 900, 2.6, 0.05 * volScale, 0.018);
    } else {
        // Creamy Mechanical PBT Keycap Thock + Crisp Switch Snap
        playNoiseBurst(ctx, velvetNoiseBuf, 'bandpass', jitter(2800), 1800, 1.8, 0.075 * volScale, 0.012);
        playTone(ctx, 'sine', jitter(215), jitter(88), 0.11 * volScale, 0.042);
        playTone(ctx, 'triangle', jitter(480), jitter(145), 0.05 * volScale, 0.026);
    }
};

export const playPop = (direction: 'up' | 'down' = 'up') => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    if (direction === 'up') {
        const startF = pack === 'wooden' ? 280 : 320;
        const endF = pack === 'crystal' ? 920 : 760;
        playTone(ctx, 'sine', jitter(startF), jitter(endF), 0.085, 0.048, 0, 0.004);
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', 2400, 3600, 3.0, 0.028, 0.016, 0.008);
    } else {
        playTone(ctx, 'sine', jitter(480), jitter(220), 0.075, 0.046, 0, 0.003);
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', 1800, 900, 2.4, 0.024, 0.016);
    }
};

export const playPaperFlick = () => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    if (pack === 'crystal') {
        playNoiseBurst(ctx, pinkNoiseBuf, 'highpass', 2600, 4200, 1.6, 0.055, 0.022);
        playTone(ctx, 'sine', jitter(1240), jitter(1560), 0.025, 0.025);
    } else if (pack === 'wooden') {
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', jitter(1500), 2200, 1.9, 0.07, 0.024);
    } else {
        playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', jitter(1800), 3200, 2.0, 0.075, 0.02);
        playNoiseBurst(ctx, velvetNoiseBuf, 'bandpass', 3900, 2400, 2.2, 0.035, 0.01);
    }
};

let lastDetentMs = 0;
export const playDetent = () => {
    if (!get(soundEnabled)) return;
    const now = performance.now();
    if (now - lastDetentMs < 42) return;
    lastDetentMs = now;

    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    if (pack === 'wooden') {
        playTone(ctx, 'triangle', jitter(620, 0.03), jitter(360, 0.03), 0.04, 0.012);
    } else {
        playNoiseBurst(ctx, velvetNoiseBuf, 'bandpass', jitter(4100, 0.04), 3100, 3.0, 0.042, 0.009);
        playTone(ctx, 'sine', jitter(880, 0.03), jitter(520, 0.03), 0.022, 0.012);
    }
};

export const playAppOpen = () => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    playClick('soft');
    if (pack === 'retro98') {
        playTone(ctx, 'triangle', 523.25, 523.25, 0.05, 0.08, 0.01);
        playTone(ctx, 'triangle', 783.99, 783.99, 0.055, 0.11, 0.065);
        playTone(ctx, 'sine', 1046.5, 1046.5, 0.04, 0.14, 0.12);
    } else if (pack === 'wooden') {
        playTone(ctx, 'sine', 440, 440, 0.065, 0.07, 0.01);
        playTone(ctx, 'sine', 659.25, 659.25, 0.06, 0.1, 0.065);
    } else {
        playTone(ctx, 'sine', 587.33, 587.33, 0.045, 0.08, 0.012);
        playTone(ctx, 'sine', 880, 880, 0.05, 0.12, 0.068);
    }
};

export const playWindowClose = () => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    playNoiseBurst(ctx, pinkNoiseBuf, 'bandpass', 2200, 950, 2.0, 0.045, 0.022);
    playTone(ctx, 'sine', jitter(540), jitter(260), 0.05, 0.055, 0, 0.003);
};

export const playSuccess = () => {
    if (!get(soundEnabled)) return;
    const ctx = initAudio();
    if (!ctx) return;

    const pack = get(soundPack);
    const wave: OscillatorType = pack === 'retro98' ? 'triangle' : 'sine';
    playTone(ctx, wave, 587.33, 587.33, 0.05, 0.08, 0);
    playTone(ctx, wave, 783.99, 783.99, 0.055, 0.09, 0.048);
    playTone(ctx, wave, 1174.66, 1174.66, 0.05, 0.14, 0.096);
};
