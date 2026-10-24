/**
 * A camera's codec chosen by measuring it, before the camera goes into a room, with a progress indicator on the camera
 * button while it runs, as other buttons have.
 *
 * Why: a browser's word for what it encodes (navigator.mediaCapabilities) says whether a hardware encoder is there, not
 * whether it works. Chrome trusts no Windows hardware encoder's own rate control for H.264 (Chromium's
 * media_foundation_video_encode_accelerator_win.cc: no software rate control on AMD and ARM, a flag elsewhere), so
 * libwebrtc's frame dropper takes whole frames off a camera whose encoder overshoots its target, every layer at once,
 * naming no reason: 13 of 34 Windows senders in hardware H.264 froze for their viewers in a day of calls, none of 15
 * Macs; user_9's camera sent 4 of 15 frames a second for 40 minutes (otherworldcommunity.com_8_video, 2026-10-23), and
 * 720p at 14-15 in VP9 at 13 ms a frame once it moved. And a software codec costs a CPU that may not have it.
 *
 * How: the camera's own picture (a clone of its track) goes through the browser's real WebRTC sender, in a loopback of
 * two peer connections inside the page, in the codec to be tried, at the room's top layer: the encoder, its rate
 * control and libwebrtc's frame dropper are the ones a room's camera runs. Over CAMERA_CHECK_WINDOW_MS after a warm-up,
 * its stats tell the frames its source gave against those it encoded and sent, the ms a frame took, how long the
 * browser said the CPU held it back, and whether the encoder is the hardware (judgeEncoder()).
 *
 * Where: a machine a camera rule names (cameraRuleOrder(): the node's rules, or DEFAULT_CAMERA_RULES where it sends no
 * `rules` key, Windows and Linux, where the frozen hardware H.264 senders were; `rules: []` names none). Every other
 * machine's camera (a Mac, an iPhone or iPad, Android) starts as today at once, no spinner: a Mac's first hardware
 * session in a browser gives its first frame 2.0-2.3 s late and few for 2 s more (the mesh lab, 2026-10-23), so its
 * check would end unsure every day for nothing. The in-call watch and moves (camera-adapt.ts) run on every machine.
 *
 * The order (room-publish.ts, cameraCodecOrder()): a rule's of the node's policy (by default VP9 first on Windows and
 * Linux), else the policy's (hardware H.264 first); VP9 before VP8 always, VP8 last and never measured
 * (VP8 only once VP9 failed too). A hardware H.264 or H.265 that drops frames is remembered as
 * `drops`, a software codec the CPU can't carry as `cpu`, a codec that does well as `pass` (one record a codec,
 * CameraCodecRecord), and the next is tried. A browser holds its records a month (a CPU's failure a week), until its
 * major version changes, so later calls skip the measuring.
 *
 * VP9 in software is tried at the camera's lines up to VP9_TOP_HEIGHT, 1080 first (1.0.41), where every other codec in
 * software is tried at 720. Its CPU unable there, it goes out at CAMERA_STEP_DOWN_HEIGHT, 720, where the same
 * measurement says 720 fits (fitsLower()), and a call steps it down to 720 the same way (camera-adapt.ts,
 * stepDownCamera()). Its record holds the lines it was found at.
 *
 * Bounded: the policy's tune.checkMs (4 s) in all; past it, or where the loopback can't run or says too little (a
 * camera giving few frames, a check that never connected, an encoder that didn't keep up with its camera before the
 * window had to start), the codec goes out as the policy has it, unmeasured, as before. An encoder still starting is
 * never taken for one that drops frames. Every threshold is the node's to change (room-publish.ts, cameraTune()).
 */
import { type CameraChoice, type CameraCodec, type CameraCodecCaps, type CameraCodecOptions, type CameraCodecResult, type CameraTune } from "./room-publish.js";
/** How long the loopback may take to connect (its first frame may take longer: as long as a measuring still fits). */
export declare const CAMERA_CHECK_CONNECT_MS = 1500;
/** After the first frame is encoded, how long at least before the measuring starts (the encoder's first frames run slow). */
export declare const CAMERA_CHECK_WARMUP_MS = 400;
/**
 * The stretch over which an encoder must keep up with its camera before the measuring starts: send at least the
 * policy's passSent (80%) of the frames the camera gave over it. A hardware encoder's first session in a browser starts
 * late and slow (Chrome's VideoToolbox on a Mac: its first frame at 2.0-2.3 s, then 5 and 2 of 15 a second; the mesh
 * lab, 2026-10-23); measured then, it would read as one that takes frames off.
 */
export declare const CAMERA_CHECK_KEEPUP_MS = 500;
/** How long the encoder is measured. */
export declare const CAMERA_CHECK_WINDOW_MS = 1200;
/**
 * The whole check, every codec tried, without a policy's tune.checkMs (a check that throws or runs over about 3 s
 * starts the camera as before it): a measurement ends by it whatever it reached, and past it the next codec goes
 * out unmeasured.
 */
export declare const CAMERA_CHECK_BUDGET_MS: number;
/** The share of the camera's frames an encoder must send (at 30 a second at most), without a policy's tune.passSent. */
export declare const CHECK_MIN_SENT_SHARE: number;
/** The share of the time the browser may say the CPU held it back, without tune.passCpu. */
export declare const CHECK_MAX_CPU_SHARE: number;
/** The share of a frame's interval its encoding may take, without tune.passEncode. */
export declare const CHECK_MAX_FRAME_SHARE: number;
/** The frames the camera must give over the window for a verdict: fewer (a dim room, a camera starting) say too little. */
export declare const CHECK_MIN_FRAMES = 6;
/** What a loopback's stats said over its window: the counts between two readings. */
export interface EncoderSample {
    /** frames the camera gave */
    captured: number;
    /** frames encoded */
    encoded: number;
    /** frames sent */
    sent: number;
    /** the window, ms */
    elapsedMs: number;
    /** seconds spent encoding (totalEncodeTime) */
    encodeSeconds: number;
    /** seconds the browser said the CPU held the encoder back (qualityLimitationDurations.cpu) */
    cpuSeconds: number;
    /** seconds it said bandwidth did */
    bandwidthSeconds: number;
    /** the frames a second the camera gives (media-source framesPerSecond; 0 not said) */
    captureFps: number;
    /** the browser's name for the encoder (encoderImplementation) */
    implementation: string;
    /** whether it encodes in hardware (powerEfficientEncoder, or the name) */
    hardware: boolean;
    /**
     * whether the browser said which encoder it is (an encoderImplementation, or a powerEfficientEncoder): WebKit and
     * Firefox say neither, and `hardware` false then means nothing. Missing: said.
     */
    known?: boolean;
    /** the window's second half alone: an encoder that keeps up there and not over the whole is still starting */
    late?: EncoderSample;
    /** the lines of the picture it encoded at the end (outbound-rtp frameHeight, the top layer's): the CPU may have shrunk it */
    frameHeight?: number;
}
/** What a check found of one codec: its result (null: too little to tell), and the numbers it was found by. */
export interface CameraCheckVerdict {
    codec: CameraCodec;
    result: CameraCodecResult | null;
    msPerFrame: number | null;
    sentShare: number | null;
    cpuShare: number | null;
    implementation: string;
    hardware: boolean;
    /**
     * why, in a word: "ok", "drops", "software" (the hardware wasn't used), "cpu", "slow", "few-frames", "bandwidth",
     * "slow-start" (an encoder still starting: its first frame, or keeping up with its camera, too late to measure, or
     * rising through the window), "failed", "timeout", "ended"
     */
    why: string;
    /** the lines the camera was measured at (measureCameraEncoder()), and the frames a second it was judged against */
    height?: number;
    fps?: number;
    /** the lines it encoded at the end (EncoderSample.frameHeight) */
    frameHeight?: number;
}
/**
 * The verdict on one codec from its loopback's numbers. wantHardware: the codec was to go out in hardware (H.264,
 * H.265), whose failure is its frames taken off (`drops`); otherwise a software codec, whose failure is the CPU's (`cpu`).
 *
 * - too little to tell (null): under CHECK_MIN_FRAMES frames from the camera, nothing encoded, or held back by
 *   bandwidth most of the window (the loopback's estimate still rising); and a hardware codec whose encoder the browser
 *   doesn't name (`known` false: WebKit, Firefox), which is never taken for software;
 * - hardware: `drops` where the browser didn't encode it in hardware after all (a fallback to software), or sent under
 *   CHECK_MIN_SENT_SHARE of the camera's frames;
 * - software: `cpu` where the CPU held it back over CHECK_MAX_CPU_SHARE of the window, a picture took over
 *   CHECK_MAX_FRAME_SHARE of its interval, or it sent under CHECK_MIN_SENT_SHARE;
 * - `pass` otherwise.
 * Sending under CHECK_MIN_SENT_SHARE over the window while keeping up in its second half (`late`) is an encoder still
 * starting: too little to tell ("slow-start"), never drops nor cpu. The time a picture takes is the encoding time over
 * the pictures the camera gave, no more: an SVC encoding (VP9, AV1) counts each spatial layer's frame as encoded (Chrome's
 * VP9 L3T3 about 31 a second from a 15 fps camera), which spread a picture's time over two or three. The three shares
 * are the policy's tune's where given (passSent, passCpu, passEncode).
 */
export declare function judgeEncoder(codec: CameraCodec, wantHardware: boolean, s: EncoderSample, tune?: Pick<CameraTune, 'passSent' | 'passCpu' | 'passEncode'>): CameraCheckVerdict;
/**
 * Whether an encoder keeps up with its camera over a stretch (the check's warm-up, CAMERA_CHECK_KEEPUP_MS): the camera
 * gave two frames or more, and it sent at least passSent of them.
 */
export declare function keepsUp(s: Pick<EncoderSample, 'captured' | 'sent' | 'elapsedMs'>, passSent: number): boolean;
/**
 * The share of its frame interval a picture inferred at a lower height (fitsLower()) may take: it goes out unmeasured,
 * so it needs room to spare that a measured one doesn't.
 */
export declare const CHECK_INFER_HEADROOM = 0.8;
/**
 * Whether a software codec its CPU couldn't carry at the height it was measured at would carry `to` lines
 * (CAMERA_STEP_DOWN_HEIGHT), told from the same measurement rather than a second one, which the check's budget has no
 * room for, with 1080p tried first: the encoding time of a picture scales with
 * its pixels, a layered one's too (VP9's three at 720 lines are 0.44 of those at 1080), so the time a picture took,
 * scaled from the lines it was encoded at to `to`, has to fit CHECK_INFER_HEADROOM of passEncode of its interval. From
 * the lines it encoded at the end, which the CPU may already have shrunk: an encoder held back to `to` lines or under
 * doesn't fit them. Only a `cpu` verdict with its time and frame rate.
 */
export declare function fitsLower(verdict: CameraCheckVerdict, to: number, tune?: Pick<CameraTune, 'passEncode'>): boolean;
type StatsLike = {
    forEach(fn: (s: any) => void): void;
};
/** The counts a loopback's sender stats hold now: what two of them make an EncoderSample from. */
export interface EncoderCountsNow {
    at: number;
    captured: number;
    encoded: number;
    sent: number;
    encodeSeconds: number;
    cpuSeconds: number;
    bandwidthSeconds: number;
    captureFps: number;
    implementation: string;
    hardware: boolean;
    /** the browser named its encoder (encoderImplementation) or said whether it is power efficient */
    known: boolean;
    /** the lines of the picture it encodes now (frameHeight, the tallest of its outbound streams); 0 not said */
    frameHeight: number;
}
/** The sender's counts from its stats (an RTCStatsReport): its outbound-rtp's, summed, and its media-source's frames. */
export declare function encoderCounts(report: StatsLike): EncoderCountsNow;
/** What two readings make: the window's counts. */
export declare function sampleBetween(a: EncoderCountsNow, b: EncoderCountsNow): EncoderSample;
/** What measureCameraEncoder() needs of the room: the camera's height, and whether its H.264 is the mesh's Baseline. */
export interface MeasureOptions {
    /** the camera's height, for the top layer's bitrate (cameraPublish); 720 when not given */
    height?: number;
    /** the most lines it is measured at (VP9_TOP_HEIGHT for VP9 in software); cameraMaxHeight() of the codec when not given */
    maxHeight?: number;
    /** the room is on the mesh, which takes Chromium's Baseline H.264 (CHROMIUM_H264_ENCODE): asked of it as a room is */
    mesh?: boolean;
    /** when (ms since the epoch) the measuring must have ended: past it, too little to tell ("timeout") */
    until?: number;
    /** the verdict's shares (the policy's tune); the defaults when not given */
    tune?: Pick<CameraTune, 'passSent' | 'passCpu' | 'passEncode'>;
    /** true once the camera is let go of: the measuring stops at once ("ended"), as when its track ends */
    stop?: () => boolean;
}
/** How often a measurement looks whether its camera was let go of. */
export declare const CAMERA_CHECK_POLL_MS = 100;
/**
 * Measures codec on this device: the camera's picture (a clone of track, stopped after) through a loopback of two peer
 * connections in the page, at the room's top layer for codec (VP9 and AV1 as their one SVC stream), for
 * CAMERA_CHECK_WINDOW_MS after CAMERA_CHECK_WARMUP_MS; the verdict as judgeEncoder() gives it. Too little to tell
 * (result null, why "failed") where the browser can't run it or it didn't connect within CAMERA_CHECK_CONNECT_MS.
 *
 * Every wait in it ends by `until` ("timeout"), and every CAMERA_CHECK_POLL_MS it looks whether the camera was let go
 * of (its track ended, or `stop`): then it gives up at once ("ended"). Either way the clone is stopped and both peer
 * connections closed, so nothing holds the camera after the person turned it off or round.
 */
export declare function measureCameraEncoder(track: MediaStreamTrack, codec: CameraCodec, wantHardware: boolean, options?: MeasureOptions): Promise<CameraCheckVerdict>;
/** The graphics adapter, as WebGPU names it ("amd rdna-3"), within 300 ms; undefined where the browser doesn't say. */
export declare function graphicsAdapter(): Promise<string | undefined>;
/** What checkedCameraChoice() takes besides the codec rule's options. */
export interface CameraCheckOptions extends CameraCodecOptions {
    /** the camera's height (cameraPublish's layers); 720 when not given */
    height?: number;
    /** the whole check's budget; the policy's tune.checkMs when not given */
    budgetMs?: number;
    /** how a codec is measured (tests give their own); measureCameraEncoder() */
    measure?: (track: MediaStreamTrack, codec: CameraCodec, wantHardware: boolean, options: MeasureOptions) => Promise<CameraCheckVerdict>;
    /**
     * The camera is out in the call already (a direct call's handed to the room, a reconnect publishing it again): nothing
     * is measured, what this browser remembers decides.
     */
    live?: boolean;
    /** true once the camera is let go of (turned off, turned round): the check stops at once */
    stop?: () => boolean;
    /**
     * A camera move's pick (nextCameraChoice()): measured on any machine, where a camera turned on is checked only on one
     * a camera rule names.
     */
    move?: boolean;
}
/**
 * One codec as the mesh hears of it (MeshCameraReport): measured this time (cached false), or read from this browser's
 * records (cached true, with when it was found).
 */
export interface CameraTest {
    codec: CameraCodec;
    hardware: boolean;
    /** "error": the check said too little (see CameraCheckVerdict.why) */
    result: CameraCodecResult | 'error';
    msPerFrame: number | null;
    sentShare: number | null;
    cpuShare: number | null;
    cached: boolean;
    at: number;
    /** the lines it was found at, where said (a codec in software, CameraCodecRecord.height) */
    height?: number;
}
/** A camera moved to another codec during a call (camera-adapt.ts), as the mesh hears of it. */
export interface CameraSwitch {
    from: CameraCodec;
    to: CameraCodec;
    /** its hardware encoder took frames off; the CPU held its software encoder back (the encoder's own word for it) */
    why: 'drops' | 'cpu';
    at: number;
}
/**
 * A camera's codec, checked: the choice; each codec it measured (`checked`); how it was decided (`source`: "check" a
 * codec was measured now, "memory" a record decided it, "default" the policy's order as it stands); how long the check
 * took; and every codec it measured or read (`tests`), for the mesh (MeshCameraReport).
 */
export type CheckedCameraChoice = CameraChoice & {
    checked: CameraCheckVerdict[];
    source: 'check' | 'memory' | 'default';
    checkMs: number;
    tests: CameraTest[];
};
/**
 * What a camera reports to the mesh with the client's next reading (rtc-client's Room.reportMeshCamera, signal field
 * 1003, so the server can decide further from what every call reports): the codec it goes out
 * in, how that was decided, the check's ms, every codec tried or read, and this call's last MESH_CAMERA_SWITCHES moves.
 */
export interface MeshCameraReport {
    codec: CameraCodec;
    source: 'check' | 'memory' | 'default' | 'switch';
    checkMs: number;
    tests: CameraTest[];
    switches: CameraSwitch[];
}
/** The moves a report carries, the last of the call. */
export declare const MESH_CAMERA_SWITCHES = 4;
/**
 * The report for choice (MeshCameraReport), with the call's switches (the last MESH_CAMERA_SWITCHES) and `source`
 * "switch" when the last move made the codec it goes out in. Numbers rounded; under 2 KB as JSON (a report never holds
 * more than the five codecs' tests and four moves).
 */
export declare function meshCameraReport(choice: Pick<CheckedCameraChoice, 'codec' | 'source' | 'checkMs' | 'tests'>, switches?: readonly CameraSwitch[]): MeshCameraReport;
/**
 * Hands report to the room's client for its next reading (rtc-client 1.0.16's Room.reportMeshCamera); a client
 * without it, or no room, is left alone.
 */
export declare function reportMeshCamera(room: unknown, report: MeshCameraReport): void;
/** Whether a camera check is running on this page now: what a camera control's busy spinner shows. */
export declare function cameraCheckRunning(): boolean;
/** Calls listener whenever a camera check starts or ends (true while one runs); the answer stops it. */
export declare function onCameraCheck(listener: (running: boolean) => void): () => void;
/**
 * The camera's codec as it went out before the camera check, exactly: the policy's list or the built-in one, less the
 * dropped-frames list older releases kept (room-publish.ts, legacyCamera()). What every camera the check doesn't measure
 * goes out in, and where a check gives up: the same answer whichever gives up first, the check or its product's limit
 * on it.
 */
export declare function todaysCameraChoice(caps: CameraCodecCaps | null, agent: string, options?: CameraCodecOptions): CameraChoice;
/**
 * The camera's codec on this device, measured (the module's comment): the codecs in cameraCodecOrder(), each that needs
 * it measured unless a record says it passed, the first that passes taken. A hardware H.264 or H.265 needs it (its
 * frames may be taken off), and VP9 or AV1 in software (the CPU may not carry it); VP8 never. Records each verdict
 * (CameraCodecRecord). Past the budget, or where a check says too little, the codec goes out as the order has it,
 * unmeasured; where that is a codec a rule puts first in software (by default VP9 on Windows and Linux), today's choice
 * instead (todaysCameraChoice()), never VP8 for it. VP9 in software is measured at up to VP9_TOP_HEIGHT and goes out at
 * the lines it passed at, or at CAMERA_STEP_DOWN_HEIGHT where it only fits there (CameraChoice.height). The budget, the
 * verdict's shares and how long records hold are the policy's tune's (cameraTune()).
 *
 * Today's choice, nothing measured and nothing read or written: no track (an audio call), a camera let go of, WebKit or
 * Firefox (uncheckedBrowser()), an encrypted room, every room whose node didn't say `check`: true (an older mesh, a
 * self-hosted box, stock LiveKit: nothing there could turn the check off), and every machine no camera rule names (by
 * default all but Windows and Linux; the node widens it with rules of its own, `rules: []`
 * names none), unless the pick is a move's (`move`, nextCameraChoice()). A camera already out in the call (`live`) is
 * measured never: what this browser remembers decides. A camera let go of during the check (`stop`, or its track
 * ended) ends it at once, with today's choice and nothing written. A check that couldn't tell is remembered a day
 * (`unsure`), and the cameras of that day go out as today without measuring.
 */
export declare function checkedCameraChoice(track: MediaStreamTrack | null | undefined, caps: CameraCodecCaps | null, agent: string, given?: CameraCheckOptions): Promise<CheckedCameraChoice>;
export {};
