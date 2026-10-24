import type { Room, Track, TrackPublication } from "@wordplus/rtc-client";
import type { AudioIn, LayerQuality, MediaServer, PictureLayer, PlaybackEvent, PlaybackEventKind, PlaybackSession, PlaybackStats, TransportIn, VideoIn } from "./playback-types.js";
export type { AudioIn, LayerQuality, MediaServer, PictureLayer, PlaybackEvent, PlaybackEventKind, PlaybackSession, PlaybackStats, TransportIn, VideoIn };
export type Stat = Record<string, unknown> & {
    type?: string;
    id?: string;
};
export type StatsTrack = Track & {
    getRTCStatsReport?: () => Promise<RTCStatsReport | undefined>;
};
export declare const num: (v: unknown) => number;
export declare function layersOf(publication: TrackPublication | undefined): PictureLayer[];
export declare function choosableLayers(layers: PictureLayer[]): PictureLayer[];
export declare function chosenLayer(choice: LayerQuality, layers: PictureLayer[]): LayerQuality;
export declare class PlaybackMonitor {
    private readonly onStalled;
    private readonly now;
    private events;
    private session;
    private room;
    private server;
    private timer;
    private sampling;
    private before;
    private video;
    private audio;
    private transport;
    private joiningAt;
    private joinedAt;
    private lastFrames;
    private progressAt;
    private stalledSince;
    private slow;
    onTooSlow: (() => void) | null;
    constructor(onStalled: (stalled: boolean) => void, now?: () => number);
    note(kind: PlaybackEventKind, detail?: string): void;
    joining(): void;
    begin(room: Room, url: string): void;
    end(): void;
    snapshot(): PlaybackStats;
    private schedule;
    sample(room: Room): Promise<void>;
    private follow;
    private followSlow;
    private resume;
    private read;
}
export declare function pairOf(stats: Map<string, Stat>): Stat | undefined;
export declare function transportOf(stats: Map<string, Stat>): TransportIn | null;
