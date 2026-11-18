/**
 * A room on the mesh: a group call, a call between two people that became one, or the room a call between two people
 * moves to when neither the direct path nor TURN carries it. The page gets its place from the server with the site's
 * token, then joins with the mesh's room client, which walks busy nodes, waits for a place and moves when a node goes.
 *
 * **End to end encrypted** when the site gives a key: a call's rooms always, a group call's when its plugin says so
 * (the PHP package's `calls()`, `encrypt`). Every frame is encrypted in the browser with the key everyone in the room
 * shares, which only the site gives out, so the mesh forwards what it can't read, as a direct call's media is.
 */
import { Listeners } from '../channel.js';
import { RealtimeError } from '../errors.js';
import { listDevices, LocalDevices } from './devices.js';
import { encryptionWorker, kitSource, liveKitSource, MESH_JOIN_BUDGET_MS } from './media.js';
import { probeCodecCaps } from '../calls/codecs.js';
import { watchCameraEncoder } from '../calls/encoder-watch.js';
import { watchRoomMic } from '../calls/mic-ceiling.js';
import { callUserOf } from '../calls/users.js';
import { checkedCameraChoice, meshCameraReport, reportMeshCamera } from '../calls/camera-check.js';
import { applyViewSettings, roomPolicy, roomSettings } from '../calls/room-settings.js';
import { StallWatch } from '../calls/stall-watch.js';
import { AWAY_MS, awayFor, BYE_TOPIC } from '../calls/away.js';
import { applyNowDelayMs, applyScreenSettings, cameraPublish, cameraPublishChanged, cameraTune, fitCameraTrack, hardwareFromCaps, micPublish, roomCallChoice, roomPixelDensity, screenCodecFor, screenEncoding, screenPublish, screenVideoMode, } from '../calls/room-publish.js';
/** Every act, in the order the protocol lists them. */
export const CALL_ACTS = ['remove', 'ban', 'listen', 'speak', 'mute', 'hold_mic', 'release_mic', 'rules', 'hand', 'ask', 'end', 'spotlight'];
/** What every server and package took before `acts` was named (1.1.0): a host's mute, speak, listen, remove and spotlight. */
export const BASE_ACTS = ['remove', 'listen', 'speak', 'mute', 'spotlight'];
/**
 * What a group call offers: the acts both the realtime server's place and the app's package name, in CALL_ACTS's order;
 * BASE_ACTS where either names none, as a 1.1.0-era server or package does, so nothing new is offered there.
 */
export function actsOf(server, app) {
    if (!Array.isArray(server) || !Array.isArray(app))
        return [...BASE_ACTS];
    return CALL_ACTS.filter((act) => server.includes(act) && app.includes(act));
}
/** The act a ModerationAct needs offered. */
const ACT_OF = {
    mute: 'mute', speak: 'speak', listen: 'listen', remove: 'remove', spotlight: 'spotlight', unspotlight: 'spotlight',
    ban: 'ban', unban: 'ban', hold_mic: 'hold_mic', release_mic: 'release_mic', rules: 'rules', ask: 'ask', end: 'end',
};
export const ASK_ANSWERS = ['on', 'not_now', 'blocked', 'no_device', 'busy'];
/** The topics of an ask over the room: the server's to the person, and their answer to the host. */
const ASK_TOPIC = 'realtime-ask';
const ASK_ANSWER_TOPIC = 'realtime-ask-answer';
/** The media server's TrackSource for a microphone in a participant's `canPublishSources`, or the token's name for it. */
const MICROPHONE_SOURCES = [2, 'microphone', 'MICROPHONE'];
/** Whether permissions that let a page send leave its microphone out: an empty list is every source. */
function holdsMic(publish, sources) {
    return publish && Array.isArray(sources) && sources.length > 0 && !sources.some((source) => MICROPHONE_SOURCES.includes(source));
}
/** A room's rules as its metadata says them: participatory, unlocked and unmuted where it says nothing. */
export function rulesOf(metadata) {
    const rules = parsed(metadata)?.rules;
    const on = (value) => value === true || value === 1 || value === '1';
    return { mode: rules?.mode === 'broadcast' ? 'broadcast' : 'participatory', locked: on(rules?.locked), muted: on(rules?.muted) };
}
/** Whose hands are up in a room, as its metadata says: the media server's identities, once each, in the order raised. */
export function handsOf(metadata) {
    const list = parsed(metadata)?.hands;
    return Array.isArray(list) ? [...new Set(list.filter((v) => typeof v === 'string' && v !== ''))] : [];
}
function parsed(metadata) {
    try {
        return typeof metadata === 'string' && metadata !== '' ? JSON.parse(metadata) : null;
    }
    catch {
        return null;
    }
}
/** Who is in a room's spotlight, as its metadata says: the media server's identities, once each, at most four. */
export function spotlightOf(metadata) {
    let value = null;
    try {
        value = typeof metadata === 'string' && metadata !== '' ? JSON.parse(metadata) : null;
    }
    catch {
        value = null;
    }
    const list = Array.isArray(value?.spotlight) ? value.spotlight : [];
    return [...new Set(list.filter((v) => typeof v === 'string' && v !== ''))].slice(0, 4);
}
const refused = (code) => new RealtimeError(code);
/** The media server's rating of a connection, in the words a call between two uses. */
const QUALITIES = ['excellent', 'good', 'poor', 'lost', 'unknown'];
const qualityOf = (value) => (QUALITIES.includes(value) ? value : 'unknown');
/**
 * Why the room let this page go, as `ended` says it: `removed` when the site's server took them out (remove(), the media
 * server's PARTICIPANT_REMOVED), `closed` when it ended the call for everyone (end(), ROOM_DELETED), else the media
 * server's own reason after `disconnected:`. The call screen says the first two to the user (an SDK review, 2026-10-14:
 * a removed person saw the window go, with no word why).
 */
function disconnectedBy(reason) {
    if (reason === 4)
        return 'removed';
    if (reason === 5)
        return 'closed';
    return 'disconnected' + (reason !== undefined ? ':' + String(reason) : '');
}
/**
 * What a place's token lets this page do, before the room says so itself as it connects: its media grant, which the
 * realtime server writes from the site's rule and its `permit` since. Null for a token it can't read.
 */
function grantedBy(token) {
    try {
        const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        const video = claims?.video;
        if (!video || typeof video !== 'object')
            return null;
        const publish = video.canPublish !== false;
        return {
            publish,
            subscribe: video.canSubscribe !== false,
            ...(video.roomAdmin === true ? { admin: true } : {}),
            ...(holdsMic(publish, video.canPublishSources) ? { micHeld: true } : {}),
        };
    }
    catch {
        return null;
    }
}
/**
 * A room, its encryption worker started first when the site gave a key: refused with `encryption_unsupported` in a
 * browser that can't encrypt each frame, since it could neither send to the others nor see what they send.
 */
export async function openRoom(lib, options, keys, extras = {}) {
    const named = { group: extras.group, moderate: extras.moderate, record: extras.record, mayRecord: extras.mayRecord, hand: extras.hand, acts: extras.acts };
    if (!extras.key)
        return new GroupCall(lib, options, keys, named);
    if (!lib.ExternalE2EEKeyProvider || !lib.isE2EESupported?.())
        throw refused('encryption_unsupported');
    const worker = await encryptionWorker(extras.worker, extras.rooms);
    return new GroupCall(lib, options, keys, { encryption: { key: extras.key, worker }, ...named });
}
const userOf = (identity) => (identity.startsWith('user_') ? callUserOf(identity.slice('user_'.length)) : null);
const infoOf = (metadata) => {
    if (typeof metadata !== 'string' || metadata === '')
        return null;
    try {
        return JSON.parse(metadata);
    }
    catch {
        return null;
    }
};
/**
 * A room the page is in. Events: `state` (GroupCallState), `waiting` ({ until, reason }: the mesh is finding a place),
 * `person` (Person: someone arrived, or came back, or what they send, may send or how their connection is changed),
 * `person_away` (Person: they left and may come back, their tile kept for 20 s, marked `reconnecting`), `person_left`
 * (Person: gone), `stalled` (Person: their media stopped arriving, or arrives again), `rules` (RoomRules), `hands`
 * (user ids), `ask` (CallAsk: a host asks this page's user to turn something on), `ask_answer` (CallAskAnswer),
 * `speakers` (Person[]), `invite` (Invite: someone is rung into this group call), `permissions`
 * (RoomPermissions: the site's server changed what this page may do), `spotlit` (user ids: who a host put on the main
 * tiles for everyone changed), `recording` (boolean: the room's recording flag changed, whoever started or stopped it),
 * `autoplay_blocked` (a click must start the sound: `startAudio()`), `quality` (this page's own connection changed),
 * `error` ({ code }: `publish_failed`, `encryption_failed`), and `ended` (the reason).
 */
export class GroupCall {
    /**
     * @param keys the page's keyring, which opens what the site said about each person; a person whose key it has to ask
     *             the site for comes again as `person` once it has it.
     * @param extras the key and worker of an encrypted room (openRoom() starts the worker), and a group call's link.
     */
    constructor(lib, options = {}, keys = null, extras = {}) {
        this.lib = lib;
        this.keys = keys;
        this.state = 'connecting';
        this.listeners = new Listeners();
        this.published = new Map();
        this.wanted = new Map();
        // What the place's token said this page may do, until the room says it (can).
        this.granted = null;
        this.encryption = null;
        // The tiles of those who left and may come back, by identity, and when each one's bye came (away.ts).
        this.away = new Map();
        this.byes = new Map();
        this.stalls = new StallWatch();
        // The rules and hands last said, so each is said once a change.
        this.saidRules = '';
        this.saidHands = '';
        // The microphone held as this page joined (its place's `mic_held`), until the room's permissions change.
        this.heldAtJoin = false;
        this.ended = false;
        // What setCamera(), setMicrophone() and setScreenShare() opened; a call that became this one hands over its own.
        this.local = new LocalDevices((source, track) => this.setTrack(source, track), () => roomSettings(this.livekit));
        // The room left, once a bye had its moment (finish()).
        this.closed = Promise.resolve();
        // the shared screen's codec, for its live settings
        this.screenCodec = null;
        this.caps = null;
        this.choice = null;
        // the camera's sender watched for a hardware encoder dropping its frames (encoder-watch.ts); its stop
        this.cameraWatch = null;
        // the microphone kept under its ceiling on a slow upload (mic-ceiling.ts); its stop
        this.micWatch = null;
        // the server the room is on, which says whether it forwards H.265 (the mesh's)
        this.server = null;
        if (extras.encryption && lib.ExternalE2EEKeyProvider) {
            const provider = new lib.ExternalE2EEKeyProvider();
            this.encryption = { ...extras.encryption, provider };
            options = { ...options, encryption: { keyProvider: provider, worker: extras.encryption.worker } };
        }
        this.encrypted = this.encryption !== null;
        this.link = extras.group ?? null;
        this.moderator = extras.moderate ?? null;
        this.recorder = extras.record ?? null;
        this.mayRecord = !!extras.mayRecord;
        this.hander = extras.hand ?? null;
        // A host's acts need the calls route, and hands their own way to it.
        this.acts = (extras.acts ?? (this.moderator ? BASE_ACTS : [])).filter((act) => (act === 'hand' ? !!this.hander : !!this.moderator));
        this.group = this.link?.id ?? null;
        // Two connections, a publisher and a subscriber, as Better Messages' call client asks: the mesh's mediasoup
        // engine doesn't serve one connection both ways (/rtc/v1), so asking for it costs a refused try on every join.
        // Tiles ask layers at the screen's pixel density up to 1.5, as Better Messages' (room-publish.ts).
        this.livekit = new lib.Room({
            adaptiveStream: { pixelDensity: roomPixelDensity(globalThis.devicePixelRatio) },
            dynacast: true,
            singlePeerConnection: false,
            // A page that closes or reloads doesn't leave: the mesh reports a lost signal, so the others keep its tile
            // for its return (away.ts), as Better Messages' room does; a hang-up leaves, with its bye.
            disconnectOnPageLeave: false,
            ...options,
        });
        const E = lib.RoomEvent;
        // Nothing after the room ended: the room client still says who left as it disconnects. Someone kept away is back
        // once the room has them again; until then nothing of their old session says they are.
        const changed = (participant) => {
            if (this.ended || !participant)
                return;
            if (this.away.has(participant.identity)) {
                if (this.livekit.remoteParticipants.get(participant.identity) !== participant)
                    return;
                this.back(participant.identity);
            }
            this.listeners.fire('person', [this.person(participant)], false);
        };
        this.livekit.on(E.ParticipantConnected, (participant) => {
            if (participant)
                this.byes.delete(participant.identity);
            changed(participant);
        });
        this.livekit.on(E.ParticipantMetadataChanged, (_old, participant) => participant && !participant.isLocal && changed(participant));
        this.livekit.on(E.TrackSubscribed, (_track, _publication, participant) => changed(participant));
        this.livekit.on(E.TrackUnsubscribed, (_track, _publication, participant) => changed(participant));
        // Once a track is gone, as the person sends it no more (a camera turned off), so it is not still among theirs, which
        // the unsubscribe before it may say (an SDK review, 2026-10-14: a camera turned off left a dark tile, no name on it).
        if (E.TrackUnpublished)
            this.livekit.on(E.TrackUnpublished, (_publication, participant) => participant && !participant.isLocal && changed(participant));
        this.livekit.on(E.TrackMuted, (_publication, participant) => participant && !participant.isLocal && changed(participant));
        this.livekit.on(E.TrackUnmuted, (_publication, participant) => participant && !participant.isLocal && changed(participant));
        // The media server paused someone's camera or screen for this page's download, or sends it again (cameraPaused).
        if (E.TrackStreamStateChanged)
            this.livekit.on(E.TrackStreamStateChanged, (_publication, _state, participant) => participant && !participant.isLocal && changed(participant));
        // Someone left: kept a while, marked reconnecting, when they may come back (away.ts), else gone at once.
        this.livekit.on(E.ParticipantDisconnected, (participant, reason) => {
            if (this.ended || !participant || participant.isLocal)
                return;
            this.departed(participant, reason);
        });
        // The site's server changed what someone may do (its `permit`): this page's, or another person's.
        this.livekit.on(E.ParticipantPermissionsChanged, (_previous, participant) => {
            if (this.ended || !participant)
                return;
            if (!participant.isLocal)
                return changed(participant);
            // The room's permissions say it from here on: a change once joined, not the first word as it connects.
            if (this.state === 'connected' || this.state === 'reconnecting')
                this.heldAtJoin = false;
            const can = this.can;
            // The media server took down what it sent: nothing of it is sent again on a reconnect, nor kept for later.
            if (!can.publish) {
                this.published.clear();
                this.wanted.clear();
                this.local.release();
            }
            else if (can.micHeld && (this.wanted.has('microphone') || this.published.has('microphone'))) {
                // A host holds the microphone off: it stops and closes, as a listener's devices do, and once let go the
                // person turns it on again themselves.
                void this.setTrack('microphone', null);
            }
            this.listeners.fire('permissions', [can], false);
            // Let speak: what the page set while it could not send goes out now, with no second try of its own.
            if (can.publish)
                void this.publishWanted();
        });
        this.livekit.on(E.ActiveSpeakersChanged, (speakers) => !this.ended && this.listeners.fire('speakers', [speakers.filter((p) => !p.isLocal).map((p) => this.person(p))], false));
        // A host's spotlight, the room's rules and the hands up, kept in the room's metadata by the realtime server.
        if (E.RoomMetadataChanged) {
            this.livekit.on(E.RoomMetadataChanged, () => {
                if (this.ended)
                    return;
                this.spotlightChanged();
                this.stateChanged();
            });
        }
        // What comes over the room: a host's ask from the realtime server, an answer to this page's, someone's bye.
        if (E.DataReceived)
            this.livekit.on(E.DataReceived, (payload, participant, _kind, topic) => !this.ended && this.received(payload, participant, topic));
        // Whose media stopped reaching the media server (stall-watch.ts), as the mesh says it (rtc-client 1.0.25).
        if (E.MeshSourcesDryChanged)
            this.livekit.on(E.MeshSourcesDryChanged, () => !this.ended && this.readStalls());
        // The browser holds the sound back until a click (startAudio()), as a call between two says it too.
        if (E.AudioPlaybackStatusChanged)
            this.livekit.on(E.AudioPlaybackStatusChanged, () => !this.ended && this.livekit.canPlaybackAudio === false && this.listeners.fire('autoplay_blocked', [], false));
        // How a connection is: this page's own by `quality`, someone else's as they come again.
        if (E.ConnectionQualityChanged) {
            this.livekit.on(E.ConnectionQualityChanged, (quality, participant) => {
                if (this.ended || !participant)
                    return;
                if (participant.isLocal)
                    this.listeners.fire('quality', [qualityOf(quality)], false);
                else
                    changed(participant);
            });
        }
        // The media server's flag that the room is recorded, which late joiners read too (`isRecording`).
        if (E.RecordingStatusChanged)
            this.livekit.on(E.RecordingStatusChanged, (on) => !this.ended && this.listeners.fire('recording', [!!on], false));
        // The node's settings changed (rtc-client 1.0.23): the live ones taken now, a camera's ceilings by the room client
        if (E.MeshSettingsChanged)
            this.livekit.on(E.MeshSettingsChanged, (settings, changed) => this.settingsChanged(settings, changed));
        this.livekit.on(E.Reconnecting, () => this.setState('reconnecting'));
        this.livekit.on(E.Reconnected, () => this.setState('connected'));
        this.livekit.on(E.Disconnected, (reason) => this.finish(disconnectedBy(reason)));
        if (E.EncryptionError)
            this.livekit.on(E.EncryptionError, (error) => this.listeners.fire('error', [{ code: 'encryption_failed', error }], false));
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /** Joins the room at its place. */
    async connect(place) {
        // What the page may do is known at once, from the place's token: a listener is never taken for a speaker while
        // the room connects.
        this.granted = grantedBy(place.token);
        // The realtime server's word that it holds the microphone, where the token doesn't say it in its sources.
        if (place.micHeld)
            this.granted = { ...(this.granted ?? { publish: true, subscribe: true }), micHeld: true };
        // Held as it joins until the room's permissions change, should the room's own not carry the hold.
        this.heldAtJoin = !!this.granted?.micHeld;
        const before = this.can;
        this.setState('connecting');
        this.server = place.server;
        if (this.encryption) {
            // Before the connect, so nothing this page sends ever leaves it unencrypted.
            await this.encryption.provider.setKey(this.encryption.key);
            await this.livekit.setE2EEEnabled(true);
        }
        await this.livekit.connect(place.server, place.token, {
            autoSubscribe: true,
            ...(place.iceServers?.length ? { rtcConfig: { iceServers: place.iceServers } } : {}),
            // The mesh's client: how long a join waits for a place, and what it waits on.
            meshJoinBudgetMs: MESH_JOIN_BUDGET_MS,
            onMeshWait: (wait) => {
                this.setState('waiting');
                this.listeners.fire('waiting', [wait], false);
            },
        });
        if (this.ended) {
            this.livekit.disconnect();
            return;
        }
        this.setState('connected');
        this.micWatch ?? (this.micWatch = watchRoomMic(() => this.livekit.localParticipant));
        // The room has the last word: the site's server may have changed it since the token was signed.
        const now = this.can;
        if (now.publish !== before.publish || now.subscribe !== before.subscribe || !!now.micHeld !== !!before.micHeld)
            this.listeners.fire('permissions', [now], false);
        await this.publishWanted();
        for (const participant of this.livekit.remoteParticipants.values())
            this.listeners.fire('person', [this.person(participant)], false);
        // A spotlight already on as the page joins, as the room had it.
        if (this.spotlight.length)
            this.spotlightChanged();
        // The rules and the hands up, as the room has them: said once as it joins, then as they change.
        this.stateChanged(true);
    }
    /** The rules and hands, each said when it changed (or as the room joins). */
    stateChanged(joining = false) {
        const rules = this.rules;
        const ruleText = JSON.stringify(rules);
        if (joining || ruleText !== this.saidRules) {
            this.saidRules = ruleText;
            this.listeners.fire('rules', [rules], false);
        }
        const hands = handsOf(this.livekit.metadata);
        const handText = JSON.stringify(hands);
        if (joining || handText !== this.saidHands) {
            this.saidHands = handText;
            this.listeners.fire('hands', [this.hands], false);
        }
    }
    /**
     * The room's rules (Broadcast Mode, Lock and Mute Everyone), as the realtime server keeps them in its metadata until
     * the room empties: participatory, unlocked and unmuted from a server that keeps none. `rules` when they change.
     */
    get rules() {
        return rulesOf(this.livekit.metadata);
    }
    /** Whose hands are up, by their user ids, in the order raised: room state until lowered or their owner leaves. */
    get hands() {
        return handsOf(this.livekit.metadata).map(userOf).filter((user) => user !== null);
    }
    /** Whether this page's user has a hand up. */
    get handRaised() {
        const me = this.livekit.localParticipant?.identity;
        return !!me && handsOf(this.livekit.metadata).includes(me);
    }
    spotlightChanged() {
        this.listeners.fire('spotlight', [this.spotlight], false);
        this.listeners.fire('spotlit', [this.spotlit], false);
    }
    /**
     * Who a host put on the main tiles for everyone, in the order they were, by their user ids, as `spotlightOn()` takes
     * them: the room's state, so a page that joins later has it too.
     */
    get spotlit() {
        return this.spotlight.map(userOf).filter((user) => user !== null);
    }
    /**
     * The same by the media server's identity (Person's `identity`, `self`'s for this page's own user).
     * @deprecated `spotlit` names users, as a host's acts take them.
     */
    get spotlight() {
        return spotlightOf(this.livekit.metadata);
    }
    /** How this page's own connection is, as the media server rates it (`quality` when it changes). */
    get quality() {
        return qualityOf(this.livekit.localParticipant?.connectionQuality);
    }
    /** Whether the browser holds the sound back until a click: `autoplay_blocked` says so as it happens. */
    get audioBlocked() {
        return this.livekit.canPlaybackAudio === false;
    }
    /** The sound of the others, where the browser held it back: call it from a click, such as a Turn On Sound button. */
    async startAudio() {
        await this.livekit.startAudio?.();
    }
    /** What this page may do in the room now: the site's rule, or what its server changed since (`permissions`). */
    get can() {
        const permissions = this.livekit.localParticipant?.permissions;
        // Hosting is the token's alone: the room's own permissions don't carry it.
        const admin = this.granted?.admin ? { admin: true } : {};
        if (permissions) {
            const publish = permissions.canPublish ?? true;
            const micHeld = holdsMic(publish, permissions.canPublishSources) || (publish && this.heldAtJoin);
            return { publish, subscribe: permissions.canSubscribe ?? true, ...admin, ...(micHeld ? { micHeld: true } : {}) };
        }
        return this.granted ?? { publish: true, subscribe: true };
    }
    /**
     * What a host does to someone else in the call (`ModerationAct`), through the site's calls route, which asks the
     * call's rule again and takes it from a host alone (its `admin`). Whether it changed anything. `user` is null only
     * for `unspotlight`, which then takes everyone off the main tiles. Rejects with its `code`: `forbidden` for a page
     * that isn't the host, `not_moderated` for a room that isn't a named group call, `spotlight_full` for a fifth
     * person in the spotlight.
     */
    async moderate(act, user, options = {}) {
        return (await this.act(act, user, options)).done;
    }
    /** A host's act through the calls route, the route's whole answer: refused here for an act this call doesn't offer. */
    async act(act, user, options = {}) {
        if (!this.moderator)
            throw refused('not_moderated');
        if (user === null && act !== 'unspotlight' && act !== 'rules' && act !== 'end')
            throw refused('bad_request');
        if (user !== null && (act === 'rules' || act === 'end'))
            throw refused('bad_request');
        // An old server or package answers an act it doesn't know with bad_request: this says why, without asking.
        if (!this.acts.includes(ACT_OF[act]))
            throw refused('not_offered');
        return this.moderator(act, user, options);
    }
    /** A host turns someone's microphone off once, which they may turn on again. Rejects as `moderate()` does. */
    mute(user) {
        return this.moderate('mute', user);
    }
    /**
     * A host takes someone out of the call: a kick, so a new token takes them back in, unless the call is locked, which
     * then keeps them out. The tokens signed for them before do not take them back in.
     */
    remove(user) {
        return this.moderate('remove', user);
    }
    /**
     * A host takes someone out and keeps them out for `minutes`, by default until the call ends, whatever token they
     * bring: a join rejects with `banned`. Where `acts` has `ban`; rejects with `forbidden` for another host.
     */
    ban(user, minutes) {
        return this.moderate('ban', user, minutes === undefined ? {} : { minutes });
    }
    /** A host lets someone banned from the call in again. Where `acts` has `ban`. */
    unban(user) {
        return this.moderate('unban', user);
    }
    /**
     * A host holds someone's microphone off until the call ends, or `releaseMic()`, through a reload too: their
     * `micHeld`, and their page can't turn it on. Where `acts` has `hold_mic`.
     */
    holdMic(user) {
        return this.moderate('hold_mic', user);
    }
    /** A host lets a held microphone go: the person may turn it on again. Where `acts` has `release_mic`. */
    releaseMic(user) {
        return this.moderate('release_mic', user);
    }
    /**
     * A host sets the room's rules, any of them (`RoomRules`), which hold until the room empties: the rules now, which
     * every page hears as `rules`. Broadcast Mode makes everyone but the hosts a listener and Participatory lets them
     * speak again, each dropping who was promoted or made a listener; Mute Everyone holds every microphone but a host's,
     * and turning it off lets them go; Lock keeps out anyone not already in. Where `acts` has `rules`.
     */
    async setRules(rules) {
        const answer = await this.act('rules', null, { rules });
        return { ...this.rules, ...rules, ...(answer.rules ?? {}) };
    }
    /**
     * A host asks someone to turn on their camera or microphone: the ask's id, which their answer names
     * (`ask_answer`). Rejects with `asked_recently` for the same ask within 30 s. Where `acts` has `ask`.
     */
    async askToTurnOn(user, devices) {
        const asked = devices.filter((device) => device === 'camera' || device === 'microphone');
        if (asked.length === 0)
            throw refused('bad_request');
        const answer = await this.act('ask', user, { devices: [...new Set(asked)] });
        if (typeof answer.id !== 'string' || answer.id === '')
            throw refused('server');
        return answer.id;
    }
    /** Answers a host's ask (`ask`), to that host alone: what came of it, nothing more of this page's devices. */
    async answerAsk(ask, answer) {
        if (!ASK_ANSWERS.includes(answer) || ask.by === null)
            throw refused('bad_request');
        await this.livekit.localParticipant?.publishData?.(new TextEncoder().encode(JSON.stringify({ id: ask.id, answer })), {
            reliable: true,
            topic: ASK_ANSWER_TOPIC,
            destinationIdentities: ['user_' + String(ask.by)],
        });
    }
    /**
     * A host ends the call for everyone: each is taken out (`ended` with `closed`), the tokens signed before don't take
     * them back, and what the call held goes with it, so a join after it starts a new call. Where `acts` has `end`.
     */
    end() {
        return this.moderate('end', null);
    }
    /** This page's user raises a hand, which stays up, for every host to see (`hands`), until lowered or they leave. Where `acts` has `hand`. */
    raiseHand() {
        return this.handVia(true);
    }
    /**
     * Lowers this page's user's hand, or as a host another's, or everyone's with null. Where `acts` has `hand`; another's
     * rejects with `forbidden` for anyone but a host.
     */
    lowerHand(user) {
        return this.handVia(false, user);
    }
    async handVia(up, user) {
        if (!this.hander)
            throw refused('not_moderated');
        if (!this.acts.includes('hand'))
            throw refused('not_offered');
        return this.hander(up, user);
    }
    /** A host lets a listener send their camera, microphone and screen. */
    letSpeak(user) {
        return this.moderate('speak', user);
    }
    /** A host makes a speaker a listener: what they send stops. */
    makeListener(user) {
        return this.moderate('listen', user);
    }
    /** A host puts someone, themselves too, on the main tiles for everyone, up to four. A fifth rejects with `spotlight_full`. */
    spotlightOn(user) {
        return this.moderate('spotlight', user);
    }
    /** A host takes someone off the main tiles, or everyone with no user. */
    spotlightOff(user = null) {
        return this.moderate('unspotlight', user);
    }
    /** Whether the room says it is being recorded, by whoever started it: the media server's flag (`recording` event). */
    get isRecording() {
        return !!this.livekit.isRecording;
    }
    /**
     * Whether to offer this page's user a recording of the call: the site's answer said they may (its rule's `record`,
     * else its `admin`), of a named group call, whose media the recorder can read.
     */
    get canRecord() {
        return this.mayRecord && !!this.recorder && !this.encrypted;
    }
    /**
     * Starts recording the call through the site's calls route, which asks the call's rule again: the recording, its id
     * and state. Rejects with its `code`: `forbidden` for anyone the rule doesn't let record, `not_moderated` for a room
     * that isn't a named group call, or WordPlus Cloud's refusal (`no_credits`, `not_included`, `already_recording` …).
     */
    async startRecording() {
        if (!this.recorder)
            throw refused('not_moderated');
        return this.recorder('start');
    }
    /** Stops the recording `id` of the call, as `startRecording` answered it: the recording, being stopped. Rejects as it does. */
    async stopRecording(id) {
        if (!this.recorder)
            throw refused('not_moderated');
        return this.recorder('stop', id);
    }
    /** Sends what the page set and the room doesn't have yet, while this page may send. */
    async publishWanted() {
        if (!this.can.publish || this.ended)
            return;
        for (const [source, track] of this.wanted)
            if (!this.published.has(source) && !this.refuses(source))
                await this.publish(source, track);
    }
    /** A source this page may not send now though it may send: the microphone a host holds off. */
    refuses(source) {
        return source === 'microphone' && !!this.can.micHeld;
    }
    /** This page's own user in the room, as the others see them: their info as the site gave it. Null until connected. */
    get self() {
        const local = this.livekit.localParticipant;
        return local?.identity ? this.person(local) : null;
    }
    /** Everyone else in the room, and those who left and may come back, marked `reconnecting`. */
    people() {
        const here = [...this.livekit.remoteParticipants.values()].map((p) => this.person(p));
        const kept = [...this.away.entries()].filter(([identity]) => !this.livekit.remoteParticipants.has(identity)).map(([, entry]) => entry.person);
        return [...here, ...kept];
    }
    /**
     * The browser's camera, opened and sent, or stopped with false: the device named, the one last named, or the browser's
     * own choice, and named while on, it moves there. Closed as the call ends. Rejects with its `code`: `not_allowed` for a
     * listener, `device_denied`, `device_missing`, `device_busy` or `no_devices`.
     */
    setCamera(on, options) {
        return on && !this.can.publish ? Promise.reject(refused('not_allowed')) : this.local.setCamera(on, options);
    }
    /** The browser's microphone, as `setCamera()` has its camera; rejects with `mic_held` while a host holds it off. */
    setMicrophone(on, options) {
        if (on && !this.can.publish)
            return Promise.reject(refused('not_allowed'));
        if (on && this.can.micHeld)
            return Promise.reject(refused('mic_held'));
        return this.local.setMicrophone(on, options);
    }
    /** Shares a screen, its sound with it where the browser gives it, or stops: whether one is shared now. */
    setScreenShare(on) {
        return on && !this.can.publish ? Promise.reject(refused('not_allowed')) : this.local.setScreenShare(on);
    }
    /** Where the others' voices play, one of `devices().speakers`, on a browser that lets a page choose. */
    async setSpeaker(deviceId) {
        await this.livekit.switchActiveDevice?.('audiooutput', deviceId);
    }
    /** The cameras, microphones and speakers this browser has. Their names are empty until the browser gave the site one. */
    devices() {
        return listDevices();
    }
    /** What this page sends now, for a picture of its own: `video.srcObject = new MediaStream( [ group.camera ] )`. */
    get camera() {
        return this.wanted.get('camera') ?? null;
    }
    get microphone() {
        return this.wanted.get('microphone') ?? null;
    }
    get screen() {
        return this.wanted.get('screen_share') ?? null;
    }
    /** @internal A call that became this group call goes on with the devices it opened. */
    takeDevices(devices) {
        this.local = devices;
        devices.handTo((source, track) => this.setTrack(source, track), () => roomSettings(this.livekit));
    }
    /** What this page sends from a source: a track of your own, or null to stop sending it. Kept for a room still connecting. */
    async setTrack(source, track) {
        // A held microphone isn't kept for later either: once let go, the person turns it on again, as in Better Messages.
        if (track && this.refuses(source))
            throw refused('mic_held');
        this.local.replaced(source, track);
        if (track)
            this.wanted.set(source, track);
        else
            this.wanted.delete(source);
        if (this.state !== 'connected' && this.state !== 'reconnecting')
            return;
        const current = this.published.get(source);
        if (current) {
            this.published.delete(source);
            if (source === 'camera') {
                this.cameraWatch?.();
                this.cameraWatch = null;
            }
            await this.livekit.localParticipant.unpublishTrack(current.track, false).catch(() => { });
        }
        // A listener keeps it for when the site's server lets them speak (publishWanted), never a refused try.
        if (track && this.can.publish && !this.refuses(source))
            await this.publish(source, track);
    }
    /**
     * Hangs up: `ended` (`left`) at once, and the others are told first (a bye over the room), so they drop this page's
     * tile at once rather than keep it for a return. Resolves once the room is left.
     */
    leave() {
        this.finish('left');
        return this.closed;
    }
    /**
     * Rings `user` into this group call, a call between two people that became one: they arrive as a `person` once they
     * answer. Rejects with its `code`: `not_a_call` for any other room, or the site's or the server's refusal.
     */
    add(user) {
        if (!this.link)
            return Promise.reject(refused('not_a_call'));
        if (this.ended)
            return Promise.reject(refused('ended'));
        return this.link.add(user);
    }
    /**
     * What the page sends your route to ring someone into this call, when it was a call between two people: null for a
     * group call joined by its name. `realtime.callToken( user, to, { into: ref } )`.
     */
    get ref() {
        return this.link?.ref ?? null;
    }
    /** The rings into this group call this page heard of, still ringing or ended. */
    invites() {
        return this.link?.invites() ?? [];
    }
    /** @internal Someone is rung into this group call. */
    invited(invite) {
        if (!this.ended)
            this.listeners.fire('invite', [invite], false);
    }
    async publish(source, track) {
        try {
            const options = { source: liveKitSource(this.lib, source), name: source, ...(await this.publishOptions(source, track)) };
            const publication = await this.livekit.localParticipant.publishTrack(track, options);
            this.published.set(source, publication);
            if (source === 'camera')
                this.watchCamera(publication);
        }
        catch (error) {
            this.listeners.fire('error', [{ code: 'publish_failed', source, error }], false);
        }
    }
    /**
     * How a source goes out, as Better Messages' group calls send it (room-publish.ts): a camera in the first codec of
     * the server's policy this browser sends (rtc-client 1.0.8's meshCodecPolicy), by default H.264 where this device
     * encodes it in hardware and VP8 otherwise, with VP8 behind any other for a receiver that decodes none of it, in
     * three layers at 30 frames (one SVC stream of three in VP9 or AV1); a screen in VP8 by default, whole and at half
     * its size. A camera encoded in software is scaled to 720 lines first (fitCameraTrack), the track the app handed in
     * included.
     */
    async publishOptions(source, track) {
        let settings = {};
        try {
            settings = track.getSettings();
        }
        catch {
            /* a track without settings: the library's own layers */
        }
        // the node's settings (rtc-client 1.0.23): each number below is theirs where they give it
        const node = roomSettings(this.livekit);
        if (source === 'camera') {
            const { codec, hardware, backup, height } = await this.cameraChoice(track);
            const camera = cameraPublish(codec, await fitCameraTrack(track, codec, hardware, height, node), backup, node);
            return {
                videoCodec: codec,
                ...(camera ? { simulcast: true, videoEncoding: camera.top, videoSimulcastLayers: camera.layers.map((layer) => this.preset(layer)) } : {}),
                ...(camera?.scalabilityMode ? { scalabilityMode: camera.scalabilityMode } : {}),
                // VP8 (or the policy's H.264) behind any other codec, for a receiver that decodes none of it
                ...(backup ? { backupCodec: { codec: backup, ...(camera?.backup ? { encoding: camera.backup } : {}) } } : {}),
            };
        }
        if (source === 'screen_share') {
            const codec = screenCodecFor(globalThis.navigator?.userAgent ?? '', hardwareFromCaps(await this.capabilities()), this.codecOptions());
            this.screenCodec = codec;
            const screen = screenPublish(settings.width ?? 0, settings.height ?? 0, codec, node);
            // smooth where it can be, sharp where it can't (SCREEN_CONTENT_HINT: marked detail, Chrome dropped two
            // frames in three of a busy screen in H.264), in every codec
            try {
                track.contentHint = screen.contentHint;
            }
            catch {
                // a track that takes no hint goes as it is
            }
            // one picture unless the rule gives a second (screenPublish: VP8 simulcast held a screen to 5 frames)
            return {
                videoCodec: codec,
                screenShareEncoding: screenEncoding(node),
                degradationPreference: screenVideoMode(codec, false, node).degradationPreference,
                // VP9 and AV1 in one layer (SCREEN_SCALABILITY_MODE_SVC)
                ...(screen.scalabilityMode ? { scalabilityMode: screen.scalabilityMode } : {}),
                ...(screen.simulcast && screen.layer
                    ? { simulcast: true, screenShareSimulcastLayers: [this.preset(screen.layer)] }
                    : { simulcast: false }),
            };
        }
        // a microphone at the library's own bitrate, with RED and DTX, unless the node says otherwise; and one its node
        // may ask again for what its upload lost (rtc-client 1.0.27's resend), as this call watches it (micWatch) and
        // makes the room for what it sends again
        if (source === 'microphone') {
            const mic = micPublish(node);
            return {
                resend: mic.resend,
                ...(node?.has('mic.kbps') ? { audioPreset: { maxBitrate: mic.maxBitrate } } : {}),
                ...(node?.has('mic.red') ? { red: mic.red } : {}),
                ...(node?.has('mic.dtx') ? { dtx: mic.dtx } : {}),
            };
        }
        return {};
    }
    /**
     * The node's settings changed on a running call (rtc-client 1.0.23, RoomEvent.MeshSettingsChanged): what it receives
     * asked at the pixel density they say, a shared screen sent as they say now, and a camera whose publish settings
     * changed chosen again at its next turn on, or now, at its moment of the minute, where the revision says applyNow.
     */
    settingsChanged(settings, changed) {
        if (this.ended)
            return;
        applyViewSettings(this.livekit, globalThis.devicePixelRatio);
        const screen = this.published.get('screen_share')?.track;
        if (screen && this.screenCodec && changed.some((key) => key.startsWith('screen.'))) {
            void applyScreenSettings(screen, settings, this.screenCodec).catch(() => { });
        }
        if (!cameraPublishChanged(changed))
            return;
        this.choice = null;
        if (!settings.applyNow || !this.published.has('camera'))
            return;
        clearTimeout(this.applyNowTimer);
        this.applyNowTimer = setTimeout(() => {
            const track = this.wanted.get('camera');
            if (!this.ended && track && this.published.has('camera'))
                void this.setTrack('camera', track);
        }, applyNowDelayMs(this.livekit.localParticipant?.identity ?? ''));
    }
    /**
     * Watches the camera sent for a hardware encoder dropping its frames (encoder-watch.ts): once seen, this browser
     * remembers it, and the next camera, in this call or another, goes out in software.
     */
    watchCamera(publication) {
        this.cameraWatch?.();
        // the track's sender as it is now: a full reconnect publishes the camera again on a new one
        const track = publication?.track;
        // the node's numbers for the watch, as they are at each look (rtc-client 1.0.23)
        this.cameraWatch = track?.sender
            ? watchCameraEncoder(() => track.sender, {
                tune: cameraTune(this.codecOptions().policy),
                settings: () => roomSettings(this.livekit),
                onDrops: () => {
                    this.choice = null;
                },
            })
            : null;
    }
    /** What this browser encodes, asked once a call. */
    capabilities() {
        this.caps ?? (this.caps = probeCodecCaps().catch(() => null));
        return this.caps;
    }
    /**
     * The room as the codec rules see it: encrypted, on the mesh, and the server's policy once joined, from its settings
     * where its node sends them (rtc-client 1.0.23) or its codec policy. A call's camera (`call`), as Better Messages'
     * is: the policy's rules, its check and its tune apply where the node turned them on.
     */
    codecOptions() {
        const h265 = !!this.server && !!this.lib.isMeshServer?.(this.server);
        return { encrypted: this.encrypted, h265, policy: roomPolicy(this.livekit), call: true };
    }
    /**
     * The camera's codec on this device, asked once the room is joined (room-publish.ts): the server's policy, VP8 in
     * an encrypted room, where the room client sends no backup codec, H.265 only on the mesh. Measured first where the
     * node turned the camera check on and a rule names this machine (camera-check.ts), and told to the node.
     */
    cameraChoice(track) {
        this.choice ?? (this.choice = this.capabilities().then(async (caps) => {
            const options = this.codecOptions();
            const agent = globalThis.navigator?.userAgent ?? '';
            if (options.policy?.check !== true || !track)
                return roomCallChoice(caps, agent, options);
            const checked = await checkedCameraChoice(track, caps, agent, options);
            reportMeshCamera(this.livekit, meshCameraReport(checked));
            return checked;
        }));
        return this.choice;
    }
    preset(layer) {
        const Preset = this.lib.VideoPreset;
        return Preset
            ? new Preset(layer.width, layer.height, layer.bitrate, layer.fps)
            : { width: layer.width, height: layer.height, encoding: { maxBitrate: layer.bitrate, maxFramerate: layer.fps } };
    }
    person(participant) {
        const tracks = {};
        const paused = {};
        for (const publication of participant.trackPublications?.values?.() ?? []) {
            const source = kitSource(this.lib, publication.source);
            if (source && publication.track && !publication.isMuted) {
                tracks[source] = publication.track;
                // A remote track's stream state, "paused" while the media server holds it back from this page's download.
                paused[source] = publication.track.streamState === 'paused';
            }
        }
        return {
            identity: participant.identity,
            user: userOf(participant.identity),
            info: this.open(infoOf(participant.metadata), participant),
            camera: tracks.camera ?? null,
            microphone: tracks.microphone ?? null,
            screen: tracks.screen_share ?? null,
            screenAudio: tracks.screen_share_audio ?? null,
            speaking: !!participant.isSpeaking,
            publish: participant.permissions?.canPublish ?? true,
            cameraPaused: !!paused.camera,
            screenPaused: !!paused.screen_share,
            quality: qualityOf(participant.connectionQuality),
            reconnecting: false,
            stalled: this.stalls.of(participant.identity),
            micHeld: holdsMic(participant.permissions?.canPublish ?? true, participant.permissions?.canPublishSources),
        };
    }
    /** Someone left: their tile kept, marked reconnecting and with no media, while they may come back, else gone now. */
    departed(participant, reason) {
        const identity = participant.identity;
        const ms = awayFor(reason, { onMesh: !!this.server && !!this.lib.isMeshServer?.(this.server), byeAt: this.byes.get(identity) });
        const person = this.person(participant);
        this.forgetAway(identity);
        // whatever was said of their media went with their session
        this.readStalls();
        if (ms === 0) {
            this.listeners.fire('person_left', [{ ...person, stalled: null }], false);
            return;
        }
        const away = { ...person, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false, cameraPaused: false, screenPaused: false, stalled: null, reconnecting: true };
        const expire = () => {
            const entry = this.away.get(identity);
            if (!entry || this.ended)
                return;
            // Who is in a room that is reconnecting itself is not known until it is back, so the wait starts over.
            const state = this.livekit.state;
            if (this.state === 'reconnecting' || state === 'reconnecting' || state === 'signalReconnecting') {
                entry.timer = setTimeout(expire, AWAY_MS);
                return;
            }
            this.away.delete(identity);
            if (this.livekit.remoteParticipants.get(identity))
                return;
            this.listeners.fire('person_left', [{ ...entry.person, reconnecting: false }], false);
        };
        this.away.set(identity, { person: away, timer: setTimeout(expire, ms) });
        this.listeners.fire('person_away', [away], false);
    }
    /** Someone kept away is back in the room: their tile is theirs again (`person`, which the caller fires). */
    back(identity) {
        this.forgetAway(identity);
        this.byes.delete(identity);
    }
    forgetAway(identity) {
        const entry = this.away.get(identity);
        if (entry)
            clearTimeout(entry.timer);
        this.away.delete(identity);
    }
    /** What came over the room on a topic of the SDK's. */
    received(payload, participant, topic) {
        if (topic === BYE_TOPIC) {
            if (!participant?.identity)
                return;
            // Hanging up: a departure soon after goes at once, and a tile already kept goes now.
            this.byes.set(participant.identity, Date.now());
            const entry = this.away.get(participant.identity);
            if (entry && !this.livekit.remoteParticipants.get(participant.identity)) {
                this.forgetAway(participant.identity);
                this.listeners.fire('person_left', [{ ...entry.person, reconnecting: false }], false);
            }
            return;
        }
        if (topic !== ASK_TOPIC && topic !== ASK_ANSWER_TOPIC)
            return;
        let message;
        try {
            message = JSON.parse(new TextDecoder().decode(payload));
        }
        catch {
            return;
        }
        if (typeof message?.id !== 'string' || message.id === '')
            return;
        if (topic === ASK_TOPIC) {
            // Only the realtime server sends an ask, after the calls route checked the host: never one a person sent.
            if (participant)
                return;
            const devices = (Array.isArray(message.devices) ? message.devices : []).filter((d) => d === 'camera' || d === 'microphone');
            if (devices.length === 0)
                return;
            const by = typeof message.by === 'string' && message.by.startsWith('user_') ? userOf(message.by) : callUserOf(message.by);
            this.listeners.fire('ask', [{ id: message.id, devices: [...new Set(devices)], by }], false);
            return;
        }
        // An answer comes from the person asked, whose identity the media server vouches for.
        if (!participant?.identity || !ASK_ANSWERS.includes(message.answer))
            return;
        this.listeners.fire('ask_answer', [{ id: message.id, answer: message.answer, from: userOf(participant.identity) }], false);
    }
    /** Whose media stopped reaching the media server, as the mesh says it now: each sender whose verdict changed, said. */
    readStalls() {
        const streams = [];
        for (const participant of this.livekit.remoteParticipants.values()) {
            for (const publication of participant.trackPublications?.values?.() ?? []) {
                const source = kitSource(this.lib, publication.source);
                const kind = source === 'camera' ? 'camera' : source === 'microphone' ? 'microphone' : null;
                const track = publication.track;
                if (!kind || !track)
                    continue;
                streams.push({
                    who: participant.identity,
                    kind,
                    id: publication.trackSid,
                    // muted on their side, turned off here (a hidden tile) or paused for this page's download: held back
                    expected: publication.isSubscribed !== false && !publication.isMuted && publication.isEnabled !== false && track.streamState !== 'paused',
                });
            }
        }
        // the room forgets the list as its connection goes, which is no one's media arriving again
        const dry = this.livekit.meshSourcesDry ?? new Set();
        for (const who of this.stalls.read(streams, dry).keys()) {
            const participant = this.livekit.remoteParticipants.get(who);
            if (!participant)
                continue;
            const person = this.person(participant);
            this.listeners.fire('stalled', [person], false);
            this.listeners.fire('person', [person], false);
        }
    }
    /** A person's info opened; null until its key comes, when they come again as `person`. */
    open(info, participant) {
        if (!this.keys)
            return info;
        const missing = this.keys.missing(info);
        if (missing.length > 0) {
            void this.keys.ensure(missing).then(() => {
                if (!this.ended && this.keys.missing(info).length === 0 && this.livekit.remoteParticipants.get(participant.identity) === participant) {
                    this.listeners.fire('person', [this.person(participant)], false);
                }
            });
            return null;
        }
        const opened = this.keys.openJson(info);
        return opened === undefined ? null : opened;
    }
    setState(state) {
        if (this.ended || this.state === state)
            return;
        this.state = state;
        this.listeners.fire('state', [state], false);
    }
    finish(reason) {
        if (this.ended)
            return;
        // A hang-up from a room still up tells the others first (the bye), so they drop this tile at once.
        const bye = reason === 'left' && this.state === 'connected' && typeof this.livekit.localParticipant?.publishData === 'function';
        this.ended = true;
        this.state = 'ended';
        for (const entry of this.away.values())
            clearTimeout(entry.timer);
        this.away.clear();
        this.stalls.clear();
        this.cameraWatch?.();
        this.cameraWatch = null;
        this.micWatch?.();
        this.micWatch = null;
        clearTimeout(this.applyNowTimer);
        // What it opened for the page closes with it.
        this.local.stop();
        const disconnect = () => {
            try {
                // The page's tracks stay as they are: they are the page's, and a call moving from the room it fell back to
                // into its group call's sends them on there.
                this.livekit.disconnect(false);
            }
            catch {
                /* already gone */
            }
        };
        if (bye)
            this.closed = this.sayBye().then(disconnect);
        else
            disconnect();
        // The encryption worker is the room's alone.
        if (this.encryption)
            setTimeout(() => this.encryption.worker.terminate(), 1000);
        this.listeners.fire('state', ['ended'], false);
        this.listeners.fire('ended', [reason], false);
    }
    /**
     * The bye, as Better Messages' call screen sends it: never held long, as the hang-up goes on whatever becomes of it.
     * It goes over the data channel and the leave over the signal connection, and the media server drops a bye the leave
     * overtakes (about one hang-up in three in its call-tile-reconnect spec), so a sent bye gets 200 ms before the leave.
     */
    async sayBye() {
        let sent = false;
        const bye = Promise.resolve()
            .then(() => this.livekit.localParticipant.publishData(new TextEncoder().encode('1'), { reliable: true, topic: BYE_TOPIC }))
            .then(() => {
            sent = true;
        })
            .catch(() => { });
        await Promise.race([bye, new Promise((resolve) => setTimeout(resolve, 300))]);
        if (sent)
            await new Promise((resolve) => setTimeout(resolve, 200));
    }
}
