/**
 * The one seam between the call engine and the product it runs in: how its
 * requests reach the relay and the relay's events come back. Better Messages
 * hands the session its socket's `p2pCall`; the realtime SDK, the `/channels`
 * connection's `call` request. Everything else about a call is the engine's.
 */
export type CallId = number | string;
export type RelayMessage = Record<string, unknown>;
export interface CallTransport {
    readonly available: boolean;
    readonly connected: boolean;
    send(payload: RelayMessage, ack?: (response: any) => void): void;
    listen(callId: CallId, session: string, handler: (message: RelayMessage) => void): () => void;
    onReconnect(listener: () => void): () => void;
    beacon?(callId: CallId, session: string): void;
}
