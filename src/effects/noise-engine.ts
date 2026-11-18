// AI Noise Removal's engine, a script of its own (realtime-noise.min.js) that a page loads only once someone turns it
// on. The screens' script (src/inc/calls/effects.ts) loads it and finds it as `window.wordplusRealtimeNoise`.
// Everything it reads, the two worklets, DeepFilterNet3's runtime and model, and GTCRN's build, is beside it, in the
// folder it was loaded from: a pack of its own (dist/noise), which a site downloads apart from the effects' (the
// WordPlus SDK's video effects), as DeepFilterNet3 is 11 MB more than they are.
import { loadNoise, NoiseFiles, NoiseProcessor, type NoiseShared } from "./noise.ts";

export type { NoiseModel, NoiseOptions } from "./noise.ts";
export { NoiseProcessor };

/** What the screens' script calls: the version of this contract, and a noise processor. */
export interface NoiseEngine {
    version: 1,
    /** A noise processor, its context and worklets loaded first (once a page). */
    noise(): Promise<NoiseProcessor>,
    /**
     * The model's files read ahead of a microphone, from the browser's store or into it (noise.ts), so the processor
     * starts in a fraction of a second once the microphone is on. Not in a pack from before it (1.1.0's, c014fce890c4).
     */
    warm?(): Promise<void>,
}

const script = typeof document !== "undefined" ? document.currentScript as HTMLScriptElement | null : null;
const base = script?.src ? script.src.slice( 0, script.src.lastIndexOf( "/" ) + 1 ) : "";

const files = new NoiseFiles( base );
let shared: Promise<NoiseShared> | null = null;

const engine: NoiseEngine = {
    version: 1,
    async noise() {
        // A load that failed is tried again the next time, as the connection may have been the reason.
        shared ??= loadNoise( base, files ).catch( ( error ) => {
            shared = null;
            throw error;
        } );
        return new NoiseProcessor( await shared );
    },
    warm() {
        return files.warm();
    },
};

( globalThis as unknown as { wordplusRealtimeNoise: NoiseEngine } ).wordplusRealtimeNoise = engine;
