// The package itself by its name, never by a path: Easy Stream's WordPress build swaps this
// one specifier for the page's window.wordplusRealtimeClient (its scripts/esbuild-wordplus-realtime.mjs), so a page
// keeps one connector, the newest copy on the site; an app's bundler resolves it to the same package it imports.
import { realtime } from "../index.js";
import { CHECK_PATH, INGEST_IDENTITY, JOIN_PATH, LIVE_PATH, REACTION_EMOJI } from "./protocol.js";
import { avatarIn, issuerOf } from "./grant.js";
import { pageMedia } from "./media.js";
import { chosenLayer, layersOf, PlaybackMonitor } from "./playback.js";
import { TROUBLE_WINDOW_MS, ViewerHold, VIEWER_HOLDS_MS } from "./hold.js";
import { StreamTrace } from "./trace.js";
import { SendingReader } from "./sending.js";
import { backupFor, CHROMIUM_H264_ENCODE, cameraCodecFor, cameraRules, fitCameraTrack, hardwareFromCaps, roomCallChoice, screenCodecFor, screenPublish, SCREEN_CONTENT_HINT, SCREEN_DEGRADATION } from "../calls/room-publish.js";
import { checkedCameraChoice, meshCameraReport, reportMeshCamera } from "../calls/camera-check.js";
import { probeCodecCaps } from "../calls/codecs.js";
import { watchCameraEncoder } from "../calls/encoder-watch.js";
import { roomPolicy, roomSettings } from "../calls/room-settings.js";
// A stream's picture goes out in sizes in every codec, for small players and slow connections, as the industry's
// defaults have it: H.264 and VP8 in simulcast, VP9 as SVC, since one size can't suit a stream many people watch.
// Its screen in H.264 from every device, its hardware encoder's or the
// browser's own in software, and VP8 only from a browser that sends no H.264 (Firefox): never VP9, which Chrome sends a
// screen in one size only, and which in several held a scrolled page to 7-10 frames a second at its coarsest, whatever
// the bitrate, with no media server between (2026-10-24, on a Mac).
const STREAM_SCREEN_POLICY = { screen: ['h264', 'vp8'] };
// A stream's camera, in the order its check measures it ("testing the performance of H264, if that is fine we keeping it
// for best compatibility across viewers devices, if that is not fine we testing VP9 then, and if VP9 not fine,
// switching to VP8"): H.264 in hardware or software, VP9 as three sizes in one stream, VP8 last and never measured.
const STREAM_CAMERA_ORDER = ['h264', 'vp9', 'vp8'];
// The node's codec policy for a stream's camera check (checkCamera()): its switches and numbers as they are, and the
// machines its camera rules name (by default Windows and Linux), each taking the stream's order in place of its own.
// Null with no policy: nothing is checked.
export function streamCameraPolicy(policy) {
    if (!policy)
        return null;
    return { ...policy, rules: cameraRules(policy).map((rule) => ({ ...rule, camera: [...STREAM_CAMERA_ORDER] })) };
}
const PROBES = { h264: 'video/H264;profile-level-id=42e01f;packetization-mode=1', h265: 'video/H265' };
export async function cameraCodec(nav = globalThis.navigator, options = {}) {
    const agent = nav?.userAgent ?? '';
    if (/firefox\/|fxios\//i.test(agent))
        return 'vp8';
    const probe = nav?.mediaCapabilities;
    const hardware = async (contentType) => {
        if (!probe || typeof probe.encodingInfo !== 'function')
            return false;
        try {
            const info = await probe.encodingInfo({ type: 'webrtc', video: { contentType, width: 1280, height: 720, framerate: 30, bitrate: 1800000 } });
            return info.supported && !!info.powerEfficient;
        }
        catch (e) {
            return false;
        }
    };
    // WebKit encodes H.264 in hardware whatever its probe says (cameraCodecFor), so isn't asked of it. On the mesh,
    // which takes a desktop Chrome's Baseline, Chromium is asked of that too (CHROMIUM_H264_ENCODE): it encodes the
    // Constrained Baseline PROBES asks of in OpenH264.
    const webkit = /iphone|ipad|ipod/i.test(agent) || /^((?!chrome|chromium|crios|edg|opr|android|firefox|fxios).)*safari/i.test(agent);
    const [h264, h265, h264Baseline] = await Promise.all([
        webkit ? true : hardware(PROBES.h264),
        options.h265 ? hardware(PROBES.h265) : false,
        options.h265 && !webkit ? hardware(CHROMIUM_H264_ENCODE) : false
    ]);
    return cameraCodecFor(agent, { h264, h265, h264Baseline }, { h265: options.h265 });
}
// On a socket of several streams (openChat): the key every tab of the browser shares it by, the socket's own
// events, which say nothing of whom they are for, and how soon a watch that failed is tried again.
const CHAT_SHARE = 'estream';
const SOCKET_EVENTS = ['connect', 'disconnect', 'connect_error'];
const WATCH_AGAIN_MS = 3000;
// A viewer away from a live stream (setAway) asks the site's live list this often, as often as the cloud counts, and
// looks this often whether the page, out of sight, is seen again.
const LIST_EVERY_MS = 30000;
const LIST_HIDDEN_MS = 5000;
const AWAY_AFTER_MS = 2000;
// A channel of the page's connector 2.3.0 or later, which keeps a farewell; the page may have an older copy's.
const hasFarewell = (chat) => typeof chat.farewell === 'function';
// A shared screen: no bigger than the quality sent, at 30 frames a second, so a video or a demo on it plays
// smoothly (the RTC client's default is 15), with its sound, a tab's video or music. That sound as it plays, with none
// of a microphone's processing, which takes music for noise and echo, and without what this page plays itself, such
// as a guest's voice, which would go out twice (restrictOwnAudio, Chromium's). Not this tab, the studio, which would
// show itself over and over.
function screenCapture(quality) {
    return {
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true },
        selfBrowserSurface: 'exclude',
        resolution: quality === '1080p' ? { width: 1920, height: 1080, frameRate: 30 } : { width: 1280, height: 720, frameRate: 30 }
    };
}
// How a shared screen goes out, marked motion as a group call's is (SCREEN_CONTENT_HINT, set as it is shared) and
// keeping its size when short of bandwidth or CPU (SCREEN_DEGRADATION), so smooth where it can be and sharp where it
// can't: in its codec (chosenCodecs(), STREAM_SCREEN_POLICY: H.264 from every device, VP8 from a browser without it), from
// 1280 by 640 in three pictures for viewers' different screens and connections, as the camera's sizes go
// (screenLayers()). VP8 too, which a group call sends whole (screenPublish), as Chrome encodes VP8 simulcast of a moving
// screen at a few frames a second: a stream's viewers need the sizes more. A screen in VP9 or AV1 (only by the
// embedder's cameraCodec) goes in its one layer. Its sound goes in stereo at 128 kbps, where a microphone's speech goes
// mono at 48.
function screenPublishing(lk, track, quality, codec) {
    const top = quality === '1080p' ? 3000000 : 2000000;
    let settings = {};
    try {
        settings = track.mediaStreamTrack.getSettings();
    }
    catch (e) {
        // A track that says nothing of its size goes whole.
    }
    const sized = codec === 'h264' || codec === 'h265' || codec === 'vp8';
    const layers = sized ? screenLayers(settings.width ?? 0, settings.height ?? 0, quality) : [];
    const { scalabilityMode } = screenPublish(settings.width ?? 0, settings.height ?? 0, codec);
    return {
        videoCodec: codec,
        screenShareEncoding: { maxBitrate: top, maxFramerate: 30 },
        degradationPreference: SCREEN_DEGRADATION,
        audioPreset: { maxBitrate: 128000 },
        forceStereo: true,
        ...(scalabilityMode ? { scalabilityMode } : {}),
        ...(layers.length > 0
            ? { simulcast: true, screenShareSimulcastLayers: layers.map((l) => new lk.VideoPreset(l.width, l.height, l.bitrate, l.fps)) }
            : { simulcast: false })
    };
}
// The two pictures under a shared screen's whole one, smallest first, in its shape: 360 lines at 15 frames for a
// phone or a slow connection, and at 30 frames one of 720 lines under a 1080p stream's screen (540 under a 720p
// stream's) for a player of a laptop's size, as the camera's middle layer goes. A screen of fewer than 640 lines goes
// whole only. Before, a screen had one picture half its size under it, and a viewer whose connection could not carry
// the whole one dropped straight to half.
export function screenLayers(width, height, quality) {
    if (width <= 0 || height < 640)
        return [];
    const middle = quality === '1080p' && height > 720 ? 720 : 540;
    const sized = (lines) => Math.round(lines * width / height / 2) * 2;
    return [
        { width: sized(360), height: 360, bitrate: 400000, fps: 15 },
        { width: sized(middle), height: middle, bitrate: middle === 720 ? 1500000 : 1000000, fps: 30 }
    ];
}
// Whether this browser can share a screen: no phone's browser can (no getDisplayMedia).
export function canShareScreen(nav = globalThis.navigator) {
    return typeof nav?.mediaDevices?.getDisplayMedia === 'function';
}
// Whether this browser is a phone's or a tablet's, as its user agent says, or an iPad's, which says it is a Mac's but
// has a touch screen.
export function handheld(nav = globalThis.navigator) {
    const agent = String(nav?.userAgent ?? '');
    return /Android|iPhone|iPad|iPod|Mobile/i.test(agent) || (/Macintosh/.test(agent) && Number(nav?.maxTouchPoints) > 1);
}
const CHAT_KEPT = 200;
const REACTIONS_SHOWN = 40;
const REACTION_LIFE_MS = 4000;
// A media token lives 6 hours; one older than this is renewed before a connect.
const SEAT_FRESH_MS = 5 * 3600 * 1000;
// A full mesh adds a node within minutes, so a viewer waits that long for a place.
const MESH_JOIN_BUDGET_MS = 5 * 60 * 1000;
// When a stream goes live, viewers spread their connects over this much time.
const LIVE_JITTER_MS = 2000;
// A viewer whose video could not be reached tries again after this, twice as long each time, up to the
// most (plus the jitter, so a crowd doesn't come back at once).
const MEDIA_RETRY_MS = 2000;
const MEDIA_RETRY_MAX_MS = 60000;
// A viewer of a full stream tries for a place this often, and one still connecting this long into a full stream is
// told it waits for a place.
const FULL_RETRY_MS = 10000;
const FULL_AFTER_MS = 4000;
// A viewer refused while the site's streams take no new viewers (`no_hours`: its account's credits
// spent) asks again this often (plus the jitter), so a page left open comes in once credits are bought.
const NO_HOURS_RETRY_MS = 60000;
// The join's refusals of a site whose streams the cloud doesn't take: no key yet (the site's own word), a licence it
// doesn't know or take, and a plan without streaming. A host's page (options.offlineHost) is `unconnected` after them.
const UNCONNECTED = new Set(['not_configured', 'not_licensed', 'not_included']);
// How often a host's page asks what the site has left (the check), so the studio says when new viewers can't join.
const USAGE_EVERY_MS = 120000;
// A viewer's picture that stopped coming is taken up again by joining the room afresh, as closing the stream and
// opening it again does (rejoinStalled): one still reconnecting this long after it began (the RTC client's own tries
// are quicker), and one whose page came back into sight (a phone drops a hidden page's connections, and the RTC client
// paused its picture meanwhile) and is still reconnecting, or gets nothing over FLOW_SAMPLE_MS, FLOW_CHECK_MS after,
// the time the RTC client takes to ask for its picture again. Also looked at after a reconnect.
const RECONNECT_GIVE_UP_MS = 15000;
const FLOW_CHECK_MS = 3000;
const FLOW_SAMPLE_MS = 3000;
// A picture while its page is hidden (another tab in front, the window minimized), from HIDDEN_AFTER_MS after, as the
// RTC client takes a page as hidden (its BACKGROUND_REACTION_DELAY): its smallest layer, not paused. Paused, as the RTC
// client pauses a hidden page's pictures (adaptive stream's pauseVideoInBackground), a picture came back with the next
// key frame the media server asked its sender for, which for a shared screen it asks at most every 3 s (WordPlus Mesh's
// screen_key_frame_request_delay): with other viewers coming and going, 3.1-3.3 s of a still picture after coming back,
// 1.1 s alone (2026-10-23: a viewer back from another tab waited about 3 s for the stream to play again). Kept at its
// smallest layer, it moves at once and sharpens with the next key frame. Paused as before on phones, in huge streams
// and when the host sends no small layer: on a phone or tablet (handheld()), where the sender's smallest layer is more
// than HIDDEN_LOW_SIDE pixels on its short side or of a size it doesn't say (an encoder over WHIP), and wherever the
// cloud says to pause them: from as many viewers as the number it sets (the server's to change, without a reload, 50 to
// begin with), told in the hello and as `hidden` once that changes, and by a cloud that says nothing (before
// 2026-10-23).
const HIDDEN_AFTER_MS = 5000;
const HIDDEN_LOW_SIDE = 360;
// How long a browser holds what arrives before playing it (RTCRtpReceiver.jitterBufferTarget). Left to itself it holds
// about a frame, 13 ms on a desktop Chrome: a packet the host's upload lost comes back a round trip later, and its frame
// then plays late, a jolt each time (seen at about 1% lost on the way to Frankfurt, on stock LiveKit as on the mesh).
// On stage, where people talk to each other, 150 ms covers a 50 ms round trip
// (WordPlus Mesh's TestJitterBufferUnderLoss: 1% lost over a 50 ms round trip played 50 ± 21 ms between frames, 50 ± 6
// at 150 ms). A viewer holds a second to begin with, which a live stream can spare: each lost packet then has time for
// several tries, not one. A viewer in Ukraine of a stream through Canada's node (140 ms away, about 7% lost on the way
// down at 2.5 Mbit/s, the host's upload clean) dropped 73 and 112 frames and froze 5-6 times in 30 s at 300 ms, and
// dropped none and never froze at 1000, decoding 29 frames a second of 29. A viewer whose picture keeps freezing while
// packets go missing holds longer, two seconds, then three, and comes back down once it plays smoothly (hold.ts).
const STAGE_JITTER_BUFFER_MS = 150;
// A line of how the stream played goes to the trace this often while watching, when anything went wrong meanwhile:
// freezes, stops, 1% or more lost, a hold above the first.
const TRACE_SUMMARY_MS = 5 * 60000;
const TRACE_LOSS_PCT = 1;
// OBS's key frames counted over this long (keyframeSeconds()): OBS makes one at its interval alone, never when a
// viewer asks, so a viewer coming in, back to the page from another, or to another size of the picture waits for the
// next. OBS's Keyframe Interval left at 0 (auto, and Simple output mode has no other) gave one every 8.2 s at 30 fps.
const KEYFRAME_WINDOW_MS = 30000;
// A picture's pixel density while a viewer chose its quality: a player of any size then reckons more pixels than the
// largest layer has (a 160-pixel thumbnail, 1,600), so the cap alone decides (capQuality).
const CHOSEN_DENSITY = 10;
// A viewer's picture too much for their connection (playback.ts, TOO_SLOW_MS) is turned off, so the sound has the
// connection to itself, and tried again after TOO_SLOW_RETRY_MS, twice as long after each try that fails as well, up to
// TOO_SLOW_RETRY_MAX_MS. A try that plays TOO_SLOW_KEPT_MS starts the waits over. The media server's own way keeps
// sending the picture's smallest layer while the connection cannot carry it, for its feedback: on 780 kbit/s down, a
// layer of 2,250 kbit/s was sent 27 s with 20-45% of the sound made up, and tried again 14 s after with the same. The
// first try comes soon, for a connection that was bad only for a while; each try that fails costs a few seconds of sound.
const TOO_SLOW_RETRY_MS = 10000;
const TOO_SLOW_RETRY_MAX_MS = 160000;
const TOO_SLOW_KEPT_MS = 30000;
// A person's sound is held as long as their picture, less SYNC_SLACK_MS, looked at every SYNC_TICK_MS. The media
// server's playout delay holds pictures only: a stream's room asks 300 ms, which WordPlus Mesh (1.0.7) raises to three
// round trips of a path that repairs, up to 2 s, while sound plays at the client's own hold. On stage that put sound
// 150 ms and more before the lips; in a Better Messages call through Canada's node the picture was held ~370 ms and
// the sound 131 (2026-10-12), sound ~170 ms early, where ITU-R BT.1359 takes 45 ms as noticeable and 90 as the most
// acceptable. Chromium shows a picture 56-73 ms before its sound when neither is held (WordPlus Mesh's TestLipSync),
// so 100 ms less keeps them within what's noticed while sound waits no longer than it must. Never under the client's
// own hold, at most jitterBufferTarget's 4 s; a change under SYNC_STEP_MS isn't made, so sound isn't stretched for
// nothing.
const SYNC_TICK_MS = 2000;
const SYNC_SLACK_MS = 100;
const SYNC_STEP_MS = 20;
const SYNC_MAX_MS = 4000;
const initialState = {
    status: 'joining',
    error: null,
    stream: null,
    you: null,
    chatConnected: false,
    viewers: 0,
    audience: null,
    usage: null,
    slow: 0,
    chat: [],
    hands: [],
    handRaised: false,
    invited: false,
    onStage: false,
    media: 'off',
    waitUntil: null,
    tiles: [],
    audioBlocked: false,
    devices: { camera: false, microphone: false },
    originalSound: false,
    screenSharing: false,
    canShareScreen: false,
    reactions: [],
    encoder: null,
    quality: 'auto',
    sendQuality: '720p',
    topQuality: '720p',
    connection: 'unknown',
    tally: { peak: 0, messages: 0, reactions: 0 },
    facing: 'user',
    pinned: null,
    layout: { mode: 'grid', identity: null },
    timeoutUntil: null,
    reactionsOn: true,
    mutedByHost: null,
    elsewhere: false,
    sentHere: false,
    stalled: false,
    tooSlow: false,
    offline: false
};
// When a stream's state was set: going live sets started_at and clears ended_at, ending sets ended_at,
// so of two states of one stream the later has the larger (an ended stream may go live again).
const stateTime = (s) => Math.max(s.started_at ?? 0, s.ended_at ?? 0);
// Chat ids are Redis stream ids, "<ms>-<seq>".
function compareChatIds(a, b) {
    const [am = 0, as = 0] = a.split('-').map(Number);
    const [bm = 0, bs = 0] = b.split('-').map(Number);
    return am !== bm ? am - bm : as - bs;
}
const GRID = { mode: 'grid', identity: null };
// A layout as the cloud sends it, or the grid for anything else.
function cleanLayout(layout) {
    const l = layout;
    if (!l || (l.mode !== 'grid' && l.mode !== 'speaker' && l.mode !== 'spotlight'))
        return GRID;
    const corner = cleanCorner(l.corner);
    return { mode: l.mode, identity: l.mode === 'spotlight' && typeof l.identity === 'string' ? l.identity : null, ...(corner ? { corner } : {}) };
}
// Where the sharer's camera sits over a screen (Layout's `corner`): each share from 0 to 1, or none.
function cleanCorner(corner) {
    const c = corner;
    const share = (n) => typeof n === 'number' && n >= 0 && n <= 1;
    return c && share(c.x) && share(c.y) ? { x: c.x, y: c.y } : null;
}
// A layout as the host sends it: the identity only with the spotlight, the corner where there is one.
const layoutAsked = (mode, identity, corner) => ({
    mode, ...(mode === 'spotlight' ? { identity } : {}), ...(corner ? { corner } : {})
});
// What a hello says beyond the stream, the chat and the hands; a cloud that predates them says none of it.
function helloExtras(hello) {
    return {
        pinned: hello.pinned ?? null,
        layout: cleanLayout(hello.layout),
        timeoutUntil: typeof hello.timeout === 'number' && hello.timeout > Date.now() ? hello.timeout : null,
        reactionsOn: hello.reactions !== false
    };
}
// The stream's peak since it went live, as the cloud keeps it, at least those watching now: the same on every page, one
// opened or reloaded during the stream too. A cloud before it says none, and the page then keeps the most it has seen
// itself.
function peakOf(cloud, watching, seen) {
    return typeof cloud === 'number' ? Math.max(cloud, watching) : Math.max(seen, watching);
}
// A length in ms as the trace says it: "1.6 s".
const secondsOf = (ms) => ((Number(ms) || 0) / 1000).toFixed(1) + ' s';
function healthOf(quality) {
    switch (String(quality)) {
        case 'excellent':
        case 'good':
            return 'good';
        case 'poor':
            return 'poor';
        case 'lost':
            return 'lost';
        default:
            return 'unknown';
    }
}
// The person a place in the room is of. A user has a place in each tab, their identity and 8 hex characters (the
// cloud's mediaIdentity()); a visitor's, a guest's on stage and an encoder's are the identity itself.
export function personOf(identity) {
    return /^u:.+\.[0-9a-f]{8}$/.test(identity) ? identity.slice(0, identity.lastIndexOf('.')) : identity;
}
function roleOf(participant) {
    try {
        const meta = JSON.parse(participant.metadata || '{}');
        if (meta.role === 'host' || meta.role === 'guest')
            return meta.role;
    }
    catch (e) {
    }
    return 'viewer';
}
// The avatar the cloud put in a person's place in the room, from their grant.
function avatarOf(participant) {
    try {
        const avatar = JSON.parse(participant.metadata || '{}').avatar;
        return typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : null;
    }
    catch (e) {
        return null;
    }
}
export class EasyStreamClient {
    constructor(options) {
        this.options = options;
        this.state = initialState;
        this.listeners = new Set();
        // @wordplus/rtc-client once fetched (media()), and its fetch while under way.
        this.lk = null;
        this.lkLoading = null;
        this.mediaRetries = 0;
        this.joined = null;
        this.joinedAt = 0;
        // The chat's channel on the shared connection, whose socket a move replaces.
        this.chat = null;
        // A socket of several streams (openChat), unless a node refused one (`single`); the stream's watch on it,
        // and the round of watching, which a disconnect or a move ends, so a late answer is left be.
        this.multi = false;
        this.single = false;
        this.watching = null;
        this.watchRound = 0;
        this.room = null;
        // The room while its connect is under way: @wordplus/rtc-client says a failed join is a disconnect before the connect
        // fails, which is the connect's to answer (connectMedia).
        this.joining = null;
        // The join of the room under way, which whatever needs the room meanwhile waits for (connectMedia).
        this.connectingMedia = null;
        this.localTracks = [];
        // OBS's key asked for, found sending into the room (findEncoder()).
        this.findingEncoder = false;
        // A shared screen's picture and its sound, while shared (setScreenShare()).
        this.screenTracks = [];
        // The camera and microphone chosen (useDevice), for every track opened after.
        this.deviceIds = {};
        // The quality the host chose (setSendQuality), sent where the plan allows it: Full HD until they choose.
        this.wantedQuality = '1080p';
        this.watchTimer = null;
        this.reactionTimer = null;
        this.reactionSeq = 0;
        this.stopped = false;
        // Away from the stream (setAway): what the page asked, and whether the watch has gone for it; `recheck` while the
        // stream, no longer in the site's live list, is watched again to learn how it is.
        this.awayWanted = false;
        this.away = false;
        this.recheck = false;
        this.listTimer = null;
        this.awayTimer = null;
        // The site that signed the grant, whose live list an away viewer asks.
        this.site = '';
        // This person's avatar, as the grant says, for their own preview before they are in the room.
        this.avatar = null;
        // A stopped picture taken up again (rejoinStalled): when it is looked at next, and the page's listener for coming
        // back into sight.
        this.stallTimer = null;
        this.onSight = null;
        // The page hidden for HIDDEN_AFTER_MS, its pictures that keep coming at their smallest layer (capQuality): whether
        // it is, the wait for it, and whether the cloud says to keep them (the hello's `hidden`, and the event).
        this.hidden = false;
        this.hiddenTimer = null;
        this.hiddenKept = false;
        this.handheld = handheld();
        // A picture turned off as too much for the connection: its next try, the tries that failed in a row, and the wait
        // after a try that tells it played (TOO_SLOW_KEPT_MS).
        this.slowTimer = null;
        this.slowTries = 0;
        this.slowKept = null;
        // Sound follows picture (soundFollowsPicture): its look every SYNC_TICK_MS, whether one is running, and each
        // picture's hold as last read from its receiver's totals.
        this.syncTimer = null;
        // A viewer refused for want of credits, joining again (join); a host's page asking what the site has left.
        this.joinTimer = null;
        this.usageTimer = null;
        this.syncing = false;
        this.pictureHolds = new WeakMap();
        // How the stream plays here (playbackStats()), and the pixel density adaptive stream sizes pictures by in the room
        // joined, which a viewer's chosen quality raises (capQuality).
        this.playback = new PlaybackMonitor((stalled) => this.set({ stalled }));
        // A viewer's hold on arrivals, by how its connection carries the stream (hold.ts), and this player's account of how
        // the stream plays, to the cloud (trace.ts), with what its next summary line counts (TRACE_SUMMARY_MS).
        this.viewerHold = new ViewerHold();
        this.trace = new StreamTrace((lines) => this.send('trace', { lines }));
        this.played = { since: 0, freezes: 0, frozenMs: 0, lost: 0, got: 0, stalls: 0, stalledMs: 0, height: 0 };
        // What a host sends, in detail (sendingDetail()).
        this.sending = new SendingReader();
        this.pixelDensity = 1;
        this.screenDensity = 1;
        // The page's listener for the browser going offline and online (followNetwork).
        this.onNetwork = null;
        // For React's useSyncExternalStore.
        this.getState = () => this.state;
        this.subscribe = (listener) => {
            this.listeners.add(listener);
            return () => { this.listeners.delete(listener); };
        };
        this.lastDecoded = null;
        // OBS's key frames decoded here, for keyframeSeconds(): the track they came on, the count at the last look, and
        // the looks it had grown at, the last KEYFRAME_WINDOW_MS of them.
        this.keyframes = null;
        // This browser's codecs for a camera and a screen, asked once the room is joined (pickCodecs()): the camera's
        // measured as it goes live where the node checks cameras (checkCamera()), else as a group call's was before its
        // check, the first of the media server's policy this browser sends (the mesh's, rtc-client's meshCodecPolicy), by
        // default H.264 where this device encodes it in hardware and VP8 otherwise; VP8 behind any codec but VP8 for a
        // viewer that decodes none of it. The screen's in H.264 (STREAM_SCREEN_POLICY). Asked again for a camera opened
        // after it.
        this.codecChoice = null;
        // The camera sent, watched for a hardware encoder dropping its frames (calls/encoder-watch.ts): once seen, this
        // browser remembers it, and its next camera goes out in software. The watch follows the track's sender (a full
        // reconnect publishes it on a new one) and ends with the next camera's, or some minutes after this one's.
        this.cameraWatch = null;
        this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
        this.realtime = options.realtime ?? realtime;
        this.random = options.random ?? Math.random;
        this.video = options.video ?? true;
        this.state = { ...this.state, canShareScreen: Boolean(options.createLocalScreenTracks) || canShareScreen() };
        this.playback.onTooSlow = () => this.pictureTooSlow();
        this.playback.onLook = (look) => this.looked(look);
        this.playback.onNote = (event) => this.traceEvent(event);
    }
    // Something on the page shows the picture now (a player added beside a chat): video comes as it would have.
    wantVideo() {
        if (this.video)
            return;
        this.video = true;
        if (this.state.stream && this.state.status === 'ready')
            this.onStreamState(this.state.stream, false);
    }
    // Nothing on the page shows the picture any more (the stream closed beside a Better Messages conversation): the
    // video stops coming, and a host's preview goes. What this window sends live, or a guest's on stage, goes on.
    dropVideo() {
        if (!this.video || this.state.sentHere || this.state.onStage)
            return;
        this.video = false;
        this.disconnectMedia();
        this.stopLocalTracks();
    }
    // @wordplus/rtc-client, fetched on first need and kept. A failed fetch is tried again the next time.
    media() {
        if (this.lk)
            return Promise.resolve(this.lk);
        if (!this.lkLoading) {
            this.lkLoading = (this.options.media ?? pageMedia)().then((lk) => (this.lk = lk), (e) => {
                this.lkLoading = null;
                throw e;
            });
        }
        return this.lkLoading;
    }
    set(patch) {
        if (this.stopped)
            return;
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners)
            listener();
    }
    // Joins, again too once stopped: someone a moderator put out comes back this way.
    async start() {
        this.stopped = false;
        this.followSight();
        this.followNetwork();
        await this.join();
    }
    // Leaves everything: media, devices and the chat socket.
    stop() {
        if (!this.stopped)
            this.summarize(true);
        this.trace.stop();
        this.disconnectMedia();
        this.stopLocalTracks();
        this.stopScreenTracks();
        this.closeChat();
        this.stopList();
        if (this.awayTimer)
            clearTimeout(this.awayTimer);
        this.awayTimer = null;
        this.away = false;
        this.recheck = false;
        if (this.watchTimer)
            clearTimeout(this.watchTimer);
        if (this.reactionTimer)
            clearInterval(this.reactionTimer);
        if (this.joinTimer)
            clearTimeout(this.joinTimer);
        if (this.usageTimer)
            clearInterval(this.usageTimer);
        this.joinTimer = this.usageTimer = null;
        if (this.onSight)
            globalThis.document?.removeEventListener('visibilitychange', this.onSight);
        this.onSight = null;
        this.unhide();
        if (this.onNetwork) {
            globalThis.removeEventListener?.('online', this.onNetwork);
            globalThis.removeEventListener?.('offline', this.onNetwork);
        }
        this.onNetwork = null;
        this.forgetSlow();
        this.stopped = true;
    }
    // How the stream plays in this browser, to debug it (playback.ts): what arrives and how, and the session so far.
    playbackStats() {
        return this.playback.snapshot();
    }
    // What this window sends, in detail, to debug it (sending.ts): each picture layer by layer, the sound, and the way
    // out. Null while it sends nothing. Rates come from two reads, so the first read's are 0.
    async sendingDetail() {
        const room = this.room;
        return room ? this.sending.read(room) : null;
    }
    // The layers the sender of a picture that arrives sends, the best first: what a viewer may choose from (setQuality).
    // None for a picture of this window's own, or one not arriving.
    pictureLayers(track) {
        if (!track)
            return [];
        for (const participant of this.room?.remoteParticipants.values() ?? []) {
            for (const publication of participant.trackPublications.values()) {
                if (publication.track === track)
                    return layersOf(publication);
            }
        }
        return [];
    }
    // Away from the stream: nothing on the page shows it (a Better Messages conversation whose stream was closed),
    // and a viewer there isn't one of those watching it. While it is live, its watch goes (so it isn't counted), and
    // the site's live list says how many watch, every LIST_EVERY_MS while the page is in sight; one no longer listed is
    // watched again, whose hello says how it is. Before and after it, and for its hosts and guests, who aren't counted,
    // the watch stays, so going live is heard at once. `false`: the page shows it again.
    setAway(away) {
        if (away === this.awayWanted)
            return;
        this.awayWanted = away;
        this.settleAway();
    }
    wantsAway() {
        return this.awayWanted && !this.recheck && !this.stopped && this.joined !== null && this.state.status === 'ready'
            && this.state.you?.role === 'viewer' && !this.state.onStage && this.state.stream?.state === 'live';
    }
    // Back at once; away after AWAY_AFTER_MS, which a page opening the stream as it goes live takes to show it.
    settleAway() {
        if (!this.wantsAway()) {
            if (this.awayTimer)
                clearTimeout(this.awayTimer);
            this.awayTimer = null;
            if (!this.away)
                return;
            this.away = false;
            this.stopList();
            this.openChat();
            return;
        }
        if (this.away || this.awayTimer)
            return;
        this.awayTimer = setTimeout(() => {
            this.awayTimer = null;
            if (this.away || !this.wantsAway())
                return;
            this.away = true;
            this.closeChat();
            // Its own watch, counted until now, goes from the count it shows.
            this.set({ chatConnected: false, viewers: Math.max(0, this.state.viewers - 1) });
            this.askListIn(LIST_EVERY_MS);
        }, AWAY_AFTER_MS);
    }
    askListIn(ms) {
        this.stopList();
        this.listTimer = setTimeout(() => void this.askList(), ms);
    }
    stopList() {
        if (this.listTimer)
            clearTimeout(this.listTimer);
        this.listTimer = null;
    }
    async askList() {
        this.listTimer = null;
        if (!this.away)
            return;
        if (typeof document !== 'undefined' && document.hidden) {
            this.askListIn(LIST_HIDDEN_MS);
            return;
        }
        let live = null;
        try {
            const response = await this.fetch(this.options.cloud.replace(/\/$/, '') + LIVE_PATH + '?site=' + encodeURIComponent(this.site), { credentials: 'omit' });
            const body = await response.json();
            if (body?.ok && Array.isArray(body.live))
                live = body.live;
        }
        catch (e) {
            // Asked again in a while.
        }
        if (!this.away)
            return;
        const listed = live?.find((s) => s.id === this.state.stream?.id);
        if (listed) {
            this.set({ viewers: Number(listed.viewers) || 0 });
        }
        else if (live) {
            // Ended, most likely: watched again until its hello.
            this.recheck = true;
            this.settleAway();
            return;
        }
        this.askListIn(LIST_EVERY_MS);
    }
    // Joining
    async grant(fresh) {
        const source = this.options.grant;
        if (typeof source === 'string') {
            if (fresh)
                throw new Error('expired');
            return source;
        }
        return source();
    }
    async requestSeats(retried = false) {
        let token;
        try {
            token = await this.grant(retried);
        }
        catch (e) {
            throw new Error(e instanceof Error && e.message ? e.message : 'no_grant');
        }
        this.site = issuerOf(token) || this.site;
        this.avatar = avatarIn(token);
        const res = await this.fetch(this.options.cloud.replace(/\/$/, '') + JOIN_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ grant: token })
        });
        let body;
        try {
            body = await res.json();
        }
        catch (e) {
            throw new Error('server');
        }
        if (body.ok)
            return body;
        // A grant fetched afresh may succeed where a stale one failed.
        if (body.error === 'expired' && !retried && typeof this.options.grant === 'function')
            return this.requestSeats(true);
        throw new Error(body.error);
    }
    async join() {
        if (this.joinTimer)
            clearTimeout(this.joinTimer);
        this.joinTimer = null;
        this.set({ status: 'joining', error: null });
        let reply;
        try {
            reply = await this.requestSeats();
        }
        catch (e) {
            const error = e.message;
            const host = this.options.offlineHost;
            if (host && UNCONNECTED.has(error)) {
                // The host here, under the page's name for them, to set up the preview: the best quality a host
                // sends, as the cloud would give it, and no chat, stage or socket, which only the cloud has.
                this.set({ status: 'unconnected', error, you: { identity: 'local', role: 'host', name: host.name, chat: 'read', mod: true, stage: false, quality: '1080p' } });
                this.set(this.sendQualities(this.wantedQuality));
                if (this.video)
                    this.media().catch(() => { });
                return;
            }
            this.set({ status: 'error', error });
            // The site's streams take no new viewers now: asked again in a while, so the page comes in once they do.
            if (error === 'no_hours' && !this.stopped) {
                this.joinTimer = setTimeout(() => { if (!this.stopped)
                    void this.join(); }, NO_HOURS_RETRY_MS + this.random() * LIVE_JITTER_MS);
            }
            return;
        }
        this.joined = reply;
        this.joinedAt = Date.now();
        this.set({ stream: reply.stream, you: reply.you, audience: reply.audience ?? null, usage: reply.usage ?? null, ...this.sendQualities(this.wantedQuality) });
        if (reply.you.role === 'host')
            this.watchUsage();
        // Video coming (onStreamState): its part fetched now, beside the chat socket, whose hello took about 0.5 s more.
        if (this.video && (reply.stream.state === 'live' || reply.you.role !== 'viewer'))
            this.media().catch(() => { });
        // A camera turned on before the join answered had no one to show it as: it shows now.
        if (this.localTracks.length > 0)
            this.refreshTiles();
        this.openChat();
    }
    // A host's page asks what the site has left every USAGE_EVERY_MS (the check, with the page's grant), so the studio
    // says when new viewers can't join, and when they can again.
    watchUsage() {
        if (this.usageTimer)
            return;
        this.usageTimer = setInterval(() => {
            if (this.stopped || typeof document !== 'undefined' && document.hidden)
                return;
            void this.askUsage();
        }, USAGE_EVERY_MS);
    }
    async askUsage() {
        try {
            const token = await this.grant(false);
            const res = await this.fetch(this.options.cloud.replace(/\/$/, '') + CHECK_PATH, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ grant: token })
            });
            const body = await res.json();
            if (body?.ok && !this.stopped)
                this.set({ usage: body.usage ?? null });
        }
        catch (e) {
            // Asked again in a while.
        }
    }
    // The quality a host sends and the best they may, from the join: the socket's hello, which replaces `you`,
    // doesn't carry it. The quality wanted is kept within the best.
    sendQualities(wanted) {
        const you = this.joined?.you ?? (this.state.status === 'unconnected' ? this.state.you : null);
        const topQuality = you?.role === 'host' && you.quality === '1080p' ? '1080p' : '720p';
        return { topQuality, sendQuality: topQuality === '1080p' ? wanted : '720p' };
    }
    // New tokens for the same person, for a socket or a room whose token ran out.
    async renewSeats() {
        try {
            this.joined = await this.requestSeats();
            this.joinedAt = Date.now();
            return true;
        }
        catch (e) {
            this.set({ error: e.message });
            return false;
        }
    }
    // The chat socket
    // The chat socket is one of two kinds:
    // - one for every stream the browser shows, where the cloud says it can (the join's `chat.multi`): every tab
    //   shares it (the connector's `share`), each watching its stream on it with a `watch`, whose reply is the
    //   hello. Its requests name the watch, and its events say whom they are for, which this tab picks out (forUs);
    // - one for this stream alone, its token in the handshake and its hello sent once it connects.
    openChat() {
        if (!this.joined)
            return;
        const chat = this.joined.chat;
        this.closeChat();
        this.multi = chat.multi === true && !this.single;
        const client = this.realtime({
            // The cloud names the realtime server (ws.wordplus.cloud), which may not be where it joined.
            server: new URL(chat.url ?? this.options.cloud).origin,
            path: chat.path,
            worker: this.options.worker
        });
        this.chat = this.multi ? client.attach({
            namespace: chat.namespace,
            share: CHAT_SHARE,
            auth: () => ({ m: 1 }),
            // A move's new socket takes over once the stream is watched there, and its hello is merged in (takeOver).
            ready: (next) => this.watchOn(next),
            moved: (reply) => this.watched(reply, true)
        }) : client.attach({
            namespace: chat.namespace,
            // The latest seats' token, at every connect in the page and at the attach in the worker: new seats
            // (renewSeats) come with a new attach.
            auth: () => ({ t: this.joined?.chat.token ?? chat.token }),
            // A move's new socket takes over once its hello has come, and that hello is merged in (takeOver).
            ready: (next) => new Promise((resolve) => next.once('hello', resolve)),
            moved: (hello) => this.takeOver(hello)
        });
        this.listen(this.chat);
    }
    // Leaves the chat. On a socket of several streams the stream's watch goes first, so the socket stays with the
    // others the browser shows: by the channel's farewell (parted), else said here.
    closeChat() {
        const chat = this.chat;
        if (!chat)
            return;
        if (this.watching && !hasFarewell(chat))
            chat.emit('unwatch', { w: this.watching.w });
        this.watching = null;
        this.watchRound++;
        chat.close();
        this.chat = null;
    }
    // The stream watched on a socket of several: the channel's socket, or a move's new one.
    watchOn(on) {
        return on.timeout(8000).emitWithAck('watch', { t: this.joined?.chat.token })
            .catch(() => ({ ok: false, error: 'timeout' }));
    }
    // At each connect of a socket of several streams.
    async watchChat() {
        const chat = this.chat;
        if (!chat)
            return;
        const round = ++this.watchRound;
        const reply = await this.watchOn(chat);
        // Answered on a socket that went since, or after a move watched the stream on its own.
        if (this.chat !== chat || round !== this.watchRound)
            return;
        this.watched(reply, false);
    }
    // A watch's answer: the stream's hello, taken in as at a connect, or merged in after a move.
    watched(reply, moved) {
        if (moved)
            this.watchRound++;
        if (!reply.ok) {
            this.watching = null;
            this.parted();
            this.watchFailed(reply.error);
            return;
        }
        this.watching = { w: reply.w, key: reply.key };
        this.parted();
        if (moved)
            this.takeOver(reply.hello);
        else
            this.greet(reply.hello);
    }
    // What the connector sends on the shared socket should this tab leave it while others stay (its farewell, since
    // 2.3.0): the stream's unwatch, however the tab goes, closed or gone, so its watch isn't counted on.
    parted() {
        const chat = this.chat;
        if (!chat || !hasFarewell(chat))
            return;
        if (this.watching)
            chat.farewell('unwatch', { w: this.watching.w });
        else
            chat.farewell();
    }
    watchFailed(error) {
        const chat = this.chat;
        if (!chat)
            return;
        if (error === 'banned') {
            this.set({ status: 'error', error: 'banned' });
            this.stop();
            return;
        }
        // A chat token that ran out: new seats, then the stream watched again on the same socket.
        if (error === 'bad_token') {
            void this.renewSeats().then((ok) => { if (ok && this.chat === chat)
                void this.watchChat(); });
            return;
        }
        // Anything else (no answer in time, a socket that was closing): again in a moment, if nothing has since.
        setTimeout(() => {
            if (this.chat === chat && chat.connected && !this.watching)
                void this.watchChat();
        }, WATCH_AGAIN_MS);
    }
    // Whether an event on a socket of several streams is for this tab: for its stream, for its moderators when
    // it is one, or for this person in it.
    forUs(to) {
        const watching = this.watching;
        if (!watching || typeof to !== 'string')
            return false;
        if (to === watching.key)
            return true;
        if (to === watching.key + '/mods')
            return this.state.you?.mod === true;
        return to === watching.key + '/' + this.state.you?.identity;
    }
    // The stream as a socket found it: its hello.
    greet(hello) {
        this.set({
            status: 'ready',
            chatConnected: true,
            stream: hello.stream,
            you: hello.you,
            viewers: hello.viewers,
            slow: hello.slow,
            chat: hello.history,
            hands: hello.hands,
            ...helloExtras(hello)
        });
        this.keepHidden(hello.hidden);
        if (this.live())
            this.count({ peak: peakOf(hello.peak, hello.viewers, this.state.tally.peak) });
        this.onStreamState(hello.stream, false);
        this.recheck = false;
        this.settleAway();
    }
    // The chat's events. The channel passes on the current socket's only: a move's new socket hears the
    // room before it takes over, and the old one after. On a socket of several streams each event says
    // last whom it is for, and only this tab's are taken.
    listen(channel) {
        const on = (event, handler) => {
            channel.on(event, (...args) => {
                if (this.chat !== channel)
                    return;
                if (this.multi && !SOCKET_EVENTS.includes(event) && !this.forUs(args.pop()))
                    return;
                handler(...args);
            });
        };
        on('hello', (hello) => this.greet(hello));
        on('connect', () => { if (this.multi)
            void this.watchChat(); });
        on('state', (stream) => {
            const wasLive = this.state.stream?.state === 'live';
            this.set({ stream });
            if (stream.state === 'live' && !wasLive)
                this.startTally();
            this.onStreamState(stream, true);
            this.settleAway();
        });
        // Once, should the same message come twice around a move.
        on('chat', (message) => {
            if (this.state.chat.some((m) => m.id === message.id))
                return;
            this.set({ chat: [...this.state.chat, message].slice(-CHAT_KEPT) });
            if (this.live())
                this.count({ messages: this.state.tally.messages + 1 });
        });
        on('chat_deleted', (p) => {
            this.set({ chat: this.state.chat.filter((m) => m.id !== p.id) });
        });
        on('reactions', (counts) => {
            this.addReactions(counts);
            const n = Object.values(counts).reduce((sum, c) => sum + (Number(c) || 0), 0);
            if (this.live())
                this.count({ reactions: this.state.tally.reactions + n });
        });
        on('hidden', (p) => this.keepHidden(p?.pictures));
        on('viewers', (p) => {
            this.set({ viewers: p.n });
            if (this.live())
                this.count({ peak: peakOf(p.peak, p.n, this.state.tally.peak) });
        });
        on('slow', (p) => this.set({ slow: p.seconds }));
        on('hands', (hands) => this.set({ hands }));
        on('invited', () => this.set({ invited: true, handRaised: false }));
        on('unstaged', () => { this.backToWatching(); });
        on('pinned', (p) => this.set({ pinned: p.message ?? null }));
        on('layout', (layout) => this.set({ layout: cleanLayout(layout) }));
        on('timeout', (p) => this.set({ timeoutUntil: Number(p.until) || null }));
        on('reacting', (p) => this.set({ reactionsOn: p.on !== false }));
        // The host muted your microphone on stage: it goes off, and the player says why.
        on('muted', () => {
            if (!this.state.onStage || !this.state.devices.microphone)
                return;
            this.set({ mutedByHost: Date.now() });
            void this.setMicrophone(false);
        });
        on('banned', () => {
            this.set({ status: 'error', error: 'banned' });
            this.stop();
        });
        // Put out by a moderator, free to come back: the player offers to join again.
        on('kicked', () => {
            this.set({ status: 'error', error: 'kicked' });
            this.stop();
        });
        // A moderator cleared the chat: its messages and the pinned one are gone for everyone.
        on('cleared', () => this.set({ chat: [], pinned: null }));
        on('disconnect', (reason) => {
            this.set({ chatConnected: false });
            if (!this.multi)
                return;
            // The stream's watch went with the socket; the next connect watches it again.
            this.watching = null;
            this.watchRound++;
            this.parted();
            // The cloud closes a socket of several streams that watched nothing for a while: one still wanted
            // connects again.
            if (reason === 'io server disconnect')
                channel.connect();
        });
        on('connect_error', (e) => {
            if (e.message !== 'bad_token')
                return;
            // A node from before sockets of several streams, met during an update of the cloud: this stream
            // goes on a socket of its own.
            if (this.multi) {
                this.single = true;
                this.openChat();
                return;
            }
            // A chat token that ran out: new seats, then a new connection.
            this.closeChat();
            void this.renewSeats().then((ok) => { if (ok && !this.away)
                this.openChat(); });
        });
    }
    // A move's new socket took over (the connector's move). Its hello is the room as it was when that socket
    // joined, and the old socket went on delivering until the switch, so the two are merged: the hello's
    // history, then any message the old socket brought after it (chat ids are Redis stream ids, in order);
    // the later of the two states of the stream (stateTime); the counts and the queue as the hello has
    // them. Nothing was missed, so there is nothing to catch up on.
    takeOver(hello) {
        const last = hello.history[hello.history.length - 1]?.id ?? null;
        const later = this.state.chat.filter((m) => last === null || compareChatIds(m.id, last) > 0);
        const before = this.state.stream;
        const stream = before && stateTime(before) > stateTime(hello.stream) ? before : hello.stream;
        this.set({
            status: 'ready',
            chatConnected: true,
            stream,
            you: hello.you,
            viewers: hello.viewers,
            slow: hello.slow,
            chat: [...hello.history, ...later].slice(-CHAT_KEPT),
            hands: hello.hands,
            ...helloExtras(hello)
        });
        this.keepHidden(hello.hidden);
        if (stream.state !== before?.state)
            this.onStreamState(stream, true);
    }
    // A request about the stream, answered; on a socket of several, it names the stream's watch.
    ack(event, payload = {}) {
        const chat = this.chat;
        if (!chat || (this.multi && !this.watching))
            return Promise.resolve({ ok: false, error: 'offline' });
        return chat.timeout(8000).emitWithAck(event, this.addressed(payload)).catch(() => ({ ok: false, error: 'timeout' }));
    }
    // One that needs no answer.
    send(event, payload) {
        if (this.multi && !this.watching)
            return;
        this.chat?.emit(event, this.addressed(payload));
    }
    addressed(payload) {
        return this.multi && this.watching ? { ...payload, w: this.watching.w } : payload;
    }
    // What a change of the stream's state means here. `changed`: it changed while we were here, as
    // opposed to how we found it.
    onStreamState(stream, changed) {
        const you = this.state.you;
        if (!you)
            return;
        if (this.video) {
            // Video is coming: everyone watches a live stream, and a host previews before going live. Fetched
            // now, while the rest of the page settles.
            if (stream.state === 'live' || you.role !== 'viewer')
                this.media().catch(() => { });
            if (stream.state === 'live' && you.role === 'viewer' && !this.state.onStage && !this.room) {
                this.watch(changed ? this.random() * LIVE_JITTER_MS : 0);
            }
            // A host who comes to a stream already live (a reload, another tab, the stream's page beside the studio)
            // sees it, OBS's picture included, and their camera goes out once they turn it on. Their place in the
            // room is this tab's own, so another window of theirs stays live. A window that was sending it before a
            // reload sends again what it sent: its camera and microphone. So does a window of theirs open as the
            // stream goes live from another one, which waited for the host's picture until a reload while only a
            // window coming to it live joined. The window going live is in the room by then.
            if (stream.state === 'live' && you.role === 'host' && !this.room) {
                void this.connectMedia('publisher').then((room) => { if (room)
                    void this.resume(); });
            }
        }
        if (stream.state === 'ended') {
            this.disconnectMedia();
            this.stopLocalTracks();
            this.stopScreenTracks();
            this.forgetSending();
            this.set({ onStage: false, invited: false, handRaised: false, screenSharing: false, sentHere: false });
        }
    }
    // What this window sends while live, kept for the tab (sessionStorage) so a reload sends it again.
    sendingKey() {
        const id = this.state.stream?.id;
        return id ? 'estream-sending:' + id : null;
    }
    rememberSending() {
        const key = this.sendingKey();
        if (!key)
            return;
        try {
            globalThis.sessionStorage?.setItem(key, JSON.stringify({ camera: this.state.devices.camera, microphone: this.state.devices.microphone }));
        }
        catch (e) {
            // Storage off: a reload then starts with everything off.
        }
    }
    forgetSending() {
        const key = this.sendingKey();
        if (!key)
            return;
        try {
            globalThis.sessionStorage?.removeItem(key);
        }
        catch (e) {
        }
    }
    // What this window sent before a reload (rememberSending()), or null.
    sentBefore() {
        const key = this.sendingKey();
        try {
            const saved = key ? globalThis.sessionStorage?.getItem(key) : null;
            return saved ? JSON.parse(saved) : null;
        }
        catch (e) {
            return null;
        }
    }
    // After a reload while live: the camera and microphone this window sent, on again and sent.
    async resume() {
        const was = this.sentBefore();
        if (!was || (!was.camera && !was.microphone) || !this.live() || this.localTracks.length > 0)
            return;
        try {
            await this.openDevices(Boolean(was.camera), Boolean(was.microphone));
        }
        catch (e) {
            // No permission any more: the host turns them on again.
            return;
        }
        await this.sendHere();
    }
    // Media
    watch(delayMs) {
        if (this.watchTimer)
            clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => {
            this.watchTimer = null;
            if (this.joined && !this.room && this.state.stream?.state === 'live')
                void this.connectMedia('viewer');
        }, delayMs);
    }
    // Joins the room, the join under way kept for whatever needs the room meanwhile (publisherRoom()).
    connectMedia(as, seat) {
        const joining = this.joinRoom(as, seat);
        this.connectingMedia = joining;
        void joining.then(() => { if (this.connectingMedia === joining)
            this.connectingMedia = null; });
        return joining;
    }
    // The room this window sends in, as the host: the one it is in, the one it is joining, or joined now (a reload, a
    // dropped connection). Null when it can't be.
    async publisherRoom() {
        const connected = this.lk?.ConnectionState.Connected;
        if (this.room && (connected === undefined || this.room.state === connected))
            return this.room;
        if (this.connectingMedia) {
            const room = await this.connectingMedia;
            if (room && room === this.room)
                return room;
        }
        if (this.state.you?.role !== 'host')
            return this.room;
        return this.connectMedia('publisher');
    }
    // Live, whatever this window has on goes out: the room joined again if need be, and every track not published yet
    // published. Answers whether it went.
    async sendHere() {
        if (!this.live() || this.state.encoder || !this.publishing())
            return false;
        const room = await this.publisherRoom();
        if (!room || !this.publishing())
            return false;
        await this.publishUnpublished(room);
        this.set({ sentHere: true });
        this.rememberSending();
        return true;
    }
    async joinRoom(as, seat) {
        if (!this.joined)
            return null;
        if (!seat) {
            if (Date.now() - this.joinedAt > SEAT_FRESH_MS && !await this.renewSeats())
                return null;
            seat = this.joined.media;
        }
        let lk;
        try {
            lk = await this.media();
        }
        catch (e) {
            this.mediaFailed(as);
            return null;
        }
        // What changed while it was fetched: the page left, or the stream ended before a viewer got in.
        if (this.stopped || (as === 'viewer' && this.state.stream?.state !== 'live'))
            return null;
        this.disconnectMedia();
        // Adaptive stream asks for the layer the player's size needs: the media server sends the smallest at least
        // as tall as the player's height times this, less 10%. A Retina screen taken as 1 got a picture half as
        // sharp as it shows; taken as 2, a small player got 720p (a 440-pixel one, 248 tall). At most 1.5: a player
        // up to about 470 pixels wide gets 360p (a phone's), a larger one 720p, and 1080p from about 950 wide.
        // A shared screen at the screen's own density, up to 2 (capQuality): its text is what is read, and at 1.5 a
        // player beside a chat, 700 to 950 pixels wide, got 720p of a 1080p screen on a Retina screen, which shows
        // 1080p sharply there. At 2 it asks for 1080p from about 710 wide, and a connection that cannot carry it
        // still gets the 720p layer below.
        const density = Math.max(1, Number(globalThis.devicePixelRatio) || 1);
        const pixelDensity = Math.min(1.5, density);
        this.pixelDensity = pixelDensity;
        this.screenDensity = Math.min(2, density);
        // Two connections, a publisher and a subscriber, as a call's (sdk-calls/group-call.ts): the mesh's mediasoup
        // engine doesn't serve one connection both ways (/rtc/v1), and its refused try, then the RTC client's check of
        // why, held every join about 0.4 s before the connection that works.
        const room = new (this.options.Room ?? lk.Room)({ adaptiveStream: { pixelDensity }, dynacast: true, singlePeerConnection: false });
        this.room = room;
        this.wireRoom(room, lk);
        this.playback.joining();
        // A viewer waiting for a place in a full stream keeps waiting while it tries.
        this.set({ media: this.state.media === 'waiting' && this.state.waitUntil === null ? 'waiting' : 'connecting', waitUntil: null });
        const options = {
            autoSubscribe: true,
            meshJoinBudgetMs: MESH_JOIN_BUDGET_MS,
            onMeshWait: (wait) => {
                if (this.room === room)
                    this.set({ media: 'waiting', waitUntil: wait.until });
            },
            ...(this.options.app ? { meshApp: this.options.app } : {})
        };
        // A viewer still connecting a few seconds in while as many watch as the stream takes is waiting for a place: the
        // room refuses them until someone leaves, and @wordplus/rtc-client tries again meanwhile, within the join's budget.
        const fullCheck = as === 'viewer' ? setTimeout(() => {
            if (this.room === room && this.state.media === 'connecting' && this.full())
                this.set({ media: 'waiting', waitUntil: null });
        }, FULL_AFTER_MS) : null;
        this.seatUrl = seat.url;
        this.joining = room;
        try {
            await room.connect(seat.url, seat.token, options);
        }
        catch (e) {
            if (this.room === room) {
                this.room = null;
                this.mediaFailed(as, true);
            }
            return null;
        }
        finally {
            if (this.joining === room)
                this.joining = null;
            if (fullCheck)
                clearTimeout(fullCheck);
        }
        if (this.room !== room) {
            await room.disconnect();
            return null;
        }
        this.mediaRetries = 0;
        this.set({ media: 'live', waitUntil: null, audioBlocked: !room.canPlaybackAudio, ...(this.state.error === 'media_unreachable' ? { error: null } : {}) });
        this.refreshTiles();
        this.followPictures(room);
        this.playback.begin(room, seat.url);
        return room;
    }
    // The video (@wordplus/rtc-client's part, or the room) could not be reached. A viewer tries again later; a
    // host or guest hears it from goLive() or acceptStage().
    // As many watching as the stream takes (`audience`, the beta's 50).
    full() {
        return this.state.audience !== null && this.state.viewers >= this.state.audience;
    }
    // A viewer the room refused while the stream is full waits for a place, trying again every few seconds: the media
    // server doesn't say why it refuses one.
    mediaFailed(as, refused = false) {
        const full = refused && as === 'viewer' && this.full();
        if (!full)
            this.playback.note('error', as === 'viewer' ? 'media_unreachable' : 'publish_failed');
        this.set(full
            ? { media: 'waiting', waitUntil: null, ...(this.state.error === 'media_unreachable' ? { error: null } : {}) }
            : { media: 'off', waitUntil: null, error: as === 'viewer' ? 'media_unreachable' : 'publish_failed' });
        if (as !== 'viewer')
            return;
        const delay = full ? FULL_RETRY_MS : Math.min(MEDIA_RETRY_MAX_MS, MEDIA_RETRY_MS * 2 ** this.mediaRetries++);
        this.watch(delay + this.random() * LIVE_JITTER_MS);
    }
    wireRoom(room, { RoomEvent, DisconnectReason }) {
        const refresh = () => { if (this.room === room)
            this.refreshTiles(); };
        for (const event of [
            RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed,
            RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished,
            RoomEvent.LocalTrackUnpublished, RoomEvent.ActiveSpeakersChanged, RoomEvent.ParticipantMetadataChanged,
            RoomEvent.ParticipantNameChanged
        ]) {
            room.on(event, refresh);
        }
        // Every picture that arrives is capped at the viewer's choice, and everything that arrives is held long enough
        // for what the host's connection lost to be sent again in time. A host's encoder picture keeps coming, and a
        // picture coming while the viewer's connection is too slow for pictures is off as well.
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (this.room !== room)
                return;
            this.capQuality(publication);
            this.holdArrivals(track);
            this.keepEncoderOn(publication, participant);
            if (this.state.tooSlow)
                this.pictureOff(publication);
            this.findEncoder(publication, participant);
        });
        // What goes out from here, for the statistics' list of what happened.
        room.on(RoomEvent.LocalTrackPublished, (publication) => {
            if (this.room === room)
                this.playback.note('published', String(publication?.source ?? ''));
        });
        room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
            if (this.room === room)
                this.playback.note('unpublished', String(publication?.source ?? ''));
        });
        room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            if (this.room === room && participant?.isLocal)
                this.set({ connection: healthOf(quality) });
        });
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            if (this.room === room)
                this.set({ audioBlocked: !room.canPlaybackAudio });
        });
        room.on(RoomEvent.Reconnecting, () => {
            if (this.room !== room)
                return;
            this.playback.note('reconnecting');
            this.set({ media: 'reconnecting' });
            this.lookAgain(RECONNECT_GIVE_UP_MS);
        });
        room.on(RoomEvent.Reconnected, () => {
            if (this.room !== room)
                return;
            this.playback.note('reconnected');
            this.set({ media: 'live' });
            this.lookAgain(FLOW_CHECK_MS);
        });
        room.on(RoomEvent.Disconnected, (reason) => {
            if (this.room !== room || this.joining === room)
                return;
            this.room = null;
            this.playback.end();
            this.playback.note('left', reason === undefined ? undefined : String(DisconnectReason[reason] ?? reason));
            // A screen still shared stays shared: it goes out again with the rest.
            this.set({ media: 'off', tiles: this.previewTiles(), screenSharing: this.screenTracks.length > 0, connection: 'unknown', elsewhere: false });
            // Dropped while the stream is still live (not closed by its end): a viewer comes back, and a host sending
            // from here joins again and sends again.
            if (reason !== DisconnectReason.ROOM_DELETED && reason !== DisconnectReason.CLIENT_INITIATED
                && this.state.stream?.state === 'live' && this.state.you?.role === 'viewer' && !this.state.onStage) {
                this.watch(1000 + this.random() * LIVE_JITTER_MS);
            }
            if (reason !== DisconnectReason.ROOM_DELETED && reason !== DisconnectReason.CLIENT_INITIATED
                && this.state.stream?.state === 'live' && this.state.you?.role === 'host' && (this.localTracks.length > 0 || this.screenTracks.length > 0)) {
                setTimeout(() => { if (!this.stopped && !this.room)
                    void this.sendHere(); }, 1000);
            }
        });
    }
    disconnectMedia() {
        if (this.watchTimer) {
            clearTimeout(this.watchTimer);
            this.watchTimer = null;
        }
        if (this.stallTimer) {
            clearTimeout(this.stallTimer);
            this.stallTimer = null;
        }
        this.stopFollowing();
        this.playback.end();
        this.forgetSlow();
        const room = this.room;
        this.room = null;
        if (room && room.state !== this.lk?.ConnectionState.Disconnected)
            void room.disconnect();
        this.set({ media: 'off', waitUntil: null, tiles: this.previewTiles(), connection: 'unknown', elsewhere: false, stalled: false, tooSlow: false });
    }
    // A viewer's picture too much for their connection (the playback monitor's onTooSlow): every picture off for them,
    // so the sound has the connection, and tried again after a wait twice as long as the last one that failed. A host
    // and a guest on stage keep theirs.
    pictureTooSlow() {
        const room = this.room;
        if (!room || this.state.tooSlow || this.state.you?.role !== 'viewer' || this.state.onStage)
            return;
        if (this.slowKept)
            clearTimeout(this.slowKept);
        this.slowKept = null;
        const wait = Math.min(TOO_SLOW_RETRY_MAX_MS, TOO_SLOW_RETRY_MS * 2 ** this.slowTries++);
        this.playback.note('picture-off', String(wait));
        this.set({ tooSlow: true });
        for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values())
                this.pictureOff(publication);
        }
        if (this.slowTimer)
            clearTimeout(this.slowTimer);
        this.slowTimer = setTimeout(() => {
            this.slowTimer = null;
            this.retryPicture();
        }, wait);
    }
    // The picture tried again on a connection that could not carry it: at once (a viewer's Try again, back online), or
    // when its wait is over. One that is too much again within TOO_SLOW_KEPT_MS waits twice as long as before.
    retryPicture() {
        if (this.slowTimer)
            clearTimeout(this.slowTimer);
        this.slowTimer = null;
        if (!this.state.tooSlow)
            return;
        this.playback.note('picture-retry');
        this.set({ tooSlow: false });
        for (const participant of this.room?.remoteParticipants.values() ?? []) {
            for (const publication of participant.trackPublications.values())
                this.pictureOn(publication);
        }
        if (this.slowKept)
            clearTimeout(this.slowKept);
        this.slowKept = setTimeout(() => {
            this.slowKept = null;
            this.slowTries = 0;
        }, TOO_SLOW_KEPT_MS);
    }
    forgetSlow() {
        if (this.slowTimer)
            clearTimeout(this.slowTimer);
        if (this.slowKept)
            clearTimeout(this.slowKept);
        this.slowTimer = this.slowKept = null;
        this.slowTries = 0;
    }
    // A picture off for this viewer: the media server sends none of it, and its last frame stays on screen.
    pictureOff(publication) {
        const remote = publication;
        if (publication.kind === this.lk?.Track.Kind.Video)
            remote.setEnabled?.(false);
    }
    // A picture on again, following its element's sight once more as adaptive stream has it: the RTC client keeps a
    // publication enabled by hand on whether or not it is on screen, so where it can, what was asked by hand is let go.
    pictureOn(publication) {
        const remote = publication;
        if (publication.kind !== this.lk?.Track.Kind.Video)
            return;
        remote.setEnabled?.(true);
        if (remote.requestedDisabled === false && typeof remote.emitTrackUpdate === 'function') {
            remote.requestedDisabled = undefined;
            remote.emitTrackUpdate();
        }
    }
    // A stopped picture, taken up again: after a minimized browser came back, the page showed reconnecting and the
    // video never played again until the viewer left and joined. A page back in sight looks whether its picture comes
    // (rejoinStalled).
    // And a hidden page's pictures at their smallest layer where they keep coming (HIDDEN_AFTER_MS), back as they were
    // once it is in sight.
    followSight() {
        const doc = globalThis.document;
        if (!doc || this.onSight)
            return;
        this.onSight = () => {
            if (doc.visibilityState === 'hidden') {
                this.hideLater();
                return;
            }
            this.unhide();
            if (this.room)
                this.lookAgain(FLOW_CHECK_MS);
        };
        doc.addEventListener('visibilitychange', this.onSight);
        // A page opened hidden, in a tab behind, is hidden from the start, as the RTC client takes it.
        if (doc.visibilityState === 'hidden')
            this.hide();
    }
    hideLater() {
        if (this.hidden || this.hiddenTimer)
            return;
        this.hiddenTimer = setTimeout(() => {
            this.hiddenTimer = null;
            this.hide();
        }, HIDDEN_AFTER_MS);
    }
    hide() {
        this.hidden = true;
        this.capAll();
    }
    // The page in sight again, or the client stopped: its pictures as they were.
    unhide() {
        if (this.hiddenTimer)
            clearTimeout(this.hiddenTimer);
        this.hiddenTimer = null;
        if (!this.hidden)
            return;
        this.hidden = false;
        this.capAll();
    }
    // The cloud's word on a hidden page's pictures, in the hello and once it changes: on a hidden page, those it keeps
    // come at their smallest layer again or are paused at once, the RTC client told (capQuality).
    keepHidden(pictures) {
        const kept = pictures === 'low';
        if (kept === this.hiddenKept)
            return;
        this.hiddenKept = kept;
        this.capAll();
    }
    // The browser offline, said at once (the RTC client takes seconds to notice), and once it is back online a viewer's
    // picture taken up again without waiting for the RTC client's next try: one still reconnecting, or with nothing
    // arriving, joins afresh (rejoinStalled), and one whose room went is watched again.
    followNetwork() {
        if (this.onNetwork || typeof globalThis.addEventListener !== 'function')
            return;
        this.onNetwork = () => {
            const offline = globalThis.navigator?.onLine === false;
            if (offline === this.state.offline)
                return;
            this.set({ offline });
            this.playback.note(offline ? 'offline' : 'online');
            if (offline)
                return;
            // A connection back may carry the picture its last one could not.
            this.retryPicture();
            if (this.room)
                this.lookAgain(FLOW_CHECK_MS);
            else if (this.state.you?.role === 'viewer' && !this.state.onStage && this.video && !this.away)
                this.watch(0);
        };
        globalThis.addEventListener('online', this.onNetwork);
        globalThis.addEventListener('offline', this.onNetwork);
        if (globalThis.navigator?.onLine === false)
            this.onNetwork();
    }
    lookAgain(delayMs) {
        if (this.stallTimer)
            clearTimeout(this.stallTimer);
        this.stallTimer = setTimeout(() => {
            this.stallTimer = null;
            void this.rejoinStalled();
        }, delayMs);
    }
    // A viewer of a live stream still reconnecting, or connected with nothing coming, joins the room afresh, as closing
    // the stream and opening it again does. A host's and a guest's rooms have their own way back (the Disconnected
    // handler, sendHere()).
    async rejoinStalled() {
        const room = this.room;
        if (!room || this.stopped || this.state.you?.role !== 'viewer' || this.state.onStage || this.state.stream?.state !== 'live')
            return;
        if (this.state.media !== 'reconnecting') {
            if (this.state.media !== 'live' || await this.arriving(room))
                return;
        }
        if (this.room !== room || this.stopped)
            return;
        this.playback.note('rejoined', this.state.media);
        this.disconnectMedia();
        this.watch(0);
    }
    // Whether anything comes from the room: the bytes of what should be coming grow over FLOW_SAMPLE_MS. With nothing
    // that should, nothing is missing.
    async arriving(room) {
        const before = await this.bytesIn(room);
        if (before === null)
            return true;
        await new Promise((resolve) => setTimeout(resolve, FLOW_SAMPLE_MS));
        if (this.room !== room)
            return true;
        const after = await this.bytesIn(room);
        return after === null || after > before;
    }
    // The bytes received on every track that should be coming: subscribed, not muted by its sender, and, for a
    // picture, not paused by the RTC client for being out of sight (adaptive stream). Null with none.
    async bytesIn(room) {
        let total = null;
        for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values()) {
                const remote = publication;
                const track = remote.track;
                if (!track?.getRTCStatsReport || remote.isMuted || remote.isSubscribed === false || remote.isEnabled === false)
                    continue;
                const report = await track.getRTCStatsReport().catch(() => undefined);
                if (!report)
                    continue;
                total ?? (total = 0);
                report.forEach((stat) => {
                    if (stat.type === 'inbound-rtp')
                        total = (total ?? 0) + (Number(stat.bytesReceived) || 0);
                });
            }
        }
        return total;
    }
    // The picture, on one track: on `auto` the best the player's size allows (adaptive stream); on a viewer's choice the
    // sender's layer of that quality, whatever the player's size. Adaptive stream asks for the smaller of the player's
    // size and the cap, so for a choice the size it reckons is made larger than any layer (the track's own pixel
    // density, CHOSEN_DENSITY), and the cap is the layer chosen. Auto gives the room's density back, and a shared
    // screen the screen's own, up to 2. While the page is hidden, a picture that keeps coming (hiddenLow()) is capped at
    // its smallest layer, and the RTC client pauses the others (HIDDEN_AFTER_MS).
    capQuality(publication) {
        const lk = this.lk;
        const remote = publication;
        if (!lk || publication.kind !== lk.Track.Kind.Video || typeof remote.setVideoQuality !== 'function')
            return;
        const choice = this.state.quality;
        const { VideoQuality } = lk;
        const layers = layersOf(publication);
        const low = this.hiddenLow(layers);
        // A choice above 720p takes the largest layer below it (chosenLayer): Full HD only on auto. Auto caps at the best
        // layer the sender sends: the RTC client sends the player's size only while it is under the cap's layer, and an
        // encoder's two layers over WHIP are low and medium, so a cap at high, a layer not sent, asked for the best
        // layer whatever the player's size.
        const layer = low && this.hidden ? layers[layers.length - 1].quality
            : choice === 'auto' ? layers[0]?.quality ?? 'high' : chosenLayer(choice, layers);
        remote.setVideoQuality(layer === 'low' ? VideoQuality.LOW : layer === 'medium' ? VideoQuality.MEDIUM : VideoQuality.HIGH);
        const track = remote.track;
        const settings = track?.adaptiveStreamSettings;
        const density = choice !== 'auto' ? CHOSEN_DENSITY : publication.source === lk.Track.Source.ScreenShare ? this.screenDensity : this.pixelDensity;
        if (!track || !settings)
            return;
        const resized = settings.pixelDensity !== density;
        // The RTC client pauses a hidden page's picture unless told not to, and looks again when told otherwise while
        // the page is hidden: the cloud saying to pause them pauses it then.
        const turned = (settings.pauseVideoInBackground ?? true) === low;
        if (!resized && !turned)
            return;
        track.adaptiveStreamSettings = { ...settings, pixelDensity: density, pauseVideoInBackground: !low };
        if (resized)
            track.updateDimensions?.();
        if (turned)
            track.updateVisibility?.();
    }
    // Whether a picture keeps coming at its smallest layer while the page is hidden (HIDDEN_AFTER_MS): while the cloud
    // says so, not on a phone or tablet, and only from a sender whose smallest layer is small and of a size it says.
    hiddenLow(layers) {
        const smallest = layers[layers.length - 1];
        return this.hiddenKept && !this.handheld
            && !!smallest && smallest.height > 0 && Math.min(smallest.width, smallest.height) <= HIDDEN_LOW_SIDE;
    }
    // A track's jitter buffer at the viewer's hold (hold.ts), STAGE_JITTER_BUFFER_MS on stage; a browser without the
    // setting keeps its own.
    holdArrivals(track) {
        const receiver = track.receiver;
        if (!receiver || !('jitterBufferTarget' in receiver))
            return;
        try {
            receiver.jitterBufferTarget = this.ownHold();
        }
        catch { }
    }
    // The encoder's picture, kept coming to a host whether or not the page shows it: the studio says what arrives from
    // OBS (its size, frame rate and bitrate, and a picture larger than the stream takes, which holds Go live back), and
    // adaptive stream pauses a picture out of sight. With the player scrolled away from the studio, the media server
    // stopped OBS's picture as it arrived, and the studio said OBS was connected with nothing of it. One picture, to
    // the host alone. Enabled by hand, the publication no longer follows its element's visibility.
    keepEncoderOn(publication, participant) {
        const remote = publication;
        if (participant?.identity !== INGEST_IDENTITY || this.state.you?.role !== 'host' || publication.kind !== this.lk?.Track.Kind.Video)
            return;
        remote.setEnabled?.(true);
    }
    // A host's window that finds OBS sending into the room, and sends nothing of its own nor sent before a reload,
    // streams from OBS too: a studio reloaded while live from OBS, or opened on a stream gone live as OBS connected,
    // showed the camera's bar, whose camera would go out over OBS's picture, and none of what arrives from OBS. The
    // key is asked as Stream from OBS asks it (useEncoder()), the same key, for the address and key the studio shows.
    findEncoder(publication, participant) {
        if (participant?.identity !== INGEST_IDENTITY || this.state.you?.role !== 'host' || publication.kind !== this.lk?.Track.Kind.Video)
            return;
        if (this.state.encoder || this.findingEncoder || this.localTracks.length > 0 || this.screenTracks.length > 0)
            return;
        const was = this.sentBefore();
        if (was?.camera || was?.microphone)
            return;
        this.findingEncoder = true;
        void this.ack('ingest').then((reply) => {
            if (reply.ok && !this.state.encoder && !this.stopped)
                this.set({ encoder: this.encoderOf(reply) });
        }).finally(() => { this.findingEncoder = false; });
    }
    // Where OBS sends, and with which key, from the cloud's answer to `ingest`.
    encoderOf({ key, path }) {
        return { url: this.options.cloud.replace(/\/$/, '') + path, key };
    }
    // A viewer off stage, whose hold follows its connection.
    watchingOnly() {
        return this.state.you?.role === 'viewer' && !this.state.onStage;
    }
    ownHold() {
        return this.watchingOnly() ? this.viewerHold.ms : STAGE_JITTER_BUFFER_MS;
    }
    // A look at how the stream plays (playback.ts): counted for the trace's next summary, and for a viewer off stage,
    // its hold on arrivals following it (hold.ts).
    looked(look) {
        this.countPlayed(look);
        if (!this.watchingOnly())
            return;
        const change = this.viewerHold.look(look);
        if (change)
            this.holdMoved(change);
    }
    // The viewer's hold moved: everything it receives held as long now (each sound then follows its picture,
    // soundFollowsPicture()), said in the statistics and the trace.
    holdMoved(change) {
        for (const participant of this.room?.remoteParticipants.values() ?? []) {
            for (const publication of participant.trackPublications.values()) {
                if (publication.track)
                    this.holdArrivals(publication.track);
            }
        }
        this.playback.note('hold', String(change.to));
        const why = change.up
            ? `froze ${change.freezes}x ${secondsOf(change.frozenMs ?? 0)} in ${TROUBLE_WINDOW_MS / 1000} s, ${change.lost} packets lost, ${change.nacks} asked again`
            : `${Math.round((change.cleanMs ?? 0) / 60000)} min without trouble`;
        this.trace.add(`hold ${change.from} -> ${change.to} ms: ${why}`);
    }
    // What happened, as a line of the trace (trace.ts). The hold's own line says why it moved (holdMoved()), and joining
    // says nothing the join doesn't.
    traceEvent(event) {
        const detail = event.detail ? ' ' + event.detail : '';
        switch (event.kind) {
            case 'joining':
            case 'hold':
                return;
            case 'joined': {
                const server = this.playback.snapshot().server;
                const node = (server?.node ?? '?') + (server?.region ? ' (' + server.region + ')' : '');
                this.trace.add(`joined${detail} as ${this.state.you?.role ?? '?'}${this.state.onStage ? ' on stage' : ''}, node ${node}, hold ${this.ownHold()} ms`);
                return;
            }
            case 'first-frame': {
                const video = this.playback.snapshot().video;
                this.trace.add(`first picture in ${secondsOf(Number(event.detail))}` + (video ? `, ${video.codec ?? '?'} ${video.height}p` : ''));
                return;
            }
            case 'stalled':
                this.trace.add('picture stopped');
                return;
            case 'resumed':
                this.trace.add(`picture back after ${secondsOf(Number(event.detail))}`);
                return;
            default:
                this.trace.add(event.kind + detail);
        }
    }
    // A look counted for the trace's summary, which goes every TRACE_SUMMARY_MS.
    countPlayed(look) {
        const p = this.played;
        if (p.since === 0) {
            const session = this.playback.snapshot().session;
            this.played = { ...p, since: look.at, stalls: session.stalls, stalledMs: session.stalledMs };
        }
        this.played.freezes += look.freezes;
        this.played.frozenMs += look.frozenMs;
        this.played.lost += look.lost;
        this.played.got += look.got;
        if (look.height > 0)
            this.played.height = look.height;
        if (look.at - this.played.since >= TRACE_SUMMARY_MS)
            this.summarize(false, look.at);
    }
    // How the stream played since the last summary, as a line of the trace when anything went wrong in it: freezes,
    // stops, TRACE_LOSS_PCT or more lost, a viewer's hold above the first. `last`: as the player stops.
    summarize(last, at = Date.now()) {
        const p = this.played;
        if (p.since === 0)
            return;
        const stats = this.playback.snapshot();
        const stalls = stats.session.stalls - p.stalls, stalledMs = stats.session.stalledMs - p.stalledMs;
        const packets = p.lost + p.got;
        const lossPct = packets > 0 ? Math.round(p.lost / packets * 1000) / 10 : 0;
        const held = this.watchingOnly() ? this.viewerHold.ms : 0;
        if (p.freezes > 0 || stalls > 0 || lossPct >= TRACE_LOSS_PCT || held > VIEWER_HOLDS_MS[0]) {
            const parts = [
                p.height > 0 ? p.height + 'p' : null,
                p.freezes > 0 ? `froze ${p.freezes}x ${secondsOf(p.frozenMs)}` : null,
                stalls > 0 ? `stopped ${stalls}x ${secondsOf(stalledMs)}` : null,
                `lost ${lossPct}% (${p.lost} of ${packets})`,
                held > 0 ? `hold ${held} ms` : null,
                stats.transport?.rttMs ? `round trip ${stats.transport.rttMs} ms` : null
            ].filter(Boolean);
            this.trace.add(`${last ? 'played until now' : 'played'} ${((at - p.since) / 60000).toFixed(1)} min: ${parts.join(', ')}`);
        }
        this.played = { since: last ? 0 : at, freezes: 0, frozenMs: 0, lost: 0, got: 0, stalls: stats.session.stalls, stalledMs: stats.session.stalledMs, height: p.height };
    }
    // Sound follows picture in this room while it is the one joined (SYNC_TICK_MS).
    followPictures(room) {
        this.stopFollowing();
        this.syncTimer = setInterval(() => {
            if (this.room !== room) {
                this.stopFollowing();
                return;
            }
            if (this.syncing)
                return;
            this.syncing = true;
            void this.soundFollowsPicture(room).finally(() => { this.syncing = false; });
        }, SYNC_TICK_MS);
    }
    stopFollowing() {
        if (this.syncTimer)
            clearInterval(this.syncTimer);
        this.syncTimer = null;
    }
    // Each person's sound held as long as the longest of their pictures, less SYNC_SLACK_MS, and never less than this
    // client's own hold: a person showing nothing, or a browser that can't tell, has their sound held as before.
    async soundFollowsPicture(room) {
        const lk = this.lk;
        if (!lk)
            return;
        const own = this.ownHold();
        for (const participant of room.remoteParticipants.values()) {
            let picture = 0;
            const sounds = [];
            for (const publication of participant.trackPublications.values()) {
                const receiver = publication.track?.receiver;
                if (!receiver || !('jitterBufferTarget' in receiver))
                    continue;
                if (publication.kind === lk.Track.Kind.Video)
                    picture = Math.max(picture, await this.pictureHold(receiver));
                else if (publication.kind === lk.Track.Kind.Audio)
                    sounds.push(receiver);
            }
            if (this.room !== room)
                return;
            const hold = Math.min(SYNC_MAX_MS, Math.max(own, Math.round(picture - SYNC_SLACK_MS)));
            for (const sound of sounds) {
                if (Math.abs((sound.jitterBufferTarget ?? 0) - hold) < SYNC_STEP_MS)
                    continue;
                try {
                    sound.jitterBufferTarget = hold;
                }
                catch { }
            }
        }
    }
    // How long a picture's frames were held since it was last looked at, in ms, from its receiver's totals (the
    // target its jitter buffer kept, which counts the media server's playout delay, over the frames it let go). The
    // first look takes the average so far; a picture that let no frame go meanwhile (paused) keeps its last; 0 unknown.
    async pictureHold(receiver) {
        const report = await receiver.getStats?.().catch(() => undefined);
        let target = 0, emitted = 0, found = false;
        report?.forEach((stat) => {
            if (stat.type !== 'inbound-rtp')
                return;
            found = true;
            target += Number(stat.jitterBufferTargetDelay) || 0;
            emitted += Number(stat.jitterBufferEmittedCount) || 0;
        });
        const last = this.pictureHolds.get(receiver);
        if (!found)
            return last?.ms ?? 0;
        const frames = emitted - (last?.emitted ?? 0);
        const ms = frames > 0 ? (target - (last?.target ?? 0)) / frames * 1000 : last?.ms ?? 0;
        this.pictureHolds.set(receiver, { target, emitted, ms });
        return ms;
    }
    // Who is on stage: everyone publishing in the room (viewers are hidden), the local person
    // included when they publish.
    refreshTiles() {
        const room = this.room;
        const lk = this.lk;
        if (!room || !lk) {
            this.set({ tiles: this.previewTiles() });
            return;
        }
        const { Track } = lk;
        const speaking = new Set(room.activeSpeakers.map((p) => p.identity));
        const tiles = [];
        const you = this.state.you;
        let elsewhere = false;
        const people = [room.localParticipant, ...room.remoteParticipants.values()];
        for (const p of people) {
            const camera = p.getTrackPublication(Track.Source.Camera);
            const screen = p.getTrackPublication(Track.Source.ScreenShare);
            const mic = p.getTrackPublication(Track.Source.Microphone);
            const screenAudio = p.getTrackPublication(Track.Source.ScreenShareAudio);
            const role = p.isLocal ? (you?.role ?? 'viewer') : roleOf(p);
            if (role === 'viewer' && !p.isLocal)
                continue;
            // One's own camera and screen as they are open here, published or not yet: going live joins the room
            // before anything is published, and the picture stays on screen throughout, the same track before and
            // after, so pressing Go live never blinks the picture.
            const own = p.isLocal && this.publishing() ? this.previewTiles()[0] : undefined;
            // In the room but not on stage: whoever sends nothing (a host streaming from OBS, or one who hasn't
            // turned anything on yet), and oneself when not publishing.
            if ((p.trackPublications.size === 0 && !own) || (p.isLocal && !this.publishing()))
                continue;
            // A host's own other window, sending: shown here as everyone sees it.
            if (!p.isLocal && role === 'host' && you?.role === 'host' && personOf(p.identity) === you.identity)
                elsewhere = true;
            // One's own voice and screen sound are never played here, from this window or another: heard back, they
            // echo, and a screen shared with the computer's sound sends them out again, so viewers hear them twice.
            const silent = p.isLocal || (!!you && personOf(p.identity) === you.identity);
            tiles.push({
                identity: p.identity,
                name: p.name || p.identity,
                avatar: avatarOf(p),
                role,
                local: p.isLocal,
                camera: camera?.track && !camera.isMuted ? camera.track : (own?.camera ?? null),
                screen: screen?.track && !screen.isMuted ? screen.track : (own?.screen ?? null),
                audio: silent ? [] : [mic?.track, screenAudio?.track].filter((t) => Boolean(t)),
                micMuted: own ? own.micMuted && (!mic || mic.isMuted) : !mic || mic.isMuted,
                speaking: speaking.has(p.identity),
                encoder: !p.isLocal && p.identity === INGEST_IDENTITY
            });
        }
        // The host first, then guests in the order they came.
        tiles.sort((a, b) => (a.role === 'host' ? 0 : 1) - (b.role === 'host' ? 0 : 1));
        this.set({ tiles, elsewhere });
    }
    publishing() {
        const role = this.state.you?.role;
        return role === 'host' || this.state.onStage;
    }
    // Before going live, the host sees their own camera; with the camera and the microphone both turned off, nothing.
    previewTiles() {
        const you = this.state.you;
        const lk = this.lk;
        if (!you || !lk || (this.localTracks.length === 0 && this.screenTracks.length === 0))
            return [];
        const camera = this.localTracks.find((t) => t.kind === lk.Track.Kind.Video && !t.isMuted) ?? null;
        const mic = this.localTracks.find((t) => t.kind === lk.Track.Kind.Audio);
        // A screen shared before going live shows as it will: the main picture, the camera beside it.
        const screen = this.screenTracks.find((t) => t.kind === lk.Track.Kind.Video) ?? null;
        if (!camera && !screen && (!mic || mic.isMuted))
            return [];
        return [{
                identity: you.identity,
                name: you.name,
                avatar: this.avatar,
                role: you.role,
                local: true,
                camera,
                screen,
                audio: [],
                micMuted: !mic || mic.isMuted,
                speaking: false,
                encoder: false
            }];
    }
    stopLocalTracks() {
        for (const track of this.localTracks)
            track.stop();
        this.localTracks = [];
        this.set({ devices: { camera: false, microphone: false }, tiles: this.room ? this.state.tiles : [] });
    }
    async openDevices(camera, microphone) {
        this.stopLocalTracks();
        if (!camera && !microphone)
            return;
        const lk = await this.media();
        this.localTracks = await this.makeTracks(lk)({
            audio: microphone ? this.microphoneOptions() : false,
            video: camera ? this.cameraOptions(lk) : false
        });
        // A new camera's codec is asked again as it goes out (checkCamera()).
        if (camera)
            this.codecChoice = null;
        this.set({ devices: { camera, microphone } });
        this.refreshTiles();
    }
    makeTracks(lk) {
        return this.options.createLocalTracks ?? lk.createLocalTracks;
    }
    // The camera's size: the quality sent.
    resolution(lk) {
        return (this.state.sendQuality === '1080p' ? lk.VideoPresets.h1080 : lk.VideoPresets.h720).resolution;
    }
    // The chosen camera, or the one facing the way chosen; a device that is gone gives way to another.
    cameraOptions(lk) {
        return this.deviceIds.camera
            ? { resolution: this.resolution(lk), deviceId: this.deviceIds.camera }
            : { resolution: this.resolution(lk), facingMode: this.state.facing };
    }
    // Tuned for speech, or as it hears (originalSound): echo cancellation takes a held note for an echo, noise
    // suppression an instrument for noise, and gain control pumps a song's quiet and loud parts, so for music none of
    // them, in two channels where the microphone has them.
    microphoneOptions() {
        const device = this.deviceIds.microphone ? { deviceId: this.deviceIds.microphone } : {};
        return this.state.originalSound
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, voiceIsolation: false, channelCount: 2, ...device }
            : { echoCancellation: true, noiseSuppression: true, ...device };
    }
    // How the microphone goes out: in original sound, in stereo at 128 kbps, as a shared screen's sound goes
    // (screenPublishing()), and without DTX, which sends next to nothing in a quiet passage and clips what starts it.
    // Tuned for speech, the RTC client's own, mono at 48 kbps.
    microphonePublishing() {
        return this.state.originalSound ? { audioPreset: { maxBitrate: 128000 }, forceStereo: true, dtx: false } : {};
    }
    localTrack(kind) {
        const lk = this.lk;
        if (!lk)
            return undefined;
        return this.localTracks.find((t) => t.kind === (kind === 'audio' ? lk.Track.Kind.Audio : lk.Track.Kind.Video));
    }
    // Devices
    // The cameras, microphones and speakers this browser has.
    async listDevices() {
        const none = { cameras: [], microphones: [], speakers: [] };
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices)
            return none;
        let all;
        try {
            all = await navigator.mediaDevices.enumerateDevices();
        }
        catch (e) {
            return none;
        }
        const pick = (kind) => all
            .filter((d) => d.kind === kind && d.deviceId !== '')
            .map((d) => ({ id: d.deviceId, label: d.label }));
        return { cameras: pick('videoinput'), microphones: pick('audioinput'), speakers: pick('audiooutput') };
    }
    // The camera or microphone to use: the one open now switches to it, and the next one opened is it.
    async useDevice(kind, deviceId) {
        this.deviceIds[kind] = deviceId;
        const track = this.localTrack(kind === 'camera' ? 'video' : 'audio');
        if (!track)
            return true;
        try {
            const switched = await track.setDeviceId(deviceId);
            this.refreshTiles();
            return switched;
        }
        catch (e) {
            return false;
        }
    }
    // Original sound on or off (originalSound). A microphone open now is opened again so, muted if it was, and where it
    // was out it goes out again, as the stereo is fixed as a track is published: viewers miss a moment of it. Answers
    // whether it is on, which a microphone that cannot be opened so leaves as it was.
    async setOriginalSound(on) {
        if (on === this.state.originalSound)
            return on;
        this.set({ originalSound: on });
        const track = this.localTrack('audio');
        const lk = this.lk;
        if (!track || !lk)
            return on;
        let fresh;
        try {
            [fresh] = await this.makeTracks(lk)({ audio: this.microphoneOptions(), video: false });
        }
        catch (e) {
            fresh = undefined;
        }
        if (!fresh) {
            this.set({ originalSound: !on });
            return !on;
        }
        const room = this.room;
        const out = room?.localParticipant.getTrackPublication?.(track.source)?.track === track;
        if (track.isMuted)
            await fresh.mute();
        this.localTracks = this.localTracks.map((t) => t === track ? fresh : t);
        if (out && room)
            await room.localParticipant.unpublishTrack(track);
        track.stop();
        if (out && room && this.room === room)
            await this.publishUnpublished(room);
        this.refreshTiles();
        return on;
    }
    // A phone's other camera: the back one, or the front again. The picture isn't mirrored from the back.
    async flipCamera() {
        const facing = this.state.facing === 'user' ? 'environment' : 'user';
        this.deviceIds.camera = undefined;
        this.set({ facing });
        const track = this.localTrack('video');
        const lk = this.lk;
        if (!track || !lk)
            return;
        try {
            await track.restartTrack({ resolution: this.resolution(lk), facingMode: facing });
        }
        catch (e) {
            // No camera that way: back to the one there was.
            this.set({ facing: this.state.facing === 'user' ? 'environment' : 'user' });
        }
        this.refreshTiles();
    }
    // The sound or picture of one's own camera and microphone, for a level meter: null when it's off.
    localMedia(kind) {
        const track = this.localTrack(kind);
        return track && !track.isMuted ? track.mediaStreamTrack : null;
    }
    // The picture going out: the screen while it is shared, otherwise the camera. Null before going live.
    async sendingStats() {
        const room = this.room;
        const lk = this.lk;
        if (!room || !lk)
            return null;
        const me = room.localParticipant;
        const publication = me.getTrackPublication(lk.Track.Source.ScreenShare) ?? me.getTrackPublication(lk.Track.Source.Camera);
        const track = publication?.track;
        if (!track || publication?.isMuted || typeof track.getSenderStats !== 'function')
            return null;
        // The layers the media server keeps on, smallest to largest: none while nobody has the picture on screen,
        // the smaller ones while no viewer's player needs the largest.
        const encodings = track.sender?.getParameters?.().encodings ?? [];
        const on = encodings.map((e) => e.active !== false);
        if (on.length > 0 && !on.includes(true)) {
            return { width: 0, height: 0, fps: 0, kbps: 0, limited: null, paused: true };
        }
        const held = on.includes(true) && on[on.length - 1] === false;
        // The largest layer going out. One turned off can still report the size it last had, with no frames.
        const off = new Set(encodings.filter((e) => e.active === false && e.rid).map((e) => e.rid));
        const layers = await track.getSenderStats();
        const top = layers.find((layer) => (layer.frameWidth ?? 0) > 0 && !off.has(layer.rid));
        if (!top)
            return null;
        const reason = top.qualityLimitationReason;
        return {
            width: top.frameWidth ?? 0,
            height: top.frameHeight ?? 0,
            fps: Math.round(top.framesPerSecond ?? 0),
            kbps: Math.round(track.currentBitrate / 1000),
            limited: reason === 'bandwidth' || reason === 'cpu' ? reason : null,
            ...(held ? { held: true } : {})
        };
    }
    // OBS's picture as it arrives here, while streaming from it.
    async encoderStats() {
        const room = this.room;
        const lk = this.lk;
        if (!room || !lk)
            return null;
        const track = room.remoteParticipants.get(INGEST_IDENTITY)?.getTrackPublication(lk.Track.Source.Camera)?.track;
        if (!track || typeof track.getReceiverStats !== 'function')
            return null;
        const stats = await track.getReceiverStats();
        if (!stats)
            return null;
        // Frames per second, from what was decoded since the last look.
        const frames = stats.framesDecoded ?? 0;
        const before = this.lastDecoded;
        this.lastDecoded = { at: stats.timestamp, frames };
        const fps = before && stats.timestamp > before.at ? Math.round((frames - before.frames) * 1000 / (stats.timestamp - before.at)) : 0;
        const keyframes = await this.keyframeSeconds(track);
        return {
            width: stats.frameWidth ?? 0, height: stats.frameHeight ?? 0, fps: Math.max(0, fps), kbps: Math.round(track.currentBitrate / 1000), limited: null,
            ...(keyframes !== null ? { keyframeSeconds: keyframes } : {})
        };
    }
    // Seconds between OBS's key frames, from the browser's count of those decoded, at each look: the time between the
    // first and last looks it had grown at, over the key frames between, so a look every few seconds still tells a
    // second apart. Null until it has grown twice.
    async keyframeSeconds(track) {
        const now = { count: null, at: 0 };
        try {
            (await track.receiver?.getStats())?.forEach((s) => {
                if (s.type !== 'inbound-rtp' || typeof s.keyFramesDecoded !== 'number')
                    return;
                now.count = s.keyFramesDecoded;
                now.at = s.timestamp ?? 0;
            });
        }
        catch (e) {
            return null;
        }
        const { count, at } = now;
        if (count === null)
            return null;
        const seen = this.keyframes;
        if (seen?.track !== track) {
            this.keyframes = { track, count, grew: [] };
            return null;
        }
        if (count > seen.count)
            seen.grew.push({ at, count });
        seen.count = count;
        while (seen.grew.length > 2 && at - seen.grew[0].at > KEYFRAME_WINDOW_MS)
            seen.grew.shift();
        const first = seen.grew[0];
        const last = seen.grew[seen.grew.length - 1];
        if (!first || !last || last.count === first.count)
            return null;
        return Math.round((last.at - first.at) / (last.count - first.count) / 100) / 10;
    }
    // How a camera goes out (chosenCodecs()): three layers, so each viewer gets the one their player and connection
    // call for, each at 30 fps (the RTC client's own lower layers run at 20 fps and 160 to 450 kbps, which a viewer
    // sees as stutter and blur). Short of bandwidth or CPU, the picture loses resolution before it loses frames.
    // 360p at 600 kbit/s, a middle layer a viewer between can keep (540p at 1.2 Mbit/s, or 720p in a 1080p stream), and
    // the full size: through Canada a viewer whose estimate sat between 360p's 800 kbit/s and 720p's 2.5 Mbit/s flipped
    // between them. H.264 in hardware carries the same picture on fewer bits (VMAF 92 at 1.27 Mbit/s against VP8's 88
    // at 2.5), so its full size asks for less; VP8 keeps its bitrate (at 1.8 Mbit/s it scored 2.5 lower), and backs
    // any other codec. VP9 and AV1 go as one SVC stream of three sizes, each half the one above (L3T3_KEY), on about 70%
    // and 60% of VP8's bits (calls/room-publish.ts, cameraPublish()), the two lower layers then the VP8 behind's.
    // A camera its check brought down to 720 lines goes out as a 720p stream's does.
    cameraPublishing(lk, codecs) {
        const full = this.state.sendQuality === '1080p' && (!codecs.height || codecs.height > 720);
        const tops = {
            vp8: full ? 4500000 : 2500000,
            h264: full ? 3500000 : 1800000,
            // H.265's full size the picture H.264 gives at its own on about 70% of the bits (H265_TOP_1080)
            h265: full ? 2500000 : 1300000,
            vp9: full ? 3150000 : 1750000,
            av1: full ? 2700000 : 1500000
        };
        const codec = codecs.camera;
        const hardware = codec === 'h264' || codec === 'h265';
        return {
            simulcast: true,
            videoCodec: codec,
            degradationPreference: 'maintain-framerate',
            videoEncoding: { maxBitrate: tops[codec], maxFramerate: 30 },
            videoSimulcastLayers: [
                new lk.VideoPreset(640, 360, 600000, 30),
                full ? new lk.VideoPreset(1280, 720, hardware ? 1800000 : 2500000, 30) : new lk.VideoPreset(960, 540, 1200000, 30)
            ],
            ...(codec === 'vp9' || codec === 'av1' ? { scalabilityMode: 'L3T3_KEY' } : {}),
            ...(codecs.backup ? { backupCodec: { codec: codecs.backup, encoding: { maxBitrate: tops[codecs.backup], maxFramerate: 30 } } } : {})
        };
    }
    watchCamera(publication) {
        this.cameraWatch?.();
        const track = publication?.track;
        // the node's numbers for the watch as they are at each look (rtc-client 1.0.23)
        const room = this.room;
        this.cameraWatch = track?.sender
            ? watchCameraEncoder(() => track.sender, { settings: () => roomSettings(room), onDrops: () => { this.codecChoice = null; } })
            : null;
    }
    chosenCodecs(room) {
        this.codecChoice ?? (this.codecChoice = this.pickCodecs(room).catch(() => ({ camera: 'vp8', screen: 'vp8', backup: null, height: 0 })));
        return this.codecChoice;
    }
    async pickCodecs(room) {
        if (this.options.cameraCodec) {
            const codec = await this.options.cameraCodec();
            return { camera: codec, screen: codec, backup: backupFor(codec), height: 0 };
        }
        const agent = globalThis.navigator?.userAgent ?? '';
        // the media server's policy: from its settings where its node sends them (rtc-client 1.0.23), else its codec policy
        const options = {
            h265: !!this.seatUrl && !!this.lk?.isMeshServer?.(this.seatUrl),
            policy: roomPolicy(room)
        };
        const caps = await (this.options.codecCaps ?? probeCodecCaps)().catch(() => null);
        const camera = await this.checkCamera(room, caps, agent, options);
        // the screen in the stream's own order, unless the node's settings set screen.codecs (a rule for live streams):
        // then the server's, as a group call's goes
        const node = roomSettings(room);
        const screenPolicy = node?.has('screen.codecs') ? { screen: node.get('screen.codecs') } : STREAM_SCREEN_POLICY;
        const screen = screenCodecFor(agent, hardwareFromCaps(caps), { ...options, policy: screenPolicy });
        const source = camera.source ?? 'rule';
        this.trace.add(`codecs: camera ${camera.codec}${camera.hardware ? ' hardware' : ''} by ${source}${camera.height ? ' at ' + camera.height + 'p' : ''}, screen ${screen}`);
        return { camera: camera.codec, screen, backup: camera.backup, height: camera.height ?? 0 };
    }
    // The camera's codec as the stream goes live, H.264 first: measured by the calls' camera check (calls/camera-check.ts:
    // a clone of the camera through the browser's real encoder, in a loopback inside the page) where the node checks
    // cameras (its codec policy's `check`), on the machines its camera rules name, in the stream's order
    // (streamCameraPolicy()). Each verdict
    // is this browser's record for a while, so a later Go live reads it instead of measuring. What it found goes to the
    // mesh with the camera, as a call's does. A camera measured able only at fewer lines than it gives (VP9 at 720, H.264
    // in software) is brought down to them before it goes out, the lines it then has the choice's `height`; any other
    // camera goes out at the size it has (0). No camera, no check, or a check that fails: the codec as before
    // (roomCallChoice()).
    async checkCamera(room, caps, agent, options) {
        const before = () => ({ ...roomCallChoice(caps, agent, options), height: 0 });
        const track = this.localTrack('video')?.mediaStreamTrack;
        if (!track || options.policy?.check !== true)
            return before();
        const stop = () => this.stopped || track.readyState === 'ended' || this.localTrack('video')?.mediaStreamTrack !== track;
        let choice;
        try {
            choice = await (this.options.cameraCheck ?? checkedCameraChoice)(track, caps, agent, { ...options, policy: streamCameraPolicy(options.policy), stop });
        }
        catch {
            return before();
        }
        reportMeshCamera(room, meshCameraReport(choice));
        if (choice.source === 'default' || !choice.height || stop())
            return { ...choice, height: 0 };
        const height = await fitCameraTrack(track, choice.codec, choice.hardware, choice.height).catch(() => 0);
        return { ...choice, height: height || choice.height };
    }
    // Every open track not out yet, a shared screen's too: a second call publishes nothing twice.
    async publishUnpublished(room) {
        const codecs = await this.chosenCodecs(room);
        const tracks = [
            ...this.localTracks.map((track) => ({
                track,
                options: track.kind === this.lk.Track.Kind.Audio
                    ? { ...this.cameraPublishing(this.lk, codecs), ...this.microphonePublishing() }
                    : this.cameraPublishing(this.lk, codecs)
            })),
            ...this.screenTracks.map((track) => ({ track, options: screenPublishing(this.lk, track, this.state.sendQuality, codecs.screen) }))
        ];
        for (const { track, options } of tracks) {
            const published = room.localParticipant.getTrackPublication?.(track.source);
            if (published && published.track === track)
                continue;
            const publication = await room.localParticipant.publishTrack(track, options);
            if (track.source === this.lk.Track.Source.Camera)
                this.watchCamera(publication);
        }
        this.refreshTiles();
    }
    // Host
    // The camera and microphone, shown only here until the host goes live.
    async startPreview(devices = {}) {
        await this.openDevices(devices.camera ?? true, devices.microphone ?? true);
    }
    // The quality to send, chosen before going live, within the best the site's plan allows: a camera open in the
    // preview takes its size. Live, the stream keeps the quality it went live with. Answers the quality sent.
    async setSendQuality(quality) {
        if (this.live())
            return this.state.sendQuality;
        this.wantedQuality = quality;
        const { sendQuality } = this.sendQualities(quality);
        if (sendQuality === this.state.sendQuality)
            return sendQuality;
        this.set({ sendQuality });
        const track = this.localTrack('video');
        const lk = this.lk;
        if (track && lk) {
            try {
                await track.restartTrack(this.cameraOptions(lk));
            }
            catch (e) {
                // The camera keeps the size it had until it is opened again.
            }
            this.refreshTiles();
        }
        return sendQuality;
    }
    // Publishes, then tells everyone the stream is live. Streaming from OBS, the encoder publishes, so its
    // picture must have come first.
    async goLive() {
        if (this.state.status === 'unconnected')
            return { ok: false, error: this.state.error ?? 'not_configured' };
        if (this.state.you?.role !== 'host')
            return { ok: false, error: 'not_host' };
        if (this.state.encoder) {
            if (!this.state.tiles.some((t) => t.encoder))
                return { ok: false, error: 'no_encoder' };
        }
        else {
            // Nothing on: the camera and microphone. A screen shared alone goes as it is.
            if (this.localTracks.length === 0 && this.screenTracks.length === 0)
                await this.startPreview();
            const room = await this.publisherRoom();
            if (!room)
                return { ok: false, error: this.state.error ?? 'publish_failed' };
            await this.publishUnpublished(room);
        }
        const wasLive = this.live();
        const reply = await this.ack('live');
        if (reply.ok) {
            this.set({ stream: reply.stream, ...(this.state.encoder ? {} : { sentHere: true }) });
            if (!this.state.encoder)
                this.rememberSending();
            if (!wasLive)
                this.startTally();
        }
        return reply;
    }
    // Streaming from OBS over WHIP: the stream's key and the address the encoder sends to, and the host in the
    // room to see what it sends. `renew` makes a new key, which cuts off an encoder using the old one.
    async useEncoder(renew = false) {
        if (this.state.status === 'unconnected')
            return { ok: false, error: this.state.error ?? 'not_configured' };
        if (this.state.you?.role !== 'host')
            return { ok: false, error: 'not_host' };
        const reply = await this.ack('ingest', renew ? { renew: true } : {});
        if (!reply.ok)
            return reply;
        this.set({ encoder: this.encoderOf(reply) });
        // Before going live, the encoder's picture takes the camera's place.
        if (this.state.stream?.state !== 'live')
            this.stopLocalTracks();
        if (!this.room && !await this.connectMedia('publisher'))
            return { ok: false, error: this.state.error ?? 'publish_failed' };
        this.refreshTiles();
        return { ok: true };
    }
    // Back to the camera, before going live.
    leaveEncoder() {
        this.set({ encoder: null });
        if (this.state.stream?.state !== 'live')
            this.disconnectMedia();
    }
    async end() {
        const reply = await this.ack('end');
        if (reply.ok) {
            this.forgetSending();
            this.set({ stream: reply.stream, sentHere: false });
            this.disconnectMedia();
            this.stopLocalTracks();
        }
        return reply;
    }
    async setCamera(on) {
        await this.setDevice('camera', on);
    }
    async setMicrophone(on) {
        await this.setDevice('microphone', on);
    }
    async setDevice(device, on) {
        const lk = await this.media();
        const kind = device === 'camera' ? lk.Track.Kind.Video : lk.Track.Kind.Audio;
        const track = this.localTracks.find((t) => t.kind === kind);
        if (track) {
            if (on)
                await track.unmute();
            else
                await track.mute();
        }
        else if (on) {
            // Not opened yet: open it beside what is open, and publish it when live.
            const [added] = await this.makeTracks(lk)(device === 'camera'
                ? { video: this.cameraOptions(lk), audio: false }
                : { audio: this.microphoneOptions(), video: false });
            if (!added)
                return;
            this.localTracks.push(added);
            if (device === 'camera')
                this.codecChoice = null;
        }
        const devices = { ...this.state.devices, [device]: on };
        this.set({ devices });
        // Live, it goes out at once, from wherever this window is: in the room, or joined again after a reload.
        if (this.live() && this.publishing() && !this.state.encoder) {
            if (on)
                await this.sendHere();
            else if (this.state.sentHere)
                this.rememberSending();
        }
        this.refreshTiles();
    }
    // A screen shared: held here like the camera, so a host can share it before going live too, in the preview, and it
    // goes out with the rest on going live; live, or on stage, at once. Its picture
    // is marked as detail (contentHint), so the encoder keeps text sharp before it keeps motion. The browser's own
    // "Stop sharing" ends it as the button does. Answers whether a screen is shared now.
    async setScreenShare(on) {
        if (!on) {
            await this.stopScreen();
            return false;
        }
        if (this.screenTracks.length > 0)
            return true;
        if (!this.state.canShareScreen || !this.publishing() || this.state.encoder)
            return false;
        const lk = await this.media();
        let tracks;
        try {
            tracks = await (this.options.createLocalScreenTracks ?? lk.createLocalScreenTracks)(screenCapture(this.state.sendQuality));
        }
        catch (e) {
            // The browser's picker was closed.
            return false;
        }
        const picture = tracks.find((t) => t.kind === lk.Track.Kind.Video);
        try {
            if (picture)
                picture.mediaStreamTrack.contentHint = SCREEN_CONTENT_HINT;
        }
        catch (e) { }
        picture?.mediaStreamTrack.addEventListener?.('ended', () => {
            if (this.screenTracks.includes(picture))
                void this.stopScreen();
        });
        this.screenTracks = tracks;
        this.set({ screenSharing: true });
        // Live: out at once, from wherever this window is (in the room, or joined again after a reload).
        if (this.live() || this.state.onStage) {
            const room = this.live() && this.state.you?.role === 'host' ? await this.publisherRoom() : this.room;
            if (room) {
                await this.publishUnpublished(room);
                if (this.live())
                    this.set({ sentHere: true });
            }
        }
        this.refreshTiles();
        return true;
    }
    // The shared screen's capture ended, with the room gone or going (the stream over, the stage left, the page).
    stopScreenTracks() {
        for (const track of this.screenTracks)
            track.stop();
        this.screenTracks = [];
    }
    // The shared screen gone: out of the room if it was in it, and its capture ended.
    async stopScreen() {
        const tracks = this.screenTracks;
        if (tracks.length === 0)
            return;
        this.screenTracks = [];
        const room = this.room;
        for (const track of tracks) {
            try {
                if (room)
                    await room.localParticipant.unpublishTrack(track);
            }
            catch (e) { }
            track.stop();
        }
        this.set({ screenSharing: false });
        this.refreshTiles();
    }
    invite(identity) { return this.ack('invite', { identity }); }
    unstage(identity) { return this.ack('unstage', { identity }); }
    // Viewer and stage
    async raiseHand(up) {
        const reply = await this.ack('hand', { up });
        if (reply.ok)
            this.set({ handRaised: up });
        return reply;
    }
    // Accepts the host's invitation: the camera and microphone go live in the room, as a guest.
    async acceptStage() {
        const reply = await this.ack('stage');
        if (!reply.ok) {
            this.set({ invited: false });
            return reply;
        }
        this.set({ invited: false, onStage: true });
        try {
            await this.openDevices(true, true);
        }
        catch (e) {
            // No camera or no permission: back to watching.
            await this.leaveStage();
            return { ok: false, error: 'devices' };
        }
        const room = await this.connectMedia('publisher', reply.media);
        if (!room) {
            await this.leaveStage();
            return { ok: false, error: 'publish_failed' };
        }
        await this.publishUnpublished(room);
        return { ok: true };
    }
    declineStage() {
        this.set({ invited: false });
    }
    // Off stage by choice: the cloud takes this guest off everyone's stage first, as the host's taking off does, and
    // then this page comes back as a viewer. Leaving the room alone, the guest's session stayed a publisher there until
    // the media server let it go, and the viewer's join, the same person's, waited minutes for it. A cloud before this
    // refuses (`not_host`), and the page leaves the room alone, as it did.
    async leaveStage() {
        const identity = this.state.you?.identity;
        if (this.state.onStage && identity)
            await this.ack('unstage', { identity });
        this.backToWatching();
    }
    // Off stage, back to watching: once, whichever comes first, the cloud's word (`unstaged`) or this page's own.
    backToWatching() {
        if (!this.state.onStage)
            return;
        this.set({ onStage: false, screenSharing: false });
        this.disconnectMedia();
        this.stopLocalTracks();
        this.stopScreenTracks();
        if (this.state.stream?.state === 'live')
            this.watch(0);
    }
    // Everyone
    // A message refused for a timeout says until when, which the chat then holds to.
    async sendChat(text) {
        const reply = await this.ack('chat', { text });
        if (!reply.ok && reply.error === 'timeout' && typeof reply.until === 'number') {
            this.set({ timeoutUntil: reply.until });
        }
        return reply;
    }
    deleteMessage(id) { return this.ack('delete', { id }); }
    // `who`: their name and avatar as a message of theirs has them, kept for the list of the banned when they are gone.
    ban(identity, who) { return this.ack('ban', who ? { identity, ...who } : { identity }); }
    setSlow(seconds) { return this.ack('slow', { seconds }); }
    // Moderators: a message pinned over the chat, someone kept from writing for a while and let back, someone put out
    // of the stream for now, the banned and letting one back, and the whole chat cleared.
    pin(id) { return this.ack('pin', { id }); }
    unpin() { return this.ack('unpin'); }
    timeOut(identity, seconds) { return this.ack('timeout', { identity, seconds }); }
    liftTimeout(identity) { return this.ack('untimeout', { identity }); }
    kick(identity) { return this.ack('kick', { identity }); }
    bans() { return this.ack('bans'); }
    unban(identity) { return this.ack('unban', { identity }); }
    clearChat() { return this.ack('clear'); }
    // Who is here: the signed-in people by name, and how many watch; for moderators, or everyone where the stream says.
    people() { return this.ack('people'); }
    // The host: what everyone sees on stage, where the camera of the one sharing a screen sits over it, and a guest's
    // microphone off.
    setLayout(mode, identity) { return this.ack('layout', layoutAsked(mode, identity, this.state.layout.corner)); }
    // The host drags the sharer's camera over the screen: here at once, then for everyone through the cloud, which
    // keeps it with the layout. Its left and top as shares of the room the stage leaves it, 0 to 1; null puts it back in
    // the bottom corner.
    async setCorner(corner) {
        const share = (n) => Math.round(Math.min(1, Math.max(0, Number(n) || 0)) * 1000) / 1000;
        const at = corner ? { x: share(corner.x), y: share(corner.y) } : null;
        const before = this.state.layout;
        this.set({ layout: { mode: before.mode, identity: before.identity, ...(at ? { corner: at } : {}) } });
        const ack = await this.ack('layout', layoutAsked(before.mode, before.identity, at));
        if (!ack.ok && this.state.layout.corner === (at ?? undefined))
            this.set({ layout: before });
        return ack;
    }
    muteGuest(identity) { return this.ack('mute', { identity }); }
    // Nothing while the stream takes no reactions.
    react(kind) {
        if (this.state.reactionsOn)
            this.send('react', { kind });
    }
    // The viewer's choice of picture (VideoChoice), on what arrives now and later.
    setQuality(quality) {
        if (quality !== this.state.quality)
            this.playback.note('quality', quality);
        this.set({ quality });
        this.capAll();
    }
    capAll() {
        for (const participant of this.room?.remoteParticipants.values() ?? []) {
            for (const publication of participant.trackPublications.values())
                this.capQuality(publication);
        }
    }
    // A browser that blocked sound until the page was clicked.
    async startAudio() {
        await this.room?.startAudio();
        if (this.room)
            this.set({ audioBlocked: !this.room.canPlaybackAudio });
    }
    live() {
        return this.state.stream?.state === 'live';
    }
    // What this page counts of a stream from when it went live: the most watching at once, the messages and
    // the reactions, for the host's summary at its end.
    startTally() {
        this.set({ tally: { peak: this.state.viewers, messages: 0, reactions: 0 } });
    }
    count(patch) {
        this.set({ tally: { ...this.state.tally, ...patch } });
    }
    // Each reaction is its emoji, the name a cloud of before passes on taken as its emoji.
    addReactions(counts) {
        const now = Date.now();
        const added = [];
        for (const [sent, n] of Object.entries(counts)) {
            const kind = Object.prototype.hasOwnProperty.call(REACTION_EMOJI, sent) ? REACTION_EMOJI[sent] : sent;
            for (let i = 0; i < Math.min(Number(n) || 0, 8); i++)
                added.push({ id: ++this.reactionSeq, kind, at: now + i * 120 });
        }
        this.set({ reactions: [...this.state.reactions, ...added].slice(-REACTIONS_SHOWN) });
        if (!this.reactionTimer) {
            this.reactionTimer = setInterval(() => {
                const cut = Date.now() - REACTION_LIFE_MS;
                const kept = this.state.reactions.filter((r) => r.at > cut);
                if (kept.length !== this.state.reactions.length)
                    this.set({ reactions: kept });
                if (kept.length === 0 && this.reactionTimer) {
                    clearInterval(this.reactionTimer);
                    this.reactionTimer = null;
                }
            }, 500);
        }
    }
}
