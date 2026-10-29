// The views no screen's test reaches on its own (each view has its own tests on the fakes): the device switch, the
// ring's card, the connection status, the icon button, the presence dot and the resizable picture.
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers, IncomingCallCard, ConnectionStatus, IconButton, PresenceDot, Resizable } from '../src/index.ts';
import { DeviceSwitch } from '../src/calls.ts';

beforeEach( () => {
    configureUi( { translate: ( text ) => text } );
    setUiUsers( [ [ 34, { name: 'Ann', avatar: 'https://example.com/ann.png' } ] ] );
} );

afterEach( cleanup );

describe( 'the device switch', () => {
    const device = ( deviceId: string, label: string ) => ( { deviceId, label, kind: 'audioinput', groupId: '', toJSON: () => ( {} ) } ) as MediaDeviceInfo;

    it( 'lists the devices under its label, the system\'s default named, and hands back the one chosen', () => {
        const chosen: string[] = [];
        function Switch() {
            const [ selected, setSelected ] = useState( '' );
            return <DeviceSwitch label="Microphone" selectedDevice={ selected } setSelectedDevice={ ( value ) => { chosen.push( value as string ); setSelected( value ); } }
                devices={ new Map( [ [ 'default', device( 'default', 'MacBook Microphone' ) ], [ 'usb', device( 'usb', 'USB Headset' ) ] ] ) } />;
        }
        const { container } = render( <Switch /> );

        expect( container.querySelector( '.wplus-switch-device label' )?.textContent ).toBe( 'Microphone' );
        expect( [ ...container.querySelectorAll( 'option' ) ].map( ( o ) => o.textContent ) ).toEqual( [ 'Default', 'Same as system - MacBook Microphone', 'USB Headset' ] );

        fireEvent.change( container.querySelector( 'select' )!, { target: { value: 'usb' } } );
        expect( chosen ).toEqual( [ 'usb' ] );
        expect( container.querySelector( 'select' )?.value ).toBe( 'usb' );
    } );
} );

describe( 'the ring\'s card', () => {
    it( 'names the caller and the kind of call, and answers or rejects', () => {
        const onAnswer = vi.fn(), onReject = vi.fn();
        const { container, rerender } = render( <IncomingCallCard user_id={ 34 } type="video" onAnswer={ onAnswer } onReject={ onReject } /> );

        expect( container.querySelector( '.wplus-toast-site-call-title' )?.textContent ).toBe( 'Ann' );
        expect( container.querySelector( '.wplus-toast-site-call-text' )?.textContent ).toBe( 'Incoming Video Call' );
        fireEvent.click( container.querySelector( '.wplus-toast-site-call-action-answer' )! );
        fireEvent.click( container.querySelector( '.wplus-toast-site-call-action-reject' )! );
        expect( [ onAnswer.mock.calls.length, onReject.mock.calls.length ] ).toEqual( [ 1, 1 ] );

        rerender( <IncomingCallCard user_id={ 77 } name="Dora" type="audio" onAnswer={ onAnswer } onReject={ onReject } /> );
        expect( container.querySelector( '.wplus-toast-site-call-title' )?.textContent ).toBe( 'Dora' );
        expect( container.querySelector( '.wplus-toast-site-call-text' )?.textContent ).toBe( 'Incoming Audio Call' );
    } );
} );

describe( 'the connection status', () => {
    it( 'says the state with its quality, spins while connecting, and is bright for a moment after a change', async () => {
        vi.useFakeTimers();
        try {
            const { container, rerender } = render( <ConnectionStatus state="connecting" quality="unknown" /> );
            const span = () => container.querySelector( '.wplus-connection-quality' )!;
            expect( span().querySelector( '.wplus-svg-animate' ) ).not.toBeNull();
            expect( span().className ).toContain( 'wplus-opacity' );

            rerender( <ConnectionStatus state="connected" quality="good" /> );
            expect( span().textContent ).toBe( 'connected (good)' );
            expect( span().className ).toContain( 'wplus-quality-good' );
            expect( span().querySelector( '.wplus-svg-animate' ) ).toBeNull();

            await act( async () => { vi.advanceTimersByTime( 3100 ); } );
            expect( span().className ).not.toContain( 'wplus-opacity' );
        } finally {
            vi.useRealTimers();
        }
    } );
} );

describe( 'the icon button', () => {
    it( 'is labelled, latched when active, and does nothing while disabled', () => {
        const onClick = vi.fn();
        const { container, rerender } = render( <IconButton icon="mic" label="Mute" active onClick={ onClick } /> );
        const button = () => container.querySelector( '.wplus-icon-btn' )!;

        expect( button().getAttribute( 'aria-label' ) ).toBe( 'Mute' );
        expect( button().getAttribute( 'data-active' ) ).toBe( '1' );
        fireEvent.click( button() );
        expect( onClick ).toHaveBeenCalledTimes( 1 );

        rerender( <IconButton icon="mic" label="Mute" disabled onClick={ onClick } /> );
        fireEvent.click( button() );
        expect( onClick ).toHaveBeenCalledTimes( 1 );
    } );
} );

describe( 'the presence dot', () => {
    it( 'says the presence, offline when there is none, and wears a status\'s own colour only while not offline', () => {
        const { container, rerender } = render( <PresenceDot presence="away" color="#ff8800" /> );
        const dot = () => container.querySelector<HTMLElement>( '.wplus-presence-dot' )!;

        expect( dot().getAttribute( 'data-presence' ) ).toBe( 'away' );
        expect( dot().style.background ).toContain( 'ff8800' );

        rerender( <PresenceDot presence={ null } color="#ff8800" /> );
        expect( dot().getAttribute( 'aria-label' ) ).toBe( 'presence-offline' );
        expect( dot().style.background ).toBe( '' );
    } );
} );

describe( 'the resizable picture', () => {
    it( 'holds what it is given at its starting width and shape', () => {
        const { container } = render( <Resizable resizeDirection="top-left" initialWidth={ 160 } aspectRatio="16 / 9"><video className="own" /></Resizable> );

        expect( container.querySelector( 'video.own' ) ).not.toBeNull();
        expect( container.innerHTML ).toContain( '16 / 9' );
        expect( container.innerHTML ).toContain( '160' );
    } );
} );
