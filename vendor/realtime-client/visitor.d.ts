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
export declare const VISITOR_HEADER = "X-WordPlus-Visitor";
export declare const VISITOR_KEY = "wordplus-visitor";
/** A visitor's token as a plugin gives it: the token, or a function that answers it at each request. */
export type VisitorSource = string | (() => string | null | undefined);
export declare function visitorHeaders(given?: VisitorSource | null): Record<string, string>;
