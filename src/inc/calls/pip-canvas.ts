import { iconPathD, type IconName } from "../../primitives/icons.tsx";
import type { CallTrack } from "../../components/calls/context.ts";

/**
 * A group video call's picture-in-picture (group-pip.tsx) is the browser's own window of a video, in Chrome, Edge and
 * Safari alike: that window keeps the shape of what it plays as the user resizes it, and takes the new shape the moment
 * the picture changes it, which a Document Picture-in-Picture window can do neither of (it resizes only on a press in
 * it). The video plays this canvas, drawn here: whom the window is about, their camera or shared screen whole at its
 * own shape, else their face, with their name and the ring of someone speaking, as their tile has them.
 */

/** What the window shows. */
export interface PipScene {
    key: string;
    source: 'camera' | 'screen' | null;
    track: CallTrack | null;
    /** The picture's shape while its frames are on their way (its publication's), else null. */
    ratio: number | null;
    name: string;
    avatar: string;
    muted: boolean;
    speaking: boolean;
}

/** The canvas's longest side and its frames a second: a camera's, and a shared screen's, whose text needs the lines. */
export const PIP_CAMERA = { longest: 640, fps: 24 } as const;
export const PIP_SCREEN = { longest: 1280, fps: 15 } as const;
/** The shape of someone drawn without a picture. */
export const PIP_FACE_RATIO = 16 / 9;

// The call stage's tile. The name pill and the ring are drawn at their size on a tile (_pip.scss) in the window as it is
// now: larger on a canvas the window shows smaller, smaller as the user makes the window larger. Before the browser
// says how wide the window is, at the width Chrome first opens it.
const TILE = 'rgb(30, 33, 41)';
const OPENS_AT = 384;

/** The canvas for a picture `width` by `height`: its shape, its longest side at most `longest`, in even pixels. */
export function pipCanvasSize( width: number, height: number, longest: number ): [ number, number ] {
    const scale = Math.min( 1, longest / Math.max( width, height ) );
    const even = ( side: number ) => Math.max( 2, Math.round( side * scale / 2 ) * 2 );
    return [ even( width ), even( height ) ];
}

// A worker's clock: where the browser slows a hidden tab's own timers to one a second, a worker's keep their pace, and
// the window is there for when the tab is hidden. The page's timer where a worker can't be made (a policy refusing a
// worker of a blob).
const CLOCK = 'let t;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),e.data)}';

function clock( fps: number, tick: () => void ): () => void {
    let stop = () => {};
    const fallback = () => {
        stop();
        const id = setInterval( tick, 1000 / fps );
        stop = () => clearInterval( id );
    };
    try {
        if ( typeof Worker === 'undefined' ) throw new Error( 'no worker' );
        const url = URL.createObjectURL( new Blob( [ CLOCK ], { type: 'text/javascript' } ) );
        const worker = new Worker( url );
        URL.revokeObjectURL( url );
        worker.onmessage = tick;
        worker.onerror = fallback;
        worker.postMessage( 1000 / fps );
        stop = () => worker.terminate();
    } catch {
        fallback();
    }
    return () => stop();
}

/**
 * A track that sends only what is seen (a room's remote camera, its adaptive stream) is told the window shows it, at
 * the canvas's size: the picture played here to be drawn is in no page, and a hidden tab would have it paused.
 */
interface SeenTrack {
    observeElementInfo?( info: object ): void;
    stopObservingElementInfo?( info: object ): void;
}

export class PipCanvas {
    readonly stream: MediaStream;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: CanvasRenderingContext2D | null;
    // The picture shown, played here to be drawn.
    private readonly picture: HTMLVideoElement;
    private played: CallTrack | null = null;
    private seen: { track: SeenTrack, info: { handleResize?: () => void } } | null = null;
    private scene: PipScene | null = null;
    private stopClock: ( () => void ) | null = null;
    private fps = 0;
    private shown: { readonly width: number } | null = null;
    private readonly faces = new Map<string, HTMLImageElement | null>();
    private readonly font: string;

    constructor( private readonly accent: () => string ) {
        this.canvas = document.createElement( 'canvas' );
        [ this.canvas.width, this.canvas.height ] = pipCanvasSize( PIP_FACE_RATIO * PIP_CAMERA.longest, PIP_CAMERA.longest, PIP_CAMERA.longest );
        this.context = this.canvas.getContext( '2d' );
        this.stream = this.canvas.captureStream( PIP_CAMERA.fps );
        this.picture = document.createElement( 'video' );
        this.picture.muted = true;
        this.picture.playsInline = true;
        this.picture.autoplay = true;
        const font = typeof getComputedStyle === 'function' ? getComputedStyle( document.documentElement ).getPropertyValue( '--wplus-messenger-font' ).trim() : '';
        this.font = font || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    }

    /** The canvas's size now, which is the window's shape. */
    get size(): [ number, number ] {
        return [ this.canvas.width, this.canvas.height ];
    }

    /** Whom it shows. While the window is open their picture is played, and drawn at the next frame. */
    show( scene: PipScene | null ): void {
        this.scene = scene;
        if ( this.stopClock ) this.follow();
    }

    /** The window opened, as wide as `shown` says while it is open (the browser's PictureInPictureWindow): drawn from now on. */
    start( shown: { readonly width: number } | null = null ): void {
        this.shown = shown;
        if ( this.stopClock ) return;
        this.stopClock = () => {};
        this.follow();
        this.paint();
    }

    /** The window closed: nothing played and nothing drawn, the last frame kept for the next one to open on. */
    pause(): void {
        this.stopClock?.();
        this.stopClock = null;
        this.fps = 0;
        this.shown = null;
        this.play( null );
    }

    /** The call ended: everything let go. */
    release(): void {
        this.pause();
        this.stream.getTracks().forEach( ( track ) => track.stop() );
        this.faces.clear();
    }

    // The picture of whom it shows played, and the clock at its pace.
    private follow(): void {
        const scene = this.scene;
        this.play( scene?.track ?? null );
        const fps = scene?.source === 'screen' ? PIP_SCREEN.fps : PIP_CAMERA.fps;
        if ( fps === this.fps ) return;
        this.stopClock?.();
        this.fps = fps;
        this.stopClock = clock( fps, () => this.paint() );
    }

    private play( track: CallTrack | null ): void {
        if ( track === this.played ) return;
        if ( this.seen ) {
            this.seen.track.stopObservingElementInfo?.( this.seen.info );
            this.seen = null;
        }
        if ( this.played?.attachedElements.includes( this.picture ) ) this.played.detach( this.picture );
        this.played = track;
        if ( ! track ) return;
        track.attach( this.picture );
        const seen = track as SeenTrack;
        if ( typeof seen.observeElementInfo === 'function' ) {
            const info: { handleResize?: () => void, [ more: string ]: unknown } = {
                element: this.canvas,
                width: () => this.canvas.width,
                height: () => this.canvas.height,
                visible: true,
                pictureInPicture: true,
                visibilityChangedAt: Date.now(),
                observe() {},
                stopObserving() {},
            };
            seen.observeElementInfo( info );
            this.seen = { track: seen, info };
        }
    }

    /** One frame of what it shows now: also the one the window opens on. */
    paint(): void {
        const scene = this.scene;
        const playing = !! scene?.track && this.played === scene.track && this.picture.readyState >= 2 && this.picture.videoWidth > 0 && this.picture.videoHeight > 0;
        const limit = scene?.source === 'screen' ? PIP_SCREEN : PIP_CAMERA;
        const ratio = scene?.source && scene.ratio ? scene.ratio : PIP_FACE_RATIO;
        const [ width, height ] = playing ? pipCanvasSize( this.picture.videoWidth, this.picture.videoHeight, limit.longest )
            : pipCanvasSize( ratio * limit.longest, limit.longest, limit.longest );
        if ( this.canvas.width !== width || this.canvas.height !== height ) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.seen?.info.handleResize?.();
        }

        const g = this.context;
        if ( ! g ) return;
        g.fillStyle = TILE;
        g.fillRect( 0, 0, width, height );
        if ( ! scene ) return;
        // A camera or a screen at its own shape fills the canvas: nothing cut, nothing around it.
        if ( playing ) g.drawImage( this.picture, 0, 0, width, height );
        else this.drawFace( g, scene, width, height );

        const unit = Math.max( 0.5, width / ( this.shown?.width || OPENS_AT ) );
        this.drawName( g, scene, height, width, unit );
        if ( scene.speaking ) {
            g.strokeStyle = this.accent();
            g.lineWidth = 6 * unit;
            g.strokeRect( 0, 0, width, height );
        }
    }

    // Their avatar in a circle in the middle, or their initials where the picture can't be drawn here (another site's
    // picture that does not allow it).
    private drawFace( g: CanvasRenderingContext2D, scene: PipScene, width: number, height: number ): void {
        const radius = Math.min( width, height ) * 0.18;
        const x = width / 2, y = height / 2;
        const face = this.face( scene.avatar );
        g.save();
        g.beginPath();
        g.arc( x, y, radius, 0, Math.PI * 2 );
        g.closePath();
        if ( face ) {
            g.clip();
            g.drawImage( face, x - radius, y - radius, radius * 2, radius * 2 );
        } else {
            g.fillStyle = 'rgba(255, 255, 255, 0.14)';
            g.fill();
            g.fillStyle = '#ffffff';
            g.font = `600 ${ Math.round( radius * 0.8 ) }px ${ this.font }`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText( initials( scene.name ), x, y );
        }
        g.restore();
    }

    private face( src: string ): HTMLImageElement | null {
        if ( ! src ) return null;
        if ( this.faces.has( src ) ) return this.faces.get( src ) ?? null;
        this.faces.set( src, null );
        const image = new Image();
        // Drawn only where the site that has it allows it: a picture that does not would end the canvas's frames.
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            if ( this.faces.has( src ) ) this.faces.set( src, image );
        };
        image.src = src;
        return null;
    }

    // The name in a pill at the bottom start, the screen and muted microphone before it, as the window's own name.
    private drawName( g: CanvasRenderingContext2D, scene: PipScene, height: number, width: number, unit: number ): void {
        const icons: IconName[] = [ ...( scene.source === 'screen' ? [ 'screenShare' as const ] : [] ), ...( scene.muted ? [ 'micOff' as const ] : [] ) ];
        const size = 12 * unit, icon = 14 * unit, gap = 4 * unit, padX = 8 * unit, pill = 22 * unit, edge = 8 * unit;
        g.save();
        g.font = `500 ${ size }px ${ this.font }`;
        const iconsWidth = icons.length * ( icon + gap );
        const room = width - edge * 2 - padX * 2 - iconsWidth;
        const text = fit( g, scene.name, room );
        const pillWidth = padX * 2 + iconsWidth + g.measureText( text ).width;
        const left = edge, top = height - edge - pill;
        g.fillStyle = 'rgba(0, 0, 0, 0.55)';
        g.beginPath();
        if ( typeof g.roundRect === 'function' ) g.roundRect( left, top, pillWidth, pill, 6 * unit );
        else g.rect( left, top, pillWidth, pill );
        g.fill();

        g.strokeStyle = g.fillStyle = '#ffffff';
        let at = left + padX;
        for ( const name of icons ) {
            if ( typeof Path2D !== 'undefined' ) {
                g.save();
                g.translate( at, top + ( pill - icon ) / 2 );
                g.scale( icon / 24, icon / 24 );
                g.lineWidth = 2;
                g.lineCap = 'round';
                g.lineJoin = 'round';
                g.stroke( new Path2D( iconPathD( name ) ) );
                g.restore();
            }
            at += icon + gap;
        }
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.fillText( text, at, top + pill / 2 );
        g.restore();
    }
}

function initials( name: string ): string {
    return name.trim().split( /\s+/ ).slice( 0, 2 ).map( ( word ) => Array.from( word )[ 0 ] ?? '' ).join( '' ).toUpperCase();
}

// The name cut with an ellipsis where the pill would run past the picture.
function fit( g: CanvasRenderingContext2D, text: string, room: number ): string {
    if ( g.measureText( text ).width <= room ) return text;
    const chars = Array.from( text );
    while ( chars.length && g.measureText( chars.join( '' ) + '…' ).width > room ) chars.pop();
    return chars.join( '' ) + '…';
}
