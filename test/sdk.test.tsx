import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallsController } from '../src/sdk/controller.ts';
import CallsApp from '../src/sdk/calls-app.tsx';
import { translator } from '../src/inc/translations.ts';
import type { SdkCall, SdkCalls, SdkGroupCall, SdkIncoming, SdkPerson, SdkRemoteTrack } from '../src/sdk/types.ts';

// The SDK's calls as the screens read them, by shape: events fired by hand.
class Emitter {
    private handlers = new Map<string, Array<( ...args: any[] ) => void>>();
    on( event: string, fn: ( ...args: any[] ) => void ) {
        this.handlers.set( event, [ ...( this.handlers.get( event ) ?? [] ), fn ] );
        return this;
    }
    off( event: string, fn?: ( ...args: any[] ) => void ) {
        this.handlers.set( event, ( this.handlers.get( event ) ?? [] ).filter( ( f ) => fn && f !== fn ) );
        return this;
    }
    fire( event: string, ...args: any[] ) {
        for ( const fn of this.handlers.get( event ) ?? [] ) fn( ...args );
    }
}

const remote = (): SdkRemoteTrack & { on: HTMLMediaElement[] } => {
    const on: HTMLMediaElement[] = [];
    return {
        on,
        mediaStreamTrack: {} as MediaStreamTrack,
        attach: ( el ) => ( on.push( el ), el ),
        detach: () => [],
    };
};

function fakeCall( over: Partial<SdkCall> = {} ) {
    const e = new Emitter();
    const call = Object.assign( e, {
        id: 'call-1', name: 'support:34:42', type: 'video' as const, role: 'caller' as const, peer: { user: 34, info: { name: 'Ann' } },
        state: 'ringing' as SdkCall[ 'state' ], endReason: null,
        remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: { camera: false, microphone: false, screen_share: false, screen_share_audio: false }, quality: 'unknown' as const },
        sent: [] as Array<[ string, unknown ]>,
        add: vi.fn( async () => ( {} as any ) ),
        setTrack( source: string, track: unknown ) { this.sent.push( [ source, track ] ); },
        ended: false,
        end() { this.ended = true; },
        ...over,
    } );
    return call;
}

function fakeCalls() {
    const e = new Emitter();
    return Object.assign( e, {
        started: [] as unknown[],
        start: vi.fn(),
        group: vi.fn(),
        people: vi.fn( async () => [ { id: 43, name: 'Cara', avatar: '' } ] ),
    } ) as unknown as SdkCalls & Emitter & { start: ReturnType<typeof vi.fn>; group: ReturnType<typeof vi.fn>; people: ReturnType<typeof vi.fn> };
}

const devices = () => {
    const track = { stop: vi.fn(), getSettings: () => ( { deviceId: 'cam-1' } ), addEventListener: () => {} };
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn( async () => ( { getTracks: () => [ track ] } ) ),
            getDisplayMedia: vi.fn(),
            enumerateDevices: vi.fn( async () => [] ),
        },
    } );
    return track;
};

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42 } );
    devices();
} );

afterEach( cleanup );

describe( 'the SDK\'s calls on Better Messages\' screens', () => {
    it( 'rings with the caller\'s name, answers into the private call, and shows the other side\'s picture once connected', async () => {
        const calls = fakeCalls();
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );

        const answered = fakeCall( { role: 'callee', state: 'connecting', peer: { user: 42, info: { name: 'Ben' } } } );
        const incoming = Object.assign( new Emitter(), { id: 'ring-1', call: 'support:34:42', from: 42, info: { name: 'Ben' }, type: 'video' as const, group: null, state: 'ringing', accept: vi.fn( async () => answered ), decline: vi.fn( async () => {} ) } ) as unknown as SdkIncoming;
        await act( async () => calls.fire( 'incoming', incoming ) );

        expect( container.querySelector( '.realtime-call-ring .bm-toast-site-call-title' )?.textContent ).toBe( 'Ben' );
        expect( container.querySelector( '.realtime-call-ring .bm-toast-site-call-text' )?.textContent ).toBe( 'Incoming Video Call' );

        await act( async () => { fireEvent.click( container.querySelector( '.bm-toast-site-call-action-answer' )! ); } );
        expect( container.querySelector( '.realtime-call-ring' ) ).toBeNull();
        expect( container.querySelector( '.realtime-call-window.bm-call-surface .bm-call-wrap .bm-private-call' ) ).not.toBeNull();
        // It starts with the microphone and, on a video call, the camera, both handed to the call.
        expect( answered.sent.map( ( [ source ] ) => source ).sort() ).toEqual( [ 'camera', 'microphone' ] );

        const camera = remote();
        await act( async () => {
            answered.state = 'connected';
            answered.fire( 'state', 'connected' );
            answered.fire( 'remote', { ...answered.remote, camera, media: { ...answered.remote.media, camera: true, microphone: true } } );
        } );
        const video = container.querySelector( '.bm-private-call video.video1' );
        expect( video ).not.toBeNull();
        expect( camera.on ).toContain( video );
    } );

    it( 'answers and ends a call from the keyboard: the ring and every control are named buttons in the Tab order', async () => {
        // A keyboard or a screen reader could reach none of them (an SDK review, 2026-10-14).
        const calls = fakeCalls();
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        const answered = fakeCall( { role: 'callee', state: 'connected', peer: { user: 42, info: { name: 'Ben' } } } );
        const incoming = Object.assign( new Emitter(), { id: 'ring-2', call: 'support:34:42', from: 42, info: { name: 'Ben' }, type: 'video' as const, group: null, state: 'ringing', accept: vi.fn( async () => answered ), decline: vi.fn( async () => {} ) } ) as unknown as SdkIncoming;
        await act( async () => calls.fire( 'incoming', incoming ) );

        const control = ( el: Element ) => [ el.getAttribute( 'role' ), ( el as HTMLElement ).tabIndex, el.getAttribute( 'aria-label' ) ];
        const answer = container.querySelector( '.bm-toast-site-call-action-answer' )!;
        expect( control( answer ) ).toEqual( [ 'button', 0, 'Answer' ] );
        expect( control( container.querySelector( '.bm-toast-site-call-action-reject' )! ) ).toEqual( [ 'button', 0, 'Reject' ] );
        await act( async () => { fireEvent.keyDown( answer, { key: 'Enter' } ); } );
        expect( incoming.accept ).toHaveBeenCalled();

        await act( async () => { fireEvent.click( container.querySelector( '.bm-private-call' )! ); } );
        const controls = [ ...container.querySelectorAll( '.bm-call-buttons [aria-label]' ) ];
        expect( controls.length ).toBeGreaterThan( 2 );
        for ( const el of controls ) expect( control( el ).slice( 0, 2 ) ).toEqual( [ 'button', 0 ] );
        await act( async () => { fireEvent.keyDown( container.querySelector( '.bm-call-buttons .bm-cancel' )!, { key: ' ' } ); } );
        expect( answered.ended ).toBe( true );
    } );

    it( 'places a call from the elements, says why it ends, and declines a ring while busy', async () => {
        const calls = fakeCalls();
        const placed = fakeCall();
        calls.start.mockResolvedValue( placed );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );

        await act( async () => controller.place( 'support:34:42', 34, 'video', { name: 'Ann' } ) );
        expect( calls.start ).toHaveBeenCalledWith( 'support:34:42', { to: 34, type: 'video' } );
        expect( container.querySelector( '.bm-placeholder-outgoing-text' )?.textContent ).toBe( 'Calling...' );

        const second = Object.assign( new Emitter(), { id: 'ring-2', call: 'x', from: 43, info: {}, type: 'audio' as const, group: null, state: 'ringing', accept: vi.fn(), decline: vi.fn( async () => {} ) } ) as unknown as SdkIncoming;
        await act( async () => calls.fire( 'incoming', second ) );
        expect( second.decline ).toHaveBeenCalledWith( 'busy' );

        await act( async () => placed.fire( 'ended', 'rejected' ) );
        expect( container.querySelector( '.realtime-call-window' ) ).toBeNull();
        expect( container.querySelector( '.realtime-call-notice' )?.textContent ).toBe( 'User rejected your call' );
    } );

    it( 'sends the microphone and the camera under React\'s Strict Mode, as a Next.js app runs in development', async () => {
        // Strict Mode mounts, unmounts and mounts again: the rehearsal's unmount must not end what the call sends.
        const calls = fakeCalls();
        const placed = fakeCall();
        calls.start.mockResolvedValue( placed );
        const controller = new CallsController( calls );
        render( <React.StrictMode><CallsApp controller={ controller } /></React.StrictMode> );

        await act( async () => controller.place( 'support:34:42', 34, 'video', { name: 'Ann' } ) );
        expect( placed.sent.map( ( [ source ] ) => source ).sort() ).toEqual( [ 'camera', 'microphone' ] );
        expect( placed.sent.every( ( [ , track ] ) => track !== null ) ).toBe( true );
    } );

    it( 'hangs up from the screen, ending the call and stopping what it sent', async () => {
        const calls = fakeCalls();
        const placed = fakeCall( { state: 'connected' } );
        calls.start.mockResolvedValue( placed );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.place( 'support:34:42', 34, 'video', { name: 'Ann' } ) );

        await act( async () => { fireEvent.click( container.querySelector( '.bm-call-buttons .bm-cancel' )! ); } );
        expect( placed.ended ).toBe( true );
        expect( container.querySelector( '.realtime-call-window' ) ).toBeNull();
    } );

    it( 'shows a group call\'s people in the grid, and goes on as one when the call becomes it', async () => {
        const calls = fakeCalls();
        const placed = fakeCall( { state: 'connected' } );
        calls.start.mockResolvedValue( placed );
        const controller = new CallsController( calls, { add: true } );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.place( 'support:34:42', 34, 'video', { name: 'Ann' } ) );

        // Add Person: the app's people for the call, and the one picked rung in.
        await act( async () => { fireEvent.click( container.querySelector( '.bm-private-call' )! ); } );
        await act( async () => { fireEvent.click( container.querySelector( '.bm-add-person' )! ); } );
        expect( calls.people ).toHaveBeenCalledWith( 'support:34:42' );
        await act( async () => { fireEvent.click( container.querySelector( '.bm-call-add-person-list button' )! ); } );
        expect( placed.add ).toHaveBeenCalledWith( 43 );

        const people: SdkPerson[] = [
            { identity: 'user_34', user: 34, info: { name: 'Ann' }, camera: remote(), microphone: remote(), screen: null, screenAudio: null, speaking: true },
            { identity: 'user_43', user: 43, info: { name: 'Cara' }, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false },
        ];
        const group = Object.assign( new Emitter(), { state: 'connected', people: () => people, setTrack: vi.fn( async () => {} ), leave: vi.fn(), add: vi.fn() } ) as unknown as SdkGroupCall;
        await act( async () => placed.fire( 'group', group ) );

        expect( container.querySelector( '.realtime-call-window[data-layout="video"] .bm-call-wrap-group' ) ).not.toBeNull();
        expect( container.querySelector( '.bm-group-call-videos-grid' ) ).not.toBeNull();
    } );

    it( 'lets someone who only listens listen, then speak once the app server lets them, from the first click', async () => {
        // A class: the rule answers { publish: false } for a student until the teacher permits them (an SDK review, 2026-10-14).
        const calls = fakeCalls();
        const people: SdkPerson[] = [
            { identity: 'user_34', user: 34, info: { name: 'Ann' }, camera: remote(), microphone: remote(), screen: null, screenAudio: null, speaking: true, publish: true },
        ];
        const group = Object.assign( new Emitter(), {
            state: 'connected', can: { publish: false, subscribe: true }, people: () => people, setTrack: vi.fn( async () => {} ), leave: vi.fn(),
            self: { identity: 'user_43', user: 43, info: { name: 'Cara' }, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false, publish: false },
        } );
        calls.group.mockResolvedValue( group );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.join( 'class:7', 'video', 'Class' ) );

        // Listening: the teacher on screen, and no microphone, camera or tile of their own, nothing asked of the browser.
        expect( container.querySelector( '.bm-group-call-videos-grid' ) ).not.toBeNull();
        expect( container.querySelectorAll( '.bm-enable-mic, .bm-disable-mic, .bm-enable-camera, .bm-disable-camera' ) ).toHaveLength( 0 );
        expect( navigator.mediaDevices.getUserMedia ).not.toHaveBeenCalled();
        expect( group.setTrack ).not.toHaveBeenCalled();

        // The teacher lets them speak: the controls come, the microphone off, and its first click sends.
        group.can = { publish: true, subscribe: true };
        await act( async () => group.fire( 'permissions', group.can ) );
        const enable = container.querySelector( '.bm-enable-mic' ) as HTMLElement;
        expect( enable ).not.toBeNull();
        await act( async () => { fireEvent.click( enable ); } );
        await act( async () => {} );
        expect( group.setTrack ).toHaveBeenCalledWith( 'microphone', expect.anything() );

        // Taken out by the app server: the window goes, saying why.
        const ended = group as unknown as Emitter;
        // Back to listening: the controls go again.
        group.can = { publish: false, subscribe: true };
        await act( async () => group.fire( 'permissions', group.can ) );
        expect( container.querySelectorAll( '.bm-enable-mic, .bm-disable-mic' ) ).toHaveLength( 0 );

        await act( async () => ended.fire( 'ended', 'removed' ) );
        expect( container.querySelector( '.realtime-call-window' ) ).toBeNull();
        expect( container.querySelector( '.realtime-call-notice' )?.textContent ).toBe( 'You were removed from this call' );
    } );
} );

describe( 'a host in a group call', () => {
    const meeting = ( can: Record<string, boolean> ) => {
        const people: SdkPerson[] = [
            { identity: 'user_42', user: 42, info: { name: 'Ben' }, camera: remote(), microphone: remote(), screen: null, screenAudio: null, speaking: false, publish: true },
            { identity: 'user_43', user: 43, info: { name: 'Cara' }, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false, publish: false },
        ];
        return Object.assign( new Emitter(), { state: 'connected', can, people: () => people, setTrack: vi.fn( async () => {} ), leave: vi.fn(), moderate: vi.fn( async () => true ) } );
    };
    const labels = ( container: HTMLElement, key: string ) =>
        [ ...container.querySelectorAll( `[data-key="${ key }"] .bm-admin-controls [aria-label]` ) ].map( ( e ) => e.getAttribute( 'aria-label' ) );

    it( 'gets the moderator controls the cloud takes, each asked of the app through group.moderate()', async () => {
        // The rule's admin: Better Messages' controls on the others' tiles, but none the cloud has no act for: no pin, no
        // microphone turned on for someone, no room muted or locked for everyone.
        const calls = fakeCalls();
        const group = meeting( { publish: true, subscribe: true, admin: true } );
        calls.group.mockResolvedValue( group );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.join( 'meeting:daily', 'audio', 'Daily' ) );

        expect( labels( container, 'user_42' ) ).toEqual( [ 'Kick User', 'Block Broadcast' ] );
        expect( labels( container, 'user_43' ) ).toEqual( [ 'Kick User', 'Allow Broadcast' ] );
        expect( container.querySelectorAll( '.bm-mute-all, .bm-unmute-all, .bm-lock-room, .bm-unlock-room' ) ).toHaveLength( 0 );

        const click = async ( key: string, label: string ) => act( async () => {
            fireEvent.click( container.querySelector( `[data-key="${ key }"] [aria-label="${ label }"]` )! );
        } );
        await click( 'user_43', 'Allow Broadcast' );
        await click( 'user_42', 'Block Broadcast' );
        await click( 'user_42', 'Kick User' );
        expect( group.moderate.mock.calls ).toEqual( [ [ 'speak', 43 ], [ 'listen', 42 ], [ 'remove', 42 ] ] );

        // Hosting taken back: the controls go.
        await act( async () => group.fire( 'permissions', { publish: true, subscribe: true } ) );
        expect( container.querySelectorAll( '.bm-admin-controls' ) ).toHaveLength( 0 );
    } );

    it( 'mutes a microphone from a video tile, named by its identity, and asks nothing the cloud has no act for', async () => {
        const { useGroupCall } = await import( '../src/sdk/use-group-call.ts' );
        const group = meeting( { publish: true, subscribe: true, admin: true } );
        let context: any = null;
        const Probe = () => {
            context = useGroupCall( group as unknown as SdkGroupCall, 'video', () => {} );
            return null;
        };
        render( <Probe /> );
        await act( async () => {} );

        expect( context.adminMode ).toBe( true );
        expect( context.moderation ).toEqual( [ 'remove_participant', 'mute_participant', 'unmute_participant', 'mute_mic' ] );
        await context.moderate( { act: 'mute_mic', identity: 'user_42', type: 'video' } );
        expect( group.moderate ).toHaveBeenCalledWith( 'mute', 42 );
        await expect( context.moderate( { act: 'pin_participant', identity: 'user_42' } ) ).rejects.toMatchObject( { code: 'not_moderated' } );
        await expect( context.moderate( { act: 'mute_mic', identity: 'user_99' } ) ).rejects.toMatchObject( { code: 'not_moderated' } );
    } );

    it( 'draws no moderator control for anyone the rule made no host', async () => {
        const calls = fakeCalls();
        calls.group.mockResolvedValue( meeting( { publish: true, subscribe: true } ) );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.join( 'meeting:daily', 'audio', 'Daily' ) );
        expect( container.querySelectorAll( '[data-key="user_42"]' ).length ).toBeGreaterThan( 0 );
        expect( container.querySelectorAll( '.bm-admin-controls' ) ).toHaveLength( 0 );
    } );

    it( 'marks on the tiles a camera or screen the media server paused for this page\'s download', async () => {
        const { useGroupCall } = await import( '../src/sdk/use-group-call.ts' );
        const people: SdkPerson[] = [
            { identity: 'user_34', user: 34, info: { name: 'Ann' }, camera: remote(), microphone: remote(), screen: remote(), screenAudio: null, speaking: false, cameraPaused: true, screenPaused: false },
            // A client from before the pause was told: nothing paused.
            { identity: 'user_43', user: 43, info: { name: 'Cara' }, camera: remote(), microphone: null, screen: null, screenAudio: null, speaking: false },
        ];
        const group = Object.assign( new Emitter(), { state: 'connected', people: () => people, setTrack: vi.fn( async () => {} ), leave: vi.fn() } );
        let context: any = null;
        const Probe = () => {
            context = useGroupCall( group as unknown as SdkGroupCall, 'video', () => {} );
            return null;
        };
        render( <Probe /> );
        await act( async () => {} );

        expect( context.participants.get( 'user_34' ) ).toMatchObject( { videoPaused: true, screenPaused: false } );
        expect( context.participants.get( 'user_43' ) ).toMatchObject( { videoPaused: false, screenPaused: false } );
    } );
} );

describe( 'the package\'s languages', () => {
    it( 'translate the screens in the WordPlus languages, the app\'s own strings first', () => {
        expect( translator( 'de-DE' ).translate( 'Calling...', 'Private Call Screen' ) ).toBe( 'Wird angerufen...' );
        expect( translator( 'hr' ).translate( 'End Call', 'Private Call Screen' ) ).toBe( 'Završi poziv' );
        expect( translator( 'he' ).translate( 'Answer', 'Private Call Screen' ) ).not.toBe( 'Answer' );
        expect( translator( 'pt-BR' ).translate( 'Answer', 'Private Call Screen' ) ).toBe( 'Answer' );
        expect( translator( 'de', { 'Calling...': 'Klingelt …' } ).translate( 'Calling...', 'Private Call Screen' ) ).toBe( 'Klingelt …' );
    } );

    it( 'say Leave call on a group call, which has no chat in an app, and the app\'s own word for it first', async () => {
        expect( translator( 'en' ).translate( 'Exit Chat', 'Group Video Chat' ) ).toBe( 'Leave call' );
        expect( translator( 'de' ).translate( 'Exit Chat', 'Group Audio Chat' ) ).toBe( 'Anruf verlassen' );
        expect( translator( 'he' ).translate( 'Exit Chat', 'Group Video Chat' ) ).toBe( 'צא מהשיחה' );
        expect( translator( 'de', { 'Group Video Chat\u0004Exit Chat': 'Raus' } ).translate( 'Exit Chat', 'Group Video Chat' ) ).toBe( 'Raus' );
        expect( translator( 'fr', { 'Group call\u0004Leave call': 'Partir' } ).translate( 'Exit Chat', 'Group Video Chat' ) ).toBe( 'Partir' );

        // On the screen, read out as its label.
        configureUi( { ...translator( 'en' ), currentUserId: () => 42 } );
        const calls = fakeCalls();
        const people: SdkPerson[] = [
            { identity: 'user_34', user: 34, info: { name: 'Ann' }, camera: remote(), microphone: remote(), screen: null, screenAudio: null, speaking: false },
        ];
        calls.group.mockResolvedValue( Object.assign( new Emitter(), { state: 'connected', people: () => people, setTrack: vi.fn( async () => {} ), leave: vi.fn() } ) );
        const controller = new CallsController( calls );
        const { container } = render( <CallsApp controller={ controller } /> );
        await act( async () => controller.join( 'meeting:7', 'video', 'Meeting' ) );

        expect( container.querySelector( '[aria-label="Leave call"]' ) ).not.toBeNull();
        expect( container.querySelector( '[aria-label="Exit Chat"]' ) ).toBeNull();
    } );
} );
