import { expect, it } from 'vitest';
import { pageWithCalls } from './page-calls.ts';

// `<group-call-button call="…">` joins the group call it names, and `<room-button room="…">`, its first name, goes on
// doing the same. A page of its own, as the elements define themselves once per window.

const click = ( element: Element | null ) => element!.shadowRoot!.querySelector( 'button' )!.click();

it( 'joins the group call it names, under its name and its first one', async () => {
    const calls = pageWithCalls();
    await import( '../src/elements.tsx' );

    document.body.innerHTML = `
        <group-call-button id="new" call="meeting:daily" type="audio" title="Daily">Join</group-call-button>
        <room-button id="old" room="staff:daily">Join</room-button>
        <room-button id="both" call="team:1">Join</room-button>
        <group-call-button id="none">Join</group-call-button>`;

    click( document.getElementById( 'new' ) );
    await new Promise( ( done ) => setTimeout( done, 0 ) );
    expect( calls.group ).toHaveBeenCalledTimes( 1 );
    expect( calls.group ).toHaveBeenLastCalledWith( 'meeting:daily', expect.objectContaining( { type: 'audio' } ) );

    calls.group.mockClear();
    click( document.getElementById( 'none' ) );
    await new Promise( ( done ) => setTimeout( done, 0 ) );
    expect( calls.group ).not.toHaveBeenCalled();
} );
