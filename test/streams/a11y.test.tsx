import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {ConfirmProvider, EasyStreamApp, useConfirm} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// What a keyboard and a screen reader need of the player: a dialog keeps the focus while open, a menu answers Home, End,
// a letter and Tab, and the moments of a stream (joining, ended, failed) are said as they come.

beforeEach( () => window.localStorage.clear() );
afterEach( cleanup );

const track = ( id : string ) => ( { attach: () => {}, detach: () => {}, sid: 'TR_' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;
const live = ( patch : Partial<EasyStreamState> = {} ) : Partial<EasyStreamState> => ( {
    stream: { id: 's', state: 'live', started_at: Date.now() - 65_000, ended_at: null },
    media: 'live',
    tiles: [ { identity: 'u:1', name: 'Maya Lee', role: 'host', local: false, camera: track( 'v' ), screen: null, audio: [ track( 'a' ) ], micMuted: false, speaking: false, encoder: false } ],
    ...patch
} );

function Asks(){
    const confirm = useConfirm();
    return <button type="button" onClick={ () => { void confirm( { title: 'End the stream for everyone?', confirm: 'End for everyone' } ); } }>Ask</button>;
}

describe( 'the player for a keyboard and a screen reader', () => {
    it( 'keeps the focus inside a dialog while it is open, round its buttons', async () => {
        render( <ConfirmProvider><Asks /></ConfirmProvider> );
        await act( async () => { fireEvent.click( screen.getByText( 'Ask' ) ); } );

        const cancel = screen.getByRole( 'button', { name: 'Cancel' } );
        const end = screen.getByRole( 'button', { name: 'End for everyone' } );
        expect( document.activeElement ).toBe( cancel );

        // Tab from the last goes to the first, Shift+Tab from the first to the last.
        end.focus();
        fireEvent.keyDown( end, { key: 'Tab' } );
        expect( document.activeElement ).toBe( cancel );
        fireEvent.keyDown( cancel, { key: 'Tab', shiftKey: true } );
        expect( document.activeElement ).toBe( end );
    } );

    it( 'moves through a menu with Home, End and a letter, and closes it on Tab', () => {
        const { client, asClient } = fakeClient( live() );
        client.pictureLayers.mockReturnValue( [ { quality: 'high', width: 1280, height: 720 }, { quality: 'low', width: 640, height: 360 } ] );
        render( <EasyStreamApp client={ asClient } /> );

        const button = screen.getByLabelText( 'Settings' );
        fireEvent.click( button );
        const menu = screen.getByRole( 'menu' );
        const names = () => ( document.activeElement as HTMLElement ).querySelector( '.estream-menu__label' )?.firstChild?.textContent;
        expect( names() ).toBe( 'Auto' );

        fireEvent.keyDown( menu, { key: 'End' } );
        expect( document.activeElement?.textContent ).toBe( 'Statistics' );
        fireEvent.keyDown( menu, { key: 'Home' } );
        expect( names() ).toBe( 'Auto' );
        fireEvent.keyDown( menu, { key: '3' } );
        expect( names() ).toBe( '360p' );
        fireEvent.keyDown( menu, { key: 's' } );
        expect( document.activeElement?.textContent ).toBe( 'Statistics' );

        fireEvent.keyDown( menu, { key: 'Tab' } );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();
        expect( document.activeElement ).toBe( button );
    } );

    it( 'lists its keys on ?, only those it answers here, and closes the list on Escape, giving the focus back', () => {
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );
        const stage = document.querySelector( '.estream-stage' ) as HTMLElement;
        stage.focus();

        fireEvent.keyDown( stage, { key: '?' } );
        const list = screen.getByRole( 'dialog', { name: 'Keyboard shortcuts' } );
        const keys = [ ...list.querySelectorAll( 'kbd' ) ].map( ( k ) => k.textContent );
        // The chat beside the player hides with C; this browser has no full screen or picture-in-picture to offer.
        expect( keys ).toEqual( expect.arrayContaining( [ 'M', 'C', 'I', 'Esc', '?' ] ) );
        expect( keys ).not.toContain( 'P' );
        expect( list.textContent ).toContain( 'Show or hide the chat' );

        fireEvent.keyDown( screen.getByRole( 'button', { name: 'Close' } ), { key: 'Escape' } );
        expect( screen.queryByRole( 'dialog' ) ).toBeNull();
        expect( document.activeElement ).toBe( stage );
    } );

    it( 'says each moment of the stream as it comes, a failure at once', () => {
        const { update, asClient } = fakeClient( { status: 'joining' } );
        render( <EasyStreamApp client={ asClient } /> );
        expect( screen.getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'Joining…' );

        update( { status: 'ready', stream: { id: 's', state: 'ended', started_at: Date.now() - 600_000, ended_at: Date.now() } } );
        expect( screen.getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'This stream has ended' );

        update( { status: 'error', error: 'server' } );
        expect( screen.getByRole( 'alert' ).textContent ).toBeTruthy();
    } );
} );
