/**
 * The realtime SDK's rooms: rooms, events, presence, live counts, history, who is
 * online and what the app's server sends a user, on the one connection a page shares with WordPlus's own products. It
 * follows the realtime server from node to node without a drop, as every namespace on the connector does.
 *
 *     const rt = wordplusRealtimeClient.rooms(window.wordplusRealtimeConfig);
 *     const chat = rt.join('chat:34:42');
 *     chat.on('message', (msg, meta) => draw(msg, meta.from));
 *     const { id } = await chat.emitWithAck('message', { text: 'Hi' });
 *     chat.volatile.emit('typing', true);
 *     rt.on('notice', (data) => toast(data));
 *     rt.online.watch([34, 43]).on('change', ({ id, online }) => dot(id, online));
 *
 * - **One socket for the site or app:** the namespace `/channels` is attached with `share` set to its key, so every
 *   plugin and every tab of the browser rides one socket, each tab under a name of its own (`tab`).
 * - **Tokens, signed by the app's server:** every room needs one, which its auth route signs with the room's options
 *   (presence, count, history, which events browsers may send). Rooms joined in the same moment are asked for in one
 *   request, and the token is kept and renewed before it runs out. A public grant (`grants`) names patterns and no user,
 *   and may come in the page itself.
 * - **Moves:** a token isn't bound to a socket, so a move's new socket joins every room again with the tokens held
 *   (`ready`), before it takes over, and nobody's browser asks the app's server.
 * - **Nothing lost on a reconnect:** a room that keeps history is joined again from the last event the tab had, and
 *   the events it missed come first (`meta.replayed`).
 * - **Socket.IO's words:** `emit`, `emitWithAck`, `volatile` and `timeout()`, binary data anywhere in an event.
 * - **Sealed:** what goes through a room the app's server gave a key for (`ch:{room}:{generation}`), what the server
 *   sends a user and the members' info are sealed (keys.ts); a listener gets them opened, in the order they came, after
 *   any key missing is fetched from the app's server. The realtime server reads none of it, and never hands out a key.
 * - **The app's users:** `users( ids )` reads the directory every plugin on a site shares, names, avatars and profile
 *   links sealed with the day's key, which this socket may read once the app vouched for its user (`identify`).
 */
import { type AttachOptions, Channel, type Listener, type PendingSocket } from './channel.js';
import { Keyring } from './keys.js';
import { type RealtimeOptions } from './registry.js';
export declare const ROOMS_NAMESPACE = "/channels";
export interface Member {
    id: string;
    info: unknown;
}
/** What the app's auth route answers: one token for the rooms it allows, and why it refused the others. */
export interface Grant {
    token?: string;
    /** When the token runs out, in unix seconds. */
    exp?: number;
    /** The keys of the rooms allowed, as the app's server hands keys out (keys.ts). */
    keys?: string[];
    denied?: Record<string, string>;
}
/** A public grant the page carries: a token naming room patterns and no user, which a cached page may hold. */
export interface PublicGrant {
    token: string;
    exp: number;
    rooms: string[];
}
/** Who the app says the page's user is, for the realtime server: a token, and when it runs out (unix seconds). */
export interface Identity {
    token: string;
    exp: number;
}
/** The server package's `keys` settings: its keys route, and a signed-in user's keys and identity. */
export interface KeysOptions {
    endpoint?: string;
    headers?: Record<string, string>;
    entries?: string[];
    identity?: Identity;
}
/** A user in the app's directory, opened: `name`, `avatar`, `url`, and whatever else the app adds. */
export interface UserProfile {
    user_id: number | string;
    name?: string | null;
    avatar?: string | null;
    url?: string | null;
    [field: string]: unknown;
}
/** What comes with every event: who sent it (none for the app's server), its id when the room keeps it, and when. */
export interface EventMeta {
    from?: string;
    id?: string;
    at?: number;
    /** Missed while the connection was down, from the room's history. */
    replayed?: boolean;
}
export interface RoomsOptions extends RealtimeOptions {
    /** The site's or app's key, which its rooms belong to. */
    site: string;
    /** The app's route that signs rooms, and the headers it needs, such as WordPress's REST nonce. */
    auth?: {
        endpoint: string;
        headers?: Record<string, string>;
    };
    /** Or a function that signs them, in the route's place. */
    authorize?: (rooms: string[]) => Promise<Grant>;
    /** Public grants the page carries (the server package's `config()['grants']`). */
    grants?: PublicGrant[];
    /** The keys route, and the keys and identity the page carries: the server package's `config()['keys']`. */
    keys?: KeysOptions;
    /** The keyring, by default the page's, which every plugin on it shares. */
    keyring?: Keyring;
    /** The namespace's channel, by default on the page's connector (realtime()); for tests, or a connector of its own. */
    attach?: (options: AttachOptions) => Channel;
    /**
     * A connection for each user the browser holds: the page's user (its identity's) gets a SharedWorker of their own,
     * shared by their tabs, as one browser is one user in Better Messages. For an app that may have several users in
     * one browser (a demo's windows as other people, a second account in another window); off, the browser's tabs share
     * one connection, which Better Messages' messenger also rides on WordPress.
     */
    perUser?: boolean;
}
/** An error the realtime server or the app's server answered, by its code (`forbidden`, `rate_limited`, `too_large` …). */
export declare class RealtimeError extends Error {
    readonly code: string;
    constructor(code: string);
}
/** The page's rooms: open one per site or app with `rooms()`. */
export declare function rooms(options: RoomsOptions): Rooms;
/** The events of `Rooms` itself: the connection's, and whatever the app's server sends the user. */
export type RoomsEvent = 'connected' | 'disconnected' | 'error' | 'moved' | 'signed_out' | (string & {});
/** What a page answers the app's server's ask with (`answer()`): the reply, or a promise of it. */
export type Answerer = (data: unknown, meta: {
    at: number;
}) => unknown;
export declare class Rooms {
    private readonly options;
    /** This tab's name on the socket the browser's tabs share. */
    readonly tab: string;
    readonly site: string;
    /** Who is online across the app, for a page whose user the app vouched for. */
    readonly online: Online;
    private readonly socket;
    private readonly held;
    private readonly tokens;
    private readonly listeners;
    /** The rooms to ask the app's server for together, until the request leaves. */
    private batch;
    /**
     * The rooms joined and left in the same moment, which go to the realtime server in one request each way
     * (2026-10-18); one by one to a server that answers that `bad_request`, a server from before it (`many` false from
     * then on).
     */
    private joining;
    private leaving;
    private many;
    private renewal;
    private closed;
    /** What else rides this socket and holds something on it: calls' lines (sdk-calls), held again with the rooms. */
    private readonly holders;
    /** The keys that open what the rooms carry: the page's, shared with every plugin on it. */
    readonly keyring: Keyring;
    private identity;
    private identityRenewal;
    /** What this page answers the app's server's asks with, by event (`answer()`). */
    private readonly answerers;
    /** Events waiting for a key, delivered in the order they came. */
    private queue;
    private waiting;
    constructor(options: RoomsOptions);
    get connected(): boolean;
    /** The user the app vouched for on this page, or null. */
    get user(): string | null;
    /**
     * What the app's server sends this user (`toUser( id ).emit( event, data )`), `fn( data, { at } )`; and the
     * connection's own: `connected`, `disconnected` (with the reason), `error` ({ code }: the handshake refused, such
     * as `not_included`), `moved`: the connection moved to another node without a drop, and `signed_out`: the app's
     * server disconnected the user, whose identity and rooms the page asks it for again.
     */
    on(event: RoomsEvent, fn: Listener): this;
    once(event: RoomsEvent, fn: Listener): this;
    off(event?: RoomsEvent, fn?: Listener): this;
    /**
     * Answers what the app's server asks this user's pages (`user( id ).ask( event, data )`): `fn( data, { at } )`
     * returns the reply, or a promise of it, sealed with the user's key when the app gave one. One answer an event a
     * page, `null` takes it away. A page whose `fn` throws doesn't answer.
     */
    answer(event: string, fn: Answerer | null): this;
    /**
     * @internal What calls (sdk-calls) ride: the socket, this tab's name and the app's auth route. `hold` runs with
     * every join of the rooms: at each connect, and on a move's new socket before it takes over.
     */
    rideFor(hold: (via?: PendingSocket) => Promise<void>): {
        socket: Channel;
        tab: string;
        options: RoomsOptions;
        keyring: Keyring;
        release(): void;
    };
    /**
     * Users of the app from its directory, by id, opened: those it holds, as `{ [id]: { user_id, name, avatar, url, … } }`.
     * A field whose key the app won't give stays null. Rejects with its `code`: `no_identity` when the app doesn't know
     * the page's user, `timeout` off line.
     */
    users(ids: Array<number | string>): Promise<Record<string, UserProfile>>;
    /** A room of the app, joined: the same one again for the same name. */
    join(name: string): Room;
    /** A room this tab joined, or undefined. */
    room(name: string): Room | undefined;
    /** Leaves a room: the browser's other tabs keep theirs. */
    leave(name: string): void;
    /** Leaves every room: the browser's other tabs keep the socket, the last one closes it. */
    close(): void;
    /**
     * @internal Room.emit(): sealed with the room's newest key held, which those in it hold, binary parts carried in
     * it; as it is in a room the app gave no key for. Answers the cloud's ack, or null when none was asked.
     */
    send(room: Room, event: string, data: unknown, mode: {
        ack: boolean;
        volatile?: boolean;
        timeout?: number;
    }): Promise<{
        id: string;
        at: number;
    } | null>;
    /** @internal Room.history(): a page of the room's history, opened, oldest first. */
    history(room: Room, ask: {
        before?: string;
        after?: string;
        limit?: number;
    }): Promise<{
        events: Array<{
            event: string;
            data: unknown;
        } & EventMeta>;
        more: boolean;
    }>;
    /** @internal Room.members(): a page of a presence room's members, opened. */
    membersPage(room: Room, cursor?: string, limit?: number): Promise<{
        list: Member[];
        next: string;
    }>;
    /** @internal Online: a request on the socket, needing the page's user. */
    request(event: string, payload: Record<string, unknown>): Promise<any>;
    /** Every room on the socket, or a move's new one before it takes over, and what else rides it holds again. */
    private joinAll;
    /**
     * Tells the socket who the page's user is, as the app vouched (Identity): online, the user's own events, the
     * directory. An identity refused as `expired` (signed before the app's server disconnected the user, or run out) is
     * asked for again, once.
     */
    private identify;
    /** The identity asked of the app's keys route again, then who the page watches and its lines held again with it. */
    private renewIdentity;
    /** An ask of the app's server for this user's pages: answered when this page answers its event (`answer()`). */
    private answerAsk;
    /**
     * Asks the app's keys route for keys (`labels`), or with none for the user's own and their identity: what a
     * visitor's page can't carry, being the same for every visitor. The keyring's resolver.
     */
    private askKeys;
    /** The identity asked for again before it runs out, so a page open for days stays known. */
    private scheduleIdentity;
    /** A directory entry's value opened: each text in it, however deep, as the app seals them; numbers as they are. */
    private openDeep;
    /** A member's info, opened: sealed for the room, or plain from an app that doesn't seal. */
    private openInfo;
    /**
     * An event's data, opened, its binary parts as bytes again (`{ $b }`, as an app's server and a sealed room carry
     * them in JSON); undefined when its key isn't given.
     */
    private openData;
    /**
     * Runs `then` once the keyring holds the keys these values need: at once when none is missing and nothing is
     * waiting, else after what came before it, so a listener never gets an event ahead of an earlier one.
     */
    private inOrder;
    /** A room joined with the others joined in the same moment. */
    private joinSoon;
    /** Rooms in one `join`: each token once, each room naming its own by index, each answered as its own join. */
    private joinMany;
    /** A room left with the others left in the same moment. */
    private leaveSoon;
    private leaveMany;
    private joinOne;
    /** A room's answer to its join, alone or among others. */
    private joined;
    private ask;
    private tokenFor;
    /** Asks the app's server for a room's token, in one request with every other room asked for in the same moment. */
    private requestToken;
    private authorize;
    private viaRoute;
    /** The tokens of the rooms still held, asked for again before the first of them runs out. */
    private scheduleRenewal;
    /**
     * An event for one of this tab's rooms: never one this tab's own action made (`x`), nor one it had already (a
     * kept event's id at or before the last it had). Its data opened; one whose key the app won't give is the room's
     * `error` with `unopened` ({ code, event, label }) instead.
     */
    private deliver;
}
export type RoomState = 'joining' | 'joined' | 'failed' | 'left';
/** An emitter for a room with one setting: `room.volatile`, `room.timeout( ms )`. */
export interface RoomEmitter {
    emit(event: string, data?: unknown): void;
    emitWithAck(event: string, data?: unknown): Promise<{
        id: string;
        at: number;
    }>;
}
/** A room this tab joined: its events, what it may send, and for a presence room who is in it. */
export declare class Room {
    private readonly owner;
    readonly name: string;
    state: RoomState;
    /** Why it failed: `forbidden`, `expired`, `bad_token`, `full`, `kicked`, `auth_failed` … */
    error: string | null;
    /** A presence room's members, as many as the server listed and the changes since, by id. */
    readonly members: Map<string, unknown>;
    /** How many are in the room, for a room that counts (presence, or its rule's `count`); null for one that doesn't. */
    count: number | null;
    /** Resolves once the room is joined; an emit before then waits for it. */
    ready: Promise<void>;
    /** @internal The last kept event this tab had, which a reconnect joins again from. */
    lastId: string | null;
    private resolveReady;
    private rejectReady;
    private readonly listeners;
    constructor(owner: Rooms, name: string);
    /**
     * An event of the room, `fn( data, meta )` with meta `{ from, id, at, replayed? }`; or the room's own: `joined`
     * (the members), `join` ({ id, info }), `leave` ({ id }), `count` (n), `error` ({ code }) and `kicked`.
     */
    on(event: string, fn: Listener): this;
    once(event: string, fn: Listener): this;
    off(event?: string, fn?: Listener): this;
    /** Every event of the room, `fn( event, data, meta )`, as Socket.IO's `onAny`. */
    onAny(fn: Listener): this;
    offAny(fn?: Listener): this;
    /** Sends an event to the room's others, as its rule allows; nothing is waited for. */
    emit(event: string, data?: unknown): void;
    /** Sends an event and waits for the cloud to take it (checked, kept, sent): `{ id, at }`, or a RealtimeError. */
    emitWithAck(event: string, data?: unknown): Promise<{
        id: string;
        at: number;
    }>;
    /** Sends without waiting and without keeping: dropped rather than queued while off line, as Socket.IO's `volatile`. */
    get volatile(): RoomEmitter;
    /** An emitter whose acks wait at most `ms`. */
    timeout(ms: number): RoomEmitter;
    /** A page of the room's history, oldest first: the newest `limit` (50), or those before or after an event's id. */
    history(ask?: {
        before?: string;
        after?: string;
        limit?: number;
    }): Promise<{
        events: Array<{
            event: string;
            data: unknown;
        } & EventMeta>;
        more: boolean;
    }>;
    /** A page of a presence room's members past the first ones listed, from `cursor` ('0' first); `next` is '0' after the last. */
    membersPage(cursor?: string, limit?: number): Promise<{
        list: Member[];
        next: string;
    }>;
    leave(): void;
    /** @internal */
    joined(members?: {
        count?: number;
        list?: Member[];
    }, count?: number): void;
    /** @internal */
    failed(code: string): void;
    /** @internal The socket dropped: joined again at the next connect. */
    lost(): void;
    /** @internal */
    ended(): void;
    /** @internal */
    memberJoined(id: string, info: unknown): void;
    /** @internal */
    memberLeft(id: string): void;
    /** @internal */
    counted(n: number): void;
    /** @internal Whether a kept event's id is newer than the last this tab had; it becomes the last. */
    fresh(id: string): boolean;
    /** @internal An id this tab's own kept event had, which it never hears back. */
    seen(id: string): void;
    /** @internal */
    fire(event: string, args: unknown[], any?: boolean): void;
    private pendingReady;
}
/**
 * Who is online across the app, for a page whose user the app vouched for: the users it
 * watches, each with `change` ({ id, online, at? }: offline since `at`), and how many are online, with `count`.
 */
export declare class Online {
    private readonly owner;
    private readonly states;
    private readonly watching;
    private readonly listeners;
    private counting;
    /** How many are online, once something listens to `count`; null before. */
    count: number | null;
    constructor(owner: Rooms);
    /** Watches users' status: now, then every change (`change`). */
    watch(ids: Array<number | string>): this;
    unwatch(ids: Array<number | string>): this;
    has(id: number | string): boolean;
    /** When a watched user was last seen, ms; null while online or never seen. */
    lastSeen(id: number | string): number | null;
    /** `change` ({ id, online, at? }) for the users watched, `count` (n) once listened to. */
    on(event: 'change' | 'count', fn: Listener): this;
    off(event?: 'change' | 'count', fn?: Listener): this;
    /** A page of who is online: their ids, and the cursor of the next page ('0' after the last). */
    list(page?: {
        cursor?: string;
        limit?: number;
    }): Promise<{
        ids: string[];
        next: string;
    }>;
    /** @internal Watched again on a new socket, or a move's before it takes over. */
    again(via?: PendingSocket): Promise<void>;
    /** @internal */
    changed(o: any): void;
    /** @internal */
    counted(n: number): void;
    private send;
    private set;
}
/** A pattern of a public grant, as the realtime server and the server packages match it. */
export declare function patternMatches(pattern: string, room: string): boolean;
/** Binary parts of an event as `{ $b: base64 }`, so they can go sealed in its JSON. */
export declare function packBinary(value: unknown, depth?: number): unknown;
/** The other way: `{ $b: base64 }` as bytes again. */
export declare function unpackBinary(value: unknown, depth?: number): unknown;
