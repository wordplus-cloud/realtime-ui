// A call's keyboard shortcuts (call-keys.tsx, inc/calls/keys.ts): Alt (Option) and a letter press the dock's controls
// on every layout, held Space talks while muted, each named in its control's tooltip and no list of them apart, never
// while the user types, and one call screen at a time.
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { LAYOUT_KEY, type CallParticipant } from '../src/calls.ts';
import { fakeCall, fakeTrack, participant } from '../src/testing.ts';
import CallView from '../src/components/calls/call-screen.tsx';
import CallControl from '../src/components/calls/call-control.tsx';
import { DockMore } from '../src/components/calls/call-dock.tsx';
import type { Pieces } from '../src/pieces.tsx';
import { SHORTCUTS, ariaKeys, keyName, letterOf, shortcutOf, talkKeyAt, typingIn } from '../src/inc/calls/keys.ts';
import { ownTooltips } from '../src/inc/floater.ts';
import { setOwnTooltips } from '../src/inc/shared-parts.ts';

// What a test turns on for its call: picture in picture in the browser, and a phone (Switch Camera).
const device = vi.hoisted( () => ( { pip: false, mobile: false } ) );

// The dock as a computer with a microphone, a camera and screen sharing draws it.
vi.mock( '../src/inc/calls/permissions.ts', async ( original ) => ( {
    ...await original<typeof import( '../src/inc/calls/permissions.ts' )>(),
    screenShareSupport: true,
    useConfigAvailable: () => true,
    get pictureInPictureSupport() { return device.pip; },
} ) );

vi.mock( '../src/inc/functions/browser-info.ts', async ( original ) => ( {
    ...await original<typeof import( '../src/inc/functions/browser-info.ts' )>(),
    isMobile: () => device.mobile,
} ) );

const confirm = vi.fn( async ( _question: unknown ) => true );

beforeEach( () => {
    device.pip = false;
    device.mobile = false;
    confirm.mockClear();
    window.localStorage.clear();
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { enumerateDevices: async () => [], getUserMedia: vi.fn( async () => { throw new Error( 'no device' ); } ) },
    } );
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', confirm } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ] ] );
    setOwnTooltips( ownTooltips() );
} );

afterEach( () => {
    cleanup();
    document.querySelectorAll( '.realtime-tooltip' ).forEach( ( shown ) => shown.remove() );
    setOwnTooltips( undefined );
} );

const draw = ( call: ReturnType<typeof fakeCall>, layout: 'private' | 'group-video' | 'group-audio', props: { shortcuts?: boolean, components?: Pieces } = {} ) =>
    render( <CallView call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } { ...props } /> );

/** Alt and a letter as Windows sends it: the letter typed. */
const alt = ( letter: string, on: EventTarget = document.body, extra: Partial<KeyboardEventInit> = {} ) =>
    fireEvent.keyDown( on, { key: letter, code: 'Key' + letter.toUpperCase(), altKey: true, ...extra } );

const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

const tip = () => [ ...document.querySelectorAll( '.realtime-tooltip' ) ].map( ( t ) => t.textContent ).join( '|' );

const inCall = ( over: Parameters<typeof fakeCall>[ 0 ] = {} ) => fakeCall( {
    participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { video: fakeTrack(), audio: fakeTrack() } ) ] ] ),
    ...over,
} );

describe( 'the keys', () => {
    it( 'are Alt and a letter on Windows, Option and the key on a Mac, AltGr and Shift never', () => {
        expect( shortcutOf( { key: 'a', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( 'mic' );
        // A Mac's Option types å: the key's place says A.
        expect( shortcutOf( { key: 'å', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( 'mic' );
        expect( shortcutOf( { key: '√', code: 'KeyV', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( 'camera' );
        expect( shortcutOf( { key: 'œ', code: 'KeyQ', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( 'leave' );
        // Option+U is a dead key on a Mac (it waits to put ¨ on the next letter).
        expect( shortcutOf( { key: 'Dead', code: 'KeyU', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( 'people' );
        // AltGr is Ctrl and Alt on Windows (AltGr+Q types @ on a German keyboard).
        expect( shortcutOf( { key: '@', code: 'KeyQ', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false }, null ) ).toBe( null );
        expect( shortcutOf( { key: 'A', code: 'KeyA', altKey: true, ctrlKey: false, metaKey: false, shiftKey: true }, null ) ).toBe( null );
        expect( shortcutOf( { key: 'a', code: 'KeyA', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( null );
        expect( shortcutOf( { key: 'x', code: 'KeyX', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, null ) ).toBe( null );
    } );

    it( 'follow the label on the key where the browser knows the layout, and the Latin letter of a Cyrillic key', () => {
        // AZERTY: the key labelled A sits where a US keyboard has Q.
        const azerty = new Map( [ [ 'KeyQ', 'a' ], [ 'KeyA', 'q' ] ] );
        expect( letterOf( { key: 'æ', code: 'KeyQ' }, azerty ) ).toBe( 'a' );
        expect( letterOf( { key: 'ф', code: 'KeyA' }, new Map( [ [ 'KeyA', 'ф' ] ] ) ) ).toBe( 'a' );
        expect( letterOf( { key: 'ф', code: 'KeyA' }, null ) ).toBe( 'a' );
        expect( letterOf( { key: 'Dead', code: 'Digit1' }, null ) ).toBe( null );
    } );

    it( 'are named as each keyboard shows them', () => {
        expect( keyName( 'mic', false ) ).toBe( 'Alt+A' );
        expect( keyName( 'mic', true ) ).toBe( '⌥A' );
        expect( keyName( 'settings', false ) ).toBe( 'Alt+C' );
    } );

    it( 'tell typing from a press, and where Space talks', () => {
        const call = document.createElement( 'div' );
        const inside = document.createElement( 'div' );
        const button = document.createElement( 'span' );
        button.setAttribute( 'role', 'button' );
        call.append( inside, button );
        document.body.append( call );
        const field = ( html: string ) => {
            const holder = document.createElement( 'div' );
            holder.innerHTML = html;
            document.body.append( holder );
            return holder.firstElementChild!;
        };

        expect( typingIn( field( '<input type="text">' ) ) ).toBe( true );
        expect( typingIn( field( '<input>' ) ) ).toBe( true );
        expect( typingIn( field( '<textarea></textarea>' ) ) ).toBe( true );
        expect( typingIn( field( '<div contenteditable="true"><p>hi</p></div>' ).firstElementChild ) ).toBe( true );
        expect( typingIn( field( '<div role="textbox"></div>' ) ) ).toBe( true );
        expect( typingIn( field( '<input type="checkbox">' ) ) ).toBe( false );
        expect( typingIn( button ) ).toBe( false );
        // The focus stays in the device settings' menu once a device is chosen: the shortcuts still work, and Space there
        // opens the menu rather than talking.
        expect( typingIn( field( '<select></select>' ) ) ).toBe( false );
        expect( talkKeyAt( field( '<select></select>' ), [ document.body ] ) ).toBe( false );

        expect( talkKeyAt( document.body, [ call ] ) ).toBe( true );
        expect( talkKeyAt( inside, [ call ] ) ).toBe( true );
        expect( talkKeyAt( button, [ call ] ) ).toBe( false );
        expect( talkKeyAt( field( '<div tabindex="0"></div>' ), [ call ] ) ).toBe( false );
        // A control the pointer pressed keeps the focus: Space talks there, on the call alone.
        expect( talkKeyAt( button, [ call ], button ) ).toBe( true );
        const outside = field( '<span role="button"></span>' );
        expect( talkKeyAt( outside, [ call ], outside ) ).toBe( false );
        call.remove();
    } );
} );

describe( 'a call between two', () => {
    it( 'turns the microphone, the camera and the screen, and opens the devices', async () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack(), myCameraTrack: fakeTrack() } );
        const { container } = draw( call, 'private' );

        alt( 'a' );
        alt( 'v' );
        alt( 's' );
        expect( call.calls ).toEqual( [ 'disableMic', 'disableCamera', 'enableShareScreen' ] );

        alt( 'c' );
        expect( container.querySelector( '.wplus-call-devices' ) ).not.toBe( null );
        alt( 'c' );
        expect( container.querySelector( '.wplus-call-devices' ) ).toBe( null );
    } );

    it( 'asks before it leaves', async () => {
        const call = inCall();
        draw( call, 'private' );

        confirm.mockResolvedValueOnce( false );
        alt( 'q' );
        await settle();
        expect( call.calls ).toEqual( [] );

        alt( 'q' );
        await settle();
        expect( confirm ).toHaveBeenCalledTimes( 2 );
        expect( confirm.mock.calls[ 1 ][ 0 ] ).toMatchObject( { title: 'Leave the call?', confirm: 'Leave', danger: true } );
        expect( call.calls ).toEqual( [ 'endCall' ] );
    } );

    it( 'leaves through the call as it is drawn once answered, where the dialog drew it anew', async () => {
        const call = inCall();
        let answer: ( yes: boolean ) => void = () => {};
        confirm.mockImplementationOnce( () => new Promise<boolean>( ( resolve ) => { answer = resolve; } ) );
        const wrapper = createRef<HTMLDivElement>() as never;
        const { rerender } = render( <CallView key="first" call={ { ...call, wrapper } } layout="private" /> );

        alt( 'q' );
        // Asked once at a time, however often the key is pressed.
        alt( 'q' );
        rerender( <CallView key="second" call={ { ...call, wrapper } } layout="private" /> );
        await act( async () => { answer( true ); } );
        expect( confirm ).toHaveBeenCalledTimes( 1 );
        expect( call.calls ).toEqual( [ 'endCall' ] );
    } );

    it( 'cancels a call ringing out', async () => {
        const call = fakeCall( { action: 'outgoing_call' } );
        draw( call, 'private' );

        alt( 'q' );
        await settle();
        expect( call.calls ).toEqual( [ 'endCall "abort"' ] );
    } );

    it( 'names the key in the tooltip and to a screen reader', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const { container } = draw( call, 'private' );
        const mic = container.querySelector( '.wplus-disable-mic' )!;

        expect( mic.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+A' );
        expect( mic.getAttribute( 'aria-label' ) ).toBe( 'Disable Microphone' );
        expect( container.querySelector( '.wplus-configure-call' )?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+C' );
        expect( container.querySelector( '.wplus-cancel' )?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+Q' );

        fireEvent.mouseEnter( mic );
        expect( tip() ).toBe( 'Disable Microphone (' + keyName( 'mic' ) + ')' );
        fireEvent.mouseLeave( mic );
    } );

    it( 'names held Space in the tooltip of a microphone that is off', () => {
        const { container } = draw( inCall(), 'private' );
        const mic = container.querySelector( '.wplus-enable-mic' )!;

        fireEvent.mouseEnter( mic );
        expect( tip() ).toBe( 'Enable Microphone (' + keyName( 'mic' ) + ', hold Space to talk)' );
        fireEvent.mouseLeave( mic );

        // A microphone a moderator holds turns on with neither.
        cleanup();
        const held = draw( inCall( { myMicMuted: true } ), 'group-video' );
        const locked = held.container.querySelector( '.wplus-mic-locked' )!;
        fireEvent.mouseEnter( locked );
        expect( tip() ).not.toContain( 'Space' );
    } );

    it( 'never fires while the user types', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        draw( call, 'private' );
        const composer = document.createElement( 'div' );
        composer.contentEditable = 'true';
        const input = document.createElement( 'input' );
        document.body.append( composer, input );

        alt( 'a', composer );
        alt( 'a', input );
        expect( call.calls ).toEqual( [] );

        composer.remove();
        input.remove();
    } );

    it( 'finds our controls where an app\'s controls piece moved them, and gives the app\'s own button no key', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const raise = vi.fn();
        const { container } = render( <CallView call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="private" components={ {
            controls: ( buttons ) => [
                <CallControl key="raise" icon="raisehand" label="Raise hand" onClick={ raise } className="my-raise" />,
                ...[ ...buttons ].reverse(),
            ],
        } } /> );

        alt( 'a' );
        expect( call.calls ).toEqual( [ 'disableMic' ] );
        expect( container.querySelector( '.my-raise' )?.hasAttribute( 'aria-keyshortcuts' ) ).toBe( false );
        expect( container.querySelector( '.wplus-disable-mic' )?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+A' );
        expect( raise ).not.toHaveBeenCalled();
    } );

    it( 'does nothing while switched off', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const { container } = draw( call, 'private', { shortcuts: false } );

        alt( 'a' );
        expect( call.calls ).toEqual( [] );
        expect( container.querySelector( '.wplus-disable-mic' )?.hasAttribute( 'aria-keyshortcuts' ) ).toBe( false );
    } );
} );

const sleep = ( ms: number ) => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, ms ) ); } );

/**
 * A call as a host keeps it (Better Messages' call container): enableMic opens the microphone `opens` ms on and answers
 * before the host draws the call again with it, as a state set outside an event is drawn later, and each render's
 * disableMic knows only the microphone of that render, so the one from before it opened turns nothing off.
 */
function micHost( opens: number, layout: 'group-video' | 'private' = 'group-video' ) {
    const calls: string[] = [];
    const wrapper = createRef<HTMLDivElement>() as never;
    const held: { current: ReturnType<typeof fakeTrack> | null } = { current: null };
    let screen: ReturnType<typeof render> | null = null;
    const redraw = () => setTimeout( () => {
        if ( screen!.container.isConnected ) act( () => screen!.rerender( view( held.current ) ) );
    }, 0 );
    const view = ( track: ReturnType<typeof fakeTrack> | null ) => {
        const call = inCall( {
            myMicrophoneTrack: track,
            myMicrophoneTrackRef: held as never,
            enableMic: async () => {
                calls.push( 'enableMic' );
                await new Promise( ( resolve ) => setTimeout( resolve, opens ) );
                held.current = fakeTrack();
                redraw();
            },
            disableMic: async () => {
                if ( ! track ) return;
                calls.push( 'disableMic' );
                held.current = null;
                redraw();
            },
            enableCamera: async () => {
                calls.push( 'enableCamera' );
            },
        } );
        return <CallView call={ { ...call, wrapper } } layout={ layout } />;
    };
    screen = render( view( null ) );
    return { calls, on: () => !! held.current, container: screen.container };
}

const space = ( on: EventTarget = document.body, extra: Partial<KeyboardEventInit> = {} ) =>
    fireEvent.keyDown( on, { key: ' ', code: 'Space', ...extra } );
const spaceUp = ( on: EventTarget = document.body ) => fireEvent.keyUp( on, { key: ' ', code: 'Space' } );

describe( 'holding Space', () => {
    it( 'talks while it is held, and mutes as it is let go', async () => {
        const host = micHost( 0 );

        space();
        space( document.body, { repeat: true } );
        expect( host.calls ).toEqual( [ 'enableMic' ] );
        await sleep( 20 );
        expect( host.on() ).toBe( true );

        spaceUp();
        await sleep( 20 );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic' ] );
        expect( host.on() ).toBe( false );
    } );

    it( 'let go before the microphone opened, turns it off once it is on', async () => {
        // A microphone takes a while to open, seconds with the noise removal chosen: a tap of Space left it on.
        const host = micHost( 40 );

        space();
        spaceUp();
        await sleep( 120 );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic' ] );
        expect( host.on() ).toBe( false );
    } );

    it( 'pressed again before the microphone opened, keeps it on until let go', async () => {
        const host = micHost( 40 );

        space();
        spaceUp();
        space();
        await sleep( 120 );
        expect( host.calls ).toEqual( [ 'enableMic' ] );
        expect( host.on() ).toBe( true );

        spaceUp();
        await sleep( 20 );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic' ] );
    } );

    it( 'let go of a microphone that never opened, talks again with the next press', async () => {
        // The fake call's enableMic opens nothing, as a device refused does.
        const call = inCall();
        draw( call, 'group-video' );

        space();
        spaceUp();
        await settle();
        space();
        expect( call.calls ).toEqual( [ 'enableMic', 'enableMic' ] );
        spaceUp();
    } );

    it( 'talks on a control the pointer pressed, which keeps the focus, and lets the keyboard\'s press theirs', async () => {
        const host = micHost( 0 );
        const camera = () => host.container.querySelector<HTMLElement>( '.wplus-enable-video' )!;

        // Pressed with the pointer: the camera keeps the focus, and its own Space would turn it on.
        fireEvent.pointerDown( camera() );
        camera().focus();
        expect( document.activeElement ).toBe( camera() );
        space( camera() );
        expect( host.calls ).toEqual( [ 'enableMic' ] );
        // It lets the focus go, so the next press lands on the call too.
        expect( document.activeElement ).not.toBe( camera() );
        await sleep( 20 );
        spaceUp();
        await sleep( 20 );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic' ] );

        // Reached by the keyboard: Space presses it.
        fireEvent.keyDown( document.body, { key: 'Tab', code: 'Tab' } );
        camera().focus();
        space( camera() );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic', 'enableCamera' ] );
        expect( document.activeElement ).toBe( camera() );
    } );

    it( 'talks on the microphone the pointer turned off', async () => {
        const host = micHost( 0, 'private' );
        const mic = () => host.container.querySelector<HTMLElement>( '.wplus-enable-mic, .wplus-disable-mic' )!;

        fireEvent.pointerDown( mic() );
        mic().focus();
        fireEvent.click( mic() );
        await sleep( 20 );
        expect( host.on() ).toBe( true );
        fireEvent.pointerDown( mic() );
        mic().focus();
        fireEvent.click( mic() );
        await sleep( 20 );
        expect( host.on() ).toBe( false );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic' ] );

        // Held Space on it talks, and letting go mutes: it used to press the microphone on for good.
        space( document.activeElement ?? document.body );
        space( document.activeElement ?? document.body, { repeat: true } );
        await sleep( 20 );
        expect( host.on() ).toBe( true );
        spaceUp( document.activeElement ?? document.body );
        await sleep( 20 );
        expect( host.on() ).toBe( false );
        expect( host.calls ).toEqual( [ 'enableMic', 'disableMic', 'enableMic', 'disableMic' ] );
    } );

    it( 'leaves an open microphone, a focused control and a field alone', () => {
        const open = inCall( { myMicrophoneTrack: fakeTrack() } );
        const { container, unmount } = draw( open, 'group-video' );
        fireEvent.keyDown( document.body, { key: ' ', code: 'Space' } );
        expect( open.calls ).toEqual( [] );
        unmount();

        const muted = inCall();
        const second = draw( muted, 'group-video' );
        fireEvent.keyDown( second.container.querySelector( '.wplus-enable-video' )!, { key: ' ', code: 'Space' } );
        // The control's own Space pressed it: the camera, not the microphone.
        expect( muted.calls ).toEqual( [ 'enableCamera' ] );
        void container;
    } );

    it( 'never turns on a microphone a moderator holds', () => {
        const call = inCall( { myMicMuted: true } );
        draw( call, 'group-video' );

        fireEvent.keyDown( document.body, { key: ' ', code: 'Space' } );
        expect( call.calls ).toEqual( [] );
    } );
} );

describe( 'a group call', () => {
    it( 'raises and lowers the hand where the call takes hands', async () => {
        const call = inCall( { canPublish: false, callMode: 'broadcast' } );
        draw( call, 'group-video' );

        alt( 'y' );
        await settle();
        expect( call.calls ).toEqual( [ 'raiseHand' ] );
    } );

    it( 'opens and closes the participants with Alt+U where the call offers them, and names the key on the button', () => {
        // Everyone on the stage: no Participants, so Alt+U opens nothing.
        const small = draw( inCall(), 'group-video' );
        expect( small.container.querySelector( '.wplus-call-people-toggle' ) ).toBeNull();
        alt( 'u' );
        expect( small.container.querySelector( '.wplus-call-people' ), 'Alt+U opened a list the call does not offer' ).toBeNull();
        small.unmount();

        // The user's own tile hidden: someone is off the stage, and Participants is offered.
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );
        const call = inCall();
        const { container } = draw( call, 'group-video' );
        const toggle = () => container.querySelector( '.wplus-call-people-toggle' );

        expect( toggle()?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+U' );
        expect( toggle()?.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
        alt( 'u' );
        expect( toggle()?.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        alt( 'u' );
        expect( toggle()?.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
    } );

    it( 'has no camera on an audio call', () => {
        const call = inCall();
        draw( call, 'group-audio' );

        alt( 'v' );
        alt( 'a' );
        expect( call.calls ).toEqual( [ 'enableMic' ] );
    } );

    it( 'leaves through the dock\'s Exit Chat', async () => {
        const call = inCall();
        draw( call, 'group-audio' );

        alt( 'q' );
        await settle();
        expect( call.calls ).toEqual( [ 'endCall' ] );
    } );
} );

describe( 'More', () => {
    // An app's controls piece putting the dock's controls with these labels in More whatever the room.
    const inMore = ( ...labels: string[] ) => ( { components: {
        controls: ( buttons: React.ReactElement[] ) => {
            const moved = ( b: React.ReactElement ) => labels.includes( ( b.props as { content?: string } ).content ?? '' );
            return [ <DockMore key="more">{ buttons.filter( moved ) }</DockMore>, ...buttons.filter( ( b ) => ! moved( b ) ) ];
        },
    } as Pieces } );

    it( 'holds no Keyboard Shortcuts, and ? opens nothing', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const { container } = draw( call, 'group-video' );

        fireEvent.click( container.querySelector( '.wplus-call-more' )! );
        const menu = container.querySelector( '.wplus-call-more-menu' )!;
        expect( menu.textContent ).not.toContain( 'Keyboard Shortcuts' );
        expect( menu.querySelector( '[aria-keyshortcuts="?"]' ) ).toBe( null );

        fireEvent.keyDown( document.body, { key: '?', code: 'Slash', shiftKey: true } );
        expect( document.querySelector( '[role="dialog"]' ), '? opened something' ).toBe( null );
    } );

    it( 'is no button where it would hold nothing, the row keeping the call\'s own controls', () => {
        const { container } = draw( inCall(), 'group-audio' );
        const dock = container.querySelector( '.wplus-group-call-controls-buttons' )!;

        expect( dock.querySelector( '.wplus-call-more' ), 'More with nothing in it' ).toBe( null );
        expect( [ ...dock.children ].at( -1 )?.className ).toContain( 'wplus-exit-room' );
    } );

    it( 'is its one control\'s own button where it would hold one, with its tooltip and its key, and More again with two', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const { container, unmount } = draw( call, 'private', inMore( 'Device Settings' ) );
        const dock = container.querySelector( '.wplus-call-buttons' )!;
        const row = [ ...dock.children ].map( ( el ) => el.className );

        expect( dock.querySelector( '.wplus-call-more' ), 'More for one control' ).toBe( null );
        expect( row.at( -1 ) ).toContain( 'wplus-cancel' );
        expect( row.at( -2 ), 'not in More\'s place' ).toContain( 'wplus-configure-call' );
        const configure = dock.querySelector( '.wplus-configure-call' )!;
        expect( configure.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+C' );
        fireEvent.mouseEnter( configure );
        expect( tip() ).toBe( 'Device Settings (' + keyName( 'settings' ) + ')' );
        fireEvent.mouseLeave( configure );
        fireEvent.click( configure );
        expect( container.querySelector( '.wplus-call-devices' ) ).not.toBe( null );
        unmount();

        // Two: More, holding both, each reached by its key.
        const two = draw( inCall( { myMicrophoneTrack: fakeTrack() } ), 'private', inMore( 'Device Settings', 'Disable Microphone' ) );
        expect( [ ...two.container.querySelector( '.wplus-call-buttons' )!.children ].at( -2 )?.className ).toContain( 'wplus-call-more' );
        alt( 'c' );
        expect( two.container.querySelector( '.wplus-call-devices' ) ).not.toBe( null );
        alt( 'c' );
        fireEvent.click( two.container.querySelector( '.wplus-call-more' )! );
        expect( two.container.querySelector( '.wplus-call-dock-sheet .wplus-configure-call' )?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+C' );
        expect( two.container.querySelectorAll( '.wplus-call-dock-sheet__row' ) ).toHaveLength( 2 );
    } );
} );

describe( 'the call\'s end', () => {
    it( 'takes the window, the page lock and the keys with it, and the next call starts in its place', () => {
        const call = inCall( { myMicrophoneTrack: fakeTrack() } );
        const wrapper = createRef<HTMLDivElement>() as never;
        const draw = ( layout: 'private' | null ) => <CallView call={ { ...call, wrapper } } layout={ layout } />;
        const { container, rerender } = render( draw( 'private' ) );

        fireEvent.click( container.querySelector( '.wplus-fs-enable' )! );
        expect( container.querySelector( '.wplus-call-wrap--window' ) ).not.toBe( null );
        expect( document.documentElement.classList.contains( 'wplus-call-windowed' ) ).toBe( true );

        // Over: the screen stays for the next call (as Better Messages keeps it), with no call to draw.
        rerender( draw( null ) );
        expect( container.querySelector( '.wplus-call-wrap--window' ) ).toBe( null );
        expect( document.documentElement.classList.contains( 'wplus-call-windowed' ) ).toBe( false );
        alt( 'a' );
        fireEvent.keyDown( document.body, { key: ' ', code: 'Space' } );
        fireEvent.keyUp( document.body, { key: ' ', code: 'Space' } );
        expect( call.calls ).toEqual( [] );

        rerender( draw( 'private' ) );
        expect( container.querySelector( '.wplus-call-wrap--window' ) ).toBe( null );
        alt( 'a' );
        expect( call.calls ).toEqual( [ 'disableMic' ] );
    } );
} );

describe( 'two call screens', () => {
    it( 'let the one drawn last listen, and the first again once it goes', () => {
        const first = inCall( { myMicrophoneTrack: fakeTrack() } );
        const second = inCall( { myMicrophoneTrack: fakeTrack() } );
        draw( first, 'private' );
        const later = draw( second, 'private' );

        alt( 'a' );
        expect( first.calls ).toEqual( [] );
        expect( second.calls ).toEqual( [ 'disableMic' ] );

        later.unmount();
        alt( 'a' );
        expect( first.calls ).toEqual( [ 'disableMic' ] );
    } );
} );

// A key for every control (keys.ts): each control of the dock and each row of More has one, named in its tooltip or
// at the row's end, and presses what the control does; a key whose control isn't shown does nothing.
describe( 'every control', () => {
    const recording = ( state: 'off' | 'on', can = true ) => ( { state, can, since: Date.now() / 1000, start: vi.fn( async () => {} ), stop: vi.fn( async () => {} ) } );
    const calls: [ string, 'private' | 'group-video' | 'group-audio', () => ReturnType<typeof fakeCall> ][] = [
        [ 'a call between two', 'private', () => inCall( { myMicrophoneTrack: fakeTrack(), myCameraTrack: fakeTrack(), chatToggle: vi.fn(), people: async () => [], addPerson: async () => {} } ) ],
        [ 'a call between two that rings', 'private', () => inCall( { action: 'incoming_call', chatToggle: vi.fn() } ) ],
        [ 'a group video call, to a moderator', 'group-video', () => inCall( { adminMode: true, chatToggle: vi.fn(), people: async () => [], addPerson: async () => {}, recording: recording( 'off' ) } as never ) ],
        [ 'a group video call, to someone who only listens', 'group-video', () => inCall( { canPublish: false, callMode: 'broadcast' } ) ],
        [ 'a group audio call, to a moderator', 'group-audio', () => inCall( { adminMode: true, chatToggle: vi.fn(), people: async () => [], addPerson: async () => {} } ) ],
    ];
    const shortcutOfAria = ( aria: string | null ) => SHORTCUTS.find( ( shortcut ) => ariaKeys( shortcut ) === aria );
    const dialog = () => document.querySelector( '.wplus-call-dialog' )?.textContent ?? null;

    it.each( calls )( 'names its key in the tooltip of each control of the dock and at the end of each row of More: %s', ( _name, layout, make ) => {
        // A phone draws no tooltips: Switch Camera, a phone's alone, is checked with its key below.
        device.pip = true;
        const { container } = draw( make(), layout );
        const dock = container.querySelector( layout === 'private' ? '.wplus-call-buttons' : '.wplus-group-call-controls-buttons' )!;
        const controls = [ ...dock.children ] as HTMLElement[];
        expect( controls.length ).toBeGreaterThan( 3 );

        controls.forEach( ( control ) => {
            const shortcut = shortcutOfAria( control.getAttribute( 'aria-keyshortcuts' ) );
            expect( shortcut, control.className + ' has no key' ).toBeTruthy();
            fireEvent.mouseEnter( control );
            expect( tip(), control.className ).toContain( '(' + keyName( shortcut! ) );
            fireEvent.mouseLeave( control );
        } );

        const more = dock.querySelector<HTMLElement>( '.wplus-call-more' );
        if ( ! more ) return;
        fireEvent.click( more );
        container.querySelectorAll<HTMLElement>( '.wplus-call-dock-sheet__row' ).forEach( ( row ) => {
            const shortcut = shortcutOfAria( row.getAttribute( 'aria-keyshortcuts' ) );
            expect( shortcut, row.textContent + ' has no key' ).toBeTruthy();
            expect( row.querySelector( '.wplus-call-key-hint' )?.textContent ).toBe( keyName( shortcut! ) );
            expect( row.querySelector( '.wplus-call-dock-sheet__label' )?.textContent, 'the key in the label too' ).not.toContain( '(' );
        } );
    } );

    it( 'shows and hides the chat, expands and collapses the call, and takes it full screen and back', () => {
        const chatToggle = vi.fn();
        const enableFullScreen = vi.fn();
        const { container, unmount } = draw( inCall( { chatToggle, fullScreenAvailable: true, enableFullScreen } ), 'group-video' );

        alt( 'h' );
        expect( chatToggle ).toHaveBeenCalledTimes( 1 );
        alt( 'f' );
        expect( enableFullScreen, 'Full Screen is not on the page, only once expanded' ).not.toHaveBeenCalled();
        alt( 'e' );
        expect( container.querySelector( '.wplus-fs-collapse' ), 'Alt+E did not expand' ).not.toBe( null );
        alt( 'f' );
        expect( enableFullScreen ).toHaveBeenCalledTimes( 1 );
        alt( 'e' );
        expect( container.querySelector( '.wplus-fs-enable' ), 'Alt+E did not collapse' ).not.toBe( null );
        unmount();

        const disableFullScreen = vi.fn();
        draw( inCall( { fullScreenEnabled: true, disableFullScreen } ), 'group-video' );
        alt( 'f' );
        expect( disableFullScreen ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'opens and closes Host Controls and More', () => {
        const { container } = draw( inCall( { adminMode: true } ), 'group-video' );

        alt( 'm' );
        expect( container.querySelector( '.wplus-call-moderation-room' ), 'Alt+M' ).not.toBe( null );
        alt( 'm' );
        expect( container.querySelector( '.wplus-call-moderation-room' ) ).toBe( null );

        const more = container.querySelector( '.wplus-call-more' )!;
        expect( more.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+O' );
        fireEvent.mouseEnter( more );
        expect( tip() ).toBe( 'More (' + keyName( 'more' ) + ')' );
        fireEvent.mouseLeave( more );
        alt( 'o' );
        expect( container.querySelector( '.wplus-call-more-menu' ), 'Alt+O' ).not.toBe( null );
        alt( 'o' );
        expect( container.querySelector( '.wplus-call-more-menu' ) ).toBe( null );
    } );

    it( 'answers a call between two only while it rings', () => {
        const ringing = inCall( { action: 'incoming_call' } );
        const { unmount } = draw( ringing, 'private' );
        alt( 'j' );
        expect( ringing.calls ).toContain( 'answerCall' );
        unmount();

        const answered = inCall();
        draw( answered, 'private' );
        alt( 'j' );
        expect( answered.calls ).not.toContain( 'answerCall' );
    } );

    it( 'switches a phone camera, and opens picture in picture and Add Person from More', async () => {
        device.pip = true;
        device.mobile = true;
        const request = vi.fn( async () => ( {} ) );
        Object.defineProperty( HTMLVideoElement.prototype, 'requestPictureInPicture', { configurable: true, value: request } );
        const call = inCall( { myCameraTrack: fakeTrack(), people: async () => [], addPerson: async () => {} } );
        const { container } = draw( call, 'private' );

        expect( container.querySelector( '.wplus-switch-camera-video' )?.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+B' );
        alt( 'b' );
        expect( call.calls ).toContain( 'switchCamera' );
        alt( 'p' );
        await settle();
        expect( request, 'Alt+P' ).toHaveBeenCalled();
        alt( 'i' );
        expect( container.querySelector( '.wplus-call-add-person-empty, .wplus-call-add-person-list' ), 'Alt+I' ).not.toBe( null );
        delete ( HTMLVideoElement.prototype as { requestPictureInPicture?: unknown } ).requestPictureInPicture;
    } );

    it( 'opens Add Person at the top of Participants while the list shows it', () => {
        const { container } = draw( inCall( { people: async () => [], addPerson: async () => {} } ), 'group-video' );
        const added = () => container.querySelector( '.wplus-call-add-person-empty, .wplus-call-add-person-list' );

        alt( 'i' );
        expect( added(), 'Add Person with the list closed' ).toBe( null );
        alt( 'u' );
        const pill = container.querySelector( '.wplus-call-people-add' )!;
        expect( pill.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+I' );
        fireEvent.mouseEnter( pill );
        expect( tip() ).toBe( 'Add Person (' + keyName( 'add' ) + ')' );
        fireEvent.mouseLeave( pill );
        alt( 'i' );
        expect( added(), 'Alt+I' ).not.toBe( null );
    } );

    it( 'starts and stops the recording as its controls do, asking first, where they are shown', () => {
        const off = draw( inCall( { adminMode: true, recording: recording( 'off' ) } as never ), 'group-video' );
        alt( 'm' );
        const row = off.container.querySelector( '.wplus-room-record' )!;
        expect( row.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+R' );
        expect( row.querySelector( '.wplus-call-key-hint' )?.textContent ).toBe( keyName( 'record' ) );
        alt( 'm' );
        alt( 'r' );
        expect( dialog(), 'Alt+R did not ask to start' ).toContain( 'Start Recording' );
        off.unmount();

        // Stopped from the pill, which names the key, by someone who may stop it.
        const on = draw( inCall( { recording: recording( 'on' ) } as never ), 'group-video' );
        const pill = on.container.querySelector( '.wplus-call-rec-pill' )!;
        expect( pill.getAttribute( 'aria-keyshortcuts' ) ).toBe( 'Alt+R' );
        fireEvent.mouseEnter( pill );
        expect( tip() ).toBe( 'Stop Recording (' + keyName( 'record' ) + ')' );
        fireEvent.mouseLeave( pill );
        alt( 'r' );
        expect( dialog(), 'Alt+R did not ask to stop' ).toContain( 'Stop Recording' );
        on.unmount();

        // Start needs Host Controls, which a member has not, and someone who may not record has neither.
        draw( inCall( { recording: recording( 'off' ) } as never ), 'group-video' );
        alt( 'r' );
        expect( dialog() ).toBe( null );
        cleanup();
        draw( inCall( { recording: recording( 'on', false ) } as never ), 'group-video' );
        alt( 'r' );
        expect( dialog() ).toBe( null );
    } );

    it( 'does nothing for a control that is not shown', () => {
        const call = inCall();
        const { container } = draw( call, 'group-audio' );

        [ 'o', 'm', 'i', 'j', 'p', 'b', 'r' ].forEach( ( letter ) => alt( letter ) );
        expect( call.calls ).toEqual( [] );
        expect( container.querySelector( '.wplus-call-more-menu, .wplus-call-moderation-room, .wplus-call-add-person-empty' ) ).toBe( null );
        expect( dialog() ).toBe( null );
    } );
} );
