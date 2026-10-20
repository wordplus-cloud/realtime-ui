import type { P2PSource } from "./types.js";
export declare class RemoteMediaTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    readonly source: P2PSource;
    private readonly onPlaybackBlocked;
    private readonly onViewChange;
    readonly sid: string;
    readonly attachedElements: HTMLMediaElement[];
    private readonly stream;
    private viewTracker;
    constructor(mediaStreamTrack: MediaStreamTrack, source: P2PSource, onPlaybackBlocked: (element: HTMLMediaElement) => void, onViewChange?: (() => void) | null);
    get kind(): 'audio' | 'video';
    get isMuted(): boolean;
    attach(element: HTMLMediaElement): HTMLMediaElement;
    play(element: HTMLMediaElement): void;
    wantedHeight(): number;
    detach(element?: HTMLMediaElement): HTMLMediaElement[];
    stop(): void;
}
