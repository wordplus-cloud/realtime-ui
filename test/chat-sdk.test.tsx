import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from '../src/react.tsx';
import { configureUi } from '../src/index.ts';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

beforeEach( () => configureUi( { translate: ( text: string ) => text } ) );
afterEach( cleanup );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

function chatWith( events: Array<{ event: string; data: unknown; id?: string; at?: number; from?: string }> = [], more = false ) {
    const room = fakeRoom( 'chat:34:42', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
    room.history.mockImplementation( async () => ( { events, more } ) );
    const rt = fakeRooms( { 'chat:34:42': room } );
    return { room, rt };
}

const stacks = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-msg-stack' ) ].map( ( s ) => ( {
    me: s.getAttribute( 'data-is-me' ) === '1',
    texts: [ ...s.querySelectorAll( '.wplus-chat-text' ) ].map( ( t ) => t.textContent ),
} ) );

describe( 'the chat on a room', () => {
    it( 'shows the room\'s history in Better Messages\' stacks, its reactions, and the start of the conversation', async () => {
        const at = Date.now() - 60_000;
        const { rt, room } = chatWith( [
            { event: 'message', data: { text: 'Hi! Has my order left yet?' }, id: 'h1', at, from: '42' },
            { event: 'message', data: { text: 'Not yet' }, id: 'h2', at: at + 1000, from: '42' },
            { event: 'message', data: { text: 'It is being packed now' }, id: 'h3', at: at + 2000, from: '34' },
            { event: 'reaction', data: { id: 'h3', key: '2764' }, id: 'h4', at: at + 3000, from: '42' },
        ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();

        expect( room.history ).toHaveBeenCalledWith( { limit: 50 } );
        expect( stacks( container ) ).toEqual( [
            { me: false, texts: [ 'Hi! Has my order left yet?', 'Not yet' ] },
            { me: true, texts: [ 'It is being packed now' ] },
        ] );
        expect( container.querySelector( '.wplus-day-pill' )?.textContent ).toBe( 'Today' );
        const pill = container.querySelector( '[data-message-id="h3"] .wplus-reaction-pill' )!;
        expect( pill.textContent ).toBe( '❤' );
        expect( container.querySelector( '.wplus-history-start' )?.textContent ).toBe( 'Start of conversation' );
        // Ben's messages can be reacted to; Ann's own can't.
        expect( container.querySelectorAll( '[data-is-me="0"] .wplus-reaction-trigger' ) ).toHaveLength( 2 );
        expect( container.querySelectorAll( '[data-is-me="1"] .wplus-reaction-trigger' ) ).toHaveLength( 0 );
    } );

    it( 'sends what is typed with an ack, says it is typing and stops, and ticks sent, then seen when read', async () => {
        const { rt, room } = chatWith();
        room.emitWithAck.mockImplementation( async () => ( { id: 'm9', at: Date.now() } ) );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();
        expect( container.querySelector( '.wplus-empty-thread' ) ).not.toBeNull();

        const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
        editable.textContent = 'It left this morning';
        await act( async () => { fireEvent.input( editable ); } );
        expect( room.volatile.emit ).toHaveBeenCalledWith( 'typing', { on: true } );

        await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
        await settle();
        expect( room.emitWithAck ).toHaveBeenCalledWith( 'message', { text: 'It left this morning' } );
        expect( room.volatile.emit ).toHaveBeenCalledWith( 'typing', { on: false } );
        expect( editable.textContent ).toBe( '' );
        expect( stacks( container ) ).toEqual( [ { me: true, texts: [ 'It left this morning' ] } ] );
        const status = () => container.querySelector( '.wplus-msg-meta[data-variant="overlay"] .wplus-msg-status' )?.getAttribute( 'data-status' );
        expect( status() ).toBe( 'sent' );

        await act( async () => room.fire( 'read', { id: 'm9' }, { from: '42' } ) );
        expect( status() ).toBe( 'seen' );
    } );

    it( 'says the user was removed when the app server kicks them out of the room, its composer off', async () => {
        // A kicked member saw nothing and kept typing into nothing (an SDK review, 2026-10-14).
        const { rt, room } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();
        expect( container.querySelector( '.wplus-chat-removed' ) ).toBeNull();
        await act( async () => {
            Object.assign( room, { state: 'failed', error: 'kicked' } );
            room.fire( 'kicked', { code: 'kicked' } );
        } );
        expect( container.querySelector( '.wplus-chat-removed' )?.textContent ).toBe( 'Removed from conversation' );
        // In place of the composer: a placeholder and a Send arrow left there read as usable.
        expect( container.querySelector( '.wplus-composer' ) ).toBeNull();
    } );

    it( 'tells the page each message the room took, with its id, for its own server, and nothing of one that failed', async () => {
        // So a page can tell the other person, where no webhook reaches its server (an SDK review, 2026-10-14).
        const { rt, room } = chatWith();
        const at = Date.now();
        room.emitWithAck.mockImplementationOnce( async () => ( { id: 'm9', at } ) ).mockImplementationOnce( async () => { throw new Error( 'forbidden' ); } );
        const sent = vi.fn();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" onSent={ sent } /> );
        await settle();
        const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
        const say = async ( text: string ) => {
            editable.textContent = text;
            await act( async () => { fireEvent.input( editable ); } );
            await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
            await settle();
        };

        await say( 'It left this morning' );
        expect( sent ).toHaveBeenCalledWith( { id: 'm9', room: 'chat:34:42', text: 'It left this morning', at } );
        await say( 'And this one fails' );
        expect( sent ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'takes messages as they come, marks the newest read, and shows who is typing until they speak', async () => {
        const { rt, room } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();

        await act( async () => room.fire( 'typing', { on: true }, { from: '42' } ) );
        await settle();
        expect( container.querySelector( '.wplus-typing-pinned' )?.textContent ).toBe( 'Ben typing' );

        await act( async () => room.fire( 'message', { text: 'Thanks!' }, { from: '42', id: 'n1', at: Date.now() } ) );
        await settle();
        expect( stacks( container ) ).toEqual( [ { me: false, texts: [ 'Thanks!' ] } ] );
        expect( container.querySelector( '.wplus-typing-pinned' ) ).toBeNull();
        expect( room.volatile.emit ).toHaveBeenCalledWith( 'read', { id: 'n1' } );

        // The same message again (another tab's echo, a replay) is kept once.
        await act( async () => room.fire( 'message', { text: 'Thanks!' }, { from: '42', id: 'n1', at: Date.now() } ) );
        expect( container.querySelectorAll( '.wplus-chat-text' ) ).toHaveLength( 1 );
    } );

    it( 'reacts to a message from its picker, and takes the reaction back from the pill', async () => {
        const { rt, room } = chatWith( [ { event: 'message', data: { text: 'Shipped?' }, id: 'h1', at: Date.now(), from: '42' } ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" reactions={ [ '1f44d', '2764' ] } /> );
        await settle();

        await act( async () => { fireEvent.mouseEnter( container.querySelector( '.wplus-reaction-trigger' )! ); } );
        await act( async () => { fireEvent.click( document.body.querySelectorAll( '.wplus-reaction-strip__item' )[ 0 ] ); } );
        await settle();
        expect( room.emitWithAck ).toHaveBeenCalledWith( 'reaction', { id: 'h1', key: '1f44d' } );
        const pill = container.querySelector( '.wplus-reaction-pill' )!;
        expect( pill.getAttribute( 'data-reacted-by-me' ) ).toBe( '1' );

        await act( async () => { fireEvent.click( pill ); } );
        await settle();
        expect( room.emitWithAck ).toHaveBeenLastCalledWith( 'reaction', { id: 'h1', key: '' } );
        expect( container.querySelector( '.wplus-reaction-pill' ) ).toBeNull();
    } );

    it( 'pages back through the history as the reader nears the top', async () => {
        const at = Date.now();
        const { rt, room } = chatWith( [ { event: 'message', data: { text: 'Newer' }, id: 'h9', at, from: '42' } ], true );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();
        expect( container.querySelector( '.wplus-history-start' )?.getAttribute( 'data-visible' ) ).toBeNull();

        room.history.mockImplementation( async () => ( { events: [ { event: 'message', data: { text: 'Older' }, id: 'h1', at: at - 1000, from: '42' } ], more: false } ) );
        const list = container.querySelector( '.wplus-msg-list' ) as HTMLElement;
        await act( async () => { fireEvent.scroll( list ); } );
        await settle();
        expect( room.history ).toHaveBeenLastCalledWith( { before: 'h9', limit: 50 } );
        expect( stacks( container ) ).toEqual( [ { me: false, texts: [ 'Older', 'Newer' ] } ] );
        expect( container.querySelector( '.wplus-history-start' )?.textContent ).toBe( 'Start of conversation' );
    } );

    it( 'shows a day label pinned to the top while the list scrolls, and fades it once the list rests', async () => {
        const { rt } = chatWith( [ { event: 'message', data: { text: 'Hello' }, id: 'h1', at: Date.now(), from: '42' } ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();
        const list = container.querySelector( '.wplus-msg-list' ) as HTMLElement;
        const day = container.querySelector( '.wplus-msg-day' ) as HTMLElement;
        const label = container.querySelector( '.wplus-day-sep' ) as HTMLElement;
        // The day runs on above the top edge, its label pushed down to it.
        day.getBoundingClientRect = () => ( { top: -300 } ) as DOMRect;
        label.getBoundingClientRect = () => ( { top: 0 } ) as DOMRect;
        vi.useFakeTimers();
        try {
            act( () => { fireEvent.scroll( list ); } );
            expect( label.classList.contains( 'wplus-day-sep--stuck' ) ).toBe( true );
            expect( label.classList.contains( 'wplus-day-sep--faded' ) ).toBe( false );
            act( () => { vi.advanceTimersByTime( 900 ); } );
            expect( label.classList.contains( 'wplus-day-sep--faded' ) ).toBe( true );
            act( () => { fireEvent.scroll( list ); } );
            expect( label.classList.contains( 'wplus-day-sep--faded' ) ).toBe( false );
        } finally {
            vi.useRealTimers();
        }
        // In its place at the head of its day, a label is never faded.
        label.getBoundingClientRect = () => ( { top: -300 } ) as DOMRect;
        vi.useFakeTimers();
        try {
            act( () => { fireEvent.scroll( list ); vi.advanceTimersByTime( 900 ); } );
            expect( label.classList.contains( 'wplus-day-sep--stuck' ) ).toBe( false );
            expect( label.classList.contains( 'wplus-day-sep--faded' ) ).toBe( false );
        } finally {
            vi.useRealTimers();
        }
    } );
} );

// The conversation is the app's to keep; the cloud only delivers its events as they happen.
describe( 'the chat on the conversation the app keeps', () => {
    it( 'shows the app\'s newest page, with what the app has not saved yet from the room, each message once', async () => {
        const at = Date.now() - 60_000;
        // The room's last day: a message the app has (k2), one it has not saved yet (h3), and a reaction since.
        const { rt, room } = chatWith( [
            { event: 'message', data: { text: 'It is being packed now' }, id: 'k2', at: at + 1000, from: '34' },
            { event: 'message', data: { text: 'Thanks!' }, id: 'h3', at: at + 2000, from: '42' },
            { event: 'reaction', data: { id: 'k2', key: '1f44d' }, id: 'h4', at: at + 3000, from: '42' },
        ] );
        const load = vi.fn( async () => ( {
            messages: [
                { id: 'k1', from: 42, text: 'Hi! Has my order left yet?', at },
                { id: 'k2', from: 34, text: 'It is being packed now', at: at + 1000, reactions: { '2764': [ 42 ] } },
            ],
            more: true,
        } ) );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" load={ load } /> );
        await settle();

        expect( load ).toHaveBeenCalledWith( null );
        expect( stacks( container ) ).toEqual( [
            { me: false, texts: [ 'Hi! Has my order left yet?' ] },
            { me: true, texts: [ 'It is being packed now' ] },
            { me: false, texts: [ 'Thanks!' ] },
        ] );
        // The app's reaction, then Ben's change of it from the room's last day: one each.
        expect( container.querySelector( '[data-message-id="k2"] .wplus-reaction-pill' )?.textContent ).toBe( '👍' );
        // More of the app's pages to come: not yet the start of the conversation.
        expect( container.querySelector( '.wplus-history-start' )?.getAttribute( 'data-visible' ) ).toBeNull();
    } );

    it( 'names the people of a group by the names and pictures the page gives, where the directory knows them not', async () => {
        const at = Date.now() - 60_000;
        const { rt } = chatWith();
        // Cara (77) wrote in the channel but has not been online for days: the directory has no Cara.
        const load = vi.fn( async () => ( {
            messages: [
                { id: 'k1', from: 77, text: 'Design review at three?', at },
                { id: 'k2', from: 42, text: 'Works for me', at: at + 1000 },
            ],
            more: false,
        } ) );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" load={ load } people={ { 77: { name: 'Cara', avatar: '/people/cara.jpg' } } } /> );
        await settle();

        const stack = ( id: string ) => container.querySelector( `[data-message-id="${ id }"]` )!.closest( '.wplus-msg-stack' )!;
        expect( stack( 'k1' ).querySelector( '.wplus-name' )?.textContent ).toBe( 'Cara' );
        expect( stack( 'k1' ).innerHTML ).toContain( '/people/cara.jpg' );
        // Ben, whom the page leaves out, by the directory.
        expect( stack( 'k2' ).querySelector( '.wplus-name' )?.textContent ).toBe( 'Ben' );
    } );

    it( 'pages back through the app, not the room, and leaves out a room message older than the app\'s page', async () => {
        const at = Date.now() - 60_000;
        const { rt, room } = chatWith( [ { event: 'message', data: { text: 'Older, on the app\'s next page' }, id: 'k0', at: at - 5000, from: '42' } ] );
        const load = vi.fn( async ( before: { id: string; at: number } | null ) => before
            ? { messages: [ { id: 'k0', from: '42', text: 'Older, on the app\'s next page', at: at - 5000 } ], more: false }
            : { messages: [ { id: 'k1', from: '42', text: 'Newer', at } ], more: true } );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" load={ load } /> );
        await settle();
        expect( stacks( container ) ).toEqual( [ { me: false, texts: [ 'Newer' ] } ] );

        const list = container.querySelector( '.wplus-msg-list' ) as HTMLElement;
        await act( async () => { fireEvent.scroll( list ); } );
        await settle();
        expect( load ).toHaveBeenLastCalledWith( { id: 'k1', at } );
        expect( room.history ).not.toHaveBeenCalledWith( expect.objectContaining( { before: expect.anything() } ) );
        expect( stacks( container ) ).toEqual( [ { me: false, texts: [ 'Older, on the app\'s next page', 'Newer' ] } ] );
        expect( container.querySelector( '.wplus-history-start' )?.textContent ).toBe( 'Start of conversation' );
    } );

    it( 'shows the room\'s last day when the app\'s server does not answer', async () => {
        const { rt } = chatWith( [ { event: 'message', data: { text: 'From the room' }, id: 'h1', at: Date.now(), from: '42' } ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" load={ async () => { throw new Error( 'down' ); } } /> );
        await settle();
        expect( stacks( container ) ).toEqual( [ { me: false, texts: [ 'From the room' ] } ] );
    } );
} );

describe( 'the in-tree chat from the app route', () => {
    it( 'asks the route `messages` names for the messages the app kept, as <chat-room messages> does', async () => {
        const at = Date.now() - 60_000;
        const fetched: string[] = [];
        const saved = globalThis.fetch;
        globalThis.fetch = vi.fn( async ( url: any ) => {
            fetched.push( String( url ) );
            return new Response( JSON.stringify( { messages: [ { id: 'k1', from: '42', text: 'Kept by the app', at, reactions: {} } ], more: false } ) );
        } ) as any;
        try {
            const { rt } = chatWith();
            const { container } = render( <Chat rt={ rt } room="chat:34:42" messages="/api/chat/messages" /> );
            await settle();
            expect( fetched[ 0 ] ).toMatch( /\/api\/chat\/messages$/ );
            expect( container.textContent ).toContain( 'Kept by the app' );
        } finally {
            globalThis.fetch = saved;
        }
    } );
} );
