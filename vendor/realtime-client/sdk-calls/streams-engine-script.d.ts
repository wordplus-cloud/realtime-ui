/**
 * The classic calls script's way to Easy Stream's engine: realtime-streams.min.js (window.wordplusRealtimeStreams),
 * loaded from `script` on a page's first stream, as the rooms script is loaded for a first group call. build-worker.mjs
 * puts this file in streams-engine.ts's place in realtime-calls.min.js, which can't split a module off.
 */
import type { StreamsEngine } from './streams-engine.js';
export declare function streamsEngine(script?: string): Promise<StreamsEngine>;
