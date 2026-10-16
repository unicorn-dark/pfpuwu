// src/lib/game/audio/proximityVoice.ts
/**
 * WebRTC Push-To-Talk Proximity Voice Chat with Spatial Attenuation
 * Features:
 * - Desktop Spacebar Push-To-Talk (PTT) with text-input safety check
 * - Mobile on-screen hold-to-talk
 * - Spatial distance volume falloff (3 tiles = full volume, 10 tiles = 0 volume)
 * - Stereo panning based on relative position
 * - Graceful fallback if microphone is denied or unavailable
 */

import { gridDistance, clamp } from '../isometric/isoMath';

export interface PeerAudioNode {
    peerId: string;
    connection: RTCPeerConnection;
    sourceNode?: MediaStreamAudioSourceNode;
    gainNode?: GainNode;
    panNode?: StereoPannerNode;
    remoteStream?: MediaStream;
}

const ICE_SERVERS: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

export class ProximityVoiceManager {
    private localStream: MediaStream | null = null;
    private audioCtx: AudioContext | null = null;
    private peers = new Map<string, PeerAudioNode>();
    private localUserId: string = '';
    private isPTTActive = false;
    private hasMicAccess = false;
    private isMutedByUser = false;

    // Callbacks
    public onLocalSpeakingChange: (isSpeaking: boolean) => void = () => {};
    public onSignalingMessage: (toUserId: string, payload: any) => void = () => {};

    constructor(userId: string) {
        this.localUserId = userId;
    }

    /**
     * Initializes the Web Audio context and requests microphone access
     */
    public async init(): Promise<boolean> {
        if (typeof window === 'undefined') return false;

        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
            this.audioCtx = new AudioCtx();
        }

        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });

                this.localStream = stream;
                // Mute by default until Push-To-Talk is pressed
                this.localStream.getAudioTracks().forEach((track) => {
                    track.enabled = false;
                });
                this.hasMicAccess = true;
                return true;
            }
        } catch (err) {
            console.warn('[ProximityVoice] Microphone access was not granted or not available:', err);
            this.hasMicAccess = false;
        }

        return false;
    }

    /**
     * Start transmitting voice (Spacebar down or Mobile PTT touchstart)
     */
    public startTransmitting() {
        if (this.isMutedByUser || !this.hasMicAccess || !this.localStream) return;
        if (this.isPTTActive) return;

        this.isPTTActive = true;
        this.localStream.getAudioTracks().forEach((track) => {
            track.enabled = true;
        });

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        this.onLocalSpeakingChange(true);
    }

    /**
     * Stop transmitting voice (Spacebar up or Mobile PTT touchend)
     */
    public stopTransmitting() {
        if (!this.isPTTActive) return;

        this.isPTTActive = false;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                track.enabled = false;
            });
        }

        this.onLocalSpeakingChange(false);
    }

    public getIsTransmitting(): boolean {
        return this.isPTTActive;
    }

    public getHasMic(): boolean {
        return this.hasMicAccess;
    }

    public toggleUserMute(): boolean {
        this.isMutedByUser = !this.isMutedByUser;
        if (this.isMutedByUser && this.isPTTActive) {
            this.stopTransmitting();
        }
        return this.isMutedByUser;
    }

    /**
     * Creates or retrieves a WebRTC connection for a peer
     */
    public async connectToPeer(remoteUserId: string, isInitiator = false) {
        if (this.peers.has(remoteUserId) || remoteUserId === this.localUserId) return;

        const pc = new RTCPeerConnection(ICE_SERVERS);

        const peerNode: PeerAudioNode = {
            peerId: remoteUserId,
            connection: pc
        };
        this.peers.set(remoteUserId, peerNode);

        // Add local audio tracks if we have mic access
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach((track) => {
                pc.addTrack(track, this.localStream!);
            });
        }

        // Handle remote audio stream
        pc.ontrack = (event) => {
            const remoteStream = event.streams[0];
            peerNode.remoteStream = remoteStream;
            this.setupSpatialAudioNode(peerNode, remoteStream);
        };

        // ICE candidate exchange
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignalingMessage(remoteUserId, {
                    type: 'ice',
                    candidate: event.candidate
                });
            }
        };

        if (isInitiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.onSignalingMessage(remoteUserId, {
                    type: 'offer',
                    sdp: pc.localDescription
                });
            } catch (e) {
                console.error('[ProximityVoice] Error creating offer:', e);
            }
        }
    }

    /**
     * Sets up Web Audio GainNode & StereoPanner for a remote peer's stream
     */
    private setupSpatialAudioNode(peerNode: PeerAudioNode, stream: MediaStream) {
        if (!this.audioCtx) return;

        try {
            const source = this.audioCtx.createMediaStreamSource(stream);
            const gain = this.audioCtx.createGain();
            gain.gain.value = 0; // Starts silent until position is calculated

            // Setup stereo panning if supported
            if (this.audioCtx.createStereoPanner) {
                const panner = this.audioCtx.createStereoPanner();
                source.connect(gain);
                gain.connect(panner);
                panner.connect(this.audioCtx.destination);
                peerNode.panNode = panner;
            } else {
                source.connect(gain);
                gain.connect(this.audioCtx.destination);
            }

            peerNode.sourceNode = source;
            peerNode.gainNode = gain;
        } catch (e) {
            console.error('[ProximityVoice] Failed to wire spatial audio nodes:', e);
        }
    }

    /**
     * Handles incoming signaling messages (Offer, Answer, ICE)
     */
    public async handleSignalingMessage(fromUserId: string, payload: any) {
        if (fromUserId === this.localUserId) return;

        if (!this.peers.has(fromUserId)) {
            await this.connectToPeer(fromUserId, false);
        }

        const peerNode = this.peers.get(fromUserId);
        if (!peerNode) return;

        const pc = peerNode.connection;

        try {
            if (payload.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                this.onSignalingMessage(fromUserId, {
                    type: 'answer',
                    sdp: pc.localDescription
                });
            } else if (payload.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            } else if (payload.type === 'ice' && payload.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            }
        } catch (err) {
            console.error('[ProximityVoice] Error handling signaling:', err);
        }
    }

    /**
     * Dynamically updates the volume and panning for each remote peer based on spatial distance
     */
    public updateSpatialVolumes(
        myPos: { x: number; y: number },
        peerPositions: Map<string, { x: number; y: number }>
    ) {
        if (!this.audioCtx) return;

        this.peers.forEach((peerNode, peerId) => {
            if (!peerNode.gainNode) return;

            const pos = peerPositions.get(peerId);
            if (!pos) {
                peerNode.gainNode.gain.setValueAtTime(0, this.audioCtx!.currentTime);
                return;
            }

            const dist = gridDistance(myPos.x, myPos.y, pos.x, pos.y);

            // Proximity attenuation curve:
            // <= 3 tiles: 100% volume
            // 3 to 10 tiles: linear falloff
            // >= 10 tiles: 0% volume (completely silent)
            let volume = 0;
            if (dist <= 3) {
                volume = 1.0;
            } else if (dist < 10) {
                volume = 1.0 - (dist - 3) / 7;
            } else {
                volume = 0;
            }

            peerNode.gainNode.gain.setValueAtTime(
                clamp(volume, 0, 1),
                this.audioCtx!.currentTime
            );

            // Spatial Panning (-1 = left, +1 = right)
            if (peerNode.panNode) {
                const dx = pos.x - myPos.x;
                const pan = clamp(dx / 8, -0.9, 0.9);
                peerNode.panNode.pan.setValueAtTime(pan, this.audioCtx!.currentTime);
            }
        });
    }

    /**
     * Cleans up disconnected peers
     */
    public removePeer(peerId: string) {
        const peer = this.peers.get(peerId);
        if (peer) {
            peer.connection.close();
            this.peers.delete(peerId);
        }
    }

    /**
     * Tears down all audio resources
     */
    public destroy() {
        this.stopTransmitting();
        if (this.localStream) {
            this.localStream.getTracks().forEach((t) => t.stop());
            this.localStream = null;
        }
        this.peers.forEach((peer) => {
            peer.connection.close();
        });
        this.peers.clear();
        if (this.audioCtx && this.audioCtx.state !== 'closed') {
            this.audioCtx.close();
        }
    }
}
