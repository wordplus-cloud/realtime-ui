import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OnlineCount, OnlineList, Typing } from '../src/react.tsx';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

afterEach( cleanup );

describe( 'presence on the SDK\'s rooms', () => {
    it( 'lists a presence room\'s people with their pictures, the page\'s user as You, and actions for the others', async () => {
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann', role: 'Support' }, 42: { name: 'Ben', role: 'Customer' } } );
        const rt = fakeRooms( { shop } );
        const { container, unmount } = render( <OnlineList rt={ rt } room="shop" actions={ ( m ) => <button className="call">Call { m.name }</button> } /> );
        await act( async () => {} );

        expect( rt.join ).toHaveBeenCalledWith( 'shop' );
        expect( container.querySelector( '.wplus-chat-online__title' )?.textContent ).toBe( 'Online (2)' );
        const rows = [ ...container.querySelectorAll( '.wplus-conv-admin__member' ) ];
        expect( rows.map( ( r ) => r.querySelector( '.wplus-conv-admin__member-name' )?.textContent ) ).toEqual( [ 'Ann', 'Ben' ] );
        expect( rows.map( ( r ) => r.querySelector( '.wplus-conv-admin__member-sub' )?.textContent ) ).toEqual( [ 'You', 'Customer' ] );
        expect( rows[ 1 ].querySelector( 'img' )?.getAttribute( 'src' ) ).toBe( '/avatars/ben.svg' );
        expect( rows[ 1 ].querySelector( '.wplus-presence-dot' ) ).not.toBeNull();
        expect( [ ...container.querySelectorAll( '.call' ) ].map( ( b ) => b.textContent ) ).toEqual( [ 'Call Ben' ] );

        // Someone comes in.
        await act( async () => {
            shop.members.set( '43', { name: 'Cara', role: 'Warehouse' } );
            shop.fire( 'join', { id: '43' } );
        } );
        expect( container.querySelector( '.wplus-chat-online__title' )?.textContent ).toBe( 'Online (3)' );

        // The room it joined itself is left with it.
        unmount();
        expect( rt.leave ).toHaveBeenCalledWith( 'shop' );
    } );

    it( 'never leaves a room the app had joined itself', () => {
        const shop = fakeRoom( 'shop' );
        const rt = fakeRooms( { shop }, [ 'shop' ] );
        render( <OnlineCount rt={ rt } room="shop" /> ).unmount();
        expect( rt.leave ).not.toHaveBeenCalled();
    } );

    it( 'says who is typing by name, never the page\'s own user, until they stop or speak', async () => {
        const chat = fakeRoom( 'chat:34:42' );
        const rt = fakeRooms( { 'chat:34:42': chat } );
        const { container } = render( <Typing rt={ rt } room="chat:34:42" /> );
        await act( async () => {} );
        expect( container.innerHTML ).toBe( '' );

        await act( async () => chat.fire( 'typing', { on: true }, { from: '34' } ) );
        expect( container.innerHTML ).toBe( '' );

        await act( async () => chat.fire( 'typing', { on: true }, { from: '42' } ) );
        await act( async () => {} );
        expect( container.textContent ).toBe( 'Ben typing' );

        await act( async () => chat.fire( 'message', { text: 'Hi' }, { from: '42' } ) );
        expect( container.innerHTML ).toBe( '' );

        await act( async () => chat.fire( 'typing', { on: true }, { from: '42' } ) );
        await act( async () => chat.fire( 'typing', { on: false }, { from: '42' } ) );
        expect( container.innerHTML ).toBe( '' );
    } );

    it( 'counts a room live', async () => {
        const shop = fakeRoom( 'shop' );
        shop.count = 12;
        const rt = fakeRooms( { shop } );
        const { container } = render( <OnlineCount rt={ rt } room="shop" /> );
        expect( container.textContent ).toBe( '12' );
        await act( async () => {
            shop.count = 130;
            shop.fire( 'count', 130 );
        } );
        expect( container.textContent ).toBe( '99+' );
    } );
} );

describe( 'the in-tree screens, as a React app draws them (an SDK review, 2026-10-15)', () => {
    it( 'give each of the others in the online list its call buttons from `call`, as the element does', async () => {
        const { vi } = await import( 'vitest' );
        const { fireEvent } = await import( '@testing-library/react' );
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
        const start = vi.fn( async () => { throw Object.assign( new Error( 'forbidden' ), { code: 'forbidden' } ); } );
        const calls = { on: () => calls, off: () => calls, start, group: vi.fn(), people: vi.fn( async () => [] ) };
        const rt = Object.assign( fakeRooms( { shop } ), { calls: async () => calls as any } );
        const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );

        const { container } = render( <OnlineList rt={ rt } room="shop" call="support:{pair}" type="audio video" /> );
        await act( async () => {} );
        const buttons = [ ...container.querySelectorAll( '.wplus-row-action' ) ];
        expect( buttons.map( ( b ) => b.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Audio Call', 'Video Call' ] );   // Ben alone

        await act( async () => { fireEvent.click( buttons[ 1 ] ); } );
        expect( start ).toHaveBeenCalledWith( 'support:34:42', { to: 42, type: 'video' } );
        warn.mockRestore();
    } );

    it( 'show call buttons only for those the app rules let the user call, all asked in one request', async () => {
        const { vi } = await import( 'vitest' );
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' }, 56: { name: 'Cara' } } );
        const may = vi.fn( async ( asks: Array<{ call: string; to: number }> ) => asks.map( ( a ) => a.to !== 56 ) );
        const calls = { on: () => calls, off: () => calls, start: vi.fn(), group: vi.fn(), people: vi.fn( async () => [] ), may };
        const rt = Object.assign( fakeRooms( { shop } ), { calls: async () => calls as any } );

        const { container } = render( <OnlineList rt={ rt } room="shop" call="support:{pair}" type="video" /> );
        for ( let i = 0; i < 4; i++ ) await act( async () => { await new Promise( ( r ) => setTimeout( r, 0 ) ); } );
        const rows = [ ...container.querySelectorAll( '.wplus-conv-admin__member' ) ];
        const buttonsOf = ( name: string ) => rows.find( ( r ) => r.textContent?.includes( name ) )!.querySelectorAll( '.wplus-row-action' ).length;
        expect( buttonsOf( 'Ben' ) ).toBe( 1 );
        expect( buttonsOf( 'Cara' ) ).toBe( 0 );
        expect( may ).toHaveBeenCalledTimes( 1 );
        expect( may.mock.calls[ 0 ][ 0 ] ).toEqual( [ { call: 'support:34:42', to: 42 }, { call: 'support:34:56', to: 56 } ] );
    } );

    it( 'keep the call buttons where the app can not say who may call whom', async () => {
        const { vi } = await import( 'vitest' );
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
        const calls = { on: () => calls, off: () => calls, start: vi.fn(), group: vi.fn(), people: vi.fn( async () => [] ), may: vi.fn( async ( asks: unknown[] ) => asks.map( () => null ) ) };
        const rt = Object.assign( fakeRooms( { shop } ), { calls: async () => calls as any } );

        const { container } = render( <OnlineList rt={ rt } room="shop" call="support:{pair}" type="video" /> );
        for ( let i = 0; i < 4; i++ ) await act( async () => { await new Promise( ( r ) => setTimeout( r, 0 ) ); } );
        expect( container.querySelectorAll( '.wplus-row-action' ).length ).toBe( 1 );
    } );

    it( 'draw the call buttons with a look of their own, kept by an app CSS reset, and the call screen in no place of the layout', async () => {
        const { CallButton, GroupCallButton, CallScreen } = await import( '../src/react.tsx' );
        const calls = { on: () => calls, off: () => calls, start: async () => ( {} ), group: async () => ( {} ), people: async () => [] };
        const rt = { calls: async () => calls as any };
        const { container } = render( <>
            <CallButton rt={ rt } to={ 34 } call="support:34:42" className="mine">Call Ann</CallButton>
            <GroupCallButton rt={ rt } room="meeting:daily">Join</GroupCallButton>
            <CallScreen rt={ rt } />
        </> );
        await act( async () => {} );
        const [ call, join ] = [ ...container.querySelectorAll( 'button' ) ];
        expect( call.className ).toBe( 'realtime-call-button mine' );
        expect( join.className ).toBe( 'realtime-call-button' );
        expect( ( container.querySelector( '.realtime-calls' ) as HTMLElement ).style.display ).toBe( 'contents' );
    } );

    it( 'fill in a call button\'s template as <call-button> does', async () => {
        const { vi } = await import( 'vitest' );
        const { fireEvent } = await import( '@testing-library/react' );
        const { CallButton } = await import( '../src/react.tsx' );
        const start = vi.fn( async () => { throw Object.assign( new Error( 'forbidden' ), { code: 'forbidden' } ); } );
        const calls = { on: () => calls, off: () => calls, start, group: vi.fn(), people: vi.fn( async () => [] ) };
        const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
        const { container } = render( <CallButton rt={ { user: '42', calls: async () => calls as any } } to={ 34 } call="support:{pair}">Call Ann</CallButton> );
        await act( async () => {} );
        await act( async () => { fireEvent.click( container.querySelector( 'button' )! ); } );
        expect( start ).toHaveBeenCalledWith( 'support:34:42', { to: 34, type: 'video' } );
        warn.mockRestore();
    } );
} );
