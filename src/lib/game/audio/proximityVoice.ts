// src/lib/game/audio/proximityVoice.ts
/**
 * Cross-Device WebRTC Mesh & Spatial Proximity Audio Manager for UwU World.
 * Engineered for macOS, iPadOS, and iOS Safari + Chrome compatibility:
 * - Uses real <audio autoplay playsinline> elements for remote stream output (avoiding WebKit silent MediaStreamAudioSourceNode bug).
 * - Pre-allocates 'sendrecv' audio transceivers so WebRTC handshakes complete immediately on room join.
 * - Seamlessly binds microphone track via RTCRtpSender.replaceTrack() + renegotiation when PTT is pressed later.
 * - Queues early ICE candidates until remoteDescription is set.
 */

import { gridDistance } from '../isometric/isoMath';

export interface PeerAudioNode {
    userId: string;
    connection: RTCPeerConnection;
    audioEl?: HTMLAudioElement;
    gainNode?: GainNode;
    pannerNode?: StereoPannerNode;
    analyser?: AnalyserNode;
    stream?: MediaStream;
    isSpeaking: boolean;
    pendingCandidates: RTCIceCandidateInit[];
    makingOffer: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

export const MAX_VOICE_DISTANCE = 12; // Grid tiles radius for proximity voice

export class ProximityVoiceManager {
    private audioCtx: AudioContext | null = null;
    private localStream: MediaStream | null = null;
    private localAnalyser: AnalyserNode | null = null;
    public peers = new Map<string, PeerAudioNode>();

    public isPttActive = false;
    public isMicInitialized = false;
    public isLocalSpeaking = false;
    public isAllMuted = false;
    public micError = '';
    public mutedPeerIds = new Set<string>();

    public onLocalSpeakingChange: (speaking: boolean) => void = () => {};
    public onSignalingMessage: (toUserId: string, payload: { type: 'offer' | 'answer' | 'ice'; data: any }) => void = () => {};

    private myUserId: string;
    private sendSignal?: (targetUserId: string, type: 'offer' | 'answer' | 'ice', data: any) => void;
    private onStateChange: () => void;
    private initPromise: Promise<boolean> | null = null;

    constructor(
        myUserId: string,
        sendSignal?: (targetUserId: string, type: 'offer' | 'answer' | 'ice', data: any) => void,
        onStateChange: () => void = () => {}
    ) {
        this.myUserId = myUserId;
        this.sendSignal = sendSignal;
        this.onStateChange = onStateChange;
    }

    private emitSignal(targetUserId: string, type: 'offer' | 'answer' | 'ice', data: any) {
        this.sendSignal?.(targetUserId, type, data);
        this.onSignalingMessage(targetUserId, { type, data });
    }

    private ensureAudioContext(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this.audioCtx) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
                this.audioCtx = new AudioCtx();
            }
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        return this.audioCtx;
    }

    /**
     * Call on any user pointer/touch/key interaction so iOS/iPadOS Safari unlocks audio playback
     */
    public unlockAudio() {
        this.ensureAudioContext();
        for (const [, peer] of this.peers) {
            if (peer.audioEl && peer.audioEl.paused) {
                peer.audioEl.play().catch(() => {});
            }
        }
    }

    /**
     * Request microphone access and attach the audio track to any already-connected peers.
     */
    public async init(): Promise<boolean> {
        if (this.isMicInitialized && this.localStream) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
                    this.micError = 'Mic requires HTTPS or localhost';
                    this.onStateChange();
                    return false;
                }

                this.ensureAudioContext();

                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                // Mute tracks by default (Push-To-Talk mode)
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = this.isPttActive;
                }

                if (this.audioCtx) {
                    try {
                        const source = this.audioCtx.createMediaStreamSource(this.localStream);
                        this.localAnalyser = this.audioCtx.createAnalyser();
                        this.localAnalyser.fftSize = 256;
                        source.connect(this.localAnalyser);
                    } catch {}
                }

                this.isMicInitialized = true;
                this.micError = '';

                // Attach newly acquired audio track to all existing peer connections
                if (audioTrack) {
                    for (const [remoteUserId, peer] of this.peers) {
                        await this.attachLocalTrackToPeer(remoteUserId, peer, audioTrack);
                    }
                }

                this.onStateChange();
                return true;
            } catch (err: any) {
                this.micError = err?.message || 'Mic permission denied';
                this.isMicInitialized = false;
                this.onStateChange();
                return false;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    private async attachLocalTrackToPeer(
        remoteUserId: string,
        peer: PeerAudioNode,
        audioTrack: MediaStreamTrack
    ) {
        const pc = peer.connection;
        if (pc.signalingState === 'closed') return;

        try {
            // Check if an audio transceiver or sender already exists
            const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
            const audioTransceiver = transceivers.find(
                (t) =>
                    t.sender?.track?.kind === 'audio' ||
                    t.receiver?.track?.kind === 'audio'
            );

            if (audioTransceiver && audioTransceiver.sender) {
                if (audioTransceiver.direction === 'recvonly') {
                    try {
                        audioTransceiver.direction = 'sendrecv';
                    } catch {}
                }
                await audioTransceiver.sender.replaceTrack(audioTrack);
            } else {
                const existingSender = pc.getSenders().find((s) => s.track?.kind === 'audio' || s.track === null);
                if (existingSender) {
                    await existingSender.replaceTrack(audioTrack);
                } else if (this.localStream) {
                    pc.addTrack(audioTrack, this.localStream);
                }
            }

            // Renegotiate so the remote peer updates its receiver state
            if (pc.signalingState === 'stable' && !peer.makingOffer) {
                peer.makingOffer = true;
                try {
                    const offer = await pc.createOffer();
                    if (pc.signalingState === 'stable') {
                        await pc.setLocalDescription(offer);
                        this.emitSignal(remoteUserId, 'offer', pc.localDescription);
                    }
                } finally {
                    peer.makingOffer = false;
                }
            }
        } catch {}
    }

    public startTransmitting() {
        this.setPushToTalk(true);
    }

    public stopTransmitting() {
        this.setPushToTalk(false);
    }

    /**
     * Activate or deactivate Push-To-Talk (Spacebar / Mobile Mic Button)
     */
    public setPushToTalk(active: boolean) {
        this.unlockAudio();

        if (!this.isMicInitialized) {
            if (active) {
                this.isPttActive = true;
                this.onLocalSpeakingChange(true);
                this.onStateChange();
                this.init().then((ok) => {
                    if (ok && this.localStream) {
                        this.localStream.getAudioTracks().forEach((t) => {
                            t.enabled = this.isPttActive;
                        });
                        this.onLocalSpeakingChange(this.isPttActive);
                        this.onStateChange();
                    } else {
                        this.isPttActive = false;
                        this.onLocalSpeakingChange(false);
                        this.onStateChange();
                    }
                });
            } else {
                this.isPttActive = false;
                this.onLocalSpeakingChange(false);
                this.onStateChange();
            }
            return;
        }

        this.isPttActive = active;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = active;
            });
        }

        this.onLocalSpeakingChange(active);
        this.onStateChange();
    }

    /**
     * Establish WebRTC peer connection with a remote player
     */
    public async connectToPeer(remoteUserId: string, initiator: boolean): Promise<PeerAudioNode | null> {
        if (!remoteUserId || remoteUserId === this.myUserId) return null;

        const existing = this.peers.get(remoteUserId);
        if (existing) {
            const state = existing.connection.connectionState;
            if (state !== 'failed' && state !== 'closed' && state !== 'disconnected') {
                return existing;
            }
            this.removePeer(remoteUserId);
        }

        const pc = new RTCPeerConnection(RTC_CONFIG);
        const peerNode: PeerAudioNode = {
            userId: remoteUserId,
            connection: pc,
            isSpeaking: false,
            pendingCandidates: [],
            makingOffer: false
        };

        this.peers.set(remoteUserId, peerNode);

        // Attach local audio track if already initialized, otherwise pre-allocate a sendrecv audio transceiver
        const localTrack = this.localStream?.getAudioTracks()[0];
        if (localTrack && this.localStream) {
            pc.addTrack(localTrack, this.localStream);
        } else if (typeof pc.addTransceiver === 'function') {
            try {
                pc.addTransceiver('audio', { direction: 'sendrecv' });
            } catch {}
        }

        // ICE Candidate Handler
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.emitSignal(remoteUserId, 'ice', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
            }
        };

        pc.onconnectionstatechange = () => {
            const st = pc.connectionState;
            if (st === 'failed' || st === 'closed') {
                this.removePeer(remoteUserId);
            }
        };

        // Remote Track Handler
        pc.ontrack = (event) => {
            const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
            this.setupRemoteAudioPipeline(peerNode, remoteStream);
        };

        if (initiator) {
            try {
                peerNode.makingOffer = true;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.emitSignal(remoteUserId, 'offer', pc.localDescription);
            } catch (err) {
                console.warn('WebRTC Offer Error:', err);
            } finally {
                peerNode.makingOffer = false;
            }
        }

        return peerNode;
    }

    /**
     * Handle incoming signaling messages (Offer, Answer, ICE) from Supabase Realtime Broadcast
     */
    public async handleSignalingMessage(
        fromUserId: string,
        typeOrPayload: 'offer' | 'answer' | 'ice' | { type: 'offer' | 'answer' | 'ice'; data?: any; sdp?: any; candidate?: any },
        maybeData?: any
    ) {
        if (!fromUserId || fromUserId === this.myUserId || !typeOrPayload) return;

        let type: 'offer' | 'answer' | 'ice';
        let data: any;
        if (typeof typeOrPayload === 'string') {
            type = typeOrPayload;
            data = maybeData;
        } else {
            type = typeOrPayload.type;
            data = typeOrPayload.data ?? typeOrPayload.sdp ?? typeOrPayload.candidate;
        }
        if (!type || !data) return;

        let peer = this.peers.get(fromUserId);
        if (!peer) {
            peer = (await this.connectToPeer(fromUserId, false)) || undefined;
        }
        if (!peer) return;

        const pc = peer.connection;

        try {
            if (type === 'offer') {
                // Polite peer resolution if simultaneous offers collide
                const isPolite = this.myUserId > fromUserId;
                const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
                if (offerCollision && !isPolite) {
                    return;
                }

                await pc.setRemoteDescription(new RTCSessionDescription(data));
                await this.flushPendingCandidates(peer);

                // Ensure local track is bound if microphone is already initialized
                const localTrack = this.localStream?.getAudioTracks()[0];
                if (localTrack) {
                    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio' || s.track === null);
                    if (sender && sender.track !== localTrack) {
                        await sender.replaceTrack(localTrack).catch(() => {});
                    }
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.emitSignal(fromUserId, 'answer', pc.localDescription);
            } else if (type === 'answer') {
                if (pc.signalingState === 'have-local-offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));
                    await this.flushPendingCandidates(peer);
                }
            } else if (type === 'ice') {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(data)).catch(() => {});
                } else {
                    peer.pendingCandidates.push(data);
                }
            }
        } catch (err) {
            console.warn('Signaling message error:', err);
        }
    }

    private async flushPendingCandidates(peer: PeerAudioNode) {
        if (!peer.connection.remoteDescription) return;
        while (peer.pendingCandidates.length > 0) {
            const candidate = peer.pendingCandidates.shift();
            if (candidate) {
                try {
                    await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
                } catch {}
            }
        }
    }

    /**
     * Attach remote MediaStream to an HTML5 <audio autoplay playsinline> element
     * for reliable playback across iOS, iPadOS, and macOS, plus WebAudio Analyser for speaking rings.
     */
    private setupRemoteAudioPipeline(peer: PeerAudioNode, stream: MediaStream) {
        if (typeof document === 'undefined') return;
        peer.stream = stream;

        // 1. HTMLAudioElement ensures WebKit/Blink actually decodes and plays the WebRTC audio stream
        if (!peer.audioEl) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            (audio as any).playsInline = true;
            audio.setAttribute('playsinline', 'true');
            audio.setAttribute('webkit-playsinline', 'true');
            audio.controls = false;
            audio.style.display = 'none';
            document.body.appendChild(audio);
            peer.audioEl = audio;
        }

        if (peer.audioEl.srcObject !== stream) {
            peer.audioEl.srcObject = stream;
            peer.audioEl.volume = 1.0;
            peer.audioEl.play().catch(() => {});
        }

        // 2. WebAudio AnalyserNode for speaking indicator visualization
        const ctx = this.ensureAudioContext();
        if (ctx && !peer.analyser) {
            try {
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                source.connect(analyser);
                peer.analyser = analyser;
            } catch {}
        }
    }

    /**
     * Update spatial volume for all connected peers based on 2D grid distance & zone match
     */
    public updateSpatialVolumes(
        myPosOrX: { x: number; y: number } | number,
        remotePositionsOrY: Map<string, { x: number; y: number }> | number,
        maybeRemotePositions?: Map<string, { x: number; y: number }>,
        myMuteAll = false
    ) {
        let myX: number;
        let myY: number;
        let remotePositions: Map<string, { x: number; y: number }>;

        if (typeof myPosOrX === 'object') {
            myX = myPosOrX.x;
            myY = myPosOrX.y;
            remotePositions = remotePositionsOrY as Map<string, { x: number; y: number }>;
        } else {
            myX = myPosOrX;
            myY = remotePositionsOrY as number;
            remotePositions = maybeRemotePositions || new Map();
        }

        const effectiveMute = myMuteAll || this.isAllMuted;

        // 1. Check local speaking volume
        if (this.isPttActive && this.localAnalyser) {
            const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
            this.localAnalyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            this.isLocalSpeaking = avg > 8;
        } else {
            this.isLocalSpeaking = this.isPttActive;
        }

        // 2. Update each remote peer's spatial volume & speaking status
        for (const [userId, peer] of this.peers.entries()) {
            const pos = remotePositions.get(userId);

            if (!pos || effectiveMute || this.mutedPeerIds.has(userId)) {
                if (peer.audioEl) {
                    peer.audioEl.volume = 0;
                }
                peer.isSpeaking = false;
                continue;
            }

            const dist = gridDistance(myX, myY, pos.x, pos.y);
            let targetGain = 0;

            if (dist < MAX_VOICE_DISTANCE) {
                // Smooth inverse distance falloff
                targetGain = Math.max(0, Math.min(1, Math.pow(1 - dist / MAX_VOICE_DISTANCE, 1.35)));
            }

            if (peer.audioEl) {
                peer.audioEl.volume = targetGain;
                if (targetGain > 0 && peer.audioEl.paused) {
                    peer.audioEl.play().catch(() => {});
                }
            }

            // Detect if remote peer is actively speaking
            if (peer.analyser && targetGain > 0.02) {
                const data = new Uint8Array(peer.analyser.frequencyBinCount);
                peer.analyser.getByteFrequencyData(data);
                const avg = data.reduce((a, b) => a + b, 0) / data.length;
                peer.isSpeaking = avg > 8;
            } else {
                peer.isSpeaking = false;
            }
        }
    }

    public toggleUserMute(userId?: string): boolean {
        if (!userId) {
            this.isAllMuted = !this.isAllMuted;
            if (this.isAllMuted) {
                for (const [, peer] of this.peers) {
                    if (peer.audioEl) peer.audioEl.volume = 0;
                }
            }
            return this.isAllMuted;
        }
        if (this.mutedPeerIds.has(userId)) {
            this.mutedPeerIds.delete(userId);
            return false;
        }
        this.mutedPeerIds.add(userId);
        const peer = this.peers.get(userId);
        if (peer?.audioEl) {
            peer.audioEl.volume = 0;
        }
        return true;
    }

    public removePeer(userId: string) {
        const peer = this.peers.get(userId);
        if (peer) {
            try {
                peer.connection.close();
            } catch {}
            if (peer.audioEl) {
                try {
                    peer.audioEl.pause();
                    peer.audioEl.srcObject = null;
                    peer.audioEl.remove();
                } catch {}
            }
            this.peers.delete(userId);
        }
    }

    public destroy() {
        for (const [userId] of this.peers) {
            this.removePeer(userId);
        }
        this.peers.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach((t) => t.stop());
            this.localStream = null;
        }

        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
    }
}
