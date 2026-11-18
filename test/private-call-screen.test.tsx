import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { PrivateCallScreen, usePrivateCall } from '../src/calls.ts';
import type { SdkCall } from '../src/sdk/types.ts';
import { devices, fakeCall, remote } from './fake-sdk-call.ts';

// A call between two on an app's own calls (Live Support's with visitors): usePrivateCall runs the SDK's call, and
// PrivateCallScreen draws it as CallScreen draws a private call, without the group calls. Run on React and on Preact,
// which Live Support's visitor panel draws it on.

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42 } );
    devices();
} );

afterEach( cleanup );

// The call's media asked for once the screen is drawn: Preact runs effects after the paint, a tick after React.
const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

function Call( { call, close }: { call: SdkCall; close: ( notice: string | null ) => void } ) {
    const running = usePrivateCall( call, { name: 'Ann' }, close );
    return <PrivateCallScreen call={ running } />;
}

describe( 'a call between two on the app\'s own calls', () => {
    it( 'rings out, sends the microphone and the camera of a video call, and shows the other side once connected', async () => {
        const call = fakeCall();
        const { container } = render( <Call call={ call } close={ () => {} } /> );
        await settle();

        expect( container.querySelector( '.wplus-call-wrap .wplus-private-call' ) ).not.toBeNull();
        // Its stage's colours with it, which Better Messages' container gives CallScreen.
        expect( container.querySelector( '.wplus-call-wrap' )!.classList.contains( 'wplus-call-surface' ) ).toBe( true );
        expect( container.querySelector( '.wplus-placeholder-outgoing-text' )?.textContent ).toBe( 'Calling...' );
        expect( call.sent.map( ( [ source ] ) => source ).sort() ).toEqual( [ 'camera', 'microphone' ] );

        const camera = remote();
        await act( async () => {
            call.state = 'connected';
            call.fire( 'state', 'connected' );
            call.fire( 'remote', { ...call.remote, camera, media: { ...call.remote.media, camera: true, microphone: true } } );
        } );
        expect( container.querySelector( '.wplus-placeholder-outgoing-text' ) ).toBeNull();
        expect( camera.on.length ).toBeGreaterThan( 0 );
        expect( container.querySelectorAll( '.wplus-call-buttons [aria-label]' ).length ).toBeGreaterThan( 2 );
    } );

    it( 'hangs up from its dock, the call ended and the app told, with nothing to say', async () => {
        const call = fakeCall( { state: 'connected', type: 'audio' } );
        const close = vi.fn();
        const { container } = render( <Call call={ call } close={ close } /> );
        await settle();
        // A voice call sends the microphone alone.
        expect( call.sent.map( ( [ source ] ) => source ) ).toEqual( [ 'microphone' ] );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-buttons .wplus-cancel' )! ); } );
        expect( call.ended ).toBe( true );
        expect( close ).toHaveBeenCalledWith( null );
    } );

    it( 'tells the app why a call ended on the other side', async () => {
        const call = fakeCall();
        const close = vi.fn();
        render( <Call call={ call } close={ close } /> );
        await settle();
        await act( async () => call.fire( 'ended', 'rejected' ) );
        expect( close ).toHaveBeenCalledWith( 'User rejected your call' );
    } );

    it( 'fills the browser window from the dock\'s Expand, and goes back with Escape', async () => {
        const call = fakeCall( { state: 'connected' } );
        const { container } = render( <Call call={ call } close={ () => {} } /> );
        await settle();
        const expand = container.querySelector<HTMLElement>( '[aria-label="Expand"]' );
        expect( expand ).not.toBeNull();
        await act( async () => { fireEvent.click( expand! ); } );
        expect( container.querySelector( '.wplus-call-wrap--window' ) ).not.toBeNull();
        await act( async () => { fireEvent.keyDown( document, { key: 'Escape' } ); } );
        expect( container.querySelector( '.wplus-call-wrap--window' ) ).toBeNull();
    } );
} );
