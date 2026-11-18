// Finding the person in a camera frame: MediaPipe's image segmenter, from the folder the engine was loaded from, on
// the GPU in the processor's own canvas, so each mask is a texture of the same WebGL2 context the passes draw with
// (gpu.ts) and is never read back, or on the CPU where the GPU won't start it.
//
// One model, on every device that can run it: Baidu's PP-HumanSegV2-Lite portrait model (256x144, 1.9 MB, PaddleSeg,
// Apache-2.0), trained on video calls. Its edge is smooth and steady, which was picked on a real camera over
// Google's multiclass model (2026-11-01: "Multiclass float16 is looking better when I choose edge check, but with real
// background the Baidu PP-HumanSeg v2 seems to work better"). Converted from Baidu's softmax inference model: its input
// fixed at 144x256, to ONNX (paddle2onnx 1.0.6), to TFLite with its weights stored as float16 (onnx2tf 1.26.3),
// MediaPipe's segmenter metadata added (inputs as (v - 127.5) / 127.5, labels background and person). The same masks as
// Baidu's model to 0.005. On an M1 Max a mask takes 13 ms on the GPU and 16 on the CPU (the effects lab,
// FINDINGS.md). MediaPipe's landscape model, which a device fell back to by itself until 2026-11-02, is gone from the
// pack (as asked: "I do not want the ai blur to use bad model even at mobile browsers as it works not very good, I want
// it to use good model or be disabled by user if it loads his device too much"): where this one can't run, the effects
// are not offered (EffectsUnavailable).
//
// A frame that isn't 16:9, a phone's camera held upright above all, is given to the model letterboxed into its own
// shape: MediaPipe stretches a frame to the model's 256x144, so an upright 9:16 frame reached it three times as wide
// as it is, and the room beside the head came out as person (effects-lab harness, a 720x1280 crop of its sample: the
// shelf and the window at the top corners kept, where the same crop letterboxed came out clean, in Chromium and in
// WebKit as an iPhone alike). The bars repeat the frame's edges, so the model sees the room or the shoulders go on, and
// the mask is read within the frame alone (Mask.fit).
//
// MediaPipe sizes the canvas it shares with the passes to every picture it is given, unless its graph runner is told
// not to (setAutoResizeCanvas, which tasks-vision keeps to itself and is found by its name): until 2026-11-02 a
// camera opened at 1080 went out at 1080 for that, where the processor meant 720 (camera.ts, MOST_LINES). Told so, the
// letterbox is a picture of the model's size, 256x144, cheap to draw. Where the runner can't be found (another
// tasks-vision), the picture is of the size the processor sends instead, squeezed so that MediaPipe's own stretch to
// 256x144 leaves the frame letterboxed at its true shape, and a frame of another size is drawn into one too.
import { ImageSegmenter, type ImageSegmenterResult, type MPMask } from "@mediapipe/tasks-vision";

export type ModelName = "humanseg";

// Served under a name that says what it does: the pack's build copies effects/models/pphumansegv2_lite_256x144_fp16.tflite
// to it (scripts/build.mjs).
export const MODEL = { name: "humanseg" as ModelName, file: "models/person-segmentation.tflite", width: 256, height: 144 };

/** The models by name, as the processor reads them: the one. */
export const MODELS: Record<ModelName, { file: string, width: number, height: number }> = { humanseg: MODEL };

/**
 * A mask: a texture of the processor's context while `found` runs, or the numbers of one found on the CPU. `fit` is
 * where the frame is in it, as scale and offset (frame uv * fit.xy + fit.zw): the whole of it, unless the frame was
 * letterboxed into the model's shape.
 */
export type Mask = ( { texture: WebGLTexture, width: number, height: number, invert: boolean }
    | { data: Float32Array, width: number, height: number, invert: boolean } ) & { fit: [ number, number, number, number ] };

/** Why the effects can't run on this device: the model starts nowhere here, or WebGL is drawn in software. */
export class EffectsUnavailable extends Error {
    readonly unavailable = true;

    constructor( message: string, readonly reason: "software" | "model" ) {
        super( message );
        this.name = "EffectsUnavailable";
    }
}

// How far a frame's shape may be from the model's before it is letterboxed: a camera at 16:9 goes as it is.
const SHAPE_SLACK = 0.04;

// MediaPipe's runtime with WebAssembly's SIMD alone: every browser that runs the effects has it, and one without is
// not offered them (inc/calls/effects.ts). Its vision_wasm_internal.js and .wasm, served as runtime.js and runtime.wasm:
// MediaPipe finds the .wasm by the path it is given, and the loader never names itself.
const fileset = ( base: string ) => ( {
    wasmLoaderPath: base + "mediapipe/runtime.js",
    wasmBinaryPath: base + "mediapipe/runtime.wasm",
} );

/** Where a frame of `width` by `height` stands in the model's shape, in its pixels: null for a frame of its shape. */
export function letterbox( width: number, height: number ): { width: number, height: number, x: number, y: number } | null {
    const shape = MODEL.width / MODEL.height;
    const aspect = width / height;
    if ( ! ( aspect > 0 ) || Math.abs( aspect / shape - 1 ) <= SHAPE_SLACK ) return null;
    const inner = aspect < shape
        ? { width: Math.max( 2, Math.round( MODEL.height * aspect ) ), height: MODEL.height }
        : { width: MODEL.width, height: Math.max( 2, Math.round( MODEL.width / aspect ) ) };
    return { ...inner, x: Math.floor( ( MODEL.width - inner.width ) / 2 ), y: Math.floor( ( MODEL.height - inner.height ) / 2 ) };
}

export class Segmenter {
    readonly model: ModelName = "humanseg";
    private time = 0;
    private box: { canvas: HTMLCanvasElement, context: CanvasRenderingContext2D } | null = null;

    /** Whether MediaPipe leaves the shared canvas's size alone (it was told so), or sizes it to what it is given. */
    readonly fixedCanvas: boolean;

    private constructor( private readonly segmenter: ImageSegmenter, readonly gpu: boolean ) {
        // On the CPU MediaPipe draws in no canvas of the processor's.
        this.fixedCanvas = ! gpu || keepCanvasSize( segmenter );
    }

    /** The model's segmenter on the GPU in `canvas`, or on the CPU where the GPU won't start it. Rejects when neither does. */
    static async create( base: string, canvas: HTMLCanvasElement ): Promise<Segmenter> {
        const options = ( gpu: boolean ) => ( {
            baseOptions: { modelAssetPath: base + MODEL.file, delegate: gpu ? "GPU" as const : "CPU" as const },
            ...( gpu ? { canvas } : {} ),
            runningMode: "VIDEO" as const,
            outputCategoryMask: false,
            outputConfidenceMasks: true,
        } );
        try {
            return new Segmenter( await ImageSegmenter.createFromOptions( fileset( base ), options( true ) ), true );
        } catch {
            try {
                return new Segmenter( await ImageSegmenter.createFromOptions( fileset( base ), options( false ) ), false );
            } catch ( error ) {
                throw new EffectsUnavailable( "The person cannot be found on this device: " + String( ( error as Error )?.message ?? error ), "model" );
            }
        }
    }

    /**
     * Finds the person in `frame`, which the processor sends at `width` by `height`, and calls `found` before it
     * returns, with the mask good only until then.
     */
    segment( frame: HTMLVideoElement, now: number, width: number, height: number, found: ( mask: Mask ) => void ): void {
        // MediaPipe wants each frame's time later than the one before.
        this.time = Math.max( this.time + 1, Math.round( now ) );
        const place = letterbox( frame.videoWidth, frame.videoHeight );
        const fit: Mask[ "fit" ] = place
            ? [ place.width / MODEL.width, place.height / MODEL.height, place.x / MODEL.width, place.y / MODEL.height ]
            : [ 1, 1, 0, 0 ];
        const source = place && this.fixedCanvas ? this.boxed( frame, MODEL.width, MODEL.height, fit )
            : place || ( ! this.fixedCanvas && ( frame.videoWidth !== width || frame.videoHeight !== height ) ) ? this.boxed( frame, width, height, fit )
            : frame;
        this.segmenter.segmentForVideo( source, this.time, ( result: ImageSegmenterResult ) => {
            const masks = result.confidenceMasks;
            if ( ! masks?.length ) return;
            // Two masks, background and person: the person is all but the first.
            const mask: MPMask = masks[ 0 ];
            const invert = masks.length > 1;
            const { width, height } = mask;
            found( this.gpu
                ? { texture: mask.getAsWebGLTexture(), width, height, invert, fit }
                : { data: mask.getAsFloat32Array(), width, height, invert, fit } );
        } );
    }

    // The frame in a picture of the size sent, where `fit` puts it once MediaPipe has stretched the picture to the
    // model's shape, the bars either side (or above and below) its edge columns (or rows) drawn out across them.
    private boxed( frame: HTMLVideoElement, width: number, height: number, fit: Mask[ "fit" ] ): HTMLCanvasElement {
        if ( ! this.box ) {
            const canvas = document.createElement( "canvas" );
            const context = canvas.getContext( "2d", { alpha: false } );
            if ( ! context ) throw new EffectsUnavailable( "This browser draws no 2D canvas here", "model" );
            this.box = { canvas, context };
        }
        const { canvas, context: g } = this.box;
        if ( canvas.width !== width || canvas.height !== height ) {
            canvas.width = width;
            canvas.height = height;
        }
        const fw = frame.videoWidth;
        const fh = frame.videoHeight;
        const x = fit[ 2 ] * width;
        const y = fit[ 3 ] * height;
        const w = fit[ 0 ] * width;
        const h = fit[ 1 ] * height;
        g.imageSmoothingEnabled = true;
        if ( x > 0 ) {
            g.drawImage( frame, 0, 0, 1, fh, 0, 0, x, height );
            g.drawImage( frame, fw - 1, 0, 1, fh, x + w, 0, width - x - w, height );
        }
        if ( y > 0 ) {
            g.drawImage( frame, 0, 0, fw, 1, 0, 0, width, y );
            g.drawImage( frame, 0, fh - 1, fw, 1, 0, y + h, width, height - y - h );
        }
        g.drawImage( frame, x, y, w, h );
        return canvas;
    }

    close(): void {
        this.segmenter.close();
        this.box = null;
    }
}

/** Tells MediaPipe's graph runner, the segmenter's own, to leave its canvas's size alone: false where none is found. */
function keepCanvasSize( segmenter: ImageSegmenter ): boolean {
    try {
        for ( const value of Object.values( segmenter as unknown as Record<string, unknown> ) ) {
            const runner = value as { setAutoResizeCanvas?: ( on: boolean ) => void } | null;
            if ( runner && typeof runner.setAutoResizeCanvas === "function" ) {
                runner.setAutoResizeCanvas( false );
                return true;
            }
        }
    } catch {
        // As MediaPipe has it.
    }
    return false;
}
