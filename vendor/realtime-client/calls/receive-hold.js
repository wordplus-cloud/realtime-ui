// How long a call between two people holds what arrives before playing it (RTCRtpReceiver.jitterBufferTarget).
//
// A browser left to itself holds a picture about a frame, 13 ms on a desktop Chrome: a packet lost on the way comes back
// a round trip later and its frame plays late, a jolt each time, and packets that arrive unevenly do the same with
// nothing lost at all. A group call's pictures are held by the media server from 150 ms, up to 400 on a path that
// repairs (WordPlus Mesh's playout delay); a direct call had nothing of the kind. Over the direct calls of a day
// (31 Oct 2026, 38 calls), 100 moments of a picture freezing, 46 of them with nothing else wrong in the call: no loss
// large enough to be named, no PC struggling, no upload full. Those are what a hold mends; a sender that can't send or a
// decoder that can't keep up are not, and a freeze with nothing lost, nothing asked again and the packets arriving
// evenly raises nothing.
//
// So a picture is held from CALL_HOLDS_MS's first, 150 ms as in a group call, and the next, then the one after, when it
// keeps freezing while packets go missing, are asked again or arrive unevenly (CALL_HOLD_TIMING.jitterMs); it comes
// back down one after a minute without trouble, and a hold that has to come back up soon after waits twice as long
// before it tries again (streams/hold.ts, the live stream viewer's ladder with a conversation's numbers).
//
// The sound is held SOUND_SLACK_MS less than its picture. The two travel in streams of their own, so the browser keeps
// no lip sync between them, and played as they come Chromium shows a picture 56-73 ms before its sound (WordPlus
// Mesh's TestLipSync): the sound held 100 ms less than its picture keeps the lips within what is noticed (ITU-R
// BT.1359, 45 ms with the sound ahead) while the sound, which is the conversation, waits no longer than it must.
//
// A browser without jitterBufferTarget keeps its own, and so do the native apps, whose WebRTC builds have no setter.
import { ViewerHold } from "../streams/hold.js";
export const CALL_HOLDS_MS = Object.freeze([150, 250, 400]);
export const CALL_HOLD_TIMING = Object.freeze({
    // Trouble: two freezes, or a second frozen in all, over the last 30 s of watching, while packets were lost, asked
    // again, or arrived 30 ms or more apart from their time.
    windowMs: 30000,
    freezes: 2,
    frozenMs: 1000,
    jitterMs: 30,
    // The browser moves a picture's delay about 100 ms a second: a step settles in two.
    settleMs: 5000,
    // A conversation wants its delay back: down one after a minute without trouble, up to ten after one that came
    // straight back.
    cleanMs: 60000,
    cleanMaxMs: 10 * 60000,
});
export const SOUND_SLACK_MS = 100;
// The sound's hold beside a picture held `pictureMs`.
export function soundHold(pictureMs) {
    return Math.max(0, pictureMs - SOUND_SLACK_MS);
}
export class CallHold extends ViewerHold {
    constructor() {
        super(CALL_HOLDS_MS, CALL_HOLD_TIMING);
    }
}
// A test switch: bm_p2p_hold = 'off' leaves every receiver to the browser's own hold, as before.
export function receiveHoldOff() {
    try {
        return window.localStorage.getItem('bm_p2p_hold') === 'off';
    }
    catch (e) {
        return false;
    }
}
