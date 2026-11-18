import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, DevicePanel, JOIN_PROMPT_MS, LayoutChoiceContext } from '../src/calls.ts';
import { CallContext } from '../src/components/calls/context.ts';
import { cameras, mediaAccess, microphones, updateMediaPermissions } from '../src/inc/calls/permissions.ts';
import { fakeCall, fakeTrack } from './fake-call.ts';

// What the browser says of each device when the settings ask it, allowed unless a test says otherwise, and read before
// the first draw too, as the registry has it by then in a browser. The registry's own read finds no devices here (the
// page's mediaDevices come after it loads), and would say it knows nothing.
const access = vi.hoisted( () => ( { camera: 'granted', microphone: 'granted' } as Record<string, string> ) );
vi.mock( '../src/inc/calls/permissions.ts', async ( original ) => {
    const real = await original<typeof import( '../src/inc/calls/permissions.ts' )>();
    return {
        ...real,
        updateMediaPermissions: async () => {
            real.mediaAccess.set( 'camera', access.camera );
            real.mediaAccess.set( 'microphone', access.microphone );
            real.mediaUpdatedSubject.next();
        },
    };
} );
const answer = async ( change: Partial<typeof access> ) => {
    Object.assign( access, change );
    await act( async () => { await updateMediaPermissions(); } );
};

// The level the check's microphone hears, read by the test in place of Web Audio.
const mic = vi.hoisted( () => ( { readers: [] as Array<( level: number ) => void> } ) );
vi.mock( '../src/inc/calls/mic-level.ts', () => ( {
    readLevel: ( _track: MediaStreamTrack, onReading: ( level: number ) => void ) => {
        mic.readers.push( onReading );
        return () => {};
    },
} ) );

// What the check opens, and whether it was let go, by kind.
const opened = { asked: [] as MediaStreamConstraints[], stopped: [] as string[] };

// The test sound's notes, counted in place of Web Audio.
const notes = { count: 0 };
class FakeAudioContext {
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createOscillator() {
        notes.count++;
        return { type: '', frequency: { value: 0 }, connect: ( to: unknown ) => to, start() {}, stop() {} };
    }
    createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: ( to: unknown ) => to };
    }
}

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 42, { name: 'Ben' } ] ] );
    opened.asked = [];
    opened.stopped = [];
    mic.readers.length = 0;
    notes.count = 0;
    access.camera = access.microphone = 'granted';
    mediaAccess.set( 'camera', 'granted' );
    mediaAccess.set( 'microphone', 'granted' );
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: {
            enumerateDevices: async () => [],
            getUserMedia: vi.fn( async ( asked: MediaStreamConstraints ) => {
                opened.asked.push( asked );
                const track = ( kind: string ) => ( { kind, stop: () => { opened.stopped.push( kind ); } } );
                const audio = asked.audio ? [ track( 'audio' ) ] : [];
                const video = asked.video ? [ track( 'video' ) ] : [];
                return { getTracks: () => [ ...audio, ...video ], getAudioTracks: () => audio, getVideoTracks: () => video };
            } ),
        },
    } );
    ( window as unknown as { AudioContext: unknown } ).AudioContext = FakeAudioContext;
    // happy-dom takes only its own MediaStream.
    Object.defineProperty( HTMLMediaElement.prototype, 'srcObject', {
        configurable: true,
        get() { return ( this as { stream?: unknown } ).stream ?? null; },
        set( stream: unknown ) { ( this as { stream?: unknown } ).stream = stream; },
    } );
} );

afterEach( () => {
    cleanup();
    microphones.clear();
    cameras.clear();
    delete ( window as unknown as { AudioContext?: unknown } ).AudioContext;
} );

// What a press set going, done: a device opened, its effect started, its level read. Under Preact, which Live Support's
// visitor panel draws the call on, each step's effects run after a frame, so a few frames rather than one tick.
const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 20 ) ); } );
};

const call = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'group-video' | 'group-audio' = 'group-video' ) => {
    const made = fakeCall( { devicesOnJoin: true, ...over } );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...made, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
    const rendered = render( draw() );
    return { call: made, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

// The device settings alone, as a group call draws them.
const screen = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'group-video' | 'group-audio' = 'group-video' ) => {
    const made = fakeCall( over );
    const close = vi.fn();
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallContext.Provider value={ { ...made, ...more } }><DevicePanel video={ layout === 'group-video' } close={ close } /></CallContext.Provider>;
    const rendered = render( draw() );
    return { call: made, close, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

const panel = ( container: HTMLElement ) => container.querySelector( '.wplus-call-devices' );
const row = ( container: HTMLElement, kind: string ) => container.querySelector( `.wplus-call-device[data-kind="${ kind }"]` )!;
const state = ( container: HTMLElement, kind: string ) => row( container, kind ).querySelector( '.wplus-call-device-status' )?.textContent;
const test = ( container: HTMLElement, kind: string ) => row( container, kind ).querySelector( '.wplus-call-device-test' )!;
const allowedCamera = () => cameras.set( 'cam', { deviceId: 'cam', label: 'FaceTime HD Camera', kind: 'videoinput', groupId: '', toJSON: () => ( {} ) } as MediaDeviceInfo );
// The camera as the preview asks it, at the call's size: 1080 lines at 16:9 and 30 frames, ideals only.
const CAMERA = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };

describe( 'the prompt of a join', () => {
    const prompt = ( container: HTMLElement ) => container.querySelector( '.wplus-call-join-prompt' );

    it( 'says the microphone and camera are off and the buttons below turn them on, and Preview opens the settings with both running', async () => {
        const { container, redraw } = call( { connectionState: 'connecting' } );
        expect( prompt( container ) ).toBeNull();

        redraw( { connectionState: 'connected' } );
        await settle();
        expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Microphone and camera are off' );
        expect( container.querySelector( '.wplus-call-join-prompt-note' )?.textContent ).toBe( 'Turn them on with the buttons below when you are ready.' );
        expect( panel( container ), 'the settings opened over the call by themselves' ).toBeNull();
        expect( opened.asked ).toEqual( [] );

        const preview = container.querySelector( '.wplus-call-join-prompt-preview' )!;
        expect( preview.textContent ).toBe( 'Preview' );
        fireEvent.click( preview );
        await settle();
        expect( panel( container ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-call-devices-title' )?.textContent ).toBe( 'Device Settings' );
        // The camera and the microphone asked for once, together, and each running from that one request.
        expect( opened.asked, 'Preview asked the browser for each on its own' ).toEqual( [ { audio: true, video: CAMERA } ] );
        expect( container.querySelector( '.wplus-call-device-preview' ) ).not.toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' )?.textContent ).toBe( 'Speak to test. Nobody hears it.' );
        expect( prompt( container ), 'the prompt stayed beside the settings' ).toBeNull();

        // Each still stops on its own.
        fireEvent.click( test( container, 'camera' ) );
        await settle();
        expect( opened.stopped ).toEqual( [ 'video' ] );
        expect( container.querySelector( '.wplus-call-device-preview' ) ).toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' ), 'stopping the preview stopped the microphone' ).not.toBeNull();
        expect( opened.asked ).toHaveLength( 1 );
    } );

    it( 'offers Do Not Show Again only where the app keeps the choice, which keeps it and puts the notice away', async () => {
        const never = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-join-prompt-never' );

        const plain = call( {} );
        await settle();
        expect( prompt( plain.container ) ).not.toBeNull();
        expect( never( plain.container ), 'Do Not Show Again with nowhere to keep it' ).toBeNull();
        plain.unmount();

        const dontShowAgain = vi.fn();
        const { container } = call( { joinNotice: { shown: true, dontShowAgain } } );
        await settle();
        expect( never( container )?.textContent ).toBe( 'Do Not Show Again' );
        expect( never( container )?.getAttribute( 'role' ) ).toBe( 'button' );
        fireEvent.click( never( container )! );
        await settle();
        expect( dontShowAgain ).toHaveBeenCalledTimes( 1 );
        expect( prompt( container ), 'the notice stayed' ).toBeNull();
        expect( panel( container ), 'it opened the settings' ).toBeNull();
    } );

    it( 'says nothing to a user who chose not to see it, and the × keeps no choice', async () => {
        const hidden = call( { joinNotice: { shown: false, dontShowAgain: vi.fn() } } );
        await settle();
        expect( prompt( hidden.container ), 'the notice came for a user who said not to show it' ).toBeNull();
        hidden.unmount();

        const dontShowAgain = vi.fn();
        const { container } = call( { joinNotice: { shown: true, dontShowAgain } } );
        await settle();
        fireEvent.click( container.querySelector( '.wplus-call-join-prompt-close' )! );
        await settle();
        expect( prompt( container ) ).toBeNull();
        expect( dontShowAgain, 'the × kept the choice' ).not.toHaveBeenCalled();
    } );

    it( 'goes by itself after a while, on its ×, or once something is turned on, and not again after a reconnect', async () => {
        vi.useFakeTimers();
        try {
            const first = call( {} );
            await act( async () => {} );
            expect( prompt( first.container ) ).not.toBeNull();
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS ); } );
            expect( prompt( first.container ) ).toBeNull();
            first.redraw( { connectionState: 'reconnecting' } );
            first.redraw( { connectionState: 'connected' } );
            expect( prompt( first.container ) ).toBeNull();
            first.unmount();

            const second = call( {} );
            await act( async () => {} );
            fireEvent.click( second.container.querySelector( '.wplus-call-join-prompt-close' )! );
            expect( prompt( second.container ) ).toBeNull();
            second.unmount();

            const third = call( {} );
            await act( async () => {} );
            third.redraw( { myMicrophoneTrack: fakeTrack() } );
            expect( prompt( third.container ) ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'stays while the pointer or the keyboard\'s focus is on it, and goes when the rest of its time runs out after', async () => {
        vi.useFakeTimers();
        try {
            const { container } = call( {} );
            await act( async () => {} );
            const card = () => prompt( container ) as HTMLElement;

            // the pointer comes on it 4 s in and stays well past its time
            act( () => { vi.advanceTimersByTime( 4000 ); } );
            fireEvent.pointerEnter( card() );
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS * 3 ); } );
            expect( prompt( container ), 'it went from under the pointer' ).not.toBeNull();

            // off it, the 6 s it had left run on
            fireEvent.pointerLeave( card() );
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS - 4000 - 500 ); } );
            expect( prompt( container ), 'it went before its time once the pointer left' ).not.toBeNull();

            // the keyboard's focus on its Preview holds it too, and moving to its next button keeps it held
            const preview = container.querySelector<HTMLElement>( '.wplus-call-join-prompt-preview' )!;
            const close = container.querySelector<HTMLElement>( '.wplus-call-join-prompt-close' )!;
            fireEvent.focusIn( preview );
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS ); } );
            expect( prompt( container ), 'it went from under the focus' ).not.toBeNull();
            fireEvent.focusOut( preview, { relatedTarget: close } );
            fireEvent.focusIn( close );
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS ); } );
            expect( prompt( container ), 'focus moving inside it let it go' ).not.toBeNull();

            // pointer and focus both on it: leaving with one of them keeps it
            fireEvent.pointerEnter( card() );
            fireEvent.focusOut( close, { relatedTarget: null } );
            act( () => { vi.advanceTimersByTime( JOIN_PROMPT_MS ); } );
            expect( prompt( container ), 'it went with the pointer still on it' ).not.toBeNull();

            // both gone: the half second it had left
            fireEvent.pointerLeave( card() );
            act( () => { vi.advanceTimersByTime( 400 ); } );
            expect( prompt( container ) ).not.toBeNull();
            act( () => { vi.advanceTimersByTime( 200 ); } );
            expect( prompt( container ), 'it stayed past its time' ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    } );

    it.each( [
        [ 'the host does not ask', { devicesOnJoin: false } ],
        [ 'the user may only watch', { canPublish: false } ],
    ] )( 'says nothing where %s', async ( _where, over ) => {
        const { container } = call( over );
        await settle();
        expect( prompt( container ) ).toBeNull();
        expect( panel( container ) ).toBeNull();
    } );

    it( 'on a group audio call speaks of the microphone alone, and Test Microphone opens the settings testing it', async () => {
        const { container } = call( {}, 'group-audio' );
        await settle();
        expect( container.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Microphone is off' );
        expect( container.querySelector( '.wplus-call-join-prompt-note' )?.textContent ).toBe( 'Turn it on with the button below when you are ready.' );

        const preview = container.querySelector( '.wplus-call-join-prompt-preview' )!;
        expect( preview.textContent ).toBe( 'Test Microphone' );
        fireEvent.click( preview );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: true, video: false } ] );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' )?.textContent ).toBe( 'Speak to test. Nobody hears it.' );
    } );
} );

describe( 'a moderator\'s ask with the settings open', () => {
    const ask = { id: 'a1', device: 'microphone' as const, by: 'user_34' };
    const asked = ( over: Parameters<typeof fakeCall>[ 0 ] = {} ) => ( {
        turnOnAsks: { received: ask, pending: [ ask ], answers: [], answer: vi.fn(), dismiss: vi.fn() },
        ...over,
    } ) as Parameters<typeof fakeCall>[ 0 ];
    const card = ( container: HTMLElement ) => container.querySelector( '.wplus-call-ask-prompt' );

    it( 'Turn On during the microphone test stops the test and turns the microphone on, and the settings say it is live', async () => {
        const { container, call: made, redraw } = call( asked() );
        await settle();
        fireEvent.click( card( container )!.querySelector( '.wplus-call-ask-preview' )! );
        await settle();
        expect( test( container, 'microphone' ).textContent, 'Test Microphone did not run the test' ).toBe( 'Stop' );
        expect( card( container ), 'the ask went as the settings opened' ).not.toBeNull();
        const stoppedBefore = opened.stopped.filter( ( kind ) => kind === 'audio' ).length;

        await act( async () => { fireEvent.click( card( container )!.querySelector( '.wplus-call-ask-on' )! ); } );
        await settle();
        expect( made.calls ).toContain( 'enableMic' );

        // The microphone on, as the call's enableMic leaves it.
        redraw( { ...asked(), myMicrophoneTrack: fakeTrack() } );
        await settle();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-test' ), 'the test still runs beside the live microphone' ).toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' ) ).toBeNull();
        expect( opened.stopped.filter( ( kind ) => kind === 'audio' ).length, 'the test kept its microphone open' ).toBeGreaterThan( stoppedBefore );
        expect( state( container, 'microphone' ) ).toBe( 'LiveEveryone hears you' );
        expect( panel( container ), 'Turn On closed the settings' ).not.toBeNull();
    } );

    it( 'tell the card over the dock to stand at the top of the stage, under the status line, and end above its foot', async () => {
        const { container, redraw } = call( asked( { statusMessage: 'Reconnecting…' } ) );
        await settle();
        fireEvent.click( card( container )!.querySelector( '.wplus-call-ask-preview' )! );
        await settle();

        // A stage 1000 by 560: the status line at its top, the card standing under it, the settings over the dock.
        const box = ( top: number, bottom: number ) => ( { top, bottom, height: bottom - top, left: 0, right: 1000, width: 1000, x: 0, y: top, toJSON() {} } as DOMRect );
        vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ) {
            if ( this.classList.contains( 'wplus-call-wrap' ) ) return box( 0, 560 );
            if ( this.classList.contains( 'wplus-group-call-status' ) ) return box( 14, 54 );
            if ( this.classList.contains( 'wplus-call-join-prompt' ) ) return box( 62, 160 );
            if ( this.classList.contains( 'wplus-call-settings' ) ) return box( 120, 486 );
            return box( 0, 0 );
        } );
        vi.spyOn( Element.prototype, 'getClientRects' ).mockImplementation( function( this: Element ) {
            return ( this.classList.contains( 'wplus-call-join-prompt-region' ) ? [ box( 62, 160 ) ] : [] ) as unknown as DOMRectList;
        } );
        redraw( asked( { statusMessage: 'Reconnecting…' } ) );
        await settle();

        const stage = container.querySelector<HTMLElement>( '.wplus-call-wrap' )!;
        expect( stage.style.getPropertyValue( '--wplus-call-prompt-top' ), 'the card was not put under the status line' ).toBe( '62px' );
        expect( ( panel( container ) as HTMLElement ).style.maxHeight, 'the settings run up under the card' ).toBe( 486 - 170 + 'px' );

        // Closed: the card goes back over the dock.
        fireEvent.click( container.querySelector( '.wplus-call-devices-done' )! );
        await settle();
        expect( stage.style.getPropertyValue( '--wplus-call-prompt-top' ) ).toBe( '' );
        vi.restoreAllMocks();
    } );
} );

describe( 'the devices', () => {
    it( 'close on Done and on Escape', async () => {
        const { container, close } = screen( {} );
        await settle();
        fireEvent.click( container.querySelector( '.wplus-call-devices-done' )! );
        fireEvent.keyDown( panel( container )!, { key: 'Escape' } );
        expect( close ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'offer no Turn On or Unmute: going live is the dock\'s alone', async () => {
        const { container } = screen( {} );
        await settle();
        expect( container.querySelectorAll( '.wplus-call-device-action' ) ).toHaveLength( 0 );
        expect( container.textContent ).not.toMatch( /Turn On|Unmute/ );
    } );


    it( 'say nobody sees or hears the user, open nothing until a press, and preview the camera and test the microphone each alone', async () => {
        allowedCamera();
        const { call, container } = screen( {} );
        await settle();

        expect( state( container, 'camera' ) ).toBe( 'Nobody sees you' );
        expect( state( container, 'microphone' ) ).toBe( 'Nobody hears you' );
        expect( opened.asked, 'a device was opened with nobody pressing anything, though the browser allowed it' ).toEqual( [] );
        expect( container.querySelector( '.wplus-call-device-preview' ), 'a picture box stood empty before any preview' ).toBeNull();

        // The camera alone: its preview in its row, the user's only, which its badge says, and the row no more.
        expect( test( container, 'camera' ).textContent ).toBe( 'Preview' );
        fireEvent.click( test( container, 'camera' ) );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: false, video: CAMERA } ] );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-preview .wplus-call-devices-badge' )?.textContent ).toBe( 'Only you see this' );
        expect( state( container, 'camera' ), '"Nobody sees you" under "Only you see this"' ).toBeUndefined();
        expect( test( container, 'camera' ).textContent ).toBe( 'Stop' );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-level' ), 'the camera\'s preview opened the microphone' ).toBeNull();

        // The microphone alone: its level, to be read rather than heard, and the camera's preview runs on.
        expect( test( container, 'microphone' ).textContent ).toBe( 'Test' );
        fireEvent.click( test( container, 'microphone' ) );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: false, video: CAMERA }, { audio: true, video: false } ] );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' )?.textContent ).toBe( 'Speak to test. Nobody hears it.' );
        expect( state( container, 'microphone' ), '"Nobody hears you" under "Nobody hears it"' ).toBeUndefined();
        act( () => { mic.readers[ mic.readers.length - 1 ]( 0.7 ); } );
        expect( row( container, 'microphone' ).querySelectorAll( '.wplus-call-device-level i[data-on]' ).length ).toBeGreaterThan( 0 );
        expect( opened.stopped, 'testing the microphone restarted the camera' ).toEqual( [] );

        // Stop ends that one alone.
        fireEvent.click( test( container, 'camera' ) );
        await settle();
        expect( opened.stopped ).toEqual( [ 'video' ] );
        expect( container.querySelector( '.wplus-call-device-preview' ) ).toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' ) ).not.toBeNull();

        // Still nobody's but the user's.
        expect( state( container, 'camera' ) ).toBe( 'Nobody sees you' );
        expect( call.calls ).toEqual( [] );
    } );

    it( 'preview the camera at the size the app\'s call opens it, as ideals a camera that cannot give them comes near', async () => {
        allowedCamera();
        configureUi( { cameraSize: () => ( { width: 1280, height: 720, frameRate: 24 } ) } );
        try {
            const { container } = screen( {} );
            await settle();
            fireEvent.click( test( container, 'camera' ) );
            await settle();
            const asked = opened.asked[ 0 ].video as MediaTrackConstraints;
            expect( asked ).toEqual( { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } } );
            // Never exact, min or max: a camera that refuses 720 still opens.
            expect( JSON.stringify( asked ) ).not.toMatch( /exact|min|max/ );
        } finally {
            configureUi( { cameraSize: () => null } );
        }
    } );

    it( 'end the preview once the dock sends the camera, say so, and open nothing again once it is turned off', async () => {
        const { container, redraw } = screen( {} );
        await settle();
        fireEvent.click( test( container, 'camera' ) );
        await settle();

        redraw( { myCameraTrack: fakeTrack() } );
        await settle();
        expect( opened.stopped, 'the preview held the camera the call sends' ).toContain( 'video' );
        expect( container.querySelector( '.wplus-call-device-preview' ) ).toBeNull();
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-test' ), 'a live camera offered a preview' ).toBeNull();
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-state[data-live]' ) ).not.toBeNull();
        expect( state( container, 'camera' ) ).toBe( 'LiveEveryone sees you' );

        redraw( { myCameraTrack: null } );
        await settle();
        expect( opened.asked, 'turning the camera off opened it again for the preview' ).toHaveLength( 1 );
        expect( state( container, 'camera' ) ).toBe( 'Nobody sees you' );
    } );

    it( 'say the microphone is live once the dock sends it, with its level', async () => {
        const { container, redraw } = screen( {} );
        await settle();

        redraw( { myMicrophoneTrack: fakeTrack() } );
        expect( state( container, 'microphone' ) ).toBe( 'LiveEveryone hears you' );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-level' ) ).not.toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-test' ) ).toBeNull();
    } );

    it( 'say a moderator holds the microphone, and offer no test of it', async () => {
        const { container } = screen( { myMicMuted: true } );
        await settle();

        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-note' )?.textContent ).toBe( 'A moderator muted your microphone.' );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-test' ) ).toBeNull();
    } );

    it( 'show the device in use in a field, list the devices in the browser\'s own menu, and hand back the one chosen', async () => {
        const device = ( deviceId: string, label: string ) => ( { deviceId, label, kind: 'audioinput', groupId: '', toJSON: () => ( {} ) } ) as MediaDeviceInfo;
        microphones.set( 'default', device( 'default', 'MacBook Microphone' ) );
        microphones.set( 'usb', device( 'usb', 'USB Headset' ) );
        const chosen: string[] = [];
        const { container } = screen( { setSelectedMicrophoneDevice: ( ( id: string ) => void chosen.push( id ) ) as never } );
        await settle();

        const current = row( container, 'microphone' ).querySelector( '.wplus-call-device-current' )!;
        expect( current.querySelector( '.wplus-call-device-name' )?.textContent ).toBe( 'Same as system - MacBook Microphone' );
        // A field on a line of its own, under the name with the device's test.
        expect( current.previousElementSibling ).toBe( test( container, 'microphone' ).parentElement );
        expect( current.previousElementSibling?.classList.contains( 'wplus-call-device-head' ) ).toBe( true );

        const select = current.querySelector( 'select' )!;
        expect( select.getAttribute( 'aria-label' ) ).toBe( 'Microphone' );
        expect( select.value ).toBe( 'default' );
        expect( [ ...select.options ].map( ( o ) => o.textContent ) ).toEqual( [ 'Same as system - MacBook Microphone', 'USB Headset' ] );

        fireEvent.change( select, { target: { value: 'usb' } } );
        expect( chosen ).toEqual( [ 'usb' ] );
    } );

    it( 'show the first device for one chosen earlier that is gone, so choosing it still works', async () => {
        const device = ( deviceId: string, label: string ) => ( { deviceId, label, kind: 'audioinput', groupId: '', toJSON: () => ( {} ) } ) as MediaDeviceInfo;
        microphones.set( 'usb', device( 'usb', 'USB Headset' ) );
        microphones.set( 'mac', device( 'mac', 'MacBook Microphone' ) );
        const { container } = screen( { selectedMicrophoneDevice: 'unplugged' } as never );
        await settle();

        const current = row( container, 'microphone' ).querySelector( '.wplus-call-device-current' )!;
        expect( current.querySelector( '.wplus-call-device-name' )?.textContent ).toBe( 'Default' );
        expect( current.querySelector( 'select' )?.value ).toBe( '' );
    } );

    it( 'play a test sound on the speaker', async () => {
        const { container } = screen( {} );
        await settle();

        fireEvent.click( test( container, 'speaker' ) );
        await settle();
        expect( notes.count ).toBe( 3 );
    } );

    it( 'on a group audio call have no camera, and test the microphone', async () => {
        const { container } = screen( {}, 'group-audio' );
        await settle();

        expect( panel( container ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-call-device[data-kind="camera"], .wplus-call-device-preview' ) ).toBeNull();
        fireEvent.click( test( container, 'microphone' ) );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: true, video: false } ] );
    } );

    it( 'in a call between two are not held to a room\'s rules', async () => {
        const call = fakeCall( { canPublish: false, myMicMuted: true } );
        const { container } = render( <CallContext.Provider value={ call }><DevicePanel video group={ false } close={ () => {} } /></CallContext.Provider> );
        await settle();

        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-note' ) ).toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-test' ) ).not.toBeNull();
    } );

    it( 'in a call between two say the other person sees and hears the user once live, by name, not everyone', async () => {
        setUiUsers( [ [ 34, { name: 'Ann' } ] ] );
        const call = fakeCall( { myCameraTrack: fakeTrack(), myMicrophoneTrack: fakeTrack() } );
        const { container } = render( <CallContext.Provider value={ call }><DevicePanel video group={ false } close={ () => {} } /></CallContext.Provider> );
        await settle();

        expect( state( container, 'camera' ) ).toBe( 'LiveAnn sees you' );
        expect( state( container, 'microphone' ) ).toBe( 'LiveAnn hears you' );
    } );

    it( 'in a group call say everyone sees and hears the user once live', async () => {
        const { container } = screen( { myCameraTrack: fakeTrack(), myMicrophoneTrack: fakeTrack() } );
        await settle();

        expect( state( container, 'camera' ) ).toBe( 'LiveEveryone sees you' );
        expect( state( container, 'microphone' ) ).toBe( 'LiveEveryone hears you' );
    } );
} );

describe( 'access to the devices', () => {
    const cards = ( container: HTMLElement ) => [ ...container.querySelectorAll<HTMLElement>( '.wplus-call-access' ) ];
    const titles = ( container: HTMLElement ) => cards( container ).map( ( one ) => [ ...one.querySelectorAll( '.wplus-call-access-title' ) ].map( ( t ) => t.textContent ).join( '|' ) );
    const button = ( card: HTMLElement ) => card.querySelector<HTMLElement>( '.wplus-call-access-button' )!;
    const current = ( container: HTMLElement, kind: string ) => row( container, kind ).querySelector( '.wplus-call-device-name' )?.textContent;
    const refuse = ( name: string ) => ( navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn> )
        .mockRejectedValueOnce( Object.assign( new Error( name ), { name } ) );

    it( 'never allowed yet: say so in each row, offer nothing to choose, and Allow Access asks for both at once and runs each test', async () => {
        access.camera = access.microphone = 'prompt';
        mediaAccess.set( 'camera', 'prompt' );
        mediaAccess.set( 'microphone', 'prompt' );
        const { container } = screen( { effects: true } as never );
        await settle();

        expect( titles( container ) ).toEqual( [ 'Allow your camera and microphone' ] );
        expect( cards( container )[ 0 ].querySelector( '.wplus-call-access-note' )?.textContent ).toBe( 'Your browser will ask you. Nobody sees or hears you until you turn them on in the call.' );
        expect( current( container, 'camera' ) ).toBe( 'Not allowed yet' );
        expect( current( container, 'microphone' ) ).toBe( 'Not allowed yet' );
        expect( row( container, 'camera' ).querySelector( 'select' ), 'a list of devices before any is allowed' ).toBeNull();
        expect( state( container, 'camera' ), 'who sees the user, with the card saying it' ).toBeUndefined();
        expect( state( container, 'microphone' ) ).toBeUndefined();
        expect( opened.asked, 'the browser asked before a press' ).toEqual( [] );

        fireEvent.click( button( cards( container )[ 0 ] ) );
        await settle();
        expect( opened.asked, 'asked for each on its own: two prompts' ).toEqual( [ { audio: true, video: CAMERA } ] );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-preview' ) ).not.toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' )?.textContent ).toBe( 'Speak to test. Nobody hears it.' );
        expect( cards( container ), 'the card stayed once both were given' ).toHaveLength( 0 );
        expect( current( container, 'camera' ) ).toBe( 'Default' );
    } );

    it( 'refused at Allow Access: blocked, with the steps of this browser, asked no more until Try Again, which runs the tests once given', async () => {
        access.camera = access.microphone = 'prompt';
        mediaAccess.set( 'camera', 'prompt' );
        mediaAccess.set( 'microphone', 'prompt' );
        const { container } = screen( {} );
        await settle();

        refuse( 'NotAllowedError' );
        fireEvent.click( button( cards( container )[ 0 ] ) );
        await settle();
        // The browser still says only "prompt", as some do after a refusal: the refusal counts.
        expect( titles( container ) ).toEqual( [ 'Your browser blocks the camera and microphone for this site' ] );
        const steps = [ ...cards( container )[ 0 ].querySelectorAll( '.wplus-call-access-note' ) ].map( ( note ) => note.textContent );
        expect( steps[ 0 ] ).toContain( 'Camera and Microphone' );
        expect( steps[ 0 ] ).toMatch( /then press Try Again\.$/ );
        expect( button( cards( container )[ 0 ] ).textContent ).toBe( 'Try Again' );
        expect( current( container, 'camera' ) ).toBe( 'Blocked' );
        expect( current( container, 'microphone' ) ).toBe( 'Blocked' );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-test' ), 'Preview of a blocked camera' ).toBeNull();
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-test' ) ).toBeNull();
        const asks = () => ( navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn> ).mock.calls.length;
        expect( asks(), 'each test asked again after the browser refused both' ).toBe( 1 );

        fireEvent.click( button( cards( container )[ 0 ] ) );
        await settle();
        expect( asks() ).toBe( 2 );
        expect( opened.asked ).toEqual( [ { audio: true, video: CAMERA } ] );
        expect( cards( container ) ).toHaveLength( 0 );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-preview' ) ).not.toBeNull();
    } );

    it( 'a camera the browser blocks says so with its steps, and the microphone never allowed yet keeps its own Allow Access', async () => {
        access.camera = 'denied';
        access.microphone = 'prompt';
        mediaAccess.set( 'camera', 'denied' );
        mediaAccess.set( 'microphone', 'prompt' );
        const { container } = screen( {} );
        await settle();

        expect( titles( container ) ).toEqual( [ 'Your browser blocks the camera for this site', 'Allow your microphone' ] );
        expect( cards( container )[ 0 ].getAttribute( 'data-stuck' ) ).toBe( '1' );
        expect( cards( container )[ 1 ].querySelector( '.wplus-call-access-note' )?.textContent ).toBe( 'Your browser will ask you. Nobody hears you until you turn it on in the call.' );
        expect( current( container, 'camera' ) ).toBe( 'Blocked' );

        fireEvent.click( button( cards( container )[ 1 ] ) );
        await settle();
        expect( opened.asked, 'Allow Access asked for the blocked camera too' ).toEqual( [ { audio: true, video: false } ] );
        expect( titles( container ) ).toEqual( [ 'Your browser blocks the camera for this site' ] );
    } );

    it( 'a camera another app holds says so at its Preview, with Try Again', async () => {
        const { container } = screen( {} );
        await settle();
        expect( cards( container ) ).toHaveLength( 0 );

        refuse( 'NotReadableError' );
        fireEvent.click( test( container, 'camera' ) );
        await settle();
        expect( titles( container ) ).toEqual( [ 'Another app is using your camera' ] );
        expect( cards( container )[ 0 ].querySelector( '.wplus-call-access-note' )?.textContent ).toBe( 'Close the other app that uses it, then press Try Again.' );
        expect( current( container, 'camera' ), 'a busy camera is allowed still' ).toBe( 'Default' );

        fireEvent.click( button( cards( container )[ 0 ] ) );
        await settle();
        expect( cards( container ) ).toHaveLength( 0 );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-preview' ) ).not.toBeNull();
    } );

    it( 'offer someone who only watches nothing to allow', async () => {
        access.camera = access.microphone = 'prompt';
        mediaAccess.set( 'camera', 'prompt' );
        mediaAccess.set( 'microphone', 'prompt' );
        const { container } = screen( { canPublish: false } );
        await settle();
        expect( cards( container ) ).toHaveLength( 0 );
    } );

    it( 'follow the browser as it allows a device in its own settings', async () => {
        access.camera = 'denied';
        mediaAccess.set( 'camera', 'denied' );
        const { container } = screen( {} );
        await settle();
        expect( current( container, 'camera' ) ).toBe( 'Blocked' );

        await answer( { camera: 'granted' } );
        expect( cards( container ) ).toHaveLength( 0 );
        expect( current( container, 'camera' ) ).toBe( 'Default' );
        expect( test( container, 'camera' ).textContent ).toBe( 'Preview' );
    } );
} );

describe( 'the dock\'s Configure', () => {
    const gear = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-configure-call' );

    it( 'stands before any device is allowed or listed, and is marked while the browser blocks one the user may send', async () => {
        access.camera = access.microphone = 'prompt';
        mediaAccess.set( 'camera', 'prompt' );
        mediaAccess.set( 'microphone', 'prompt' );
        const { container } = call( { devicesOnJoin: false } );
        await settle();
        expect( gear( container ), 'Configure went with no device listed' ).not.toBeNull();
        expect( gear( container )!.getAttribute( 'data-warning' ) ).toBeNull();

        await answer( { camera: 'denied' } );
        expect( gear( container )!.getAttribute( 'data-warning' ) ).toBe( '1' );

        await answer( { camera: 'granted' } );
        expect( gear( container )!.getAttribute( 'data-warning' ) ).toBeNull();
    } );

    it( 'is not marked for someone who only watches, nor for the camera on an audio call', async () => {
        access.camera = 'denied';
        mediaAccess.set( 'camera', 'denied' );
        const watching = call( { devicesOnJoin: false, canPublish: false } );
        await settle();
        expect( gear( watching.container )!.getAttribute( 'data-warning' ) ).toBeNull();
        watching.unmount();

        const audio = call( { devicesOnJoin: false }, 'group-audio' );
        await settle();
        expect( gear( audio.container )!.getAttribute( 'data-warning' ) ).toBeNull();
    } );
} );

describe( 'the own camera, where the self view is hidden', () => {
    // The device settings of a group video call whose layout hides the user's own tile, or shows it.
    const hidden = ( over: Parameters<typeof fakeCall>[ 0 ], hideSelf = true ) => {
        const made = fakeCall( over );
        const layout = { choice: { mode: 'auto' as const, hideNoVideo: false, hideSelf }, setChoice: () => {} };
        const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) => <LayoutChoiceContext.Provider value={ layout }>
            <CallContext.Provider value={ { ...made, ...more } }><DevicePanel video close={ () => {} } /></CallContext.Provider>
        </LayoutChoiceContext.Provider>;
        const rendered = render( draw() );
        return { ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
    };
    const live = ( container: HTMLElement ) => container.querySelector<HTMLElement>( '.wplus-call-device-preview[data-live]' );

    it( 'shows in its row the camera the call sends, as everyone sees it, opening nothing, and let go as the settings close', async () => {
        const camera = fakeTrack();
        const { container, unmount } = hidden( { myCameraTrack: camera } );
        await settle();

        const video = live( container )?.querySelector( 'video' ) ?? null;
        expect( video, 'no picture of the camera with the self view hidden' ).not.toBeNull();
        expect( row( container, 'camera' ).contains( video ) ).toBe( true );
        expect( camera.attached ).toContain( video );
        expect( live( container )!.textContent ).toBe( 'Everyone sees this' );
        expect( opened.asked, 'the camera was opened again for it' ).toHaveLength( 0 );

        unmount();
        expect( camera.attached, 'the picture held the camera after the settings closed' ).not.toContain( video );
    } );

    it( 'shows nothing of it with the self view shown, or the camera off, and follows the camera going on and off', async () => {
        const shown = hidden( { myCameraTrack: fakeTrack() }, false );
        await settle();
        expect( live( shown.container ), 'the camera shown twice, its tile and here' ).toBeNull();
        shown.unmount();

        const camera = fakeTrack();
        const { container, redraw } = hidden( {} );
        await settle();
        expect( live( container ) ).toBeNull();
        expect( test( container, 'camera' ).textContent, 'the camera off has no Preview' ).toBe( 'Preview' );

        redraw( { myCameraTrack: camera } );
        await settle();
        expect( camera.attached ).toContain( live( container )?.querySelector( 'video' ) );
        redraw( { myCameraTrack: null } );
        await settle();
        expect( live( container ) ).toBeNull();
        expect( camera.attached ).toHaveLength( 0 );
    } );
} );
