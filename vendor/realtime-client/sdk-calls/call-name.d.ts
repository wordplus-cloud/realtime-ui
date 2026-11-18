/**
 * A call's name for the page's user and another, from a template, as the call buttons take it: `{pair}` the two ids in
 * order, `{me}`, `{id}`. Both people so name the same call, whichever calls. A name with none of them is as it is.
 * Refused with `no_identity` where it needs the page's user and the app named none.
 */
export declare function callName(template: string, me: string | null, id: string | number): string;
