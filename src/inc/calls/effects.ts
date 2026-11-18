import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { host } from "../../host.ts";
import type { CameraLook, CameraProcessor, CameraTune, EffectsEngine } from "../../effects/engine.ts";
import type { NoiseEngine, NoiseProcessor } from "../../effects/noise-engine.ts";
import type { HostBackground } from "../../host.ts";
import { ownBackgrounds, useOwnBackgroundsVersion } from "./own-backgrounds.ts";

// The call effects as the screens see them: what the user chose, kept by this browser as the device settings' other
// choices are, whether the browser can run each, and their engines (src/effects), each a script of its own loaded
// from the host's folder only once an effect is on: the camera's from the effects' pack (UiHost.effectsUrl), AI Noise
// Removal's from a pack of its own (UiHost.noiseUrl), as a site may have either. Two ways to apply them: to the room client's tracks,
// which take a processor and send what it gives (applyEffect, useTrackEffects: Better Messages' calls), and to a
// browser's own track, which gets one back (TrackEffect: the SDK's calls and the device settings' tests).

/**
 * None, a blur, a picture of WordPlus's catalog the app offers (`image:office`, UiHost.builtInBackgrounds), one the
 * app adds (`site:<id>`, UiHost.backgrounds), or one of the person's own that the browser keeps (`own:<id>`,
 * UiHost.ownBackgrounds, inc/calls/own-backgrounds.ts).
 */
export type CameraEffect = 'none' | 'blur' | `image:${ string }` | `site:${ string }` | `own:${ string }`;

export interface EffectsChoice {
    camera: CameraEffect,
    /** Whether the noise is removed: the person's choice, or the app's default (UiHost.noiseDefault) before they make one. */
    noise: boolean,
    /** On by the app's default, not by the person: what the device settings' notice says (NoiseAutoNotice). */
    noiseAuto?: boolean,
    /**
     * The person's tuning of the camera's effect for their light and room (the device settings' Adjust), each from 0 to
     * 1 (src/effects/camera.ts, CameraTune): empty, as the effects ship, until they move one.
     */
    tune: CameraTune,
}

/** The tuning's settings, in the order the device settings show them. */
export const TUNE_KEYS = [ 'outline', 'edge', 'steady', 'blur' ] as const;

function validTune( raw: unknown ): CameraTune {
    const tune: CameraTune = {};
    if ( ! raw || typeof raw !== 'object' ) return tune;
    for ( const key of TUNE_KEYS ) {
        const value = ( raw as Record<string, unknown> )[ key ];
        if ( typeof value === 'number' && Number.isFinite( value ) ) tune[ key ] = Math.min( 1, Math.max( 0, value ) );
    }
    return tune;
}

/** Where the browser keeps the choice: the camera's effect and whether noise is removed, both off at first. */
export const EFFECTS_KEY = 'wordplus-call-effects';

// No High Quality switch, the person's or the app's, since 2026-11-02: the engine runs the better model from the first
// frame where a device can and falls back to the quick one by itself (src/effects/quality.ts). A choice kept with a
// `quality` from before is read without it.
const NONE: EffectsChoice = { camera: 'none', noise: false, tune: {} };

const validCamera = ( camera: unknown ): camera is CameraEffect => camera === 'none' || camera === 'blur'
    || ( typeof camera === 'string' && /^(image|site|own):[A-Za-z0-9_-]{1,64}$/.test( camera ) );

/** What the browser keeps: the noise only once the person chose it, so the app's default stands until then. */
interface KeptChoice {
    camera: CameraEffect,
    noise?: boolean,
    tune: CameraTune,
}

const NOTHING_KEPT: KeptChoice = { camera: 'none', tune: {} };

// A choice kept before the app's default was there holds the noise as false even where the person only picked a
// background, as every choice was kept whole: it is read as theirs, off, so an update turns nothing on by itself.
function stored(): KeptChoice {
    try {
        const raw = JSON.parse( window.localStorage.getItem( EFFECTS_KEY ) ?? 'null' );
        return {
            camera: validCamera( raw?.camera ) ? raw.camera : 'none',
            ...( typeof raw?.noise === 'boolean' ? { noise: raw.noise } : {} ),
            tune: validTune( raw?.tune ),
        };
    } catch ( e ) {
        return NOTHING_KEPT;
    }
}

/** Kept by the browser once AI Noise Removal could not keep up here (src/effects/noise.ts, LIGHT_KEY). */
const NOISE_LIGHT_KEY = 'wordplus-call-noise-light';

function noiseLight(): boolean {
    try {
        return window.localStorage.getItem( NOISE_LIGHT_KEY ) === '1';
    } catch ( e ) {
        return false;
    }
}

/**
 * Whether the app's default turns the noise removal on here, for someone who never chose: 'auto' on a computer that can
 * run it (as warmsHere() for the backgrounds' warm-up: a fine pointer, no data saving), where the app serves its pack and
 * the device has not already been too slow for it. A phone or a tablet removes the wind and the noise around it with
 * its own microphones, and its battery and data pay most for the model. The device is judged once a page: a device
 * that turns out too slow during a call goes on with the lighter model there (src/effects/noise.ts), where reading it
 * again would take the noise removal off under the person a moment after the call said it is on, and the next page
 * starts with it off.
 */
export function noiseAutoHere(): boolean {
    if ( host().noiseDefault?.() !== 'auto' || ! noiseBase() ) return false;
    return autoDevice ??= noiseRemovalSupported() && warmsHere() && ! noiseLight();
}

let autoDevice: boolean | null = null;

let kept: KeptChoice | null = null;
let seen: { kept: KeptChoice, auto: boolean, choice: EffectsChoice } | null = null;
const choiceListeners = new Set<() => void>();

export function effectsChoice(): EffectsChoice {
    if ( typeof window === 'undefined' ) return NONE;
    const now = kept ??= stored();
    const auto = now.noise === undefined && noiseAutoHere();
    // The same object while nothing changed, as the screens read it through useSyncExternalStore.
    if ( seen?.kept !== now || seen.auto !== auto ) {
        seen = { kept: now, auto, choice: { camera: now.camera, noise: now.noise ?? auto, tune: now.tune, ...( auto ? { noiseAuto: true } : {} ) } };
    }
    return seen.choice;
}

/** The choice read again from the browser, as a page that loads now would read it (tests). */
export function forgetEffectsChoice(): void {
    kept = null;
    seen = null;
    autoDevice = null;
}

/** Kept by the browser once the person asked not to be told again that the app's default turned the noise removal on. */
export const NOISE_AUTO_TIP_KEY = 'wordplus-call-noise-auto-tip';

/**
 * Changes the choice, for this browser from now on, and for every call and test drawn now. The noise is kept only
 * where `change` names it: picking a background leaves the app's default standing for it.
 */
export function chooseEffects( change: Partial<EffectsChoice> ): void {
    const before = kept ??= typeof window === 'undefined' ? NOTHING_KEPT : stored();
    kept = {
        camera: change.camera ?? before.camera,
        ...( typeof change.noise === 'boolean' ? { noise: change.noise } : before.noise !== undefined ? { noise: before.noise } : {} ),
        tune: change.tune ? validTune( change.tune ) : before.tune,
    };
    try {
        window.localStorage.setItem( EFFECTS_KEY, JSON.stringify( kept ) );
    } catch ( e ) {}
    choiceListeners.forEach( ( listener ) => listener() );
}

// A choice made in another tab of the browser reaches this one, as the browser keeps one for all of them.
let followsTabs = false;

const onChoice = ( listener: () => void ) => {
    choiceListeners.add( listener );
    if ( ! followsTabs && typeof window !== 'undefined' ) {
        followsTabs = true;
        window.addEventListener( 'storage', ( event ) => {
            if ( event.key !== EFFECTS_KEY ) return;
            kept = stored();
            choiceListeners.forEach( ( one ) => one() );
        } );
    }
    return () => void choiceListeners.delete( listener );
};

export function useEffectsChoice(): EffectsChoice {
    return useSyncExternalStore( onChoice, effectsChoice, () => NONE );
}

/** Where an effect stands on the call's track: off, its files loading, on, or unable to start here. */
export type EffectState = 'off' | 'loading' | 'on' | 'failed';
export type EffectKind = 'camera' | 'noise';

const states: Record<EffectKind, EffectState> = { camera: 'off', noise: 'off' };
const stateListeners = new Set<() => void>();

function setEffectState( kind: EffectKind, state: EffectState ): void {
    if ( states[ kind ] === state ) return;
    states[ kind ] = state;
    // A camera's effect on is the engine's GPU programs compiled on this device, as a warm-up leaves them.
    if ( kind === 'camera' && state === 'on' ) {
        rememberWarm();
        setWarmth( 'warm' );
    }
    stateListeners.forEach( ( listener ) => listener() );
}

const onState = ( listener: () => void ) => {
    stateListeners.add( listener );
    return () => void stateListeners.delete( listener );
};

export function useEffectState( kind: EffectKind ): EffectState {
    return useSyncExternalStore( onState, () => states[ kind ], () => 'off' as EffectState );
}

/** Where an effect stands now, for code that reads it after a wait (the studio's Go live) rather than as it draws. */
export function effectState( kind: EffectKind ): EffectState {
    return states[ kind ];
}

let cameraSupport: boolean | null = null;

/**
 * Whether this browser can blur or replace the camera's background: a canvas it can capture, WebGL 2 (MediaPipe's GPU
 * and the passes), WebAssembly with its SIMD (MediaPipe's runtime, which the pack carries in that build alone), and
 * more than a few cores, as the camera, its encoder and the page run there already. Asked once.
 */
export function cameraEffectsSupported(): boolean {
    if ( cameraSupport !== null ) return cameraSupport;
    cameraSupport = false;
    try {
        if ( typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined' || ! ( 'captureStream' in HTMLCanvasElement.prototype ) ) return false;
        const cores = navigator.hardwareConcurrency;
        if ( typeof cores === 'number' && cores > 0 && cores < 4 ) return false;
        const canvas = document.createElement( 'canvas' );
        if ( ! simd() ) return false;
        const gl = canvas.getContext( 'webgl2' );
        if ( ! gl ) return false;
        // Read before anything reads `unavailable` (cameraEffectsUnavailable() asks this first), so no one is told.
        if ( SOFTWARE_RENDERER.test( rendererOf( gl ) ) ) unavailable = true;
        gl.getExtension( 'WEBGL_lose_context' )?.loseContext();
        cameraSupport = true;
    } catch ( e ) {}
    return cameraSupport;
}

// The renderers that draw WebGL on the CPU, as the engine reads them (src/effects/camera.ts, SOFTWARE_RENDERER).
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

function rendererOf( gl: WebGL2RenderingContext ): string {
    try {
        const info = gl.getExtension( 'WEBGL_debug_renderer_info' );
        return String( gl.getParameter( info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER ) || '' );
    } catch ( e ) {
        return '';
    }
}

let unavailable = false;
const unavailableListeners = new Set<() => void>();

// Where the background can't run on this device: WebGL drawn in software, or the model starting nowhere here (the
// engine's EffectsUnavailable), found out in this page. The device settings say so and offer nothing to choose, and no
// track is given an effect, rather than one drawn badly (asked on 2026-11-02: "I want it to use good model or be
// disabled by user if it loads his device too much").
function markUnavailable(): void {
    if ( unavailable ) return;
    unavailable = true;
    unavailableListeners.forEach( ( listener ) => listener() );
}

const isUnavailable = ( error: unknown ) => !! error && typeof error === 'object' && ( error as { unavailable?: unknown } ).unavailable === true;

/**
 * Whether the camera's background can't run on this device: WebGL drawn in software, or the engine found that its
 * model starts nowhere here. Its pack offered all the same, the device settings say so, its tiles not to be chosen.
 */
export function cameraEffectsUnavailable(): boolean {
    cameraEffectsSupported();
    return unavailable;
}

export function useCameraEffectsUnavailable(): boolean {
    return useSyncExternalStore( ( listener ) => {
        unavailableListeners.add( listener );
        return () => void unavailableListeners.delete( listener );
    }, cameraEffectsUnavailable, () => false );
}

// The camera's own blur: a device may blur the background itself before the page gets a frame, with Portrait in the
// Video Effects of Control Center on a Mac, an iPhone and an iPad. It runs on the device's own neural engine at the
// camera's full size, with a cleaner edge than a page can draw and no cost to the page. A page can't turn it on, only
// learn that it is on, where the browser says so (MediaTrackSettings.backgroundBlur, and `configurationchange` on the
// track as it changes): Safari does, on a Mac, an iPhone and an iPad. Chrome keeps it behind a flag
// (MediaCaptureBackgroundBlur, experimental as of 2026-11) and Firefox has none. Where the camera says it is blurred
// already, Blur is not drawn over it, the person's choice kept: Blur comes back by itself once Portrait is off. A picture
// still goes behind the person, as it covers the blur. Background, the picture the device puts behind the person in the
// same menu, is told to no page: WebKit reads only portraitEffectActive, and no constraint names a replaced background,
// so the device settings ask the person to choose None with it (device-panel.tsx, DeviceBlurNote).

/** Whether the camera says its device blurs the background itself: false where the browser does not say. */
export function blurredByDevice( track: MediaStreamTrack | null | undefined ): boolean {
    try {
        return !! track && track.readyState !== 'ended' && ( track.getSettings?.() as { backgroundBlur?: unknown } | undefined )?.backgroundBlur === true;
    } catch ( e ) {
        return false;
    }
}

/** Whether this browser says when the device blurs the camera itself (blurredByDevice()): Safari, not Chrome or Firefox. */
export function deviceBlurReported(): boolean {
    try {
        return ( navigator.mediaDevices?.getSupportedConstraints?.() as { backgroundBlur?: unknown } | undefined )?.backgroundBlur === true;
    } catch ( e ) {
        return false;
    }
}

/** Whether the device has a blur of its own for the camera, Portrait: a Mac, an iPhone or an iPad, in any browser. */
export function deviceBlurHere(): boolean {
    return typeof navigator !== 'undefined' && /Macintosh|iPhone|iPad/.test( navigator.userAgent || '' );
}

/** Where the browser keeps that the person closed the device settings' line on Portrait. */
export const DEVICE_BLUR_TIP_KEY = 'wordplus-call-device-blur-tip';

// The cameras of this page the effects follow, and whether each says its device blurs it. One app to the device, they
// are blurred alike, so the device settings read them as one: blurred while any live one says so.
const deviceBlurred = new Map<MediaStreamTrack, boolean>();
const deviceBlurListeners = new Set<() => void>();
let deviceBlurNow = false;

function sayDeviceBlur(): void {
    for ( const [ track ] of deviceBlurred ) if ( track.readyState === 'ended' ) deviceBlurred.delete( track );
    const now = cameraBlurredByDevice();
    if ( now === deviceBlurNow ) return;
    deviceBlurNow = now;
    deviceBlurListeners.forEach( ( listener ) => listener() );
}

/**
 * Follows a camera's own blur, telling `changed` each time the device turns it on or off. Returns the release. A camera
 * stopped by the page says nothing, so one ended counts no more from then on, and is let go at the next change.
 */
function followDeviceBlur( track: MediaStreamTrack, changed: () => void ): () => void {
    let was = blurredByDevice( track );
    deviceBlurred.set( track, was );
    sayDeviceBlur();
    const heard = () => {
        const now = blurredByDevice( track );
        deviceBlurred.set( track, now );
        sayDeviceBlur();
        if ( now === was ) return;
        was = now;
        changed();
    };
    track.addEventListener?.( 'configurationchange', heard );
    track.addEventListener?.( 'ended', heard );
    return () => {
        track.removeEventListener?.( 'configurationchange', heard );
        track.removeEventListener?.( 'ended', heard );
        deviceBlurred.delete( track );
        sayDeviceBlur();
    };
}

/** Whether a camera of this page says its device blurs the background itself (Portrait): the device settings say so. */
export function cameraBlurredByDevice(): boolean {
    for ( const [ track, on ] of deviceBlurred ) if ( on && track.readyState !== 'ended' ) return true;
    return false;
}

export function useCameraBlurredByDevice(): boolean {
    return useSyncExternalStore( ( listener ) => {
        deviceBlurListeners.add( listener );
        return () => void deviceBlurListeners.delete( listener );
    }, cameraBlurredByDevice, () => false );
}

/** The look to draw on a camera: none for Blur where its device blurs it already. */
const overDeviceBlur = ( look: CameraLook | null, camera: MediaStreamTrack | null | undefined ) => look?.blur && blurredByDevice( camera ) ? null : look;

/** The event the engine fires once a processor has slowed the device (src/effects/quality.ts, SLOW_EVENT). */
export const EFFECTS_SLOW_EVENT = 'wordplus-call-effects-slow';

let slowTimes = 0;
const slowListeners = new Set<() => void>();
let hearsSlow = false;

const onSlow = ( listener: () => void ) => {
    slowListeners.add( listener );
    if ( ! hearsSlow && typeof window !== 'undefined' ) {
        hearsSlow = true;
        window.addEventListener( EFFECTS_SLOW_EVENT, () => {
            slowTimes++;
            slowListeners.forEach( ( one ) => one() );
        } );
    }
    return () => void slowListeners.delete( listener );
};

/** How many times a camera's background has slowed the device in this page: the call screens' notice reads it. */
export function useEffectsSlowTimes(): number {
    return useSyncExternalStore( onSlow, () => slowTimes, () => 0 );
}

/** For the tests: as a page where the background has run nowhere yet. */
export function forgetEffectsDevice(): void {
    unavailable = false;
    cameraSupport = null;
    slowTimes = 0;
    deviceBlurred.clear();
    deviceBlurNow = false;
}

// A module that uses one instruction of WebAssembly's SIMD, which DeepFilterNet3's build and MediaPipe's runtime
// the effects ship needs.
const SIMD_PROBE = [ 0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11 ];

function simd(): boolean {
    if ( typeof WebAssembly !== 'object' ) return false;
    try {
        return WebAssembly.validate( new Uint8Array( SIMD_PROBE ) );
    } catch ( e ) {
        return false;
    }
}

/** Whether this browser can take the noise out of the microphone: an AudioWorklet, and WebAssembly with its SIMD. */
export function noiseRemovalSupported(): boolean {
    if ( typeof window === 'undefined' || typeof AudioWorkletNode === 'undefined' ) return false;
    if ( typeof window.AudioContext !== 'function' || ! ( 'createMediaStreamDestination' in window.AudioContext.prototype ) ) return false;
    return simd();
}

const folder = ( url: string ) => url && ! url.endsWith( '/' ) ? url + '/' : url;

/** The host's folder of the effects, ending in a slash: '' where it serves none. */
export function effectsBase(): string {
    return folder( host().effectsUrl?.() ?? '' );
}

/** The host's folder of AI Noise Removal, a pack of its own, ending in a slash: '' where it serves none. */
export function noiseBase(): string {
    return folder( host().noiseUrl?.() ?? '' );
}

/** Whether the effect of `kind` may be offered here: the host serves its pack and the browser can run it. */
export function effectOffered( kind: EffectKind ): boolean {
    return kind === 'camera' ? !! effectsBase() && cameraEffectsSupported() : !! noiseBase() && noiseRemovalSupported();
}

const pictures = ( list: unknown ): HostBackground[] => Array.isArray( list )
    ? list.filter( ( one ) => one && ( typeof one.id === 'string' || typeof one.id === 'number' ) && typeof one.url === 'string' && one.url )
    : [];

/**
 * The pictures of WordPlus's catalog the app offers (UiHost.builtInBackgrounds), each with its id in the catalog: those
 * its administrator picked, which the app keeps beside its own. An older app's true or false is none.
 */
export function builtInBackgrounds(): HostBackground[] {
    return pictures( host().builtInBackgrounds?.() );
}

/** The app's own backgrounds (UiHost.backgrounds), each with an id and a picture. */
export function siteBackgrounds(): HostBackground[] {
    return pictures( host().backgrounds?.() );
}

/**
 * What the engine draws for a choice: null for none, and for a background the app no longer offers (a picture its
 * admin removed or unpicked, or the person's own once the app no longer lets them use one), which is none. A picture
 * of the person's own is none too until the browser has read it (useOwnBackgroundsVersion says when). The person's
 * tuning goes with it once they have moved any of it.
 */
export function cameraLook( effect: CameraEffect, tune = effectsChoice().tune ): CameraLook | null {
    const tuned = Object.keys( tune ).length ? { tune } : {};
    if ( effect === 'blur' ) return { blur: true, ...tuned };
    const offered = effect.startsWith( 'image:' ) ? builtInBackgrounds()
        : effect.startsWith( 'site:' ) ? siteBackgrounds()
        : effect.startsWith( 'own:' ) ? ownBackgrounds()
        : [];
    const picture = offered.find( ( one ) => String( one.id ) === effect.slice( effect.indexOf( ':' ) + 1 ) );
    return picture ? { image: picture.url, ...tuned } : null;
}

/**
 * Whether the engine on this page takes the person's tuning (EffectsEngine.tune): false until it is loaded, and with a
 * pack from before the tuning, which the site keeps until a newer one comes.
 */
export function effectsTunable(): boolean {
    return ( globalThis as { wordplusRealtimeEffects?: EffectsEngine } ).wordplusRealtimeEffects?.tune === true;
}

const engines = new Map<string, Promise<unknown>>();

/**
 * An engine, its script loaded once from its pack's folder and found as `global` at `version`. A load that failed is
 * tried again the next time.
 */
function loadEngine<T extends { version: number }>( global: string, version: number, base: string, file: string, what: string ): Promise<T> {
    const loaded = () => ( globalThis as Record<string, unknown> )[ global ] as T | undefined;
    if ( loaded()?.version === version ) return Promise.resolve( loaded()! );
    const loading = engines.get( global ) as Promise<T> | undefined;
    if ( loading ) return loading;
    if ( ! base || typeof document === 'undefined' ) return Promise.reject( new Error( 'No folder for ' + what ) );
    const next = new Promise<T>( ( resolve, reject ) => {
        const script = document.createElement( 'script' );
        script.src = base + file;
        script.async = true;
        script.onload = () => loaded()?.version === version ? resolve( loaded()! ) : reject( new Error( script.src + ' is not ' + what + ' of this version' ) );
        script.onerror = () => reject( new Error( what + ' did not load from ' + script.src ) );
        document.head.appendChild( script );
    } );
    engines.set( global, next );
    next.catch( () => {
        engines.delete( global );
    } );
    return next;
}

/** The camera's engine, from the effects' pack. */
export function loadEffects(): Promise<EffectsEngine> {
    return loadEngine<EffectsEngine>( 'wordplusRealtimeEffects', 2, effectsBase(), 'realtime-effects.min.js', 'the call effects' );
}

/** AI Noise Removal's engine, from its own pack. */
export function loadNoiseEngine(): Promise<NoiseEngine> {
    return loadEngine<NoiseEngine>( 'wordplusRealtimeNoise', 1, noiseBase(), 'realtime-noise.min.js', 'AI Noise Removal' );
}

/**
 * How long a microphone turned on waits for AI Noise Removal before the call takes it as it is. With its files in the
 * browser the noise removal is on in a third of a second (an M1 Max, 2026-11-10), so the voice goes out without its
 * noise from the first word. Past this its files are still on their way, 12 MB the first time on a browser (some 12 s
 * on a live site), and the microphone goes out as it hears, the noise removal going on it once it is ready, as one
 * turned on during the call does. Before, the microphone was held back from the call until they were in.
 */
export const NOISE_WAIT_MS = 1000;

const wait = ( ms: number ) => new Promise<void>( ( done ) => setTimeout( done, ms ) );

/**
 * AI Noise Removal's files read ahead of the microphone, as a call's screen opens for someone who has it on, so the
 * microphone finds them in the browser. Nothing waits for it, and one that fails says nothing: the microphone asks for
 * them again as it is turned on. Nothing with a pack whose engine reads nothing ahead (NoiseEngine.warm).
 */
export function warmNoise(): void {
    if ( ! effectsChoice().noise || ! effectOffered( 'noise' ) ) return;
    void loadNoiseEngine().then( ( engine ) => engine.warm?.() ).catch( () => null );
}

/**
 * Where the camera's effect stands on this device before anyone turns it on (warmEffects()): not made ready yet, being
 * made ready, ready (made ready here before, or an effect has been on), or unable to start.
 */
export type EffectsWarmth = 'cold' | 'warming' | 'warm' | 'failed';

/** Where the browser keeps that the camera's effect was made ready on this device, and for which pack. */
export const WARM_KEY = 'wordplus-call-effects-warm';

// How long that is believed. The compiled GPU programs outlast the page: the browser keeps them, and macOS keeps
// Metal's for the browser across its profiles and restarts. A browser's update or a cache grown too big lets them go,
// so the warm-up is done again after a week, or for another browser or pack, at the cost of a fraction of a second.
const WARM_DAYS = 7;

// The frame the warm-up draws, 16:9 and small, larger than the models' 256 by 144 so the engine scales it as it
// scales a camera, and how often it is drawn again.
const WARM_WIDTH = 320;
const WARM_HEIGHT = 180;
const WARM_DRAW_MS = 100;
// How long the warm-up waits for its frames once the processor runs, and for an engine that does not count them
// (a pack from before `cost`), how long it lets it run. Both past the first frame, which init() draws itself.
const WARM_FRAMES_MS = 20000;
const WARM_UNCOUNTED_MS = 1000;

let warmth: EffectsWarmth = 'cold';
const warmthListeners = new Set<() => void>();

function setWarmth( next: EffectsWarmth ): void {
    if ( warmth === next ) return;
    warmth = next;
    warmthListeners.forEach( ( listener ) => listener() );
}

const onWarmth = ( listener: () => void ) => {
    warmthListeners.add( listener );
    return () => void warmthListeners.delete( listener );
};

/** Where the camera's effect stands before it is turned on (EffectsWarmth), for what the device settings say meanwhile. */
export function useEffectsWarmth(): EffectsWarmth {
    return useSyncExternalStore( onWarmth, () => warmth, () => 'cold' as EffectsWarmth );
}

const warmMark = () => ( { v: 1, base: effectsBase(), browser: typeof navigator !== 'undefined' ? navigator.userAgent : '' } );

function rememberWarm(): void {
    try {
        window.localStorage.setItem( WARM_KEY, JSON.stringify( { ...warmMark(), at: Date.now() } ) );
    } catch ( e ) {}
}

function warmRemembered(): boolean {
    try {
        const kept = JSON.parse( window.localStorage.getItem( WARM_KEY ) ?? 'null' );
        if ( ! kept || typeof kept.at !== 'number' || Date.now() - kept.at > WARM_DAYS * 86400000 ) return false;
        const mark = warmMark();
        return kept.v === mark.v && kept.base === mark.base && kept.browser === mark.browser;
    } catch ( e ) {
        return false;
    }
}

// A computer, not a phone or a tablet held in the hand: the first background's freeze was measured on computers, and a
// phone that never uses one would download the pack for nothing. Nor where the browser is asked to save data.
function warmsHere(): boolean {
    if ( typeof window === 'undefined' ) return false;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if ( nav.connection?.saveData ) return false;
    try {
        return typeof window.matchMedia !== 'function' || window.matchMedia( '(any-pointer: fine)' ).matches;
    } catch ( e ) {
        return true;
    }
}

/** A small picture of its own for the warm-up to run on, drawn again and again so frames keep coming: never a camera. */
function warmFrames(): { track: MediaStreamTrack, stop(): void } | null {
    try {
        const canvas = document.createElement( 'canvas' );
        canvas.width = WARM_WIDTH;
        canvas.height = WARM_HEIGHT;
        const g = canvas.getContext( '2d' );
        const capture = ( canvas as HTMLCanvasElement & { captureStream?( fps?: number ): MediaStream } ).captureStream?.( 30 );
        const track = capture?.getVideoTracks?.()[ 0 ];
        if ( ! g || ! track ) return null;
        let step = 0;
        const draw = () => {
            g.fillStyle = '#4a5160';
            g.fillRect( 0, 0, WARM_WIDTH, WARM_HEIGHT );
            g.fillStyle = '#d8c3a5';
            g.fillRect( 120 + ( step++ % 8 ), 40, 80, 140 );
        };
        draw();
        const timer = setInterval( draw, WARM_DRAW_MS );
        return {
            track,
            stop() {
                clearInterval( timer );
                track.stop();
            },
        };
    } catch ( e ) {
        return null;
    }
}

const STOPPED = new Error( 'The warm-up is no longer wanted' );
let warming = false;
let warmHolders = 0;

// Whether the warm-up goes on: someone still wants it, and no effect of a track's own is making the engine ready
// already (its own first frame compiles the same programs).
const warmWanted = () => warmHolders > 0 && states.camera !== 'loading' && states.camera !== 'on';

async function warmUp(): Promise<void> {
    const frames = warmFrames();
    if ( ! frames ) return;
    warming = true;
    setWarmth( 'warming' );
    let processor: CameraProcessor | null = null;
    try {
        const engine = await loadEffects();
        if ( ! warmWanted() ) throw STOPPED;
        processor = await engine.camera( { blur: true } );
        if ( ! warmWanted() ) throw STOPPED;
        // Its first frame is drawn inside init(): MediaPipe compiles its GPU programs there, the page frozen for
        // seconds the first time on a device, and the blur's own passes are drawn with it.
        await processor.init( { track: frames.track } );
        const cost = ( processor as { cost?: { frames?: unknown } } ).cost;
        const counted = typeof cost?.frames === 'number';
        const drawn = () => counted ? Number( cost!.frames ) : 0;
        const until = Date.now() + ( counted ? WARM_FRAMES_MS : WARM_UNCOUNTED_MS );
        while ( Date.now() < until && ( ! counted || drawn() < 2 ) ) await new Promise( ( resolve ) => setTimeout( resolve, 100 ) );
        if ( counted && drawn() < 1 ) throw new Error( 'The warm-up drew no frame' );
        rememberWarm();
        setWarmth( 'warm' );
    } catch ( error ) {
        // Not wanted any more before it was done: as it was, to be done the next time the settings open. An effect of
        // a track's own that came on meanwhile has said 'warm' itself.
        if ( warmth === 'warming' ) setWarmth( error === STOPPED ? 'cold' : 'failed' );
        // The model starting nowhere here: the background is not for this device, said before anyone chooses one.
        if ( isUnavailable( error ) ) markUnavailable();
        if ( error !== STOPPED ) console.warn( 'wordplus-realtime: the call effects could not be made ready', error );
    } finally {
        warming = false;
        frames.stop();
        await processor?.destroy().catch( () => null );
    }
}

/**
 * Makes the camera's effect ready on this device before anyone turns it on, so the first background goes on at once.
 * The first one on a computer compiles MediaPipe's GPU programs at its first frames, which freezes the page for some
 * 7 seconds (6.5 on an M1 Max, 8.2 in software), and a fraction of a second once they are compiled: done here, that
 * is in the device settings, which say so (useEffectsWarmth()), rather than on the call screen as the background goes
 * on. The engine runs on a small picture of its own for a moment, never on a camera, and is let go: nothing waits for
 * it, and an effect turned on meanwhile goes on its track as it would without it.
 *
 * Only where the camera's effect is offered here and can run (cameraEffectsUnavailable()), on a computer, once a page
 * and once a week for a browser and its pack (WARM_KEY), and not once an effect has been on. Where the engine finds its
 * model starts nowhere here, the background is marked unavailable for the page. Returns the release: once no one wants
 * it, a warm-up not past loading the engine stops, to be done the next time.
 */
export function warmEffects(): () => void {
    warmHolders++;
    if ( ! warming && warmth === 'cold' && effectOffered( 'camera' ) && ! cameraEffectsUnavailable() && warmsHere() ) {
        if ( warmRemembered() ) setWarmth( 'warm' );
        else if ( warmWanted() ) void warmUp();
    }
    let released = false;
    return () => {
        if ( released ) return;
        released = true;
        warmHolders--;
    };
}

/** For the tests: as a page that never made the effect ready. */
export function forgetEffectsWarmth(): void {
    warmHolders = 0;
    warming = false;
    warmth = 'cold';
}

/**
 * A track of the room client, which takes a processor and sends what it gives (LiveKit's LocalVideoTrack and
 * LocalAudioTrack): the room swaps it on the track's sender, keeps it through a device the track restarts on, and
 * `mediaStreamTrack` then reads the processed one.
 */
export interface ProcessorTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    readonly isStopped?: boolean;
    readonly audioContext?: AudioContext;
    /** The device's own track, before any processor: what says whether the device blurs the camera itself. */
    readonly mediaStream?: MediaStream;
    setProcessor( processor: CameraProcessor | NoiseProcessor ): Promise<void>;
    stopProcessor(): Promise<void>;
    getProcessor(): unknown;
    setAudioContext?( context: AudioContext | undefined ): Promise<void> | void;
    /** `restarted`: the device's track swapped under it (another device, the camera turned on again). */
    on?( event: 'restarted', listener: () => void ): unknown;
}

const CAMERA_PROCESSOR = 'wordplus-camera-effects';
const NOISE_PROCESSOR = 'wordplus-noise-removal';

// The camera under each track of the room client the effects follow, and the release of following its own blur.
const followed = new WeakMap<ProcessorTrack, { camera: MediaStreamTrack | null, release: () => void }>();

/**
 * The camera under a track of the room client, followed for its own blur, which puts the chosen effect on the track
 * again as it turns on or off, and again as the track restarts on another camera.
 */
function followCamera( track: ProcessorTrack ): MediaStreamTrack | null {
    const ours = ( track.getProcessor() as { name?: string } | undefined )?.name === CAMERA_PROCESSOR;
    const was = followed.get( track );
    const camera = track.mediaStream?.getVideoTracks?.()[ 0 ] ?? ( ours ? null : track.mediaStreamTrack ) ?? was?.camera ?? null;
    if ( was && was.camera === camera ) return camera;
    was?.release();
    const again = () => void applyEffect( track, 'camera' );
    followed.set( track, { camera, release: camera ? followDeviceBlur( camera, again ) : () => {} } );
    if ( ! was ) track.on?.( 'restarted', again );
    return camera;
}

// One change at a time on a track: a choice made twice in a row waits for the first to land.
const queues = new WeakMap<object, Promise<unknown>>();

function queued( track: object, run: () => Promise<void> ): Promise<void> {
    const next = ( queues.get( track ) ?? Promise.resolve() ).then( run, run );
    queues.set( track, next.catch( () => null ) );
    return next;
}

const stopped = ( track: ProcessorTrack ) => track.isStopped === true || track.mediaStreamTrack?.readyState === 'ended';

async function applyCamera( track: ProcessorTrack, look: CameraLook | null ): Promise<boolean> {
    const current = track.getProcessor() as CameraProcessor | undefined;
    const ours = current?.name === CAMERA_PROCESSOR;
    if ( ! look ) {
        if ( ours ) await track.stopProcessor();
        return false;
    }
    if ( ours ) {
        await current!.setLook( look );
        return true;
    }
    const processor = await ( await loadEffects() ).camera( look );
    if ( stopped( track ) ) {
        await processor.destroy();
        return false;
    }
    await track.setProcessor( processor );
    return true;
}

async function applyNoise( track: ProcessorTrack, on: boolean ): Promise<boolean> {
    const current = track.getProcessor() as NoiseProcessor | undefined;
    const ours = current?.name === NOISE_PROCESSOR;
    if ( ! on ) {
        if ( ours ) await track.stopProcessor();
        return false;
    }
    if ( ours ) return true;
    const engine = await loadNoiseEngine();
    // Its files first, before the track takes the processor: the room client holds a track while its processor starts,
    // and a publish waits behind that (its setAudioContext), so files still on their way would hold the microphone
    // back from the call for as long as they take. One that fails is asked for again as the processor starts.
    await engine.warm?.().catch( () => null );
    const processor = await engine.noise();
    if ( stopped( track ) ) {
        await processor.destroy();
        return false;
    }
    // A microphone outside a room has no context, and the room client sets a processor only on one that has: the
    // processor's own, which it keeps whatever context a room gives the track later.
    if ( ! track.audioContext ) await track.setAudioContext?.( processor.context );
    await track.setProcessor( processor );
    return true;
}

/**
 * Puts the chosen effect of `kind` on a track of the room client, or takes it off where none is chosen, and waits for
 * it: a camera turned on with a blur goes out blurred from its first frame. Never fails: an effect that cannot start
 * here leaves the track as it is, and says so to the device settings (useEffectState). Nothing where the effect is not
 * offered, nor a background where it can't run on this device (cameraEffectsUnavailable()), nor Blur where the device
 * blurs the camera itself (blurredByDevice()), which goes on as Portrait goes off.
 *
 * `soon`, for a microphone a call is waiting to send: AI Noise Removal is waited for NOISE_WAIT_MS at most, and goes
 * on the track by itself once it is ready. A camera's effect is always waited for, as its room must never be seen.
 */
export async function applyEffect( track: ProcessorTrack | null | undefined, kind: EffectKind, soon = false ): Promise<void> {
    if ( ! track ) return;
    const chosen = effectsChoice();
    const offered = effectOffered( kind ) && ( kind !== 'camera' || ! cameraEffectsUnavailable() );
    const camera = kind === 'camera' ? followCamera( track ) : null;
    const look = offered && kind === 'camera' ? overDeviceBlur( cameraLook( chosen.camera, chosen.tune ), camera ) : null;
    const noise = offered && kind === 'noise' && chosen.noise;
    const wanted = kind === 'camera' ? !! look : noise;
    const ours = ( track.getProcessor() as { name?: string } | undefined )?.name === ( kind === 'camera' ? CAMERA_PROCESSOR : NOISE_PROCESSOR );
    if ( ! wanted && ! ours ) {
        setEffectState( kind, 'off' );
        return;
    }
    if ( wanted && ! ours ) setEffectState( kind, 'loading' );
    const work = queued( track, async () => {
        try {
            const on = kind === 'camera' ? await applyCamera( track, look ) : await applyNoise( track, noise );
            setEffectState( kind, on ? 'on' : 'off' );
        } catch ( error ) {
            if ( kind === 'camera' && isUnavailable( error ) ) markUnavailable();
            setEffectState( kind, 'failed' );
            console.warn( 'wordplus-realtime: the call effect did not start', error );
        }
    } );
    return soon && kind === 'noise' ? Promise.race( [ work, wait( NOISE_WAIT_MS ) ] ) : work;
}

/**
 * Follows the choice on the call's own camera and microphone, tracks of the room client: an effect turned on or off,
 * or another background, goes on the track as it is sent, its sender swapped, never the track dropped. A picture of
 * the person's own goes on once the browser has read it, and comes off once it is removed. AI Noise Removal's files
 * are read ahead of the microphone as the call's screen opens (warmNoise()).
 */
export function useTrackEffects( camera: ProcessorTrack | null | undefined, microphone: ProcessorTrack | null | undefined ): void {
    const chosen = useEffectsChoice();
    const own = useOwnBackgroundsVersion();
    useEffect( () => warmNoise(), [ chosen.noise ] );
    useEffect( () => {
        void applyEffect( camera, 'camera' );
    }, [ camera, chosen.camera, JSON.stringify( chosen.tune ), chosen.camera.startsWith( 'own:' ) ? own : 0 ] );
    useEffect( () => {
        void applyEffect( microphone, 'noise' );
    }, [ microphone, chosen.noise ] );
}

/**
 * An effect on a browser's own track: `output` is the track with the effect, or the track itself while none is
 * wanted, and `changed` hears each new output. A camera that is wanted with an effect gives nothing out until the
 * effect is on, so its room is never seen, unless the effect cannot start here: then the camera as it is, said once
 * through `failed`. A camera whose device blurs it itself (blurredByDevice()) is given out as it is while Blur is
 * wanted, and blurred again once the device stops.
 */
export class TrackEffect {
    output: MediaStreamTrack | null = null;
    private processor: CameraProcessor | NoiseProcessor | null = null;
    private raw: MediaStreamTrack | null = null;
    private wanted: CameraLook | boolean | null = null;
    private following: { camera: MediaStreamTrack, release: () => void } | null = null;
    private queue: Promise<void> = Promise.resolve();
    private disposed = false;

    constructor(
        private readonly kind: EffectKind,
        private readonly changed: ( output: MediaStreamTrack | null ) => void = () => {},
        private readonly failed: ( error: unknown ) => void = () => {},
    ) {}

    /** The track to work on, and the effect: a look for the camera, true for the noise removal, null for none. */
    set( raw: MediaStreamTrack | null, wanted: CameraLook | boolean | null ): Promise<void> {
        this.wanted = wanted;
        this.queue = this.queue.then( () => this.apply( raw, wanted ) );
        return this.queue;
    }

    dispose(): Promise<void> {
        this.disposed = true;
        this.following?.release();
        this.following = null;
        this.queue = this.queue.then( async () => {
            await this.processor?.destroy();
            this.processor = null;
        } );
        return this.queue;
    }

    // The camera followed for its own blur, the effect put on it again as the device turns it on or off.
    private follow( raw: MediaStreamTrack | null ): void {
        if ( this.kind !== 'camera' || this.following?.camera === raw ) return;
        this.following?.release();
        this.following = raw ? { camera: raw, release: followDeviceBlur( raw, () => void this.set( raw, this.wanted ) ) } : null;
    }

    private async apply( raw: MediaStreamTrack | null, wanted: CameraLook | boolean | null ): Promise<void> {
        if ( this.disposed ) return;
        this.follow( raw );
        const was = this.output;
        try {
            if ( this.kind === 'camera' && wanted && typeof wanted === 'object' && ! overDeviceBlur( wanted, raw ) ) {
                await this.processor?.destroy();
                this.processor = null;
                this.output = raw;
                setEffectState( this.kind, 'off' );
            } else if ( ! raw || ! wanted ) {
                await this.processor?.destroy();
                this.processor = null;
                this.output = raw;
            } else if ( this.processor ) {
                if ( raw !== this.raw ) await this.processor.restart( { track: raw } );
                if ( this.kind === 'camera' && typeof wanted === 'object' ) await ( this.processor as CameraProcessor ).setLook( wanted );
            } else {
                setEffectState( this.kind, 'loading' );
                const processor = this.kind === 'camera'
                    ? await ( await loadEffects() ).camera( wanted as CameraLook )
                    : await ( await loadNoiseEngine() ).noise();
                if ( this.disposed ) {
                    await processor.destroy();
                    return;
                }
                await processor.init( { track: raw } );
                this.processor = processor;
                this.output = processor.processedTrack ?? raw;
                setEffectState( this.kind, 'on' );
            }
        } catch ( error ) {
            this.processor = null;
            this.output = raw;
            if ( this.kind === 'camera' && isUnavailable( error ) ) markUnavailable();
            setEffectState( this.kind, 'failed' );
            this.failed( error );
        }
        this.raw = raw;
        if ( this.output !== was && ! this.disposed ) this.changed( this.output );
    }
}

/**
 * A browser's own track with an effect, as TrackEffect gives it: the track itself while none is wanted, and null until
 * the first is ready. For the device settings' private tests.
 */
export function useEffectTrack( kind: EffectKind, raw: MediaStreamTrack | null, wanted: CameraLook | boolean | null ): MediaStreamTrack | null {
    const [ output, setOutput ] = useState<MediaStreamTrack | null>( null );
    const effect = useRef<TrackEffect | null>( null );

    useEffect( () => {
        const own = new TrackEffect( kind, setOutput );
        effect.current = own;
        return () => {
            void own.dispose();
            effect.current = null;
        };
    }, [ kind ] );

    const key = JSON.stringify( wanted );
    useEffect( () => {
        void effect.current?.set( raw, wanted );
    }, [ raw, key ] );

    return output;
}

/**
 * The effect the choice asks of a browser's own track of `kind`, as TrackEffect takes it: null where none is offered,
 * and for the camera where its background can't run on this device.
 */
export function chosenEffect( kind: EffectKind, chosen: EffectsChoice = effectsChoice() ): CameraLook | boolean | null {
    if ( ! effectOffered( kind ) || ( kind === 'camera' && cameraEffectsUnavailable() ) ) return null;
    return kind === 'camera' ? cameraLook( chosen.camera, chosen.tune ) : chosen.noise || null;
}
