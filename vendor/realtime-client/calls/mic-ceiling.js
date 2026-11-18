// What a call lets its microphone spend, on an upload too slow for 64 kbps of it.
//
// The sound comes first, and on a good link it keeps all of it. On a slow one, the browser's bandwidth allocation counts
// a microphone once, at its ceiling, while in RED it sends about twice that (131 kbps at a ceiling of 64): the camera
// is given what it believes is left, and the link is overcommitted. Measured 4 Nov 2026 with this engine in Chrome 156
// through a shaped upload, a person's picture before a still room: on 300 kbps, packets waited 1.3-1.4 s in the sender's
// pacer and the picture froze for 3.9-5.2 s of 28. With the ceiling at 32 the wait was 0.2-0.6 s, the picture froze for
// 0-1.6 s at about the same size, and no more of the microphone was lost than before the camera had its share. Capping
// the camera instead, to leave the microphone its 64, starved the picture and kept it starved after the link recovered.
//
// So the ceiling comes down only while video goes out and the estimate has stayed low (MIC_HOLD_MS, so a call's first
// seconds, when the estimate is still climbing, leave it alone), and it goes back up once the estimate is clear of the
// mark or no video goes out any more. A call with no video keeps all of it: nothing competes with its sound, and its
// estimate is low only because it sends little. A browser that gives no estimate (Firefox) keeps all of it too.
//
// A room needs it higher up. A simulcast camera puts about the whole estimate on the wire, padding what its picture
// doesn't need (on 800 kbps it sent 684 where its viewer received 175, retransmitting nothing), and the microphone goes on
// top, 146 kbps at 64 and 86 at 32, so the link overflows where the two together pass it. Measured 5 Nov 2026 through a
// shaped upload with a 120 ms queue, H.264 to 1080p, the picture frozen for so many seconds of 40 at a ceiling of 64 and 32:
// 24 and 8 on 300 kbps, 13 and 6 on 450, 15 and 0 on 800, 8 and 1 on 1000, none on 1200. VP8 to 720p, with less to pad
// between its layers: 12 and 2 on 300, 4 and 4 on 450, 2 and 0 on 600. So a room's marks sit above a direct call's, whose
// would miss the worst of it: at 64 the estimate read 763 on 800 kbps and 850 on 1000, against 966 on 1200, and at 32 it
// read 818 on 1000 and 1028 on 1200. Under about 800 kbps the ceiling alone doesn't clear it, as 32 still passes the link.
//
// In a room an estimate under the mark says nothing by itself. A camera whose viewers want little of it sends little, and
// then the estimate has no reason to climb: 421 kbps on an open line, with its one viewer's tile 240x135. So a room's only
// counts while the browser says the upload holds the video back (qualityLimitationReason), as every layer of every camera
// said on every shaped upload, and a browser that doesn't say keeps all of it.
//
// Those were 20 ms audio frames. At production's 40 ms a microphone at 64 costs 108 kbps, and the picture froze for less:
// 3 and 0 s of 40 on 300 kbps at a ceiling of 64 and 32, 1 and 0 on 450, none on 800 and 1000 (one call each, 7 Nov 2026).
//
// But that camera can be on an upload too slow as well: it sends the one layer its viewers want, the browser says nothing
// holds it back, and the link still overflows with the microphone on top. Then the sender sees it one of two ways, as the
// same upload goes either way from call to call. Measured 7 Nov 2026 through a shaped upload with 40 ms frames, H.264 to
// 1080p with its one viewer's tile 240x135, on 200 kbps at a ceiling of 64, six calls on two meshes: in three the
// microphone lost 9-15% as its node reports it, the picture froze for 1-2 s of 40 and the viewer's jitter buffer held
// about 370 ms; in three it lost 1-3% while the video waited 544-724 ms in the sender's queue, the picture froze for
// 13-38 s and the buffer held over 1 s. At 32: frozen 0 s and 0.2 s on 200 and 250 kbps. So the microphone comes down on either: its
// share lost, which a node that asks plain Opus for what's lost reports as next to none, so what it asks for counts too (about 10-20%
// where such a microphone can't be carried), or its video's wait, 41 ms or less in every other call. With both, on 200 kbps from
// the start nothing froze (5 calls), and an open line falling to 200 mid-call came down about 12 s later, 10, 13 and
// 15 s frozen of 100, where the loss alone missed it in one of two calls for 60 s frozen. Encrypted, with no RED to repair what's lost
// and 65 kbps to carry at 64: nothing lost on 250 or 300, 7% on 200 where 32 froze nothing and made up nothing. Nothing moved
// on 400 or 800 kbps, an open line, or 1200 and 1500 at full size. A line losing 5% of its packets at random reads the same,
// so this only counts under the estimate's mark too, and at 1% and 3% it stays under its own.
// Coming down ends what brought it down, so it stays down until the estimate is clear of the mark or the video stops, which
// with so small a picture may not come (the estimate read 399 a minute after 40 s of 200 kbps ended): that costs what any
// slow upload costs, a microphone at 32, and at most one move in every call measured.
//
// And a room's microphone can be too much for its line all by itself. With no video going out nothing competes with it and no
// estimate says anything (it is low because little is sent), but its node's count does: a person in a real call, 10
// Nov 2026, a microphone alone at 64 in RED, about 130 kbps as it goes out, on a line its browser put at 57-347: 239 of
// 1,626 packets lost in 75 s, up to 49 of 90 in 5 s, its round trip growing to 690 ms, and its listener making up 7-20%
// of the sound after each burst. So alone it comes down on that count too, held as long, and then stays down for as long
// as it is alone: nothing it could read says the line has grown, and going back up would be to lose it again. Once video
// goes out, the estimate decides as it does above.
import { selectedPair } from "./pair.js";
import { PICTURE_FIT, PictureSteps, lowerCaps, sameCaps, stepCaps, stepFitting } from "./picture-steps.js";
import { UploadJam, jamReading } from "./upload-jam.js";
/** A microphone's ceiling on a good link. */
export const MIC_CEILING = 64000;
/** And on a slow one. */
export const MIC_CEILING_SLOW = 32000;
/** The estimate under which an upload counts as slow. */
export const MIC_SLOW_BELOW = 600000;
/** And the one it has to reach to stop counting: above where it comes down, so the ceiling doesn't flap around one mark. */
export const MIC_BACK_AT = 750000;
/** How long a reading has to hold before the ceiling follows it. */
export const MIC_HOLD_MS = 10000;
/** A room's estimate under which an upload counts as slow. */
export const ROOM_MIC_SLOW_BELOW = 900000;
/** And the one it has to reach to stop counting. */
export const ROOM_MIC_BACK_AT = 1000000;
/** How often a room's microphone reads its upload, as a direct call's stats loop does. */
export const ROOM_MIC_READ_MS = 2000;
/** The share of a room's microphone its node says it lost, or asked for again, over ROOM_MIC_LOSS_WINDOW_MS, that says the upload can't carry it. */
export const ROOM_MIC_LOSS = 0.04;
/** How far back that share is read: half the hold, so the loss has to last about the hold, not only stay in the window for it. */
export const ROOM_MIC_LOSS_WINDOW_MS = 5000;
/** The packets that window has to hold to say anything: a quiet microphone sends next to none, one talking 25 a second in 40 ms frames. */
export const ROOM_MIC_LOSS_MIN_PACKETS = 50;
/** How long a room's video waits in its sender's queue, on average since the last reading, that says the upload can't carry it, in seconds. */
export const ROOM_MIC_QUEUED_S = 0.1;
/** The share lost that no spare copy hides: about one packet in eight, where two in a row go often enough to be heard. */
export const ROOM_MIC_LOSS_HEAVY = 0.12;
/** How long that has to hold beside video before the ceiling comes down: the 10 s of MIC_HOLD_MS were 20 s of a jam's sound, lost at 22%, before anything answered (150 kbps, 10 Nov 2026). */
export const ROOM_MIC_HEAVY_HOLD_MS = 4000;
/** What a microphone's packet costs beside what the sender counts of it: its IP and UDP headers and SRTP's tag, in bytes. */
export const MIC_PACKET_OVERHEAD = 38;
export class MicCeiling {
    constructor(slowBelow = MIC_SLOW_BELOW, backAt = MIC_BACK_AT) {
        this.slow = false;
        this.leavingSince = null;
        this.slowBelow = slowBelow;
        this.backAt = backAt;
    }
    get bitrate() {
        return this.slow ? MIC_CEILING_SLOW : MIC_CEILING;
    }
    /** Whether it has come down. */
    get lowered() {
        return this.slow;
    }
    /**
     * One stats reading: the sender's estimate in bits per second, null when it gave none, and whether video went out
     * since the last. downHold is how long a reading has to hold for the ceiling to come down on it, where that is less
     * than the hold either way. Answers whether the ceiling changed.
     */
    review(now, estimate, videoSending, downHold = MIC_HOLD_MS) {
        // A reading with no estimate says nothing, and doesn't restart the wait either.
        if (videoSending && estimate === null)
            return false;
        const wanted = videoSending && estimate < (this.slow ? this.backAt : this.slowBelow);
        if (wanted === this.slow) {
            this.leavingSince = null;
            return false;
        }
        if (this.leavingSince === null)
            this.leavingSince = now;
        if (now - this.leavingSince < (wanted ? Math.min(downHold, MIC_HOLD_MS) : MIC_HOLD_MS))
            return false;
        this.slow = wanted;
        this.leavingSince = null;
        return true;
    }
}
/**
 * A room's microphone kept under its ceiling on a slow upload, the estimate read from the video it sends, which is what
 * the ceiling waits for, as long as the upload holds that video back or the microphone is being lost; and with no video
 * going out, on its node's count of it lost alone, from which it stays down while it is alone. The participant is asked for at each reading, so a
 * reconnect's new senders and a room moved to are followed: each microphone's sender keeps the ceiling it was published
 * with, the node's mic.kbps, to go back up to. onChange is told when the ceiling moves. Answers its stop.
 *
 * The same readings carry two things more. Once the microphone is down and the sound still suffers while the person
 * talks, the call's videos give way a step at a time (picture-steps.ts) and come back as the sound holds, onPicture told
 * of each step. And the connection it all goes out on is judged for a jam (upload-jam.ts), onUploadJam told when that
 * begins and ends.
 */
export function watchRoomMic(local, options = {}) {
    const ceiling = new MicCeiling(ROOM_MIC_SLOW_BELOW, ROOM_MIC_BACK_AT);
    const picture = new PictureSteps();
    const jam = new UploadJam();
    const encoded = new WeakMap();
    const tops = new WeakMap();
    const heard = [];
    const waited = new WeakMap();
    // The ceilings each video had before this put its own on it (the node's, or none), and what this last set there.
    const bases = new WeakMap();
    const capped = new WeakMap();
    let busy = false, stopped = false, downForLoss = false, downAlone = false;
    // What the node says of the microphone: whether enough of it went out over the window to say anything, which is the
    // person talking, and whether the share of that lost or asked for again says the upload can't carry it. A node that
    // asks for what's lost reports next to none lost, and what it asks for goes up the same upload. And the pair it goes out on.
    // Heavy is that share past what a spare copy hides. Wire is what the microphone put on the line over the window, in
    // bits per second with its packets' headers, null while the window is too short to say.
    const hearing = async (mic, now) => {
        let sent = null, lost = null, resent = 0, bytes = 0;
        const report = await mic.getStats();
        report.forEach((s) => {
            if (s.type === 'outbound-rtp') {
                sent = s.packetsSent ?? null;
                resent = s.retransmittedPacketsSent ?? 0;
                bytes = (s.bytesSent ?? 0) + (s.headerBytesSent ?? 0) + (s.packetsSent ?? 0) * MIC_PACKET_OVERHEAD;
            }
            if (s.type === 'remote-inbound-rtp')
                lost = s.packetsLost ?? null;
        });
        const pair = selectedPair(report);
        if (sent === null || lost === null)
            return { talking: false, lossy: false, heavy: false, wire: null, pair };
        const missed = lost + resent;
        heard.push({ at: now, sent, missed, bytes });
        while (heard[0].at < now - ROOM_MIC_LOSS_WINDOW_MS)
            heard.shift();
        const went = sent - heard[0].sent;
        const talking = went >= ROOM_MIC_LOSS_MIN_PACKETS;
        const share = talking ? (missed - heard[0].missed) / went : 0;
        const over = now - heard[0].at;
        return {
            talking,
            lossy: share >= ROOM_MIC_LOSS,
            heavy: share >= ROOM_MIC_LOSS_HEAVY,
            wire: over >= ROOM_MIC_LOSS_WINDOW_MS / 2 ? (bytes - heard[0].bytes) * 8000 / over : null,
            pair,
        };
    };
    // Each video under the step's ceiling and whatever the node set, and back to the node's alone at step 0. Every reading
    // looks, so a camera turned on later, a track the node's settings wrote over and a call the sender refused are caught up.
    const fit = async (publications) => {
        for (const { source, track } of publications) {
            if (!track?.setMeshCaps || !track.getMeshCaps || (source !== 'camera' && source !== 'screen_share'))
                continue;
            const now = track.getMeshCaps() ?? {};
            const mine = capped.get(track);
            // Not what this left there: the node's settings changed it, and that is the ceiling to keep to from here on.
            if (!mine || !sameCaps(now, mine))
                bases.set(track, { height: now.height ?? 0, fps: now.fps ?? 0, kbps: now.kbps ?? 0 });
            const base = bases.get(track) ?? {};
            const step = stepCaps(source, picture.step);
            const wanted = step ? lowerCaps(base, step) : lowerCaps(base, null);
            if (step)
                capped.set(track, wanted);
            else
                capped.delete(track);
            if (!sameCaps(now, wanted))
                await track.setMeshCaps(wanted);
        }
    };
    const read = async () => {
        const publications = Array.from(local()?.trackPublications?.values() ?? []);
        let estimate = null, videoSending = false, heldBack = false, queued = false, pair;
        const sending = [];
        for (const { source, track } of publications) {
            const sender = track?.sender;
            if (!sender || (source !== 'camera' && source !== 'screen_share'))
                continue;
            const report = await sender.getStats();
            if (stopped)
                return;
            let frames = 0, packets = 0, delay = 0;
            report.forEach((s) => {
                if (s.type !== 'outbound-rtp')
                    return;
                frames += s.framesEncoded ?? 0;
                packets += s.packetsSent ?? 0;
                delay += s.totalPacketSendDelay ?? 0;
                // A layer paused for want of viewers says nothing of the upload.
                if (s.active !== false && s.qualityLimitationReason === 'bandwidth')
                    heldBack = true;
            });
            if (frames > (encoded.get(sender) ?? 0)) {
                videoSending = true;
                sending.push(source);
            }
            encoded.set(sender, frames);
            const last = waited.get(sender);
            if (last && packets > last.packets && (delay - last.delay) / (packets - last.packets) >= ROOM_MIC_QUEUED_S)
                queued = true;
            waited.set(sender, { packets, delay });
            pair = selectedPair(report) ?? pair;
            const available = pair?.availableOutgoingBitrate;
            if (typeof available === 'number')
                estimate = available;
        }
        const mic = publications.find((publication) => publication.source === 'microphone')?.track?.sender;
        const now = Date.now();
        const said = mic ? await hearing(mic, now) : { talking: false, lossy: false, heavy: false, wire: null, pair: undefined };
        const lossy = said.lossy;
        pair = pair ?? said.pair;
        if (stopped)
            return;
        // Down for its own loss, or its video's queue, it stays down until the estimate is clear of the mark or the video stops: coming down ends them.
        // Alone, there is no estimate to read (0 stands under every mark): its loss brings it down, and having come down alone keeps it there.
        // Beside video, sound lost past what its spare copy hides is answered sooner: the video can give the room back, a line alone can't.
        const moved = videoSending
            ? ceiling.review(now, estimate, heldBack || queued || lossy || downForLoss || downAlone, said.heavy ? ROOM_MIC_HEAVY_HOLD_MS : MIC_HOLD_MS)
            : ceiling.review(now, 0, lossy || downAlone);
        if (moved) {
            downAlone = ceiling.lowered && (downAlone || !videoSending);
            downForLoss = ceiling.lowered && (queued || lossy);
        }
        const params = mic?.getParameters();
        const encoding = params?.encodings?.[0];
        let bitrate = ceiling.bitrate;
        if (mic && params && encoding) {
            if (!tops.has(mic))
                tops.set(mic, encoding.maxBitrate);
            const top = tops.get(mic);
            bitrate = ceiling.lowered ? Math.min(MIC_CEILING_SLOW, top ?? MIC_CEILING_SLOW) : top;
            // Every reading looks, so one the sender refused goes again at the next, and so does a new sender's first.
            if (encoding.maxBitrate !== bitrate) {
                if (bitrate === undefined)
                    delete encoding.maxBitrate;
                else
                    encoding.maxBitrate = bitrate;
                await mic.setParameters(params);
            }
        }
        if (moved && !stopped)
            options.onChange?.(bitrate ?? MIC_CEILING, estimate);
        // The picture's turn comes once the microphone has given what it can: the person talking, video going out, and the
        // sound still lost or still waiting behind that video. Clean takes the person talking with video going out too.
        // The rest says nothing: silence, no video, or trouble the microphone hasn't answered yet (its own hold, or an
        // estimate clear of its mark, where a line that loses at random leaves both alone).
        // A step down goes to the first step whose videos the estimate says the line carries beside what the microphone puts on it.
        // Having just come down, the microphone will put on it the share of what it did that its new ceiling is of its old.
        const troubled = lossy || queued;
        const down = moved && ceiling.lowered;
        const wire = said.wire === null ? null : down ? said.wire * (bitrate ?? MIC_CEILING_SLOW) / ((mic && tops.get(mic)) ?? MIC_CEILING) : said.wire;
        const fitting = stepFitting(sending, estimate !== null && wire !== null ? (estimate * PICTURE_FIT - wire) / 1000 : null);
        // Down for heavy loss on a line said not to carry even the picture's first step, the picture goes with it at once.
        const stepped = (down && said.heavy && videoSending && said.talking && picture.giveWay(now, fitting))
            || picture.review(now, !(videoSending && said.talking) ? 'idle' : !troubled ? 'clean' : ceiling.lowered ? 'suffering' : 'idle', fitting);
        await fit(publications);
        if (stopped)
            return;
        if (stepped)
            options.onPicture?.(picture.step, estimate);
        if (pair && jam.review(jamReading(pair, now)))
            options.onUploadJam?.(jam.jammed);
    };
    const timer = setInterval(() => {
        if (stopped || busy)
            return;
        busy = true;
        // A sender in the middle of a negotiation may refuse either call: the next reading goes again.
        read().catch(() => { }).finally(() => {
            busy = false;
        });
    }, options.readMs ?? ROOM_MIC_READ_MS);
    return () => {
        stopped = true;
        clearInterval(timer);
    };
}
