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
import { Manager } from 'socket.io-client';
import { Listeners, timedReply } from './channel.js';
import { MOVE_CONNECT_MS, MOVE_READY_MS } from './connection.js';
import { pendingReplies, REPLY_WAIT_MS, REPLY_WAITS } from './direct-socket.js';
import { FIRST_READ_WAIT_MS, NodeCacheKeeper, SERVER_CONNECT_TIMEOUT_MS, aim, connectTimeout, hostOf, managerUrl, migrateSpread, migrateTarget, sameServer, } from './node-cache.js';
/** The connection protocol a shared connection speaks, sent as `rt` in every namespace's handshake. */
export const SHARED_PROTOCOL = 2;
const defaultManager = (url, options) => new Manager(url, options);
export class Hub {
    constructor(options) {
        this.options = options;
        this.nodes = new NodeCacheKeeper();
        this.connections = [];
        this.timers = new Set();
        this.stopWatchingCsp = null;
        this.closed = false;
        /**
         * The store's first read, for a store that can't be read at once (the
         * SharedWorker's IndexedDB), FIRST_READ_WAIT_MS at most: a connection
         * made meanwhile waits on it to pick its first node. Null once it is in.
         */
        this.firstRead = null;
        this.server = options.server;
        this.random = options.random ?? Math.random;
        this.makeManager = options.manager ?? defaultManager;
        const store = options.store ?? null;
        this.storeReadsAtOnce = !store || !!store.readNow;
        if (store)
            this.nodes.setStore(store);
        if (!this.storeReadsAtOnce) {
            const read = new Promise((resolve) => {
                const timer = this.later(resolve, FIRST_READ_WAIT_MS);
                void this.nodes.loading.then(() => {
                    this.cancel(timer);
                    resolve();
                });
            });
            this.firstRead = read.then(() => {
                this.firstRead = null;
            });
        }
        if (options.doc)
            this.watchCsp(options.doc);
    }
    /**
     * A product's namespace: on the first connection that doesn't have it yet,
     * else on a new one. A rider goes only on a connection that holds another
     * namespace, and is refused with `no_connection` when there is none.
     */
    attach(spec, sink) {
        if (this.closed)
            throw new Error('the hub is closed');
        const free = (c) => c.free(spec.namespace);
        let conn = spec.rides
            ? this.connections.find((c) => free(c) && c.hasPrimary() && c.primaryConnected()) ?? this.connections.find((c) => free(c) && c.hasPrimary())
            : this.connections.find(free);
        if (!conn) {
            if (spec.rides) {
                const member = new Member(null, spec, sink, this);
                this.refuseRider(member);
                return member;
            }
            conn = new Connection(this, this.firstRead);
            this.connections.push(conn);
        }
        return conn.add(spec, sink);
    }
    /** A rider whose connection went, at its `connect()`: onto another that holds a namespace, if one does. */
    reattach(member) {
        const conn = this.connections.find((c) => c.free(member.spec.namespace) && c.hasPrimary());
        if (conn)
            conn.adopt(member);
        else
            this.refuseRider(member);
    }
    /** No connection to ride on: refused, and tried again at its `connect()`. */
    refuseRider(member) {
        queueMicrotask(() => {
            if (!member.gone)
                member.sink.refused(new Error('no_connection'), false);
        });
    }
    /** Whether a connection is up with a namespace that doesn't ride, which a rider may join. */
    holds() {
        return this.connections.some((c) => c.primaryConnected());
    }
    /** The nodes kept for the next connections, best first: none while paused. */
    keptNodes() {
        return this.nodes.fresh(this.server);
    }
    close() {
        this.closed = true;
        for (const timer of this.timers)
            clearTimeout(timer);
        this.timers.clear();
        for (const conn of [...this.connections])
            conn.close();
        this.stopWatchingCsp?.();
    }
    get isClosed() {
        return this.closed;
    }
    /** A manager to `url`, which connects only when a socket of it does. */
    manager(url, timeout, reconnection) {
        const { path, options } = this.options;
        const manager = this.makeManager(url, {
            ...options,
            ...(path ? { path } : {}),
            autoConnect: false,
            reconnection,
            timeout,
        });
        aim(manager, url, this.server, timeout);
        return manager;
    }
    forget(conn) {
        const i = this.connections.indexOf(conn);
        if (i >= 0)
            this.connections.splice(i, 1);
    }
    later(fn, ms) {
        const timer = setTimeout(() => {
            this.timers.delete(timer);
            fn();
        }, ms);
        this.timers.add(timer);
        return timer;
    }
    cancel(timer) {
        clearTimeout(timer);
        this.timers.delete(timer);
    }
    /**
     * A site's CSP that leaves the nodes out of connect-src, heard at once from
     * the page (connection.ts has the why): direct connections pause, a move
     * to a blocked node is called off, and a connection connecting to one goes
     * to the realtime server now. Only a page host has it: a SharedWorker's
     * script answers to its own response's CSP, not the page's.
     */
    watchCsp(doc) {
        const server = this.server;
        const onViolation = (event) => {
            const violation = event;
            if (this.closed)
                return;
            if (!/^(connect|default)-src\b/.test(violation.effectiveDirective || violation.violatedDirective || ''))
                return;
            const blocked = hostOf(violation.blockedURI || '');
            if (!blocked || blocked === hostOf(server))
                return;
            for (const conn of [...this.connections])
                conn.blocked(blocked);
        };
        doc.addEventListener('securitypolicyviolation', onViolation);
        this.stopWatchingCsp = () => doc.removeEventListener('securitypolicyviolation', onViolation);
    }
}
/** A namespace's socket on a connection, and on a move's new one meanwhile: what carries a channel. */
class Member {
    constructor(conn, spec, sink, hub) {
        this.conn = conn;
        this.spec = spec;
        this.sink = sink;
        this.hub = hub;
        this.socket = null;
        /** A rider waiting for its connection's other namespaces to connect. */
        this.parked = false;
        /** Left, or its connection gone. */
        this.gone = false;
    }
    get id() {
        return this.socket?.id;
    }
    emit(event, args, reply) {
        if (this.gone || !this.socket)
            return;
        if (reply)
            this.socket.emit(event, ...args, reply);
        else
            this.socket.emit(event, ...args);
    }
    connect() {
        if (this.gone)
            return;
        // A rider whose connection went: onto another, if one is up.
        if (!this.conn) {
            this.hub.reattach(this);
            return;
        }
        if (this.spec.rides && !this.conn.primaryConnected()) {
            this.parked = true;
            return;
        }
        this.parked = false;
        // Its connection connects every namespace once it knows where to.
        if (this.conn.starting)
            return;
        this.socket?.connect();
    }
    update() {
        // The handshake is asked for at every connect.
    }
    close() {
        if (this.gone)
            return;
        this.gone = true;
        this.conn?.remove(this);
    }
}
/** A move's new socket, as the product's `ready` sees it: its listeners last until the switch. */
class Pending {
    constructor(socket) {
        this.socket = socket;
        this.listeners = new Listeners();
        this.done = false;
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
    onAny(fn) {
        this.listeners.onAny(fn);
        return this;
    }
    emit(event, ...args) {
        if (!this.done)
            this.socket.emit(event, ...args);
        return this;
    }
    emitWithAck(event, ...args) {
        return new Promise((resolve) => this.emit(event, ...args, (first) => resolve(first)));
    }
    timeout(ms) {
        return {
            emit: (event, ...args) => {
                const fn = args.pop();
                this.emit(event, ...args, timedReply(fn, ms).reply);
            },
            emitWithAck: (event, ...args) => new Promise((resolve, reject) => {
                this.emit(event, ...args, timedReply((err, first) => err ? reject(err) : resolve(first), ms).reply);
            }),
        };
    }
    fire(event, args) {
        if (!this.done)
            this.listeners.fire(event, args);
    }
    end() {
        this.done = true;
        this.listeners.off();
        this.listeners.offAny();
    }
}
class Move {
    constructor(manager, target, request) {
        this.manager = manager;
        this.target = target;
        this.request = request;
        this.entries = new Map();
        /** The new manager's connection opened: a namespace refused there is no sign against the node. */
        this.opened = false;
        this.error = null;
        this.reject = () => { };
        this.failed = new Promise((_, reject) => {
            this.reject = reject;
        });
        this.failed.catch(() => { });
    }
    /** Calls the move off: a refusal, a failed connect, the page's CSP, or the connection closing. */
    fail(error) {
        if (this.error)
            return;
        this.error = error;
        this.reject(error);
    }
    /** Every namespace connected and ready, those that join meanwhile included. */
    async settled() {
        for (;;) {
            const batch = [...this.entries.values()];
            await Promise.race([Promise.all(batch.map((e) => e.done)), this.failed]);
            if (this.error)
                throw this.error;
            if ([...this.entries.values()].every((e) => batch.includes(e)))
                return;
        }
    }
}
export class Connection {
    /**
     * To the first cached node, else the realtime server itself. While the
     * hub's first read is under way, made for the realtime server, and aimed
     * at the first cached node once the read is in.
     */
    constructor(hub, firstRead) {
        this.hub = hub;
        this.members = new Map();
        this.move = null;
        this.scheduled = null;
        /** A `migrate` the move's new connection heard: taken once it is the current one. */
        this.deferred = null;
        /** Namespaces whose socket left while its handshake was under way, until the server is told (drop). */
        this.closing = new Map();
        this.closed = false;
        /** Waiting for the hub's first read of the node cache: its namespaces connect once it is in. */
        this.starting = false;
        const url = firstRead ? hub.server : hub.nodes.first(hub.server);
        this.manager = this.newManager(url, connectTimeout(url, hub.server), true);
        if (!firstRead)
            return;
        this.starting = true;
        void firstRead.then(() => {
            this.starting = false;
            if (this.closed)
                return;
            aim(this.manager, hub.nodes.first(hub.server), hub.server);
            for (const member of this.members.values()) {
                if (!member.spec.rides)
                    member.socket?.connect();
            }
        });
    }
    /** Whether a namespace may go on this connection: neither on it, nor still leaving it. */
    free(namespace) {
        return !this.members.has(namespace) && !this.closing.has(namespace);
    }
    hasPrimary() {
        for (const m of this.members.values())
            if (!m.spec.rides)
                return true;
        return false;
    }
    primaryConnected() {
        for (const m of this.members.values())
            if (!m.spec.rides && m.socket?.connected)
                return true;
        return false;
    }
    add(spec, sink) {
        const member = new Member(this, spec, sink, this.hub);
        this.adopt(member);
        return member;
    }
    adopt(member) {
        member.conn = this;
        member.parked = false;
        this.members.set(member.spec.namespace, member);
        member.socket = this.socketFor(this.manager, member);
        if (member.spec.rides && !this.primaryConnected())
            member.parked = true;
        else if (!this.starting)
            member.socket.connect();
        // Attached during a move: on the move's connection too, and the move waits for it.
        if (this.move && !member.spec.rides)
            this.join(this.move, member);
    }
    remove(member) {
        if (this.members.get(member.spec.namespace) !== member)
            return;
        this.members.delete(member.spec.namespace);
        this.drop(this.manager, member.socket);
        const entry = this.move?.entries.get(member);
        if (entry) {
            this.move.entries.delete(member);
            entry.pending.end();
            entry.leave();
            this.drop(this.move.manager, entry.socket);
        }
        // Riders with nothing left to ride on.
        if (!this.hasPrimary()) {
            for (const rider of [...this.members.values()]) {
                this.members.delete(rider.spec.namespace);
                this.drop(this.manager, rider.socket);
                rider.socket = null;
                rider.conn = null;
                rider.sink.dropped('io server disconnect');
                rider.sink.refused(new Error('no_connection'), false);
            }
        }
        if (this.members.size === 0)
            this.close();
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.scheduled)
            this.hub.cancel(this.scheduled.timer);
        this.scheduled = null;
        this.move?.fail(new Error('closed'));
        for (const member of [...this.members.values()]) {
            this.drop(this.manager, member.socket);
            member.conn = null;
        }
        this.members.clear();
        // The manager closes with its last socket, and the server forgets every namespace of it.
        for (const socket of [...this.closing.values()])
            socket.disconnect();
        this.closing.clear();
        this.hub.forget(this);
    }
    /**
     * A namespace's socket off its manager, which socket.io closes once none
     * is active. socket.io tells the server only of a connected socket's
     * leaving: one whose handshake is under way, on a connection that stays,
     * is closed once the server took it, or the server would keep it for as
     * long as the connection lives. The namespace is busy on this connection
     * until then, since the server can't tell two sockets of a namespace apart.
     * `now` closes it at once, for a connection that closes anyway.
     */
    drop(manager, socket, now = false) {
        if (!socket)
            return;
        socket.offAny();
        socket.removeAllListeners();
        const nsps = manager.nsps ?? {};
        const name = socket.nsp ?? '';
        // A later attach of the namespace gets a socket of its own, not this one with its handshake.
        const forget = () => {
            if (nsps[name] === socket)
                delete nsps[name];
            if (this.closing.get(name) === socket)
                this.closing.delete(name);
        };
        const leaving = [...this.closing.values()];
        const stays = Object.values(nsps).some((s) => s !== socket && s.active && !leaving.includes(s));
        if (!now && !this.closed && stays && socket.active && !socket.connected) {
            let timer = null;
            const finish = () => {
                if (timer)
                    this.hub.cancel(timer);
                socket.off('connect', finish);
                socket.off('connect_error', finish);
                socket.disconnect();
                forget();
            };
            socket.once('connect', finish);
            socket.once('connect_error', finish);
            timer = this.hub.later(finish, MOVE_CONNECT_MS);
            this.closing.set(name, socket);
            return;
        }
        socket.disconnect();
        forget();
    }
    newManager(url, timeout, reconnection) {
        const manager = this.hub.manager(url, timeout, reconnection);
        const server = this.hub.server;
        manager.on('open', () => {
            if (this.closed)
                return;
            if (manager === this.move?.manager) {
                this.move.opened = true;
                return;
            }
            if (manager !== this.manager)
                return;
            // Online: the nodes that failed meanwhile leave the cache, and at a node a pause ends.
            const at = managerUrl(manager);
            this.hub.nodes.reached(at, server);
            // Its reconnects wait as long as any connect to where it is now.
            aim(manager, at, server);
        });
        // A connect that failed, once whatever namespaces it carries: the next cached node, then the realtime server.
        manager.on('error', (error) => {
            if (this.closed)
                return;
            if (manager === this.move?.manager) {
                this.move.fail(error);
                return;
            }
            if (manager !== this.manager)
                return;
            aim(manager, this.hub.nodes.failed(managerUrl(manager), server), server);
        });
        return manager;
    }
    socketFor(manager, member) {
        const socket = manager.socket(member.spec.namespace, {
            auth: (cb) => cb({ ...member.spec.auth(), rt: SHARED_PROTOCOL }),
        });
        socket.onAny((event, ...args) => this.heard(member, socket, event, args));
        socket.on('connect', () => {
            if (this.closed || socket !== member.socket)
                return;
            member.sink.opened(socket.id);
            // The riders waiting for a namespace that doesn't ride.
            if (!member.spec.rides) {
                for (const rider of this.members.values()) {
                    if (rider.spec.rides && rider.parked && !rider.gone) {
                        rider.parked = false;
                        rider.socket?.connect();
                    }
                }
            }
        });
        socket.on('disconnect', (reason) => {
            if (this.closed || socket !== member.socket)
                return;
            member.sink.dropped(reason);
            // A rider comes back only once a namespace that doesn't ride has.
            if (member.spec.rides && socket.active) {
                socket.disconnect();
                member.parked = true;
            }
        });
        socket.on('connect_error', (error) => {
            if (this.closed || socket !== member.socket)
                return;
            // A refusal leaves the socket inactive. A rider refused for want of a connection tries again
            // when a namespace that doesn't ride connects.
            if (!socket.active && member.spec.rides && error?.message === 'no_connection')
                member.parked = true;
            member.sink.refused(error, socket.active);
        });
        return socket;
    }
    heard(member, socket, event, args) {
        if (this.closed)
            return;
        const manager = socket.io;
        // The connection's business, never the product's.
        if (event === 'migrate') {
            this.onMigrate(manager, args[0]);
            return;
        }
        if (event === 'nodes') {
            if (manager === this.manager || manager === this.move?.manager)
                this.hub.nodes.update(this.hub.server, args[0]?.nodes);
            return;
        }
        if (socket === member.socket) {
            member.sink.deliver(event, args);
            return;
        }
        // A move's new socket, before the switch: the product's `ready` alone hears it.
        const entry = this.move?.entries.get(member);
        if (entry?.socket === socket)
            entry.pending.fire(event, args);
    }
    onMigrate(manager, request) {
        // The move's new connection: after it takes over.
        if (this.move && manager === this.move.manager) {
            this.deferred = request;
            return;
        }
        if (manager !== this.manager)
            return;
        // A direct offer is decided on the stored cache: a pause another tab stored holds, however slow its first read.
        if (request?.reason === 'direct' && !this.hub.storeReadsAtOnce) {
            void this.hub.nodes.ready().then(() => this.schedule(manager, request));
            return;
        }
        this.schedule(manager, request);
    }
    schedule(manager, request) {
        const server = this.hub.server;
        if (this.closed || manager !== this.manager || this.move)
            return;
        const direct = request?.reason === 'direct';
        if (this.scheduled) {
            // One move: a second offer changes nothing, and a drain replaces an offer.
            if (direct || !this.scheduled.direct)
                return;
            this.hub.cancel(this.scheduled.timer);
            this.scheduled = null;
        }
        if (direct && this.hub.nodes.paused(server))
            return;
        // A direct offer it can't use leaves the connection where it is (migrateTarget).
        const target = migrateTarget(request, server, managerUrl(manager));
        if (!target)
            return;
        // Should the connection drop before its move, it reconnects there too, rather than to a node going away.
        aim(manager, target, server);
        if (direct)
            this.hub.nodes.offered(target, server, request?.nodes);
        else
            this.hub.nodes.remember(target, server, request?.nodes);
        const timer = this.hub.later(() => {
            this.scheduled = null;
            void this.moveTo(target, request);
        }, this.hub.random() * migrateSpread(request));
        this.scheduled = { timer, direct };
    }
    async moveTo(target, request) {
        const server = this.hub.server;
        if (this.closed || this.move)
            return;
        if (!this.hasPrimary())
            return;
        const from = this.manager;
        const direct = request?.reason === 'direct';
        // A move to an offered node that fails pauses direct connections, so it waits as long as a
        // connect to the realtime server does: a slow network is not a blocked one.
        const next = this.newManager(target, direct ? SERVER_CONNECT_TIMEOUT_MS : connectTimeout(target, server), false);
        const move = new Move(next, target, request);
        this.move = move;
        this.deferred = null;
        for (const member of this.members.values()) {
            if (!member.spec.rides)
                this.join(move, member);
        }
        try {
            await move.settled();
            if (this.closed || this.manager !== from || move.entries.size === 0)
                throw new Error('stopped during the move');
            this.switchTo(move, from);
        }
        catch {
            // The move's connection goes whole, and the server forgets every namespace of it.
            for (const [member, entry] of move.entries) {
                entry.pending.end();
                this.drop(next, entry.socket, true);
                move.entries.delete(member);
            }
            this.deferred = null;
            if (this.move === move)
                this.move = null;
            if (this.closed)
                return;
            // Where the old connection reconnects should it drop: the realtime server, which it reached
            // before, rather than a target it could not; after a drain's target, the drain's next node.
            // A direct offer's node that doesn't connect while the server answers pauses direct
            // connections. One that connected but where a namespace wasn't taken or ready is no sign
            // against the node.
            let fallback = server;
            if (!move.opened && !sameServer(target, server)) {
                if (!direct)
                    fallback = this.hub.nodes.failed(target, server);
                else if (this.manager === from && this.primaryConnected())
                    this.hub.nodes.pause(server);
                else
                    this.hub.nodes.failed(target, server);
            }
            if (this.manager === from)
                aim(from, fallback, server);
        }
        finally {
            if (this.move === move)
                this.move = null;
        }
    }
    /** A namespace on the move's connection: its socket there, the product's `ready` asked at once, its connect. */
    join(move, member) {
        const socket = this.socketFor(move.manager, member);
        const pending = new Pending(socket);
        // Asked at once, so nothing the new socket hears after its connect is missed.
        const ready = member.sink.prepare(pending);
        ready.catch(() => { });
        const connected = new Promise((resolve, reject) => {
            const timer = this.hub.later(() => reject(new Error('connect timeout')), MOVE_CONNECT_MS);
            socket.once('connect', () => {
                this.hub.cancel(timer);
                resolve();
            });
            socket.once('connect_error', (error) => {
                this.hub.cancel(timer);
                reject(error);
            });
        });
        let leave = () => { };
        const left = new Promise((resolve) => {
            leave = resolve;
        });
        const entry = { socket, pending, done: Promise.resolve(), leave };
        const settled = connected
            .then(() => within(this.hub, ready, MOVE_READY_MS, 'not ready'))
            .then((value) => {
            entry.value = value;
        });
        // A namespace refused, not ready, or not connected calls the whole move off, unless it left meanwhile.
        settled.catch((error) => {
            if (move.entries.get(member) === entry)
                move.fail(error);
        });
        entry.done = Promise.race([settled.catch(() => { }), left]);
        move.entries.set(member, entry);
        socket.connect();
    }
    switchTo(move, from) {
        const server = this.hub.server;
        const old = [];
        this.manager = move.manager;
        this.move = null;
        for (const [member, entry] of move.entries) {
            if (member.gone || this.members.get(member.spec.namespace) !== member) {
                this.drop(move.manager, entry.socket);
                continue;
            }
            if (member.socket)
                old.push(member.socket);
            member.socket = entry.socket;
            entry.pending.end();
        }
        move.manager.reconnection(true);
        // Its reconnects wait for its node no longer than any connect to a node.
        aim(move.manager, move.target, server);
        this.hub.nodes.remember(move.target, server, move.request?.nodes);
        // Its connect came before it took over, so the handlers skipped it.
        this.hub.nodes.reached(move.target, server);
        for (const [member, entry] of move.entries) {
            if (member.socket === entry.socket)
                member.sink.moved(entry.value);
        }
        // Riders: onto the new connection, now that a namespace that doesn't ride is up there.
        for (const rider of this.members.values()) {
            if (!rider.spec.rides || rider.gone)
                continue;
            if (rider.socket)
                old.push(rider.socket);
            const was = rider.socket?.connected;
            rider.socket = this.socketFor(move.manager, rider);
            if (was)
                rider.sink.dropped('transport close');
            rider.parked = false;
            rider.socket.connect();
        }
        // Sockets still leaving the old connection go with it. Those leaving the new one wait there.
        for (const [name, socket] of [...this.closing]) {
            if (socket.io !== from)
                continue;
            old.push(socket);
            this.closing.delete(name);
        }
        this.retire(from, old);
        const deferred = this.deferred;
        this.deferred = null;
        if (deferred)
            this.onMigrate(move.manager, deferred);
    }
    /** The old connection closes once the replies under way on it are in, three seconds at most. */
    retire(manager, sockets) {
        let waits = 0;
        const close = () => {
            if (sockets.some((s) => pendingReplies(s) > 0) && waits++ < REPLY_WAITS && !this.closed) {
                this.hub.later(close, REPLY_WAIT_MS);
                return;
            }
            for (const socket of sockets)
                this.drop(manager, socket, true);
        };
        close();
    }
    /** The page's CSP blocked `host` (Hub.watchCsp). */
    blocked(host) {
        const server = this.hub.server;
        const move = this.move;
        if (move && !move.opened && host === hostOf(move.target)) {
            move.fail(new Error('blocked by the page\'s CSP'));
            return;
        }
        if (this.primaryConnected())
            return;
        const at = managerUrl(this.manager);
        // A node this connection is connecting to, or one that failed it moments ago.
        if (host !== hostOf(at) && !this.hub.nodes.failures().some((url) => hostOf(url) === host))
            return;
        this.hub.nodes.pause(server);
        aim(this.manager, server, server);
        // The attempt under way goes, and the next goes to the realtime server.
        const active = [...this.members.values()].filter((m) => m.socket?.active && !m.parked);
        for (const m of active)
            m.socket.disconnect();
        for (const m of active)
            m.socket.connect();
    }
}
function within(hub, promise, ms, message) {
    return new Promise((resolve, reject) => {
        const timer = hub.later(() => reject(new Error(message)), ms);
        promise.then((value) => {
            hub.cancel(timer);
            resolve(value);
        }, (error) => {
            hub.cancel(timer);
            reject(error);
        });
    });
}
