/**
 * The visitor every WordPlus plugin on the site shares (the WordPlus SDK's visitors): the token the site
 * gave this browser, sent as X-WordPlus-Visitor with the requests to the site's own routes (rooms, keys, calls), so
 * they know a visitor who isn't signed in. From the SDK's page script (`window.wordplusVisitor`) when it is on the
 * page, which holds it for the page where storage is blocked, else from localStorage, where that script keeps it.
 * Nothing for a browser without one.
 *
 * A plugin may give the token itself (`visitor`, rooms()' option), which then stands alone: on another website
 * (`embedded`) the page's own `wordplusVisitor` and localStorage are that website's, and may hold a visitor of
 * another site, which must never go to this one.
 */
export const VISITOR_HEADER = 'X-WordPlus-Visitor';
export const VISITOR_KEY = 'wordplus-visitor';
/** The SDK's WordPlus_SDK_Visitors::parse() pattern. */
const TOKEN = /^[1-9][0-9]{0,18}\.[A-Za-z0-9_-]{16,128}$/;
export function visitorHeaders(given) {
    let token = '';
    try {
        if (given !== undefined && given !== null) {
            token = String((typeof given === 'function' ? given() : given) ?? '');
        }
        else {
            const shared = globalThis.wordplusVisitor;
            if (shared && typeof shared.token === 'function')
                token = String(shared.token() ?? '');
            if (!token)
                token = globalThis.localStorage?.getItem(VISITOR_KEY) ?? '';
        }
    }
    catch {
        token = '';
    }
    return TOKEN.test(token) ? { [VISITOR_HEADER]: token } : {};
}
