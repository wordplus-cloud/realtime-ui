import { defineConfig } from 'vitest/config';

// React's modules as Preact's compat layer gives them.
const preact = ( path: string ) => new URL( './node_modules/preact/' + path, import.meta.url ).pathname;
const PREACT = [
    { find: /^react$/, replacement: preact( 'compat/dist/compat.module.js' ) },
    { find: /^react-dom$/, replacement: preact( 'compat/dist/compat.module.js' ) },
    { find: /^react-dom\/client$/, replacement: preact( 'compat/client.mjs' ) },
    { find: /^react-dom\/test-utils$/, replacement: preact( 'test-utils/dist/testUtils.module.js' ) },
    { find: /^react\/jsx-(dev-)?runtime$/, replacement: preact( 'jsx-runtime/dist/jsxRuntime.module.js' ) },
    // Its ES module, whose imports of React the names above take (its main is CommonJS, which they would not).
    { find: /^@testing-library\/react$/, replacement: new URL( './node_modules/@testing-library/react/dist/@testing-library/react.esm.js', import.meta.url ).pathname },
];
// The tests of the chat's parts, which run on Preact too, and of a call between two and its devices, which Live
// Support's visitor panel draws on Preact as well, and of the call's menus in a shadow root, as its bubble has one.
const PREACT_TESTS = [ 'test/chat-parts.test.tsx', 'test/private-call-screen.test.tsx', 'test/calls.test.tsx', 'test/device-panel.test.tsx', 'test/presence.test.tsx', 'test/chat-files.test.tsx', 'test/icon-sets.test.tsx', 'test/label-corpus.test.tsx', 'test/preact-parts.test.tsx', 'test/shadow-root.test.tsx' ];

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
            load: ( id ) => ( id === '\0virtual:streams-css' ? 'export default ".wplus-live-stream-theme { display: block; }";' : null ),
        },
        // The recording player's stylesheet, which it compiles for the player's element script.
        {
            name: 'recording-css',
            resolveId: ( id ) => ( id === 'virtual:recording-css' ? '\0virtual:recording-css' : null ),
            load: ( id ) => ( id === '\0virtual:recording-css' ? 'export default ".wplus-recording-player { display: flex; }";' : null ),
        },
    ],
    // The views take four constants of the stream's protocol from @wordplus/realtime-client/streams: its protocol module
    // alone, from the package's copy of the client, as scripts/build.mjs resolves it (the entry is the engine too).
    resolve: {
        alias: [ { find: /^@wordplus\/realtime-client\/streams$/, replacement: new URL( './vendor/realtime-client/streams/protocol.js', import.meta.url ).pathname } ],
    },
    test: {
        environment: 'happy-dom',
        // Every commit's copy into Better Messages runs these, often while the machine runs Better Messages' own
        // suites beside them: at a load in the hundreds a render that takes milliseconds took seconds, and the
        // default 5 s failed tests that were right.
        testTimeout: 20_000,
        projects: [
            { extends: true, test: { name: 'react', include: [ 'test/**/*.test.{ts,tsx}' ], env: { UI_ON: 'react' } } },
            // The chat's parts on Preact, through preact/compat, as Live Support's visitor panel draws them in its
            // bubble's shadow root (K8 of the slimming of 2026-10-31): the same tests, React's names for Preact's.
            // @testing-library/react and react-merge-refs are read through the aliases too, not as Node finds them.
            {
                extends: true,
                test: { name: 'preact', include: PREACT_TESTS, env: { UI_ON: 'preact' }, setupFiles: [ 'test/preact-setup.ts' ], server: { deps: { inline: [ /@testing-library\/react/, /react-merge-refs/ ] } } },
                resolve: { alias: PREACT },
            },
        ],
    },
} );
