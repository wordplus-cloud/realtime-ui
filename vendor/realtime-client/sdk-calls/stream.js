/**
 * A live stream on the app's calls: `calls.stream( name )` asks the app's route
 * for Easy Stream's grant, as `group()` asks for a group call's, joins, and the stream's chat rides the page's one
 * connection, as its rooms do. Easy Stream's engine (`../streams`) runs it; this is the SDK's shape of it, the same object
 * for every role. What a role may not do rejects with the cloud's code (`not_host`, `read_only`, `no_stage` …).
 *
 * The app's users are named by their ids, as its grants name them (`sub`); the cloud's own names for them (`u:<id>`, a
 * place in the room `u:<id>.<8 hex>`) stay inside.
 */
import { Listeners } from '../channel.js';
import { choosableLayers } from '../streams/playback.js';
const refused = (code) => Object.assign(new Error(code), { code });
const userOf = (user) => 'u:' + String(user);
/** The cloud's answer to an action: done, or a refusal with its code. */
async function done(answer) {
    const a = await answer;
    if (!a.ok)
        throw refused(a.error ?? 'failed');
}
/** The tile the stream shows large: the one in the spotlight, a shared screen, OBS's picture, the one speaking, the host. */
function mainTile(tiles, layout) {
    const pictured = tiles.filter((t) => t.camera || t.screen);
    if (layout.mode === 'spotlight' && layout.identity) {
        const spot = pictured.find((t) => t.identity === layout.identity || t.identity.startsWith(layout.identity + '.'));
        if (spot)
            return spot;
    }
    return pictured.find((t) => t.screen)
        ?? pictured.find((t) => t.encoder)
        ?? (layout.mode === 'speaker' ? pictured.find((t) => t.speaking) : undefined)
        ?? pictured.find((t) => t.role === 'host')
        ?? pictured[0];
}
export class Stream {
    /** @internal */
    constructor(name, engine) {
        this.name = name;
        this.listeners = new Listeners();
        /** The stream as it is now, for a screen of one's own; `subscribe` hears every change (React's useSyncExternalStore). */
        this.snapshot = () => this.last;
        this.subscribe = (fn) => this.engine.subscribe(fn);
        /** The chat: writing, and for its moderators, keeping it. */
        this.chat = {
            send: (text) => done(this.engine.sendChat(text)),
            delete: (id) => done(this.engine.deleteMessage(id)),
            pin: (id) => done(this.engine.pin(id)),
            unpin: () => done(this.engine.unpin()),
            timeout: (user, seconds) => done(this.engine.timeOut(userOf(user), seconds)),
            slow: (seconds) => done(this.engine.setSlow(seconds)),
            clear: () => done(this.engine.clearChat()),
        };
        this.engine = engine;
        this.last = engine.getState();
        this.unsubscribe = engine.subscribe(() => this.changed());
    }
    /** `host`, `guest` or `viewer`, as the app's grant made this user. */
    get role() {
        return this.last.you?.role ?? null;
    }
    /** `idle` before it starts, `live`, `ended`. */
    get state() {
        return this.last.stream?.state ?? 'idle';
    }
    /** How many watch now. */
    get viewers() {
        return this.last.viewers;
    }
    /** Everyone on the stage, with their pictures and sound (`camera`, `screen`, `audio`: the room client's tracks). */
    get tiles() {
        return this.last.tiles;
    }
    /** The chat's last messages, oldest first. */
    get messages() {
        return this.last.chat;
    }
    /** Whether this page waits for a place: the stream is full, and the join goes on by itself. */
    get waiting() {
        return this.last.media === 'waiting';
    }
    /** The hands raised to come on stage, the oldest first: its hosts see them, a viewer none but their own (`handRaised`). */
    get hands() {
        return this.last.hands.map((hand) => ({ user: hand.identity.replace(/^u:/, ''), name: hand.name, at: hand.at }));
    }
    /** Whether this page is on stage as a guest, sending its camera and microphone. */
    get onStage() {
        return this.last.onStage;
    }
    /**
     * `state` (StreamState), `viewers` (n), `tiles` (StreamTile[]), `message` (ChatMessage, each one new), `hands`
     * (StreamHand[], for its hosts), `invited` (a host asks this user on stage: `joinStage()`), `stage` (whether this page
     * is on stage now), `waiting` ({ until }: full), `error` ({ code }), `change` (any of it).
     */
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /**
     * Shows the stream in `video`: the stage's main picture, as it changes, and its sound. Answers a function that
     * stops showing it there.
     */
    watch(video) {
        let shown = null;
        const sounds = new Map();
        const draw = () => {
            const state = this.engine.getState();
            const main = mainTile(state.tiles, state.layout);
            const track = main ? (main.screen ?? main.camera) : null;
            if (shown !== track) {
                shown?.detach(video);
                track?.attach(video);
                shown = track;
            }
            const playing = new Set(state.tiles.flatMap((t) => t.audio));
            for (const [t, el] of sounds)
                if (!playing.has(t)) {
                    t.detach(el);
                    sounds.delete(t);
                }
            for (const t of playing)
                if (!sounds.has(t))
                    sounds.set(t, t.attach());
        };
        this.engine.wantVideo();
        draw();
        const off = this.engine.subscribe(draw);
        return () => {
            off();
            shown?.detach(video);
            for (const [t, el] of sounds)
                t.detach(el);
            sounds.clear();
            shown = null;
        };
    }
    /**
     * The stream's sound, where the browser held it back until a click (`snapshot().audioBlocked`): call it from one,
     * such as a "Turn the sound on" button.
     */
    startAudio() {
        return this.engine.startAudio();
    }
    /**
     * How the stream plays here, to debug it: the picture and the sound that arrive, the media server and the way they
     * come, and the session so far (how long the picture took to start, stalls, reconnects), with the last things that
     * happened. Measured in this browser once a second while the picture comes, and sent nowhere.
     */
    stats() {
        return this.engine.playbackStats();
    }
    /**
     * The layers of the main picture a viewer may choose, the best first, each `high`, `medium` or `low` with its size:
     * what `setQuality()` chooses from. None above 720p, which comes only on `auto`, to a player big enough for it. None
     * before the picture arrives, and for a host's own.
     */
    qualities() {
        const state = this.engine.getState();
        const main = mainTile(state.tiles, state.layout);
        return choosableLayers(this.engine.pictureLayers(main ? (main.screen ?? main.camera) : null));
    }
    /**
     * The picture's quality: one of the layers `qualities()` gives whatever the player's size, or `auto`, the default, by
     * its size. A layer above 720p chosen still gives 720p.
     */
    setQuality(quality) {
        this.engine.setQuality(quality);
    }
    /**
     * A reaction everyone watching sees float up: any one emoji. The player offers ❤️ 👏 😂 😮 🔥 unless the page offers
     * its own.
     */
    react(kind) {
        this.engine.react(kind);
    }
    /** Asks to come on stage, or no longer. */
    hand(up) {
        return done(this.engine.raiseHand(up));
    }
    /** Comes on stage when invited (`invited`), with the camera and microphone. */
    joinStage() {
        return done(this.engine.acceptStage());
    }
    async leaveStage() {
        await this.engine.leaveStage();
    }
    // A host's and a guest's: what this page sends.
    /** The camera and microphone, shown here before going live. */
    async preview(devices = { camera: true, microphone: true }) {
        await this.engine.startPreview(devices);
    }
    async setCamera(on) {
        await this.engine.setCamera(on);
    }
    async setMicrophone(on) {
        await this.engine.setMicrophone(on);
    }
    /** Shares a screen in place of the camera, or stops; whether it is shared now. */
    setScreenShare(on) {
        return this.engine.setScreenShare(on);
    }
    // A host's.
    goLive() {
        return done(this.engine.goLive());
    }
    end() {
        return done(this.engine.end());
    }
    /** Asks someone who raised a hand, or anyone watching, on stage; `unstage` takes them off. */
    invite(user) {
        return done(this.engine.invite(userOf(user)));
    }
    unstage(user) {
        return done(this.engine.unstage(userOf(user)));
    }
    /** How the stage shows: everyone in a grid, the one speaking large, or one person in the spotlight. */
    layout(mode, user) {
        return done(this.engine.setLayout(mode, user === undefined ? undefined : userOf(user)));
    }
    /** Where OBS streams to, over WHIP, and its key; `renew` makes a new key, which cuts off one using the old. */
    async ingest(renew = false) {
        await done(this.engine.useEncoder(renew));
        const encoder = this.engine.getState().encoder;
        if (!encoder)
            throw refused('no_encoder');
        return { url: encoder.url, key: encoder.key };
    }
    // A moderator's.
    kick(user) {
        return done(this.engine.kick(userOf(user)));
    }
    ban(user) {
        return done(this.engine.ban(userOf(user)));
    }
    /** Leaves the stream: its picture, what this page sends, and its chat. */
    leave() {
        this.unsubscribe();
        this.engine.stop();
        this.listeners.off();
    }
    changed() {
        const was = this.last;
        const now = this.engine.getState();
        this.last = now;
        if ((now.stream?.state ?? 'idle') !== (was.stream?.state ?? 'idle'))
            this.listeners.fire('state', [now.stream?.state ?? 'idle'], false);
        if (now.viewers !== was.viewers)
            this.listeners.fire('viewers', [now.viewers], false);
        if (now.tiles !== was.tiles)
            this.listeners.fire('tiles', [now.tiles], false);
        if (now.chat !== was.chat) {
            const seen = new Set(was.chat.map((m) => m.id));
            for (const m of now.chat)
                if (!seen.has(m.id))
                    this.listeners.fire('message', [m], false);
        }
        if (now.hands !== was.hands)
            this.listeners.fire('hands', [this.hands], false);
        if (now.invited && !was.invited)
            this.listeners.fire('invited', [], false);
        if (now.onStage !== was.onStage)
            this.listeners.fire('stage', [now.onStage], false);
        if (now.media === 'waiting' && was.media !== 'waiting')
            this.listeners.fire('waiting', [{ until: now.waitUntil }], false);
        if (now.status === 'error' && now.error && now.error !== was.error)
            this.listeners.fire('error', [{ code: now.error }], false);
        this.listeners.fire('change', [now], false);
    }
}
