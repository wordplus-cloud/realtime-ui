/**
 * A product's namespace on the shared connection (version 2 of the connection):
 * what `attach` hands a product, wherever the connection is, in this page or
 * in the connector's SharedWorker. It is socket-like, so a product written
 * for a socket.io socket takes one with few changes: `on`, `once`, `off`,
 * `onAny`, `emit` with or without a reply, `timeout( ms )`, `emitWithAck`,
 * `connected`, `active`, `connect()` and `close()`, and the events `connect`,
 * `disconnect` and `connect_error`.
 *
 * Its events are the current socket's only. A move opens the namespace on
 * the target node first, and what that socket hears before the switch goes to
 * the product's `ready` alone (`PendingSocket`).
 *
 * A channel is bound to what carries it (a `Link`) once the page's connector
 * runs, which can be a moment after the attach (registry.ts): what it sends
 * meanwhile waits, as a socket.io socket buffers what it sends before it
 * connects.
 *
 * The `Sink` methods are how a connector talks to a channel. A connector may
 * be a newer copy than the channel's (the newest copy on the page runs it),
 * so they are a contract: they are never renamed, and a newer connector
 * checks for any method it adds.
 */
export type Listener = (...args: any[]) => void;
/** A move's new socket, before it takes over: what the product's `ready` emits on and listens to. */
export interface PendingSocket {
    on(event: string, fn: Listener): PendingSocket;
    once(event: string, fn: Listener): PendingSocket;
    off(event: string, fn?: Listener): PendingSocket;
    onAny(fn: Listener): PendingSocket;
    emit(event: string, ...args: unknown[]): PendingSocket;
    emitWithAck(event: string, ...args: unknown[]): Promise<any>;
    timeout(ms: number): TimedEmitter;
}
export interface TimedEmitter {
    /** The reply's callback, last, gets an error first: the timeout's, or null. */
    emit(event: string, ...args: unknown[]): void;
    emitWithAck(event: string, ...args: unknown[]): Promise<any>;
}
export interface AttachOptions {
    /** The product's namespace, such as /estream; Better Messages uses `/`. */
    namespace: string;
    /** The product's handshake. In the page it is asked at every connect; through the worker, at the attach, `connect()` and `update()`. `rt` is added. */
    auth: () => Record<string, unknown>;
    /** When a move's new socket may take over, after it connects: at once by default. Easy Stream waits for its `hello`. */
    ready?: (next: PendingSocket) => Promise<unknown>;
    /** The move switched to its new socket, with what `ready` gave. */
    moved?: (value: unknown) => void;
    /** Rides on a connection another namespace holds, and never opens one (Easy Stream's live list). */
    rides?: boolean;
    /**
     * Shares the namespace's socket with every attach of it that says the same key (share.ts), so tabs of a
     * product ride one connection: what they share, the handshake and what the server sends, must be the same
     * for each. What a tab joined on the socket it leaves with `farewell()`.
     */
    share?: string;
}
/**
 * What carries a channel: its namespace on a connection here (hub.ts), or an
 * attach in the worker (remote.ts). A reply is a plain callback: a channel
 * keeps a reply's timeout itself, so it holds however the reply travels.
 */
export interface Link {
    emit(event: string, args: unknown[], reply?: Listener): void;
    /** Again after a refusal, with the product's handshake as it is now. */
    connect(): void;
    /** The product's handshake changed, for the next connects. */
    update(): void;
    close(): void;
    /**
     * What to send on a shared socket when this link leaves it and others stay (Channel.farewell), or null for
     * nothing. Optional: a link may have none.
     */
    farewell?(event: string | null, args: unknown[]): void;
    /** The current socket's id. */
    readonly id: string | undefined;
}
/** How a connector tells a channel what happened. A contract between copies (above). */
export interface Sink {
    deliver(event: string, args: unknown[]): void;
    opened(id: string | undefined): void;
    dropped(reason: string): void;
    /** The handshake was refused (`active` false: no retry), or the connection failed (`active` true: it retries). */
    refused(error: Error, active: boolean): void;
    /** A move's new socket: runs the product's `ready`, and resolves with what `moved` gets. */
    prepare(next: PendingSocket): Promise<unknown>;
    moved(value: unknown): void;
}
/** What a namespace needs of its product, wherever it is carried. A contract between copies, as `Sink`. */
export interface MemberSpec {
    namespace: string;
    auth: () => Record<string, unknown>;
    rides?: boolean;
    /** The product has a `ready` to run on a move's new socket: through the worker, the move asks for it. */
    ready?: boolean;
    /** Shares the namespace's socket with the attaches that say the same key (AttachOptions.share). */
    share?: string;
}
/** The spec of a product's attach. */
export declare function specOf(options: AttachOptions): MemberSpec;
/** The error a reply with a timeout gets when the time is up, as socket.io's. */
export declare const timedOut: () => Error;
/** A list of listeners, each kept once or for good. */
export declare class Listeners {
    private byEvent;
    private any;
    on(event: string, fn: Listener, once?: boolean): void;
    off(event?: string, fn?: Listener): void;
    onAny(fn: Listener): void;
    offAny(fn?: Listener): void;
    /** `any` listeners hear the server's events, not the reserved ones, as socket.io's `onAny`. */
    fire(event: string, args: unknown[], any?: boolean): void;
    count(event: string): number;
}
/** A reply's callback with the time it waits, `fn( err, ...reply )`, fired once whichever comes first. */
export declare function timedReply(fn: Listener, ms: number): {
    reply: Listener;
    cancel: () => void;
};
export declare class Channel implements Sink {
    readonly options: AttachOptions;
    connected: boolean;
    /** False once the handshake was refused or the channel was closed: it then tries no more until `connect()`. */
    active: boolean;
    private readonly listeners;
    private link;
    /** What the product sent before the channel was bound, sent once it is. */
    private queue;
    private closed;
    /** What its link sends when it leaves a shared socket (farewell). */
    private parting;
    constructor(options: AttachOptions);
    get namespace(): string;
    get id(): string | undefined;
    /** Whether the channel was closed by the product. */
    get isClosed(): boolean;
    on(event: string, fn: Listener): this;
    once(event: string, fn: Listener): this;
    off(event?: string, fn?: Listener): this;
    removeAllListeners(event?: string): this;
    onAny(fn: Listener): this;
    offAny(fn?: Listener): this;
    listenerCount(event: string): number;
    /** As a socket's: a function last is the reply's callback. */
    emit(event: string, ...args: unknown[]): this;
    emitWithAck(event: string, ...args: unknown[]): Promise<any>;
    /**
     * A reply that waits `ms` at most, as a socket's `timeout()`: its callback
     * gets an error first, the timeout's or null.
     */
    timeout(ms: number): TimedEmitter;
    /** Again after a refusal, with the handshake as it is now. */
    connect(): this;
    /** The handshake changed: the next connects take it. */
    update(): this;
    /**
     * On a shared socket (`share`), what this channel sends on it when it leaves while others stay: closed, its
     * page hidden, or its tab gone, which the worker finds out by itself. The product's way of leaving what it
     * joined on the socket, as Easy Stream's `unwatch` of its stream. Called again it replaces it; with no event
     * it is cleared.
     */
    farewell(event?: string, ...args: unknown[]): this;
    /** Leaves the connection. The last namespace to leave closes it. */
    close(): this;
    disconnect(): this;
    /** Bound to what carries it, by the page's connector. */
    bind(link: Link): void;
    private send;
    deliver(event: string, args: unknown[]): void;
    opened(_id: string | undefined): void;
    dropped(reason: string): void;
    refused(error: Error, active: boolean): void;
    prepare(next: PendingSocket): Promise<unknown>;
    moved(value: unknown): void;
}
