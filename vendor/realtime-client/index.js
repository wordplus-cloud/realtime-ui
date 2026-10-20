/**
 * The WordPlus realtime client: how every product's browser code connects to
 * the realtime server and follows it from node to node.
 *
 * Version 2's shared connection: `realtime()` (the page's connector, the
 * newest copy's), `Connector` (the connections of one context), and
 * `RemoteConnector` (a port to the connector's SharedWorker, as Better
 * Messages' own worker uses it). Version 1's movers stay for a product that
 * keeps a socket of its own.
 */
export { realtime, register, compareVersions, sharedWorkerAvoided, REGISTRY, WORKER_NAME, HOLD_KEY } from './registry.js';
export { rooms, Rooms, Room, Online, RealtimeError, ROOMS_NAMESPACE, patternMatches, packBinary, unpackBinary, } from './rooms.js';
export { Keyring, keyring, labelOf, isSealed, validLabel, KEYRING_GLOBAL } from './keys.js';
export { Connector, clusterOf, SAME_CLUSTER, VERSION } from './connector.js';
export { RemoteConnector, serve, PORT_PROTOCOL, HELLO_TIMEOUT_MS, PING_INTERVAL_MS, CHECK_TIMEOUT_MS } from './remote.js';
export { Channel, specOf } from './channel.js';
export { Hub, Connection, SHARED_PROTOCOL } from './hub.js';
export { idbNodeStore } from './idb-store.js';
export { RealtimeConnection, PROTOCOL, STORE_KEY, MOVE_CONNECT_MS, MOVE_READY_MS } from './connection.js';
export { firstConnect, watchDirect, pendingReplies } from './direct-socket.js';
export { WatchSet, WATCH_BATCH_MS, WATCH_LINGER_MS, WATCH_LIMIT } from './watch.js';
export { NodeCacheKeeper, localNodeStore, migrateTarget, migrateSpread, sameServer, hostOf, connectTimeout, pointAt, urlOf, listedNodes, aim, managerUrl, NODE_URL, PAUSE_MS, SERVER_CONNECT_TIMEOUT_MS, NODE_CONNECT_TIMEOUT_MS, FIRST_READ_WAIT_MS, } from './node-cache.js';
