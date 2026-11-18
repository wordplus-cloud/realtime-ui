// Whether the upload this side sends on is jammed, so the person can be told: what they send waits seconds on their own
// line, or gets no answer at all, while what is sent to them still arrives.
//
// A person in a real group call (2026-11-08 and 09): the round trip of his own connection's checks 1.7-26 s
// and the node's 13-75 s, 40-85% of what he sent lost, his signal giving up every 25-30 s, while his download carried
// 2-3 Mbit/s with nothing lost. He mostly sent next to nothing then: in 22 of his 31 readings over 5 s the node got 50
// kbit/s or less of him, so the queue was not of his making but another upload on his line, or the line stalling. The
// mesh lab gave the same with a second sender filling a 400 kbit/s line 15 s of every minute, 58% of his picture frozen
// for his viewer, and no move of the call's helps it (66% frozen over TCP). A line that is only narrow never got there:
// his browser kept its own queue under 1.7 s on 400 kbit/s, a microphone in RED included. So a round trip of seconds is
// the line's, and the one who can mend it is the person: whatever else uploads on their network.
//
// A reading is the selected candidate pair of the connection this side sends on, as the stats loops already read it
// (the room's microphone reader, a direct call's stats), nothing measured for it. Jammed takes every reading saying so for
// JAM_FOR_MS: the pair's round trip JAM_RTT_MS or more, or its checks asked and none answered for
// JAM_UNANSWERED_MS (a check's answer waits in the same queue, so the round trip it would read comes late, if at all),
// while something still arrives on it, so a connection that is gone altogether, which the call already shows as
// reconnecting, isn't called jammed. It clears after JAM_CLEAR_MS of readings with the round trip under JAM_CLEAR_RTT_MS
// and the checks answered. A pair whose counts go back is a new one (a resume restarts ICE): its counts start again and
// what was decided stays.
/** A round trip from which the upload counts as jammed, ms. */
export const JAM_RTT_MS = 3000;
/** How long checks asked and none answered count as jammed, ms. */
export const JAM_UNANSWERED_MS = 6000;
/** How long every reading has to say so before it counts, ms: a moment's spike of seconds (one reading of the fleet's
 *  23,090 in a day, an audio call's, 9.5 s and gone 30 s later) is no jam to tell anyone about. Readings come every 2 s
 *  in the browsers and every 5 s in the apps, so it is time, not a count. */
export const JAM_FOR_MS = 6000;
/** The round trip under which a reading counts as clear, ms. */
export const JAM_CLEAR_RTT_MS = 1000;
/** How long readings have to be clear before it is no longer jammed, ms. */
export const JAM_CLEAR_MS = 10000;
/** A reading from a stats report's candidate pair (`selectedPair`), at `at`. */
export function jamReading(pair, at) {
    const num = (v) => typeof v === 'number' && isFinite(v) ? v : undefined;
    const rtt = num(pair?.currentRoundTripTime);
    return {
        at,
        rttMs: rtt === undefined ? undefined : Math.round(rtt * 1000),
        requests: num(pair?.requestsSent) ?? num(pair?.consentRequestsSent),
        responses: num(pair?.responsesReceived),
        bytesReceived: num(pair?.bytesReceived),
    };
}
export class UploadJam {
    constructor() {
        this.on = false;
        /** When the readings began to say so, in a row. */
        this.since = null;
        this.clearSince = null;
        this.last = null;
        /** When a check was last answered, or counts began, and the checks sent then. */
        this.answeredAt = 0;
        this.requestsThen = 0;
    }
    /** Whether the upload is jammed now. */
    get jammed() {
        return this.on;
    }
    /** One reading. Answers whether `jammed` changed. */
    review(r) {
        const last = this.last;
        const fresh = !last
            || (r.requests ?? 0) < (last.requests ?? 0)
            || (r.responses ?? 0) < (last.responses ?? 0)
            || (r.bytesReceived ?? 0) < (last.bytesReceived ?? 0);
        this.last = r;
        if (fresh) {
            this.answeredAt = r.at;
            this.requestsThen = r.requests ?? 0;
            return false;
        }
        if ((r.responses ?? 0) > (last.responses ?? 0)) {
            this.answeredAt = r.at;
            this.requestsThen = r.requests ?? 0;
        }
        const unanswered = (r.requests ?? 0) > this.requestsThen && r.at - this.answeredAt >= JAM_UNANSWERED_MS;
        const arrives = (r.bytesReceived ?? 0) > (last.bytesReceived ?? 0);
        const slow = (r.rttMs ?? 0) >= JAM_RTT_MS;
        if (!this.on) {
            if (!(arrives && (slow || unanswered))) {
                this.since = null;
                return false;
            }
            if (this.since === null)
                this.since = r.at;
            if (r.at - this.since < JAM_FOR_MS)
                return false;
            this.on = true;
            this.since = null;
            this.clearSince = null;
            return true;
        }
        // a browser that gives no round trip clears on its checks answered alone
        const clear = !unanswered && (r.rttMs === undefined || r.rttMs < JAM_CLEAR_RTT_MS);
        if (!clear) {
            this.clearSince = null;
            return false;
        }
        if (this.clearSince === null)
            this.clearSince = r.at;
        if (r.at - this.clearSince < JAM_CLEAR_MS)
            return false;
        this.on = false;
        this.clearSince = null;
        return true;
    }
}
