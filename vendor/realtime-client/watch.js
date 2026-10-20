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
export const WATCH_BATCH_MS = 50;
export const WATCH_LINGER_MS = 5000;
export const WATCH_LIMIT = 1000;
export class WatchSet {
    constructor(options) {
        this.options = options;
        this.owners = new Map();
        /** How many owners hold each id. */
        this.holders = new Map();
        this.allOwners = 0;
        this.countOwners = 0;
        /** Released, and when each goes. `all` and `count` under their own keys. */
        this.lingering = new Map();
        this.allUntil = 0;
        this.countUntil = 0;
        /** What the connection was last told. */
        this.sent = { ids: new Set(), all: false, count: false };
        this.batch = null;
        this.lingerTimer = null;
        this.lingerAt = 0;
        /** Goes up with every change of what is wanted. */
        this.version = 0;
        this.batchMs = options.batchMs ?? WATCH_BATCH_MS;
        this.lingerMs = options.lingerMs ?? WATCH_LINGER_MS;
        this.limit = options.limit ?? WATCH_LIMIT;
    }
    /** The owner watches these ids too. */
    watch(owner, ids) {
        const holding = this.holding(owner);
        const now = this.now();
        for (const id of ids) {
            if (holding.ids.has(id))
                continue;
            holding.ids.add(id);
            const n = this.holders.get(id) ?? 0;
            this.holders.set(id, n + 1);
            if (n > 0)
                continue;
            // Watched again within its linger: still on the wire, nothing to send.
            const until = this.lingering.get(id);
            this.lingering.delete(id);
            if (until === undefined || until <= now)
                this.changed();
        }
    }
    /** The owner no longer watches these ids. */
    unwatch(owner, ids) {
        const holding = this.owners.get(owner);
        if (!holding)
            return;
        for (const id of ids) {
            if (holding.ids.delete(id))
                this.release(id);
        }
        this.forgetIfEmpty(owner, holding);
    }
    /** The owner watches everyone, or stops. */
    watchAll(owner, on = true) {
        const holding = on ? this.holding(owner) : this.owners.get(owner);
        if (!holding || holding.all === on)
            return;
        holding.all = on;
        if (on) {
            if (this.allOwners++ === 0 && !this.wasLingering('all'))
                this.changed();
        }
        else {
            this.releaseAll();
            this.forgetIfEmpty(owner, holding);
        }
    }
    /** The owner watches how many are online, or stops. */
    watchCount(owner, on = true) {
        const holding = on ? this.holding(owner) : this.owners.get(owner);
        if (!holding || holding.count === on)
            return;
        holding.count = on;
        if (on) {
            if (this.countOwners++ === 0 && !this.wasLingering('count'))
                this.changed();
        }
        else {
            this.releaseCount();
            this.forgetIfEmpty(owner, holding);
        }
    }
    /** Everything the owner held, released: a component unmounted, a tab gone. */
    drop(owner) {
        const holding = this.owners.get(owner);
        if (!holding)
            return;
        this.owners.delete(owner);
        for (const id of holding.ids)
            this.release(id);
        if (holding.all)
            this.releaseAll();
        if (holding.count)
            this.releaseCount();
    }
    /** Whether the connection watches the id now or is about to: held, lingering, or under `all`. */
    covers(id) {
        const now = this.now();
        if (this.allOwners > 0 || this.allUntil > now || this.holders.has(id) || (this.lingering.get(id) ?? 0) > now)
            return true;
        return this.holders.size + this.lingering.size > this.limit && this.wanted().all;
    }
    /** Whether the owner holds the id. */
    holds(owner, id) {
        return this.owners.get(owner)?.ids.has(id) ?? false;
    }
    /** The ids watched one by one, lingering ones included; none past the cap, where `all` stands for them. */
    get ids() {
        return [...this.wanted().ids];
    }
    get all() {
        return this.wanted().all;
    }
    get count() {
        return this.wanted().count;
    }
    /**
     * The whole interest, to send with `reset` after a connect or onto a move's new socket; null when there is
     * none. It counts as sent: the batch waiting is in it.
     */
    request() {
        this.cancelBatch();
        const wire = this.wanted();
        this.sent = wire;
        if (wire.ids.size === 0 && !wire.all && !wire.count)
            return null;
        return { reset: true, ids: [...wire.ids], ...(wire.all ? { all: true } : {}), ...(wire.count ? { count: true } : {}) };
    }
    /** Sends what changed now rather than at the end of the batch. */
    flush() {
        this.cancelBatch();
        const wire = this.wanted();
        const add = [...wire.ids].filter((id) => !this.sent.ids.has(id));
        const remove = [...this.sent.ids].filter((id) => !wire.ids.has(id));
        const change = { add, remove };
        if (wire.all !== this.sent.all)
            change.all = wire.all;
        if (wire.count !== this.sent.count)
            change.count = wire.count;
        this.sent = wire;
        if (add.length || remove.length || change.all !== undefined || change.count !== undefined)
            this.options.send(change);
    }
    /** Lets go of everything without sending: the connection is closing. */
    clear() {
        this.cancelBatch();
        if (this.lingerTimer)
            clearTimeout(this.lingerTimer);
        this.lingerTimer = null;
        this.owners.clear();
        this.holders.clear();
        this.lingering.clear();
        this.allOwners = this.countOwners = 0;
        this.allUntil = this.countUntil = 0;
        this.sent = { ids: new Set(), all: false, count: false };
    }
    // What the connection should watch now.
    wanted() {
        const now = this.now();
        const ids = new Set(this.holders.keys());
        for (const [id, until] of this.lingering) {
            if (until > now)
                ids.add(id);
        }
        const all = this.allOwners > 0 || this.allUntil > now || ids.size > this.limit;
        const count = this.countOwners > 0 || this.countUntil > now;
        return { ids: ids.size > this.limit ? new Set() : ids, all, count };
    }
    holding(owner) {
        let holding = this.owners.get(owner);
        if (!holding)
            this.owners.set(owner, holding = { ids: new Set(), all: false, count: false });
        return holding;
    }
    forgetIfEmpty(owner, holding) {
        if (holding.ids.size === 0 && !holding.all && !holding.count)
            this.owners.delete(owner);
    }
    release(id) {
        const n = (this.holders.get(id) ?? 1) - 1;
        if (n > 0) {
            this.holders.set(id, n);
            return;
        }
        this.holders.delete(id);
        const until = this.now() + this.lingerMs;
        this.lingering.set(id, until);
        this.lingerUntil(until);
    }
    releaseAll() {
        if (--this.allOwners > 0)
            return;
        this.allUntil = this.now() + this.lingerMs;
        this.lingerUntil(this.allUntil);
    }
    releaseCount() {
        if (--this.countOwners > 0)
            return;
        this.countUntil = this.now() + this.lingerMs;
        this.lingerUntil(this.countUntil);
    }
    // A released `all` or `count` asked for again within its linger: nothing to send.
    wasLingering(which) {
        const now = this.now();
        const was = which === 'all' ? this.allUntil > now : this.countUntil > now;
        if (which === 'all')
            this.allUntil = 0;
        else
            this.countUntil = 0;
        return was;
    }
    // A linger ends at `until`: the batch then sends what went.
    lingerUntil(until) {
        if (this.lingerMs <= 0) {
            this.sweep();
            return;
        }
        if (this.lingerTimer && this.lingerAt <= until)
            return;
        if (this.lingerTimer)
            clearTimeout(this.lingerTimer);
        this.lingerAt = until;
        this.lingerTimer = setTimeout(() => {
            this.lingerTimer = null;
            this.sweep();
        }, Math.max(0, until - this.now()));
    }
    // Drops the lingers that ended, and sends their end; waits again for the next one.
    sweep() {
        const now = this.now();
        let next = Infinity, ended = false;
        for (const [id, until] of this.lingering) {
            if (until <= now) {
                this.lingering.delete(id);
                ended = true;
            }
            else {
                next = Math.min(next, until);
            }
        }
        for (const until of [this.allUntil, this.countUntil]) {
            if (until > now)
                next = Math.min(next, until);
            else if (until > 0)
                ended = true;
        }
        if (this.allUntil <= now)
            this.allUntil = 0;
        if (this.countUntil <= now)
            this.countUntil = 0;
        if (ended)
            this.changed();
        if (next !== Infinity)
            this.lingerUntil(next);
    }
    changed() {
        this.version++;
        if (!this.batch)
            this.batch = setTimeout(() => {
                this.batch = null;
                this.flush();
            }, this.batchMs);
    }
    cancelBatch() {
        if (this.batch)
            clearTimeout(this.batch);
        this.batch = null;
    }
    now() {
        return Date.now();
    }
}
