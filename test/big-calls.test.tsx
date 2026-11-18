import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallScreen, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// Big group calls on the device: no ceiling on the people a grid holds, and a
// grid that says which tiles it draws, so whoever runs the call receives those cameras alone.

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    window.localStorage.clear();
    // The timers alone: the clocks stay real, for the timings.
    vi.useFakeTimers( { toFake: [ 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'requestAnimationFrame', 'cancelAnimationFrame' ] } );
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

const crowd = ( count: number, extra: ( i: number ) => Partial<CallParticipant> = () => ( {} ) ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { name: 'Ben' } ) ],
    ...Array.from( { length: count - 1 }, ( _, i ) => {
        const key = 'user_' + ( 100 + i );
        return [ key, participant( key, { identity: key, name: 'Guest ' + i, ...extra( i ) } ) ] as [ string, CallParticipant ];
    } ),
] );

const now = () => performance.now();

function screen( people: Map<string, CallParticipant>, layout: 'group-video' | 'group-audio' = 'group-video' ) {
    const told: string[][] = [];
    const call = fakeCall( { participants: people, showTiles: ( source, keys ) => { if ( source === 'grid' ) told.push( [ ...keys ] ); } } );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) => <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
    const started = now();
    const rendered = render( draw() );
    const drawMs = now() - started;
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    return { told, drawMs, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => {
        const at = now();
        rendered.rerender( draw( more ) );
        const took = now() - at;
        act( () => { vi.advanceTimersByTime( 50 ); } );
        return took;
    } };
}

describe( 'a big group video call', () => {
    it( 'draws everyone in pages and says only the page in view is drawn, the next once scrolled to', () => {
        const people = crowd( 200, ( i ) => ( { videoPublished: true, video: i < 3 ? fakeTrack() : null, audio: i % 20 === 0 ? fakeTrack() : null } ) );
        const { container, told } = screen( people );

        // The page in view and the next are drawn, the rest only heard.
        const drawn = container.querySelectorAll( '.wplus-group-call-input-video[data-key]' ).length;
        expect( drawn, 'every tile was drawn' ).toBeLessThan( 120 );
        expect( drawn ).toBeGreaterThan( 8 );
        const heard = container.querySelectorAll( 'audio' ).length;
        expect( heard, 'a sound off the drawn pages stopped' ).toBe( 10 );
        const first = told.at( -1 )!;
        expect( first.length, 'it said every tile was drawn' ).toBeLessThan( 60 );
        expect( first.length ).toBeGreaterThan( 4 );

        const block = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
        Object.defineProperty( block, 'clientWidth', { configurable: true, value: 892 } );
        block.scrollLeft = 892;
        act( () => { fireEvent.scroll( block ); vi.advanceTimersByTime( 50 ); } );
        const second = told.at( -1 )!;
        expect( second.length ).toBeGreaterThan( 4 );
        expect( second.some( ( key ) => first.includes( key ) ), 'the second page shares tiles with the first' ).toBe( false );
    } );

    it( 'keeps a tile whose camera is sent, though not received, among the tiles with a picture', () => {
        const people = crowd( 30, ( i ) => ( { videoPublished: i % 2 === 0 } ) );
        const { container } = screen( people );
        // As the tiles read: page by page, then row by row.
        const page = ( el: HTMLElement ) => Math.floor( parseFloat( el.style.left ) / 100 + 0.001 );
        const order = [ ...container.querySelectorAll<HTMLElement>( '.wplus-group-call-input-video[data-key]' ) ]
            .sort( ( a, b ) => page( a ) - page( b ) || parseFloat( a.style.top ) - parseFloat( b.style.top ) || parseFloat( a.style.left ) - parseFloat( b.style.left ) )
            .map( ( el ) => el.dataset.key! );
        const firstWithout = order.findIndex( ( key ) => key !== 'me' && ! people.get( key )!.videoPublished );
        const lastWith = order.map( ( key ) => !! people.get( key )!.videoPublished ).lastIndexOf( true );
        expect( lastWith, 'no tile with a picture was drawn' ).toBeGreaterThan( 4 );
        // The pages drawn may hold only pictures: then none without came first.
        if ( firstWithout >= 0 ) expect( lastWith, 'a tile without a picture came before one with' ).toBeLessThan( firstWithout );
    } );

    it( 'draws 200 and 500 people, and a speaker changing, in a time that grows no faster than the people', () => {
        const times: Record<number, { draw: number, speak: number }> = {};
        for ( const count of [ 200, 500 ] ) {
            const people = crowd( count );
            const { drawMs, redraw, unmount } = screen( people );
            const speaking = new Map( people );
            speaking.set( 'user_150', { ...speaking.get( 'user_150' )!, isSpeaking: true, audioLevel: 0.6 } );
            times[ count ] = { draw: Math.round( drawMs ), speak: Math.round( redraw( { participants: speaking } ) ) };
            unmount();
        }
        console.log( 'big call timings (ms):', JSON.stringify( times ) );
        // Loose: a busy machine runs these slower, but 2.5 times the people never takes ten times as long.
        expect( times[ 500 ].draw ).toBeLessThan( times[ 200 ].draw * 10 + 200 );
        expect( times[ 500 ].speak ).toBeLessThan( times[ 200 ].speak * 10 + 200 );
    } );
} );

const scrollTo = ( el: HTMLElement, top: number ) => act( () => {
    el.scrollTop = top;
    fireEvent.scroll( el );
    vi.advanceTimersByTime( 50 );
} );

describe( 'a big group audio call', () => {
    it( 'draws the rows of a thousand in view alone, the later ones as it scrolls, and keeps the sound of the rest', () => {
        const people = crowd( 1000, ( i ) => ( { audio: i % 100 === 0 ? fakeTrack() : null } ) );
        const { container } = screen( people, 'group-audio' );
        const grid = container.querySelector<HTMLElement>( '.wplus-group-call-audios-grid' )!;
        const rows = () => [ ...grid.querySelectorAll<HTMLElement>( '.wplus-group-call-input-audio[data-key]' ) ].map( ( el ) => el.dataset.key! );

        const first = rows();
        expect( first.length, 'it drew every row' ).toBeLessThan( 100 );
        expect( first.length ).toBeGreaterThan( 5 );
        // Ten have a sound, and whoever is out of view plays it all the same.
        expect( grid.querySelectorAll( 'audio' ).length ).toBe( 10 );

        scrollTo( grid, 600 * 66 );
        const later = rows();
        expect( later.length ).toBeLessThan( 100 );
        expect( later.some( ( key ) => first.includes( key ) ), 'the rows far down are the ones drawn' ).toBe( false );
        expect( grid.querySelectorAll( 'audio' ).length, 'a sound stopped as its row left the view' ).toBe( 10 );
        expect( grid.querySelector( '.wplus-call-tile-entering' ), 'a row scrolled to entered as a join' ).toBeNull();
    } );

    it( 'draws 200 and 1,000 people, and a speaker changing, in a time that grows no faster than the people', () => {
        const times: Record<number, { draw: number, speak: number }> = {};
        for ( const count of [ 200, 1000 ] ) {
            const people = crowd( count, ( i ) => ( { audio: i % 50 === 0 ? fakeTrack() : null } ) );
            const { drawMs, redraw, unmount } = screen( people, 'group-audio' );
            const speaking = new Map( people );
            speaking.set( 'user_150', { ...speaking.get( 'user_150' )!, audio: fakeTrack(), isSpeaking: true, audioLevel: 0.6 } );
            times[ count ] = { draw: Math.round( drawMs ), speak: Math.round( redraw( { participants: speaking } ) ) };
            unmount();
        }
        console.log( 'big audio call timings (ms):', JSON.stringify( times ) );
        // Drawn in a window, a thousand cost about what two hundred do. Loose, for a busy machine.
        expect( times[ 1000 ].draw ).toBeLessThan( times[ 200 ].draw * 5 + 200 );
        expect( times[ 1000 ].speak ).toBeLessThan( times[ 200 ].speak * 5 + 200 );
    } );
} );

describe( 'Participants of a big call', () => {
    it( 'draws the rows in view of a thousand, says how many as the page writes it, and searches them all', () => {
        document.documentElement.lang = 'en';
        const { container } = screen( crowd( 1000 ) );
        const toggle = container.querySelector<HTMLElement>( '.wplus-call-people-toggle' )!;
        expect( toggle.querySelector( '.wplus-call-people-count' )!.textContent ).toBe( '1,000' );

        fireEvent.click( toggle );
        const list = container.querySelector<HTMLElement>( '.wplus-call-people-list' )!;
        const rows = () => [ ...list.querySelectorAll<HTMLElement>( '.wplus-call-people-row' ) ].map( ( el ) => el.dataset.person! );
        expect( container.querySelector( '.wplus-call-people-total' )!.textContent ).toBe( '1,000' );
        expect( list.getAttribute( 'aria-rowcount' ) ).toBe( '1000' );

        const first = rows();
        expect( first[ 0 ], 'the user is first' ).toBe( 'me' );
        expect( first.length ).toBeLessThan( 60 );

        scrollTo( list, 900 * 52 );
        const later = rows();
        expect( later.length ).toBeLessThan( 60 );
        expect( later.some( ( key ) => first.includes( key ) ) ).toBe( false );

        const search = container.querySelector<HTMLInputElement>( '.wplus-call-people-search input' )!;
        act( () => { fireEvent.change( search, { target: { value: 'Guest 987' } } ); } );
        expect( rows() ).toEqual( [ 'user_1087' ] );
        document.documentElement.lang = '';
    } );
} );
