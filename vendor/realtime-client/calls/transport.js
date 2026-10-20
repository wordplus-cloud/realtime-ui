/**
 * The one seam between the call engine and the product it runs in: how its
 * requests reach the relay and the relay's events come back. Better Messages
 * hands the session its socket's `p2pCall`; the realtime SDK, the `/channels`
 * connection's `call` request. Everything else about a call is the engine's.
 */
export {};
