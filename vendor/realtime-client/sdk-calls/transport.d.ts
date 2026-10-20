/**
 * The call engine's way to the relay on the realtime SDK's connection: the
 * `/channels` socket every tab and plugin of the browser shares, whose `call` request carries the call's token, since
 * the socket is the browser's and not one user's. One per call.
 */
import type { Channel } from '../channel.js';
import type { CallId, CallTransport, RelayMessage } from '../calls/transport.js';
/** Hands each call's session the relay's events for it: every tab on the socket hears all of them. */
export declare class CallDispatcher {
    private readonly handlers;
    constructor(socket: Channel);
    add(callId: CallId, session: string, handler: (message: RelayMessage) => void): () => void;
}
export interface SdkTransportOptions {
    socket: Channel;
    tab: string;
    dispatcher: CallDispatcher;
    /** The call's token as it is now: renewed while the call runs. */
    token: () => string;
    /** The relay's address for the leave a closing page sends, `https://rest.wordplus.cloud/` by default. */
    api?: string;
    site: string;
    /** Called with each connect after a drop and each move, so the call joins on the socket it has now. */
    onSocketChange: (listener: () => void) => () => void;
}
export declare class SdkCallTransport implements CallTransport {
    private readonly options;
    readonly available = true;
    /** The room the relay names for a call that leaves the direct path, kept from its replies (`sfu.server`). */
    server: string | null;
    constructor(options: SdkTransportOptions);
    get connected(): boolean;
    send(payload: RelayMessage, ack?: (response: any) => void): void;
    listen(callId: CallId, session: string, handler: (message: RelayMessage) => void): () => void;
    onReconnect(listener: () => void): () => void;
    beacon(callId: CallId, session: string): void;
    /** A room handed over without its server (the relay's `fallback` event) is on the one the replies named. */
    private withServer;
}
