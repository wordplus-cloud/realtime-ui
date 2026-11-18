import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, SPOTLIGHT_MOST, mainKeys, spotlitKeys, type CallParticipant } from '../src/calls.ts';
import { fakeCall, participant } from './fake-call.ts';

// Spotlight for everyone and Pin for Me (spotlight.tsx): the main tiles a moderator puts up for everyone, the room's,
// and the ones a member pins for themselves, which wait while a spotlight is on.

const shown: unknown[] = [];

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: ( e ) => { shown.push( e ); } } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ], [ 44, { name: 'Dan' } ] ] );
    shown.length = 0;
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

const people = ( ...more: Person[] ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { identity: 'user_42', name: 'Ben' } ) ],
    ...more.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ),
] );

const screen = ( over: Parameters<typeof fakeCall>[ 0 ] ) => {
    const call = fakeCall( over );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const rendered = render( draw() );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    return { call, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => {
        rendered.rerender( draw( more ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
    } };
};

const main = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-group-call-videos-grid-primary [data-key]' ) ].map( ( el ) => el.getAttribute( 'data-key' ) );
const labeled = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-call-spotlight-label' ) ].map( ( el ) => el.closest( '[data-key]' )!.getAttribute( 'data-key' ) );
const tile = ( container: HTMLElement, key: string ) => container.querySelector<HTMLElement>( `.wplus-group-call-input-video[data-key="${ key }"]` )!;
const menuRow = ( container: HTMLElement, label: string ) => container.querySelector<HTMLElement>( `.wplus-call-moderation-person [aria-label="${ label }"]` );

describe( 'the spotlight for everyone', () => {
    it( 'is the main block, in the order the room keeps it, each tile labeled, an older client\'s pin as one too', () => {
        const ann = person( 34, 'Ann' ), cara = person( 43, 'Cara' ), dan = person( 44, 'Dan', { isPinned: true } );
        const { container } = screen( { participants: people( ann, cara, dan ), spotlight: [ 'user_43', 'user_99', 'user_42' ] } );

        expect( main( container ) ).toEqual( [ 'user_43', 'me', 'user_44' ] );
        expect( labeled( container ).sort() ).toEqual( [ 'me', 'user_43', 'user_44' ] );
    } );

    it( 'comes before a member\'s own pin, which shows again once nobody is in it', () => {
        const ann = person( 34, 'Ann' ), cara = person( 43, 'Cara' );
        const { container, redraw } = screen( { participants: people( ann, cara ) } );
        expect( main( container ) ).toEqual( [] );

        // A member's Pin for Me, on the tile.
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-pin-for-me' )! );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( main( container ) ).toEqual( [ 'user_34' ] );
        expect( tile( container, 'user_34' ).querySelector( '.wplus-pin-for-me' )!.getAttribute( 'aria-pressed' ) ).toBe( 'true' );

        redraw( { participants: people( ann, cara ), spotlight: [ 'user_43' ] } );
        expect( main( container ) ).toEqual( [ 'user_43' ] );

        redraw( { participants: people( ann, cara ), spotlight: [] } );
        expect( main( container ), 'the pin did not come back after the spotlight' ).toEqual( [ 'user_34' ] );
    } );

    it( 'takes Pin for Me away while anyone is in it, but not the Unpin of a tile already pinned', () => {
        const ann = person( 34, 'Ann' ), cara = person( 43, 'Cara' ), dan = person( 44, 'Dan' );
        const { container, redraw } = screen( { participants: people( ann, cara, dan ) } );
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-pin-for-me' )! );
        act( () => { vi.advanceTimersByTime( 1000 ); } );

        redraw( { participants: people( ann, cara, dan ), spotlight: [ 'user_43' ] } );
        expect( tile( container, 'user_44' ).querySelector( '.wplus-pin-for-me' ), 'a pin offered under the spotlight' ).toBeNull();
        expect( tile( container, 'user_34' ).querySelector( '.wplus-pin-for-me' )!.getAttribute( 'aria-pressed' ) ).toBe( 'true' );

        // A moderator's menu for the person, the same.
        redraw( { adminMode: true, participants: people( ann, cara, dan ), spotlight: [ 'user_43' ] } );
        fireEvent.click( tile( container, 'user_44' ).querySelector( '.wplus-manage-participant' )! );
        expect( menuRow( container, 'Pin for Me' ) ).toBeNull();

        redraw( { participants: people( ann, cara, dan ), spotlight: [] } );
        expect( tile( container, 'user_44' ).querySelector( '.wplus-pin-for-me' ), 'Pin for Me did not come back' ).not.toBeNull();
    } );

    it( 'in broadcast mode, a pin alone is large, the speakers going to the others', () => {
        const ann = person( 34, 'Ann', { canPublish: true } ), cara = person( 43, 'Cara', { canAdmin: true } ), dan = person( 44, 'Dan', { canAdmin: true } );
        const { container } = screen( { participants: people( ann, cara, dan ), callMode: 'broadcast', canPublish: false } );
        expect( main( container ) ).toEqual( expect.arrayContaining( [ 'user_34', 'user_43', 'user_44' ] ) );

        fireEvent.click( tile( container, 'user_43' ).querySelector( '.wplus-pin-for-me' )! );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( main( container ), 'the pin stood among the speakers' ).toEqual( [ 'user_43' ] );
    } );

    it( 'lets a moderator spotlight and take someone out from their menu, up to four, and clear it from Host Controls', async () => {
        const four = [ person( 34, 'Ann' ), person( 43, 'Cara' ), person( 44, 'Dan' ), person( 45, 'Eve' ), person( 46, 'Fay' ) ];
        const { container, call, redraw } = screen( { adminMode: true, participants: people( ...four ) } );

        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        expect( menuRow( container, 'Pin Participant' ), 'the old pin for everyone is still offered' ).toBeNull();
        await act( async () => { fireEvent.click( menuRow( container, 'Spotlight for Everyone' )! ); } );
        expect( call.calls ).toContain( 'moderate {"act":"spotlight_participant","type":"video","identity":"user_34"}' );

        redraw( { adminMode: true, participants: people( ...four ), spotlight: [ 'user_34' ] } );
        expect( menuRow( container, 'Remove Spotlight' ) ).not.toBeNull();
        await act( async () => { fireEvent.click( menuRow( container, 'Remove Spotlight' )! ); } );
        expect( call.calls ).toContain( 'moderate {"act":"unspotlight_participant","type":"video","identity":"user_34"}' );

        // Four in it already: a fifth is not offered, and the row says why.
        redraw( { adminMode: true, participants: people( ...four ), spotlight: [ 'user_43', 'user_44', 'user_45', 'user_46' ].slice( 0, SPOTLIGHT_MOST ) } );
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        const fifth = menuRow( container, 'Spotlight for Everyone' )!;
        expect( fifth.getAttribute( 'aria-disabled' ) ).toBe( 'true' );
        expect( fifth.textContent ).toContain( 'Up to four people can be in the spotlight.' );
        const before = call.calls.length;
        fireEvent.click( fifth );
        expect( call.calls.length ).toBe( before );

        fireEvent.click( container.querySelector( '.wplus-host-controls' )! );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-clear-spotlight' )! ); } );
        expect( call.calls ).toContain( 'moderate {"act":"unspotlight_participant","type":"video"}' );
    } );

    it( 'says a fifth refused by the server in the call\'s own words', async () => {
        const full = Object.assign( new Error( 'x' ), { response: { data: { code: 'spotlight_full' } } } );
        const { container } = screen( { adminMode: true, participants: people( person( 34, 'Ann' ) ), moderate: async () => { throw full; } } );
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        await act( async () => { fireEvent.click( menuRow( container, 'Spotlight for Everyone' )! ); } );
        expect( shown ).toEqual( [ 'Up to four people can be in the spotlight.' ] );
    } );

    it( 'is offered to nobody but a moderator, where the call takes it', () => {
        const { container } = screen( { participants: people( person( 34, 'Ann' ) ), spotlight: [ 'user_34' ] } );
        expect( container.querySelector( '.wplus-manage-participant' ) ).toBeNull();
        expect( labeled( container ) ).toEqual( [ 'user_34' ] );

        cleanup();
        const pinsOnly = screen( { adminMode: true, moderation: [ 'pin_participant', 'unpin_participant' ], participants: people( person( 34, 'Ann' ) ) } );
        fireEvent.click( tile( pinsOnly.container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        expect( menuRow( pinsOnly.container, 'Spotlight for Everyone' ) ).toBeNull();
        expect( menuRow( pinsOnly.container, 'Pin Participant' ) ).not.toBeNull();
    } );
} );

describe( 'a tile back from the main block', () => {
    // The grid's tiles in the order they stand: page, row, column.
    const order = ( container: HTMLElement ) => [ ...container.querySelectorAll<HTMLElement>( '.wplus-group-call-videos-grid-secondary > [data-key]' ) ]
        .map( ( el ) => ( { key: el.getAttribute( 'data-key' ), x: parseFloat( el.style.left ), y: parseFloat( el.style.top ) } ) )
        .sort( ( a, b ) => Math.floor( a.x / 100 ) - Math.floor( b.x / 100 ) || a.y - b.y || a.x - b.x )
        .map( ( t ) => t.key );
    const five = [ person( 34, 'Ann' ), person( 43, 'Cara' ), person( 44, 'Dan' ), person( 45, 'Eve' ) ];
    const pin = ( container: HTMLElement, key: string ) => {
        fireEvent.click( tile( container, key ).querySelector( '.wplus-pin-for-me' )! );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
    };

    it( 'takes its place again as it is unpinned, in a call of five', () => {
        const { container } = screen( { participants: people( ...five ) } );
        const before = order( container );
        expect( before ).toEqual( [ 'user_34', 'user_43', 'user_44', 'user_45', 'me' ] );

        pin( container, 'user_43' );
        expect( main( container ) ).toEqual( [ 'user_43' ] );
        pin( container, 'user_43' );
        expect( main( container ) ).toEqual( [] );
        expect( order( container ), 'Cara came back elsewhere' ).toEqual( before );

        // One further on, twice over.
        pin( container, 'user_44' );
        pin( container, 'user_34' );
        pin( container, 'user_44' );
        pin( container, 'user_34' );
        expect( order( container ) ).toEqual( before );
    } );

    it( 'takes its place again as the spotlight ends', () => {
        const { container, redraw } = screen( { participants: people( ...five ) } );
        const before = order( container );

        redraw( { participants: people( ...five ), spotlight: [ 'user_44' ] } );
        expect( main( container ) ).toEqual( [ 'user_44' ] );
        redraw( { participants: people( ...five ), spotlight: [] } );
        expect( order( container ), 'Dan came back elsewhere' ).toEqual( before );
    } );

    it( 'keeps its place while someone joins, who comes after the others', () => {
        const { container, redraw } = screen( { participants: people( ...five ) } );
        pin( container, 'user_43' );
        redraw( { participants: people( ...five, person( 46, 'Fay' ) ) } );
        pin( container, 'user_43' );
        expect( order( container ) ).toEqual( [ 'user_34', 'user_43', 'user_44', 'user_45', 'user_46', 'me' ] );
    } );
} );

describe( 'the main tiles', () => {
    const map = ( ...entries: Person[] ) => new Map( entries.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ) );

    it( 'are the spotlight, else the pins, else a broadcast\'s speakers', () => {
        const everyone = map( person( 1, 'A' ), person( 2, 'B', { canPublish: false } ), person( 3, 'C' ) );
        expect( spotlitKeys( everyone, [ 'user_3', 'user_3', 'user_1' ] ) ).toEqual( [ 'user_3', 'user_1' ] );
        expect( mainKeys( everyone, [ 'user_3' ], new Set( [ 'user_1' ] ), true ) ).toEqual( [ 'user_3' ] );
        expect( mainKeys( everyone, [], new Set( [ 'user_2', 'gone' ] ), false ) ).toEqual( [ 'user_2' ] );
        expect( mainKeys( everyone, undefined, new Set( [ 'user_3' ] ), true ), 'a pin stood among the speakers' ).toEqual( [ 'user_3' ] );
        expect( mainKeys( everyone, undefined, new Set( [ 'gone' ] ), true ) ).toEqual( [ 'user_1', 'user_3' ] );
    } );
} );
