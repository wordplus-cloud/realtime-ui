import React from 'react';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallButton, CallScreen, CallSpot, Chat, GroupCallButton, OnlineCount, OnlineList, Typing, useChat, useOnline, usePresence, useProfiles, useRealtime, useRoom, useTyping } from '../src/react.tsx';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';
import { devices, Emitter, fakeCall } from './fake-sdk-call.ts';

// One set of names with @wordplus/realtime/react: the screens and the hooks inside <RealtimeProvider>, which gives the
// page's connection through a context both packages make under one global name, and the `rt` an app passes still taken.

const provided = () => ( globalThis as any )[ Symbol.for( 'wordplus.realtime.react-context' ) ];

function connection( rooms: Record<string, ReturnType<typeof fakeRoom>> = {} ) {
    const group = () => Object.assign( new Emitter(), { state: 'connected', people: () => [], setTrack: vi.fn( async () => {} ), leave: vi.fn() } );
    const calls = Object.assign( new Emitter(), { start: vi.fn( async () => fakeCall() ), group: vi.fn( async () => group() ), people: vi.fn( async () => [] ) } );
    return Object.assign( fakeRooms( rooms ), { calls: async () => calls as any, callsObject: calls } );
}

const inProvider = ( rt: unknown ) => ( { children }: { children?: React.ReactNode } ) => {
    const Context = provided();
    return <Context.Provider value={ rt }>{ children }</Context.Provider>;
};

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 34 } );
    devices();
} );

afterEach( cleanup );

describe( 'the hooks', () => {
    it( 'read the connection from the provider', () => {
        const rt = connection();
        const { result } = renderHook( () => useRealtime(), { wrapper: inProvider( rt ) } );
        expect( result.current ).toBe( rt );
    } );

    it( 'join a room by its name, hear its events, and leave it as the component goes', async () => {
        const chat = fakeRoom( 'chat:1', { 34: { name: 'Ann' } } );
        const rt = connection( { 'chat:1': chat } );
        const heard: unknown[] = [];

        const { result, unmount } = renderHook( () => useRoom( 'chat:1', { message: ( data, meta ) => heard.push( [ data, meta ] ) } ), { wrapper: inProvider( rt ) } );

        expect( rt.join ).toHaveBeenCalledWith( 'chat:1' );
        expect( result.current.state ).toBe( 'joined' );
        expect( result.current.members ).toEqual( [ { id: '34', info: { name: 'Ann' } } ] );

        act( () => chat.fire( 'message', { text: 'Hi' }, { from: '42' } ) );
        expect( heard ).toEqual( [ [ { text: 'Hi' }, { from: '42' } ] ] );

        result.current.emit( 'typing', { on: true } );
        expect( chat.emit ).toHaveBeenCalledWith( 'typing', { on: true } );
        await expect( result.current.emitWithAck( 'message', { text: 'Hi' } ) ).resolves.toEqual( { id: 'e1', at: 1 } );

        unmount();
        expect( rt.leave ).toHaveBeenCalledWith( 'chat:1' );
    } );

    it( 'still take the `rt` an app passes first', () => {
        const chat = fakeRoom( 'chat:1' );
        const rt = connection( { 'chat:1': chat } );

        const { result } = renderHook( () => useRoom( rt, 'chat:1' ) );
        expect( rt.join ).toHaveBeenCalledWith( 'chat:1' );
        expect( result.current.room?.name ).toBe( 'chat:1' );

        expect( renderHook( () => useOnline( rt, [ 34 ] ) ).result.current ).toEqual( { 34: true } );
    } );

    it( 'name the room of two from this user and `with`, the smaller id first, as @wordplus/realtime/react does', () => {
        const chat = fakeRoom( 'chat:34:42' );
        const rt = connection( { 'chat:34:42': chat } );

        const { unmount } = renderHook( () => useRoom( 'chat:{pair}', {}, { with: 42 } ), { wrapper: inProvider( rt ) } );
        expect( rt.join ).toHaveBeenCalledWith( 'chat:34:42' );

        unmount();
        expect( rt.leave ).toHaveBeenCalledWith( 'chat:34:42' );

        renderHook( () => useRoom( rt, 'chat:{pair}', {}, { with: 42 } ) );
        expect( rt.join ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'join nothing while the other person of a room of two is not known yet, and fail with nobody signed in', () => {
        const rt = connection();
        const { result } = renderHook( () => useRoom( 'chat:{pair}', {}, { with: null } ), { wrapper: inProvider( rt ) } );
        expect( result.current.state ).toBe( 'idle' );
        expect( rt.join ).not.toHaveBeenCalled();

        const signedOut = Object.assign( connection(), { user: null } );
        const refused = renderHook( () => useRoom( 'chat:{pair}', {}, { with: 42 } ), { wrapper: inProvider( signedOut as never ) } );
        expect( refused.result.current ).toMatchObject( { state: 'failed', error: 'no_identity' } );
        expect( signedOut.join ).not.toHaveBeenCalled();
    } );

    it( 'join nothing with no name, or with no connection yet', async () => {
        const rt = connection();
        const { result } = renderHook( () => useRoom( null ), { wrapper: inProvider( rt ) } );
        expect( result.current.state ).toBe( 'idle' );
        expect( rt.join ).not.toHaveBeenCalled();
        await expect( result.current.emitWithAck( 'message' ) ).rejects.toMatchObject( { code: 'not_joined' } );

        const nobody = renderHook( () => useRoom( 'chat:1' ) );
        expect( nobody.result.current.state ).toBe( 'idle' );
    } );

    it( 'say who is online and when they were seen, as @wordplus/realtime/react says it', () => {
        const rt = connection();
        rt.online.lastSeen = ( ( id: string ) => ( id === '42' ? 1000 : null ) ) as never;
        rt.online.has = ( ( id: string ) => id === '34' ) as never;

        const { result } = renderHook( () => useOnline( [ 34, 42 ] ), { wrapper: inProvider( rt ) } );

        expect( result.current ).toEqual( { online: { 34: true, 42: false }, lastSeen: { 42: 1000 }, count: null } );
    } );

    it( 'list a presence room\'s members, name people, and say who is typing', async () => {
        const chat = fakeRoom( 'chat:1', { 34: { name: 'Ann' } } );
        const rt = connection( { 'chat:1': chat } );
        const wrapper = inProvider( rt );

        expect( renderHook( () => usePresence( 'chat:1' ), { wrapper } ).result.current ).toEqual( [ { id: '34', info: { name: 'Ann' } } ] );

        const people = renderHook( () => useProfiles( [ 42 ] ), { wrapper } );
        await act( async () => {} );
        expect( people.result.current[ 42 ]?.name ).toBe( 'Ben' );

        const typing = renderHook( () => useTyping( chat as never ), { wrapper } );
        act( () => chat.fire( 'typing', { on: true }, { from: '42' } ) );
        expect( typing.result.current ).toEqual( [ '42' ] );

        // Its old shape, with the `rt` first.
        const old = renderHook( () => useTyping( rt, chat as never, 'writing' ) );
        act( () => chat.fire( 'writing', { on: true }, { from: '43' } ) );
        expect( old.result.current ).toEqual( [ '43' ] );
    } );

    it( 'run a conversation on the provider\'s connection', () => {
        const chat = fakeRoom( 'chat:1' );
        const rt = connection( { 'chat:1': chat } );
        renderHook( () => useChat( { room: 'chat:1' } ), { wrapper: inProvider( rt ) } );
        expect( rt.join ).toHaveBeenCalledWith( 'chat:1' );
    } );
} );

describe( 'the screens', () => {
    it( 'draw on the provider\'s connection with no `rt`', async () => {
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
        const chat = fakeRoom( 'chat:1' );
        const rt = connection( { shop, 'chat:1': chat } );
        const Provider = inProvider( rt );

        const { container, getByText } = render( <Provider>
            <CallScreen />
            <CallSpot call="match:34:42" />
            <CallButton to={ 42 } call="support:{pair}" name="Ben">Call Ben</CallButton>
            <GroupCallButton call="meeting:daily" title="Daily">Join</GroupCallButton>
            <OnlineList room="shop" />
            <OnlineCount room="shop" />
            <Typing room="chat:1" />
            <Chat room="chat:1" />
        </Provider> );
        await act( async () => {} );

        expect( container.querySelector( '.realtime-calls' ) ).not.toBeNull();
        expect( rt.join ).toHaveBeenCalledWith( 'shop' );
        expect( rt.join ).toHaveBeenCalledWith( 'chat:1' );

        await act( async () => fireEvent.click( getByText( 'Call Ben' ) ) );
        expect( rt.callsObject.start ).toHaveBeenCalledWith( 'support:34:42', expect.objectContaining( { to: 42 } ) );
    } );

    it( 'join the group call `call` names', async () => {
        const rt = connection();
        const Provider = inProvider( rt );

        const { getByText } = render( <Provider><CallScreen /><GroupCallButton call="meeting:daily" title="Daily">Join</GroupCallButton></Provider> );
        await act( async () => {} );
        await act( async () => fireEvent.click( getByText( 'Join' ) ) );

        expect( rt.callsObject.group ).toHaveBeenCalledWith( 'meeting:daily', expect.objectContaining( { type: 'video' } ) );
    } );

    it( 'join the group call its old `room` names too, and take an `rt` over the provider\'s', async () => {
        const other = connection();
        const rt = connection();
        const Provider = inProvider( other );

        const { getByText } = render( <Provider><CallScreen rt={ rt } /><GroupCallButton rt={ rt } room="staff:daily">Join</GroupCallButton></Provider> );
        await act( async () => {} );
        await act( async () => fireEvent.click( getByText( 'Join' ) ) );

        expect( rt.callsObject.group ).toHaveBeenCalledWith( 'staff:daily', expect.anything() );
        expect( other.callsObject.group ).not.toHaveBeenCalled();
    } );

    it( 'wait for the connection with a button that does nothing yet', () => {
        const { getByText } = render( <GroupCallButton call="meeting:daily">Join</GroupCallButton> );
        expect( ( getByText( 'Join' ) as HTMLButtonElement ).disabled ).toBe( true );
    } );
} );
