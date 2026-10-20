/**
 * What a stream's grant says, read without checking it: the cloud checks it. From Easy Stream's page.ts, whose
 * grantFromPage() stays there.
 */
/** Seconds since the epoch at which a JWT expires, or 0 when it can't be read. */
export declare function expiresAt(jwt: string): number;
/** The site or app that signed a grant (its `iss`), or '' when it can't be read. */
export declare function issuerOf(jwt: string): string;
/** The avatar a grant gives its person (an https address), or null. */
export declare function avatarIn(jwt: string): string | null;
