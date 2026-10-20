// Who is in a room, who is typing and how many are there, drawn from rooms made by hand (@wordplus/realtime-ui/testing):
// what must keep working whatever an app changes in its copy. `npx vitest run components/wordplus/online-list`.
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureUi } from '../../src/index.ts';
import { fakeRoom, fakeRooms } from '../../src/testing.ts';
import { RoomCount, RoomOnline, RoomTyping } from '../../src/sdk/presence-views.tsx';

beforeEach( () => configureUi( { translate: ( text ) => text } ) );
afterEach( cleanup );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

describe( 'the online list', () => {
    it( 'joins the room, names everyone, the page\'s user as You, offers the others its actions, and leaves with the screen', async () => {
        const shop = fakeRoom( 'shop', { members: { 34: { name: 'Ann' }, 42: { name: 'Ben', role: 'Customer' } } } );
        const rt = fakeRooms( { shop } );
        const { container, unmount } = render( <RoomOnline rt={ rt } room="shop" actions={ ( m ) => <button className="call">Call { m.name }</button> } /> );
        await settle();

        expect( rt.joined.has( 'shop' ) ).toBe( true );
        expect( container.textContent ).toContain( 'Online (2)' );
        expect( container.textContent ).toContain( 'You' );
        expect( container.textContent ).toContain( 'Customer' );
        expect( [ ...container.querySelectorAll( '.call' ) ].map( ( b ) => b.textContent ) ).toEqual( [ 'Call Ben' ] );

        await act( async () => {
            shop.members.set( '43', { name: 'Cara' } );
            shop.fire( 'join', { id: '43' } );
        } );
        expect( container.textContent ).toContain( 'Online (3)' );

        unmount();
        expect( rt.joined.has( 'shop' ) ).toBe( false );
    } );
} );

describe( 'typing and the count', () => {
    it( 'says who is typing by name, never the page\'s own user', async () => {
        const chat = fakeRoom( 'chat:34:42', { members: { 34: { name: 'Ann' }, 42: { name: 'Ben' } } } );
        const { container } = render( <RoomTyping rt={ fakeRooms( { 'chat:34:42': chat } ) } room="chat:34:42" /> );
        await settle();

        await act( async () => chat.fire( 'typing', { on: true }, { from: '42' } ) );
        expect( container.textContent ).toContain( 'Ben' );
        await act( async () => chat.fire( 'typing', { on: true }, { from: '34' } ) );
        expect( container.textContent ).not.toContain( 'Ann' );
    } );

    it( 'counts the people in a room, nothing at none', async () => {
        const shop = fakeRoom( 'shop', { members: { 34: {}, 42: {} } } );
        const { container } = render( <RoomCount rt={ fakeRooms( { shop } ) } room="shop" /> );
        await settle();
        expect( container.textContent ).toBe( '2' );
    } );
} );
