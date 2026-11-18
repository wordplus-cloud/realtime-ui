import { ViewerHold, type HoldTiming } from "../streams/hold.js";
export declare const CALL_HOLDS_MS: readonly number[];
export declare const CALL_HOLD_TIMING: Readonly<HoldTiming>;
export declare const SOUND_SLACK_MS = 100;
export declare function soundHold(pictureMs: number): number;
export declare class CallHold extends ViewerHold {
    constructor();
}
export declare function receiveHoldOff(): boolean;
