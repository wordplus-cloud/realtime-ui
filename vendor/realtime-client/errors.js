/**
 * What the SDK refuses with, in rooms, calls and live streams alike: a short code, the same in a rejected promise, an
 * `error` event and a call's end, so a page has one thing to read. The docs' errors page says what each means.
 */
/** A refusal the realtime server or the app's server answered, by its code (`forbidden`, `rate_limited`, `too_large` …). */
export class RealtimeError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'RealtimeError';
    }
}
