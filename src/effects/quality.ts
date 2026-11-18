// When the background slows the device down. Every device that can run the effects runs the one model, PP-HumanSegV2
// (segmenter.ts), and none goes back to a quicker, worse one by itself any more (asked on 2026-11-02: "I do not want
// the ai blur to use bad model even at mobile browsers as it works not very good, I want it to use good model or be
// disabled by user if it loads his device too much"). Where it is too much for the device, the person is told so once
// and offered Turn Off (the call screens' notice, inc/calls/effects.ts): the processor says it with SLOW_EVENT.
//
// What counts: one frame in five is timed whole, the model and the passes, the GPU waited for before and after it
// (camera.ts). A second whose middle passes SLOW_MS is slow, and SLOW_SECONDS of them in a row say so, once for the
// processor. 50 ms is a camera at 20 frames a second at best, which shows as stutter and keeps the device busy all
// the time: a computer takes some 15 (an M1 Max 13 ms for the model, a few for the passes). The first second, the GPU
// programs compiling, and the seconds the tab is hidden, when a browser may slow its work, are not counted.
//
// Until 2026-11-02 the device's outcome was kept by the browser (`wordplus-call-effects-quality` and
// `wordplus-call-effects-trial`), and three calls in a row gone back to the quick model started the next one on it.
// Neither is read now, and both are cleared.

/** The event on the page when the background has slowed the device for SLOW_SECONDS: `detail.ms`, the second's middle. */
export const SLOW_EVENT = "wordplus-call-effects-slow";

/** The middle of a second's timed frames above which the second is slow, in ms. */
export const SLOW_MS = 50;
/** How many slow seconds in a row say the device is slowed. */
export const SLOW_SECONDS = 5;
/** How long after the processor starts before its frames are timed, in ms: its GPU programs compile on its first. */
export const SETTLE_MS = 1000;

/** What the browser kept under the rule before, cleared (camera.ts, as a processor starts). */
export const OLD_KEYS = [ "wordplus-call-effects-quality", "wordplus-call-effects-trial" ];

export function forgetOldRule(): void {
    try {
        for ( const key of OLD_KEYS ) window.localStorage.removeItem( key );
    } catch {
        // A browser that keeps nothing kept nothing of it either.
    }
}

export const middle = ( times: number[] ): number => {
    const sorted = [ ...times ].sort( ( a, b ) => a - b );
    return sorted.length ? sorted[ Math.floor( sorted.length / 2 ) ] : Infinity;
};

/**
 * The frames' times, second by second: feed() says true once, the first time SLOW_SECONDS slow seconds have come in a
 * row, and never again for this processor.
 */
export class Slowness {
    private times: number[] = [];
    private since = 0;
    private seconds = 0;
    private told = false;
    /** The middle of the last second counted. */
    last = 0;

    constructor( private readonly started: number ) {}

    feed( took: number, now: number, hidden = false ): boolean {
        if ( this.told || now - this.started < SETTLE_MS ) return false;
        if ( hidden ) {
            this.times = [];
            this.seconds = 0;
            return false;
        }
        if ( ! this.times.length ) this.since = now;
        this.times.push( took );
        if ( now - this.since < 1000 ) return false;
        this.last = middle( this.times );
        this.times = [];
        this.seconds = this.last > SLOW_MS ? this.seconds + 1 : 0;
        if ( this.seconds < SLOW_SECONDS ) return false;
        this.told = true;
        return true;
    }
}
