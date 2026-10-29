// The live stream elements (src/stream-elements.tsx): <live-stream> and <stream-studio> on the page's calls, one
// join for every element of a stream, its parts each in its element, and the stream left when the last one goes. The
// script defines its elements once per window, as on a real page, so this file is one page.
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import { fakeClient } from './fake.tsx';

const shows = new Map<string, ReturnType<typeof fakeClient>>();
const left = vi.fn();

const calls = {
    on: () => calls,
    off: () => calls,
    start: vi.fn(),
    group: vi.fn(),
    people: vi.fn( async () => [] ),
    stream: vi.fn( async ( name: string, _options?: { video?: boolean } ) => {
        if ( name === 'show:closed' ) throw Object.assign( new Error( 'forbidden' ), { code: 'forbidden' } );
        const fake = fakeClient( { stream: { id: name, state: 'live', started_at: 1, ended_at: null } } );
        shows.set( name, fake );
        return { name, engine: fake.client, leave: () => left( name ) };
    } ),
};

let elements: typeof import( '../../src/stream-elements.tsx' );

beforeAll( async () => {
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt: {}, calls } ) };
    document.documentElement.lang = 'de';
    elements = await import( '../../src/stream-elements.tsx' );
    // As @wordplus/realtime's rt.streamScreen() does once the page has its calls.
    expect( elements.start() ).toBe( true );
} );

afterEach( async () => {
    await act( async () => document.body.replaceChildren() );
    calls.stream.mockClear();
    left.mockClear();
    shows.clear();
} );

const place = ( html: string ) => act( async () => {
    document.body.insertAdjacentHTML( 'beforeend', html );
} );

it( 'defines both elements and puts the streams stylesheet in the head once', () => {
    expect( customElements.get( 'live-stream' ) ).toBeTruthy();
    expect( customElements.get( 'stream-studio' ) ).toBeTruthy();
    elements.start();
    expect( document.querySelectorAll( '#realtime-ui-streams' ) ).toHaveLength( 1 );
} );

it( 'draws a stream in one piece, joined once with its picture', async () => {
    await place( '<live-stream name="show:mugs" title="New mugs"></live-stream>' );

    await waitFor( () => expect( document.querySelector( 'live-stream .estream-app' ) ).toBeTruthy() );
    expect( calls.stream ).toHaveBeenCalledTimes( 1 );
    expect( calls.stream ).toHaveBeenCalledWith( 'show:mugs', { video: true } );
} );

it( 'offers its signed-in viewer the hand while live, which the app\'s rule allows', async () => {
    await place( '<live-stream name="lesson:1"></live-stream>' );

    // The page is German here: "Ask to join on stage".
    const hand = () => [ ...document.querySelectorAll<HTMLButtonElement>( 'live-stream button' ) ].find( ( button ) => button.textContent === 'Anfragen, auf die Bühne zu kommen' );
    await waitFor( () => expect( hand() ).toBeTruthy() );
    await act( async () => hand()!.click() );
    expect( shows.get( 'lesson:1' )!.client.raiseHand ).toHaveBeenCalledWith( true );
} );

it( 'gives every element of a stream one join, each part in its own element', async () => {
    await place( '<live-stream name="show:mugs" view="player"></live-stream><div><live-stream name="show:mugs" view="chat" height="480"></live-stream></div>' );

    await waitFor( () => expect( document.querySelector( 'live-stream[view="player"] .estream-part--player' ) ).toBeTruthy() );
    expect( document.querySelector( 'live-stream[view="chat"] .estream-part--chat' ) ).toBeTruthy();
    expect( calls.stream ).toHaveBeenCalledTimes( 1 );
    // The chat its own height.
    expect( ( document.querySelector( '.estream-part--chat' ) as HTMLElement ).style.height ).toBe( '480px' );
} );

it( 'joins without the picture where no element shows it, and asks for it once one does', async () => {
    await place( '<live-stream name="show:talk" view="chat"></live-stream>' );
    await waitFor( () => expect( document.querySelector( '.estream-part--chat' ) ).toBeTruthy() );
    expect( calls.stream ).toHaveBeenCalledWith( 'show:talk', { video: false } );
    expect( shows.get( 'show:talk' )!.client.wantVideo ).not.toHaveBeenCalled();

    await place( '<live-stream name="show:talk" view="player"></live-stream>' );
    await waitFor( () => expect( shows.get( 'show:talk' )!.client.wantVideo ).toHaveBeenCalled() );
    expect( calls.stream ).toHaveBeenCalledTimes( 1 );
} );

it( 'shows the studio to the host alone', async () => {
    await place( '<stream-studio name="show:mugs"></stream-studio>' );
    await waitFor( () => expect( shows.get( 'show:mugs' ) ).toBeTruthy() );
    // A viewer: nothing at all.
    expect( document.querySelector( 'stream-studio .estream-part--studio' ) ).toBeNull();

    shows.get( 'show:mugs' )!.update( { you: { identity: 'u:34', role: 'host', name: 'Ann', chat: 'write', mod: true } } );
    await waitFor( () => expect( document.querySelector( 'stream-studio .estream-part--studio' ) ).toBeTruthy() );
} );

it( 'shows its host the studio as a page of its own, with the links it is given, in the element\'s height', async () => {
    await place( '<live-stream name="lesson:7" view="studio-page" title="Your first tune" url="/lessons/7" back-url="/studio" style="display: block; height: 600px"></live-stream>' );
    await waitFor( () => expect( shows.get( 'lesson:7' ) ).toBeTruthy() );
    expect( calls.stream ).toHaveBeenCalledWith( 'lesson:7', { video: true } );

    shows.get( 'lesson:7' )!.update( { you: { identity: 'u:34', role: 'host', name: 'Mia', chat: 'write', mod: true } } );
    await waitFor( () => expect( document.querySelector( 'live-stream .estream-studio-page' ) ).toBeTruthy() );
    const element = document.querySelector( 'live-stream' )!;
    expect( element.querySelector( '.estream-studio-page__title' )!.textContent ).toBe( 'Your first tune' );
    expect( element.querySelector( '.estream-studio-page__back' )!.getAttribute( 'href' ) ).toBe( '/studio' );
    // Where viewers watch, whole, to open and to share.
    expect( [ ...element.querySelectorAll( 'a' ) ].map( ( a ) => a.getAttribute( 'href' ) ) ).toContain( new URL( '/lessons/7', document.baseURI ).href );
    // Its place is the element's whole height.
    expect( ( element.firstElementChild as HTMLElement ).style.height ).toBe( '100%' );
} );

it( 'tells anyone but the host that the studio page is not theirs', async () => {
    await place( '<live-stream name="lesson:8" view="studio-page"></live-stream>' );
    await waitFor( () => expect( shows.get( 'lesson:8' ) ).toBeTruthy() );
    shows.get( 'lesson:8' )!.update( { status: 'ready', you: { identity: 'u:35', role: 'viewer', name: 'Ava', chat: 'write', mod: false } } );
    await waitFor( () => expect( document.querySelector( '.estream-studio-page__refused' ) ).toBeTruthy() );
    expect( document.querySelector( '.estream-studio-page' ) ).toBeNull();
} );

it( 'leaves the stream once its last element goes, and keeps it for one moved on the page', async () => {
    await place( '<live-stream id="a" name="show:mugs" view="player"></live-stream><live-stream id="b" name="show:mugs" view="chat"></live-stream><section id="elsewhere"></section>' );
    await waitFor( () => expect( shows.get( 'show:mugs' ) ).toBeTruthy() );

    // Moved: out and in again at once.
    await act( async () => document.getElementById( 'elsewhere' )!.append( document.getElementById( 'a' )! ) );
    await act( async () => document.getElementById( 'b' )!.remove() );
    expect( left ).not.toHaveBeenCalled();

    await act( async () => document.getElementById( 'a' )!.remove() );
    expect( left ).toHaveBeenCalledWith( 'show:mugs' );
    expect( calls.stream ).toHaveBeenCalledTimes( 1 );
} );

it( 'says what kept a stream away, in the page language', async () => {
    await place( '<live-stream name="show:closed"></live-stream>' );
    await waitFor( () => expect( document.querySelector( 'live-stream .estream-part--refused' ) ).toBeTruthy() );
    const said = document.querySelector( '.estream-part--refused' )!.textContent!;
    expect( said ).not.toBe( '' );
    expect( said ).not.toBe( 'You do not have access to this stream' );
} );

it( 'joins another stream when an element is renamed', async () => {
    await place( '<live-stream id="s" name="show:mugs"></live-stream>' );
    await waitFor( () => expect( shows.get( 'show:mugs' ) ).toBeTruthy() );

    await act( async () => document.getElementById( 's' )!.setAttribute( 'name', 'show:cups' ) );
    await waitFor( () => expect( shows.get( 'show:cups' ) ).toBeTruthy() );
    expect( left ).toHaveBeenCalledWith( 'show:mugs' );
} );

it( 'takes its view as a property too, as React sets it once the element is defined', async () => {
    // A studio page opened after the stream's player had defined the element: React set `view` as a property, and the
    // getter alone threw "Cannot set property view … which has only a getter" (Golden Hour, 2026-10-28).
    const element = document.createElement( 'live-stream' ) as HTMLElement & { view: string };
    expect( () => { element.view = 'studio-page'; } ).not.toThrow();
    expect( element.getAttribute( 'view' ) ).toBe( 'studio-page' );
    expect( element.view ).toBe( 'studio-page' );
    element.view = '';
    expect( element.hasAttribute( 'view' ) ).toBe( false );
    const studio = document.createElement( 'stream-studio' ) as HTMLElement & { view: string };
    expect( () => { studio.view = 'player'; } ).not.toThrow();
    expect( studio.view ).toBe( 'studio' );
} );
