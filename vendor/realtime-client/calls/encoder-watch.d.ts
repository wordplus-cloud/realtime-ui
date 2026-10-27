import { type CallSettings, type CameraCodec, type CameraTune } from "./room-publish.js";
/**
 * A camera's hardware encoder that drops frames, found while it sends, so this device's next camera goes out in
 * software (cameraCodecFor()'s avoid, room-publish.ts).
 *
 * Seen 2026-10-21 in a call: a Windows PC's AMD encoder (Media Foundation's AMDh264Encoder) sent its
 * 360p at 3-6 frames a second of the 15 its camera gave, at 690-870 kbit/s over the layer's 600, and its 180p, which
 * OpenH264 encodes, at the same few, each encoding fast and the browser naming nothing that held it back. libwebrtc
 * takes whole frames off the camera when an encoder it doesn't trust overshoots its target (its frame dropper), every
 * layer at once, and says nothing of it (qualityLimitationReason "none"). Another AMD PC in the same call sent 17 of 17:
 * it is a device's, not a maker's, so it is found on the device. The mesh's lab gets the same of a Mac's VideoToolbox
 * under heavy grain (test/msengine TestHardwareEncoderFrames: 3.7 to 8.3 frames of 15, none limiting), where OpenH264
 * lowers the picture's size and keeps its frames (13-15 of 15, "bandwidth"). Zoom's advice on such AMD machines is to
 * turn off hardware acceleration for sending video, which this does for the person.
 *
 * Found over the last HARDWARE_DROP_READINGS readings (30 s), each of them a hardware encoder's (hardwareReading()):
 * - the camera goes out in H.264 or H.265, a layer it sends in hardware;
 * - its source gives at least HARDWARE_DROP_MIN_CAPTURED frames a second;
 * - the browser says nothing limits a layer it sends (no CPU, no bandwidth);
 * - and the hardware takes at most HARDWARE_DROP_MAX_ENCODE_MS a frame, so it isn't a slow machine;
 * when the layer that keeps the most encodes HARDWARE_DROP_SHARE or less of the frames its source gave in all: the whole
 * camera's taken off. A software encoder short of bits drops its own layer's frames alone (the lab's VP8 under heavy
 * grain: 720p at 2 of 15, its 360p and 180p at 15), and a dim room's camera gives fewer frames, which every layer sends.
 * In all, not reading by reading: the lab's VideoToolbox froze every layer at 0.6 frames a second for 10 to 15 s
 * between 20 s at 15 (its 15 s average 13 of 15), where the AMD PC sent 3-6 every second.
 */
export declare const HARDWARE_DROP_READ_MS = 5000;
export declare const HARDWARE_DROP_READINGS = 6;
export declare const HARDWARE_DROP_WARMUP = 2;
export declare const HARDWARE_DROP_SHARE = 0.7;
export declare const HARDWARE_DROP_MIN_CAPTURED = 10;
export declare const HARDWARE_DROP_MAX_ENCODE_MS = 25;
export declare const HARDWARE_DROP_MIN_TARGET = 100000;
export declare const HARDWARE_DROP_MIN_SENT = 0.25;
export declare const HARDWARE_WATCH_GONE_MS: number;
/**
 * 1.0.53: the watch's numbers as the node's settings give them (watch.everyMs, watch.warmups, watch.dropShare,
 * watch.minCapturedFps, watch.maxEncodeMs, watch.minTargetKbps, watch.minSent, watch.idleEndMin), the constants above
 * without them. Live: a watch reads them at every look.
 */
export interface WatchNumbers {
    everyMs: number;
    warmups: number;
    dropShare: number;
    minCaptured: number;
    maxEncodeMs: number;
    minTarget: number;
    minSent: number;
    goneMs: number;
}
export declare function watchNumbers(settings?: CallSettings | null): WatchNumbers;
/**
 * A camera in software that its CPU can't carry (camera-adapt.ts moves it, only on sustained evidence: a camera that's
 * merely CPU-limited a little, under half the time, stays): over the last CPU_HELD_READINGS
 * readings (20 s), the encoder's own stats said the CPU held it back CPU_HELD_SHARE of the time or more
 * (qualityLimitationDurations.cpu). VP9 and AV1, which go out in software; never a hardware encoder. Not the machine's
 * CPU pressure: that may be the page decoding many tiles, or a hidden page's stale reading, not this encoder.
 */
export declare const CPU_HELD_READINGS = 4;
export declare const CPU_HELD_SHARE = 0.5;
/**
 * One layer between two readings: whether it is sent (its encoding active; one dynacast paused isn't), its frames a
 * second, whether in hardware, what limits it, ms a frame, the bits a second its encoder is given (null: none said)
 * and what it sent.
 */
export interface EncoderLayer {
    rid: string;
    active: boolean;
    fps: number;
    hardware: boolean;
    limit: string;
    encodeMs: number | null;
    target: number | null;
    sentBps: number;
}
/**
 * A camera's sender between two readings: its codec, the frames a second its source gives (no more than its encodings
 * send at most), and its layers.
 */
export interface EncoderReading {
    codec: CameraCodec | null;
    captured: number;
    layers: EncoderLayer[];
    /** ms of the reading the browser said the CPU held the encoder back (0 where not said) */
    cpuMs?: number;
    /** ms the reading spans */
    elapsedMs?: number;
}
/**
 * Whether readings, the last `count` of them (CPU_HELD_READINGS, 20 s), are a software camera its CPU can't carry: VP9
 * or AV1 sent with no layer in hardware, held back by the CPU `share` of their time (CPU_HELD_SHARE) or more.
 */
export declare function cpuHeld(readings: EncoderReading[], count?: number, share?: number): boolean;
/** How many readings readMs apart make `seconds` (the policy's dropWatchS, cpuWatchS): one at least. */
export declare const readingsFor: (seconds: number, readMs?: number) => number;
/**
 * A reading of a hardware encoder that isn't held back by anything the browser names (above): the frames a second of
 * the layer it sends that keeps the most, and its source's; null for any other.
 */
export declare function hardwareReading(r: EncoderReading, n?: WatchNumbers): {
    best: number;
    captured: number;
} | null;
/**
 * Whether readings, the last `count` of them (HARDWARE_DROP_READINGS, 30 s), are a hardware encoder taking the whole
 * camera's frames off.
 */
export declare function dropsFrames(readings: EncoderReading[], count?: number, n?: WatchNumbers): boolean;
/**
 * The encoder each layer runs on: Chrome names a simulcast's "SimulcastEncoderAdapter (OpenH264, VideoToolbox,
 * VideoToolbox)", one encoder a stream in the sender's encodings' order (rids, lowest first), on every layer's stats.
 */
export declare function layerEncoders(implementation: string, rids: string[]): Map<string, string>;
export declare const isHardwareEncoder: (name: string) => boolean;
/** What a reading keeps of each layer's counts, for the next one. */
export type EncoderCounts = Map<string, {
    frames: number;
    encodeTime: number;
    bytes: number;
    at: number;
    cpu?: number;
}>;
type StatsLike = {
    forEach(fn: (s: any) => void): void;
    get(id: string): any;
};
/**
 * A camera sender's reading from its stats (RTCStatsReport) against the counts of the one before (null the first time:
 * no reading yet). rids: the sender's encodings', lowest first; maxFps: the most frames a second they send (0: none
 * said), over which its source's frames aren't the encoder's to send: a camera giving 60, sent at 30, keeps them all.
 */
export declare function readEncoder(before: EncoderCounts | null, report: StatsLike, rids: string[], maxFps?: number): {
    reading: EncoderReading | null;
    counts: EncoderCounts;
};
/**
 * Watches a camera's sender (its primary codec's, not a backup's) while it sends, and once its hardware encoder is seen
 * dropping frames (dropsFrames() over the last HARDWARE_DROP_READINGS readings) remembers the codec for this browser and
 * stops. The camera sending now isn't changed: the next one goes out in software. The answer stops it.
 *
 * sender: the sender, whose track ending stops the watch; or what gives the camera's sender now, which the watch
 * follows until stopped: a full reconnect publishes the camera on a new sender, and a phone's camera put away in the
 * background is opened again on the same one, which the sender alone left unwatched (the review after the move to the
 * mesh, 2026-10-21). A new sender, a camera gone for a while, or a path that went down starts the readings over; a
 * getter that gives no live camera for HARDWARE_WATCH_GONE_MS ends the watch.
 *
 * The CPU watch, for a checked call camera (`records`) or one that may be moved (onCpuHeld, camera-adapt.ts): a camera in
 * VP9 or AV1 its CPU can't carry, by the same readings (cpuHeld(): the encoder's stats say the CPU held it back half of
 * the last 20 s or more), which remembers the codec as too heavy here (`cpu`, a week, where `records`), tells onCpuHeld
 * where given, and stops. A pass remembered for either is replaced at once. Both say the lines the camera was held back
 * at (its track's height, which the encoder may have shrunk on its own): a camera in VP9 held back above 720 is stepped
 * down to 720 (camera-adapt.ts, stepDownCamera()), and its record leaves VP9 at 720 for the next.
 *
 * records: what the watch finds is written to this browser's records too (room-publish.ts, CameraCodecRecord), for a
 * checked call camera, whether or not the node lets it be moved; without, only the drops, to the list older releases
 * kept, as before the camera check.
 *
 * tune: the node's numbers (the policy's, room-publish.ts cameraTune()): how long a hardware encoder drops frames
 * (dropWatchS) and a software one is held back (cpuWatchS) before either counts, and the share of that time held back
 * that does (cpuShare). The built-in ones without.
 *
 * drops: false watches the CPU alone, for a shared screen (1.0.47): a busy screen in a Mac's VideoToolbox can read as
 * dropped frames, and what the drops watch remembers keeps this browser's next camera out of its hardware.
 */
export declare function watchCameraEncoder(sender: RTCRtpSender | (() => RTCRtpSender | null | undefined), options?: {
    readMs?: number;
    tune?: Pick<CameraTune, 'dropWatchS' | 'cpuWatchS' | 'cpuShare'>;
    records?: boolean;
    drops?: boolean;
    onDrops?: (codec: CameraCodec) => void;
    onCpuHeld?: (codec: CameraCodec, why: 'cpu', lines: number) => void;
    /** 1.0.53: the node's settings, or what gives them now (the room's, live): the watch's numbers (watchNumbers()) */
    settings?: CallSettings | null | (() => CallSettings | null | undefined);
}): () => void;
export {};
