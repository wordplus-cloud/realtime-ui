/** How long the transport lets a request wait for its answer; the engine keeps its own clock under it. */
const ANSWER_MS = 10000;
/** Hands each call's session the relay's events for it: every tab on the socket hears all of them. */
export class CallDispatcher {
    constructor(socket) {
        this.handlers = new Map();
        socket.on('call', (message) => {
            if (!message || typeof message !== 'object')
                return;
            this.handlers.get(String(message.call_id) + ':' + String(message.session))?.(message);
        });
    }
    add(callId, session, handler) {
        const key = String(callId) + ':' + session;
        this.handlers.set(key, handler);
        return () => {
            if (this.handlers.get(key) === handler)
                this.handlers.delete(key);
        };
    }
}
export class SdkCallTransport {
    constructor(options) {
        this.options = options;
        this.available = true;
        /** The room the relay names for a call that leaves the direct path, kept from its replies (`sfu.server`). */
        this.server = null;
    }
    get connected() {
        return this.options.socket.connected;
    }
    send(payload, ack) {
        const request = { tab: this.options.tab, token: this.options.token(), ...payload };
        if (!ack) {
            this.options.socket.emit('call', request);
            return;
        }
        this.options.socket
            .timeout(ANSWER_MS)
            .emitWithAck('call', request)
            .then((reply) => ack(this.withServer(reply)))
            // Unanswered: the engine's own clock tries again.
            .catch(() => { });
    }
    listen(callId, session, handler) {
        return this.options.dispatcher.add(callId, session, (message) => handler(this.withServer(message)));
    }
    onReconnect(listener) {
        return this.options.onSocketChange(listener);
    }
    beacon(callId, session) {
        if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function')
            return;
        const api = (this.options.api ?? 'https://rest.wordplus.cloud/').replace(/\/+$/, '');
        const body = JSON.stringify({ site: this.options.site, token: this.options.token(), call_id: callId, session });
        navigator.sendBeacon(api + '/wordplus/realtime/call/leave', new Blob([body], { type: 'text/plain' }));
    }
    /** A room handed over without its server (the relay's `fallback` event) is on the one the replies named. */
    withServer(message) {
        const sfu = message?.sfu;
        if (!sfu || typeof sfu !== 'object')
            return message;
        if (typeof sfu.server === 'string' && sfu.server)
            this.server = sfu.server;
        else if (this.server)
            return { ...message, sfu: { ...sfu, server: this.server } };
        return message;
    }
}
