import type { RecordingData } from "./types.ts";

/**
 * Where a recording plays from, in order: hls.js where the browser has Media Source (loaded by a <script> from the
 * host's address only then, as the call effects' engine is), else HLS by the browser itself (an iPhone before Managed
 * Media Source), else the MP4. Not the browser's own HLS first: Chrome says it plays HLS too (`canPlayType` answers
 * "maybe" since 2025) and failed on these byte-range playlists with a media error, found on a real recording on
 * 2026-10-30. hls.js reads the segments with XHR, which a storage allows only with CORS: when it fails, and when the
 * browser's own HLS gives a media error (the player's onError), the player falls back to the MP4, which a <video>
 * plays from any storage.
 */
export type SourceMode = "native" | "hls" | "mp4" | "audio" | "none";

/** A quality the viewer may pick: `auto` (HLS, adaptive) or a height, of hls.js's levels or of an MP4. */
export type Quality = "auto" | string;

interface HlsInstance {
    loadSource( url: string ): void;
    attachMedia( media: HTMLMediaElement ): void;
    on( event: string, handler: ( event: string, data: { fatal?: boolean; type?: string } ) => void ): void;
    destroy(): void;
    levels?: Array<{ height?: number }>;
    currentLevel?: number;
}

interface HlsClass {
    new ( config?: Record<string, unknown> ): HlsInstance;
    isSupported(): boolean;
    Events: { ERROR: string; MANIFEST_PARSED?: string };
    ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
}

/** hls.js's levels as the heights they play, highest first, each once. */
export function levelHeights( levels: Array<{ height?: number }> | undefined ): string[] {
    return [ ...new Set( ( levels ?? [] ).map( ( level ) => Number( level.height ) ).filter( ( height ) => height > 0 ) ) ].sort( ( a, b ) => b - a ).map( String );
}

let loading: Promise<HlsClass | null> | null = null;

/** hls.js from `url` (its light build), once a page: null where it can't load or the browser can't run it. */
export function loadHls( url: string ): Promise<HlsClass | null> {
    const global = () => ( window as unknown as { Hls?: HlsClass } ).Hls ?? null;

    if ( global() ) return Promise.resolve( global() );
    if ( ! url ) return Promise.resolve( null );

    loading ??= new Promise( ( resolve ) => {
        const script = document.createElement( "script" );
        script.src = url;
        script.async = true;
        script.onload = () => resolve( global() );
        script.onerror = () => {
            loading = null;
            resolve( null );
        };
        document.head.appendChild( script );
    } );

    return loading;
}

export function nativeHls( media: HTMLMediaElement ): boolean {
    return media.canPlayType( "application/vnd.apple.mpegurl" ) !== "";
}

export function mediaSource(): boolean {
    return typeof window !== "undefined" && ( "MediaSource" in window || "ManagedMediaSource" in window );
}

/** The MP4 sizes there are, largest first. */
export function sizes( data: RecordingData ): string[] {
    return Object.keys( data.sources?.mp4 ?? {} ).filter( ( size ) => !! data.sources?.mp4?.[ size ] ).sort( ( a, b ) => Number( b ) - Number( a ) );
}

/** The MP4 for a quality: the size asked for, else 720, else the smaller on a small screen or Save-Data, else any. */
export function mp4For( data: RecordingData, quality: Quality, small: boolean ): string {
    const mp4 = data.sources?.mp4 ?? {};
    if ( quality !== "auto" && mp4[ quality ] ) return mp4[ quality ];

    const all = sizes( data );
    if ( small && all.length ) return mp4[ all[ all.length - 1 ] ];

    return mp4[ "720" ] || ( all.length ? mp4[ all[ 0 ] ] : "" );
}

/** Whether the viewer is on a small screen or asked to save data: the smaller MP4 then. */
export function wantsSmall(): boolean {
    if ( typeof window === "undefined" ) return false;
    const connection = ( navigator as unknown as { connection?: { saveData?: boolean } } ).connection;

    return !! connection?.saveData || ( window.screen?.width ?? 1920 ) < 600;
}

export interface Attached {
    mode: SourceMode;
    detach(): void;
    /** The MP4's height that plays, for an MP4. */
    size?: string;
    /** For hls.js: plays the level of a height, or `auto` to let it adapt. */
    level?( quality: Quality ): void;
}

/**
 * Whether a recording is its sound alone: no video at all. An audio call is a video of its call screen since 1.0.4,
 * so `audio`, what the call was, doesn't say it: one made before is sound, and still plays.
 */
export function soundOnly( data: RecordingData ): boolean {
    return ! data.sources?.hls && ! sizes( data ).length;
}

/** The height of an MP4 by its address. */
function sizeOf( data: RecordingData, src: string ): string {
    return Object.keys( data.sources?.mp4 ?? {} ).find( ( size ) => data.sources?.mp4?.[ size ] === src ) ?? "";
}

/**
 * Puts a recording's picture and sound into `media`: `onFallback` hears when HLS gave way to the MP4, with the height
 * that plays, and `onLevels` the heights hls.js can play once it has read the playlists, for the quality menu.
 */
export async function attach( media: HTMLMediaElement, data: RecordingData, quality: Quality, hlsUrl: string, onFallback?: ( size: string ) => void, onLevels?: ( heights: string[] ) => void ): Promise<Attached> {
    const nothing = { mode: "none" as SourceMode, detach: () => undefined };
    const audio = data.sources?.audio ?? "";

    if ( soundOnly( data ) ) {
        if ( ! audio ) return nothing;
        media.src = audio;
        return { mode: "audio", detach: () => media.removeAttribute( "src" ) };
    }

    const hls = data.sources?.hls ?? "";
    const mp4 = () => {
        const src = mp4For( data, quality, wantsSmall() );
        if ( src ) media.src = src;
        return { mode: ( src ? "mp4" : "none" ) as SourceMode, size: sizeOf( data, src ), detach: () => media.removeAttribute( "src" ) };
    };

    if ( quality !== "auto" || ! hls ) return mp4();

    const Hls = mediaSource() ? await loadHls( hlsUrl ) : null;

    if ( ! Hls || ! Hls.isSupported() ) {
        if ( ! nativeHls( media ) ) return mp4();
        media.src = hls;
        return { mode: "native", detach: () => media.removeAttribute( "src" ) };
    }

    const player = new Hls( { capLevelToPlayerSize: true, startLevel: -1, maxBufferLength: 30 } );
    let gone = false;

    player.on( Hls.Events.ERROR, ( _event, error ) => {
        if ( gone || ! error.fatal ) return;
        gone = true;
        const at = media.currentTime;
        const playing = ! media.paused;
        player.destroy();
        const fallen = mp4();
        if ( at > 0 ) media.currentTime = at;
        if ( playing ) media.play().catch( () => undefined );
        onFallback?.( fallen.size );
    } );
    player.on( Hls.Events.MANIFEST_PARSED ?? "hlsManifestParsed", () => {
        if ( ! gone ) onLevels?.( levelHeights( player.levels ) );
    } );
    player.loadSource( hls );
    player.attachMedia( media );

    return {
        mode: "hls",
        detach: () => {
            gone = true;
            player.destroy();
        },
        level: ( chosen ) => {
            const levels = player.levels ?? [];
            // the last of a height is its highest bitrate: hls.js keeps them lowest first
            let index = -1;
            levels.forEach( ( level, at ) => {
                if ( String( level.height ) === chosen ) index = at;
            } );
            player.currentLevel = "auto" === chosen ? -1 : index;
        },
    };
}
