// The conversation, drawn from a room made by hand (@wordplus/realtime-ui/testing): what must keep working whatever an
// app changes in its copy. `npx vitest run components/wordplus/chat`.
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureUi } from '../../src/index.ts';
import { fakeRoom, fakeRooms } from '../../src/testing.ts';
import { Chat } from '../../src/sdk/chat.tsx';

beforeEach( () => configureUi( { translate: ( text ) => text } ) );
afterEach( cleanup );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

const texts = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-chat-text' ) ].map( ( t ) => t.textContent );

describe( 'the chat', () => {
    it( 'shows the room\'s recent messages, each sender\'s together, and the start of the conversation', async () => {
        const at = Date.now() - 60_000;
        const chat = fakeRoom( 'chat:34:42', {
            members: { 34: { name: 'Ann' }, 42: { name: 'Ben' } },
            history: { more: false, events: [
                { event: 'message', data: { text: 'Hi! Has my order left yet?' }, id: 'h1', at, from: '42' },
                { event: 'message', data: { text: 'It is being packed now' }, id: 'h2', at: at + 1000, from: '34' },
            ] },
        } );
        const { container } = render( <Chat rt={ fakeRooms( { 'chat:34:42': chat } ) } room="chat:34:42" /> );
        await settle();

        expect( texts( container ) ).toEqual( [ 'Hi! Has my order left yet?', 'It is being packed now' ] );
        expect( container.textContent ).toContain( 'Start of conversation' );
    } );

    it( 'says hi on an empty conversation, sends what is typed with Enter, and says it is typing and stops', async () => {
        const chat = fakeRoom( 'chat:34:42', { members: { 34: { name: 'Ann' }, 42: { name: 'Ben' } } } );
        const { container } = render( <Chat rt={ fakeRooms( { 'chat:34:42': chat } ) } room="chat:34:42" /> );
        await settle();
        expect( container.textContent ).toContain( 'Say hi' );

        const editable = container.querySelector( '[contenteditable]' ) as HTMLElement;
        editable.textContent = 'It left this morning';
        await act( async () => { fireEvent.input( editable ); } );
        await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
        await settle();

        expect( chat.emitted ).toEqual( [ [ 'message', { text: 'It left this morning' } ] ] );
        expect( chat.volatileEmitted.map( ( [ event, data ] ) => `${ event } ${ JSON.stringify( data ) }` ) ).toContain( 'typing {"on":true}' );
        expect( chat.volatileEmitted.map( ( [ event, data ] ) => `${ event } ${ JSON.stringify( data ) }` ) ).toContain( 'typing {"on":false}' );
        expect( texts( container ) ).toEqual( [ 'It left this morning' ] );
    } );

    it( 'takes messages as they come, and marks the newest from the others read', async () => {
        const chat = fakeRoom( 'chat:34:42', { members: { 34: { name: 'Ann' }, 42: { name: 'Ben' } } } );
        const { container } = render( <Chat rt={ fakeRooms( { 'chat:34:42': chat } ) } room="chat:34:42" /> );
        await settle();

        await act( async () => chat.fire( 'message', { text: 'Thanks!' }, { from: '42', id: 'm2', at: Date.now() } ) );
        await settle();
        expect( texts( container ) ).toEqual( [ 'Thanks!' ] );
        expect( chat.volatileEmitted ).toContainEqual( [ 'read', { id: 'm2' } ] );
    } );

    it( 'reacts to someone else\'s message from its picker, and takes the reaction back from its pill', async () => {
        const chat = fakeRoom( 'chat:34:42', {
            members: { 34: { name: 'Ann' }, 42: { name: 'Ben' } },
            history: { more: false, events: [ { event: 'message', data: { text: 'Love it' }, id: 'h1', at: Date.now(), from: '42' } ] },
        } );
        const { container } = render( <Chat rt={ fakeRooms( { 'chat:34:42': chat } ) } room="chat:34:42" reactions={ [ '1f44d', '2764' ] } /> );
        await settle();

        await act( async () => { fireEvent.mouseEnter( container.querySelector( '.wplus-reaction-trigger' )! ); } );
        await act( async () => { fireEvent.click( document.body.querySelectorAll( '.wplus-reaction-strip__item' )[ 0 ] ); } );
        await settle();
        expect( chat.emitted ).toEqual( [ [ 'reaction', { id: 'h1', key: '1f44d' } ] ] );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-reaction-pill' )! ); } );
        await settle();
        expect( chat.emitted.at( -1 ) ).toEqual( [ 'reaction', { id: 'h1', key: '' } ] );
        expect( container.querySelector( '.wplus-reaction-pill' ) ).toBeNull();
    } );
} );
