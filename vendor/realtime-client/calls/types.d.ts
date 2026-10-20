import type { CallUser } from "./users.js";
export type P2PSource = 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio';
export type P2PQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';
export type P2PConnection = 'connecting' | 'connected' | 'reconnecting' | 'closed';
export interface IceServer {
    urls: string[];
    username?: string;
    credential?: string;
}
export interface MediaState {
    camera: boolean;
    microphone: boolean;
    screen_share: boolean;
    screen_share_audio: boolean;
}
export interface ViewHint {
    camera?: number;
    screen_share?: number;
}
export declare const VIEW_STEPS: number[];
export interface CodecScore {
    ok: boolean;
    hw: boolean;
    smooth: boolean;
    fast: boolean;
}
export interface CodecCaps {
    families: Record<string, {
        enc: CodecScore;
        dec: CodecScore;
    }>;
    switch: boolean;
    engine?: 'chromium' | 'gecko' | 'webkit' | 'native';
    h264Baseline?: boolean;
}
export type CodecDirection = 'enc' | 'dec';
export type SignalBody = {
    kind: 'sdp';
    description: RTCSessionDescriptionInit;
    mids: Record<string, P2PSource>;
} | {
    kind: 'candidate';
    candidate: RTCIceCandidateInit;
} | {
    kind: 'state';
    state: MediaState;
} | {
    kind: 'view';
    view: ViewHint;
} | {
    kind: 'caps';
    caps: CodecCaps;
} | {
    kind: 'refresh';
    source: 'camera' | 'screen_share';
} | {
    kind: 'reacquire';
    source: 'microphone' | 'camera';
};
export interface SealedSignal {
    sealed: 1;
    iv: string;
    data: string;
}
export interface SignalEnvelope {
    id: string;
    from: CallUser;
    from_epoch: number;
    generation: number;
    body: SignalBody | SealedSignal | null;
}
export interface SfuHandoff {
    token: string;
    room: string;
    server?: string;
}
export interface JoinAck {
    ok: boolean;
    error?: string;
    reason?: string;
    mode?: 'p2p' | 'sfu';
    role?: 'polite' | 'impolite';
    generation?: number;
    ice_servers?: IceServer[];
    ice_expires_at?: number;
    thread_id?: number;
    type?: 'audio' | 'video';
    peer?: {
        user_id: CallUser | null;
        present: boolean;
        gone: boolean;
        epoch: number;
    };
    replay?: SignalEnvelope[];
    sfu?: SfuHandoff;
}
export interface SignalAck {
    ok: boolean;
    error?: string;
    id?: string;
    queued?: boolean;
    duplicate?: boolean;
    generation?: number;
}
export interface SyncAck {
    ok: boolean;
    error?: string;
    generation?: number;
    mode?: 'p2p' | 'sfu';
    replay?: SignalEnvelope[];
}
export interface IceAck {
    ok: boolean;
    ice_servers?: IceServer[];
    ice_expires_at?: number;
    sfu?: SfuHandoff;
}
export interface FailedAck {
    ok: boolean;
    mode?: 'p2p' | 'sfu';
    sfu?: SfuHandoff;
}
export interface AliveAck {
    ok: boolean;
    error?: string;
    reason?: string;
    generation?: number;
    mode?: 'p2p' | 'sfu';
    sfu?: SfuHandoff;
}
export interface PulseBody {
    ice: string;
    in: {
        a: number;
        v: number;
    };
    out: {
        a: number;
        v: number;
    };
}
export interface PeerPulse extends PulseBody {
    at: number;
}
export interface PulseAck {
    ok: boolean;
    error?: string;
    mode?: 'p2p' | 'sfu';
    strikes?: number;
    peer?: PeerPulse | null;
    sfu?: SfuHandoff;
}
export interface ServerMessage {
    op: 'ready' | 'signal' | 'peer_lost' | 'peer_back' | 'fallback' | 'ended';
    call_id: number | string;
    session: string;
    generation?: number;
    peer?: {
        user_id: CallUser;
        epoch: number;
    };
    id?: string;
    from?: number;
    from_epoch?: number;
    body?: SignalBody | SealedSignal | null;
    grace_ms?: number;
    sfu?: SfuHandoff;
    reason?: string;
    by?: number | null;
    thread_id?: number;
    type?: 'audio' | 'video';
}
export interface P2PStats {
    bytesSent: number;
    bytesReceived: number;
    rtt: number | null;
    packetLoss: number;
    quality: P2PQuality;
    candidatePair: {
        local: string | null;
        remote: string | null;
        protocol: string | null;
    } | null;
    restarts: number;
    codecs: {
        videoSend: string | null;
        videoRecv: string | null;
        audioSend: string | null;
        audioRecv: string | null;
    };
    impl: {
        enc: string | null;
        dec: string | null;
    };
    counters: P2PCounters;
}
export interface P2PCounters {
    inAudio: number;
    inVideo: number;
    outAudio: number;
    outVideo: number;
    remoteAudio: number;
    remoteVideo: number;
    remoteAt: number;
}
export declare function randomId(length?: number): string;
export declare function compareStreamIds(a: string, b: string): number;
