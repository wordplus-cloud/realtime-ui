const CAMERA_CODECS = ['h265', 'h264', 'vp8', 'vp9', 'av1'];
/**
 * The question Chromium answers of its H.264 hardware for the Baseline the mesh takes from it (1.0.34): Baseline,
 * packetization mode 1, level 4.2 (1080p60). Chrome 155 on a desktop answered it power efficient where it encodes in
 * VideoToolbox or Media Foundation (an AMD encoder), and Constrained Baseline not, which it encodes in OpenH264.
 */
export const CHROMIUM_H264_ENCODE = 'video/H264;profile-level-id=42002a;packetization-mode=1';
/** A number of the settings, or `fallback` without them, or where they give no number. */
export function settingNumber(settings, key, fallback) {
    const v = settings?.get(key);
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
/** A switch of the settings, or `fallback`. */
export function settingFlag(settings, key, fallback) {
    const v = settings?.get(key);
    return typeof v === 'boolean' ? v : fallback;
}
/** A word of the settings, or `fallback`. */
export function settingWord(settings, key, fallback) {
    const v = settings?.get(key);
    return typeof v === 'string' && v ? v : fallback;
}
/**
 * The policy a product's camera and screen go by: from the node's settings once it sent any (settings.rev 0 or more),
 * which say everything the codec policy does and more, else the codec policy as a node before them sends it (rtc-client's
 * Room.meshCodecPolicy). A node of the settings sends both, the policy made from the same document, so either way a
 * browser publishes alike. The settings go with it (CodecPolicy.settings).
 */
export function callPolicy(codecPolicy, settings) {
    if (!settings || !(settings.rev >= 0))
        return codecPolicy ?? null;
    const policy = { settings };
    const list = (key) => {
        const v = settings.has(key) ? settings.get(key) : null;
        return Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string') : undefined;
    };
    const camera = list('camera.codecs'), screen = list('screen.codecs');
    if (camera)
        policy.camera = camera;
    if (screen)
        policy.screen = screen;
    if (settings.has('camera.backup'))
        policy.backup = settingWord(settings, 'camera.backup', 'vp8');
    policy.check = settingFlag(settings, 'check.enabled', true);
    policy.adapt = settingFlag(settings, 'adapt.enabled', true);
    if (settings.has('camera.codecRules')) {
        const rules = settings.get('camera.codecRules');
        if (Array.isArray(rules))
            policy.rules = rules;
    }
    const tune = {};
    for (const name of Object.keys(CAMERA_TUNE_DEFAULTS)) {
        if (settings.has('tune.' + name))
            tune[name] = settingNumber(settings, 'tune.' + name, CAMERA_TUNE_DEFAULTS[name]);
    }
    if (Object.keys(tune).length)
        policy.tune = tune;
    return policy;
}
/** The numbers where the policy gives none. */
export const CAMERA_TUNE_DEFAULTS = Object.freeze({
    // room for two codecs measured: VP9 and then the hardware H.264 on Windows, 1.9 s each at most
    checkMs: 4000,
    passSent: 0.8,
    passCpu: 0.5,
    passEncode: 0.6,
    dropWatchS: 30,
    cpuWatchS: 20,
    cpuShare: 0.5,
    switchesMax: 2,
    switchGapS: 120,
    warmupS: 30,
    failsafeS: 10,
    republishTimeoutS: 8,
    rememberPassDays: 30,
    rememberDropsDays: 30,
    rememberCpuDays: 7,
    forgetBefore: 0
});
/**
 * The least and most each number may be, one outside held to the nearer end: the node's own ranges exactly (WordPlus
 * Mesh's pkg/rtc/codecpolicy.go, CodecTuneRange), so a browser takes what the node would take.
 */
export const CAMERA_TUNE_RANGES = Object.freeze({
    checkMs: [2000, 5000],
    passSent: [0.3, 1],
    passCpu: [0, 1],
    passEncode: [0.1, 1],
    dropWatchS: [10, 120],
    cpuWatchS: [10, 120],
    cpuShare: [0.1, 1],
    switchesMax: [0, 3],
    switchGapS: [30, 1800],
    warmupS: [10, 300],
    failsafeS: [3, 30],
    republishTimeoutS: [3, 30],
    rememberPassDays: [0, 90],
    rememberDropsDays: [0, 90],
    rememberCpuDays: [0, 90],
    forgetBefore: [0, 2 ** 52]
});
/**
 * The numbers for policy: its `tune`'s, each a finite number held to CAMERA_TUNE_RANGES (switchesMax a whole one), the
 * defaults for the rest. `forgetBefore` later than now is taken as none: a clock ahead would have every browser measure
 * at every join.
 */
export function cameraTune(policy, now = Date.now()) {
    const given = (policy?.tune && typeof policy.tune === 'object' ? policy.tune : {});
    const out = { ...CAMERA_TUNE_DEFAULTS };
    for (const key of Object.keys(CAMERA_TUNE_DEFAULTS)) {
        const value = given[key];
        if (typeof value !== 'number' || !Number.isFinite(value))
            continue;
        const [min, max] = CAMERA_TUNE_RANGES[key];
        const held = Math.min(max, Math.max(min, value));
        out[key] = key === 'switchesMax' ? Math.round(held) : held;
    }
    if (out.forgetBefore > now)
        out.forgetBefore = 0;
    return out;
}
const DAY_MS = 24 * 3600 * 1000;
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
export const DEFAULT_CAMERA_RULES = Object.freeze([
    { os: 'windows', camera: ['h264:hw', 'vp9', 'vp8'] },
    { os: 'linux', camera: ['vp9', 'h264:hw', 'vp8'] }
]);
/** The rules policy gives: its `rules` (none where the key holds anything but a list), else DEFAULT_CAMERA_RULES. */
export function cameraRules(policy) {
    if (!policy || !Object.prototype.hasOwnProperty.call(policy, 'rules'))
        return DEFAULT_CAMERA_RULES;
    return Array.isArray(policy.rules) ? policy.rules : [];
}
/**
 * The graphics maker, from WebGPU's adapter info ("amd rdna-3", "nvidia ampere"), by the words the controller reads it
 * by; "unknown" where the page can't tell.
 */
export function gpuMaker(adapter) {
    const name = String(adapter ?? '').toLowerCase().trim();
    if (!name)
        return 'unknown';
    if (/\bamd\b|radeon|\bati\b/.test(name))
        return 'amd';
    if (/nvidia|geforce|quadro/.test(name))
        return 'nvidia';
    if (/intel/.test(name))
        return 'intel';
    if (/apple/.test(name))
        return 'apple';
    if (/qualcomm|adreno/.test(name))
        return 'qualcomm';
    if (/\bmali\b|\barm\b/.test(name))
        return 'arm';
    return 'other';
}
/** This browser, from its user agent and its graphics adapter's name (gpuMaker()). */
export function cameraEnvironment(agent, adapter) {
    const a = String(agent ?? '');
    const android = /android/i.test(a);
    const os = /iphone|ipad|ipod/i.test(a) ? 'ios'
        : android ? 'android'
            : /windows nt/i.test(a) ? 'windows'
                : /macintosh|mac os x/i.test(a) ? 'mac'
                    : /linux|cros|x11/i.test(a) ? 'linux'
                        : null;
    const browser = /edg(e|a|ios)?\//i.test(a) ? 'edge'
        : /opr\/|opera/i.test(a) ? 'opera'
            : /firefox\/|fxios\//i.test(a) ? 'firefox'
                : /chrome\/|crios\/|chromium\//i.test(a) ? 'chrome'
                    : /safari\//i.test(a) ? 'safari'
                        : null;
    const device = /ipad|tablet/i.test(a) || (android && !/mobile/i.test(a)) ? 'tablet'
        : /iphone|ipod|mobile/i.test(a) ? 'phone'
            : 'desktop';
    return { os, browser, device, gpu: gpuMaker(adapter) };
}
/** The first of rules whose given fields all match env and that names a camera order; null where none does. */
export function cameraRuleFor(rules, env) {
    for (const rule of rules) {
        if (!rule || typeof rule !== 'object' || !Array.isArray(rule.camera) || !rule.camera.length)
            continue;
        if (rule.os !== undefined && rule.os !== env.os)
            continue;
        if (rule.browser !== undefined && rule.browser !== env.browser)
            continue;
        if (rule.device !== undefined && rule.device !== env.device)
            continue;
        if (rule.gpu !== undefined && rule.gpu !== env.gpu)
            continue;
        return rule;
    }
    return null;
}
// The graphics adapter's name once camera-check.ts's graphicsAdapter() has read it, for rules read without waiting (a
// camera started without its check): undefined until then.
let adapterName;
/** Keeps the graphics adapter's name the page read (camera-check.ts, graphicsAdapter()). */
export function rememberAdapter(name) {
    adapterName = name ?? null;
}
/** The graphics adapter's name the page read; undefined while nothing asked (a record names it only then). */
export function knownAdapter() {
    return adapterName;
}
/**
 * Whether any of rules names a graphics maker: a check waits for the adapter's name only then. Given env (this browser's,
 * its GPU not read yet), only a rule that could match it counts, so a Mac's camera doesn't wait for the adapter's name
 * of a rule for Windows.
 */
export function rulesNeedGpu(rules, env) {
    return rules.some((r) => !!r && typeof r === 'object' && r.gpu !== undefined
        && (!env || ((r.os === undefined || r.os === env.os) && (r.browser === undefined || r.browser === env.browser)
            && (r.device === undefined || r.device === env.device))));
}
/**
 * Where a browser remembers the codecs whose hardware encoder dropped frames on it (encoder-watch.ts tells why), and
 * how long: a driver update may mend it, so after a month the hardware is tried again.
 */
export const HARDWARE_DROPS_KEY = 'wordplus-rtc:hardware-drops';
export const HARDWARE_DROPS_FOR_MS = 30 * 24 * 3600 * 1000;
/**
 * Where a browser remembers what it found of each camera codec, one record a codec (CameraCodecRecord): a camera check's
 * measurement (camera-check.ts) and what a call caught (encoder-watch.ts). Every measurement is remembered per
 * browser, each kept as long as CAMERA_CODEC_KEEP_MS says, and measured again once the browser's
 * major version changes.
 */
export const CAMERA_CODECS_KEY = 'wordplus-rtc:camera-codecs';
/**
 * How long each result holds: a pass a month (a check isn't run again), a hardware encoder's drops a month (a driver
 * update may mend it), a codec too heavy for the CPU a week (the machine may only have been busy then), a check that
 * couldn't tell a day.
 */
export const CAMERA_CODEC_KEEP_MS = {
    pass: HARDWARE_DROPS_FOR_MS,
    drops: HARDWARE_DROPS_FOR_MS,
    cpu: 7 * 24 * 3600 * 1000,
    unsure: 24 * 3600 * 1000
};
const userAgent = () => typeof navigator !== 'undefined' ? navigator.userAgent : '';
/** Every codec's record this browser holds, whatever its age or version; none where storage can't tell. */
export function cameraCodecRecords() {
    try {
        const read = JSON.parse(globalThis.localStorage?.getItem(CAMERA_CODECS_KEY) ?? '{}');
        return read && typeof read === 'object' ? read : {};
    }
    catch {
        return {};
    }
}
/** How long each result holds by tune (the policy's rememberPassDays, rememberDropsDays, rememberCpuDays; `unsure` a day). */
const keepOf = (tune) => ({
    pass: tune.rememberPassDays * DAY_MS,
    drops: tune.rememberDropsDays * DAY_MS,
    cpu: tune.rememberCpuDays * DAY_MS,
    unsure: CAMERA_CODEC_KEEP_MS.unsure
});
/**
 * Codec's record while it holds: of this browser's major version, within its result's CAMERA_CODEC_KEEP_MS (or what the
 * policy's tune says), and not from before its forgetBefore; null otherwise, which is measured again.
 */
export function cameraCodecRecord(codec, agent = userAgent(), now = Date.now(), tune) {
    const record = cameraCodecRecords()[codec];
    if (!record || typeof record !== 'object' || typeof record.at !== 'number')
        return null;
    const keep = (tune ? keepOf(tune) : CAMERA_CODEC_KEEP_MS)[record.result];
    if (keep === undefined || now - record.at < 0 || now - record.at >= keep)
        return null;
    if (tune && record.at < tune.forgetBefore)
        return null;
    if (record.browserMajor !== browserVersion(agent))
        return null;
    return record;
}
/** Writes codec's record, replacing what was there (a codec that passed and then failed in a call is failed at once); best effort. */
export function rememberCameraCodec(codec, record, agent = userAgent()) {
    try {
        const storage = globalThis.localStorage;
        if (!storage)
            return;
        const records = cameraCodecRecords();
        records[codec] = { ...record, at: record.at ?? Date.now(), browserMajor: record.browserMajor ?? browserVersion(agent) };
        storage.setItem(CAMERA_CODECS_KEY, JSON.stringify(records));
    }
    catch { }
}
// The list older releases kept (HARDWARE_DROPS_KEY): when each codec was seen dropping, within keep, none from before
// forgetBefore.
function droppedTimes(now, keep, forgetBefore) {
    const times = {};
    try {
        const seen = JSON.parse(globalThis.localStorage?.getItem(HARDWARE_DROPS_KEY) ?? '{}');
        for (const c of CAMERA_CODECS) {
            const at = seen?.[c];
            if (c !== 'vp8' && typeof at === 'number' && now - at >= 0 && now - at < keep && at >= forgetBefore)
                times[c] = at;
        }
    }
    catch { }
    return times;
}
function droppedList(now, keep, forgetBefore) {
    return Object.keys(droppedTimes(now, keep, forgetBefore));
}
/**
 * What this browser found of codec last, and when: its record, or the dropped frames the list older releases kept
 * (HARDWARE_DROPS_KEY), whichever is newer, each while it holds by the policy's tune; null where neither does. A pass a
 * check found before a call saw the hardware drop frames is outweighed by that, as a pass found since outweighs it.
 */
export function cameraFinding(codec, agent = userAgent(), now = Date.now(), tune = CAMERA_TUNE_DEFAULTS) {
    const record = cameraCodecRecord(codec, agent, now, tune);
    const dropped = droppedTimes(now, tune.rememberDropsDays * DAY_MS, tune.forgetBefore)[codec];
    if (dropped !== undefined && (!record || dropped > record.at))
        return { result: 'drops', at: dropped };
    return record ? { result: record.result, at: record.at, ...(typeof record.height === 'number' ? { height: record.height } : {}) } : null;
}
/** The camera lines software VP9 tries first, measured (camera-check.ts): 1080p first. */
export const VP9_TOP_HEIGHT = 1080;
/**
 * The lines a camera in software VP9 goes out at where its CPU can't carry VP9_TOP_HEIGHT: what the check takes it
 * to (fitsLower()), and what a call steps it down to without leaving the room (camera-adapt.ts, stepDownCamera()).
 */
export const CAMERA_STEP_DOWN_HEIGHT = 720;
// A finding's height: 1.0.40 measured every codec in software at 720 lines and said none.
const heightOf = (finding) => finding?.height ?? CAMERA_STEP_DOWN_HEIGHT;
/**
 * Whether what this browser found of a codec in software leaves it out: too heavy for the CPU at
 * CAMERA_STEP_DOWN_HEIGHT or under. One too heavy above it goes out at CAMERA_STEP_DOWN_HEIGHT instead (vp9Height()).
 */
const tooHeavy = (finding) => finding?.result === 'cpu' && heightOf(finding) <= CAMERA_STEP_DOWN_HEIGHT;
/**
 * The lines a checked call camera in software VP9 goes out at, by what this browser found of VP9 (1.0.41): a pass, the
 * height it passed at (VP9_TOP_HEIGHT at most); too heavy for the CPU above CAMERA_STEP_DOWN_HEIGHT, that; nothing
 * found, or anything else, CAMERA_STEP_DOWN_HEIGHT: VP9 goes out above it only once measured there.
 */
export function vp9Height(agent = userAgent(), now = Date.now(), tune = CAMERA_TUNE_DEFAULTS) {
    const found = cameraFinding('vp9', agent, now, tune);
    if (found?.result === 'pass')
        return Math.min(VP9_TOP_HEIGHT, Math.max(CAMERA_STEP_DOWN_HEIGHT, heightOf(found)));
    return CAMERA_STEP_DOWN_HEIGHT;
}
/**
 * The codecs this browser saw its hardware encoder drop frames of during a call (encoder-watch.ts), as releases before
 * the camera check kept them (HARDWARE_DROPS_KEY, HARDWARE_DROPS_FOR_MS): what the old rules avoid, and what the probe
 * leaves out of a direct call's abilities (codecs.ts). A camera check's verdicts are never in it.
 */
export function droppedHardwareCodecs(now = Date.now()) {
    return droppedList(now, HARDWARE_DROPS_FOR_MS, 0);
}
/**
 * What a checked call camera avoids for dropped frames: the codecs whose newest finding (cameraFinding()) is dropped
 * frames, a record's or the list a call kept, each as long as the policy's tune keeps it; none where it can't tell.
 */
export function droppedCameraCodecs(now = Date.now(), agent = userAgent(), tune = CAMERA_TUNE_DEFAULTS) {
    return CAMERA_CODECS.filter((c) => c !== 'vp8' && cameraFinding(c, agent, now, tune)?.result === 'drops');
}
/**
 * Remembers that this browser's hardware encoder dropped frames of codec during a call: the list older releases read
 * (HARDWARE_DROPS_KEY), so a product on an older client in the same browser keeps out of it too; and, where `numbers`
 * are given (a checked call camera's watch), its record too. Best effort (private windows, blocked storage).
 */
export function rememberDroppedHardware(codec, now = Date.now(), numbers) {
    if (codec === 'vp8')
        return;
    if (numbers) {
        rememberCameraCodec(codec, { result: 'drops', msPerFrame: numbers.msPerFrame ?? null, sentShare: numbers.sentShare ?? null,
            cpuShare: numbers.cpuShare ?? null, ...(numbers.gpu ? { gpu: numbers.gpu } : {}), at: now });
    }
    try {
        const storage = globalThis.localStorage;
        if (!storage)
            return;
        let seen = {};
        try {
            const read = JSON.parse(storage.getItem(HARDWARE_DROPS_KEY) ?? '{}');
            if (read && typeof read === 'object')
                seen = read;
        }
        catch { }
        seen[codec] = now;
        storage.setItem(HARDWARE_DROPS_KEY, JSON.stringify(seen));
    }
    catch { }
}
/**
 * The codecs this browser's CPU couldn't encode a camera in, in software: the newest finding a `cpu` record that holds
 * (a week), found at CAMERA_STEP_DOWN_HEIGHT or under. One found above it isn't: it goes out at that height (vp9Height()).
 */
export function heavySoftwareCodecs(agent = userAgent(), now = Date.now(), tune) {
    return CAMERA_CODECS.filter((c) => c !== 'vp8' && tooHeavy(cameraFinding(c, agent, now, tune)));
}
/**
 * Whether a camera check found this browser encodes codec well: the newest finding a `pass` record that holds (a month,
 * this version), no dropped frames seen since; or, for a codec in software, one too heavy for the CPU only above
 * CAMERA_STEP_DOWN_HEIGHT, which goes out at that height.
 */
export function cameraCheckPassed(codec, agent = userAgent(), now = Date.now(), tune) {
    const found = cameraFinding(codec, agent, now, tune);
    return found?.result === 'pass' || (found?.result === 'cpu' && !tooHeavy(found));
}
/** The browser and its major version, which a check's verdict holds for: "edg155", "chrome155", "opr137". */
export function browserVersion(agent) {
    for (const [name, pattern] of [['edg', /edg\/(\d+)/i], ['opr', /opr\/(\d+)/i], ['chrome', /chrome\/(\d+)/i], ['firefox', /firefox\/(\d+)/i], ['safari', /version\/(\d+).*safari/i]]) {
        const m = pattern.exec(agent);
        if (m)
            return name + m[1];
    }
    return 'other';
}
/**
 * A desktop browser on Windows built on Chromium (Chrome, Edge, Opera…): where a camera goes out in VP9, encoded in
 * software, once a check found its CPU able, ahead of the hardware H.264 the policy names first. Chrome trusts no
 * Windows hardware encoder's own rate control for H.264 (no software rate control on AMD and ARM, a flag elsewhere), so
 * libwebrtc takes whole frames off a camera whose encoder overshoots: 13 of 34 Windows senders in hardware H.264 froze
 * for their viewers in a day of calls, none of 15 Macs (2026-10-23); user_9's camera sent 4 of 15 frames for 40
 * minutes, and 720p at 14-15 in VP9 at 13 ms a frame once it moved. Not a phone or tablet, not Firefox.
 */
export function windowsDesktopChromium(agent) {
    return /windows nt/i.test(agent) && /chrome\/|edg\//i.test(agent) && !FIREFOX.test(agent) && !/mobile|android|tablet/i.test(agent);
}
const FIREFOX = /firefox\/|fxios\//i;
// WebKit: every browser on an iPhone or iPad, and Safari on a Mac (an iPad's Safari says Macintosh)
const IOS = /iphone|ipad|ipod/i;
const SAFARI = /^((?!chrome|chromium|crios|edg|opr|android|firefox|fxios).)*safari/i;
const isWebKit = (agent) => IOS.test(agent) || SAFARI.test(agent);
/**
 * WebKit (every iPhone and iPad browser, Safari on a Mac) or Firefox: a camera check is never run there. WebKit's H.264
 * is VideoToolbox, which takes no frames off, and neither names its encoder in its stats (no encoderImplementation, no
 * powerEfficientEncoder), so a loopback can't tell hardware from software (camera-check.ts).
 */
export function uncheckedBrowser(agent) {
    return isWebKit(agent) || FIREFOX.test(agent);
}
/**
 * H.265 goes first on the mesh. Off until the mesh falls back from it as LiveKit does: a receiver without H.265 had
 * the publisher send its VP8 beside it at full size, both ladders at once, 10 Mbit/s from one Mac in a call on
 * calls.wordplus.org (2026-10-14). LiveKit regresses a room of fewer than 5 to the backup alone; WordPlus Mesh's
 * mediasoup tracks never did. Until then H.264 goes first.
 */
export const H265_FIRST = false;
/** The camera's codecs without a server's policy: today's rule, H.264 where it's hardware, else VP8. */
export const DEFAULT_CAMERA_POLICY = H265_FIRST ? ['h265:hw', 'h264:hw', 'vp8'] : ['h264:hw', 'vp8'];
/**
 * The screen's without a server's policy: H.264 where the device encodes it in hardware, else VP8 in one picture
 * (screenPublish). Chrome on a Mac sharing a 2560×1440 document that scrolls (the mesh lab's
 * TestScreenShareQualityMatrix, 2026-10-18): H.264 in VideoToolbox 30 frames a second at an average quantizer of 16,
 * its CPU spared; VP8 alone 28-30 at 15-20. A shared screen goes out in hardware where it can, smooth without losing
 * its details.
 */
export const DEFAULT_SCREEN_POLICY = ['h264:hw', 'vp8'];
/**
 * Whether this device encodes codec in hardware: WebKit's H.264 is VideoToolbox's whatever its probe says of power,
 * unless the probe says it isn't there at all (a WebKit built without it, as Playwright's), and on the mesh Chromium's
 * is by its answer for Baseline (CHROMIUM_H264_ENCODE).
 */
function inHardware(codec, agent, hardware, options) {
    if (codec === 'h264' && isWebKit(agent) && hardware.encodes?.h264 !== false)
        return true;
    if (codec === 'h264' && options.h265 && hardware.h264Baseline === true)
        return true;
    return codec !== 'vp8' && hardware[codec] === true;
}
/**
 * Whether this browser sends codec into the room at all: livekit-client's own limits (supportsAV1: no AV1 from WebKit;
 * nothing but VP8 from Firefox, taken before this), no VP9 from WebKit either, H.265 only to a server that forwards
 * it, nothing the browser's WebRTC doesn't list (sendable). H.264, which every WebRTC implementation must have, unless
 * the probe says it isn't there; the others only where the probe says they are, or the device encodes them in
 * hardware.
 */
function sends(codec, agent, hardware, options) {
    const probed = hardware.encodes?.[codec];
    const webkit = isWebKit(agent);
    // what the browser's WebRTC doesn't list, livekit-client sends as VP8 (Playwright's WebKit: VP9 by its probe, not by
    // its sender, TestCodecPolicyMatrix)
    if (codec !== 'vp8' && hardware.sendable && !hardware.sendable.includes(codec))
        return false;
    switch (codec) {
        case 'vp8':
            return true;
        case 'h264':
            return inHardware('h264', agent, hardware, options) || probed !== false;
        case 'h265':
            return !!options.h265 && (inHardware('h265', agent, hardware, options) || probed === true);
        case 'vp9':
            // not from WebKit: livekit-client asks for it from 16 on, and Playwright's WebKit, listing VP9 among its
            // sender's codecs, still sent VP8 (TestCodecPolicyMatrix), at VP9's settings; an Apple device has H.264 and
            // H.265 in hardware for a policy to take instead
            return !webkit && (inHardware('vp9', agent, hardware, options) || probed === true);
        case 'av1':
            return !webkit && (inHardware('av1', agent, hardware, options) || probed === true);
    }
}
/**
 * The codecs of list this browser sends, in the list's order ("vp9" anyway, "h265:hw" only from hardware), each once,
 * VP8 last where the list hasn't named it; VP8 alone from Firefox and in an encrypted room. A codec in options.avoid is
 * passed over.
 */
function codecsOf(list, agent, hardware, options) {
    if (options.encrypted || FIREFOX.test(agent))
        return ['vp8'];
    const avoid = options.avoid ?? [];
    const out = [];
    for (const entry of list) {
        const [name, condition] = String(entry).toLowerCase().trim().split(':');
        const codec = CAMERA_CODECS.find((c) => c === name);
        if (!codec || out.includes(codec))
            continue;
        if (codec !== 'vp8' && avoid.includes(codec))
            continue;
        if (!sends(codec, agent, hardware, options))
            continue;
        if (condition === 'hw' && codec !== 'vp8' && !inHardware(codec, agent, hardware, options))
            continue;
        out.push(codec);
    }
    if (!out.includes('vp8'))
        out.push('vp8');
    return out;
}
/** The first codec of list this browser sends (codecsOf), VP8 where none is. */
function pickCodec(list, agent, hardware, options) {
    return codecsOf(list, agent, hardware, options)[0];
}
const nameOf = (entry) => String(entry).toLowerCase().trim().split(':')[0];
/**
 * The camera's list: the server's policy as it is, or the built-in one, which for a call's camera on the mesh tries VP9
 * before VP8 (VP8 is reached only once VP9 was tried, a hardware encoder that drops frames giving
 * way to VP9 first), as the mesh's own policy has it since 2026-10-19 (["h264:hw", "vp9", "vp8"]). A server's policy
 * without VP9 is its own choice; a stream's camera, and any off the mesh, keep the built-in list as it was.
 */
const cameraList = (options) => {
    if (options.policy?.camera?.length)
        return options.policy.camera;
    const list = [...DEFAULT_CAMERA_POLICY];
    if (legacyCamera(options) || !options.h265 || list.some((e) => nameOf(e) === 'vp9'))
        return list;
    const at = list.findIndex((e) => nameOf(e) === 'vp8');
    list.splice(at < 0 ? list.length : at, 0, 'vp9');
    return list;
};
/**
 * The camera order a rule gives this browser (cameraRules(), cameraRuleFor()): a call's camera only, not in an encrypted
 * room. The built-in rules (a policy without the key) only where the camera's list has VP9 (on the mesh), so a camera off
 * it, or under a policy without VP9, keeps its list as it was; the node's own rules as they are. Null where none matches.
 */
export function cameraRuleOrder(agent, options = {}, builtIn = DEFAULT_CAMERA_RULES) {
    if (legacyCamera(options) || options.encrypted)
        return null;
    const policy = options.policy ?? null;
    const own = !!policy && Object.prototype.hasOwnProperty.call(policy, 'rules');
    if (!own && !cameraList(options).some((e) => nameOf(e) === 'vp9'))
        return null;
    const rule = cameraRuleFor(own ? cameraRules(policy) : builtIn, cameraEnvironment(agent, options.gpu !== undefined ? options.gpu : adapterName));
    return rule ? rule.camera : null;
}
/**
 * The built-in rules a call's screen takes where the policy has no `rules` key: VP9 first on Windows and Linux, as the
 * camera's were until 1.0.55. A screen in VP9 in one layer marked motion was measured the smoothest from Windows, and
 * the camera's measuring of its hardware H.264 says nothing of a screen's.
 */
export const DEFAULT_SCREEN_RULES = Object.freeze([
    { os: 'windows', camera: ['vp9', 'h264:hw', 'vp8'] },
    { os: 'linux', camera: ['vp9', 'h264:hw', 'vp8'] }
]);
/**
 * A camera on the old rules exactly, as before the camera check: not a checked call's (a stream's, the SDK's group
 * calls'), or one whose node didn't turn the check on (its policy's `check` anything but true: an older mesh, a
 * self-hosted box, stock LiveKit, a node configured off; Better Messages says false for a room client too old to hear
 * the node's switches). The policy's list or the built-in one as they are, no rules, and the dropped-frames list older
 * releases kept as the only thing avoided: no record read.
 */
export function legacyCamera(options = {}) {
    return !options.call || options.policy?.check !== true;
}
/**
 * What this device won't send: the codecs given, or those it remembers (hardware that dropped frames, software too
 * heavy), for as long as the policy's tune keeps them; on the old rules, the old list alone.
 */
const avoidOf = (agent, options) => {
    if (options.avoid)
        return options.avoid;
    if (legacyCamera(options))
        return droppedHardwareCodecs();
    const tune = cameraTune(options.policy), now = Date.now();
    return [...droppedCameraCodecs(now, agent, tune), ...heavySoftwareCodecs(agent, now, tune)];
};
/**
 * The camera's codecs on this device, in the order to try them: a rule's (cameraRuleOrder()), else the policy's (the
 * server's, or the built-in), without what it won't send (avoidOf), VP8 last. What a camera check (camera-check.ts)
 * goes through, measuring each that needs it.
 */
export function cameraCodecOrder(agent, hardware, options = {}) {
    const opts = { ...options, avoid: avoidOf(agent, options) };
    return codecsOf(cameraRuleOrder(agent, options) ?? cameraList(options), agent, hardware, opts);
}
/**
 * The camera's codec on this device: its user agent, the codecs it encodes, the room, and the server's policy. Not a
 * codec whose hardware encoder dropped a camera's frames here (encoder-watch.ts), nor one its CPU couldn't encode
 * (camera-check.ts). Where a rule orders the camera (by default a Windows desktop Chrome or Edge, VP9 first), its first
 * codec, one in software only once a check found this browser able (cameraCheckPassed); unmeasured, or without a rule,
 * the policy's order as before.
 */
export function cameraCodecFor(agent, hardware, options = {}) {
    const opts = { ...options, avoid: avoidOf(agent, options) };
    // the old rules: the list, less the old dropped-frames list
    if (legacyCamera(options))
        return pickCodec(cameraList(options), agent, hardware, opts);
    const ruled = cameraRuleOrder(agent, options);
    if (ruled) {
        const first = codecsOf(ruled, agent, hardware, opts)[0];
        if (first === 'vp8' || inHardware(first, agent, hardware, options) || cameraCheckPassed(first, agent, Date.now(), cameraTune(options.policy)))
            return first;
    }
    return pickCodec(cameraList(options), agent, hardware, opts);
}
/** Whether this device encodes codec in hardware (as cameraCodecFor() reads it): what a camera check measures for drops. */
export function encodesInHardware(codec, agent, hardware, options = {}) {
    return inHardware(codec, agent, hardware, options);
}
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
export function screenCodecOrder(agent, hardware, options = {}) {
    if (options.policy?.screen?.length)
        return codecsOf(options.policy.screen, agent, hardware, options);
    const ruled = cameraRuleOrder(agent, { ...options, gpu: null }, DEFAULT_SCREEN_RULES);
    if (ruled)
        return codecsOf(ruled, agent, hardware, { ...options, avoid: avoidOf(agent, options) });
    return codecsOf(DEFAULT_SCREEN_POLICY, agent, hardware, options);
}
/** The screen's codec, the first of screenCodecOrder(). */
export function screenCodecFor(agent, hardware, options = {}) {
    return screenCodecOrder(agent, hardware, options)[0];
}
/**
 * What probeCodecCaps() says this device encodes, for cameraCodecFor(), and what its WebRTC sends at all (`sendable`,
 * the browser's RTCRtpSender.getCapabilities, or the list given).
 */
export function hardwareFromCaps(caps, sendable = webrtcSendable()) {
    const enc = (family) => caps?.families[family]?.enc;
    const hw = (family) => !!(enc(family)?.ok && enc(family)?.hw);
    const ok = (family) => {
        const e = enc(family);
        return e && typeof e.ok === 'boolean' ? e.ok : null;
    };
    return {
        h264: hw('video/H264'), h265: hw('video/H265'), vp9: hw('video/VP9'), av1: hw('video/AV1'),
        h264Baseline: caps?.h264Baseline ?? null,
        encodes: { h264: ok('video/H264'), h265: ok('video/H265'), vp9: ok('video/VP9'), av1: ok('video/AV1') },
        sendable
    };
}
/** The video codecs this browser's WebRTC sends (RTCRtpSender.getCapabilities); null where it can't tell. */
function webrtcSendable() {
    try {
        const sender = globalThis.RTCRtpSender;
        const codecs = sender?.getCapabilities?.('video')?.codecs;
        if (!codecs)
            return null;
        const names = codecs.map((c) => c.mimeType.toLowerCase().replace('video/', ''));
        return CAMERA_CODECS.filter((c) => names.includes(c));
    }
    catch {
        return null;
    }
}
/** cameraCodecFor() from probeCodecCaps()'s answer. */
export function roomCallCodec(caps, agent, options = {}) {
    return cameraCodecFor(agent, hardwareFromCaps(caps), options);
}
/**
 * The tallest picture a camera in codec goes out at: cameraMaxHeight(), and for a checked call camera in software VP9
 * what this browser found of it (vp9Height(): VP9_TOP_HEIGHT once measured able there, CAMERA_STEP_DOWN_HEIGHT else).
 */
export function choiceHeight(codec, hardware, agent, options = {}) {
    const settings = options.policy?.settings;
    if (codec !== 'vp9' || hardware || legacyCamera(options) || options.encrypted)
        return cameraMaxHeight(codec, hardware, settings);
    // camera.vp9FullHdAfterCheck false (1.0.53): VP9 in software at the software height, however it measured
    if (!settingFlag(settings, 'camera.vp9FullHdAfterCheck', true))
        return cameraMaxHeight(codec, false, settings);
    return Math.min(vp9Height(agent, Date.now(), cameraTune(options.policy)), Math.max(cameraMaxHeight(codec, true, settings), CAMERA_STEP_DOWN_HEIGHT));
}
/** roomCallCodec(), with what cameraPublish() and fitCameraTrack() need to know of it. */
export function roomCallChoice(caps, agent, options = {}) {
    const hardware = hardwareFromCaps(caps);
    const codec = cameraCodecFor(agent, hardware, options);
    const encoded = inHardware(codec, agent, hardware, options);
    return { codec, hardware: encoded, backup: options.encrypted ? null : backupFor(codec, options.policy), height: choiceHeight(codec, encoded, agent, options) };
}
/** What goes behind codec: nothing behind VP8; H.264 where the policy asks for it and the codec isn't H.264; VP8. */
export function backupFor(codec, policy) {
    if (codec === 'vp8')
        return null;
    return String(policy?.backup ?? '').toLowerCase() === 'h264' && codec !== 'h264' ? 'h264' : 'vp8';
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
export function cameraPublish(codec, height, backupCodec, settings) {
    if (height < 720)
        return null;
    const full = height >= 1080;
    const size = full ? '1080' : '720';
    const fps = Math.round(settingNumber(settings, 'camera.fps', 30));
    const top = (name, fallback) => ({
        maxBitrate: Math.round(settingNumber(settings, `camera.topKbps.${name}.${size}`, fallback / 1000) * 1000),
        maxFramerate: fps
    });
    const tops = {
        h265: top('h265', full ? H265_TOP_1080 : H265_TOP_720),
        h264: top('h264', full ? 3500000 : 1800000),
        vp8: top('vp8', full ? 4000000 : 2000000),
        vp9: top('vp9', full ? 2800000 : 1400000),
        av1: top('av1', full ? 2400000 : 1200000)
    };
    const behind = codec === 'vp8' ? null : backupCodec === undefined ? 'vp8' : backupCodec === 'h264' && codec === 'h264' ? 'vp8' : backupCodec;
    return {
        codec,
        top: tops[codec],
        layers: ladderOf(settings, size),
        ...(codec === 'vp9' || codec === 'av1' ? { scalabilityMode: settingWord(settings, 'camera.svcMode', 'L3T3_KEY') } : {}),
        backup: behind ? tops[behind] : null,
        backupCodec: behind
    };
}
/** The lower layers of a camera at 1080 or 720 lines, smallest first, each 16:9 of an even width (camera.ladder.*). */
function ladderOf(settings, size) {
    const fallback = size === '1080' ? [
        { width: 480, height: 270, bitrate: 400000, fps: 30 },
        { width: 960, height: 540, bitrate: 1200000, fps: 30 }
    ] : [
        { width: 320, height: 180, bitrate: 200000, fps: 30 },
        { width: 640, height: 360, bitrate: 600000, fps: 30 }
    ];
    const given = settings?.has('camera.ladder.' + size) ? settings.get('camera.ladder.' + size) : null;
    if (!Array.isArray(given) || !given.length)
        return fallback;
    const top = size === '1080' ? 1080 : 720;
    const layers = given
        .filter((l) => !!l && [l.h, l.kbps, l.fps].every((n) => typeof n === 'number' && Number.isFinite(n)))
        .filter((l) => l.h < top)
        .map((l) => ({ width: evenOf(l.h * 16 / 9), height: Math.round(l.h), bitrate: Math.round(l.kbps * 1000), fps: Math.round(l.fps) }));
    return layers.length ? layers : fallback;
}
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
export function cameraMaxHeight(codec, hardware, settings) {
    return (hardware ?? (codec === 'h264' || codec === 'h265'))
        ? Math.round(settingNumber(settings, 'camera.maxHeight.hw', 1080))
        : Math.round(settingNumber(settings, 'camera.maxHeight.sw', 720));
}
/**
 * Brings a camera down to cameraMaxHeight() for its codec before it is published (or to `maxHeight`, a choice's
 * CameraChoice.height), and answers the height it has then, which is what cameraPublish() takes. The browser scales
 * what the camera gives, keeping its shape and the rest of what it was asked for (the device, the frame rate), and the
 * preview shows the same picture. Best effort: a camera that can't be scaled, or doesn't answer within two seconds,
 * goes out at the size it has, with that size's layers. Never up: a camera smaller than that stays as it is.
 *
 * And a camera opened in a mode of fewer than CAMERA_MIN_FPS frames is tried at smaller sizes (fasterCameraMode).
 */
export async function fitCameraTrack(track, codec, hardware, maxHeight, settings) {
    const { width, height } = cameraSize(track);
    const max = maxHeight && maxHeight > 0 ? maxHeight : cameraMaxHeight(codec, hardware, settings);
    if (height > max) {
        let constraints;
        try {
            constraints = { ...track.getConstraints(), height: { ideal: max } };
            if (width)
                constraints.width = { ideal: evenOf(width * max / height) };
            else
                delete constraints.width;
        }
        catch {
            // a track that can't say what it was asked: it stays as it is
        }
        if (constraints)
            await applyWithin(track, constraints);
    }
    await fasterCameraMode(track, settings);
    return cameraSize(track).height;
}
const FIT_TIMEOUT_MS = 2000;
/** The nearest even number: a picture of an odd width or height Chrome encodes in software (fasterCameraMode). */
const evenOf = (n) => 2 * Math.round(n / 2);
const cameraSize = (track) => {
    try {
        const { width = 0, height = 0 } = track.getSettings();
        return { width, height };
    }
    catch {
        return { width: 0, height: 0 };
    }
};
/** Asks the camera for constraints, within FIT_TIMEOUT_MS; one it can't take, or that takes longer, changes nothing. */
async function applyWithin(track, constraints) {
    let timer;
    try {
        await Promise.race([
            track.applyConstraints(constraints),
            new Promise((resolve) => { timer = setTimeout(resolve, FIT_TIMEOUT_MS); })
        ]);
    }
    catch {
        // the camera stays as it is
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * The fewest frames a second a camera's mode may give in a call before smaller sizes are tried, and those sizes, the
 * largest first, at most CAMERA_FASTER_TRIES of them. Many cameras give 1080p at 15 frames and 720p at 30, and asked
 * for 1080p at 30, Chrome opens the 1080p mode, the size counting for more than the frames (2026-10-19: a call where
 * many cameras gave few frames a second): a jerky picture where a smooth 720p was there.
 */
export const CAMERA_MIN_FPS = 24;
const CAMERA_FASTER_HEIGHTS = [720, 540, 480];
const CAMERA_FASTER_TRIES = 2;
/**
 * A camera opened in a mode of fewer than CAMERA_MIN_FPS frames (its settings' frameRate, the mode's, not what a dim
 * room leaves of it) is asked for smaller sizes at 30 frames, and kept at the first whose mode gives CAMERA_MIN_FPS or
 * more; none does, it goes back to what it was asked before. A browser that says no frame rate is left as it is.
 * settings (1.0.53): camera.minFps, the node's (0: never); CAMERA_MIN_FPS without them.
 */
export async function fasterCameraMode(track, settings) {
    const rate = () => {
        try {
            return track.getSettings().frameRate ?? 0;
        }
        catch {
            return 0;
        }
    };
    const minFps = settingNumber(settings, 'camera.minFps', CAMERA_MIN_FPS);
    const fps = rate();
    if (!minFps || !fps || fps >= minFps)
        return;
    const { width, height } = cameraSize(track);
    if (!height)
        return;
    let before;
    try {
        before = track.getConstraints();
    }
    catch {
        return;
    }
    const tries = CAMERA_FASTER_HEIGHTS.filter((h) => h < height).slice(0, CAMERA_FASTER_TRIES);
    if (!tries.length)
        return;
    // The shape asked for (16:9 from a product's 1920×1080), where the camera faces the same way, so its layers come
    // out at the ladder's own sizes (640×360, 320×180). Chrome encodes H.264 in hardware only from 360 lines and in
    // even sizes (measured on a Mac, 2026-10-19: 358×360 and 450×360 in VideoToolbox, 641×360, 640×358 and 465×372 in
    // OpenH264): a 5:4 webcam opened at 1280×1024 and 8 frames sent its 372p layer at 465 wide, in software, few
    // frames and software encoding on its lower layers; asked for 1280×720 at 30, its 360p is 640 wide. A phone held
    // upright keeps its own shape.
    const ideal = (c) => typeof c === 'number' ? c : c?.ideal ?? c?.exact;
    const askedW = ideal(before.width), askedH = ideal(before.height);
    const asked = askedW && askedH ? askedW / askedH : 0;
    const aspect = asked && (asked >= 1) === (width >= height) ? asked : width && height ? width / height : 0;
    for (const h of tries) {
        const constraints = { ...before, height: { ideal: h }, frameRate: { ideal: 30 } };
        if (aspect)
            constraints.width = { ideal: evenOf(h * aspect) };
        else
            delete constraints.width;
        await applyWithin(track, constraints);
        if (rate() >= minFps)
            return;
    }
    await applyWithin(track, before);
}
// H.265's full size: the picture H.264 gives at its own, on about 70% of the bits. A Mac's VideoToolbox, as Chrome
// encodes a call's camera, against Xiph's KristenAndSara at 720p and 30 frames (VMAF, 2026-10-14): H.264 94.2 at
// 1752 kbit/s and H.265 94.1 at 1259; H.264 88.5 at 841, H.265 89.5 at 631. The lower layers keep their bitrates:
// the VP8 behind H.265 takes the same ones (livekit-client's backup encodings), and needs them.
const H265_TOP_1080 = 2500000;
const H265_TOP_720 = 1300000;
/** A shared screen in a group call: up to 10 Mbit/s at 30 frames, the library's own is 1080p at 15 and 2.5. */
export const SCREEN_ENCODING = { maxBitrate: 10000000, maxFramerate: 30, priority: 'medium' };
/** SCREEN_ENCODING as the node's settings give it (screen.maxKbps, screen.fps), 1.0.53: live, applyScreenSettings(). */
export function screenEncoding(settings) {
    return {
        maxBitrate: Math.round(settingNumber(settings, 'screen.maxKbps', SCREEN_ENCODING.maxBitrate / 1000) * 1000),
        maxFramerate: Math.round(settingNumber(settings, 'screen.fps', SCREEN_ENCODING.maxFramerate)),
        priority: SCREEN_ENCODING.priority
    };
}
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
export const SCREEN_CONTENT_HINT = 'motion';
export const SCREEN_DEGRADATION = 'maintain-resolution';
/**
 * A screen in VP9 or AV1 goes out in one layer, no temporal layers, marked motion as H.264 is (1.0.47; @wordplus/rtc-client
 * 1.0.20 keeps the mode and the mark). Chromium 156, a room's share of 1440 lines on up to 10 Mbit/s: marked motion in
 * L1T1, a page scrolled every frame at 28 to 29 frames a second and an average quantizer of 10.6, a video with a cut
 * every 2 s at 27 to 29 frames; marked motion with temporal layers (L1T2, L1T3), the scrolled page fell to 5 to 8 frames
 * at 208 of 255 in every run; marked detail (1.0.44 to 1.0.46), 19 to 26 frames at 32 on a fifth of the budget, as
 * Chrome's screen-content mode holds frames back. Shared from a Windows PC through the mesh, motion in L1T1 was the
 * smoothest of the three. A viewer that can't take it whole gets it whole, as a VP8 screen.
 */
export const SCREEN_SCALABILITY_MODE_SVC = 'L1T1';
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
export function screenPublish(width, height, codec = 'vp8', settings) {
    // 1.0.53: the node's numbers (screen.simulcastFromWidth/Height, screen.lowLayerKbps/Fps, screen.contentHint), and
    // screen.vp8Simulcast, the apps' rule (a large screen in VP8 with the half layer), off by default
    const contentHint = settingWord(settings, 'screen.contentHint', SCREEN_CONTENT_HINT);
    const fromW = settingNumber(settings, 'screen.simulcastFromWidth', 1280), fromH = settingNumber(settings, 'screen.simulcastFromHeight', 640);
    if (codec === 'vp9' || codec === 'av1')
        return { codec, layer: null, simulcast: false, contentHint, scalabilityMode: SCREEN_SCALABILITY_MODE_SVC };
    const layered = codec === 'h264' || codec === 'h265' || (codec === 'vp8' && settingFlag(settings, 'screen.vp8Simulcast', false));
    if (!layered || width < fromW || height < fromH)
        return { codec, layer: null, simulcast: false, contentHint };
    return {
        codec,
        layer: {
            width: Math.round(width / 2), height: Math.round(height / 2),
            bitrate: Math.round(settingNumber(settings, 'screen.lowLayerKbps', 1500) * 1000),
            fps: Math.round(settingNumber(settings, 'screen.lowLayerFps', 15))
        },
        simulcast: true,
        contentHint
    };
}
/**
 * A shared screen sent for a video played on it, the presenter's "Optimize for video" (1.0.45): marked motion, which
 * Chrome encodes as camera video, and keeping its frame rate when the link or the CPU can't give both. In the
 * screen-content mode a VP9 screen of a video with a cut every 2 s went out at 14 frames a second, each cut rough for
 * the frames after it; marked motion, at 27.
 */
export const SCREEN_DEGRADATION_VIDEO = 'maintain-framerate';
/**
 * A direct call's shared screen is marked detail, Chrome's screen-content mode, in every codec: it goes out in the codec
 * that keeps text (codecs.ts), AV1 or VP9 first. Rooms mark theirs motion (SCREEN_CONTENT_HINT).
 */
export const DIRECT_SCREEN_CONTENT_HINT = 'detail';
/**
 * How a room's screen shared in `codec` is sent: for a video played on it (forVideo), its frame rate kept, or as
 * screenPublish marks it, its resolution kept. Marked motion either way, in every codec. settings (1.0.53):
 * screen.contentHint and screen.degradation, the node's ("default" there: balanced, the browser's own); a video's
 * frame rate is kept whatever they say.
 */
export function screenVideoMode(codec, forVideo, settings) {
    const contentHint = settingWord(settings, 'screen.contentHint', SCREEN_CONTENT_HINT);
    if (forVideo)
        return { contentHint: 'motion', degradationPreference: SCREEN_DEGRADATION_VIDEO };
    const degradation = settingWord(settings, 'screen.degradation', SCREEN_DEGRADATION);
    return { contentHint, degradationPreference: (degradation === 'default' ? 'balanced' : degradation) };
}
/** How a direct call's screen is sent: for a video played on it, as a room's, or marked detail, its resolution kept. */
export function directScreenMode(forVideo) {
    return forVideo
        ? { contentHint: SCREEN_CONTENT_HINT, degradationPreference: SCREEN_DEGRADATION_VIDEO }
        : { contentHint: DIRECT_SCREEN_CONTENT_HINT, degradationPreference: SCREEN_DEGRADATION };
}
/**
 * Puts a screen shared into a room in a mode while it is sent, nothing published again: no key frame, and a VP9 screen
 * in L1T2 settled within 2 s (23 frames a second in detail, 28 for video, 24 back). Its publication's options take the
 * degradation too, as the room client publishes the track with them again after a full reconnect.
 */
export async function applyScreenVideoMode(track, options, mode) {
    try {
        track.mediaStreamTrack.contentHint = mode.contentHint;
    }
    catch (e) { }
    if (options)
        options.degradationPreference = mode.degradationPreference;
    await track.setDegradationPreference(mode.degradationPreference);
}
/**
 * The pixel density a receiver asks layers by (adaptive stream): the screen's, at most 1.5. At 2 or 3 (a Retina
 * screen, a phone) a tile asked for twice its size or more, the larger layer for every tile in a grid.
 */
export function roomPixelDensity(devicePixelRatio, settings) {
    return Math.min(settingNumber(settings, 'view.pixelDensityMax', 1.5), Math.max(1, Number(devicePixelRatio) || 1));
}
/**
 * 1.0.53: a shared screen's sending as the node's settings say it now (screen.maxKbps, screen.fps, screen.contentHint,
 * screen.degradation; all live): its encodings' bitrate and frame rate, its mark and its degradation preference, nothing
 * published again. forVideo: the presenter's "Optimize for video", which keeps its own mark and frame rate.
 */
export async function applyScreenSettings(track, settings, codec, forVideo = false) {
    const encoding = screenEncoding(settings);
    try {
        const params = track.sender?.getParameters();
        const top = params?.encodings?.[params.encodings.length - 1];
        if (track.sender && params && top && (top.maxBitrate !== encoding.maxBitrate || top.maxFramerate !== encoding.maxFramerate)) {
            top.maxBitrate = encoding.maxBitrate;
            top.maxFramerate = encoding.maxFramerate;
            await track.sender.setParameters(params);
        }
    }
    catch {
        // it keeps what it went out with
    }
    await applyScreenVideoMode(track, undefined, screenVideoMode(codec, forVideo, settings));
}
/** 1.0.53: a call microphone's publish options from the settings (mic.kbps, mic.red, mic.dtx); 64 kbit/s, RED and DTX on without them. */
export function micPublish(settings) {
    return {
        maxBitrate: Math.round(settingNumber(settings, 'mic.kbps', 64) * 1000),
        red: settingFlag(settings, 'mic.red', true),
        dtx: settingFlag(settings, 'mic.dtx', true)
    };
}
/** 1.0.53: a shared screen's sound (screenAudio.kbps): stereo, without DTX or RED; 128 kbit/s without settings. */
export function screenAudioPublish(settings) {
    return { maxBitrate: Math.round(settingNumber(settings, 'screenAudio.kbps', 128) * 1000), forceStereo: true, dtx: false, red: false };
}
/** 1.0.53: what a call's microphone is opened with (mic.echoCancellation, noiseSuppression, autoGainControl, voiceIsolation). */
export function micCapture(settings) {
    return {
        echoCancellation: settingFlag(settings, 'mic.echoCancellation', true),
        noiseSuppression: settingFlag(settings, 'mic.noiseSuppression', true),
        autoGainControl: settingFlag(settings, 'mic.autoGainControl', true),
        voiceIsolation: settingFlag(settings, 'mic.voiceIsolation', true)
    };
}
/** 1.0.53: the size and frame rate a call's camera is opened at (camera.captureHeight, camera.captureFps): 1080p30 without settings. */
export function cameraCapture(settings) {
    const height = Math.round(settingNumber(settings, 'camera.captureHeight', 1080));
    return { width: evenOf(height * 16 / 9), height, frameRate: Math.round(settingNumber(settings, 'camera.captureFps', 30)) };
}
/** 1.0.53: the size and frame rate a room's screen is captured at (screen.captureHeight, screen.captureFps): 1080p30 without settings. */
export function screenCapture(settings) {
    const height = Math.round(settingNumber(settings, 'screen.captureHeight', 1080));
    return { width: evenOf(height * 16 / 9), height, frameRate: Math.round(settingNumber(settings, 'screen.captureFps', 30)) };
}
/** 1.0.53: how long a product waits on an unreachable server before it says so (connect.giveUpMs), ms; 20 s without settings. */
export function connectGiveUpMs(settings) {
    return Math.round(settingNumber(settings, 'connect.giveUpMs', 20000));
}
/**
 * 1.0.53: the keys whose change re-publishes a camera with the node's `applyNow` (the publish keys a camera goes out
 * by), and a screen's. A key of another class reaches the camera by itself: live ones at once, capture ones at its next
 * open.
 */
const CAMERA_PUBLISH_KEYS = /^(camera\.(codecs|codecRules|backup|ladder\.|topKbps\.|fps$|svcMode|maxHeight\.|vp9FullHdAfterCheck)|check\.|tune\.(checkMs|pass))/;
const SCREEN_PUBLISH_KEYS = /^screen\.(codecs|simulcastFrom|lowLayer|vp8Simulcast)/;
/** Whether a change of these keys (RoomEvent.MeshSettingsChanged's) is one a camera goes out by. */
export function cameraPublishChanged(changed) {
    return changed.some((k) => CAMERA_PUBLISH_KEYS.test(k));
}
/** Whether a change of these keys is one a screen goes out by. */
export function screenPublishChanged(changed) {
    return changed.some((k) => SCREEN_PUBLISH_KEYS.test(k));
}
/**
 * When a camera re-publishes for an `applyNow` revision: a moment within spreadMs fixed by its identity (FNV-1a), so a
 * room's cameras don't all go out again at once, and each the same moment on every revision.
 */
export function applyNowDelayMs(identity, spreadMs = 60000) {
    let h = 0x811c9dc5;
    for (let i = 0; i < identity.length; i++) {
        h ^= identity.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % Math.max(1, Math.round(spreadMs));
}
