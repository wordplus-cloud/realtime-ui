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
/** The spec of a product's attach. */
export function specOf(options) {
    return {
        namespace: options.namespace, auth: options.auth, rides: !!options.rides, ready: !!options.ready,
        ...(typeof options.share === 'string' && options.share ? { share: options.share } : {}),
    };
}
/** The events a channel fires itself. */
const RESERVED = new Set(['connect', 'disconnect', 'connect_error']);
/** The error a reply with a timeout gets when the time is up, as socket.io's. */
export const timedOut = () => new Error('operation has timed out');
/** A list of listeners, each kept once or for good. */
export class Listeners {
    constructor() {
        this.byEvent = new Map();
        this.any = [];
    }
    on(event, fn, once = false) {
        const list = this.byEvent.get(event) ?? [];
        list.push({ fn, once });
        this.byEvent.set(event, list);
    }
    off(event, fn) {
        if (event === undefined) {
            this.byEvent.clear();
            return;
        }
        const list = this.byEvent.get(event);
        if (!list)
            return;
        const kept = fn ? list.filter((l) => l.fn !== fn) : [];
        if (kept.length > 0)
            this.byEvent.set(event, kept);
        else
            this.byEvent.delete(event);
    }
    onAny(fn) {
        this.any.push(fn);
    }
    offAny(fn) {
        this.any = fn ? this.any.filter((f) => f !== fn) : [];
    }
    /** `any` listeners hear the server's events, not the reserved ones, as socket.io's `onAny`. */
    fire(event, args, any = true) {
        if (any)
            for (const fn of [...this.any])
                fn(event, ...args);
        const list = this.byEvent.get(event);
        if (!list)
            return;
        for (const l of [...list]) {
            if (l.once)
                this.off(event, l.fn);
            l.fn(...args);
        }
    }
    count(event) {
        return this.byEvent.get(event)?.length ?? 0;
    }
}
/** A reply's callback with the time it waits, `fn( err, ...reply )`, fired once whichever comes first. */
export function timedReply(fn, ms) {
    let done = false;
    const timer = setTimeout(() => {
        if (done)
            return;
        done = true;
        fn(timedOut());
    }, ms);
    return {
        reply: (...args) => {
            if (done)
                return;
            done = true;
            clearTimeout(timer);
            fn(null, ...args);
        },
        cancel: () => {
            done = true;
            clearTimeout(timer);
        },
    };
}
export class Channel {
    constructor(options) {
        this.options = options;
        this.connected = false;
        /** False once the handshake was refused or the channel was closed: it then tries no more until `connect()`. */
        this.active = true;
        this.listeners = new Listeners();
        this.link = null;
        /** What the product sent before the channel was bound, sent once it is. */
        this.queue = [];
        this.closed = false;
        /** What its link sends when it leaves a shared socket (farewell). */
        this.parting = null;
    }
    get namespace() {
        return this.options.namespace;
    }
    get id() {
        return this.link?.id;
    }
    /** Whether the channel was closed by the product. */
    get isClosed() {
        return this.closed;
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    once(event, fn) {
        this.listeners.on(event, fn, true);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    removeAllListeners(event) {
        this.listeners.off(event);
        return this;
    }
    onAny(fn) {
        this.listeners.onAny(fn);
        return this;
    }
    offAny(fn) {
        this.listeners.offAny(fn);
        return this;
    }
    listenerCount(event) {
        return this.listeners.count(event);
    }
    /** As a socket's: a function last is the reply's callback. */
    emit(event, ...args) {
        const fn = typeof args[args.length - 1] === 'function' ? args.pop() : undefined;
        this.send(event, args, fn);
        return this;
    }
    emitWithAck(event, ...args) {
        return new Promise((resolve) => this.send(event, args, (first) => resolve(first)));
    }
    /**
     * A reply that waits `ms` at most, as a socket's `timeout()`: its callback
     * gets an error first, the timeout's or null.
     */
    timeout(ms) {
        return {
            emit: (event, ...args) => {
                const fn = args.pop();
                if (typeof fn !== 'function')
                    throw new Error('timeout().emit needs a callback last');
                this.send(event, args, timedReply(fn, ms).reply);
            },
            emitWithAck: (event, ...args) => new Promise((resolve, reject) => {
                this.send(event, args, timedReply((err, first) => err ? reject(err) : resolve(first), ms).reply);
            }),
        };
    }
    /** Again after a refusal, with the handshake as it is now. */
    connect() {
        if (this.closed)
            return this;
        this.active = true;
        if (this.link)
            this.link.connect();
        return this;
    }
    /** The handshake changed: the next connects take it. */
    update() {
        this.link?.update();
        return this;
    }
    /**
     * On a shared socket (`share`), what this channel sends on it when it leaves while others stay: closed, its
     * page hidden, or its tab gone, which the worker finds out by itself. The product's way of leaving what it
     * joined on the socket, as Easy Stream's `unwatch` of its stream. Called again it replaces it; with no event
     * it is cleared.
     */
    farewell(event, ...args) {
        this.parting = event ? { event, args } : null;
        this.link?.farewell?.(event ?? null, args);
        return this;
    }
    /** Leaves the connection. The last namespace to leave closes it. */
    close() {
        if (this.closed)
            return this;
        this.closed = true;
        this.active = false;
        this.queue = [];
        const was = this.connected;
        this.connected = false;
        this.link?.close();
        if (was)
            this.listeners.fire('disconnect', ['io client disconnect'], false);
        return this;
    }
    disconnect() {
        return this.close();
    }
    /** Bound to what carries it, by the page's connector. */
    bind(link) {
        if (this.closed) {
            link.close();
            return;
        }
        this.link = link;
        const queue = this.queue;
        this.queue = [];
        for (const send of queue)
            send(link);
        if (this.parting)
            link.farewell?.(this.parting.event, this.parting.args);
    }
    send(event, args, reply) {
        if (this.closed)
            return;
        if (RESERVED.has(event))
            throw new Error('"' + event + '" is a reserved event name');
        if (this.link)
            this.link.emit(event, args, reply);
        else
            this.queue.push((link) => link.emit(event, args, reply));
    }
    // The Sink: what the connector tells the channel.
    deliver(event, args) {
        if (this.closed)
            return;
        this.listeners.fire(event, args);
    }
    opened(_id) {
        if (this.closed)
            return;
        this.connected = true;
        this.active = true;
        this.listeners.fire('connect', [], false);
    }
    dropped(reason) {
        if (this.closed || !this.connected)
            return;
        this.connected = false;
        this.listeners.fire('disconnect', [reason], false);
    }
    refused(error, active) {
        if (this.closed)
            return;
        this.active = active;
        this.listeners.fire('connect_error', [error], false);
    }
    prepare(next) {
        if (this.closed || !this.options.ready)
            return Promise.resolve(undefined);
        return this.options.ready(next);
    }
    moved(value) {
        if (this.closed)
            return;
        this.options.moved?.(value);
    }
}
