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
import { visitorHeaders } from './visitor.js';
/** Whether `url` is an absolute https or http address, which a page on another website may ask. */
export function absoluteUrl(url) {
    return /^https?:\/\/[^/?#\s]+/i.test(url);
}
/** The route asked as the page's place says: rejects with `not_absolute` for a relative address on another website. */
export function siteRequest(options, route, body) {
    const embedded = !!options.embedded;
    if (embedded && !absoluteUrl(route.endpoint))
        return Promise.reject(new Error('not_absolute'));
    return fetch(route.endpoint, {
        method: 'POST',
        credentials: embedded ? 'omit' : 'same-origin',
        headers: { 'Content-Type': 'application/json', ...visitorHeaders(options.visitor), ...route.headers },
        body: JSON.stringify(body),
    });
}
