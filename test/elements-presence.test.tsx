import { act, fireEvent } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

it( 'draws who is in a room on any page, with a call button for each of the others that places the call', async () => {
    const shop = fakeRoom( 'shop', { 34: { name: 'Ann', role: 'Support' }, 42: { name: 'Ben', role: 'Customer' } } );
    const rt = fakeRooms( { shop } );
    const calls = { on: () => calls, off: () => calls, start: vi.fn( () => new Promise( () => {} ) ), group: vi.fn(), people: vi.fn( async () => [] ) };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };

    const elements = await import( '../src/elements.tsx' );
    expect( elements.callName( 'support:{pair}', '42', '34' ) ).toBe( 'support:34:42' );

    document.body.insertAdjacentHTML( 'beforeend', '<online-list room="shop" call="support:{pair}" type="video audio"></online-list>' );
    await act( async () => {} );
    await act( async () => {} );

    const root = document.querySelector( 'online-list' )!.shadowRoot!;
    expect( root.querySelector( '.bm-chat-online__title' )?.textContent ).toBe( 'Online (2)' );
    // Ann is the page's user: only Ben's row has call buttons, a video and an audio one.
    const buttons = [ ...root.querySelectorAll( '.bm-row-action' ) ];
    expect( buttons.map( ( b ) => b.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Video Call', 'Audio Call' ] );

    await act( async () => ( buttons[ 0 ] as HTMLElement ).click() );
    expect( calls.start ).toHaveBeenCalledWith( 'support:34:42', { to: 42, type: 'video' } );

    // Taken off the page, it leaves the room it joined.
    document.querySelector( 'online-list' )!.remove();
    expect( rt.leave ).toHaveBeenCalledWith( 'shop' );
} );

it( 'draws a conversation on any page, with the set of reactions it names', async () => {
    const chat = fakeRoom( 'chat:34:42' );
    chat.history.mockImplementation( async () => ( { events: [ { event: 'message', data: { text: 'Hi Ann' }, id: 'h1', at: Date.now(), from: '42' } ], more: false } ) );
    const rt = fakeRooms( { 'chat:34:42': chat } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls: null } ) };
    await import( '../src/elements.tsx' );

    document.body.insertAdjacentHTML( 'beforeend', '<chat-room room="chat:34:42" reactions="👍 🎉" placeholder="Ask about your order"></chat-room>' );
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );

    const root = document.querySelector( 'chat-room' )!.shadowRoot!;
    expect( root.querySelector( '.realtime-chat .bm-chat-text' )?.textContent ).toBe( 'Hi Ann' );
    expect( root.querySelector( '.bm-composer__editable' )?.getAttribute( 'placeholder' ) ).toBe( 'Ask about your order' );
    await act( async () => { ( root.querySelector( '.bm-reaction-trigger' ) as HTMLElement ).dispatchEvent( new MouseEvent( 'mouseover', { bubbles: true } ) ); } );
    expect( root.querySelector( '.bm-reaction-trigger' )?.textContent ).toBe( '🎉' );

    // A message the room took is a `sent` event on the element, for the page to tell its own server.
    const at = Date.now();
    chat.emitWithAck.mockImplementation( async () => ( { id: 'm1', at } ) );
    const sent = vi.fn();
    document.querySelector( 'chat-room' )!.addEventListener( 'sent', ( e ) => sent( ( e as CustomEvent ).detail ) );
    const editable = root.querySelector( '.bm-composer__editable' ) as HTMLElement;
    editable.textContent = 'Where is it?';
    await act( async () => { fireEvent.input( editable ); } );
    await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
    expect( sent ).toHaveBeenCalledWith( { id: 'm1', room: 'chat:34:42', text: 'Where is it?', at } );
} );

it( 'draws the conversation the app keeps, from its route or from a loader the page sets on the element', async () => {
    const chat = fakeRoom( 'chat:34:42' );
    chat.history.mockImplementation( async () => ( { events: [], more: false } ) );
    const rt = fakeRooms( { 'chat:34:42': chat } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls: null } ) };
    const at = Date.now();
    const fetch = vi.fn( async () => new Response( JSON.stringify( { messages: [ { id: 'k1', from: 42, text: 'Kept by the app', at } ], more: false } ) ) );
    vi.stubGlobal( 'fetch', fetch );
    const { routeLoader } = await import( '../src/elements.tsx' );

    // The route: asked with the page's cookies, `?before=` for an older page.
    document.body.insertAdjacentHTML( 'beforeend', '<chat-room id="by-route" room="chat:34:42" messages="/api/chat/messages"></chat-room>' );
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
    expect( document.getElementById( 'by-route' )!.shadowRoot!.querySelector( '.bm-chat-text' )?.textContent ).toBe( 'Kept by the app' );
    expect( String( fetch.mock.calls[ 0 ][ 0 ] ) ).toBe( `${ location.origin }/api/chat/messages` );
    expect( fetch.mock.calls[ 0 ][ 1 ] ).toMatchObject( { credentials: 'same-origin' } );
    await routeLoader( '/api/chat/messages' )!( { id: 'k1', at } );
    expect( String( fetch.mock.calls.at( -1 )![ 0 ] ) ).toBe( `${ location.origin }/api/chat/messages?before=k1` );

    // A loader of the page's own, set before the element is on the page.
    const element = document.createElement( 'chat-room' ) as HTMLElement & { load?: unknown };
    element.setAttribute( 'room', 'chat:34:42' );
    element.load = async () => ( { messages: [ { id: 'k2', from: 42, text: 'From the page loader', at } ], more: false } );
    document.body.append( element );
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
    expect( element.shadowRoot!.querySelector( '.bm-chat-text' )?.textContent ).toBe( 'From the page loader' );
    vi.unstubAllGlobals();
} );
