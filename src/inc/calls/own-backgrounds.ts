import { useSyncExternalStore } from "react";
import { _x } from "../globals.ts";
import { host, type HostBackground } from "../../host.ts";

// People's own pictures for the camera's background, where the app lets them (UiHost.ownBackgrounds): a picture of the
// device, picked in the device settings, read and scaled here in the browser and kept by it in IndexedDB, so it is there
// in the next call. It is never sent anywhere: no request carries it, and the others see it only in the camera, as with
// any background. The newest few are kept, each to be removed. Where the browser keeps nothing (its storage refused,
// out of room, or not answering), a picture lasts as long as the page, so the call goes on with it.

/** How many a browser keeps: the newest, the oldest dropped as another is added. */
export const OWN_LIMIT = 3;

/**
 * The size a picture is scaled down to cover, the size the calls draw a background at (the WordPlus SDK's video
 * effects, WIDTH and HEIGHT): a phone's photo of 4032 by 3024 is kept at 1280 by 960, and one already smaller as it is.
 */
export const OWN_WIDTH = 1280;
export const OWN_HEIGHT = 720;

/** The largest file read: a bigger one is refused before it is decoded, as a phone may not have the memory for it. */
export const OWN_MAX_BYTES = 40 * 1024 * 1024;

/** What the device's file picker offers: JPEG, PNG and WebP, and HEIC where the browser decodes it (Safari). */
export const OWN_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

const DB_NAME = 'wordplus-call-backgrounds';
const STORE = 'pictures';

// How long IndexedDB is waited for: one that never answers (Safari after the Mac slept) leaves the pictures to the page.
const WAIT = 4000;

/**
 * A picture as the browser keeps it: its bytes and type rather than a Blob, which Safari's private windows refuse to
 * store, and when it was added, the newest first.
 */
interface Kept {
    id: string,
    data: ArrayBuffer,
    type: string,
    added: number,
}

let kept: Kept[] = [];
const urls = new Map<string, string>();
let list: HostBackground[] = [];
let loading: Promise<void> | null = null;
let lasting = true;
let version = 0;
const listeners = new Set<() => void>();

function changed(): void {
    const name = _x( 'Your Picture', 'Call Effects', 'bp-better-messages' );
    list = kept.map( ( one ) => ( { id: one.id, url: urls.get( one.id ) ?? '', name } ) );
    version++;
    listeners.forEach( ( listener ) => listener() );
}

function timed<T>( promise: Promise<T> ): Promise<T> {
    return new Promise<T>( ( resolve, reject ) => {
        const timer = setTimeout( () => reject( new Error( 'IndexedDB did not answer' ) ), WAIT );
        promise.then(
            ( value ) => { clearTimeout( timer ); resolve( value ); },
            ( error ) => { clearTimeout( timer ); reject( error ); },
        );
    } );
}

let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
    opened ??= timed( new Promise<IDBDatabase>( ( resolve, reject ) => {
        if ( typeof indexedDB === 'undefined' ) throw new Error( 'No IndexedDB' );
        const request = indexedDB.open( DB_NAME, 1 );
        request.onupgradeneeded = () => request.result.createObjectStore( STORE, { keyPath: 'id' } );
        request.onsuccess = () => resolve( request.result );
        request.onerror = () => reject( request.error );
        request.onblocked = () => reject( new Error( 'IndexedDB is blocked' ) );
    } ) );
    return opened;
}

function inStore<T>( mode: IDBTransactionMode, run: ( store: IDBObjectStore ) => IDBRequest<T> | void ): Promise<T | undefined> {
    return database().then( ( db ) => timed( new Promise<T | undefined>( ( resolve, reject ) => {
        const transaction = db.transaction( STORE, mode );
        const request = run( transaction.objectStore( STORE ) );
        transaction.oncomplete = () => resolve( request ? request.result : undefined );
        transaction.onerror = () => reject( transaction.error );
        transaction.onabort = () => reject( transaction.error ?? new Error( 'The transaction was aborted' ) );
    } ) ) );
}

function forget( id: string ): void {
    const url = urls.get( id );
    if ( url ) URL.revokeObjectURL( url );
    urls.delete( id );
}

// Deleted from the browser even after a write failed there, so a picture it kept from before never comes back.
function unstore( id: string ): Promise<void> {
    return inStore( 'readwrite', ( store ) => void store.delete( id ) ).then( () => undefined, () => undefined );
}

function remember( one: Kept ): void {
    urls.set( one.id, URL.createObjectURL( new Blob( [ one.data ], { type: one.type } ) ) );
}

/** Drops those past the limit, the oldest, from the page and the browser. */
function trim(): void {
    kept.sort( ( a, b ) => b.added - a.added );
    for ( const extra of kept.splice( OWN_LIMIT ) ) {
        forget( extra.id );
        unstore( extra.id );
    }
}

/** Reads what the browser keeps, once: none until it answers, and none where it keeps nothing. */
function load(): Promise<void> {
    loading ??= ( async () => {
        try {
            const all = ( await inStore<Kept[]>( 'readonly', ( store ) => store.getAll() ) ) ?? [];
            for ( const one of all ) {
                const valid = one && typeof one.id === 'string' && one.data instanceof ArrayBuffer && typeof one.type === 'string' && typeof one.added === 'number';
                if ( ! valid || kept.some( ( was ) => was.id === one.id ) ) continue;
                kept.push( one );
                remember( one );
            }
            trim();
        } catch ( error ) {
            lasting = false;
        }
        changed();
    } )();
    return loading;
}

/** Whether the app lets people use their own pictures (UiHost.ownBackgrounds). */
export function ownBackgroundsAllowed(): boolean {
    return host().ownBackgrounds?.() === true;
}

/**
 * The pictures this browser keeps, the newest first, each with a picture the page may draw (a blob: address of its
 * own): none while the app does not let people use them, and none until the browser has answered, as it is asked
 * the first time.
 */
export function ownBackgrounds(): HostBackground[] {
    if ( ! ownBackgroundsAllowed() || typeof window === 'undefined' ) return [];
    void load();
    return list;
}

/** Whether the pictures added stay for the next call: false where the browser keeps nothing, and they last the page. */
export function ownBackgroundsLast(): boolean {
    return lasting;
}

const subscribe = ( listener: () => void ) => {
    listeners.add( listener );
    return () => void listeners.delete( listener );
};

/** The pictures as they change: one added or removed, or the browser's answer coming in. */
export function useOwnBackgrounds(): HostBackground[] {
    useSyncExternalStore( subscribe, () => version, () => 0 );
    return ownBackgrounds();
}

/** A number that moves as the pictures change, for what draws the chosen one (useTrackEffects): it asks nothing itself. */
export function useOwnBackgroundsVersion(): number {
    return useSyncExternalStore( subscribe, () => version, () => 0 );
}

interface Decoded {
    source: CanvasImageSource,
    width: number,
    height: number,
    close: () => void,
}

/** A file as a picture the canvas draws, its EXIF rotation applied: an image bitmap, else an <img>, where Safari decodes HEIC. */
async function decode( file: Blob ): Promise<Decoded> {
    if ( typeof createImageBitmap === 'function' ) {
        try {
            const bitmap = await createImageBitmap( file, { imageOrientation: 'from-image' } );
            return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
        } catch ( e ) {}
    }
    const url = URL.createObjectURL( file );
    try {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL( url ) };
    } catch ( error ) {
        URL.revokeObjectURL( url );
        throw error;
    }
}

/** The picture scaled down to cover OWN_WIDTH by OWN_HEIGHT, never up, as a JPEG: a background has nothing to see through. */
async function scaled( file: Blob ): Promise<Blob> {
    const picture = await decode( file );
    try {
        if ( ! picture.width || ! picture.height ) throw new Error( 'The picture has no size' );
        const scale = Math.min( 1, Math.max( OWN_WIDTH / picture.width, OWN_HEIGHT / picture.height ) );
        const canvas = document.createElement( 'canvas' );
        canvas.width = Math.max( 1, Math.round( picture.width * scale ) );
        canvas.height = Math.max( 1, Math.round( picture.height * scale ) );
        const context = canvas.getContext( '2d' );
        if ( ! context ) throw new Error( 'No canvas to scale the picture on' );
        context.imageSmoothingQuality = 'high';
        context.drawImage( picture.source, 0, 0, canvas.width, canvas.height );
        return await new Promise<Blob>( ( resolve, reject ) => canvas.toBlob(
            ( blob ) => blob ? resolve( blob ) : reject( new Error( 'The picture could not be encoded' ) ),
            'image/jpeg',
            0.9,
        ) );
    } finally {
        picture.close();
    }
}

const newId = () => 'p' + Date.now().toString( 36 ) + Math.random().toString( 36 ).slice( 2, 8 );

/**
 * Reads a picture of the device and keeps it, the newest of OWN_LIMIT, in the browser alone: its id, to choose it as
 * `own:<id>`. Fails with a line to show for a file that is not a picture the browser can open, or is too big to read.
 */
export async function addOwnBackground( file: File ): Promise<string> {
    const unreadable = () => new Error( _x( 'This picture could not be opened. Try a JPEG, PNG or WebP.', 'Call Effects', 'bp-better-messages' ) );
    if ( file.size > OWN_MAX_BYTES ) throw new Error( _x( 'This picture is too big. Try one under 40 MB.', 'Call Effects', 'bp-better-messages' ) );
    if ( file.type && ! file.type.startsWith( 'image/' ) ) throw unreadable();
    await load();
    let picture: Blob;
    try {
        picture = await scaled( file );
    } catch ( e ) {
        throw unreadable();
    }
    const one: Kept = { id: newId(), data: await picture.arrayBuffer(), type: picture.type || 'image/jpeg', added: Date.now() };
    kept.unshift( one );
    remember( one );
    trim();
    if ( lasting ) {
        try {
            await inStore( 'readwrite', ( store ) => void store.put( one ) );
        } catch ( error ) {
            lasting = false;
        }
    }
    changed();
    return one.id;
}

/** Removes a picture from the page and from the browser. */
export async function removeOwnBackground( id: string ): Promise<void> {
    if ( ! kept.some( ( one ) => one.id === id ) ) return;
    kept = kept.filter( ( one ) => one.id !== id );
    forget( id );
    changed();
    await unstore( id );
}

/** Forgets what the page read, for tests: the next ask reads the browser again. */
export function resetOwnBackgrounds(): void {
    for ( const one of kept ) forget( one.id );
    kept = [];
    list = [];
    loading = null;
    opened = null;
    lasting = true;
    version++;
}
