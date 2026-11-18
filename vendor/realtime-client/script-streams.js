/**
 * The streams script (dist/realtime-streams.min.js): Easy Stream's engine for the classic calls script, as
 * `window.wordplusRealtimeStreamEngine`, loaded on a page's first stream. Its connector is the page script's
 * (`window.wordplusRealtimeClient`): build-worker.mjs points the engine's `@wordplus/realtime-client` there, so the
 * stream's chat rides the page's one connection. `window.wordplusRealtimeStreams` is the streams' screens
 * (realtime-ui's realtime-ui-streams.min.js), whose start() a page calls: the engine took that name until 1.0.63 and put
 * itself over the screens on a WordPress page that had both (streams-engine-script.ts still takes such an engine).
 */
import * as streams from './streams/index.js';
/** Easy Stream's engine on the page. */
export const GLOBAL = 'wordplusRealtimeStreamEngine';
globalThis[GLOBAL] = streams;
