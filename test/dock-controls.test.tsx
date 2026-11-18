// The dock's controls as asked for on 2026-10-30: the chat and the device settings at the start of every
// call's dock ("configure button should be on left side after chat, like it was before"), and no tooltip over a
// control whose popup is open ("more tooltip should not be shown when the popup is already opened").
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { LAYOUT_KEY, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from '../src/testing.ts';
import CallView from '../src/components/calls/call-screen.tsx';
import { ownTooltips } from '../src/inc/floater.ts';
import { setOwnTooltips } from '../src/inc/shared-parts.ts';

// The dock as a computer with a microphone, a camera and screen sharing draws it.
vi.mock( '../src/inc/calls/permissions.ts', async ( original ) => ( {
    ...await original<typeof import( '../src/inc/calls/permissions.ts' )>(),
    screenShareSupport: true,
    useConfigAvailable: () => true,
} ) );

beforeEach( () => {
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { enumerateDevices: async () => [], getUserMedia: vi.fn( async () => { throw new Error( 'no device' ); } ) },
    } );
    configureUi( { translate: ( text ) => text, currentUserId: () => 42 } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    setOwnTooltips( ownTooltips() );
} );

afterEach( () => {
    cleanup();
    window.localStorage.clear();
    document.querySelectorAll( '.realtime-tooltip' ).forEach( ( tip ) => tip.remove() );
    setOwnTooltips( undefined );
} );

const draw = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' | 'group-audio' ) =>
    render( <CallView call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );

const people = () => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me' ) ],
    [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack() } ) ],
    [ 'user_43', participant( 'user_43', { audio: fakeTrack() } ) ],
] );

const tip = () => [ ...document.querySelectorAll( '.realtime-tooltip' ) ].map( ( t ) => t.textContent ).join( '|' );

describe( 'the dock', () => {
    it( 'starts with the chat and the device settings, in a group video call, a group audio call and a call between two', async () => {
        for ( const layout of [ 'group-video', 'group-audio', 'private' ] as const ) {
            const call = fakeCall( { participants: people(), chatShown: true, chatToggle: () => {}, action: 'call_in_progress' } );
            const { container, unmount } = draw( call, layout );
            await act( async () => {} );
            const dock = container.querySelector( '.wplus-group-call-controls-buttons, .wplus-call-buttons' )!;
            const row = [ ...dock.children ].map( ( el ) => el.className.split( ' ' )[ 0 ] );

            expect( row.slice( 0, 2 ), layout ).toEqual( [ 'wplus-toggle-chat', 'wplus-configure-call' ] );
            expect( row.indexOf( 'wplus-configure-call' ), layout ).toBeLessThan( row.findIndex( ( c ) => /^wplus-(enable|disable)-mic$/.test( c ) ) );
            unmount();
        }
    } );

    it( 'shows no tooltip over a control whose popup is open, however the pointer comes back to it, and none as it closes', async () => {
        // The user's own tile hidden, so the call offers Participants (people-panel.tsx).
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );
        const call = fakeCall( { participants: people(), adminMode: true, action: 'call_in_progress' } );
        const { container } = draw( call, 'group-video' );
        await act( async () => {} );

        for ( const cls of [ 'wplus-call-more', 'wplus-host-controls', 'wplus-call-people-toggle', 'wplus-configure-call' ] ) {
            const button = () => container.querySelector<HTMLElement>( '.' + cls )!;
            fireEvent.mouseEnter( button() );
            expect( tip(), cls ).not.toBe( '' );

            await act( async () => { fireEvent.click( button() ); } );
            expect( button().getAttribute( 'aria-expanded' ), cls ).toBe( 'true' );
            expect( tip(), cls ).toBe( '' );

            // Out into what it opened and back onto the button, or into a sheet drawn inside it, which enters it again.
            fireEvent.mouseLeave( button() );
            fireEvent.mouseEnter( button() );
            fireEvent.focus( button() );
            expect( tip(), cls ).toBe( '' );

            // Closed under the pointer: nothing comes back until the pointer enters it again.
            await act( async () => { fireEvent.click( button() ); } );
            expect( button().getAttribute( 'aria-expanded' ), cls ).toBe( 'false' );
            expect( tip(), cls ).toBe( '' );
            fireEvent.mouseLeave( button() );
            fireEvent.mouseEnter( button() );
            expect( tip(), cls ).not.toBe( '' );
            fireEvent.mouseLeave( button() );
        }
    } );
} );
