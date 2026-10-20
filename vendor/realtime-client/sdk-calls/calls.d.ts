/**
 * Calls for any plugin or app, on the connection `rooms()` holds:
 *
 *     const rt = wordplusRealtimeClient.rooms(window.wordplusRealtimeConfig);
 *     const calls = wordplusRealtimeCalls.calls(rt, window.wordplusRealtimeConfig);
 *
 *     calls.on('incoming', (incoming) => showRing(incoming));           // incoming.accept() or incoming.decline()
 *     const call = await calls.start('support:34:42', { to: 34, type: 'video' });
 *     call.on('remote', (remote) => remote.camera?.attach(videoElement));
 *     call.setTrack('camera', cameraTrack);
 *
 *     call.on('group', (group) => showGroup(group));                    // someone was added: it goes on as a group call
 *     await call.add(43);                                                // rings 43 into it
 *
 *     const meeting = await calls.group('meeting:daily');               // a group call on the mesh
 *
 * - **The site decides who may call whom:** each call, line and room is a token its auth route signs, the plugin that
 *   owns the call's name answering (the PHP package's `calls()`).
 * - **A call between two people** runs on the call engine Better Messages uses too (../calls): direct between the two browsers, through
 *   TURN when no direct path works, and moved into a room on the mesh when TURN fails too.
 * - **It rings in browsers:** every tab holding the callee's line rings, and stops once one answers or declines.
 * - **It becomes a group call** when either side adds someone: both go on in a room of the call's own on the mesh, and
 *   the person is rung into it. Everyone in it may add more.
 * - **A call's rooms are encrypted end to end,** with a key only the site gives out, so a call stays as private when it
 *   leaves the direct path as it was on it.
 */
import type { Rooms } from '../rooms.js';
import { type Listener } from '../channel.js';
import type { Keyring } from '../keys.js';
import { type MediaState, type P2PQuality } from '../calls/types.js';
import { type CallUser } from '../calls/users.js';
import { SdkCallTransport } from './transport.js';
import { GroupCall, type GroupLink, type ModerationAct, type Person, type RemoteTrack, type RoomExtras } from './group-call.js';
import { Invite } from './invite.js';
import { type MediaSource } from './media.js';
import { Stream } from './stream.js';
export type CallType = 'audio' | 'video';
/**
 * What the page asks the site's calls route for: its line, its side of a call, a place in a room, who it may add to a
 * call, or whether it may call each of some people (`may`, at most 100, each asked of the rule as its caller). A side
 * of a call with `group` rings someone into the group call it became (its caller's, with the call's `pair` and the
 * ringer's `member` proof), or answers that ring (with the `ring` proof the ring brought).
 */
export type CallRequest = {
    line: true;
} | {
    call: string;
    id: string;
    role: 'caller';
    to: CallUser;
    type: CallType;
    group?: string;
    pair?: [CallUser, CallUser];
    member?: string;
} | {
    call: string;
    id: string;
    role: 'callee';
    from: CallUser;
    type: CallType;
    group?: string;
    pair?: [CallUser, CallUser];
    ring?: string;
} | {
    room: string;
    type: CallType;
} | {
    people: string;
} | {
    may: Array<{
        call: string;
        to: CallUser;
    }>;
} | {
    moderate: string;
    act: ModerationAct;
    user: CallUser;
} | {
    stream: string;
};
/** Someone the page's user may add to a call, as the site lists them. */
export interface CallPerson {
    id: CallUser;
    name: string;
    avatar?: string;
}
/**
 * What the route answers: a token and when it runs out, the call's key for its signals, the key its rooms encrypt
 * their media with (`media_key`, for a call's rooms always, a group call's when its plugin encrypts it), the people the
 * page's user may add, or why it refused. For a call: its two people (`pair`), the user's proof of being in it
 * (`member`), which ringing someone in needs, and for a ring the proof the person was rung (`ring`), which the server
 * hands them with it. The site makes the proofs with its master key, which the server never sees.
 */
export interface CallGrant {
    token?: string;
    exp?: number;
    key?: string;
    media_key?: string;
    pair?: [CallUser, CallUser];
    member?: string;
    ring?: string;
    people?: CallPerson[];
    /** For `may`: whether the user may call each person asked about, in the order asked. */
    may?: boolean[];
    /** For `moderate`: whether the act changed anything. */
    done?: boolean;
    denied?: string;
}
/** A call that is, or may become, a group call: what ringing someone into it needs. */
interface GroupOf {
    id: string;
    name: string;
    type: CallType;
    pair?: [CallUser, CallUser];
    member?: string;
}
export interface CallsOptions {
    /** The site's calls route and its headers (the PHP package's `wordplus/v1/realtime/calls`). By default, beside the rooms' auth route. */
    calls?: {
        endpoint: string;
        headers?: Record<string, string>;
    };
    /** Or a function that signs, in the route's place. */
    authorize?: (request: CallRequest) => Promise<CallGrant>;
    /** The rooms script (the mesh's room client), which the PHP package names. */
    rooms?: string;
    /** Its encryption worker; beside the rooms script by default. */
    roomsWorker?: string;
    /** The streams script, which the classic calls script loads on a page's first stream; beside the rooms script by default. */
    streams?: string;
    /** The relay's address for requests, for the leave a closing page sends. */
    api?: string;
    /** Hold the page's line, so its user's calls ring here. Yes by default; a page without a signed-in user has none. */
    ring?: boolean;
}
/** The page's calls, on a site's or app's rooms: one for each. */
export declare function calls(rt: Rooms, options?: CallsOptions): Calls;
export declare class Calls {
    private readonly rt;
    private readonly options;
    private readonly ride;
    private readonly dispatcher;
    private readonly listeners;
    private readonly socketListeners;
    private readonly ringing;
    private readonly active;
    /** When a group call this page was in took it out or ended, by its name (afterOut()). */
    private readonly outAt;
    /** The rings into group calls this page heard of, and the rooms of the group calls it is in, by their ids. */
    private readonly invites;
    private readonly groups;
    private line;
    private lineRenewal;
    private ringOn;
    constructor(rt: Rooms, options?: CallsOptions);
    /**
     * `incoming` (Incoming: a call ringing for this page's user), `call` (Call: one this page started or answered),
     * `group` (GroupCall: one it joined, by `group()`, a ring into one answered, or a call of its that became one),
     * `error` ({ code }). `call` and `group` hear the calls a call screen makes too, so a page can keep to its own rules,
     * such as how long a call may last.
     */
    on(event: 'incoming' | 'call' | 'group' | 'error', fn: Listener): this;
    off(event: 'incoming' | 'call' | 'group' | 'error', fn?: Listener): this;
    /** The calls ringing for this page's user now. */
    incoming(): Incoming[];
    /** Calls `to` (a user id) about `name`, a call the plugin owns: rings their every open tab. Rejects with its `code`. */
    start(name: string, options: {
        to: CallUser;
        type?: CallType;
    }): Promise<Call>;
    /**
     * A group call `name` on the mesh, encrypted end to end when its rule says so. Rejects with its `code`.
     */
    group(name: string, options?: {
        type?: CallType;
    }): Promise<GroupCall>;
    /**
     * The live stream `name`: the app's route signs Easy Stream's grant for it, as the app's
     * `streams()` rule says who is what in it, and the page joins as that host, guest or viewer. Its chat rides the page's
     * connection; its picture comes through the rooms script. Rejects with its `code`. `video: false` for a page that shows
     * only the chat or the stream's details: the picture is fetched once something wants it (`watch()`).
     */
    stream(name: string, options?: {
        video?: boolean;
    }): Promise<Stream>;
    /**
     * Who the page's user may add to calls named `name`, as the site lists them (the PHP package's `calls()`,
     * `people`): none when it lists nobody.
     */
    people(name: string): Promise<CallPerson[]>;
    /**
     * Whether the page's user may call each person about each call, as the site's rules answer for a caller, in the order
     * asked: what a list of people asks before it offers call buttons. `null` where the site gave no answer (a route of
     * the app's own that doesn't know the question, or a failed request): placing the call still asks the rule.
     */
    may(asks: Array<{
        call: string;
        to: CallUser;
    }>): Promise<Array<boolean | null>>;
    /** Stops holding this page's line: its user's calls no longer ring here. */
    stopRinging(): void;
    /** @internal */
    answer(incoming: Incoming): Promise<Call | GroupCall>;
    /** A ring into a group call, answered with the proof it brought: the site's token for this ring, then a place in its room. */
    private answerGroup;
    /**
     * @internal A place in a group call's room, with the token of the call it was made from or of the ring answered,
     * the call's media already sent to it when it was a call.
     */
    joinGroup(group: GroupOf, token: string, mediaKey: string | undefined, tracks?: Map<MediaSource, MediaStreamTrack>): Promise<GroupCall>;
    /**
     * @internal Rings `user` into a group call, or into the call that becomes one: the site's token for the ring first,
     * given for the proof that this page's user is in the call, and the proof the person was rung, which the server
     * hands them with the ring.
     */
    invite(group: GroupOf, user: CallUser): Promise<Invite>;
    /** @internal */
    decline(incoming: Incoming, reason: 'declined' | 'busy'): Promise<void>;
    /** @internal What a call needs of the page: its socket, tab, site, the relay's address and the rooms script. */
    transportFor(call: Call): SdkCallTransport;
    /**
     * @internal A room, its encryption worker started when the site gave its key: a call's rooms always, a group call's
     * when its plugin encrypts it.
     */
    openRoom(options: Record<string, unknown>, mediaKey: string | undefined, group?: GroupLink, moderate?: RoomExtras['moderate']): Promise<GroupCall>;
    /**
     * Before joining a group call this page was just taken out of, or that just ended: the realtime server refuses a
     * token signed in the second of that, as from before it (better-messages-server's outs.ts), so the page asks its
     * server once the next second has begun. Someone removed who joins again at once was refused `forbidden`.
     */
    private afterOut;
    /** A host's act in the group call `name`, as the site's calls route answers it: whether it changed anything. */
    private moderateVia;
    /** Connects a room in the background: one that fails is left, and said so. */
    private connectRoom;
    /** @internal The page's keyring, which opens what the site said about the people in a call. */
    get keyring(): Keyring;
    /** @internal */
    forget(call: Call): void;
    /** @internal The site's answer to a request, or a refusal with its code. */
    authorize(request: CallRequest): Promise<CallGrant & {
        token: string;
    }>;
    private viaRoute;
    private ask;
    /** Holds the line on the socket, or a move's new one before it takes over; asks the site for it when it has none. */
    private holdLine;
    private scheduleLineRenewal;
    private onLine;
    /** Someone rung into a group call this page's user is in, or how that ring ended: the room hears of a new one. */
    private heardInvite;
    /**
     * A call ringing: shown once the caller's info opens (the site seals it with the day's key), after asking the site
     * for a key the page lacks. Ringing already, so a `ring_over` meanwhile stops it before it shows.
     */
    private ring;
}
/**
 * A call ringing for this page's user, or a ring into a group call (`group`: someone in it added them). `over` (the
 * reason) when it stops ringing: answered elsewhere, declined, cancelled …
 */
export declare class Incoming {
    private readonly owner;
    readonly id: string;
    /** The plugin's name for the call, such as `support-42`. */
    readonly call: string;
    /** Who calls: their user id, and what the site's token said about them, opened. */
    readonly from: CallUser;
    info: unknown;
    readonly type: CallType;
    /** The group call it rings into, by its id; null for a call between two people. */
    readonly group: string | null;
    state: 'ringing' | 'answered' | 'declined' | 'over';
    reason: string | null;
    /** @internal What a ring into a group call brought for the site: the call's pair, and the proof this user was rung. */
    readonly proofs: {
        pair?: [CallUser, CallUser];
        ring?: string;
    };
    private readonly listeners;
    constructor(owner: Calls, m: any);
    on(event: 'over', fn: Listener): this;
    off(event: 'over', fn?: Listener): this;
    /**
     * Answers: the call, connecting, or for a ring into a group call (`group`) the GroupCall. Rejects with its `code`, such as
     * `forbidden` when the plugin said no.
     */
    accept(): Promise<Call | GroupCall>;
    /** Turns it down, or says this user is busy: it ends for the caller, and stops ringing on every tab. */
    decline(reason?: 'declined' | 'busy'): Promise<void>;
    /** @internal */
    over(reason: string): void;
}
export type CallState = 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
/** What carries the call: straight between the browsers, through TURN, or a room on the mesh. */
export type CallPath = 'direct' | 'relay' | 'room';
/** What the other side sends, and what they have on. */
export interface RemoteMedia {
    camera: RemoteTrack | null;
    microphone: RemoteTrack | null;
    screen: RemoteTrack | null;
    screenAudio: RemoteTrack | null;
    /** What they have switched on, whether or not it has arrived yet. */
    media: MediaState;
    quality: P2PQuality;
}
interface CallIdentity {
    id: string;
    name: string;
    type: CallType;
    role: 'caller' | 'callee';
    peer: {
        user: CallUser;
        info: unknown;
    };
}
type CallEvent = 'state' | 'path' | 'remote' | 'waiting' | 'reacquire' | 'autoplay_blocked' | 'group' | 'ended';
/**
 * A call between two people. Events: `state` (CallState), `path` (CallPath), `remote` (RemoteMedia), `waiting`
 * ({ until, reason }: the mesh is finding the room a place), `reacquire` (the source the other side stopped hearing:
 * open the device again), `autoplay_blocked` (a click must start the sound), `group` (GroupCall: someone was added, and
 * the call goes on as a group call there, with what this page sends), and `ended` (the reason; `group` after `group`).
 */
export declare class Call {
    private readonly owner;
    private readonly request;
    readonly id: string;
    readonly name: string;
    readonly type: CallType;
    readonly role: 'caller' | 'callee';
    /** The other side: their user id, and what the site said about them (the caller's info, for a callee). */
    readonly peer: {
        user: CallUser;
        info: unknown;
    };
    state: CallState;
    path: CallPath | null;
    endReason: string | null;
    remote: RemoteMedia;
    /** @internal */
    token: string;
    private readonly listeners;
    private readonly transport;
    private readonly session;
    private readonly local;
    /** The key the call's rooms encrypt their media with, from the site; none from an older site's package. */
    private mediaKey;
    /** The call's two people and this user's proof of being in it, from the site: what ringing someone in needs. */
    private proofs;
    private room;
    private toGroupOnce;
    private reporter;
    private reportTimer;
    private roomWait;
    private renewal;
    private connectedOnce;
    constructor(owner: Calls, who: CallIdentity, request: CallRequest, grant: CallGrant & {
        token: string;
    });
    on(event: CallEvent, fn: Listener): this;
    off(event: CallEvent, fn?: Listener): this;
    /**
     * Rings `user` into the call, which becomes a group call: both sides get `room` and go on there, and `user` arrives
     * in it once they answer. The site decides as for any call, with this page's user calling `user` about the call's
     * name. Rejects with its `code`: `not_connected` before the call is up, or the site's or the server's refusal.
     */
    add(user: CallUser): Promise<Invite>;
    /** The group call this call is, or becomes. */
    private group;
    /** What this page sends from a source: a live track, or null to stop sending it. */
    setTrack(source: MediaSource, track: MediaStreamTrack | null): void;
    /** Hangs up, or calls it off while it still rings (`cancelled`). */
    end(): void;
    /** @internal Joins the call: as its caller, that makes it ring. */
    begin(): Promise<void>;
    private setState;
    private setPath;
    private fromView;
    private fromStats;
    /** Neither the direct path nor TURN carried the call: it goes on in a room on the mesh, with what this page sends. */
    private toRoom;
    /**
     * Someone was added: the call goes on in the group call's room, encrypted with the call's key, with what this page
     * sends. `room` hands it to the page before the call ends as `group`.
     */
    private toGroup;
    private fromPerson;
    /** The other side isn't in the room: on its way after a hand-off, or gone. It gets a minute. */
    private waitInRoom;
    private clearRoomWait;
    /** The token asked for again before it runs out, so a join after a long drop still has one. */
    private scheduleRenewal;
    /** The call is over, however it ended: what it held goes, the room with it. */
    private finish;
}
export type { MediaSource, Person, RemoteTrack };
