/**
 * The connector's port protocol (version 2 of the connection): how a page, or
 * a product's own SharedWorker, uses the connections the connector's
 * SharedWorker holds. `serve` is the worker's side of one port,
 * `RemoteConnector` the other side.
 *
 * The two sides may be different copies of this package (the newest copy on
 * a page picks the worker, and every product bundles its own page side), so
 * the messages only grow: a side ignores an `op` it doesn't know, and a field
 * added later has a default. Every message is plain data, so a reply or a
 * server's question that comes with a callback travels as a number.
 *
 * - The handshake is asked for at the attach, `connect()` and `update()`. A
 *   reconnect the worker makes on its own reuses the last one.
 * - A move's `ready` runs on the client's side: the worker sends `prepare`,
 *   forwards what the move's new socket hears tagged with the move, takes the
 *   client's emits on it, and waits for `ready`. The switch is the worker's,
 *   so a channel hears the current socket alone, as in the page.
 * - A client that goes is noticed by its Web Lock, which it holds while it
 *   lives and names to the worker (`lock`) once it holds it. The worker asks
 *   for it: granted, the client is gone, and its namespaces leave. A page
 *   that hides takes its namespaces off (`suspend`).
 * - A namespace's farewell (`farewell`) stays in the worker with
 *   its link, so it is sent on a shared socket however the client leaves it.
 */
import { type Link, type Listener, type MemberSpec, type PendingSocket, type Sink, type TimedEmitter } from './channel.js';
import { type ConnectorApi, type Target } from './connector.js';
/** The port protocol's own version, for a side that one day needs to know the other's. */
export declare const PORT_PROTOCOL = 1;
/** How long a client waits for the worker's hello before it runs the connections itself. */
export declare const HELLO_TIMEOUT_MS = 5000;
/**
 * How often a client asks the worker's hello again once it answered. A worker can end while a client
 * still holds a port to it: a product's own SharedWorker isn't among the connector worker's owners, so
 * the tab that started the connector's worker may close first. The port then takes every message and
 * answers none, and a hello still unanswered a round later hands every namespace to `fallback`.
 */
export declare const PING_INTERVAL_MS = 20000;
/**
 * How long `check` waits for the worker's hello. A worker in the same browser answers within milliseconds, so this
 * leaves room for a busy one and still moves the namespaces well inside the realtime server's grace for a user
 * whose socket went (10 s), where nobody is told they left.
 */
export declare const CHECK_TIMEOUT_MS = 1500;
/** As much of a MessagePort as the protocol uses. */
export interface PortLike {
    postMessage(message: unknown): void;
    onmessage: ((event: MessageEvent) => void) | null;
    start?(): void;
    close?(): void;
}
/** As much of the Web Locks API as the protocol uses. */
export interface LocksLike {
    request(name: string, callback: () => Promise<unknown> | unknown): Promise<unknown>;
}
type Message = Record<string, any> & {
    op: string;
};
/**
 * The worker's side of one port: a client's attaches, on the worker's
 * connector. Returns the function that ends it, as `bye` does.
 */
export declare function serve(port: PortLike, connector: ConnectorApi, locks?: LocksLike | null): () => void;
export interface RemoteOptions {
    /** The client's Web Lock, which tells the worker when it is gone. */
    locks?: LocksLike | null;
    /** Where the namespaces go should the worker not answer: the page's own connector. */
    fallback?: () => ConnectorApi;
}
/**
 * The client's side of a port to the connector's SharedWorker: a page's, or
 * a product's own worker's, with a MessagePort its tab handed it. A worker
 * that doesn't answer within HELLO_TIMEOUT_MS, fails to load, or stops
 * answering the hello sent every PING_INTERVAL_MS, hands every namespace to
 * `fallback`.
 */
export declare class RemoteConnector implements ConnectorApi {
    private readonly port;
    private readonly options;
    readonly version = "1.0.46";
    /** The worker's copy, once it answered. */
    hostVersion: string | null;
    private readonly links;
    private readonly acks;
    private ids;
    private ackIds;
    private failed;
    private helloTimer;
    private pingTimer;
    /** When the next round of the liveness check is due. */
    private pingDue;
    /** A hello went and its answer hasn't come yet. */
    private awaiting;
    /** Rounds in a row that ran late and found the hello unanswered. */
    private missed;
    private suspended;
    /** The checks waiting for the worker's hello, each settled by the answer or by its own time running out. */
    private readonly checks;
    constructor(port: PortLike, options?: RemoteOptions);
    link(target: Target, spec: MemberSpec, sink: Sink): Link;
    /**
     * Asks the worker's hello now rather than at the next round of the liveness check, for a client with a reason to
     * doubt the worker. A product's own SharedWorker has one when a tab hands it another port to the connector's
     * worker: the worker its port leads to may have ended with the tab that started it, which the rounds find only
     * 20 to 40 s later, everything sent and heard meanwhile lost. Answered within `within`, nothing changes.
     * Unanswered, every namespace goes to `fallback` as after a missed round. Resolves whether the worker answered:
     * false at once for a client that already runs its namespaces elsewhere, true for one with no fallback to go to
     * or hidden in the back-forward cache, which keep their worker whatever it does.
     */
    check(within?: number): Promise<boolean>;
    /** The worker failed to load, never answered or stopped answering: every namespace goes to the fallback. */
    fail(): void;
    /** The page hides (pagehide): its namespaces leave the worker's connections until it shows again. */
    suspend(): void;
    /** Shown again from the back-forward cache: every namespace attaches again, and catches up as on a reconnect. */
    resume(): void;
    /** The liveness check, once the worker answered: a round every PING_INTERVAL_MS, each sending a hello. */
    private schedulePing;
    private ping;
    post(message: Message): void;
    ack(fn: Listener): number;
    forget(link: RemoteLink): void;
    private handle;
    /** A server's question: a function that sends the product's answer back. */
    private decode;
}
declare class RemoteLink implements Link {
    private readonly conn;
    readonly num: number;
    readonly target: Target;
    readonly spec: MemberSpec;
    readonly sink: Sink;
    sid: string | undefined;
    /** The page's own connector's link, once the worker failed. */
    inner: Link | null;
    readonly pendings: Map<number, RemotePending>;
    private readonly values;
    private closed;
    /** The product's farewell, which every attach takes with it. */
    parting: {
        event: string;
        args: unknown[];
    } | null;
    constructor(conn: RemoteConnector, num: number, target: Target, spec: MemberSpec, sink: Sink);
    get id(): string | undefined;
    attach(): void;
    farewell(event: string | null, args: unknown[]): void;
    emit(event: string, args: unknown[], reply?: Listener): void;
    connect(): void;
    update(): void;
    close(): void;
    /** A move's new socket in the worker: the product's `ready` runs here, on a stand-in for it. */
    prepare(move: number): void;
    moved(move: number): void;
}
/** A move's new socket in the worker, as the product's `ready` on this side sees it. */
declare class RemotePending implements PendingSocket {
    private readonly conn;
    private readonly id;
    private readonly move;
    private readonly listeners;
    private done;
    constructor(conn: RemoteConnector, id: number, move: number);
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
export {};
