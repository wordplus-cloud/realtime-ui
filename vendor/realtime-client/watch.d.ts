/**
 * Whose presence a connection watches, when many on it ask: the components of a page, or the tabs of a
 * SharedWorker. Transport-free: it says what to send, and its owner sends it on the protocol it speaks
 * (Better Messages' `watchUsers`, the rooms' `watch`).
 *
 * - **Interest by owner:** an owner (a component, a port, a tab) holds ids, and may ask for everyone (`all`) or
 *   how many are online (`count`). What is watched is their union: an id stays while any owner holds it.
 * - **The differences, batched:** what changed goes out `batchMs` after the first change, as one `send`.
 * - **A linger on release:** an id no owner holds any more is unwatched `lingerMs` later, unless watched again
 *   meanwhile, so a scrolling list doesn't unwatch and watch the same people again. `all` and `count` too.
 * - **The cap:** past `limit` ids it asks for `all` in their place, as one batched message a second costs the
 *   server less than that many watches.
 * - **Again, after a connect or onto a move's new socket:** `request()` is the whole interest, to send with
 *   `reset`. `version` tells whether anything changed since: a move that sent `request()` onto its new socket
 *   sends it again on switching over if it did.
 *
 * An id `send` removes is no longer watched one by one. Unless `covers()` still says so (under `all`), its owner
 * forgets it, so a later watch starts from the server's answer rather than an old guess.
 */
export interface WatchChange<Id> {
    /** Ids to watch now. */
    add: Id[];
    /** Ids to stop watching. */
    remove: Id[];
    /** Set only when it changed: true to start watching everyone, false to stop. */
    all?: boolean;
    /** Set only when it changed: true to start watching the count, false to stop. */
    count?: boolean;
}
export interface WatchRequest<Id> {
    reset: true;
    ids: Id[];
    all?: true;
    count?: true;
}
export interface WatchSetOptions<Id> {
    /** What changed, to send on the connection. It may drop it while there is none: `request()` follows a connect. */
    send: (change: WatchChange<Id>) => void;
    /** How long changes gather before they go: 50 ms. */
    batchMs?: number;
    /** How long a released interest stays watched: 5 s. 0 releases at the next batch. */
    lingerMs?: number;
    /** The most ids watched one by one: past it, `all` in their place. 1,000, as the servers allow on a socket. */
    limit?: number;
}
export declare const WATCH_BATCH_MS = 50;
export declare const WATCH_LINGER_MS = 5000;
export declare const WATCH_LIMIT = 1000;
export declare class WatchSet<Id = number> {
    private readonly options;
    private readonly owners;
    /** How many owners hold each id. */
    private readonly holders;
    private allOwners;
    private countOwners;
    /** Released, and when each goes. `all` and `count` under their own keys. */
    private readonly lingering;
    private allUntil;
    private countUntil;
    /** What the connection was last told. */
    private sent;
    private batch;
    private lingerTimer;
    private lingerAt;
    private readonly batchMs;
    private readonly lingerMs;
    private readonly limit;
    /** Goes up with every change of what is wanted. */
    version: number;
    constructor(options: WatchSetOptions<Id>);
    /** The owner watches these ids too. */
    watch(owner: unknown, ids: Iterable<Id>): void;
    /** The owner no longer watches these ids. */
    unwatch(owner: unknown, ids: Iterable<Id>): void;
    /** The owner watches everyone, or stops. */
    watchAll(owner: unknown, on?: boolean): void;
    /** The owner watches how many are online, or stops. */
    watchCount(owner: unknown, on?: boolean): void;
    /** Everything the owner held, released: a component unmounted, a tab gone. */
    drop(owner: unknown): void;
    /** Whether the connection watches the id now or is about to: held, lingering, or under `all`. */
    covers(id: Id): boolean;
    /** Whether the owner holds the id. */
    holds(owner: unknown, id: Id): boolean;
    /** The ids watched one by one, lingering ones included; none past the cap, where `all` stands for them. */
    get ids(): Id[];
    get all(): boolean;
    get count(): boolean;
    /**
     * The whole interest, to send with `reset` after a connect or onto a move's new socket; null when there is
     * none. It counts as sent: the batch waiting is in it.
     */
    request(): WatchRequest<Id> | null;
    /** Sends what changed now rather than at the end of the batch. */
    flush(): void;
    /** Lets go of everything without sending: the connection is closing. */
    clear(): void;
    private wanted;
    private holding;
    private forgetIfEmpty;
    private release;
    private releaseAll;
    private releaseCount;
    private wasLingering;
    private lingerUntil;
    private sweep;
    private changed;
    private cancelBatch;
    private now;
}
