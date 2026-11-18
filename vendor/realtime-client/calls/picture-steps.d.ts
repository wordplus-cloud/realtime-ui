/** A ceiling on what a video sends: its height in lines, its frames a second, its bitrate in kbps; 0 leaves that one alone. */
export interface PictureCaps {
    height: number;
    fps: number;
    kbps: number;
}
/** A camera's steps down. */
export declare const CAMERA_STEPS: readonly PictureCaps[];
/** A shared screen's: its size is what makes it readable, so it keeps that and gives way in frames and bitrate. */
export declare const SCREEN_STEPS: readonly PictureCaps[];
/** How long the sound has to go on suffering before the picture takes a step, or the next one. */
export declare const PICTURE_DOWN_MS = 6000;
/** How long it has to be clean, the person talking, before a step back up. */
export declare const PICTURE_UP_MS = 30000;
/**
 * A step up that brought the trouble back within this of it is taken back at once, and doubles the wait for the next one.
 * A camera given more room takes its time to fill it: on 150 kbps the sound was lost again 16 s after the step up.
 */
export declare const PICTURE_RELAPSE_MS = 30000;
/** The longest such a wait gets. */
export declare const PICTURE_UP_MAX_MS = 300000;
/** The share of the sender's estimate a step's pictures and the microphone may plan on: the rest is what a video sends beside its picture, again and as padding. */
export declare const PICTURE_FIT = 0.85;
/** What a reading says of the sound: it suffers, it is clean while the person talks, or it says nothing (silence, no video going out). */
export type SoundReading = 'suffering' | 'clean' | 'idle';
export declare class PictureSteps {
    private at;
    /** The readings in a row that said the same, and since when; an idle one breaks neither. */
    private said;
    private since;
    private upWait;
    private liftedAt;
    /** How many steps down the picture is: 0 all of it. */
    get step(): number;
    /** How long the next step up waits for, ms. */
    get wait(): number;
    /**
     * The microphone has just come down for sound lost past what its spare copy hides. Where the line is said not to carry
     * even the picture's first step beside it (fitting 2 or more), the picture goes with it, to that step, without a
     * step's wait: on a line that narrow the wait was 6-16 s more of the sound lost (150 kbps, 10 Nov 2026). Answers
     * whether the step changed.
     */
    giveWay(now: number, fitting: number): boolean;
    /**
     * One reading. fitting is the first step the line is said to carry (stepFitting), 0 when nothing says: a step down
     * goes straight there, and no further while that is said; said to carry the first step, the picture takes none.
     * Answers whether the step changed.
     */
    review(now: number, reading: SoundReading, fitting?: number): boolean;
}
/** The ceiling a step puts on a video of that source; null at step 0, and for a source that isn't a picture. */
export declare function stepCaps(source: string | undefined, step: number): PictureCaps | null;
/**
 * The first step down at which the videos of those sources fit in kbps together: the last step when none does, 0 when
 * there is no figure to go by or no such video.
 */
export declare function stepFitting(sources: readonly (string | undefined)[], kbps: number | null): number;
/** Two ceilings as one: the lower of each where both set one. */
export declare function lowerCaps(a: Partial<PictureCaps> | null | undefined, b: Partial<PictureCaps> | null | undefined): PictureCaps;
export declare const sameCaps: (a: Partial<PictureCaps> | null | undefined, b: Partial<PictureCaps> | null | undefined) => boolean;
