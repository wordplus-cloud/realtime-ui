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
import { encryptionWorker, kitSource, liveKitSource, MESH_JOIN_BUDGET_MS } from './media.js';
import { probeCodecCaps } from '../calls/codecs.js';
import { watchCameraEncoder } from '../calls/encoder-watch.js';
import { callUserOf } from '../calls/users.js';
import { checkedCameraChoice, meshCameraReport, reportMeshCamera } from '../calls/camera-check.js';
import { applyViewSettings, roomPolicy, roomSettings } from '../calls/room-settings.js';
import { applyNowDelayMs, applyScreenSettings, cameraPublish, cameraPublishChanged, cameraTune, fitCameraTrack, hardwareFromCaps, micPublish, roomCallChoice, roomPixelDensity, screenCodecFor, screenEncoding, screenPublish, screenVideoMode, } from '../calls/room-publish.js';
const refused = (code) => Object.assign(new Error(code), { code });
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
        return video && typeof video === 'object' ? { publish: video.canPublish !== false, subscribe: video.canSubscribe !== false, ...(video.roomAdmin === true ? { admin: true } : {}) } : null;
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
    if (!extras.key)
        return new GroupCall(lib, options, keys, { group: extras.group, moderate: extras.moderate });
    if (!lib.ExternalE2EEKeyProvider || !lib.isE2EESupported?.())
        throw refused('encryption_unsupported');
    const worker = await encryptionWorker(extras.worker, extras.rooms);
    return new GroupCall(lib, options, keys, { encryption: { key: extras.key, worker }, group: extras.group, moderate: extras.moderate });
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
 * `person` (Person: someone arrived, or what they send or may send changed), `person_left` (Person), `speakers`
 * (Person[]), `invite` (Invite: someone is rung into this group call), `permissions` (RoomPermissions: the site's server
 * changed what this page may do), `error` ({ code }: `publish_failed`, `encryption_failed`), and `ended` (the reason).
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
        this.ended = false;
        // the shared screen's codec, for its live settings
        this.screenCodec = null;
        this.caps = null;
        this.choice = null;
        // the camera's sender watched for a hardware encoder dropping its frames (encoder-watch.ts); its stop
        this.cameraWatch = null;
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
        this.group = this.link?.id ?? null;
        // Two connections, a publisher and a subscriber, as Better Messages' call client asks: the mesh's mediasoup
        // engine doesn't serve one connection both ways (/rtc/v1), so asking for it costs a refused try on every join.
        // Tiles ask layers at the screen's pixel density up to 1.5, as Better Messages' (room-publish.ts).
        this.livekit = new lib.Room({
            adaptiveStream: { pixelDensity: roomPixelDensity(globalThis.devicePixelRatio) },
            dynacast: true,
            singlePeerConnection: false,
            ...options,
        });
        const E = lib.RoomEvent;
        // Nothing after the room ended: the room client still says who left as it disconnects.
        const changed = (participant) => !this.ended && this.listeners.fire('person', [this.person(participant)], false);
        this.livekit.on(E.ParticipantConnected, changed);
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
        this.livekit.on(E.ParticipantDisconnected, (participant) => !this.ended && this.listeners.fire('person_left', [this.person(participant)], false));
        // The site's server changed what someone may do (its `permit`): this page's, or another person's.
        this.livekit.on(E.ParticipantPermissionsChanged, (_previous, participant) => {
            if (this.ended || !participant)
                return;
            if (!participant.isLocal)
                return changed(participant);
            const can = this.can;
            // The media server took down what it sent: nothing of it is sent again on a reconnect, nor kept for later.
            if (!can.publish) {
                this.published.clear();
                this.wanted.clear();
            }
            this.listeners.fire('permissions', [can], false);
            // Let speak: what the page set while it could not send goes out now, with no second try of its own.
            if (can.publish)
                void this.publishWanted();
        });
        this.livekit.on(E.ActiveSpeakersChanged, (speakers) => !this.ended && this.listeners.fire('speakers', [speakers.filter((p) => !p.isLocal).map((p) => this.person(p))], false));
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
        // The room has the last word: the site's server may have changed it since the token was signed.
        const now = this.can;
        if (now.publish !== before.publish || now.subscribe !== before.subscribe)
            this.listeners.fire('permissions', [now], false);
        await this.publishWanted();
        for (const participant of this.livekit.remoteParticipants.values())
            this.listeners.fire('person', [this.person(participant)], false);
    }
    /** What this page may do in the room now: the site's rule, or what its server changed since (`permissions`). */
    get can() {
        const permissions = this.livekit.localParticipant?.permissions;
        // Hosting is the token's alone: the room's own permissions don't carry it.
        const admin = this.granted?.admin ? { admin: true } : {};
        if (permissions)
            return { publish: permissions.canPublish ?? true, subscribe: permissions.canSubscribe ?? true, ...admin };
        return this.granted ?? { publish: true, subscribe: true };
    }
    /**
     * What a host does to someone else in the call (`ModerationAct`), through the site's calls route, which asks the
     * call's rule again and takes it from a host alone (its `admin`). Whether it changed anything. Rejects with its
     * `code`: `forbidden` for a page that isn't the host, `not_moderated` for a room that isn't a named group call.
     */
    async moderate(act, user) {
        if (!this.moderator)
            throw refused('not_moderated');
        return this.moderator(act, user);
    }
    /** Sends what the page set and the room doesn't have yet, while this page may send. */
    async publishWanted() {
        if (!this.can.publish || this.ended)
            return;
        for (const [source, track] of this.wanted)
            if (!this.published.has(source))
                await this.publish(source, track);
    }
    /** This page's own user in the room, as the others see them: their info as the site gave it. Null until connected. */
    get self() {
        const local = this.livekit.localParticipant;
        return local?.identity ? this.person(local) : null;
    }
    /** Everyone else in the room. */
    people() {
        return [...this.livekit.remoteParticipants.values()].map((p) => this.person(p));
    }
    /** What this page sends from a source: a track, or null to stop sending it. Kept for a room still connecting. */
    async setTrack(source, track) {
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
        if (track && this.can.publish)
            await this.publish(source, track);
    }
    leave() {
        this.finish('left');
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
        // a microphone at the library's own bitrate, with RED and DTX, unless the node says otherwise
        if (source === 'microphone' && node && ['mic.kbps', 'mic.red', 'mic.dtx'].some((key) => node.has(key))) {
            const mic = micPublish(node);
            return {
                ...(node.has('mic.kbps') ? { audioPreset: { maxBitrate: mic.maxBitrate } } : {}),
                ...(node.has('mic.red') ? { red: mic.red } : {}),
                ...(node.has('mic.dtx') ? { dtx: mic.dtx } : {}),
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
        };
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
        this.ended = true;
        this.state = 'ended';
        this.cameraWatch?.();
        this.cameraWatch = null;
        clearTimeout(this.applyNowTimer);
        try {
            // The page's tracks stay as they are: they are the page's, and a call moving from the room it fell back to
            // into its group call's sends them on there.
            this.livekit.disconnect(false);
        }
        catch {
            /* already gone */
        }
        // The encryption worker is the room's alone.
        if (this.encryption)
            setTimeout(() => this.encryption.worker.terminate(), 1000);
        this.listeners.fire('state', ['ended'], false);
        this.listeners.fire('ended', [reason], false);
    }
}
