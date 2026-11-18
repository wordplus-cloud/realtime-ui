import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEPT, LIGHT_KEY } from '../src/effects/noise.ts';

// AI Noise Removal's files as the engine reads them (src/effects/noise.ts): DeepFilterNet3's runtime and model, 12 MB,
// kept in a store of the browser's once read, as its HTTP cache let them go within the day (a live site, 2026-11-10),
// and read ahead of the microphone (the engine's warm()).

// The smallest module WebAssembly compiles, and a model that opens as gzip does (the worklet unpacks it itself).
const RUNTIME = new Uint8Array( [ 0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00 ] );
const MODEL = new Uint8Array( [ 0x1f, 0x8b, 0x08, 0x00, 1, 2, 3, 4 ] );
const GTCRN = new Uint8Array( [ 9, 9, 9 ] );

const SITE = 'https://site.example/wp-content/uploads/wordplus/noise/';
const BASE = SITE + 'aaaaaaaaaaaa/';

/** The browser's Cache Storage, as much of it as the engine uses. */
function storage() {
    const kept = new Map<string, Response>();
    const cache = {
        keys: vi.fn( async () => [ ...kept.keys() ].map( ( url ) => ( { url } ) ) ),
        match: vi.fn( async ( url: string ) => kept.get( url )?.clone() ),
        put: vi.fn( async ( url: string, answer: Response ) => {
            const body = await answer.arrayBuffer();
            kept.set( url, new Response( body ) );
        } ),
        delete: vi.fn( async ( request: string | { url: string } ) => kept.delete( typeof request === 'string' ? request : request.url ) ),
    };
    return { kept, cache, caches: { open: vi.fn( async () => cache ) } };
}

let asked: string[] = [];
let served: Record<string, Uint8Array | number> = {};

/** A page of its own: the module read again, with nothing of the page before in it. */
async function page(): Promise<typeof import( '../src/effects/noise.ts' )> {
    vi.resetModules();
    return import( '../src/effects/noise.ts' );
}

const settle = async () => {
    for ( let i = 0; i < 5; i++ ) await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
};

beforeEach( () => {
    asked = [];
    served = { 'deepfilternet/df_bg.wasm': RUNTIME, 'deepfilternet/deepfilternet3.bin': MODEL, 'gtcrn/gtcrn.wasm': GTCRN };
    vi.stubGlobal( 'fetch', vi.fn( async ( url: string ) => {
        asked.push( url );
        const file = Object.keys( served ).find( ( name ) => url.endsWith( name ) );
        const answer = file ? served[ file ] : 404;
        return typeof answer === 'number' ? new Response( 'no', { status: answer } ) : new Response( answer );
    } ) );
    window.localStorage.removeItem( LIGHT_KEY );
} );

afterEach( () => {
    vi.unstubAllGlobals();
} );

describe( "AI Noise Removal's files", () => {
    it( 'are kept by the browser once read, and read from there on the next page, the server asked nothing', async () => {
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );

        const first = new ( await page() ).NoiseFiles( BASE );
        const { module, model } = await first.deepFilterNetFiles();
        expect( module ).toBeInstanceOf( WebAssembly.Module );
        expect( new Uint8Array( model ) ).toEqual( MODEL );
        expect( asked ).toEqual( [ BASE + 'deepfilternet/df_bg.wasm', BASE + 'deepfilternet/deepfilternet3.bin' ] );
        await settle();
        expect( browser.caches.open ).toHaveBeenCalledWith( KEPT );
        expect( [ ...browser.kept.keys() ].sort() ).toEqual( [ BASE + 'deepfilternet/deepfilternet3.bin', BASE + 'deepfilternet/df_bg.wasm' ] );

        // Read once a page: a second processor asks neither the server nor the store again.
        await first.deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );

        asked = [];
        const next = new ( await page() ).NoiseFiles( BASE );
        const again = await next.deepFilterNetFiles();
        expect( asked, 'the next page asked the server for what the browser kept' ).toEqual( [] );
        expect( again.module ).toBeInstanceOf( WebAssembly.Module );
        expect( new Uint8Array( again.model ) ).toEqual( MODEL );
    } );

    it( 'of the pack before, in the folder beside, are let go as this one\'s are asked for, another folder\'s left', async () => {
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );
        const before = SITE + 'bbbbbbbbbbbb/deepfilternet/df_bg.wasm';
        const elsewhere = 'https://site.example/wp-content/uploads/sites/2/wordplus/noise/cccccccccccc/deepfilternet/df_bg.wasm';
        browser.kept.set( before, new Response( RUNTIME ) );
        browser.kept.set( elsewhere, new Response( RUNTIME ) );

        await new ( await page() ).NoiseFiles( BASE ).deepFilterNetFiles();
        await settle();
        expect( browser.kept.has( before ) ).toBe( false );
        expect( browser.kept.has( elsewhere ) ).toBe( true );
        expect( browser.kept.has( BASE + 'deepfilternet/df_bg.wasm' ) ).toBe( true );
    } );

    it( 'are read ahead of the microphone: DeepFilterNet3\'s, or GTCRN\'s alone on a device that could not keep up', async () => {
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );

        const files = new ( await page() ).NoiseFiles( BASE );
        await files.warm();
        expect( asked ).toEqual( [ BASE + 'deepfilternet/df_bg.wasm', BASE + 'deepfilternet/deepfilternet3.bin' ] );
        // The processor that starts after it reads what was read.
        await files.deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );

        asked = [];
        window.localStorage.setItem( LIGHT_KEY, '1' );
        const light = new ( await page() ).NoiseFiles( BASE );
        await light.warm();
        expect( asked ).toEqual( [ BASE + 'gtcrn/gtcrn.wasm' ] );
        await settle();
        // GTCRN's build is small: the browser's own cache holds it.
        expect( browser.kept.has( BASE + 'gtcrn/gtcrn.wasm' ) ).toBe( false );
    } );

    it( 'that the server did not give whole are not kept, and are asked for again', async () => {
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );
        served[ 'deepfilternet/deepfilternet3.bin' ] = 503;

        const files = new ( await page() ).NoiseFiles( BASE );
        await expect( files.deepFilterNetFiles() ).rejects.toThrow( /deepfilternet3\.bin: 503/ );
        await settle();
        expect( browser.kept.has( BASE + 'deepfilternet/deepfilternet3.bin' ) ).toBe( false );

        served[ 'deepfilternet/deepfilternet3.bin' ] = MODEL;
        asked = [];
        await files.deepFilterNetFiles();
        // The runtime from the store, the model from the server.
        expect( asked ).toEqual( [ BASE + 'deepfilternet/deepfilternet3.bin' ] );
    } );

    it( 'are let go once DeepFilterNet3 did not start with them, for the next page to read from the server', async () => {
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );

        const files = new ( await page() ).NoiseFiles( BASE );
        await files.deepFilterNetFiles();
        await settle();
        expect( browser.kept.size ).toBe( 2 );

        await files.forget();
        expect( browser.kept.size ).toBe( 0 );
        asked = [];
        await files.deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );
    } );

    it( 'are read from the server as before where the browser has no store, refuses it, or the files are an app\'s own', async () => {
        // No Cache Storage (a page that is not secure).
        vi.stubGlobal( 'caches', undefined );
        await new ( await page() ).NoiseFiles( BASE ).deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );

        // One that refuses to open (a private window of Firefox).
        asked = [];
        const refused = { open: vi.fn( async () => { throw new DOMException( 'The operation is insecure.', 'SecurityError' ); } ) };
        vi.stubGlobal( 'caches', refused );
        await new ( await page() ).NoiseFiles( BASE ).deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );

        // Files under blob: addresses are not asked of the store at all.
        asked = [];
        const browser = storage();
        vi.stubGlobal( 'caches', browser.caches );
        await new ( await page() ).NoiseFiles( 'blob:https://app.example/pack/' ).deepFilterNetFiles();
        expect( asked.length ).toBe( 2 );
        expect( browser.caches.open ).not.toHaveBeenCalled();
    } );
} );
