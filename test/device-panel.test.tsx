import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, DevicePanel, JOIN_PROMPT_MS } from '../src/calls.ts';
import { CallContext } from '../src/components/calls/context.ts';
import { cameras, microphones } from '../src/inc/calls/permissions.ts';
import { fakeCall, fakeTrack } from './fake-call.ts';

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

const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

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
        expect( opened.asked, 'Preview asked the browser for each on its own' ).toEqual( [ { audio: true, video: true } ] );
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

        // The camera alone: its preview in its row, the user's only.
        expect( test( container, 'camera' ).textContent ).toBe( 'Preview' );
        fireEvent.click( test( container, 'camera' ) );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: false, video: true } ] );
        expect( row( container, 'camera' ).querySelector( '.wplus-call-device-preview .wplus-call-devices-badge' )?.textContent ).toBe( 'Only you see this' );
        expect( test( container, 'camera' ).textContent ).toBe( 'Stop' );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-level' ), 'the camera\'s preview opened the microphone' ).toBeNull();

        // The microphone alone: its level, to be read rather than heard, and the camera's preview runs on.
        expect( test( container, 'microphone' ).textContent ).toBe( 'Test' );
        fireEvent.click( test( container, 'microphone' ) );
        await settle();
        expect( opened.asked ).toEqual( [ { audio: false, video: true }, { audio: true, video: false } ] );
        expect( row( container, 'microphone' ).querySelector( '.wplus-call-device-private' )?.textContent ).toBe( 'Speak to test. Nobody hears it.' );
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

    it( 'list the devices with the one in use ticked, and hand back the one chosen', async () => {
        const device = ( deviceId: string, label: string ) => ( { deviceId, label, kind: 'audioinput', groupId: '', toJSON: () => ( {} ) } ) as MediaDeviceInfo;
        microphones.set( 'default', device( 'default', 'MacBook Microphone' ) );
        microphones.set( 'usb', device( 'usb', 'USB Headset' ) );
        const chosen: string[] = [];
        const { container } = screen( { setSelectedMicrophoneDevice: ( ( id: string ) => void chosen.push( id ) ) as never } );
        await settle();

        const current = row( container, 'microphone' ).querySelector( '.wplus-call-device-current' )!;
        expect( current.textContent ).toBe( 'Same as system - MacBook Microphone' );
        fireEvent.click( current );

        const options = [ ...row( container, 'microphone' ).querySelectorAll( '[role="option"]' ) ];
        expect( options.map( ( o ) => o.textContent ) ).toEqual( [ 'Same as system - MacBook Microphone', 'USB Headset' ] );
        expect( options.map( ( o ) => o.getAttribute( 'aria-selected' ) ) ).toEqual( [ 'true', 'false' ] );

        fireEvent.click( options[ 1 ] );
        expect( chosen ).toEqual( [ 'usb' ] );
        expect( row( container, 'microphone' ).querySelector( '[role="listbox"]' ) ).toBeNull();
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
