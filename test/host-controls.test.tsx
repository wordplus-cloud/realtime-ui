import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers, type UiConfirm } from '../src/index.ts';
import { CallScreen, HAND_SOUND_KEY, JOIN_ALERTS_KEY, type CallParticipant } from '../src/calls.ts';
import { HAND_AGAIN_MS, HAND_TOAST_MS, JOIN_TOAST_MS, REJOIN_MS } from '../src/components/calls/host-toasts.tsx';
import { fakeCall, participant } from './fake-call.ts';

// The chime's notes, counted in place of Web Audio.
const chimes = { notes: 0 };
class FakeAudioContext {
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createOscillator() {
        chimes.notes++;
        return { type: '', frequency: { value: 0 }, connect: ( to: unknown ) => to, start() {}, stop() {} };
    }
    createGain() {
        return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: ( to: unknown ) => to };
    }
}

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm: async () => false, showError: () => {} } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    window.localStorage.clear();
    chimes.notes = 0;
    ( window as unknown as { AudioContext: unknown } ).AudioContext = FakeAudioContext;
} );

afterEach( () => {
    cleanup();
    vi.useRealTimers();
    delete ( window as unknown as { AudioContext?: unknown } ).AudioContext;
} );

const people = ( ...more: Array<[ string, Partial<CallParticipant> ]> ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me', { name: 'Ben' } ) ],
    ...more.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ),
] );

const screen = ( over: Parameters<typeof fakeCall>[ 0 ] ) => {
    const call = fakeCall( { adminMode: true, ...over } );
    const draw = ( more: Parameters<typeof fakeCall>[ 0 ] = {} ) =>
        <CallScreen call={ { ...call, ...more, wrapper: createRef<HTMLDivElement>() as never } } layout="group-video" />;
    const rendered = render( draw() );
    return { call, ...rendered, redraw: ( more: Parameters<typeof fakeCall>[ 0 ] ) => rendered.rerender( draw( more ) ) };
};

const toasts = ( container: HTMLElement ) => Array.from( container.querySelectorAll( '.wplus-call-host-toast' ) ).map( ( el ) => el.textContent );

describe( 'a moderator\'s toasts', () => {
    const ann = ( extra: Partial<CallParticipant> = {} ): [ string, Partial<CallParticipant> ] => [ 'user_34', { name: 'Ann', ...extra } ];
    const cara: [ string, Partial<CallParticipant> ] = [ 'user_43', { name: 'Cara' } ];

    it( 'says nobody joined until Join Alerts is on, on this device', () => {
        const { container, redraw } = screen( { participants: people( cara ) } );
        redraw( { participants: people( cara, ann() ) } );
        expect( toasts( container ) ).toEqual( [] );
    } );

    it( 'says who joined after the moderator, in one toast for a few at once, and not who was already there', () => {
        vi.useFakeTimers();
        window.localStorage.setItem( JOIN_ALERTS_KEY, '1' );
        const { container, redraw } = screen( { participants: people( [ 'user_43', { name: 'Cara' } ] ) } );
        expect( toasts( container ) ).toEqual( [] );

        redraw( { participants: people( [ 'user_43', { name: 'Cara' } ], [ 'user_34', { name: 'Ann' } ] ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann joined' ] );

        redraw( { participants: people( [ 'user_43', { name: 'Cara' } ], [ 'user_34', { name: 'Ann' } ], [ 'user_50', { name: 'Dan' } ] ) } );
        redraw( { participants: people( [ 'user_43', { name: 'Cara' } ], [ 'user_34', { name: 'Ann' } ], [ 'user_50', { name: 'Dan' } ], [ 'user_51', { name: 'Eve <b>Pro</b>' } ] ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann and 2 others joined' ] );

        act( () => { vi.advanceTimersByTime( JOIN_TOAST_MS ); } );
        expect( toasts( container ) ).toEqual( [] );
    } );

    it( 'says who raised a hand, with a sound this device can turn off, until it is dismissed', () => {
        vi.useFakeTimers();
        const { container, redraw } = screen( { participants: people( [ 'user_34', { name: 'Ann' } ] ) } );

        redraw( { participants: people( [ 'user_34', { name: 'Ann', handRaised: true } ] ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann raised a hand' ] );
        expect( chimes.notes, 'no sound for the raised hand' ).toBe( 2 );

        fireEvent.click( container.querySelector( '.wplus-call-host-toast-close' )! );
        expect( toasts( container ) ).toEqual( [] );

        window.localStorage.setItem( HAND_SOUND_KEY, '0' );
        redraw( { participants: people( [ 'user_34', { name: 'Ann' } ] ) } );
        act( () => { vi.advanceTimersByTime( HAND_AGAIN_MS ); } );
        redraw( { participants: people( [ 'user_34', { name: 'Ann', handRaised: true } ] ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann raised a hand' ] );
        expect( chimes.notes, 'the sound played although it was turned off' ).toBe( 2 );

        act( () => { vi.advanceTimersByTime( HAND_TOAST_MS ); } );
        expect( toasts( container ) ).toEqual( [] );
    } );

    it( 'tells of a hand raised again within a minute neither by a toast nor by a sound', () => {
        vi.useFakeTimers();
        const { container, redraw } = screen( { participants: people( ann() ) } );

        redraw( { participants: people( ann( { handRaised: true } ) ) } );
        redraw( { participants: people( ann() ) } );
        expect( toasts( container ), 'a lowered hand kept its toast' ).toEqual( [] );

        for ( let i = 0; i < 5; i++ ) {
            act( () => { vi.advanceTimersByTime( 5000 ); } );
            redraw( { participants: people( ann( { handRaised: true } ) ) } );
            redraw( { participants: people( ann() ) } );
        }
        expect( chimes.notes, 'the hand going up and down rang more than once' ).toBe( 2 );

        act( () => { vi.advanceTimersByTime( HAND_AGAIN_MS ); } );
        redraw( { participants: people( ann( { handRaised: true } ) ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann raised a hand' ] );
        expect( chimes.notes ).toBe( 4 );
    } );

    it( 'keeps one toast for a person, and none for someone back within two minutes', () => {
        vi.useFakeTimers();
        window.localStorage.setItem( JOIN_ALERTS_KEY, '1' );
        const { container, redraw } = screen( { participants: people( cara ) } );

        redraw( { participants: people( cara, ann() ) } );
        redraw( { participants: people( cara, ann( { handRaised: true } ) ) } );
        expect( toasts( container ), 'Ann has a toast for joining and one for the hand' ).toEqual( [ 'Ann raised a hand' ] );

        redraw( { participants: people( cara ) } );
        expect( toasts( container ), 'the hand of someone who left still showed' ).toEqual( [] );

        act( () => { vi.advanceTimersByTime( REJOIN_MS - 1000 ); } );
        redraw( { participants: people( cara, ann() ) } );
        expect( toasts( container ), 'a reconnect was told as a join' ).toEqual( [] );

        redraw( { participants: people( cara ) } );
        act( () => { vi.advanceTimersByTime( REJOIN_MS ); } );
        redraw( { participants: people( cara, ann() ) } );
        expect( toasts( container ) ).toEqual( [ 'Ann joined' ] );
    } );

    it( 'tells a member nothing', () => {
        const { container, redraw } = screen( { adminMode: false, participants: people() } );
        redraw( { adminMode: false, participants: people( [ 'user_34', { name: 'Ann', handRaised: true } ] ) } );
        expect( container.querySelector( '.wplus-call-host-toasts' ) ).toBeNull();
    } );
} );

describe( 'Host Controls', () => {
    const open = async ( container: HTMLElement ) => {
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-host-controls' )! ); } );
    };

    it( 'ends the call for everyone only once the app dialog says so, and its Cancel ends nothing', async () => {
        let ended = 0;
        const asked: UiConfirm[] = [];
        let answer = false;
        configureUi( { confirm: async ( question ) => { asked.push( question ); return answer; } } );
        const { container } = screen( { participants: people( [ 'user_34', { name: 'Ann' } ] ), endForEveryone: async () => { ended++; } } );

        await open( container );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-end' )! ); } );
        expect( asked ).toEqual( [ {
            title: 'End the call for everyone?',
            message: 'Everyone leaves the call, you too.',
            confirm: 'End for Everyone',
            danger: true,
        } ] );
        // The menu made way for the dialog.
        expect( container.querySelector( '.wplus-call-moderation-room' ) ).toBeNull();
        expect( ended ).toBe( 0 );

        answer = true;
        await open( container );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-end' )! ); } );
        expect( asked ).toHaveLength( 2 );
        expect( ended ).toBe( 1 );
    } );

    it( 'shows the error of an end that failed', async () => {
        const shown: unknown[] = [];
        configureUi( { confirm: async () => true, showError: ( e ) => shown.push( e ) } );
        const { container } = screen( { participants: people(), endForEveryone: async () => { throw new Error( 'refused' ); } } );

        await open( container );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-room-end' )! ); } );
        expect( shown.map( ( e ) => ( e as Error ).message ) ).toEqual( [ 'refused' ] );
    } );

    it( 'has no End for Everyone where the call cannot end for everyone', async () => {
        const { container } = screen( { participants: people() } );
        await open( container );
        expect( container.querySelector( '.wplus-room-host-controls, .wplus-call-moderation-room' ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-room-end' ) ).toBeNull();
    } );

    it( 'turns the sound of a raised hand off and on, for this device', async () => {
        const { container } = screen( { participants: people() } );
        await open( container );

        const row = () => container.querySelector( '.wplus-room-hand-sound' )!;
        expect( row().getAttribute( 'aria-checked' ) ).toBe( 'true' );
        await act( async () => { fireEvent.click( row() ); } );
        expect( row().getAttribute( 'aria-checked' ) ).toBe( 'false' );
        expect( window.localStorage.getItem( HAND_SOUND_KEY ) ).toBe( '0' );
    } );

    it( 'turns the toasts of who joined on and off, for this device, off at first', async () => {
        const { container } = screen( { participants: people() } );
        await open( container );

        const row = () => container.querySelector( '.wplus-room-join-alerts' )!;
        expect( row().getAttribute( 'aria-checked' ) ).toBe( 'false' );
        await act( async () => { fireEvent.click( row() ); } );
        expect( row().getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( window.localStorage.getItem( JOIN_ALERTS_KEY ) ).toBe( '1' );
    } );
} );
