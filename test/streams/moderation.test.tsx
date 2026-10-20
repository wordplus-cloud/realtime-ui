import {afterEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import type {ChatMessage} from "@wordplus/realtime-client/streams";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {base, fakeClient} from "./fake.tsx";

// What the cloud keeps for everyone (pass 5): the pinned message, the layout the host chose, a guest the
// host muted, a timeout.

afterEach( () => {
    cleanup();
    vi.useRealTimers();
} );

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const live = { id: 's', state: 'live' as const, started_at: Date.now() - 60_000, ended_at: null };
// A track that marks the <video> it is shown in with its id.
const track = ( id : string ) => ( { attach: ( video : HTMLVideoElement ) => { video.dataset.track = id; }, detach: () => {}, sid: 'TR_' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;
const shown = ( container : HTMLElement, where : string ) => [ ...container.querySelectorAll<HTMLVideoElement>( where + ' video' ) ].map( ( v ) => v.dataset.track + ( v.classList.contains( 'estream-video--contain' ) ? ' whole' : '' ) );
const person = ( identity : string, name : string, patch : Partial<Tile> = {} ) : Tile => ( {
    identity, name, role: identity === 'u:1' ? 'host' : 'guest', local: false, camera: track( identity ), screen: null, audio: [],
    micMuted: false, speaking: false, encoder: false, ...patch
} );
const message = ( id : string, text : string, from : Partial<ChatMessage['from']> = {} ) : ChatMessage => ( {
    id, text, at: 1, from: { id: 'u:7', name: 'Maya', avatar: null, role: 'viewer', ...from }
} );
const names = ( container : HTMLElement, where : string ) => [ ...container.querySelectorAll( where + ' .estream-tile' ) ].map( ( t ) => t.textContent );

describe( 'the layout the host chose', () => {
    const tiles = [ person( 'u:1', 'Host' ), person( 'u:5', 'Olena' ), person( 'u:7', 'Maya' ) ];
    const watching = ( patch : Partial<EasyStreamState> = {} ) => fakeClient( { stream: live, media: 'live', tiles, ...patch } );

    it( 'puts everyone in a grid, the one speaking large, or one person alone', () => {
        const { update, asClient } = watching();
        const { container } = render( <EasyStreamApp client={ asClient } /> );

        expect( container.querySelector( '.estream-tiles--n3' ) ).toBeTruthy();

        update( { layout: { mode: 'speaker', identity: null }, tiles: [ tiles[0]!, { ...tiles[1]!, speaking: true }, tiles[2]! ] } );
        expect( names( container, '.estream-tiles__main' ) ).toEqual( [ 'Olena' ] );
        expect( names( container, '.estream-tiles__strip' ) ).toEqual( [ 'Host', 'Maya' ] );

        // Nobody speaking: the last who spoke stays large.
        update( { tiles } );
        expect( names( container, '.estream-tiles__main' ) ).toEqual( [ 'Olena' ] );

        update( { layout: { mode: 'spotlight', identity: 'u:7' } } );
        expect( container.querySelectorAll( '.estream-tile' ) ).toHaveLength( 1 );
        expect( container.querySelector( '.estream-video--contain' ), 'shown whole' ).toBeTruthy();

        // The one in the spotlight left the stage: the others are seen again.
        update( { tiles: tiles.slice( 0, 2 ) } );
        expect( container.querySelectorAll( '.estream-tile' ) ).toHaveLength( 2 );
    } );

    it( 'puts a shared screen large with the cameras beside it, across the stage with its sharer\'s camera in the corner, and alone with no camera on', () => {
        const sharing = person( 'u:1', 'Host', { screen: track( 'screen' ) } );
        const { update, asClient } = watching( { tiles: [ sharing, tiles[1]! ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );

        expect( container.querySelector( '.estream-tiles--share' ) ).toBeTruthy();
        expect( shown( container, '.estream-tiles__main' ) ).toEqual( [ 'screen whole' ] );
        expect( names( container, '.estream-tiles__strip' ) ).toEqual( [ 'Host', 'Olena' ] );
        expect( shown( container, '.estream-tiles__strip' ) ).toEqual( [ 'u:1', 'u:5' ] );

        // The host alone with the screen and the camera: the screen across the stage, shown whole, and the camera in
        // the bottom right corner over it, unnamed and with no ring while they speak, as there is nobody to tell apart.
        update( { tiles: [ { ...sharing, speaking: true } ] } );
        expect( container.querySelector( '.estream-tiles__strip' ) ).toBeNull();
        expect( container.querySelector( '.estream-tiles--n1' ) ).toBeTruthy();
        expect( shown( container, '.estream-tiles--n1 > .estream-tile' ) ).toEqual( [ 'screen whole' ] );
        expect( container.querySelector( '.estream-tiles__corner' )!.className ).toBe( 'estream-tiles__corner estream-tiles__corner--right' );
        expect( shown( container, '.estream-tiles__corner' ) ).toEqual( [ 'u:1' ] );
        expect( names( container, '.estream-tiles__corner' ) ).toEqual( [ '' ] );
        expect( container.querySelector( '.estream-tile--speaking' ) ).toBeNull();

        // Its microphone off still says so there.
        update( { tiles: [ { ...sharing, micMuted: true } ] } );
        expect( container.querySelector( '.estream-tiles__corner [aria-label="Microphone off"]' ) ).toBeTruthy();

        // The host shares the screen only: no empty strip beside it and no corner, and it shows whole.
        update( { tiles: [ { ...sharing, camera: null } ] } );
        expect( container.querySelector( '.estream-tiles__strip' ) ).toBeNull();
        expect( container.querySelector( '.estream-tiles__corner' ) ).toBeNull();
        expect( container.querySelector( '.estream-tiles--n1' ) ).toBeTruthy();
        expect( container.querySelectorAll( '.estream-tile' ) ).toHaveLength( 1 );
        expect( shown( container, '.estream-tiles--n1' ) ).toEqual( [ 'screen whole' ] );
    } );

    it( 'puts the sharer\'s camera in the left corner where the site\'s logo takes the right', () => {
        const sharing = person( 'u:1', 'Host', { screen: track( 'screen' ) } );
        const { asClient } = watching( { tiles: [ sharing ] } );
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-right' } } /> );

        expect( container.querySelector( '.estream-tiles__corner' )!.className ).toBe( 'estream-tiles__corner estream-tiles__corner--left' );
        expect( container.querySelector( '.estream-logo--bottom-right' ) ).toBeTruthy();
    } );

    it( 'keeps the host\'s own picture as they go live, from the preview\'s tile to the room\'s, which names their place in it', () => {
        // The preview's tile has the person's identity; the room's, their place's, with the tab's 8 characters.
        const own = person( 'u:1', 'Host', { local: true } );
        const { update, asClient } = fakeClient( { you: host, stream: live, media: 'off', tiles: [ own ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );
        const before = container.querySelector( '.estream-stage video' );
        expect( before ).toBeTruthy();

        update( { media: 'live', tiles: [ { ...own, identity: 'u:1.0f1e2d3c' } ] } );
        expect( container.querySelector( '.estream-stage video' ), 'the same <video>, not made again' ).toBe( before );

        // A guest beside the host: the host's picture still the same.
        update( { tiles: [ { ...own, identity: 'u:1.0f1e2d3c' }, tiles[1]! ] } );
        expect( container.querySelectorAll( '.estream-stage video' )[0] ).toBe( before );
    } );

    it( 'lets the host move the sharer\'s camera over the screen, dragged or with the arrow keys, where everyone sees it', async () => {
        const sharing = person( 'u:1', 'Host', { screen: track( 'screen' ) } );

        // A viewer sees it where the host put it, its left and top as shares of the room the stage leaves it, and has
        // nothing to move.
        const seen = watching( { tiles: [ sharing ], layout: { mode: 'grid', identity: null, corner: { x: 0.25, y: 0.5 } } } );
        const first = render( <EasyStreamApp client={ seen.asClient } /> );
        const placed = first.container.querySelector<HTMLElement>( '.estream-tiles__corner' )!;
        expect( [ placed.style.left, placed.style.top, placed.style.transform ] ).toEqual( [ '25%', '50%', 'translate(-25%, -50%)' ] );
        expect( [ placed.getAttribute( 'tabindex' ), placed.getAttribute( 'role' ), placed.className.includes( 'movable' ) ] ).toEqual( [ null, null, false ] );
        first.unmount();

        const { client, asClient } = fakeClient( { you: host, stream: live, media: 'live', tiles: [ { ...sharing, local: true } ] } );
        const { container } = render( <EasyStreamApp client={ asClient } /> );
        const corner = container.querySelector<HTMLElement>( '.estream-tiles__corner' )!;
        expect( corner.getAttribute( 'aria-label' ) ).toBe( 'Camera over the shared screen. Drag it, or move it with the arrow keys.' );
        expect( corner.style.left ).toBe( '' );

        // Dragged: on a stage 1000 by 500 it has 780 by 400 to move in, as it is 220 by 100; it moves only here while
        // held, and for everyone once let go.
        const box = ( left : number, top : number, width : number, height : number ) => () => ( { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON(){} } ) as DOMRect;
        corner.parentElement!.getBoundingClientRect = box( 0, 0, 1000, 500 );
        corner.getBoundingClientRect = box( 766, 386, 220, 100 );
        fireEvent.pointerDown( corner, { pointerId: 1, clientX: 806, clientY: 406 } );
        fireEvent.pointerMove( corner, { pointerId: 1, clientX: 430, clientY: 220 } );
        expect( [ corner.style.left, corner.style.top ] ).toEqual( [ '50%', '50%' ] );
        expect( client.setCorner ).not.toHaveBeenCalled();
        // Beyond the stage, held at its edge.
        fireEvent.pointerMove( corner, { pointerId: 1, clientX: -500, clientY: 220 } );
        await act( async () => { fireEvent.pointerUp( corner, { pointerId: 1, clientX: -500, clientY: 220 } ); } );
        expect( client.setCorner ).toHaveBeenLastCalledWith( { x: 0, y: 0.5 } );
        expect( corner.style.left ).toBe( '0%' );

        // With the arrow keys, by 5%, by 1% with Shift, and Home for the bottom corner again.
        await act( async () => { fireEvent.keyDown( corner, { key: 'ArrowRight' } ); } );
        expect( client.setCorner ).toHaveBeenLastCalledWith( { x: 0.05, y: 0.5 } );
        await act( async () => { fireEvent.keyDown( corner, { key: 'ArrowDown', shiftKey: true } ); } );
        expect( client.setCorner ).toHaveBeenLastCalledWith( { x: 0.05, y: 0.51 } );
        await act( async () => { fireEvent.keyDown( corner, { key: 'Home' } ); } );
        expect( client.setCorner ).toHaveBeenLastCalledWith( null );
        expect( corner.style.left ).toBe( '' );
    } );

    it( 'lets the host choose it, for everyone, from the studio', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: live, media: 'live', tiles, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Layout' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitemradio', { name: 'The one speaking, large' } ) ); } );
        expect( client.setLayout ).toHaveBeenLastCalledWith( 'speaker', undefined );

        fireEvent.click( screen.getByLabelText( 'Layout' ) );
        await act( async () => { fireEvent.click( within( screen.getByRole( 'menu' ) ).getByRole( 'menuitemradio', { name: 'Maya' } ) ); } );
        expect( client.setLayout ).toHaveBeenLastCalledWith( 'spotlight', 'u:7' );
    } );

    it( 'offers no layout while the host is alone on stage', () => {
        const { asClient } = fakeClient( { you: host, stream: live, media: 'live', tiles: [ person( 'u:1', 'Host' ) ], devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.queryByLabelText( 'Layout' ) ).toBeNull();
    } );
} );

describe( 'a guest\'s microphone', () => {
    it( 'is muted by the host from the guests\' list, and only while on', async () => {
        const { client, asClient } = fakeClient( {
            you: host, stream: live, media: 'live', devices: { camera: true, microphone: true },
            tiles: [ person( 'u:1', 'Host' ), person( 'u:5', 'Olena' ), person( 'u:7', 'Maya', { micMuted: true } ) ]
        } );
        render( <EasyStreamApp client={ asClient } /> );

        const mute = screen.getAllByText( 'Mute' );
        expect( mute ).toHaveLength( 1 );
        await act( async () => { fireEvent.click( mute[0]! ); } );
        expect( client.muteGuest ).toHaveBeenCalledWith( 'u:5' );
    } );

    it( 'tells the guest the host muted it, for a few seconds', () => {
        vi.useFakeTimers( { now: 1_000_000 } );
        const { update, asClient } = fakeClient( { stream: live, onStage: true } );
        render( <EasyStreamApp client={ asClient } /> );

        update( { mutedByHost: Date.now() } );
        expect( screen.getByText( 'The host muted your microphone' ) ).toBeTruthy();

        act( () => { vi.advanceTimersByTime( 7000 ); } );
        expect( screen.queryByText( 'The host muted your microphone' ) ).toBeNull();
    } );
} );

describe( 'the pinned message', () => {
    it( 'sits over the chat for everyone, with its links', () => {
        const { asClient } = fakeClient( { pinned: message( '3-0', 'Slides at https://example.com/slides', { name: 'Host', role: 'host' } ) } );
        render( <EasyStreamApp client={ asClient } /> );

        const pinned = screen.getByRole( 'note', { name: 'Pinned message' } );
        expect( pinned.textContent ).toContain( 'Host' );
        expect( within( pinned ).getByRole( 'link' ).getAttribute( 'href' ) ).toBe( 'https://example.com/slides' );
        expect( within( pinned ).queryByLabelText( 'Unpin message' ), 'a viewer can\'t unpin' ).toBeNull();
    } );

    it( 'is pinned and unpinned by moderators from a message\'s menu, or from the pin itself', async () => {
        const { client, update, asClient } = fakeClient( { you: host, stream: live, chat: [ message( '3-0', 'Questions at the end' ) ] } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Maya' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Pin message' } ) ); } );
        expect( client.pin ).toHaveBeenCalledWith( '3-0' );

        update( { pinned: message( '3-0', 'Questions at the end' ) } );
        fireEvent.click( screen.getByLabelText( 'Moderate the message of Maya' ) );
        expect( screen.getByRole( 'menuitem', { name: 'Unpin message' } ) ).toBeTruthy();
        fireEvent.keyDown( screen.getByRole( 'menu' ), { key: 'Escape' } );

        await act( async () => { fireEvent.click( within( screen.getByRole( 'note' ) ).getByLabelText( 'Unpin message' ) ); } );
        expect( client.unpin ).toHaveBeenCalled();
    } );
} );

describe( 'a timeout', () => {
    it( 'mutes someone in the chat for a while, never a host or oneself', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: live, chat: [ message( '3-0', 'spam' ), message( '4-0', 'mine', { id: 'u:1', name: 'Host', role: 'host' } ) ] } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Maya' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Mute for 10 minutes' } ) ); } );
        expect( client.timeOut ).toHaveBeenCalledWith( 'u:7', 600 );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Host' ) );
        expect( screen.queryByRole( 'menuitem', { name: /Mute/ } ) ).toBeNull();
    } );

    it( 'keeps the one timed out from writing, counting down until they may again', () => {
        vi.useFakeTimers( { now: 1_000_000 } );
        const { asClient } = fakeClient( { stream: live, timeoutUntil: Date.now() + 272_000 } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.queryByPlaceholderText( 'Say something…' ) ).toBeNull();
        expect( screen.getByText( 'A moderator timed you out. You can write again in 4:32' ) ).toBeTruthy();

        act( () => { vi.advanceTimersByTime( 273_000 ); } );
        expect( screen.getByPlaceholderText( 'Say something…' ) ).toBeTruthy();
    } );

    it( 'ignores one already over', () => {
        const { asClient } = fakeClient( { ...base, timeoutUntil: Date.now() - 1000 } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByPlaceholderText( 'Say something…' ) ).toBeTruthy();
    } );
} );

describe( 'the chat\'s moderators and its rules', () => {
    const viewer = { identity: 'u:7', role: 'viewer' as const, name: 'Maya', chat: 'write' as const, mod: false };

    it( 'removes someone from the stream after asking, and bans them with who they were', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: live, chat: [ message( '3-0', 'spam' ) ] } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Moderate the message of Maya' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Remove from the stream' } ) ); } );
        expect( screen.getByRole( 'dialog', { name: 'Remove Maya from this stream?' } ).textContent ).toContain( 'They can join it again' );
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Remove' } ) ); } );
        expect( client.kick ).toHaveBeenCalledWith( 'u:7' );
        // A day at most.
        fireEvent.click( screen.getByLabelText( 'Moderate the message of Maya' ) );
        expect( screen.getAllByRole( 'menuitem', { name: /^Mute for/ } ).map( ( m ) => m.textContent ) ).toEqual( [ 'Mute for 1 minute', 'Mute for 10 minutes', 'Mute for an hour', 'Mute for a day' ] );
    } );

    it( 'clears the chat for everyone after asking', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: live, chat: [ message( '3-0', 'old' ) ] } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Chat settings' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Clear the chat' } ) ); } );
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Clear' } ) ); } );
        expect( client.clearChat ).toHaveBeenCalled();
    } );

    it( 'shows a moderator who is here, with visitors counted, a menu on each but the hosts, and the banned with a way back', async () => {
        const { client, asClient } = fakeClient( { you: { ...host, people: true }, stream: live } );
        client.people.mockResolvedValue( { ok: true, watching: 5, people: [
            { identity: 'u:1', name: 'Host', avatar: null, role: 'host' },
            { identity: 'u:7', name: 'Maya', avatar: 'https://site.example/maya.png', role: 'viewer', timeoutUntil: Date.now() + 60_000 },
            { identity: 'u:8', name: 'Sam', avatar: null, role: 'viewer' }
        ] } );
        client.bans.mockResolvedValue( { ok: true, bans: [ { identity: 'u:9', name: 'Gone', avatar: null, at: 1 } ] } );
        render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Who is here' } ) ); } );
        const here = screen.getByRole( 'list', { name: 'Who is here' } );
        expect( [ ...here.querySelectorAll( '.estream-person__name' ) ].map( ( n ) => n.textContent ) ).toEqual( [ 'Host', 'Maya', 'Sam' ] );
        expect( ( here.querySelector( 'img.estream-message__avatar' ) as HTMLImageElement ).src ).toBe( 'https://site.example/maya.png' );
        expect( screen.getByText( 'and 3 visitors' ) ).toBeTruthy();
        expect( screen.queryByLabelText( 'Moderate Host' ) ).toBeNull();

        // Maya is muted: she may be let to write again.
        fireEvent.click( screen.getByLabelText( 'Moderate Maya' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Unmute' } ) ); } );
        expect( client.liftTimeout ).toHaveBeenCalledWith( 'u:7' );

        const banned = screen.getByRole( 'list', { name: 'Banned' } );
        await act( async () => { fireEvent.click( within( banned ).getByRole( 'button', { name: 'Let back' } ) ); } );
        expect( client.unban ).toHaveBeenCalledWith( 'u:9' );

        // Back to the messages.
        fireEvent.click( screen.getByRole( 'button', { name: 'Who is here' } ) );
        expect( screen.queryByRole( 'list', { name: 'Who is here' } ) ).toBeNull();
    } );

    it( 'shows who is here to everyone where the stream says so, without moderating, and to nobody else', async () => {
        const { client, asClient } = fakeClient( { you: { ...viewer, people: true }, stream: live } );
        client.people.mockResolvedValue( { ok: true, watching: 1, people: [ { identity: 'u:7', name: 'Maya', avatar: null, role: 'viewer' } ] } );
        const shown = render( <EasyStreamApp client={ asClient } /> );
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Who is here' } ) ); } );
        expect( screen.getByRole( 'list', { name: 'Who is here' } ).textContent ).toContain( 'Maya' );
        expect( screen.queryByLabelText( 'Moderate Maya' ) ).toBeNull();
        expect( client.bans ).not.toHaveBeenCalled();
        shown.unmount();

        render( <EasyStreamApp client={ fakeClient( { you: { ...viewer, people: false }, stream: live } ).asClient } /> );
        expect( screen.queryByRole( 'button', { name: 'Who is here' } ) ).toBeNull();
    } );

    it( 'closes the chat while the stream isn\'t live where the stream says so, and says why', () => {
        const idle = { ...live, state: 'idle' as const, started_at: null };
        const ended = { ...live, state: 'ended' as const, ended_at: Date.now() };
        const at = ( you : object, stream : object ) => {
            cleanup();
            render( <EasyStreamApp client={ fakeClient( { you: { ...viewer, ...you }, stream: stream as any } ).asClient } /> );
            return screen.queryByPlaceholderText( 'Say something…' ) !== null;
        };

        expect( at( { offline: 'closed' }, idle ) ).toBe( false );
        expect( screen.getByText( 'The chat opens when the stream goes live' ) ).toBeTruthy();
        expect( at( { offline: 'closed' }, ended ) ).toBe( false );
        expect( screen.getByText( 'The chat closed when the stream ended' ) ).toBeTruthy();
        expect( at( { offline: 'closed' }, live ) ).toBe( true );
        expect( at( { offline: 'open' }, ended ) ).toBe( true );
        // A cloud from before the rule: open before the start, closed after the end.
        expect( at( {}, idle ) ).toBe( true );
        expect( at( {}, ended ) ).toBe( false );
    } );

    it( 'tells someone a moderator removed that they may join again', async () => {
        const { client, asClient } = fakeClient( { status: 'error', error: 'kicked' } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'A moderator removed you from this stream' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Join again' } ) ); } );
        expect( client.start ).toHaveBeenCalled();
    } );
} );
