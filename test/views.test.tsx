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

    it( 'carries a warning mark while the upload is jammed, and says why on a hover, on focus and after a tap', () => {
        const { container, rerender } = render( <ConnectionStatus state="connected" quality="good" jammed /> );
        const badge = () => container.querySelector<HTMLElement>( '.wplus-connection-quality' )!;
        const tip = () => container.querySelector( '.wplus-call-jam-tip' );

        // The mark in the dot's place, the badge a button named by the jam, and the title said once; no words on screen.
        expect( badge().className ).toContain( 'wplus-upload-jammed' );
        expect( badge().querySelector( '.wplus-jam-icon' ) ).not.toBeNull();
        expect( badge().getAttribute( 'role' ) ).toBe( 'button' );
        expect( badge().getAttribute( 'tabindex' ) ).toBe( '0' );
        expect( badge().getAttribute( 'aria-label' ) ).toBe( 'Your upload is jammed' );
        expect( container.querySelector( '[role="status"]' )!.textContent ).toBe( 'Your upload is jammed' );
        expect( tip() ).toBeNull();
        // The node still calls the connection good: a badge that warns doesn't say so beside its mark.
        expect( badge().querySelector( ':scope > span' )!.textContent ).toBe( 'connected (poor)' );
        expect( badge().className ).toContain( 'wplus-quality-poor' );
        expect( badge().className ).not.toContain( 'wplus-quality-good' );

        // A mouse over it, and away.
        fireEvent.pointerEnter( badge(), { pointerType: 'mouse' } );
        expect( tip()!.textContent ).toContain( 'Your upload is jammed' );
        // what it may do to the call for the others, then what may help
        expect( tip()!.textContent ).toContain( 'Others may see your video freeze or hear your sound break up' );
        expect( tip()!.textContent ).toContain( 'Pausing other uploads on your network can help' );
        expect( badge().getAttribute( 'aria-describedby' ) ).toBe( tip()!.id );
        fireEvent.pointerLeave( badge(), { pointerType: 'mouse' } );
        expect( tip() ).toBeNull();

        // A finger: its enter opens nothing, its tap does, and a tap anywhere else closes it.
        fireEvent.pointerEnter( badge(), { pointerType: 'touch' } );
        expect( tip() ).toBeNull();
        fireEvent.click( badge() );
        expect( tip() ).not.toBeNull();
        expect( badge().getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        fireEvent.pointerDown( document.body );
        expect( tip() ).toBeNull();

        // The keyboard: focus shows it, Escape closes it, Enter opens it again, leaving closes it.
        fireEvent.focus( badge() );
        expect( tip() ).not.toBeNull();
        fireEvent.keyDown( badge(), { key: 'Escape' } );
        expect( tip() ).toBeNull();
        fireEvent.keyDown( badge(), { key: 'Enter' } );
        expect( tip() ).not.toBeNull();
        fireEvent.blur( badge() );
        expect( tip() ).toBeNull();

        // The jam over: the badge as it was, nothing said.
        fireEvent.click( badge() );
        rerender( <ConnectionStatus state="connected" quality="good" /> );
        expect( tip() ).toBeNull();
        expect( badge().className ).not.toContain( 'wplus-upload-jammed' );
        expect( badge().querySelector( '.wplus-jam-icon' ) ).toBeNull();
        expect( badge().getAttribute( 'role' ) ).toBeNull();
        expect( container.querySelector( '[role="status"]' )!.textContent ).toBe( '' );
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
