import React, { createRef } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// A person's tile drawn again elsewhere, as a spotlight or Speaker moves them between the large tiles and the rest
// (asked on 2026-10-30: "the animation is not smooth when I changing layout or spotlight user"): their picture and
// sound play on in the same elements (kept-media.tsx), and the tile moves from where it was.

const moves: { key: string | null, from: string }[] = [];

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    vi.useFakeTimers();
    moves.length = 0;
    // Ann's tile: small at 500,400 among the rest, large at 0,0 in the spotlight.
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
        if ( this.getAttribute?.( 'data-key' ) === 'user_34' ) {
            return ( this.closest( '.wplus-group-call-videos-grid-primary' )
                ? { width: 800, height: 450, top: 0, left: 0, right: 800, bottom: 450, x: 0, y: 0 }
                : { width: 200, height: 120, top: 400, left: 500, right: 700, bottom: 520, x: 500, y: 400 } ) as DOMRect;
        }
        return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
    } );
    ( Element.prototype as unknown as { animate: unknown } ).animate = function( this: Element, frames: Keyframe[] ){
        moves.push( { key: this.getAttribute( 'data-key' ), from: String( frames[ 0 ].transform ) } );
        return { cancel(){}, finished: Promise.resolve() };
    };
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete ( Element.prototype as unknown as { animate?: unknown } ).animate;
} );

const people = () => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { identity: 'user_42', name: 'Ben' } ) ],
    [ 'user_34', participant( 'user_34', { identity: 'user_34', name: 'Ann', video: fakeTrack(), audio: fakeTrack() } ) ],
    [ 'user_43', participant( 'user_43', { identity: 'user_43', name: 'Cara', video: fakeTrack() } ) ],
] );

const screen = ( participants: Map<string, CallParticipant> ) => {
    const call = fakeCall( { participants } );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const rendered = render( draw() );
    act( () => { vi.advanceTimersByTime( 1000 ); } );
    return { ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => {
        rendered.rerender( draw( more ) );
        act( () => { vi.advanceTimersByTime( 50 ); } );
    } };
};

const media = ( container: HTMLElement, key: string, selector: string ) =>
    container.querySelector<HTMLMediaElement>( `.wplus-group-call-input-video[data-key="${ key }"] ${ selector }` );

describe( 'a tile drawn again elsewhere', () => {
    it( 'plays on in the same video and audio elements as someone goes into the spotlight and back', () => {
        const participants = people();
        const { container, redraw } = screen( participants );
        const camera = media( container, 'user_34', 'video[datatype="camera"]' );
        const sound = media( container, 'user_34', 'audio' );
        expect( camera ).not.toBeNull();
        expect( sound ).not.toBeNull();
        expect( container.querySelector( '.wplus-group-call-videos-grid-primary [data-key="user_34"]' ) ).toBeNull();

        redraw( { participants, spotlight: [ 'user_34' ] } );
        expect( container.querySelector( '.wplus-group-call-videos-grid-primary [data-key="user_34"]' ) ).not.toBeNull();
        expect( media( container, 'user_34', 'video[datatype="camera"]' ) ).toBe( camera );
        expect( media( container, 'user_34', 'audio' ) ).toBe( sound );
        expect( camera!.isConnected ).toBe( true );
        // The track was attached once, to the element that went on playing.
        expect( ( participants.get( 'user_34' )!.video as ReturnType<typeof fakeTrack> ).attached ).toEqual( [ camera ] );

        redraw( { participants, spotlight: [] } );
        expect( container.querySelector( '.wplus-group-call-videos-grid-secondary [data-key="user_34"]' ) ).not.toBeNull();
        expect( media( container, 'user_34', 'video[datatype="camera"]' ) ).toBe( camera );
    } );

    it( 'moves from where it was, unless the browser asks for less motion', () => {
        const participants = people();
        const { redraw } = screen( participants );

        redraw( { participants, spotlight: [ 'user_34' ] } );
        expect( moves ).toEqual( [ { key: 'user_34', from: 'translate(500px, 400px) scale(0.25, 0.26666666666666666)' } ] );

        moves.length = 0;
        const still = vi.spyOn( window, 'matchMedia' ).mockImplementation( ( query: string ) => ( { matches: query.includes( 'reduce' ), media: query, addEventListener(){}, removeEventListener(){} } ) as unknown as MediaQueryList );
        redraw( { participants, spotlight: [] } );
        expect( moves ).toEqual( [] );
        still.mockRestore();
    } );

    it( 'lets an element go a moment after the last tile drawing it went', () => {
        const participants = people();
        const { container, unmount } = screen( participants );
        const camera = media( container, 'user_34', 'video[datatype="camera"]' )!;
        unmount();
        act( () => { vi.advanceTimersByTime( 1500 ); } );
        const again = screen( participants ).container;
        expect( media( again, 'user_34', 'video[datatype="camera"]' ) ).not.toBe( camera );
    } );
} );
