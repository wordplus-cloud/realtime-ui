import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ComposerRow, DaySeparator, EmptyThread, MessageBody, MessageMeta, MessageStack, MessageText, MetaPieces, ReactionPicker, ReactionPill,
    ReactionPills, StatusTick, SystemRow, UnreadDivider, configureUi, decodeReaction, encodeReaction,
} from '../src/index.ts';

beforeEach( () => configureUi( { translate: ( text: string ) => text } ) );
afterEach( cleanup );

describe( 'chat: the message list\'s parts', () => {
    it( 'draws a sender\'s stack with their avatar, name and stack time, and a message\'s body, text and meta', () => {
        const { container } = render(
            <MessageStack isMe={ false } side="left" bubble="filled" avatar={ <img alt="Ann" /> } name={ <b>Ann</b> } time={ { label: '10:04', title: 'Mar 4, 10:04:12' } }>
                <MessageBody isMe={ false } data-message-id="7" forwarded={ <span className="fwd">Forwarded</span> } after={ <div className="after" /> }>
                    <MessageText after={ <div className="pills" /> }>
                        Hi Ben
                        <MessageMeta pieces={ ( interactive ) => <MetaPieces time={ { label: '10:04' } } interactive={ interactive } /> } />
                    </MessageText>
                </MessageBody>
            </MessageStack>,
        );

        const stack = container.querySelector( '.bm-msg-stack' )!;
        expect( stack.getAttribute( 'data-side' ) ).toBe( 'left' );
        expect( stack.getAttribute( 'data-is-me' ) ).toBeNull();
        expect( stack.querySelector( '.bm-msg-stack__avatar img' ) ).not.toBeNull();
        expect( stack.querySelector( '.bm-msg-stack__info' )?.textContent ).toBe( 'Ann10:04' );

        const body = stack.querySelector( '.bm-msg-body.bm-message' )!;
        expect( body.getAttribute( 'data-is-me' ) ).toBe( '0' );
        expect( body.getAttribute( 'data-message-id' ) ).toBe( '7' );
        expect( [ ...body.children ].map( ( c ) => c.className ) ).toEqual( [ 'fwd', 'bm-msg-main', 'after' ] );
        expect( body.querySelector( '.bm-msg-main > .bm-msg-bubble.bm-message-content > .bm-msg-bubble__text' )?.firstChild?.textContent ).toBe( 'Hi Ben' );
        // Inline meta: a spacer that only holds the room, and the visible copy.
        expect( [ ...body.querySelectorAll( '.bm-msg-meta' ) ].map( ( m ) => m.getAttribute( 'data-variant' ) ) ).toEqual( [ 'spacer', 'overlay' ] );
        expect( body.querySelector( '.bm-msg-meta[data-variant="overlay"] .bm-msg-meta__time' )?.textContent ).toBe( '10:04' );
    } );

    it( 'draws the day, the unread divider, an event and the empty conversation', () => {
        const { container } = render( <>
            <DaySeparator label="Today" title="Sunday, March 4" />
            <UnreadDivider />
            <SystemRow type="user_joined" tone="success" icon="userPlus">Cara joined</SystemRow>
            <EmptyThread />
        </> );
        expect( container.querySelector( '.bm-day-sep .bm-day-pill' )?.textContent ).toBe( 'Today' );
        expect( container.querySelector( '.bm-unread-divider__label' )?.textContent ).toBe( 'New messages' );
        expect( container.querySelector( '.bm-system-row[data-system-type="user_joined"] .bm-system-row__pill[data-tone="success"]' )?.textContent ).toBe( 'Cara joined' );
        expect( container.querySelector( '.bm-empty-thread__title' )?.textContent ).toBe( 'Say hi' );
    } );

    it( 'ticks each delivery state in the same box, seen heavier, and the detailed one opening who saw it', () => {
        const open = vi.fn();
        const { container } = render( <>
            <StatusTick status="sending" />
            <StatusTick status="delivered" />
            <StatusTick status="seen" onClick={ open } />
        </> );
        const ticks = [ ...container.querySelectorAll( '.bm-msg-status' ) ];
        expect( ticks.map( ( t ) => t.getAttribute( 'data-status' ) ) ).toEqual( [ 'sending', 'delivered', 'seen' ] );
        expect( ticks[ 0 ].querySelector( '.bm-status-spinner' ) ).not.toBeNull();
        expect( ticks[ 2 ].querySelector( '.bm-status-read' ) ).not.toBeNull();
        expect( ticks[ 2 ].getAttribute( 'data-detailed' ) ).toBe( '1' );
        fireEvent.click( ticks[ 2 ] );
        expect( open ).toHaveBeenCalled();
    } );
} );

describe( 'chat: reactions', () => {
    it( 'keys a reaction as 2.0 stores them, and reads either shape back', () => {
        expect( encodeReaction( '👍' ) ).toBe( '1f44d' );
        expect( encodeReaction( '❤️' ) ).toBe( '2764' );
        expect( decodeReaction( '1f44d' ) ).toBe( '👍' );
        expect( decodeReaction( '🙂' ) ).toBe( '🙂' );
    } );

    it( 'counts a pill from two people up, marks the user\'s own, and picks from the strip its trigger opens', async () => {
        const { container } = render( <ReactionPills meta={ <span className="meta" /> }>
            <ReactionPill emoji="👍" count={ 1 } mine />
            <ReactionPill emoji="❤️" count={ 3 } onClick={ () => {} } />
        </ReactionPills> );
        const pills = [ ...container.querySelectorAll( '.bm-reaction-pill' ) ];
        expect( pills[ 0 ].getAttribute( 'data-reacted-by-me' ) ).toBe( '1' );
        expect( pills[ 0 ].getAttribute( 'data-static' ) ).toBe( '1' );
        expect( pills[ 0 ].querySelector( '.bm-reaction-pill__count' ) ).toBeNull();
        expect( pills[ 1 ].querySelector( '.bm-reaction-pill__count' )?.textContent ).toBe( '3' );
        expect( container.querySelector( '.bm-reactions > .meta' ) ).not.toBeNull();

        const pick = vi.fn();
        const picker = render( <ReactionPicker keys={ [ '1f44d', '2764', '1f602' ] } mine="2764" onPick={ pick } /> );
        const trigger = picker.container.querySelector( '.bm-reaction-trigger' )!;
        expect( trigger.textContent ).toBe( '❤' );
        await act( async () => { fireEvent.mouseEnter( trigger ); } );
        const items = [ ...document.body.querySelectorAll( '.bm-reaction-strip__item' ) ];
        expect( items ).toHaveLength( 3 );
        expect( items[ 1 ].getAttribute( 'data-mine' ) ).toBe( '1' );
        await act( async () => { fireEvent.click( items[ 2 ] ); } );
        expect( pick ).toHaveBeenCalledWith( '1f602' );
    } );
} );

describe( 'chat: the composer\'s row', () => {
    const base = {
        hostRef: createRef<HTMLDivElement>(), onInput: () => {}, placeholder: 'Write a message', maxLength: 0, charCount: 0,
        onKeyDown: () => {}, limited: false, canRecordVoice: false, canRecordVideo: false,
    };

    it( 'is Send, off until there is something to send, then sending what was typed', () => {
        const send = vi.fn();
        const { container, rerender } = render( <ComposerRow { ...base } onSend={ send } canSend={ false } hasContent={ false } /> );
        const button = () => container.querySelector( '[aria-label="Send Message"]' ) as HTMLElement;
        expect( container.querySelector( '.bm-composer__editable' )?.getAttribute( 'placeholder' ) ).toBe( 'Write a message' );
        expect( button().getAttribute( 'aria-label' ) ).toBe( 'Send Message' );
        expect( button().getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        rerender( <ComposerRow { ...base } onSend={ send } canSend hasContent /> );
        fireEvent.click( button() );
        expect( send ).toHaveBeenCalled();
    } );

    it( 'keeps the page in its typing layout until the click of a tap that took the focus has landed (ticket 10500)', () => {
        vi.useFakeTimers();
        try {
            const { container, unmount } = render( <ComposerRow { ...base } onSend={ () => {} } canSend hasContent /> );
            const editable = container.querySelector( '.bm-composer__editable' ) as HTMLElement;
            const typing = () => document.body.classList.contains( 'bm-reply-area-focused' );

            fireEvent.focus( editable );
            expect( typing() ).toBe( true );
            fireEvent.blur( editable );
            expect( typing(), 'given up in the blur, under the press of the tap' ).toBe( true );
            vi.runAllTimers();
            expect( typing() ).toBe( false );

            fireEvent.focus( editable );
            fireEvent.blur( editable );
            unmount();
            expect( typing(), 'kept by a composer that is gone' ).toBe( false );
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'is the microphone with nothing typed where voice messages can be recorded, and shows a host\'s points and counter', () => {
        const { container } = render( <ComposerRow { ...base } onSend={ () => {} } canSend={ false } hasContent={ false } canRecordVoice onStartVoice={ () => {} }
                                                     points={ <span className="pts">120</span> } limited maxLength={ 100 } charCount={ 95 } /> );
        expect( container.querySelector( '[aria-label="Record Voice Message"]' ) ).not.toBeNull();
        expect( container.querySelector( '.bm-composer__points .pts' ) ).not.toBeNull();
        expect( container.querySelector( '.bm-composer__counter' )?.textContent ).toBe( '95/100' );
        expect( container.querySelector( '.bm-composer__counter' )?.getAttribute( 'data-warn' ) ).toBe( '1' );
    } );
} );
