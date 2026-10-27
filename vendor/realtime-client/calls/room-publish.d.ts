/**
 * How a camera and a screen go out into a room on the mesh: the codec, the layers, and the pixel density a tile asks
 * layers by. Better Messages' group calls, the SDK's (GroupCall) and Easy Stream's broadcasts take their codec from
 * here, so the three send alike: a modern codec, with a fallback every receiver decodes. Group calls take their layers
 * too. No imports, so a product's unit tests can transpile it alone.
 *
 * The codec: the best this device encodes in hardware, with VP8 behind it for a receiver that decodes none of it, so
 * hardware encodes and decodes wherever it can and no receiver gets what it cannot decode. Each receiver gets the one
 * it decodes in hardware, which its client tells the mesh on its join (@wordplus/rtc-client 1.0.3, mesh_hwdec), and VP8
 * only where it decodes the other in software at best.
 * - H.265 where the device encodes it in hardware and the room is on the mesh, which forwards it since WordPlus Mesh
 *   1.0.19: every Mac, iPhone and iPad (Chrome 154 on a Mac: H.265 power efficient, VP9 and AV1 not), and the
 *   Windows and Android devices whose probe says so. The most picture per bit any of them makes without its CPU.
 *   Not yet (H265_FIRST).
 * - H.264 where the device encodes that in hardware, which nearly every receiver decodes in hardware too. WebKit does,
 *   by VideoToolbox, in every profile, so Safari and every iPhone and iPad browser aren't asked. Chrome on a desktop
 *   encodes Baseline, Main and High in hardware (VideoToolbox on a Mac, Media Foundation on Windows) and Constrained
 *   Baseline, the profile a room took, in OpenH264 on the CPU, and its probe (navigator.mediaCapabilities) answers so
 *   (2026-10-18, Chrome 155: a Mac's camera sent in OpenH264 at 1080p, H.264 picked without hardware to encode it).
 *   The mesh takes its Baseline since WordPlus Mesh 1.0.34, so there Chrome is
 *   asked of Baseline (CHROMIUM_H264_ENCODE); elsewhere of Constrained Baseline, which Android's hardware encodes.
 * - VP8 otherwise; from Firefox (LiveKit takes no VP9 or AV1 from it, and a Firefox without OpenH264 sends no H.264
 *   picture); and in an end-to-end encrypted room, where livekit-client sends no backup codec, so the codec itself has
 *   to be one every browser and app decodes.
 * Not VP9 or AV1 by default: no device we ship to encodes them in hardware in the layers LiveKit publishes them in (one
 * stream, L3T3_KEY). Scored against Xiph's KristenAndSara at 720p (VMAF): VP8 88 at 2.5 Mbit/s, H.264 in a Mac's
 * hardware 92 at 1.27.
 *
 * The media server may ask for others (CodecPolicy, WordPlus Mesh 1.0.33's mesh.codec_policy, 2026-10-18), so codecs
 * can change from the server without a client update, and every browser has to keep working when it asks for VP9 or
 * H.265. Its list is a preference: a codec goes out only where
 * this browser sends it (the probe, and livekit-client's own limits), never from Firefox or into an encrypted room,
 * and VP8 is where any list ends.
 */
export type CameraCodec = 'h265' | 'h264' | 'vp8' | 'vp9' | 'av1';
/** What probeCodecCaps() found, as far as the codec needs it. */
export interface CameraCodecCaps {
    families: Record<string, {
        enc?: {
            ok?: boolean;
            hw?: boolean;
        };
    } | undefined>;
    /** Chromium's answer to CHROMIUM_H264_ENCODE: H.264 Baseline in hardware. Missing: not asked (not Chromium). */
    h264Baseline?: boolean | null;
}
/**
 * The question Chromium answers of its H.264 hardware for the Baseline the mesh takes from it (1.0.34): Baseline,
 * packetization mode 1, level 4.2 (1080p60). Chrome 155 on a desktop answered it power efficient where it encodes in
 * VideoToolbox or Media Foundation (an AMD encoder), and Constrained Baseline not, which it encodes in OpenH264.
 */
export declare const CHROMIUM_H264_ENCODE = "video/H264;profile-level-id=42002a;packetization-mode=1";
/**
 * Which codecs this device encodes in hardware (null or missing: not known), and which it encodes at all (`encodes`, the
 * probe's answer; missing: not known).
 */
export interface CameraHardware {
    h264?: boolean | null;
    h265?: boolean | null;
    vp9?: boolean | null;
    av1?: boolean | null;
    /** H.264 Baseline in hardware (CameraCodecCaps.h264Baseline), which counts on the mesh alone. */
    h264Baseline?: boolean | null;
    encodes?: Partial<Record<CameraCodec, boolean | null>>;
    /**
     * The codecs the browser's WebRTC sends at all (RTCRtpSender.getCapabilities), as livekit-client checks them: a
     * codec missing here goes out as VP8 whatever was asked. Missing: not known.
     */
    sendable?: CameraCodec[] | null;
}
/**
 * A media server's codec policy, as WordPlus Mesh 1.0.33 sends it with its join response (mesh.codec_policy;
 * rtc-client's Room.meshCodecPolicy). Each list goes first choice first, "h265:hw" taking H.265 only where this device
 * encodes it in hardware; an unknown name is passed over. Without a list, the built-in one (DEFAULT_CAMERA_POLICY).
 */
export interface CodecPolicy {
    camera?: string[];
    screen?: string[];
    /** Behind a camera in any codec but VP8, for a viewer that decodes none of it: vp8 (the default), or h264. */
    backup?: string;
    /**
     * The node's switches, each on only when the node says true, as every WordPlus Mesh from 1.0.53
     * does unless its configuration turns it off: `check` true measures a call's camera before it goes out, on a machine
     * a camera rule names (`rules`; camera-check.ts); `adapt` true, with `check`, moves it to another codec during a
     * call, on any machine (camera-adapt.ts). Missing
     * or false, as from an older mesh, a self-hosted box or stock LiveKit, where no server could turn them off: the
     * camera exactly as before the check (legacyCamera()).
     */
    check?: boolean;
    adapt?: boolean;
    /**
     * Which camera order a browser takes, by its system, browser, graphics maker and kind of device (camera-tune.ts,
     * CameraRule): the first that matches decides, ahead of `camera`. And where the check runs: only a machine a rule
     * names is measured before its camera goes out, every other starts as today. Missing: DEFAULT_CAMERA_RULES (Windows
     * and Linux); an empty list: none, so no machine is checked; a rule of the node's own
     * (`{ os: 'mac', camera: [...] }`) adds those machines.
     */
    rules?: CameraRule[];
    /** The check's, the watch's, the moves' and the records' numbers (camera-tune.ts, CameraTune), each optional. */
    tune?: Partial<CameraTune>;
    /**
     * 1.0.53: the node's settings this policy was made from (callPolicy()), for every number here that isn't the
     * policy's own: the layers, the bitrates, the heights, the screen's and the microphone's. Missing: today's numbers.
     */
    settings?: CallSettings | null;
}
/**
 * The node's settings for this client (@wordplus/rtc-client 1.0.23's Room.meshSettings; better-messages-server
 * infra/CLIENT-CONFIG.md): a key's value, the node's or the schema's default (null where the default is the product's
 * own rule), and whether the node set it. Every function here that takes `settings` reads its numbers from them, and
 * without them has today's.
 */
export interface CallSettings {
    get<T = unknown>(key: string): T;
    has(key: string): boolean;
    /** the document's revision; -1 before the node sent any */
    readonly rev: number;
    readonly applyNow?: boolean;
}
/** A number of the settings, or `fallback` without them, or where they give no number. */
export declare function settingNumber(settings: CallSettings | null | undefined, key: string, fallback: number): number;
/** A switch of the settings, or `fallback`. */
export declare function settingFlag(settings: CallSettings | null | undefined, key: string, fallback: boolean): boolean;
/** A word of the settings, or `fallback`. */
export declare function settingWord<T extends string>(settings: CallSettings | null | undefined, key: string, fallback: T): T;
/**
 * The policy a product's camera and screen go by: from the node's settings once it sent any (settings.rev 0 or more),
 * which say everything the codec policy does and more, else the codec policy as a node before them sends it (rtc-client's
 * Room.meshCodecPolicy). A node of the settings sends both, the policy made from the same document, so either way a
 * browser publishes alike. The settings go with it (CodecPolicy.settings).
 */
export declare function callPolicy(codecPolicy?: CodecPolicy | null, settings?: CallSettings | null): CodecPolicy | null;
export interface CameraCodecOptions {
    /** The room's media is encrypted end to end: VP8, since livekit-client sends no backup codec there. */
    encrypted?: boolean;
    /**
     * The media server is the mesh (rtc-client's isMeshServer): it forwards H.265 (WordPlus Mesh 1.0.19 and later), and
     * takes a desktop Chrome's H.264 in the Baseline it encodes in hardware (1.0.34).
     */
    h265?: boolean;
    /** The media server's codec policy; null or missing: the built-in one. */
    policy?: CodecPolicy | null;
    /**
     * Codecs not to send from this device, whatever the policy says: those whose hardware encoder was seen here dropping
     * most of the camera's frames (encoder-watch.ts, camera-check.ts), and those its CPU couldn't encode in software
     * (camera-check.ts). Missing: what this browser remembers (droppedCameraCodecs(), heavySoftwareCodecs()); for a
     * camera on the old rules (legacyCamera()), the list older releases kept alone (droppedHardwareCodecs()).
     */
    avoid?: readonly CameraCodec[];
    /**
     * A call's camera (Better Messages'), measured before it goes out (camera-check.ts): on the mesh its built-in list
     * tries VP9 before VP8, the policy's rules apply (by default Windows and Linux put VP9 first),
     * and what the checks found is read. Missing, or where the node turned the check off: the old rules exactly
     * (legacyCamera()), as a live stream's camera, the SDK's group calls and every camera off the mesh keep them.
     */
    call?: boolean;
    /** The graphics adapter's name, for a rule naming a maker (camera-tune.ts, gpuMaker()); missing: what the page read. */
    gpu?: string | null;
}
/** The numbers, as cameraTune() gives them. */
export interface CameraTune {
    /** the whole check's budget, ms */
    checkMs: number;
    /** a check's pass: the least share of the camera's frames sent */
    passSent: number;
    /** a check's pass: the most share of the test the CPU held the encoder back */
    passCpu: number;
    /** a check's pass: the most encode time a frame, as a share of the frame interval */
    passEncode: number;
    /** how long a hardware encoder must drop frames in a call before it counts, s */
    dropWatchS: number;
    /** how long VP9 or AV1 must be held back by the CPU (or under CPU pressure) in a call before it counts, s */
    cpuWatchS: number;
    /** the share of that time held back by the CPU that counts */
    cpuShare: number;
    /** camera moves a call at most; 0 never moves */
    switchesMax: number;
    /** the least time between two moves, s */
    switchGapS: number;
    /** no move in a camera's first this long, s */
    warmupS: number;
    /** the longest a tile says "Optimizing video quality...", s */
    failsafeS: number;
    /** how long a moved camera's new publication may take before it goes out in its old codec again, s */
    republishTimeoutS: number;
    /** how long a remembered pass holds, days */
    rememberPassDays: number;
    /** how long a remembered hardware drop holds, days */
    rememberDropsDays: number;
    /** how long a codec remembered too heavy for the CPU holds, days */
    rememberCpuDays: number;
    /** results remembered before this (ms since the epoch) are ignored, so every browser measures again; 0 none */
    forgetBefore: number;
}
/** The numbers where the policy gives none. */
export declare const CAMERA_TUNE_DEFAULTS: Readonly<CameraTune>;
/**
 * The least and most each number may be, one outside held to the nearer end: the node's own ranges exactly (WordPlus
 * Mesh's pkg/rtc/codecpolicy.go, CodecTuneRange), so a browser takes what the node would take.
 */
export declare const CAMERA_TUNE_RANGES: Readonly<Record<keyof CameraTune, readonly [number, number]>>;
/**
 * The numbers for policy: its `tune`'s, each a finite number held to CAMERA_TUNE_RANGES (switchesMax a whole one), the
 * defaults for the rest. `forgetBefore` later than now is taken as none: a clock ahead would have every browser measure
 * at every join.
 */
export declare function cameraTune(policy?: CodecPolicy | null, now?: number): CameraTune;
/** The kinds of system, browser, graphics maker and device a rule names. */
export type CameraOs = 'windows' | 'mac' | 'linux' | 'android' | 'ios';
export type CameraBrowser = 'chrome' | 'edge' | 'opera' | 'firefox' | 'safari';
export type CameraGpu = 'amd' | 'intel' | 'nvidia' | 'apple' | 'qualcomm' | 'arm' | 'other' | 'unknown';
export type CameraDevice = 'desktop' | 'phone' | 'tablet';
/** One rule: the browsers it is for (every field given must match) and their camera order, as the policy's `camera`. */
export interface CameraRule {
    os?: CameraOs;
    browser?: CameraBrowser;
    gpu?: CameraGpu;
    device?: CameraDevice;
    camera: string[];
}
/**
 * The rules where the policy has no `rules` key, and the only machines the camera check measures by default
 * (camera-check.ts): Windows and Linux (ChromeOS too, cameraEnvironment()), every browser, kind of device and GPU.
 *
 * Windows measures its hardware H.264 first (1.0.55), then VP9, then VP8. Many Windows encoders carry a camera well, and
 * the ones that don't drop whole frames (Chrome turns its own rate control off over AMD's and Qualcomm's H.264 encoder:
 * Chromium's gpu_driver_bug_list.json, entries 448 and 449), which the check counts before the camera goes out and the
 * call's watch counts after (encoder-watch.ts): either way the camera goes on in VP9, remembered for a month. Whichever
 * encoder Chrome opens is what is measured, not a GPU's name: on a PC with two GPUs, WebGPU's name for one says nothing
 * of the encoder, which Chrome picks among every hardware H.264 encoder there by merit (1.0.50 went by the name, 1.0.54
 * put VP9 first everywhere instead). Linux keeps VP9 first: Chrome there encodes nothing in hardware by default.
 *
 * A Mac, an iPhone or iPad and Android are named by none: their hardware H.264 goes out first, unmeasured. A week of
 * calls to 2026-10-24 (production traces, viewers' freezes by sender): hardware H.264 frozen 2.1% of the time watched
 * from Windows, 13% of its 91 senders 5% or more, 3.7% from Linux and ChromeOS, 1.5% from a Mac and from iOS, 0.7% from
 * an Android browser, none of its 19 senders 5% or more. A node's own rules may still name a GPU (cameraRuleFor()).
 * Firefox sends VP8 wherever it is (codecsOf()).
 */
export declare const DEFAULT_CAMERA_RULES: readonly CameraRule[];
/** The rules policy gives: its `rules` (none where the key holds anything but a list), else DEFAULT_CAMERA_RULES. */
export declare function cameraRules(policy?: CodecPolicy | null): readonly CameraRule[];
/** What a rule is matched against: this browser's system, browser, kind of device and graphics maker. */
export interface CameraEnvironment {
    os: CameraOs | null;
    browser: CameraBrowser | null;
    device: CameraDevice;
    gpu: CameraGpu;
}
/**
 * The graphics maker, from WebGPU's adapter info ("amd rdna-3", "nvidia ampere"), by the words the controller reads it
 * by; "unknown" where the page can't tell.
 */
export declare function gpuMaker(adapter?: string | null): CameraGpu;
/** This browser, from its user agent and its graphics adapter's name (gpuMaker()). */
export declare function cameraEnvironment(agent: string, adapter?: string | null): CameraEnvironment;
/** The first of rules whose given fields all match env and that names a camera order; null where none does. */
export declare function cameraRuleFor(rules: readonly CameraRule[], env: CameraEnvironment): CameraRule | null;
/** Keeps the graphics adapter's name the page read (camera-check.ts, graphicsAdapter()). */
export declare function rememberAdapter(name: string | null | undefined): void;
/** The graphics adapter's name the page read; undefined while nothing asked (a record names it only then). */
export declare function knownAdapter(): string | null | undefined;
/**
 * Whether any of rules names a graphics maker: a check waits for the adapter's name only then. Given env (this browser's,
 * its GPU not read yet), only a rule that could match it counts, so a Mac's camera doesn't wait for the adapter's name
 * of a rule for Windows.
 */
export declare function rulesNeedGpu(rules: readonly CameraRule[], env?: CameraEnvironment): boolean;
/**
 * Where a browser remembers the codecs whose hardware encoder dropped frames on it (encoder-watch.ts tells why), and
 * how long: a driver update may mend it, so after a month the hardware is tried again.
 */
export declare const HARDWARE_DROPS_KEY = "wordplus-rtc:hardware-drops";
export declare const HARDWARE_DROPS_FOR_MS: number;
/**
 * Where a browser remembers what it found of each camera codec, one record a codec (CameraCodecRecord): a camera check's
 * measurement (camera-check.ts) and what a call caught (encoder-watch.ts). Every measurement is remembered per
 * browser, each kept as long as CAMERA_CODEC_KEEP_MS says, and measured again once the browser's
 * major version changes.
 */
export declare const CAMERA_CODECS_KEY = "wordplus-rtc:camera-codecs";
/**
 * What became of a codec here: `pass` it encoded the camera well; `drops` its hardware encoder took the camera's frames
 * off (or the browser fell back to software for it); `cpu` the CPU couldn't encode it in software (held back by the CPU,
 * frames too slow or dropped); `unsure` a check couldn't tell (few frames, an encoder the browser doesn't name, no time),
 * so a day of cameras turned on goes out as today without the check's wait.
 */
export type CameraCodecResult = 'pass' | 'drops' | 'cpu' | 'unsure';
/** One codec's record: the result, the numbers it was found by (null where a call caught it), when, and on what. */
export interface CameraCodecRecord {
    result: CameraCodecResult;
    /** ms its encoder took a frame */
    msPerFrame: number | null;
    /** the share of the camera's frames it sent */
    sentShare: number | null;
    /** the share of the time the browser said the CPU held it back */
    cpuShare: number | null;
    /** when (ms since the epoch) */
    at: number;
    /** the browser and its major version (browserVersion()): "chrome155", "edg155" */
    browserMajor: string;
    /** the graphics adapter, where the browser said ("amd rdna-3", "intel xe") */
    gpu?: string;
    /**
     * The camera's lines it was found at, for a codec in software (1.0.41; vp9Height()): a `pass` holds up to them, a
     * `cpu` above CAMERA_STEP_DOWN_HEIGHT leaves the codec at that height, one at it or under rules the codec out.
     * Missing (1.0.40, which measured software at 720 lines): 720.
     */
    height?: number;
}
/**
 * How long each result holds: a pass a month (a check isn't run again), a hardware encoder's drops a month (a driver
 * update may mend it), a codec too heavy for the CPU a week (the machine may only have been busy then), a check that
 * couldn't tell a day.
 */
export declare const CAMERA_CODEC_KEEP_MS: Record<CameraCodecResult, number>;
/** Every codec's record this browser holds, whatever its age or version; none where storage can't tell. */
export declare function cameraCodecRecords(): Partial<Record<CameraCodec, CameraCodecRecord>>;
/**
 * Codec's record while it holds: of this browser's major version, within its result's CAMERA_CODEC_KEEP_MS (or what the
 * policy's tune says), and not from before its forgetBefore; null otherwise, which is measured again.
 */
export declare function cameraCodecRecord(codec: CameraCodec, agent?: string, now?: number, tune?: CameraTune): CameraCodecRecord | null;
/** Writes codec's record, replacing what was there (a codec that passed and then failed in a call is failed at once); best effort. */
export declare function rememberCameraCodec(codec: CameraCodec, record: Omit<CameraCodecRecord, 'at' | 'browserMajor'> & Partial<Pick<CameraCodecRecord, 'at' | 'browserMajor'>>, agent?: string): void;
/**
 * What this browser found of codec last, and when: its record, or the dropped frames the list older releases kept
 * (HARDWARE_DROPS_KEY), whichever is newer, each while it holds by the policy's tune; null where neither does. A pass a
 * check found before a call saw the hardware drop frames is outweighed by that, as a pass found since outweighs it.
 */
export declare function cameraFinding(codec: CameraCodec, agent?: string, now?: number, tune?: CameraTune): {
    result: CameraCodecResult;
    at: number;
    height?: number;
} | null;
/** The camera lines software VP9 tries first, measured (camera-check.ts): 1080p first. */
export declare const VP9_TOP_HEIGHT = 1080;
/**
 * The lines a camera in software VP9 goes out at where its CPU can't carry VP9_TOP_HEIGHT: what the check takes it
 * to (fitsLower()), and what a call steps it down to without leaving the room (camera-adapt.ts, stepDownCamera()).
 */
export declare const CAMERA_STEP_DOWN_HEIGHT = 720;
/**
 * The lines a checked call camera in software VP9 goes out at, by what this browser found of VP9 (1.0.41): a pass, the
 * height it passed at (VP9_TOP_HEIGHT at most); too heavy for the CPU above CAMERA_STEP_DOWN_HEIGHT, that; nothing
 * found, or anything else, CAMERA_STEP_DOWN_HEIGHT: VP9 goes out above it only once measured there.
 */
export declare function vp9Height(agent?: string, now?: number, tune?: CameraTune): number;
/**
 * The codecs this browser saw its hardware encoder drop frames of during a call (encoder-watch.ts), as releases before
 * the camera check kept them (HARDWARE_DROPS_KEY, HARDWARE_DROPS_FOR_MS): what the old rules avoid, and what the probe
 * leaves out of a direct call's abilities (codecs.ts). A camera check's verdicts are never in it.
 */
export declare function droppedHardwareCodecs(now?: number): CameraCodec[];
/**
 * What a checked call camera avoids for dropped frames: the codecs whose newest finding (cameraFinding()) is dropped
 * frames, a record's or the list a call kept, each as long as the policy's tune keeps it; none where it can't tell.
 */
export declare function droppedCameraCodecs(now?: number, agent?: string, tune?: CameraTune): CameraCodec[];
/**
 * Remembers that this browser's hardware encoder dropped frames of codec during a call: the list older releases read
 * (HARDWARE_DROPS_KEY), so a product on an older client in the same browser keeps out of it too; and, where `numbers`
 * are given (a checked call camera's watch), its record too. Best effort (private windows, blocked storage).
 */
export declare function rememberDroppedHardware(codec: CameraCodec, now?: number, numbers?: Partial<Pick<CameraCodecRecord, 'msPerFrame' | 'sentShare' | 'cpuShare' | 'gpu'>> | null): void;
/**
 * The codecs this browser's CPU couldn't encode a camera in, in software: the newest finding a `cpu` record that holds
 * (a week), found at CAMERA_STEP_DOWN_HEIGHT or under. One found above it isn't: it goes out at that height (vp9Height()).
 */
export declare function heavySoftwareCodecs(agent?: string, now?: number, tune?: CameraTune): CameraCodec[];
/**
 * Whether a camera check found this browser encodes codec well: the newest finding a `pass` record that holds (a month,
 * this version), no dropped frames seen since; or, for a codec in software, one too heavy for the CPU only above
 * CAMERA_STEP_DOWN_HEIGHT, which goes out at that height.
 */
export declare function cameraCheckPassed(codec: CameraCodec, agent?: string, now?: number, tune?: CameraTune): boolean;
/** The browser and its major version, which a check's verdict holds for: "edg155", "chrome155", "opr137". */
export declare function browserVersion(agent: string): string;
/**
 * A desktop browser on Windows built on Chromium (Chrome, Edge, Opera…): where a camera goes out in VP9, encoded in
 * software, once a check found its CPU able, ahead of the hardware H.264 the policy names first. Chrome trusts no
 * Windows hardware encoder's own rate control for H.264 (no software rate control on AMD and ARM, a flag elsewhere), so
 * libwebrtc takes whole frames off a camera whose encoder overshoots: 13 of 34 Windows senders in hardware H.264 froze
 * for their viewers in a day of calls, none of 15 Macs (2026-10-23); user_9's camera sent 4 of 15 frames for 40
 * minutes, and 720p at 14-15 in VP9 at 13 ms a frame once it moved. Not a phone or tablet, not Firefox.
 */
export declare function windowsDesktopChromium(agent: string): boolean;
/**
 * WebKit (every iPhone and iPad browser, Safari on a Mac) or Firefox: a camera check is never run there. WebKit's H.264
 * is VideoToolbox, which takes no frames off, and neither names its encoder in its stats (no encoderImplementation, no
 * powerEfficientEncoder), so a loopback can't tell hardware from software (camera-check.ts).
 */
export declare function uncheckedBrowser(agent: string): boolean;
/**
 * H.265 goes first on the mesh. Off until the mesh falls back from it as LiveKit does: a receiver without H.265 had
 * the publisher send its VP8 beside it at full size, both ladders at once, 10 Mbit/s from one Mac in a call on
 * calls.wordplus.org (2026-10-14). LiveKit regresses a room of fewer than 5 to the backup alone; WordPlus Mesh's
 * mediasoup tracks never did. Until then H.264 goes first.
 */
export declare const H265_FIRST = false;
/** The camera's codecs without a server's policy: today's rule, H.264 where it's hardware, else VP8. */
export declare const DEFAULT_CAMERA_POLICY: readonly string[];
/**
 * The screen's without a server's policy: H.264 where the device encodes it in hardware, else VP8 in one picture
 * (screenPublish). Chrome on a Mac sharing a 2560×1440 document that scrolls (the mesh lab's
 * TestScreenShareQualityMatrix, 2026-10-18): H.264 in VideoToolbox 30 frames a second at an average quantizer of 16,
 * its CPU spared; VP8 alone 28-30 at 15-20. A shared screen goes out in hardware where it can, smooth without losing
 * its details.
 */
export declare const DEFAULT_SCREEN_POLICY: readonly string[];
/**
 * The camera order a rule gives this browser (cameraRules(), cameraRuleFor()): a call's camera only, not in an encrypted
 * room. The built-in rules (a policy without the key) only where the camera's list has VP9 (on the mesh), so a camera off
 * it, or under a policy without VP9, keeps its list as it was; the node's own rules as they are. Null where none matches.
 */
export declare function cameraRuleOrder(agent: string, options?: CameraCodecOptions, builtIn?: readonly CameraRule[]): readonly string[] | null;
/**
 * The built-in rules a call's screen takes where the policy has no `rules` key: VP9 first on Windows and Linux, as the
 * camera's were until 1.0.55. A screen in VP9 in one layer marked motion was measured the smoothest from Windows, and
 * the camera's measuring of its hardware H.264 says nothing of a screen's.
 */
export declare const DEFAULT_SCREEN_RULES: readonly CameraRule[];
/**
 * A camera on the old rules exactly, as before the camera check: not a checked call's (a stream's, the SDK's group
 * calls'), or one whose node didn't turn the check on (its policy's `check` anything but true: an older mesh, a
 * self-hosted box, stock LiveKit, a node configured off; Better Messages says false for a room client too old to hear
 * the node's switches). The policy's list or the built-in one as they are, no rules, and the dropped-frames list older
 * releases kept as the only thing avoided: no record read.
 */
export declare function legacyCamera(options?: CameraCodecOptions): boolean;
/**
 * The camera's codecs on this device, in the order to try them: a rule's (cameraRuleOrder()), else the policy's (the
 * server's, or the built-in), without what it won't send (avoidOf), VP8 last. What a camera check (camera-check.ts)
 * goes through, measuring each that needs it.
 */
export declare function cameraCodecOrder(agent: string, hardware: CameraHardware, options?: CameraCodecOptions): CameraCodec[];
/**
 * The camera's codec on this device: its user agent, the codecs it encodes, the room, and the server's policy. Not a
 * codec whose hardware encoder dropped a camera's frames here (encoder-watch.ts), nor one its CPU couldn't encode
 * (camera-check.ts). Where a rule orders the camera (by default a Windows desktop Chrome or Edge, VP9 first), its first
 * codec, one in software only once a check found this browser able (cameraCheckPassed); unmeasured, or without a rule,
 * the policy's order as before.
 */
export declare function cameraCodecFor(agent: string, hardware: CameraHardware, options?: CameraCodecOptions): CameraCodec;
/** Whether this device encodes codec in hardware (as cameraCodecFor() reads it): what a camera check measures for drops. */
export declare function encodesInHardware(codec: CameraCodec, agent: string, hardware: CameraHardware, options?: CameraCodecOptions): boolean;
/**
 * The screen's codecs on this device, in the order to try them: the server's policy's screen list as it is; else the
 * rule for this machine (cameraRuleOrder(): the node's rules where it sends them, else DEFAULT_SCREEN_RULES, Windows and
 * Linux VP9 first, then hardware H.264, then VP8), without what its camera won't send here (hardware that dropped
 * frames, software too heavy for its CPU), as a call's camera has it; else DEFAULT_SCREEN_POLICY, a Mac, iOS and
 * Android in hardware H.264. A Windows PC's hardware H.264 gets no rate control Chrome trusts, and its screen went out
 * at 15 frames or fewer from an AMD encoder. VP8 last, alone from Firefox and in an encrypted room. The rule is the
 * machine's whatever its GPU (1.0.51): where a node's rule puts a camera on some GPU in hardware H.264, its screen stays
 * in VP9 in one layer marked motion, as measured smoothest from Windows, and the same whether a camera check read the
 * GPU's name on this page or not. A Windows camera measured in hardware H.264 first (1.0.55) leaves its screen in VP9.
 */
export declare function screenCodecOrder(agent: string, hardware: CameraHardware, options?: CameraCodecOptions): CameraCodec[];
/** The screen's codec, the first of screenCodecOrder(). */
export declare function screenCodecFor(agent: string, hardware: CameraHardware, options?: CameraCodecOptions): CameraCodec;
/**
 * What probeCodecCaps() says this device encodes, for cameraCodecFor(), and what its WebRTC sends at all (`sendable`,
 * the browser's RTCRtpSender.getCapabilities, or the list given).
 */
export declare function hardwareFromCaps(caps: CameraCodecCaps | null, sendable?: CameraCodec[] | null): CameraHardware;
/** cameraCodecFor() from probeCodecCaps()'s answer. */
export declare function roomCallCodec(caps: CameraCodecCaps | null, agent: string, options?: CameraCodecOptions): CameraCodec;
/** A camera's codec as a room sends it: the codec, whether this device encodes it in hardware, and what goes behind it. */
export interface CameraChoice {
    codec: CameraCodec;
    hardware: boolean;
    /** Behind any codec but VP8 (the server's policy's backup, VP8 by default); none in an encrypted room. */
    backup: 'vp8' | 'h264' | null;
    /**
     * The tallest picture it goes out at, lines (1.0.41; choiceHeight()), which fitCameraTrack() brings the camera down
     * to. Missing: cameraMaxHeight() of its codec, as before.
     */
    height?: number;
}
/**
 * The tallest picture a camera in codec goes out at: cameraMaxHeight(), and for a checked call camera in software VP9
 * what this browser found of it (vp9Height(): VP9_TOP_HEIGHT once measured able there, CAMERA_STEP_DOWN_HEIGHT else).
 */
export declare function choiceHeight(codec: CameraCodec, hardware: boolean, agent: string, options?: CameraCodecOptions): number;
/** roomCallCodec(), with what cameraPublish() and fitCameraTrack() need to know of it. */
export declare function roomCallChoice(caps: CameraCodecCaps | null, agent: string, options?: CameraCodecOptions): CameraChoice;
/** What goes behind codec: nothing behind VP8; H.264 where the policy asks for it and the codec isn't H.264; VP8. */
export declare function backupFor(codec: CameraCodec, policy?: CodecPolicy | null): 'vp8' | 'h264' | null;
/** One layer of a camera's simulcast: its size, bitrate and frame rate. */
export type CallLayer = {
    width: number;
    height: number;
    bitrate: number;
    fps: number;
};
export interface CameraPublish {
    codec: CameraCodec;
    top: {
        maxBitrate: number;
        maxFramerate: number;
    };
    /** The two lower layers, smallest first: the simulcast's, and under VP9 or AV1 the backup's. */
    layers: CallLayer[];
    /**
     * VP9 and AV1: one stream of three spatial layers, each twice the one below as the simulcast's are, and three
     * temporal ones (livekit-client's default for them), which the media server forwards a layer of per viewer.
     */
    scalabilityMode?: CameraScalability;
    /** Behind any codec but VP8, at its own bitrate, for a viewer that decodes none of it. */
    backup: {
        maxBitrate: number;
        maxFramerate: number;
    } | null;
    /** Which codec that is (CameraChoice.backup); null with no backup. */
    backupCodec: 'vp8' | 'h264' | null;
}
/**
 * A group call's camera in three pictures by the height it's captured at, each at 30 frames (the library's own lower
 * ones run at 20, which a tile shows as stutter).
 *
 * From 1080 lines: 270p at 400 kbit/s, 540p at 1.2 Mbit/s and the full size, each twice the one below, as Chrome and
 * mediasoup space them. A tile takes the smallest layer at least 0.9 of its height in device
 * pixels (the media server's pick), and a grid's tiles are mostly 270 to 540 of them: with 180p and 360p under 1080p,
 * every tile taller than 360 took the full size, so a viewer of a four-person call on a laptop downloaded 10.5 Mbit/s
 * where 540p carries the same tiles in 3. Over the grid's layouts (realtime-ui's group-video-grid) and common windows,
 * a viewer of three to sixteen people downloads about half, a phone about the same.
 *
 * From 720 lines: 180p at 200 kbit/s and 360p at 600 kbit/s under the full size, also twice apart. Below 720 lines
 * the library's own stand.
 *
 * H.264 and H.265 in hardware carry the full size on fewer bits; VP8 keeps its 4 and 2 Mbit/s, and goes behind
 * either at those. VP9 and AV1 go as one SVC stream (scalabilityMode), at about 70% and 60% of VP8's.
 *
 * backupCodec: what goes behind it (CameraChoice.backup); VP8 when not given, and nothing behind VP8.
 *
 * settings (1.0.53): the node's, which give each of these numbers (camera.ladder.1080, camera.ladder.720,
 * camera.topKbps.<codec>.<1080|720>, camera.fps, camera.svcMode); without them, the ones above.
 */
export declare function cameraPublish(codec: CameraCodec, height: number, backupCodec?: 'vp8' | 'h264' | null, settings?: CallSettings | null): CameraPublish | null;
/** How a camera in VP9 or AV1 goes out in layers (camera.svcMode): three spatial ones by default. */
export type CameraScalability = 'L3T3_KEY' | 'L3T3' | 'L2T3_KEY' | 'L2T2_KEY' | 'L1T3' | 'L1T2';
/**
 * The tallest picture a camera goes out at in a room, by its codec. VP8 is encoded in software on every computer, and
 * three layers from 1080 lines (1080p, 540p and 270p, 2.7 million pixels a frame) is more than a weaker laptop keeps up
 * with: its encoder, held back by the CPU, drops frames and changes size over and over, and every viewer sees its
 * picture freeze several times in half a minute while the connections carry it without a loss. From 720 lines (720p,
 * 360p and 180p) it is 1.2 million, under half, and its 2 Mbit/s fit an upload the full size's 5.6 don't. A grid's
 * tiles mostly ask for 540 lines or fewer; a large one gets 720p. H.264 and H.265 come out of hardware, at 1080.
 *
 * hardware: whether this device encodes it in hardware (CameraChoice.hardware); not given, H.264 and H.265 are taken
 * to be, VP8, VP9 and AV1 not. Any codec in software goes out from 720 lines: VP9 and AV1 cost a CPU more than VP8.
 * The one exception is a checked call camera in VP9 that this browser measured able at 1080 (choiceHeight()).
 *
 * settings (1.0.53): camera.maxHeight.hw and camera.maxHeight.sw, the node's to change; 1080 and 720 without them.
 */
export declare function cameraMaxHeight(codec: CameraCodec, hardware?: boolean, settings?: CallSettings | null): number;
/**
 * Brings a camera down to cameraMaxHeight() for its codec before it is published (or to `maxHeight`, a choice's
 * CameraChoice.height), and answers the height it has then, which is what cameraPublish() takes. The browser scales
 * what the camera gives, keeping its shape and the rest of what it was asked for (the device, the frame rate), and the
 * preview shows the same picture. Best effort: a camera that can't be scaled, or doesn't answer within two seconds,
 * goes out at the size it has, with that size's layers. Never up: a camera smaller than that stays as it is.
 *
 * And a camera opened in a mode of fewer than CAMERA_MIN_FPS frames is tried at smaller sizes (fasterCameraMode).
 */
export declare function fitCameraTrack(track: MediaStreamTrack, codec: CameraCodec, hardware?: boolean, maxHeight?: number, settings?: CallSettings | null): Promise<number>;
/**
 * The fewest frames a second a camera's mode may give in a call before smaller sizes are tried, and those sizes, the
 * largest first, at most CAMERA_FASTER_TRIES of them. Many cameras give 1080p at 15 frames and 720p at 30, and asked
 * for 1080p at 30, Chrome opens the 1080p mode, the size counting for more than the frames (2026-10-19: a call where
 * many cameras gave few frames a second): a jerky picture where a smooth 720p was there.
 */
export declare const CAMERA_MIN_FPS = 24;
/**
 * A camera opened in a mode of fewer than CAMERA_MIN_FPS frames (its settings' frameRate, the mode's, not what a dim
 * room leaves of it) is asked for smaller sizes at 30 frames, and kept at the first whose mode gives CAMERA_MIN_FPS or
 * more; none does, it goes back to what it was asked before. A browser that says no frame rate is left as it is.
 * settings (1.0.53): camera.minFps, the node's (0: never); CAMERA_MIN_FPS without them.
 */
export declare function fasterCameraMode(track: MediaStreamTrack, settings?: CallSettings | null): Promise<void>;
/** A shared screen in a group call: up to 10 Mbit/s at 30 frames, the library's own is 1080p at 15 and 2.5. */
export declare const SCREEN_ENCODING: {
    maxBitrate: number;
    maxFramerate: number;
    priority: "medium";
};
/** SCREEN_ENCODING as the node's settings give it (screen.maxKbps, screen.fps), 1.0.53: live, applyScreenSettings(). */
export declare function screenEncoding(settings?: CallSettings | null): typeof SCREEN_ENCODING;
/**
 * A shared screen's track is marked motion, and its sender keeps its resolution when it must give: smooth wherever the
 * upload and the CPU allow, and sharp where they don't. Marked detail, as it was, Chrome encodes it in its
 * screen-content mode, which spends few bits and drops frames for them: a 1440p screen of moving pictures in H.264 from
 * VideoToolbox went out at 10 frames a second on 3.9 of the 10 Mbit/s it may take, at an average quantizer of 43;
 * marked motion, 24-26 frames at 42, and text as sharp as before (16 in H.264, 2 in VP8 where detail gave 15), on more
 * bits (the mesh lab's TestScreenShareBusyMatrix, 2026-10-18; a Windows PC's share in H.264 from its AMD encoder went
 * out at 15 frames or fewer): smooth without losing details. A screen in VP9 or AV1 too, in one layer
 * (SCREEN_SCALABILITY_MODE_SVC).
 */
export declare const SCREEN_CONTENT_HINT = "motion";
export declare const SCREEN_DEGRADATION: "maintain-resolution";
/**
 * A screen in VP9 or AV1 goes out in one layer, no temporal layers, marked motion as H.264 is (1.0.47; @wordplus/rtc-client
 * 1.0.20 keeps the mode and the mark). Chromium 156, a room's share of 1440 lines on up to 10 Mbit/s: marked motion in
 * L1T1, a page scrolled every frame at 28 to 29 frames a second and an average quantizer of 10.6, a video with a cut
 * every 2 s at 27 to 29 frames; marked motion with temporal layers (L1T2, L1T3), the scrolled page fell to 5 to 8 frames
 * at 208 of 255 in every run; marked detail (1.0.44 to 1.0.46), 19 to 26 frames at 32 on a fifth of the budget, as
 * Chrome's screen-content mode holds frames back. Shared from a Windows PC through the mesh, motion in L1T1 was the
 * smoothest of the three. A viewer that can't take it whole gets it whole, as a VP8 screen.
 */
export declare const SCREEN_SCALABILITY_MODE_SVC = "L1T1";
export interface ScreenPublish {
    codec: CameraCodec;
    /** Half the screen's size at 15 frames, for a viewer that can't take it whole: in H.264 and H.265 only. */
    layer: CallLayer | null;
    /** Whether it goes out in two pictures (the layer's); false is to be passed too, or livekit-client adds a second. */
    simulcast: boolean;
    /** What its track is marked (MediaStreamTrack.contentHint): SCREEN_CONTENT_HINT in every codec, or screen.contentHint. */
    contentHint: ScreenContentHint;
    /** VP9 and AV1 only: SCREEN_SCALABILITY_MODE_SVC, to pass as the publish's scalabilityMode. */
    scalabilityMode?: typeof SCREEN_SCALABILITY_MODE_SVC;
}
/**
 * A screen in H.264 or H.265 from 1280 by 640 goes out in two pictures: the whole one for everyone who can take it, and
 * one half its size at 15 frames for a connection that can't (Opera behind a VPN froze on a 2560×1428 share it could
 * only take whole), which the media server picks per viewer.
 *
 * In VP8 it goes out whole only, one picture (simulcast false; livekit-client adds a second of its own otherwise): Chrome
 * encodes a screen in VP8 simulcast in its screen-share mode, which held a 2560×1440 document scrolling to 5 frames a
 * second at an average quantizer of 98, the viewer shown the half one at 15, while the same screen whole went out at 28
 * frames and 20 (TestScreenShareQualityMatrix, 2026-10-18; a Windows PC's share, its CPU and upload idle, "not smooth,
 * framerate seems to be bad"). Smaller screens go out whole.
 *
 * In VP9 or AV1 it goes out whole, one layer marked motion (SCREEN_SCALABILITY_MODE_SVC): two spatial layers blur a
 * scrolled page, temporal layers drop its frames, and two pictures can't be had at all (the mesh's worker refuses VP9
 * and AV1 as simulcast).
 */
export declare function screenPublish(width: number, height: number, codec?: CameraCodec, settings?: CallSettings | null): ScreenPublish;
/** What a room's screen track may be marked (screen.contentHint). */
export type ScreenContentHint = 'motion' | 'detail' | 'text';
/**
 * A shared screen sent for a video played on it, the presenter's "Optimize for video" (1.0.45): marked motion, which
 * Chrome encodes as camera video, and keeping its frame rate when the link or the CPU can't give both. In the
 * screen-content mode a VP9 screen of a video with a cut every 2 s went out at 14 frames a second, each cut rough for
 * the frames after it; marked motion, at 27.
 */
export declare const SCREEN_DEGRADATION_VIDEO: "maintain-framerate";
/**
 * A direct call's shared screen is marked detail, Chrome's screen-content mode, in every codec: it goes out in the codec
 * that keeps text (codecs.ts), AV1 or VP9 first. Rooms mark theirs motion (SCREEN_CONTENT_HINT).
 */
export declare const DIRECT_SCREEN_CONTENT_HINT = "detail";
export interface ScreenVideoMode {
    contentHint: ScreenContentHint;
    degradationPreference: RTCDegradationPreference;
}
/**
 * How a room's screen shared in `codec` is sent: for a video played on it (forVideo), its frame rate kept, or as
 * screenPublish marks it, its resolution kept. Marked motion either way, in every codec. settings (1.0.53):
 * screen.contentHint and screen.degradation, the node's ("default" there: balanced, the browser's own); a video's
 * frame rate is kept whatever they say.
 */
export declare function screenVideoMode(codec: CameraCodec, forVideo: boolean, settings?: CallSettings | null): ScreenVideoMode;
/** How a direct call's screen is sent: for a video played on it, as a room's, or marked detail, its resolution kept. */
export declare function directScreenMode(forVideo: boolean): ScreenVideoMode;
/** A shared screen's track as the mesh's room client has it (its LocalVideoTrack). */
export interface ScreenShareTrack {
    mediaStreamTrack: MediaStreamTrack;
    setDegradationPreference(preference: RTCDegradationPreference): Promise<void> | void;
}
/**
 * Puts a screen shared into a room in a mode while it is sent, nothing published again: no key frame, and a VP9 screen
 * in L1T2 settled within 2 s (23 frames a second in detail, 28 for video, 24 back). Its publication's options take the
 * degradation too, as the room client publishes the track with them again after a full reconnect.
 */
export declare function applyScreenVideoMode(track: ScreenShareTrack, options: {
    degradationPreference?: RTCDegradationPreference;
} | undefined, mode: ScreenVideoMode): Promise<void>;
/**
 * The pixel density a receiver asks layers by (adaptive stream): the screen's, at most 1.5. At 2 or 3 (a Retina
 * screen, a phone) a tile asked for twice its size or more, the larger layer for every tile in a grid.
 */
export declare function roomPixelDensity(devicePixelRatio: number | undefined, settings?: CallSettings | null): number;
/**
 * 1.0.53: a shared screen's sending as the node's settings say it now (screen.maxKbps, screen.fps, screen.contentHint,
 * screen.degradation; all live): its encodings' bitrate and frame rate, its mark and its degradation preference, nothing
 * published again. forVideo: the presenter's "Optimize for video", which keeps its own mark and frame rate.
 */
export declare function applyScreenSettings(track: ScreenShareTrack & {
    sender?: RTCRtpSender | null;
}, settings: CallSettings | null | undefined, codec: CameraCodec, forVideo?: boolean): Promise<void>;
/** 1.0.53: a call microphone's publish options from the settings (mic.kbps, mic.red, mic.dtx); 64 kbit/s, RED and DTX on without them. */
export declare function micPublish(settings?: CallSettings | null): {
    maxBitrate: number;
    red: boolean;
    dtx: boolean;
};
/** 1.0.53: a shared screen's sound (screenAudio.kbps): stereo, without DTX or RED; 128 kbit/s without settings. */
export declare function screenAudioPublish(settings?: CallSettings | null): {
    maxBitrate: number;
    forceStereo: true;
    dtx: false;
    red: false;
};
/** 1.0.53: what a call's microphone is opened with (mic.echoCancellation, noiseSuppression, autoGainControl, voiceIsolation). */
export declare function micCapture(settings?: CallSettings | null): {
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    voiceIsolation: boolean;
};
/** 1.0.53: the size and frame rate a call's camera is opened at (camera.captureHeight, camera.captureFps): 1080p30 without settings. */
export declare function cameraCapture(settings?: CallSettings | null): {
    width: number;
    height: number;
    frameRate: number;
};
/** 1.0.53: the size and frame rate a room's screen is captured at (screen.captureHeight, screen.captureFps): 1080p30 without settings. */
export declare function screenCapture(settings?: CallSettings | null): {
    width: number;
    height: number;
    frameRate: number;
};
/** 1.0.53: how long a product waits on an unreachable server before it says so (connect.giveUpMs), ms; 20 s without settings. */
export declare function connectGiveUpMs(settings?: CallSettings | null): number;
/** Whether a change of these keys (RoomEvent.MeshSettingsChanged's) is one a camera goes out by. */
export declare function cameraPublishChanged(changed: readonly string[]): boolean;
/** Whether a change of these keys is one a screen goes out by. */
export declare function screenPublishChanged(changed: readonly string[]): boolean;
/**
 * When a camera re-publishes for an `applyNow` revision: a moment within spreadMs fixed by its identity (FNV-1a), so a
 * room's cameras don't all go out again at once, and each the same moment on every revision.
 */
export declare function applyNowDelayMs(identity: string, spreadMs?: number): number;
