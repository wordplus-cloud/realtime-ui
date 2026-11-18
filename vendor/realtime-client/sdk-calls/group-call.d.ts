import { type RealtimeErrorEvent } from '../errors.js';
import type { Keyring } from '../keys.js';
import { LocalDevices, type DeviceLists, type DeviceOptions } from './devices.js';
import type { Invite } from './invite.js';
import { type LiveKit, type MediaSource } from './media.js';
import type { P2PQuality } from '../calls/types.js';
import { type CallUser } from '../calls/users.js';
import { type Stalled } from '../calls/stall-watch.js';
/** How a connection is, as the media server rates it, or as a call between two measures it. */
export type CallQuality = P2PQuality;
/** A track another person sends: show it with `attach( element )`, stop with `detach()`. */
export interface RemoteTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    attach(element: HTMLMediaElement): HTMLMediaElement;
    detach(element?: HTMLMediaElement): HTMLMediaElement[];
}
/** Another person in a room, as the room shows them. */
export interface Person {
    /** The room's name for them: `user_<id>`. */
    identity: string;
    /** Their user id on the site: a number for an id of digits (a visitor's negative one too), else the id of text the site gave. */
    user: CallUser | null;
    /** What the site's token said about them: their name, their picture … opened (the site seals it with the day's key). */
    info: unknown;
    camera: RemoteTrack | null;
    microphone: RemoteTrack | null;
    screen: RemoteTrack | null;
    screenAudio: RemoteTrack | null;
    speaking: boolean;
    /** Whether they may send their camera, microphone and screen: the site's rule, or what its server changed since. */
    publish: boolean;
    /**
     * Their camera or screen as the media server paused it for this page, whose download can't carry it now: the
     * picture stays on its last frame until it comes again, by itself, and a screen should say why.
     */
    cameraPaused: boolean;
    screenPaused: boolean;
    /** How their connection is, as the media server rates it: `person` comes again when it changes. */
    quality: CallQuality;
    /**
     * They left and may come back (a reload, a dropped connection, a move between nodes): their tile is kept, with no
     * media, marked so, until they are back (`person`) or `person_left` after the wait (20 s). `person_away` says it.
     */
    reconnecting: boolean;
    /**
     * Their media stopped reaching the media server while they are still in the room, as the mesh says it: `video` when
     * only their camera stopped, `all` when their sound did too. Null while it arrives, or from a server that doesn't say.
     */
    stalled: Stalled | null;
    /** A host holds their microphone off (`holdMic()`), or Mute Everyone does, until it is let go. */
    micHeld: boolean;
}
/** What this page may do in the room, as the media server holds it now. */
export interface RoomPermissions {
    /** Send its camera, microphone and screen. */
    publish: boolean;
    /** Get those of the others. */
    subscribe: boolean;
    /** Host the call, as its rule's `admin` said: `moderate()` mutes, lets speak and removes the others. */
    admin?: boolean;
    /**
     * Its microphone is held off by a host or Mute Everyone, its camera and screen still allowed: `setMicrophone( true )`
     * rejects with `mic_held` until a host lets it go (`permissions` again).
     */
    micHeld?: boolean;
}
/**
 * What a host does to someone else in a group call (`moderate()`): `mute` turns their microphone off once, which they
 * may turn on again, `speak` lets a listener send, `listen` makes a speaker a listener, `remove` takes them out (a kick:
 * a new token takes them back in, unless the call is locked). `spotlight` puts someone, the host too, on the main tiles
 * for everyone (up to four, the room's `spotlight`), and `unspotlight` takes them off, or everyone with no user.
 *
 * Offered only where `acts` names them (a server and an app's package that know them): `ban` keeps them out for the
 * minutes given, by default until the call ends, and `unban` lets them in again; `hold_mic` holds their microphone off
 * until the call ends, and `release_mic` lets it go; `rules` sets the room's rules (`RoomRules`); `ask` asks them to turn
 * on their camera or microphone; `end` ends the call for everyone.
 */
export type ModerationAct = 'mute' | 'speak' | 'listen' | 'remove' | 'spotlight' | 'unspotlight' | 'ban' | 'unban' | 'hold_mic' | 'release_mic' | 'rules' | 'ask' | 'end';
/**
 * What a group call offers, as the realtime server's place and the app's server package both name it (`acts`): the
 * screen shows a control only for an act named here. `hand` is raising hands, for everyone; the rest are a host's.
 */
export type CallAct = 'remove' | 'ban' | 'listen' | 'speak' | 'mute' | 'hold_mic' | 'release_mic' | 'rules' | 'hand' | 'ask' | 'end' | 'spotlight';
/** Every act, in the order the protocol lists them. */
export declare const CALL_ACTS: readonly CallAct[];
/** What every server and package took before `acts` was named (1.1.0): a host's mute, speak, listen, remove and spotlight. */
export declare const BASE_ACTS: readonly CallAct[];
/**
 * What a group call offers: the acts both the realtime server's place and the app's package name, in CALL_ACTS's order;
 * BASE_ACTS where either names none, as a 1.1.0-era server or package does, so nothing new is offered there.
 */
export declare function actsOf(server: unknown, app: unknown): CallAct[];
/**
 * The room's rules, which hold until it empties: `broadcast` mode lets only those a host promotes send, `locked` keeps
 * out anyone who wasn't in the call (someone who was gets back in after a reload, unless removed), `muted` holds every
 * microphone off but a host's. The room's metadata, so a page that joins later has them, and every host's screen follows.
 */
export interface RoomRules {
    mode: 'broadcast' | 'participatory';
    locked: boolean;
    muted: boolean;
}
/** What a host may ask someone to turn on. */
export type AskDevice = 'camera' | 'microphone';
/** What the person asked answers, as Better Messages' screen says it: turned on, not now, the browser blocked it, no such device, in use. */
export type AskAnswer = 'on' | 'not_now' | 'blocked' | 'no_device' | 'busy';
export declare const ASK_ANSWERS: readonly AskAnswer[];
/** A host asks this page's user to turn on a camera or microphone (`ask`): the ask's id, what, and which host. */
export interface CallAsk {
    id: string;
    devices: AskDevice[];
    by: CallUser | null;
}
/** Someone's answer to this page's ask (`ask_answer`), sent to this page alone. */
export interface CallAskAnswer {
    id: string;
    answer: AskAnswer;
    from: CallUser | null;
}
/** What the calls route answers a host's act: whether it changed anything, an ask's id, the rules now. */
export interface ModerationAnswer {
    done: boolean;
    id?: string;
    rules?: Partial<RoomRules>;
}
/** What a host's act carries beyond its user: a ban's minutes, an ask's devices, the rules to set. */
export interface ModerationOptions {
    minutes?: number;
    devices?: AskDevice[];
    rules?: Partial<RoomRules>;
}
/** A room's rules as its metadata says them: participatory, unlocked and unmuted where it says nothing. */
export declare function rulesOf(metadata: unknown): RoomRules;
/** Whose hands are up in a room, as its metadata says: the media server's identities, once each, in the order raised. */
export declare function handsOf(metadata: unknown): string[];
export type GroupCallState = 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'ended';
/** Where a room is, as the server's `room` answer and a hand-off name it. */
export interface GroupCallPlace {
    server: string;
    token: string;
    iceServers?: RTCIceServer[];
    /** The realtime server holds this page's microphone off as it joins (a host's hold, or Mute Everyone). */
    micHeld?: boolean;
}
/** A group call made from a call between two people: who may be rung into it, and the rings so far. */
export interface GroupLink {
    /** The group call's id: the call's it was made from. */
    id: string;
    /** What the page sends the app's route to ring someone into this call (`callToken( user, to, { into: ref } )`). */
    ref: string;
    add(user: CallUser): Promise<Invite>;
    invites(): Invite[];
}
export interface RoomExtras {
    /** The key everyone in the room encrypts their media with, which only the site gives out, and the worker that does it. */
    encryption?: {
        key: string;
        worker: Worker;
    };
    group?: GroupLink;
    /** A named group call's moderation, through the site's calls route (Calls.group()). */
    moderate?: (act: ModerationAct, user: CallUser | null, options?: ModerationOptions) => Promise<ModerationAnswer>;
    /** A named group call's hands, through the site's calls route: this page's own, or a host lowering another's (or everyone's, null). */
    hand?: (up: boolean, user?: CallUser | null) => Promise<boolean>;
    /** What the server's place and the app's package both offer (actsOf()); by default BASE_ACTS where there is a moderator. */
    acts?: CallAct[];
    /** A named group call's recording, through the site's calls route (Calls.group()). */
    record?: (action: 'start' | 'stop', recording?: string) => Promise<GroupRecording>;
    /** Whether the site's answer said this page's user may record it. */
    mayRecord?: boolean;
}
/** A group call's recording, as the site's calls route answers: its id, and its state (`recording`, `stopping` …). */
export interface GroupRecording {
    id: string;
    state: string;
}
/** Who is in a room's spotlight, as its metadata says: the media server's identities, once each, at most four. */
export declare function spotlightOf(metadata: unknown): string[];
/**
 * A room, its encryption worker started first when the site gave a key: refused with `encryption_unsupported` in a
 * browser that can't encrypt each frame, since it could neither send to the others nor see what they send.
 */
export declare function openRoom(lib: LiveKit, options: Record<string, unknown>, keys: Keyring | null, extras?: {
    key?: string | null;
    worker?: string;
    rooms?: string;
} & Omit<RoomExtras, 'encryption'>): Promise<GroupCall>;
/** What a group call's events give their listeners. */
export interface GroupCallEvents {
    state: [state: GroupCallState];
    waiting: [wait: {
        until: number;
        reason: string;
    }];
    person: [person: Person];
    person_left: [person: Person];
    /** Someone left and may come back: their tile is kept, `reconnecting`, until `person` (back) or `person_left`. */
    person_away: [person: Person];
    /** Someone's media stopped reaching the media server, or arrives again: their `stalled`. */
    stalled: [person: Person];
    /** The room's rules changed, by any host: as it joins too. */
    rules: [rules: RoomRules];
    /** The hands up changed, by their users, in the order raised: as it joins too. */
    hands: [users: CallUser[]];
    /** A host asks this page's user to turn on a camera or microphone: `answerAsk()`. */
    ask: [ask: CallAsk];
    /** Someone answered this page's ask (`askToTurnOn()`). */
    ask_answer: [answer: CallAskAnswer];
    speakers: [people: Person[]];
    invite: [invite: Invite];
    permissions: [can: RoomPermissions];
    spotlit: [users: CallUser[]];
    /** @deprecated The same by the media server's identities: `spotlit` names users, as a host's acts take them. */
    spotlight: [identities: string[]];
    recording: [recording: boolean];
    autoplay_blocked: [];
    quality: [quality: CallQuality];
    error: [error: RealtimeErrorEvent];
    ended: [reason: string];
}
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
export declare class GroupCall {
    private readonly lib;
    private readonly keys;
    state: GroupCallState;
    /** @internal The room client's own room. */
    readonly livekit: any;
    /** Whether everyone's media in it is encrypted end to end, with a key only the site gives out. */
    readonly encrypted: boolean;
    /** The group call's id, for a call between two people that became one; null for any other room. */
    readonly group: string | null;
    private readonly listeners;
    private readonly published;
    private readonly wanted;
    private granted;
    private readonly encryption;
    private readonly link;
    private readonly moderator;
    private readonly recorder;
    private readonly mayRecord;
    private readonly hander;
    /**
     * What this group call offers (CallAct): the acts the realtime server's place and the app's package both name, so a
     * screen shows a control only for those. Today's five host acts with a 1.1.0-era server or package, none in a room
     * with no host acts (a call's own room).
     */
    readonly acts: readonly CallAct[];
    private readonly away;
    private readonly byes;
    private readonly stalls;
    private saidRules;
    private saidHands;
    private heldAtJoin;
    private ended;
    private local;
    /**
     * @param keys the page's keyring, which opens what the site said about each person; a person whose key it has to ask
     *             the site for comes again as `person` once it has it.
     * @param extras the key and worker of an encrypted room (openRoom() starts the worker), and a group call's link.
     */
    constructor(lib: LiveKit, options?: Record<string, unknown>, keys?: Keyring | null, extras?: RoomExtras);
    on<K extends keyof GroupCallEvents>(event: K, fn: (...args: GroupCallEvents[K]) => void): this;
    off<K extends keyof GroupCallEvents>(event: K, fn?: (...args: GroupCallEvents[K]) => void): this;
    /** Joins the room at its place. */
    connect(place: GroupCallPlace): Promise<void>;
    /** The rules and hands, each said when it changed (or as the room joins). */
    private stateChanged;
    /**
     * The room's rules (Broadcast Mode, Lock and Mute Everyone), as the realtime server keeps them in its metadata until
     * the room empties: participatory, unlocked and unmuted from a server that keeps none. `rules` when they change.
     */
    get rules(): RoomRules;
    /** Whose hands are up, by their user ids, in the order raised: room state until lowered or their owner leaves. */
    get hands(): CallUser[];
    /** Whether this page's user has a hand up. */
    get handRaised(): boolean;
    private spotlightChanged;
    /**
     * Who a host put on the main tiles for everyone, in the order they were, by their user ids, as `spotlightOn()` takes
     * them: the room's state, so a page that joins later has it too.
     */
    get spotlit(): CallUser[];
    /**
     * The same by the media server's identity (Person's `identity`, `self`'s for this page's own user).
     * @deprecated `spotlit` names users, as a host's acts take them.
     */
    get spotlight(): string[];
    /** How this page's own connection is, as the media server rates it (`quality` when it changes). */
    get quality(): CallQuality;
    /** Whether the browser holds the sound back until a click: `autoplay_blocked` says so as it happens. */
    get audioBlocked(): boolean;
    /** The sound of the others, where the browser held it back: call it from a click, such as a Turn On Sound button. */
    startAudio(): Promise<void>;
    /** What this page may do in the room now: the site's rule, or what its server changed since (`permissions`). */
    get can(): RoomPermissions;
    /**
     * What a host does to someone else in the call (`ModerationAct`), through the site's calls route, which asks the
     * call's rule again and takes it from a host alone (its `admin`). Whether it changed anything. `user` is null only
     * for `unspotlight`, which then takes everyone off the main tiles. Rejects with its `code`: `forbidden` for a page
     * that isn't the host, `not_moderated` for a room that isn't a named group call, `spotlight_full` for a fifth
     * person in the spotlight.
     */
    moderate(act: ModerationAct, user: CallUser | null, options?: ModerationOptions): Promise<boolean>;
    /** A host's act through the calls route, the route's whole answer: refused here for an act this call doesn't offer. */
    private act;
    /** A host turns someone's microphone off once, which they may turn on again. Rejects as `moderate()` does. */
    mute(user: CallUser): Promise<boolean>;
    /**
     * A host takes someone out of the call: a kick, so a new token takes them back in, unless the call is locked, which
     * then keeps them out. The tokens signed for them before do not take them back in.
     */
    remove(user: CallUser): Promise<boolean>;
    /**
     * A host takes someone out and keeps them out for `minutes`, by default until the call ends, whatever token they
     * bring: a join rejects with `banned`. Where `acts` has `ban`; rejects with `forbidden` for another host.
     */
    ban(user: CallUser, minutes?: number): Promise<boolean>;
    /** A host lets someone banned from the call in again. Where `acts` has `ban`. */
    unban(user: CallUser): Promise<boolean>;
    /**
     * A host holds someone's microphone off until the call ends, or `releaseMic()`, through a reload too: their
     * `micHeld`, and their page can't turn it on. Where `acts` has `hold_mic`.
     */
    holdMic(user: CallUser): Promise<boolean>;
    /** A host lets a held microphone go: the person may turn it on again. Where `acts` has `release_mic`. */
    releaseMic(user: CallUser): Promise<boolean>;
    /**
     * A host sets the room's rules, any of them (`RoomRules`), which hold until the room empties: the rules now, which
     * every page hears as `rules`. Broadcast Mode makes everyone but the hosts a listener and Participatory lets them
     * speak again, each dropping who was promoted or made a listener; Mute Everyone holds every microphone but a host's,
     * and turning it off lets them go; Lock keeps out anyone not already in. Where `acts` has `rules`.
     */
    setRules(rules: Partial<RoomRules>): Promise<RoomRules>;
    /**
     * A host asks someone to turn on their camera or microphone: the ask's id, which their answer names
     * (`ask_answer`). Rejects with `asked_recently` for the same ask within 30 s. Where `acts` has `ask`.
     */
    askToTurnOn(user: CallUser, devices: AskDevice[]): Promise<string>;
    /** Answers a host's ask (`ask`), to that host alone: what came of it, nothing more of this page's devices. */
    answerAsk(ask: CallAsk, answer: AskAnswer): Promise<void>;
    /**
     * A host ends the call for everyone: each is taken out (`ended` with `closed`), the tokens signed before don't take
     * them back, and what the call held goes with it, so a join after it starts a new call. Where `acts` has `end`.
     */
    end(): Promise<boolean>;
    /** This page's user raises a hand, which stays up, for every host to see (`hands`), until lowered or they leave. Where `acts` has `hand`. */
    raiseHand(): Promise<boolean>;
    /**
     * Lowers this page's user's hand, or as a host another's, or everyone's with null. Where `acts` has `hand`; another's
     * rejects with `forbidden` for anyone but a host.
     */
    lowerHand(user?: CallUser | null): Promise<boolean>;
    private handVia;
    /** A host lets a listener send their camera, microphone and screen. */
    letSpeak(user: CallUser): Promise<boolean>;
    /** A host makes a speaker a listener: what they send stops. */
    makeListener(user: CallUser): Promise<boolean>;
    /** A host puts someone, themselves too, on the main tiles for everyone, up to four. A fifth rejects with `spotlight_full`. */
    spotlightOn(user: CallUser): Promise<boolean>;
    /** A host takes someone off the main tiles, or everyone with no user. */
    spotlightOff(user?: CallUser | null): Promise<boolean>;
    /** Whether the room says it is being recorded, by whoever started it: the media server's flag (`recording` event). */
    get isRecording(): boolean;
    /**
     * Whether to offer this page's user a recording of the call: the site's answer said they may (its rule's `record`,
     * else its `admin`), of a named group call, whose media the recorder can read.
     */
    get canRecord(): boolean;
    /**
     * Starts recording the call through the site's calls route, which asks the call's rule again: the recording, its id
     * and state. Rejects with its `code`: `forbidden` for anyone the rule doesn't let record, `not_moderated` for a room
     * that isn't a named group call, or WordPlus Cloud's refusal (`no_credits`, `not_included`, `already_recording` …).
     */
    startRecording(): Promise<GroupRecording>;
    /** Stops the recording `id` of the call, as `startRecording` answered it: the recording, being stopped. Rejects as it does. */
    stopRecording(id: string): Promise<GroupRecording>;
    /** Sends what the page set and the room doesn't have yet, while this page may send. */
    private publishWanted;
    /** A source this page may not send now though it may send: the microphone a host holds off. */
    private refuses;
    /** This page's own user in the room, as the others see them: their info as the site gave it. Null until connected. */
    get self(): Person | null;
    /** Everyone else in the room, and those who left and may come back, marked `reconnecting`. */
    people(): Person[];
    /**
     * The browser's camera, opened and sent, or stopped with false: the device named, the one last named, or the browser's
     * own choice, and named while on, it moves there. Closed as the call ends. Rejects with its `code`: `not_allowed` for a
     * listener, `device_denied`, `device_missing`, `device_busy` or `no_devices`.
     */
    setCamera(on: boolean, options?: DeviceOptions): Promise<void>;
    /** The browser's microphone, as `setCamera()` has its camera; rejects with `mic_held` while a host holds it off. */
    setMicrophone(on: boolean, options?: DeviceOptions): Promise<void>;
    /** Shares a screen, its sound with it where the browser gives it, or stops: whether one is shared now. */
    setScreenShare(on: boolean): Promise<boolean>;
    /** Where the others' voices play, one of `devices().speakers`, on a browser that lets a page choose. */
    setSpeaker(deviceId: string): Promise<void>;
    /** The cameras, microphones and speakers this browser has. Their names are empty until the browser gave the site one. */
    devices(): Promise<DeviceLists>;
    /** What this page sends now, for a picture of its own: `video.srcObject = new MediaStream( [ group.camera ] )`. */
    get camera(): MediaStreamTrack | null;
    get microphone(): MediaStreamTrack | null;
    get screen(): MediaStreamTrack | null;
    /** @internal A call that became this group call goes on with the devices it opened. */
    takeDevices(devices: LocalDevices): void;
    /** What this page sends from a source: a track of your own, or null to stop sending it. Kept for a room still connecting. */
    setTrack(source: MediaSource, track: MediaStreamTrack | null): Promise<void>;
    /**
     * Hangs up: `ended` (`left`) at once, and the others are told first (a bye over the room), so they drop this page's
     * tile at once rather than keep it for a return. Resolves once the room is left.
     */
    leave(): Promise<void>;
    private closed;
    /**
     * Rings `user` into this group call, a call between two people that became one: they arrive as a `person` once they
     * answer. Rejects with its `code`: `not_a_call` for any other room, or the site's or the server's refusal.
     */
    add(user: CallUser): Promise<Invite>;
    /**
     * What the page sends your route to ring someone into this call, when it was a call between two people: null for a
     * group call joined by its name. `realtime.callToken( user, to, { into: ref } )`.
     */
    get ref(): string | null;
    /** The rings into this group call this page heard of, still ringing or ended. */
    invites(): Invite[];
    /** @internal Someone is rung into this group call. */
    invited(invite: Invite): void;
    private publish;
    /**
     * How a source goes out, as Better Messages' group calls send it (room-publish.ts): a camera in the first codec of
     * the server's policy this browser sends (rtc-client 1.0.8's meshCodecPolicy), by default H.264 where this device
     * encodes it in hardware and VP8 otherwise, with VP8 behind any other for a receiver that decodes none of it, in
     * three layers at 30 frames (one SVC stream of three in VP9 or AV1); a screen in VP8 by default, whole and at half
     * its size. A camera encoded in software is scaled to 720 lines first (fitCameraTrack), the track the app handed in
     * included.
     */
    private publishOptions;
    /**
     * The node's settings changed on a running call (rtc-client 1.0.23, RoomEvent.MeshSettingsChanged): what it receives
     * asked at the pixel density they say, a shared screen sent as they say now, and a camera whose publish settings
     * changed chosen again at its next turn on, or now, at its moment of the minute, where the revision says applyNow.
     */
    private settingsChanged;
    private screenCodec;
    private applyNowTimer?;
    private caps;
    private choice;
    private cameraWatch;
    private micWatch;
    /**
     * Watches the camera sent for a hardware encoder dropping its frames (encoder-watch.ts): once seen, this browser
     * remembers it, and the next camera, in this call or another, goes out in software.
     */
    private watchCamera;
    private server;
    /** What this browser encodes, asked once a call. */
    private capabilities;
    /**
     * The room as the codec rules see it: encrypted, on the mesh, and the server's policy once joined, from its settings
     * where its node sends them (rtc-client 1.0.23) or its codec policy. A call's camera (`call`), as Better Messages'
     * is: the policy's rules, its check and its tune apply where the node turned them on.
     */
    private codecOptions;
    /**
     * The camera's codec on this device, asked once the room is joined (room-publish.ts): the server's policy, VP8 in
     * an encrypted room, where the room client sends no backup codec, H.265 only on the mesh. Measured first where the
     * node turned the camera check on and a rule names this machine (camera-check.ts), and told to the node.
     */
    private cameraChoice;
    private preset;
    private person;
    /** Someone left: their tile kept, marked reconnecting and with no media, while they may come back, else gone now. */
    private departed;
    /** Someone kept away is back in the room: their tile is theirs again (`person`, which the caller fires). */
    private back;
    private forgetAway;
    /** What came over the room on a topic of the SDK's. */
    private received;
    /** Whose media stopped reaching the media server, as the mesh says it now: each sender whose verdict changed, said. */
    private readStalls;
    /** A person's info opened; null until its key comes, when they come again as `person`. */
    private open;
    private setState;
    private finish;
    /**
     * The bye, as Better Messages' call screen sends it: never held long, as the hang-up goes on whatever becomes of it.
     * It goes over the data channel and the leave over the signal connection, and the media server drops a bye the leave
     * overtakes (about one hang-up in three in its call-tile-reconnect spec), so a sent bye gets 200 ms before the leave.
     */
    private sayBye;
}
