// This player's account of how the stream plays for it, which the cloud keeps beside the media servers' own record of
// the stream's room: the node it plays from and how long its first picture took, its picture stopping and coming back,
// a picture turned off for a connection too slow for it, its hold on arrivals moving, reconnects and errors, and every
// few minutes a line of how it played meanwhile, when anything went wrong in it. Numbers and moments only: never a name,
// an address or a word of the chat. Each line starts with the seconds since the player started, so one player's lines
// keep their order and their gaps however late a batch arrives.
//
// Best effort in every direction: nothing waits on it, and a batch the cloud doesn't take is not sent again.
import { TRACE_BATCH_MAX, TRACE_EVERY_MS, TRACE_LINE_MAX, TRACE_SESSION_MAX } from "./protocol.js";
// How long a line waits for the ones that come with it.
const TRACE_FLUSH_MS = 2000;
export class StreamTrace {
    constructor(send, now = Date.now) {
        this.send = send;
        this.now = now;
        this.lines = [];
        this.written = 0;
        this.dropped = 0;
        this.lastSent = -Infinity;
        this.timer = null;
        this.start = now();
    }
    // One line, stamped and cut to TRACE_LINE_MAX; past TRACE_SESSION_MAX in all, counted and said once at the next batch.
    add(line) {
        if (this.written + this.lines.length >= TRACE_SESSION_MAX) {
            this.dropped++;
        }
        else {
            this.lines.push(this.stamped(line.replace(/[\r\n]+/g, ' ')).slice(0, TRACE_LINE_MAX));
        }
        this.schedule();
    }
    // The next batch now: what waits, and how many lines went unwritten where it has room.
    flush() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        const batch = this.lines.splice(0, TRACE_BATCH_MAX);
        if (this.dropped > 0 && batch.length < TRACE_BATCH_MAX) {
            batch.push(this.stamped('trace: ' + this.dropped + ' more lines not written'));
            this.dropped = 0;
        }
        if (batch.length === 0)
            return;
        this.written += batch.length;
        this.lastSent = this.now();
        try {
            this.send(batch);
        }
        catch { }
        if (this.lines.length > 0 || this.dropped > 0)
            this.schedule();
    }
    stop() {
        this.flush();
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        this.lines = [];
    }
    stamped(line) {
        return '+' + ((this.now() - this.start) / 1000).toFixed(3) + ' ' + line;
    }
    // The next batch a moment after the first line waiting, and never sooner than TRACE_EVERY_MS after the one before.
    schedule() {
        if (this.timer)
            return;
        const wait = Math.max(TRACE_FLUSH_MS, this.lastSent + TRACE_EVERY_MS - this.now());
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, wait);
    }
}
