import { expect, it, vi } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

// `<chat-room upload>`: files in the element's chat, to the app's route. A page of its own, as the elements define
// themselves once per window.

const settle = () => new Promise( ( done ) => setTimeout( done, 20 ) );

it( 'takes files in <chat-room upload>, as its attributes say, and none without it', async () => {
    const calls = { on: vi.fn(), off: vi.fn(), start: vi.fn(), group: vi.fn(), people: vi.fn( async () => [] ) };
    const rt = fakeRooms( { 'chat:34:42': fakeRoom( 'chat:34:42' ), 'chat:34:43': fakeRoom( 'chat:34:43' ) } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };

    document.body.insertAdjacentHTML( 'beforeend',
        '<chat-room id="with" room="chat:34:42" upload="/api/uploads" accept="image/*,.pdf" max-file-size="1048576"></chat-room>' +
        '<chat-room id="without" room="chat:34:43"></chat-room>' );
    const elements = await import( '../src/elements.tsx' );
    expect( elements.start() ).toBe( true );
    const shadow = ( id: string ) => document.querySelector( `chat-room#${ id }` )!.shadowRoot!;
    for ( let i = 0; i < 50 && ! shadow( 'with' ).querySelector( '.wplus-composer' ); i++ ) await settle();

    const input = shadow( 'with' ).querySelector( '.wplus-attachments-input' ) as HTMLInputElement;
    expect( input.getAttribute( 'accept' ) ).toBe( 'image/*,.pdf' );
    expect( shadow( 'with' ).querySelector( '.wplus-composer__attach-wrap' ) ).not.toBeNull();
    expect( shadow( 'without' ).querySelector( '.wplus-composer__attach-wrap' ) ).toBeNull();

    // Over its size: refused before anything goes up, as max-file-size says.
    Object.defineProperty( input, 'files', { value: [ new File( [ 'x'.repeat( 2 * 1024 * 1024 ) ], 'big.png', { type: 'image/png' } ) ], configurable: true } );
    input.dispatchEvent( new Event( 'change', { bubbles: true } ) );
    await settle();
    expect( shadow( 'with' ).querySelector( '.wplus-staged-chip' )?.getAttribute( 'data-status' ) ).toBe( 'error' );
} );
