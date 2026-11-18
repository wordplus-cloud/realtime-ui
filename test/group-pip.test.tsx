// A group call's picture-in-picture (group-pip.tsx): whom it shows (pip-focus.ts) as the call changes, in the browser's
// own window of a canvas (pip-canvas.ts) at the shape of what it shows, with Mute, Camera and Leave as the window's own
// buttons (Media Session). A video call has it all through, an audio call only while someone shares a screen. From the
// dock and by itself as the tab is left, and gone with the call.
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi, setUiUsers } from '../src/index.ts';
import { cameras, mediaAccess, mediaUpdatedSubject, microphones, type CallParticipant } from '../src/calls.ts';
import { pipButtons } from '../src/components/calls/group-pip.tsx';
import { fakeCall, fakeTrack, participant } from '../src/testing.ts';
import CallView from '../src/components/calls/call-screen.tsx';
import { pipFocus } from '../src/inc/calls/pip-focus.ts';
import { pipCanvasSize } from '../src/inc/calls/pip-canvas.ts';

const handlers = new Map<string, ( () => void ) | null>();
const session = {
    setActionHandler: ( action: string, handler: ( () => void ) | null ) => handlers.set( action, handler ),
    setMicrophoneActive: vi.fn(),
    setCameraActive: vi.fn(),
};

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b' } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 35, { name: 'Cara' } ], [ 36, { name: 'Dan' } ], [ 37, { name: 'Eve Stone' } ], [ 42, { name: 'Ben' } ] ] );
    session.setMicrophoneActive.mockReset();
    session.setCameraActive.mockReset();
    handlers.clear();
    Object.defineProperty( navigator, 'mediaSession', { configurable: true, value: session } );
    // Chromium, whose window draws the buttons (sessionLightsButtons): the browsers with User-Agent Client Hints.
    Object.defineProperty( navigator, 'userAgentData', { configurable: true, value: { mobile: false, platform: 'macOS' } } );
} );

afterEach( () => {
    cleanup();
    delete ( navigator as { userAgentData?: unknown } ).userAgentData;
    // What a test said of the devices, as the browser had nothing to say (the registry, permissions.ts).
    mediaAccess.set( 'microphone', 'unknown' );
    mediaAccess.set( 'camera', 'unknown' );
    cameras.clear();
    microphones.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
} );

const settle = () => act( async () => { await new Promise( ( resolve ) => setTimeout( resolve, 0 ) ); } );

type Over = Parameters<typeof fakeCall>[ 0 ];

const group = ( people: Array<[ string, Partial<CallParticipant> ]>, over: Over = {}, layout: 'group-video' | 'group-audio' = 'group-video' ) => {
    const made = fakeCall( {
        participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], ...people.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ) ] ),
        ...over,
    } );
    const wrapper = createRef<HTMLDivElement>();
    const draw = ( more: Over = {} ) => <CallView call={ { ...made, ...more, wrapper: wrapper as never } } layout={ layout } />;
    const rendered = render( draw() );
    return { call: made, ...rendered, redraw: ( more: Over ) => rendered.rerender( draw( { ...over, ...more } ) ) };
};

const people = ( ...list: Array<[ string, Partial<CallParticipant> ]> ) => new Map<string, CallParticipant>( [
    [ 'me', participant( 'me' ) ],
    ...list.map( ( [ key, extra ] ) => [ key, participant( key, extra ) ] as [ string, CallParticipant ] ),
] );

/**
 * The dock's Picture in Picture: its own button where More would hold it alone, else in More whatever the room, More
 * opened where it is closed. Null where there is none.
 */
const pipButton = ( container: HTMLElement ): Element | null => {
    const own = container.querySelector( '.wplus-pic-in-pic:not(.wplus-call-dock-sheet__row)' );
    if ( own ) return own;
    if ( ! container.querySelector( '.wplus-call-dock-sheet' ) ) {
        const more = container.querySelector( '.wplus-call-more' );
        if ( more ) fireEvent.click( more );
    }
    return container.querySelector( '.wplus-call-dock-sheet .wplus-pic-in-pic' );
};

const landscape = { dimensions: { width: 1280, height: 720 } };
const upright = { dimensions: { width: 720, height: 1280 } };

describe( 'whom the window shows', () => {
    const ann = participant( 'user_34', { video: fakeTrack() } );
    const cara = participant( 'user_35', { video: fakeTrack(), isSpeaking: true, audioLevel: 0.4 } );
    const dan = participant( 'user_36', { screen: fakeTrack(), video: fakeTrack() } );

    it( 'puts the spotlight and the pins first, then a screen, then whoever speaks loudest', () => {
        const all = new Map( [ [ 'user_34', ann ], [ 'user_35', cara ], [ 'user_36', dan ] ] );
        expect( pipFocus( all, { first: [ 'user_34' ] } )?.key ).toBe( 'user_34' );
        // Of several up front, the one speaking.
        expect( pipFocus( all, { first: [ 'user_34', 'user_35' ] } )?.key ).toBe( 'user_35' );
        // Someone up front who left is passed over.
        expect( pipFocus( all, { first: [ 'user_99' ] } ) ).toMatchObject( { key: 'user_36', source: 'screen' } );
        const loud = participant( 'user_37', { isSpeaking: true, audioLevel: 0.9 } );
        expect( pipFocus( new Map( [ [ 'user_34', ann ], [ 'user_35', cara ], [ 'user_37', loud ] ] ) ) ).toMatchObject( { key: 'user_37', source: null } );
    } );

    it( 'keeps the last speaker through a silence, else the first with a picture, else the user', () => {
        const quiet = { ...cara, isSpeaking: false };
        expect( pipFocus( new Map( [ [ 'user_34', ann ], [ 'user_35', quiet ] ] ), { last: 'user_35' } )?.key ).toBe( 'user_35' );
        expect( pipFocus( new Map( [ [ 'user_38', participant( 'user_38' ) ], [ 'user_34', ann ] ] ) )?.key ).toBe( 'user_34' );
        expect( pipFocus( new Map( [ [ 'me', participant( 'me' ) ] ] ) )?.key ).toBe( 'me' );
    } );

    it( 'counts a camera or screen sent but not received yet as a picture', () => {
        // A big call receives what a screen reports (showTiles): the window's is received once it shows them.
        expect( pipFocus( new Map( [ [ 'user_37', participant( 'user_37', { videoPublished: true, isSpeaking: true, audioLevel: 0.9 } ) ] ] ) ) ).toMatchObject( { key: 'user_37', source: 'camera' } );
        expect( pipFocus( new Map( [ [ 'user_34', ann ], [ 'user_38', participant( 'user_38', { screenPublished: true } ) ] ] ) ) ).toMatchObject( { key: 'user_38', source: 'screen' } );
    } );

    it( 'never shows the user their own shared screen over someone else', () => {
        const mine = participant( 'me', { screen: fakeTrack() } );
        expect( pipFocus( new Map( [ [ 'me', mine ], [ 'user_34', ann ] ] ) )?.key ).toBe( 'user_34' );
    } );
} );

describe( 'the video window\'s buttons', () => {
    const on = fakeTrack();
    const call = ( over: Partial<Parameters<typeof pipButtons>[ 0 ]> = {} ) => ( { canPublish: true, myMicMuted: false, myMicrophoneTrack: null, myCameraTrack: null, ...over } );

    it( 'say what the call\'s own Mute and Camera say, or are gone where a press could do nothing', () => {
        // [ the call, the microphone usable, the camera usable ] → { mic, camera }: on, crossed out (false), none (null).
        const cases: Array<[ string, ReturnType<typeof call>, boolean, boolean, { mic: boolean | null, camera: boolean | null } ]> = [
            [ 'microphone and camera on', call( { myMicrophoneTrack: on, myCameraTrack: on } ), true, true, { mic: true, camera: true } ],
            [ 'microphone muted, camera off', call(), true, true, { mic: false, camera: false } ],
            [ 'microphone held by a moderator, off', call( { myMicMuted: true } ), true, true, { mic: null, camera: false } ],
            [ 'microphone held by a moderator, its track still there', call( { myMicMuted: true, myMicrophoneTrack: on } ), true, true, { mic: null, camera: false } ],
            [ 'no microphone, refused, or never allowed', call(), false, true, { mic: null, camera: false } ],
            [ 'a microphone on, then refused', call( { myMicrophoneTrack: on } ), false, true, { mic: true, camera: false } ],
            [ 'no camera, refused, or never allowed', call(), true, false, { mic: false, camera: null } ],
            [ 'someone who only watches', call( { canPublish: false } ), true, true, { mic: null, camera: null } ],
        ];
        for ( const [ state, now, mic, camera, shown ] of cases ) expect( pipButtons( now, mic, camera ), state ).toEqual( shown );
    } );
} );

describe( 'the canvas', () => {
    it( 'has the shape of the picture, its longest side held to the camera\'s or the screen\'s', () => {
        expect( pipCanvasSize( 1280, 720, 640 ) ).toEqual( [ 640, 360 ] );
        expect( pipCanvasSize( 720, 1280, 640 ) ).toEqual( [ 360, 640 ] );
        expect( pipCanvasSize( 640, 480, 640 ) ).toEqual( [ 640, 480 ] );
        expect( pipCanvasSize( 1920, 1080, 1280 ) ).toEqual( [ 1280, 720 ] );
        // A smaller picture is not drawn larger.
        expect( pipCanvasSize( 320, 240, 640 ) ).toEqual( [ 320, 240 ] );
    } );
} );

// What the canvas is drawn with, call by call, and the stream it is played as.
type Drawn = Array<[ string, ...unknown[] ]>;
const drawnOn = new Map<HTMLCanvasElement, Drawn>();
let canvases: HTMLCanvasElement[] = [];
const streamStopped = vi.fn();
let inPip: HTMLVideoElement | null = null;
// The browser's window as the page reads it: as wide as the user made it.
const pipWindow = { width: 384, height: 216 };

function canvasContext( canvas: HTMLCanvasElement ) {
    const drawn: Drawn = drawnOn.get( canvas ) ?? [];
    drawnOn.set( canvas, drawn );
    const own: Record<string, unknown> = { measureText: ( text: string ) => ( { width: text.length * 7 } ) };
    return new Proxy( own, {
        get: ( target, key: string ) => key in target ? target[ key ] : ( ...args: unknown[] ) => { drawn.push( [ key, ...args ] ); },
        set: ( target, key: string, value ) => {
            target[ key ] = value;
            if ( key === 'font' ) drawn.push( [ 'font', value ] );
            return true;
        },
    } );
}

/** The <video> the canvas plays a track's picture on: the one of its elements in no page. */
const playedOn = ( track: ReturnType<typeof fakeTrack> ) => track.attached.find( ( element ) => ! element.isConnected ) as HTMLVideoElement | undefined;

/** Frames of `width` by `height` arriving at `element`. */
function frames( element: HTMLVideoElement | undefined, width: number, height: number ) {
    expect( element, 'the picture is not played for the canvas' ).toBeTruthy();
    Object.defineProperty( element, 'videoWidth', { configurable: true, value: width } );
    Object.defineProperty( element, 'videoHeight', { configurable: true, value: height } );
    Object.defineProperty( element, 'readyState', { configurable: true, value: 4 } );
}

const canvas = () => canvases[ canvases.length - 1 ];
const shape = () => [ canvas().width, canvas().height ];
const drawn = () => drawnOn.get( canvas() ) ?? [];
const texts = () => drawn().filter( ( [ call ] ) => call === 'fillText' ).map( ( [ , text ] ) => text );
const frame = () => act( () => { vi.advanceTimersByTime( 50 ); } );

describe( 'a video call\'s window, the browser\'s own of a canvas', () => {
    beforeEach( () => {
        vi.useFakeTimers( { toFake: [ 'setInterval', 'clearInterval' ] } );
        // A site the user allowed a microphone and a camera, as one who turned them on in a call before.
        mediaAccess.set( 'microphone', 'granted' );
        mediaAccess.set( 'camera', 'granted' );
        microphones.set( 'mic-1', { deviceId: 'mic-1', kind: 'audioinput', label: 'MacBook Microphone', groupId: '', toJSON() {} } as MediaDeviceInfo );
        cameras.set( 'cam-1', { deviceId: 'cam-1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: '', toJSON() {} } as MediaDeviceInfo );
        canvases = [];
        drawnOn.clear();
        streamStopped.mockClear();
        inPip = null;
        Object.defineProperty( document, 'pictureInPictureEnabled', { configurable: true, value: true } );
        Object.defineProperty( document, 'pictureInPictureElement', { configurable: true, get: () => inPip } );
        ( document as unknown as { exitPictureInPicture: () => Promise<void> } ).exitPictureInPicture = vi.fn( async () => {
            const was = inPip;
            inPip = null;
            was?.dispatchEvent( new Event( 'leavepictureinpicture' ) );
        } );
        pipWindow.width = 384;
        ( HTMLVideoElement.prototype as unknown as { requestPictureInPicture: () => Promise<object> } ).requestPictureInPicture = vi.fn( async function( this: HTMLVideoElement ) {
            inPip = this;
            this.dispatchEvent( Object.assign( new Event( 'enterpictureinpicture' ), { pictureInPictureWindow: pipWindow } ) );
            return pipWindow;
        } );
        vi.spyOn( HTMLCanvasElement.prototype, 'getContext' ).mockImplementation( function( this: HTMLCanvasElement ) {
            return canvasContext( this ) as never;
        } );
        vi.spyOn( HTMLCanvasElement.prototype, 'captureStream' ).mockImplementation( function( this: HTMLCanvasElement ) {
            canvases.push( this );
            const stream = new MediaStream();
            Object.defineProperty( stream, 'getTracks', { value: () => [ { kind: 'video', stop: streamStopped } ] } );
            return stream;
        } );
    } );

    afterEach( () => {
        delete ( document as unknown as { pictureInPictureEnabled?: boolean } ).pictureInPictureEnabled;
        delete ( document as unknown as { pictureInPictureElement?: unknown } ).pictureInPictureElement;
        delete ( document as unknown as { exitPictureInPicture?: unknown } ).exitPictureInPicture;
        delete ( HTMLVideoElement.prototype as unknown as { requestPictureInPicture?: unknown } ).requestPictureInPicture;
    } );

    it( 'opens from the dock on the page\'s video of the canvas, at the shape of the camera it shows, and takes each new shape', async () => {
        const annCamera = fakeTrack(), caraCamera = fakeTrack(), danScreen = fakeTrack();
        const { container, redraw } = group( [ [ 'user_34', { video: annCamera, videoPub: landscape, isSpeaking: true, audioLevel: 0.5 } ], [ 'user_35', { video: caraCamera, videoPub: upright } ] ] );

        fireEvent.click( pipButton( container )! );
        await settle();
        const source = container.querySelector<HTMLVideoElement>( 'video.wplus-pip-source' )!;
        expect( source.requestPictureInPicture ).toHaveBeenCalledTimes( 1 );
        expect( inPip ).toBe( source );
        expect( canvas().captureStream ).toBeTruthy();
        expect( source.srcObject ).toBeInstanceOf( MediaStream );
        expect( pipButton( container )?.getAttribute( 'data-active' ) ).toBe( '1' );

        // Opened at the camera's shape before its frames came (its publication's), then at its frames' own.
        expect( shape() ).toEqual( [ 640, 360 ] );
        const annPicture = playedOn( annCamera );
        frames( annPicture, 1280, 720 );
        await frame();
        expect( shape() ).toEqual( [ 640, 360 ] );
        expect( drawn().filter( ( [ call ] ) => call === 'drawImage' ).at( -1 ) ).toEqual( [ 'drawImage', annPicture, 0, 0, 640, 360 ] );
        expect( texts() ).toContain( 'Ann' );

        // Her phone turned upright: the window's shape with it.
        frames( annPicture, 720, 1280 );
        await frame();
        expect( shape() ).toEqual( [ 360, 640 ] );

        // Cara speaks: her camera, played instead of Ann's.
        redraw( { participants: people( [ 'user_34', { video: annCamera, videoPub: landscape } ], [ 'user_35', { video: caraCamera, videoPub: upright, isSpeaking: true, audioLevel: 0.6 } ] ) } );
        await frame();
        expect( playedOn( annCamera ), 'Ann\'s camera is still played for a window that shows Cara' ).toBeUndefined();
        frames( playedOn( caraCamera ), 480, 640 );
        await frame();
        expect( shape() ).toEqual( [ 480, 640 ] );
        expect( texts().at( -1 ) ).toBe( 'Cara' );

        // Dan shares his screen: the screen, whole, at its shape, its longest side up to 1280.
        redraw( { participants: people( [ 'user_34', { video: annCamera } ], [ 'user_35', { video: caraCamera, videoPub: upright, isSpeaking: true, audioLevel: 0.6 } ], [ 'user_36', { screen: danScreen, screenPub: { dimensions: { width: 1920, height: 1080 } } } ] ) } );
        await frame();
        frames( playedOn( danScreen ), 1920, 1080 );
        await frame();
        expect( shape() ).toEqual( [ 1280, 720 ] );

        // Eve, with no camera, speaks: her face at the shape of a tile, her initials where her picture can't be drawn.
        redraw( { participants: people( [ 'user_34', { video: annCamera } ], [ 'user_37', { isSpeaking: true, audioLevel: 0.9 } ] ) } );
        await frame();
        expect( shape() ).toEqual( [ 640, 360 ] );
        expect( texts().slice( -2 ) ).toEqual( [ 'ES', 'Eve Stone' ] );
        expect( drawn().filter( ( [ call ] ) => call === 'strokeRect' ).length, 'someone speaking has no ring' ).toBeGreaterThan( 0 );
        expect( container.querySelector( '.wplus-pip-source-name' )?.textContent ).toBe( 'Eve Stone' );
    } );

    it( 'draws the name at its size in the window as wide as the window is, larger on the canvas as the window is smaller', async () => {
        const camera = fakeTrack();
        const { container } = group( [ [ 'user_34', { video: camera, videoPub: landscape } ] ] );
        await settle();
        const nameFonts = () => drawn().filter( ( [ call, font ] ) => call === 'font' && String( font ).startsWith( '500 ' ) ).map( ( [ , font ] ) => String( font ).split( 'px' )[ 0 ] );

        // A 640 canvas in a window 320 wide: drawn twice its size, the tile's 12px in the window.
        pipWindow.width = 320;
        fireEvent.click( pipButton( container )! );
        await settle();
        frames( playedOn( camera ), 1280, 720 );
        await frame();
        expect( nameFonts().at( -1 ) ).toBe( '500 24' );

        // The user makes the window 1280 wide: the canvas's half size, no smaller.
        pipWindow.width = 1280;
        await frame();
        expect( nameFonts().at( -1 ) ).toBe( '500 6' );
    } );

    it( 'draws only while the window is open, and lets go of the picture as it closes and of everything as the call ends', async () => {
        const camera = fakeTrack();
        const { container, redraw } = group( [ [ 'user_34', { video: camera, videoPub: landscape } ] ] );
        await settle();

        // Closed: one frame for the window to open on, no clock, no picture played.
        const before = drawn().length;
        await act( () => { vi.advanceTimersByTime( 2000 ); } );
        expect( drawn().length ).toBe( before );
        expect( playedOn( camera ) ).toBeUndefined();

        fireEvent.click( pipButton( container )! );
        await settle();
        frames( playedOn( camera ), 1280, 720 );
        const opening = drawn().filter( ( [ call ] ) => call === 'drawImage' ).length;
        await act( () => { vi.advanceTimersByTime( 1000 ); } );
        // 24 frames a second for a camera.
        expect( drawn().filter( ( [ call ] ) => call === 'drawImage' ).length - opening ).toBeGreaterThanOrEqual( 23 );

        // Closed by the user: nothing drawn, the camera no longer played here.
        await act( async () => { await document.exitPictureInPicture(); } );
        expect( pipButton( container )?.hasAttribute( 'data-active' ) ).toBe( false );
        expect( playedOn( camera ) ).toBeUndefined();
        const closed = drawn().length;
        await act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( drawn().length ).toBe( closed );

        // Open again as the call ends: the window closes, the canvas's stream stops.
        fireEvent.click( pipButton( container )! );
        await settle();
        expect( inPip ).not.toBe( null );
        redraw( { connectionState: 'disconnected' } );
        await settle();
        expect( inPip ).toBe( null );
        expect( streamStopped ).toHaveBeenCalled();
        expect( playedOn( camera ) ).toBeUndefined();
    } );

    it( 'tells the call whom it shows while it is open, so a big call sends that picture, and nobody once it closes or the call ends', async () => {
        const told: Array<[ string, string[] ]> = [];
        const showTiles = ( source: string, keys: readonly string[] ) => { if ( source === 'pip' ) told.push( [ source, [ ...keys ] ] ); };
        const { container, redraw, unmount } = group( [ [ 'user_34', { videoPublished: true, isSpeaking: true, audioLevel: 0.6 } ], [ 'user_35', {} ] ], { showTiles } );
        expect( told.at( -1 ) ).toEqual( [ 'pip', [] ] );

        fireEvent.click( pipButton( container )! );
        await settle();
        expect( told.at( -1 ) ).toEqual( [ 'pip', [ 'user_34' ] ] );

        // Received: her camera played for the window.
        const camera = fakeTrack();
        redraw( { participants: people( [ 'user_34', { video: camera, videoPublished: true, isSpeaking: true, audioLevel: 0.6 } ], [ 'user_35', {} ] ) } );
        await frame();
        expect( playedOn( camera ) ).toBeTruthy();

        // Cara speaks: told her instead.
        redraw( { participants: people( [ 'user_34', { video: camera, videoPublished: true } ], [ 'user_35', { isSpeaking: true, audioLevel: 0.7 } ] ) } );
        expect( told.at( -1 ) ).toEqual( [ 'pip', [ 'user_35' ] ] );

        await act( async () => { await document.exitPictureInPicture(); } );
        expect( told.at( -1 ) ).toEqual( [ 'pip', [] ] );

        fireEvent.click( pipButton( container )! );
        await settle();
        expect( told.at( -1 ) ).toEqual( [ 'pip', [ 'user_35' ] ] );
        unmount();
        expect( told.at( -1 ) ).toEqual( [ 'pip', [] ] );
    } );

    it( 'shows whom a moderator spotlighted for everyone over whoever speaks, and a pin from an older client as one', async () => {
        const { container, redraw } = group( [ [ 'user_34', { video: fakeTrack(), isSpeaking: true, audioLevel: 0.8 } ], [ 'user_35', { video: fakeTrack() } ] ], { spotlight: [ 'user_35' ] } );
        const name = () => container.querySelector( '.wplus-pip-source-name' )?.textContent;
        expect( name() ).toBe( 'Cara' );

        redraw( { spotlight: [], participants: people( [ 'user_34', { video: fakeTrack(), isSpeaking: true, audioLevel: 0.8 } ], [ 'user_35', { video: fakeTrack(), isPinned: true } ] ) } );
        expect( name() ).toBe( 'Cara' );

        redraw( { spotlight: [], participants: people( [ 'user_34', { video: fakeTrack(), isSpeaking: true, audioLevel: 0.8 } ], [ 'user_35', { video: fakeTrack() } ] ) } );
        expect( name() ).toBe( 'Ann' );
    } );

    it( 'shows whom the user pinned on a tile, after the spotlight', async () => {
        // The grid draws its tiles once it has a size: a call 900 wide and 700 high, its dock 60 (as spotlight.test.tsx).
        vi.useFakeTimers();
        vi.spyOn( Element.prototype, 'getBoundingClientRect' ).mockImplementation( function( this: Element ) {
            const height = this.classList?.contains( 'wplus-group-call-controls-v2' ) ? 60 : 700;
            return { width: 900, height, top: 0, left: 0, right: 900, bottom: height, x: 0, y: 0, toJSON() {} } as DOMRect;
        } );
        const { container, redraw } = group( [ [ 'user_34', { video: fakeTrack(), isSpeaking: true, audioLevel: 0.8 } ], [ 'user_35', { video: fakeTrack() } ] ] );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        const name = () => container.querySelector( '.wplus-pip-source-name' )?.textContent;
        expect( name() ).toBe( 'Ann' );

        fireEvent.click( container.querySelector( '[data-key="user_35"] .wplus-pin-for-me' )! );
        expect( name() ).toBe( 'Cara' );

        // A spotlight for everyone comes before the user's own pin.
        redraw( { spotlight: [ 'user_34' ] } );
        expect( name() ).toBe( 'Ann' );
    } );

    it( 'has Mute, Camera and Leave as the window\'s own buttons, pressed as the dock\'s and lit as the call has them', async () => {
        const { call, redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ], { myMicrophoneTrack: fakeTrack() } );
        await settle();
        expect( [ ...handlers.keys() ].filter( ( action ) => handlers.get( action ) ).sort() ).toEqual( [ 'hangup', 'togglecamera', 'togglemicrophone' ] );
        expect( session.setMicrophoneActive ).toHaveBeenLastCalledWith( true );
        expect( session.setCameraActive ).toHaveBeenLastCalledWith( false );

        act( () => { handlers.get( 'togglemicrophone' )!(); } );
        act( () => { handlers.get( 'togglecamera' )!(); } );
        act( () => { handlers.get( 'hangup' )!(); } );
        await settle();
        expect( call.calls ).toEqual( [ 'disableMic', 'enableCamera', 'endCall' ] );

        // Turned off and on from the call's own controls, the keys or anywhere: the window's follow.
        redraw( { myMicrophoneTrack: null, myCameraTrack: fakeTrack() } );
        expect( session.setMicrophoneActive ).toHaveBeenLastCalledWith( false );
        expect( session.setCameraActive ).toHaveBeenLastCalledWith( true );

        // Gone with the call.
        redraw( { connectionState: 'disconnected' } );
        expect( [ 'togglemicrophone', 'togglecamera', 'hangup' ].map( ( action ) => handlers.get( action ) ) ).toEqual( [ null, null, null ] );
    } );

    it( 'takes the microphone\'s button away while a moderator holds it, and gives it back as it was once they let go', async () => {
        const { call, redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ], { myCameraTrack: fakeTrack() } );
        await settle();
        expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );

        redraw( { myMicMuted: true } );
        expect( handlers.get( 'togglemicrophone' ), 'a press the moderator would only refuse' ).toBe( null );
        expect( handlers.get( 'togglecamera' ) ).toBeTypeOf( 'function' );

        session.setMicrophoneActive.mockClear();
        redraw( { myMicMuted: false } );
        expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );
        expect( session.setMicrophoneActive, 'the button came back without saying it is off' ).toHaveBeenLastCalledWith( false );
        act( () => { handlers.get( 'togglemicrophone' )!(); } );
        await settle();
        expect( call.calls ).toEqual( [ 'enableMic' ] );
    } );

    it( 'takes a button away while the site may not have the device or there is none, and gives it back once there is', async () => {
        const { redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ] );
        await settle();
        const devices = ( update: () => void ) => act( () => { update(); mediaUpdatedSubject.next(); } );

        // The microphone refused the site in the address bar.
        devices( () => mediaAccess.set( 'microphone', 'denied' ) );
        expect( handlers.get( 'togglemicrophone' ) ).toBe( null );
        expect( handlers.get( 'togglecamera' ) ).toBeTypeOf( 'function' );
        // Back to never asked: still none, as a press would only ask on the call's tab.
        devices( () => mediaAccess.set( 'microphone', 'prompt' ) );
        expect( handlers.get( 'togglemicrophone' ), 'a microphone the site was never allowed has a button' ).toBe( null );
        // Allowed from the call itself: back, as the call has it.
        session.setMicrophoneActive.mockClear();
        devices( () => mediaAccess.set( 'microphone', 'granted' ) );
        expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );
        expect( session.setMicrophoneActive ).toHaveBeenLastCalledWith( false );

        // Safari says nothing of permissions: a microphone it shows by name is one the site was allowed.
        devices( () => { mediaAccess.set( 'microphone', 'unknown' ); microphones.set( 'mic-1', { deviceId: 'mic-1', kind: 'audioinput', label: '', groupId: '', toJSON() {} } as MediaDeviceInfo ); } );
        expect( handlers.get( 'togglemicrophone' ), 'a microphone Safari shows with no name' ).toBe( null );
        devices( () => microphones.set( 'mic-1', { deviceId: 'mic-1', kind: 'audioinput', label: 'MacBook Microphone', groupId: '', toJSON() {} } as MediaDeviceInfo ) );
        expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );

        // Allowed, and the only camera unplugged: none; plugged in again: back.
        devices( () => { mediaAccess.set( 'camera', 'granted' ); cameras.clear(); } );
        expect( handlers.get( 'togglecamera' ) ).toBe( null );
        devices( () => cameras.set( 'cam-1', { deviceId: 'cam-1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: '', toJSON() {} } as MediaDeviceInfo ) );
        expect( handlers.get( 'togglecamera' ) ).toBeTypeOf( 'function' );

        // A camera that is on keeps its button to turn it off, whatever the browser says of the device.
        redraw( { myCameraTrack: fakeTrack() } );
        devices( () => cameras.clear() );
        expect( handlers.get( 'togglecamera' ) ).toBeTypeOf( 'function' );
        expect( session.setCameraActive ).toHaveBeenLastCalledWith( true );
    } );

    it( 'never tells Safari the microphone or the camera is off or on, which would mute the device itself, and keeps its actions', async () => {
        // WebKit, as Playwright's measured it (2026-11-02): false mutes the page's capture of the device, true outside a
        // user gesture is refused and leaves it muted. Safari has no User-Agent Client Hints.
        delete ( navigator as { userAgentData?: unknown } ).userAgentData;
        const muted = new Set<string>();
        const webkit = ( kind: string ) => ( active: boolean ) => {
            if ( ! active ) {
                muted.add( kind );
                return Promise.resolve();
            }
            return Promise.reject( new DOMException( 'Activating capture must be called from a user gesture handler.', 'InvalidStateError' ) );
        };
        session.setMicrophoneActive.mockImplementation( webkit( 'microphone' ) );
        session.setCameraActive.mockImplementation( webkit( 'camera' ) );
        const devices = ( update: () => void ) => act( () => { update(); mediaUpdatedSubject.next(); } );

        // Neither allowed yet, the call joined with both off.
        mediaAccess.set( 'microphone', 'prompt' );
        mediaAccess.set( 'camera', 'prompt' );
        cameras.clear();
        microphones.clear();
        const { redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ] );
        await settle();

        // Allow pressed on the camera's prompt: the browser lists the camera as the one the press asked for starts.
        devices( () => { mediaAccess.set( 'camera', 'granted' ); cameras.set( 'cam-1', { deviceId: 'cam-1', kind: 'videoinput', label: 'FaceTime HD Camera', groupId: '', toJSON() {} } as MediaDeviceInfo ); } );
        await settle();
        expect( handlers.get( 'togglecamera' ), 'Safari\'s address bar presses it' ).toBeTypeOf( 'function' );
        // And the camera on in the call, after the prompt used the press up.
        redraw( { myCameraTrack: fakeTrack() } );
        await settle();

        // The microphone the same way.
        devices( () => { mediaAccess.set( 'microphone', 'granted' ); microphones.set( 'mic-1', { deviceId: 'mic-1', kind: 'audioinput', label: 'MacBook Microphone', groupId: '', toJSON() {} } as MediaDeviceInfo ); } );
        await settle();
        expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );
        redraw( { myCameraTrack: fakeTrack(), myMicrophoneTrack: fakeTrack() } );
        await settle();
        redraw( { myCameraTrack: null, myMicrophoneTrack: null } );
        await settle();

        expect( [ ...muted ], 'a device the call has, muted by the browser while the call says it is on' ).toEqual( [] );
        expect( session.setCameraActive ).not.toHaveBeenCalled();
        expect( session.setMicrophoneActive ).not.toHaveBeenCalled();
    } );

    it( 'takes a browser\'s refusal of the buttons\' state quietly', async () => {
        // A browser that answers with a promise and refuses it: each answer is handled, none left to the page's errors.
        const answers: Array<{ then: ReturnType<typeof vi.fn> }> = [];
        const refuse = () => {
            const told = Promise.reject( new DOMException( 'refused', 'InvalidStateError' ) );
            told.catch( () => {} );
            answers.push( { then: vi.spyOn( told, 'then' ) as unknown as ReturnType<typeof vi.fn> } );
            return told;
        };
        // Plain functions: a mock of the test runner's own reads every promise it hands back.
        Object.defineProperty( navigator, 'mediaSession', { configurable: true, value: { setActionHandler: session.setActionHandler, setMicrophoneActive: refuse, setCameraActive: refuse } } );
        const { redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ], { myMicrophoneTrack: fakeTrack() } );
        await settle();
        redraw( { myMicrophoneTrack: null, myCameraTrack: fakeTrack() } );
        await settle();
        expect( answers.length ).toBeGreaterThan( 1 );
        answers.forEach( ( answer ) => expect( answer.then, 'a refusal left unhandled' ).toHaveBeenCalled() );
    } );

    it( 'gives someone who only watches Leave alone', () => {
        group( [ [ 'user_34', { video: fakeTrack() } ] ], { canPublish: false } );
        expect( handlers.get( 'hangup' ) ).toBeTypeOf( 'function' );
        expect( handlers.get( 'togglemicrophone' ) ?? null ).toBe( null );
        expect( handlers.get( 'togglecamera' ) ?? null ).toBe( null );
    } );

    it( 'opens only from the dock unless the call allows it to open by itself as the tab is left', async () => {
        const { redraw } = group( [ [ 'user_34', { video: fakeTrack() } ] ] );
        await settle();
        expect( handlers.get( 'enterpictureinpicture' ) ?? null, 'the window opens by itself with nothing allowing it' ).toBe( null );

        redraw( { autoPictureInPicture: true } );
        expect( handlers.get( 'enterpictureinpicture' ) ).toBeTypeOf( 'function' );
        redraw( { autoPictureInPicture: false } );
        expect( handlers.get( 'enterpictureinpicture' ) ).toBe( null );
    } );

    it( 'opens by itself as the tab is left, where the call allows it and the browser asks for it', async () => {
        const { container } = group( [ [ 'user_34', { video: fakeTrack(), videoPub: upright } ] ], { autoPictureInPicture: true } );
        await settle();
        act( () => { handlers.get( 'enterpictureinpicture' )!(); } );
        await settle();
        expect( inPip ).toBe( container.querySelector( 'video.wplus-pip-source' ) );
        expect( shape() ).toEqual( [ 360, 640 ] );
    } );

    describe( 'in an audio call', () => {
        const dan = ( extra: Partial<CallParticipant> = {} ): [ string, Partial<CallParticipant> ] => [ 'user_36', { identity: 'user_36', ...extra } ];
        const sharing = () => dan( { screen: fakeTrack(), screenPub: { dimensions: { width: 1680, height: 1050 } } } );

        it( 'has no Picture in Picture while nobody shares a screen, and has it with the screen, Mute and Leave, while someone does', async () => {
            const { container, redraw } = group( [ [ 'user_34', { audio: fakeTrack() } ], dan() ], { myMicrophoneTrack: fakeTrack() }, 'group-audio' );
            await settle();
            expect( pipButton( container ), 'Picture in Picture with nothing to show' ).toBeNull();
            expect( handlers.get( 'hangup' ) ?? null ).toBe( null );

            redraw( { participants: people( [ 'user_34', { audio: fakeTrack() } ], sharing() ) } );
            await settle();
            // All More would hold: its own button in More's place.
            expect( container.querySelector( '.wplus-call-more' ), 'More for Picture in Picture alone' ).toBeNull();
            expect( container.querySelector( '.wplus-group-call-controls-buttons > .wplus-pic-in-pic' ) ).not.toBeNull();
            fireEvent.click( pipButton( container )! );
            await settle();
            expect( inPip ).toBe( container.querySelector( 'video.wplus-pip-source' ) );
            // Dan's screen, at its shape, before its frames and with them.
            expect( shape() ).toEqual( [ 1280, 800 ] );
            // Mute and Leave, no Camera in an audio call.
            expect( handlers.get( 'togglemicrophone' ) ).toBeTypeOf( 'function' );
            expect( handlers.get( 'togglecamera' ) ?? null ).toBe( null );
            expect( handlers.get( 'hangup' ) ).toBeTypeOf( 'function' );
        } );

        it( 'closes the window as the last share stops, with no press, and offers it no more', async () => {
            const screen = fakeTrack();
            const { container, redraw } = group( [ dan( { screen, screenPub: { dimensions: { width: 1920, height: 1080 } } } ) ], {}, 'group-audio' );
            await settle();
            fireEvent.click( pipButton( container )! );
            await settle();
            expect( inPip ).not.toBe( null );
            frames( playedOn( screen ), 1920, 1080 );
            await frame();
            expect( shape() ).toEqual( [ 1280, 720 ] );

            redraw( { participants: people( dan() ) } );
            await settle();
            expect( inPip, 'the window outlived the share' ).toBe( null );
            expect( streamStopped ).toHaveBeenCalled();
            expect( pipButton( container ) ).toBeNull();
        } );

        it( 'opens by itself as the tab is left only while a screen is shared, where the call allows it', async () => {
            const { redraw } = group( [ dan() ], { autoPictureInPicture: true }, 'group-audio' );
            await settle();
            expect( handlers.get( 'enterpictureinpicture' ) ?? null, 'opens by itself with nothing to show' ).toBe( null );
            redraw( { participants: people( sharing() ) } );
            expect( handlers.get( 'enterpictureinpicture' ) ).toBeTypeOf( 'function' );
            act( () => { handlers.get( 'enterpictureinpicture' )!(); } );
            await settle();
            expect( inPip ).not.toBe( null );
            redraw( { participants: people( dan() ) } );
            expect( handlers.get( 'enterpictureinpicture' ) ).toBe( null );
        } );

        it( 'is not for the user\'s own shared screen', async () => {
            const { container, redraw } = group( [ dan() ], {}, 'group-audio' );
            const mine = people( dan() );
            mine.set( 'me', participant( 'me', { screen: fakeTrack() } ) );
            redraw( { participants: mine } );
            await settle();
            expect( pipButton( container ) ).toBeNull();
        } );
    } );
} );

describe( 'where there is a window to give', () => {
    it( 'is a group call\'s alone', () => {
        // A call between two keeps its own, of the other side's video (private-call.tsx), which a test browser has not.
        const { container, unmount } = render( <CallView call={ { ...fakeCall( { participants: people( [ 'user_34', { video: fakeTrack() } ] ) } ), wrapper: createRef<HTMLDivElement>() as never } } layout="private" /> );
        expect( pipButton( container ) ).toBe( null );
        expect( handlers.has( 'enterpictureinpicture' ) ).toBe( false );
        unmount();
    } );

    it( 'needs the browser\'s own picture-in-picture of a video', () => {
        // The test browser has none: neither a video call nor an audio call with a screen shared has a window.
        const video = group( [ [ 'user_34', { video: fakeTrack() } ] ] );
        expect( pipButton( video.container ) ).toBe( null );
        expect( handlers.get( 'hangup' ) ?? null ).toBe( null );
        video.unmount();

        const audio = group( [ [ 'user_34', { screen: fakeTrack() } ] ], {}, 'group-audio' );
        expect( pipButton( audio.container ) ).toBe( null );
    } );
} );
