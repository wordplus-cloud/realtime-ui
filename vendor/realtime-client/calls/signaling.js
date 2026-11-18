import { randomId } from "./types.js";
const ACK_TIMEOUT = 8000;
// How long a signal waits for the socket to come back. It used to count
// every second the socket was down as one of its five attempts, so a signal
// made during an outage of more than four seconds was dropped for good — and
// an ICE restart offer lost that way left its side with an offer nobody would
// answer, from which no restart makes another. The relay gives a side whose
// socket has gone this long to return, and a signal waits for it as long.
const SIGNAL_OFFLINE_WAIT = 45000;
// How long a signal waits for the one before it to be acknowledged, once
// that one is on the wire (P2PSignaling.signal).
const SIGNAL_PIPELINE_MS = 250;
// A socket that still says it is connected but answers nothing: a request has
// waited this long and nothing at all has been answered meanwhile. The socket
// only finds out at its ping timeout, up to three quarters of a minute later,
// and until then whatever this side sends sits in it. A Firefox caller's
// socket stalled for 47 s on 31 Oct 2026 while its audio kept flowing, its
// ICE restart offer waited in it all that time, and the restart arrived after
// the connection had come back on its own (a call of 31 Oct 2026). A slow socket
// that does answer, however late each answer, is not stalled: the clock runs
// from the last answer.
const SOCKET_STALL = 5000;
// How many of the latest round trips the estimate is taken from.
const ROUND_TRIPS_KEPT = 5;
// A callee that accepted and then could not join tells the relay, which ends
// the call at the caller as well: the caller stops ringing and waits once the
// acceptance arrives, and it waited on a join that was never coming until it
// hung up. The relay takes a leave from a participant that has not joined,
// so a throwaway session does.
export function leaveUnjoined(transport, callId, reason) {
    try {
        transport.send({ op: 'leave', call_id: callId, session: randomId(16), reason });
    }
    catch (e) { }
}
// A test switch that has this page hear the relay late, its messages and its
// answers alike, as a side on a slow link does: bm_p2p_lag = milliseconds.
// It walks the road of a caller that heard everything five seconds late
// (ppl.travel, 30 Oct 2026) on a working network.
function signalLag() {
    try {
        const ms = Number(window.localStorage.getItem('bm_p2p_lag'));
        return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 20000) : 0;
    }
    catch (e) {
        return 0;
    }
}
// A test switch that has this page's socket stall the way a TCP connection on
// a broken uplink does, still connected while nothing it sends gets through:
// bm_p2p_stall = the time, in milliseconds since 1970, until which it stalls,
// read as each request goes, so a test can stall a call already running. What
// is sent until then goes out at that time, and is answered then.
function stalledUntil(now) {
    try {
        const until = Number(window.localStorage.getItem('bm_p2p_stall'));
        return Number.isFinite(until) && until > now ? Math.min(until, now + 120000) : 0;
    }
    catch (e) {
        return 0;
    }
}
export class P2PSignaling {
    constructor(transport, callId, onMessage) {
        this.transport = transport;
        this.callId = callId;
        this.onMessage = onMessage;
        this.session = randomId(16);
        this.queue = Promise.resolve();
        this.closed = false;
        this.lag = signalLag();
        // The requests on the wire, by when each went, and when anything was last
        // answered: what tells a stalled socket from a quiet one (stalledFor).
        // A stall, once seen, lasts until something is answered: the requests
        // that found it time out and are retried, or given up, and that is not
        // the socket coming back.
        this.inflight = new Map();
        this.inflightSeq = 0;
        this.lastAnswerAt = 0;
        this.stalledSince = 0;
        this.roundTrips = [];
        // A stall a test switch asked for (stallForTest), beside bm_p2p_stall.
        this.testStallUntil = 0;
        // Whether the relay handles this session's signals in their order, which its join says (`ordered`): only then may a
        // signal go without waiting for the one before to be acknowledged. The relay waits on its store before it relays
        // each, and one before 30 Oct 2026 relayed two that came together the other way round: a camera's last two size
        // wishes reversed left it at the smaller.
        this.ordered = false;
        this.stopListening = transport.listen(callId, this.session, (message) => {
            if (this.closed)
                return;
            if (this.lag > 0) {
                window.setTimeout(() => {
                    if (!this.closed)
                        this.onMessage(message);
                }, this.lag);
                return;
            }
            this.onMessage(message);
        });
    }
    get connected() {
        return this.transport.connected;
    }
    get isClosed() {
        return this.closed;
    }
    // How long the socket has sat on a request with nothing at all answered,
    // once that is SOCKET_STALL or more; 0 otherwise. A socket that is down
    // is `connected` false, which the session reads first.
    stalledFor(now = Date.now()) {
        if (this.closed || !this.connected)
            return 0;
        if (this.stalledSince === 0 && this.inflight.size > 0) {
            let oldest = Infinity;
            for (const at of this.inflight.values()) {
                if (at < oldest)
                    oldest = at;
            }
            const since = Math.max(oldest, this.lastAnswerAt);
            if (now - since >= SOCKET_STALL)
                this.stalledSince = since;
        }
        return this.stalledSince > 0 ? now - this.stalledSince : 0;
    }
    // The longest of the latest round trips to the relay and back, in
    // milliseconds: 0 before any. A side waiting for the other side's offer
    // waits that much longer on a slow socket.
    roundTrip() {
        return this.roundTrips.length > 0 ? Math.max(...this.roundTrips) : 0;
    }
    // For a test switch (bm_p2p_hold_sdp): this socket stalls from now, as
    // bm_p2p_stall has it, for `ms`.
    stallForTest(ms) {
        this.testStallUntil = Date.now() + Math.min(Math.max(0, ms), 120000);
    }
    // One request on the wire, counted there until it is answered or given
    // up on (the returned function).
    sendNow(payload, onAnswer) {
        const id = ++this.inflightSeq;
        const sentAt = Date.now();
        const message = { ...payload, call_id: this.callId, session: this.session };
        this.inflight.set(id, sentAt);
        // A late answer, after the request was given up on, still says the
        // socket carries answers again.
        const answered = (response) => {
            const now = Date.now();
            this.inflight.delete(id);
            this.lastAnswerAt = now;
            this.stalledSince = 0;
            this.roundTrips.push(now - sentAt + this.lag);
            if (this.roundTrips.length > ROUND_TRIPS_KEPT)
                this.roundTrips.shift();
            onAnswer(response);
        };
        const until = Math.max(stalledUntil(sentAt), this.testStallUntil > sentAt ? this.testStallUntil : 0);
        if (until > 0) {
            window.setTimeout(() => {
                if (!this.closed)
                    this.transport.send(message, answered);
            }, until - sentAt);
        }
        else {
            this.transport.send(message, answered);
        }
        // Given up on with nothing answered since it went: the stall it waited
        // through is one, whether or not anyone asked meanwhile.
        return () => {
            this.inflight.delete(id);
            if (this.stalledSince === 0) {
                const since = Math.max(sentAt, this.lastAnswerAt);
                if (Date.now() - since >= SOCKET_STALL)
                    this.stalledSince = since;
            }
        };
    }
    // `offlineWait` is how long the request may sit out a socket that is down
    // before the seconds start counting as attempts; `onSent` is told once,
    // when it first goes out on a connected socket.
    request(payload, attempts = 3, offlineWait = 0, onSent) {
        return new Promise((resolve, reject) => {
            let waited = 0;
            let told = false;
            const attempt = (n) => {
                if (this.closed) {
                    reject(new Error('closed'));
                    return;
                }
                if (!this.connected) {
                    if (waited < offlineWait) {
                        waited += 1000;
                        window.setTimeout(() => attempt(n), 1000);
                    }
                    else if (n < attempts) {
                        window.setTimeout(() => attempt(n + 1), 1000);
                    }
                    else {
                        reject(new Error('socket_disconnected'));
                    }
                    return;
                }
                let settled = false;
                let giveUp = () => { };
                const timer = window.setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    giveUp();
                    if (n < attempts) {
                        attempt(n + 1);
                    }
                    else {
                        reject(new Error('ack_timeout'));
                    }
                }, ACK_TIMEOUT);
                giveUp = this.sendNow(payload, (response) => {
                    if (settled)
                        return;
                    settled = true;
                    window.clearTimeout(timer);
                    if (this.lag > 0) {
                        window.setTimeout(() => resolve(response), this.lag);
                    }
                    else {
                        resolve(response);
                    }
                });
                if (!told && onSent) {
                    told = true;
                    onSent();
                }
            };
            attempt(1);
        });
    }
    join(params) {
        return this.request({ op: 'join', ...params }).then((ack) => {
            if (ack && ack.ordered === true)
                this.ordered = true;
            return ack;
        });
    }
    // Signals go out in their order. To a relay that handles them in order
    // (`ordered`), each goes once the one before it is on the wire, which a
    // connected socket keeps in order; to any other, once the one before it
    // is acknowledged, as before. Waiting for each acknowledgement, a side
    // that heard the relay late sent one signal a round trip: six seconds
    // behind, a caller's answer to the other side's restart sat behind its
    // own candidates until the restart was given up (bm_p2p_lag, 30 Oct
    // 2026). A quick acknowledgement still goes first, up to
    // SIGNAL_PIPELINE_MS, and a signal that is not answered is sent again by
    // itself, as before; the relay drops a repeat by its nonce. While the
    // socket is down they wait in order for it.
    signal(generation, body) {
        const nonce = randomId(16);
        if (!this.ordered) {
            const task = () => this.request({ op: 'signal', generation, nonce, body }, 5, SIGNAL_OFFLINE_WAIT);
            const next = this.queue.then(task, task);
            this.queue = next.catch(() => undefined);
            return next;
        }
        let release = () => { };
        const onWire = new Promise((resolve) => { release = resolve; });
        const task = () => {
            const sent = this.request({ op: 'signal', generation, nonce, body }, 5, SIGNAL_OFFLINE_WAIT, () => window.setTimeout(release, SIGNAL_PIPELINE_MS));
            sent.then(release, release);
            return sent;
        };
        const next = this.queue.then(task, task);
        this.queue = onWire;
        return next;
    }
    sync(lastId) {
        return this.request({ op: 'sync', last_id: lastId });
    }
    // Asked for on the way into an ICE restart, which must not wait on it:
    // one attempt, and the restart races it against a short clock and goes
    // on with the credentials it has.
    iceServers() {
        return this.request({ op: 'ice_servers' }, 1);
    }
    alive() {
        return this.request({ op: 'alive' }, 1);
    }
    // This side's counters, every couple of seconds while the direct path
    // runs; the reply carries the other side's and, when the relay has
    // judged the path dead, the room. One attempt: the next pulse is two
    // seconds away. A quality reading rides on one when it is due.
    pulse(pulse, quality) {
        return this.request(quality ? { op: 'pulse', pulse, quality } : { op: 'pulse', pulse }, 1);
    }
    // What this side is running the call on, for the call record. Best
    // effort: a call is not worth failing over its own bookkeeping.
    report(report) {
        return this.request({ op: 'report', report }, 1);
    }
    // What this side saw, for the call's readable trace. A report only exists
    // for a call that got far enough to have one, and the calls worth reading
    // about are the ones that did not: this goes out while it is happening.
    // Nothing waits on it, but a batch that a hiccup swallows is the account
    // of the very seconds worth reading, so it is tried three times and the
    // session puts a batch that still failed back in front of the next one.
    trace(lines) {
        return this.request({ op: 'trace', lines }, 3);
    }
    // Waits out an outage like a signal: the relay learning of it is what
    // moves the other side, and a side that gave up while its socket was
    // down used to leave the other one on a dead direct path.
    failed(reason) {
        return this.request({ op: 'failed', reason }, 3, SIGNAL_OFFLINE_WAIT);
    }
    leave(reason) {
        return this.request({ op: 'leave', reason }, 2);
    }
    close() {
        this.closed = true;
        this.stopListening();
    }
}
