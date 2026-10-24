export type LayerQuality = 'high' | 'medium' | 'low';
export interface PictureLayer {
    quality: LayerQuality;
    width: number;
    height: number;
}
export interface VideoIn {
    codec: string | null;
    width: number;
    height: number;
    fps: number;
    kbps: number;
    layer: LayerQuality | null;
    layers: PictureLayer[];
    lossPct: number;
    jitterMs: number;
    bufferMs: number;
    dropped: number;
    freezes: number;
    frozenMs: number;
    nacks: number;
    plis: number;
    decoder: string | null;
    hardware: boolean | null;
}
export interface AudioIn {
    codec: string | null;
    kbps: number;
    lossPct: number;
    jitterMs: number;
    bufferMs: number;
    concealedPct: number;
}
export interface TransportIn {
    protocol: string | null;
    relayed: boolean | null;
    relayProtocol: string | null;
    rttMs: number | null;
}
export interface MediaServer {
    url: string | null;
    node: string | null;
    region: string | null;
    version: string | null;
}
export type SendLimit = 'bandwidth' | 'cpu' | 'other' | null;
export interface LayerOut {
    rid: string | null;
    active: boolean;
    width: number;
    height: number;
    fps: number;
    kbps: number;
    targetKbps: number | null;
    resentKbps: number;
    limited: SendLimit;
    encoder: string | null;
    hardware: boolean | null;
    lossPct: number;
    rttMs: number | null;
    nacks: number;
    plis: number;
    firs: number;
}
export interface VideoOut {
    source: 'camera' | 'screen';
    codec: string | null;
    capture: {
        width: number;
        height: number;
        fps: number;
    } | null;
    layers: LayerOut[];
    kbps: number;
    limitedMs: {
        bandwidth: number;
        cpu: number;
        other: number;
    };
}
export interface AudioOut {
    codec: string | null;
    kbps: number;
    lossPct: number;
    jitterMs: number;
    rttMs: number | null;
    level: number | null;
    muted: boolean;
}
export interface TransportOut extends TransportIn {
    availableKbps: number | null;
}
export interface SendingStats {
    at: number;
    video: VideoOut[];
    audio: AudioOut | null;
    transport: TransportOut | null;
}
export type PlaybackEventKind = 'joining' | 'joined' | 'first-frame' | 'stalled' | 'resumed' | 'reconnecting' | 'reconnected' | 'rejoined' | 'offline' | 'online' | 'quality' | 'error' | 'left' | 'published' | 'unpublished' | 'too-slow' | 'picture-off' | 'picture-retry';
export interface PlaybackEvent {
    at: number;
    kind: PlaybackEventKind;
    detail?: string;
}
export interface PlaybackSession {
    startupMs: number | null;
    watchedMs: number;
    stalls: number;
    stalledMs: number;
    reconnects: number;
    rejoins: number;
    errors: number;
}
export interface PlaybackStats {
    at: number;
    server: MediaServer | null;
    video: VideoIn | null;
    audio: AudioIn | null;
    transport: TransportIn | null;
    session: PlaybackSession;
    events: PlaybackEvent[];
}
