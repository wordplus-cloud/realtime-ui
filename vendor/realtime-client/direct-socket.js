import { SERVER_CONNECT_TIMEOUT_MS, connectTimeout, hostOf, migrateSpread, migrateTarget, pointAt, sameServer, urlOf } from './node-cache.js';
/** A move waits for the replies under way half a second at a time, three seconds at most. */
export const REPLY_WAIT_MS = 500;
export const REPLY_WAITS = 6;
/** The replies a socket.io socket waits for, which its disconnect loses. */
export function pendingReplies(socket) {
    const acks = socket.acks;
    return acks ? Object.keys(acks).length : 0;
}
/**
 * Where a tab's own socket connects first, and how long it waits there: the
 * first cached node, unless direct connections are paused, else the realtime
 * server itself.
 */
export function firstConnect(nodes, server) {
    const url = nodes.first(server);
    return { url, timeout: connectTimeout(url, server) };
}
export function watchDirect(socket, server, nodes, isCurrent) {
    socket.on('migrate', (request) => {
        if (!isCurrent())
            return;
        // A client the nodes failed (a proxy, a filter, a site's CSP) would
        // otherwise try one again at every page load.
        const direct = request?.reason === 'direct';
        if (direct && nodes.paused(server))
            return;
        const target = migrateTarget(request, server, urlOf(socket));
        if (!target)
            return;
        // A move to an offered node that fails pauses direct connections, so
        // its connect waits as long as one to the realtime server.
        pointAt(socket, target, server, direct ? SERVER_CONNECT_TIMEOUT_MS : undefined);
        if (direct)
            nodes.offered(target, server, request?.nodes);
        else
            nodes.remember(target, server, request?.nodes);
        let waits = 0;
        const move = () => {
            // Gone, down (its reconnect goes to the target anyway), or sent elsewhere since.
            if (!isCurrent() || !socket.connected || !sameServer(urlOf(socket), target))
                return;
            // A reply under way would be lost with the connection, and with it
            // a message sent at that moment (api/fast-message.ts).
            if (pendingReplies(socket) > 0 && waits++ < REPLY_WAITS) {
                setTimeout(move, REPLY_WAIT_MS);
                return;
            }
            if (direct)
                nodes.moving(target);
            socket.disconnect();
            socket.connect();
        };
        setTimeout(move, Math.random() * migrateSpread(request));
    });
    socket.on('nodes', (payload) => {
        if (!isCurrent())
            return;
        nodes.update(server, payload?.nodes);
    });
    socket.on('connect', () => {
        if (!isCurrent())
            return;
        const url = urlOf(socket);
        nodes.reached(url, server);
        // Its reconnects wait as long as any connect to where it is now.
        pointAt(socket, url, server);
    });
    socket.on('connect_error', () => {
        if (!isCurrent())
            return;
        pointAt(socket, nodes.failed(urlOf(socket), server), server);
    });
    // A site's CSP that leaves the nodes out of connect-src. Chromium fails
    // the WebSocket at once. WebKit and Firefox throw from its constructor,
    // which engine.io-client doesn't hear, and the connect waited out its
    // timeout. The violation tells at once, and it holds for every page of
    // the site: direct connections pause, and the socket goes to the realtime
    // server now.
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function')
        return;
    const onViolation = (violation) => {
        if (!isCurrent()) {
            document.removeEventListener('securitypolicyviolation', onViolation);
            return;
        }
        if (socket.connected || !socket.active)
            return;
        if (!/^(connect|default)-src\b/.test(violation.effectiveDirective || violation.violatedDirective || ''))
            return;
        // A node this socket is connecting to, or one that failed it moments ago.
        const blocked = hostOf(violation.blockedURI || '');
        if (!blocked || blocked === hostOf(server))
            return;
        if (blocked !== hostOf(urlOf(socket)) && !nodes.failures().some((url) => hostOf(url) === blocked))
            return;
        nodes.pause(server);
        pointAt(socket, server, server);
        socket.disconnect();
        socket.connect();
    };
    document.addEventListener('securitypolicyviolation', onViolation);
}
