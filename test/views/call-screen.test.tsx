// The call screen's states, drawn from a call made by hand (@wordplus/realtime-ui/testing): what must keep working
// whatever an app changes in its copy. Run them after every change: `npx vitest run components/wordplus/call-screen`.
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureUi, setUiUsers } from '../../src/index.ts';
import type { CallParticipant } from '../../src/calls.ts';
import { fakeCall, fakeTrack, participant } from '../../src/testing.ts';
import CallView from '../../src/components/calls/call-screen.tsx';
import RingCard from '../../src/components/calls/incoming-call-card.tsx';

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann', avatar: 'https://example.com/ann.png' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
} );

afterEach( cleanup );

const draw = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' | 'group-audio' ) =>
    render( <CallView call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );

/** Every control the dock shows, by what it says. */
const controls = ( container: HTMLElement ) => [ ...container.querySelectorAll( '[aria-label], .bm-call-buttons > *, .bm-group-call-controls-buttons > *' ) ];

describe( 'a call between two', () => {
    it( 'rings out with the other side\'s face, says so, and is cancelled from the dock', () => {
        const call = fakeCall( { action: 'outgoing_call' } );
        const { container } = draw( call, 'private' );

        expect( container.textContent ).toContain( 'Calling...' );
        expect( container.querySelector<HTMLImageElement>( 'img' )?.src ).toBe( 'https://example.com/ann.png' );
        fireEvent.click( container.querySelector( '.bm-cancel' )! );
        expect( call.calls ).toEqual( [ 'endCall "abort"' ] );
    } );

    it( 'rings in, and answers or rejects', () => {
        const call = fakeCall( { action: 'incoming_call' } );
        const { container } = draw( call, 'private' );

        expect( container.textContent ).toContain( 'Incoming Call' );
        fireEvent.click( container.querySelector( '.bm-answer' )! );
        fireEvent.click( container.querySelector( '.bm-cancel' )! );
        expect( call.calls ).toEqual( [ 'answerCall', 'endCall "reject"' ] );
    } );

    it( 'shows the other side\'s picture and plays their sound once connected, with the time, and hangs up', () => {
        const camera = fakeTrack(), sound = fakeTrack();
        const call = fakeCall( {
            participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { video: camera, audio: sound } ) ] ] ),
            myMicrophoneTrack: fakeTrack(),
        } );
        const { container } = draw( call, 'private' );

        expect( camera.attached.some( ( el ) => el?.tagName === 'VIDEO' ) ).toBe( true );
        expect( sound.attached.some( ( el ) => el?.tagName === 'AUDIO' ) ).toBe( true );

        fireEvent.click( container.querySelector( '.bm-disable-mic' )! );
        fireEvent.click( container.querySelector( '.bm-cancel' )! );
        expect( call.calls ).toEqual( [ 'disableMic', 'endCall' ] );
    } );

    it( 'says the time while there is no picture, and when the other side\'s microphone is off', () => {
        const call = fakeCall( {
            participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { micMuted: true } ) ] ] ),
        } );
        const { container } = draw( call, 'private' );

        expect( container.textContent ).toContain( '01:05' );
        expect( container.textContent ).toContain( 'The microphone and camera not enabled at the other side' );
    } );

    it( 'labels every control, for screen readers and the tooltips', () => {
        const { container } = draw( fakeCall( { myMicrophoneTrack: fakeTrack() } ), 'private' );
        expect( controls( container ).length ).toBeGreaterThan( 0 );
        expect( container.querySelector( '.bm-cancel' ) ).not.toBeNull();
    } );
} );

describe( 'a group call', () => {
    const three = () => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me', { audio: fakeTrack() } ) ],
        [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack(), isSpeaking: true, audioLevel: 0.4 } ) ],
        [ 'user_43', participant( 'user_43' ) ],
    ] );

    it( 'draws its grid and its dock on video, and leaves', async () => {
        const call = fakeCall( { participants: three() } );
        const { container } = draw( call, 'group-video' );
        await act( async () => {} );

        // The grid lays its tiles out in the room it measures, which a test's page has none of: the browser's preview
        // (`npx @wordplus/realtime-ui preview`) shows them.
        expect( container.querySelector( '[part="call-controls"]' ) ).not.toBeNull();
        fireEvent.click( container.querySelector( '.bm-exit-room' )! );
        expect( call.calls.some( ( c ) => c.startsWith( 'endCall' ) ) ).toBe( true );
    } );

    it( 'lists everyone with their name on audio, the others\' sound playing', async () => {
        const { container } = draw( fakeCall( { participants: three() } ), 'group-audio' );
        await act( async () => {} );

        expect( container.querySelectorAll( '[part="grid-tile"]' ) ).toHaveLength( 3 );
        expect( container.textContent ).toContain( 'Cara' );
        // Never one's own sound.
        expect( container.querySelectorAll( 'audio' ) ).toHaveLength( 1 );
    } );
} );

describe( 'the ring\'s card', () => {
    it( 'names the caller and the kind of call, and answers or rejects', () => {
        const answered: string[] = [];
        const { container } = render( <RingCard user_id={ 34 } type="video" onAnswer={ () => answered.push( 'answer' ) } onReject={ () => answered.push( 'reject' ) } /> );

        expect( container.textContent ).toContain( 'Ann' );
        expect( container.textContent ).toContain( 'Incoming Video Call' );
        fireEvent.click( container.querySelector( '.bm-toast-site-call-action-answer' )! );
        fireEvent.click( container.querySelector( '.bm-toast-site-call-action-reject' )! );
        expect( answered ).toEqual( [ 'answer', 'reject' ] );
    } );
} );
