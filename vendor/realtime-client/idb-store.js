export function idbNodeStore(name = 'wordplus-realtime', key = 'nodes', idb = globalThis.indexedDB) {
    let opened = null;
    const open = () => opened ?? (opened = new Promise((resolve) => {
        if (!idb) {
            resolve(null);
            return;
        }
        try {
            const request = idb.open(name, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('kv');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
            request.onblocked = () => resolve(null);
        }
        catch {
            resolve(null);
        }
    }));
    return {
        read: async () => {
            const db = await open();
            if (!db)
                return null;
            return new Promise((resolve) => {
                try {
                    const request = db.transaction('kv').objectStore('kv').get(key);
                    request.onsuccess = () => resolve(request.result ?? null);
                    request.onerror = () => resolve(null);
                }
                catch {
                    resolve(null);
                }
            });
        },
        write: async (cache) => {
            const db = await open();
            if (!db)
                return;
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction('kv', 'readwrite');
                    const store = tx.objectStore('kv');
                    if (cache)
                        store.put(cache, key);
                    else
                        store.delete(key);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => resolve();
                    tx.onabort = () => resolve();
                }
                catch {
                    resolve();
                }
            });
        },
    };
}
