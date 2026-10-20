const CAMERA_CODECS = ['h265', 'h264', 'vp8', 'vp9', 'av1'];
/**
 * The question Chromium answers of its H.264 hardware for the Baseline the mesh takes from it (1.0.34): Baseline,
 * packetization mode 1, level 4.2 (1080p60). Chrome 155 on a desktop answered it power efficient where it encodes in
 * VideoToolbox or Media Foundation (an AMD encoder), and Constrained Baseline not, which it encodes in OpenH264.
 */
export const CHROMIUM_H264_ENCODE = 'video/H264;profile-level-id=42002a;packetization-mode=1';
const FIREFOX = /firefox\/|fxios\//i;
// WebKit: every browser on an iPhone or iPad, and Safari on a Mac (an iPad's Safari says Macintosh)
const IOS = /iphone|ipad|ipod/i;
const SAFARI = /^((?!chrome|chromium|crios|edg|opr|android|firefox|fxios).)*safari/i;
const isWebKit = (agent) => IOS.test(agent) || SAFARI.test(agent);
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
 * The first codec of list this browser sends, as the list asks ("vp9" anyway, "h265:hw" only from hardware), and VP8
 * where none is: from Firefox and in an encrypted room always.
 */
function pickCodec(list, agent, hardware, options) {
    if (options.encrypted || FIREFOX.test(agent))
        return 'vp8';
    for (const entry of list) {
        const [name, condition] = String(entry).toLowerCase().trim().split(':');
        const codec = CAMERA_CODECS.find((c) => c === name);
        if (!codec)
            continue;
        if (!sends(codec, agent, hardware, options))
            continue;
        if (condition === 'hw' && codec !== 'vp8' && !inHardware(codec, agent, hardware, options))
            continue;
        return codec;
    }
    return 'vp8';
}
/** The camera's codec on this device: its user agent, the codecs it encodes, the room, and the server's policy. */
export function cameraCodecFor(agent, hardware, options = {}) {
    const list = options.policy?.camera?.length ? options.policy.camera : DEFAULT_CAMERA_POLICY;
    return pickCodec(list, agent, hardware, options);
}
/** The screen's codec, as cameraCodecFor() the camera's (the server's policy's screen list; VP8 without one). */
export function screenCodecFor(agent, hardware, options = {}) {
    const list = options.policy?.screen?.length ? options.policy.screen : DEFAULT_SCREEN_POLICY;
    return pickCodec(list, agent, hardware, options);
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
/** roomCallCodec(), with what cameraPublish() and fitCameraTrack() need to know of it. */
export function roomCallChoice(caps, agent, options = {}) {
    const hardware = hardwareFromCaps(caps);
    const codec = cameraCodecFor(agent, hardware, options);
    return { codec, hardware: inHardware(codec, agent, hardware, options), backup: options.encrypted ? null : backupFor(codec, options.policy) };
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
 */
export function cameraPublish(codec, height, backupCodec) {
    if (height < 720)
        return null;
    const full = height >= 1080;
    const tops = {
        h265: { maxBitrate: full ? H265_TOP_1080 : H265_TOP_720, maxFramerate: 30 },
        h264: { maxBitrate: full ? 3500000 : 1800000, maxFramerate: 30 },
        vp8: { maxBitrate: full ? 4000000 : 2000000, maxFramerate: 30 },
        vp9: { maxBitrate: full ? 2800000 : 1400000, maxFramerate: 30 },
        av1: { maxBitrate: full ? 2400000 : 1200000, maxFramerate: 30 }
    };
    const behind = codec === 'vp8' ? null : backupCodec === undefined ? 'vp8' : backupCodec === 'h264' && codec === 'h264' ? 'vp8' : backupCodec;
    return {
        codec,
        top: tops[codec],
        layers: full ? [
            { width: 480, height: 270, bitrate: 400000, fps: 30 },
            { width: 960, height: 540, bitrate: 1200000, fps: 30 }
        ] : [
            { width: 320, height: 180, bitrate: 200000, fps: 30 },
            { width: 640, height: 360, bitrate: 600000, fps: 30 }
        ],
        ...(codec === 'vp9' || codec === 'av1' ? { scalabilityMode: 'L3T3_KEY' } : {}),
        backup: behind ? tops[behind] : null,
        backupCodec: behind
    };
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
 */
export function cameraMaxHeight(codec, hardware) {
    return (hardware ?? (codec === 'h264' || codec === 'h265')) ? 1080 : 720;
}
/**
 * Brings a camera down to cameraMaxHeight() for its codec before it is published, and answers the height it has then,
 * which is what cameraPublish() takes. The browser scales what the camera gives, keeping its shape and the rest of what
 * it was asked for (the device, the frame rate), and the preview shows the same picture. Best effort: a camera that
 * can't be scaled, or doesn't answer within two seconds, goes out at the size it has, with that size's layers.
 *
 * And a camera opened in a mode of fewer than CAMERA_MIN_FPS frames is tried at smaller sizes (fasterCameraMode).
 */
export async function fitCameraTrack(track, codec, hardware) {
    const { width, height } = cameraSize(track);
    const max = cameraMaxHeight(codec, hardware);
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
    await fasterCameraMode(track);
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
 */
export async function fasterCameraMode(track) {
    const rate = () => {
        try {
            return track.getSettings().frameRate ?? 0;
        }
        catch {
            return 0;
        }
    };
    const fps = rate();
    if (!fps || fps >= CAMERA_MIN_FPS)
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
        if (rate() >= CAMERA_MIN_FPS)
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
/**
 * A shared screen's track is marked motion, and its sender keeps its resolution when it must give: smooth wherever the
 * upload and the CPU allow, and sharp where they don't. Marked detail, as it was, Chrome encodes it in its
 * screen-content mode, which spends few bits and drops frames for them: a 1440p screen of moving pictures in H.264 from
 * VideoToolbox went out at 10 frames a second on 3.9 of the 10 Mbit/s it may take, at an average quantizer of 43;
 * marked motion, 24-26 frames at 42, and text as sharp as before (16 in H.264, 2 in VP8 where detail gave 15), on more
 * bits (the mesh lab's TestScreenShareBusyMatrix, 2026-10-18; a Windows PC's share in H.264 from its AMD encoder went
 * out at 15 frames or fewer): smooth without losing details.
 */
export const SCREEN_CONTENT_HINT = 'motion';
export const SCREEN_DEGRADATION = 'maintain-resolution';
/**
 * A screen in H.264 or H.265 from 1280 by 640 goes out in two pictures: the whole one for everyone who can take it, and
 * one half its size at 15 frames for a connection that can't (Opera behind a VPN froze on a 2560×1428 share it could
 * only take whole), which the media server picks per viewer.
 *
 * In VP8 it goes out whole only, one picture (simulcast false; livekit-client adds a second of its own otherwise): Chrome
 * encodes a screen in VP8 simulcast in its screen-share mode, which held a 2560×1440 document scrolling to 5 frames a
 * second at an average quantizer of 98, the viewer shown the half one at 15, while the same screen whole went out at 28
 * frames and 20 (TestScreenShareQualityMatrix, 2026-10-18; a Windows PC's share, its CPU and upload idle, "not smooth,
 * framerate seems to be bad"). In VP9 or AV1 the library publishes a share as one spatial layer (L1T3), since Chrome
 * drops an SVC share with more to its smallest picture. Smaller screens go out whole.
 */
export function screenPublish(width, height, codec = 'vp8') {
    if ((codec !== 'h264' && codec !== 'h265') || width < 1280 || height < 640)
        return { codec, layer: null, simulcast: false };
    return { codec, layer: { width: Math.round(width / 2), height: Math.round(height / 2), bitrate: 1500000, fps: 15 }, simulcast: true };
}
/**
 * The pixel density a receiver asks layers by (adaptive stream): the screen's, at most 1.5. At 2 or 3 (a Retina
 * screen, a phone) a tile asked for twice its size or more, the larger layer for every tile in a grid.
 */
export function roomPixelDensity(devicePixelRatio) {
    return Math.min(1.5, Math.max(1, Number(devicePixelRatio) || 1));
}
