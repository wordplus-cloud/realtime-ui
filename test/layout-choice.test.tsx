import React, { createRef, useRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import {
    CallScreen, LAYOUT_KEY, PageArrows, SPEAKER_HOLD_MS, emptyStage, layoutChoice, layoutMainKeys, visibleTiles, type CallParticipant,
} from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// Layout choice (layout-choice.tsx): Auto, Speaker or Tiled, people hidden on this page, kept by the browser.

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ], [ 44, { name: 'Dan' } ] ] );
    window.localStorage.clear();
    vi.useFakeTimers();
    // a call 900 wide and 700 high, its dock 60
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
        return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
    } );
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
} );

type Person = [ string, Partial<CallParticipant> ];
const person = ( id: number, name: string, extra: Partial<CallParticipant> = {} ): Person => [ 'user_' + id, { identity: 'user_' + id, name, ...extra } ];
const map = ( ...entries: Person[] ) => new Map( entries.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ) );
const people = ( ...more: Person[] ) => map( [ 'me', { identity: 'user_42', name: 'Ben', video: fakeTrack() } ], ...more );

const screen = ( over: Parameters<typeof fakeCall>[ 0 ] ) => {
    const call = fakeCall( over );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const rendered = render( draw() );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    return { call, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => {
        rendered.rerender( draw( more ) );
        act( () => { vi.advanceTimersByTime( 100 ); } );
    } };
};

const main = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-group-call-videos-grid-primary [data-key]' ) ].map( ( el ) => el.getAttribute( 'data-key' ) );
const tiles = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-group-call-input-video[data-key]' ) ].map( ( el ) => el.getAttribute( 'data-key' ) ).sort();
// The layout is in the dock's More whatever the room, at hand as soon as More opens.
const openLayout = ( container: HTMLElement ) => {
    if ( ! container.querySelector( '.wplus-call-more-menu' ) ) fireEvent.click( container.querySelector( '.wplus-call-more' )! );
};
const choose = ( container: HTMLElement, className: string ) => {
    openLayout( container );
    fireEvent.click( container.querySelector( '.wplus-call-more-menu .' + className )! );
    act( () => { vi.advanceTimersByTime( 100 ); } );
};

describe( 'the layout', () => {
    it( 'is chosen in the dock\'s More, Auto at first, which stays open, and kept by the browser', () => {
        const { container } = screen( { participants: people( person( 34, 'Ann' ) ) } );
        openLayout( container );
        const menu = container.querySelector( '.wplus-call-more-menu' )!;
        expect( [ ...menu.querySelectorAll( '[role="menuitemradio"]' ) ].map( ( el ) => [ el.getAttribute( 'aria-label' ), el.getAttribute( 'aria-checked' ) ] ) )
            .toEqual( [ [ 'Auto', 'true' ], [ 'Speaker', 'false' ], [ 'Tiled', 'false' ] ] );
        expect( menu.querySelector( '.wplus-call-layout-toggle' ), 'More opens no Layout menu of its own' ).toBeNull();

        choose( container, 'wplus-layout-tiled' );
        expect( container.querySelector( '.wplus-call-more-menu' ), 'a choice put More away' ).not.toBeNull();
        expect( container.querySelector( '.wplus-call-more-menu .wplus-layout-tiled' )?.getAttribute( 'aria-checked' ) ).toBe( 'true' );
        choose( container, 'wplus-layout-hide-self' );
        expect( JSON.parse( window.localStorage.getItem( LAYOUT_KEY )! ) ).toEqual( { mode: 'tiled', hideNoVideo: false, hideSelf: true } );
        expect( layoutChoice() ).toEqual( { mode: 'tiled', hideNoVideo: false, hideSelf: true } );

        window.localStorage.setItem( LAYOUT_KEY, '{"mode":"nonsense","hideSelf":"yes"}' );
        expect( layoutChoice() ).toEqual( { mode: 'auto', hideNoVideo: false, hideSelf: false } );
    } );

    it( 'Speaker makes whoever speaks large, moving only once someone else has spoken a while, and a shared screen before them', () => {
        const quiet = ( extra: Partial<CallParticipant> = {} ) => [ person( 34, 'Ann', { video: fakeTrack(), ...extra } ), person( 43, 'Cara' ) ] as Person[];
        const { container, redraw } = screen( { participants: people( ...quiet() ) } );
        choose( container, 'wplus-layout-speaker' );
        expect( main( container ), 'nobody speaking: someone with a picture, never the user' ).toEqual( [ 'user_34' ] );

        // Cara speaks, but not for long enough.
        redraw( { participants: people( person( 34, 'Ann', { video: fakeTrack() } ), person( 43, 'Cara', { isSpeaking: true } ) ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS / 2 ); } );
        redraw( { participants: people( ...quiet() ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS ); } );
        expect( main( container ) ).toEqual( [ 'user_34' ] );

        // Cara speaks on.
        redraw( { participants: people( person( 34, 'Ann', { video: fakeTrack() } ), person( 43, 'Cara', { isSpeaking: true } ) ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS + 50 ); } );
        expect( main( container ) ).toEqual( [ 'user_43' ] );

        // Ann shares her screen: hers is large while she shares.
        redraw( { participants: people( person( 34, 'Ann', { video: fakeTrack(), screen: fakeTrack() } ), person( 43, 'Cara', { isSpeaking: true } ) ) } );
        expect( main( container ) ).toEqual( [ 'user_34' ] );
    } );

    it( 'Speaker puts everyone else in a strip that scrolls, with no pages, in the order they joined', () => {
        const others = [ 34, 43, 44, 45, 46, 47 ].map( ( id, at ) => person( id, 'P' + at, at % 2 ? {} : { video: fakeTrack() } ) );
        const { container, redraw } = screen( { participants: people( ...others ) } );
        choose( container, 'wplus-layout-speaker' );
        const strip = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
        expect( strip.dataset.scroll, 'the strip does not scroll' ).toMatch( /^[xy]$/ );
        expect( container.querySelector( '.wplus-call-pages' ), 'the strip has a pager' ).toBeNull();
        expect( container.querySelector( '.wplus-call-page-stop' ) ).toBeNull();

        const order = () => [ ...strip.querySelectorAll<HTMLElement>( '.wplus-group-call-input-video[data-key]' ) ]
            .map( ( el ) => ( { key: el.dataset.key, x: parseFloat( el.style.left ), y: parseFloat( el.style.top ) } ) )
            .sort( ( a, b ) => Math.floor( a.x / 100 ) - Math.floor( b.x / 100 ) || a.y - b.y || a.x - b.x ).map( ( place ) => place.key );
        const joined = ( large: string[] ) => [ 'me', ...others.map( ( [ key ] ) => key ) ].filter( ( key ) => ! large.includes( key ) );
        expect( order() ).toEqual( joined( main( container ) ) );

        // Someone without a picture talking keeps their place.
        redraw( { participants: people( ...others.map( ( [ key, extra ] ) => [ key, key === 'user_47' ? { ...extra, isSpeaking: true } : extra ] as Person ) ) } );
        expect( order() ).toEqual( joined( main( container ) ) );
    } );

    it( 'Tiled makes nobody large but the spotlight, which comes first in every layout', () => {
        const everyone = people( person( 34, 'Ann' ), person( 43, 'Cara' ) );
        const { container, redraw } = screen( { participants: everyone } );
        fireEvent.click( container.querySelector( '[data-key="user_34"] .wplus-pin-for-me' )! );
        act( () => { vi.advanceTimersByTime( 100 ); } );
        expect( main( container ) ).toEqual( [ 'user_34' ] );

        choose( container, 'wplus-layout-tiled' );
        expect( main( container ), 'a pin made a tile large in Tiled' ).toEqual( [] );
        // where a pin makes nothing large it isn't offered, but the pinned tile keeps its Unpin for Me
        expect( container.querySelector( '[data-key="user_43"] .wplus-pin-for-me' ), 'Pin for Me offered in Tiled' ).toBeNull();
        expect( container.querySelector( '[data-key="user_34"] .wplus-pin-for-me' ) ).not.toBeNull();

        redraw( { participants: everyone, spotlight: [ 'user_43' ] } );
        expect( main( container ) ).toEqual( [ 'user_43' ] );
        expect( container.querySelector( '.wplus-call-layout-spotlit' ), 'the menu does not say the spotlight decides' ).not.toBeNull();
    } );

    it( 'hides the user\'s own tile and people without video on this page, their sound still playing', () => {
        const sound = fakeTrack();
        const { container } = screen( { participants: people( person( 34, 'Ann', { video: fakeTrack() } ), person( 43, 'Cara', { audio: sound } ) ) } );
        expect( tiles( container ) ).toEqual( [ 'me', 'user_34', 'user_43' ] );

        choose( container, 'wplus-layout-hide-no-video' );
        expect( tiles( container ) ).toEqual( [ 'me', 'user_34' ] );
        const hidden = container.querySelector<HTMLAudioElement>( 'audio.wplus-call-hidden-sound' )!;
        expect( sound.attached, 'a hidden tile went quiet' ).toContain( hidden );

        choose( container, 'wplus-layout-hide-self' );
        expect( tiles( container ) ).toEqual( [ 'user_34' ] );
    } );
} );

describe( 'Hide People Without Video and Hide Self View', () => {
    const keep = ( choice: { mode?: string, hideNoVideo?: boolean, hideSelf?: boolean } ) =>
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: false, ...choice } ) );
    const note = ( container: HTMLElement ) => container.querySelector( '.wplus-call-stage-note' );
    const quiet = ( sound = fakeTrack() ) => people( person( 34, 'Ann', { video: fakeTrack() } ), person( 43, 'Cara', { audio: sound } ) );
    const speaking = ( sound: ReturnType<typeof fakeTrack>, on: boolean ) =>
        people( person( 34, 'Ann', { video: fakeTrack() } ), person( 43, 'Cara', { audio: sound, isSpeaking: on } ) );

    it( 'show someone without video while they speak, at once, through a pause, and not after the hold', () => {
        keep( { mode: 'tiled', hideNoVideo: true } );
        const sound = fakeTrack();
        const { container, redraw } = screen( { participants: quiet( sound ) } );
        expect( tiles( container ) ).toEqual( [ 'me', 'user_34' ] );

        redraw( { participants: speaking( sound, true ) } );
        expect( tiles( container ), 'Cara speaks and has no tile' ).toEqual( [ 'me', 'user_34', 'user_43' ] );

        // A pause shorter than the hold, then on again: the tile stays all through.
        redraw( { participants: speaking( sound, false ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS - 600 ); } );
        expect( tiles( container ), 'the tile went in a pause' ).toEqual( [ 'me', 'user_34', 'user_43' ] );
        redraw( { participants: speaking( sound, true ) } );
        redraw( { participants: speaking( sound, false ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS - 300 ); } );
        expect( tiles( container ), 'the hold did not start again as she spoke again' ).toEqual( [ 'me', 'user_34', 'user_43' ] );

        act( () => { vi.advanceTimersByTime( 400 ); } );
        expect( tiles( container ), 'the tile stayed after the hold' ).toEqual( [ 'me', 'user_34' ] );
    } );

    it( 'hand someone without video the large tile in Speaker as they keep speaking', () => {
        keep( { mode: 'speaker', hideNoVideo: true } );
        const sound = fakeTrack();
        const { container, redraw } = screen( { participants: quiet( sound ) } );
        expect( main( container ) ).toEqual( [ 'user_34' ] );

        redraw( { participants: speaking( sound, true ) } );
        expect( tiles( container ) ).toContain( 'user_43' );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS + 100 ); } );
        redraw( { participants: speaking( sound, true ) } );
        expect( main( container ), 'Cara spoke past the hold and is not the large tile' ).toEqual( [ 'user_43' ] );
    } );

    it( 'play the sound of someone hidden in the element their tile takes as they speak', () => {
        keep( { hideNoVideo: true } );
        const sound = fakeTrack();
        const { container, redraw } = screen( { participants: quiet( sound ) } );
        const hidden = container.querySelector<HTMLAudioElement>( 'audio.wplus-call-hidden-sound' )!;
        expect( sound.attached ).toContain( hidden );

        redraw( { participants: speaking( sound, true ) } );
        const tile = container.querySelector( '.wplus-group-call-input-video[data-key="user_43"]' )!;
        expect( tile.contains( hidden ), 'the tile drew a new element for her sound' ).toBe( true );
        expect( sound.attached.filter( ( element ) => element.isConnected ), 'her sound plays twice, or not at all' ).toEqual( [ hidden ] );
    } );

    it( 'never bring the user\'s own tile back as they speak', () => {
        keep( { hideNoVideo: true, hideSelf: true } );
        const others = ( on: boolean ) => map( [ 'me', { identity: 'user_42', name: 'Ben', video: fakeTrack(), isSpeaking: on } ], person( 34, 'Ann', { video: fakeTrack() } ) );
        const { container, redraw } = screen( { participants: others( false ) } );
        redraw( { participants: others( true ) } );
        expect( tiles( container ) ).toEqual( [ 'user_34' ] );

        cleanup();
        keep( { hideNoVideo: true } );
        const dark = ( on: boolean ) => map( [ 'me', { identity: 'user_42', name: 'Ben', isSpeaking: on } ], person( 34, 'Ann', { video: fakeTrack() } ) );
        const again = screen( { participants: dark( false ) } );
        again.redraw( { participants: dark( true ) } );
        expect( tiles( again.container ), 'the user\'s own tile without video came up as they spoke' ).toEqual( [ 'user_34' ] );
    } );

    it( 'say a stage they leave empty is so, and Show Everyone turns Hide People Without Video off', () => {
        keep( { hideNoVideo: true } );
        const sound = fakeTrack();
        const dark = ( on: boolean ) => map( [ 'me', { identity: 'user_42', name: 'Ben' } ], person( 43, 'Cara', { audio: sound, isSpeaking: on } ) );
        const { container, redraw } = screen( { participants: dark( false ) } );
        expect( tiles( container ), 'everyone shows while nobody has video' ).toEqual( [] );
        expect( note( container )?.textContent ).toBe( 'Nobody has video onShow Everyone' );

        // Someone speaking comes on the stage, and the note goes until they leave it.
        redraw( { participants: dark( true ) } );
        expect( tiles( container ) ).toEqual( [ 'user_43' ] );
        expect( note( container ), 'the note stayed with someone on the stage' ).toBeNull();
        redraw( { participants: dark( false ) } );
        act( () => { vi.advanceTimersByTime( SPEAKER_HOLD_MS + 100 ); } );
        expect( note( container ) ).not.toBeNull();

        fireEvent.click( container.querySelector( '.wplus-call-stage-note-show' )! );
        act( () => { vi.advanceTimersByTime( 100 ); } );
        expect( tiles( container ) ).toEqual( [ 'me', 'user_43' ] );
        expect( note( container ) ).toBeNull();
        expect( layoutChoice().hideNoVideo ).toBe( false );
    } );

    it( 'say the self view is hidden for a user alone, Show turning it off, and both at once with one button', () => {
        keep( { hideSelf: true } );
        const alone = map( [ 'me', { identity: 'user_42', name: 'Ben', video: fakeTrack() } ] );
        const { container } = screen( { participants: alone } );
        expect( note( container )?.textContent ).toBe( 'Your self view is hiddenShow' );
        fireEvent.click( container.querySelector( '.wplus-call-stage-note-show' )! );
        act( () => { vi.advanceTimersByTime( 100 ); } );
        expect( tiles( container ) ).toEqual( [ 'me' ] );
        expect( layoutChoice().hideSelf ).toBe( false );

        cleanup();
        keep( { mode: 'tiled', hideNoVideo: true, hideSelf: true } );
        const dark = map( [ 'me', { identity: 'user_42', name: 'Ben' } ] );
        const both = screen( { participants: dark } );
        expect( note( both.container )?.textContent ).toBe( 'Nobody else has video on, and your self view is hiddenShow Everyone' );
        fireEvent.click( both.container.querySelector( '.wplus-call-stage-note-show' )! );
        act( () => { vi.advanceTimersByTime( 100 ); } );
        expect( tiles( both.container ) ).toEqual( [ 'me' ] );
        expect( layoutChoice() ).toEqual( { mode: 'tiled', hideNoVideo: false, hideSelf: false } );
    } );

    it( 'keep Participants while someone hidden speaks', () => {
        keep( { hideNoVideo: true } );
        const sound = fakeTrack();
        const { container, redraw } = screen( { participants: quiet( sound ) } );
        expect( container.querySelector( '.wplus-call-people-toggle' ), 'no Participants with Cara hidden' ).not.toBeNull();
        redraw( { participants: speaking( sound, true ) } );
        expect( tiles( container ) ).toContain( 'user_43' );
        expect( container.querySelector( '.wplus-call-people-toggle' ), 'Participants went as Cara spoke' ).not.toBeNull();
    } );
} );

describe( 'the tiles shown and the large ones', () => {
    const choice = ( over: Partial<{ mode: 'auto' | 'speaker' | 'tiled', hideNoVideo: boolean, hideSelf: boolean }> = {} ) => ( { mode: 'auto' as const, hideNoVideo: false, hideSelf: false, ...over } );

    it( 'hide nobody in the spotlight, everyone without video even while nobody has it, but those who speak', () => {
        const all = map( [ 'me', { identity: 'user_42' } ], person( 1, 'A', { video: fakeTrack() } ), person( 2, 'B' ), person( 3, 'C' ) );
        expect( [ ...visibleTiles( all, choice( { hideNoVideo: true } ), [ 'user_3' ] ).keys() ] ).toEqual( [ 'user_1', 'user_3' ] );
        expect( [ ...visibleTiles( all, choice( { hideSelf: true } ), [] ).keys() ] ).toEqual( [ 'user_1', 'user_2', 'user_3' ] );
        expect( [ ...visibleTiles( all, choice( { hideNoVideo: true } ), [], new Set( [ 'user_2' ] ) ).keys() ] ).toEqual( [ 'user_1', 'user_2' ] );
        const dark = map( [ 'me', { identity: 'user_42' } ], person( 2, 'B' ) );
        expect( [ ...visibleTiles( dark, choice( { hideNoVideo: true } ), [] ).keys() ], 'everyone showed while nobody has video' ).toEqual( [] );
        expect( emptyStage( dark, new Map(), choice( { hideNoVideo: true } ) ) ).toBe( 'video' );
        expect( emptyStage( dark, new Map(), choice( { hideNoVideo: true, hideSelf: true } ) ) ).toBe( 'both' );
        const alone = map( [ 'me', { identity: 'user_42', video: fakeTrack() } ] );
        expect( emptyStage( alone, new Map(), choice( { hideNoVideo: true, hideSelf: true } ) ), 'the camera is on: only the self view hides it' ).toBe( 'self' );
        expect( emptyStage( alone, alone, choice() ) ).toBeNull();
    } );

    it( 'are the spotlight, else Auto\'s pins, Speaker\'s one, and Tiled\'s none', () => {
        const all = map( person( 1, 'A' ), person( 2, 'B' ) );
        expect( layoutMainKeys( all, [ 'user_2' ], new Set( [ 'user_1' ] ), false, 'tiled', 'user_1' ) ).toEqual( [ 'user_2' ] );
        expect( layoutMainKeys( all, [], new Set( [ 'user_1' ] ), false, 'auto', 'user_2' ) ).toEqual( [ 'user_1' ] );
        expect( layoutMainKeys( all, [], new Set( [ 'user_1' ] ), false, 'speaker', 'user_2' ) ).toEqual( [ 'user_2' ] );
        expect( layoutMainKeys( all, [], new Set( [ 'user_1' ] ), false, 'tiled', 'user_2' ) ).toEqual( [] );
    } );
} );

describe( 'the pages of tiles', () => {
    function Paged( { width, scrollWidth }: { width: number, scrollWidth: number } ) {
        const block = useRef<HTMLDivElement>( null );
        return <div>
            <div ref={ ( el ) => {
                ( block as { current: HTMLDivElement | null } ).current = el;
                if ( ! el ) return;
                Object.defineProperty( el, 'clientWidth', { configurable: true, value: width } );
                Object.defineProperty( el, 'scrollWidth', { configurable: true, value: scrollWidth } );
                el.scrollTo = ( ( options: ScrollToOptions ) => {
                    el.scrollLeft = options.left ?? 0;
                    el.dispatchEvent( new Event( 'scroll' ) );
                } ) as typeof el.scrollTo;
            } } />
            <PageArrows block={ block } />
        </div>;
    }

    it( 'say which page shows and turn them, and show nothing while it all fits', () => {
        const { container, rerender } = render( <Paged width={ 600 } scrollWidth={ 1800 } /> );
        expect( container.querySelector( '.wplus-call-page-count' )!.textContent ).toBe( '1 / 3' );
        expect( container.querySelector( '.wplus-call-page-prev' )!.getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        act( () => { fireEvent.click( container.querySelector( '.wplus-call-page-next' )! ); } );
        expect( container.querySelector( '.wplus-call-page-count' )!.textContent ).toBe( '2 / 3' );

        rerender( <Paged width={ 600 } scrollWidth={ 600 } /> );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( container.querySelector( '.wplus-call-pages' ) ).toBeNull();
    } );
} );
