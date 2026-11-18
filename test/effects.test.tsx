import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import {
    DEVICE_BLUR_TIP_KEY, DevicePanel, EFFECTS_KEY, EFFECTS_SLOW_EVENT, EffectsSlowNotice, WARM_KEY, applyEffect, cameraLook, chooseEffects, effectsChoice, useTrackEffects,
    ConfigureBadge, NOISE_AUTO_NOTICE_MS, NOISE_AUTO_TIP_KEY, NoiseAutoNotice, noiseAutoHere, useConfigureCall,
    type ProcessorTrack,
} from '../src/calls.ts';
import { NOISE_WAIT_MS, forgetEffectsChoice, forgetEffectsDevice, forgetEffectsWarmth } from '../src/inc/calls/effects.ts';
import { CallContext } from '../src/components/calls/context.ts';
import { useLocalMedia } from '../src/sdk/local-media.ts';
import { resetOwnBackgrounds } from '../src/inc/calls/own-backgrounds.ts';
import { mediaAccess } from '../src/inc/calls/permissions.ts';
import { fakeCall, fakeTrack } from './fake-call.ts';

// The camera and the microphone allowed, as the browser says when the settings ask it: they offer the effects only
// then. The registry's own read finds no devices here (the page's mediaDevices come after it loads).
vi.mock( '../src/inc/calls/permissions.ts', async ( original ) => {
    const real = await original<typeof import( '../src/inc/calls/permissions.ts' )>();
    return {
        ...real,
        updateMediaPermissions: async () => {
            real.mediaAccess.set( 'camera', 'granted' );
            real.mediaAccess.set( 'microphone', 'granted' );
            real.mediaUpdatedSubject.next();
        },
    };
} );

// The call effects: a blurred or replaced background and the noise removed, chosen in the device settings and kept
// by the browser (inc/calls/effects.ts), put on the call's tracks by whoever runs the call. The engine (src/effects)
// is a script of its own that a page loads from the host's folder: here it is stood in for as the page would find it,
// window.wordplusRealtimeEffects, so these tests are of the screens and of how the tracks take it.

// The microphone's level, which the meters read through Web Audio: none here.
vi.mock( '../src/inc/calls/mic-level.ts', () => ( { readLevel: () => () => {} } ) );

// A browser that can run both: a canvas it can capture, WebGL drawn on a GPU (`gpu.renderer` is what it names), an
// AudioWorklet.
const gpu = { renderer: 'Apple GPU' };
Object.defineProperty( HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ( {} ) } );
const canvasContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function ( this: HTMLCanvasElement, kind: string, ...rest: unknown[] ) {
    return kind === 'webgl2'
        ? { getExtension: ( name: string ) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 37446 } : null, getParameter: () => gpu.renderer, RENDERER: 7937 }
        : ( canvasContext as ( ...args: unknown[] ) => unknown ).call( this, kind, ...rest );
} as never;
( globalThis as Record<string, unknown> ).AudioWorkletNode = class {};
( globalThis as Record<string, unknown> ).MediaStream = class {
    constructor( readonly tracks: MediaStreamTrack[] ) {}
    getTracks() {
        return this.tracks;
    }
};

/** A track as a browser gives it, `label` saying which it is. */
const mediaTrack = ( kind: 'audio' | 'video', label: string ) => ( {
    kind, label, id: label, readyState: 'live', stop: vi.fn(), getSettings: () => ( { deviceId: label } ),
    addEventListener: () => {}, removeEventListener: () => {},
} ) as unknown as MediaStreamTrack;

interface FakeProcessor {
    name: string,
    look?: unknown,
    input?: MediaStreamTrack,
    processedTrack?: MediaStreamTrack,
    context: unknown,
    destroyed: boolean,
    init: ( options: { track: MediaStreamTrack } ) => Promise<void>,
    restart: ( options: { track: MediaStreamTrack } ) => Promise<void>,
    destroy: () => Promise<void>,
    setLook: ( look: unknown ) => Promise<void>,
}

const made: FakeProcessor[] = [];
const fail = { camera: false };

function processor( name: string, kind: 'audio' | 'video', look?: unknown ): FakeProcessor {
    const own: FakeProcessor = {
        name, look, context: { context: 'of the noise removal' }, destroyed: false,
        init: vi.fn( async ( { track } ) => {
            own.input = track;
            own.processedTrack = mediaTrack( kind, 'processed ' + made.indexOf( own ) );
        } ),
        restart: vi.fn( async ( { track } ) => {
            own.input = track;
        } ),
        destroy: vi.fn( async () => {
            own.destroyed = true;
        } ),
        setLook: vi.fn( async ( next ) => {
            own.look = next;
        } ),
    };
    made.push( own );
    return own;
}

const engine = {
    version: 2,
    camera: vi.fn( async ( look: unknown ) => {
        if ( fail.camera ) throw new Error( 'no WebGL here' );
        return processor( 'wordplus-camera-effects', 'video', look );
    } ),
};

// AI Noise Removal's engine, from a pack of its own (UiHost.noiseUrl), as the page finds it: window.wordplusRealtimeNoise.
const noiseEngine = {
    version: 1,
    noise: vi.fn( async () => processor( 'wordplus-noise-removal', 'audio' ) ),
};

/**
 * A track of the room client: it takes a processor, starts it on its own track, and then reads the processed one. The
 * device's own track stays in `mediaStream`, as LiveKit keeps it.
 */
function roomTrack( kind: 'audio' | 'video', raw = mediaTrack( kind, 'raw ' + kind ) ) {
    let current: FakeProcessor | undefined;
    const track = {
        raw,
        isStopped: false,
        audioContext: undefined as unknown,
        get mediaStreamTrack() {
            return current?.processedTrack ?? track.raw;
        },
        get mediaStream() {
            return { getVideoTracks: () => kind === 'video' ? [ track.raw ] : [], getAudioTracks: () => kind === 'audio' ? [ track.raw ] : [] };
        },
        setAudioContext: vi.fn( async ( context: unknown ) => {
            track.audioContext = context;
        } ),
        setProcessor: vi.fn( async ( given: FakeProcessor ) => {
            await given.init( { track: raw } );
            current = given;
        } ),
        stopProcessor: vi.fn( async () => {
            await current?.destroy();
            current = undefined;
        } ),
        getProcessor: () => current,
    };
    return track;
}

// Web Audio, for the microphone test's recording and its playback.
const audio = { processors: [] as Array<{ onaudioprocess: ( ( event: unknown ) => void ) | null }>, sources: [] as unknown[], played: [] as Array<{ onended: ( () => void ) | null }> };
class FakeAudioContext {
    sampleRate = 48000;
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createMediaStreamSource( stream: unknown ) {
        audio.sources.push( stream );
        return { connect: ( to: unknown ) => to, disconnect() {} };
    }
    createChannelMerger() {
        return { connect: ( to: unknown ) => to, disconnect() {} };
    }
    createScriptProcessor() {
        const node = { onaudioprocess: null, connect: ( to: unknown ) => to, disconnect() {} };
        audio.processors.push( node );
        return node;
    }
    createGain() {
        return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: ( to: unknown ) => to, disconnect() {} };
    }
    createMediaStreamDestination() {
        return {};
    }
    createBuffer( _channels: number, length: number, rate: number ) {
        const data = new Float32Array( length );
        return { getChannelData: () => data, duration: length / rate };
    }
    createBufferSource() {
        const source = { buffer: null, onended: null, connect: ( to: unknown ) => to, start: vi.fn() };
        audio.played.push( source );
        return source;
    }
    createOscillator() {
        return { type: '', frequency: { value: 0 }, connect: ( to: unknown ) => to, start() {}, stop() {} };
    }
}

const settle = () => act( async () => {
    for ( let i = 0; i < 5; i++ ) await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
} );

// The catalog's five as a site serves them once its administrator picked them: from its own uploads, named in its language.
const BUILT_IN = [ [ 'office', 'Office' ], [ 'living', 'Living Room' ], [ 'library', 'Library' ], [ 'nature', 'Lake' ], [ 'loft', 'Loft' ] ]
    .map( ( [ id, name ] ) => ( { id, name, url: `/up/${ id }-1a2b.webp`, thumb: `/up/${ id }-thumb-3c4d.webp` } ) );

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42, accentColor: () => '#21759b', effectsUrl: () => '/fx/', noiseUrl: () => '/nx/', backgrounds: () => [], builtInBackgrounds: () => BUILT_IN } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeEffects = engine;
    ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = noiseEngine;
    ( window as unknown as { AudioContext: unknown } ).AudioContext = FakeAudioContext;
    ( globalThis as Record<string, unknown> ).AudioWorkletNode = class {};
    mediaAccess.set( 'camera', 'granted' );
    mediaAccess.set( 'microphone', 'granted' );
    made.length = 0;
    fail.camera = false;
    audio.processors.length = 0;
    audio.sources.length = 0;
    audio.played.length = 0;
    engine.camera.mockClear();
    noiseEngine.noise.mockClear();
    chooseEffects( { camera: 'none', noise: false } );
    forgetEffectsWarmth();
    gpu.renderer = 'Apple GPU';
    forgetEffectsDevice();
    window.localStorage.removeItem( WARM_KEY );
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: {
            enumerateDevices: async () => [],
            getUserMedia: vi.fn( async ( asked: MediaStreamConstraints ) => {
                const tracks = [ ...( asked.audio ? [ mediaTrack( 'audio', 'test microphone' ) ] : [] ), ...( asked.video ? [ mediaTrack( 'video', 'test camera' ) ] : [] ) ];
                return { getTracks: () => tracks, getAudioTracks: () => tracks.filter( ( t ) => t.kind === 'audio' ), getVideoTracks: () => tracks.filter( ( t ) => t.kind === 'video' ) };
            } ),
        },
    } );
    Object.defineProperty( HTMLMediaElement.prototype, 'srcObject', {
        configurable: true,
        get() { return ( this as { stream?: unknown } ).stream ?? null; },
        set( stream: unknown ) { ( this as { stream?: unknown } ).stream = stream; },
    } );
} );

afterEach( () => {
    cleanup();
    delete ( window as unknown as { AudioContext?: unknown } ).AudioContext;
} );

/**
 * The device settings over a call that puts the effects on what it sends, and the call's tracks following them.
 * `sent`, the camera the call sends as the context hands it, live.
 */
function panel( { effects = true, start, camera = null, microphone = null, sent = false }: { effects?: boolean, start?: 'camera' | 'microphone', camera?: ProcessorTrack | null, microphone?: ProcessorTrack | null, sent?: boolean } = {} ) {
    const call = fakeCall( { effects, ...( sent ? { myCameraTrack: fakeTrack() } : {} ) } as never );
    function Tracks() {
        useTrackEffects( camera, microphone );
        return null;
    }
    return render( <CallContext.Provider value={ call }>
        <Tracks />
        <DevicePanel video group start={ start } close={ () => {} } />
    </CallContext.Provider> );
}

const tile = ( container: HTMLElement, name: string ) => container.querySelector( `.wplus-call-effect[aria-label="${ name }"]` ) as HTMLElement;
const noiseSwitch = ( container: HTMLElement ) => container.querySelector( '.wplus-call-noise[role="switch"]' ) as HTMLElement | null;

describe( 'the call effects', () => {
    it( 'are off until chosen, and this browser keeps what is chosen', () => {
        expect( effectsChoice() ).toEqual( { camera: 'none', noise: false, tune: {} } );
        chooseEffects( { camera: 'image:office' } );
        chooseEffects( { noise: true } );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ) ).toEqual( { camera: 'image:office', noise: true, tune: {} } );
    } );

    it( 'follow a choice made in another tab of the browser', async () => {
        const { container } = panel();
        expect( tile( container, 'Lake' ).getAttribute( 'aria-checked' ) ).toBe( 'false' );

        window.localStorage.setItem( EFFECTS_KEY, JSON.stringify( { camera: 'image:nature', noise: true } ) );
        await act( async () => void window.dispatchEvent( new StorageEvent( 'storage', { key: EFFECTS_KEY } ) ) );
        expect( tile( container, 'Lake' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( noiseSwitch( container )!.getAttribute( 'aria-checked' ) ).toBe( 'true' );
    } );

    it( 'are offered in the device settings only where the call puts them on what it sends and the host serves them', async () => {
        let { container, unmount } = panel();
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].map( ( one ) => one.getAttribute( 'aria-label' ) ) )
            .toEqual( [ 'None', 'Blur', 'Office', 'Living Room', 'Library', 'Lake', 'Loft' ] );
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( tile( container, 'Office' ).querySelector( 'img' )!.getAttribute( 'src' ) ).toBe( '/up/office-thumb-3c4d.webp' );
        expect( tile( container, 'Office' ).querySelector( 'img' )!.getAttribute( 'crossorigin' ) ).toBe( 'anonymous' );
        expect( noiseSwitch( container )!.getAttribute( 'aria-checked' ) ).toBe( 'false' );
        // What it adds to the browser's own, and to turn it off where the device struggles, as the backgrounds say.
        expect( noiseSwitch( container )!.textContent ).toContain( 'Takes out typing, fans and other sounds the browser leaves in.' );
        expect( noiseSwitch( container )!.textContent ).toContain( 'If your voice breaks up or your device gets warm, turn it off.' );
        // Nothing of the engines loads for showing them, where the camera's cannot be made ready beforehand (no canvas
        // here gives a track: 'the camera's effect made ready as the settings open' gives one).
        expect( engine.camera ).not.toHaveBeenCalled();
        expect( noiseEngine.noise ).not.toHaveBeenCalled();
        unmount();

        ( { container, unmount } = panel( { effects: false } ) );
        expect( container.querySelector( '.wplus-call-effects' ) ).toBeNull();
        expect( noiseSwitch( container ) ).toBeNull();
        unmount();

        // Each from its own pack: the backgrounds without the effects' pack are not offered, AI Noise Removal still is,
        configureUi( { effectsUrl: () => '' } );
        ( { container, unmount } = panel() );
        expect( container.querySelector( '.wplus-call-effect' ) ).toBeNull();
        expect( noiseSwitch( container ) ).not.toBeNull();
        unmount();

        // and the other way round.
        configureUi( { effectsUrl: () => '/fx/', noiseUrl: () => '' } );
        ( { container, unmount } = panel() );
        expect( tile( container, 'Blur' ) ).not.toBeNull();
        expect( noiseSwitch( container ) ).toBeNull();
        unmount();

        // A browser without an AudioWorklet is not offered the noise removal.
        configureUi( { effectsUrl: () => '/fx/', noiseUrl: () => '/nx/' } );
        delete ( globalThis as Record<string, unknown> ).AudioWorkletNode;
        ( { container } = panel() );
        expect( noiseSwitch( container ) ).toBeNull();
        expect( tile( container, 'Blur' ) ).not.toBeNull();
    } );

    it( 'put the chosen background on the camera the call sends, swap it in place, and take it off again', async () => {
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );

        fireEvent.click( tile( container, 'Office' ) );
        await settle();
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).camera ).toBe( 'image:office' );
        expect( engine.camera ).toHaveBeenCalledWith( { image: '/up/office-1a2b.webp' } );
        expect( camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( tile( container, 'Office' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );

        // Another look is the same processor: the track sent stays.
        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( made[ 0 ].setLook ).toHaveBeenCalledWith( { blur: true } );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );

        fireEvent.click( tile( container, 'None' ) );
        await settle();
        expect( camera.stopProcessor ).toHaveBeenCalledTimes( 1 );
        expect( made[ 0 ].destroyed ).toBe( true );
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
    } );

    it( 'leave the model to the engine: no High Quality of the person\'s or the app\'s, a choice kept with one read without it', async () => {
        // What a browser kept while the person had a High Quality switch, turned off (before 2026-11-02).
        window.localStorage.setItem( EFFECTS_KEY, JSON.stringify( { camera: 'blur', noise: false, quality: false } ) );
        window.dispatchEvent( new StorageEvent( 'storage', { key: EFFECTS_KEY } ) );
        expect( effectsChoice() ).toEqual( { camera: 'blur', noise: false, tune: {} } );

        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( engine.camera, 'the look alone, no quality of any kind' ).toHaveBeenCalledWith( { blur: true } );
        expect( container.textContent ).not.toContain( 'High Quality' );
    } );

    it( 'say under the backgrounds, while one is on, to turn it off where the device struggles, on any device, with no quality to switch', async () => {
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        const hint = () => container.querySelector( '[data-part="effects-cost"]' )?.textContent;
        expect( hint(), 'said with no background on' ).toBeUndefined();

        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( hint() ).toBe( 'If your video stutters or your device gets warm, turn the background off.' );
        expect( container.querySelector( '[role="switch"][aria-label="High Quality"]' ), 'High Quality is gone' ).toBeNull();

        fireEvent.click( tile( container, 'Office' ) );
        await settle();
        expect( hint() ).toBe( 'If your video stutters or your device gets warm, turn the background off.' );

        fireEvent.click( tile( container, 'None' ) );
        await settle();
        expect( hint() ).toBeUndefined();
    } );

    it( 'offer Effect Settings, closed, once an effect is on, saying it may miss, and put the person\'s tuning on the camera as they move it, kept by the browser', async () => {
        ( engine as Record<string, unknown> ).tune = true;
        try {
            const camera = roomTrack( 'video' );
            const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
            expect( container.querySelector( '.wplus-call-tune' ), 'nothing while no effect is on' ).toBeNull();

            fireEvent.click( tile( container, 'Blur' ) );
            await settle();
            const head = container.querySelector( '.wplus-call-tune-head' ) as HTMLElement;
            expect( head.textContent ).toBe( 'Effect Settings' );
            expect( head.getAttribute( 'aria-expanded' ) ).toBe( 'false' );
            expect( container.querySelector( '.wplus-call-tune-row' ), 'closed at first' ).toBeNull();
            expect( container.textContent, 'the line on what helps showed with the settings closed' ).not.toContain( 'Edges not quite right?' );

            fireEvent.click( head );
            expect( head.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
            expect( container.querySelector( '.wplus-call-tune-body' )!.textContent ).toContain( 'Edges not quite right? Even light and a plain wall behind you help' );
            const names = () => [ ...container.querySelectorAll( '.wplus-call-tune-row' ) ].map( ( row ) => row.getAttribute( 'data-tune' ) );
            expect( names() ).toEqual( [ 'outline', 'edge', 'steady', 'blur' ] );
            const slider = ( name: string ) => container.querySelector( `.wplus-call-tune-row[data-tune="${ name }"] input[type="range"]` ) as HTMLInputElement;
            expect( slider( 'outline' ).value, 'each in its middle, as the effect ships' ).toBe( '0.5' );
            expect( slider( 'outline' ).getAttribute( 'aria-label' ) ).toBe( 'Outline' );
            expect( container.querySelector( '.wplus-call-tune-row[data-tune="outline"] .wplus-call-tune-ends' )!.textContent ).toBe( 'TighterWider' );
            expect( container.querySelector( '[data-part="tune-reset"]' ), 'no Reset with nothing moved' ).toBeNull();

            fireEvent.change( slider( 'outline' ), { target: { value: '0.8' } } );
            fireEvent.change( slider( 'blur' ), { target: { value: '1' } } );
            await settle();
            expect( made[ 0 ].setLook ).toHaveBeenLastCalledWith( { blur: true, tune: { outline: 0.8, blur: 1 } } );
            expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).tune ).toEqual( { outline: 0.8, blur: 1 } );
            expect( slider( 'outline' ).value ).toBe( '0.8' );

            fireEvent.click( tile( container, 'Office' ) );
            await settle();
            expect( names(), 'Blur Strength only while the room is blurred' ).toEqual( [ 'outline', 'edge', 'steady' ] );
            expect( made[ 0 ].setLook ).toHaveBeenLastCalledWith( { image: '/up/office-1a2b.webp', tune: { outline: 0.8, blur: 1 } } );

            fireEvent.click( container.querySelector( '[data-part="tune-reset"]' )! );
            await settle();
            expect( made[ 0 ].setLook ).toHaveBeenLastCalledWith( { image: '/up/office-1a2b.webp' } );
            expect( effectsChoice().tune ).toEqual( {} );
            expect( slider( 'outline' ).value ).toBe( '0.5' );
        } finally {
            delete ( engine as Record<string, unknown> ).tune;
            chooseEffects( { tune: {} } );
        }
    } );

    it( 'offer no Adjust where the site\'s effects are from before the tuning, and read a tuning kept wrongly as none of it', async () => {
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( container.querySelector( '.wplus-call-tune' ) ).toBeNull();

        chooseEffects( { tune: { outline: 3, edge: 'soft', steady: Number.NaN, blur: 0.2 } as never } );
        expect( effectsChoice().tune ).toEqual( { outline: 1, blur: 0.2 } );
        expect( cameraLook( 'blur', {} ), 'no tuning sent while none is moved' ).toEqual( { blur: true } );
        chooseEffects( { tune: {} } );
    } );

    it( 'take the noise out of the microphone the call sends, with a context of its own where it has none', async () => {
        const microphone = roomTrack( 'audio' );
        const { container } = panel( { microphone: microphone as unknown as ProcessorTrack } );

        fireEvent.click( noiseSwitch( container )! );
        await settle();
        expect( noiseSwitch( container )!.getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).noise ).toBe( true );
        expect( microphone.setAudioContext ).toHaveBeenCalledWith( made[ 0 ].context );
        expect( microphone.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( microphone.mediaStreamTrack.label ).toBe( 'processed 0' );

        fireEvent.click( noiseSwitch( container )! );
        await settle();
        expect( microphone.stopProcessor ).toHaveBeenCalledTimes( 1 );
        expect( microphone.mediaStreamTrack ).toBe( microphone.raw );
    } );

    // AI Noise Removal's files, 12 MB, took some 12 s to come the first time on a browser, and again on each visit once
    // its cache let them go, the microphone held back from the call all the while.
    it( 'never hold a microphone back for AI Noise Removal still on its way: the call takes it as it hears after a second, and the noise removal goes on it once it is ready', async () => {
        chooseEffects( { noise: true } );
        // Its files on their way: the engine's warm() answers once they are in.
        const waiting: Array<() => void> = [];
        const arrived = () => waiting.forEach( ( done ) => done() );
        const warm = vi.fn( () => new Promise<void>( ( done ) => { waiting.push( done ); } ) );
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = { ...noiseEngine, warm };
        const microphone = roomTrack( 'audio' );
        const stream = roomTrack( 'audio' );

        vi.useFakeTimers();
        let held = true;
        let live = false;
        try {
            const taken = applyEffect( microphone as unknown as ProcessorTrack, 'noise', true ).then( () => { held = false; } );
            // A stream going live waits for it however long it takes, as before: it says so, with Cancel.
            void applyEffect( stream as unknown as ProcessorTrack, 'noise' ).then( () => { live = true; } );
            await vi.advanceTimersByTimeAsync( NOISE_WAIT_MS - 100 );
            expect( held, 'the microphone was given up before the second was over' ).toBe( true );
            await vi.advanceTimersByTimeAsync( 200 );
            await taken;
            await vi.advanceTimersByTimeAsync( 5000 );
        } finally {
            vi.useRealTimers();
        }
        expect( held ).toBe( false );
        expect( live ).toBe( false );
        // Nothing on the track yet: the room client holds a track while its processor starts, and a publish with it.
        expect( microphone.setProcessor ).not.toHaveBeenCalled();
        expect( microphone.mediaStreamTrack ).toBe( microphone.raw );

        arrived();
        await settle();
        expect( warm ).toHaveBeenCalledTimes( 2 );
        expect( microphone.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( microphone.mediaStreamTrack.label ).toMatch( /^processed / );
        expect( live ).toBe( true );
        expect( stream.mediaStreamTrack.label ).toMatch( /^processed / );
    } );

    it( 'put AI Noise Removal on the microphone before the call takes it where its files are in the browser, with a pack that reads nothing ahead too', async () => {
        chooseEffects( { noise: true } );
        const warm = vi.fn( async () => {} );
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = { ...noiseEngine, warm };
        const microphone = roomTrack( 'audio' );
        await applyEffect( microphone as unknown as ProcessorTrack, 'noise', true );
        expect( warm ).toHaveBeenCalledTimes( 1 );
        expect( microphone.mediaStreamTrack.label ).toBe( 'processed 0' );

        // The pack of before (1.1.0's), whose engine has no warm().
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = noiseEngine;
        const older = roomTrack( 'audio' );
        await applyEffect( older as unknown as ProcessorTrack, 'noise', true );
        expect( older.mediaStreamTrack.label ).toBe( 'processed 1' );

        // One whose files did not come is asked again as the processor starts, and says so itself if it cannot.
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = { ...noiseEngine, warm: vi.fn( async () => { throw new Error( 'offline' ); } ) };
        const offline = roomTrack( 'audio' );
        await applyEffect( offline as unknown as ProcessorTrack, 'noise', true );
        expect( offline.mediaStreamTrack.label ).toBe( 'processed 2' );
    } );

    it( 'read AI Noise Removal\'s files ahead of the microphone as the call\'s screen opens for someone who has it on, and nothing while it is off', async () => {
        const warm = vi.fn( async () => {} );
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = { ...noiseEngine, warm };
        panel( {} );
        await settle();
        expect( warm ).not.toHaveBeenCalled();

        await act( async () => chooseEffects( { noise: true } ) );
        await settle();
        expect( warm ).toHaveBeenCalledTimes( 1 );
        // Its files alone: no processor, and no context, before there is a microphone.
        expect( noiseEngine.noise ).not.toHaveBeenCalled();
    } );

    it( 'leave the track as it is where an effect cannot start, and say so', async () => {
        fail.camera = true;
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );

        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        expect( container.querySelector( '.wplus-call-effects .wplus-call-device-note' )!.textContent ).toBe( 'This effect could not start on this device.' );
    } );

    it( 'show the camera preview with the effect, the user alone seeing it', async () => {
        chooseEffects( { camera: 'blur' } );
        const { container } = panel( { start: 'camera' } );
        await settle();

        const video = container.querySelector( '.wplus-call-device-preview video' ) as HTMLVideoElement & { srcObject: { getTracks(): MediaStreamTrack[] } };
        expect( engine.camera ).toHaveBeenCalledWith( { blur: true } );
        expect( made[ 0 ].input!.label ).toBe( 'test camera' );
        expect( video.srcObject.getTracks()[ 0 ].label ).toBe( 'processed 0' );
    } );

    it( 'keep the preview at the top of the settings while Effect Settings is open, the same picture, and let it go as it closes', async () => {
        ( engine as Record<string, unknown> ).tune = true;
        try {
            chooseEffects( { camera: 'blur' } );
            const { container } = panel( { start: 'camera' } );
            await settle();
            const holder = () => container.querySelector( '.wplus-call-device-preview-holder' );
            const video = container.querySelector( '.wplus-call-device-preview video' );
            expect( holder()!.getAttribute( 'data-pinned' ), 'pinned with Effect Settings closed' ).toBeNull();

            fireEvent.click( container.querySelector( '.wplus-call-tune-head' )! );
            await settle();
            expect( holder()!.getAttribute( 'data-pinned' ) ).toBe( '1' );
            expect( holder()!.querySelector( 'video' ), 'the preview drawn again as it was pinned' ).toBe( video );

            fireEvent.click( container.querySelector( '.wplus-call-tune-head' )! );
            await settle();
            expect( holder()!.getAttribute( 'data-pinned' ) ).toBeNull();

            // Gone with the effect: nothing stays pinned.
            fireEvent.click( container.querySelector( '.wplus-call-tune-head' )! );
            fireEvent.click( tile( container, 'None' ) );
            await settle();
            expect( holder()!.getAttribute( 'data-pinned' ) ).toBeNull();
        } finally {
            delete ( engine as Record<string, unknown> ).tune;
        }
    } );

    it( 'show the camera the call sends while Effect Settings is open, the own tile being out of sight under the settings', async () => {
        ( engine as Record<string, unknown> ).tune = true;
        try {
            const camera = roomTrack( 'video' );
            const { container } = panel( { camera: camera as unknown as ProcessorTrack, sent: true } );
            fireEvent.click( tile( container, 'Blur' ) );
            await settle();
            expect( container.querySelector( '.wplus-call-device-preview' ), 'the camera shown twice with the self view in sight' ).toBeNull();

            fireEvent.click( container.querySelector( '.wplus-call-tune-head' )! );
            await settle();
            expect( container.querySelector( '.wplus-call-device-preview[data-live] .wplus-call-devices-badge' )?.textContent ).toBe( 'Everyone sees this' );
            expect( container.querySelector( '.wplus-call-device-preview-holder' )!.getAttribute( 'data-pinned' ) ).toBe( '1' );

            fireEvent.click( container.querySelector( '.wplus-call-tune-head' )! );
            await settle();
            expect( container.querySelector( '.wplus-call-device-preview' ) ).toBeNull();
        } finally {
            delete ( engine as Record<string, unknown> ).tune;
        }
    } );

    // A second heard by the test's recorder, both of what it records.
    const speak = async () => {
        const recorder = audio.processors[ audio.processors.length - 1 ];
        await act( async () => {
            for ( let i = 0; i < 12; i++ ) recorder.onaudioprocess!( { inputBuffer: { getChannelData: () => new Float32Array( 4096 ).fill( 0.2 ) } } );
        } );
    };
    const playback = ( container: HTMLElement ) => container.querySelector( '.wplus-call-device-playback' ) as HTMLElement | null;

    it( 'play the microphone test back as it was heard', async () => {
        const { container } = panel( { start: 'microphone' } );
        await settle();
        expect( ( audio.sources.at( -1 ) as { getTracks(): MediaStreamTrack[] } ).getTracks()[ 0 ].label ).toBe( 'test microphone' );
        expect( playback( container ) ).toBeNull();

        await speak();
        expect( playback( container )!.textContent ).toBe( 'Play Back' );
        fireEvent.click( playback( container )! );
        await settle();
        expect( audio.played ).toHaveLength( 1 );
        expect( playback( container )!.textContent ).toBe( 'Playing...' );

        await act( async () => audio.played[ 0 ].onended!() );
        expect( playback( container ) ).toBeNull();
    } );

    it( 'play the same seconds of the test without AI Noise Removal and then with it, where it is on', async () => {
        chooseEffects( { noise: true } );
        const { container } = panel( { start: 'microphone' } );
        await settle();

        // The microphone as it gives the sound, and the same with the noise removed, recorded side by side.
        const [ raw, cleaned ] = audio.sources.slice( -2 ) as Array<{ getTracks(): MediaStreamTrack[] }>;
        expect( raw.getTracks()[ 0 ].label ).toBe( 'test microphone' );
        expect( cleaned.getTracks()[ 0 ].label ).toBe( 'processed 0' );

        await speak();
        fireEvent.click( playback( container )! );
        await settle();
        expect( audio.played ).toHaveLength( 2 );
        expect( playback( container )!.textContent ).toBe( 'Without AI Noise Removal' );
        await waitFor( () => expect( playback( container )!.textContent ).toBe( 'With AI Noise Removal' ), { timeout: 4000 } );

        await act( async () => audio.played[ 1 ].onended!() );
        expect( playback( container ) ).toBeNull();
    } );

    // Two pictures of the app's own, as its host gives them.
    const SITE = [
        { id: 12, url: 'https://cdn.example.com/beach-1280x720.jpg', thumb: 'https://cdn.example.com/beach-300x169.jpg', name: 'Beach' },
        { id: 'studio', url: '/uploads/studio.jpg', name: 'Studio' },
    ];

    it( 'offer the app\'s own backgrounds after the effects\' five, and put the one chosen behind the person', async () => {
        configureUi( { backgrounds: () => SITE } );
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].map( ( one ) => one.getAttribute( 'aria-label' ) ) )
            .toEqual( [ 'None', 'Blur', 'Office', 'Living Room', 'Library', 'Lake', 'Loft', 'Beach', 'Studio' ] );
        // Its tile reads the small picture, or the picture where there is none, with CORS as WebGL will.
        const beach = tile( container, 'Beach' ).querySelector( 'img' )!;
        expect( beach.getAttribute( 'src' ) ).toBe( 'https://cdn.example.com/beach-300x169.jpg' );
        expect( beach.getAttribute( 'crossorigin' ) ).toBe( 'anonymous' );
        expect( tile( container, 'Studio' ).querySelector( 'img' )!.getAttribute( 'src' ) ).toBe( '/uploads/studio.jpg' );

        fireEvent.click( tile( container, 'Beach' ) );
        await settle();
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).camera ).toBe( 'site:12' );
        expect( tile( container, 'Beach' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( engine.camera ).toHaveBeenCalledWith( { image: 'https://cdn.example.com/beach-1280x720.jpg' } );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
    } );

    it( 'offer only the built-in ones the app picked, and read one it no longer offers as none', async () => {
        // The administrator picked two of the catalog, and an older app saying true or false offers none of them.
        configureUi( { backgrounds: () => SITE, builtInBackgrounds: () => BUILT_IN.filter( ( one ) => one.id !== 'office' && one.id !== 'living' && one.id !== 'loft' ) } );
        chooseEffects( { camera: 'image:office' } );
        let { container, unmount } = panel();
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].map( ( one ) => one.getAttribute( 'aria-label' ) ) )
            .toEqual( [ 'None', 'Blur', 'Library', 'Lake', 'Beach', 'Studio' ] );
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( cameraLook( 'image:office' ) ).toBeNull();
        expect( cameraLook( 'image:nature' ) ).toEqual( { image: '/up/nature-1a2b.webp' } );
        unmount();

        configureUi( { builtInBackgrounds: ( () => true ) as never } );
        ( { container, unmount } = panel() );
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].map( ( one ) => one.getAttribute( 'aria-label' ) ) )
            .toEqual( [ 'None', 'Blur', 'Beach', 'Studio' ] );
        unmount();

        // The admin took Studio away: the browser that chose it has none, and the camera goes out as it is.
        chooseEffects( { camera: 'site:studio' } );
        configureUi( { backgrounds: () => SITE.slice( 0, 1 ) } );
        const camera = roomTrack( 'video' );
        ( { container } = panel( { camera: camera as unknown as ProcessorTrack } ) );
        await settle();
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
    } );

    it( 'mark a picture of the app\'s this browser cannot draw, and never choose it', async () => {
        configureUi( { backgrounds: () => SITE } );
        const { container } = panel();
        // Another origin without CORS: the picture asked for with CORS does not load.
        await act( async () => void fireEvent.error( tile( container, 'Beach' ).querySelector( 'img' )! ) );
        expect( tile( container, 'Beach' ).getAttribute( 'aria-disabled' ) ).toBe( 'true' );
        expect( tile( container, 'Beach' ).getAttribute( 'title' ) ).toBe( 'Beach: This picture cannot be used here.' );
        fireEvent.click( tile( container, 'Beach' ) );
        await settle();
        expect( effectsChoice().camera ).toBe( 'none' );
        expect( engine.camera ).not.toHaveBeenCalled();
    } );
} );

// People's own pictures, where the app lets them (UiHost.ownBackgrounds): a file of the device read, scaled and kept by
// the browser alone. The decoder and the canvas stand in for the browser's: a phone's photo of 4032 by 3024, and a
// JPEG out. This page has no IndexedDB, as a browser that keeps nothing, so the pictures last as long as the page.
describe( 'people\'s own pictures', () => {
    const drawn: Array<{ width: number, height: number }> = [];
    const revoked: string[] = [];
    const sent: string[] = [];
    const errors: unknown[] = [];
    const realContext = HTMLCanvasElement.prototype.getContext;
    const realToBlob = HTMLCanvasElement.prototype.toBlob;
    const realRevoke = URL.revokeObjectURL;
    const realFetch = globalThis.fetch;
    const realSend = XMLHttpRequest.prototype.send;

    beforeEach( () => {
        resetOwnBackgrounds();
        drawn.length = revoked.length = sent.length = errors.length = 0;
        configureUi( { ownBackgrounds: () => true, showError: ( error ) => void errors.push( error ) } );
        ( globalThis as Record<string, unknown> ).createImageBitmap = vi.fn( async () => ( { width: 4032, height: 3024, close: vi.fn() } ) );
        HTMLCanvasElement.prototype.getContext = function ( this: HTMLCanvasElement, kind: string, ...rest: unknown[] ) {
            const canvas = this;
            return kind === '2d'
                ? { imageSmoothingQuality: 'low', drawImage: () => void drawn.push( { width: canvas.width, height: canvas.height } ) }
                : ( realContext as ( ...args: unknown[] ) => unknown ).call( this, kind, ...rest );
        } as never;
        HTMLCanvasElement.prototype.toBlob = function ( callback: BlobCallback, type?: string ) {
            callback( new Blob( [ 'scaled' ], { type } ) );
        };
        URL.revokeObjectURL = ( url: string ) => void revoked.push( url );
        // Whatever would carry the picture off the page.
        globalThis.fetch = ( async ( input: RequestInfo | URL ) => {
            sent.push( String( input ) );
            return new Response( '' );
        } ) as typeof fetch;
        XMLHttpRequest.prototype.send = function () {
            sent.push( 'xhr' );
        };
    } );

    afterEach( () => {
        configureUi( { ownBackgrounds: () => false } );
        delete ( globalThis as Record<string, unknown> ).createImageBitmap;
        HTMLCanvasElement.prototype.getContext = realContext;
        HTMLCanvasElement.prototype.toBlob = realToBlob;
        URL.revokeObjectURL = realRevoke;
        globalThis.fetch = realFetch;
        XMLHttpRequest.prototype.send = realSend;
    } );

    const picker = ( container: HTMLElement ) => container.querySelector( '.wplus-call-effects-file' ) as HTMLInputElement | null;
    const pick = async ( container: HTMLElement, file: File ) => {
        await act( async () => void fireEvent.change( picker( container )!, { target: { files: [ file ] } } ) );
        await settle();
    };
    const photo = ( name = 'beach.heic', type = 'image/heic' ) => new File( [ 'photo' ], name, { type } );
    const own = ( container: HTMLElement ) => [ ...container.querySelectorAll( '.wplus-call-effect[data-effect="own"]' ) ] as HTMLElement[];

    it( 'are not offered where the app does not let people use them', () => {
        configureUi( { ownBackgrounds: () => false } );
        const { container } = panel();
        expect( tile( container, 'Add Your Own' ) ).toBeNull();
        expect( picker( container ) ).toBeNull();
    } );

    it( 'are read and scaled on the page, never sent, and the one picked goes behind the person', async () => {
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].map( ( one ) => one.getAttribute( 'aria-label' ) ) )
            .toEqual( [ 'None', 'Blur', 'Office', 'Living Room', 'Library', 'Lake', 'Loft', 'Add Your Own' ] );
        expect( picker( container )!.getAttribute( 'accept' ) ).toBe( 'image/jpeg,image/png,image/webp,image/heic,image/heif' );

        await pick( container, photo() );
        // Scaled down to cover 1280 by 720, the size calls draw a background at.
        expect( drawn ).toEqual( [ { width: 1280, height: 960 } ] );
        const [ picture ] = own( container );
        expect( picture.getAttribute( 'aria-label' ) ).toBe( 'Your Picture' );
        expect( picture.getAttribute( 'aria-checked' ) ).toBe( 'true' );
        const url = picture.querySelector( 'img' )!.getAttribute( 'src' )!;
        expect( url ).toMatch( /^blob:/ );
        expect( effectsChoice().camera ).toMatch( /^own:[A-Za-z0-9]+$/ );
        expect( engine.camera ).toHaveBeenCalledWith( { image: url } );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( sent ).toEqual( [] );
        // A browser that keeps nothing: the picture is there for this call, and a line says so.
        expect( container.textContent ).toContain( 'This browser does not keep your pictures, so they last for this call only.' );
    } );

    it( 'keep the newest three, and one removed is gone and no longer behind the person', async () => {
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        for ( let i = 0; i < 4; i++ ) await pick( container, photo( `photo-${ i }.jpg`, 'image/jpeg' ) );
        expect( own( container ) ).toHaveLength( 3 );
        // The oldest went, its address let go.
        expect( revoked ).toHaveLength( 1 );
        const chosen = own( container ).find( ( one ) => one.getAttribute( 'aria-checked' ) === 'true' )!;
        const url = chosen.querySelector( 'img' )!.getAttribute( 'src' )!;

        await act( async () => void fireEvent.click( chosen.querySelector( '.wplus-call-effect-remove' )! ) );
        await settle();
        expect( own( container ) ).toHaveLength( 2 );
        expect( revoked ).toContain( url );
        expect( effectsChoice().camera ).toBe( 'none' );
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        expect( sent ).toEqual( [] );
    } );

    it( 'are not offered once the app stops letting people use them, the camera going out as it is, and come back with it', async () => {
        let { container, unmount } = panel();
        await pick( container, photo() );
        const chosen = effectsChoice().camera;
        unmount();

        configureUi( { ownBackgrounds: () => false } );
        const camera = roomTrack( 'video' );
        ( { container, unmount } = panel( { camera: camera as unknown as ProcessorTrack } ) );
        await settle();
        expect( own( container ) ).toHaveLength( 0 );
        expect( tile( container, 'Add Your Own' ) ).toBeNull();
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        expect( cameraLook( chosen ) ).toBeNull();
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        // The choice and the picture are kept, for when the app lets people use them again.
        expect( effectsChoice().camera ).toBe( chosen );
        unmount();

        configureUi( { ownBackgrounds: () => true } );
        expect( cameraLook( chosen ) ).toEqual( { image: expect.stringMatching( /^blob:/ ) } );
    } );

    it( 'refuse a file that is not a picture, or too big to read, saying why', async () => {
        const { container } = panel();
        await pick( container, new File( [ 'text' ], 'notes.txt', { type: 'text/plain' } ) );
        const big = photo( 'huge.jpg', 'image/jpeg' );
        Object.defineProperty( big, 'size', { value: 41 * 1024 * 1024 } );
        await pick( container, big );
        expect( errors ).toEqual( [
            'This picture could not be opened. Try a JPEG, PNG or WebP.',
            'This picture is too big. Try one under 40 MB.',
        ] );
        expect( own( container ) ).toHaveLength( 0 );
        expect( drawn ).toEqual( [] );
    } );
} );

// The camera's effect made ready on a computer as the device settings open (warmEffects()): the first background there
// compiles MediaPipe's GPU programs at its first frames, the page frozen some 7 seconds, and once compiled it takes a
// fraction of one. Here a canvas gives a track, as a browser's does, and the processor counts what it drew (`cost`).
describe( 'the camera\'s effect made ready as the settings open', () => {
    const preparing = ( container: HTMLElement ) => container.querySelector( '[data-part="effects-preparing"]' );
    const hint = ( container: HTMLElement ) => container.querySelector( '[data-part="effects-cost"]' );
    let picture: MediaStreamTrack;
    let fine = true;
    let saveData = false;
    const getContext = HTMLCanvasElement.prototype.getContext;

    // The engine's processor as the warm-up gets it, counting what it drew from init() on, as camera.ts's does.
    const counting = () => engine.camera.mockImplementationOnce( async ( look: unknown ) => {
        const own = processor( 'wordplus-camera-effects', 'video', look ) as FakeProcessor & { cost: { frames: number } };
        own.cost = { frames: 0 };
        const init = own.init;
        own.init = vi.fn( async ( options ) => {
            await init( options );
            own.cost.frames = 3;
        } );
        return own;
    } );

    const deferred = <T, >() => {
        let resolve!: ( value: T ) => void;
        const promise = new Promise<T>( ( done ) => { resolve = done; } );
        return { promise, resolve };
    };

    beforeEach( () => {
        picture = mediaTrack( 'video', 'the warm-up picture' );
        fine = true;
        saveData = false;
        Object.defineProperty( HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ( { getVideoTracks: () => [ picture ] } ) } );
        HTMLCanvasElement.prototype.getContext = function ( this: HTMLCanvasElement, kind: string, ...rest: unknown[] ) {
            return kind === '2d' ? { fillRect() {}, fillStyle: '' } : ( getContext as ( ...args: unknown[] ) => unknown ).call( this, kind, ...rest );
        } as never;
        vi.stubGlobal( 'matchMedia', ( query: string ) => ( { matches: query === '(any-pointer: fine)' ? fine : false, media: query, addEventListener() {}, removeEventListener() {} } ) );
        Object.defineProperty( navigator, 'connection', { configurable: true, get: () => ( { saveData } ) } );
    } );

    afterEach( () => {
        Object.defineProperty( HTMLCanvasElement.prototype, 'captureStream', { configurable: true, value: () => ( {} ) } );
        HTMLCanvasElement.prototype.getContext = getContext;
        vi.unstubAllGlobals();
        delete ( navigator as unknown as { connection?: unknown } ).connection;
    } );

    it( 'run the engine on a picture of its own, never a camera, saying so, and once a week for this browser and pack', async () => {
        counting();
        const camera = roomTrack( 'video' );
        let { container, unmount } = panel( { camera: camera as unknown as ProcessorTrack } );
        expect( preparing( container )?.textContent ).toBe( 'Preparing backgrounds…' );
        expect( preparing( container )?.getAttribute( 'role' ) ).toBe( 'status' );
        expect( preparing( container )?.querySelector( '.wplus-call-effects-spinner' ) ).not.toBeNull();

        await settle();
        expect( engine.camera ).toHaveBeenCalledTimes( 1 );
        expect( engine.camera ).toHaveBeenCalledWith( { blur: true } );
        expect( made[ 0 ].init ).toHaveBeenCalledWith( { track: picture } );
        // The call's camera is left as it is, and no device was asked for.
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        expect( navigator.mediaDevices.getUserMedia ).not.toHaveBeenCalled();
        // Once drawn, let go: the processor and its picture.
        await waitFor( () => expect( made[ 0 ].destroyed ).toBe( true ) );
        expect( picture.stop ).toHaveBeenCalled();
        expect( preparing( container ) ).toBeNull();
        expect( JSON.parse( window.localStorage.getItem( WARM_KEY )! ) ).toMatchObject( { v: 1, base: '/fx/', browser: navigator.userAgent } );
        unmount();

        // Open again, in this page or the next: nothing to make ready.
        ( { unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        unmount();
        forgetEffectsWarmth();
        const again = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        expect( preparing( again.container ) ).toBeNull();
        await settle();
        expect( engine.camera ).toHaveBeenCalledTimes( 1 );
        again.unmount();

        // A week on, or another pack the site downloaded: made ready again.
        const kept = JSON.parse( window.localStorage.getItem( WARM_KEY )! );
        window.localStorage.setItem( WARM_KEY, JSON.stringify( { ...kept, at: Date.now() - 8 * 86400000 } ) );
        forgetEffectsWarmth();
        counting();
        ( { unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await waitFor( () => expect( made[ 1 ]?.destroyed ).toBe( true ) );
        expect( engine.camera ).toHaveBeenCalledTimes( 2 );
        unmount();
        configureUi( { effectsUrl: () => '/fx-newer/' } );
        forgetEffectsWarmth();
        counting();
        ( { unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await waitFor( () => expect( made[ 2 ]?.destroyed ).toBe( true ) );
        expect( engine.camera ).toHaveBeenCalledTimes( 3 );
        expect( JSON.parse( window.localStorage.getItem( WARM_KEY )! ).base ).toBe( '/fx-newer/' );
    } );

    it( 'are not made ready on a phone, where the browser saves data, where the site has no effects, or in an audio call', async () => {
        fine = false;
        let { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        expect( tile( container, 'Blur' ), 'the backgrounds are still offered' ).not.toBeNull();
        expect( preparing( container ) ).toBeNull();
        unmount();

        fine = true;
        saveData = true;
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        unmount();

        saveData = false;
        configureUi( { effectsUrl: () => '' } );
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        unmount();

        configureUi( { effectsUrl: () => '/fx/' } );
        const call = fakeCall( { effects: true } as never );
        const audio = render( <CallContext.Provider value={ call }><DevicePanel video={ false } group close={ () => {} } /></CallContext.Provider> );
        await settle();
        audio.unmount();

        expect( engine.camera ).not.toHaveBeenCalled();
        expect( window.localStorage.getItem( WARM_KEY ) ).toBeNull();
    } );

    it( 'stop before the engine runs once the settings close, and start again as they open again', async () => {
        const held = deferred<FakeProcessor>();
        engine.camera.mockImplementationOnce( () => held.promise );
        const first = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        expect( engine.camera ).toHaveBeenCalledTimes( 1 );
        first.unmount();

        // The processor comes after the settings closed: let go before its first frame, and nothing kept.
        const late = processor( 'wordplus-camera-effects', 'video', { blur: true } );
        await act( async () => held.resolve( late ) );
        await settle();
        expect( late.init ).not.toHaveBeenCalled();
        expect( late.destroyed ).toBe( true );
        expect( picture.stop ).toHaveBeenCalled();
        expect( window.localStorage.getItem( WARM_KEY ) ).toBeNull();

        counting();
        const second = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        expect( preparing( second.container )?.textContent ).toBe( 'Preparing backgrounds…' );
        await waitFor( () => expect( made[ 1 ]?.destroyed ).toBe( true ) );
        expect( engine.camera ).toHaveBeenCalledTimes( 2 );
        expect( window.localStorage.getItem( WARM_KEY ) ).not.toBeNull();
    } );

    it( 'never hold a camera going live: its background goes on at once while the warm-up is still at its first frame', async () => {
        // The warm-up's first frame, which compiles the programs, never ends here.
        const stuck = deferred<void>();
        engine.camera.mockImplementationOnce( async ( look: unknown ) => {
            const own = processor( 'wordplus-camera-effects', 'video', look );
            own.init = vi.fn( async ( { track } ) => {
                own.input = track;
                await stuck.promise;
            } );
            return own;
        } );
        const { container } = panel( { camera: null } );
        await settle();
        expect( made[ 0 ].init ).toHaveBeenCalledWith( { track: picture } );

        // The camera turned on with Blur chosen, as a call puts it on before the room has it (Better Messages' tracks.ts).
        chooseEffects( { camera: 'blur' } );
        const camera = roomTrack( 'video' );
        await act( () => applyEffect( camera as unknown as ProcessorTrack, 'camera' ) );
        expect( camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 1' );
        expect( made[ 1 ].input, 'the camera went on its own processor' ).toBe( camera.raw );
        expect( made[ 0 ].input, 'the warm-up took a camera' ).toBe( picture );
        // The effect on says the engine is ready, whatever the warm-up does.
        await settle();
        expect( preparing( container ) ).toBeNull();
        expect( hint( container ) ).not.toBeNull();

        // Its first frame done after all, the warm-up lets its processor go and leaves the camera's: a second on, as
        // this processor counts no frames (a pack from before `cost`).
        await act( async () => stuck.resolve() );
        await waitFor( () => expect( made[ 0 ].destroyed ).toBe( true ), { timeout: 3000 } );
        expect( made[ 1 ].destroyed ).toBe( false );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 1' );
    } );

    it( 'say "Preparing your background…" while the one chosen gets ready, in place of the line on turning it off', async () => {
        window.localStorage.setItem( WARM_KEY, JSON.stringify( { v: 1, base: '/fx/', browser: navigator.userAgent, at: Date.now() } ) );
        const held = deferred<FakeProcessor>();
        engine.camera.mockImplementationOnce( () => held.promise );
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( preparing( container ), 'made ready before: nothing said' ).toBeNull();

        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( preparing( container )?.textContent ).toBe( 'Preparing your background…' );
        expect( preparing( container )?.querySelector( '.wplus-call-effects-spinner' ) ).not.toBeNull();
        expect( tile( container, 'Blur' ).getAttribute( 'data-busy' ) ).toBe( '1' );
        expect( hint( container ) ).toBeNull();

        await act( async () => held.resolve( processor( 'wordplus-camera-effects', 'video', { blur: true } ) ) );
        await settle();
        expect( preparing( container ) ).toBeNull();
        expect( hint( container )?.textContent ).toBe( 'If your video stutters or your device gets warm, turn the background off.' );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
    } );

    it( 'find a device whose model starts nowhere, and say so before anyone chooses a background', async () => {
        engine.camera.mockImplementationOnce( async () => {
            throw Object.assign( new Error( 'The person cannot be found on this device' ), { name: 'EffectsUnavailable', unavailable: true, reason: 'model' } );
        } );
        const { container } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        expect( container.querySelector( '[data-part="effects-unavailable"]' )?.textContent ).toBe( 'Backgrounds are not available on this device.' );
        expect( preparing( container ) ).toBeNull();
        expect( [ ...container.querySelectorAll( '.wplus-call-effect' ) ].every( ( one ) => one.getAttribute( 'aria-disabled' ) === 'true' ) ).toBe( true );
        expect( window.localStorage.getItem( WARM_KEY ) ).toBeNull();
        expect( picture.stop ).toHaveBeenCalled();
    } );
} );

// Where the background can't run on this device (cameraEffectsUnavailable()): its pack offered all the same, the device
// settings show every tile and let none be chosen, say so, and no track gets an effect (asked on 2026-11-02: "I want it
// to use good model or be disabled by user if it loads his device too much").
describe( 'the background on a device it can\'t run on', () => {
    const unavailableNote = ( container: HTMLElement ) => container.querySelector( '[data-part="effects-unavailable"]' );

    it( 'is not drawn where WebGL is drawn in software: every tile there and none to choose, said plainly, nothing loaded, the camera as it is', async () => {
        gpu.renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';
        forgetEffectsDevice();
        // Chosen before, on another device or another day.
        chooseEffects( { camera: 'blur' } );
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( unavailableNote( container )?.textContent ).toBe( 'Backgrounds are not available on this device.' );
        expect( unavailableNote( container )?.getAttribute( 'data-tone' ) ).toBe( 'warning' );
        const tiles = [ ...container.querySelectorAll( '.wplus-call-effect' ) ];
        expect( tiles.map( ( one ) => one.getAttribute( 'aria-label' ) ) ).toEqual( [ 'None', 'Blur', 'Office', 'Living Room', 'Library', 'Lake', 'Loft' ] );
        expect( tiles.every( ( one ) => one.getAttribute( 'aria-disabled' ) === 'true' ) ).toBe( true );
        expect( tile( container, 'None' ).getAttribute( 'aria-checked' ), 'what the others see' ).toBe( 'true' );
        expect( container.querySelector( '[data-part="effects-cost"]' ) ).toBeNull();

        fireEvent.click( tile( container, 'Office' ) );
        await settle();
        expect( effectsChoice().camera, 'the choice left as it was' ).toBe( 'blur' );
        expect( engine.camera ).not.toHaveBeenCalled();
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        // AI Noise Removal is its own, and still offered.
        expect( noiseSwitch( container ) ).not.toBeNull();
    } );

    it( 'is not drawn once a camera finds its model starts nowhere here: said, and not tried again', async () => {
        engine.camera.mockImplementationOnce( async () => {
            throw Object.assign( new Error( 'The person cannot be found on this device' ), { name: 'EffectsUnavailable', unavailable: true, reason: 'model' } );
        } );
        const camera = roomTrack( 'video' );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        expect( unavailableNote( container ) ).toBeNull();
        fireEvent.click( tile( container, 'Blur' ) );
        await settle();
        expect( unavailableNote( container ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-call-device-note[data-tone="warning"]:not([data-part])' ), 'the one line, not two' ).toBeNull();
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        await act( () => applyEffect( camera as unknown as ProcessorTrack, 'camera' ) );
        expect( engine.camera ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'leaves the background as it was where it failed for another reason (a picture that did not load), the tiles still to choose', async () => {
        engine.camera.mockImplementationOnce( async () => {
            throw new Error( 'The background did not load: /up/office-1a2b.webp' );
        } );
        const { container } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        fireEvent.click( tile( container, 'Office' ) );
        await settle();
        expect( unavailableNote( container ) ).toBeNull();
        expect( container.textContent ).toContain( 'This effect could not start on this device.' );
        expect( tile( container, 'Blur' ).getAttribute( 'aria-disabled' ) ).toBeNull();
    } );
} );

// The engine telling the page once that a background slows the device (src/effects/quality.ts): the call screens say
// so over the dock, at most once a call, with Turn Off, and the same model goes on either way.
describe( 'the notice of a background slowing the device', () => {
    const slow = () => act( async () => void window.dispatchEvent( new CustomEvent( EFFECTS_SLOW_EVENT, { detail: { ms: 72 } } ) ) );
    const notice = ( container: HTMLElement ) => container.querySelector( '.wplus-call-effects-slow' );

    function call( camera: ProcessorTrack ) {
        function Screen() {
            useTrackEffects( camera, null );
            return <EffectsSlowNotice />;
        }
        return render( <Screen /> );
    }

    it( 'says it once a call, over the dock, with the settings\' line and Turn Off, which takes the background off', async () => {
        chooseEffects( { camera: 'blur' } );
        const camera = roomTrack( 'video' );
        const { container } = call( camera as unknown as ProcessorTrack );
        await settle();
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( notice( container ) ).toBeNull();

        await slow();
        expect( notice( container )?.closest( '.wplus-call-join-prompt-region' )?.getAttribute( 'role' ) ).toBe( 'status' );
        expect( notice( container )?.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'Your background is slowing this device' );
        expect( notice( container )?.querySelector( '.wplus-call-join-prompt-note' )?.textContent ).toBe( 'If your video stutters or your device gets warm, turn the background off.' );
        // The model is the engine's own business: nothing on the track changes until the person says so.
        expect( camera.setProcessor ).toHaveBeenCalledTimes( 1 );
        expect( camera.stopProcessor ).not.toHaveBeenCalled();

        fireEvent.click( container.querySelector( '[data-part="effects-turn-off"]' )! );
        await settle();
        expect( effectsChoice().camera ).toBe( 'none' );
        expect( camera.stopProcessor ).toHaveBeenCalledTimes( 1 );
        expect( camera.mediaStreamTrack ).toBe( camera.raw );
        expect( notice( container ) ).toBeNull();

        // On again, and slow again: not in this call.
        chooseEffects( { camera: 'blur' } );
        await settle();
        await slow();
        expect( notice( container ) ).toBeNull();
    } );

    it( 'goes with × and the background stays, and is not said again in the call', async () => {
        chooseEffects( { camera: 'image:office' } );
        const camera = roomTrack( 'video' );
        const { container } = call( camera as unknown as ProcessorTrack );
        await settle();
        await slow();
        fireEvent.click( notice( container )!.querySelector( '.wplus-call-join-prompt-close' )! );
        expect( notice( container ) ).toBeNull();
        expect( effectsChoice().camera ).toBe( 'image:office' );
        expect( camera.stopProcessor ).not.toHaveBeenCalled();
        await slow();
        expect( notice( container ) ).toBeNull();
    } );

    it( 'says nothing of a call before, nor where no background is on, and comes in the next call', async () => {
        // Slowed in a call before this one.
        await slow();
        chooseEffects( { camera: 'blur' } );
        let screen = call( roomTrack( 'video' ) as unknown as ProcessorTrack );
        await settle();
        expect( notice( screen.container ) ).toBeNull();
        screen.unmount();

        // No background on.
        chooseEffects( { camera: 'none' } );
        screen = call( roomTrack( 'video' ) as unknown as ProcessorTrack );
        await settle();
        await slow();
        expect( notice( screen.container ) ).toBeNull();
        screen.unmount();

        // The next call, with one on.
        chooseEffects( { camera: 'blur' } );
        screen = call( roomTrack( 'video' ) as unknown as ProcessorTrack );
        await settle();
        await slow();
        expect( notice( screen.container ) ).not.toBeNull();
    } );
} );

describe( 'the SDK\'s own calls', () => {
    it( 'send the camera with the chosen background from its first frame, and the camera itself once none is chosen', async () => {
        chooseEffects( { camera: 'image:loft' } );
        const sent: string[] = [];
        const hook = renderHook( () => useLocalMedia( ( source, track ) => void sent.push( `${ source } ${ track ? track.label : 'off' }` ) ) );

        await act( () => hook.result.current.enableCamera() );
        expect( sent ).toEqual( [ 'camera processed 0' ] );
        expect( made[ 0 ].look ).toEqual( { image: '/up/loft-1a2b.webp' } );

        await act( async () => chooseEffects( { camera: 'none' } ) );
        await settle();
        expect( sent ).toEqual( [ 'camera processed 0', 'camera test camera' ] );
        expect( made[ 0 ].destroyed ).toBe( true );

        // Turned off, the camera itself is let go.
        const raw = made[ 0 ].input!;
        await act( () => hook.result.current.disableCamera() );
        expect( raw.stop ).toHaveBeenCalled();
    } );

    it( 'send the microphone as it hears where AI Noise Removal is still on its way after a second, and its track in the microphone\'s place once it is on', async () => {
        chooseEffects( { noise: true } );
        // The processor starts only once its files are in.
        let arrived = () => {};
        noiseEngine.noise.mockImplementationOnce( async () => {
            const own = processor( 'wordplus-noise-removal', 'audio' );
            const start = own.init;
            own.init = vi.fn( async ( options ) => {
                await new Promise<void>( ( done ) => { arrived = done; } );
                await start( options );
            } );
            return own;
        } );
        const sent: string[] = [];
        const hook = renderHook( () => useLocalMedia( ( source, track ) => void sent.push( `${ source } ${ track ? track.label : 'off' }` ) ) );

        const pressed = Date.now();
        await act( () => hook.result.current.enableMic() );
        expect( Date.now() - pressed ).toBeGreaterThanOrEqual( NOISE_WAIT_MS - 50 );
        expect( sent ).toEqual( [ 'microphone test microphone' ] );

        arrived();
        await settle();
        expect( sent ).toEqual( [ 'microphone test microphone', 'microphone processed 0' ] );

        // With its files in the browser, the next microphone goes out with the noise removed from its first word.
        await act( () => hook.result.current.disableMic() );
        await act( () => hook.result.current.enableMic() );
        expect( sent.slice( 2 ) ).toEqual( [ 'microphone off', 'microphone processed 1' ] );
    } );
} );

// The blur of the device itself, Portrait in the Video Effects of Control Center on a Mac, an iPhone and an iPad, which a
// page can't turn on, only learn of where the browser says (Safari: MediaTrackSettings.backgroundBlur and
// `configurationchange`). Blur is not drawn over it, the person's choice kept, and the device settings say why, and where
// the device has one and Blur is chosen without it, how to turn it on (asked on 2026-11-03: "lets suggest user to use
// native camera background if available and auto disable our blur if its enabled with proper explanation to user, so
// they do not get confused").
describe( 'the blur of the device itself', () => {
    /** A camera as Safari gives it, saying whether its device blurs it, and `configurationchange` as that changes. */
    function portraitCamera( label: string, on: boolean ) {
        const listeners = new Map<string, Set<() => void>>();
        const camera = {
            kind: 'video', label, id: label, readyState: 'live', stop: vi.fn(), blurred: on,
            getSettings: () => ( { deviceId: label, backgroundBlur: camera.blurred } ),
            addEventListener: ( type: string, listener: () => void ) => {
                if ( ! listeners.has( type ) ) listeners.set( type, new Set() );
                listeners.get( type )!.add( listener );
            },
            removeEventListener: ( type: string, listener: () => void ) => void listeners.get( type )?.delete( listener ),
            heard: ( type: string ) => listeners.get( type )?.size ?? 0,
            turn: ( next: boolean ) => {
                camera.blurred = next;
                listeners.get( 'configurationchange' )?.forEach( ( listener ) => listener() );
            },
        };
        return camera;
    }

    const paused = ( container: HTMLElement ) => container.querySelector( '[data-part="device-blur"]' )?.textContent;
    const tip = ( container: HTMLElement ) => container.querySelector( '[data-part="device-blur-tip"]' );
    const hint = ( container: HTMLElement ) => container.querySelector( '[data-part="effects-cost"]' )?.textContent;
    const PAUSED = 'Your device is blurring your background itself with Portrait, so Blur here is paused. It comes back on by itself when you turn Portrait off in Control Center.';
    const ON_WITH_NONE = 'Your device is blurring your background itself with Portrait. Turn Portrait off in Control Center to show your room.';
    const TIP = 'Your device can blur or replace your background itself: turn on Portrait or Background in Control Center, under Video Effects. It often looks cleaner and is lighter on this device.';
    // Each line is one to know, with the info icon: its stem, under the dot.
    const infoIcon = ( line: Element | null ) => line?.querySelector( ':scope > svg' )?.innerHTML.includes( 'M12 16v-4' ) ?? false;
    const MAC ='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15';

    /** The browser as `agent`, saying when the device blurs the camera itself where `says`, as Safari does. */
    function browser( agent: string, says: boolean ) {
        Object.defineProperty( navigator, 'userAgent', { configurable: true, get: () => agent } );
        const devices = navigator.mediaDevices as unknown as Record<string, unknown>;
        devices.getSupportedConstraints = () => ( says ? { deviceId: true, backgroundBlur: true } : { deviceId: true } );
    }

    beforeEach( () => {
        window.localStorage.removeItem( DEVICE_BLUR_TIP_KEY );
    } );

    afterEach( () => {
        delete ( navigator as unknown as { userAgent?: string } ).userAgent;
    } );

    it( 'leaves Blur to the device while it blurs the camera itself, says so in place of the line on turning it off, and blurs again once Portrait is off', async () => {
        const raw = portraitCamera( 'raw video', true );
        const camera = roomTrack( 'video', raw as unknown as MediaStreamTrack );
        chooseEffects( { camera: 'blur' } );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( engine.camera, 'nothing of the engine loaded' ).not.toHaveBeenCalled();
        expect( camera.setProcessor ).not.toHaveBeenCalled();
        expect( camera.mediaStreamTrack, 'the camera as the device blurs it' ).toBe( raw );
        expect( tile( container, 'Blur' ).getAttribute( 'aria-checked' ), 'the choice kept' ).toBe( 'true' );
        expect( effectsChoice().camera ).toBe( 'blur' );
        expect( paused( container ) ).toBe( PAUSED );
        expect( infoIcon( container.querySelector( '[data-part="device-blur"]' ) ) ).toBe( true );
        expect( hint( container ) ).toBeUndefined();
        expect( tip( container ) ).toBeNull();

        await act( async () => raw.turn( false ) );
        await settle();
        expect( engine.camera ).toHaveBeenCalledWith( { blur: true } );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( paused( container ) ).toBeUndefined();
        expect( hint( container ) ).toBe( 'If your video stutters or your device gets warm, turn the background off.' );

        await act( async () => raw.turn( true ) );
        await settle();
        expect( camera.stopProcessor ).toHaveBeenCalled();
        expect( camera.mediaStreamTrack ).toBe( raw );
        expect( paused( container ) ).toBe( PAUSED );
        expect( hint( container ) ).toBeUndefined();
    } );

    it( 'still puts a picture behind the person, which covers the blur, and says with None chosen why the room is blurred all the same', async () => {
        const raw = portraitCamera( 'raw video', true );
        const camera = roomTrack( 'video', raw as unknown as MediaStreamTrack );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( paused( container ) ).toBe( ON_WITH_NONE );

        fireEvent.click( tile( container, 'Office' ) );
        await settle();
        expect( engine.camera ).toHaveBeenCalledWith( { image: '/up/office-1a2b.webp' } );
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( paused( container ), 'nothing to say under a picture' ).toBeUndefined();
    } );

    it( 'follows the camera the call restarts on, another device or the camera turned on again', async () => {
        const first = portraitCamera( 'first camera', false );
        const camera = Object.assign( roomTrack( 'video', first as unknown as MediaStreamTrack ), { restarted: [] as Array<() => void> } );
        Object.assign( camera, { on: ( event: string, listener: () => void ) => void ( event === 'restarted' && camera.restarted.push( listener ) ) } );
        chooseEffects( { camera: 'blur' } );
        const { container } = panel( { camera: camera as unknown as ProcessorTrack } );
        await settle();
        expect( camera.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( camera.restarted ).toHaveLength( 1 );

        const second = portraitCamera( 'second camera', true );
        camera.raw = second as unknown as MediaStreamTrack;
        await act( async () => camera.restarted.forEach( ( listener ) => listener() ) );
        await settle();
        expect( camera.stopProcessor ).toHaveBeenCalled();
        expect( paused( container ) ).toBe( PAUSED );
        expect( first.heard( 'configurationchange' ), 'the camera before let go' ).toBe( 0 );
        expect( second.heard( 'configurationchange' ) ).toBe( 1 );
    } );

    it( 'shows the preview as the device blurs it, the user alone seeing it, and blurs it again once Portrait is off', async () => {
        const test = portraitCamera( 'test camera', true );
        ( navigator.mediaDevices as unknown as { getUserMedia: unknown } ).getUserMedia = vi.fn( async () => ( {
            getTracks: () => [ test ], getAudioTracks: () => [], getVideoTracks: () => [ test ],
        } ) );
        chooseEffects( { camera: 'blur' } );
        const { container } = panel( { start: 'camera' } );
        await settle();
        const video = container.querySelector( '.wplus-call-device-preview video' ) as HTMLVideoElement & { srcObject: { getTracks(): unknown[] } };
        expect( engine.camera ).not.toHaveBeenCalled();
        expect( video.srcObject.getTracks()[ 0 ] ).toBe( test );
        expect( paused( container ) ).toBe( PAUSED );

        await act( async () => test.turn( false ) );
        await settle();
        expect( engine.camera ).toHaveBeenCalledWith( { blur: true } );
        expect( ( video.srcObject.getTracks()[ 0 ] as MediaStreamTrack ).label ).toBe( 'processed 0' );
        expect( paused( container ) ).toBeUndefined();
    } );

    it( 'is suggested with Blur chosen on a Mac, an iPhone or an iPad, Portrait and Background both, saying Blur here pauses by itself for Portrait where the browser tells but no browser is told of Background, and that it cannot tell, so to choose None, where it does not', async () => {
        browser( MAC, true );
        chooseEffects( { camera: 'blur' } );
        let { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        expect( tip( container )?.textContent ).toBe( TIP + ' Blur here pauses by itself while Portrait is on. Browsers are not told when Background is on, so choose None here when you use it.' );
        expect( infoIcon( tip( container ) ) ).toBe( true );
        unmount();

        // Chrome and Firefox on a Mac, which do not tell a page when Portrait is on.
        browser( 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false );
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        expect( tip( container )?.textContent ).toBe( TIP + ' This browser cannot tell when either is on, so choose None here once you turn one on.' );
        unmount();

        browser( 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1', true );
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        expect( tip( container ) ).not.toBeNull();
        unmount();

        // Nowhere with no blur of its own,
        browser( 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', false );
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        expect( tip( container ) ).toBeNull();
        unmount();

        // nor with a picture or None chosen.
        browser( MAC, true );
        chooseEffects( { camera: 'image:office' } );
        ( { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        expect( tip( container ) ).toBeNull();
        await act( async () => chooseEffects( { camera: 'none' } ) );
        expect( tip( container ) ).toBeNull();
    } );

    it( 'is suggested where no background runs on the device, with nothing of Blur', async () => {
        browser( MAC, false );
        gpu.renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';
        forgetEffectsDevice();
        const { container } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        expect( tip( container )?.textContent ).toBe( TIP );
    } );

    it( 'goes with × for good, kept by the browser', async () => {
        browser( MAC, true );
        chooseEffects( { camera: 'blur' } );
        let { container, unmount } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } );
        await settle();
        fireEvent.click( tip( container )!.querySelector( '[aria-label="Dismiss"]' )! );
        expect( tip( container ) ).toBeNull();
        expect( window.localStorage.getItem( DEVICE_BLUR_TIP_KEY ) ).toBe( '1' );
        unmount();

        ( { container } = panel( { camera: roomTrack( 'video' ) as unknown as ProcessorTrack } ) );
        await settle();
        expect( tip( container ) ).toBeNull();
    } );
} );

// AI Noise Removal on for someone who never chose, where the app says 'auto' (UiHost.noiseDefault): on a computer that
// can run it alone, the person's own choice always first. The call screens then say so over the dock once a call,
// with Turn Off and Do Not Show Again, and mark the dock's Device Settings while it runs.
describe( 'AI Noise Removal by the app\'s default', () => {
    let fine = true;
    let saveData = false;
    const notice = ( container: HTMLElement ) => container.querySelector( '.wplus-call-noise-auto' );
    const badge = ( container: HTMLElement ) => container.querySelector( '[data-part="noise-badge"]' );

    function Screen( { microphone }: { microphone: ProcessorTrack } ) {
        useTrackEffects( null, microphone );
        const configure = useConfigureCall();
        return <>
            <NoiseAutoNotice />
            <span className="wplus-configure-call" aria-label={ configure.label }><ConfigureBadge noise={ configure.noise } /></span>
        </>;
    }
    const call = ( microphone = roomTrack( 'audio' ) ) => ( { microphone, ...render( <Screen microphone={ microphone as unknown as ProcessorTrack } /> ) } );

    beforeEach( () => {
        fine = true;
        saveData = false;
        vi.stubGlobal( 'matchMedia', ( query: string ) => ( { matches: query === '(any-pointer: fine)' ? fine : false, media: query, addEventListener() {}, removeEventListener() {} } ) );
        Object.defineProperty( navigator, 'connection', { configurable: true, get: () => ( { saveData } ) } );
        window.localStorage.removeItem( EFFECTS_KEY );
        window.localStorage.removeItem( NOISE_AUTO_TIP_KEY );
        window.localStorage.removeItem( 'wordplus-call-noise-light' );
        forgetEffectsChoice();
        configureUi( { noiseDefault: () => 'auto' } );
    } );

    afterEach( () => {
        configureUi( { noiseDefault: () => 'off' } );
        vi.unstubAllGlobals();
        delete ( navigator as unknown as { connection?: unknown } ).connection;
        forgetEffectsChoice();
    } );

    it( 'is on for someone who never chose, on a computer, and off where the app says nothing', () => {
        expect( effectsChoice() ).toEqual( { camera: 'none', noise: true, noiseAuto: true, tune: {} } );
        expect( noiseAutoHere() ).toBe( true );

        configureUi( { noiseDefault: () => 'off' } );
        expect( effectsChoice() ).toEqual( { camera: 'none', noise: false, tune: {} } );
        configureUi( { noiseDefault: undefined } as never );
        expect( effectsChoice().noise ).toBe( false );
    } );

    it( 'is not on on a phone or a tablet, where the browser saves data, where the device could not keep up, or where the app serves no pack', () => {
        // Each a page of its own, as the device is judged once a page.
        fine = false;
        expect( effectsChoice().noise ).toBe( false );
        fine = true;
        saveData = true;
        forgetEffectsChoice();
        expect( effectsChoice().noise ).toBe( false );
        saveData = false;
        window.localStorage.setItem( 'wordplus-call-noise-light', '1' );
        forgetEffectsChoice();
        expect( effectsChoice().noise ).toBe( false );
        window.localStorage.removeItem( 'wordplus-call-noise-light' );
        forgetEffectsChoice();
        configureUi( { noiseUrl: () => '' } );
        try {
            expect( effectsChoice().noise ).toBe( false );
        } finally {
            configureUi( { noiseUrl: () => '/nx/' } );
        }
        expect( effectsChoice().noise ).toBe( true );
    } );

    it( 'gives way to the person\'s choice, kept by the browser, and a background picked keeps it unchosen', () => {
        chooseEffects( { camera: 'blur' } );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ) ).toEqual( { camera: 'blur', tune: {} } );
        expect( effectsChoice() ).toMatchObject( { camera: 'blur', noise: true, noiseAuto: true } );

        chooseEffects( { noise: false } );
        expect( effectsChoice() ).toEqual( { camera: 'blur', noise: false, tune: {} } );
        chooseEffects( { camera: 'none' } );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ) ).toEqual( { camera: 'none', noise: false, tune: {} } );

        chooseEffects( { noise: true } );
        expect( effectsChoice() ).toEqual( { camera: 'none', noise: true, tune: {} } );
        configureUi( { noiseDefault: () => 'off' } );
        expect( effectsChoice().noise ).toBe( true );
    } );

    it( 'stays on in the page where the device turned out too slow during a call, which goes on with the lighter model, and is off from the next page', async () => {
        const { container, microphone } = call();
        await settle();
        expect( notice( container ) ).not.toBeNull();
        // What src/effects/noise.ts keeps once DeepFilterNet3 cannot keep up, then GTCRN behind the same track.
        window.localStorage.setItem( 'wordplus-call-noise-light', '1' );
        await act( async () => chooseEffects( { camera: 'blur' } ) );
        await settle();
        expect( effectsChoice() ).toMatchObject( { noise: true, noiseAuto: true } );
        expect( microphone.stopProcessor ).not.toHaveBeenCalled();
        expect( notice( container ) ).not.toBeNull();
        expect( badge( container ) ).not.toBeNull();

        forgetEffectsChoice();
        expect( effectsChoice() ).toMatchObject( { noise: false } );
    } );

    it( 'reads a choice kept before the default was there, its noise false, as the person\'s: off', () => {
        window.localStorage.setItem( EFFECTS_KEY, JSON.stringify( { camera: 'image:office', noise: false, tune: {} } ) );
        forgetEffectsChoice();
        expect( effectsChoice() ).toEqual( { camera: 'image:office', noise: false, tune: {} } );
    } );

    it( 'says so over the dock once it runs, with Turn Off, which the browser keeps as the person\'s choice', async () => {
        const { container, microphone } = call();
        await settle();
        expect( microphone.mediaStreamTrack.label ).toBe( 'processed 0' );
        expect( notice( container )?.closest( '.wplus-call-join-prompt-region' )?.getAttribute( 'role' ) ).toBe( 'status' );
        expect( notice( container )?.querySelector( '.wplus-call-join-prompt-title' )?.textContent ).toBe( 'AI Noise Removal is active' );
        expect( badge( container ) ).not.toBeNull();
        expect( container.querySelector( '.wplus-configure-call' )?.getAttribute( 'aria-label' ) ).toBe( 'Device Settings, AI Noise Removal is active' );

        fireEvent.click( container.querySelector( '[data-part="noise-turn-off"]' )! );
        await settle();
        expect( notice( container ) ).toBeNull();
        expect( microphone.stopProcessor ).toHaveBeenCalledTimes( 1 );
        expect( microphone.mediaStreamTrack ).toBe( microphone.raw );
        expect( badge( container ) ).toBeNull();
        expect( container.querySelector( '.wplus-configure-call' )?.getAttribute( 'aria-label' ) ).toBe( 'Device Settings' );
        expect( JSON.parse( window.localStorage.getItem( EFFECTS_KEY )! ).noise ).toBe( false );
    } );

    it( 'says nothing before it runs, nor where its files could not start', async () => {
        ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = { ...noiseEngine, noise: vi.fn( async () => { throw new Error( 'no worklet' ); } ) };
        try {
            const { container } = call();
            await settle();
            expect( notice( container ) ).toBeNull();
            expect( badge( container ) ).toBeNull();
        } finally {
            ( globalThis as Record<string, unknown> ).wordplusRealtimeNoise = noiseEngine;
        }
    } );

    it( 'goes by itself after a few seconds, the noise removal and the badge staying, and waits while the pointer is on it', async () => {
        const { container, microphone } = call();
        await settle();
        expect( notice( container ) ).not.toBeNull();
        vi.useFakeTimers();
        try {
            // Held by the pointer past its time, then given its time again once the pointer leaves.
            fireEvent.pointerOver( notice( container )! );
            await act( async () => { await vi.advanceTimersByTimeAsync( NOISE_AUTO_NOTICE_MS + 1000 ); } );
            expect( notice( container ) ).not.toBeNull();
            fireEvent.pointerOut( notice( container )! );
            await act( async () => { await vi.advanceTimersByTimeAsync( NOISE_AUTO_NOTICE_MS - 500 ); } );
            expect( notice( container ) ).not.toBeNull();
            await act( async () => { await vi.advanceTimersByTimeAsync( 1000 ); } );
            expect( notice( container ) ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
        expect( microphone.stopProcessor ).not.toHaveBeenCalled();
        expect( badge( container ) ).not.toBeNull();
        expect( effectsChoice() ).toMatchObject( { noise: true, noiseAuto: true } );
        expect( window.localStorage.getItem( NOISE_AUTO_TIP_KEY ) ).toBeNull();
    } );

    it( 'goes with × for this call, and with Do Not Show Again for good, the noise removal on all the while', async () => {
        let screen = call();
        await settle();
        fireEvent.click( notice( screen.container )!.querySelector( '.wplus-call-join-prompt-close' )! );
        expect( notice( screen.container ) ).toBeNull();
        expect( badge( screen.container ) ).not.toBeNull();
        screen.unmount();

        screen = call();
        await settle();
        expect( notice( screen.container ) ).not.toBeNull();
        fireEvent.click( screen.container.querySelector( '[data-part="noise-never"]' )! );
        expect( notice( screen.container ) ).toBeNull();
        expect( window.localStorage.getItem( NOISE_AUTO_TIP_KEY ) ).toBe( '1' );
        expect( effectsChoice() ).toMatchObject( { noise: true, noiseAuto: true } );
        screen.unmount();

        screen = call();
        await settle();
        expect( notice( screen.container ) ).toBeNull();
        expect( badge( screen.container ) ).not.toBeNull();
    } );

    it( 'is not said to someone who turned it on themselves, whose Device Settings still have the badge', async () => {
        chooseEffects( { noise: true } );
        const { container } = call();
        await settle();
        expect( notice( container ) ).toBeNull();
        expect( badge( container ) ).not.toBeNull();
    } );
} );
