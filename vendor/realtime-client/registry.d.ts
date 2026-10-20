/**
 * The page's connector, shared by every WordPlus product on it (version 2 of
 * the connection). Each product bundles a copy of this package; each copy
 * registers in `globalThis.wordplusRealtime`, and the newest runs the page's
 * connector:
 * - in the connector's SharedWorker, when the browser has them and the page
 *   was given the worker's URL (`worker`, the site's: PHP's
 *   `wordplus_realtime_worker_url()`), so the browser holds one connection
 *   however many tabs it has;
 * - else in the page, one connection per tab.
 *
 * The pick is made at the first attach once the page's scripts have run
 * (DOMContentLoaded, or at once after it). A copy that registers after the
 * connector started serves from the next page load. The registry is plain
 * data with two functions, `ready` and `attach`, so a script with no build
 * can use it, as Easy Stream's live list does:
 *
 *     window.wordplusRealtime && window.wordplusRealtime.attach(
 *         { server: 'https://cloud.better-messages.com', path: '/websocket' },
 *         { namespace: '/estream-live', auth: () => ( { site } ), rides: true } );
 *
 * Both functions are the first copy's, and what they do never changes, so
 * they are a contract between copies, as `ConnectorApi`, `MemberSpec` and
 * `Sink` are.
 */
import { type AttachOptions, Channel } from './channel.js';
import { type ConnectorApi, type Target } from './connector.js';
/** The registry's name on the page. */
export declare const REGISTRY = "wordplusRealtime";
/** The connector's SharedWorker's name: with its URL, which worker a page joins. */
export declare const WORKER_NAME = "wordplus-realtime";
export interface RealtimeOptions extends Target {
    /** The connector's SharedWorker script, the site's. Without it, the page runs its connections itself. */
    worker?: string | null;
    /**
     * The page's user, for an app whose browser may hold several (rooms()'s `perUser`): the worker is then that user's
     * (WORKER_NAME and the user), so each user has a connection of their own and their tabs share it, as one browser
     * is one user in Better Messages. Without it, the browser's one worker, which Better Messages' messenger rides.
     */
    user?: string | null;
}
export interface RealtimeClient {
    /** The product's namespace on the shared connection. */
    attach(options: AttachOptions): Channel;
}
export interface CopyStart {
    worker?: string | null;
    user?: string | null;
}
/** A product's copy of this package, as it registers. */
export interface Copy {
    version: string;
    start(config: CopyStart): ConnectorApi;
}
export interface Registry {
    copies: Copy[];
    /** The worker's URL, the first a product gave. */
    worker?: string | null;
    /** Whose worker it is, the first user a product gave (RealtimeOptions' `user`). */
    user?: string | null;
    connector?: ConnectorApi;
    /** The connector, once it runs: at once, or when the page's scripts have run. */
    ready(fn: (connector: ConnectorApi) => void): void;
    /** A namespace as a channel, whose methods are the attaching copy's. */
    attach(target: Target, options: AttachOptions): Channel;
}
/**
 * The product's way in: registers this copy, and returns the product's view
 * of the page's connector for its realtime server.
 */
export declare function realtime(options: RealtimeOptions): RealtimeClient;
/** This copy in the page's registry, which this copy makes if it is the first. */
export declare function register(worker?: string | null, scope?: Record<string, any>, user?: string | null): Registry;
/** The connector's SharedWorker's name for a page: the browser's one, or its user's own (RealtimeOptions' `user`). */
export declare function workerName(user?: string | null): string;
/** Where a page notes that the connector's SharedWorker never answered, so the browser's next pages don't wait for it again. */
export declare const HOLD_KEY = "wordplus-realtime-worker-hold";
export declare const HOLD_MS: number;
/**
 * Whether this page keeps off the connector's SharedWorker and runs its connection itself:
 * - asked to (`?noSharedWorker` in its address);
 * - a phone or a tablet, whose browsers freeze or end a SharedWorker with its page;
 * - or a worker that never answered lately (HOLD_KEY).
 *
 * Every product's page keeps this rule, whichever product gave the worker's URL first.
 */
export declare function sharedWorkerAvoided(scope?: Record<string, any>): boolean;
/** Compares two versions, number by number: 2.10.0 is after 2.9.1. */
export declare function compareVersions(a: string, b: string): number;
