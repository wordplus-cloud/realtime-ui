import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, LAYOUT_KEY, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';
import { press, retargetAsBrowsers, shadowRoot } from './shadow-root.ts';

// The call's menus in the page, as Better Messages draws the screen, and in a shadow root, as the elements script does
// (src/elements.tsx): a row pressed acts in both, and a press outside closes the menu in both. Each menu closes from a
// listener on the document, where a browser names the shadow root's host as what a press inside the screen pressed.

let unretarget = () => {};
let removeHost = () => {};

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    window.localStorage.clear();
    // The user's own tile hidden, so the stage leaves someone out and the dock offers Participants (people-panel.tsx).
    window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );
    unretarget = retargetAsBrowsers();
    vi.useFakeTimers();
    // A call 600 wide and 700 high, its dock 60: narrow enough that Participants is a sheet over the tiles.
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ) {
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
        return { width: 600, height, top: 0, left: 0, right: 600, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
    } );
} );

afterEach( () => {
    cleanup();
    removeHost();
    removeHost = () => {};
    unretarget();
    vi.restoreAllMocks();
    vi.useRealTimers();
} );

type Person = [ string, Partial<CallParticipant> ];

const people = ( ...more: Person[] ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { identity: 'user_42', name: 'Ben' } ) ],
    ...more.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ),
] );
// What a press set going, done: the moderation's request answered and drawn.
const settled = () => act( async () => {} );
const ann: Person =[ 'user_34', { identity: 'user_34', name: 'Ann', audio: fakeTrack() } ];
const cara: Person = [ 'user_43', { identity: 'user_43', name: 'Cara' } ];

describe.each( [ 'in the page', 'in a shadow root' ] )( 'the call\'s menus %s', ( where ) => {
    const screen = () => {
        const call = fakeCall( { adminMode: true, participants: people( ann, cara ) } );
        const ui = <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
        let rendered;
        if ( where === 'in the page' ) rendered = render( ui );
        else {
            const shadow = shadowRoot();
            removeHost = shadow.remove;
            rendered = render( ui, { container: shadow.container } );
        }
        // The tiles laid out.
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        return { call, ...rendered };
    };
    const tile = ( container: HTMLElement, key: string ) => container.querySelector<HTMLElement>( `.wplus-group-call-input-video[data-key="${ key }"]` )!;
    const menu = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-moderation-person' );
    const sheet = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-people' );
    const more = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-more-menu' );

    it( 'act on a row of a host\'s Manage Participant menu, pressed', async () => {
        const { container, call } = screen();
        fireEvent.click( tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )! );
        expect( menu( container )?.getAttribute( 'aria-label' ) ).toBe( 'Ann' );

        press( menu( container )!.querySelector( '.wplus-mute-mic' )! );
        await settled();
        expect( call.calls, 'Mute Microphone did nothing' ).toContain( 'moderate {"act":"mute_mic","identity":"user_34","type":"video"}' );
        expect( menu( container ), 'a row\'s press closed the menu' ).not.toBeNull();

        press( menu( container )!.querySelector( '.wplus-spotlight-participant' )! );
        await settled();
        expect( call.calls, 'Spotlight for Everyone did nothing' ).toContain( 'moderate {"act":"spotlight_participant","type":"video","identity":"user_34"}' );
    } );

    it( 'close the Manage Participant menu on a press outside it, in the call or on the page, and on its button', () => {
        const { container } = screen();
        const button = () => tile( container, 'user_34' ).querySelector( '.wplus-manage-participant' )!;
        fireEvent.click( button() );
        fireEvent.pointerDown( container.querySelector( '.wplus-group-call-videos-grid' )! );
        expect( menu( container ), 'a press on the tiles left the menu open' ).toBeNull();

        fireEvent.click( button() );
        fireEvent.pointerDown( document.body );
        expect( menu( container ), 'a press on the page left the menu open' ).toBeNull();

        press( button() );
        expect( menu( container ) ).not.toBeNull();
        press( button() );
        expect( menu( container ), 'its button pressed again left the menu open' ).toBeNull();
    } );

    it( 'act on a row of the Participants sheet, and of a person\'s menu opened from it, pressed', async () => {
        const { container, call } = screen();
        fireEvent.click( container.querySelector( '.wplus-call-people-toggle' )! );
        expect( sheet( container )?.dataset.mode ).toBe( 'sheet' );

        press( sheet( container )!.querySelector( '.wplus-call-people-mute-all' )! );
        await settled();
        expect( call.calls, 'Mute Everyone did nothing' ).toContain( 'moderate {"act":"mute_all","type":"video","identities":["user_34","user_43"]}' );
        expect( sheet( container ), 'a press in the sheet closed it' ).not.toBeNull();

        press( sheet( container )!.querySelector( '.wplus-call-people-row[data-person="user_43"] .wplus-call-people-more' )! );
        expect( menu( container )?.getAttribute( 'aria-label' ) ).toBe( 'Cara' );
        press( menu( container )!.querySelector( '.wplus-remove-participant' )! );
        await settled();
        expect( call.calls, 'Remove from Call did nothing' ).toContain( 'moderate {"act":"remove_participant","identity":"user_43","type":"video"}' );
    } );

    it( 'close the Participants sheet on a press outside it, in the call or on the page, and on its button', () => {
        const { container } = screen();
        const button = () => container.querySelector( '.wplus-call-people-toggle' )!;
        fireEvent.click( button() );
        fireEvent.pointerDown( container.querySelector( '.wplus-group-call-videos-grid' )! );
        expect( sheet( container ), 'a press on the tiles left the sheet open' ).toBeNull();

        fireEvent.click( button() );
        fireEvent.pointerDown( document.body );
        expect( sheet( container ), 'a press on the page left the sheet open' ).toBeNull();

        press( button() );
        expect( sheet( container ) ).not.toBeNull();
        press( button() );
        expect( sheet( container ), 'its button pressed again left the sheet open' ).toBeNull();
    } );

    it( 'act on a row of the dock\'s More, pressed', () => {
        const { container } = screen();
        fireEvent.click( container.querySelector( '.wplus-call-more' )! );
        press( more( container )!.querySelector( '.wplus-layout-tiled' )! );
        expect( JSON.parse( window.localStorage.getItem( LAYOUT_KEY )! ).mode, 'Tiled did nothing' ).toBe( 'tiled' );
        expect( more( container ), 'a choice put More away' ).not.toBeNull();
    } );

    it( 'close the dock\'s More on a press outside it, in the call or on the page, and on its button', () => {
        const { container } = screen();
        const button = () => container.querySelector( '.wplus-call-more' )!;
        fireEvent.click( button() );
        fireEvent.pointerDown( container.querySelector( '.wplus-group-call-videos-grid' )! );
        expect( more( container ), 'a press on the tiles left More open' ).toBeNull();

        fireEvent.click( button() );
        fireEvent.pointerDown( document.body );
        expect( more( container ), 'a press on the page left More open' ).toBeNull();

        press( button() );
        expect( more( container ) ).not.toBeNull();
        press( button() );
        expect( more( container ), 'its button pressed again left More open' ).toBeNull();
    } );
} );

describe( 'the tests\' shadow root', () => {
    it( 'names its host to a listener on the document, as a browser does, and what was pressed to one inside it', () => {
        const shadow = shadowRoot();
        removeHost = shadow.remove;
        const button = shadow.container.appendChild( document.createElement( 'span' ) );
        const seen: Array<EventTarget | null> = [];
        const listen = ( event: Event ) => { seen.push( event.target, event.composedPath()[ 0 ] ); };
        document.addEventListener( 'pointerdown', listen, true );
        shadow.container.addEventListener( 'pointerdown', listen );
        fireEvent.pointerDown( button );
        document.removeEventListener( 'pointerdown', listen, true );
        expect( seen ).toEqual( [ shadow.host, button, button, button ] );
    } );
} );
