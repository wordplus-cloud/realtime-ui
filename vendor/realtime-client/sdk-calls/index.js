import { calls as callsOf } from './calls.js';
export { calls, Calls, Call, Incoming } from './calls.js';
export { GroupCall } from './group-call.js';
export { callUserOf } from '../calls/users.js';
export { Invite } from './invite.js';
export { Stream } from './stream.js';
export { loadLiveKit } from './media.js';
export { supportsP2P } from '../calls/index.js';
let shared = null;
/**
 * The page's rooms and calls, made once from the server package's settings (`window.wordplusRealtimeConfig`) on the
 * page script's rooms (its `page()`, which a plugin's own code shares; `rooms()` from a copy before it): what the call
 * screen and every plugin's code share, so the page holds one line and a call rings once. Null on a page without the
 * settings (a site without credentials).
 */
export function page(config) {
    if (shared)
        return shared;
    const settings = config ?? globalThis.wordplusRealtimeConfig;
    const client = globalThis.wordplusRealtimeClient;
    if (!settings?.site)
        return null;
    const rt = typeof client?.page === 'function' ? client.page(settings) : typeof client?.rooms === 'function' ? client.rooms(settings) : null;
    if (!rt)
        return null;
    shared = { rt, calls: callsOf(rt, settings) };
    return shared;
}
