import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {EasyStreamApp, EasyStreamParts, configureStreamEffects, preparingText, type Part, type PartOptions, type RoomControls} from "../../src/components/streams/index.ts";
import {configureUi} from "../../src/host.ts";
import {EFFECTS_KEY, chooseEffects, forgetEffectsDevice} from "../../src/inc/calls/effects.ts";
import {resetOwnBackgrounds} from "../../src/inc/calls/own-backgrounds.ts";
import {byTip, fakeClient} from "./fake.tsx";

// The host's effects in the studio: the call screens' background (blurred, or a picture) and AI noise removal, put on
// the camera and the microphone the stream sends (the room client's tracks, which take a processor), offered only where
// the page names the packs, before going live and while live, and going live once they are on.

// A browser that can run both: a canvas it can capture, WebGL, an AudioWorklet.
Object.defineProperty( HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ( {} ) } );
const canvasContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function( this : HTMLCanvasElement, kind : string, ...rest : unknown[] ){
    return kind === 'webgl2' ? { getExtension: () => null } : ( canvasContext as ( ...args : unknown[] ) => unknown ).call( this, kind, ...rest );
} as never;
( globalThis as Record<string, unknown> ).AudioWorkletNode = class {};
if( typeof window.AudioContext !== 'function' ){
    ( window as unknown as Record<string, unknown> ).AudioContext = class { createMediaStreamDestination(){ return {}; } };
} else if( ! ( 'createMediaStreamDestination' in window.AudioContext.prototype ) ){
    Object.defineProperty( window.AudioContext.prototype, 'createMediaStreamDestination', { configurable: true, value: () => ( {} ) } );
}

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const liveStream = { id: 's', state: 'live' as const, started_at: Date.now() - 125_000, ended_at: null };
const flush = () => act( async () => {} );

interface Processor { name : string, look? : unknown, init : ( o : { track : unknown } ) => Promise<void>, destroy : () => Promise<void>, setLook : ( l : unknown ) => Promise<void>, restart : () => Promise<void>, processedTrack? : unknown, context? : unknown }

// The engines as the page finds them once their scripts load (window.wordplusRealtimeEffects, wordplusRealtimeNoise);
// `hold` keeps the camera's from answering until a test lets it.
let release : ( () => void ) | null = null;
const engines = {
    hold: false,
    camera: vi.fn( async ( look : unknown ) : Promise<Processor> => {
        if( engines.hold ) await new Promise<void>( ( resolve ) => { release = resolve; } );
        return processor( 'wordplus-camera-effects', look );
    } ),
    noise: vi.fn( async () : Promise<Processor> => processor( 'wordplus-noise-removal' ) )
};

function processor( name : string, look? : unknown ) : Processor {
    const own : Processor = {
        name, look, context: {},
        init: vi.fn( async () => { own.processedTrack = { id: 'processed' }; } ),
        destroy: vi.fn( async () => {} ),
        setLook: vi.fn( async ( next ) => { own.look = next; } ),
        restart: vi.fn( async () => {} )
    };
    return own;
}

// A track of the room client: it takes a processor and sends what it gives.
function roomTrack( kind : 'audio' | 'video' ){
    let current : Processor | undefined;
    const track = {
        kind,
        isStopped: false,
        audioContext: kind === 'audio' ? {} : undefined,
        get mediaStreamTrack(){ return current?.processedTrack ?? { id: 'raw ' + kind, readyState: 'live' }; },
        setProcessor: vi.fn( async ( given : Processor ) => { await given.init( { track: {} } ); current = given; } ),
        stopProcessor: vi.fn( async () => { current = undefined; } ),
        getProcessor: () => current,
        setAudioContext: vi.fn()
    };
    return track;
}

// The studio's client with its camera and microphone as the room client has them (deviceTrack).
function studioClient( state : Parameters<typeof fakeClient>[0] ){
    const made = fakeClient( state );
    const tracks = { camera: roomTrack( 'video' ), microphone: roomTrack( 'audio' ) };
    ( made.client as Record<string, unknown> ).deviceTrack = vi.fn( ( kind : 'camera' | 'microphone' ) => tracks[ kind ] );
    return { ...made, tracks };
}

const offer = () => configureStreamEffects( {
    url: 'https://site.example/uploads/wordplus/effects/abc/',
    noiseUrl: 'https://site.example/uploads/wordplus/noise/def/',
    builtIn: [ { id: 'office', name: 'Office', url: 'https://site.example/office.webp', thumb: 'https://site.example/office-thumb.webp' } ],
    pictures: [ { id: 12, name: 'Our stage', url: 'https://site.example/stage.jpg' } ],
    ownPictures: true
} );

beforeEach( () => {
    window.localStorage.clear();
    chooseEffects( { camera: 'none', noise: false, tune: {} } );
    resetOwnBackgrounds();
    engines.hold = false;
    release = null;
    engines.camera.mockClear();
    engines.noise.mockClear();
    Object.assign( window, {
        wordplusRealtimeEffects: { version: 2, tune: true, camera: engines.camera },
        wordplusRealtimeNoise: { version: 1, noise: engines.noise }
    } );
} );

afterEach( () => {
    cleanup();
    vi.useRealTimers();
    // A device found to run no background stays so for the page: the next test is a page of its own.
    forgetEffectsDevice();
    // No packs again, as a page that names none.
    configureUi( { effectsUrl: () => '', noiseUrl: () => '', backgrounds: () => [], builtInBackgrounds: () => [], ownBackgrounds: () => false } );
} );

describe( 'the studio\'s effects', () => {
    it( 'offers nothing where the page names no packs', async () => {
        const { asClient } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( screen.getByText( 'Preview: only you can see this' ) ).toBeTruthy();
        expect( screen.queryByRole( 'radiogroup', { name: 'Background' } ) ).toBeNull();
        expect( screen.queryByRole( 'switch', { name: 'AI noise removal' } ) ).toBeNull();
    } );

    it( 'puts the background on the camera before going live, from the site\'s pictures and the host\'s own, and keeps it for the next stream', async () => {
        offer();
        const { client, asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        // None, Blur, the catalog's picture the site picked, the site's own, and Add your own: off at first.
        const group = screen.getByRole( 'radiogroup', { name: 'Background' } );
        const names = [ ...group.querySelectorAll( '[role="radio"]' ) ].map( ( r ) => r.getAttribute( 'aria-label' ) );
        expect( names ).toEqual( [ 'None', 'Blur', 'Office', 'Our stage' ] );
        expect( screen.getByRole( 'radio', { name: 'None' } ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( screen.getByLabelText( 'Add your own picture' ) ).toBeTruthy();
        expect( tracks.camera.setProcessor ).not.toHaveBeenCalled();

        // Blur: on the camera's own track, the preview showing it, and remembered as the calls remember it.
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'Blur' } ) ); } );
        await flush();
        expect( engines.camera ).toHaveBeenCalledWith( expect.objectContaining( { blur: true } ) );
        expect( tracks.camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( tracks.camera.getProcessor()?.name ).toBe( 'wordplus-camera-effects' );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).camera ).toBe( 'blur' );
        expect( screen.getByText( 'If your picture stutters or your device gets warm, turn the background off.' ) ).toBeTruthy();

        // Another picture changes the look on the same processor; None takes it off.
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'Office' } ) ); } );
        await flush();
        expect( tracks.camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( tracks.camera.getProcessor()?.look ).toEqual( { image: 'https://site.example/office.webp' } );
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'None' } ) ); } );
        await flush();
        expect( tracks.camera.stopProcessor ).toHaveBeenCalled();

        // The microphone took nothing: AI noise removal is off until the host turns it on.
        expect( tracks.microphone.setProcessor ).not.toHaveBeenCalled();
        expect( client.goLive ).not.toHaveBeenCalled();
    } );

    it( 'tunes the effect once it is on, and resets the tuning', async () => {
        offer();
        const { asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'Blur' } ) ); } );
        await flush();

        fireEvent.click( screen.getByRole( 'button', { name: 'Effect settings' } ) );
        expect( screen.getByText( 'Edges not quite right? Even light and a plain wall behind you help, and these tune the effect for your room.' ) ).toBeTruthy();
        const strength = screen.getByLabelText( 'Blur strength' ) as HTMLInputElement;
        expect( strength.value ).toBe( '0.5' );
        await act( async () => { fireEvent.change( strength, { target: { value: '0.8' } } ); } );
        await flush();
        expect( tracks.camera.getProcessor()?.look ).toEqual( { blur: true, tune: { blur: 0.8 } } );

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Reset' } ) ); } );
        await flush();
        expect( tracks.camera.getProcessor()?.look ).toEqual( { blur: true } );
    } );

    it( 'takes the noise out of the microphone where the host turns it on, never in original sound', async () => {
        offer();
        const { client, asClient, tracks, update } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        const noise = screen.getByRole( 'switch', { name: 'AI noise removal' } ) as HTMLInputElement;
        expect( noise.checked ).toBe( false );
        await act( async () => { fireEvent.click( noise ); } );
        await flush();
        expect( engines.noise ).toHaveBeenCalledTimes( 1 );
        expect( tracks.microphone.getProcessor()?.name ).toBe( 'wordplus-noise-removal' );

        // Original sound: the switch says why it is off, and the microphone opened so takes no noise removal.
        await act( async () => { fireEvent.click( screen.getByRole( 'switch', { name: 'Original sound, for music' } ) ); } );
        expect( client.setOriginalSound ).toHaveBeenLastCalledWith( true );
        const fresh = { camera: tracks.camera, microphone: { ...tracks.microphone, setProcessor: vi.fn() } };
        ( client as Record<string, unknown> ).deviceTrack = vi.fn( ( kind : 'camera' | 'microphone' ) => fresh[ kind ] );
        await update( { originalSound: true } );
        await flush();
        expect( ( screen.getByRole( 'switch', { name: 'AI noise removal' } ) as HTMLInputElement ).disabled ).toBe( true );
        expect( screen.getByText( 'Off while original sound is on, which sends the microphone as it hears.' ) ).toBeTruthy();
        expect( fresh.microphone.setProcessor ).not.toHaveBeenCalled();
    } );

    it( 'goes live once the effect chosen is on, so the stream goes out with it from its start', async () => {
        offer();
        chooseEffects( { camera: 'blur' } );
        engines.hold = true;
        const { client, asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        fireEvent.click( screen.getByLabelText( 'Count down 3, 2, 1 before going live' ) );

        // Its files still loading: Go live waits for them.
        await act( async () => { fireEvent.click( screen.getByText( 'Go live' ) ); } );
        expect( client.goLive ).not.toHaveBeenCalled();
        await act( async () => { release?.(); } );
        await flush();
        expect( tracks.camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
    } );

    // A cold first background compiles its GPU programs, 7 s on an M1 Max and 8 s in software, the page frozen most of it:
    // a disabled Go live under "Not live" looked broken, and after 8 s the camera went out without the background.
    it( 'says what going live waits for, never goes out without the background however long it takes, and Cancel stops it', async () => {
        offer();
        chooseEffects( { camera: 'blur' } );
        engines.hold = true;
        const { client, asClient } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        fireEvent.click( screen.getByLabelText( 'Count down 3, 2, 1 before going live' ) );

        vi.useFakeTimers();
        await act( async () => { fireEvent.click( screen.getByText( 'Go live' ) ); } );
        expect( screen.getByText( 'Preparing your background…' ).closest( '[role="status"]' ) ).toBeTruthy();
        expect( document.querySelector( '.wplus-live-stream-studio__preparing .wplus-live-stream-spinner' ) ).toBeTruthy();
        expect( screen.queryByRole( 'button', { name: 'Go live' } ) ).toBeNull();
        // No time after which it goes out as the camera is.
        await act( async () => { vi.advanceTimersByTime( 30_000 ); } );
        expect( client.goLive ).not.toHaveBeenCalled();

        // Cancel: back to Go live, and the effect coming on later takes nothing live.
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Cancel' } ) ); } );
        expect( screen.queryByText( 'Preparing your background…' ) ).toBeNull();
        expect( screen.getByRole( 'button', { name: 'Go live' } ) ).toBeTruthy();
        await act( async () => { release?.(); } );
        await act( async () => {} );
        expect( client.goLive ).not.toHaveBeenCalled();

        // The background on now: Go live goes at once, with nothing to wait for.
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Go live' } ) ); } );
        await act( async () => {} );
        expect( screen.queryByText( 'Preparing your background…' ) ).toBeNull();
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
    } );

    // The background is chosen to hide the room: a camera it never reached must not go out as it is. The engine since
    // realtime-ui b0e718f refuses where its model can't run instead of drawing a worse one, so more hosts meet this.
    it( 'never goes live with the camera bare where the chosen background could not start, until the host chooses None', async () => {
        offer();
        chooseEffects( { camera: 'blur' } );
        engines.camera.mockRejectedValueOnce( new Error( 'the GPU program did not compile' ) );
        const { client, asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        fireEvent.click( screen.getByLabelText( 'Count down 3, 2, 1 before going live' ) );

        expect( engines.camera ).toHaveBeenCalledTimes( 1 );
        expect( tracks.camera.getProcessor() ).toBeUndefined();
        expect( screen.getByText( 'The effect could not start on this device.' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Go live' } ) ); } );
        await flush();
        expect( client.goLive ).not.toHaveBeenCalled();
        expect( screen.getByText( 'Your background could not start on this device. Choose None to go live without it' ) ).toBeTruthy();

        // None, the host's own choice: the camera goes out as it is.
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'None' } ) ); } );
        await flush();
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Go live' } ) ); } );
        await flush();
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'says so where this device runs no background, offers None alone, and goes live only once None is chosen', async () => {
        offer();
        chooseEffects( { camera: 'blur' } );
        engines.camera.mockRejectedValueOnce( Object.assign( new Error( 'EffectsUnavailable' ), { unavailable: true } ) );
        const { client, asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        fireEvent.click( screen.getByLabelText( 'Count down 3, 2, 1 before going live' ) );

        expect( tracks.camera.getProcessor() ).toBeUndefined();
        expect( screen.getByText( 'The effect could not start on this device.' ) ).toBeTruthy();
        const group = screen.getByRole( 'radiogroup', { name: 'Background' } );
        const disabled = [ ...group.querySelectorAll( '[role="radio"]' ) ].map( ( r ) => [ r.getAttribute( 'aria-label' ), r.getAttribute( 'aria-disabled' ) ] );
        expect( disabled ).toEqual( [
            [ 'None', null ],
            [ 'Blur. The effect could not start on this device.', 'true' ],
            [ 'Office. The effect could not start on this device.', 'true' ],
            [ 'Our stage. The effect could not start on this device.', 'true' ]
        ] );
        // A tile it cannot run is not chosen.
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'Office. The effect could not start on this device.' } ) ); } );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).camera ).toBe( 'blur' );

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Go live' } ) ); } );
        await flush();
        expect( client.goLive ).not.toHaveBeenCalled();
        expect( screen.getByText( 'Your background could not start on this device. Choose None to go live without it' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'None' } ) ); } );
        await flush();
        expect( engines.camera ).toHaveBeenCalledTimes( 1 );
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Go live' } ) ); } );
        await flush();
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'names what it waits for: the background, AI noise removal, both, or a change', () => {
        expect( preparingText( { camera: true, noise: false } ) ).toBe( 'Preparing your background…' );
        expect( preparingText( { camera: false, noise: true } ) ).toBe( 'Preparing AI noise removal…' );
        expect( preparingText( { camera: true, noise: true } ) ).toBe( 'Preparing your background and AI noise removal…' );
        expect( preparingText( { camera: false, noise: false } ) ).toBe( 'Preparing to go live…' );
    } );

    it( 'opens the effects under the bar while live, saying that each change goes out at once', async () => {
        offer();
        const { asClient, tracks } = studioClient( { you: host, stream: liveStream, devices: { camera: true, microphone: true }, sentHere: true } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( screen.queryByRole( 'radiogroup', { name: 'Background' } ) ).toBeNull();
        const button = byTip( 'Background and noise removal' );
        expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
        await act( async () => { fireEvent.click( button ); } );
        expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        expect( screen.getByText( 'Everyone watching sees and hears each change at once.' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: 'Blur' } ) ); } );
        await flush();
        expect( tracks.camera.getProcessor()?.name ).toBe( 'wordplus-camera-effects' );
        expect( screen.getByRole( 'switch', { name: 'AI noise removal' } ) ).toBeTruthy();
    } );

    it( 'offers nothing for a stream from OBS, which sends its own picture', async () => {
        offer();
        const { asClient, tracks } = studioClient( { you: host, encoder: { url: 'https://whip.example', key: 'k' } as never } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        expect( screen.queryByRole( 'radiogroup', { name: 'Background' } ) ).toBeNull();
        expect( screen.queryByText( 'Effects' ) ).toBeNull();
        expect( tracks.camera.setProcessor ).not.toHaveBeenCalled();
    } );

    it( 'offers the host\'s background and AI noise removal in a Better Messages room\'s sheet too', async () => {
        offer();
        const { asClient, tracks } = studioClient( { you: host, devices: { camera: true, microphone: true } } );
        const room : RoomControls = { open: vi.fn(), leave: vi.fn(), locked: () => false, hold: vi.fn(), shown: () => true, chat: () => true, toggleChat: vi.fn(), subscribe: () => () => {} };
        const element = document.createElement( 'div' );
        const dialogs = document.createElement( 'div' );
        document.body.append( element, dialogs );
        const parts : Part[] = [ { key: 'p0', element, name: 'room-stage', options: { room } as PartOptions } ];
        render( <EasyStreamParts client={ asClient } parts={ parts } dialogs={ dialogs } title="Friday Q&A" chat={ false } manage={ false } /> );
        await flush();

        await act( async () => { fireEvent.click( within( element ).getByRole( 'button', { name: 'Settings' } ) ); } );
        expect( within( element ).getByRole( 'radiogroup', { name: 'Background' } ) ).toBeTruthy();
        await act( async () => { fireEvent.click( within( element ).getByRole( 'radio', { name: 'Blur' } ) ); } );
        await flush();
        expect( tracks.camera.getProcessor()?.name ).toBe( 'wordplus-camera-effects' );
        expect( within( element ).getByRole( 'switch', { name: 'AI noise removal' } ) ).toBeTruthy();
        element.remove();
        dialogs.remove();
    } );
} );
