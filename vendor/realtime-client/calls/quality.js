const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
const add = (a, b) => a === undefined ? b : b === undefined ? a : a + b;
const round1 = (v) => Math.round(v * 10) / 10;
/**
 * One stats pass's running totals, by source: each stream this side sends and
 * receives (the mids are the same at both ends, so this side's own map names
 * the other side's streams too), and the selected path. A source with two
 * streams (never, today) adds up.
 */
export function qualityTotals(report, scope, at = Date.now()) {
    const byId = new Map();
    report.forEach((s) => { if (s && s.id)
        byId.set(s.id, s); });
    const totals = { at, out: new Map(), in: new Map(), path: {} };
    let transport = null;
    let pair = null;
    report.forEach((s) => {
        if (!s)
            return;
        if (s.type === 'outbound-rtp') {
            const source = scope.sources[String(s.mid ?? '')];
            if (!source || s.kind !== 'audio' && s.kind !== 'video')
                return;
            const prev = totals.out.get(source);
            const capture = s.mediaSourceId ? byId.get(s.mediaSourceId) : undefined;
            const remote = s.remoteId ? byId.get(s.remoteId) : undefined;
            const durations = s.qualityLimitationDurations;
            totals.out.set(source, {
                kind: s.kind,
                bytes: (prev?.bytes ?? 0) + (num(s.bytesSent) ?? 0),
                packets: (prev?.packets ?? 0) + (num(s.packetsSent) ?? 0),
                frames: add(prev?.frames, num(s.framesSent) ?? num(s.framesEncoded)),
                produced: prev?.produced ?? num(capture?.frames),
                capturedFps: prev?.capturedFps ?? num(capture?.framesPerSecond),
                height: Math.max(prev?.height ?? 0, num(s.frameHeight) ?? 0) || undefined,
                limit: typeof s.qualityLimitationReason === 'string' ? s.qualityLimitationReason : prev?.limit,
                cpuS: add(prev?.cpuS, num(durations?.cpu)),
                bwS: add(prev?.bwS, num(durations?.bandwidth)),
                hw: typeof s.powerEfficientEncoder === 'boolean' ? s.powerEfficientEncoder : prev?.hw,
                sendDelayS: add(prev?.sendDelayS, num(s.totalPacketSendDelay)),
                nack: add(prev?.nack, num(s.nackCount)),
                pli: add(prev?.pli, num(s.pliCount)),
                remoteLost: add(prev?.remoteLost, remote ? Math.max(0, num(remote.packetsLost) ?? 0) : undefined)
            });
        }
        else if (s.type === 'inbound-rtp') {
            const source = scope.sources[String(s.mid ?? '')] ?? scope.sourceOfTrack?.(s.trackIdentifier) ?? null;
            if (!source || s.kind !== 'audio' && s.kind !== 'video')
                return;
            const prev = totals.in.get(source);
            const concealed = num(s.concealedSamples);
            totals.in.set(source, {
                kind: s.kind,
                bytes: (prev?.bytes ?? 0) + (num(s.bytesReceived) ?? 0),
                packets: (prev?.packets ?? 0) + (num(s.packetsReceived) ?? 0),
                lost: (prev?.lost ?? 0) + Math.max(0, num(s.packetsLost) ?? 0),
                frames: add(prev?.frames, num(s.framesDecoded)),
                height: Math.max(prev?.height ?? 0, num(s.frameHeight) ?? 0) || undefined,
                freezes: add(prev?.freezes, num(s.freezeCount)),
                freezeS: add(prev?.freezeS, num(s.totalFreezesDuration)),
                dropped: add(prev?.dropped, num(s.framesDropped)),
                jbDelayS: add(prev?.jbDelayS, num(s.jitterBufferDelay)),
                jbEmitted: add(prev?.jbEmitted, num(s.jitterBufferEmittedCount)),
                samples: add(prev?.samples, num(s.totalSamplesReceived)),
                // made up while the other side was silent costs nothing anyone hears
                concealed: add(prev?.concealed, concealed === undefined ? undefined : concealed - (num(s.silentConcealedSamples) ?? 0)),
                hw: typeof s.powerEfficientDecoder === 'boolean' ? s.powerEfficientDecoder : prev?.hw
            });
        }
        else if (s.type === 'transport' && s.selectedCandidatePairId && !transport) {
            transport = s;
        }
        else if (s.type === 'candidate-pair' && s.state === 'succeeded' && (s.selected || s.nominated) && !pair) {
            pair = s;
        }
    });
    // The transport's own word on the selected pair first; Firefox has no
    // transport entry and marks the pair instead.
    const selected = (transport ? byId.get(transport.selectedCandidatePairId) : null) ?? pair;
    if (selected) {
        const rtt = num(selected.currentRoundTripTime);
        const out = num(selected.availableOutgoingBitrate);
        const inbound = num(selected.availableIncomingBitrate);
        totals.path = {
            rtt: rtt === undefined ? undefined : Math.round(rtt * 1000),
            out: out === undefined ? undefined : Math.round(out / 1000),
            in: inbound === undefined ? undefined : Math.round(inbound / 1000),
            sendFailed: num(selected.packetsDiscardedOnSend),
            asked: num(selected.consentRequestsSent) ?? num(selected.requestsSent),
            answered: num(selected.responsesReceived),
            switched: num(transport?.selectedCandidatePairChanges)
        };
    }
    return totals;
}
// What climbed between two totals; undefined where either has none or it went
// back (a stream that started over).
const delta = (a, b) => a !== undefined && b !== undefined && b >= a ? b - a : undefined;
/**
 * What changed between two totals, as a reading's tracks and connection:
 * only the sources in `sending` and `playing` at the end, and only what the
 * browser keeps. `stalls`: how long each sent source's capture gave nothing.
 */
export function qualityBetween(prev, now, scope, stalls = new Map()) {
    const ms = Math.max(0, Math.round(now.at - prev.at));
    const seconds = ms / 1000;
    const reading = { ms, sent: [], played: [] };
    if (now.path.rtt !== undefined)
        reading.rtt = now.path.rtt;
    if (now.path.out !== undefined)
        reading.out = now.path.out;
    if (now.path.in !== undefined)
        reading.in = now.path.in;
    let upSent = 0;
    let upLost = 0;
    for (const [source, n] of now.out) {
        const p = prev.out.get(source);
        if (!p || !seconds)
            continue;
        const packets = delta(p.packets, n.packets);
        const lost = delta(p.remoteLost, n.remoteLost);
        if (packets !== undefined && lost !== undefined) {
            upSent += packets;
            upLost += lost;
        }
        if (!scope.sending.has(source))
            continue;
        const t = { kind: n.kind, source };
        const bytes = delta(p.bytes, n.bytes);
        if (bytes !== undefined)
            t.kbps = Math.round(bytes * 8 / seconds / 1000);
        if (n.kind === 'video') {
            const frames = delta(p.frames, n.frames);
            const produced = delta(p.produced, n.produced);
            if (frames !== undefined)
                t.fps = round1(frames / seconds);
            if (produced !== undefined)
                t.captured = round1(produced / seconds);
            else if (n.capturedFps !== undefined)
                t.captured = round1(n.capturedFps);
            if (n.height)
                t.height = n.height;
            if (n.limit)
                t.limit = n.limit;
            const cpu = delta(p.cpuS, n.cpuS);
            const bw = delta(p.bwS, n.bwS);
            if (cpu !== undefined)
                t.cpuMs = Math.round(cpu * 1000);
            if (bw !== undefined)
                t.bwMs = Math.round(bw * 1000);
            if (n.hw !== undefined)
                t.hw = n.hw;
            const stall = stalls.get(source);
            if (stall !== undefined)
                t.stallMs = Math.round(stall);
            const pli = delta(p.pli, n.pli);
            if (pli !== undefined)
                t.pli = pli;
        }
        const delay = delta(p.sendDelayS, n.sendDelayS);
        if (delay !== undefined && packets)
            t.queueMs = round1(delay * 1000 / packets);
        const nack = delta(p.nack, n.nack);
        if (nack !== undefined)
            t.nack = nack;
        if (packets && lost !== undefined)
            t.lost = round1(Math.min(100, lost * 100 / packets));
        reading.sent.push(t);
    }
    if (upSent > 0)
        reading.up = round1(Math.min(100, upLost * 100 / upSent));
    for (const [source, n] of now.in) {
        const p = prev.in.get(source);
        if (!p || !seconds || !scope.playing.has(source))
            continue;
        const t = { kind: n.kind, source };
        const bytes = delta(p.bytes, n.bytes);
        const received = delta(p.packets, n.packets);
        const lost = delta(p.lost, n.lost);
        if (bytes !== undefined)
            t.kbps = Math.round(bytes * 8 / seconds / 1000);
        if (received !== undefined && lost !== undefined && received + lost > 0)
            t.lost = round1(lost * 100 / (received + lost));
        const jbDelay = delta(p.jbDelayS, n.jbDelayS);
        const jbEmitted = delta(p.jbEmitted, n.jbEmitted);
        if (jbDelay !== undefined && jbEmitted)
            t.jbMs = Math.round(jbDelay * 1000 / jbEmitted);
        if (n.kind === 'video') {
            const frames = delta(p.frames, n.frames);
            if (frames !== undefined)
                t.fps = round1(frames / seconds);
            if (n.height)
                t.height = n.height;
            const freezes = delta(p.freezes, n.freezes);
            if (freezes !== undefined) {
                t.freezes = freezes;
                const frozen = delta(p.freezeS, n.freezeS);
                if (frozen !== undefined)
                    t.freezeMs = Math.round(frozen * 1000);
            }
            const dropped = delta(p.dropped, n.dropped);
            if (dropped !== undefined)
                t.dropped = dropped;
            if (n.hw !== undefined)
                t.hw = n.hw;
        }
        else {
            const samples = delta(p.samples, n.samples);
            const concealed = delta(p.concealed, n.concealed);
            if (samples && concealed !== undefined)
                t.concealed = round1(Math.min(100, concealed * 100 / samples));
        }
        reading.played.push(t);
    }
    return reading;
}
// What a connection's path did between two totals: sends that failed, checks
// left unanswered, switches of path.
export function pathBetween(prev, now) {
    const out = {};
    const failed = delta(prev.path.sendFailed, now.path.sendFailed);
    const asked = delta(prev.path.asked, now.path.asked);
    const answered = delta(prev.path.answered, now.path.answered);
    const switched = delta(prev.path.switched, now.path.switched);
    if (failed)
        out.sendFailed = failed;
    if (asked !== undefined && answered !== undefined && asked > answered)
        out.unanswered = asked - answered;
    if (switched)
        out.switched = switched;
    return Object.keys(out).length ? out : undefined;
}
/**
 * A peer connection's readings: tick() on every stats pass, reading() when a
 * reading is due. The window runs from the last reading, or from the first
 * pass after the connection came up.
 */
export class QualityWatch {
    constructor() {
        this.base = null;
        this.latest = null;
        this.scope = null;
        // each sent video source's capture, as the last pass read it, and how long
        // in the window it gave no frame while on
        this.produced = new Map();
        this.stalls = new Map();
    }
    tick(report, scope, at = Date.now()) {
        const totals = qualityTotals(report, scope, at);
        this.latest = totals;
        this.scope = scope;
        if (!this.base)
            this.base = totals;
        for (const [source, out] of totals.out) {
            if (out.kind !== 'video' || out.produced === undefined)
                continue;
            const last = this.produced.get(source);
            this.produced.set(source, { frames: out.produced, at });
            if (!last || !scope.sending.has(source))
                continue;
            if (out.produced === last.frames) {
                this.stalls.set(source, (this.stalls.get(source) ?? 0) + (at - last.at));
            }
            else if (!this.stalls.has(source)) {
                this.stalls.set(source, 0);
            }
        }
    }
    // What changed since the last reading, the window started over; nothing
    // before a pass has come after the first.
    reading(health) {
        const base = this.base;
        const latest = this.latest;
        if (!base || !latest || !this.scope || latest.at <= base.at)
            return undefined;
        const reading = qualityBetween(base, latest, this.scope, this.stalls);
        const path = pathBetween(base, latest);
        const h = { ...health };
        if (path)
            h.path = path;
        if (Object.keys(h).length)
            reading.health = h;
        this.base = latest;
        this.stalls.clear();
        return reading;
    }
}
