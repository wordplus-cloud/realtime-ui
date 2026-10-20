/**
 * A namespace that several attaches share: tabs of one product, each with
 * its own channel, on one socket of one connection. Socket.IO carries a namespace once on a connection, so
 * without this a second tab's attach of a namespace already there opens a second connection.
 *
 * A product says `share` with a key; attaches of one namespace and one key share. What they share must be
 * the same for each of them: the handshake (the first attach's, while it stays, then the next's), and what
 * the server sends on the socket, which every one of them hears. A product that needs each tab told apart
 * does it on the socket itself (Easy Stream: a `watch` per stream, its events carrying the stream).
 *
 * - **Connecting:** an attach that joins a socket that is up hears `connect` at once (`opened`), so it can
 *   do what it does on a connect; one that joins a socket the server refused hears that.
 * - **Moves:** each one's `ready` runs on the move's new socket, and each hears `moved` with what its own
 *   `ready` gave. One that joined after the readies were asked hears a reconnect instead (`dropped`, then
 *   `opened`), so it does again on the new socket what it does on a connect.
 * - **Leaving:** the socket leaves with the last of them. One that leaves while others stay sends its farewell
 *   on it, if it named one (Channel.farewell), so the server lets go of what that tab joined there:
 *   closed, its page hidden, or its tab gone (remote.ts).
 */
import type { Link, MemberSpec, Sink } from './channel.js';
/** How a shared namespace gets its one link on a connection: the hub's attach. */
export type LinkMaker = (spec: MemberSpec, sink: Sink) => Link;
export declare class SharedNamespace {
    private readonly onEmpty;
    private readonly sharers;
    private readonly link;
    private connected;
    private sid;
    private refusal;
    /** A move's readies under way: the new socket, and each sharer's `ready`. */
    private preparing;
    private closed;
    constructor(make: LinkMaker, first: MemberSpec, onEmpty: () => void);
    /** A sharer's attach: its own link, on the one socket. */
    join(spec: MemberSpec, sink: Sink): Link;
    private leave;
    /** What the hub tells the one link, told to each sharer. */
    private sink;
    /** Every sharer's `ready` on the move's new socket (one without a ready answers at once), those that join meanwhile too. */
    private prepare;
}
