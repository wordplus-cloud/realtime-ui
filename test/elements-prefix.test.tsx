import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

// A page whose config gives the elements a prefix (a WordPress site's filter, or the server's config()): every name
// goes after it, and the plain ones stay free for the page's own elements.
it( 'names every element after the page prefix, and leaves the plain names to the page', async () => {
    const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
    const rt = fakeRooms( { shop } );
    const calls = { on: () => calls, off: () => calls, start: vi.fn( () => new Promise( () => {} ) ), group: vi.fn(), people: vi.fn( async () => [] ) };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeConfig = { screen: { prefix: 'shop' } };

    await import( '../src/elements.tsx' );
    for ( const name of [ 'call-button', 'room-button', 'online-list', 'online-count', 'typing-line', 'chat-room', 'call-screen' ] ) {
        expect( customElements.get( 'shop-' + name ), 'shop-' + name ).toBeTruthy();
        expect( customElements.get( name ), name ).toBeUndefined();
    }
    for ( let i = 0; i < 2; i++ ) await act( async () => {} );

    // The call screen draws in a holder of the prefix's name.
    expect( document.querySelectorAll( 'shop-call-screen' ) ).toHaveLength( 1 );
    expect( document.querySelector( 'call-screen' ) ).toBeNull();

    // The elements draw as under their own names: the online list fills its place, its rule its own, not the tag's.
    document.body.insertAdjacentHTML( 'beforeend', '<shop-online-list room="shop"></shop-online-list>' );
    for ( let i = 0; i < 2; i++ ) await act( async () => {} );
    const root = document.querySelector( 'shop-online-list' )!.shadowRoot!;
    expect( root.querySelector( '.wplus-chat-online__title' )?.textContent ).toBe( 'Online (2)' );
    expect( root.querySelector( '.realtime-calls.realtime-online' ) ).toBeTruthy();
    expect( root.querySelector( 'style' )?.textContent ).toContain( ':host { display: block; }' );
} );

it( 'defines a prefix start() gives later beside the names it has', async () => {
    const elements = await import( '../src/elements.tsx' );
    elements.start( { prefix: 'acme' } );
    expect( customElements.get( 'acme-chat-room' ) ).toBeTruthy();
    expect( customElements.get( 'shop-chat-room' ) ).toBeTruthy();
    // Each name its own class, so one element class serves both.
    expect( customElements.get( 'acme-chat-room' ) ).not.toBe( customElements.get( 'shop-chat-room' ) );
} );

it( 'keeps the elements own names for a prefix that would not make valid names, and says why', async () => {
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    const { validPrefix } = await import( '../src/element-names.ts' );
    expect( validPrefix( 'Shop' ) ).toBe( '' );
    expect( validPrefix( '1shop' ) ).toBe( '' );
    expect( validPrefix( 'shop-' ) ).toBe( '' );
    expect( warn ).toHaveBeenCalledTimes( 3 );
    expect( warn.mock.calls[ 0 ][ 0 ] ).toContain( '"Shop" is not one' );
    expect( validPrefix( 'my-shop2' ) ).toBe( 'my-shop2' );
    expect( validPrefix( undefined ) ).toBe( '' );
    warn.mockRestore();
} );
