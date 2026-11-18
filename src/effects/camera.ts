// A camera with its background blurred or replaced, as a track of its own (`processedTrack`), in the shape of the room
// client's track processors (`init`, `restart`, `destroy`): the room swaps it onto the camera's sender, keeps it through
// a device the camera restarts on, and the call's own code hands it to a direct call. A raw track works the same way.
//
// Frames come from a video element of its own playing the camera, on a worker's beat (ticker.ts), so a tab in the
// background keeps sending. Every frame the person is found again (segmenter.ts) and drawn over the room in the same
// WebGL2 context (gpu.ts), with no read back to the page: the edge never lags the person, as it did when a mask came
// some 11 times a second, read on the CPU, one frame late. The output is a canvas's capture, which stays the same track
// however often the camera under it changes, so nothing is swapped on a restart.
import { Gpu, type Target } from "./gpu.ts";
import { SLOW_EVENT, Slowness, forgetOldRule } from "./quality.ts";
import { EffectsUnavailable, MODEL, Segmenter, type Mask } from "./segmenter.ts";
import { tick, type Ticker } from "./ticker.ts";

export { EffectsUnavailable };

/**
 * What is behind the person: a blur, or a picture at `image`. `highQuality` is read no more (2026-11-02): every device
 * runs the one model, and an app that still passes false gets it too.
 */
export interface CameraLook {
    blur?: boolean,
    image?: string,
    /** @deprecated Read no more: the one model on every device (segmenter.ts). */
    highQuality?: boolean,
    /** The person's own tuning for their light and room (the device settings' Adjust): as shipped where left out. */
    tune?: CameraTune,
}

/**
 * How the person is found and drawn, each from 0 to 1, 0.5 where it ships and wherever one is left out (asked on
 * 2026-11-01: "probably we can add settings for the user end so he can tune settings and find better settings for his
 * actual environment"): `outline` how much around the person is kept (wider keeps more of the hair and hands, and more
 * of the room), `edge` how soft the edge is, `steady` how much of the mask before is kept where the model hesitates
 * (steadier flickers less and follows a move later), `blur` how strong the blur is.
 */
export interface CameraTune {
    outline?: number,
    edge?: number,
    steady?: number,
    blur?: number,
}

/** What a tuning makes of the passes: where the edge begins and ends, how much of the mask before is kept, the blur's passes. */
export function tuned( tune: CameraTune = {} ): { edge: [ number, number ], keep: number, blurs: number } {
    const at = ( value: unknown ) => typeof value === "number" && Number.isFinite( value ) ? Math.min( 1, Math.max( 0, value ) ) : 0.5;
    // The edge's middle from 0.75 (tighter) to 0.25 (wider), its half width from 0.05 (sharp) to 0.35 (soft).
    const middle = 0.75 - 0.5 * at( tune.outline );
    const half = 0.05 + 0.3 * at( tune.edge );
    return {
        edge: [ Math.max( 0.01, middle - half ), Math.min( 0.99, middle + half ) ],
        keep: 0.6 * at( tune.steady ),
        blurs: 1 + Math.round( 4 * at( tune.blur ) ),
    };
}

export interface CameraOptions {
    track: MediaStreamTrack,
    element?: HTMLMediaElement,
}

export interface CameraSettings {
    /** @deprecated Read no more (2026-11-02): no device is kept on a quicker model, an app's choice or not. */
    highQuality?: boolean,
}

// As shipped, the middle of each of the person's own settings (tuned()):
// - keep: how much of the mask before a frame stays in it, at most. Where the model is sure, nothing, where it
//   hesitates, 0.3, so an edge it can't decide on doesn't flicker, and little enough that the edge keeps up.
// - edge: where the edge begins and ends in the refined mask, 0.3 to 0.7.
// - blurs: how many times the room is blurred, at a quarter of the frame, 3.
// How far apart in colour two points may be and still share the mask, for the edge (gpu.ts, jbu).
const SIGMA_C = 0.1;
// The most frames a second it works at: a camera opened at 60 sends 30 with the effect.
const MOST_FPS = 30;
// How long the first frame is waited for before the processor stands without one.
const FIRST_FRAME_MS = 3000;
// The most lines it sends: a camera opened at 1080 goes out at 720 with an effect, which halves what the GPU draws and
// the encoder takes, and is the size the call fits a camera encoded in software to anyway. A call that asks the
// camera for fewer (applyConstraints on what it sends) can't ask a canvas: this is where it is held down.
const MOST_LINES = 720;

export class CameraProcessor {
    readonly name = "wordplus-camera-effects";
    processedTrack?: MediaStreamTrack;

    private gpu!: Gpu;
    private segmenter!: Segmenter;
    /** The frames' times, for telling the page once that the background slows the device (quality.ts). */
    private slowness: Slowness | null = null;
    /** Whether it has told the page so. */
    slow = false;
    private frameTexture!: WebGLTexture;
    private cpuMask!: WebGLTexture;
    private backTexture!: WebGLTexture;
    private backSize: [ number, number ] | null = null;
    private masks: [ Target, Target ] | null = null;
    private maskFit = "";
    private fit: Mask[ "fit" ] = [ 1, 1, 0, 0 ];
    private firstMask = true;
    private targets: Record<string, Target> = {};
    private video: HTMLVideoElement | null = null;
    private ticker: Ticker | null = null;
    private every = 1000 / MOST_FPS;
    private frameEnd = -Infinity;
    private stopped = false;
    private look: CameraLook = { blur: true };
    private tuning = tuned();
    private pictures = new Map<string, Promise<HTMLImageElement>>();
    /**
     * How long the last frames and masks took, in ms, how many there were, the model and whether it runs on the GPU, for
     * tests and whoever watches the cost.
     */
    readonly cost = { segment: 0, draw: 0, frames: 0, masks: 0, model: MODEL.name as string, gpu: true, slowMs: 0 };

    private constructor( private readonly base: string, private readonly canvas: HTMLCanvasElement ) {}

    /**
     * A processor on its own canvas, PP-HumanSegV2 drawing from its first frame (segmenter.ts), on the GPU, or on the
     * CPU where MediaPipe's GPU won't start it. Rejects with EffectsUnavailable where WebGL is drawn in software (the
     * passes alone take some 100 ms a 720p frame there) or the model starts nowhere: the effects are then not for this
     * device, rather than drawn badly. MediaPipe binds itself to the canvas it is given first, so the model is loaded
     * before the passes' context is asked for. `settings` is read no more.
     */
    static async create( base: string, _settings: CameraSettings = {} ): Promise<CameraProcessor> {
        forgetOldRule();
        if ( softwareWebgl() ) throw new EffectsUnavailable( "WebGL is drawn in software here", "software" );
        const canvas = document.createElement( "canvas" );
        const processor = new CameraProcessor( base, canvas );
        const segmenter = await Segmenter.create( base, canvas );
        const gl = canvas.getContext( "webgl2", { alpha: false, antialias: false, depth: false, premultipliedAlpha: false } );
        if ( ! gl ) {
            segmenter.close();
            throw new EffectsUnavailable( "This browser draws no WebGL 2 here", "model" );
        }
        processor.gpu = new Gpu( gl );
        processor.segmenter = segmenter;
        processor.cost.gpu = segmenter.gpu;
        processor.frameTexture = processor.gpu.texture();
        processor.cpuMask = processor.gpu.texture();
        processor.backTexture = processor.gpu.texture();
        return processor;
    }

    async init( options: CameraOptions ): Promise<void> {
        const fps = Math.min( MOST_FPS, options.track.getSettings?.().frameRate || MOST_FPS );
        this.every = 1000 / fps;
        await this.attach( options );
        this.slowness = new Slowness( performance.now() );
        this.frame();
        const capture = ( this.canvas as HTMLCanvasElement & { captureStream( fps?: number ): MediaStream } ).captureStream( fps );
        this.processedTrack = capture.getVideoTracks()[ 0 ];
        this.ticker = tick( Math.round( this.every ), () => this.frame() );
    }

    async restart( options: CameraOptions ): Promise<void> {
        await this.attach( options );
    }

    async destroy(): Promise<void> {
        this.stopped = true;
        this.ticker?.stop();
        this.ticker = null;
        this.processedTrack?.stop();
        this.release();
        this.segmenter.close();
        this.gpu.gl.getExtension( "WEBGL_lose_context" )?.loseContext();
    }

    /** Blur, or a picture, and the person's tuning: the same track goes on, with the new look from its next frame. */
    async setLook( look: CameraLook ): Promise<void> {
        this.tuning = tuned( look.tune );
        // A tuning moved on a slider changes the look many times a second: the picture already drawn stays.
        if ( look.image && look.image === this.look.image && this.backSize ) {
            // As it is.
        } else if ( look.image ) {
            const picture = await this.picture( look.image );
            const gl = this.gpu.gl;
            this.gpu.begin();
            gl.bindTexture( gl.TEXTURE_2D, this.backTexture );
            gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, picture );
            this.gpu.end();
            this.backSize = [ picture.naturalWidth, picture.naturalHeight ];
        } else {
            this.backSize = null;
        }
        this.look = look;
    }

    get currentLook(): CameraLook {
        return this.look;
    }

    private picture( url: string ): Promise<HTMLImageElement> {
        let loading = this.pictures.get( url );
        if ( ! loading ) {
            loading = new Promise<HTMLImageElement>( ( resolve, reject ) => {
                const image = new Image();
                image.crossOrigin = "anonymous";
                image.decoding = "async";
                image.onload = () => resolve( image );
                image.onerror = () => reject( new Error( "The background did not load: " + url ) );
                image.src = url;
            } );
            loading.catch( () => this.pictures.delete( url ) );
            this.pictures.set( url, loading );
        }
        return loading;
    }

    // A frame in five timed whole, the model and the passes: once they have slowed the device for SLOW_SECONDS
    // (quality.ts), the page is told, once, and the same model goes on drawing. The person decides (Turn Off).
    private watch( took: number, now: number ): void {
        if ( ! this.slowness || this.slow ) return;
        const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
        if ( ! this.slowness.feed( took, now, hidden ) ) return;
        this.slow = true;
        this.cost.slowMs = this.slowness.last;
        if ( typeof window !== "undefined" ) window.dispatchEvent( new CustomEvent( SLOW_EVENT, { detail: { ms: this.slowness.last } } ) );
    }

    // The camera in a video element of the processor's own. The room client's (`element`) is handed to init() before
    // the camera is attached to it, so a processor waiting for its first frame there waited for nothing.
    private async attach( { track }: CameraOptions ): Promise<void> {
        this.release();
        const video = document.createElement( "video" );
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = new MediaStream( [ track ] );
        void video.play().catch( () => null );
        this.video = video;
        if ( video.readyState >= 2 ) return;
        await new Promise<void>( ( resolve ) => {
            const done = () => {
                clearTimeout( timer );
                video.removeEventListener( "loadeddata", done );
                resolve();
            };
            const timer = setTimeout( done, FIRST_FRAME_MS );
            video.addEventListener( "loadeddata", done );
        } );
    }

    private release(): void {
        if ( this.video ) {
            this.video.pause();
            this.video.srcObject = null;
        }
        this.video = null;
    }

    private target( key: string, width: number, height: number, format: "r8" | "r16f" | "rgba16f" ): Target {
        const old = this.targets[ key ];
        if ( old && old.width === width && old.height === height ) return old;
        this.gpu.free( old );
        return this.targets[ key ] = this.gpu.target( width, height, format );
    }

    private frame(): void {
        const video = this.video;
        if ( this.stopped || ! video || video.readyState < 2 || ! video.videoWidth ) return;
        // The beats that came while a frame took longer than one are dropped, not drawn one after another: a slow
        // device sends fewer frames rather than falling ever further behind and holding the page.
        if ( performance.now() - this.frameEnd < this.every / 2 ) return;
        const gpu = this.gpu;
        const gl = gpu.gl;

        // Lines are the shorter side, as a phone held upright has its camera.
        const scale = Math.min( 1, MOST_LINES / Math.min( video.videoWidth, video.videoHeight ) );
        const even = ( n: number ) => Math.max( 2, 2 * Math.round( n * scale / 2 ) );
        const width = even( video.videoWidth );
        const height = even( video.videoHeight );
        if ( this.canvas.width !== width || this.canvas.height !== height ) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // One frame in five is timed whole, the model and the passes, the GPU waited for before it, so the last frame's
        // drawing still on it is not counted, and after it (quality.ts).
        const segmenter = this.segmenter;
        const watched = this.cost.masks % 5 === 0;
        if ( watched ) gpu.sync();
        const started = performance.now();
        segmenter.segment( video, started, width, height, ( mask ) => {
            gpu.begin();
            this.takeMask( mask );
            gpu.end();
        } );
        const segmented = performance.now();
        this.cost.segment = this.cost.segment * 0.9 + ( segmented - started ) * 0.1;
        this.cost.masks++;

        gpu.begin();
        gl.bindTexture( gl.TEXTURE_2D, this.frameTexture );
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video );
        this.draw( width, height );
        gpu.end();
        if ( watched ) gpu.sync();
        const ended = performance.now();
        this.cost.draw = this.cost.draw * 0.9 + ( ended - segmented ) * 0.1;
        this.cost.frames++;
        if ( watched ) this.watch( ended - started, started );
        this.frameEnd = ended;
    }

    // The newest mask into the processor's own pair of textures, kept with the one before where the model hesitates.
    private takeMask( mask: Mask ): void {
        const gpu = this.gpu;
        const gl = gpu.gl;
        let texture: WebGLTexture;
        if ( "texture" in mask ) {
            texture = mask.texture;
        } else {
            gl.bindTexture( gl.TEXTURE_2D, this.cpuMask );
            gl.texImage2D( gl.TEXTURE_2D, 0, gl.R32F, mask.width, mask.height, 0, gl.RED, gl.FLOAT, mask.data );
            texture = this.cpuMask;
        }
        if ( ! this.masks || this.masks[ 0 ].width !== mask.width || this.masks[ 0 ].height !== mask.height ) {
            this.masks?.forEach( ( target ) => gpu.free( target ) );
            this.masks = [ gpu.target( mask.width, mask.height, "r16f" ), gpu.target( mask.width, mask.height, "r16f" ) ];
            this.firstMask = true;
        }
        // The frame letterboxed otherwise than the mask before (a phone turned): nothing of that one is kept.
        const fit = mask.fit.join( "," );
        if ( fit !== this.maskFit ) {
            this.maskFit = fit;
            this.firstMask = true;
        }
        this.fit = mask.fit;
        const [ previous, next ] = this.masks;
        gpu.pass( "mask", next, { src: texture, prev: previous.texture, keep: this.tuning.keep, invert: mask.invert ? 1 : 0, first: this.firstMask ? 1 : 0 } );
        this.masks = [ next, previous ];
        this.firstMask = false;
    }

    private draw( width: number, height: number ): void {
        const gpu = this.gpu;
        const alpha = this.target( "alpha", width, height, "r8" );
        const mask = this.masks?.[ 0 ];
        if ( mask ) {
            // The edge weighed in the model's own texels, whatever size the mask came at, as they lie over the frame: a
            // frame letterboxed into the model's shape had fewer of them across it (Mask.fit).
            const fit = this.fit;
            gpu.pass( "jbu", alpha, { frame: this.frameTexture, mask: mask.texture, edge: this.tuning.edge, texel: [ 1 / ( MODEL.width * fit[ 0 ] ), 1 / ( MODEL.height * fit[ 1 ] ) ], sigmaC: SIGMA_C, maskFit: fit } );
        } else {
            // Nothing known of the person yet: all of it is the room.
            const gl = gpu.gl;
            gl.bindFramebuffer( gl.FRAMEBUFFER, alpha.buffer );
            gl.clearColor( 0, 0, 0, 0 );
            gl.clear( gl.COLOR_BUFFER_BIT );
        }

        let back = this.backTexture;
        let fit = [ 1, 1, 0, 0 ];
        const picture = this.look.image && this.backSize;
        if ( picture ) {
            fit = cover( this.backSize![ 0 ], this.backSize![ 1 ], width, height );
        } else {
            const sw = 256;
            const sh = Math.max( 2, Math.round( 256 * height / width ) );
            const a = this.target( "blurA", sw, sh, "rgba16f" );
            const b = this.target( "blurB", sw, sh, "rgba16f" );
            gpu.pass( "away", a, { frame: this.frameTexture, alpha: alpha.texture, h: [ 0.25 / sw, 0.25 / sh ] } );
            for ( let step = 1; step <= this.tuning.blurs; step++ ) {
                gpu.pass( "blur", b, { src: a.texture, dir: [ step / sw, 0 ] } );
                gpu.pass( "blur", a, { src: b.texture, dir: [ 0, step / sh ] } );
            }
            back = a.texture;
        }
        gpu.pass( "final", null, { frame: this.frameTexture, alpha: alpha.texture, back, look: picture ? 1 : 0, fit } );
    }
}

/**
 * Whether WebGL is drawn on the CPU here (SwiftShader, llvmpipe, Windows' basic renderer): the frame's own passes take
 * most of what the machine has there, some 100 ms a 720p frame, and the effects are not for such a device. Asked of a
 * context of its own, let go at once, before anything of the model is downloaded.
 */
export function softwareWebgl(): boolean {
    if ( typeof document === "undefined" ) return false;
    const gl = document.createElement( "canvas" ).getContext( "webgl2" );
    if ( ! gl ) return false;
    const info = gl.getExtension( "WEBGL_debug_renderer_info" );
    const renderer = String( gl.getParameter( info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER ) || "" );
    gl.getExtension( "WEBGL_lose_context" )?.loseContext();
    return SOFTWARE_RENDERER.test( renderer );
}

/** The renderers that draw WebGL on the CPU. */
export const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/** Where in a picture the frame samples so the picture covers it, centred: its scale and offset on each side. */
function cover( width: number, height: number, frameWidth: number, frameHeight: number ): number[] {
    const picture = width / height;
    const frame = frameWidth / frameHeight;
    if ( picture > frame ) {
        const scale = frame / picture;
        return [ scale, 1, ( 1 - scale ) / 2, 0 ];
    }
    const scale = picture / frame;
    return [ 1, scale, 0, ( 1 - scale ) / 2 ];
}
