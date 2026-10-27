import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamParts, type Part, type PartName, type PartOptions} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// A stream's parts placed apart on a page: each in its own place, sharing one client, the player's state and the
// dialogs; the studio for hosts only, and a way to the admin studio where there is none; the chat as tall as the
// player beside it; and the admin's studio page.

beforeEach( () => {
    window.localStorage.clear();
    document.body.innerHTML = '';
} );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete ( document as any ).fullscreenElement;
    delete ( document as any ).fullscreenEnabled;
} );

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const track = ( id : string ) => ( { attach: vi.fn(), detach: vi.fn(), sid: 'TR_' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;
const hostTile = ( identity = 'u:1.0a1b2c3d' ) : Tile => ( {
    identity, name: 'Maya Lee', role: 'host', local: false, camera: track( 'v' ), screen: null, audio: [], micMuted: false, speaking: false, encoder: false
} );
const live = ( patch : Partial<EasyStreamState> = {} ) : Partial<EasyStreamState> => ( {
    stream: { id: 's', state: 'live', started_at: Date.now() - 65_000, ended_at: null },
    media: 'live',
    tiles: [ hostTile() ],
    chat: [ { id: '1-0', from: { id: 'u:3', name: 'Sam', avatar: null, role: 'viewer' }, text: 'Hello there', at: Date.now() } ],
    ...patch
} );

// Places on the page for the parts, and a layer for the dialogs.
function page( names : PartName[], options : Partial<Record<PartName, PartOptions>> = {} ){
    const parts : Part[] = names.map( ( name, i ) => {
        const element = document.createElement( 'div' );
        element.id = name;
        document.body.appendChild( element );
        return { key: 'p' + i, element, name, options: options[ name ] };
    } );
    const dialogs = document.createElement( 'div' );
    dialogs.id = 'layer';
    document.body.appendChild( dialogs );

    const at = ( name : string ) => document.getElementById( name )!;
    return { parts, dialogs, at };
}

const show = ( state : Partial<EasyStreamState>, names : PartName[], extra : { options? : Partial<Record<PartName, PartOptions>>, studioUrl? : string, connectUrl? : string, chat? : boolean, guests? : boolean, room? : string, before? : ( client : ReturnType<typeof fakeClient>['client'] ) => void } = {} ) => {
    const fake = fakeClient( state );
    extra.before?.( fake.client );
    const { parts, dialogs, at } = page( names, extra.options );
    const rendered = render( <EasyStreamParts client={ fake.asClient } parts={ parts } dialogs={ dialogs } title="Friday Q&A" studioUrl={ extra.studioUrl } connectUrl={ extra.connectUrl } chat={ extra.chat } guests={ extra.guests } room={ extra.room } manage={ false } /> );
    return { ...fake, parts, dialogs, at, rendered };
};

// A stream's Better Messages chat room, as Better Messages' placeholder for it comes from the page.
const ROOM = '<div class="bm-chat-wrap" style="height: 600px" data-thread-id="16778" data-chat-id="14014" data-full-screen="0"></div>';

describe( 'a stream\'s Better Messages chat room', () => {
    it( 'takes the light chat\'s place in the chat part, Better Messages\' placeholder as it came, and goes with the part', () => {
        ( document as any ).fullscreenEnabled = true;
        const { at, rendered } = show( live(), [ 'player', 'chat' ], { room: ROOM } );

        const room = at( 'chat' ).querySelector( '.estream-part--chat > .estream-bm-room > .bm-chat-wrap' );
        expect( room?.getAttribute( 'data-thread-id' ) ).toBe( '16778' );
        expect( room?.getAttribute( 'data-chat-id' ) ).toBe( '14014' );
        expect( within( at( 'chat' ) ).queryByText( 'Hello there' ) ).toBeNull();
        expect( screen.queryByPlaceholderText( 'Say something…' ) ).toBeNull();

        // On the page with the player, a part of its own, the player hides and shows it, the same room kept unseen.
        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Hide chat' ) );
        expect( at( 'chat' ).hasAttribute( 'data-estream-chat-hidden' ) ).toBe( true );
        expect( at( 'chat' ).querySelector( '.bm-chat-wrap' ) ).toBe( room );
        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Show chat' ) );
        expect( at( 'chat' ).hasAttribute( 'data-estream-chat-hidden' ) ).toBe( false );

        rendered.unmount();
        expect( document.querySelector( '.bm-chat-wrap' ) ).toBeNull();
    } );

    it( 'is shown and hidden from the player beside it in a ready layout, one block, kept mounted while hidden', () => {
        // The Live stream block's side layout: the player in its main column, the chat in the one beside.
        const { parts, dialogs, at } = page( [ 'player', 'details', 'chat' ] );
        document.body.insertAdjacentHTML( 'beforeend', '<div class="estream-layout estream-layout--side"><div class="estream-layout__grid"><div class="estream-layout__main"></div><div class="estream-layout__side"></div></div></div>' );
        const layout = document.querySelector( '.estream-layout' )!;
        layout.querySelector( '.estream-layout__main' )!.append( at( 'player' ), at( 'details' ) );
        layout.querySelector( '.estream-layout__side' )!.append( at( 'chat' ) );
        const fake = fakeClient( live() );
        render( <EasyStreamParts client={ fake.asClient } parts={ parts } dialogs={ dialogs } title="Friday Q&A" room={ ROOM } manage={ false } /> );
        const room = at( 'chat' ).querySelector( '.bm-chat-wrap' );

        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Hide chat' ) );
        expect( layout.classList.contains( 'estream-layout--no-chat' ) ).toBe( true );
        // Hidden by the layout, not taken down: the same room, for when it shows again.
        expect( at( 'chat' ).querySelector( '.bm-chat-wrap' ) ).toBe( room );

        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Show chat' ) );
        expect( layout.classList.contains( 'estream-layout--no-chat' ) ).toBe( false );
        expect( at( 'chat' ).querySelector( '.bm-chat-wrap' ) ).toBe( room );
    } );

    it( 'is taken into the player\'s full screen, the same room, dark there, and given back to its part as it ends', async () => {
        ( document as any ).fullscreenEnabled = true;
        document.body.classList.add( 'bm-messages-light' );
        const { at } = show( live(), [ 'player', 'chat' ], { room: ROOM } );
        // The room as Better Messages mounted it, with what was typed in it.
        const room = at( 'chat' ).querySelector( '.bm-chat-wrap' ) as HTMLElement;
        room.classList.add( 'bm-initialized' );
        room.innerHTML = '<textarea>half a message</textarea>';
        const root = at( 'player' ).querySelector( '.estream-theme' )!;

        ( document as any ).fullscreenElement = root;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        // The very element, not a copy, beside the picture: one room on the page.
        expect( root.querySelector( '.estream-app__side > .estream-bm-room > .bm-chat-wrap' ) ).toBe( room );
        expect( document.querySelectorAll( '.bm-chat-wrap' ) ).toHaveLength( 1 );
        expect( room.querySelector( 'textarea' )?.value ).toBe( 'half a message' );
        expect( document.body.classList.contains( 'bm-messages-dark' ) ).toBe( true );
        // With the button and the key for it, as the light chat has.
        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Hide chat' ) );
        expect( at( 'chat' ).querySelector( '.estream-part--chat > .estream-bm-room > .bm-chat-wrap' ) ).toBe( room );
        expect( root.querySelector( '.estream-bm-room' ) ).toBeNull();
        fireEvent.click( within( at( 'player' ) ).getByLabelText( 'Show chat' ) );
        expect( root.querySelector( '.estream-bm-room > .bm-chat-wrap' ) ).toBe( room );

        delete ( document as any ).fullscreenElement;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( at( 'chat' ).querySelector( '.estream-part--chat > .estream-bm-room > .bm-chat-wrap' ) ).toBe( room );
        expect( document.querySelectorAll( '.bm-chat-wrap' ) ).toHaveLength( 1 );
        expect( document.body.classList.contains( 'bm-messages-light' ) ).toBe( true );
        expect( document.body.classList.contains( 'bm-messages-dark' ) ).toBe( false );
        document.body.className = '';
    } );

    it( 'has a room of its own in the player\'s full screen where the page shows no chat part', async () => {
        ( document as any ).fullscreenEnabled = true;
        const { at } = show( live(), [ 'player' ], { room: ROOM } );
        expect( document.querySelector( '.bm-chat-wrap' ) ).toBeNull();
        const root = at( 'player' ).querySelector( '.estream-theme' )!;

        ( document as any ).fullscreenElement = root;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( root.querySelector( '.estream-app__side > .estream-bm-room > .bm-chat-wrap' )?.getAttribute( 'data-thread-id' ) ).toBe( '16778' );

        delete ( document as any ).fullscreenElement;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( document.querySelector( '.bm-chat-wrap' ) ).toBeNull();
        document.body.className = '';
    } );

    it( 'sits beside the player in one piece, and in the studio page\'s chat tab', () => {
        const all = show( live(), [ 'all' ], { room: ROOM } );
        expect( all.at( 'all' ).querySelector( '.estream-app__side > .estream-bm-room > .bm-chat-wrap' ) ).toBeTruthy();
        expect( all.at( 'all' ).querySelector( '.estream-chat' ) ).toBeNull();
        cleanup();
        document.body.innerHTML = '';

        const studio = show( { you: host }, [ 'studio-page' ], { room: ROOM, options: { 'studio-page': { page: { back: '#/studio', page: '', createPage: '', nonce: 'n', settings: '' } } } } );
        expect( within( studio.at( 'studio-page' ) ).getByRole( 'tab', { name: 'Chat' } ).getAttribute( 'aria-selected' ) ).toBe( 'true' );
        expect( studio.at( 'studio-page' ).querySelector( '.estream-bm-room > .bm-chat-wrap' ) ).toBeTruthy();
    } );

    it( 'is dark in the player\'s full screen, as Better Messages is dark by its body class, and the page\'s own after', async () => {
        ( document as any ).fullscreenEnabled = true;
        document.body.classList.add( 'bm-messages-light', 'site' );
        const all = show( live(), [ 'all' ], { room: ROOM } );
        const root = all.at( 'all' ).querySelector( '.estream-theme' )!;

        ( document as any ).fullscreenElement = root;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( root.className ).toContain( 'estream-theme--full' );
        expect( [ ...document.body.classList ].sort() ).toEqual( [ 'bm-messages-dark', 'site' ] );

        delete ( document as any ).fullscreenElement;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( [ ...document.body.classList ].sort() ).toEqual( [ 'bm-messages-light', 'site' ] );
        document.body.className = '';
    } );
} );

// What a Better Messages conversation lets the stream's parts do there, as the embed gives it (better-messages.ts).
// `chat`: whether the conversation shows beside the stage, or null where it can't be hidden.
function fakeRoom( shown = false, chat : boolean | null = true ){
    let on = shown;
    let beside = chat;
    const listeners = new Set<() => void>();
    const tell = ( value : boolean ) => { on = value; listeners.forEach( ( l ) => l() ); };
    return {
        open: vi.fn( () => act( () => tell( true ) ) ),
        leave: vi.fn( () => act( () => tell( false ) ) ),
        hold: vi.fn(),
        locked: vi.fn( () => false ),
        shown: () => on,
        chat: () => beside,
        toggleChat: vi.fn( () => act( () => {
            beside = beside === null ? null : ! beside;
            listeners.forEach( ( l ) => l() );
        } ) ),
        subscribe: ( l : () => void ) => { listeners.add( l ); return () => { listeners.delete( l ); }; }
    };
}

const viewer = { identity: 'u:7', role: 'viewer' as const, name: 'Ann', chat: 'write' as const, mod: false };

describe( 'the stream in a Better Messages conversation', () => {
    it( 'puts a button among the header\'s for a viewer while it is live, which opens it and, latched, closes it', () => {
        const room = fakeRoom();
        const { at, update } = show( { you: viewer }, [ 'room-button' ], { chat: false, options: { 'room-button': { room } } } );
        expect( at( 'room-button' ).innerHTML ).toBe( '' );

        update( live( { you: viewer } ) );
        const button = within( at( 'room-button' ) ).getByRole( 'button', { name: 'Watch the live stream' } );
        expect( button.className ).toContain( 'bm-icon-btn' );
        fireEvent.click( button );
        expect( room.open ).toHaveBeenCalledTimes( 1 );

        const latched = within( at( 'room-button' ) ).getByRole( 'button', { name: 'Close the live stream' } );
        expect( latched.getAttribute( 'data-active' ) ).toBe( '1' );
        fireEvent.click( latched );
        expect( room.leave ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'gives its host the button before it is live, to go live from the conversation', () => {
        const room = fakeRoom();
        const { at } = show( { you: host }, [ 'room-button' ], { chat: false, options: { 'room-button': { room } } } );
        fireEvent.click( within( at( 'room-button' ) ).getByRole( 'button', { name: 'Go live in this conversation' } ) );
        expect( room.open ).toHaveBeenCalled();
    } );

    it( 'puts a banner over the messages while it is live and doesn\'t show, as a group call\'s', () => {
        const room = fakeRoom();
        const { at } = show( live( { you: viewer } ), [ 'room-banner' ], { chat: false, options: { 'room-banner': { room } } } );

        const banner = at( 'room-banner' ).querySelector( '.bm-before-message-list > .bm-group-call-in-progress' )!;
        expect( banner.textContent ).toContain( 'Friday Q&A' );
        expect( banner.textContent ).toContain( '12 watching' );
        fireEvent.click( within( banner as HTMLElement ).getByRole( 'button', { name: 'Watch' } ) );
        expect( room.open ).toHaveBeenCalled();
        expect( at( 'room-banner' ).innerHTML ).toBe( '' );
    } );

    it( 'says over the messages when a planned stream starts, and offers its host to set up', () => {
        const fake = fakeClient( { you: viewer } );
        const { parts, dialogs, at } = page( [ 'room-banner' ], { 'room-banner': { room: fakeRoom() } } );
        render( <EasyStreamParts client={ fake.asClient } parts={ parts } dialogs={ dialogs } scheduled={ Date.now() + 86_400_000 } chat={ false } manage={ false } /> );
        expect( within( at( 'room-banner' ) ).getByText( /^Live stream: starts / ) ).toBeTruthy();
        expect( within( at( 'room-banner' ) ).queryByRole( 'button' ) ).toBeNull();
        cleanup();
        document.body.innerHTML = '';

        const room = fakeRoom();
        const hosted = fakeClient( { you: host } );
        const second = page( [ 'room-banner' ], { 'room-banner': { room } } );
        render( <EasyStreamParts client={ hosted.asClient } parts={ second.parts } dialogs={ second.dialogs } scheduled={ Date.now() + 86_400_000 } chat={ false } manage={ false } /> );
        fireEvent.click( within( second.at( 'room-banner' ) ).getByRole( 'button', { name: 'Set up' } ) );
        expect( room.open ).toHaveBeenCalled();
    } );

    it( 'shows a viewer the stream in the call area, with the player\'s controls in the call\'s dock: sound and volume, quality, reactions, full screen and closing', () => {
        ( document as any ).fullscreenEnabled = true;
        const room = fakeRoom( true );
        const { at, client } = show( live( { you: viewer, tiles: [ hostTile(), { ...hostTile( 'u:4.0a1b2c3d' ), name: 'Jordan', micMuted: true } ] } ), [ 'room-stage' ], { chat: false, options: { 'room-stage': { room } } } );

        const stage = at( 'room-stage' );
        expect( stage.querySelector( '.estream-bm-stage .bm-group-call-container .estream-stage' ) ).toBeTruthy();
        // The call's dock, not the player's bar; the time on air beside the Live badge instead.
        const dock = stage.querySelector( '.bm-group-call-controls-v2 > .bm-group-call-controls-buttons' ) as HTMLElement;
        expect( dock ).toBeTruthy();
        expect( stage.querySelector( '.estream-bar' ) ).toBeNull();
        expect( within( stage ).getByLabelText( 'Time on air' ).textContent ).toBe( '1:05' );
        // Each tile says who it is and that the microphone is off as a call's does.
        expect( [ ...stage.querySelectorAll( '.bm-info-name' ) ].map( ( n ) => n.textContent ) ).toEqual( [ 'Maya Lee', 'Jordan' ] );
        expect( stage.querySelectorAll( '.bm-caller-status > .bm-mic-disabled' ) ).toHaveLength( 1 );
        expect( stage.querySelector( '.estream-tile__muted' ) ).toBeNull();

        fireEvent.click( within( dock ).getByRole( 'button', { name: 'Mute' } ) );
        expect( within( dock ).getByRole( 'button', { name: 'Turn sound on' } ) ).toBeTruthy();
        expect( within( dock ).getByRole( 'button', { name: 'Full screen' } ).className ).toBe( 'bm-fs-enable' );
        // Nobody asks to come on stage from the conversation.
        expect( within( dock ).queryByRole( 'button', { name: /stage/ } ) ).toBeNull();

        // The volume and the quality, in the call's settings sheet.
        fireEvent.click( within( dock ).getByRole( 'button', { name: 'Settings' } ) );
        const sheet = stage.querySelector( '.bm-group-call-controls-v2 > .bm-call-settings' ) as HTMLElement;
        fireEvent.change( within( sheet ).getByLabelText( 'Volume' ), { target: { value: '0.3' } } );
        expect( window.localStorage.getItem( 'wordplus-stream:volume' ) ).toBe( '0.3' );
        expect( within( dock ).getByRole( 'button', { name: 'Mute' } ) ).toBeTruthy();
        expect( [ ...( within( sheet ).getByLabelText( 'Quality' ) as HTMLSelectElement ).options ].map( ( o ) => o.textContent ) ).toEqual( [ 'Auto', 'High', 'Medium', 'Low' ] );
        fireEvent.change( within( sheet ).getByLabelText( 'Quality' ), { target: { value: 'low' } } );
        expect( client.setQuality ).toHaveBeenCalledWith( 'low' );
        // The statistics, over the picture, from the sheet too.
        fireEvent.click( within( sheet ).getByRole( 'button', { name: 'Statistics' } ) );
        expect( within( stage ).getByRole( 'region', { name: 'Statistics' } ) ).toBeTruthy();
        fireEvent.click( within( sheet ).getByRole( 'button', { name: 'Hide statistics' } ) );
        expect( within( stage ).queryByRole( 'region', { name: 'Statistics' } ) ).toBeNull();
        fireEvent.click( within( dock ).getByRole( 'button', { name: 'Settings' } ) );
        expect( stage.querySelector( '.bm-call-settings' ) ).toBeNull();

        // Reactions, from their own sheet.
        fireEvent.click( within( dock ).getByRole( 'button', { name: 'Reactions' } ) );
        fireEvent.click( within( stage.querySelector( '.estream-bm-reactions' ) as HTMLElement ).getByRole( 'button', { name: 'Heart' } ) );
        expect( client.react ).toHaveBeenCalledWith( '❤️' );

        fireEvent.click( within( dock ).getByRole( 'button', { name: 'Close the live stream' } ) );
        expect( room.leave ).toHaveBeenCalled();
        expect( room.hold ).not.toHaveBeenCalledWith( true );
    } );

    it( 'shows and hides the conversation beside the stage from the dock, first, as a call\'s dock does', () => {
        const room = fakeRoom( true );
        const { at } = show( live( { you: viewer, tiles: [ hostTile() ] } ), [ 'room-stage' ], { chat: false, options: { 'room-stage': { room } } } );
        const dock = at( 'room-stage' ).querySelector( '.bm-group-call-controls-buttons' ) as HTMLElement;

        // The call's own control, by its class and icon, and latched while the conversation shows.
        const hide = dock.firstElementChild as HTMLElement;
        expect( [ hide.getAttribute( 'aria-label' ), hide.className, hide.getAttribute( 'data-active' ) ] ).toEqual( [ 'Hide chat', 'bm-toggle-chat', '1' ] );
        fireEvent.click( hide );
        expect( room.toggleChat ).toHaveBeenCalledTimes( 1 );
        const again = within( dock ).getByRole( 'button', { name: 'Show chat' } );
        expect( again.getAttribute( 'data-active' ) ).toBeNull();
        fireEvent.click( again );
        expect( within( dock ).getByRole( 'button', { name: 'Hide chat' } ) ).toBeTruthy();
        cleanup();
        document.body.innerHTML = '';

        // A host's stage has it too; where the conversation can't be hidden, nothing.
        const hosting = show( { you: host }, [ 'room-stage' ], { chat: false, options: { 'room-stage': { room: fakeRoom( true ) } } } );
        expect( within( hosting.at( 'room-stage' ) ).getByRole( 'button', { name: 'Hide chat' } ) ).toBeTruthy();
        cleanup();
        document.body.innerHTML = '';
        const fixed = show( live( { you: viewer, tiles: [ hostTile() ] } ), [ 'room-stage' ], { chat: false, options: { 'room-stage': { room: fakeRoom( true, null ) } } } );
        expect( within( fixed.at( 'room-stage' ) ).queryByRole( 'button', { name: /chat/ } ) ).toBeNull();
    } );

    it( 'shows someone without a picture by their avatar and name, their initials where the avatar is missing or won\'t load', () => {
        const room = fakeRoom( true );
        const voice = { ...hostTile(), camera: null, avatar: 'https://cdn.example/maya.png' };
        const { at, update } = show( live( { you: viewer, tiles: [ voice ] } ), [ 'room-stage' ], { chat: false, options: { 'room-stage': { room } } } );

        const person = at( 'room-stage' ).querySelector( '.estream-person' ) as HTMLElement;
        expect( person.querySelector( 'img' )?.getAttribute( 'src' ) ).toBe( 'https://cdn.example/maya.png' );
        expect( person.querySelector( '.estream-person__name' )?.textContent ).toBe( 'Maya Lee' );
        // Its name once: not over the picture as well.
        expect( at( 'room-stage' ).querySelector( '.bm-info-name' ) ).toBeNull();

        fireEvent.error( person.querySelector( 'img' )! );
        expect( at( 'room-stage' ).querySelector( '.estream-person .estream-initials' )?.textContent ).toBe( 'ML' );

        update( { tiles: [ { ...voice, avatar: null } ] } );
        expect( at( 'room-stage' ).querySelector( '.estream-person .estream-initials' )?.textContent ).toBe( 'ML' );
    } );

    it( 'keeps a stream that stays on screen open while live: nothing for a viewer to close it with, until it ends', () => {
        const room = fakeRoom( true );
        room.locked.mockReturnValue( true );
        const { at, update } = show( live( { you: viewer } ), [ 'room-button', 'room-stage' ], { chat: false, options: { 'room-button': { room }, 'room-stage': { room } } } );

        expect( at( 'room-button' ).innerHTML ).toBe( '' );
        expect( within( at( 'room-stage' ) ).queryByRole( 'button', { name: 'Close the live stream' } ) ).toBeNull();

        update( { stream: { id: 's', state: 'ended', started_at: 1, ended_at: 2 } } );
        expect( within( at( 'room-stage' ) ).getByRole( 'button', { name: 'Close the live stream' } ) ).toBeTruthy();
    } );

    it( 'lets a host preview, go live and end from the call area, and keeps the conversation on screen while live', async () => {
        const room = fakeRoom( true );
        const { at, client, update } = show( { you: host }, [ 'room-stage' ], { chat: false, options: { 'room-stage': { room } } } );
        const stage = at( 'room-stage' );
        expect( within( stage ).getByText( 'Ready when you are' ) ).toBeTruthy();

        const go = within( stage ).getByRole( 'button', { name: 'Turn on your camera or microphone, or share your screen, to go live' } );
        expect( go.getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        // The screen alone, before going live: a preview of it, and Go live.
        await act( async () => { fireEvent.click( within( stage ).getByRole( 'button', { name: 'Share screen' } ) ); } );
        expect( client.setScreenShare ).toHaveBeenCalledWith( true );
        expect( within( stage ).getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'Preview: only you can see this' );
        expect( within( stage ).getByRole( 'button', { name: 'Go live' } ).getAttribute( 'aria-disabled' ) ).not.toBe( 'true' );
        await act( async () => { fireEvent.click( within( stage ).getByRole( 'button', { name: 'Stop sharing' } ) ); } );
        expect( within( stage ).getByText( 'Ready when you are' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( within( stage ).getByRole( 'button', { name: 'Turn camera on' } ) ); } );
        expect( client.setCamera ).toHaveBeenCalledWith( true );
        expect( within( stage ).getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'Preview: only you can see this' );
        // Everything off again, it says what to do again (the client has no preview then).
        await act( async () => { fireEvent.click( within( stage ).getByRole( 'button', { name: 'Turn camera off' } ) ); } );
        expect( within( stage ).getByText( 'Ready when you are' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( within( stage ).getByRole( 'button', { name: 'Turn camera on' } ) ); } );

        vi.useFakeTimers();
        fireEvent.click( within( stage ).getByRole( 'button', { name: 'Go live' } ) );
        act( () => { vi.advanceTimersByTime( 3000 ); } );
        expect( client.goLive ).toHaveBeenCalled();
        vi.useRealTimers();
        await act( async () => {} );

        client.sendingStats.mockImplementation( async () => ( { width: 1280, height: 720, fps: 30, kbps: 2400, limited: null, held: false, paused: false } as any ) );
        update( live( { you: host, devices: { camera: true, microphone: false }, sentHere: true, tiles: [], viewers: 3, tally: { peak: 7, messages: 0, reactions: 4 } } ) );
        expect( room.hold ).toHaveBeenLastCalledWith( true );
        // The admin studio's numbers, where a call keeps its own: the connection and how many watch, then the
        // statistics in the settings sheet.
        await act( async () => {} );
        const status = stage.querySelector( '.bm-group-call-controls-v2 > .bm-connection-control' ) as HTMLElement;
        expect( status.querySelector( '.bm-connection-quality.bm-quality-good' )?.textContent ).toBe( 'Good connection' );
        expect( within( status ).getByLabelText( '3 watching, peak 7' ) ).toBeTruthy();
        // The peak on the count itself, not only in its tooltip.
        expect( status.querySelector( '.estream-bm-watching__peak' )?.textContent ).toBe( '7' );
        fireEvent.click( within( stage ).getByRole( 'button', { name: 'Settings' } ) );
        const figures = () => [ ...stage.querySelectorAll( '.bm-call-settings .estream-bm-figures > div' ) ].map( ( row ) => row.querySelector( 'dt' )!.textContent + ': ' + row.querySelector( 'dd' )!.textContent );
        expect( figures() ).toEqual( [ 'Video: 720p · 30 fps · 2.4 Mbps', 'Watching at the peak: 7', 'Reactions: 4' ] );
        // Nobody has it on screen: the quality chosen, nothing of a pause, here or over the picture.
        client.sendingStats.mockImplementation( async () => ( { width: 0, height: 0, fps: 0, kbps: 0, limited: null, held: false, paused: true } as any ) );
        await act( async () => { await new Promise( ( r ) => setTimeout( r, 2100 ) ); } );
        expect( figures()[0] ).toBe( 'Video: 720p' );
        expect( stage.textContent ).not.toMatch( /paus/i );
        expect( stage.querySelector( '.bm-group-call-status' ) ).toBeNull();
        fireEvent.click( within( stage ).getByRole( 'button', { name: 'Settings' } ) );
        // Live from here, it ends; it doesn't close.
        expect( within( stage ).queryByRole( 'button', { name: 'Close the live stream' } ) ).toBeNull();
        expect( within( stage ).getByRole( 'button', { name: 'Share screen' } ) ).toBeTruthy();
        fireEvent.click( within( stage ).getByRole( 'button', { name: 'End stream' } ) );
        expect( await screen.findByRole( 'dialog', { name: 'End the stream for everyone?' } ) ).toBeTruthy();
    } );
} );

describe( 'the stream in one piece beside a Studio block', () => {
    it( 'leaves going live to the Studio part, whose 3, 2, 1 shows over the stream\'s own picture, and names no other studio', async () => {
        const { at } = show( { you: host, devices: { camera: true, microphone: true } }, [ 'all', 'studio' ], { studioUrl: 'https://site.example/wp-admin/admin.php?page=wordplus-stream#/studio/12' } );

        expect( screen.queryByText( 'You host this stream.' ) ).toBeNull();
        expect( at( 'all' ).querySelector( '.estream-studio' ) ).toBeNull();
        expect( within( at( 'studio' ) ).getByRole( 'button', { name: 'Go live' } ) ).toBeTruthy();

        vi.useFakeTimers();
        fireEvent.click( within( at( 'studio' ) ).getByRole( 'button', { name: 'Go live' } ) );
        expect( at( 'all' ).querySelector( '.estream-going__number' )?.textContent ).toBe( '3' );
        act( () => { vi.advanceTimersByTime( 3000 ); } );
        expect( at( 'all' ).querySelector( '.estream-going' ) ).toBeNull();
    } );

    it( 'asks a viewer invited on stage once', () => {
        show( live( { you: { identity: 'u:7', role: 'viewer', name: 'Ann', chat: 'write', mod: false }, invited: true } ), [ 'all', 'studio' ] );
        expect( screen.getAllByRole( 'dialog', { name: 'The host invites you on stage' } ) ).toHaveLength( 1 );
    } );
} );

describe( 'a stream\'s parts placed apart', () => {
    it( 'shows each part in its own place, from one client', () => {
        const { at, client } = show( live(), [ 'player', 'chat', 'details', 'studio' ] );

        expect( at( 'player' ).querySelector( '.estream-part--player .estream-stage' ) ).toBeTruthy();
        expect( at( 'player' ).querySelector( '.estream-chat' ) ).toBeNull();
        expect( within( at( 'chat' ) ).getByText( 'Hello there' ) ).toBeTruthy();
        expect( within( at( 'details' ) ).getByText( 'Friday Q&A' ) ).toBeTruthy();
        // A viewer sees no studio at all.
        expect( at( 'studio' ).innerHTML ).toBe( '' );
        // Each part wears the site's theme of its own.
        for( const name of [ 'player', 'chat', 'details' ] ) expect( at( name ).querySelector( '.estream-part--' + name )!.className ).toContain( 'estream-theme wp-exclude-emoji estream-theme--light' );
        expect( client.start ).not.toHaveBeenCalled();
    } );

    it( 'gives a host the studio part, and where there is none, the way to the admin studio', () => {
        const withStudio = show( { you: host }, [ 'player', 'studio' ], { studioUrl: 'https://site.example/wp-admin/admin.php?page=wordplus-stream-studio&stream=12' } );
        expect( within( withStudio.at( 'studio' ) ).getByText( 'Turn on camera and microphone' ) ).toBeTruthy();
        expect( screen.queryByText( 'Go live in the studio' ) ).toBeNull();
        expect( within( withStudio.at( 'studio' ) ).getByText( 'Open the full studio' ).getAttribute( 'href' ) ).toContain( 'wordplus-stream-studio' );
        cleanup();
        document.body.innerHTML = '';

        const without = show( { you: host }, [ 'player', 'chat' ], { studioUrl: 'https://site.example/wp-admin/admin.php?page=wordplus-stream-studio&stream=12' } );
        const link = within( without.at( 'player' ) ).getByText( 'Go live in the studio' );
        expect( link.getAttribute( 'href' ) ).toBe( 'https://site.example/wp-admin/admin.php?page=wordplus-stream-studio&stream=12' );
        expect( within( without.at( 'player' ) ).getByText( 'You host this stream.' ) ).toBeTruthy();

        // Live: back to the studio.
        without.update( live( { you: host } ) );
        expect( within( without.at( 'player' ) ).getByText( 'Open the studio' ) ).toBeTruthy();
        cleanup();
        document.body.innerHTML = '';

        // Before the cloud has said who this is, from the page's word alone, so nothing moves the player down later;
        // gone if the cloud says otherwise.
        const early = show( { you: null }, [ 'player', 'chat' ], { studioUrl: 'https://site.example/wp-admin/admin.php?page=wordplus-stream-studio&stream=12' } );
        expect( within( early.at( 'player' ) ).getByText( 'You host this stream.' ) ).toBeTruthy();
        early.update( { you: { ...host, role: 'viewer' } } );
        expect( screen.queryByText( 'You host this stream.' ) ).toBeNull();
    } );

    it( 'says nothing of the studio to a viewer, nor to a host where the site has no studio for them', () => {
        show( live(), [ 'player' ], { studioUrl: 'https://site.example/studio' } );
        expect( screen.queryByText( 'Go live in the studio' ) ).toBeNull();
        expect( screen.queryByText( 'Open the studio' ) ).toBeNull();
        cleanup();
        document.body.innerHTML = '';

        show( { you: host }, [ 'player' ] );
        expect( screen.queryByText( 'You host this stream.' ) ).toBeNull();
    } );

    it( 'keeps the chat a part of its own, which the player hides and shows on the page, and gives the player one in full screen', async () => {
        ( document as any ).fullscreenEnabled = true;
        const { at } = show( live(), [ 'player', 'chat' ] );
        const player = at( 'player' );

        // On the page, the chat's own part, wherever it is: its place unseen while hidden, which hides its block too.
        fireEvent.click( within( player ).getByLabelText( 'Hide chat' ) );
        expect( at( 'chat' ).hasAttribute( 'data-estream-chat-hidden' ) ).toBe( true );
        expect( within( at( 'chat' ) ).getByText( 'Hello there' ), 'kept on the page' ).toBeTruthy();
        fireEvent.click( within( player ).getByLabelText( 'Show chat' ) );
        expect( at( 'chat' ).hasAttribute( 'data-estream-chat-hidden' ) ).toBe( false );

        // The player's root goes full screen: its chat comes beside the picture, and may hide.
        const root = player.querySelector( '.estream-part--player' )!;
        ( document as any ).fullscreenElement = root;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        expect( root.className ).toContain( 'estream-theme--full' );
        expect( within( player ).getByText( 'Hello there' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( within( player ).getByLabelText( 'Hide chat' ) ); } );
        expect( within( player ).queryByText( 'Hello there' ) ).toBeNull();
        // The chat's own part stays as it was.
        expect( within( at( 'chat' ) ).getByText( 'Hello there' ) ).toBeTruthy();
    } );

    it( 'puts a confirmation on the page\'s layer, or in the player while it is full screen', async () => {
        ( document as any ).fullscreenEnabled = true;
        const { at, dialogs, client } = show( live( { you: host, devices: { camera: true, microphone: true }, tiles: [ { ...hostTile( 'u:1.f00dcafe' ), local: true } ] } ), [ 'player', 'studio' ] );

        await act( async () => { fireEvent.click( within( at( 'studio' ) ).getByText( 'End stream' ) ); } );
        const dialog = within( dialogs ).getByRole( 'dialog', { name: 'End the stream for everyone?' } );
        expect( dialog.closest( '.estream-theme' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( within( dialogs ).getByText( 'Cancel' ) ); } );
        expect( client.end ).not.toHaveBeenCalled();

        const root = at( 'player' ).querySelector( '.estream-part--player' )!;
        ( document as any ).fullscreenElement = root;
        await act( async () => { document.dispatchEvent( new Event( 'fullscreenchange' ) ); } );
        await act( async () => { fireEvent.click( within( at( 'studio' ) ).getByText( 'End stream' ) ); } );
        expect( within( root as HTMLElement ).getByRole( 'dialog' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( within( root as HTMLElement ).getByText( 'End for everyone' ) ); } );
        expect( client.end ).toHaveBeenCalled();
    } );

    it( 'makes the chat as tall as the player beside it, its own height under it, or the height chosen', async () => {
        const rect = ( r : Partial<DOMRect> ) => ( { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON(){}, ...r } ) as DOMRect;
        let chatLeft = 640;
        vi.spyOn( HTMLElement.prototype, 'getBoundingClientRect' ).mockImplementation( function ( this : HTMLElement ){
            if( this.classList.contains( 'estream-part-place' ) ) return rect( { left: 0, right: 620, top: 0, bottom: 420, width: 620, height: 420 } );
            if( this.classList.contains( 'estream-part--chat' ) ) return rect( { left: chatLeft, right: chatLeft + 300, top: 0, bottom: 300, width: 300, height: 300 } );
            return rect( {} );
        } );

        const { at, rendered, parts, dialogs, asClient } = show( live(), [ 'player', 'chat' ] );
        const chat = () => at( 'chat' ).querySelector( '.estream-part--chat' ) as HTMLElement;
        expect( chat().style.height ).toBe( '420px' );

        // Under the player (a phone's columns): the site's chat height.
        chatLeft = 0;
        await act( async () => { window.dispatchEvent( new Event( 'resize' ) ); } );
        expect( chat().style.height ).toBe( '' );

        // A height of its own.
        const sized = parts.map( ( p ) => p.name === 'chat' ? { ...p, options: { height: 640 } } : p );
        rendered.rerender( <EasyStreamParts client={ asClient } parts={ sized } dialogs={ dialogs } manage={ false } /> );
        expect( chat().style.height ).toBe( '640px' );
    } );

    it( 'leaves the chat out for a stream without one', () => {
        const { at } = show( live(), [ 'player', 'chat' ], { chat: false } );
        expect( at( 'chat' ).innerHTML ).toBe( '' );
    } );

    it( 'shows of the stream\'s details what the block chose', () => {
        const { at } = show( live(), [ 'details' ], { options: { details: { show: { title: false, actions: false } } } } );
        expect( within( at( 'details' ) ).queryByText( 'Friday Q&A' ) ).toBeNull();
        expect( within( at( 'details' ) ).getByText( '12 watching' ) ).toBeTruthy();
        expect( within( at( 'details' ) ).queryByText( 'Share' ) ).toBeNull();
    } );

    it( 'keeps the picture at the top of a phone\'s screen while live, once the page scrolls past the player, holding its place', async () => {
        let seen : ( ( entries : Array<Partial<IntersectionObserverEntry>> ) => void ) | null = null;
        vi.stubGlobal( 'IntersectionObserver', class {
            constructor( callback : ( entries : Array<Partial<IntersectionObserverEntry>> ) => void ){ seen = callback; }
            observe(){}
            disconnect(){}
        } );
        vi.stubGlobal( 'matchMedia', ( query : string ) => ( { matches: query.includes( 'max-width' ), addEventListener(){}, removeEventListener(){} } ) );

        const { at } = show( live(), [ 'player' ], { options: { player: { sticky: true } } } );
        const root = () => at( 'player' ).querySelector( '.estream-part--player' )!;
        const place = () => at( 'player' ).querySelector( '.estream-part-place' ) as HTMLElement;
        expect( seen ).not.toBeNull();

        await act( async () => { seen!( [ { isIntersecting: false, boundingClientRect: { top: -400, height: 380 } as DOMRect } ] ); } );
        expect( root().className ).toContain( 'estream-part--floating' );
        expect( place().style.height ).toBe( '380px' );

        // Back in its place as the page scrolls up to it.
        await act( async () => { seen!( [ { isIntersecting: true, boundingClientRect: { top: 10, height: 380 } as DOMRect } ] ); } );
        expect( root().className ).not.toContain( 'estream-part--floating' );
        expect( place().style.height ).toBe( '' );
    } );

    it( 'gives the player a shape of its own', () => {
        const { at } = show( live(), [ 'player', 'details' ], { options: { player: { appearance: { shape: '9:16' } } } } );
        expect( at( 'player' ).querySelector( '.estream-part--player' )!.className ).toContain( 'estream-theme--upright' );
        expect( at( 'details' ).querySelector( '.estream-part--details' )!.className ).not.toContain( 'estream-theme--upright' );
    } );

    it( 'shows a host live from another window the stream as everyone sees it, letting them end it but send nothing', async () => {
        const { at } = show( live( { you: host, elsewhere: true } ), [ 'player', 'studio' ] );
        const studio = within( at( 'studio' ) );

        expect( studio.getByText( /You are live from another window/ ) ).toBeTruthy();
        expect( studio.queryByText( 'Share screen' ) ).toBeNull();
        expect( studio.queryByRole( 'button', { name: /microphone/i } ) ).toBeNull();
        expect( studio.getByText( 'End stream' ) ).toBeTruthy();

        // Leaving this page takes nothing off the stream.
        const leaving = new Event( 'beforeunload', { cancelable: true } );
        window.dispatchEvent( leaving );
        expect( leaving.defaultPrevented ).toBe( false );
    } );
} );

describe( 'the studio page', () => {
    const options = { 'studio-page': { page: { back: 'https://site.example/wp-admin/admin.php?page=wordplus-stream-studio', page: '', createPage: 'https://site.example/wp-json/easy-stream/v1/admin/streams/12/page', nonce: 'n0nce', settings: 'https://site.example/settings' } } };

    it( 'lays the studio out for a window: the picture, the controls, and the chat and the stream in tabs, with no Guests tab unless the stream takes guests', async () => {
        const { at } = show( { you: host }, [ 'studio-page' ], { options } );
        expect( within( at( 'studio-page' ) ).getAllByRole( 'tab' ).map( ( t ) => t.textContent ) ).toEqual( [ 'Chat', 'Stream' ] );
        cleanup();
        document.body.innerHTML = '';

        show( { you: host }, [ 'studio-page' ], { options, guests: true } );
        const studio = within( screen.getByRole( 'heading', { name: 'Friday Q&A' } ).closest( '.estream-part' ) as HTMLElement );

        expect( studio.getByRole( 'heading', { name: 'Friday Q&A' } ) ).toBeTruthy();
        expect( studio.getByLabelText( 'Back to your streams' ).getAttribute( 'href' ) ).toBe( options['studio-page'].page.back );
        expect( studio.getByText( 'Turn on camera and microphone' ) ).toBeTruthy();
        expect( studio.getAllByRole( 'tab' ).map( ( t ) => t.textContent ) ).toEqual( [ 'Chat', 'Guests', 'Stream' ] );
        expect( studio.getByRole( 'tab', { name: 'Chat' } ).getAttribute( 'aria-selected' ) ).toBe( 'true' );
        expect( studio.getByText( 'No messages yet' ) ).toBeTruthy();

        fireEvent.click( studio.getByRole( 'tab', { name: 'Guests' } ) );
        expect( studio.getByText( /Once you are live, viewers can ask to join you on stage/ ) ).toBeTruthy();
    } );

    it( 'sets up a host\'s preview on a site the cloud doesn\'t take yet, with no chat, OBS or going live, and offers to connect the site', async () => {
        const connect = 'https://site.example/wp-admin/admin.php?page=wordplus-stream-licence';
        const unconnected = { status: 'unconnected' as const, error: 'not_licensed', you: { ...host, identity: 'local' }, stream: null };
        const { at, client } = show( unconnected, [ 'studio-page' ], { options, connectUrl: connect } );
        const part = at( 'studio-page' );
        const studio = within( part );

        expect( studio.getByText( 'Not connected to WordPlus Cloud yet' ) ).toBeTruthy();
        expect( studio.getByText( 'Try your camera, microphone and screen below. Only you see the preview.' ) ).toBeTruthy();
        expect( studio.getByRole( 'link', { name: 'Connect to go live' } ).getAttribute( 'href' ) ).toBe( connect );
        // No chat to reach, nor OBS to send to: both are the cloud's.
        expect( studio.getAllByRole( 'tab' ).map( ( t ) => t.textContent ) ).toEqual( [ 'Stream' ] );
        expect( studio.queryByText( 'Stream from OBS' ) ).toBeNull();

        await act( async () => { fireEvent.click( studio.getByText( 'Turn on camera and microphone' ) ); } );
        expect( client.startPreview ).toHaveBeenCalled();
        // The bar: the devices, and Connect to go live where Go live is.
        expect( studio.getByRole( 'button', { name: 'Camera' } ) ).toBeTruthy();
        expect( studio.queryByRole( 'button', { name: /Go live/ } ) ).toBeNull();
        expect( part.querySelector( '.estream-studio__bar a.estream-studio__go' )?.getAttribute( 'href' ) ).toBe( connect );
        expect( studio.queryByText( 'Stream from OBS' ) ).toBeNull();
        expect( client.goLive ).not.toHaveBeenCalled();
        cleanup();
        document.body.innerHTML = '';

        // A host who may not change the licence: Go live there, and off.
        const other = show( { ...unconnected, devices: { camera: true, microphone: true } }, [ 'studio-page' ], { options } );
        const go = other.at( 'studio-page' ).querySelector( '.estream-studio__go' ) as HTMLButtonElement;
        expect( [ go.tagName, go.disabled, go.textContent ] ).toEqual( [ 'BUTTON', true, 'Go live' ] );
        expect( go.getAttribute( 'data-estream-tip' ) ).toBe( 'Going live needs the site connected to WordPlus Cloud.' );
        expect( within( other.at( 'studio-page' ) ).queryByRole( 'link', { name: 'Connect to go live' } ) ).toBeNull();
        cleanup();
        document.body.innerHTML = '';

        // The player on the stream's page says it too, without the studio's words.
        const player = show( unconnected, [ 'player' ], { connectUrl: connect } );
        expect( within( player.at( 'player' ) ).getByText( 'Going live needs the site connected to WordPlus Cloud.' ) ).toBeTruthy();
        expect( within( player.at( 'player' ) ).queryByText( /Try your camera/ ) ).toBeNull();
    } );

    it( 'makes a page for a stream nobody can watch yet, and offers its link to share', async () => {
        const fetch = vi.fn( async () => ( { ok: true, json: async () => ( { url: 'https://site.example/friday-qa/' } ) } ) );
        vi.stubGlobal( 'fetch', fetch );
        const { at } = show( { you: host }, [ 'studio-page' ], { options } );
        const studio = within( at( 'studio-page' ) );

        fireEvent.click( studio.getByRole( 'tab', { name: 'Stream' } ) );
        expect( studio.getByText( 'No page shows this stream yet, so nobody can watch it.' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( studio.getByText( 'Create a page for this stream' ) ); } );

        expect( fetch ).toHaveBeenCalledWith( options['studio-page'].page.createPage, expect.objectContaining( { method: 'POST', headers: { 'X-WP-Nonce': 'n0nce' } } ) );
        expect( ( studio.getByLabelText( 'Link to share' ) as HTMLInputElement ).value ).toBe( 'https://site.example/friday-qa/' );
        expect( studio.getByText( 'View page' ).closest( 'a' )!.getAttribute( 'href' ) ).toBe( 'https://site.example/friday-qa/' );
        expect( studio.getByText( 'Stream settings' ).closest( 'a' )!.getAttribute( 'href' ) ).toBe( 'https://site.example/settings' );
    } );

    it( 'shows the statistics above the controls while live: time on air, viewers and their peak, messages, reactions, how the picture goes out', async () => {
        const { at } = show( live( { you: host, devices: { camera: true, microphone: true }, viewers: 87, tally: { peak: 112, messages: 23, reactions: 140 } } ), [ 'studio-page' ], {
            options,
            before: ( client ) => client.sendingStats.mockResolvedValue( { width: 1280, height: 720, fps: 30, kbps: 2400, limited: null } as any )
        } );
        const stats = within( at( 'studio-page' ) ).getByRole( 'group', { name: 'Statistics' } );

        expect( stats.textContent ).toMatch( /Live\s*1:0\d/ );
        expect( stats.textContent ).toContain( '87 watching' );
        expect( stats.textContent ).toContain( 'Peak 112' );
        expect( stats.textContent ).toContain( '23 messages' );
        expect( stats.textContent ).toContain( '140 reactions' );
        await waitFor( () => expect( stats.textContent ).toContain( '720p · 30 fps · 2.4 Mbps' ) );
        expect( stats.textContent ).toContain( 'Good connection' );
        // Above the controls, inside the card the bar is in.
        expect( stats.closest( '.estream-studio-page__controls' ) ).toBeTruthy();
        expect( within( at( 'studio-page' ) ).getByText( /^Live since / ) ).toBeTruthy();
    } );

    it( 'says while live that OBS stopped sending, and when the stream ends by itself unless it comes back', async () => {
        const lost = new Date( 2026, 9, 21, 14, 2 ).getTime();
        const time = ( at : number ) => new Intl.DateTimeFormat( undefined, { timeStyle: 'short' } ).format( at );
        const { at, update } = show( live( { you: host } ), [ 'studio-page' ], { options } );
        const studio = within( at( 'studio-page' ) );
        expect( studio.queryByText( /OBS stopped sending/ ) ).toBeNull();

        update( { stream: { id: 's', state: 'live', started_at: lost - 600_000, ended_at: null, encoder_lost_at: lost } } );
        const said = studio.getByText( /OBS stopped sending/ );
        expect( said.textContent ).toBe( 'OBS stopped sending at ' + time( lost ) + '. Unless it comes back, the stream ends by itself at ' + time( lost + 300_000 ) + '.' );
        expect( said.closest( '.estream-studio-page__controls' ) ).toBeTruthy();

        // Back: said no more.
        update( { stream: { id: 's', state: 'live', started_at: lost - 600_000, ended_at: null } } );
        expect( studio.queryByText( /OBS stopped sending/ ) ).toBeNull();
    } );

    it( 'counts those asking to join on the Guests tab while live, and tells someone who isn\'t a host', () => {
        const { at, update } = show( live( { you: host, hands: [ { identity: 'u:4', name: 'Jordan', at: Date.now() - 60_000 } ] } ), [ 'studio-page' ], { options, guests: true } );
        expect( within( at( 'studio-page' ) ).getByRole( 'tab', { name: 'Guests 1' } ) ).toBeTruthy();

        // Ended: the hands left over are no one's to invite, and the tab counts none.
        update( { stream: { id: 's', state: 'ended', started_at: 1, ended_at: 2 } } );
        expect( within( at( 'studio-page' ) ).getByRole( 'tab', { name: 'Guests' } ) ).toBeTruthy();
        cleanup();
        document.body.innerHTML = '';

        show( {}, [ 'studio-page' ], { options } );
        expect( screen.getByText( 'Only the hosts of the stream can go live from here.' ) ).toBeTruthy();
    } );
} );
