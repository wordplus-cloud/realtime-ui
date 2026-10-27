import type { P2PSource } from "./types.js";
export interface QualitySent {
    kind: 'audio' | 'video';
    source: P2PSource;
    kbps?: number;
    fps?: number;
    captured?: number;
    height?: number;
    limit?: string;
    cpuMs?: number;
    bwMs?: number;
    hw?: boolean;
    stallMs?: number;
    queueMs?: number;
    nack?: number;
    pli?: number;
    lost?: number;
}
export interface QualityPlayed {
    kind: 'audio' | 'video';
    source: P2PSource;
    kbps?: number;
    fps?: number;
    height?: number;
    freezes?: number;
    freezeMs?: number;
    dropped?: number;
    lost?: number;
    jbMs?: number;
    concealed?: number;
    hw?: boolean;
}
export interface QualityHealth {
    cpu?: 'nominal' | 'fair' | 'serious' | 'critical';
    cpuMs?: number;
    hangs?: number;
    hangMs?: number;
    hiddenMs?: number;
    battery?: boolean;
    devices?: number;
    machine?: {
        cores?: number;
        memGb?: number;
        gpu?: string;
    };
    path?: {
        sendFailed?: number;
        unanswered?: number;
        switched?: number;
    };
}
export interface QualityReading {
    ms: number;
    rtt?: number;
    out?: number;
    in?: number;
    up?: number;
    sent: QualitySent[];
    played: QualityPlayed[];
    health?: QualityHealth;
}
export interface QualityScope {
    sources: Record<string, P2PSource>;
    sending: Set<P2PSource>;
    playing: Set<P2PSource>;
    sourceOfTrack?: (trackId: unknown) => P2PSource | null;
}
type StatsLike = {
    forEach(fn: (s: any) => void): void;
    get?(id: string): any;
};
interface OutTotals {
    kind: 'audio' | 'video';
    bytes: number;
    packets: number;
    frames?: number;
    produced?: number;
    capturedFps?: number;
    height?: number;
    limit?: string;
    cpuS?: number;
    bwS?: number;
    hw?: boolean;
    sendDelayS?: number;
    nack?: number;
    pli?: number;
    remoteLost?: number;
}
interface InTotals {
    kind: 'audio' | 'video';
    bytes: number;
    packets: number;
    lost: number;
    frames?: number;
    height?: number;
    freezes?: number;
    freezeS?: number;
    dropped?: number;
    jbDelayS?: number;
    jbEmitted?: number;
    samples?: number;
    concealed?: number;
    hw?: boolean;
}
interface PathTotals {
    rtt?: number;
    out?: number;
    in?: number;
    sendFailed?: number;
    asked?: number;
    answered?: number;
    switched?: number;
}
export interface QualityTotals {
    at: number;
    out: Map<P2PSource, OutTotals>;
    in: Map<P2PSource, InTotals>;
    path: PathTotals;
}
/**
 * One stats pass's running totals, by source: each stream this side sends and
 * receives (the mids are the same at both ends, so this side's own map names
 * the other side's streams too), and the selected path. A source with two
 * streams (never, today) adds up.
 */
export declare function qualityTotals(report: StatsLike, scope: Pick<QualityScope, 'sources' | 'sourceOfTrack'>, at?: number): QualityTotals;
/**
 * What changed between two totals, as a reading's tracks and connection:
 * only the sources in `sending` and `playing` at the end, and only what the
 * browser keeps. `stalls`: how long each sent source's capture gave nothing.
 */
export declare function qualityBetween(prev: QualityTotals, now: QualityTotals, scope: Pick<QualityScope, 'sending' | 'playing'>, stalls?: Map<P2PSource, number>): Omit<QualityReading, 'health'>;
export declare function pathBetween(prev: QualityTotals, now: QualityTotals): QualityHealth['path'] | undefined;
/**
 * A peer connection's readings: tick() on every stats pass, reading() when a
 * reading is due. The window runs from the last reading, or from the first
 * pass after the connection came up.
 */
export declare class QualityWatch {
    private base;
    private latest;
    private scope;
    private readonly produced;
    private readonly stalls;
    tick(report: StatsLike, scope: QualityScope, at?: number): void;
    reading(health?: QualityHealth): QualityReading | undefined;
}
export {};
