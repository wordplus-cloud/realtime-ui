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
import { Listeners } from './channel.js';
import { labelOf, keyring as pageKeyring } from './keys.js';
import { realtime } from './registry.js';
export const ROOMS_NAMESPACE = '/channels';
/** How long a request on the socket waits for its answer. A move waits 10 s for every namespace. */
const ANSWER_MS = 8000;
/** Rooms one `join` names, the server's limit (its LIMITS.roomsPerJoin). */
const JOIN_MAX = 100;
/** A token is renewed this long before it runs out, so a move or a reconnect always has one that works. */
const RENEW_BEFORE_S = 600;
/** A token this close to its end is asked for again rather than sent. */
const FRESH_S = 60;
/**
 * After the app's server disconnected the user (`kicked` with `renew`, `signed_out`), how long the page waits before it
 * asks the app's server again: the realtime server refuses tokens signed in the second of the disconnect too.
 */
const RENEW_AFTER_MS = 1100;
/** An error the realtime server or the app's server answered, by its code (`forbidden`, `rate_limited`, `too_large` …). */
export class RealtimeError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'RealtimeError';
    }
}
const nowS = () => Math.floor(Date.now() / 1000);
/** The page's rooms: open one per site or app with `rooms()`. */
export function rooms(options) {
    return new Rooms(options);
}
export class Rooms {
    constructor(options) {
        this.options = options;
        /** This tab's name on the socket the browser's tabs share. */
        this.tab = newTab();
        this.held = new Map();
        this.tokens = new Map();
        this.listeners = new Listeners();
        /** The rooms to ask the app's server for together, until the request leaves. */
        this.batch = null;
        /**
         * The rooms joined and left in the same moment, which go to the realtime server in one request each way
         * (2026-10-18); one by one to a server that answers that `bad_request`, a server from before it (`many` false from
         * then on).
         */
        this.joining = null;
        this.leaving = null;
        this.many = true;
        this.renewal = null;
        this.closed = false;
        /** What else rides this socket and holds something on it: calls' lines (sdk-calls), held again with the rooms. */
        this.holders = new Set();
        this.identityRenewal = null;
        /** What this page answers the app's server's asks with, by event (`answer()`). */
        this.answerers = new Map();
        /** Events waiting for a key, delivered in the order they came. */
        this.queue = Promise.resolve();
        this.waiting = 0;
        this.site = options.site;
        this.keyring = options.keyring ?? pageKeyring();
        this.keyring.add(options.keys?.entries ?? [], 'page');
        this.identity = options.keys?.identity?.token ? options.keys.identity : null;
        // A plugin that asks the site for keys its own way (the Better Messages worker) has set how already.
        if (options.keys?.endpoint && !this.keyring.hasResolver())
            this.keyring.setResolver((labels) => this.askKeys(labels));
        this.scheduleIdentity();
        this.online = new Online(this);
        const attach = options.attach ?? ((o) => realtime({ ...options, user: options.perUser ? this.user : options.user ?? null }).attach(o));
        this.socket = attach({
            namespace: ROOMS_NAMESPACE,
            auth: () => ({ site: this.site, rt: 3 }),
            share: this.site,
            ready: (next) => this.joinAll(next),
            moved: () => this.listeners.fire('moved', [], false),
        });
        // What the server drops when this tab goes while the browser's others stay.
        this.socket.farewell('bye', { tab: this.tab });
        this.socket.on('connect', () => {
            this.listeners.fire('connected', [], false);
            void this.joinAll();
        });
        this.socket.on('disconnect', (reason) => {
            for (const room of this.held.values())
                room.lost();
            this.listeners.fire('disconnected', [reason], false);
        });
        this.socket.on('connect_error', (error) => this.listeners.fire('error', [{ code: error.message }], false));
        this.socket.on('e', (e) => this.deliver(e, false));
        this.socket.on('join', (m) => {
            if (!m || m.x === this.tab)
                return;
            this.inOrder([m.info], () => this.held.get(m.room)?.memberJoined(String(m.id), this.openInfo(m.info)));
        });
        this.socket.on('leave', (m) => this.inOrder([], () => this.held.get(m?.room)?.memberLeft(String(m?.id))));
        this.socket.on('count', (c) => this.held.get(c?.room)?.counted(Number(c?.n) || 0));
        this.socket.on('kicked', (k) => {
            if (k?.tab !== this.tab)
                return;
            const room = this.held.get(k.room);
            if (!room)
                return;
            this.tokens.delete(k.room);
            // The app's server disconnected the user: the room is asked for again, and the app's server decides.
            if (k.renew) {
                room.lost();
                setTimeout(() => {
                    if (this.held.get(k.room) === room && this.socket.connected)
                        void this.joinOne(room);
                }, RENEW_AFTER_MS);
                return;
            }
            this.held.delete(k.room);
            room.failed('kicked');
        });
        // The socket's user disconnected by the app's server: their identity asked for again, and with it who they
        // watch and their lines; `signed_out` tells the page.
        this.socket.on('signed_out', () => {
            this.identity = null;
            this.listeners.fire('signed_out', [], false);
            setTimeout(() => void this.renewIdentity(), RENEW_AFTER_MS);
        });
        this.socket.on('ask', (q) => this.answerAsk(q));
        this.socket.on('u', (u) => {
            if (!u || typeof u.event !== 'string' || u.x === this.tab)
                return;
            this.inOrder([u.data], () => {
                const data = this.openData(u.data);
                if (data === undefined && u.data !== undefined)
                    this.listeners.fire('error', [{ code: 'unopened', event: u.event, label: labelOf(u.data) }], false);
                else
                    this.listeners.fire(u.event, [data, { at: u.at }]);
            });
        });
        this.socket.on('online', (o) => this.online.changed(o));
        this.socket.on('online_count', (c) => this.online.counted(Number(c?.n) || 0));
    }
    get connected() {
        return this.socket.connected;
    }
    /** The user the app vouched for on this page, or null. */
    get user() {
        const sub = this.identity ? payloadOf(this.identity.token)?.sub : undefined;
        return sub === undefined || sub === null ? null : String(sub);
    }
    /**
     * What the app's server sends this user (`toUser( id ).emit( event, data )`), `fn( data, { at } )`; and the
     * connection's own: `connected`, `disconnected` (with the reason), `error` ({ code }: the handshake refused, such
     * as `not_included`), `moved`: the connection moved to another node without a drop, and `signed_out`: the app's
     * server disconnected the user, whose identity and rooms the page asks it for again.
     */
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
    /**
     * Answers what the app's server asks this user's pages (`user( id ).ask( event, data )`): `fn( data, { at } )`
     * returns the reply, or a promise of it, sealed with the user's key when the app gave one. One answer an event a
     * page, `null` takes it away. A page whose `fn` throws doesn't answer.
     */
    answer(event, fn) {
        if (fn)
            this.answerers.set(event, fn);
        else
            this.answerers.delete(event);
        return this;
    }
    /**
     * @internal What calls (sdk-calls) ride: the socket, this tab's name and the app's auth route. `hold` runs with
     * every join of the rooms: at each connect, and on a move's new socket before it takes over.
     */
    rideFor(hold) {
        this.holders.add(hold);
        return { socket: this.socket, tab: this.tab, options: this.options, keyring: this.keyring, release: () => this.holders.delete(hold) };
    }
    /**
     * Users of the app from its directory, by id, opened: those it holds, as `{ [id]: { user_id, name, avatar, url, … } }`.
     * A field whose key the app won't give stays null. Rejects with its `code`: `no_identity` when the app doesn't know
     * the page's user, `timeout` off line.
     */
    async users(ids) {
        if (!this.identity)
            await this.askKeys([]);
        if (!this.identity)
            throw new RealtimeError('no_identity');
        const wanted = [...new Set(ids.map(String))].filter((id) => id !== '' && id !== '0').slice(0, 100);
        if (wanted.length === 0)
            return {};
        const asked = wanted.map((id) => (/^-?[1-9]\d{0,15}$/.test(id) ? Number(id) : id));
        let reply = await this.ask(this.socket, 'users', { tab: this.tab, ids: asked });
        if (reply?.error === 'no_identity') {
            await this.identify(this.socket);
            reply = await this.ask(this.socket, 'users', { tab: this.tab, ids: asked });
        }
        if (!reply?.ok)
            throw new RealtimeError(reply?.error ?? 'server');
        const found = reply.users && typeof reply.users === 'object' ? reply.users : {};
        await this.keyring.ensure(this.keyring.missing(found));
        const users = {};
        for (const [id, profile] of Object.entries(found)) {
            if (!profile || typeof profile !== 'object')
                continue;
            const opened = { user_id: /^-?[1-9]\d{0,15}$/.test(id) ? Number(id) : id };
            for (const [field, value] of Object.entries(profile)) {
                if (field !== 'user_id')
                    opened[field] = this.openDeep(value, 0);
            }
            users[id] = opened;
        }
        return users;
    }
    /** A room of the app, joined: the same one again for the same name. */
    join(name) {
        let room = this.held.get(name);
        if (room)
            return room;
        room = new Room(this, name);
        this.held.set(name, room);
        if (this.socket.connected)
            this.joinSoon(room);
        return room;
    }
    /** A room this tab joined, or undefined. */
    room(name) {
        return this.held.get(name);
    }
    /** Leaves a room: the browser's other tabs keep theirs. */
    leave(name) {
        const room = this.held.get(name);
        if (!room)
            return;
        this.held.delete(name);
        this.tokens.delete(name);
        room.ended();
        if (this.socket.connected)
            this.leaveSoon(name);
    }
    /** Leaves every room: the browser's other tabs keep the socket, the last one closes it. */
    close() {
        if (this.closed)
            return;
        this.closed = true;
        if (this.renewal)
            clearTimeout(this.renewal);
        if (this.identityRenewal)
            clearTimeout(this.identityRenewal);
        for (const room of this.held.values())
            room.ended();
        this.held.clear();
        this.socket.close();
    }
    /**
     * @internal Room.emit(): sealed with the room's newest key held, which those in it hold, binary parts carried in
     * it; as it is in a room the app gave no key for. Answers the cloud's ack, or null when none was asked.
     */
    async send(room, event, data, mode) {
        if (room.state === 'failed' || room.state === 'left')
            throw new RealtimeError(room.error ?? 'left');
        const label = this.keyring.newest('ch:' + room.name + ':');
        const sent = label ? (this.keyring.sealJson(packBinary(data), label) ?? data) : data;
        const payload = { tab: this.tab, room: room.name, event, data: sent, ...(mode.volatile ? { v: 1 } : {}) };
        if (!mode.ack) {
            if (mode.volatile) {
                if (room.state === 'joined' && this.socket.connected)
                    this.socket.emit('emit', payload);
                return null;
            }
            await room.ready;
            this.socket.emit('emit', payload);
            return null;
        }
        await room.ready;
        const reply = await this.ask(this.socket, 'emit', payload, mode.timeout);
        if (!reply?.ok)
            throw new RealtimeError(reply?.error ?? 'server');
        if (typeof reply.id === 'string')
            room.seen(reply.id);
        return { id: reply.id, at: reply.at };
    }
    /** @internal Room.history(): a page of the room's history, opened, oldest first. */
    async history(room, ask) {
        await room.ready;
        const reply = await this.ask(this.socket, 'history', { tab: this.tab, room: room.name, ...ask });
        if (!reply?.ok)
            throw new RealtimeError(reply?.error ?? 'server');
        const events = Array.isArray(reply.events) ? reply.events : [];
        await this.keyring.ensure(this.keyring.missing(events.map((e) => e?.data)));
        return {
            events: events.map((e) => ({ event: e.event, data: this.openData(e.data) ?? null, id: e.id, at: e.at, ...(e.from !== undefined ? { from: String(e.from) } : {}) })),
            more: !!reply.more,
        };
    }
    /** @internal Room.members(): a page of a presence room's members, opened. */
    async membersPage(room, cursor = '0', limit) {
        await room.ready;
        const reply = await this.ask(this.socket, 'members', { tab: this.tab, room: room.name, cursor, ...(limit ? { limit } : {}) });
        if (!reply?.ok)
            throw new RealtimeError(reply?.error ?? 'server');
        const list = Array.isArray(reply.list) ? reply.list : [];
        await this.keyring.ensure(this.keyring.missing(list.map((m) => m?.info)));
        return { list: list.map((m) => ({ id: String(m.id), info: this.openInfo(m.info) })), next: String(reply.next ?? '0') };
    }
    /** @internal Online: a request on the socket, needing the page's user. */
    async request(event, payload) {
        if (!this.identity)
            await this.askKeys([]);
        if (!this.identity)
            throw new RealtimeError('no_identity');
        let reply = await this.ask(this.socket, event, { tab: this.tab, ...payload });
        if (reply?.error === 'no_identity') {
            await this.identify(this.socket);
            reply = await this.ask(this.socket, event, { tab: this.tab, ...payload });
        }
        if (!reply?.ok)
            throw new RealtimeError(reply?.error ?? 'server');
        return reply;
    }
    /** Every room on the socket, or a move's new one before it takes over, and what else rides it holds again. */
    async joinAll(via) {
        // The identity goes first on the socket, which answers in order, so a watch after it finds the socket known.
        await Promise.all([
            this.identify(via),
            this.joinMany([...this.held.values()], via),
            this.online.again(via).catch(() => { }),
            ...[...this.holders].map((hold) => hold(via).catch(() => { })),
        ]);
    }
    /**
     * Tells the socket who the page's user is, as the app vouched (Identity): online, the user's own events, the
     * directory. An identity refused as `expired` (signed before the app's server disconnected the user, or run out) is
     * asked for again, once.
     */
    async identify(via, renew = true) {
        if (!this.identity || (!via && !this.socket.connected))
            return;
        const token = this.identity.token;
        const reply = await this.ask(via ?? this.socket, 'identify', { tab: this.tab, token });
        if (reply?.error === 'expired' && renew && this.identity?.token === token) {
            this.identity = null;
            setTimeout(() => void this.renewIdentity(), RENEW_AFTER_MS);
        }
    }
    /** The identity asked of the app's keys route again, then who the page watches and its lines held again with it. */
    async renewIdentity() {
        if (this.closed)
            return;
        await this.askKeys([], false);
        if (!this.identity || !this.socket.connected)
            return;
        await Promise.all([this.online.again().catch(() => { }), ...[...this.holders].map((hold) => hold().catch(() => { }))]);
    }
    /** An ask of the app's server for this user's pages: answered when this page answers its event (`answer()`). */
    answerAsk(q) {
        const fn = q && typeof q.id === 'string' && typeof q.event === 'string' ? this.answerers.get(q.event) : undefined;
        if (!fn)
            return;
        this.inOrder([q.data], () => {
            const data = this.openData(q.data);
            if (data === undefined && q.data !== undefined)
                return;
            void (async () => {
                let reply;
                try {
                    reply = await fn(data, { at: Number(q.at) || Date.now() });
                }
                catch {
                    return;
                }
                const label = this.user === null ? null : this.keyring.newest('u:' + this.user + ':');
                const sent = label ? (this.keyring.sealJson(packBinary(reply ?? null), label) ?? reply) : reply;
                await this.ask(this.socket, 'reply', { tab: this.tab, id: q.id, data: sent ?? null });
            })();
        });
    }
    /**
     * Asks the app's keys route for keys (`labels`), or with none for the user's own and their identity: what a
     * visitor's page can't carry, being the same for every visitor. The keyring's resolver.
     */
    async askKeys(labels, renew = true) {
        const keys = this.options.keys;
        if (!keys?.endpoint)
            return;
        let answer = null;
        try {
            const res = await fetch(keys.endpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', ...keys.headers },
                body: JSON.stringify({ labels }),
            });
            if (res.ok)
                answer = await res.json();
        }
        catch {
            return;
        }
        this.keyring.add(answer?.keys ?? [], 'site');
        if (answer?.identity?.token && answer.identity.token !== this.identity?.token) {
            this.identity = answer.identity;
            this.scheduleIdentity();
            await this.identify(undefined, renew);
        }
    }
    /** The identity asked for again before it runs out, so a page open for days stays known. */
    scheduleIdentity() {
        if (this.identityRenewal)
            clearTimeout(this.identityRenewal);
        this.identityRenewal = null;
        if (this.closed || !this.identity || !this.options.keys?.endpoint)
            return;
        const inS = Math.max(30, Number(this.identity.exp) - RENEW_BEFORE_S - nowS());
        this.identityRenewal = setTimeout(() => {
            this.identityRenewal = null;
            void this.askKeys([]);
        }, inS * 1000);
    }
    /** A directory entry's value opened: each text in it, however deep, as the app seals them; numbers as they are. */
    openDeep(value, depth) {
        if (typeof value === 'string')
            return this.keyring.open(value);
        if (depth > 8 || value === null || typeof value !== 'object')
            return value;
        if (Array.isArray(value))
            return value.map((item) => this.openDeep(item, depth + 1));
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.openDeep(item, depth + 1)]));
    }
    /** A member's info, opened: sealed for the room, or plain from an app that doesn't seal. */
    openInfo(info) {
        const opened = this.keyring.openJson(info);
        return opened === undefined ? null : opened;
    }
    /**
     * An event's data, opened, its binary parts as bytes again (`{ $b }`, as an app's server and a sealed room carry
     * them in JSON); undefined when its key isn't given.
     */
    openData(data) {
        const opened = this.keyring.openJson(data);
        return opened === undefined ? undefined : unpackBinary(opened);
    }
    /**
     * Runs `then` once the keyring holds the keys these values need: at once when none is missing and nothing is
     * waiting, else after what came before it, so a listener never gets an event ahead of an earlier one.
     */
    inOrder(values, then) {
        const missing = this.keyring.missing(values);
        if (missing.length === 0 && this.waiting === 0) {
            then();
            return;
        }
        this.waiting++;
        this.queue = this.queue
            .then(() => this.keyring.ensure(missing))
            .then(() => {
            this.waiting--;
            try {
                then();
            }
            catch (error) {
                console.error(error);
            }
        });
    }
    /** A room joined with the others joined in the same moment. */
    joinSoon(room) {
        if (!this.joining) {
            const joining = new Set();
            this.joining = joining;
            queueMicrotask(() => {
                if (this.joining === joining)
                    this.joining = null;
                void this.joinMany([...joining]);
            });
        }
        this.joining.add(room);
    }
    /** Rooms in one `join`: each token once, each room naming its own by index, each answered as its own join. */
    async joinMany(rooms, via) {
        if (rooms.length > JOIN_MAX) {
            const parts = [];
            for (let i = 0; i < rooms.length; i += JOIN_MAX)
                parts.push(rooms.slice(i, i + JOIN_MAX));
            await Promise.all(parts.map((part) => this.joinMany(part, via)));
            return;
        }
        if (rooms.length < 2 || !this.many) {
            await Promise.all(rooms.map((room) => this.joinOne(room, via)));
            return;
        }
        const tokens = await Promise.all(rooms.map((room) => this.tokenFor(room.name)));
        const sent = [];
        const asked = [];
        const going = [];
        rooms.forEach((room, i) => {
            const token = tokens[i];
            if (this.held.get(room.name) !== room)
                return;
            if (token === undefined) {
                if (room.state !== 'failed')
                    room.failed('auth_failed');
                return;
            }
            let t = sent.indexOf(token);
            if (t < 0)
                t = sent.push(token) - 1;
            asked.push({ room: room.name, t, ...(room.lastId ? { since: room.lastId } : {}) });
            going.push(room);
        });
        if (going.length < 2) {
            await Promise.all(going.map((room) => this.joinOne(room, via)));
            return;
        }
        const reply = await this.ask(via ?? this.socket, 'join', { tab: this.tab, tokens: sent, rooms: asked });
        if (reply?.error === 'bad_request' && !reply.rooms) {
            this.many = false;
            await Promise.all(going.map((room) => this.joinOne(room, via)));
            return;
        }
        await Promise.all(going.map((room) => this.joined(room, reply?.ok ? reply.rooms?.[room.name] : reply, via)));
    }
    /** A room left with the others left in the same moment. */
    leaveSoon(name) {
        if (!this.leaving) {
            const leaving = new Set();
            this.leaving = leaving;
            queueMicrotask(() => {
                if (this.leaving === leaving)
                    this.leaving = null;
                void this.leaveMany([...leaving]);
            });
        }
        this.leaving.add(name);
    }
    async leaveMany(names) {
        if (!this.socket.connected || names.length === 0)
            return;
        if (names.length > 1 && this.many) {
            const reply = await this.ask(this.socket, 'leave', { tab: this.tab, rooms: names });
            if (!(reply?.error === 'bad_request'))
                return;
            this.many = false;
        }
        for (const room of names)
            this.socket.emit('leave', { tab: this.tab, room });
    }
    async joinOne(room, via, retry = true) {
        const token = await this.tokenFor(room.name);
        if (this.held.get(room.name) !== room)
            return;
        if (token === undefined) {
            if (room.state !== 'failed')
                room.failed('auth_failed');
            return;
        }
        const since = room.lastId;
        const reply = await this.ask(via ?? this.socket, 'join', { tab: this.tab, room: room.name, token, ...(since ? { since } : {}) });
        await this.joined(room, reply, via, retry);
    }
    /** A room's answer to its join, alone or among others. */
    async joined(room, reply, via, retry = true) {
        if (this.held.get(room.name) !== room)
            return;
        if (reply?.ok) {
            const members = reply.members;
            const missed = Array.isArray(reply.missed) ? reply.missed : [];
            this.inOrder([members?.list, ...missed.map((e) => e?.data)], () => {
                if (this.held.get(room.name) !== room)
                    return;
                room.joined(members ? { count: members.count, list: (members.list ?? []).map((m) => ({ id: String(m.id), info: this.openInfo(m.info) })) } : undefined, typeof reply.count === 'number' ? reply.count : undefined);
                for (const e of missed)
                    this.deliver({ ...e, room: room.name }, true);
                if (reply.gap)
                    room.fire('error', [{ code: 'gap' }]);
            });
        }
        else if (reply?.error === 'expired' && retry) {
            this.tokens.delete(room.name);
            await this.joinOne(room, via, false);
        }
        else
            room.failed(reply?.error ?? 'server');
    }
    ask(via, event, payload, ms = ANSWER_MS) {
        return via.timeout(ms).emitWithAck(event, payload).catch(() => ({ error: 'timeout' }));
    }
    async tokenFor(name) {
        const held = this.tokens.get(name);
        if (held && held.exp - nowS() > FRESH_S)
            return held.token;
        const open = (this.options.grants ?? []).find((g) => g.exp - nowS() > FRESH_S && g.rooms.some((pattern) => patternMatches(pattern, name)));
        if (open)
            return open.token;
        await this.requestToken(name);
        return this.tokens.get(name)?.token;
    }
    /** Asks the app's server for a room's token, in one request with every other room asked for in the same moment. */
    requestToken(name) {
        if (!this.batch) {
            const batch = { names: new Set(), done: Promise.resolve() };
            batch.done = Promise.resolve().then(() => {
                if (this.batch === batch)
                    this.batch = null;
                return this.authorize([...batch.names]);
            });
            this.batch = batch;
        }
        this.batch.names.add(name);
        return this.batch.done;
    }
    async authorize(names) {
        let grant;
        try {
            grant = await (this.options.authorize ?? ((n) => this.viaRoute(n)))(names);
        }
        catch {
            grant = { denied: Object.fromEntries(names.map((n) => [n, 'auth_failed'])) };
        }
        const exp = Number(grant?.exp) || nowS() + 3600;
        // The rooms' keys, from the app's server: before the token, so their first events open.
        this.keyring.add(grant?.keys ?? [], 'site');
        for (const name of names) {
            const denied = grant?.denied?.[name];
            if (denied) {
                this.tokens.delete(name);
                this.held.get(name)?.failed(denied);
            }
            else if (typeof grant?.token === 'string' && grant.token)
                this.tokens.set(name, { token: grant.token, exp });
        }
        this.scheduleRenewal();
    }
    async viaRoute(names) {
        const auth = this.options.auth;
        if (!auth)
            return { denied: Object.fromEntries(names.map((n) => [n, 'no_auth'])) };
        const res = await fetch(auth.endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', ...auth.headers },
            body: JSON.stringify({ rooms: names }),
        });
        if (!res.ok)
            throw new Error('auth ' + res.status);
        return (await res.json());
    }
    /** The tokens of the rooms still held, asked for again before the first of them runs out. */
    scheduleRenewal() {
        if (this.renewal)
            clearTimeout(this.renewal);
        this.renewal = null;
        if (this.closed)
            return;
        const held = [...this.tokens.entries()].filter(([name]) => this.held.has(name));
        if (held.length === 0)
            return;
        const first = Math.min(...held.map(([, t]) => t.exp));
        const inS = Math.max(30, first - RENEW_BEFORE_S - nowS());
        this.renewal = setTimeout(() => {
            this.renewal = null;
            for (const name of this.tokens.keys())
                if (this.held.has(name))
                    void this.requestToken(name);
        }, inS * 1000);
    }
    /**
     * An event for one of this tab's rooms: never one this tab's own action made (`x`), nor one it had already (a
     * kept event's id at or before the last it had). Its data opened; one whose key the app won't give is the room's
     * `error` with `unopened` ({ code, event, label }) instead.
     */
    deliver(e, replayed) {
        if (!e || typeof e.event !== 'string' || e.x === this.tab)
            return;
        const room = this.held.get(e.room);
        if (!room)
            return;
        this.inOrder([e.data], () => {
            if (this.held.get(e.room) !== room || room.state === 'failed')
                return;
            if (typeof e.id === 'string' && !room.fresh(e.id))
                return;
            const data = this.openData(e.data);
            const meta = { ...(e.from !== undefined ? { from: String(e.from) } : {}), ...(e.id !== undefined ? { id: e.id } : {}), ...(e.at !== undefined ? { at: e.at } : {}), ...(replayed ? { replayed } : {}) };
            if (data === undefined && e.data !== undefined)
                room.fire('error', [{ code: 'unopened', event: e.event, label: labelOf(e.data) }]);
            else
                room.fire(e.event, [data, meta], true);
        });
    }
}
/** A room this tab joined: its events, what it may send, and for a presence room who is in it. */
export class Room {
    constructor(owner, name) {
        this.owner = owner;
        this.name = name;
        this.state = 'joining';
        /** Why it failed: `forbidden`, `expired`, `bad_token`, `full`, `kicked`, `auth_failed` … */
        this.error = null;
        /** A presence room's members, as many as the server listed and the changes since, by id. */
        this.members = new Map();
        /** How many are in the room, for a room that counts (presence, or its rule's `count`); null for one that doesn't. */
        this.count = null;
        /** @internal The last kept event this tab had, which a reconnect joins again from. */
        this.lastId = null;
        this.listeners = new Listeners();
        this.ready = this.pendingReady();
    }
    /**
     * An event of the room, `fn( data, meta )` with meta `{ from, id, at, replayed? }`; or the room's own: `joined`
     * (the members), `join` ({ id, info }), `leave` ({ id }), `count` (n), `error` ({ code }) and `kicked`.
     */
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
    /** Every event of the room, `fn( event, data, meta )`, as Socket.IO's `onAny`. */
    onAny(fn) {
        this.listeners.onAny(fn);
        return this;
    }
    offAny(fn) {
        this.listeners.offAny(fn);
        return this;
    }
    /** Sends an event to the room's others, as its rule allows; nothing is waited for. */
    emit(event, data) {
        void this.owner.send(this, event, data ?? null, { ack: false }).catch(() => { });
    }
    /** Sends an event and waits for the cloud to take it (checked, kept, sent): `{ id, at }`, or a RealtimeError. */
    emitWithAck(event, data) {
        return this.owner.send(this, event, data ?? null, { ack: true });
    }
    /** Sends without waiting and without keeping: dropped rather than queued while off line, as Socket.IO's `volatile`. */
    get volatile() {
        return {
            emit: (event, data) => void this.owner.send(this, event, data ?? null, { ack: false, volatile: true }).catch(() => { }),
            emitWithAck: (event, data) => this.owner.send(this, event, data ?? null, { ack: true, volatile: true }),
        };
    }
    /** An emitter whose acks wait at most `ms`. */
    timeout(ms) {
        return {
            emit: (event, data) => this.emit(event, data),
            emitWithAck: (event, data) => this.owner.send(this, event, data ?? null, { ack: true, timeout: ms }),
        };
    }
    /** A page of the room's history, oldest first: the newest `limit` (50), or those before or after an event's id. */
    history(ask = {}) {
        return this.owner.history(this, ask);
    }
    /** A page of a presence room's members past the first ones listed, from `cursor` ('0' first); `next` is '0' after the last. */
    membersPage(cursor = '0', limit) {
        return this.owner.membersPage(this, cursor, limit);
    }
    leave() {
        this.owner.leave(this.name);
    }
    /** @internal */
    joined(members, count) {
        this.state = 'joined';
        this.error = null;
        if (members) {
            this.members.clear();
            for (const m of members.list ?? [])
                this.members.set(m.id, m.info);
        }
        if (count !== undefined)
            this.count = Math.max(count, this.members.size);
        this.resolveReady();
        this.listeners.fire('joined', [[...this.members].map(([id, info]) => ({ id, info }))], false);
    }
    /** @internal */
    failed(code) {
        this.state = 'failed';
        this.error = code;
        // Out of it: nobody in it shows here any more (an SDK review, 2026-10-14: a kicked member still listed its people).
        this.members.clear();
        this.count = null;
        this.rejectReady(new RealtimeError(code));
        this.ready = this.pendingReady();
        this.listeners.fire(code === 'kicked' ? 'kicked' : 'error', [{ code }], false);
    }
    /** @internal The socket dropped: joined again at the next connect. */
    lost() {
        if (this.state !== 'joined')
            return;
        this.state = 'joining';
        this.ready = this.pendingReady();
    }
    /** @internal */
    ended() {
        this.state = 'left';
        this.rejectReady(new RealtimeError('left'));
    }
    /** @internal */
    memberJoined(id, info) {
        if (!this.members.has(id) && this.count !== null)
            this.count++;
        this.members.set(id, info ?? null);
        this.listeners.fire('join', [{ id, info: info ?? null }], false);
    }
    /** @internal */
    memberLeft(id) {
        if (this.members.delete(id) && this.count !== null)
            this.count = Math.max(0, this.count - 1);
        this.listeners.fire('leave', [{ id }], false);
    }
    /** @internal */
    counted(n) {
        this.count = n;
        this.listeners.fire('count', [n], false);
    }
    /** @internal Whether a kept event's id is newer than the last this tab had; it becomes the last. */
    fresh(id) {
        if (!KEPT.test(id))
            return true;
        if (this.lastId !== null && compareIds(id, this.lastId) <= 0)
            return false;
        this.lastId = id;
        return true;
    }
    /** @internal An id this tab's own kept event had, which it never hears back. */
    seen(id) {
        if (KEPT.test(id) && (this.lastId === null || compareIds(id, this.lastId) > 0))
            this.lastId = id;
    }
    /** @internal */
    fire(event, args, any = false) {
        this.listeners.fire(event, args, any);
    }
    pendingReady() {
        const ready = new Promise((resolve, reject) => {
            this.resolveReady = resolve;
            this.rejectReady = reject;
        });
        ready.catch(() => { });
        return ready;
    }
}
/**
 * Who is online across the app, for a page whose user the app vouched for: the users it
 * watches, each with `change` ({ id, online, at? }: offline since `at`), and how many are online, with `count`.
 */
export class Online {
    constructor(owner) {
        this.owner = owner;
        this.states = new Map();
        this.watching = new Set();
        this.listeners = new Listeners();
        this.counting = false;
        /** How many are online, once something listens to `count`; null before. */
        this.count = null;
    }
    /** Watches users' status: now, then every change (`change`). */
    watch(ids) {
        const fresh = ids.map(String).filter((id) => !this.watching.has(id));
        for (const id of fresh)
            this.watching.add(id);
        if (fresh.length > 0 && this.owner.connected)
            void this.send({ ids: fresh });
        return this;
    }
    unwatch(ids) {
        const gone = ids.map(String).filter((id) => this.watching.delete(id));
        for (const id of gone)
            this.states.delete(id);
        if (gone.length > 0 && this.owner.connected)
            void this.owner.request('unwatch', { ids: gone }).catch(() => { });
        return this;
    }
    has(id) {
        return this.states.get(String(id))?.online ?? false;
    }
    /** When a watched user was last seen, ms; null while online or never seen. */
    lastSeen(id) {
        const state = this.states.get(String(id));
        return state && !state.online && state.at !== undefined ? state.at : null;
    }
    /** `change` ({ id, online, at? }) for the users watched, `count` (n) once listened to. */
    on(event, fn) {
        this.listeners.on(event, fn);
        if (event === 'count' && !this.counting) {
            this.counting = true;
            if (this.owner.connected)
                void this.send({ count: true });
        }
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /** A page of who is online: their ids, and the cursor of the next page ('0' after the last). */
    async list(page = {}) {
        const reply = await this.owner.request('online', page);
        return { ids: (reply.ids ?? []).map(String), next: String(reply.next ?? '0') };
    }
    /** @internal Watched again on a new socket, or a move's before it takes over. */
    async again(via) {
        if (this.watching.size === 0 && !this.counting)
            return;
        await this.send({ ids: [...this.watching], ...(this.counting ? { count: true } : {}) }, via);
    }
    /** @internal */
    changed(o) {
        if (!o || !this.watching.has(String(o.id)))
            return;
        this.set({ id: String(o.id), online: !!o.online, ...(o.at !== undefined ? { at: o.at } : {}) });
    }
    /** @internal */
    counted(n) {
        this.count = n;
        this.listeners.fire('count', [n], false);
    }
    async send(payload, via) {
        let reply;
        try {
            reply = via ? await via.timeout(ANSWER_MS).emitWithAck('watch', { tab: this.owner.tab, ...payload }) : await this.owner.request('watch', payload);
        }
        catch (error) {
            this.listeners.fire('error', [{ code: error.code ?? 'server' }], false);
            return;
        }
        for (const state of reply?.online ?? [])
            this.set({ id: String(state.id), online: !!state.online, ...(state.at !== undefined ? { at: state.at } : {}) });
        if (typeof reply?.count === 'number')
            this.counted(reply.count);
    }
    set(state) {
        const before = this.states.get(state.id);
        this.states.set(state.id, { online: state.online, ...(state.at !== undefined ? { at: state.at } : {}) });
        if (before?.online !== state.online || before?.at !== state.at)
            this.listeners.fire('change', [state], false);
    }
}
const KEPT = /^\d{1,16}-\d{1,20}$/;
function compareIds(a, b) {
    const [am, an] = a.split('-').map(Number);
    const [bm, bn] = b.split('-').map(Number);
    return am !== bm ? am - bm : an - bn;
}
/** A pattern of a public grant, as the realtime server and the server packages match it. */
export function patternMatches(pattern, room) {
    if (!pattern.includes('{'))
        return pattern === room;
    const re = new RegExp('^' + pattern.split(/(\{[^}]+\})/).map((part) => (part.startsWith('{') ? '[^:.]+?' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
    return re.test(room);
}
/** Binary parts of an event as `{ $b: base64 }`, so they can go sealed in its JSON. */
export function packBinary(value, depth = 0) {
    if (value instanceof ArrayBuffer)
        return { $b: toBase64(new Uint8Array(value)) };
    if (ArrayBuffer.isView(value))
        return { $b: toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    if (depth > 16 || value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map((item) => packBinary(item, depth + 1));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, packBinary(item, depth + 1)]));
}
/** The other way: `{ $b: base64 }` as bytes again. */
export function unpackBinary(value, depth = 0) {
    if (depth > 16 || value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map((item) => unpackBinary(item, depth + 1));
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0][0] === '$b' && typeof entries[0][1] === 'string')
        return fromBase64(entries[0][1]);
    return Object.fromEntries(entries.map(([key, item]) => [key, unpackBinary(item, depth + 1)]));
}
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
        out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
    }
    return out;
}
function fromBase64(text) {
    const clean = text.replace(/=+$/, '');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let bits = 0, value = 0, at = 0;
    for (const char of clean) {
        const index = B64.indexOf(char);
        if (index < 0)
            continue;
        value = (value << 6) | index;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out[at++] = (value >> bits) & 255;
        }
    }
    return out.subarray(0, at);
}
/** A JWT's payload, read without checking it: the page's own identity, to know its user. */
function payloadOf(token) {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const text = new TextDecoder().decode(fromBase64(part));
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function newTab() {
    const bytes = new Uint8Array(12);
    const crypto = globalThis.crypto;
    if (crypto?.getRandomValues)
        crypto.getRandomValues(bytes);
    else
        for (let i = 0; i < bytes.length; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
