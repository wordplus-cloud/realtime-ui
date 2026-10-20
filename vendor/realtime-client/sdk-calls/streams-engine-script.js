let loading = null;
const ready = () => globalThis.wordplusRealtimeStreams;
export function streamsEngine(script) {
    const engine = ready();
    if (engine?.EasyStreamClient)
        return Promise.resolve(engine);
    if (loading)
        return loading;
    if (!script || typeof document === 'undefined')
        return Promise.reject(Object.assign(new Error('no_streams_script'), { code: 'no_streams_script' }));
    loading = new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = script;
        tag.async = true;
        tag.onload = () => {
            const loaded = ready();
            if (loaded?.EasyStreamClient)
                resolve(loaded);
            else
                reject(Object.assign(new Error('streams_script_broken'), { code: 'streams_script_broken' }));
        };
        tag.onerror = () => {
            loading = null;
            reject(Object.assign(new Error('streams_script_failed'), { code: 'streams_script_failed' }));
        };
        document.head.appendChild(tag);
    });
    return loading;
}
