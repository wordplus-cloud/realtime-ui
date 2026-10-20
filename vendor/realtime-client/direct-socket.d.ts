/**
 * The realtime server's `migrate` for a tab's own socket, where there is no
 * SharedWorker to hold one socket for every tab: phones and tablets, and the
 * apps. Every module of the page listens on this socket, so rather than open
 * a second one it moves by reconnecting, at a random moment within the
 * spread, and the page catches up as on any reconnect:
 * - `direct`: to the node offered, which is kept at once with one other node
 *   of the offer's, so the next page load connects to it directly even if
 *   this one closes before it moves. No offer is taken while direct
 *   connections are paused.
 * - `drain`, and `direct_off` back to the realtime server: to the target,
 *   paused or not.
 * The reconnect waits for the replies under way, a few seconds at most, since
 * a socket.io socket forgets their callbacks when it disconnects.
 *
 * A node's own list (`nodes`), at every direct connection and when the ready
 * nodes change, replaces the cache. A node that fails a connect is passed
 * over for the next cached node, then the realtime server itself, and leaves
 * the cache once the socket connects somewhere. A move to an offered node
 * that fails, with the realtime server answering after it, pauses direct
 * connections for an hour, and so does a site's CSP that blocks a node, at
 * once. The pause is kept with the nodes in localStorage, so every page load
 * and tab honours it (node-cache.ts).
 *
 * For a product whose page catches up cheaply after a reconnect. One that
 * should not drop its connection for a move takes connection.ts instead. Taken
 * from Better Messages, where a tab's own socket uses it; the socket's
 * handshake must say `rt`, which Better Messages says with its plugin version.
 */
import type { Socket } from 'socket.io-client';
import { NodeCacheKeeper } from './node-cache.js';
/** A move waits for the replies under way half a second at a time, three seconds at most. */
export declare const REPLY_WAIT_MS = 500;
export declare const REPLY_WAITS = 6;
/** The replies a socket.io socket waits for, which its disconnect loses. */
export declare function pendingReplies(socket: Socket): number;
/**
 * Where a tab's own socket connects first, and how long it waits there: the
 * first cached node, unless direct connections are paused, else the realtime
 * server itself.
 */
export declare function firstConnect(nodes: NodeCacheKeeper, server: string): {
    url: string;
    timeout: number;
};
export declare function watchDirect(socket: Socket, server: string, nodes: NodeCacheKeeper, isCurrent: () => boolean): void;
