let loading = null;
// The engine under its own name, or an older copy's on the page under the name the screens have now
// (window.wordplusRealtimeStreams, script-streams.ts), told apart from them by its EasyStreamClient.
const ready = () => {
    const scope = globalThis;
    if (scope.wordplusRealtimeStreamEngine?.EasyStreamClient)
        return scope.wordplusRealtimeStreamEngine;
    return scope.wordplusRealtimeStreams?.EasyStreamClient ? scope.wordplusRealtimeStreams : undefined;
};
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
