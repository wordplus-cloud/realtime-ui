import { type PictureCaps } from "./picture-steps.js";
/** A microphone's ceiling on a good link. */
export declare const MIC_CEILING = 64000;
/** And on a slow one. */
export declare const MIC_CEILING_SLOW = 32000;
/** The estimate under which an upload counts as slow. */
export declare const MIC_SLOW_BELOW = 600000;
/** And the one it has to reach to stop counting: above where it comes down, so the ceiling doesn't flap around one mark. */
export declare const MIC_BACK_AT = 750000;
/** How long a reading has to hold before the ceiling follows it. */
export declare const MIC_HOLD_MS = 10000;
/** A room's estimate under which an upload counts as slow. */
export declare const ROOM_MIC_SLOW_BELOW = 900000;
/** And the one it has to reach to stop counting. */
export declare const ROOM_MIC_BACK_AT = 1000000;
/** How often a room's microphone reads its upload, as a direct call's stats loop does. */
export declare const ROOM_MIC_READ_MS = 2000;
/** The share of a room's microphone its node says it lost, or asked for again, over ROOM_MIC_LOSS_WINDOW_MS, that says the upload can't carry it. */
export declare const ROOM_MIC_LOSS = 0.04;
/** How far back that share is read: half the hold, so the loss has to last about the hold, not only stay in the window for it. */
export declare const ROOM_MIC_LOSS_WINDOW_MS = 5000;
/** The packets that window has to hold to say anything: a quiet microphone sends next to none, one talking 25 a second in 40 ms frames. */
export declare const ROOM_MIC_LOSS_MIN_PACKETS = 50;
/** How long a room's video waits in its sender's queue, on average since the last reading, that says the upload can't carry it, in seconds. */
export declare const ROOM_MIC_QUEUED_S = 0.1;
/** The share lost that no spare copy hides: about one packet in eight, where two in a row go often enough to be heard. */
export declare const ROOM_MIC_LOSS_HEAVY = 0.12;
/** How long that has to hold beside video before the ceiling comes down: the 10 s of MIC_HOLD_MS were 20 s of a jam's sound, lost at 22%, before anything answered (150 kbps, 10 Nov 2026). */
export declare const ROOM_MIC_HEAVY_HOLD_MS = 4000;
/** What a microphone's packet costs beside what the sender counts of it: its IP and UDP headers and SRTP's tag, in bytes. */
export declare const MIC_PACKET_OVERHEAD = 38;
export declare class MicCeiling {
    private slow;
    private leavingSince;
    private readonly slowBelow;
    private readonly backAt;
    constructor(slowBelow?: number, backAt?: number);
    get bitrate(): number;
    /** Whether it has come down. */
    get lowered(): boolean;
    /**
     * One stats reading: the sender's estimate in bits per second, null when it gave none, and whether video went out
     * since the last. downHold is how long a reading has to hold for the ceiling to come down on it, where that is less
     * than the hold either way. Answers whether the ceiling changed.
     */
    review(now: number, estimate: number | null, videoSending: boolean, downHold?: number): boolean;
}
/** A video's track as the room client has it (@wordplus/rtc-client 1.0.23's LocalVideoTrack): the ceilings on what it sends. */
export interface RoomVideoCaps {
    setMeshCaps?(caps: Partial<PictureCaps>): Promise<void> | void;
    getMeshCaps?(): Partial<PictureCaps>;
}
/** What a room's microphone reads of its local participant: the library's, by its shape. */
export interface RoomSending {
    trackPublications?: {
        values(): Iterable<{
            source?: string;
            track?: {
                sender?: RTCRtpSender;
            } & RoomVideoCaps;
        }>;
    };
}
export interface RoomMicOptions {
    readMs?: number;
    /** The microphone's ceiling moved: where to, and the estimate it was read on (null with no video going out). */
    onChange?: (bitrate: number, estimate: number | null) => void;
    /** The picture took a step for the sound's sake (picture-steps.ts): how many steps down it is now, 0 all of it. */
    onPicture?: (step: number, estimate: number | null) => void;
    /** The upload this side sends on became jammed, or no longer is (upload-jam.ts). */
    onUploadJam?: (jammed: boolean) => void;
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
export declare function watchRoomMic(local: () => RoomSending | null | undefined, options?: RoomMicOptions): () => void;
