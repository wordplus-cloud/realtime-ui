import { expect, it } from 'vitest';
import { pageWithCalls } from './page-calls.ts';

it( 'stays out of a page without calls, and places a call from <call-button> once the page has them', async () => {
    const elements = await import( '../src/elements.tsx' );
    expect( document.querySelector( 'call-screen' ) ).toBeNull();
    expect( elements.start() ).toBe( false );

    const calls = pageWithCalls( '42' );
    document.body.insertAdjacentHTML( 'beforeend', '<call-button to="34" call="support:34:42" type="audio" name="Ann">Call Ann</call-button>' );
    document.querySelector( 'call-button' )!.shadowRoot!.querySelector( 'button' )!.click();
    await Promise.resolve();

    expect( calls.start ).toHaveBeenCalledWith( 'support:34:42', { to: 34, type: 'audio' } );
    expect( document.querySelectorAll( 'call-screen' ) ).toHaveLength( 1 );

    // A <call-button> missing whom to call does nothing.
    document.body.insertAdjacentHTML( 'beforeend', '<call-button call="support:34:42">Call</call-button>' );
    document.querySelectorAll( 'call-button' )[ 1 ].shadowRoot!.querySelector( 'button' )!.click();
    await Promise.resolve();
    expect( calls.start ).toHaveBeenCalledTimes( 1 );

    // {pair} is the page user and the one called, in order, as <online-list> names its calls.
    document.body.insertAdjacentHTML( 'beforeend', '<call-button to="100" call="support:{pair}" type="video">Call</call-button>' );
    document.querySelectorAll( 'call-button' )[ 2 ].shadowRoot!.querySelector( 'button' )!.click();
    await Promise.resolve();
    expect( calls.start ).toHaveBeenLastCalledWith( 'support:100:42', { to: 100, type: 'video' } );

    // Users whose ids are text, as Clerk and Auth0 name them: called by that id, failing before as Number() of it.
    document.body.insertAdjacentHTML( 'beforeend', '<call-button to="user_ann" call="support:{pair}">Call</call-button><call-button to="auth0|5f7c" call="help:{pair}">Call</call-button>' );
    document.querySelectorAll( 'call-button' )[ 3 ].shadowRoot!.querySelector( 'button' )!.click();
    await Promise.resolve();
    expect( calls.start ).toHaveBeenLastCalledWith( 'support:42:user_ann', { to: 'user_ann', type: 'video' } );
    document.querySelectorAll( 'call-button' )[ 4 ].shadowRoot!.querySelector( 'button' )!.click();
    await Promise.resolve();
    expect( calls.start ).toHaveBeenLastCalledWith( 'help:42:auth0|5f7c', { to: 'auth0|5f7c', type: 'video' } );
} );

it( 'reads an id as calls do: digits a number, any other id of text as it is, nobody for 0, a space or too long', async () => {
    const { callUserOf } = await import( '../src/sdk/types.ts' );
    expect( [ callUserOf( '42' ), callUserOf( 42 ), callUserOf( 'user_ann' ), callUserOf( 'auth0|5f7c' ) ] ).toEqual( [ 42, 42, 'user_ann', 'auth0|5f7c' ] );
    expect( [ callUserOf( '0' ), callUserOf( 0 ), callUserOf( 'a b' ), callUserOf( 'x'.repeat( 65 ) ), callUserOf( null ), callUserOf( '' ) ] ).toEqual( [ null, null, null, null, null, null ] );
} );
