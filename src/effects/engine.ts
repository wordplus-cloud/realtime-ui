// The call effects' engine, a script of its own (realtime-effects.min.js) that a page loads only once someone turns an
// effect on: the camera's background blurred or replaced. The screens' script (src/inc/calls/effects.ts) loads it and
// finds it as `window.wordplusRealtimeEffects`. Everything it reads, MediaPipe's runtime and its model, is beside it,
// in the folder it was loaded from: the effects' pack, which a site downloads (the WordPlus SDK's video effects)
// rather than any plugin carrying it. AI Noise Removal is a pack of its own (noise-engine.ts).
import { CameraProcessor, EffectsUnavailable, type CameraLook, type CameraSettings } from "./camera.ts";

export type { CameraLook, CameraOptions, CameraSettings, CameraTune } from "./camera.ts";
export { CameraProcessor, EffectsUnavailable };

/**
 * What the screens' script calls: the version of this contract, and a camera processor. Version 2 (MediaPipe, a mask
 * every frame) took `settings` beside the look, and had `noise()` (RNNoise) too until AI Noise Removal became a pack of
 * its own (2026-11-01): a screen that still asks it for one is told it cannot start. Version 1 was TensorFlow.js's
 * landscape model.
 */
export interface EffectsEngine {
    version: 2,
    /**
     * Whether the camera takes CameraLook's `tune`: the packs from 2026-11-01 on. A site keeps the pack it downloaded
     * until a newer one comes by WP-Cron, so the screens offer the person's tuning only where it is true.
     */
    tune?: true,
    /**
     * The packs from 2026-11-02 on: one model on every device, never a quicker one by itself, `camera()` rejecting with
     * EffectsUnavailable (`unavailable: true`) where it can't run, and the page told once when it slows the device
     * (`wordplus-call-effects-slow`, quality.ts). A pack before it fell back to MediaPipe's landscape model instead.
     */
    oneModel?: true,
    /**
     * A camera processor with `look`, its model loaded first. Rejects with EffectsUnavailable where the effects can't
     * run on this device, and with the error of the look where its picture does not load, the processor let go.
     */
    camera( look: CameraLook, settings?: CameraSettings ): Promise<CameraProcessor>,
}

const script = typeof document !== "undefined" ? document.currentScript as HTMLScriptElement | null : null;
const base = script?.src ? script.src.slice( 0, script.src.lastIndexOf( "/" ) + 1 ) : "";

const engine: EffectsEngine = {
    version: 2,
    tune: true,
    oneModel: true,
    async camera( look, settings ) {
        const processor = await CameraProcessor.create( base, settings );
        try {
            await processor.setLook( look );
        } catch ( error ) {
            await processor.destroy().catch( () => null );
            throw error;
        }
        return processor;
    },
};

( globalThis as unknown as { wordplusRealtimeEffects: EffectsEngine } ).wordplusRealtimeEffects = engine;
