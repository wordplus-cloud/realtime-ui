import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallScreen, LAYOUT_KEY, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// A group video call on a phone or a tablet (group-video-grid.tsx, `touch`): a camera filling its tile only when the two
// are all but one shape, the user's own tile among the others, pages that swipe, a tile's pin and ⋯ shown once it is
// tapped.

let stage = { width: 390, height: 844 };

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    window.localStorage.clear();
    ( window as unknown as { Better_Messages: object } ).Better_Messages = { forceMobileView: '1' };
    stage = { width: 390, height: 844 };
    Object.defineProperty( window, 'innerWidth', { configurable: true, get: () => stage.width } );
    Object.defineProperty( window, 'innerHeight', { configurable: true, get: () => stage.height } );
    vi.useFakeTimers( { toFake: [ 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame' ] } );
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : stage.height;
        return { width: stage.width, height, top: 0, left: 0, right: stage.width, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
    } );
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete ( window as unknown as { Better_Messages?: object } ).Better_Messages;
} );

const portrait = { dimensions: { width: 720, height: 1280 } };
const landscape = { dimensions: { width: 1280, height: 720 } };

const crowd = ( count: number, pub: ( i: number ) => typeof portrait = () => portrait ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { name: 'Ben', video: fakeTrack(), videoPub: portrait, videoPublished: true } ) ],
    ...Array.from( { length: count - 1 }, ( _, i ) => {
        const key = 'user_' + ( 100 + i );
        return [ key, participant( key, { identity: key, name: 'Guest ' + i, video: fakeTrack(), videoPub: pub( i ), videoPublished: true } ) ] as [ string, CallParticipant ];
    } ),
] );

function screen( people: Map<string, CallParticipant> ) {
    const call = fakeCall( { participants: people } );
    const rendered = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    return rendered;
}

const gridTiles = ( container: HTMLElement ) => [ ...container.querySelectorAll<HTMLElement>( '.wplus-group-call-videos-grid-secondary > .wplus-group-call-input-video[data-key]' ) ];
const filled = ( tiles: HTMLElement[] ) => tiles.filter( ( t ) => t.classList.contains( 'wplus-cover-video' ) ).map( ( t ) => t.dataset.key );

describe( 'a group video call on a phone', () => {
    it( 'has the user\'s own tile among the others, nothing floating over them', () => {
        const { container } = screen( crowd( 2 ) );
        expect( gridTiles( container ).map( ( t ) => t.dataset.key ).sort() ).toEqual( [ 'me', 'user_100' ] );
        expect( container.querySelector( '.wplus-call-self-float' ) ).toBeNull();
    } );

    it( 'fills a tile with a camera only when that cuts at most 2% of it, along the side it cuts', () => {
        // The user's own tile hidden, the other person has the stage, 390 by 784 (the phone less its dock): a camera of
        // that shape, or one cutting just under 2% off its height or its width, fills it, one cutting just over is drawn
        // whole, as is a phone's 9:16.
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );
        const cases: Array<[ number, boolean ]> = [ [ 784, true ], [ 799, true ], [ 801, false ], [ 769, true ], [ 767, false ], [ 693, false ] ];
        for ( const [ height, fills ] of cases ) {
            const people = new Map<string, CallParticipant>( [
                [ 'me', participant( 'me', { name: 'Ben', video: fakeTrack(), videoPub: portrait, videoPublished: true } ) ],
                [ 'user_100', participant( 'user_100', { identity: 'user_100', name: 'Ann', video: fakeTrack(), videoPub: { dimensions: { width: 390, height } }, videoPublished: true } ) ],
            ] );
            const { container, unmount } = screen( people );
            const tiles = gridTiles( container );
            expect( tiles.map( ( t ) => [ t.dataset.key, t.style.width, t.style.height ] ) ).toEqual( [ [ 'user_100', '100%', '100%' ] ] );
            expect( tiles[ 0 ].classList.contains( 'wplus-cover-video' ), `a camera 390 by ${ height } on a stage 390 by 784` ).toBe( fills );
            unmount();
        }
    } );

    it( 'puts phones\' cameras in two columns, drawn whole, and stacks computers\' as wide rows', () => {
        const phones = screen( crowd( 4 ) );
        expect( gridTiles( phones.container ).map( ( t ) => t.style.width ) ).toEqual( [ '50%', '50%', '50%', '50%' ] );
        expect( filled( gridTiles( phones.container ) ), 'a phone\'s camera cut to a cell of another shape' ).toEqual( [] );
        phones.unmount();

        const computers = screen( crowd( 4, () => landscape ) );
        expect( gridTiles( computers.container ).filter( ( t ) => t.dataset.key !== 'me' ).map( ( t ) => t.style.width ) ).toEqual( [ '100%', '100%', '100%' ] );
    } );

    it( 'centres a last row short of the others', () => {
        const { container } = screen( crowd( 3 ) );
        const lefts = gridTiles( container ).map( ( t ) => parseFloat( t.style.left ) ).sort( ( a, b ) => a - b );
        expect( lefts ).toEqual( [ 0, 25, 50 ] );
    } );

    it( 'holds six to a page, the pages a swipe apart, each a stop', () => {
        const { container } = screen( crowd( 15 ) );
        const block = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
        expect( block.dataset.swipe ).toBe( '1' );
        const first = gridTiles( container ).filter( ( t ) => parseFloat( t.style.left ) < 100 );
        expect( first ).toHaveLength( 6 );
        expect( first.map( ( t ) => t.dataset.key ), 'the user is not on the first page' ).toContain( 'me' );
        expect( block.querySelectorAll( '.wplus-call-page-stop' ) ).toHaveLength( 3 );
    } );

    it( 'shows a tile\'s pin once the tile is tapped, for a while', () => {
        const { container } = screen( crowd( 3 ) );
        const inner = gridTiles( container )[ 0 ].querySelector<HTMLElement>( '.wplus-group-call-input-video-inner' )!;
        expect( inner.dataset.tapped ).toBeUndefined();
        fireEvent.click( inner );
        expect( inner.dataset.tapped ).toBe( '1' );
        act( () => { vi.advanceTimersByTime( 4100 ); } );
        expect( inner.dataset.tapped ).toBeUndefined();
    } );

    it( 'gives a spotlighted computer\'s camera its own height on a phone held upright, the others a grid below it', () => {
        const people = crowd( 6, ( i ) => i === 0 ? landscape : portrait );
        const { container } = render( <CallScreen call={ { ...fakeCall( { participants: people, spotlight: [ 'user_100' ] } ), wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        const main = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-primary' )!;
        const rest = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
        // 390 wide less the grid's gutters, at 16:9
        expect( parseFloat( main.style.height ) ).toBeCloseTo( 390 / ( 1280 / 720 ), 0 );
        expect( parseFloat( rest.style.height ), 'the others have only a strip' ).toBeGreaterThan( 400 );
        expect( gridTiles( container ).map( ( t ) => t.dataset.key ).sort() ).toEqual( [ 'me', 'user_101', 'user_102', 'user_103', 'user_104' ] );
    } );

    it( 'stands the others in a column beside the spotlight on a phone on its side', () => {
        stage = { width: 844, height: 390 };
        const { container } = render( <CallScreen call={ { ...fakeCall( { participants: crowd( 6, () => landscape ), spotlight: [ 'user_100' ] } ), wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid' )!.dataset.split ).toBe( 'beside' );
    } );

    it( 'lays the grid out again as the phone turns, each picture weighed whole in its cell', () => {
        const people = crowd( 5, () => landscape );
        people.set( 'me', participant( 'me', { name: 'Ben', video: fakeTrack(), videoPub: landscape, videoPublished: true } ) );
        const { container } = screen( people );
        expect( gridTiles( container ).map( ( t ) => t.style.width ), 'held upright, five computers\' cameras are not wide rows' ).toEqual( [ '100%', '100%', '100%', '100%', '100%' ] );

        stage = { width: 844, height: 390 };
        act( () => { window.dispatchEvent( new Event( 'resize' ) ); vi.advanceTimersByTime( 1100 ); } );
        // Two across would be cells 3.8 times as wide as tall, strips: three across are cells of the cameras' own shape.
        expect( gridTiles( container ).map( ( t ) => Math.round( parseFloat( t.style.width ) ) ), 'turned on its side, the phone does not put the cameras three across' ).toEqual( [ 33, 33, 33, 33, 33 ] );
    } );

    it( 'leaves a computer\'s call as it was: no swipe, and no camera cut to its tile', () => {
        delete ( window as unknown as { Better_Messages?: object } ).Better_Messages;
        stage = { width: 1200, height: 800 };
        const { container } = screen( crowd( 4 ) );
        expect( gridTiles( container ).map( ( t ) => t.dataset.key ) ).toContain( 'me' );
        expect( container.querySelector( '.wplus-cover-video' ) ).toBeNull();
        expect( container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!.dataset.swipe ).toBeUndefined();
    } );

    it( 'holds the spotlight and the strip under it at their pictures\' shape, in the middle of the phone', () => {
        // An iPhone's page under Safari's bars, 390 by 664, 604 less its dock, less the spotlight's 16:9 picture: a strip
        // 390 by 385, where two cameras were rows the phone's width, their pictures with the tile's colour either side.
        stage = { width: 390, height: 664 };
        const people = crowd( 3, () => landscape );
        people.set( 'me', participant( 'me', { name: 'Ben', video: fakeTrack(), videoPub: landscape, videoPublished: true } ) );
        const call = fakeCall( { participants: people, spotlight: [ 'user_100' ] } );
        const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        const main = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-primary' )!;
        const block = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
        const blocks = [ { block: main, tiles: [ ...main.querySelectorAll<HTMLElement>( ':scope > [data-key]' ) ] }, { block, tiles: gridTiles( container ) } ];
        expect( blocks[ 1 ].tiles.map( ( t ) => t.dataset.key ).sort() ).toEqual( [ 'me', 'user_101' ] );
        // Each tile's picture, inside its gutter of 4 pixels a side, at the camera's shape, and its row in the middle.
        for ( const { block: one, tiles } of blocks ) {
            const height = parseFloat( one.style.height );
            for ( const tile of tiles ) {
                const width = parseFloat( tile.style.width ), left = parseFloat( tile.style.left ) || 0;
                expect( ( stage.width * width / 100 - 8 ) / ( height * parseFloat( tile.style.height ) / 100 - 8 ), tile.dataset.key ).toBeCloseTo( 16 / 9, 2 );
                expect( left + width / 2, tile.dataset.key ).toBeCloseTo( 50, 4 );
            }
        }
        expect( parseFloat( blocks[ 1 ].tiles[ 0 ].style.width ), 'a camera is narrower than the phone at the strip\'s rows' ).toBeLessThan( 100 );
        // The two blocks in the middle of the phone's height, the dock's 60 pixels under it.
        const above = parseFloat( main.style.marginTop ) || 0;
        const below = stage.height - 60 - above - parseFloat( main.style.height ) - parseFloat( block.style.height );
        expect( Math.abs( above - below ), `above ${ above }, below ${ below }` ).toBeLessThanOrEqual( 1 );
    } );
} );
