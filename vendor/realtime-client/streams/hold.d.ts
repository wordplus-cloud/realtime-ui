export declare const VIEWER_HOLDS_MS: readonly number[];
export declare const TROUBLE_WINDOW_MS = 30000;
export declare const TROUBLE_FREEZES = 2;
export declare const TROUBLE_FROZEN_MS = 1000;
export declare const SETTLE_MS = 15000;
export declare const CLEAN_MS: number;
export declare const CLEAN_MAX_MS: number;
export interface HoldLook {
    at: number;
    watching: boolean;
    freezes: number;
    frozenMs: number;
    lost: number;
    nacks: number;
}
export interface HoldChange {
    from: number;
    to: number;
    up: boolean;
    freezes?: number;
    frozenMs?: number;
    lost?: number;
    nacks?: number;
    cleanMs?: number;
}
export declare class ViewerHold {
    private readonly holds;
    private level;
    private window;
    private lastAt;
    private lastWatching;
    private clean;
    private cleanNeeded;
    private changedAt;
    private downAt;
    constructor(holds?: readonly number[]);
    get ms(): number;
    look(l: HoldLook): HoldChange | null;
    private move;
}
