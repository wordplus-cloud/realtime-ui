import React, { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallScreen, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// A group video call on a computer (group-video-grid.tsx, not `touch`): how many columns the grid takes, each tile's
// picture letterboxed at its own shape, a cell longer than a strip worth less, and the evener of two near the same.

let stage = { width: 975, height: 1110 };
const DOCK = 60;

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    window.localStorage.clear();
    vi.useFakeTimers( { toFake: [ 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame' ] } );
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? DOCK : stage.height + DOCK;
        return { width: stage.width, height, top: 0, left: 0, right: stage.width, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
    } );
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
} );

const landscape = { dimensions: { width: 1280, height: 720 } };
const upright = { dimensions: { width: 720, height: 1280 } };

const camera = ( key: string, pub: typeof landscape ) => [ key, participant( key, { identity: key, name: key, video: fakeTrack(), videoPub: pub, videoPublished: true } ) ] as [ string, CallParticipant ];
const none = ( key: string ) => [ key, participant( key, { identity: key, name: key } ) ] as [ string, CallParticipant ];

function columnsOf( people: [ string, CallParticipant ][] ): number {
    const call = fakeCall( { participants: new Map( people ) } );
    const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    const tiles = [ ...container.querySelectorAll<HTMLElement>( '.wplus-group-call-videos-grid-secondary > .wplus-group-call-input-video[data-key]' ) ];
    expect( tiles.length ).toBe( people.length );
    return new Set( tiles.map( ( tile ) => tile.style.left ) ).size;
}

describe( 'the grid on a computer', () => {
    it( 'takes two by two for four in a stage taller than wide, an upright camera among them, not a column of strips', () => {
        stage = { width: 975, height: 1110 };
        expect( columnsOf( [ camera( 'me', landscape ), camera( 'user_1', landscape ), camera( 'user_2', upright ), none( 'user_3' ) ] ) ).toBe( 2 );
    } );

    it( 'takes two by two there for four landscape cameras too, the near tie going to the evener grid', () => {
        stage = { width: 975, height: 1110 };
        expect( columnsOf( [ camera( 'me', landscape ), camera( 'user_1', landscape ), camera( 'user_2', landscape ), camera( 'user_3', landscape ) ] ) ).toBe( 2 );
    } );

    it( 'still lays four landscape cameras side by side in a wide stage', () => {
        stage = { width: 1600, height: 400 };
        expect( columnsOf( [ camera( 'me', landscape ), camera( 'user_1', landscape ), camera( 'user_2', landscape ), camera( 'user_3', landscape ) ] ) ).toBe( 4 );
    } );
} );

// A call with someone in the spotlight: every tile at its picture's shape, and the spotlight and the strip under it or
// the column beside it together in the middle of the call. The strip's one tile was the strip's whole width once the
// strip stood 200 pixels tall, a wide dark tile with the picture small in its middle, and a tile of the picture's shape a
// pixel shorter (seen 2026-11-02 in one call in Firefox and in Chrome, whose windows left the strip on either side of
// that line). Then the tiles stood from the start, and a phone's upright camera in the spotlight beside a column of two
// left the call's right side empty (asked on 2026-11-02: "they should be centered at screen at least instead of having
// empty space at right side").

// A tile's gutter, its padding on both sides, which the picture is drawn inside (group-video-grid.tsx, TILE_GUTTER).
const GUTTER = 8;

type Placed = { key: string, main: boolean, x: number, y: number, w: number, h: number };

/** Every tile's place in the stage, in pixels: each block where the grid puts it, the tile where its block does. */
function composition( people: [ string, CallParticipant ][], spotlight: string[] ) {
    const call = fakeCall( { participants: new Map( people ), spotlight } );
    const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    const beside = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid' )!.dataset.split === 'beside';
    const main = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-primary' )!;
    const rest = container.querySelector<HTMLElement>( '.wplus-group-call-videos-grid-secondary' )!;
    // Beside, each block's width is a share of the stage's and the room before the first a share across; over, the
    // blocks are the stage's width and the room before the first is down.
    const widthOf = ( block: HTMLElement ) => block.style.width ? stage.width * parseFloat( block.style.width ) / 100 : stage.width;
    const across = beside ? stage.width * ( parseFloat( main.style.getPropertyValue( 'margin-inline-start' ) ) || 0 ) / 100 : 0;
    const down = beside ? 0 : parseFloat( main.style.marginTop ) || 0;
    const mainBox = { x: across, y: down, w: widthOf( main ), h: parseFloat( main.style.height ) };
    const restBox = beside
        ? { x: across + mainBox.w, y: 0, w: widthOf( rest ), h: parseFloat( rest.style.height ) }
        : { x: 0, y: down + mainBox.h, w: stage.width, h: parseFloat( rest.style.height ) || 0 };
    const placed = ( block: HTMLElement, box: typeof mainBox, isMain: boolean ): Placed[] => [ ...block.querySelectorAll<HTMLElement>( ':scope > .wplus-group-call-input-video[data-key]' ) ].map( ( tile ) => ( {
        key: tile.dataset.key!, main: isMain,
        x: box.x + box.w * parseFloat( tile.style.left ) / 100, y: box.y + box.h * parseFloat( tile.style.top ) / 100,
        w: box.w * parseFloat( tile.style.width ) / 100, h: box.h * parseFloat( tile.style.height ) / 100,
    } ) );
    return { beside, restBox, tiles: [ ...placed( main, mainBox, true ), ...placed( rest, restBox, false ) ] };
}

/** The shape of the picture a tile draws, inside its gutter. */
const shapeOf = ( tile: Placed ) => ( tile.w - GUTTER ) / ( tile.h - GUTTER );

/** The room the tiles leave on each side of `box`. */
const roomIn = ( tiles: Placed[], box = { x: 0, y: 0, w: stage.width, h: stage.height } ) => ( {
    left: Math.min( ...tiles.map( ( tile ) => tile.x ) ) - box.x,
    right: box.x + box.w - Math.max( ...tiles.map( ( tile ) => tile.x + tile.w ) ),
    top: Math.min( ...tiles.map( ( tile ) => tile.y ) ) - box.y,
    bottom: box.y + box.h - Math.max( ...tiles.map( ( tile ) => tile.y + tile.h ) ),
} );

/** The same room on both sides, across and down, within a pixel, and none of it less than nothing. */
function expectInTheMiddle( tiles: Placed[], what: string, box?: { x: number, y: number, w: number, h: number } ) {
    const room = roomIn( tiles, box );
    expect( Math.abs( room.left - room.right ), `${ what }: room left ${ room.left }, right ${ room.right }` ).toBeLessThanOrEqual( 1 );
    expect( Math.abs( room.top - room.bottom ), `${ what }: room above ${ room.top }, below ${ room.bottom }` ).toBeLessThanOrEqual( 1 );
    expect( Math.min( room.left, room.top ), what ).toBeGreaterThanOrEqual( -0.5 );
}

describe( 'the spotlight and the rest on a computer', () => {
    it( 'holds the strip\'s one tile at its picture\'s shape in the middle under the spotlight, on either side of a strip 200 pixels tall', () => {
        // 1000 wide, the spotlight's 16:9 picture 562.5 tall: the room under it 167.5, 201.5 and 337.5 pixels.
        for ( const height of [ 730, 764, 900 ] ) {
            stage = { width: 1000, height };
            const { tiles } = composition( [ camera( 'me', landscape ), camera( 'user_1', landscape ) ], [ 'user_1' ] );
            const strip = tiles.filter( ( tile ) => ! tile.main );
            expect( strip.map( ( tile ) => tile.key ) ).toEqual( [ 'me' ] );
            for ( const tile of tiles ) expect( shapeOf( tile ), `${ tile.key } in a stage ${ height } tall` ).toBeCloseTo( 16 / 9, 2 );
            expectInTheMiddle( strip, `the strip's tile in a stage ${ height } tall`, { x: 0, y: strip[ 0 ].y, w: stage.width, h: strip[ 0 ].h } );
            expectInTheMiddle( tiles, `the call in a stage ${ height } tall` );
            cleanup();
        }
    } );

    it( 'lays one, two and three under a landscape spotlight at their pictures\' shape, in the middle of the call', () => {
        for ( const size of [ { width: 1440, height: 734 }, { width: 1000, height: 900 } ] ) {
            for ( const count of [ 1, 2, 3 ] ) {
                stage = size;
                const others = [ 2, 3, 4 ].slice( 0, count - 1 ).map( ( i ) => camera( 'user_' + i, landscape ) );
                const { tiles } = composition( [ camera( 'me', landscape ), camera( 'user_1', landscape ), ...others ], [ 'user_1' ] );
                const what = `${ count } under the spotlight in ${ size.width } by ${ size.height }`;
                expect( tiles.filter( ( tile ) => ! tile.main ), what ).toHaveLength( count );
                for ( const tile of tiles ) expect( shapeOf( tile ), `${ what }: ${ tile.key }` ).toBeCloseTo( 16 / 9, 2 );
                expectInTheMiddle( tiles, what );
                const strip = tiles.filter( ( tile ) => ! tile.main );
                const row = roomIn( strip );
                expect( Math.abs( row.left - row.right ), `${ what }: the strip's room left ${ row.left }, right ${ row.right }` ).toBeLessThanOrEqual( 1 );
                cleanup();
            }
        }
    } );

    it( 'lays two in the spotlight and the one under them at their pictures\' shape, in the middle of the call', () => {
        stage = { width: 1440, height: 734 };
        const { tiles } = composition( [ camera( 'me', landscape ), camera( 'user_1', landscape ), camera( 'user_2', landscape ) ], [ 'user_1', 'user_2' ] );
        expect( tiles.filter( ( tile ) => tile.main ).map( ( tile ) => tile.key ) ).toEqual( [ 'user_1', 'user_2' ] );
        for ( const tile of tiles ) expect( shapeOf( tile ), tile.key ).toBeCloseTo( 16 / 9, 2 );
        expectInTheMiddle( tiles, 'two in the spotlight' );
        const strip = tiles.filter( ( tile ) => ! tile.main );
        expect( Math.abs( roomIn( strip ).left - roomIn( strip ).right ) ).toBeLessThanOrEqual( 1 );
    } );

    it( 'stands a phone\'s upright camera in the spotlight and the column of two beside it together in the middle of the call', () => {
        // The layout chosen: the spotlight's 9:16 picture full height on the left, two 16:9 tiles in a column beside it, and
        // the right of the call empty.
        stage = { width: 1440, height: 734 };
        const { beside, restBox, tiles } = composition( [ camera( 'me', landscape ), camera( 'user_1', upright ), camera( 'user_2', landscape ) ], [ 'user_1' ] );
        expect( beside ).toBe( true );
        const main = tiles.filter( ( tile ) => tile.main ), column = tiles.filter( ( tile ) => ! tile.main );
        expect( main.map( ( tile ) => tile.key ) ).toEqual( [ 'user_1' ] );
        expect( shapeOf( main[ 0 ] ) ).toBeCloseTo( 9 / 16, 2 );
        for ( const tile of column ) expect( shapeOf( tile ), tile.key ).toBeCloseTo( 16 / 9, 2 );
        expect( roomIn( tiles ).left, 'there is room either side to share' ).toBeGreaterThan( 50 );
        expectInTheMiddle( tiles, 'the spotlight and its column' );
        // The column against the spotlight, its tiles in the middle of its height.
        expect( Math.abs( main[ 0 ].x + main[ 0 ].w - restBox.x ) ).toBeLessThanOrEqual( 1 );
        const room = roomIn( column, restBox );
        expect( Math.abs( room.top - room.bottom ), `the column's room above ${ room.top }, below ${ room.bottom }` ).toBeLessThanOrEqual( 1 );
    } );

    it( 'holds a strip longer than the call at its pictures\' shape from its start, the next block after the last column with no gap', () => {
        stage = { width: 1000, height: 900 };
        const { tiles } = composition( [ camera( 'me', landscape ), camera( 'user_1', landscape ), ...Array.from( { length: 23 }, ( _, i ) => camera( 'user_' + ( i + 2 ), landscape ) ) ], [ 'user_1' ] );
        const strip = tiles.filter( ( tile ) => ! tile.main );
        expect( strip.length, 'tiles far along the strip are not drawn' ).toBeGreaterThan( 12 );
        for ( const tile of tiles ) expect( shapeOf( tile ), tile.key ).toBeCloseTo( 16 / 9, 2 );
        expect( Math.max( ...strip.map( ( tile ) => tile.x + tile.w ) ), 'the strip is longer than the call' ).toBeGreaterThan( stage.width );
        // Every column one tile's width after the one before it, the first at the start.
        const lefts = [ ...new Set( strip.map( ( tile ) => Math.round( tile.x * 10 ) / 10 ) ) ].sort( ( a, b ) => a - b );
        lefts.forEach( ( left, at ) => expect( Math.abs( left - at * strip[ 0 ].w ), `column ${ at }` ).toBeLessThanOrEqual( 0.5 ) );
    } );
} );
