/**
 * What a stream's grant says, read without checking it: the cloud checks it. From Easy Stream's page.ts, whose
 * grantFromPage() stays there.
 */
/** A JWT's claims: {} when they can't be read. */
function claimsOf(jwt) {
    try {
        const body = jwt.split('.')[1] ?? '';
        const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
        return claims && typeof claims === 'object' ? claims : {};
    }
    catch (e) {
        return {};
    }
}
/** Seconds since the epoch at which a JWT expires, or 0 when it can't be read. */
export function expiresAt(jwt) {
    const exp = claimsOf(jwt).exp;
    return typeof exp === 'number' ? exp : 0;
}
/** The site or app that signed a grant (its `iss`), or '' when it can't be read. */
export function issuerOf(jwt) {
    const iss = claimsOf(jwt).iss;
    return typeof iss === 'string' ? iss : '';
}
/** The avatar a grant gives its person (an https address), or null. */
export function avatarIn(jwt) {
    const avatar = claimsOf(jwt).avatar;
    return typeof avatar === 'string' && avatar.startsWith('https://') ? avatar : null;
}
