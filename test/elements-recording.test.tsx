import { act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// <recording-player> (src/recording-elements.tsx): the player as an element for any page, given a recording as its
// `data` property, its `data` attribute, or the read route's address in `src`.

afterEach( () => {
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
    delete ( globalThis as Record<string, unknown> ).wordplusRealtimeConfig;
} );

const DATA = { id: 9, title: 'Weekly', sources: { mp4: { '720': 'https://cdn.example.com/v.mp4' } }, poster: 'https://cdn.example.com/p.jpg' };

describe( '<recording-player>', () => {
    it( 'is defined by its script, says its name, and draws a recording given as a property in its own shadow root', async () => {
        await import( '../src/recording-elements.tsx' );
        expect( ( globalThis as Record<string, unknown> ).wordplusRecordingPlayerTag ).toBe( 'recording-player' );

        const player = document.createElement( 'recording-player' ) as HTMLElement & { data?: unknown };
        document.body.appendChild( player );
        await act( async () => { player.data = DATA; } );

        const shadow = player.shadowRoot!;
        expect( shadow.querySelector( 'style' )!.textContent ).toContain( 'wplus-recording-player' );
        expect( shadow.querySelector( 'video' )!.getAttribute( 'poster' ) ).toBe( DATA.poster );
    } );

    // A recording's card in Better Messages played only at a second click: the first put this element in the poster's
    // place, which waited for a Play of its own.
    it( 'with autoplay is drawn at once and plays: play() in the click that made it, which Safari asks for, and again once its video is in', async () => {
        await import( '../src/recording-elements.tsx' );
        const played = vi.spyOn( HTMLMediaElement.prototype, 'play' ).mockImplementation( () => Promise.resolve() );
        const player = document.createElement( 'recording-player' ) as HTMLElement & { data?: unknown, play?: () => Promise<void> };
        player.setAttribute( 'autoplay', '' );

        await act( async () => {
            document.body.appendChild( player );
            player.data = DATA;
            // In the same task as the click, before React would draw on its own.
            expect( player.shadowRoot!.querySelector( 'video' ) ).not.toBeNull();
            const before = played.mock.calls.length;
            const asked = player.play!();
            expect( played.mock.calls.length, 'play() did not reach the video in the click' ).toBe( before + 1 );
            await asked;
        } );
        await act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

        expect( played.mock.calls.length, 'not played once its video was in' ).toBeGreaterThan( 1 );
        played.mockRestore();
    } );

    it( 'without autoplay waits for its own Play', async () => {
        await import( '../src/recording-elements.tsx' );
        const played = vi.spyOn( HTMLMediaElement.prototype, 'play' ).mockImplementation( () => Promise.resolve() );
        const player = document.createElement( 'recording-player' ) as HTMLElement & { data?: unknown };
        document.body.appendChild( player );
        await act( async () => { player.data = DATA; } );
        await act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

        expect( played ).not.toHaveBeenCalled();
        played.mockRestore();
    } );

    it( 'fetches the read route in src with the page config\'s nonce and headers', async () => {
        await import( '../src/recording-elements.tsx' );
        ( globalThis as Record<string, unknown> ).wordplusRealtimeConfig = { recording: { nonce: 'n0nce', headers: { 'BM-Guest-ID': '4' } } };
        const asked: Array<{ url: string, headers: Record<string, string> }> = [];
        vi.stubGlobal( 'fetch', vi.fn( async ( url: string, init: { headers: Record<string, string> } ) => {
            asked.push( { url, headers: init.headers } );
            return { ok: true, json: async () => DATA };
        } ) );

        const player = document.createElement( 'recording-player' );
        player.setAttribute( 'src', 'https://site.example.com/wp-json/wordplus/v1/recordings/9' );
        await act( async () => { document.body.appendChild( player ); } );
        await act( async () => {} );

        expect( asked ).toHaveLength( 1 );
        expect( asked[ 0 ].headers[ 'X-WP-Nonce' ] ).toBe( 'n0nce' );
        expect( asked[ 0 ].headers[ 'BM-Guest-ID' ] ).toBe( '4' );
        expect( player.shadowRoot!.querySelector( 'video' ) ).not.toBeNull();
    } );

    // The WordPlus SDK hands the player its words in the 29 languages it translates (player_strings()), through the
    // page's config, as the player carries eight of its own: Ukrainian is not one of them.
    it( 'speaks the host\'s words from the page config over its own, by its keys, and English where none is given', async () => {
        await import( '../src/recording-elements.tsx' );
        ( globalThis as Record<string, unknown> ).wordplusRealtimeConfig = { recording: { strings: {
            'Recording player\u0004Play': 'Відтворити',
            'Recording player\u0004Full screen': 'Повний екран',
        } } };

        const player = document.createElement( 'recording-player' ) as HTMLElement & { data?: unknown };
        player.setAttribute( 'lang', 'uk' );
        document.body.appendChild( player );
        await act( async () => { player.data = DATA; } );

        const labels = [ ...player.shadowRoot!.querySelectorAll( '[aria-label]' ) ].map( ( el ) => el.getAttribute( 'aria-label' ) );
        expect( labels ).toContain( 'Відтворити' );
        expect( labels ).toContain( 'Повний екран' );
        expect( labels, 'a word not given stays English' ).toContain( 'Volume' );
        expect( labels ).not.toContain( 'Play' );
    } );
} );
