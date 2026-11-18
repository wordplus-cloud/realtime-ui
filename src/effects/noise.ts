// AI Noise Removal: the microphone with the noise around the voice taken out, as a track of its own
// (`processedTrack`), in the shape of the room client's track processors, as camera.ts is. A pack of its own
// (dist/noise, noise-engine.ts), which a site downloads apart from the effects, as its model is 11 MB.
//
// Two models, each in an AudioWorklet, in a context of this page's own at 48 kHz that the processor keeps whatever
// context the room hands it (the room client wants one set on its track before a processor):
// - DeepFilterNet3 (Schröter, Rosenkranz, Escalante-B. and Maier, MIT or Apache-2.0), in WorkAdventure's build of it
//   for a worklet (@workadventure/noise-suppression, MIT): the whole voice band kept, and keyboard typing taken out as
//   well as steady noise. Measured in Chromium on one signal of hiss, typing and a voice (2026-11-01): typing between
//   the words 26 dB down, the hiss 44, the voice as it was (35 dB SI-SDR against it alone), 71 ms more delay. RNNoise,
//   which it replaced, took the typing 2 dB down and the hiss 8.5 (asked on 2026-11-01: "i can clearly see typings
//   from other side when I enable it").
// - GTCRN (Rong Xiaobin, MIT, in @sapphi-red/web-noise-suppressor's worklet), 116 KB, where DeepFilterNet3 cannot
//   start here or this device cannot keep up with it: typing 20 dB down and the hiss 36 on the same signal, but
//   nothing of the voice above 8 kHz, as it runs at 16 kHz.
// A device that could not keep up is remembered by the browser (LIGHT_KEY) and starts on GTCRN from then on. The
// models are swapped behind the same track, so what the call sends never changes hands. The voice goes out in mono,
// as the call's microphone is heard either way.

const DEEPFILTERNET = 'workadventure-deepfilternet';
const GTCRN = '@sapphi-red/web-noise-suppressor/gtcrn';

/** Kept by the browser once DeepFilterNet3 could not keep up on this device: GTCRN from then on. */
export const LIGHT_KEY = 'wordplus-call-noise-light';

/** How long DeepFilterNet3 may take to read its model in the worklet, in a running context, before GTCRN is taken. */
const READY_MS = 15_000;

export interface NoiseOptions {
    track: MediaStreamTrack,
}

export type NoiseModel = 'deepfilternet' | 'gtcrn';

const wait = ( ms: number ) => new Promise( ( done ) => setTimeout( done, ms ) );

async function bytes( url: string ): Promise<ArrayBuffer> {
    const answer = await fetch( url );
    if ( ! answer.ok ) throw new Error( url + ': ' + answer.status );
    return answer.arrayBuffer();
}

const RUNTIME = 'deepfilternet/df_bg.wasm';
const MODEL = 'deepfilternet/deepfilternet3.bin';

/** The browser's store (Cache Storage) DeepFilterNet3's files are kept in, each under its address. */
export const KEPT = 'wordplus-noise';

// DeepFilterNet3's runtime and model are kept by the browser in a store of their own once read, as its HTTP cache does
// not hold them: full, it lets its largest files go first. On a live site a browser that had the pack's small files
// for a week had these two, 12 MB, for 24 minutes (2026-11-10), and a microphone turned on waited some 12 s for them
// on every visit. The pack's folder is named by its hash, so a file under it never changes: kept until another pack's
// are asked for from the folder beside it, which lets them go. Null where the browser has no such store (a private
// window of Firefox) or the files are not a server's (an app's own, under blob: addresses): read as before there.
const stores = new Map<string, Promise<Cache | null>>();

function store( base: string ): Promise<Cache | null> {
    let opened = stores.get( base );
    if ( ! opened ) {
        opened = ( async () => {
            if ( ! /^https?:/.test( base ) || typeof caches === 'undefined' ) return null;
            const held = await caches.open( KEPT );
            const beside = base.replace( /[^/]+\/$/, '' );
            for ( const request of await held.keys() ) {
                if ( request.url.startsWith( beside ) && ! request.url.startsWith( base ) ) void held.delete( request ).catch( () => null );
            }
            return held;
        } )().catch( () => null );
        stores.set( base, opened );
    }
    return opened;
}

/** A file of the pack from the browser's store, or from its server and into the store, whole or not at all. */
async function kept( base: string, file: string ): Promise<ArrayBuffer> {
    const held = await store( base );
    const have = await held?.match( base + file ).catch( () => undefined );
    if ( have ) return have.arrayBuffer();
    const answer = await fetch( base + file );
    if ( ! answer.ok ) throw new Error( base + file + ': ' + answer.status );
    if ( held ) void held.put( base + file, answer.clone() ).catch( () => null );
    return answer.arrayBuffer();
}

/** DeepFilterNet3 not started in time, told from one that failed with its files. */
class Slow extends Error {}

// The model is a gzipped tar, which the worklet unpacks itself: a server that unzipped it on the way (a Content-Encoding
// of its own for the file) gave the tar, which is zipped again.
async function gzipped( data: ArrayBuffer ): Promise<ArrayBuffer> {
    const head = new Uint8Array( data, 0, 2 );
    if ( head[ 0 ] === 0x1f && head[ 1 ] === 0x8b ) return data;
    return new Response( new Blob( [ data ] ).stream().pipeThrough( new CompressionStream( 'gzip' ) ) ).arrayBuffer();
}

function light(): boolean {
    try {
        return window.localStorage.getItem( LIGHT_KEY ) === '1';
    } catch ( e ) {
        return false;
    }
}

/** Each model's files once read, for every noise processor of the page, and ahead of the first (the engine's warm()). */
export class NoiseFiles {
    private deepFilterNet: Promise<{ module: WebAssembly.Module, model: ArrayBuffer }> | null = null;
    private gtcrn: Promise<ArrayBuffer> | null = null;

    constructor( private readonly base: string ) {}

    /** DeepFilterNet3's runtime compiled, and its model, read once a page. A read that failed is tried again. */
    deepFilterNetFiles(): Promise<{ module: WebAssembly.Module, model: ArrayBuffer }> {
        this.deepFilterNet ??= Promise.all( [
            kept( this.base, RUNTIME ).then( ( wasm ) => WebAssembly.compile( wasm ) ),
            kept( this.base, MODEL ).then( gzipped ),
        ] ).then( ( [ module, model ] ) => ( { module, model } ) ).catch( ( error ) => {
            this.deepFilterNet = null;
            throw error;
        } );
        return this.deepFilterNet;
    }

    /** GTCRN's build, read once a page. */
    gtcrnFile(): Promise<ArrayBuffer> {
        this.gtcrn ??= bytes( this.base + 'gtcrn/gtcrn.wasm' ).catch( ( error ) => {
            this.gtcrn = null;
            throw error;
        } );
        return this.gtcrn;
    }

    /** What this device's model reads, ahead of a microphone: DeepFilterNet3's, or GTCRN's where it could not keep up. */
    async warm(): Promise<void> {
        await ( light() ? this.gtcrnFile() : this.deepFilterNetFiles() );
    }

    /**
     * DeepFilterNet3's files out of the browser's store, once it did not start with them: what a server answered in
     * their place with a 200 (its error page) would be kept for good. The next page reads them from the server again.
     */
    async forget(): Promise<void> {
        this.deepFilterNet = null;
        const held = await store( this.base );
        await Promise.all( [ RUNTIME, MODEL ].map( ( file ) => held?.delete( this.base + file ).catch( () => false ) ) );
    }
}

/** The context every noise processor of the page runs in, its two worklets loaded, and the models' files. */
export class NoiseShared {
    /** DeepFilterNet3 could not start on this page: GTCRN for the next processors too. */
    broken = false;

    constructor( readonly context: AudioContext, readonly files: NoiseFiles ) {}
}

export async function loadNoise( base: string, files: NoiseFiles = new NoiseFiles( base ) ): Promise<NoiseShared> {
    const Context = window.AudioContext ?? ( window as unknown as { webkitAudioContext?: typeof AudioContext } ).webkitAudioContext;
    if ( ! Context || typeof AudioWorkletNode === 'undefined' ) throw new Error( 'No AudioWorklet for the noise removal' );
    const context = new Context( { sampleRate: 48000, latencyHint: 'interactive' } );
    try {
        // The worklets are small (22 and 9 KB): both, so a fall back to GTCRN waits only for its 116 KB.
        await Promise.all( [
            context.audioWorklet.addModule( base + 'deepfilternet/worklet.js' ),
            context.audioWorklet.addModule( base + 'gtcrn/worklet.js' ),
        ] );
        return new NoiseShared( context, files );
    } catch ( error ) {
        void context.close().catch( () => null );
        throw error;
    }
}

const NODE: AudioWorkletNodeOptions = { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [ 1 ], channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' };

export class NoiseProcessor {
    readonly name = 'wordplus-noise-removal';
    processedTrack?: MediaStreamTrack;
    /** The model the voice goes through now, once init() is done. */
    model: NoiseModel | null = null;

    private node: AudioWorkletNode | null = null;
    private out: MediaStreamAudioDestinationNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private track: MediaStreamTrack | null = null;
    private destroyed = false;

    constructor( private readonly shared: NoiseShared ) {}

    /** The context it runs in, which the room client wants set on a microphone before it takes a processor. */
    get context(): AudioContext {
        return this.shared.context;
    }

    async init( { track }: NoiseOptions ): Promise<void> {
        const { context } = this.shared;
        this.out = context.createMediaStreamDestination();
        this.out.channelCount = 1;
        this.processedTrack = this.out.stream.getAudioTracks()[ 0 ];
        this.connect( track );
        // Started by the press that turned it on, or by the microphone opening: a context made without one waits.
        if ( context.state !== 'running' ) await Promise.race( [ context.resume().catch( () => null ), wait( 500 ) ] );
        if ( ! light() && ! this.shared.broken ) {
            try {
                this.use( await this.deepFilterNet(), 'deepfilternet' );
                return;
            } catch ( error ) {
                this.shared.broken = true;
                if ( ! ( error instanceof Slow ) ) void this.shared.files.forget();
                console.warn( 'wordplus-realtime: DeepFilterNet3 did not start here, AI Noise Removal goes on with GTCRN', error );
            }
        }
        this.use( await this.gtcrnNode(), 'gtcrn' );
    }

    async restart( { track }: NoiseOptions ): Promise<void> {
        if ( track && track !== this.track ) this.connect( track );
    }

    async destroy(): Promise<void> {
        this.destroyed = true;
        this.source?.disconnect();
        this.source = null;
        if ( this.node && this.model ) stop( this.node, this.model );
        this.node = null;
        this.out?.disconnect();
        this.processedTrack?.stop();
        this.track = null;
    }

    private connect( track: MediaStreamTrack ): void {
        this.source?.disconnect();
        this.track = track;
        this.source = this.shared.context.createMediaStreamSource( new MediaStream( [ track ] ) );
        if ( this.node ) this.source.connect( this.node );
    }

    /** The voice through `node` from now on, into the same track: the one before it, if any, stopped. */
    private use( node: AudioWorkletNode, model: NoiseModel ): void {
        const was = this.node, wasModel = this.model;
        this.source?.connect( node );
        node.connect( this.out! );
        this.node = node;
        this.model = model;
        if ( was && wasModel ) {
            try {
                this.source?.disconnect( was );
            } catch ( e ) {}
            stop( was, wasModel );
        }
    }

    /**
     * DeepFilterNet3 in a worklet, once it has read its model: the voice passes through it as it is until then. In a
     * context the browser holds back (no press yet), it is taken at once and starts with the context. What it says
     * later is heard: an error, or two seconds in a row it could not keep up, puts GTCRN in its place.
     */
    private async deepFilterNet(): Promise<AudioWorkletNode> {
        const { module, model } = await this.shared.files.deepFilterNetFiles();
        const node = new AudioWorkletNode( this.context, DEEPFILTERNET, {
            ...NODE,
            processorOptions: {
                wasmModule: module,
                modelBytes: model,
                // WorkAdventure's own choices: 25 dB at most taken off while someone speaks, 45 in the pauses between
                // words, with three frames (30 ms) of lookahead so the start of a word is never cut.
                speechAttenuationDb: 25,
                pauseGate: { extraAttenuationDb: 20, lookaheadFrames: 3, hangoverFrames: 10, releaseDbPerFrame: 0.6, speechAboveFloorDb: 10, maxSpeechAttenuationDb: 15 },
                bypassUntilReady: true,
                postGain: undefined,
                // The share of real time it may take, over two seconds, before it says this device cannot keep up.
                maxLoad: 0.7,
                loadReportAfterMs: 0,
            },
        } );
        let started: ( () => void ) | null = null;
        let failed: ( ( error: Error ) => void ) | null = null;
        node.port.addEventListener( 'message', ( event: MessageEvent ) => {
            const type = event.data?.type;
            if ( type === 'ready' ) started?.();
            else if ( type === 'error' ) {
                failed?.( new Error( String( event.data.message ) ) );
                void this.fallBack( node, 'DeepFilterNet3 failed: ' + event.data.message, false );
            } else if ( type === 'overload' ) void this.fallBack( node, 'this device cannot keep up with DeepFilterNet3', true );
        } );
        node.addEventListener( 'processorerror', () => {
            failed?.( new Error( 'The DeepFilterNet3 worklet failed' ) );
            void this.fallBack( node, 'the DeepFilterNet3 worklet failed', false );
        } );
        node.port.start();
        if ( this.context.state !== 'running' ) return node;
        try {
            await new Promise<void>( ( resolve, reject ) => {
                const timer = setTimeout( () => reject( new Slow( `DeepFilterNet3 did not start in ${ READY_MS / 1000 } s` ) ), READY_MS );
                started = () => {
                    clearTimeout( timer );
                    resolve();
                };
                failed = ( error ) => {
                    clearTimeout( timer );
                    reject( error );
                };
            } );
        } catch ( error ) {
            stop( node, 'deepfilternet' );
            throw error;
        } finally {
            started = failed = null;
        }
        return node;
    }

    private async gtcrnNode(): Promise<AudioWorkletNode> {
        const wasm = await this.shared.files.gtcrnFile();
        return new AudioWorkletNode( this.context, GTCRN, { ...NODE, processorOptions: { maxChannels: 1, wasmBinary: wasm } } );
    }

    /** GTCRN in DeepFilterNet3's place, once its file is in: DeepFilterNet3 goes on until then. */
    private async fallBack( node: AudioWorkletNode, reason: string, slow: boolean ): Promise<void> {
        if ( this.destroyed || this.node !== node ) return;
        if ( slow ) {
            try {
                window.localStorage.setItem( LIGHT_KEY, '1' );
            } catch ( e ) {}
        } else this.shared.broken = true;
        console.warn( 'wordplus-realtime: AI Noise Removal goes on with GTCRN, as ' + reason );
        try {
            const gtcrn = await this.gtcrnNode();
            if ( this.destroyed || this.node !== node ) {
                stop( gtcrn, 'gtcrn' );
                return;
            }
            this.use( gtcrn, 'gtcrn' );
        } catch ( error ) {
            console.warn( 'wordplus-realtime: GTCRN did not start either', error );
        }
    }
}

function stop( node: AudioWorkletNode, model: NoiseModel ): void {
    node.port.postMessage( model === 'deepfilternet' ? { type: 'dispose' } : 'destroy' );
    node.disconnect();
}
