import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, PersonPanel, type CallParticipant } from '../src/calls.ts';
import { CallContext } from '../src/components/calls/context.ts';
import GroupVideoGridItem from '../src/components/calls/group-video-grid-item.tsx';
import { PAUSED_NOTICE_MS } from '../src/inc/hooks/held.ts';
import { OPTIMIZING_FADE_MS, OPTIMIZING_MAX_MS } from '../src/components/calls/optimizing.tsx';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann', avatar: 'https://example.com/ann.png' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
} );

afterEach( cleanup );

const wrapped = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' | 'group-audio' ) =>
    render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );

describe( 'the private call', () => {
    it( 'rings out with the other side\'s face, says so, and cancels', () => {
        const call = fakeCall( { action: 'outgoing_call' } );
        const { container } = wrapped( call, 'private' );

        expect( container.querySelector( '.wplus-call-wrap .wplus-private-call' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-placeholder-outgoing-text' )?.textContent ).toBe( 'Calling...' );
        expect( container.querySelector<HTMLImageElement>( '.wplus-call-animation img.avatar-100' )?.src ).toBe( 'https://example.com/ann.png' );

        fireEvent.click( container.querySelector( '.wplus-cancel' )! );
        expect( call.calls ).toEqual( [ 'endCall "abort"' ] );
    } );

    it( 'rings in with Answer and Reject', () => {
        const call = fakeCall( { action: 'incoming_call' } );
        const { container } = wrapped( call, 'private' );

        expect( container.querySelector( '.wplus-placeholder-incoming-text' )?.textContent ).toBe( 'Incoming Call' );
        fireEvent.click( container.querySelector( '.wplus-answer' )! );
        fireEvent.click( container.querySelector( '.wplus-cancel' )! );
        expect( call.calls ).toEqual( [ 'answerCall', 'endCall "reject"' ] );
    } );

    it( 'shows the call\'s time, the other side\'s picture attached, and its controls', () => {
        const video = fakeTrack();
        const peer = participant( 'user_34', { video, audio: fakeTrack() } );
        const call = fakeCall( {
            participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', peer ] ] ),
            myMicrophoneTrack: fakeTrack(),
        } );
        const { container } = wrapped( call, 'private' );

        expect( container.querySelector( 'video.video1' ) ).not.toBeNull();
        expect( video.attached ).toContain( container.querySelector( 'video.video1' ) );
        expect( container.querySelector( '.wplus-disable-mic' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-enable-video' ) ).not.toBeNull();

        fireEvent.click( container.querySelector( '.wplus-disable-mic' )! );
        fireEvent.click( container.querySelector( '.wplus-cancel' )! );
        expect( call.calls ).toEqual( [ 'disableMic', 'endCall' ] );
    } );

    it( 'says when the other side\'s microphone is off, and the time while there is no picture', () => {
        const call = fakeCall( {
            participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { micMuted: true } ) ] ] ),
        } );
        const { container } = wrapped( call, 'private' );

        expect( container.querySelector( '.wplus-timer' )?.textContent ).toBe( '01:05' );
        expect( container.querySelector( '.wplus-placeholder-no-source-message' )?.textContent ).toContain( 'The microphone and camera not enabled at the other side' );
    } );

    it( 'swaps the icons where the host asks it to', () => {
        const { container } = wrapped( fakeCall( { iconsReverted: true, myMicrophoneTrack: fakeTrack() } ), 'private' );
        expect( container.querySelector( '.wplus-disable-mic svg' ) ).not.toBeNull();
    } );
} );

describe( 'the group calls', () => {
    const three = () => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
        [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack(), isSpeaking: true, audioLevel: 0.4 } ) ],
        [ 'user_43', participant( 'user_43' ) ],
    ] );

    it( 'draw a video tile each, a speaker ringed in the accent colour, and the dock', () => {
        const { container } = wrapped( fakeCall( { participants: three() } ), 'group-video' );

        expect( container.querySelector( '.wplus-call-wrap.wplus-call-wrap-group .wplus-group-call-container' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-group-call-controls-buttons .wplus-exit-room' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-connection-status, .wplus-group-call-controls-v2' ) ).not.toBeNull();
    } );

    it( 'draw an audio row each, with names from the host', async () => {
        const { container } = wrapped( fakeCall( { participants: three() } ), 'group-audio' );
        await act( async () => {} );

        const rows = [ ...container.querySelectorAll( '.wplus-group-call-input-audio' ) ];
        expect( rows.map( ( row ) => row.getAttribute( 'data-key' ) ).sort() ).toEqual( [ 'me', 'user_34', 'user_43' ] );
        expect( container.querySelector( '[data-key="user_34"] .wplus-uname' )?.textContent ).toBe( 'Ann' );
        expect( container.querySelector( '[data-key="me"] .wplus-uname' )?.textContent ).toBe( 'Ben' );
        expect( ( container.querySelector( '[data-key="user_34"] .wplus-group-call-input-audio-inner' ) as HTMLElement ).style.boxShadow ).toContain( 'rgba(33,117,155' );
    } );

    it( 'let a moderator mute everyone, lock the room and remove someone, through the call\'s moderate()', async () => {
        const call = fakeCall( { participants: three(), adminMode: true } );
        const { container } = wrapped( call, 'group-audio' );
        await act( async () => {} );

        // The room's rules are in Host Controls' panel, spelled out.
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        const room = container.querySelector( '.wplus-call-moderation-room' )!;
        expect( [ ...room.querySelectorAll( '.wplus-call-moderation-label' ) ].map( ( l ) => l.textContent ) ).toEqual( [ 'Mute Everyone', 'Lock Room', 'Broadcast Mode', 'Sound for Raised Hands', 'Join Alerts' ] );
        expect( room.querySelector( '.wplus-room-mute' )?.getAttribute( 'aria-checked' ) ).toBe( 'false' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-mute' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-lock' )! ); } );

        // A person's actions, from the ⋯ on their row.
        await act( async () => { fireEvent.click( container.querySelector( '[data-key="user_43"] .wplus-manage-participant' )! ); } );
        const person = container.querySelector( '.wplus-call-moderation-person' )!;
        expect( person.querySelector( '.wplus-call-moderation-title' )?.textContent ).toBe( 'User user_43' );
        expect( [ ...person.querySelectorAll( '.wplus-call-moderation-label' ) ].map( ( l ) => l.textContent ) ).toEqual( [ 'Mute Microphone', 'Demote to Viewer', 'Remove from Call' ] );
        expect( container.querySelector( '[data-key="user_43"] .wplus-moderating' ) ).not.toBeNull();
        await act( async () => { fireEvent.click( person.querySelector( '.wplus-remove-participant' )! ); } );

        expect( call.calls ).toEqual( [
            // Everyone's microphone but the moderator's own, by whose it is.
            'moderate {"act":"mute_all","type":"video","identities":["user_34","user_43"]}',
            'moderate {"act":"lock_room","type":"video"}',
            'moderate {"act":"remove_participant","identity":"user_43","type":"audio"}',
        ] );
    } );

    it( 'say a microphone a moderator muted: locked on the tile and on the muted person\'s own dock', async () => {
        const participants = three();
        participants.set( 'user_43', participant( 'user_43', { micMuted: true } ) );
        const host = wrapped( fakeCall( { participants, adminMode: true, roomMuted: true } ), 'group-audio' );
        await act( async () => {} );

        expect( host.container.querySelector( '[data-key="user_43"] .wplus-mic-locked-chip' )?.getAttribute( 'aria-label' ) ).toBe( 'Muted by a moderator' );
        expect( host.container.querySelector( '[data-key="user_34"] .wplus-mic-locked-chip' ) ).toBeNull();
        // Everyone muted shows on Host Controls, and its switch is on.
        expect( host.container.querySelector( '.wplus-host-controls' )?.getAttribute( 'data-ruled' ) ).toBe( '1' );
        await act( async () => { fireEvent.click( host.container.querySelector( '.wplus-host-controls' )! ); } );
        expect( host.container.querySelector( '.wplus-room-mute' )?.getAttribute( 'aria-checked' ) ).toBe( 'true' );
        await act( async () => { fireEvent.click( host.container.querySelector( '[data-key="user_43"] .wplus-manage-participant' )! ); } );
        expect( host.container.querySelector( '.wplus-call-moderation-state' )?.textContent ).toBe( 'Muted by a moderator' );
        expect( host.container.querySelector( '.wplus-allow-unmute' )?.getAttribute( 'aria-label' ) ).toBe( 'Allow Microphone' );
        host.unmount();

        const muted = wrapped( fakeCall( { participants: three(), myMicMuted: true } ), 'group-video' );
        expect( muted.container.querySelector( '.wplus-enable-mic, .wplus-disable-mic' ) ).toBeNull();
        expect( muted.container.querySelector( '.wplus-mic-locked' )?.getAttribute( 'aria-label' ) ).toBe( 'A moderator muted your microphone.' );
        await act( async () => { fireEvent.click( muted.container.querySelector( '.wplus-mic-locked' )! ); } );
        expect( muted.container.querySelector( '.wplus-group-call-status' )?.textContent ).toBe( 'A moderator muted your microphone.' );
    } );

    it( 'say on a video call what stopping someone does: their camera and microphone, and let back on', async () => {
        // The person's menu itself: the video grid lays its tiles out by its measured size, which the test's page hasn't.
        const labels = ( participants: Map<string, CallParticipant>, type: 'audio' | 'video' ) => {
            const call = fakeCall( { participants, adminMode: true } );
            const { container, unmount } = render( <CallContext.Provider value={ call }>
                <PersonPanel stage={ createRef<HTMLElement>() } tileKey="user_43" type={ type } close={ () => {} } />
            </CallContext.Provider> );
            const found = [ ...container.querySelectorAll( '.wplus-call-moderation-row' ) ].map( ( row ) => row.getAttribute( 'aria-label' ) );
            unmount();
            return found;
        };
        const blocked = three();
        blocked.set( 'user_43', participant( 'user_43', { canPublish: false } ) );

        expect( labels( three(), 'video' ) ).toEqual( [ 'Pin Participant', 'Mute Microphone', 'Stop Camera & Mic', 'Remove from Call' ] );
        expect( labels( blocked, 'video' ) ).toEqual( [ 'Pin Participant', 'Allow Camera & Mic', 'Remove from Call' ] );
        // An audio call has no camera to name.
        expect( labels( three(), 'audio' ) ).toEqual( [ 'Mute Microphone', 'Demote to Viewer', 'Remove from Call' ] );
    } );

    it( 'spin a moderator\'s control while its request is out, and turn a second click away', async () => {
        let answer: ( value: unknown ) => void = () => {};
        const asked: unknown[] = [];
        const call = fakeCall( { participants: three(), adminMode: true, moderate: ( request ) => ( asked.push( request ), new Promise( ( resolve ) => { answer = resolve; } ) ) } );
        const { container } = wrapped( call, 'group-video' );
        await act( async () => {} );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-mute' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-mute' )! ); } );
        expect( asked ).toHaveLength( 1 );
        expect( container.querySelector( '.wplus-room-mute' )?.getAttribute( 'data-busy' ) ).toBe( '1' );
        expect( container.querySelector( '.wplus-room-mute .wplus-svg-animate' ) ).not.toBeNull();

        await act( async () => { answer( true ); } );
        expect( container.querySelector( '.wplus-room-mute' )?.getAttribute( 'data-busy' ) ).toBeNull();
    } );

    it( 'offer Show Chat and Hide Chat in the dock only where the call has a chat beside it', async () => {
        const { container, unmount } = wrapped( fakeCall( { participants: three() } ), 'group-video' );
        expect( container.querySelector( '.wplus-toggle-chat' ) ).toBeNull();
        unmount();

        const toggled: unknown[] = [];
        const call = fakeCall( { participants: three(), chatShown: true, chatToggle: ( next ) => void toggled.push( typeof next === 'function' ? next( true ) : next ) } );
        const shown = wrapped( call, 'group-video' ).container;
        expect( shown.querySelector( '.wplus-toggle-chat' )?.getAttribute( 'data-active' ) ).toBe( '1' );
        fireEvent.click( shown.querySelector( '.wplus-toggle-chat' )! );
        expect( toggled ).toEqual( [ false ] );
    } );

    it( 'expand to the browser window first, from there to the whole screen, and collapse back', async () => {
        const asked: string[] = [];
        const call = fakeCall( {
            participants: three(), fullScreenAvailable: true,
            enableFullScreen: () => void asked.push( 'screen' ), disableFullScreen: () => void asked.push( 'leave screen' ),
            chatShown: true, chatToggle: () => {},
        } );
        const { container, rerender } = wrapped( call, 'group-video' );
        const wrap = () => container.querySelector( '.wplus-call-wrap' )!;

        // On the page: Expand, and the chat beside the call can be shown and hidden.
        expect( container.querySelector( '.wplus-fs-enable' )?.getAttribute( 'aria-label' ) ).toBe( 'Expand' );
        expect( container.querySelector( '.wplus-toggle-chat' ) ).not.toBeNull();
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-fs-enable' )! ); } );

        // Filling the window: the page under it held still, the chat out of reach, Collapse and Full Screen.
        expect( wrap().classList.contains( 'wplus-call-wrap--window' ) ).toBe( true );
        expect( document.documentElement.classList.contains( 'wplus-call-windowed' ) ).toBe( true );
        expect( container.querySelector( '.wplus-toggle-chat' ) ).toBeNull();
        expect( container.querySelector( '.wplus-fs-collapse' )?.getAttribute( 'aria-label' ) ).toBe( 'Collapse' );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-fs-screen' )! ); } );
        expect( asked ).toEqual( [ 'screen' ] );

        // The whole screen: one way out, which leaves the window too.
        rerender( <CallScreen call={ { ...call, fullScreenEnabled: true, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        expect( container.querySelectorAll( '.wplus-fs-collapse, .wplus-fs-screen, .wplus-fs-enable' ) ).toHaveLength( 0 );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-fs-disable' )! ); } );
        expect( asked ).toEqual( [ 'screen', 'leave screen' ] );
        rerender( <CallScreen call={ { ...call, fullScreenEnabled: false, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        expect( wrap().classList.contains( 'wplus-call-wrap--window' ) ).toBe( false );
        expect( document.documentElement.classList.contains( 'wplus-call-windowed' ) ).toBe( false );

        // Escape in a dialog the app draws over the call is the dialog's, and anywhere else collapses the call.
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-fs-enable' )! ); } );
        const dialog = document.createElement( 'div' );
        dialog.setAttribute( 'role', 'alertdialog' );
        dialog.innerHTML = '<button>Cancel</button>';
        wrap().appendChild( dialog );
        await act( async () => { fireEvent.keyDown( dialog.querySelector( 'button' )!, { key: 'Escape' } ); } );
        expect( wrap().classList.contains( 'wplus-call-wrap--window' ) ).toBe( true );
        dialog.remove();
        await act( async () => { fireEvent.keyDown( document, { key: 'Escape' } ); } );
        expect( wrap().classList.contains( 'wplus-call-wrap--window' ) ).toBe( false );
    } );

    it( 'name everyone on their tile, over their picture too', () => {
        const { container } = render( <CallContext.Provider value={ fakeCall() }>
            <GroupVideoGridItem unique_key="user_34" participant={ participant( 'user_34', { video: fakeTrack() } ) } width={ 50 } height={ 50 } x={ 0 } y={ 0 } />
        </CallContext.Provider> );
        expect( container.querySelector( '.wplus-group-call-input-video-inner-info .wplus-caller-name' )?.textContent ).toBe( 'Ann' );
    } );

    it( 'keep a tile through its reconnect, marked Reconnecting...', async () => {
        // The audio grid: the video grid lays its tiles out by its measured size, which the test's page hasn't.
        const participants = three();
        participants.set( 'user_43', participant( 'user_43', { reconnecting: true } ) );
        const { container } = wrapped( fakeCall( { participants } ), 'group-audio' );
        await act( async () => {} );

        expect( container.querySelector( '[data-key="user_43"] .wplus-call-reconnecting' )?.textContent ).toBe( 'Reconnecting...' );
        expect( container.querySelector( '[data-key="user_34"] .wplus-call-reconnecting' ) ).toBeNull();
    } );

    it( 'show a moderation error as the host shows errors', async () => {
        const shown: unknown[] = [];
        configureUi( { showError: ( e ) => shown.push( e ) } );
        const call = fakeCall( { participants: three(), adminMode: true, moderate: async () => { throw new Error( 'refused' ); } } );
        const { container } = wrapped( call, 'group-video' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-mute' )! ); } );
        expect( ( shown[ 0 ] as Error ).message ).toBe( 'refused' );
    } );

    it( 'pass the tiles through the host\'s filter', async () => {
        // A filter answers the same map for the same participants: the grid lays itself out again whenever they change.
        const filtered = new WeakMap<object, Map<string, CallParticipant>>();
        const without43 = ( all: Map<string, CallParticipant> ) => {
            if ( ! filtered.has( all ) ) filtered.set( all, new Map( [ ...all ].filter( ( [ key ] ) => key !== 'user_43' ) ) );
            return filtered.get( all )!;
        };
        configureUi( { applyFilters: ( name, value ) => name === 'group_video_call_items' ? without43( value as Map<string, CallParticipant> ) as never : value } );
        const { container } = wrapped( fakeCall( { participants: three() } ), 'group-video' );
        await act( async () => {} );

        expect( container.querySelector( '[data-key="user_43"]' ) ).toBeNull();
        configureUi( { applyFilters: ( _name, value ) => value } );
    } );
} );

describe( 'a picture the media server paused for this page\'s download', () => {
    beforeEach( () => { vi.useFakeTimers(); } );
    afterEach( () => { vi.useRealTimers(); } );

    const screen = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' ) =>
        <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
    const two = ( paused: boolean ) => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
        [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack(), videoPaused: paused } ) ],
    ] );

    it( 'is said over the other side\'s picture in a call between two once it has held for 2 s, and no longer once it resumes', () => {
        const { container, rerender } = render( screen( fakeCall( { participants: two( true ) } ), 'private' ) );

        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS - 100 ); } );
        expect( container.querySelector( '.wplus-call-paused' ) ).toBeNull();
        act( () => { vi.advanceTimersByTime( 200 ); } );
        expect( container.querySelector( '.wplus-main-video .wplus-call-paused-main' )?.textContent )
            .toBe( 'Paused: weak connectionYour connection cannot carry this video right now. The sound goes on and the video comes back by itself.' );

        rerender( screen( fakeCall( { participants: two( false ) } ), 'private' ) );
        expect( container.querySelector( '.wplus-call-paused' ) ).toBeNull();
    } );

    it( 'is said on the tile, over its last frame, never on the user\'s own', () => {
        const tile = ( key: string, extra: Partial<CallParticipant> ) => render(
            <CallContext.Provider value={ fakeCall() }>
                <GroupVideoGridItem unique_key={ key } participant={ participant( key, { video: fakeTrack(), ...extra } ) } width={ 50 } height={ 50 } x={ 0 } y={ 0 } />
            </CallContext.Provider> ).container;

        const paused = tile( 'user_34', { videoPaused: true } );
        const sharing = tile( 'user_43', { screen: fakeTrack(), screenPaused: true } );
        const own = tile( 'me', { videoPaused: true } );
        const away = tile( 'user_44', { videoPaused: true, reconnecting: true } );
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS ); } );

        expect( paused.querySelector( '.wplus-call-paused .wplus-call-paused-notice' )?.textContent ).toBe( 'Paused: weak connection' );
        expect( sharing.querySelector( '.wplus-call-paused' ) ).not.toBeNull();
        expect( own.querySelector( '.wplus-call-paused' ) ).toBeNull();
        expect( away.querySelector( '.wplus-call-paused' ) ).toBeNull();
    } );

    it( 'is said for the whole group call when every picture it gets is paused, and not while one still comes', () => {
        const three = ( second: boolean ) => {
            const people = two( true );
            people.set( 'user_43', participant( 'user_43', { video: fakeTrack(), videoPaused: second } ) );
            return people;
        };
        const { container, rerender } = render( screen( fakeCall( { participants: three( false ) } ), 'group-video' ) );
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS ); } );
        expect( container.querySelector( '.wplus-group-call-status' ) ).toBeNull();

        rerender( screen( fakeCall( { participants: three( true ) } ), 'group-video' ) );
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS ); } );
        expect( container.querySelector( '.wplus-group-call-status' )?.textContent ).toBe( 'Your connection is weak: videos are paused, sound continues.' );

        // What the call has to say itself comes first.
        rerender( screen( fakeCall( { participants: three( true ), statusMessage: 'Connecting...' } ), 'group-video' ) );
        expect( container.querySelector( '.wplus-group-call-status' )?.textContent ).toBe( 'Connecting...' );
    } );
} );

describe( 'a camera moving to another codec during the call', () => {
    beforeEach( () => { vi.useFakeTimers(); } );
    afterEach( () => { vi.useRealTimers(); } );

    const tile = ( key: string, extra: Partial<CallParticipant>, optimizingMaxMs?: number ) =>
        <CallContext.Provider value={ fakeCall( { optimizingMaxMs } ) }>
            <GroupVideoGridItem unique_key={ key } participant={ participant( key, extra ) } width={ 50 } height={ 50 } x={ 0 } y={ 0 } />
        </CallContext.Provider>;
    const notice = ( container: HTMLElement ) => container.querySelector( '.wplus-call-optimizing' );

    it( 'says "Optimizing video quality..." on their tile, for a screen reader too, until their new picture\'s first frame is drawn', () => {
        // Marked: their camera is taken out of the room, so the tile has no video for a moment.
        const { container, rerender } = render( tile( 'user_34', { videoOptimizing: true, videoPaused: true } ) );
        expect( notice( container )?.textContent ).toBe( 'Optimizing video quality...' );
        expect( notice( container )?.getAttribute( 'role' ) ).toBe( 'status' );
        // a ring with an arc turning on it, as the busy controls spin, hidden from a screen reader
        expect( notice( container )?.querySelector( 'svg.wplus-call-optimizing-spinner[aria-hidden="true"] circle + path' ) ).not.toBeNull();

        // The pause it stands in for isn't said beside it.
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS + 100 ); } );
        expect( container.querySelector( '.wplus-call-paused' ) ).toBeNull();

        // Ready, and the new picture is there: it stays until a frame of it is drawn, then fades out and goes.
        rerender( tile( 'user_34', { videoOptimizing: false, video: fakeTrack() } ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( notice( container ) ).not.toBeNull();
        expect( notice( container )?.classList.contains( 'wplus-call-optimizing--leaving' ) ).toBe( false );

        act( () => { fireEvent.loadedData( container.querySelector( 'video' )! ); } );
        expect( notice( container )?.classList.contains( 'wplus-call-optimizing--leaving' ) ).toBe( true );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( container ) ).toBeNull();
    } );

    it( 'goes 10 s after it came, whether "ready" never came or the new picture never drew', () => {
        const marked = render( tile( 'user_34', { videoOptimizing: true } ) );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_MAX_MS - 100 ); } );
        expect( notice( marked.container )?.classList.contains( 'wplus-call-optimizing--leaving' ) ).toBe( false );
        act( () => { vi.advanceTimersByTime( 100 ); } );
        expect( notice( marked.container )?.classList.contains( 'wplus-call-optimizing--leaving' ) ).toBe( true );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( marked.container ) ).toBeNull();
        // Still marked, it doesn't come back: only a new "optimizing" brings it.
        act( () => { vi.advanceTimersByTime( OPTIMIZING_MAX_MS ); } );
        expect( notice( marked.container ) ).toBeNull();
        marked.unmount();

        const ready = render( tile( 'user_34', { videoOptimizing: true } ) );
        act( () => { vi.advanceTimersByTime( 4000 ); } );
        ready.rerender( tile( 'user_34', { videoOptimizing: false, video: fakeTrack() } ) );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_MAX_MS - 4000 - 100 ); } );
        expect( notice( ready.container ) ).not.toBeNull();
        act( () => { vi.advanceTimersByTime( 100 ); } );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( ready.container ) ).toBeNull();
        ready.unmount();

        // the node's failsafe where the call gives one (its policy's tune.failsafeS)
        const four = render( tile( 'user_34', { videoOptimizing: true }, 4000 ) );
        act( () => { vi.advanceTimersByTime( 3999 ); } );
        expect( notice( four.container )?.classList.contains( 'wplus-call-optimizing--leaving' ) ).toBe( false );
        act( () => { vi.advanceTimersByTime( 1 ); } );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( four.container ) ).toBeNull();
    } );

    it( 'second review B3: is on the user\'s own tile while their own camera moves, rather than their avatar; never on a tile away for a moment', () => {
        // their camera out of the room for the move: no picture, the placeholder instead of the avatar
        const own = render( tile( 'me', { videoOptimizing: true, video: null } ) );
        expect( notice( own.container )?.textContent ).toBe( 'Optimizing video quality...' );
        own.rerender( tile( 'me', { videoOptimizing: false, video: fakeTrack() } ) );
        act( () => { fireEvent.loadedData( own.container.querySelector( 'video' )! ); } );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( own.container ) ).toBeNull();
        expect( notice( render( tile( 'user_43', { videoOptimizing: true, reconnecting: true } ) ).container ) ).toBeNull();
    } );

    it( 'covers the whole stage in a call between two, over their avatar where no frame of them could be kept', () => {
        const two = new Map<string, CallParticipant>( [
            [ 'me', participant( 'me' ) ],
            [ 'user_34', participant( 'user_34', { videoOptimizing: true, videoPaused: true, avatar: 'https://example.com/ann.png' } ) ],
        ] );
        const { container } = render( <CallScreen call={ { ...fakeCall( { participants: two } ), wrapper: createRef<HTMLDivElement>() as never } } layout="private" /> );
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS + 100 ); } );

        const main = container.querySelector( '.wplus-main-video .wplus-call-optimizing.wplus-call-optimizing-main' ) as HTMLElement;
        expect( main?.textContent ).toBe( 'Optimizing video quality...' );
        expect( ( main.querySelector( '.wplus-call-optimizing-backdrop' ) as HTMLElement ).style.backgroundImage ).toContain( 'ann.png' );
        expect( container.querySelector( '.wplus-call-paused' ) ).toBeNull();
    } );

    it( 'never covers a screen they share: not on their tile, not on the stage, and their paused screen is still said', () => {
        const sharing = render( tile( 'user_34', { videoOptimizing: true, video: fakeTrack(), screen: fakeTrack(), screenPaused: true } ) );
        expect( notice( sharing.container ) ).toBeNull();
        act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS + 100 ); } );
        expect( sharing.container.querySelector( '.wplus-call-paused' ) ).not.toBeNull();

        const two = new Map<string, CallParticipant>( [
            [ 'me', participant( 'me' ) ],
            [ 'user_34', participant( 'user_34', { videoOptimizing: true, video: fakeTrack(), screen: fakeTrack() } ) ],
        ] );
        const stage = render( <CallScreen call={ { ...fakeCall( { participants: two } ), wrapper: createRef<HTMLDivElement>() as never } } layout="private" /> );
        expect( stage.container.querySelector( '.wplus-main-video video.video2' ) ).not.toBeNull();
        expect( notice( stage.container ) ).toBeNull();
    } );

    it( 'works the same where React runs every effect twice (StrictMode)', () => {
        const strict = ( extra: Partial<CallParticipant> ) => <React.StrictMode>{ tile( 'user_34', extra ) }</React.StrictMode>;
        const { container, rerender } = render( strict( { videoOptimizing: true } ) );
        expect( notice( container )?.textContent ).toBe( 'Optimizing video quality...' );
        rerender( strict( { videoOptimizing: false, video: fakeTrack() } ) );
        act( () => { fireEvent.loadedData( container.querySelector( 'video' )! ); } );
        act( () => { vi.advanceTimersByTime( OPTIMIZING_FADE_MS ); } );
        expect( notice( container ) ).toBeNull();
    } );
} );

describe( 'second review B3: a moving camera\'s tile keeps its place in the grid', () => {
    beforeEach( () => {
        vi.useFakeTimers();
        // a call 900 wide and 700 high, its dock 60
        vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
            const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
            return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
        } );
    } );
    afterEach( () => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    } );

    const people = ( mover: Partial<CallParticipant> ) => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me' ) ],
        [ 'user_43', participant( 'user_43', { video: fakeTrack() } ) ],
        [ 'user_34', participant( 'user_34', mover ) ],
        [ 'user_44', participant( 'user_44' ) ],
        [ 'user_45', participant( 'user_45', { video: fakeTrack() } ) ],
    ] );
    const screen = ( mover: Partial<CallParticipant> ) => <CallScreen call={ { ...fakeCall( { participants: people( mover ) } ), wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const order = ( container: HTMLElement ) => [ ...container.querySelectorAll<HTMLElement>( '.wplus-group-call-input-video[data-key]' ) ]
        .sort( ( a, b ) => parseFloat( a.style.top ) - parseFloat( b.style.top ) || parseFloat( a.style.left ) - parseFloat( b.style.left ) )
        .map( ( el ) => el.getAttribute( 'data-key' ) );

    it( 'in the gap between its camera leaving the room and coming back, where a tile without a picture would move down', () => {
        const { container, rerender } = render( screen( { video: fakeTrack() } ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        // settled: the tiles with a picture first
        rerender( screen( { video: fakeTrack() } ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        const before = order( container );
        expect( before.indexOf( 'user_34' ) ).toBeLessThan( before.indexOf( 'user_44' ) );

        rerender( screen( { video: null, videoOptimizing: true } ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( order( container ) ).toEqual( before );

        // the same gap unmarked: the tile goes after the ones with a picture
        rerender( screen( { video: null } ) );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( order( container ).indexOf( 'user_34' ) ).toBeGreaterThan( order( container ).indexOf( 'user_45' ) );
    } );
} );

describe( 'the camera checked before it goes out', () => {
    for ( const layout of [ 'private', 'group-video' ] as const ) {
        it( `spins the ${ layout } call's camera control meanwhile, as the room's controls do, and still takes a press`, () => {
            const call = fakeCall( { cameraChecking: true, participants: new Map( [ [ 'me', participant( 'me' ) ] ] ) } );
            const { container, rerender } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );

            const camera = container.querySelector( '.wplus-enable-video' )!;
            expect( camera.getAttribute( 'data-busy' ) ).toBe( '1' );
            expect( camera.querySelector( '.wplus-svg-animate' ) ).not.toBeNull();

            const done = { ...call, cameraChecking: false };
            rerender( <CallScreen call={ { ...done, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );
            expect( container.querySelector( '.wplus-enable-video' )?.getAttribute( 'data-busy' ) ).toBeNull();
            expect( container.querySelector( '.wplus-enable-video .wplus-svg-animate' ) ).toBeNull();
        } );

        it( `lets the camera be turned off in the ${ layout } call while it is checked: the person wins at once`, () => {
            const call = fakeCall( { cameraChecking: true, myCameraTrack: fakeTrack(), participants: new Map( [ [ 'me', participant( 'me' ) ] ] ) } );
            const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );
            const camera = container.querySelector( '.wplus-disable-video' )!;
            expect( camera.getAttribute( 'data-busy' ) ).toBe( '1' );
            fireEvent.click( camera );
            expect( call.calls ).toEqual( [ 'disableCamera' ] );
        } );
    }
} );

describe( 'the private call\'s controls on a touch', () => {
    it( 'take no press from the tap that brings them back, and their own taps as before (Better Messages ticket 10500 sweep)', () => {
        const call = fakeCall();
        const { container } = wrapped( call, 'private' );
        const end = container.querySelector( '.wplus-cancel' )!;
        const mic = container.querySelector( '.wplus-enable-mic' )!;

        // Hidden, the controls take no touch: it lands on the picture, and the click on the button shown at once.
        fireEvent.touchStart( container.querySelector( '.wplus-private-call' )! );
        fireEvent.click( end );
        expect( call.calls, 'a tap meant to show the controls ended the call' ).toEqual( [] );

        fireEvent.touchStart( mic );
        fireEvent.click( mic );
        expect( call.calls ).toEqual( [ 'enableMic' ] );

        // A click with no touch before it, as from a mouse or a key, is pressed as ever.
        fireEvent.click( end );
        expect( call.calls ).toEqual( [ 'enableMic', 'endCall' ] );
    } );
} );

describe( 'someone whose media stopped arriving while they are still in the call', () => {
    const tile = ( key: string, extra: Partial<CallParticipant> ) => render(
        <CallContext.Provider value={ fakeCall() }>
            <GroupVideoGridItem unique_key={ key } participant={ participant( key, extra ) } width={ 50 } height={ 50 } x={ 0 } y={ 0 } />
        </CallContext.Provider> ).container;
    const blurred = ( container: HTMLElement, kind: 'camera' | 'screen' ) =>
        container.querySelector( 'video[datatype="' + kind + '"], .wplus-small-video video' )?.classList.contains( 'wplus-call-video-stalled' );

    it( 'blurs a stopped camera\'s last frame on their tile and says "Video interrupted", and "Reconnecting..." when their sound stopped too', () => {
        const camera = tile( 'user_34', { video: fakeTrack(), audio: fakeTrack(), stalled: 'video' } );
        expect( camera.querySelector( '.wplus-call-stalled .wplus-call-paused-notice' )?.textContent ).toBe( 'Video interrupted' );
        expect( blurred( camera, 'camera' ) ).toBe( true );
        expect( camera.querySelector( '.wplus-call-reconnecting' ) ).toBeNull();

        const everything = tile( 'user_43', { video: fakeTrack(), audio: fakeTrack(), stalled: 'all' } );
        expect( everything.querySelector( '.wplus-call-reconnecting' )?.textContent ).toBe( 'Reconnecting...' );
        expect( everything.querySelector( '.wplus-call-stalled' ) ).toBeNull();
        expect( blurred( everything, 'camera' ) ).toBe( true );

        const flowing = tile( 'user_44', { video: fakeTrack(), audio: fakeTrack(), stalled: null } );
        expect( flowing.querySelector( '.wplus-call-stalled, .wplus-call-reconnecting, .wplus-call-video-stalled' ) ).toBeNull();

        // never the user's own
        const own = tile( 'me', { video: fakeTrack(), stalled: 'all' } );
        expect( own.querySelector( '.wplus-call-stalled, .wplus-call-reconnecting, .wplus-call-video-stalled' ) ).toBeNull();
    } );

    it( 'never says a shared screen is interrupted, still for as long as nothing on it moves, but blurs it when nothing of theirs arrives', () => {
        const camera = tile( 'user_34', { video: fakeTrack(), screen: fakeTrack(), stalled: 'video' } );
        expect( camera.querySelector( '.wplus-call-stalled' ) ).toBeNull();
        expect( camera.querySelector( 'video[datatype="screen"]' )?.classList.contains( 'wplus-call-video-stalled' ) ).toBe( false );
        expect( camera.querySelector( '.wplus-small-video video' )?.classList.contains( 'wplus-call-video-stalled' ) ).toBe( true );

        const everything = tile( 'user_43', { screen: fakeTrack(), stalled: 'all' } );
        expect( everything.querySelector( 'video[datatype="screen"]' )?.classList.contains( 'wplus-call-video-stalled' ) ).toBe( true );
        expect( everything.querySelector( '.wplus-call-reconnecting' ) ).not.toBeNull();
    } );

    it( 'leaves a camera the call says why it holds (paused for the download, moving codec) to that notice', () => {
        vi.useFakeTimers();
        try {
            const paused = tile( 'user_34', { video: fakeTrack(), videoPaused: true, stalled: 'video' } );
            act( () => { vi.advanceTimersByTime( PAUSED_NOTICE_MS ); } );
            expect( paused.querySelector( '.wplus-call-paused-notice' )?.textContent ).toBe( 'Paused: weak connection' );
            expect( paused.querySelector( '.wplus-call-stalled' ) ).toBeNull();

            const moving = tile( 'user_43', { video: fakeTrack(), videoOptimizing: true, stalled: 'video' } );
            expect( moving.querySelector( '.wplus-call-optimizing' ) ).not.toBeNull();
            expect( moving.querySelector( '.wplus-call-stalled' ) ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'says "Reconnecting..." on their row in a group audio call when their sound stopped', () => {
        const people = ( stalled: 'video' | 'all' | null ) => new Map<string, CallParticipant>( [
            [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
            [ 'user_34', participant( 'user_34', { audio: fakeTrack(), stalled } ) ],
        ] );
        const { container, rerender } = wrapped( fakeCall( { participants: people( 'all' ) } ), 'group-audio' );
        expect( container.querySelector( '[data-key="user_34"] .wplus-call-reconnecting' )?.textContent ).toBe( 'Reconnecting...' );
        expect( container.querySelector( '[data-key="me"] .wplus-call-reconnecting' ) ).toBeNull();

        rerender( <CallScreen call={ { ...fakeCall( { participants: people( null ) } ), wrapper: createRef<HTMLDivElement>() as never } } layout="group-audio" /> );
        expect( container.querySelector( '.wplus-call-reconnecting' ) ).toBeNull();
    } );

    it( 'in a call between two, says "Video interrupted" and why over the blurred stage, and "The other side lost connection" when nothing arrives', () => {
        const two = ( stalled: 'video' | 'all' | null ) => new Map<string, CallParticipant>( [
            [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
            [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack(), stalled } ) ],
        ] );
        const screen = ( stalled: 'video' | 'all' | null ) =>
            <CallScreen call={ { ...fakeCall( { participants: two( stalled ) } ), wrapper: createRef<HTMLDivElement>() as never } } layout="private" />;
        const { container, rerender } = render( screen( 'video' ) );

        expect( container.querySelector( '.wplus-main-video .wplus-call-stalled.wplus-call-paused-main' )?.textContent )
            .toBe( 'Video interruptedTheir video stopped arriving. It comes back by itself.' );
        expect( container.querySelector( '.wplus-main-video video.video1' )?.classList.contains( 'wplus-call-video-stalled' ) ).toBe( true );
        expect( container.querySelector( '.wplus-placeholder-participant-lost-message' ) ).toBeNull();

        rerender( screen( 'all' ) );
        expect( container.querySelector( '.wplus-placeholder-participant-lost-message' )?.textContent ).toBe( 'The other side lost connection' );
        expect( container.querySelector( '.wplus-call-stalled' ) ).toBeNull();
        expect( container.querySelector( '.wplus-main-video video.video1' )?.classList.contains( 'wplus-call-video-stalled' ) ).toBe( true );

        rerender( screen( null ) );
        expect( container.querySelector( '.wplus-call-stalled, .wplus-placeholder-participant-lost-message, .wplus-call-video-stalled' ) ).toBeNull();
    } );

    describe( 'a camera that never showed a frame here', () => {
        // jsdom's <video> has drawn nothing (videoWidth 0); `drawn` makes every one say it has
        const drawn = () => Object.defineProperty( HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 } );
        afterEach( () => { delete ( HTMLVideoElement.prototype as { videoWidth?: number } ).videoWidth; } );

        it( 'shows their face on their tile, above "Video interrupted", or under "Reconnecting...", where a last frame would be blurred', () => {
            const empty = tile( 'user_34', { video: fakeTrack(), audio: fakeTrack(), avatar: 'https://example.com/ann.png', stalled: 'video' } );
            expect( empty.querySelector<HTMLElement>( '.wplus-call-stalled.wplus-call-stalled-faced .wplus-call-stalled-face' )?.style.backgroundImage ).toContain( 'https://example.com/ann.png' );
            expect( empty.querySelector( '.wplus-call-stalled .wplus-call-paused-notice' )?.textContent ).toBe( 'Video interrupted' );

            const away = tile( 'user_43', { video: fakeTrack(), avatar: 'https://example.com/cara.png', stalled: 'all' } );
            const inner = away.querySelector<HTMLElement>( '.wplus-group-call-input-video-inner' );
            expect( inner?.classList.contains( 'wplus-call-pictureless' ) ).toBe( true );
            expect( inner?.style.backgroundImage ).toContain( 'https://example.com/cara.png' );
            expect( away.querySelector( '.wplus-call-reconnecting' ) ).not.toBeNull();

            drawn();
            const frozen = tile( 'user_44', { video: fakeTrack(), audio: fakeTrack(), stalled: 'video' } );
            expect( frozen.querySelector( '.wplus-call-stalled' ) ).not.toBeNull();
            expect( frozen.querySelector( '.wplus-call-stalled-faced, .wplus-call-stalled-face' ) ).toBeNull();
            const frozenAway = tile( 'user_45', { video: fakeTrack(), stalled: 'all' } );
            expect( frozenAway.querySelector( '.wplus-call-pictureless' ) ).toBeNull();
        } );

        it( 'shows their face on the stage of a call between two, and only there', () => {
            const two = ( stalled: 'video' | 'all' | null ) => new Map<string, CallParticipant>( [
                [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
                [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack(), stalled } ) ],
            ] );
            const screen = ( stalled: 'video' | 'all' | null ) =>
                <CallScreen call={ { ...fakeCall( { participants: two( stalled ) } ), wrapper: createRef<HTMLDivElement>() as never } } layout="private" />;
            const { container, rerender } = render( screen( 'video' ) );

            expect( container.querySelector<HTMLImageElement>( '.wplus-main-video .wplus-call-stalled-faced .wplus-call-animation img' )?.src ).toBe( 'https://example.com/ann.png' );

            rerender( screen( 'all' ) );
            expect( container.querySelector<HTMLImageElement>( '.wplus-main-video .wplus-call-stalled-face-main img' )?.src ).toBe( 'https://example.com/ann.png' );
            expect( container.querySelector( '.wplus-placeholder-participant-lost-message' ) ).not.toBeNull();

            drawn();
            rerender( screen( 'video' ) );
            expect( container.querySelector( '.wplus-call-stalled' ) ).not.toBeNull();
            expect( container.querySelector( '.wplus-call-stalled-faced, .wplus-call-stalled-face-main' ) ).toBeNull();
        } );
    } );
} );

describe( 'what a group call may send', () => {
    const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

    it( 'leaves what is on to the call until it is joined, and turns it off once the call says it may not be sent', async () => {
        const call = fakeCall( { canPublish: false, connectionState: 'connecting', myCameraTrack: fakeTrack(), myCameraTrackRef: { current: fakeTrack() } } );
        const { rerender } = wrapped( call, 'group-video' );
        await settle();
        expect( call.calls ).toEqual( [] );

        rerender( <CallScreen call={ { ...call, connectionState: 'connected', wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /> );
        await settle();
        expect( call.calls ).toEqual( [ 'disableCamera' ] );
    } );
} );

describe( 'the host', () => {
    it( 'translates every string the screens show', () => {
        configureUi( { translate: ( text, context ) => context === 'Private Call Screen' ? '[' + text + ']' : text } );
        const { container } = wrapped( fakeCall( { action: 'outgoing_call' } ), 'private' );

        expect( container.querySelector( '.wplus-placeholder-outgoing-text' )?.textContent ).toBe( '[Calling...]' );
    } );
} );
