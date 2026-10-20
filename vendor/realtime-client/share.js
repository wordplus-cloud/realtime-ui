export class SharedNamespace {
    constructor(make, first, onEmpty) {
        this.onEmpty = onEmpty;
        this.sharers = [];
        this.connected = false;
        this.refusal = null;
        /** A move's readies under way: the new socket, and each sharer's `ready`. */
        this.preparing = null;
        this.closed = false;
        const spec = {
            namespace: first.namespace,
            // The handshake of the first sharer still here: what they share is the same for each.
            auth: () => (this.sharers[0]?.spec ?? first).auth(),
            rides: first.rides,
            ready: true,
            share: first.share,
        };
        this.link = make(spec, this.sink());
    }
    /** A sharer's attach: its own link, on the one socket. */
    join(spec, sink) {
        const sharer = { spec, sink, open: false, parting: null };
        this.sharers.push(sharer);
        // Joining a socket that is up, or one the server refused: told at once, as at a connect.
        queueMicrotask(() => {
            if (!this.sharers.includes(sharer) || sharer.open)
                return;
            if (this.connected) {
                sharer.open = true;
                sink.opened(this.sid);
            }
            else if (this.refusal) {
                sink.refused(this.refusal.error, this.refusal.active);
            }
        });
        // A move's readies under way: this one's on the new socket too.
        if (this.preparing)
            this.preparing.values.set(sharer, sink.prepare(this.preparing.next));
        const shared = this;
        return {
            get id() {
                return shared.link.id;
            },
            emit: (event, args, reply) => this.link.emit(event, args, reply),
            connect: () => this.link.connect(),
            update: () => this.link.update(),
            close: () => this.leave(sharer),
            farewell: (event, args) => {
                sharer.parting = event ? { event, args } : null;
            },
        };
    }
    leave(sharer) {
        const i = this.sharers.indexOf(sharer);
        if (i < 0)
            return;
        this.sharers.splice(i, 1);
        this.preparing?.values.delete(sharer);
        if (this.sharers.length === 0) {
            if (this.closed)
                return;
            this.closed = true;
            this.link.close();
            this.onEmpty();
        }
        else if (sharer.parting && this.connected) {
            // The socket stays with the others: what this one joined on it goes.
            this.link.emit(sharer.parting.event, sharer.parting.args);
        }
    }
    /** What the hub tells the one link, told to each sharer. */
    sink() {
        const each = (fn) => {
            for (const sharer of [...this.sharers])
                fn(sharer.sink);
        };
        return {
            deliver: (event, args) => each((s) => s.deliver(event, args)),
            opened: (sid) => {
                this.connected = true;
                this.sid = sid;
                this.refusal = null;
                for (const sharer of [...this.sharers]) {
                    sharer.open = true;
                    sharer.sink.opened(sid);
                }
            },
            dropped: (reason) => {
                this.connected = false;
                for (const sharer of this.sharers)
                    sharer.open = false;
                each((s) => s.dropped(reason));
            },
            refused: (error, active) => {
                this.connected = false;
                this.refusal = { error, active };
                for (const sharer of this.sharers)
                    sharer.open = false;
                each((s) => s.refused(error, active));
            },
            prepare: (next) => this.prepare(next),
            moved: (values) => {
                const given = values instanceof Map ? values : new Map();
                for (const sharer of [...this.sharers]) {
                    if (given.has(sharer)) {
                        sharer.sink.moved(given.get(sharer));
                    }
                    else {
                        // Joined after the readies were asked: a reconnect, so it does again what it does on a connect.
                        sharer.sink.dropped('transport close');
                        sharer.open = true;
                        sharer.sink.opened(this.link.id);
                    }
                }
            },
        };
    }
    /** Every sharer's `ready` on the move's new socket (one without a ready answers at once), those that join meanwhile too. */
    async prepare(next) {
        const values = new Map();
        for (const sharer of this.sharers)
            values.set(sharer, sharer.sink.prepare(next));
        this.preparing = { next, values };
        try {
            for (;;) {
                const batch = [...values.entries()];
                await Promise.all(batch.map(([, value]) => value));
                if ([...values.keys()].every((sharer) => batch.some(([s]) => s === sharer)))
                    break;
            }
            const given = new Map();
            for (const [sharer, value] of values)
                given.set(sharer, await value);
            return given;
        }
        finally {
            if (this.preparing?.next === next)
                this.preparing = null;
        }
    }
}
