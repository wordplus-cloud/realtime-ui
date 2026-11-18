import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, type CallParticipant, type TurnOnAnswer, type TurnOnAsk } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// A moderator asking someone to turn on their camera or microphone (ask-prompt.tsx, asked on 2026-10-30: "Ask user to
// enable camera/mic", "which should users who do not know how to enable camera to be helped by admin"): the rows in a
// person's menu, the ask over the person's dock with Turn On, Preview and Not Now, the help where the browser blocks the
// device or has none, and the moderator's toast of the answer.

const answered: [ string, string ][] = [];
const dismissed: string[] = [];
let permission = 'granted';
let opening: ( constraints?: MediaStreamConstraints ) => Promise<MediaStream> = async () => ( { getTracks: () => [] } as unknown as MediaStream );
// What the browser was asked to open, each time.
const opened: MediaStreamConstraints[] = [];

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    answered.length = 0;
    dismissed.length = 0;
    opened.length = 0;
    permission = 'granted';
    opening = async () => ( { getTracks: () => [] } as unknown as MediaStream );
    Object.defineProperty( navigator, 'permissions', { configurable: true, value: { query: async () => ( { state: permission } ) } } );
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { enumerateDevices: async () => [], getUserMedia: ( constraints: MediaStreamConstraints ) => { opened.push( constraints ); return opening( constraints ); } },
    } );
    // a call 900 wide and 700 high, its dock 60, so the grid lays its tiles out
    vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ){
        const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
        return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON(){} } as DOMRect;
    } );
} );

afterEach( () => {
    cleanup();
    vi.restoreAllMocks();
} );

const people = ( ...more: [ string, Partial<CallParticipant> ][] ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { identity: 'user_42', name: 'Ben' } ) ],
    ...more.map( ( [ key, extra ] ) => [ key, participant( key, { identity: key, ...extra } ) ] as [ string, CallParticipant ] ),
] );

const asks = ( received: TurnOnAsk | null = null, answers: TurnOnAnswer[] = [], pending?: TurnOnAsk[] ) => ( {
    received,
    answers,
    pending,
    answer: ( ask: TurnOnAsk, answer: string ) => void answered.push( [ ask.id, answer ] ),
    dismiss: ( ask: TurnOnAsk ) => void dismissed.push( ask.id ),
} );

const screen = ( over: Parameters<typeof fakeCall>[ 0 ] ) => {
    const call = fakeCall( over );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const rendered = render( draw() );
    // the grid measures once the stage is there
    act( () => { window.dispatchEvent( new Event( 'resize' ) ); } );
    return { ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

const openMenu = ( container: HTMLElement, key: string ) =>
    fireEvent.click( container.querySelector( `.wplus-group-call-input-video[data-key="${ key }"] .wplus-manage-participant` )! );
const rows = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-call-moderation-person [aria-label]' ) ].map( ( row ) => row.getAttribute( 'aria-label' ) );

describe( 'a moderator asking', () => {
    it( 'offers to ask whoever has their microphone or camera off, above the spotlight, and says Asked… after', async () => {
        const moderated: unknown[] = [];
        // Her microphone on, her camera off: the camera's row. Both off is one row for both (below).
        const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann', audio: fakeTrack() } ];
        const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara', video: fakeTrack(), audio: fakeTrack() } ];
        const { container } = screen( { adminMode: true, participants: people( ann, cara ), turnOnAsks: asks(), moderate: async ( request ) => { moderated.push( request ); return {}; } } as never );

        openMenu( container, 'user_34' );
        const labels = rows( container );
        expect( labels.slice( 0, 2 ) ).toEqual( [ 'Ask to Turn On Camera', 'Spotlight for Everyone' ] );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-ask-camera' )! ); } );
        expect( moderated ).toEqual( [ { act: 'ask_camera', identity: 'user_34' } ] );
        expect( container.querySelector( '.wplus-ask-camera' )?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-ask-camera' )! ); } );
        expect( moderated ).toHaveLength( 1 );

        // Someone with both on: nothing to ask.
        openMenu( container, 'user_34' );
        openMenu( container, 'user_43' );
        expect( rows( container ) ).not.toContain( 'Ask to Turn On Camera' );
        expect( rows( container ) ).not.toContain( 'Ask to Turn On Microphone' );
    } );

    it( 'is not offered where the call cannot carry an ask, or does not list the act', () => {
        const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann' } ];
        const plain = screen( { adminMode: true, participants: people( ann ) } );
        openMenu( plain.container, 'user_34' );
        expect( rows( plain.container ) ).not.toContain( 'Ask to Turn On Camera' );
        plain.unmount();

        const listed = screen( { adminMode: true, participants: people( ann ), turnOnAsks: asks(), moderation: [ 'remove_participant', 'ask_microphone' ] } as never );
        openMenu( listed.container, 'user_34' );
        expect( rows( listed.container ) ).toContain( 'Ask to Turn On Microphone' );
        expect( rows( listed.container ) ).not.toContain( 'Ask to Turn On Camera' );
        listed.unmount();

        // Each listed but not both at once: a row for each.
        const finn: [ string, Partial<CallParticipant> ] = [ 'user_46', { name: 'Finn' } ];
        const each = screen( { adminMode: true, participants: people( finn ), turnOnAsks: asks(), moderation: [ 'remove_participant', 'ask_microphone', 'ask_camera' ] } as never );
        openMenu( each.container, 'user_46' );
        expect( rows( each.container ).slice( 0, 2 ) ).toEqual( [ 'Ask to Turn On Microphone', 'Ask to Turn On Camera' ] );
        expect( rows( each.container ) ).not.toContain( 'Ask to Turn On Camera and Microphone' );
    } );

    // Asked on 2026-11-02: "when user in group video call has camera and mic disabled, i have 2 options and need to click
    // both of them".
    it( 'asks for both in one row while both are off, and the device left in its own row once one is on', async () => {
        const moderated: unknown[] = [];
        const eve: [ string, Partial<CallParticipant> ] = [ 'user_45', { name: 'Eve' } ];
        const call = { adminMode: true, moderate: async ( request: unknown ) => { moderated.push( request ); return {}; } };
        const { container, redraw } = screen( { ...call, participants: people( eve ), turnOnAsks: asks() } as never );
        const row = () => container.querySelector( '.wplus-ask-camera-microphone' );

        openMenu( container, 'user_45' );
        expect( rows( container ).slice( 0, 2 ) ).toEqual( [ 'Ask to Turn On Camera and Microphone', 'Spotlight for Everyone' ] );

        await act( async () => { fireEvent.click( row()! ); } );
        expect( moderated ).toEqual( [ { act: 'ask_camera_microphone', identity: 'user_45' } ] );
        expect( row()?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        await act( async () => { fireEvent.click( row()! ); } );
        expect( moderated ).toHaveLength( 1 );

        // Both answered alike: said of both, once.
        act( () => { redraw( { ...call, participants: people( eve ), turnOnAsks: asks( null, [
            { id: 'b1', from: 'user_45', device: 'camera', answer: 'not_now' },
            { id: 'b1', from: 'user_45', device: 'microphone', answer: 'not_now' },
        ] ) } as never ); } );
        expect( row()?.querySelector( '.wplus-call-moderation-note' )?.textContent ).toBe( 'Eve is not turning on their camera and microphone now' );

        // The microphone on: the camera's own row, asked already.
        act( () => { redraw( { ...call, participants: people( [ 'user_45', { name: 'Eve', audio: fakeTrack() } ] ), turnOnAsks: asks() } as never ); } );
        expect( row() ).toBeNull();
        expect( container.querySelector( '.wplus-ask-camera' )?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        expect( container.querySelector( '.wplus-ask-microphone' ) ).toBeNull();
    } );

    it( 'tells the moderator what came of it, once each', () => {
        const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann' } ];
        const { container, redraw } = screen( { adminMode: true, participants: people( ann ), turnOnAsks: asks() } as never );
        const answers: TurnOnAnswer[] = [ { id: 'a1', from: 'user_34', device: 'camera', answer: 'on' } ];
        act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, answers ) } as never ); } );
        act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, [ ...answers, { id: 'a2', from: 'user_34', device: 'microphone', answer: 'blocked' } ] ) } as never ); } );
        const toasts = [ ...container.querySelectorAll( '.wplus-call-host-toast[data-kind="answer"] .wplus-call-host-toast-text' ) ].map( ( t ) => t.textContent );
        expect( toasts.sort() ).toEqual( [ 'Ann turned on their camera', 'Ann: their browser blocks the microphone' ] );
    } );

    it( 'tells the moderator once where both devices of an ask for both were answered alike', () => {
        const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann' } ];
        const { container, redraw } = screen( { adminMode: true, participants: people( ann ), turnOnAsks: asks() } as never );
        const toasts = () => [ ...container.querySelectorAll( '.wplus-call-host-toast[data-kind="answer"] .wplus-call-host-toast-text' ) ].map( ( t ) => t.textContent );
        const answers: TurnOnAnswer[] = [ { id: 'b1', from: 'user_34', device: 'camera', answer: 'on' } ];

        act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, answers ) } as never ); } );
        expect( toasts() ).toEqual( [ 'Ann turned on their camera' ] );

        // The microphone's answer to the same ask, alike, in a message of its own: the one toast says both.
        answers.push( { id: 'b1', from: 'user_34', device: 'microphone', answer: 'on' } );
        act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, [ ...answers ] ) } as never ); } );
        expect( toasts() ).toEqual( [ 'Ann turned on their camera and microphone' ] );

        // Told apart where they differ.
        answers.push( { id: 'b2', from: 'user_34', device: 'camera', answer: 'no_device' }, { id: 'b2', from: 'user_34', device: 'microphone', answer: 'blocked' } );
        act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, [ ...answers ] ) } as never ); } );
        expect( toasts().sort() ).toEqual( [ 'Ann turned on their camera and microphone', 'Ann: no camera found', 'Ann: their browser blocks the microphone' ] );
    } );

    // Asked on 2026-10-31: "if user press not now, asker does not have any feedback".
    it( 'is told which device someone is not turning on now, a guest too', () => {
        const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann' } ];
        const guest: [ string, Partial<CallParticipant> ] = [ 'user_-7', { name: 'Dana' } ];
        const { container, redraw } = screen( { adminMode: true, participants: people( ann, guest ), turnOnAsks: asks() } as never );
        act( () => { redraw( { adminMode: true, participants: people( ann, guest ), turnOnAsks: asks( null, [
            { id: 'a1', from: 'user_34', device: 'camera', answer: 'not_now' },
            { id: 'a2', from: 'user_-7', device: 'microphone', answer: 'not_now' },
        ] ) } as never ); } );
        const toasts = [ ...container.querySelectorAll( '.wplus-call-host-toast[data-kind="answer"] .wplus-call-host-toast-text' ) ].map( ( t ) => t.textContent );
        expect( toasts.sort() ).toEqual( [ 'Ann is not turning on their camera now', 'Dana is not turning on their microphone now' ] );
    } );

    it( 'reads the answer under Asked… in the menu of the person asked, and none from an ask before', async () => {
        const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara', video: fakeTrack() } ];
        const earlier: TurnOnAnswer = { id: 'old', from: 'user_43', device: 'microphone', answer: 'not_now' };
        const call = { adminMode: true, participants: people( cara ), moderate: async () => ( {} ) };
        const { container, redraw } = screen( { ...call, turnOnAsks: asks( null, [ earlier ] ) } as never );
        const note = () => container.querySelector( '.wplus-ask-microphone .wplus-call-moderation-note' )?.textContent ?? null;

        openMenu( container, 'user_43' );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-ask-microphone' )! ); } );
        expect( container.querySelector( '.wplus-ask-microphone' )?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        expect( note() ).toBeNull();

        act( () => { redraw( { ...call, turnOnAsks: asks( null, [ earlier, { id: 'a3', from: 'user_43', device: 'microphone', answer: 'not_now' } ] ) } as never ); } );
        expect( container.querySelector( '.wplus-ask-microphone' )?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        expect( note() ).toBe( 'Cara is not turning on their microphone now' );
    } );

    it( 'keeps an answer that came while the page was out of sight until it is seen', () => {
        let visibility = 'hidden';
        Object.defineProperty( document, 'visibilityState', { configurable: true, get: () => visibility } );
        vi.useFakeTimers( { toFake: [ 'setTimeout', 'clearTimeout' ] } );
        try {
            const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann' } ];
            const { container, redraw } = screen( { adminMode: true, participants: people( ann ), turnOnAsks: asks() } as never );
            const toast = () => container.querySelector( '.wplus-call-host-toast[data-kind="answer"]' );
            act( () => { redraw( { adminMode: true, participants: people( ann ), turnOnAsks: asks( null, [ { id: 'a1', from: 'user_34', device: 'microphone', answer: 'not_now' } ] ) } as never ); } );

            act( () => { vi.advanceTimersByTime( 60000 ); } );
            expect( toast(), 'gone before the moderator came back' ).not.toBeNull();

            visibility = 'visible';
            act( () => { document.dispatchEvent( new Event( 'visibilitychange' ) ); } );
            act( () => { vi.advanceTimersByTime( 7000 ); } );
            expect( toast() ).not.toBeNull();
            act( () => { vi.advanceTimersByTime( 1500 ); } );
            expect( toast() ).toBeNull();
        } finally {
            vi.useRealTimers();
            delete ( document as unknown as { visibilityState?: string } ).visibilityState;
        }
    } );
} );

describe( 'the person asked', () => {
    const asked: TurnOnAsk = { id: 'a1', device: 'camera', by: 'user_34' };
    const ann: [ string, Partial<CallParticipant> ] = [ 'user_34', { name: 'Ann', canAdmin: true } ];

    it( 'is asked over the dock, and Not Now answers and puts it away', async () => {
        const { container } = screen( { participants: people( ann ), turnOnAsks: asks( asked ), canPublish: true } as never );
        expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your camera' );
        expect( [ ...container.querySelectorAll( '.wplus-call-ask-actions > *' ) ].map( ( el ) => el.textContent ) ).toEqual( [ 'Turn On', 'Preview', 'Not Now' ] );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-not-now' )! ); } );
        expect( answered ).toEqual( [ [ 'a1', 'not_now' ] ] );
        expect( dismissed ).toEqual( [ 'a1' ] );
    } );

    it( 'turns it on as the dock does, and says so once it is on', async () => {
        const enableCamera = vi.fn( async () => {} );
        const { container, redraw } = screen( { participants: people( ann ), turnOnAsks: asks( asked ), canPublish: true, enableCamera } as never );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
        expect( enableCamera ).toHaveBeenCalledTimes( 1 );
        expect( answered ).toEqual( [] );

        await act( async () => { redraw( { participants: people( ann ), turnOnAsks: asks( asked ), canPublish: true, enableCamera, myCameraTrack: fakeTrack() } as never ); } );
        expect( answered ).toEqual( [ [ 'a1', 'on' ] ] );
        expect( dismissed ).toEqual( [ 'a1' ] );
    } );

    it( 'says how to unblock it where the browser blocks it, Try Again asking again, and the moderator hears it once', async () => {
        permission = 'denied';
        opening = async () => { throw Object.assign( new Error( 'blocked' ), { name: 'NotAllowedError' } ); };
        const enableCamera = vi.fn( async () => {} );
        const { container } = screen( { participants: people( ann ), turnOnAsks: asks( asked ), canPublish: true, enableCamera } as never );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
        expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Your browser blocks the camera for this site' );
        expect( container.querySelectorAll( '.wplus-call-ask-steps .wplus-call-join-prompt-note' ).length ).toBeGreaterThan( 0 );
        expect( container.querySelector( '.wplus-call-ask-steps' )?.textContent ).toContain( 'Camera' );
        expect( container.querySelector( '.wplus-call-ask-on' )?.textContent ).toBe( 'Try Again' );
        expect( enableCamera ).not.toHaveBeenCalled();

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
        expect( answered ).toEqual( [ [ 'a1', 'blocked' ] ] );

        // Unblocked, Try Again turns it on.
        permission = 'granted';
        opening = async () => ( { getTracks: () => [] } as unknown as MediaStream );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
        expect( enableCamera ).toHaveBeenCalledTimes( 1 );
        expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your camera' );
    } );

    it( 'says there is none where the browser finds no device', async () => {
        permission = 'prompt';
        opening = async () => { throw Object.assign( new Error( 'none' ), { name: 'NotFoundError' } ); };
        const { container } = screen( { participants: people( ann ), turnOnAsks: asks( { ...asked, device: 'microphone' } ), canPublish: true } as never );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
        expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'No microphone found' );
        expect( answered ).toEqual( [ [ 'a1', 'no_device' ] ] );
    } );

    it( 'answers each moderator who asked for the device, naming the last', async () => {
        const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara', canAdmin: true } ];
        const first: TurnOnAsk = { id: 'a1', device: 'microphone', by: 'user_34' };
        const second: TurnOnAsk = { id: 'a2', device: 'microphone', by: 'user_43' };
        const { container } = screen( { participants: people( ann, cara ), turnOnAsks: asks( second, [], [ first, second ] ), canPublish: true } as never );
        expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Cara asks you to turn on your microphone' );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-not-now' )! ); } );
        expect( answered ).toEqual( [ [ 'a1', 'not_now' ], [ 'a2', 'not_now' ] ] );
        expect( dismissed ).toEqual( [ 'a1', 'a2' ] );
    } );

    it( 'leaves an ask for the other device to show next, and answers it once that device is on', async () => {
        const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara', canAdmin: true } ];
        const camera: TurnOnAsk = { id: 'a1', device: 'camera', by: 'user_34' };
        const microphone: TurnOnAsk = { id: 'a2', device: 'microphone', by: 'user_43' };
        const call = { participants: people( ann, cara ), canPublish: true };
        const { container, redraw } = screen( { ...call, turnOnAsks: asks( microphone, [], [ camera, microphone ] ) } as never );

        await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-not-now' )! ); } );
        expect( answered ).toEqual( [ [ 'a2', 'not_now' ] ] );
        expect( dismissed ).toEqual( [ 'a2' ] );

        // The app shows the one left.
        act( () => { redraw( { ...call, turnOnAsks: asks( camera, [], [ camera ] ) } as never ); } );
        expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your camera' );

        // Two again, and the camera turned on from the dock: its ask is answered while the microphone's shows.
        answered.length = 0;
        dismissed.length = 0;
        await act( async () => { redraw( { ...call, turnOnAsks: asks( microphone, [], [ camera, microphone ] ), myCameraTrack: fakeTrack() } as never ); } );
        expect( answered ).toEqual( [ [ 'a1', 'on' ] ] );
        expect( dismissed ).toEqual( [ 'a1' ] );
        expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Cara asks you to turn on your microphone' );
    } );

    describe( 'for both at once', () => {
        // An ask for both is one for each under one id, the camera's last (the app's `received`).
        const microphone: TurnOnAsk = { id: 'b1', device: 'microphone', by: 'user_34' };
        const camera: TurnOnAsk = { id: 'b1', device: 'camera', by: 'user_34' };
        const both = () => asks( camera, [], [ microphone, camera ] );

        it( 'is one card, and Not Now answers and puts away both', async () => {
            const { container } = screen( { participants: people( ann ), turnOnAsks: both(), canPublish: true } as never );
            expect( container.querySelectorAll( '.wplus-call-ask-prompt' ) ).toHaveLength( 1 );
            expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your camera and microphone' );
            expect( [ ...container.querySelectorAll( '.wplus-call-ask-actions > *' ) ].map( ( el ) => el.textContent ) ).toEqual( [ 'Turn On', 'Preview', 'Not Now' ] );

            await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-not-now' )! ); } );
            expect( answered ).toEqual( [ [ 'b1', 'not_now' ], [ 'b1', 'not_now' ] ] );
            expect( dismissed ).toEqual( [ 'b1', 'b1' ] );
        } );

        it( 'turns on both with one press, the browser asked once for both', async () => {
            permission = 'prompt';
            const enableCamera = vi.fn( async () => {} );
            const enableMic = vi.fn( async () => {} );
            const call = { participants: people( ann ), turnOnAsks: both(), canPublish: true, enableCamera, enableMic };
            const { container, redraw } = screen( call as never );

            await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
            expect( opened ).toEqual( [ { video: true, audio: true } ] );
            expect( enableCamera ).toHaveBeenCalledTimes( 1 );
            expect( enableMic ).toHaveBeenCalledTimes( 1 );

            await act( async () => { redraw( { ...call, myCameraTrack: fakeTrack(), myMicrophoneTrack: fakeTrack() } as never ); } );
            expect( answered ).toEqual( [ [ 'b1', 'on' ], [ 'b1', 'on' ] ] );
            expect( dismissed ).toEqual( [ 'b1', 'b1' ] );
        } );

        it( 'turns on the one it can, and says what stops the other', async () => {
            permission = 'prompt';
            opening = async ( constraints ) => {
                if ( constraints?.video ) throw Object.assign( new Error( 'none' ), { name: 'NotFoundError' } );
                return { getTracks: () => [] } as unknown as MediaStream;
            };
            const enableCamera = vi.fn( async () => {} );
            const enableMic = vi.fn( async () => {} );
            const { container } = screen( { participants: people( ann ), turnOnAsks: both(), canPublish: true, enableCamera, enableMic } as never );

            await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
            expect( enableMic ).toHaveBeenCalledTimes( 1 );
            expect( enableCamera ).not.toHaveBeenCalled();
            expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'No camera found' );
            expect( answered ).toEqual( [ [ 'b1', 'no_device' ] ] );
        } );

        it( 'says how to unblock them where the browser blocks both, without asking it again, and Try Again turns both on', async () => {
            permission = 'denied';
            opening = async () => { throw Object.assign( new Error( 'blocked' ), { name: 'NotAllowedError' } ); };
            const enableCamera = vi.fn( async () => {} );
            const enableMic = vi.fn( async () => {} );
            const { container } = screen( { participants: people( ann ), turnOnAsks: both(), canPublish: true, enableCamera, enableMic } as never );

            await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
            expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Your browser blocks the camera for this site' );
            expect( container.querySelector( '.wplus-call-ask-on' )?.textContent ).toBe( 'Try Again' );
            // Once for both at most (none where the browser said already that it blocks them), never again for each.
            expect( opened.length ).toBeLessThanOrEqual( 1 );
            expect( answered ).toEqual( [ [ 'b1', 'blocked' ], [ 'b1', 'blocked' ] ] );

            permission = 'granted';
            opening = async () => ( { getTracks: () => [] } as unknown as MediaStream );
            await act( async () => { fireEvent.click( container.querySelector( '.wplus-call-ask-on' )! ); } );
            expect( enableCamera ).toHaveBeenCalledTimes( 1 );
            expect( enableMic ).toHaveBeenCalledTimes( 1 );
        } );

        it( 'is one card for one moderator\'s two asks, and not for two moderators\' asks', () => {
            const first = screen( { participants: people( ann ), turnOnAsks: asks( { ...microphone, id: 'a2' }, [], [ { ...camera, id: 'a1' }, { ...microphone, id: 'a2' } ] ), canPublish: true } as never );
            expect( first.container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your camera and microphone' );
            first.unmount();

            const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara', canAdmin: true } ];
            const second = screen( { participants: people( ann, cara ), turnOnAsks: asks( { ...microphone, id: 'a2', by: 'user_43' }, [], [ { ...camera, id: 'a1' }, { ...microphone, id: 'a2', by: 'user_43' } ] ), canPublish: true } as never );
            expect( second.container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Cara asks you to turn on your microphone' );
        } );

        it( 'asks for the microphone alone on an audio call', () => {
            const call = fakeCall( { participants: people( ann ), turnOnAsks: both(), canPublish: true } as never );
            const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="group-audio" /> );
            expect( container.querySelector( '.wplus-call-ask-prompt .wplus-call-join-prompt-title' )?.textContent ).toBe( 'Ann asks you to turn on your microphone' );
        } );
    } );

    it( 'is not shown to someone who only watches', () => {
        const { container } = screen( { participants: people( ann ), turnOnAsks: asks( asked ), canPublish: false } as never );
        expect( container.querySelector( '.wplus-call-ask-prompt' ) ).toBeNull();
    } );
} );
