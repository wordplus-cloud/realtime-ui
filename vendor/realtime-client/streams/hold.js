// How long a viewer's browser holds what arrives before playing it (RTCRtpReceiver.jitterBufferTarget), by how its
// connection carries the stream. A connection that plays smoothly keeps the first of the holds, a second, which leaves a
// lost packet time for several tries. One whose picture keeps freezing while packets go missing on the way gets the next,
// two seconds, then three: a retransmission that came too late for one second comes in time for two. A freeze with
// nothing lost and nothing asked again is its sender's or the decoder's, which no hold mends, so it raises nothing. After
// a stretch without trouble it comes back down one, and a hold that has to come back up soon after waits twice as long
// before it tries again.
//
// The browser moves a picture's delay a little at a time (Chrome about 100 ms a second), so a second more takes about
// ten seconds of playing slightly slower, and a second less as long slightly faster, neither of them a jolt. What happens
// while it settles is not counted.
// The holds a viewer moves between, ms, the first on a connection that plays smoothly.
export const VIEWER_HOLDS_MS = Object.freeze([1000, 2000, 3000]);
// Trouble: at least TROUBLE_FREEZES freezes, or TROUBLE_FROZEN_MS frozen in all, over the last TROUBLE_WINDOW_MS of
// watching, while packets of the picture were lost or asked for again in that time.
export const TROUBLE_WINDOW_MS = 30000;
export const TROUBLE_FREEZES = 2;
export const TROUBLE_FROZEN_MS = 1000;
// After a change, this long before trouble counts again: the browser's delay moving to the new hold.
export const SETTLE_MS = 15000;
// Down one after this long watching without trouble; twice as long each time a hold has to come back up within it, up
// to CLEAN_MAX_MS.
export const CLEAN_MS = 5 * 60000;
export const CLEAN_MAX_MS = 40 * 60000;
// A look further from the one before than this is a gap (the page asleep, the room left), not time watched.
const LOOK_GAP_MS = 5000;
export class ViewerHold {
    constructor(holds = VIEWER_HOLDS_MS) {
        this.holds = holds;
        this.level = 0;
        this.window = [];
        this.lastAt = null;
        this.lastWatching = false;
        this.clean = 0;
        this.cleanNeeded = CLEAN_MS;
        this.changedAt = -Infinity;
        this.downAt = -Infinity;
    }
    // The hold now, ms.
    get ms() {
        return this.holds[Math.min(this.level, this.holds.length - 1)] ?? VIEWER_HOLDS_MS[0];
    }
    // Takes a look, and answers the change it makes, if any. Only looks while watching count, and none while the browser
    // settles on a new hold.
    look(l) {
        const before = this.lastAt;
        const watchedSince = this.lastWatching && before !== null && l.at - before <= LOOK_GAP_MS;
        this.lastAt = l.at;
        this.lastWatching = l.watching;
        if (!l.watching || l.at - this.changedAt < SETTLE_MS)
            return null;
        if (watchedSince)
            this.clean += l.at - before;
        this.window.push({ at: l.at, freezes: l.freezes, frozenMs: l.frozenMs, lost: l.lost, nacks: l.nacks });
        this.window = this.window.filter((s) => l.at - s.at < TROUBLE_WINDOW_MS);
        const sum = this.window.reduce((t, s) => ({ freezes: t.freezes + s.freezes, frozenMs: t.frozenMs + s.frozenMs, lost: t.lost + s.lost, nacks: t.nacks + s.nacks }), { freezes: 0, frozenMs: 0, lost: 0, nacks: 0 });
        const trouble = (sum.freezes >= TROUBLE_FREEZES || sum.frozenMs >= TROUBLE_FROZEN_MS) && sum.lost + sum.nacks > 0;
        if (trouble) {
            this.clean = 0;
            if (this.level >= this.holds.length - 1)
                return null;
            if (l.at - this.downAt < CLEAN_MS)
                this.cleanNeeded = Math.min(this.cleanNeeded * 2, CLEAN_MAX_MS);
            return this.move(1, l.at, { ...sum });
        }
        if (this.level > 0 && this.clean >= this.cleanNeeded) {
            const cleanMs = this.clean;
            this.downAt = l.at;
            return this.move(-1, l.at, { cleanMs });
        }
        return null;
    }
    move(by, at, why) {
        const from = this.ms;
        this.level += by;
        this.changedAt = at;
        this.window = [];
        this.clean = 0;
        return { from, to: this.ms, up: by > 0, ...why };
    }
}
