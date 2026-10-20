// @vitest-environment node
// An app's server renders the components too: Next.js draws a page's client components on the server for its first
// paint. So every entry loads without a browser, and every React component renders there, drawing nothing of a call
// until the browser has one.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

it( 'loads every entry without a browser, as built for apps too', async () => {
    expect( typeof window ).toBe( 'undefined' );
    for ( const entry of [ '../src/index.ts', '../src/calls.ts', '../src/react.tsx', '../dist/index.js', '../dist/calls.js', '../dist/react.js' ] ) {
        await expect( import( /* @vite-ignore */ entry ), entry ).resolves.toBeTruthy();
    }
    const { screenShareSupport, pictureInPictureSupport } = await import( '../src/calls.ts' );
    expect( [ screenShareSupport, pictureInPictureSupport ] ).toEqual( [ false, false ] );
}, 30_000 ); // six entries transformed and loaded afresh: several seconds while the other files run beside it

it( 'renders every React component on the server, with or without the page\'s rt', async () => {
    const { CallScreen, CallButton, GroupCallButton, OnlineList, OnlineCount, Typing, Chat } = await import( '../src/react.tsx' );
    const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
    const chat = fakeRoom( 'chat:34:42' );
    const calls = { calls: () => new Promise<never>( () => {} ) };

    for ( const rooms of [ null, Object.assign( fakeRooms( { shop, 'chat:34:42': chat } ), calls ) ] ) {
        const rt = rooms as never;
        expect( renderToString( <CallScreen rt={ rt } /> ) ).toBe( '' );
        expect( renderToString( <CallButton rt={ rt } to={ 34 } call="support:34:42" name="Ann">Call Ann</CallButton> ) ).toContain( 'Call Ann' );
        expect( renderToString( <GroupCallButton rt={ rt } room="staff:daily">Join</GroupCallButton> ) ).toContain( 'Join' );
        expect( renderToString( <OnlineList rt={ rt } room="shop" /> ) ).toBeTypeOf( 'string' );
        expect( renderToString( <OnlineCount rt={ rt } room="shop" /> ) ).toBeTypeOf( 'string' );
        expect( renderToString( <Typing rt={ rt } room="chat:34:42" /> ) ).toBeTypeOf( 'string' );
        expect( renderToString( <Chat rt={ rt } room="chat:34:42" /> ) ).toBeTypeOf( 'string' );
    }
} );
