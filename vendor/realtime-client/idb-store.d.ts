/**
 * Where the connector's SharedWorker keeps its node cache (node-cache.ts): a
 * small IndexedDB database of its own, since a worker has no localStorage.
 * One that can't be opened (a private window, a browser that refuses it)
 * leaves the cache in the worker's memory, which lasts while any tab is open.
 */
import type { NodeStore } from './node-cache.js';
export declare function idbNodeStore(name?: string, key?: string, idb?: IDBFactory | undefined): NodeStore;
