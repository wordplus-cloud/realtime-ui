// The picture giving way to the sound, a step at a time, on an upload that can't carry both.
//
// The sound comes first while the person talks. The microphone's ceiling (mic-ceiling.ts) gives the camera room; this is
// the other way round, for the upload where the microphone has come down and is still being lost, or still waits behind
// the video in the sender's queue: the camera, and a shared screen, are made smaller until the sound gets through, and
// never taken away. Measured 10 Nov 2026 in the mesh lab through a capped upload with a 250 ms queue, a talking
// microphone in RED at 40 ms frames and one listener holding 450 ms, two calls each. A camera in three simulcast layers
// of 100, 250 and 500 kbps, the smallest alone two thirds of a 150 kbps line: with the microphone at 64 nearly nothing
// was made up but the sound ran 0.8-1.4 s late and the picture froze for about 40 s of 57; with it at 32, 2.2-4.4% of the
// sound was made up, the camera having taken the room the microphone gave; on 250 kbps 1.9-2.9% and 1.8-1.9%. The same
// lines with the camera one small layer: 180p at 10 fps and 50 kbps, or at 8 fps and 30 kbps, beside a microphone at 32
// on 150 kbps, and 180p at 15 fps and 80 kbps or 360p at 15 fps and 150 kbps on 250 kbps: nothing made up, nothing
// late, the camera never frozen, at the frames it was given. With no camera at all the sound was whole too, which says
// whose packets pushed it out.
//
// So a step down is a ceiling on what every video of the call sends (the room client's LocalVideoTrack.setMeshCaps,
// which leaves the person's own picture as it is), taken only once the microphone is down, while the person talks and
// the sound still suffers, PICTURE_DOWN_MS after the step before: the loss is read over 5 s, so a step's own effect has
// to be in the reading that judges it. A step back up takes the sound clean for PICTURE_UP_MS while the person talks:
// silence says nothing of what the line carries, so a picture stays where it is through it. A step up that brings the
// trouble back within PICTURE_RELAPSE_MS doubles the wait for the next, up to PICTURE_UP_MAX_MS, so a line that stays
// thin is tried again ever more rarely. A camera capped with nothing to lift it starved the picture and kept it starved
// after the line recovered (a direct call, 4 Nov 2026): the way back up is the half of this that keeps that from being
// the price of the sound.
//
// The same day with the products' own camera on a line that fell from open to 150 kbps for 90 s, one call: the steps
// kept the sound on time (its listener held 470 ms, against 1.8 s with nothing watched) and the picture moving (frozen
// 1.2 s of the jam's last 68, against 35.1). But the second step came 16 s after the first, on a line whose estimate
// already said the first couldn't fit, and the step back up 32 s later took 18 s to be taken back, the sound lost again
// meanwhile. So a step down goes straight to the first step the sender's estimate says the line carries beside the
// microphone (stepFitting; one at a time where there is no estimate), and a step up is on trial for PICTURE_RELAPSE_MS:
// the first reading that says it cost the sound takes it back, with none of a step down's wait. The same jam with
// both, and the microphone brought down sooner for heavy loss (mic-ceiling.ts), one call: the microphone down 10 s into
// the jam where it had been 20, the picture at its second step 6 s later where it had been 42 s into the jam, and from
// there to the jam's end nothing of the sound made up, the try of a step up included (1.4% lost while it lasted, all
// of it restored by the spare copies, the picture frozen 0.8 s of 43). The estimate can't say beforehand whether a step
// up fits: capped, a sender's estimate stays near one and a half times what it sends, 154 kbps on the jammed line and
// 158 on the open one. So the way up is by trial.
//
// And a step down stops at the step the estimate says the line carries. A line that loses at random loses the sound
// whatever the picture's size: on 600 kbps losing 8 packets in 100, one call, the picture walked to its last step in
// 52 s while the listener made up 0.15-0.20% before and after, the estimate reading 305-447 kbps throughout. A line that
// is overloaded brings its estimate down with it (111-139 kbps on the 150 kbps jam), and the steps follow that. Heavy
// loss is no exception: of 8% lost at random, a 5 s window reads 12% often enough to walk the picture down by itself.
// Nor is a first step taken where the estimate says it fits: once capped, a sender on a line that loses has an estimate
// that only falls (506 to 213 to 111 kbps in a second call on that line, the picture at its last step after 70 s), so the
// picture stays whole unless the line is said to be too narrow for even its first step, which is where the steps were
// measured to help (150 kbps) and the microphone alone was enough above it (250 kbps).
/** A camera's steps down. */
export const CAMERA_STEPS = [
    { height: 360, fps: 15, kbps: 150 },
    { height: 180, fps: 10, kbps: 50 },
    { height: 180, fps: 8, kbps: 30 },
];
/** A shared screen's: its size is what makes it readable, so it keeps that and gives way in frames and bitrate. */
export const SCREEN_STEPS = [
    { height: 0, fps: 5, kbps: 150 },
    { height: 0, fps: 3, kbps: 80 },
    { height: 0, fps: 1, kbps: 50 },
];
/** How long the sound has to go on suffering before the picture takes a step, or the next one. */
export const PICTURE_DOWN_MS = 6000;
/** How long it has to be clean, the person talking, before a step back up. */
export const PICTURE_UP_MS = 30000;
/**
 * A step up that brought the trouble back within this of it is taken back at once, and doubles the wait for the next one.
 * A camera given more room takes its time to fill it: on 150 kbps the sound was lost again 16 s after the step up.
 */
export const PICTURE_RELAPSE_MS = 30000;
/** The longest such a wait gets. */
export const PICTURE_UP_MAX_MS = 300000;
/** The share of the sender's estimate a step's pictures and the microphone may plan on: the rest is what a video sends beside its picture, again and as padding. */
export const PICTURE_FIT = 0.85;
export class PictureSteps {
    constructor() {
        this.at = 0;
        /** The readings in a row that said the same, and since when; an idle one breaks neither. */
        this.said = null;
        this.since = 0;
        this.upWait = PICTURE_UP_MS;
        this.liftedAt = null;
    }
    /** How many steps down the picture is: 0 all of it. */
    get step() {
        return this.at;
    }
    /** How long the next step up waits for, ms. */
    get wait() {
        return this.upWait;
    }
    /**
     * The microphone has just come down for sound lost past what its spare copy hides. Where the line is said not to carry
     * even the picture's first step beside it (fitting 2 or more), the picture goes with it, to that step, without a
     * step's wait: on a line that narrow the wait was 6-16 s more of the sound lost (150 kbps, 10 Nov 2026). Answers
     * whether the step changed.
     */
    giveWay(now, fitting) {
        const to = Math.min(fitting, CAMERA_STEPS.length);
        if (fitting < 2 || this.at >= to)
            return false;
        this.at = to;
        this.liftedAt = null;
        this.said = 'suffering';
        this.since = now;
        return true;
    }
    /**
     * One reading. fitting is the first step the line is said to carry (stepFitting), 0 when nothing says: a step down
     * goes straight there, and no further while that is said; said to carry the first step, the picture takes none.
     * Answers whether the step changed.
     */
    review(now, reading, fitting = 0) {
        if (reading === 'idle')
            return false;
        if (reading !== this.said) {
            this.said = reading;
            this.since = now;
        }
        if (reading === 'suffering') {
            if (this.at >= CAMERA_STEPS.length)
                return false;
            // A step up on trial is taken back by the first reading that says it cost the sound.
            const onTrial = this.liftedAt !== null && now - this.liftedAt <= PICTURE_RELAPSE_MS;
            // The line is said to carry this step beside the microphone, or the whole picture's first step from none taken:
            // what loses the sound isn't the picture, as on a line that loses at random, and a smaller one would cost it
            // for nothing. An overload brings the estimate down, and the step said to fit with it.
            if (!onTrial && fitting > 0 && (this.at >= fitting || fitting < 2))
                return false;
            if (!onTrial && now - this.since < PICTURE_DOWN_MS)
                return false;
            if (this.liftedAt !== null && now - this.liftedAt <= PICTURE_RELAPSE_MS + PICTURE_DOWN_MS)
                this.upWait = Math.min(this.upWait * 2, PICTURE_UP_MAX_MS);
            this.liftedAt = null;
            // Taken back, it goes back the one step it came up; otherwise down to the first step said to fit.
            this.at = onTrial ? this.at + 1 : Math.min(Math.max(this.at + 1, fitting), CAMERA_STEPS.length);
            this.since = now;
            return true;
        }
        // A step up that held: the next line that jams starts from the first wait again.
        if (this.at === 0) {
            if (this.liftedAt !== null && now - this.liftedAt > PICTURE_RELAPSE_MS + PICTURE_DOWN_MS) {
                this.liftedAt = null;
                this.upWait = PICTURE_UP_MS;
            }
            return false;
        }
        if (now - this.since < this.upWait)
            return false;
        this.at--;
        this.liftedAt = now;
        this.since = now;
        return true;
    }
}
/** The ceiling a step puts on a video of that source; null at step 0, and for a source that isn't a picture. */
export function stepCaps(source, step) {
    const steps = source === 'camera' ? CAMERA_STEPS : source === 'screen_share' ? SCREEN_STEPS : null;
    if (!steps || step <= 0)
        return null;
    return steps[Math.min(step, steps.length) - 1];
}
/**
 * The first step down at which the videos of those sources fit in kbps together: the last step when none does, 0 when
 * there is no figure to go by or no such video.
 */
export function stepFitting(sources, kbps) {
    if (kbps === null || !Number.isFinite(kbps))
        return 0;
    for (let step = 1; step <= CAMERA_STEPS.length; step++) {
        let all = 0, pictures = 0;
        for (const source of sources) {
            const caps = stepCaps(source, step);
            if (!caps)
                continue;
            pictures++;
            all += caps.kbps;
        }
        if (!pictures)
            return 0;
        if (all <= kbps)
            return step;
    }
    return CAMERA_STEPS.length;
}
/** Two ceilings as one: the lower of each where both set one. */
export function lowerCaps(a, b) {
    const lower = (x, y) => {
        const p = Math.max(0, Math.round(x ?? 0)), q = Math.max(0, Math.round(y ?? 0));
        return p && q ? Math.min(p, q) : p || q;
    };
    return { height: lower(a?.height, b?.height), fps: lower(a?.fps, b?.fps), kbps: lower(a?.kbps, b?.kbps) };
}
export const sameCaps = (a, b) => (a?.height ?? 0) === (b?.height ?? 0) && (a?.fps ?? 0) === (b?.fps ?? 0) && (a?.kbps ?? 0) === (b?.kbps ?? 0);
