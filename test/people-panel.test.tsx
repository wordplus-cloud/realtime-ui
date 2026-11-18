import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, LAYOUT_KEY, PEOPLE_COLUMN_FROM, PEOPLE_SEARCH_FROM, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// Participants (people-panel.tsx): everyone in a group call in one list, from the dock, where the stage doesn't show
// everyone at once.

/** The user's own tile hidden (Hide Self View), so a video call's stage leaves someone out and offers the list. */
const hideSelf = () => window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );

/** An audio call's roster taller than its stage, someone scrolled out of view. */
const tallRoster = () => vi.spyOn( Element.prototype, 'scrollHeight', 'get' ).mockImplementation( function( this: Element ) {
    return this.classList?.contains( 'wplus-group-call-audios-grid' ) ? 1000 : 0;
} );

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ], [ 44, { name: 'Dan' } ] ] );
    window.localStorage.clear();
    hideSelf();
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
} );

type Person = [ string, Partial<CallParticipant> ];

const people = ( ...more: Person[] ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { name: 'Ben' } ) ],
    ...more.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ),
] );

const ann = ( extra: Partial<CallParticipant> = {} ): Person => [ 'user_34', { identity: 'user_34', name: 'Ann', ...extra } ];
const cara = ( extra: Partial<CallParticipant> = {} ): Person => [ 'user_43', { identity: 'user_43', name: 'Cara', ...extra } ];
const dan = ( extra: Partial<CallParticipant> = {} ): Person => [ 'user_44', { identity: 'user_44', name: 'Dan', ...extra } ];

const screen = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'group-video' | 'group-audio' = 'group-video' ) => {
    const call = fakeCall( over );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
    const rendered = render( draw() );
    return { call, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

const toggle = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-people-toggle' )!;
const list = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-people' );
const names = ( container: HTMLElement ) => Array.from( container.querySelectorAll( '.wplus-call-people-row' ) ).map( ( row ) => row.querySelector( '.wplus-call-people-name-text' )!.textContent );
const row = ( container: HTMLElement, key: string ) => container.querySelector<HTMLElement>( `.wplus-call-people-row[data-person="${ key }"]` )!;
const marks = ( container: HTMLElement, key: string ) => Array.from( row( container, key ).querySelectorAll( '[role="img"]' ) ).map( ( el ) => el.getAttribute( 'aria-label' ) );
const tags = ( container: HTMLElement, key: string ) => Array.from( row( container, key ).querySelectorAll( '.wplus-call-people-tag' ) ).map( ( el ) => el.textContent );

describe( 'Participants', () => {
    it( 'is in the dock with how many are in the call, and opens and closes the list', () => {
        const { container } = screen( { participants: people( ann(), cara() ) } );
        expect( toggle( container ).querySelector( '.wplus-call-people-count' )!.textContent ).toBe( '3' );
        expect( list( container ) ).toBeNull();

        fireEvent.click( toggle( container ) );
        expect( list( container ) ).not.toBeNull();
        expect( toggle( container ).getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        expect( list( container )!.querySelector( '.wplus-call-people-total' )!.textContent ).toBe( '3' );

        fireEvent.click( container.querySelector( '.wplus-call-people-close' )! );
        expect( list( container ) ).toBeNull();
    } );

    it( 'has Add Person at its top where the call can add people, which More no longer has, and an audio call has it in More', async () => {
        const adds = { people: async () => [ { id: 44, name: 'Dan' } ], addPerson: async () => {} };
        const video = screen( { participants: people( ann() ), ...adds } );
        const more = video.container.querySelector<HTMLElement>( '.wplus-call-more' )!;
        fireEvent.click( more );
        expect( video.container.querySelector( '.wplus-call-more-menu .wplus-add-person' ), 'Add Person is in More' ).toBeNull();
        fireEvent.click( more );
        fireEvent.click( toggle( video.container ) );
        const add = list( video.container )!.querySelector<HTMLElement>( '.wplus-call-people-head .wplus-add-person' );
        expect( add?.textContent, 'no Add Person at the top of Participants' ).toBe( 'Add Person' );
        expect( add!.getAttribute( 'role' ) ).toBe( 'button' );
        await act( async () => { fireEvent.click( add! ); } );
        expect( video.container.querySelector( '.wplus-call-add-person' ), 'Add Person opened nothing' ).not.toBeNull();
        video.unmount();

        // An audio call has no Participants: Add Person is in More, as in a call between two, and as all More would
        // hold, its own button in More's place.
        const audio = screen( { participants: people( ann() ), ...adds }, 'group-audio' );
        expect( audio.container.querySelector( '.wplus-call-more' ), 'More for Add Person alone' ).toBeNull();
        const row = audio.container.querySelector<HTMLElement>( '.wplus-group-call-controls-buttons > .wplus-add-person' );
        expect( row, 'an audio call has no Add Person' ).not.toBeNull();
        await act( async () => { fireEvent.click( row! ); } );
        expect( audio.container.querySelector( '.wplus-call-add-person' ), 'Add Person opened nothing' ).not.toBeNull();
        audio.unmount();

        // A call that can't add people: no button, and nothing in its place.
        const { container } = screen( { participants: people( ann() ) } );
        fireEvent.click( toggle( container ) );
        expect( Array.from( list( container )!.querySelector( '.wplus-call-people-head' )!.children ).map( ( el ) => el.className.split( ' ' )[ 0 ] ) )
            .toEqual( [ 'wplus-call-people-title', 'wplus-call-people-total', 'wplus-call-people-close' ] );
    } );

    it( 'lists the user first, then raised hands in the order they went up, then everyone else by name', () => {
        const { container, redraw } = screen( { participants: people( dan(), cara(), ann() ) } );
        fireEvent.click( toggle( container ) );
        expect( names( container ) ).toEqual( [ 'Ben', 'Ann', 'Cara', 'Dan' ] );

        redraw( { participants: people( dan( { handRaised: true } ), cara(), ann() ) } );
        redraw( { participants: people( dan( { handRaised: true } ), cara(), ann( { handRaised: true } ) ) } );
        expect( names( container ) ).toEqual( [ 'Ben', 'Dan', 'Ann', 'Cara' ] );

        // Dan lowers and raises again: now after Ann.
        redraw( { participants: people( dan(), cara(), ann( { handRaised: true } ) ) } );
        redraw( { participants: people( dan( { handRaised: true } ), cara(), ann( { handRaised: true } ) ) } );
        expect( names( container ) ).toEqual( [ 'Ben', 'Ann', 'Dan', 'Cara' ] );
    } );

    it( 'keeps the order of the hands while the list is closed', () => {
        const { container, redraw } = screen( { participants: people( ann(), cara() ) } );
        redraw( { participants: people( ann(), cara( { handRaised: true } ) ) } );
        redraw( { participants: people( ann( { handRaised: true } ), cara( { handRaised: true } ) ) } );
        fireEvent.click( toggle( container ) );
        expect( names( container ) ).toEqual( [ 'Ben', 'Cara', 'Ann' ] );
    } );

    it( 'says on each row who moderates, their microphone, camera, shared screen and a weak connection', () => {
        const { container } = screen( {
            moderation: undefined,
            participants: people(
                ann( { canAdmin: true, audio: fakeTrack(), video: fakeTrack() } ),
                cara( { micMuted: true, screen: fakeTrack(), quality: 'poor' } ),
                dan( { canPublish: false } ),
            ),
        } );
        fireEvent.click( toggle( container ) );

        expect( tags( container, 'user_34' ) ).toEqual( [ 'Moderator' ] );
        expect( marks( container, 'user_34' ) ).toEqual( [ 'Camera Enabled', 'Microphone Enabled' ] );
        expect( marks( container, 'user_43' ) ).toEqual( [ 'Sharing Screen', 'Camera Disabled', 'Muted by a moderator' ] );
        expect( tags( container, 'user_43' ) ).toEqual( [ 'Weak Connection' ] );
        expect( tags( container, 'user_44' ), 'a viewer' ).toEqual( [ 'Viewer' ] );
        expect( marks( container, 'user_44' ), 'a viewer has no camera or microphone to show' ).toEqual( [] );
        expect( row( container, 'me' ).querySelector( '.wplus-call-people-you' )!.textContent ).toBe( 'You' );
    } );

    it( 'searches by name once the call is large, without case or accents', () => {
        // With the user and Ann, one short of the search.
        const crowd: Person[] = Array.from( { length: PEOPLE_SEARCH_FROM - 3 }, ( _, i ) => [ 'user_' + ( 100 + i ), { identity: 'user_' + ( 100 + i ), name: 'Guest ' + i } ] );
        const { container, redraw } = screen( { participants: people( ann(), ...crowd ) } );
        fireEvent.click( toggle( container ) );
        expect( container.querySelector( '.wplus-call-people-search' ), 'searched a small call' ).toBeNull();

        redraw( { participants: people( ann(), [ 'user_43', { identity: 'user_43', name: 'Zoë' } ], ...crowd ) } );
        const search = container.querySelector<HTMLInputElement>( '.wplus-call-people-search input' )!;
        fireEvent.change( search, { target: { value: 'ZOE' } } );
        expect( names( container ) ).toEqual( [ 'Zoë' ] );

        fireEvent.change( search, { target: { value: 'nobody' } } );
        expect( names( container ) ).toEqual( [] );
        expect( container.querySelector( '.wplus-call-people-empty' )!.textContent ).toBe( 'Nothing found' );
    } );

    it( 'gives a member the list without a moderator\'s actions, and Pin for Me on a video call', () => {
        const { container } = screen( { participants: people( ann( { audio: fakeTrack(), handRaised: true } ) ) } );
        fireEvent.click( toggle( container ) );
        expect( [ ...container.querySelectorAll( '.wplus-call-people-action' ) ].map( ( el ) => el.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Pin for Me', 'Pin for Me' ] );
        fireEvent.click( row( container, 'user_34' ).querySelector( '.wplus-call-people-pin' )! );
        expect( row( container, 'user_34' ).querySelector( '.wplus-call-people-pin' )!.getAttribute( 'aria-pressed' ) ).toBe( 'true' );
        expect( container.querySelector( '.wplus-call-people-room' ) ).toBeNull();
        expect( marks( container, 'user_34' ) ).toContain( 'Hand Raised' );
    } );

    it( 'lets a moderator lower a hand, mute a microphone that is on and open the person\'s menu from the row', async () => {
        const { container, call } = screen( { adminMode: true, participants: people( ann( { audio: fakeTrack(), handRaised: true } ), cara() ) } );
        fireEvent.click( toggle( container ) );

        expect( row( container, 'user_43' ).querySelector( '.wplus-call-people-mute' ), 'muted a microphone that is off' ).toBeNull();

        await act( async () => { fireEvent.click( row( container, 'user_34' ).querySelector( '.wplus-call-people-lower-hand' )! ); } );
        await act( async () => { fireEvent.click( row( container, 'user_34' ).querySelector( '.wplus-call-people-mute' )! ); } );
        expect( call.calls ).toContain( 'lowerHand "user_34"' );
        expect( call.calls ).toContain( 'moderate {"act":"mute_mic","identity":"user_34","type":"video"}' );

        fireEvent.click( row( container, 'user_43' ).querySelector( '.wplus-call-people-more' )! );
        const menu = container.querySelector( '.wplus-call-moderation-person' );
        expect( menu?.getAttribute( 'aria-label' ) ).toBe( 'Cara' );
        expect( row( container, 'user_43' ).querySelector( '.wplus-call-people-more' )!.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        expect( list( container ), 'the menu closed the list' ).not.toBeNull();
    } );

    it( 'gives a moderator Mute Everyone and Lower All Hands at the top', async () => {
        const { container, call } = screen( { adminMode: true, participants: people( ann( { handRaised: true } ), cara( { canAdmin: true } ) ) } );
        fireEvent.click( toggle( container ) );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-people-mute-all' )! ); } );
        expect( call.calls ).toContain( 'moderate {"act":"mute_all","type":"video","identities":["user_34"]}' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-people-lower-hands' )! ); } );
        expect( call.calls ).toContain( 'lowerAllHands' );
    } );

    it( 'is a sheet over a narrow call, which a press outside or Host Controls close', () => {
        const { container } = screen( { adminMode: true, participants: people( ann() ) } );
        fireEvent.click( toggle( container ) );
        expect( list( container )!.dataset.mode ).toBe( 'sheet' );

        fireEvent.pointerDown( container.querySelector( '.wplus-group-call-videos-grid' )! );
        expect( list( container ) ).toBeNull();

        fireEvent.click( toggle( container ) );
        fireEvent.click( container.querySelector( '.wplus-host-controls' )! );
        expect( container.querySelector( '.wplus-call-moderation-room' ) ).not.toBeNull();
        expect( list( container ), 'the sheet stayed under Host Controls' ).toBeNull();

        fireEvent.click( toggle( container ) );
        expect( list( container ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-call-moderation-room' ), 'Host Controls stayed over the sheet' ).toBeNull();
    } );

    it( 'stands as a column beside the tiles on a wide call, which the tiles make room for', () => {
        const rect = HTMLElement.prototype.getBoundingClientRect;
        vi.spyOn( HTMLElement.prototype, 'getBoundingClientRect' ).mockImplementation( function ( this: HTMLElement ) {
            if ( this.classList.contains( 'wplus-group-call-container' ) ) return { width: PEOPLE_COLUMN_FROM + 200, height: 600, top: 0, left: 0, right: PEOPLE_COLUMN_FROM + 200, bottom: 600, x: 0, y: 0, toJSON() {} } as DOMRect;
            return rect.call( this );
        } );

        const { container } = screen( { participants: people( ann() ) } );
        fireEvent.click( toggle( container ) );
        expect( list( container )!.dataset.mode ).toBe( 'column' );
        expect( container.querySelector( '.wplus-group-call-container' )!.getAttribute( 'data-people' ) ).toBe( 'column' );

        fireEvent.pointerDown( container.querySelector( '.wplus-group-call-videos-grid' )! );
        expect( list( container ), 'a press on the tiles closed the column' ).not.toBeNull();
    } );

    it( 'lists a listener who has no tile of their own, who alone brings no list: they know they are there', () => {
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: true, hideSelf: false } ) );
        const others = ( ...list: Person[] ) => new Map( list.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] ) );
        const { container, redraw } = screen( { canPublish: false, participants: others( ann( { video: fakeTrack() } ) ) } );
        expect( container.querySelector( '.wplus-call-people-toggle' ), 'the listener alone off the stage brought the list' ).toBeNull();

        // Cara, without a camera, hidden by Hide People Without Video: the list, with the listener in it.
        redraw( { canPublish: false, participants: others( ann( { video: fakeTrack() } ), cara() ) } );
        expect( toggle( container ).querySelector( '.wplus-call-people-count' )!.textContent ).toBe( '3' );
        fireEvent.click( toggle( container ) );
        expect( names( container ) ).toEqual( [ 'Ben', 'Ann', 'Cara' ] );
        expect( tags( container, 'me' ) ).toEqual( [ 'Viewer' ] );
    } );
} );

describe( 'Participants offered only where the stage leaves someone out', () => {
    const offered = ( container: HTMLElement ) => !! container.querySelector( '.wplus-call-people-toggle' );

    it( 'is not in a small video or audio call where everyone is on the stage, nor its count', () => {
        window.localStorage.clear();
        for ( const layout of [ 'group-video', 'group-audio' ] as const ) {
            const { container, unmount } = screen( { participants: people( ann(), cara() ) }, layout );
            expect( offered( container ), `${ layout }: Participants in a call that shows everyone` ).toBe( false );
            expect( container.querySelector( '.wplus-call-people-count' ) ).toBeNull();
            unmount();
        }
    } );

    it( 'is there while the layout hides someone, by Hide Self View or Hide People Without Video, and goes as nobody is', () => {
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: true, hideSelf: false } ) );
        const { container, redraw } = screen( { participants: people( ann( { video: fakeTrack() } ), cara( { video: fakeTrack() } ) ) } );
        // Everyone with a camera but the user: the user is hidden as someone without one.
        expect( offered( container ) ).toBe( true );
        redraw( { participants: people( ann( { video: fakeTrack() } ), cara( { video: fakeTrack() } ) ), myCameraTrack: fakeTrack() } );
        const withMine = new Map( people( ann( { video: fakeTrack() } ), cara( { video: fakeTrack() } ) ) );
        withMine.set( 'me', participant( 'me', { name: 'Ben', video: fakeTrack() } ) );
        redraw( { participants: withMine } );
        expect( offered( container ), 'everyone has a picture, nobody hidden' ).toBe( false );
    } );

    it( 'is there where the call can add people, whom the list adds, however small the call', () => {
        window.localStorage.clear();
        const { container } = screen( { participants: people( ann() ), people: async () => [ { id: 44, name: 'Dan' } ], addPerson: async () => {} } );
        expect( offered( container ) ).toBe( true );
    } );

    it( 'closes the list open as it stops being offered', () => {
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: true, hideSelf: false } ) );
        const { container, redraw } = screen( { participants: people( ann( { video: fakeTrack() } ), cara() ) } );
        fireEvent.click( toggle( container ) );
        expect( list( container ) ).not.toBeNull();

        // Cara leaves and the user turns the camera on: nobody hidden, no list, and the one open closes.
        const withMine = new Map( people( ann( { video: fakeTrack() } ) ) );
        withMine.set( 'me', participant( 'me', { name: 'Ben', video: fakeTrack() } ) );
        redraw( { participants: withMine } );
        expect( offered( container ) ).toBe( false );
        expect( list( container ), 'the list stayed open with its button gone' ).toBeNull();
    } );

    it( 'is never in an audio call, its roster the list of everyone however long, and Add Person in More', () => {
        window.localStorage.clear();
        tallRoster();
        const crowd = people( ...Array.from( { length: 40 }, ( _, i ): Person => [ 'user_' + ( 100 + i ), { identity: 'user_' + ( 100 + i ), name: 'Guest ' + i } ] ) );
        const { container } = screen( { participants: crowd, people: async () => [ { id: 44, name: 'Dan' } ], addPerson: async () => {} }, 'group-audio' );
        expect( offered( container ), 'Participants in an audio call' ).toBe( false );
        expect( container.querySelector( '.wplus-call-people' ) ).toBeNull();
    } );
} );

describe( 'Participants on a video call\'s pages and strip', () => {
    beforeEach( () => {
        window.localStorage.clear();
        vi.useFakeTimers( { toFake: [ 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame' ] } );
        // A call 900 wide and 700 high, its dock 60 (as big-calls.test.tsx).
        vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ) {
            const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
            return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
        } );
    } );
    afterEach( () => vi.useRealTimers() );

    const crowd = ( count: number ) => people( ...Array.from( { length: count - 1 }, ( _, i ): Person => [ 'user_' + ( 100 + i ), { identity: 'user_' + ( 100 + i ), name: 'Guest ' + i } ] ) );
    const settle = () => act( () => { vi.advanceTimersByTime( 1000 ); } );

    it( 'is there once the grid has a second page, and not while one page holds everyone', () => {
        const small = screen( { participants: crowd( 4 ) } );
        settle();
        expect( small.container.querySelectorAll( '.wplus-call-page-stop' ) ).toHaveLength( 0 );
        expect( !! small.container.querySelector( '.wplus-call-people-toggle' ), 'one page, Participants' ).toBe( false );
        small.unmount();

        const big = screen( { participants: crowd( 60 ) } );
        settle();
        expect( big.container.querySelectorAll( '.wplus-call-page-stop' ).length ).toBeGreaterThan( 1 );
        expect( !! big.container.querySelector( '.wplus-call-people-toggle' ), 'pages, no Participants' ).toBe( true );
    } );

    it( 'is there while Speaker\'s strip has someone scrolled out of view', () => {
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'speaker', hideNoVideo: false, hideSelf: false } ) );
        // The strip three times as wide as it shows, as a strip of thirty under the speaker is.
        vi.spyOn( Element.prototype, 'scrollWidth', 'get' ).mockImplementation( function( this: Element ) {
            return this.classList?.contains( 'wplus-group-call-videos-grid-secondary' ) ? 2700 : 0;
        } );
        vi.spyOn( HTMLElement.prototype, 'clientWidth', 'get' ).mockImplementation( function( this: Element ) {
            return this.classList?.contains( 'wplus-group-call-videos-grid-secondary' ) ? 900 : 0;
        } );
        const { container } = screen( { participants: crowd( 30 ) } );
        settle();
        expect( container.querySelector( '.wplus-group-call-videos-grid-secondary' )?.getAttribute( 'data-scroll' ), 'no strip' ).toBe( 'x' );
        expect( !! container.querySelector( '.wplus-call-people-toggle' ) ).toBe( true );
    } );
} );
