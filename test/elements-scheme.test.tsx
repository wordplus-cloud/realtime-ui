import { act } from '@testing-library/react';
import { expect, it } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

it( 'takes the light or dark the page says, from its body class or a color-scheme of one, and the system otherwise', async () => {
    const shop = fakeRoom( 'shop', { 34: { name: 'Ann' } } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt: fakeRooms( { shop } ), calls: null } ) };
    await import( '../src/elements.tsx' );

    document.body.insertAdjacentHTML( 'beforeend', '<online-list room="shop"></online-list>' );
    await act( async () => {} );
    const online = document.querySelector( 'online-list' )!;
    // Nothing said: the system decides, in the stylesheet.
    expect( online.hasAttribute( 'data-scheme' ) ).toBe( false );

    const changed = async ( change : () => void ) => {
        change();
        await act( () => new Promise( ( done ) => setTimeout( done ) ) );
        return online.getAttribute( 'data-scheme' );
    };
    expect( await changed( () => document.body.classList.add( 'wplus-messages-light' ) ) ).toBe( 'light' );
    expect( await changed( () => document.body.classList.replace( 'wplus-messages-light', 'wplus-messages-dark' ) ) ).toBe( 'dark' );
    expect( await changed( () => document.body.classList.remove( 'wplus-messages-dark' ) ) ).toBe( null );

    // Off the page, it is left alone.
    online.remove();
    document.body.classList.add( 'wplus-messages-light' );
    await act( () => new Promise( ( done ) => setTimeout( done ) ) );
    expect( online.hasAttribute( 'data-scheme' ) ).toBe( false );
    document.body.classList.remove( 'wplus-messages-light' );

    // A page drawn only light, as the Example Shop is (a browser hands the page's color-scheme down to the element; this
    // test's page doesn't, so the element has it), and one offering both, where the system decides again.
    const schemeFor = async ( colorScheme : string ) => {
        document.body.insertAdjacentHTML( 'beforeend', `<online-list room="shop" style="color-scheme: ${ colorScheme }"></online-list>` );
        await act( async () => {} );
        const element = document.querySelector( 'online-list' )!;
        element.remove();
        return element.getAttribute( 'data-scheme' );
    };
    expect( await schemeFor( 'light' ) ).toBe( 'light' );
    expect( await schemeFor( 'only dark' ) ).toBe( 'dark' );
    expect( await schemeFor( 'light dark' ) ).toBe( null );
} );
