/**
 * A user of a call as the realtime server's relay names them (better-messages-server inc/calls/p2p/users.ts): a number
 * for an id of digits, as every Better Messages user and visitor has, else the app's own id of text, such as a UUID or
 * Auth0's `auth0|5f7c…`. One spelling for each user, so `42` and `"42"` are the same person.
 */
export type CallUser = number | string;
/**
 * An id of digits as a number, any other id of text as it is, else null: at most 64 characters, none a space or a control
 * character. 0 is nobody.
 */
export declare function callUserOf(raw: unknown): CallUser | null;
