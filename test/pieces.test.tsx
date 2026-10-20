// The screens' named pieces (pieces.tsx): each replaced by the app's own, given
// what ours gets and ours as its children, the rest of the screen as before; the controls arranged by the app; and
// every piece named for ::part().
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers, type Pieces } from '../src/index.ts';
import { CallControl, CallScreen, type CallParticipant } from '../src/calls.ts';
import { Chat, OnlineList } from '../src/react.tsx';
import { CallsController } from '../src/sdk/controller.ts';
import CallsApp from '../src/sdk/calls-app.tsx';
import { PiecesProvider } from '../src/pieces.tsx';
import type { SdkCalls, SdkIncoming } from '../src/sdk/types.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann', avatar: 'https://example.com/ann.png' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
} );

afterEach( cleanup );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

const screen = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' | 'group-audio', components: Pieces ) =>
    render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } components={ components } /> );

const inCall = ( peer: Partial<CallParticipant> = {} ) => fakeCall( {
    participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { audio: fakeTrack(), ...peer } ) ] ] ),
    myMicrophoneTrack: fakeTrack(),
    myCameraTrack: fakeTrack(),
} );

describe( 'a call\'s pieces', () => {
    it( 'draws ours untouched with no piece of the app\'s, each named for ::part()', () => {
        const { container } = screen( inCall(), 'private', {} );

        expect( container.querySelector( '[part="video-tile"].bm-main-video' ) ).not.toBeNull();
        expect( container.querySelector( '[part="call-status"] .bm-timer' ) ).not.toBeNull();
        expect( container.querySelector( '[part="self-view"].bm-call-small-video' ) ).not.toBeNull();
        expect( container.querySelector( '[part="call-controls"] .bm-call-buttons' ) ).not.toBeNull();
        expect( container.querySelector( '.bm-main-video audio.audio1' ) ).not.toBeNull();
    } );

    it( 'wraps ours in the app\'s tile, given the other side, or replaces it and keeps their sound', () => {
        const seen: Array<string | undefined> = [];
        const framed = screen( inCall(), 'private', {
            VideoTile: ( { participant: p, children } ) => ( seen.push( p?.identity ), <div className="my-frame">{ children }</div> ),
        } );
        expect( seen ).toContain( 'user_34' );
        expect( framed.container.querySelector( '.my-frame > .bm-main-video' ) ).not.toBeNull();
        cleanup();

        const own = screen( inCall(), 'private', { VideoTile: ( { participant: p } ) => <div className="my-tile">{ p?.identity }</div> } );
        expect( own.container.querySelector( '.bm-main-video' ) ).toBeNull();
        expect( own.container.querySelector( '.my-tile' )?.textContent ).toBe( 'user_34' );
        // The call stays audible: the other side's sound is drawn beside the app's tile.
        expect( own.container.querySelector( 'audio.audio1' ) ).not.toBeNull();
    } );

    it( 'hands the status line what the call says, and the self view its camera', () => {
        const status = vi.fn( () => <span className="my-status" /> );
        const call = fakeCall( { action: 'outgoing_call' } );
        const { container } = screen( call, 'private', { CallStatus: status } );
        expect( container.querySelector( '.my-status' ) ).not.toBeNull();
        expect( container.querySelector( '.bm-placeholder-outgoing-text' ) ).toBeNull();
        expect( status.mock.calls[ 0 ][ 0 ] ).toMatchObject( { layout: 'private', action: 'outgoing_call', text: '' } );
        cleanup();

        const camera = fakeTrack();
        const self = screen( { ...inCall(), myCameraTrack: camera } as ReturnType<typeof fakeCall>, 'private', {
            SelfView: ( { track } ) => <div className="my-self" data-mine={ track === camera ? 1 : 0 } />,
        } );
        expect( self.container.querySelector( '.my-self' )?.getAttribute( 'data-mine' ) ).toBe( '1' );
        expect( self.container.querySelector( '.bm-call-small-video' ) ).toBeNull();
    } );

    it( 'lets the app add a button of its own to the dock, before hanging up, and take one of ours away', () => {
        const raise = vi.fn();
        const call = inCall();
        const { container } = screen( call, 'private', {
            controls: ( buttons, given ) => [
                ...buttons.filter( ( b ) => ( b.props as { content?: string } ).content !== 'Configure' ),
                <CallControl key="raise" icon="raisehand" label={ given.action === 'call_in_progress' ? 'Raise hand' : '?' } onClick={ raise } className="my-raise" />,
            ],
        } );

        const dock = container.querySelector( '.bm-call-buttons' )!;
        const classes = [ ...dock.children ].map( ( c ) => ( c.querySelector( '[class]' ) ?? c ).className );
        expect( classes.at( -1 ) ).toContain( 'bm-cancel' );
        expect( classes.at( -2 ) ).toContain( 'my-raise' );
        expect( dock.querySelector( '.bm-configure-call' ) ).toBeNull();

        const mine = dock.querySelector( '.my-raise' )!;
        expect( mine.getAttribute( 'aria-label' ) ).toBe( 'Raise hand' );
        expect( mine.className ).toContain( 'bm-call-control' );
        fireEvent.click( mine );
        expect( raise ).toHaveBeenCalledTimes( 1 );

        fireEvent.click( dock.querySelector( '.bm-cancel' )! );
        expect( call.calls ).toContain( 'endCall' );
    } );

    it( 'draws a group call\'s tiles as the app does, each in our place in the grid, with its sound', () => {
        const people = new Map<string, CallParticipant>( [
            [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
            [ 'user_34', participant( 'user_34', { audio: fakeTrack() } ) ],
            [ 'user_43', participant( 'user_43' ) ],
        ] );
        const tiles: string[] = [];
        const { container } = screen( fakeCall( { participants: people } ), 'group-audio', {
            GridTile: ( { participant: p, layout } ) => ( tiles.push( layout ), <div className="my-tile">{ p.identity }</div> ),
        } );

        expect( [ ...container.querySelectorAll( '[part="grid-tile"] .my-tile' ) ].map( ( t ) => t.textContent ).sort() ).toEqual( [ 'me', 'user_34', 'user_43' ] );
        expect( tiles.every( ( l ) => l === 'group-audio' ) ).toBe( true );
        // Only the others' sound, as ours plays it: never one's own.
        expect( container.querySelectorAll( 'audio' ) ).toHaveLength( 1 );
    } );

    it( 'takes the app\'s avatar and name over the host\'s', () => {
        const people = new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34' ) ] ] );
        const { container } = screen( fakeCall( { participants: people } ), 'group-audio', {
            Avatar: ( { user_id } ) => <i className="my-avatar">{ String( user_id ) }</i>,
            Name: ( { user_id } ) => <b className="my-name">#{ String( user_id ) }</b>,
        } );

        expect( [ ...container.querySelectorAll( '.my-avatar' ) ].map( ( a ) => a.textContent ).sort() ).toEqual( [ '34', '42' ] );
        expect( [ ...container.querySelectorAll( '.my-name' ) ].map( ( a ) => a.textContent ).sort() ).toEqual( [ '#34', '#42' ] );
    } );

    it( 'nests: what a screen is given goes over what the page gave further out', () => {
        const { container } = render(
            <PiecesProvider pieces={ { VideoTile: () => <div className="outer" />, CallStatus: () => <div className="outer-status" /> } }>
                <CallScreen call={ { ...inCall(), wrapper: createRef<HTMLDivElement>() as never } } layout="private"
                            components={ { VideoTile: () => <div className="inner" /> } } />
            </PiecesProvider>,
        );
        expect( container.querySelector( '.inner' ) ).not.toBeNull();
        expect( container.querySelector( '.outer' ) ).toBeNull();
    } );
} );

describe( 'the ring\'s card', () => {
    it( 'is the app\'s, answering and rejecting the call that rings', async () => {
        const handlers = new Map<string, Array<( ...a: any[] ) => void>>();
        const calls = {
            on: ( e: string, fn: ( ...a: any[] ) => void ) => void handlers.set( e, [ ...( handlers.get( e ) ?? [] ), fn ] ),
            off: () => {},
            start: vi.fn(), group: vi.fn(),
        } as unknown as SdkCalls;
        const controller = new CallsController( calls );
        const decline = vi.fn( async () => {} );
        const { container } = render( <PiecesProvider pieces={ {
            RingCard: ( { name, type, onReject } ) => <button className="my-ring" onClick={ onReject }>{ name } ({ type })</button>,
        } }><CallsApp controller={ controller } /></PiecesProvider> );

        const incoming = { id: 'ring-1', call: 'support:34:42', from: 34, info: { name: 'Ann' }, type: 'audio', group: null, state: 'ringing',
            on: () => {}, off: () => {}, accept: vi.fn(), decline } as unknown as SdkIncoming;
        await act( async () => ( handlers.get( 'incoming' ) ?? [] ).forEach( ( fn ) => fn( incoming ) ) );

        expect( container.querySelector( '[part="ring-card"] .my-ring' )?.textContent ).toBe( 'Ann (audio)' );
        expect( container.querySelector( '.bm-toast-site-call-container' ) ).toBeNull();
        await act( async () => { fireEvent.click( container.querySelector( '.my-ring' )! ); } );
        expect( decline ).toHaveBeenCalled();
    } );
} );

describe( 'presence and chat pieces', () => {
    it( 'draws the online list\'s rows as the app does, with what the list offers for each', async () => {
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben', role: 'Customer' } } );
        const { container } = render( <OnlineList rt={ fakeRooms( { shop } ) } room="shop" actions={ ( m ) => <button className="call">Call { m.name }</button> }
                                                  components={ { OnlineRow: ( { member, mine, actions } ) => <li className="my-row" data-mine={ mine ? 1 : 0 }>{ member.name } ({ String( member.info.role ?? '' ) }){ actions }</li> } } /> );
        await settle();

        const rows = [ ...container.querySelectorAll( '.my-row' ) ];
        expect( rows.map( ( r ) => r.textContent ) ).toEqual( [ 'Ann ()', 'Ben (Customer)Call Ben' ] );
        expect( rows.map( ( r ) => r.getAttribute( 'data-mine' ) ) ).toEqual( [ '1', '0' ] );
        expect( container.querySelector( '.bm-conv-admin__member' ) ).toBeNull();
    } );

    it( 'names the online row for ::part() without a piece', async () => {
        const shop = fakeRoom( 'shop', { 34: { name: 'Ann' } } );
        const { container } = render( <OnlineList rt={ fakeRooms( { shop } ) } room="shop" /> );
        await settle();
        expect( container.querySelector( '[part="online-row"]' ) ).not.toBeNull();
    } );

    it( 'draws the chat\'s messages, its empty conversation and its composer as the app does, sending and typing through it', async () => {
        const room = fakeRoom( 'chat:34:42', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
        room.emitWithAck.mockImplementation( async () => ( { id: 'm9', at: Date.now() } ) );
        const rt = fakeRooms( { 'chat:34:42': room } );
        let send: ( ( text: string ) => Promise<void> ) | null = null;
        let typing: ( () => void ) | null = null;
        const { container } = render( <Chat rt={ rt } room="chat:34:42" components={ {
            EmptyConversation: () => <p className="my-empty">Ask us anything</p>,
            Composer: ( props ) => ( send = props.send, typing = props.typing, <div className="my-composer" data-disabled={ props.disabled ? 1 : 0 }>{ props.placeholder }</div> ),
            Message: ( { message, mine, sender, children } ) => <div className="my-message" data-mine={ mine ? 1 : 0 } data-from={ sender.name }>{ children }</div>,
        } } /> );
        await settle();

        expect( container.querySelector( '.my-empty' )?.textContent ).toBe( 'Ask us anything' );
        expect( container.querySelector( '.my-composer' )?.textContent ).toBe( 'Write your message' );
        expect( container.querySelector( '.my-composer' )?.getAttribute( 'data-disabled' ) ).toBe( '0' );
        expect( container.querySelector( '[part="composer"] .my-composer' ) ).not.toBeNull();

        await act( async () => typing!() );
        expect( room.volatile.emit ).toHaveBeenCalledWith( 'typing', { on: true } );
        await act( async () => send!( '  It left this morning ' ) );
        await settle();
        expect( room.emitWithAck ).toHaveBeenCalledWith( 'message', { text: 'It left this morning' } );

        const message = container.querySelector( '.my-message' )!;
        expect( message.getAttribute( 'data-mine' ) ).toBe( '1' );
        expect( message.getAttribute( 'data-from' ) ).toBe( 'Ann' );
        // Ours inside it, named for ::part().
        expect( message.querySelector( '[part="message"] .bm-chat-text' )?.textContent ).toBe( 'It left this morning' );
    } );
} );
