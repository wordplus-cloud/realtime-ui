import { expect, it, vi } from 'vitest';
import { pageWithCalls } from './page-calls.ts';

// A page where another script has two of the plain names: the rest are ours, those two stay that script's, and the
// console says how to give ours a prefix.
it( 'leaves a name another script defined to it, says so, and draws the call screen in a holder of its own', async () => {
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
    class TheirChat extends HTMLElement {}
    class TheirScreen extends HTMLElement {}
    customElements.define( 'chat-room', TheirChat );
    customElements.define( 'call-screen', TheirScreen );
    pageWithCalls();

    const elements = await import( '../src/elements.tsx' );
    expect( customElements.get( 'chat-room' ) ).toBe( TheirChat );
    expect( customElements.get( 'call-button' ) ).toBeTruthy();
    const said = warn.mock.calls.map( ( call ) => String( call[ 0 ] ) );
    expect( said.some( ( line ) => line.includes( '<chat-room> is another script' ) && line.includes( '<shop-chat-room>' ) ) ).toBe( true );
    expect( said.some( ( line ) => line.includes( '<call-screen> is another script' ) ) ).toBe( true );

    // The call screen draws in a <div> of its own, never in the other script's element.
    expect( elements.start() ).toBe( true );
    expect( document.querySelector( 'call-screen' ) ).toBeNull();
    expect( document.body.lastElementChild?.tagName ).toBe( 'DIV' );
    expect( document.body.lastElementChild?.shadowRoot?.querySelector( '.realtime-calls' ) ).toBeTruthy();

    // A second copy of our script, as on a page where two plugins carry it, finds ours and says nothing.
    warn.mockClear();
    vi.resetModules();
    await import( '../src/elements.tsx' );
    expect( warn.mock.calls.filter( ( call ) => ! String( call[ 0 ] ).includes( 'another script' ) ) ).toEqual( [] );
    expect( warn.mock.calls.map( ( call ) => String( call[ 0 ] ) ).filter( ( line ) => line.includes( 'call-button' ) ) ).toEqual( [] );
    warn.mockRestore();
} );
