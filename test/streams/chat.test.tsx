import {afterEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import type {ChatMessage} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {backTo, linkify, mentions} from "../../src/components/streams/chat.tsx";
import {base, byTip, fakeClient} from "./fake.tsx";

// The chat: who wrote what and when, links, mentions, scrolling, writing, and moderating.

afterEach( () => {
    cleanup();
    vi.useRealTimers();
} );

const message = ( id : string, text : string, from : Partial<ChatMessage['from']> = {} ) : ChatMessage => ( {
    id, text, at: Date.UTC( 2026, 9, 8, 18, 5 ),
    from: { id: 'u:3', name: 'Sam', avatar: null, role: 'viewer', ...from }
} );

const live = { stream: { id: 's', state: 'live' as const, started_at: 1, ended_at: null } };

describe( 'the chat', () => {
    it( 'shows who wrote each message, their role, and when', () => {
        const { asClient } = fakeClient( { chat: [
            message( '1-0', 'Welcome!', { id: 'u:1', name: 'Maya Lee', role: 'host', avatar: 'https://site.example/maya.png' } ),
            message( '2-0', 'Glad to be here', { id: 'u:5', name: 'Olena', role: 'guest' } ),
            message( '3-0', 'hi', { id: 'a:x', name: 'Visitor' } )
        ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );

        const rows = [ ...container.querySelectorAll( '.estream-message' ) ];
        expect( rows.map( ( r ) => r.querySelector( '.estream-role' )?.textContent ?? '' ) ).toEqual( [ 'Host', 'Guest', '' ] );
        expect( rows[0]!.querySelector( 'img' )?.getAttribute( 'src' ) ).toBe( 'https://site.example/maya.png' );
        // No avatar: initials, on a colour of the sender's own.
        expect( rows[1]!.querySelector( '.estream-message__avatar--initials' )?.textContent ).toBe( 'O' );
        expect( rows[0]!.querySelector( 'time' )?.getAttribute( 'dateTime' ) ).toBe( '2026-10-08T18:05:00.000Z' );
    } );

    it( 'turns web addresses into links that open safely, and nothing else', () => {
        render( <p>{ linkify( 'see https://example.com/a?b=1, or javascript:alert(1) and http://x.test/.' ) }</p> );

        const links = screen.getAllByRole( 'link' );
        expect( links.map( ( a ) => a.getAttribute( 'href' ) ) ).toEqual( [ 'https://example.com/a?b=1', 'http://x.test/' ] );
        expect( links[0]!.getAttribute( 'rel' ) ).toBe( 'nofollow ugc noopener noreferrer' );
        expect( links[0]!.getAttribute( 'target' ) ).toBe( '_blank' );
        expect( screen.getByText( /javascript:alert/ ).tagName ).toBe( 'P' );
    } );

    it( 'marks messages that name you, whole names only', () => {
        expect( mentions( 'hey @Maya Lee, great talk', 'Maya Lee' ) ).toBe( true );
        expect( mentions( '@maya lee!', 'Maya Lee' ) ).toBe( true );
        expect( mentions( 'hey @Maya Leexpert', 'Maya Lee' ) ).toBe( false );
        expect( mentions( 'email maya@site.example', 'site' ) ).toBe( false );
        expect( mentions( 'hi', undefined ) ).toBe( false );

        const { asClient } = fakeClient( { chat: [ message( '1-0', 'hi @Maya' ), message( '2-0', 'hi all' ) ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );
        expect( [ ...container.querySelectorAll( '.estream-message' ) ].map( ( r ) => r.classList.contains( 'estream-message--mention' ) ) ).toEqual( [ true, false ] );
    } );

    it( 'counts what comes while the reader is scrolled up, and takes them down to it', () => {
        const { update, asClient } = fakeClient( { chat: [ message( '1-0', 'one' ) ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );
        const list = container.querySelector( '.estream-chat__list' ) as HTMLElement;

        // Scrolled up, far from the bottom.
        Object.defineProperty( list, 'scrollHeight', { configurable: true, value: 1000 } );
        Object.defineProperty( list, 'clientHeight', { configurable: true, value: 300 } );
        list.scrollTop = 100;
        fireEvent.scroll( list );

        update( { chat: [ message( '1-0', 'one' ), message( '2-0', 'two' ), message( '3-0', 'three' ) ] } );
        fireEvent.click( screen.getByText( '2 new messages' ) );

        expect( list.scrollTop ).toBe( 1000 );
        expect( screen.queryByText( /new message/ ) ).toBeNull();
    } );

    it( 'puts an emoji where the cursor is, and counts down the length near the limit', () => {
        const { asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } /> );
        const input = screen.getByPlaceholderText( 'Say something…' ) as HTMLInputElement;

        fireEvent.change( input, { target: { value: 'hello world' } } );
        input.setSelectionRange( 5, 5 );
        fireEvent.click( screen.getByLabelText( 'Emoji' ) );
        fireEvent.click( within( screen.getByRole( 'menu', { name: 'Emoji' } ) ).getByText( '🔥' ) );
        expect( input.value ).toBe( 'hello🔥 world' );

        expect( document.querySelector( '.estream-chat__left' ) ).toBeNull();
        fireEvent.change( input, { target: { value: 'x'.repeat( 495 ) } } );
        expect( document.querySelector( '.estream-chat__left' )?.textContent ).toBe( '5' );
    } );

    it( 'holds the Send button through slow mode\'s wait, for all but moderators', async () => {
        vi.useFakeTimers( { now: 1_000_000 } );
        const { client, asClient } = fakeClient( { ...live, slow: 10 } );
        render( <EasyStreamApp client={ asClient } /> );
        const input = screen.getByPlaceholderText( 'Say something…' );

        fireEvent.change( input, { target: { value: 'first' } } );
        await act( async () => { fireEvent.submit( input.closest( 'form' )! ); } );
        expect( client.sendChat ).toHaveBeenCalledWith( 'first' );

        fireEvent.change( input, { target: { value: 'second' } } );
        const send = screen.getByLabelText( 'Send' ) as HTMLButtonElement;
        expect( [ send.disabled, send.textContent ] ).toEqual( [ true, '10' ] );

        act( () => { vi.advanceTimersByTime( 10_000 ); } );
        expect( send.disabled ).toBe( false );
        expect( byTip( 'Slow mode: one message every 10 seconds' ).textContent ).toBe( '10s' );
    } );

    it( 'waits the second the cloud asks between messages, without a countdown, and moderators not at all', async () => {
        vi.useFakeTimers( { now: 1_000_000 } );
        const { client, update, asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } /> );
        const input = screen.getByPlaceholderText( 'Say something…' );
        const send = screen.getByLabelText( 'Send' ) as HTMLButtonElement;

        fireEvent.change( input, { target: { value: 'one' } } );
        await act( async () => { fireEvent.submit( input.closest( 'form' )! ); } );
        fireEvent.change( input, { target: { value: 'two' } } );
        expect( [ send.disabled, send.querySelector( '.estream-chat__wait' ) ] ).toEqual( [ true, null ] );

        act( () => { vi.advanceTimersByTime( 1_100 ); } );
        expect( send.disabled ).toBe( false );

        update( { you: { ...base.you!, mod: true } } );
        await act( async () => { fireEvent.submit( input.closest( 'form' )! ); } );
        fireEvent.change( input, { target: { value: 'three' } } );
        expect( send.disabled ).toBe( false );
        expect( client.sendChat ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'says why a message wasn\'t sent', async () => {
        const { client, asClient } = fakeClient();
        client.sendChat.mockResolvedValueOnce( { ok: false, error: 'too_long' } as any );
        render( <EasyStreamApp client={ asClient } /> );
        const input = screen.getByPlaceholderText( 'Say something…' );

        fireEvent.change( input, { target: { value: 'hello' } } );
        await act( async () => { fireEvent.submit( input.closest( 'form' )! ); } );
        expect( screen.getByRole( 'alert' ).textContent ).toBe( 'That message is too long' );
        expect( ( input as HTMLInputElement ).value, 'kept, to shorten' ).toBe( 'hello' );
    } );

    it( 'asks a visitor who may only read to log in, coming back to the stream', () => {
        const { asClient } = fakeClient( { you: { identity: 'a:x1', role: 'viewer', name: 'Visitor', chat: 'read', mod: false } } );
        render( <EasyStreamApp client={ asClient } loginUrl="https://site.example/wp-login.php" url="https://site.example/launch/" /> );

        expect( screen.getByRole( 'link', { name: 'Log in to chat' } ).getAttribute( 'href' ) )
            .toBe( 'https://site.example/wp-login.php?redirect_to=https%3A%2F%2Fsite.example%2Flaunch%2F' );
        expect( backTo( 'https://site.example/wp-login.php?redirect_to=%2Fhere', '/there' ) ).toBe( 'https://site.example/wp-login.php?redirect_to=%2Fhere' );
    } );

    it( 'tells a signed-in viewer who may only read so, with no login', () => {
        const { asClient } = fakeClient( { you: { ...base.you!, chat: 'read' } } );
        render( <EasyStreamApp client={ asClient } loginUrl="https://site.example/wp-login.php" /> );

        expect( screen.getByText( 'Chat is read-only for you' ) ).toBeTruthy();
        expect( screen.queryByText( 'Log in to chat' ) ).toBeNull();
    } );

    it( 'gives moderators a menu on each message: delete at once, ban after asking in its own dialog', async () => {
        const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
        const { client, asClient } = fakeClient( { ...live, you: host, chat: [ message( '1-0', 'spam', { id: 'u:9', name: 'Spammer' } ), message( '2-0', 'mine', { id: 'u:1', name: 'Host', role: 'host' } ) ] } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Spammer' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Delete message' } ) ); } );
        expect( client.deleteMessage ).toHaveBeenCalledWith( '1-0' );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Spammer' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Ban from this stream' } ) ); } );
        const dialog = screen.getByRole( 'dialog', { name: 'Ban Spammer from this stream?' } );
        // Focus starts on the way out.
        expect( document.activeElement?.textContent ).toBe( 'Cancel' );

        fireEvent.keyDown( dialog, { key: 'Escape' } );
        await act( async () => {} );
        expect( screen.queryByRole( 'dialog' ) ).toBeNull();
        expect( client.ban ).not.toHaveBeenCalled();

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Spammer' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Ban from this stream' } ) ); } );
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Ban' } ) ); } );
        expect( client.ban ).toHaveBeenCalledWith( 'u:9', { name: 'Spammer', avatar: null } );

        // Never oneself.
        fireEvent.click( screen.getByLabelText( 'Moderate the message of Host' ) );
        expect( screen.queryByRole( 'menuitem', { name: 'Ban from this stream' } ) ).toBeNull();
    } );

    it( 'says when the chat is reconnecting', () => {
        const { asClient } = fakeClient( { chatConnected: false } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'Reconnecting to the chat…' ) ).toBeTruthy();
        expect( ( screen.getByLabelText( 'Send' ) as HTMLButtonElement ).disabled ).toBe( true );
    } );
} );
