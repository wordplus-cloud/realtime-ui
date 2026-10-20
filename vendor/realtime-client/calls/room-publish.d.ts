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
}
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
}
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
/** The camera's codec on this device: its user agent, the codecs it encodes, the room, and the server's policy. */
export declare function cameraCodecFor(agent: string, hardware: CameraHardware, options?: CameraCodecOptions): CameraCodec;
/** The screen's codec, as cameraCodecFor() the camera's (the server's policy's screen list; VP8 without one). */
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
}
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
    scalabilityMode?: 'L3T3_KEY';
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
 */
export declare function cameraPublish(codec: CameraCodec, height: number, backupCodec?: 'vp8' | 'h264' | null): CameraPublish | null;
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
export declare function cameraMaxHeight(codec: CameraCodec, hardware?: boolean): number;
/**
 * Brings a camera down to cameraMaxHeight() for its codec before it is published, and answers the height it has then,
 * which is what cameraPublish() takes. The browser scales what the camera gives, keeping its shape and the rest of what
 * it was asked for (the device, the frame rate), and the preview shows the same picture. Best effort: a camera that
 * can't be scaled, or doesn't answer within two seconds, goes out at the size it has, with that size's layers.
 *
 * And a camera opened in a mode of fewer than CAMERA_MIN_FPS frames is tried at smaller sizes (fasterCameraMode).
 */
export declare function fitCameraTrack(track: MediaStreamTrack, codec: CameraCodec, hardware?: boolean): Promise<number>;
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
 */
export declare function fasterCameraMode(track: MediaStreamTrack): Promise<void>;
/** A shared screen in a group call: up to 10 Mbit/s at 30 frames, the library's own is 1080p at 15 and 2.5. */
export declare const SCREEN_ENCODING: {
    maxBitrate: number;
    maxFramerate: number;
    priority: "medium";
};
/**
 * A shared screen's track is marked motion, and its sender keeps its resolution when it must give: smooth wherever the
 * upload and the CPU allow, and sharp where they don't. Marked detail, as it was, Chrome encodes it in its
 * screen-content mode, which spends few bits and drops frames for them: a 1440p screen of moving pictures in H.264 from
 * VideoToolbox went out at 10 frames a second on 3.9 of the 10 Mbit/s it may take, at an average quantizer of 43;
 * marked motion, 24-26 frames at 42, and text as sharp as before (16 in H.264, 2 in VP8 where detail gave 15), on more
 * bits (the mesh lab's TestScreenShareBusyMatrix, 2026-10-18; a Windows PC's share in H.264 from its AMD encoder went
 * out at 15 frames or fewer): smooth without losing details.
 */
export declare const SCREEN_CONTENT_HINT = "motion";
export declare const SCREEN_DEGRADATION: "maintain-resolution";
export interface ScreenPublish {
    codec: CameraCodec;
    /** Half the screen's size at 15 frames, for a viewer that can't take it whole: in H.264 and H.265 only. */
    layer: CallLayer | null;
    /** Whether it goes out in two pictures (the layer's); false is to be passed too, or livekit-client adds a second. */
    simulcast: boolean;
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
 * framerate seems to be bad"). In VP9 or AV1 the library publishes a share as one spatial layer (L1T3), since Chrome
 * drops an SVC share with more to its smallest picture. Smaller screens go out whole.
 */
export declare function screenPublish(width: number, height: number, codec?: CameraCodec): ScreenPublish;
/**
 * The pixel density a receiver asks layers by (adaptive stream): the screen's, at most 1.5. At 2 or 3 (a Retina
 * screen, a phone) a tile asked for twice its size or more, the larger layer for every tile in a grid.
 */
export declare function roomPixelDensity(devicePixelRatio: number | undefined): number;
