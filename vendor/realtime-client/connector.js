import { Channel, specOf } from './channel.js';
import { Hub } from './hub.js';
import { hostOf } from './node-cache.js';
import { SharedNamespace } from './share.js';
import { VERSION } from './version.js';
export { VERSION };
/**
 * Names of one realtime cluster, the first being its key. Its load balancer
 * routes by path whatever the host. A self-hosted server is a cluster of its
 * own.
 */
export const SAME_CLUSTER = [
    ['ws.wordplus.cloud', 'cloud.better-messages.com', 'rest.wordplus.cloud'],
];
export function clusterOf(server) {
    const host = hostOf(server) || server.trim().toLowerCase();
    return SAME_CLUSTER.find((names) => names.includes(host))?.[0] ?? host;
}
export class Connector {
    constructor(options = {}) {
        this.options = options;
        this.version = VERSION;
        this.hubs = new Map();
        /** Namespaces several attaches share (share.ts), by cluster, path, namespace and key. */
        this.shared = new Map();
    }
    link(target, spec, sink) {
        if (!spec.share)
            return this.hub(target).attach(spec, sink);
        // Attaches of one namespace with one key share its socket: one connection however many tabs.
        const key = keyOf(target) + '|' + spec.namespace + '|' + spec.share;
        let group = this.shared.get(key);
        if (!group) {
            const made = new SharedNamespace((s, k) => this.hub(target).attach(s, k), spec, () => {
                if (this.shared.get(key) === made)
                    this.shared.delete(key);
            });
            group = made;
            this.shared.set(key, group);
        }
        return group.join(spec, sink);
    }
    /** A product's namespace as a channel of its own. */
    attach(target, options) {
        const channel = new Channel(options);
        channel.bind(this.link(target, specOf(options), channel));
        return channel;
    }
    /** Whether a connection to the target's cluster is up, which a namespace that rides may join. */
    holds(target) {
        return this.hubs.get(keyOf(target))?.holds() ?? false;
    }
    /** The hub for the target's cluster, which is made by the first product that names it. */
    hub(target) {
        const key = keyOf(target);
        let hub = this.hubs.get(key);
        if (!hub || hub.isClosed) {
            hub = new Hub({
                server: target.server.replace(/\/+$/, ''),
                path: target.path,
                store: this.options.store?.() ?? null,
                doc: this.options.doc ?? null,
                options: { transports: ['websocket'], ...this.options.options },
                manager: this.options.manager,
                random: this.options.random,
            });
            this.hubs.set(key, hub);
        }
        return hub;
    }
    close() {
        for (const hub of this.hubs.values())
            hub.close();
        this.hubs.clear();
        this.shared.clear();
    }
}
const keyOf = (target) => clusterOf(target.server) + '|' + (target.path ?? '');
