import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ComposerRow, DaySeparator, EmptyThread, MessageBody, MessageMeta, MessageStack, MessageText, MetaPieces, ReactionPicker, ReactionPill,
    ReactionPills, StatusTick, SystemRow, UnreadDivider, configureUi, decodeReaction, encodeReaction,
} from '../src/index.ts';
import { emojiText } from '../src/components/chat/reactions.tsx';
import { ownTooltips } from '../src/inc/floater.ts';
import { setOwnTooltips } from '../src/inc/shared-parts.ts';

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

        const stack = container.querySelector( '.wplus-msg-stack' )!;
        expect( stack.getAttribute( 'data-side' ) ).toBe( 'left' );
        expect( stack.getAttribute( 'data-is-me' ) ).toBeNull();
        expect( stack.querySelector( '.wplus-msg-stack__avatar img' ) ).not.toBeNull();
        expect( stack.querySelector( '.wplus-msg-stack__info' )?.textContent ).toBe( 'Ann10:04' );

        const body = stack.querySelector( '.wplus-msg-body.wplus-message' )!;
        expect( body.getAttribute( 'data-is-me' ) ).toBe( '0' );
        expect( body.getAttribute( 'data-message-id' ) ).toBe( '7' );
        expect( [ ...body.children ].map( ( c ) => c.className ) ).toEqual( [ 'fwd', 'wplus-msg-main', 'after' ] );
        expect( body.querySelector( '.wplus-msg-main > .wplus-msg-bubble.wplus-message-content > .wplus-msg-bubble__text' )?.firstChild?.textContent ).toBe( 'Hi Ben' );
        // Inline meta: a spacer that only holds the room, and the visible copy.
        expect( [ ...body.querySelectorAll( '.wplus-msg-meta' ) ].map( ( m ) => m.getAttribute( 'data-variant' ) ) ).toEqual( [ 'spacer', 'overlay' ] );
        expect( body.querySelector( '.wplus-msg-meta[data-variant="overlay"] .wplus-msg-meta__time' )?.textContent ).toBe( '10:04' );
    } );

    it( 'draws the day, the unread divider, an event and the empty conversation', () => {
        const { container } = render( <>
            <DaySeparator label="Today" title="Sunday, March 4" />
            <UnreadDivider />
            <SystemRow type="user_joined" tone="success" icon="userPlus">Cara joined</SystemRow>
            <EmptyThread />
        </> );
        expect( container.querySelector( '.wplus-day-sep .wplus-day-pill' )?.textContent ).toBe( 'Today' );
        expect( container.querySelector( '.wplus-unread-divider__label' )?.textContent ).toBe( 'New messages' );
        expect( container.querySelector( '.wplus-system-row[data-system-type="user_joined"] .wplus-system-row__pill[data-tone="success"]' )?.textContent ).toBe( 'Cara joined' );
        expect( container.querySelector( '.wplus-system-row__pill svg' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-empty-thread__title' )?.textContent ).toBe( 'Say hi' );
        expect( container.querySelector( '.wplus-empty-thread__sub' )?.textContent ).toBe( 'No messages here yet — start the conversation from the composer below' );
    } );

    it( 'draws an event in its words alone, and the empty conversation in the app\'s words', () => {
        const { container } = render( <>
            <SystemRow type="closed" icon={ null } title="10:42">Ann closed the chat</SystemRow>
            <SystemRow type="joined">Tom joined</SystemRow>
            <EmptyThread title="A new chat" text={ <span className="line">Write a message and the team answers here.</span> } />
        </> );
        const [ words, bolt ] = [ ...container.querySelectorAll( '.wplus-system-row__pill' ) ];
        expect( words.querySelector( 'svg' ) ).toBeNull();
        expect( [ ...words.children ].map( ( c ) => c.className ) ).toEqual( [ 'wplus-system-row__text' ] );
        expect( words.textContent ).toBe( 'Ann closed the chat' );
        // The bolt stays the default.
        expect( bolt.querySelector( 'svg' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-empty-thread__title' )?.textContent ).toBe( 'A new chat' );
        expect( container.querySelector( '.wplus-empty-thread__sub .line' )?.textContent ).toBe( 'Write a message and the team answers here.' );
        expect( container.querySelector( '.wplus-empty-thread__disc svg' ) ).not.toBeNull();
    } );

    it( 'ticks each delivery state in the same box, seen heavier, and the detailed one opening who saw it', () => {
        const open = vi.fn();
        const { container } = render( <>
            <StatusTick status="sending" />
            <StatusTick status="delivered" />
            <StatusTick status="seen" onClick={ open } />
        </> );
        const ticks = [ ...container.querySelectorAll( '.wplus-msg-status' ) ];
        expect( ticks.map( ( t ) => t.getAttribute( 'data-status' ) ) ).toEqual( [ 'sending', 'delivered', 'seen' ] );
        expect( ticks[ 0 ].querySelector( '.wplus-status-spinner' ) ).not.toBeNull();
        expect( ticks[ 2 ].querySelector( '.wplus-status-read' ) ).not.toBeNull();
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

    it( 'draws a key as an emoji in colour where it has no drawing of the app\'s: the heart with U+FE0F, never the black text one', () => {
        expect( emojiText( '2764' ) ).toBe( '❤️' );
        expect( emojiText( '263a' ) ).toBe( '☺️' );
        // The emoji blocks are colour already, and a sequence is as it was keyed.
        expect( emojiText( '1f44d' ) ).toBe( '👍' );
        expect( emojiText( '1f64f' ) ).toBe( '🙏' );
        expect( emojiText( '1f469-200d-1f4bb' ) ).toBe( '👩‍💻' );
        expect( emojiText( '🙂' ) ).toBe( '🙂' );
    } );

    it( 'counts a pill from two people up, marks the user\'s own, and picks from the strip its trigger opens', async () => {
        const { container } = render( <ReactionPills meta={ <span className="meta" /> }>
            <ReactionPill emoji="👍" count={ 1 } mine />
            <ReactionPill emoji="❤️" count={ 3 } onClick={ () => {} } />
        </ReactionPills> );
        const pills = [ ...container.querySelectorAll( '.wplus-reaction-pill' ) ];
        expect( pills[ 0 ].getAttribute( 'data-reacted-by-me' ) ).toBe( '1' );
        expect( pills[ 0 ].getAttribute( 'data-static' ) ).toBe( '1' );
        expect( pills[ 0 ].querySelector( '.wplus-reaction-pill__count' ) ).toBeNull();
        expect( pills[ 1 ].querySelector( '.wplus-reaction-pill__count' )?.textContent ).toBe( '3' );
        expect( container.querySelector( '.wplus-reactions > .meta' ) ).not.toBeNull();

        const pick = vi.fn();
        const picker = render( <ReactionPicker keys={ [ '1f44d', '2764', '1f602' ] } mine="2764" onPick={ pick } /> );
        const trigger = picker.container.querySelector( '.wplus-reaction-trigger' )!;
        expect( trigger.textContent ).toBe( '❤️' );
        await act( async () => { fireEvent.mouseEnter( trigger ); } );
        const items = [ ...document.body.querySelectorAll( '.wplus-reaction-strip__item' ) ];
        expect( items ).toHaveLength( 3 );
        expect( items[ 1 ].getAttribute( 'data-mine' ) ).toBe( '1' );
        await act( async () => { fireEvent.click( items[ 2 ] ); } );
        expect( pick ).toHaveBeenCalledWith( '1f602' );
    } );

    it( 'names a pill by who reacted, in words, its tooltip too, and one that only shows is an image of it', () => {
        const toggle = vi.fn();
        const { container } = render( <ReactionPills>
            <ReactionPill emoji="👍" count={ 1 } label="Tom reacted with a thumbs up" />
            <ReactionPill emoji="❤️" count={ 2 } mine label="You and Ann reacted with a heart" onClick={ toggle } />
            <ReactionPill emoji="😂" count={ 1 } />
        </ReactionPills> );
        const [ still, mine, bare ] = [ ...container.querySelectorAll<HTMLElement>( '.wplus-reaction-pill' ) ];

        expect( still.getAttribute( 'aria-label' ) ).toBe( 'Tom reacted with a thumbs up' );
        expect( still.getAttribute( 'role' ) ).toBe( 'img' );
        expect( still.getAttribute( 'tabindex' ) ).toBe( '-1' );
        expect( still.querySelector( '.wplus-reaction-pill__emoji' )?.getAttribute( 'aria-hidden' ) ).toBe( 'true' );

        expect( mine.getAttribute( 'aria-label' ) ).toBe( 'You and Ann reacted with a heart' );
        expect( mine.getAttribute( 'role' ) ).toBe( 'button' );
        expect( mine.getAttribute( 'tabindex' ) ).toBe( '0' );
        expect( mine.querySelector( '.wplus-reaction-pill__count' )?.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
        fireEvent.click( mine );
        expect( toggle ).toHaveBeenCalledTimes( 1 );

        // No label, as Better Messages draws them: as before.
        expect( bare.getAttribute( 'aria-label' ) ).toBeNull();
        expect( bare.getAttribute( 'role' ) ).toBe( 'button' );
        expect( bare.querySelector( '.wplus-reaction-pill__emoji' )?.getAttribute( 'aria-hidden' ) ).toBeNull();
    } );

    it( 'names the trigger, the strip and each emoji as the app says them', async () => {
        const names: Record<string, string> = { '1f44d': 'Thumbs up', '2764': 'Heart' };
        const picker = render( <ReactionPicker keys={ [ '1f44d', '2764' ] } onPick={ () => {} } label="React to this message" labelOf={ ( key ) => names[ key ] ?? '' } /> );
        const trigger = picker.container.querySelector( '.wplus-reaction-trigger' )!;
        expect( trigger.getAttribute( 'aria-label' ) ).toBe( 'React to this message' );
        expect( trigger.getAttribute( 'aria-haspopup' ) ).toBe( 'menu' );
        await act( async () => { fireEvent.mouseEnter( trigger ); } );
        expect( document.body.querySelector( '.wplus-reaction-strip' )?.getAttribute( 'aria-label' ) ).toBe( 'React to this message' );
        expect( [ ...document.body.querySelectorAll( '.wplus-reaction-strip__item' ) ].map( ( item ) => item.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Thumbs up', 'Heart' ] );
    } );

    it( 'shows a tooltip over a named pill, and none over the set, where it would cover the next emoji', async () => {
        setOwnTooltips( ownTooltips() );
        const tip = () => [ ...document.querySelectorAll( '.realtime-tooltip' ) ].map( ( t ) => t.textContent ).join( '|' );
        try {
            const pill = render( <ReactionPill emoji="1f44d" count={ 1 } label="Ann reacted with a thumbs up" /> ).container.querySelector( '.wplus-reaction-pill' )!;
            fireEvent.mouseEnter( pill );
            expect( tip() ).toBe( 'Ann reacted with a thumbs up' );
            fireEvent.mouseLeave( pill );
            document.querySelectorAll( '.realtime-tooltip' ).forEach( ( shown ) => shown.remove() );

            const picker = render( <ReactionPicker keys={ [ '1f44d', '2764' ] } onPick={ () => {} } labelOf={ ( key ) => key === '2764' ? 'Heart' : 'Thumbs up' } /> );
            await act( async () => { fireEvent.mouseEnter( picker.container.querySelector( '.wplus-reaction-trigger' )! ); } );
            const items = [ ...document.body.querySelectorAll( '.wplus-reaction-strip__item' ) ];
            expect( items ).toHaveLength( 2 );
            for ( const item of items ) fireEvent.mouseEnter( item );
            expect( tip() ).toBe( '' );
        } finally {
            document.querySelectorAll( '.realtime-tooltip' ).forEach( ( shown ) => shown.remove() );
            setOwnTooltips( undefined );
        }
    } );

    it( 'opens from the keyboard on a computer, focus on the user\'s own, the arrows walk the set, and a pick or Escape goes back to the trigger', async () => {
        const pick = vi.fn();
        const picker = render( <ReactionPicker keys={ [ '1f44d', '2764', '1f602' ] } mine="2764" onPick={ pick } /> );
        const trigger = picker.container.querySelector<HTMLElement>( '.wplus-reaction-trigger' )!;
        // The trigger has a size, as in a browser, so the strip is placed and shown, and so can take focus.
        trigger.getBoundingClientRect = () => ( { left: 200, top: 300, right: 226, bottom: 326, width: 26, height: 26, x: 200, y: 300 } ) as DOMRect;
        const frames = () => act( async () => { await new Promise( ( done ) => setTimeout( done, 40 ) ); } );

        // Enter on the trigger, which Btn passes on as a click.
        trigger.focus();
        await act( async () => { fireEvent.keyDown( trigger, { key: 'Enter' } ); } );
        await frames();
        const items = () => [ ...document.body.querySelectorAll<HTMLElement>( '.wplus-reaction-strip__item' ) ];
        expect( items() ).toHaveLength( 3 );
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        expect( document.activeElement ).toBe( items()[ 1 ] );

        await act( async () => { fireEvent.keyDown( items()[ 1 ], { key: 'ArrowRight' } ); } );
        expect( document.activeElement ).toBe( items()[ 2 ] );
        await act( async () => { fireEvent.keyDown( items()[ 2 ], { key: 'ArrowRight' } ); } );
        expect( document.activeElement ).toBe( items()[ 0 ] );
        await act( async () => { fireEvent.keyDown( items()[ 0 ], { key: 'End' } ); } );
        expect( document.activeElement ).toBe( items()[ 2 ] );

        await act( async () => { fireEvent.keyDown( items()[ 2 ], { key: 'Enter' } ); } );
        await frames();
        expect( pick ).toHaveBeenCalledWith( '1f602' );
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
        expect( document.activeElement ).toBe( trigger );

        await act( async () => { fireEvent.keyDown( trigger, { key: ' ' } ); } );
        await frames();
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        await act( async () => { fireEvent.keyDown( document.activeElement!, { key: 'Escape' } ); } );
        await frames();
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
        expect( document.activeElement ).toBe( trigger );
        expect( pick ).toHaveBeenCalledTimes( 1 );

        // Tab out of the strip to anything else closes it.
        const elsewhere = document.body.appendChild( document.createElement( 'input' ) );
        await act( async () => { fireEvent.keyDown( trigger, { key: 'Enter' } ); } );
        await frames();
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        await act( async () => { fireEvent.focusOut( document.activeElement!, { relatedTarget: elsewhere } ); } );
        await frames();
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
        elsewhere.remove();
    } );

    it( 'keeps a pointer\'s pick open on a computer, where the pointer walks off on its own', async () => {
        const pick = vi.fn();
        const picker = render( <ReactionPicker keys={ [ '1f44d', '2764' ] } onPick={ pick } /> );
        const trigger = picker.container.querySelector( '.wplus-reaction-trigger' )!;
        await act( async () => { fireEvent.mouseEnter( trigger ); } );
        await act( async () => { fireEvent.click( document.body.querySelectorAll( '.wplus-reaction-strip__item' )[ 0 ] ); } );
        expect( pick ).toHaveBeenCalledWith( '1f44d' );
        expect( trigger.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
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
        const editable = container.querySelector( '.wplus-composer__editable' )!;
        expect( editable.getAttribute( 'placeholder' ) ).toBe( 'Write a message' );
        // A text field to a screen reader, named by its placeholder.
        expect( [ editable.getAttribute( 'role' ), editable.getAttribute( 'aria-multiline' ), editable.getAttribute( 'aria-label' ) ] ).toEqual( [ 'textbox', 'true', 'Write a message' ] );
        expect( editable.getAttribute( 'aria-disabled' ) ).toBeNull();
        expect( button().getAttribute( 'aria-label' ) ).toBe( 'Send Message' );
        expect( button().getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        rerender( <ComposerRow { ...base } onSend={ send } canSend hasContent /> );
        fireEvent.click( button() );
        expect( send ).toHaveBeenCalled();
    } );

    it( 'names the paperclip and Send in an app\'s words where it gives them, however many files are added', () => {
        const attach = vi.fn();
        const { container, rerender } = render( <ComposerRow { ...base } onSend={ () => {} } canSend hasContent onAttachClick={ attach } attachCount={ 2 } /> );
        const named = () => [ ...container.querySelectorAll( '.wplus-composer__row [role="button"]' ) ].map( ( button ) => button.getAttribute( 'aria-label' ) );
        // The package's own, as Better Messages has them.
        expect( named() ).toEqual( [ '2 attachments added, click to add more attachments', 'Send Message' ] );

        rerender( <ComposerRow { ...base } onSend={ () => {} } canSend hasContent onAttachClick={ attach } attachCount={ 2 } attachLabel="Attach a photo or file" sendLabel="Send" /> );
        expect( named() ).toEqual( [ 'Attach a photo or file', 'Send' ] );
        expect( container.querySelector( '.wplus-composer__attach-badge' )?.textContent ).toBe( '2' );

        // Over the length limit Send says why, whatever its name.
        rerender( <ComposerRow { ...base } maxLength={ 10 } charCount={ 12 } limited onSend={ () => {} } canSend={ false } hasContent sendLabel="Send" /> );
        expect( named() ).toEqual( [ 'Message is too long. Maximum allowed length is 10 characters' ] );
    } );

    it( 'keeps the page in its typing layout until the click of a tap that took the focus has landed (from a support report)', () => {
        vi.useFakeTimers();
        try {
            const { container, unmount } = render( <ComposerRow { ...base } onSend={ () => {} } canSend hasContent /> );
            const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
            const typing = () => document.body.classList.contains( 'wplus-reply-area-focused' );

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
        expect( container.querySelector( '.wplus-composer__points .pts' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-composer__counter' )?.textContent ).toBe( '95/100' );
        expect( container.querySelector( '.wplus-composer__counter' )?.getAttribute( 'data-warn' ) ).toBe( '1' );
    } );

    it( 'draws the picker button as what the picker opens with, the smile unless the host names the sticker or the GIF badge', () => {
        const row = ( icon?: 'smile' | 'sticker' | 'gif' ) => render(
            <ComposerRow { ...base } onSend={ () => {} } canSend={ false } hasContent={ false } onEmojiClick={ () => {} } pickerLabel="Picker" pickerIcon={ icon } />,
        ).container.querySelector( '.wplus-composer__picker svg' ) as SVGElement;

        expect( row().querySelector( 'path' )?.getAttribute( 'd' ) ).toMatch( /^M22 12a10 10/ );
        cleanup();
        expect( row( 'sticker' ).querySelector( 'path' )?.getAttribute( 'd' ) ).toMatch( /^M18 3H6/ );
        cleanup();
        // The badge is line art like its neighbours, a frame and the three letters as strokes, no text in a font.
        const gif = row( 'gif' );
        expect( gif.querySelector( 'text' ) ).toBeNull();
        expect( gif.querySelectorAll( 'path' ) ).toHaveLength( 5 );
        expect( gif.querySelector( 'path' )?.getAttribute( 'd' ) ).toMatch( /^M5 5h14/ );
    } );
} );
