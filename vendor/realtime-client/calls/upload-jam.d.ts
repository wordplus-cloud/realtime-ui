/** A round trip from which the upload counts as jammed, ms. */
export declare const JAM_RTT_MS = 3000;
/** How long checks asked and none answered count as jammed, ms. */
export declare const JAM_UNANSWERED_MS = 6000;
/** How long every reading has to say so before it counts, ms: a moment's spike of seconds (one reading of the fleet's
 *  23,090 in a day, an audio call's, 9.5 s and gone 30 s later) is no jam to tell anyone about. Readings come every 2 s
 *  in the browsers and every 5 s in the apps, so it is time, not a count. */
export declare const JAM_FOR_MS = 6000;
/** The round trip under which a reading counts as clear, ms. */
export declare const JAM_CLEAR_RTT_MS = 1000;
/** How long readings have to be clear before it is no longer jammed, ms. */
export declare const JAM_CLEAR_MS = 10000;
/** One reading of the connection this side sends on. Anything not known is left out. */
export interface JamReading {
    /** When it was read, ms. */
    at: number;
    /** The pair's round trip, ms. */
    rttMs?: number;
    /** Its checks sent so far, and those answered. */
    requests?: number;
    responses?: number;
    /** What has arrived on it so far, bytes. */
    bytesReceived?: number;
}
/** A reading from a stats report's candidate pair (`selectedPair`), at `at`. */
export declare function jamReading(pair: any, at: number): JamReading;
export declare class UploadJam {
    private on;
    /** When the readings began to say so, in a row. */
    private since;
    private clearSince;
    private last;
    /** When a check was last answered, or counts began, and the checks sent then. */
    private answeredAt;
    private requestsThen;
    /** Whether the upload is jammed now. */
    get jammed(): boolean;
    /** One reading. Answers whether `jammed` changed. */
    review(r: JamReading): boolean;
}
