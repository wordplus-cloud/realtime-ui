/**
 * A product's connection to the realtime server that moves make before break:
 * when the server sends `migrate`, it opens a socket to the node named, waits
 * until that socket is ready to take over (connected, and for Easy Stream its
 * `hello`), switches to it, and only then closes the old one. The product
 * never drops to zero sockets and misses nothing, so it needs no catch-up.
 * The handshake says which protocol it speaks (`rt`).
 *
 * - `direct`: the server offers a node to a socket that came in through the
 *   realtime server itself (the load balancer). The node is kept at once with
 *   one other node of the offer's, so the next page load connects to it
 *   directly even if this one closes before it moves. No offer is taken while
 *   direct connections are paused.
 * - `drain`, `drain_retry` and `direct_off`: to the node named, else the
 *   realtime server itself, paused or not.
 *
 * Every socket it makes is the product's to listen on (`attach`), and an event
 * counts only while its socket is the current one (`isCurrent`): a move's new
 * socket hears the room before it takes over, and the old one after.
 *
 * The node cache (node-cache.ts) is the one every product shares on a page: by
 * default localStorage under STORE_KEY, for the realtime server it came from.
 * A node that fails a connect is passed over for the next cached node, then
 * the realtime server itself. A move to an offered node that fails while the
 * old socket is on the realtime server pauses direct connections for an hour,
 * and so does a site's CSP that blocks a node, at once.
 */
import { io as socketIo, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';
import { type NodeStore } from './node-cache.js';
/** The connection protocol this client speaks, sent as `rt` in every handshake. */
export declare const PROTOCOL = 1;
/** Where the node cache is kept by default: one key for every product of the page. */
export declare const STORE_KEY = "wordplus-realtime-nodes";
/** How long a move waits for its new socket to connect, then to be ready to take over. */
export declare const MOVE_CONNECT_MS = 10000;
export declare const MOVE_READY_MS = 10000;
export interface RealtimeConnectionOptions {
    /** The realtime server's own URL, which its load balancer answers: https://ws.wordplus.cloud. */
    server: string;
    /** The product's namespace, such as /estream; the main one by default. */
    namespace?: string;
    /** The Socket.IO path, such as /websocket. */
    path?: string;
    /** The product's handshake, asked for at every connect, so a renewed token goes with the next. `rt` is added. */
    auth: () => Record<string, unknown>;
    /** Every socket the connection makes, before it connects: the product's listeners go on it here. */
    attach: (socket: Socket, isCurrent: () => boolean) => void;
    /** When a move's new socket may take over, once it has connected: at once by default. Easy Stream waits for its `hello`. */
    ready?: (socket: Socket) => Promise<unknown>;
    /** A move's new socket took over, with what `ready` gave. The old one closes once its replies are in. */
    moved?: (socket: Socket, ready: unknown) => void;
    /** Where the node cache lives: localStorage under STORE_KEY by default; null keeps it in memory. */
    store?: NodeStore | null;
    /** Socket.IO's own options for every socket, such as reconnectionDelayMax. */
    options?: Partial<ManagerOptions & SocketOptions>;
    /** Stand-ins for tests. */
    io?: typeof socketIo;
    random?: () => number;
}
export declare class RealtimeConnection {
    private readonly options;
    /** The socket the product sends on, which a move replaces. */
    socket: Socket;
    private readonly nodes;
    private readonly io;
    private readonly random;
    private readonly timers;
    /** A move's new socket, until it takes over; a `migrate` it hears meanwhile waits for that. */
    private moving;
    private deferred;
    private failMove;
    private closed;
    private stopWatchingCsp;
    /** A store read at once (localStorage, memory): a direct offer needs no wait for a read. */
    private readonly storeReadsAtOnce;
    constructor(options: RealtimeConnectionOptions);
    /** Closes the connection and any move under way. */
    close(): void;
    /** The nodes kept for the next connections, best first: none while paused. */
    keptNodes(): string[];
    private open;
    private watch;
    private onMigrate;
    private startMove;
    private moveTo;
    /** Resolves when the socket connects; rejects when it fails, the move is called off, or the time is up. */
    private connected;
    private within;
    /** The old socket closes once the replies under way on it are in, three seconds at most. */
    private retire;
    private later;
    /**
     * A site's CSP that leaves the nodes out of connect-src. Chromium fails the
     * WebSocket at once; WebKit and Firefox throw from its constructor, which
     * engine.io-client doesn't hear, and the connect waited out its timeout.
     * The violation tells at once, and it holds for every page of the site:
     * direct connections pause, a move to a blocked node is called off, and a
     * socket connecting to one goes to the realtime server now.
     */
    private watchCsp;
}
