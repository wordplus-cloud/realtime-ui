import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { CallScreen, type CallParticipant } from '../src/calls.ts';
import { MUTED_HINT_HOLD_MS, MutedSpeech } from '../src/components/calls/muted-hint.tsx';
import { mediaAccess, microphones } from '../src/inc/calls/permissions.ts';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';

// The level of the microphone the hint opens, read by the test in place of Web Audio.
const mic = vi.hoisted( () => ( { readers: [] as Array<( level: number ) => void>, stops: 0 } ) );
vi.mock( '../src/inc/calls/mic-level.ts', () => ( {
    readLevel: ( _track: MediaStreamTrack, onReading: ( level: number ) => void ) => {
        mic.readers.push( onReading );
        return () => { mic.stops++; };
    },
} ) );

type Opened = { constraints: MediaStreamConstraints, track: { stop: ReturnType<typeof vi.fn>, readyState: string } };
let opened: Opened[] = [];
const allowedBefore = mediaAccess.get( 'microphone' );

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ] ] );
    opened = [];
    mic.readers.length = 0;
    mic.stops = 0;
    mediaAccess.set( 'microphone', 'granted' );
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: async ( constraints: MediaStreamConstraints ) => {
                const track = { stop: vi.fn(), readyState: 'live' };
                opened.push( { constraints, track } );
                return { getAudioTracks: () => [ track ], getTracks: () => [ track ] };
            },
        },
    } );
} );

afterEach( () => {
    cleanup();
    mediaAccess.set( 'microphone', allowedBefore ?? 'unknown' );
    delete ( navigator as { mediaDevices?: unknown } ).mediaDevices;
} );

const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );
const speak = ( readings: number, level = 0.7 ) => act( () => {
    for ( let i = 0; i < readings; i++ ) mic.readers[ mic.readers.length - 1 ]( level );
} );

// A call whose user had the microphone on and muted it, as the hint listens only then: `joinedMuted` draws one joined
// with the microphone off and never turned on.
const screen = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'private' | 'group-video' | 'group-audio' = 'group-video', joinedMuted = false ) => {
    const call = fakeCall( { mutedHint: true, ...over } );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } />;
    const rendered = render( draw( joinedMuted ? {} : { myMicrophoneTrack: fakeTrack() } ) );
    if ( ! joinedMuted ) rendered.rerender( draw() );
    return { call, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

const hint = ( container: HTMLElement ) => container.querySelector( '.wplus-call-muted-hint' );

describe( 'talking while muted', () => {
    it( 'counts half a second of a voice in the last one, and holds until four seconds after it', () => {
        const speech = new MutedSpeech();
        let now = 0;
        const read = ( level: number, others = false ) => speech.reading( level, others, now += 50 );

        for ( let i = 0; i < 20; i++ ) expect( read( 0.3 ) ).toBe( false );
        for ( let i = 0; i < 9; i++ ) read( 0.7 );
        expect( read( 0.3 ) ).toBe( false );
        expect( read( 0.7 ) ).toBe( true );
        const lastVoice = now;

        // The last second still holds the voice for up to a second after it stops, and the four seconds run from then.
        while ( now < lastVoice + MUTED_HINT_HOLD_MS ) read( 0.2 );
        expect( speech.talking ).toBe( true );
        while ( now < lastVoice + 1000 + MUTED_HINT_HOLD_MS ) read( 0.2 );
        expect( speech.talking ).toBe( false );
    } );

    it( 'does not count what is heard while someone else in the call speaks', () => {
        const speech = new MutedSpeech();
        let now = 0;
        for ( let i = 0; i < 20; i++ ) speech.reading( 0.8, true, now += 50 );
        expect( speech.talking ).toBe( false );
    } );

    it( 'says so over the dock, and Unmute lets go of its microphone before the call opens its own', async () => {
        const { call, container } = screen( {} );
        await settle();

        expect( opened.map( ( o ) => o.constraints ) ).toEqual( [ { audio: true } ] );
        expect( container.querySelector( '.wplus-call-muted-hint-region[role="status"]' ) ).not.toBeNull();
        expect( hint( container ) ).toBeNull();

        speak( 10 );
        expect( hint( container )?.textContent ).toContain( 'You are muted' );

        fireEvent.click( container.querySelector( '.wplus-call-muted-hint-unmute' )! );
        expect( opened[ 0 ].track.stop ).toHaveBeenCalled();
        expect( mic.stops ).toBe( 1 );
        expect( call.calls ).toEqual( [ 'enableMic' ] );
        expect( hint( container ) ).toBeNull();
    } );

    it( 'listens on the microphone the call uses, and lets go of it once the microphone is on', async () => {
        const { container, redraw } = screen( { selectedMicrophoneDevice: 'usb-mic' }, 'group-audio' );
        await settle();
        expect( opened.map( ( o ) => o.constraints ) ).toEqual( [ { audio: { deviceId: 'usb-mic' } } ] );

        speak( 12 );
        expect( hint( container ) ).not.toBeNull();

        redraw( { selectedMicrophoneDevice: 'usb-mic', myMicrophoneTrack: fakeTrack() } );
        await settle();
        expect( opened[ 0 ].track.stop ).toHaveBeenCalled();
        expect( hint( container ) ).toBeNull();
        expect( opened ).toHaveLength( 1 );
    } );

    it( 'stays quiet for a cough, and for the others heard from the speakers', async () => {
        const others = new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { isSpeaking: true } ) ] ] );
        const { container } = screen( { participants: others } );
        await settle();

        speak( 20 );
        expect( hint( container ) ).toBeNull();
    } );

    it( 'once dismissed, lets go of its microphone and says nothing more in this call', async () => {
        const { container } = screen( {}, 'private' );
        await settle();
        speak( 10 );
        expect( hint( container ) ).not.toBeNull();

        fireEvent.keyDown( container.querySelector( '.wplus-call-muted-hint-close' )!, { key: 'Enter' } );
        await settle();
        expect( hint( container ) ).toBeNull();
        expect( opened[ 0 ].track.stop ).toHaveBeenCalled();
        expect( opened ).toHaveLength( 1 );
    } );

    it( 'stays dismissed through a moderator\'s mute and a connection coming back, and is back in the next call', async () => {
        const { container, redraw } = screen( {} );
        await settle();
        speak( 10 );
        fireEvent.click( container.querySelector( '.wplus-call-muted-hint-close' )! );
        await settle();

        for ( const step of [ { myMicMuted: true }, {}, { connectionState: 'reconnecting' as const }, {} ] ) {
            redraw( step );
            await settle();
        }
        expect( opened, 'a dismissed hint listened again in the same call' ).toHaveLength( 1 );

        // The next call: the microphone on and muted again, and the hint listens again.
        redraw( { connectionState: 'disconnected' } );
        await settle();
        redraw( { myMicrophoneTrack: fakeTrack() } );
        redraw( {} );
        await settle();
        expect( opened ).toHaveLength( 2 );
        speak( 10 );
        expect( hint( container ) ).not.toBeNull();
    } );

    it( 'in a call between two, stays dismissed until the call is over', async () => {
        const { container, redraw } = screen( {}, 'private' );
        await settle();
        speak( 10 );
        fireEvent.click( container.querySelector( '.wplus-call-muted-hint-close' )! );
        await settle();

        redraw( { action: null } );
        await settle();
        redraw( { myMicrophoneTrack: fakeTrack() } );
        redraw( {} );
        await settle();
        expect( opened ).toHaveLength( 2 );
        speak( 10 );
        expect( hint( container ) ).not.toBeNull();
    } );

    it.each( [
        [ 'the site does not ask for it', { mutedHint: false } ],
        [ 'the microphone is on', { myMicrophoneTrack: fakeTrack() } ],
        [ 'a moderator keeps the microphone off', { myMicMuted: true } ],
        [ 'the user may not send', { canPublish: false } ],
        [ 'the group call is not joined yet', { connectionState: 'connecting' as const } ],
        [ 'the call is still ringing', { action: 'outgoing_call' as const }, 'private' as const ],
    ] )( 'opens no microphone where %s', async ( _where, over, layout = 'group-video' ) => {
        screen( over, layout );
        await settle();
        expect( opened ).toEqual( [] );
    } );

    it( 'opens no microphone the browser would ask for', async () => {
        mediaAccess.set( 'microphone', 'prompt' );
        screen( {} );
        await settle();
        expect( opened ).toEqual( [] );
    } );

    it( 'opens no microphone on a join with it off, before the user has had it on in the call', async () => {
        const { redraw } = screen( {}, 'group-video', true );
        await settle();
        expect( opened, 'the hint opened a microphone as the call was joined muted' ).toEqual( [] );

        redraw( { myMicrophoneTrack: fakeTrack() } );
        await settle();
        redraw( {} );
        await settle();
        expect( opened.map( ( o ) => o.constraints ) ).toEqual( [ { audio: true } ] );
    } );

    it( 'opens its microphone where the browser said it allowed it after the first draw, before the hint listened', async () => {
        mediaAccess.set( 'microphone', 'prompt' );
        // Drawn after the call, before any of its effects: where the permissions read of the page's load lands.
        function AllowedMeanwhile() {
            mediaAccess.set( 'microphone', 'granted' );
            return null;
        }
        const call = fakeCall( { mutedHint: true } );
        const draw = ( more: Parameters<typeof fakeCall>[ 0 ] ) =>
            <><CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" /><AllowedMeanwhile /></>;
        const { rerender } = render( draw( { myMicrophoneTrack: fakeTrack() } ) );
        rerender( draw( {} ) );
        await settle();
        expect( opened.map( ( o ) => o.constraints ), 'the hint missed the browser allowing the microphone' ).toEqual( [ { audio: true } ] );
    } );

    it( 'says so in the device settings while they lie over the dock and hide it', async () => {
        // The settings read the browser again as they open, which a test page answers with nothing: a labelled
        // microphone is one the browser allowed.
        microphones.set( 'default', { deviceId: 'default', label: 'MacBook Microphone', kind: 'audioinput', groupId: '', toJSON: () => ( {} ) } as MediaDeviceInfo );
        // The camera's preview the settings open with: happy-dom takes only its own MediaStream.
        Object.defineProperty( HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return null; }, set() {} } );
        try {
            // Joined muted, the settings opened from the notice's Preview, then the microphone on and muted again from
            // the dock: the hint listens from then on, and the row it is about says it.
            const { container, redraw } = screen( { devicesOnJoin: true }, 'group-video', true );
            await settle();
            fireEvent.click( container.querySelector( '.wplus-call-join-prompt-preview' )! );
            await settle();
            const row = () => container.querySelector( '.wplus-call-devices .wplus-call-device[data-kind="microphone"]' )!;
            expect( row().querySelector( '.wplus-call-device-status' )?.textContent ).toBe( 'Nobody hears you' );

            redraw( { myMicrophoneTrack: fakeTrack() } );
            await settle();
            redraw( {} );
            await settle();
            expect( row().querySelector( '.wplus-call-device-note' ) ).toBeNull();
            speak( 10 );
            expect( row().querySelector( '.wplus-call-device-note[data-tone="talking"]' )?.textContent ).toBe( 'You are muted' );
        } finally {
            microphones.clear();
        }
    } );
} );
