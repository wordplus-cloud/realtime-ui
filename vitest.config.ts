import { defineConfig } from 'vitest/config';

export default defineConfig( {
    plugins: [
        // The elements' stylesheet, which scripts/build.mjs compiles for the elements script: a stand-in in the tests.
        {
            name: 'elements-css',
            resolveId: ( id ) => ( id === 'virtual:elements-css' ? '\0virtual:elements-css' : null ),
            load: ( id ) => ( id === '\0virtual:elements-css' ? 'export default ".realtime-tooltip { position: fixed; }";' : null ),
        },
        // The live streams' stylesheet, which it compiles for the stream elements' script.
        {
            name: 'streams-css',
            resolveId: ( id ) => ( id === 'virtual:streams-css' ? '\0virtual:streams-css' : null ),
            load: ( id ) => ( id === '\0virtual:streams-css' ? 'export default ".estream-theme { display: block; }";' : null ),
        },
    ],
    // The views take four constants of the stream's protocol from @wordplus/realtime-client/streams: its protocol module
    // alone, from the package's copy of the client, as scripts/build.mjs resolves it (the entry is the engine too).
    resolve: {
        alias: [ { find: /^@wordplus\/realtime-client\/streams$/, replacement: new URL( './vendor/realtime-client/streams/protocol.js', import.meta.url ).pathname } ],
    },
    test: {
        environment: 'happy-dom',
        include: [ 'test/**/*.test.{ts,tsx}' ],
        // Every commit's copy into Better Messages runs these, often while the machine runs Better Messages' own
        // suites beside them: at a load in the hundreds a render that takes milliseconds took seconds, and the
        // default 5 s failed tests that were right.
        testTimeout: 20_000,
    },
} );
