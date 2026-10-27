/**
 * A room on the mesh: a group call, a call between two people that became one, or the room a call between two people
 * moves to when neither the direct path nor TURN carries it. The page gets its place from the server with the site's
 * token, then joins with the mesh's room client, which walks busy nodes, waits for a place and moves when a node goes.
 *
 * **End to end encrypted** when the site gives a key: a call's rooms always, a group call's when its plugin says so
 * (the PHP package's `calls()`, `encrypt`). Every frame is encrypted in the browser with the key everyone in the room
 * shares, which only the site gives out, so the mesh forwards what it can't read, as a direct call's media is.
 */
import { type Listener } from '../channel.js';
import type { Keyring } from '../keys.js';
import type { Invite } from './invite.js';
import { type LiveKit, type MediaSource } from './media.js';
import { type CallUser } from '../calls/users.js';
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
}
/** What this page may do in the room, as the media server holds it now. */
export interface RoomPermissions {
    /** Send its camera, microphone and screen. */
    publish: boolean;
    /** Get those of the others. */
    subscribe: boolean;
    /** Host the call, as its rule's `admin` said: `moderate()` mutes, lets speak and removes the others. */
    admin?: boolean;
}
/**
 * What a host does to someone else in a group call (`moderate()`): `mute` turns their microphone off, which they may
 * turn on again, `speak` lets a listener send, `listen` makes a speaker a listener, `remove` takes them out.
 */
export type ModerationAct = 'mute' | 'speak' | 'listen' | 'remove';
export type GroupCallState = 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'ended';
/** Where a room is, as the server's `room` answer and a hand-off name it. */
export interface GroupCallPlace {
    server: string;
    token: string;
    iceServers?: RTCIceServer[];
}
/** A group call made from a call between two people: who may be rung into it, and the rings so far. */
export interface GroupLink {
    /** The group call's id: the call's it was made from. */
    id: string;
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
    moderate?: (act: ModerationAct, user: CallUser) => Promise<boolean>;
}
/**
 * A room, its encryption worker started first when the site gave a key: refused with `encryption_unsupported` in a
 * browser that can't encrypt each frame, since it could neither send to the others nor see what they send.
 */
export declare function openRoom(lib: LiveKit, options: Record<string, unknown>, keys: Keyring | null, extras?: {
    key?: string | null;
    worker?: string;
    rooms?: string;
    group?: GroupLink;
    moderate?: RoomExtras['moderate'];
}): Promise<GroupCall>;
type RoomEventName = 'state' | 'waiting' | 'person' | 'person_left' | 'speakers' | 'invite' | 'permissions' | 'error' | 'ended';
/**
 * A room the page is in. Events: `state` (GroupCallState), `waiting` ({ until, reason }: the mesh is finding a place),
 * `person` (Person: someone arrived, or what they send or may send changed), `person_left` (Person), `speakers`
 * (Person[]), `invite` (Invite: someone is rung into this group call), `permissions` (RoomPermissions: the site's server
 * changed what this page may do), `error` ({ code }: `publish_failed`, `encryption_failed`), and `ended` (the reason).
 */
export declare class GroupCall {
    private readonly lib;
    private readonly keys;
    state: GroupCallState;
    /** The room client's own GroupCall, for what the kit doesn't wrap. */
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
    private ended;
    /**
     * @param keys the page's keyring, which opens what the site said about each person; a person whose key it has to ask
     *             the site for comes again as `person` once it has it.
     * @param extras the key and worker of an encrypted room (openRoom() starts the worker), and a group call's link.
     */
    constructor(lib: LiveKit, options?: Record<string, unknown>, keys?: Keyring | null, extras?: RoomExtras);
    on(event: RoomEventName, fn: Listener): this;
    off(event: RoomEventName, fn?: Listener): this;
    /** Joins the room at its place. */
    connect(place: GroupCallPlace): Promise<void>;
    /** What this page may do in the room now: the site's rule, or what its server changed since (`permissions`). */
    get can(): RoomPermissions;
    /**
     * What a host does to someone else in the call (`ModerationAct`), through the site's calls route, which asks the
     * call's rule again and takes it from a host alone (its `admin`). Whether it changed anything. Rejects with its
     * `code`: `forbidden` for a page that isn't the host, `not_moderated` for a room that isn't a named group call.
     */
    moderate(act: ModerationAct, user: CallUser): Promise<boolean>;
    /** Sends what the page set and the room doesn't have yet, while this page may send. */
    private publishWanted;
    /** This page's own user in the room, as the others see them: their info as the site gave it. Null until connected. */
    get self(): Person | null;
    /** Everyone else in the room. */
    people(): Person[];
    /** What this page sends from a source: a track, or null to stop sending it. Kept for a room still connecting. */
    setTrack(source: MediaSource, track: MediaStreamTrack | null): Promise<void>;
    leave(): void;
    /**
     * Rings `user` into this group call, a call between two people that became one: they arrive as a `person` once they
     * answer. Rejects with its `code`: `not_a_call` for any other room, or the site's or the server's refusal.
     */
    add(user: CallUser): Promise<Invite>;
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
    /** A person's info opened; null until its key comes, when they come again as `person`. */
    private open;
    private setState;
    private finish;
}
export {};
