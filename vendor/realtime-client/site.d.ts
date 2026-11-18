/**
 * How a page asks the site's own routes: the rooms' auth and keys, and the calls (the PHP package's
 * `wordplus/v1/realtime/auth`, `/keys` and `/calls`). A POST of JSON, with the visitor every WordPlus plugin on the
 * site shares (visitor.ts) and the route's own headers last, so a plugin's header of the same name stands over it.
 *
 * - **On the site's own pages:** with the page's cookies (`same-origin`), which WordPress's REST nonce goes with.
 * - **On another website** (`embedded`, a chat on websites outside WordPress): the site's absolute address alone, as a
 *   relative one would ask the other website and hand it the visitor's token; and never a cookie, which the site's
 *   answer to another origin never allows (the PHP package's WordPlus_Realtime_Cors).
 */
import { type VisitorSource } from './visitor.js';
export interface SiteRequestOptions {
    /** The page is on another website than the site's own (rooms()' `embedded`). */
    embedded?: boolean;
    /** The visitor's token, standing over the page's shared one (rooms()' `visitor`). */
    visitor?: VisitorSource | null;
}
export interface SiteRoute {
    endpoint: string;
    headers?: Record<string, string>;
}
/** Whether `url` is an absolute https or http address, which a page on another website may ask. */
export declare function absoluteUrl(url: string): boolean;
/** The route asked as the page's place says: rejects with `not_absolute` for a relative address on another website. */
export declare function siteRequest(options: SiteRequestOptions, route: SiteRoute, body: unknown): Promise<Response>;
