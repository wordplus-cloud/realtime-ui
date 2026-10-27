/**
 * The connector: a browser context's shared connections, one hub per realtime
 * cluster (version 2 of the connection). It runs where the connections are: in the
 * connector's SharedWorker (worker.ts), or in the page where there is none
 * (registry.ts). A product attaches its namespace with `link`, or `attach`
 * for a channel of its own.
 *
 * A product names the realtime server it was given. Names of one cluster
 * share a hub (SAME_CLUSTER): Better Messages, given cloud.better-messages.com,
 * and Easy Stream, given ws.wordplus.cloud, ride one connection. It goes
 * through the name of the first product that attached, and its nodes come in
 * that name's domain, which keeps a site's CSP as it was for that product.
 */
import type { ManagerOptions } from 'socket.io-client';
import { type AttachOptions, Channel, type Link, type MemberSpec, type Sink } from './channel.js';
import { Hub, type ManagerFactory } from './hub.js';
import { type NodeStore } from './node-cache.js';
import { VERSION } from './version.js';
export { VERSION };
/**
 * Names of one realtime cluster, the first being its key. Its load balancer
 * routes by path whatever the host. A self-hosted server is a cluster of its
 * own.
 */
export declare const SAME_CLUSTER: string[][];
export declare function clusterOf(server: string): string;
/** Where a product connects: its realtime server and Socket.IO path. */
export interface Target {
    server: string;
    path?: string;
}
/**
 * What a page's connector offers, whichever copy runs it: a contract between
 * copies, which only grows.
 */
export interface ConnectorApi {
    readonly version: string;
    link(target: Target, spec: MemberSpec, sink: Sink): Link;
}
export interface ConnectorOptions {
    /** Where each hub keeps its node cache; none keeps it in memory. */
    store?: () => NodeStore | null;
    /** The page, for its CSP violations; none in a worker. */
    doc?: Pick<Document, 'addEventListener' | 'removeEventListener'> | null;
    /** socket.io's options for every connection. WebSocket only by default, as every product had it. */
    options?: Partial<ManagerOptions>;
    /** Stand-ins for tests. */
    manager?: ManagerFactory;
    random?: () => number;
}
export declare class Connector implements ConnectorApi {
    private readonly options;
    readonly version = "1.0.59";
    private readonly hubs;
    /** Namespaces several attaches share (share.ts), by cluster, path, namespace and key. */
    private readonly shared;
    constructor(options?: ConnectorOptions);
    link(target: Target, spec: MemberSpec, sink: Sink): Link;
    /** A product's namespace as a channel of its own. */
    attach(target: Target, options: AttachOptions): Channel;
    /** Whether a connection to the target's cluster is up, which a namespace that rides may join. */
    holds(target: Target): boolean;
    /** The hub for the target's cluster, which is made by the first product that names it. */
    hub(target: Target): Hub;
    close(): void;
}
