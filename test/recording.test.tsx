import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers, type UiConfirm } from '../src/index.ts';
import { CallScreen, RecordingTellPreview, roomModerated, type CallParticipant, type CallRecording } from '../src/calls.ts';
import { RecordingPlayer, asText, attach, clock, highlight, lineAt, matches, mp4For, soundOnly, speakerHue, transcriptLines, type RecordingData, type TranscriptData } from '../src/recording.ts';
import { fakeCall, participant } from './fake-call.ts';
import { FOLD_ORDER, ROW, planRow, rowNeed, type RowNeeds } from '../src/components/recording/controls.ts';
import { BESIDE, IDLE_MS, themeStyle } from '../src/components/recording/player.tsx';
import { SAVING_MS } from '../src/components/calls/recording.tsx';
import Icon from '../src/primitives/icons.tsx';

// The recording: the call screens' Start Recording in Host Controls, its confirm, the REC pill, and the notice or the
// question to everyone else (calls/recording.tsx), and the player with its transcript (components/recording).

const TRANSCRIPT: TranscriptData = {
    speakers: { u7: { name: 'Lesya Ukrainka', language: 'uk' }, u8: { name: 'Daniel' } },
    segments: [
        { speaker: 'u8', start: 4200, end: 6100, text: 'The keyframe comes every minute.' },
        { speaker: 'u7', start: 1000, end: 3900, text: 'Hello everyone, the café is open.' },
        { speaker: 'u8', start: 7000, end: 9000, text: ' ' },
        { speaker: 'u7', start: 9500, end: 12000, text: 'Another keyframe question.' },
    ],
};

const DATA: RecordingData = {
    id: 5,
    title: 'Team 12',
    seconds: 61,
    poster: 'https://cdn.example.com/poster.jpg',
    sources: { hls: 'https://site.example.com/media/master.m3u8', mp4: { '720': 'https://cdn.example.com/v720.mp4', '480': 'https://cdn.example.com/v480.mp4' }, audio: '' },
    captions: 'https://site.example.com/media/captions.vtt',
    download: 'https://cdn.example.com/v720.mp4?download',
};

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ] ] );
    vi.spyOn( HTMLMediaElement.prototype, 'play' ).mockImplementation( function ( this: HTMLMediaElement ) {
        this.dispatchEvent( new Event( 'play' ) );
        return Promise.resolve();
    } );
    vi.spyOn( HTMLMediaElement.prototype, 'pause' ).mockImplementation( function ( this: HTMLMediaElement ) {
        this.dispatchEvent( new Event( 'pause' ) );
    } );
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
} );

describe( 'the transcript', () => {
    const lines = transcriptLines( TRANSCRIPT );

    it( 'is its lines in time order, in seconds, with their speakers named and empty ones left out', () => {
        expect( lines.map( ( l ) => [ l.name, l.start, l.text ] ) ).toEqual( [
            [ 'Lesya Ukrainka', 1, 'Hello everyone, the café is open.' ],
            [ 'Daniel', 4.2, 'The keyframe comes every minute.' ],
            [ 'Lesya Ukrainka', 9.5, 'Another keyframe question.' ],
        ] );
        expect( transcriptLines( null ) ).toEqual( [] );
    } );

    it( 'knows the line being said, and none before the first', () => {
        expect( lineAt( lines, 0.5 ) ).toBe( -1 );
        expect( lineAt( lines, 4.2 ) ).toBe( 1 );
        expect( lineAt( lines, 8 ) ).toBe( 1 );
        expect( lineAt( lines, 600 ) ).toBe( 2 );
    } );

    it( 'finds words without their accents and by the speaker, and marks them', () => {
        expect( matches( lines, 'keyframe' ) ).toEqual( [ 1, 2 ] );
        expect( matches( lines, 'cafe' ) ).toEqual( [ 0 ] );
        expect( matches( lines, 'lesya' ) ).toEqual( [ 0, 2 ] );
        expect( matches( lines, '  ' ) ).toEqual( [] );
        expect( highlight( 'Another Keyframe question.', 'keyframe' ) ).toEqual( [
            { text: 'Another ', found: false }, { text: 'Keyframe', found: true }, { text: ' question.', found: false },
        ] );
    } );

    it( 'gives speakers whose ids are a letter apart colours far apart', () => {
        const hues = [ 'chromium-0', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4' ].map( speakerHue );
        const gaps = hues.flatMap( ( a, i ) => hues.slice( i + 1 ).map( ( b ) => Math.min( Math.abs( a - b ), 360 - Math.abs( a - b ) ) ) );
        expect( Math.min( ...gaps ) ).toBeGreaterThan( 15 );
        expect( speakerHue( 'chromium-0' ) ).toBe( speakerHue( 'chromium-0' ) );
    } );

    it( 'reads as text, a line each, with times as a clock', () => {
        expect( clock( 59.9 ) ).toBe( '0:59' );
        expect( clock( 3903 ) ).toBe( '1:05:03' );
        expect( asText( lines ).split( '\n' )[ 0 ] ).toBe( '[0:01] Lesya Ukrainka: Hello everyone, the café is open.' );
    } );
} );

describe( 'where a recording plays from', () => {
    it( 'takes the size asked for, else 720, else the smallest on a small screen', () => {
        expect( mp4For( DATA, '480', false ) ).toBe( DATA.sources!.mp4![ '480' ] );
        expect( mp4For( DATA, 'auto', false ) ).toBe( DATA.sources!.mp4![ '720' ] );
        expect( mp4For( DATA, 'auto', true ) ).toBe( DATA.sources!.mp4![ '480' ] );
    } );

    it( 'plays HLS where the browser does, else the MP4 where hls.js cannot load, and an audio call as its sound', async () => {
        const video = document.createElement( 'video' );

        vi.spyOn( video, 'canPlayType' ).mockReturnValue( 'maybe' );
        expect( ( await attach( video, DATA, 'auto', '' ) ).mode ).toBe( 'native' );
        expect( video.getAttribute( 'src' ) ).toBe( DATA.sources!.hls );

        vi.spyOn( video, 'canPlayType' ).mockReturnValue( '' );
        expect( ( await attach( video, DATA, 'auto', '' ) ).mode ).toBe( 'mp4' );
        expect( video.getAttribute( 'src' ) ).toBe( DATA.sources!.mp4![ '720' ] );

        expect( ( await attach( video, DATA, '480', '' ) ).mode ).toBe( 'mp4' );
        expect( video.getAttribute( 'src' ) ).toBe( DATA.sources!.mp4![ '480' ] );

        // Where the browser has Media Source, hls.js goes first, even where the browser says it plays HLS itself:
        // Chrome says so, and its own HLS failed on these playlists.
        const loaded: string[] = [];
        class FakeHls {
            static isSupported() { return true; }
            static Events = { ERROR: 'hlsError' };
            static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
            on() {}
            loadSource( url: string ) { loaded.push( url ); }
            attachMedia() {}
            destroy() {}
        }
        vi.stubGlobal( 'MediaSource', class {} );
        vi.stubGlobal( 'Hls', FakeHls );
        const chrome = document.createElement( 'video' );
        vi.spyOn( chrome, 'canPlayType' ).mockReturnValue( 'maybe' );
        expect( ( await attach( chrome, DATA, 'auto', '' ) ).mode ).toBe( 'hls' );
        expect( loaded ).toEqual( [ DATA.sources!.hls ] );
        vi.unstubAllGlobals();

        const audio = document.createElement( 'audio' );
        expect( ( await attach( audio, { audio: true, sources: { audio: 'https://cdn.example.com/a.m4a' } }, 'auto', '' ) ).mode ).toBe( 'audio' );
        expect( audio.getAttribute( 'src' ) ).toBe( 'https://cdn.example.com/a.m4a' );
        expect( ( await attach( audio, { audio: true, sources: {} }, 'auto', '' ) ).mode ).toBe( 'none' );

        // An audio call recorded as a video of its call screen plays its picture, its sound alone a download.
        const call = document.createElement( 'video' );
        vi.spyOn( call, 'canPlayType' ).mockReturnValue( '' );
        const pictured = { audio: true, sources: { mp4: { '720': 'https://cdn.example.com/v720.mp4' }, audio: 'https://cdn.example.com/a.m4a' } };
        expect( soundOnly( pictured ) ).toBe( false );
        expect( ( await attach( call, pictured, 'auto', '' ) ).mode ).toBe( 'mp4' );
        expect( call.getAttribute( 'src' ) ).toBe( 'https://cdn.example.com/v720.mp4' );
        expect( soundOnly( { audio: true, sources: { audio: 'https://cdn.example.com/a.m4a' } } ), 'one made before, sound alone' ).toBe( true );
    } );
} );

describe( 'the player', () => {
    it( 'draws the poster, the captions track and the transcript it fetched, and a line pressed plays from there', async () => {
        const fetched: string[] = [];
        vi.stubGlobal( 'fetch', vi.fn( async ( url: string ) => {
            fetched.push( url );
            return { ok: true, json: async () => TRANSCRIPT };
        } ) );

        const { container } = render( <RecordingPlayer data={ { ...DATA, transcript: 'https://site.example.com/media/transcript.json' } } /> );
        await act( async () => {} );

        const video = container.querySelector( 'video' )!;
        expect( video.getAttribute( 'poster' ) ).toBe( DATA.poster );
        expect( container.querySelector( 'track' )!.getAttribute( 'src' ) ).toBe( DATA.captions );
        expect( fetched ).toEqual( [ 'https://site.example.com/media/transcript.json' ] );

        const rows = container.querySelectorAll( '.wplus-recording-line' );
        expect( rows ).toHaveLength( 3 );
        expect( rows[ 1 ].textContent ).toContain( 'Daniel' );

        await act( async () => { fireEvent.click( rows[ 1 ] ); } );
        expect( video.currentTime ).toBeCloseTo( 4.2 );
        expect( HTMLMediaElement.prototype.play ).toHaveBeenCalled();

        expect( container.querySelector( 'a[download]' )!.getAttribute( 'href' ) ).toBe( DATA.download );
    } );

    it( 'searches the transcript, says how many it found and steps through them', async () => {
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );

        const search = container.querySelector<HTMLInputElement>( '.wplus-recording-transcript-search input' )!;
        await act( async () => { fireEvent.change( search, { target: { value: 'keyframe' } } ); } );

        expect( container.querySelector( '.wplus-recording-transcript-count' )!.textContent ).toBe( '1 of 2' );
        expect( container.querySelectorAll( '[data-found] mark' ) ).toHaveLength( 2 );

        await act( async () => { fireEvent.keyDown( search, { key: 'Enter' } ); } );
        expect( container.querySelector( '.wplus-recording-transcript-count' )!.textContent ).toBe( '2 of 2' );
        expect( container.querySelector( 'video' )!.currentTime ).toBeCloseTo( 9.5 );

        await act( async () => { fireEvent.change( search, { target: { value: 'nobody said this' } } ); } );
        expect( container.querySelector( '.wplus-recording-transcript-count' )!.textContent ).toBe( 'Nothing found' );
    } );

    it( 'plays and pauses with Space and K, seeks with the arrows, and leaves keys typed in the search alone', async () => {
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;
        const video = container.querySelector( 'video' )!;

        await act( async () => { fireEvent.keyDown( player, { key: ' ' } ); } );
        expect( HTMLMediaElement.prototype.play ).toHaveBeenCalledTimes( 1 );
        expect( container.querySelector( '.wplus-recording-controls button' )!.getAttribute( 'aria-label' ) ).toBe( 'Pause' );

        Object.defineProperty( video, 'paused', { configurable: true, get: () => false } );
        await act( async () => { fireEvent.keyDown( player, { key: 'k' } ); } );
        expect( HTMLMediaElement.prototype.pause ).toHaveBeenCalledTimes( 1 );

        video.currentTime = 10;
        await act( async () => { fireEvent.keyDown( player, { key: 'ArrowLeft' } ); } );
        expect( video.currentTime ).toBeCloseTo( 5 );

        const search = container.querySelector<HTMLInputElement>( '.wplus-recording-transcript-search input' )!;
        await act( async () => { fireEvent.keyDown( search, { key: 'k' } ); } );
        expect( HTMLMediaElement.prototype.pause ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'gives way to the MP4 when the browser\'s own HLS cannot play the playlists', async () => {
        vi.spyOn( HTMLMediaElement.prototype, 'canPlayType' ).mockReturnValue( 'maybe' );
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );

        const video = container.querySelector( 'video' )!;
        expect( video.getAttribute( 'src' ) ).toBe( DATA.sources!.hls );
        await act( async () => { fireEvent.error( video ); } );
        await act( async () => {} );

        expect( video.getAttribute( 'src' ) ).toBe( DATA.sources!.mp4![ '720' ] );
        expect( container.querySelector( '.wplus-recording-failed' ), 'it said it cannot play' ).toBeNull();
    } );

    it( 'plays an audio call as its sound: the row alone where the place is narrow, its speaker and title where there is room', async () => {
        const resize = sizeable();
        const data = { title: 'Standup', audio: true, sources: { audio: 'https://cdn.example.com/a.m4a' } } as const;
        const { container } = render( <RecordingPlayer data={ data } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;

        expect( container.querySelector( 'video' ) ).toBeNull();
        expect( container.querySelector( 'audio' )!.getAttribute( 'src' ) ).toBe( 'https://cdn.example.com/a.m4a' );

        await resize( player, 420 );
        expect( container.querySelector( '.wplus-recording-audio-title' ), 'a title in a card' ).toBeNull();
        expect( container.querySelector( '.wplus-recording-stage' )!.hasAttribute( 'data-face' ) ).toBe( false );

        await resize( player, 1200 );
        expect( container.querySelector( '.wplus-recording-audio-title' )!.textContent ).toBe( 'Standup' );
        expect( container.querySelector( '.wplus-recording-transcript' ), 'the transcript beside it' ).not.toBeNull();
    } );

    it( 'plays an audio call recorded as a video of its call screen as any call: its poster, the captions and full screen', async () => {
        const data = { title: 'Standup', audio: true, poster: 'https://cdn.example.com/p.jpg', captions: 'https://cdn.example.com/c.vtt', sources: { mp4: { '720': 'https://cdn.example.com/v720.mp4' }, audio: 'https://cdn.example.com/a.m4a' } };
        const { container } = render( <RecordingPlayer data={ data } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );

        const video = container.querySelector( 'video' );
        expect( video, 'played as sound' ).not.toBeNull();
        expect( container.querySelector( 'audio' ) ).toBeNull();
        expect( video!.getAttribute( 'poster' ) ).toBe( 'https://cdn.example.com/p.jpg' );
        expect( video!.querySelector( 'track[kind="captions"]' )!.getAttribute( 'src' ) ).toBe( 'https://cdn.example.com/c.vtt' );
        expect( container.querySelector( '.wplus-recording-stage' )!.hasAttribute( 'data-audio' ) ).toBe( false );
        expect( container.querySelector( '[aria-label="Full screen"]' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-recording-big-play' ) ).not.toBeNull();
    } );

    it( 'offers sound full screen only where the browser fills the screen with an element, its transcript under the row where it does not', async () => {
        const resize = sizeable();
        const data = { title: 'Standup', audio: true, sources: { audio: 'https://cdn.example.com/a.m4a' } } as const;
        const enabled = Object.getOwnPropertyDescriptor( document, 'fullscreenEnabled' );
        try {
            Object.defineProperty( document, 'fullscreenEnabled', { configurable: true, get: () => false } );
            const without = render( <RecordingPlayer data={ data } transcript={ TRANSCRIPT } /> );
            await act( async () => {} );
            await resize( without.container.querySelector( '.wplus-recording-player' )!, 420 );
            expect( without.container.querySelector( '[aria-label="Full screen"]' ) ).toBeNull();
            expect( without.container.querySelector( '.wplus-recording-transcript' ), 'nowhere else to read it' ).not.toBeNull();
            without.unmount();

            Object.defineProperty( document, 'fullscreenEnabled', { configurable: true, get: () => true } );
            const withIt = render( <RecordingPlayer data={ data } transcript={ TRANSCRIPT } /> );
            await act( async () => {} );
            await resize( withIt.container.querySelector( '.wplus-recording-player' )!, 420 );
            expect( withIt.container.querySelector( '[aria-label="Full screen"]' ) ).not.toBeNull();
            expect( withIt.container.querySelector( '.wplus-recording-transcript' ), 'in full screen alone' ).toBeNull();
        } finally {
            if ( enabled ) Object.defineProperty( document, 'fullscreenEnabled', enabled );
            else delete ( document as unknown as { fullscreenEnabled?: unknown } ).fullscreenEnabled;
        }
    } );
} );

// The player's sizes as a ResizeObserver reports them, which happy-dom has none of: each observed element answers the
// width a test gives it.
function sizeable() {
    const watched: Array<{ callback: ResizeObserverCallback; targets: Element[] }> = [];
    vi.stubGlobal( 'ResizeObserver', class {
        private entry: { callback: ResizeObserverCallback; targets: Element[] };
        constructor( callback: ResizeObserverCallback ) {
            this.entry = { callback, targets: [] };
            watched.push( this.entry );
        }
        observe( target: Element ) {
            this.entry.targets.push( target );
        }
        disconnect() {
            this.entry.targets = [];
        }
    } );

    return async ( target: Element, width: number ) => {
        await act( async () => {
            for ( const entry of watched ) {
                if ( entry.targets.includes( target ) ) entry.callback( [ { target, contentRect: { width } } as unknown as ResizeObserverEntry ], {} as ResizeObserver );
            }
        } );
    };
}

const ROW_NEEDS: RowNeeds = { width: 0, touch: false, duration: '45:03', speed: true, quality: true, captions: true, pip: true, download: true, full: true, slider: true };

describe( 'the control row', () => {
    it( 'folds speed, then quality, picture in picture and captions as it narrows, then shortens the time, then folds download', () => {
        const seen: string[] = [];
        for ( let width = 1400; width >= 240; width -= 2 ) {
            const plan = planRow( { ...ROW_NEEDS, width } );
            const step = plan.folded.join( ',' ) + ( plan.time !== 'long' ? ' ' + plan.time : '' );
            if ( seen[ seen.length - 1 ] !== step ) seen.push( step );
        }

        expect( seen ).toEqual( [
            '',
            'speed',
            'speed,quality',
            'speed,quality,pip',
            'speed,quality,pip,captions',
            'speed,quality,pip,captions short',
            'speed,quality,pip,captions,download short',
            'speed,quality,pip,captions,download none',
        ] );
        expect( FOLD_ORDER ).toEqual( [ 'speed', 'quality', 'pip', 'captions' ] );
    } );

    it( 'fits its row at every width from 260 to 1400, on a computer and with a finger\'s 44px targets, the seek bar 96px down to 400px', () => {
        for ( const touch of [ false, true ] ) {
            for ( let width = 260; width <= 1400; width++ ) {
                const needs = { ...ROW_NEEDS, touch, slider: ! touch, width };
                const plan = planRow( needs );
                expect( rowNeed( needs, plan.folded, plan.time, plan.seek ), `${ touch ? 'touch' : 'computer' } at ${ width }px` ).toBeLessThanOrEqual( width );
                expect( plan.seek, `${ touch ? 'touch' : 'computer' } at ${ width }px` ).toBeGreaterThanOrEqual( width >= 400 ? ROW.seek : ROW.leastSeek );
            }
        }
    } );

    it( 'keeps everything at 1200 and 980, folds on a phone, and keeps download and the time in the row of a 375px phone', () => {
        expect( planRow( { ...ROW_NEEDS, width: 1200 } ) ).toEqual( { folded: [], time: 'long', seek: ROW.seek, sliderInline: true } );
        expect( planRow( { ...ROW_NEEDS, width: 640 } ).folded ).toEqual( [] );
        expect( planRow( { ...ROW_NEEDS, width: 375, touch: true, slider: false } ) ).toEqual( { folded: [ 'speed', 'quality', 'pip', 'captions' ], time: 'short', seek: ROW.seek, sliderInline: false } );
        expect( planRow( { ...ROW_NEEDS, width: 360, touch: true, slider: false } ).folded ).toContain( 'download' );
        // Not measured yet: everything, as before a ResizeObserver answers.
        expect( planRow( ROW_NEEDS ).folded ).toEqual( [] );
    } );

    it( 'shows the folded controls in its settings, which set them and close on Escape or a press elsewhere', async () => {
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );
        const stage = container.querySelector( '.wplus-recording-stage' )!;
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;

        await resize( stage, 1000 );
        expect( container.querySelector( '[aria-label="Settings"]' ), 'a wide row has no settings button' ).toBeNull();
        expect( container.querySelector( '.wplus-recording-speed' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-recording-quality' ) ).not.toBeNull();

        await resize( stage, 420 );
        expect( container.querySelector( '.wplus-recording-speed' ) ).toBeNull();
        expect( container.querySelector( '.wplus-recording-quality' ) ).toBeNull();
        const settings = container.querySelector<HTMLButtonElement>( '[aria-label="Settings"]' )!;
        expect( settings.getAttribute( 'aria-expanded' ) ).toBe( 'false' );

        await act( async () => { fireEvent.click( settings ); } );
        const menu = container.querySelector( '.wplus-recording-menu' )!;
        expect( [ ...menu.querySelectorAll( '.wplus-recording-menu-label' ) ].map( ( l ) => l.textContent ) ).toEqual( [ 'Playback speed', 'Quality' ] );
        expect( [ ...menu.querySelectorAll( '.wplus-recording-menu-choices' )[ 0 ].querySelectorAll( 'button' ) ].map( ( b ) => b.textContent ) ).toEqual( [ '0.75×', '1×', '1.25×', '1.5×', '2×' ] );

        await act( async () => { fireEvent.click( [ ...menu.querySelectorAll( 'button' ) ].find( ( b ) => b.textContent === '1.5×' )! ); } );
        expect( container.querySelector( 'video' )!.playbackRate ).toBe( 1.5 );
        expect( container.querySelector( '.wplus-recording-menu [aria-pressed="true"]' )!.textContent ).toBe( '1.5×' );

        await act( async () => { fireEvent.keyDown( player, { key: 'Escape' } ); } );
        expect( container.querySelector( '.wplus-recording-menu' ) ).toBeNull();

        await act( async () => { fireEvent.click( settings ); } );
        await act( async () => { fireEvent.pointerDown( container.querySelector( '.wplus-recording-seek' )! ); } );
        expect( container.querySelector( '.wplus-recording-menu' ) ).toBeNull();

        // Narrower still: captions and picture in picture there too, and the time shortened to where it is.
        await resize( stage, 300 );
        await act( async () => { fireEvent.click( container.querySelector( '[aria-label="Settings"]' )! ); } );
        expect( container.querySelector( '.wplus-recording-controls [aria-label="Captions"]' ) ).toBeNull();
        expect( container.querySelector( '.wplus-recording-menu' )!.textContent ).toContain( 'Captions' );
        expect( container.querySelector( '.wplus-recording-time' )!.textContent ).toBe( '0:00' );
    } );

    it( 'puts the transcript beside the picture from 880px of its own width, below that only in full screen, with no tabs', async () => {
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;

        for ( const [ width, beside ] of [ [ 1200, true ], [ 980, true ], [ BESIDE, true ], [ BESIDE - 1, false ], [ 700, false ], [ 375, false ] ] as const ) {
            await resize( player, width );
            expect( player.hasAttribute( 'data-wide' ), `${ width }px` ).toBe( beside );
            expect( [ ...player.children ].map( ( c ) => c.className ), `${ width }px` ).toEqual( beside ? [ 'wplus-recording-stage', 'wplus-recording-transcript' ] : [ 'wplus-recording-stage' ] );
            expect( container.querySelector( '[role="tablist"]' ), 'tabs' ).toBeNull();
        }

        // In full screen it is there, under the picture of a narrow screen, and a line plays from where it was said.
        Object.defineProperty( document, 'fullscreenElement', { configurable: true, get: () => player } );
        try {
            await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
            expect( [ ...player.children ].map( ( c ) => c.className ) ).toEqual( [ 'wplus-recording-stage', 'wplus-recording-transcript' ] );
            await act( async () => { fireEvent.click( container.querySelectorAll( '.wplus-recording-line' )[ 1 ] ); } );
            expect( container.querySelector( 'video' )!.currentTime ).toBeCloseTo( 4.2 );
        } finally {
            delete ( document as unknown as { fullscreenElement?: unknown } ).fullscreenElement;
        }
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( container.querySelector( '.wplus-recording-transcript' ), 'gone again out of full screen' ).toBeNull();
    } );

    it( 'never draws the transcript for a frame in a place too narrow for it', async () => {
        const width = Object.getOwnPropertyDescriptor( HTMLElement.prototype, 'getBoundingClientRect' );
        HTMLElement.prototype.getBoundingClientRect = function () {
            return { width: this.classList.contains( 'wplus-recording-player' ) ? 420 : 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ( {} ) } as DOMRect;
        };
        try {
            const seen: boolean[] = [];
            const Watch = () => {
                React.useLayoutEffect( () => {
                    seen.push( !! document.querySelector( '.wplus-recording-transcript' ) );
                } );
                return null;
            };
            render( <><RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /><Watch /></> );
            await act( async () => {} );
            expect( document.querySelector( '.wplus-recording-transcript' ) ).toBeNull();
            expect( seen.slice( 1 ), 'once measured, before a paint' ).not.toContain( true );
        } finally {
            if ( width ) Object.defineProperty( HTMLElement.prototype, 'getBoundingClientRect', width );
        }
    } );

    it( 'opens the settings under the picture on a touch screen, with 44px targets in the row', async () => {
        vi.stubGlobal( 'matchMedia', ( query: string ) => ( { matches: query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} } ) );
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ TRANSCRIPT } /> );
        await act( async () => {} );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;

        await resize( player, 375 );
        await resize( container.querySelector( '.wplus-recording-stage' )!, 375 );
        expect( player.dataset.touch ).toBe( '1' );
        await act( async () => { fireEvent.click( container.querySelector( '[aria-label="Settings"]' )! ); } );

        expect( [ ...player.children ].map( ( c ) => c.className ) ).toEqual( [ 'wplus-recording-stage', 'wplus-recording-menu' ] );
        expect( player.querySelector( '.wplus-recording-menu' )!.hasAttribute( 'data-below' ) ).toBe( true );
        expect( container.querySelector( '.wplus-recording-controls [aria-label="Download"]' ), 'download stays in a 375px row' ).not.toBeNull();
    } );

    it( 'gives the picture the whole width when there is no transcript', async () => {
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } transcript={ null } /> );
        await act( async () => {} );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;

        await resize( player, 1200 );
        expect( player.hasAttribute( 'data-wide' ) ).toBe( false );
        expect( container.querySelector( '.wplus-recording-transcript' ) ).toBeNull();
    } );
} );

describe( 'the quality', () => {
    const options = ( container: HTMLElement ) => [ ...container.querySelectorAll<HTMLOptionElement>( '.wplus-recording-quality option' ) ].map( ( o ) => o.textContent );
    const chosen = ( container: HTMLElement ) => container.querySelector<HTMLSelectElement>( '.wplus-recording-quality' )!.value;

    // hls.js as the light build gives it: its levels lowest first, MANIFEST_PARSED once it read them, an error to fall
    // back on.
    function fakeHls() {
        const made: Array<{ levels: Array<{ height: number }>; currentLevel: number; handlers: Record<string, ( event: string, data: { fatal?: boolean } ) => void>; loaded: string[] }> = [];
        class FakeHls {
            static isSupported() { return true; }
            static Events = { ERROR: 'hlsError', MANIFEST_PARSED: 'hlsManifestParsed' };
            static ErrorTypes = { NETWORK_ERROR: 'networkError', MEDIA_ERROR: 'mediaError' };
            levels = [ { height: 480 }, { height: 720 }, { height: 720 }, { height: 1080 } ];
            currentLevel = -1;
            handlers: Record<string, ( event: string, data: { fatal?: boolean } ) => void> = {};
            loaded: string[] = [];
            constructor() { made.push( this ); }
            on( event: string, handler: ( event: string, data: { fatal?: boolean } ) => void ) { this.handlers[ event ] = handler; }
            loadSource( url: string ) { this.loaded.push( url ); }
            attachMedia() {}
            destroy() {}
        }
        vi.stubGlobal( 'MediaSource', class {} );
        vi.stubGlobal( 'Hls', FakeHls );
        return made;
    }

    it( 'offers Auto first and marks it where hls.js plays, and picks its levels without reloading', async () => {
        const made = fakeHls();
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        await act( async () => { made[ 0 ].handlers.hlsManifestParsed( 'hlsManifestParsed', {} ); } );

        expect( options( container ) ).toEqual( [ 'Auto', '1080p', '720p', '480p' ] );
        expect( chosen( container ), 'Auto is the default' ).toBe( 'auto' );

        await act( async () => { fireEvent.change( container.querySelector( '.wplus-recording-quality' )!, { target: { value: '720' } } ); } );
        expect( made[ 0 ].currentLevel, 'the higher of the two 720p levels' ).toBe( 2 );
        expect( chosen( container ) ).toBe( '720' );
        expect( made, 'no second hls.js: the picture was not loaded again' ).toHaveLength( 1 );

        await act( async () => { fireEvent.change( container.querySelector( '.wplus-recording-quality' )!, { target: { value: 'auto' } } ); } );
        expect( made[ 0 ].currentLevel ).toBe( -1 );
    } );

    it( 'marks the choice that plays in the settings, as speed does', async () => {
        const made = fakeHls();
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        await act( async () => { made[ 0 ].handlers.hlsManifestParsed( 'hlsManifestParsed', {} ); } );
        await resize( container.querySelector( '.wplus-recording-stage' )!, 420 );
        await act( async () => { fireEvent.click( container.querySelector( '[aria-label="Settings"]' )! ); } );

        const row = [ ...container.querySelectorAll( '.wplus-recording-menu-row' ) ].find( ( r ) => r.textContent!.startsWith( 'Quality' ) )!;
        expect( [ ...row.querySelectorAll( 'button' ) ].map( ( b ) => b.textContent ) ).toEqual( [ 'Auto', '1080p', '720p', '480p' ] );
        expect( row.querySelector( '[aria-pressed="true"]' )!.textContent ).toBe( 'Auto' );
        await act( async () => { fireEvent.click( [ ...row.querySelectorAll( 'button' ) ].find( ( b ) => b.textContent === '1080p' )! ); } );
        expect( row.querySelector( '[aria-pressed="true"]' )!.textContent ).toBe( '1080p' );
        expect( made[ 0 ].currentLevel ).toBe( 3 );
    } );

    it( 'offers the MP4s\' heights alone, the one that plays marked, where there is no HLS or it fell back', async () => {
        const { container } = render( <RecordingPlayer data={ { ...DATA, sources: { ...DATA.sources!, hls: '' } } } /> );
        await act( async () => {} );
        expect( options( container ) ).toEqual( [ '720p', '480p' ] );
        expect( chosen( container ), 'the 720p that plays' ).toBe( '720' );
        cleanup();

        const made = fakeHls();
        const second = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        await act( async () => { made[ 0 ].handlers.hlsError( 'hlsError', { fatal: true } ); } );
        expect( options( second.container ) ).toEqual( [ '720p', '480p' ] );
        expect( chosen( second.container ) ).toBe( '720' );
        expect( second.container.querySelector( 'video' )!.getAttribute( 'src' ) ).toBe( DATA.sources!.mp4![ '720' ] );
    } );

    it( 'offers Auto and the MP4s\' heights where the browser plays HLS itself, which picks its own level', async () => {
        vi.spyOn( HTMLMediaElement.prototype, 'canPlayType' ).mockReturnValue( 'maybe' );
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        expect( container.querySelector( 'video' )!.getAttribute( 'src' ) ).toBe( DATA.sources!.hls );
        expect( options( container ) ).toEqual( [ 'Auto', '720p', '480p' ] );
        expect( chosen( container ) ).toBe( 'auto' );
    } );
} );

describe( 'the row, full screen, the captions and the controls going away', () => {
    const controls = ( container: HTMLElement ) => [ ...container.querySelector( '.wplus-recording-controls' )!.children ]
        .map( ( c ) => c.getAttribute( 'aria-label' ) || c.querySelector( 'button' )?.getAttribute( 'aria-label' ) || c.className.replace( /wplus-recording-/g, '' ) );

    it( 'puts the sound right after play, before the time and the seek bar', async () => {
        const resize = sizeable();
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        await resize( container.querySelector( '.wplus-recording-stage' )!, 1200 );
        expect( controls( container ).slice( 0, 4 ) ).toEqual( [ 'Play', 'Mute', 'time', 'Seek' ] );
        expect( controls( container ).pop() ).toBe( 'Full screen' );
    } );

    it( 'turns Full screen into Exit full screen while it fills the screen', async () => {
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        const player = container.querySelector( '.wplus-recording-player' )!;
        Object.defineProperty( document, 'fullscreenElement', { configurable: true, get: () => player } );
        try {
            await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
            const exit = container.querySelector( '[aria-label="Exit full screen"]' )!;
            expect( exit.getAttribute( 'title' ) ).toBe( 'Exit full screen' );
            expect( exit.querySelector( 'path' )!.getAttribute( 'd' ), 'the glyph that goes back' ).toMatch( /^M4 14h6v6/ );
            expect( container.querySelector( '[aria-label="Full screen"]' ) ).toBeNull();
        } finally {
            delete ( document as unknown as { fullscreenElement?: unknown } ).fullscreenElement;
        }
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( container.querySelector( '[aria-label="Full screen"]' ) ).not.toBeNull();
    } );

    it( 'gives the transcript in full screen the host dark scheme, and nothing that is not a colour', () => {
        const theme = { surface: 'rgb(17, 25, 47)', text: '#f1f5f9', accent: 'red; background: url(x)', border: 'rgba(51, 65, 95, 1)', current: 'expression(alert(1))' };
        expect( themeStyle( theme ) ).toEqual( {
            '--wplus-recording-dark-surface': 'rgb(17, 25, 47)',
            '--wplus-recording-dark-text': '#f1f5f9',
            '--wplus-recording-dark-border': 'rgba(51, 65, 95, 1)',
        } );
        const { container } = render( <RecordingPlayer data={ { ...DATA, theme } } /> );
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;
        expect( player.style.getPropertyValue( '--wplus-recording-dark-surface' ) ).toBe( 'rgb(17, 25, 47)' );
        expect( player.style.getPropertyValue( '--wplus-recording-dark-accent' ) ).toBe( '' );
    } );

    it( 'puts the controls away while it plays and nothing moves, and brings them back with a key or a pause', async () => {
        vi.useFakeTimers();
        try {
            const { container } = render( <RecordingPlayer data={ DATA } /> );
            await act( async () => {} );
            const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;
            const video = container.querySelector( 'video' )!;
            let paused = true;
            Object.defineProperty( video, 'paused', { configurable: true, get: () => paused } );

            // Paused, they stay.
            await act( async () => { vi.advanceTimersByTime( IDLE_MS * 2 ); } );
            expect( player.hasAttribute( 'data-idle' ) ).toBe( false );

            paused = false;
            await act( async () => { video.dispatchEvent( new Event( 'play' ) ); } );
            await act( async () => { vi.advanceTimersByTime( IDLE_MS - 100 ); } );
            expect( player.hasAttribute( 'data-idle' ), 'gone before IDLE_MS' ).toBe( false );
            await act( async () => { vi.advanceTimersByTime( 200 ); } );
            expect( player.hasAttribute( 'data-idle' ), 'still there after IDLE_MS' ).toBe( true );

            await act( async () => { fireEvent.keyDown( player, { key: 'Shift' } ); } );
            expect( player.hasAttribute( 'data-idle' ), 'a key did not bring them back' ).toBe( false );
            await act( async () => { vi.advanceTimersByTime( IDLE_MS + 100 ); } );
            expect( player.hasAttribute( 'data-idle' ) ).toBe( true );

            paused = true;
            await act( async () => { video.dispatchEvent( new Event( 'pause' ) ); } );
            expect( player.hasAttribute( 'data-idle' ), 'paused, they stayed away' ).toBe( false );
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'draws the captions itself from the start, above the row, the browser drawing none, until they are turned off', async () => {
        const listeners: Record<string, () => void> = {};
        const cue = { getCueAsHTML: () => {
            const words = document.createDocumentFragment();
            words.append( 'So, the recording runs now.\nCan everyone hear me?' );
            return words;
        } };
        const track = {
            mode: 'disabled' as TextTrackMode,
            activeCues: null as unknown,
            addEventListener: ( type: string, listener: () => void ) => { listeners[ type ] = listener; },
            removeEventListener: () => undefined,
        };
        const tracks = Object.getOwnPropertyDescriptor( HTMLMediaElement.prototype, 'textTracks' );
        Object.defineProperty( HTMLMediaElement.prototype, 'textTracks', { configurable: true, get: () => [ track ] } );
        try {
            const { container } = render( <RecordingPlayer data={ DATA } /> );
            await act( async () => {} );
            expect( track.mode, 'on from the start, the browser drawing none' ).toBe( 'hidden' );
            expect( container.querySelector( '[aria-label="Captions"]' )!.getAttribute( 'aria-pressed' ) ).toBe( 'true' );
            track.activeCues = [ cue ];
            await act( async () => { listeners.cuechange(); } );
            const caption = container.querySelector( '.wplus-recording-caption' )!;
            expect( [ ...caption.querySelectorAll( 'span' ) ].map( ( s ) => s.textContent ) ).toEqual( [ 'So, the recording runs now.', 'Can everyone hear me?' ] );
            expect( caption.parentElement!.classList.contains( 'wplus-recording-stage' ) ).toBe( true );

            await act( async () => { fireEvent.click( container.querySelector( '[aria-label="Captions"]' )! ); } );
            expect( track.mode ).toBe( 'disabled' );
            expect( container.querySelector( '.wplus-recording-caption' ) ).toBeNull();

            await act( async () => { fireEvent.click( container.querySelector( '[aria-label="Captions"]' )! ); } );
            expect( track.mode, 'on again' ).toBe( 'hidden' );
        } finally {
            if ( tracks ) Object.defineProperty( HTMLMediaElement.prototype, 'textTracks', tracks );
            else delete ( HTMLMediaElement.prototype as unknown as { textTracks?: unknown } ).textTracks;
        }
    } );
} );

describe( 'the sound', () => {
    beforeEach( () => {
        localStorage.clear();
    } );

    const speaker = ( container: HTMLElement ) => container.querySelector<HTMLButtonElement>( '.wplus-recording-volume > button' )!;
    const slider = ( container: HTMLElement ) => container.querySelector<HTMLInputElement>( '.wplus-recording-volume-slider input' );

    it( 'sets the volume with a slider beside the speaker, its glyph following the level, and mutes back to the last level', async () => {
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        const video = container.querySelector( 'video' )!;

        expect( slider( container ), 'no slider' ).not.toBeNull();
        expect( speaker( container ).dataset.glyph ).toBe( 'speaker' );

        await act( async () => { fireEvent.change( slider( container )!, { target: { value: '0.3' } } ); } );
        expect( video.volume ).toBeCloseTo( 0.3 );
        expect( speaker( container ).dataset.glyph ).toBe( 'speakerLow' );
        expect( slider( container )!.getAttribute( 'aria-valuetext' ) ).toBe( '30%' );

        await act( async () => { fireEvent.click( speaker( container ) ); } );
        expect( video.muted ).toBe( true );
        expect( speaker( container ).getAttribute( 'aria-label' ) ).toBe( 'Unmute' );
        expect( speaker( container ).dataset.glyph ).toBe( 'speakerOff' );

        await act( async () => { fireEvent.click( speaker( container ) ); } );
        expect( video.muted ).toBe( false );
        expect( video.volume ).toBeCloseTo( 0.3 );

        // Slid to nothing, the speaker brings the last level back.
        await act( async () => { fireEvent.change( slider( container )!, { target: { value: '0' } } ); } );
        expect( speaker( container ).dataset.glyph ).toBe( 'speakerOff' );
        await act( async () => { fireEvent.click( speaker( container ) ); } );
        expect( video.muted ).toBe( false );
        expect( video.volume ).toBeCloseTo( 0.3 );

        await act( async () => { fireEvent.change( slider( container )!, { target: { value: '0.8' } } ); } );
        expect( speaker( container ).dataset.glyph ).toBe( 'speaker' );
    } );

    it( 'opens the slider on hover and focus, and takes Up, Down and M on the player', async () => {
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        const group = container.querySelector<HTMLElement>( '.wplus-recording-volume' )!;
        const player = container.querySelector<HTMLElement>( '.wplus-recording-player' )!;
        const video = container.querySelector( 'video' )!;

        expect( group.hasAttribute( 'data-open' ) ).toBe( false );
        await act( async () => { fireEvent.mouseEnter( group ); } );
        expect( group.hasAttribute( 'data-open' ) ).toBe( true );
        await act( async () => { fireEvent.mouseLeave( group ); } );
        expect( group.hasAttribute( 'data-open' ) ).toBe( false );
        await act( async () => { fireEvent.focus( speaker( container ) ); } );
        expect( group.hasAttribute( 'data-open' ) ).toBe( true );

        await act( async () => { fireEvent.change( slider( container )!, { target: { value: '0.5' } } ); } );
        await act( async () => { fireEvent.keyDown( player, { key: 'ArrowDown' } ); } );
        expect( video.volume ).toBeCloseTo( 0.45 );
        await act( async () => { fireEvent.keyDown( player, { key: 'ArrowUp' } ); } );
        await act( async () => { fireEvent.keyDown( player, { key: 'ArrowUp' } ); } );
        expect( video.volume ).toBeCloseTo( 0.55 );
        await act( async () => { fireEvent.keyDown( player, { key: 'm' } ); } );
        expect( video.muted ).toBe( true );
        await act( async () => { fireEvent.keyDown( player, { key: 'm' } ); } );
        expect( video.muted ).toBe( false );
    } );

    it( 'keeps the level for the next recording in this browser', async () => {
        const first = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        await act( async () => { fireEvent.change( slider( first.container )!, { target: { value: '0.4' } } ); } );
        first.unmount();

        const { container } = render( <RecordingPlayer data={ { ...DATA, id: 6 } } /> );
        await act( async () => {} );
        expect( container.querySelector( 'video' )!.volume ).toBeCloseTo( 0.4 );
        expect( slider( container )!.value ).toBe( '0.4' );
    } );

    it( 'offers only mute where the page cannot set the volume, as on an iPhone, and on a touch screen', async () => {
        const volume = Object.getOwnPropertyDescriptor( HTMLMediaElement.prototype, 'volume' )!;
        Object.defineProperty( HTMLMediaElement.prototype, 'volume', { configurable: true, get: () => 1, set: () => undefined } );
        try {
            const { container } = render( <RecordingPlayer data={ DATA } /> );
            await act( async () => {} );
            expect( slider( container ), 'a slider that does nothing' ).toBeNull();
            await act( async () => { fireEvent.click( speaker( container ) ); } );
            expect( container.querySelector( 'video' )!.muted ).toBe( true );
        } finally {
            Object.defineProperty( HTMLMediaElement.prototype, 'volume', volume );
        }
        cleanup();

        vi.stubGlobal( 'matchMedia', ( query: string ) => ( { matches: query === '(pointer: coarse)', media: query, addEventListener() {}, removeEventListener() {} } ) );
        const { container } = render( <RecordingPlayer data={ DATA } /> );
        await act( async () => {} );
        expect( slider( container ) ).toBeNull();
        expect( container.querySelector( '.wplus-recording-player' )!.hasAttribute( 'data-touch' ) ).toBe( true );
    } );
} );

describe( 'recording in a group call', () => {
    const people = () => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me', { name: 'Ben' } ) ],
        [ 'user_34', participant( 'user_34', { name: 'Ann' } ) ],
    ] );

    const SETTINGS = { size: 1080, layout: 'speaker', transcript: true, language: 'auto', watch: 'people' as const, keepDays: 30 };

    const recording = ( over: Partial<CallRecording> = {} ): CallRecording & { started: number, stopped: number } => {
        const r = {
            state: 'off' as CallRecording['state'], can: true, tell: 'notice' as CallRecording['tell'], settings: SETTINGS, started: 0, stopped: 0,
            start: async () => { r.started++; },
            stop: async () => { r.stopped++; },
            ...over,
        };
        return r;
    };

    beforeEach( () => window.sessionStorage.clear() );

    const dialog = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-dialog' );
    const pill = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-rec-pill' );
    const notice = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-recording-notice' );
    const now = () => Math.floor( Date.now() / 1000 );

    const screen = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'group-video' | 'group-audio' = 'group-video' ) => {
        const call = fakeCall( { participants: people(), ...over } );
        const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
            <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
        const rendered = render( draw() );
        return { ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
    };

    it( 'lists the picture of an audio call in its own layout, as it is a video of its call screen too, and none where the site sends no audio layout', async () => {
        const asked = async ( settings: typeof SETTINGS & { audioLayout?: string } ) => {
            const { container, unmount } = screen( { adminMode: true, moderation: [], recording: recording( { settings } ) }, 'group-audio' );
            await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
            await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-record' )! ); } );
            const facts = Array.from( dialog( container )!.querySelectorAll( 'dt, dd' ) ).map( ( el ) => el.textContent );
            unmount();
            return facts.slice( 0, 2 );
        };

        expect( await asked( { ...SETTINGS, audioLayout: 'call' } ) ).toEqual( [ 'Picture', '1080p, As in the call' ] );
        expect( await asked( { ...SETTINGS, size: 720, audioLayout: 'gallery' } ) ).toEqual( [ 'Picture', '720p, Gallery layout' ] );
        expect( await asked( SETTINGS ), 'a site from before' ).toEqual( [ 'Transcript', 'Automatic' ] );
    } );

    it( 'shows an admin what someone in the call sees for each way of telling, with the call\'s own pieces, still and out of reach', () => {
        const seen = ( tell: CallRecording['tell'] & string ) => {
            const { container, unmount } = render( <RecordingTellPreview tell={ tell } by="Ann Host" settings={ { ...SETTINGS, watch: 'everyone' } } people={ [ 'Ann Host', 'Ben Guest' ] } /> );
            const root = container.querySelector<HTMLElement>( '.wplus-call-recording-preview' )!;
            const out = {
                inert: root.hasAttribute( 'inert' ) && root.getAttribute( 'aria-hidden' ) === 'true',
                wrap: root.classList.contains( 'wplus-call-wrap' ) && root.classList.contains( 'wplus-call-surface' ),
                people: [ ...root.querySelectorAll( '.wplus-call-recording-preview-face' ) ].map( ( face ) => face.textContent ),
                pill: pill( container )?.textContent ?? null,
                stop: !! container.querySelector( '.wplus-call-rec-stop' ),
                notice: notice( container )?.querySelector( '.wplus-call-join-prompt-title' )?.textContent ?? null,
                dialog: dialog( container ) ? [ ...dialog( container )!.querySelectorAll( '.wplus-call-dialog-button' ) ].map( ( b ) => b.textContent ) : null,
            };
            unmount();
            return out;
        };

        const notice_ = seen( 'notice' );
        expect( notice_ ).toMatchObject( { inert: true, wrap: true, people: [ 'AH', 'BG' ], stop: false, notice: 'Ann Host started recording this call', dialog: null } );
        expect( notice_.pill ).toMatch( /REC.*1:0[56]/ );
        expect( seen( 'ask' ) ).toMatchObject( { notice: null, dialog: [ 'Leave Call', 'Stay in Call' ] } );
        expect( seen( 'muted' ) ).toMatchObject( { notice: null, dialog: [ 'Leave Call', 'I Agree' ] } );
        expect( seen( 'moderators' ), 'nothing for anyone else' ).toMatchObject( { pill: null, notice: null, dialog: null } );
        const indicator = seen( 'indicator' );
        expect( indicator, 'REC alone' ).toMatchObject( { notice: null, dialog: null, stop: false } );
        expect( indicator.pill ).toMatch( /REC.*1:0[56]/ );
    } );

    it( 'tells everyone else with REC alone where the admin chose it, no notice and no question, and says so in the confirm', async () => {
        const member = screen( { adminMode: false, recording: recording( { can: false, id: 30, by: 'Ann', tell: 'indicator', state: 'on', since: now() } ) } ).container;
        expect( pill( member )!.textContent ).toContain( 'REC' );
        expect( notice( member ) ).toBeNull();
        expect( dialog( member ) ).toBeNull();
        cleanup();

        const { container } = screen( { adminMode: true, moderation: [], recording: recording( { tell: 'indicator' } ) } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        expect( container.querySelector( '.wplus-room-record' )!.textContent ).toContain( 'Everyone in the call then sees REC beside the call controls.' );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-record' )! ); } );
        expect( dialog( container )!.textContent ).toContain( 'Everyone in the call sees REC beside the call controls while it records, with no notice.' );
    } );

    it( 'says nothing of who watches where only the site keeps it, that it is recorded saying enough', () => {
        const kept = recording( { can: false, id: 31, by: 'Ann', state: 'on', since: now(), settings: { ...SETTINGS, watch: 'admins', transcript: false } } );
        const text = notice( screen( { adminMode: false, recording: kept } ).container )!.textContent!;
        expect( text ).toContain( 'This call is being recorded' );
        expect( text ).not.toContain( 'administrators' );
        expect( text ).not.toContain( 'watch' );
    } );

    it( 'puts the notice away for good with Do Not Show Again where the app keeps the choice, REC alone telling from then on, and asks the question whatever the choice', async () => {
        let kept = 0;
        const keep = { shown: true, dontShowAgain: () => { kept++; } };
        const told = recording( { can: false, id: 32, by: 'Ann', state: 'on', since: now(), notice: keep } );
        const { container } = screen( { adminMode: false, recording: told } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-recording-never' )! ); } );
        expect( kept ).toBe( 1 );
        expect( notice( container ) ).toBeNull();
        expect( pill( container ) ).not.toBeNull();
        cleanup();

        // Said before: REC alone, for this recording and the next.
        const next = screen( { adminMode: false, recording: { ...told, id: 33, notice: { ...keep, shown: false } } } ).container;
        expect( notice( next ) ).toBeNull();
        expect( pill( next ) ).not.toBeNull();
        cleanup();
        expect( dialog( screen( { adminMode: false, recording: { ...told, id: 34, tell: 'ask', notice: { ...keep, shown: false } } } ).container ), 'consent is asked' ).not.toBeNull();
        cleanup();

        // A host that keeps no choice: Got It alone.
        const plain = screen( { adminMode: false, recording: { ...told, id: 35, notice: undefined } } ).container;
        expect( plain.querySelector( '.wplus-call-recording-got-it' ) ).not.toBeNull();
        expect( plain.querySelector( '.wplus-call-recording-never' ) ).toBeNull();
    } );

    it( 'offers Host Controls to a moderator whose only act is recording', () => {
        expect( roomModerated( [], undefined ) ).toBe( false );
        expect( roomModerated( [], recording() ) ).toBe( true );
        expect( roomModerated( [], recording( { can: false } ) ) ).toBe( false );
    } );

    it( 'starts from Start Recording in Host Controls once its confirm, listing the settings, says so', async () => {
        const r = recording();
        const { container, redraw } = screen( { adminMode: true, moderation: [], recording: r } );

        expect( pill( container ) ).toBeNull();
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        const row = container.querySelector( '.wplus-room-record' )!;
        expect( row.getAttribute( 'role' ), 'an act, not a rule of the room' ).toBe( 'menuitem' );
        expect( row.querySelector( '.wplus-call-moderation-switch' ) ).toBeNull();
        expect( row.textContent ).toContain( 'Start Recording' );
        expect( row.textContent ).toContain( 'Everyone in the call then sees a notice.' );

        await act( async () => { fireEvent.click( row ); } );
        expect( container.querySelector( '.wplus-call-moderation-room' ), 'Host Controls stayed open under the confirm' ).toBeNull();
        expect( dialog( container )!.textContent ).toContain( 'Start recording?' );
        expect( dialog( container )!.textContent ).toContain( 'Everyone in the call sees a notice that it is recorded, and so does anyone who joins later.' );
        const facts = Array.from( dialog( container )!.querySelectorAll( 'dt, dd' ) ).map( ( el ) => el.textContent );
        expect( facts ).toEqual( [ 'Picture', '1080p, Speaker layout', 'Transcript', 'Automatic', 'Who can watch', 'The people who were in the call', 'Kept', '30 days' ] );
        expect( r.started ).toBe( 0 );

        await act( async () => { fireEvent.click( dialog( container )!.querySelector( '.wplus-call-dialog-no' )! ); } );
        expect( dialog( container ) ).toBeNull();
        expect( r.started, 'Cancel started it' ).toBe( 0 );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-record' )! ); } );
        await act( async () => { fireEvent.click( dialog( container )!.querySelector( '.wplus-call-dialog-yes' )! ); } );
        expect( r.started ).toBe( 1 );
        expect( dialog( container ) ).toBeNull();

        // Its starter is told and asked nothing.
        redraw( { adminMode: true, moderation: [], recording: { ...r, id: 3, mine: true, by: 'Ben', tell: 'muted', state: 'on', since: now() } } );
        expect( notice( container ) ).toBeNull();
        expect( dialog( container ) ).toBeNull();
    } );

    it( 'stops from the REC pill at the top once asked, then says it saves and goes', async () => {
        const r = recording( { id: 4, mine: true, state: 'on', since: now() - 65 } );
        const { container, redraw } = screen( { adminMode: true, moderation: [], recording: r } );

        const mark = pill( container )!;
        expect( mark.getAttribute( 'role' ) ).toBe( 'button' );
        expect( mark.textContent ).toContain( 'REC' );
        // A second may turn over between the start's time and the pill's first draw.
        expect( mark.textContent ).toMatch( /1:0[56]/ );
        expect( mark.textContent ).toContain( 'Stop' );
        expect( container.querySelector( '.wplus-call-recording-badge' ), 'the old mark in the dock' ).toBeNull();

        await act( async () => { fireEvent.click( mark ); } );
        expect( dialog( container )!.textContent ).toContain( 'Stop recording?' );
        expect( dialog( container )!.textContent ).toContain( 'The people who were in the call can watch it in a few minutes.' );
        expect( dialog( container )!.querySelector( '.wplus-call-dialog-yes' )!.hasAttribute( 'data-danger' ) ).toBe( true );
        await act( async () => { fireEvent.keyDown( document, { key: 'Escape' } ); } );
        expect( dialog( container ), 'Escape is Cancel' ).toBeNull();
        expect( r.stopped ).toBe( 0 );

        await act( async () => { fireEvent.click( pill( container )! ); } );
        await act( async () => { fireEvent.click( dialog( container )!.querySelector( '.wplus-call-dialog-yes' )! ); } );
        expect( r.stopped ).toBe( 1 );

        vi.useFakeTimers();
        try {
            redraw( { adminMode: true, moderation: [], recording: { ...r, state: 'stopping' } } );
            expect( pill( container )!.textContent ).toContain( 'Saving recording…' );
            await act( async () => { vi.advanceTimersByTime( SAVING_MS + 50 ); } );
            expect( pill( container ), 'Saving stayed' ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'tells everyone else with a notice as it starts, and someone who joins later, until Got It', async () => {
        const off = recording( { can: false, id: 9, by: 'Ann' } );
        // A member's host gives no recording until one runs, as Better Messages does.
        const { container, redraw } = screen( { adminMode: false, recording: undefined } );
        expect( notice( container ) ).toBeNull();

        redraw( { adminMode: false, recording: { ...off, state: 'on', since: now() } } );
        expect( notice( container )!.textContent ).toContain( 'Ann started recording this call' );
        expect( notice( container )!.textContent ).toContain( 'The people who were in the call can watch it afterwards. A transcript is made too.' );
        expect( pill( container )!.getAttribute( 'role' ), 'a member stopped it' ).toBeNull();
        expect( pill( container )!.textContent ).not.toContain( 'Stop' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-recording-got-it' )! ); } );
        expect( notice( container ) ).toBeNull();
        expect( pill( container ), 'Got It took the pill too' ).not.toBeNull();
        cleanup();

        // Joined while it records, the same recording seen already: nothing again. Another: told it records.
        expect( notice( screen( { adminMode: false, recording: { ...off, state: 'on', since: now() } } ).container ) ).toBeNull();
        cleanup();
        const late = screen( { adminMode: false, recording: { ...off, id: 10, state: 'on', since: now() - 600 } } ).container;
        expect( notice( late )!.textContent ).toContain( 'This call is being recorded' );
        expect( notice( late )!.textContent ).toContain( 'Ann started recording.' );
    } );

    it( 'asks everyone else to stay or leave, with no way past the question but an answer', async () => {
        const asked = recording( { can: false, id: 11, by: 'Ann', tell: 'ask', state: 'on', since: now() } );
        const left = screen( { adminMode: false, recording: asked } );
        expect( dialog( left.container )!.textContent ).toContain( 'This call is being recorded' );
        expect( dialog( left.container )!.textContent ).toContain( 'Ann started recording. If you stay in the call, you agree to be recorded.' );
        expect( notice( left.container ), 'a notice beside the question' ).toBeNull();
        await act( async () => { fireEvent.keyDown( document, { key: 'Escape' } ); } );
        expect( dialog( left.container ), 'Escape put the question away' ).not.toBeNull();

        const call = fakeCall( { participants: people(), adminMode: false, recording: asked } );
        cleanup();
        const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        await act( async () => { fireEvent.click( dialog( container )!.querySelector( '.wplus-call-dialog-no' )! ); } );
        expect( call.calls ).toContain( 'endCall' );
        cleanup();

        const stayed = screen( { adminMode: false, recording: { ...asked, id: 12 } } ).container;
        await act( async () => { fireEvent.click( dialog( stayed )!.querySelector( '.wplus-call-dialog-yes' )! ); } );
        expect( dialog( stayed ) ).toBeNull();
        expect( window.sessionStorage.getItem( 'wplus-recording-told-12' ) ).toBe( 'agreed' );
    } );

    it( 'tells nobody but its moderators where they alone know of it, its pill in the bar beside the connection', async () => {
        // A member who joins while it records: no pill, no notice, no question, the microphone theirs.
        const member = screen( { adminMode: false, recording: recording( { can: false, id: 20, by: 'Ann', tell: 'moderators', state: 'on', since: now() } ) } ).container;
        expect( pill( member ) ).toBeNull();
        expect( notice( member ) ).toBeNull();
        expect( dialog( member ) ).toBeNull();
        cleanup();

        // Another moderator, who did not start it: the pill with Stop, and nothing else.
        const moderator = screen( { adminMode: true, moderation: [], recording: recording( { id: 20, by: 'Ann', tell: 'moderators', state: 'on', since: now() } ) } ).container;
        const mark = pill( moderator )!;
        expect( mark.textContent ).toContain( 'Stop' );
        expect( mark.closest( '.wplus-group-call-controls-v2' ), 'the pill is not in the bar' ).not.toBeNull();
        expect( mark.closest( '.wplus-call-rec-region' )!.previousElementSibling!.className, 'the pill is not after the connection status' ).toContain( 'wplus-connection-control' );
        expect( notice( moderator ) ).toBeNull();
        expect( dialog( moderator ) ).toBeNull();
        cleanup();

        // Its Start Recording and confirm say so.
        const r = recording( { tell: 'moderators' } );
        const { container } = screen( { adminMode: true, moderation: [], recording: r } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        expect( container.querySelector( '.wplus-room-record' )!.textContent ).toContain( 'Asks you first. Nobody else in the call is told.' );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-record' )! ); } );
        expect( dialog( container )!.textContent ).toContain( 'Nobody else in the call is told: only moderators see REC, and nothing about it is posted in the conversation.' );
    } );

    it( 'draws record with its dot filled in its own ink', () => {
        const { container } = render( <Icon name="record" size={ 14 } /> );
        const parts = [ ...container.querySelectorAll( 'path' ) ];
        expect( parts ).toHaveLength( 2 );
        expect( parts[ 0 ].getAttribute( 'fill' ), 'the ring' ).toBeNull();
        expect( parts[ 1 ].getAttribute( 'fill' ), 'the dot' ).toBe( 'currentColor' );
        expect( parts[ 1 ].getAttribute( 'd' )!.startsWith( '*' ) ).toBe( false );
    } );

    it( 'keeps the microphone and camera off until the user agrees, whatever turns them on', async () => {
        const call = fakeCall( {
            participants: people(),
            adminMode: false,
            myMicrophoneTrackRef: { current: {} } as never,
            myCameraTrackRef: { current: {} } as never,
            recording: recording( { can: false, id: 13, by: 'Ann', tell: 'muted', state: 'on', since: now() } ),
        } );
        const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );

        expect( call.calls, 'what was on stayed on' ).toEqual( expect.arrayContaining( [ 'disableMic', 'disableCamera' ] ) );
        expect( dialog( container )!.textContent ).toContain( 'Your microphone and camera stay off until you agree to be recorded.' );
        expect( dialog( container )!.querySelector( '.wplus-call-dialog-yes' )!.textContent ).toBe( 'I Agree' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-enable-mic' )! ); } );
        expect( call.calls, 'the microphone went on before an answer' ).not.toContain( 'enableMic' );

        await act( async () => { fireEvent.click( dialog( container )!.querySelector( '.wplus-call-dialog-yes' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-enable-mic' )! ); } );
        expect( call.calls ).toContain( 'enableMic' );
    } );
} );
