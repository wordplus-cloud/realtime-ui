/**
 * The shared connection to one realtime cluster (version 2 of the connection): one
 * Socket.IO manager per node, carrying every product's namespace, wherever the
 * connector runs (the page, or its SharedWorker). Every namespace's handshake
 * says `rt: 2`, so the server sends `migrate` and `nodes` once per connection,
 * and the whole connection moves.
 *
 * - A product attaches its namespace with its own handshake. A refusal is the
 *   namespace's own: the others go on, and the last namespace to leave closes
 *   the connection (socket.io closes a manager with no active socket).
 * - A namespace is one socket per connection, so a second attach of one that
 *   is already on every connection opens another connection.
 * - A namespace that rides (Easy Stream's live list) never opens a connection:
 *   it connects only while another namespace of its connection is connected,
 *   and again after each reconnect once that one is back.
 *
 * A move is make before break, for the whole connection: a manager to the
 * target, every namespace connected there with its handshake and made ready
 * (the product's `ready`, which may emit on the new socket), all switched at
 * once, and the old manager closed once its replies are in. A move carries
 * every namespace or none. Riders are opened on the new connection after the
 * switch. One move at a time: a second `direct` offer is ignored while one is
 * scheduled or running, and a drain replaces a scheduled `direct`, so a
 * client of a server that still sends `migrate` to every socket moves once.
 *
 * The node cache and its pause are version 1's (node-cache.ts): the first
 * connect goes to the first cached node, once a store that can't be read at
 * once (the SharedWorker's IndexedDB) has given it, FIRST_READ_WAIT_MS at
 * most; a node that fails is passed over for the next, then the realtime
 * server; a direct offer's node that fails while the realtime server
 * answers pauses direct connections for an hour. A failed
 * connect is the manager's (`error`), heard once, whatever namespaces it
 * carries; a namespace's refusal is no node's failure.
 */
import { type ManagerOptions, type Socket } from 'socket.io-client';
import { type Link, type Listener, type MemberSpec, type PendingSocket, type Sink, type TimedEmitter } from './channel.js';
import { type Aimable, type MigrateRequest, NodeCacheKeeper, type NodeStore } from './node-cache.js';
/** The connection protocol a shared connection speaks, sent as `rt` in every namespace's handshake. */
export declare const SHARED_PROTOCOL = 2;
/** As much of a socket.io manager as the hub uses. */
export interface HubManager extends Aimable {
    socket(namespace: string, options: {
        auth: (cb: (data: object) => void) => void;
    }): Socket;
    on(event: string, fn: Listener): unknown;
    reconnection(value: boolean): unknown;
}
export type ManagerFactory = (url: string, options: Partial<ManagerOptions>) => HubManager;
export interface HubOptions {
    /** The realtime server, as the first product that attached named it: its connections go through that name. */
    server: string;
    /** The Socket.IO path, such as /websocket. */
    path?: string;
    /** Where the node cache lives; null keeps it in memory. */
    store?: NodeStore | null;
    /** socket.io's own options for every manager, such as transports. */
    options?: Partial<ManagerOptions>;
    /** The page, whose CSP violations say a node is blocked. A SharedWorker has none. */
    doc?: Pick<Document, 'addEventListener' | 'removeEventListener'> | null;
    /** Stand-ins for tests. */
    manager?: ManagerFactory;
    random?: () => number;
}
export declare class Hub {
    readonly options: HubOptions;
    readonly server: string;
    readonly nodes: NodeCacheKeeper;
    readonly connections: Connection[];
    readonly random: () => number;
    /** A store read at once (localStorage, memory): a direct offer needs no wait for a read. */
    readonly storeReadsAtOnce: boolean;
    private readonly timers;
    private readonly makeManager;
    private stopWatchingCsp;
    private closed;
    /**
     * The store's first read, for a store that can't be read at once (the
     * SharedWorker's IndexedDB), FIRST_READ_WAIT_MS at most: a connection
     * made meanwhile waits on it to pick its first node. Null once it is in.
     */
    private firstRead;
    constructor(options: HubOptions);
    /**
     * A product's namespace: on the first connection that doesn't have it yet,
     * else on a new one. A rider goes only on a connection that holds another
     * namespace, and is refused with `no_connection` when there is none.
     */
    attach(spec: MemberSpec, sink: Sink): Link;
    /** A rider whose connection went, at its `connect()`: onto another that holds a namespace, if one does. */
    reattach(member: Member): void;
    /** No connection to ride on: refused, and tried again at its `connect()`. */
    private refuseRider;
    /** Whether a connection is up with a namespace that doesn't ride, which a rider may join. */
    holds(): boolean;
    /** The nodes kept for the next connections, best first: none while paused. */
    keptNodes(): string[];
    close(): void;
    get isClosed(): boolean;
    /** A manager to `url`, which connects only when a socket of it does. */
    manager(url: string, timeout: number, reconnection: boolean): HubManager;
    forget(conn: Connection): void;
    later(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
    cancel(timer: ReturnType<typeof setTimeout>): void;
    /**
     * A site's CSP that leaves the nodes out of connect-src, heard at once from
     * the page (connection.ts has the why): direct connections pause, a move
     * to a blocked node is called off, and a connection connecting to one goes
     * to the realtime server now. Only a page host has it: a SharedWorker's
     * script answers to its own response's CSP, not the page's.
     */
    private watchCsp;
}
/** A namespace's socket on a connection, and on a move's new one meanwhile: what carries a channel. */
declare class Member implements Link {
    conn: Connection | null;
    readonly spec: MemberSpec;
    readonly sink: Sink;
    readonly hub: Hub;
    socket: Socket | null;
    /** A rider waiting for its connection's other namespaces to connect. */
    parked: boolean;
    /** Left, or its connection gone. */
    gone: boolean;
    constructor(conn: Connection | null, spec: MemberSpec, sink: Sink, hub: Hub);
    get id(): string | undefined;
    emit(event: string, args: unknown[], reply?: Listener): void;
    connect(): void;
    update(): void;
    close(): void;
}
/** A move's new socket, as the product's `ready` sees it: its listeners last until the switch. */
declare class Pending implements PendingSocket {
    private readonly socket;
    private readonly listeners;
    private done;
    constructor(socket: Socket);
    on(event: string, fn: Listener): this;
    once(event: string, fn: Listener): this;
    off(event: string, fn?: Listener): this;
    onAny(fn: Listener): this;
    emit(event: string, ...args: unknown[]): this;
    emitWithAck(event: string, ...args: unknown[]): Promise<any>;
    timeout(ms: number): TimedEmitter;
    fire(event: string, args: unknown[]): void;
    end(): void;
}
interface MoveEntry {
    socket: Socket;
    pending: Pending;
    /** Connected and ready, failed (the move hears it through `failed`), or left the connection meanwhile. Never rejects. */
    done: Promise<void>;
    /** What `ready` gave, for `moved`. */
    value?: unknown;
    leave: () => void;
}
declare class Move {
    readonly manager: HubManager;
    readonly target: string;
    readonly request: MigrateRequest;
    readonly entries: Map<Member, MoveEntry>;
    /** The new manager's connection opened: a namespace refused there is no sign against the node. */
    opened: boolean;
    error: Error | null;
    readonly failed: Promise<never>;
    private reject;
    constructor(manager: HubManager, target: string, request: MigrateRequest);
    /** Calls the move off: a refusal, a failed connect, the page's CSP, or the connection closing. */
    fail(error: Error): void;
    /** Every namespace connected and ready, those that join meanwhile included. */
    settled(): Promise<void>;
}
export declare class Connection {
    private readonly hub;
    manager: HubManager;
    readonly members: Map<string, Member>;
    move: Move | null;
    private scheduled;
    /** A `migrate` the move's new connection heard: taken once it is the current one. */
    private deferred;
    /** Namespaces whose socket left while its handshake was under way, until the server is told (drop). */
    private readonly closing;
    private closed;
    /** Waiting for the hub's first read of the node cache: its namespaces connect once it is in. */
    starting: boolean;
    /**
     * To the first cached node, else the realtime server itself. While the
     * hub's first read is under way, made for the realtime server, and aimed
     * at the first cached node once the read is in.
     */
    constructor(hub: Hub, firstRead: Promise<void> | null);
    /** Whether a namespace may go on this connection: neither on it, nor still leaving it. */
    free(namespace: string): boolean;
    hasPrimary(): boolean;
    primaryConnected(): boolean;
    add(spec: MemberSpec, sink: Sink): Member;
    adopt(member: Member): void;
    remove(member: Member): void;
    close(): void;
    /**
     * A namespace's socket off its manager, which socket.io closes once none
     * is active. socket.io tells the server only of a connected socket's
     * leaving: one whose handshake is under way, on a connection that stays,
     * is closed once the server took it, or the server would keep it for as
     * long as the connection lives. The namespace is busy on this connection
     * until then, since the server can't tell two sockets of a namespace apart.
     * `now` closes it at once, for a connection that closes anyway.
     */
    private drop;
    private newManager;
    private socketFor;
    private heard;
    private onMigrate;
    private schedule;
    private moveTo;
    /** A namespace on the move's connection: its socket there, the product's `ready` asked at once, its connect. */
    private join;
    private switchTo;
    /** The old connection closes once the replies under way on it are in, three seconds at most. */
    private retire;
    /** The page's CSP blocked `host` (Hub.watchCsp). */
    blocked(host: string): void;
}
export {};
