/**
 * The connector of a page on another website than the site's own: rooms()' `embedded` (a chat on
 * websites outside WordPress, whose origins the site lists in WordPlus Cloud).
 *
 * - **In the page:** the connector's SharedWorker is a script of the site, which a page of another origin cannot start,
 *   so the page holds its connection itself, one for each tab.
 * - **Through the realtime server's own name alone:** never a node directly, and no node kept (hub.ts, `direct: false`),
 *   so the website's CSP needs `wss://ws.wordplus.cloud` and no node's address.
 * - **Its own:** never the page registry's connector, which another WordPlus product on that website may run, with its
 *   own worker and nodes. The embedded rooms of one copy on the page share it.
 */
import { Connector, type ConnectorOptions } from './connector.js';
/** The page's embedded connector, made at the first call: `options` are for tests (a stand-in manager). */
export declare function embeddedConnector(scope?: {
    document?: Document;
}, options?: Pick<ConnectorOptions, 'manager' | 'random'>): Connector;
/** For tests: the next embedded rooms make a connector of their own again. */
export declare function forgetEmbeddedConnector(): void;
