// src/lib/utils/audio.ts
import { writable, get } from 'svelte/store';

// Global mute state, defaults to true
export const soundEnabled = writable(true);

let audioCtx: AudioContext | null = null;

const initAudio = () => {
    if (!audioCtx && typeof window !== "undefined") {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

export const playHover = () => {
    if (!get(soundEnabled)) return; // Abort if muted
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.03);

    gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.03);
};

export const playClick = () => {
    if (!get(soundEnabled)) return; // Abort if muted
    initAudio();
    if (!audioCtx) return;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
};

export const playAppOpen = () => {
    if (!get(soundEnabled)) return; // Abort if muted
    initAudio();
    if (!audioCtx) return;

    const playTone = (freq: number, delay: number) => {
        const osc = audioCtx!.createOscillator();
        const gain = audioCtx!.createGain();

        osc.connect(gain);
        gain.connect(audioCtx!.destination);

        osc.type = 'sine';
        const startTime = audioCtx!.currentTime + delay;

        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.05, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);

        osc.start(startTime);
        osc.stop(startTime + 0.08);
    };

    playTone(600, 0);
    playTone(1200, 0.08);
};
