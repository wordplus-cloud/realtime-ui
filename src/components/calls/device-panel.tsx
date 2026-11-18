import React, { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallTrack } from "./context.ts";
import Icon, { type IconName } from "../../primitives/icons.tsx";
import { readLevel } from "../../inc/calls/mic-level.ts";
import pressable from "./pressable.ts";
import { MutedHintContext } from "./muted-hint.tsx";
import { LayoutChoiceContext } from "./layout-choice.tsx";
import UserName from "../users/user-name.tsx";
import {
    builtInBackgrounds, cameraLook, chooseEffects, DEVICE_BLUR_TIP_KEY, NOISE_AUTO_TIP_KEY, deviceBlurHere, deviceBlurReported, effectOffered, effectsTunable, TUNE_KEYS, warmEffects,
    siteBackgrounds, useCameraBlurredByDevice, useCameraEffectsUnavailable, useEffectState, useEffectTrack, useEffectsChoice, useEffectsSlowTimes, useEffectsWarmth,
    type CameraEffect, type EffectState,
} from "../../inc/calls/effects.ts";
import {
    addOwnBackground, OWN_ACCEPT, ownBackgroundsAllowed, ownBackgroundsLast, removeOwnBackground, useOwnBackgrounds,
} from "../../inc/calls/own-backgrounds.ts";
import { host } from "../../host.ts";
import { cameraConstraints } from "../../inc/calls/camera-size.ts";
import { useTestRecording } from "../../inc/calls/test-recording.ts";
import {
    mediaAccess,
    updateMediaPermissions,
    useCameras,
    useDeviceAccess,
    useMicrophones,
    useSpeakers
} from "../../inc/calls/permissions.ts";
import { stuckBy, stuckSteps, stuckTitle, unblockSteps, type Stuck } from "./ask-prompt.tsx";

type Kind = 'camera' | 'microphone';

/**
 * How loud the microphone is, from 0 to 1, read off its browser track twenty times a second. 0 where there is no
 * microphone, no track under it, or no Web Audio.
 */
export function useMicLevel( track: CallTrack | null ): number {
    return useTrackLevel( track?.mediaStreamTrack );
}

/** How loud a browser's microphone track is, from 0 to 1, as useMicLevel reads a call's. */
function useTrackLevel( source: MediaStreamTrack | null | undefined ): number {
    const [ level, setLevel ] = useState( 0 );

    useEffect( () => {
        if ( ! source ) {
            setLevel( 0 );
            return;
        }

        // On the scale of mic-level.ts a normal voice lights most of the meter. It rises at once and falls away over a
        // few readings, so speech reads as speech rather than as flicker.
        let shown = 0;
        const stop = readLevel( source, ( heard ) => {
            shown = Math.max( heard, shown * 0.8 );
            setLevel( shown < 0.01 ? 0 : shown );
        } );

        return () => {
            stop();
            setLevel( 0 );
        };
    }, [ source ] );

    return level;
}

/**
 * The camera of the preview, at the size the call opens it (cameraConstraints(), UiHost.cameraSize), so the preview has
 * the shape the others get: asked for no size, Chrome opened 640x480, a 4:3 crop of a 16:9 camera, which the 16:9
 * preview drew with bands (asked on 2026-11-02, of a picture behind the caller: "its just not full width/height in
 * preview"). Ideals only, so a camera that cannot give that size gives its nearest; one that is really 4:3 keeps its
 * bands.
 */
const previewCamera = ( deviceId: string ): MediaTrackConstraints => ( { ...cameraConstraints(), ...( deviceId ? { deviceId: { ideal: deviceId } } : {} ) } );

/**
 * One device's test, only the user's: the camera or the microphone opened here while `wanted` and never published,
 * each on its own, so testing one never starts the other. `seed`, a stream the settings asked for (Allow Access, or both
 * at once from the start: one prompt), gives the test its track of this kind instead of asking again, once each seed.
 * It goes once the call sends that device itself, and when the panel closes, letting go only of its own kind in a
 * stream it shares. `told` hears how each open went: null, or why the browser refused it.
 */
function usePrivateTest( kind: 'audio' | 'video', wanted: boolean, deviceId: string, seed: MediaStream | null = null, told?: ( why: Stuck | null ) => void ): MediaStream | null {
    const [ stream, setStream ] = useState<MediaStream | null>( null );
    const open = useRef<MediaStream | null>( null );
    const used = useRef<MediaStream | null>( null );
    const tell = useRef( told );
    tell.current = told;

    useEffect( () => {
        if ( ! wanted || typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) return;
        let left = false;
        const device = deviceId ? { deviceId: { ideal: deviceId } } : true;
        const stop = () => {
            open.current?.getTracks().forEach( ( track ) => { if ( track.kind === kind ) track.stop(); } );
            open.current = null;
            setStream( null );
        };

        if ( seed && used.current !== seed && seed.getTracks().some( ( track ) => track.kind === kind && track.readyState !== 'ended' ) ) {
            used.current = seed;
            open.current = seed;
            setStream( seed );
            tell.current?.( null );
            return stop;
        }

        navigator.mediaDevices.getUserMedia( kind === 'audio' ? { audio: device, video: false } : { audio: false, video: previewCamera( deviceId ) } ).then( ( got ) => {
            if ( left ) {
                got.getTracks().forEach( ( track ) => track.stop() );
                return;
            }
            open.current = got;
            setStream( got );
            tell.current?.( null );
        } ).catch( ( error ) => {
            if ( ! left ) tell.current?.( stuckBy( error ) );
        } ).finally( () => { void updateMediaPermissions(); } );

        return () => {
            left = true;
            stop();
        };
    }, [ kind, wanted, deviceId, seed ] );

    return stream;
}

// How long the prompt of a join stands before it goes by itself.
export const JOIN_PROMPT_MS = 10000;

// How tall the device settings must be for the camera's picture to stay at their top while Effect Settings is open:
// the picture is about 190 pixels, and the sliders need room under it.
const PIN_ROOM = 420;

/**
 * Whether to tell the user, as a group call is first joined, that their microphone and camera are off, where the
 * context asks for it (`devicesOnJoin`), the user has not said not to (`joinNotice`) and may send: someone who only
 * watches has nothing to turn on. It goes after JOIN_PROMPT_MS, once either is turned on, once the devices open, or on
 * the second value. A reconnect is not a join. The third value holds that time while the pointer or the keyboard's
 * focus is on the prompt (`hold( true )`), as someone reading it or about to press one of its buttons would lose it
 * under their pointer, and lets the rest of it run once they leave (`hold( false )`).
 */
export function useJoinPrompt( devicesOpen: boolean ): [ boolean, () => void, ( held: boolean ) => void ] {
    const { devicesOnJoin, joinNotice, connectionState, canPublish, myCameraTrack, myMicrophoneTrack } = useContext<CallContextInterface>( CallContext );
    const joined = useRef( false );
    const [ shown, setShown ] = useState( false );
    const [ held, setHeld ] = useState( false );
    // what is left of JOIN_PROMPT_MS, less each stretch the prompt stood unheld
    const left = useRef( JOIN_PROMPT_MS );

    useEffect( () => {
        if ( joined.current || connectionState !== 'connected' ) return;
        joined.current = true;
        if ( devicesOnJoin && joinNotice?.shown !== false && canPublish && ! myCameraTrack && ! myMicrophoneTrack ) setShown( true );
    }, [ connectionState ] );

    useEffect( () => {
        if ( ! shown || held ) return;
        const started = Date.now();
        const timer = setTimeout( () => setShown( false ), left.current );
        return () => {
            clearTimeout( timer );
            left.current = Math.max( 0, left.current - ( Date.now() - started ) );
        };
    }, [ shown, held ] );

    const over = devicesOpen || !! myCameraTrack || !! myMicrophoneTrack || ! canPublish || connectionState === 'disconnected';
    useEffect( () => {
        if ( over ) setShown( false );
    }, [ over ] );

    return [ shown && ! over, () => setShown( false ), setHeld ];
}

/**
 * The prompt of a join, a card over the dock: the microphone, and on a video call the camera, are off, and the buttons
 * below turn them on, with Preview, or Test Microphone on an audio call, which opens the device settings with it running
 * (`preview`), and a ×. It covers nothing of the call and opens nothing by itself. Where the app keeps the user's choice
 * (`joinNotice`), Do Not Show Again beside Preview puts it away for good, × for this call alone. `hold` is told whether
 * the pointer or the keyboard's focus is on the card (useJoinPrompt's third value), which keeps it up meanwhile.
 */
export function JoinPrompt( { video, preview, dismiss, hold }: { video: boolean, preview: () => void, dismiss: () => void, hold?: ( held: boolean ) => void } ) {
    const { joinNotice } = useContext<CallContextInterface>( CallContext );
    const hovered = useRef( false );
    const focused = useRef( false );
    const tell = () => hold?.( hovered.current || focused.current );
    const never = () => {
        joinNotice?.dontShowAgain();
        dismiss();
    };

    return <div className="wplus-call-join-prompt-region" role="status">
        <div className="wplus-call-join-prompt"
            onPointerEnter={ () => { hovered.current = true; tell(); } }
            onPointerLeave={ () => { hovered.current = false; tell(); } }
            onFocus={ () => { focused.current = true; tell(); } }
            onBlur={ ( event ) => {
                // focus moving from one of its buttons to another stays on the card
                if ( event.currentTarget.contains( event.relatedTarget as Node | null ) ) return;
                focused.current = false;
                tell();
            } }>
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name="micOff" size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ video
                    ? _x( 'Microphone and camera are off', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Microphone is off', 'Call Devices', 'bp-better-messages' ) }</span>
                <span className="wplus-call-join-prompt-note">{ video
                    ? _x( 'Turn them on with the buttons below when you are ready.', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Turn it on with the button below when you are ready.', 'Call Devices', 'bp-better-messages' ) }</span>
            </span>
            <span className="wplus-call-join-prompt-actions">
                <span { ...pressable( preview ) } className="wplus-call-join-prompt-preview">{ video
                    ? _x( 'Preview', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Test Microphone', 'Call Devices', 'bp-better-messages' ) }</span>
                { joinNotice && <span { ...pressable( never ) } className="wplus-call-join-prompt-never">{ _x( 'Do Not Show Again', 'Call Devices', 'bp-better-messages' ) }</span> }
            </span>
            <span { ...pressable( dismiss ) } className="wplus-call-join-prompt-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                <Icon name="x" size={ 14 } />
            </span>
        </div>
    </div>;
}

/**
 * Over the dock, in the join prompt's card and place, once the camera's background has slowed the device for some
 * seconds (the engine's `wordplus-call-effects-slow`, src/effects/quality.ts): that it does, the device settings' line
 * on turning it off, and Turn Off, which chooses None, or × to keep it. At most once a call, for a background still
 * on: the engine goes on with the same model either way, as none goes back to a worse one by itself (asked on
 * 2026-11-02: "I want it to use good model or be disabled by user if it loads his device too much").
 */
export function EffectsSlowNotice() {
    const slowTimes = useEffectsSlowTimes();
    const { camera } = useEffectsChoice();
    const state = useEffectState( 'camera' );
    // What came before this call is not this call's.
    const [ before ] = useState( slowTimes );
    const [ over, setOver ] = useState( false );
    const shown = ! over && slowTimes > before && camera !== 'none' && state === 'on';
    const seen = useRef( false );
    if ( shown ) seen.current = true;
    // Gone by itself (the background turned off from the settings), it doesn't come back in this call.
    useEffect( () => {
        if ( seen.current && ! shown ) setOver( true );
    }, [ shown ] );
    if ( ! shown ) return null;

    const turnOff = () => {
        setOver( true );
        chooseEffects( { camera: 'none' } );
    };

    return <div className="wplus-call-join-prompt-region wplus-call-effects-slow-region" role="status">
        <div className="wplus-call-join-prompt wplus-call-ask-prompt wplus-call-effects-slow">
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name="alert" size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ _x( 'Your background is slowing this device', 'Call Effects', 'bp-better-messages' ) }</span>
                <span className="wplus-call-join-prompt-note">{ _x( 'If your video stutters or your device gets warm, turn the background off.', 'Call Effects', 'bp-better-messages' ) }</span>
            </span>
            <span className="wplus-call-ask-actions">
                <span { ...pressable( turnOff ) } className="wplus-call-join-prompt-preview" data-part="effects-turn-off">{ _x( 'Turn Off', 'Call Effects', 'bp-better-messages' ) }</span>
            </span>
            <span { ...pressable( () => setOver( true ) ) } className="wplus-call-join-prompt-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                <Icon name="x" size={ 14 } />
            </span>
        </div>
    </div>;
}

/** How long the notice that the app's default turned AI Noise Removal on stays, unless the pointer or the focus holds it. */
export const NOISE_AUTO_NOTICE_MS = 8000;

/**
 * Over the dock, in the join prompt's card and place, once AI Noise Removal is on the call's microphone because the app
 * turns it on for those who never chose (UiHost.noiseDefault): that it is on, what it does, Turn Off, which the browser
 * keeps as the person's choice, Do Not Show Again, which it keeps too, and × for this call. Once a call, from the
 * moment the noise removal really runs, never while its files are still on their way. It goes by itself after
 * NOISE_AUTO_NOTICE_MS, as it asks nothing, and waits while the pointer or the focus is on it, so a press about to land
 * is never taken away; the badge on Device Settings still says the noise removal runs.
 */
export function NoiseAutoNotice() {
    const { noiseAuto } = useEffectsChoice();
    const state = useEffectState( 'noise' );
    const [ over, setOver ] = useState( false );
    const [ held, setHeld ] = useState( false );
    const [ never, setNever ] = useState( () => {
        try {
            return window.localStorage.getItem( NOISE_AUTO_TIP_KEY ) === '1';
        } catch ( e ) {
            return false;
        }
    } );
    const shown = ! over && ! never && !! noiseAuto && state === 'on';
    const seen = useRef( false );
    if ( shown ) seen.current = true;
    // Gone by itself (the noise removal turned off, or chosen in the settings), it doesn't come back in this call. A
    // microphone the call opens again passes through 'loading', which is no reason: the state is the page's, and the
    // last call's 'on' is still there as the next one starts.
    const gone = ! noiseAuto || state === 'off' || state === 'failed';
    useEffect( () => {
        if ( seen.current && gone ) setOver( true );
    }, [ gone ] );
    useEffect( () => {
        if ( ! shown || held ) return;
        const timer = setTimeout( () => setOver( true ), NOISE_AUTO_NOTICE_MS );
        return () => clearTimeout( timer );
    }, [ shown, held ] );
    if ( ! shown ) return null;

    const turnOff = () => {
        setOver( true );
        chooseEffects( { noise: false } );
    };
    const hold = {
        onPointerEnter: () => setHeld( true ),
        onPointerLeave: () => setHeld( false ),
        onFocus: () => setHeld( true ),
        onBlur: () => setHeld( false ),
    };
    const dontShowAgain = () => {
        setNever( true );
        try {
            window.localStorage.setItem( NOISE_AUTO_TIP_KEY, '1' );
        } catch ( e ) {}
    };

    return <div className="wplus-call-join-prompt-region wplus-call-noise-auto-region" role="status">
        <div className="wplus-call-join-prompt wplus-call-ask-prompt wplus-call-noise-auto" { ...hold }>
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name="noiseRemoval" size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ _x( 'AI Noise Removal is active', 'Call Effects', 'bp-better-messages' ) }</span>
                <span className="wplus-call-join-prompt-note">{ _x( 'It takes out typing, fans and other sounds around your voice. Turn it off if you play music or your voice breaks up.', 'Call Effects', 'bp-better-messages' ) }</span>
            </span>
            <span className="wplus-call-ask-actions">
                <span { ...pressable( turnOff ) } className="wplus-call-join-prompt-preview" data-part="noise-turn-off">{ _x( 'Turn Off', 'Call Effects', 'bp-better-messages' ) }</span>
                <span { ...pressable( dontShowAgain ) } className="wplus-call-join-prompt-never" data-part="noise-never">{ _x( 'Do Not Show Again', 'Call Effects', 'bp-better-messages' ) }</span>
            </span>
            <span { ...pressable( () => setOver( true ) ) } className="wplus-call-join-prompt-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                <Icon name="x" size={ 14 } />
            </span>
        </div>
    </div>;
}

/**
 * The dock's Device Settings while AI Noise Removal runs on the call's microphone, whoever turned it on: its name for the
 * tooltip and screen readers, and whether to draw the badge on it (ConfigureBadge).
 */
export function useConfigureCall(): { label: string, noise: boolean } {
    const noise = useEffectState( 'noise' ) === 'on';
    return {
        label: noise ? _x( 'Device Settings, AI Noise Removal is active', 'Call Devices', 'bp-better-messages' ) : _x( 'Device Settings', 'Call Devices', 'bp-better-messages' ),
        noise,
    };
}

/** The small badge in the start corner of the dock's Device Settings while AI Noise Removal runs. */
export function ConfigureBadge( { noise }: { noise: boolean } ) {
    if ( ! noise ) return null;
    return <span className="wplus-configure-call-badge" data-part="noise-badge" aria-hidden="true"><Icon name="noiseRemoval" size={ 9 } /></span>;
}

// Where each segment of the meter lights, from a quiet room (one) to someone speaking up (all eight).
const LEVEL_STEPS = [ 0.25, 0.34, 0.44, 0.53, 0.62, 0.71, 0.81, 0.9 ];

/** The microphone's level as an input meter: a row of segments lighting from the left as it hears more. */
function MicLevel( { level }: { level: number } ) {
    return <span className="wplus-call-device-level" aria-hidden="true">
        { LEVEL_STEPS.map( ( step, i ) => <i key={ i } data-on={ level > step ? 1 : undefined } /> ) }
    </span>;
}

// Three rising notes, about a second, on the speaker chosen where the browser lets a page choose it.
function testSound( speaker: string ): Promise<void> {
    const Context = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if ( ! Context ) return Promise.resolve();

    const context = new Context() as AudioContext & { setSinkId?: ( id: string ) => Promise<void> };
    const sink = speaker && context.setSinkId ? context.setSinkId( speaker ).catch( () => null ) : Promise.resolve();

    return sink.then( () => context.resume() ).then( () => new Promise<void>( ( resolve ) => {
        const now = context.currentTime;

        [ 523.25, 659.25, 783.99 ].forEach( ( frequency, i ) => {
            const tone = context.createOscillator();
            const gain = context.createGain();
            const start = now + i * 0.22;

            tone.type = 'sine';
            tone.frequency.value = frequency;
            gain.gain.setValueAtTime( 0.0001, start );
            gain.gain.exponentialRampToValueAtTime( 0.18, start + 0.02 );
            gain.gain.exponentialRampToValueAtTime( 0.0001, start + 0.5 );
            tone.connect( gain ).connect( context.destination );
            tone.start( start );
            tone.stop( start + 0.52 );
        } );

        setTimeout( () => {
            void context.close().catch( () => null );
            resolve();
        }, 1100 );
    } ) ).catch( () => { void context.close().catch( () => null ); } );
}

interface Choice {
    id: string,
    label: string,
}

// The devices to choose from, as the browser lists them, the system's own named. "Default" leads only where the
// browser has no device of that name: there it would be the same one twice.
function choices( devices: Map<string, MediaDeviceInfo>, fallback: string ): Choice[] {
    const list: Choice[] = [];

    if ( ! devices.has( 'default' ) ) list.push( { id: '', label: _x( 'Default', 'Media Inputs', 'bp-better-messages' ) } );

    devices.forEach( ( item ) => {
        let label = item.label || fallback;
        if ( item.deviceId === 'default' ) label = _x( 'Same as system', 'Media Inputs', 'bp-better-messages' ) + ' - ' + label;
        if ( item.deviceId === 'communications' ) label = _x( 'Communications', 'Media Inputs', 'bp-better-messages' ) + ' - ' + label;
        list.push( { id: item.deviceId, label } );
    } );

    return list;
}



/** Where a device stands for the others in the call: live or not, said in words. */
interface DeviceState {
    live: boolean,
    text: ReactNode,
}

/**
 * One device: its glyph and name with its test on the end of their line, under them the device in use in a field, a line
 * under that (the microphone's level, or why it is off), the camera's private preview while it is tested, and the line
 * that says whether the others see or hear it. All under the head spans the row: kept in line with the name, they gave a
 * sixth of the panel's width to a column of glyph tiles. A field with its arrow on the end, as the device in use in a
 * line of quiet text under the name read as a caption, and people did not find where to choose a device. An unseen
 * <select> lies over the field, so the devices open in the browser's own menu, a phone's own picker, which takes no room
 * in the settings: a list drawn in the row pushed the rest of them away, and could open below their fold. `unavailable`
 * is said in place of the device in use while the browser does not let the site use it: it lists nothing to choose from
 * then, so it is plain text, as a device with no list to open is.
 */
function DeviceRow( { kind, icon, label, devices, selected, choose, live, status, preview, state, action, effects, unavailable }: {
    kind: 'camera' | 'microphone' | 'speaker',
    icon: IconName,
    label: string,
    devices: Map<string, MediaDeviceInfo>,
    selected: string,
    choose: ( id: string ) => void,
    live?: boolean,
    status?: ReactNode,
    preview?: ReactNode,
    state?: DeviceState,
    action?: ReactNode,
    // The device's effects, under the line that says who sees or hears it.
    effects?: ReactNode,
    unavailable?: string,
} ) {
    const list = choices( devices, label );
    const current = selected || ( devices.has( 'default' ) ? 'default' : '' );
    const shown = list.find( ( choice ) => choice.id === current ) ?? list[ 0 ];
    const pickable = devices.size > 0 && ! unavailable;

    return <div className="wplus-call-device" data-kind={ kind } data-on={ live ? 1 : undefined }>
        <div className="wplus-call-device-head">
            <span className="wplus-call-device-icon" aria-hidden="true"><Icon name={ icon } size={ 16 } /></span>
            <span className="wplus-call-device-label">{ label }</span>
            { action }
        </div>
        { unavailable
            ? <span className="wplus-call-device-current" data-fixed="1" data-unavailable="1"><span className="wplus-call-device-name">{ unavailable }</span></span>
            : pickable
                ? <span className="wplus-call-device-current">
                    <span className="wplus-call-device-name">{ shown?.label }</span>
                    <Icon name="chevronD" size={ 14 } />
                    <select className="wplus-call-device-select" aria-label={ label } value={ shown?.id } onChange={ ( event ) => choose( event.target.value ) }>
                        { list.map( ( choice ) => <option key={ choice.id || 'none' } value={ choice.id }>{ choice.label }</option> ) }
                    </select>
                </span>
                : <span className="wplus-call-device-current" data-fixed="1"><span className="wplus-call-device-name">{ shown?.label }</span></span> }
        { status && <div className="wplus-call-device-reading">{ status }</div> }
        { preview }
        { state &&
            <div className="wplus-call-device-state" data-live={ state.live ? 1 : undefined }>
                <span className="wplus-call-device-status">
                    <i className="wplus-call-device-dot" aria-hidden="true" />
                    { state.live && <span className="wplus-call-device-live">{ _x( 'Live', 'Call Devices', 'bp-better-messages' ) }</span> }
                    <span>{ state.text }</span>
                </span>
            </div> }
        { effects }
    </div>;
}

const couldNotStart = () => _x( 'This effect could not start on this device.', 'Call Effects', 'bp-better-messages' );

/**
 * What is behind the user on camera, under the camera's row: none, a blur, the built-in backgrounds the app offers
 * (UiHost.builtInBackgrounds: those of WordPlus's catalog its administrator picked), or one the app adds
 * (UiHost.backgrounds), each a tile, the chosen one ringed, with a spinner while its files load. The choice is the
 * browser's, for this call and the next: one the app no longer offers reads as none. A picture on another origin is
 * drawn by WebGL only with CORS, so its tile asks for it the same way, and one the browser refuses so is marked as not
 * usable here instead of breaking the camera.
 *
 * Where the app lets people use their own pictures (UiHost.ownBackgrounds), those this browser keeps come next, each
 * with a button that removes it, and Add Your Own last, which opens the device's picker and chooses the picture once it
 * is read. The picture stays in the browser (inc/calls/own-backgrounds.ts), and a line says when the browser keeps
 * nothing, so it lasts for this call only.
 *
 * While a background is on, a line under them says to turn it off where the device struggles with it (asked on
 * 2026-11-01: "saying to disable high quality if works badly, but not saying to disable feature at all if it works
 * badly, better to be double sure"). Then Effect Settings, closed, which tells `tuning` whether it is open. Before them,
 * the blur of the device itself, Portrait, where it has one (DeviceBlurNote): Blur chosen while it is on is not drawn,
 * with neither line.
 *
 * In that line's place while the chosen one is getting ready, "Preparing your background…", and while the effects are
 * made ready on this device before one is chosen (warmEffects(), as the settings open), "Preparing backgrounds…": the
 * first background on a computer freezes the page for seconds as its GPU programs compile, and a status with a spinner
 * that turns meanwhile (a transform, which the compositor runs) reads as work, where a still panel read as a hang.
 */
function BackgroundPicker( { state, tuning }: { state: EffectState, tuning?: ( open: boolean ) => void } ) {
    const { camera } = useEffectsChoice();
    const warmth = useEffectsWarmth();
    // Where the background can't run on this device, every tile is there and none is to be chosen, None standing as
    // what the others see, with a line saying so: no background drawn badly (cameraEffectsUnavailable()).
    const unavailable = useCameraEffectsUnavailable();
    const [ refused, setRefused ] = useState<string[]>( [] );
    const own = useOwnBackgrounds();
    const ownAllowed = ownBackgroundsAllowed();
    const [ adding, setAdding ] = useState( false );
    const picker = useRef<HTMLInputElement>( null );
    const label = _x( 'Background', 'Call Effects', 'bp-better-messages' );
    const unusable = _x( 'This picture cannot be used here.', 'Call Effects', 'bp-better-messages' );
    const addLabel = _x( 'Add Your Own', 'Call Effects', 'bp-better-messages' );
    const removeLabel = _x( 'Remove This Picture', 'Call Effects', 'bp-better-messages' );
    const options: { id: CameraEffect, name: string, icon?: IconName, thumb?: string, site?: boolean, own?: boolean }[] = [
        { id: 'none', name: _x( 'None', 'Call Effects', 'bp-better-messages' ), icon: 'ban' },
        { id: 'blur', name: _x( 'Blur', 'Call Effects', 'bp-better-messages' ), icon: 'blur' },
        ...builtInBackgrounds().map( ( picture ) => ( { id: `image:${ picture.id }` as CameraEffect, name: picture.name, thumb: picture.thumb || picture.url } ) ),
        ...siteBackgrounds().map( ( picture ) => ( { id: `site:${ picture.id }` as CameraEffect, name: picture.name, thumb: picture.thumb || picture.url, site: true } ) ),
        ...own.map( ( picture ) => ( { id: `own:${ picture.id }` as CameraEffect, name: picture.name, thumb: picture.url, own: true } ) ),
    ];
    const current = ! unavailable && options.some( ( option ) => option.id === camera ) ? camera : 'none';
    const on = current !== 'none';
    // Blur chosen where the device blurs the camera itself (Portrait): not drawn over it, nothing of it to tune or to
    // turn off (DeviceBlurNote says why).
    const deviceBlur = useCameraBlurredByDevice();
    const paused = current === 'blur' && deviceBlur;
    const tunable = on && ! paused && state === 'on' && effectsTunable();
    const preparing = unavailable ? null
        : on && state === 'loading' ? _x( 'Preparing your background…', 'Call Effects', 'bp-better-messages' )
        : warmth === 'warming' ? _x( 'Preparing backgrounds…', 'Call Effects', 'bp-better-messages' )
        : null;

    const add = async ( file: File | undefined ) => {
        if ( ! file ) return;
        setAdding( true );
        try {
            const id = await addOwnBackground( file );
            chooseEffects( { camera: `own:${ id }` } );
        } catch ( error ) {
            host().showError( error instanceof Error ? error.message : error );
        } finally {
            setAdding( false );
        }
    };

    const remove = ( id: CameraEffect ) => {
        if ( camera === id ) chooseEffects( { camera: 'none' } );
        void removeOwnBackground( id.slice( 'own:'.length ) );
    };

    return <div className="wplus-call-effects" data-unavailable={ unavailable ? 1 : undefined }>
        <span className="wplus-call-effects-label">{ label }</span>
        <span className="wplus-call-effects-list" role="radiogroup" aria-label={ label } aria-disabled={ unavailable || undefined }>
            { options.map( ( option ) => {
                const chosen = current === option.id;
                const busy = chosen && option.id !== 'none' && state === 'loading';
                const off = refused.includes( option.id );
                return <span key={ option.id } { ...pressable( () => { if ( ! off && ! unavailable ) chooseEffects( { camera: option.id } ); } ) } role="radio" aria-checked={ chosen }
                    aria-disabled={ off || unavailable || undefined } aria-label={ option.name } title={ off ? `${ option.name }: ${ unusable }` : option.name }
                    className="wplus-call-effect" data-effect={ option.site ? 'site' : option.own ? 'own' : option.id } data-busy={ busy ? 1 : undefined } data-unusable={ off ? 1 : undefined }>
                    { option.icon
                        ? <Icon name={ option.icon } size={ 18 } />
                        : <img src={ option.thumb } alt="" loading="lazy" draggable={ false } crossOrigin="anonymous"
                            onError={ () => setRefused( ( was ) => was.includes( option.id ) ? was : [ ...was, option.id ] ) } /> }
                    { off && <span className="wplus-call-effect-busy"><Icon name="alert" size={ 16 } /></span> }
                    { busy && <span className="wplus-call-effect-busy"><Icon name="spinner" size={ 16 } className="wplus-svg-animate" /></span> }
                    { option.own && <span role="button" tabIndex={ 0 } aria-label={ removeLabel } title={ removeLabel } className="wplus-call-effect-remove"
                        onClick={ ( event ) => {
                            event.stopPropagation();
                            remove( option.id );
                        } }
                        onKeyDown={ ( event ) => {
                            if ( event.key !== 'Enter' && event.key !== ' ' ) return;
                            event.preventDefault();
                            event.stopPropagation();
                            remove( option.id );
                        } }><Icon name="x" size={ 12 } /></span> }
                </span>;
            } ) }
            { ownAllowed && <span { ...pressable( () => { if ( ! adding && ! unavailable ) picker.current?.click(); } ) } aria-label={ addLabel } title={ addLabel }
                aria-disabled={ unavailable || undefined } className="wplus-call-effect" data-effect="add" data-busy={ adding ? 1 : undefined }>
                <Icon name="plus" size={ 18 } />
                { adding && <span className="wplus-call-effect-busy"><Icon name="spinner" size={ 16 } className="wplus-svg-animate" /></span> }
            </span> }
        </span>
        { ownAllowed && <input ref={ picker } type="file" accept={ OWN_ACCEPT } hidden tabIndex={ -1 } className="wplus-call-effects-file"
            onChange={ ( event ) => {
                const file = event.target.files?.[ 0 ];
                event.target.value = '';
                void add( file );
            } } /> }
        { ownAllowed && own.length > 0 && ! ownBackgroundsLast() && <span className="wplus-call-device-note"><Icon name="alert" size={ 13 } />
            <span>{ _x( 'This browser does not keep your pictures, so they last for this call only.', 'Call Effects', 'bp-better-messages' ) }</span></span> }
        { unavailable && <span className="wplus-call-device-note" data-tone="warning" data-part="effects-unavailable"><Icon name="alert" size={ 13 } />
            <span>{ _x( 'Backgrounds are not available on this device.', 'Call Effects', 'bp-better-messages' ) }</span></span> }
        { state === 'failed' && on && ! paused && <span className="wplus-call-device-note" data-tone="warning"><Icon name="alert" size={ 13 } /><span>{ couldNotStart() }</span></span> }
        <DeviceBlurNote current={ current } unavailable={ unavailable } deviceBlur={ deviceBlur } />
        { preparing && <span className="wplus-call-effects-preparing" role="status" data-part="effects-preparing">
            <span className="wplus-call-effects-spinner" aria-hidden="true" />
            <span>{ preparing }</span>
        </span> }
        { on && ! paused && state !== 'failed' && state !== 'loading' && <span className="wplus-call-effects-hint" data-part="effects-cost">
            { _x( 'If your video stutters or your device gets warm, turn the background off.', 'Call Effects', 'bp-better-messages' ) }
        </span> }
        { tunable && <EffectSettings blur={ current === 'blur' } tuning={ tuning } /> }
    </div>;
}

/**
 * The camera's own blur, Portrait in the Video Effects of Control Center on a Mac, an iPhone and an iPad, said under
 * the backgrounds. While the camera says it is on (useCameraBlurredByDevice()): with Blur chosen, that Blur here waits
 * for it to go off, and with None, why the room is blurred all the same. With Blur chosen while it is off, or where no
 * background runs on this device, that the device can blur or replace the background itself, Portrait and Background
 * there, and how. Where the browser says when Portrait is on (Safari), Blur here then waits by itself for it, and the
 * line says that Background is told to no browser, so the person chooses None with it: the device tells a browser only
 * of Portrait (WebKit reads portraitEffectActive and nothing of backgroundReplacementActive), and Blur that stayed on
 * under Background read as Blur ignoring the device. Elsewhere (Chrome, Firefox) the line says plainly that the browser
 * can't tell of either, so the person chooses None: Chrome keeps the browser's word on Portrait behind a flag. That line
 * goes with × for good, kept by the browser. Each is a line to know, with the info icon.
 */
function DeviceBlurNote( { current, unavailable, deviceBlur }: { current: CameraEffect, unavailable: boolean, deviceBlur: boolean } ) {
    const [ closed, setClosed ] = useState( () => {
        try {
            return window.localStorage.getItem( DEVICE_BLUR_TIP_KEY ) === '1';
        } catch ( e ) {
            return false;
        }
    } );

    if ( deviceBlur ) {
        const text = current === 'blur' ? _x( 'Your device is blurring your background itself with Portrait, so Blur here is paused. It comes back on by itself when you turn Portrait off in Control Center.', 'Call Effects', 'bp-better-messages' )
            : current === 'none' ? _x( 'Your device is blurring your background itself with Portrait. Turn Portrait off in Control Center to show your room.', 'Call Effects', 'bp-better-messages' )
            : null;
        return text && <span className="wplus-call-device-note" data-part="device-blur"><Icon name="info" size={ 13 } /><span>{ text }</span></span>;
    }
    if ( closed || ! deviceBlurHere() || ( current !== 'blur' && ! unavailable ) ) return null;

    const close = () => {
        setClosed( true );
        try {
            window.localStorage.setItem( DEVICE_BLUR_TIP_KEY, '1' );
        } catch ( e ) {}
    };
    const then = unavailable ? null
        : deviceBlurReported() ? _x( 'Blur here pauses by itself while Portrait is on. Browsers are not told when Background is on, so choose None here when you use it.', 'Call Effects', 'bp-better-messages' )
        : _x( 'This browser cannot tell when either is on, so choose None here once you turn one on.', 'Call Effects', 'bp-better-messages' );

    return <span className="wplus-call-device-note wplus-call-device-blur-tip" data-part="device-blur-tip">
        <Icon name="info" size={ 13 } />
        <span>{ _x( 'Your device can blur or replace your background itself: turn on Portrait or Background in Control Center, under Video Effects. It often looks cleaner and is lighter on this device.', 'Call Effects', 'bp-better-messages' ) }{ then && ' ' + then }</span>
        <span { ...pressable( close ) } className="wplus-call-device-blur-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
            <Icon name="x" size={ 12 } />
        </span>
    </span>;
}

/**
 * Effect Settings, under the backgrounds once one is on and the engine takes a tuning: one line, closed at first, so
 * what the panel shows stays short (asked on 2026-11-01: "becomes abit overloaded"). It opens to the person's tuning,
 * and tells `tuning` it is open, and that it is not once it closes or goes, so the panel keeps the camera in sight.
 */
function EffectSettings( { blur, tuning }: { blur: boolean, tuning?: ( open: boolean ) => void } ) {
    const [ open, setOpen ] = useState( false );
    const tell = useRef( tuning );
    tell.current = tuning;

    useEffect( () => {
        tell.current?.( open );
    }, [ open ] );
    useEffect( () => () => tell.current?.( false ), [] );

    return <div className="wplus-call-tune" data-open={ open ? 1 : undefined }>
        <span { ...pressable( () => setOpen( ! open ) ) } className="wplus-call-tune-head" aria-expanded={ open }>
            <Icon name="tune" size={ 14 } />
            <span className="wplus-call-effects-label">{ _x( 'Effect Settings', 'Call Effects', 'bp-better-messages' ) }</span>
            <Icon name="chevronD" size={ 14 } className="wplus-call-tune-arrow" />
        </span>
        { open && <div className="wplus-call-tune-body"><EffectTuning blur={ blur } /></div> }
    </div>;
}

type TuneKey = typeof TUNE_KEYS[ number ];

/**
 * The person's own tuning in Effect Settings, where the engine takes one (effectsTunable(): a site's pack from before it
 * does not): a line that the effect may miss, with what helps, and a slider for each, kept by the browser (asked on
 * 2026-11-01, of the effect on a real camera: "leave note that it can be not accurate and probably we can add settings
 * for the user end so he can tune settings and find better settings for his actual environment"). Each slider's middle
 * is the effect as it ships, and Reset goes back to it. The camera's own tile and preview show each move at once. Blur
 * Strength only while the room is blurred.
 */
function EffectTuning( { blur }: { blur: boolean } ) {
    const { tune } = useEffectsChoice();
    const settings: Record<TuneKey, { name: string, low: string, high: string }> = {
        outline: { name: _x( 'Outline', 'Call Effects', 'bp-better-messages' ), low: _x( 'Tighter', 'Call Effects', 'bp-better-messages' ), high: _x( 'Wider', 'Call Effects', 'bp-better-messages' ) },
        edge: { name: _x( 'Edge', 'Call Effects', 'bp-better-messages' ), low: _x( 'Sharp', 'Call Effects', 'bp-better-messages' ), high: _x( 'Soft', 'Call Effects', 'bp-better-messages' ) },
        steady: { name: _x( 'Steadiness', 'Call Effects', 'bp-better-messages' ), low: _x( 'Quick', 'Call Effects', 'bp-better-messages' ), high: _x( 'Steady', 'Call Effects', 'bp-better-messages' ) },
        blur: { name: _x( 'Blur Strength', 'Call Effects', 'bp-better-messages' ), low: _x( 'Light', 'Call Effects', 'bp-better-messages' ), high: _x( 'Strong', 'Call Effects', 'bp-better-messages' ) },
    };
    const keys = TUNE_KEYS.filter( ( key ) => key !== 'blur' || blur );

    return <div className="wplus-call-tune-sliders">
        <span className="wplus-call-noise-note">{ _x( 'Edges not quite right? Even light and a plain wall behind you help, and these tune the effect for your room.', 'Call Effects', 'bp-better-messages' ) }</span>
        { keys.map( ( key ) => {
            const setting = settings[ key ];
            return <label key={ key } className="wplus-call-tune-row" data-tune={ key }>
                <span className="wplus-call-tune-name">{ setting.name }</span>
                <input type="range" min={ 0 } max={ 1 } step={ 0.05 } value={ tune[ key ] ?? 0.5 } aria-label={ setting.name }
                    onChange={ ( event ) => chooseEffects( { tune: { ...tune, [ key ]: Number( event.target.value ) } } ) } />
                <span className="wplus-call-tune-ends" aria-hidden="true"><span>{ setting.low }</span><span>{ setting.high }</span></span>
            </label>;
        } ) }
        { Object.keys( tune ).length > 0 &&
            <span { ...pressable( () => chooseEffects( { tune: {} } ) ) } className="wplus-call-device-playback" data-part="tune-reset">
                { _x( 'Reset', 'Call Effects', 'bp-better-messages' ) }
            </span> }
    </div>;
}

/**
 * AI Noise Removal, under the microphone's row: a switch, kept by the browser, with what it adds to what the browser
 * does anyway, and what to do where the device struggles with it, as the backgrounds say (asked on 2026-11-01: "also add
 * same not to ai noise removal"). The browser lowers steady noise on every microphone by itself, so a switch named only
 * for noise read as doing nothing. Its models keep speech, others' too, so the line never says it takes out voices.
 */
function NoiseSwitch( { state }: { state: EffectState } ) {
    const { noise } = useEffectsChoice();
    const label = _x( 'AI Noise Removal', 'Call Effects', 'bp-better-messages' );

    return <div className="wplus-call-effects">
        <span { ...pressable( () => chooseEffects( { noise: ! noise } ) ) } role="switch" aria-checked={ noise } aria-label={ label }
            className="wplus-call-noise" data-on={ noise ? 1 : undefined }>
            <span className="wplus-call-noise-text">
                <span className="wplus-call-effects-label">{ label }</span>
                <span className="wplus-call-noise-note">{ _x( 'Takes out typing, fans and other sounds the browser leaves in. If your voice breaks up or your device gets warm, turn it off.', 'Call Effects', 'bp-better-messages' ) }</span>
            </span>
            { noise && state === 'loading' && <Icon name="spinner" size={ 14 } className="wplus-svg-animate" /> }
            <span className="wplus-call-noise-switch" aria-hidden="true" />
        </span>
        { noise && state === 'failed' && <span className="wplus-call-device-note" data-tone="warning"><Icon name="alert" size={ 13 } /><span>{ couldNotStart() }</span></span> }
    </div>;
}

/** A device's Test, or the camera's Preview, on the end of its row, which turns into Stop while it runs. */
function TestButton( { running, toggle, label }: { running: boolean, toggle: () => void, label?: string } ) {
    return <span { ...pressable( toggle ) } className="wplus-call-device-test" data-active={ running ? 1 : undefined } aria-pressed={ running }>
        <Icon name={ running ? 'x' : 'play' } size={ 12 } />
        <span>{ running ? _x( 'Stop', 'Call Devices', 'bp-better-messages' ) : label ?? _x( 'Test', 'Call Devices', 'bp-better-messages' ) }</span>
    </span>;
}

/**
 * At the top of the device settings while the browser does not let the site use a device the user may send: never
 * allowed yet, with Allow Access, which asks for each at once so the browser asks once, and says nobody sees or hears
 * them until they turn it on; or refused, missing or held by another app, with what to do in this browser and Try Again
 * (ask-prompt.tsx' words, the ones a moderator's ask uses). The settings are offered before any device is allowed, as
 * the place to learn this (asked on 2026-11-01: "so user can open it and see that he need to provide camera access").
 */
function AccessCard( { asking, stuck, trying, request }: {
    asking: Kind[],
    stuck: { kind: Kind, why: Stuck }[],
    trying: boolean,
    request: () => void,
} ) {
    let sections: { title: string, notes: string[] }[];
    if ( stuck.length === 2 && stuck.every( ( one ) => one.why === 'blocked' ) ) {
        // The browser's site settings in one step; the system's (a computer's Privacy & Security) one for each, as it
        // lists the camera and the microphone apart.
        sections = [ {
            title: _x( 'Your browser blocks the camera and microphone for this site', 'Call Devices', 'bp-better-messages' ),
            notes: [
                unblockSteps( _x( 'Camera and Microphone', 'Media Inputs', 'bp-better-messages' ) )[ 0 ],
                ...stuckSteps( 'camera', 'blocked' ).slice( 1 ),
                ...stuckSteps( 'microphone', 'blocked' ).slice( 1 ),
            ],
        } ];
    } else if ( stuck.length > 0 ) {
        sections = stuck.map( ( one ) => ( { title: stuckTitle( one.kind, one.why ), notes: stuckSteps( one.kind, one.why ) } ) );
    } else {
        const both = asking.length > 1;
        const camera = asking[ 0 ] === 'camera';
        sections = [ {
            title: both ? _x( 'Allow your camera and microphone', 'Call Devices', 'bp-better-messages' )
                : camera ? _x( 'Allow your camera', 'Call Devices', 'bp-better-messages' )
                : _x( 'Allow your microphone', 'Call Devices', 'bp-better-messages' ),
            notes: [ both ? _x( 'Your browser will ask you. Nobody sees or hears you until you turn them on in the call.', 'Call Devices', 'bp-better-messages' )
                : camera ? _x( 'Your browser will ask you. Nobody sees you until you turn it on in the call.', 'Call Devices', 'bp-better-messages' )
                : _x( 'Your browser will ask you. Nobody hears you until you turn it on in the call.', 'Call Devices', 'bp-better-messages' ) ],
        } ];
    }
    const icon: IconName = stuck.length > 0 ? 'alert' : asking.includes( 'camera' ) ? 'video' : 'mic';

    return <div className="wplus-call-access" data-stuck={ stuck.length > 0 ? 1 : undefined } role="status">
        <span className="wplus-call-access-icon" aria-hidden="true"><Icon name={ icon } size={ 16 } /></span>
        <span className="wplus-call-access-text">
            { sections.map( ( section, i ) => <span key={ i } className="wplus-call-access-section">
                <span className="wplus-call-access-title">{ section.title }</span>
                { section.notes.map( ( note, j ) => <span key={ j } className="wplus-call-access-note">{ note }</span> ) }
            </span> ) }
            <span { ...pressable( () => { if ( ! trying ) request(); } ) } className="wplus-call-access-button" data-busy={ trying ? 1 : undefined }>
                { trying && <Icon name="spinner" size={ 13 } className="wplus-svg-animate" /> }
                <span>{ stuck.length > 0 ? _x( 'Try Again', 'Call Ask', 'bp-better-messages' ) : _x( 'Allow Access', 'Call Devices', 'bp-better-messages' ) }</span>
            </span>
        </span>
    </div>;
}

/**
 * Whether the browser blocks a device the user may send, for the mark on the dock's Configure, whose settings say what
 * to do about it. The camera only on a video call.
 */
export function useDevicesBlocked( video: boolean ): boolean {
    const camera = useDeviceAccess( 'camera' );
    const microphone = useDeviceAccess( 'microphone' );
    return microphone === 'blocked' || ( video && camera === 'blocked' );
}

/**
 * The user's device settings over the call, from the dock's Configure or the prompt of a join (JoinPrompt,
 * `devicesOnJoin`). Each device tries out on its own before it goes live, only for the user: the camera's Preview opens
 * a picture in its row, the microphone's Test a level, the speaker's Test plays a sound. Each then says in words whether
 * the others see or hear it, and lists its devices. Going live is the dock's camera and microphone alone: a button here
 * that sent them read as one more test. Nothing is opened before a press: `start`, the press that opened the panel, runs
 * the camera's preview, the microphone's test, or both from the start, asked of the browser together so it asks once.
 * `group`, a group call, live to everyone, whose microphone a moderator can hold. Else a call between two, live to the
 * other person, named. `children` go under the devices (a call between two puts its traffic there).
 *
 * A device the browser does not let the site use says so in place of its name, offers no list, no effects and no line
 * on who sees or hears it, and the card at the top (AccessCard) says how to allow it. One the browser refused at a
 * press here counts as blocked until the browser says it is allowed, as some browsers never say it is refused.
 */
export default function DevicePanel( { video, group = true, start, close, children }: {
    video: boolean,
    group?: boolean,
    start?: 'camera' | 'microphone' | 'both',
    close: () => void,
    children?: ReactNode,
} ) {
    const {
        thread,
        canPublish,
        myMicMuted,
        myCameraTrack,
        myMicrophoneTrack,
        activeCameraDevice,
        selectedCameraDevice,
        selectedMicrophoneDevice,
        selectedSpeakerDevice,
        setSelectedCameraDevice,
        setSelectedMicrophoneDevice,
        setSelectedSpeakerDevice,
        effects,
    } = useContext<CallContextInterface>( CallContext );

    const cameras = useCameras();
    const microphones = useMicrophones();
    const speakers = useSpeakers();
    const cameraRead = useDeviceAccess( 'camera' );
    const microphoneRead = useDeviceAccess( 'microphone' );
    // Why the browser last refused a device at a press here, until it gives it.
    const [ stuck, setStuck ] = useState<Partial<Record<Kind, Stuck>>>( {} );
    const settle = ( kind: Kind, why: Stuck | null ) => setStuck( ( was ) => ( was[ kind ] ?? null ) === why ? was : { ...was, [ kind ]: why ?? undefined } );
    const [ trying, setTrying ] = useState( false );
    const [ playing, setPlaying ] = useState( false );
    const [ testCamera, setTestCamera ] = useState( start === 'camera' );
    const [ testMicrophone, setTestMicrophone ] = useState( start === 'microphone' );
    const muted = useContext( MutedHintContext );

    const cameraOn = !! myCameraTrack;
    const microphoneOn = !! myMicrophoneTrack;
    const mayPublish = ! group || canPublish;
    const micHeld = group && myMicMuted;

    // What the browser says now, asked without a prompt: a device allowed or refused since the page loaded.
    useEffect( () => { void updateMediaPermissions(); }, [] );

    // Refused by the browser, or at a press here unless the browser has said since that it is allowed. A device the call
    // sends is never blocked.
    const refused = ( kind: Kind, read: string ) => read === 'blocked' || ( stuck[ kind ] === 'blocked' && mediaAccess.get( kind ) !== 'granted' );
    const cameraBlocked = ! cameraOn && refused( 'camera', cameraRead );
    const microphoneBlocked = ! microphoneOn && refused( 'microphone', microphoneRead );

    // A test opens only what the call does not send yet, and only once asked: a camera light that comes on by itself as
    // a call opens, or a prompt nobody asked for, is what people refuse.
    const cameraDevice = selectedCameraDevice || activeCameraDevice;
    const cameraTestable = video && ! cameraOn && ! cameraBlocked;
    const microphoneTestable = ! microphoneOn && ! microphoneBlocked && ! micHeld;

    // What the settings asked the browser for, each kind's to its own test, and all let go as the settings close.
    const [ seeds, setSeeds ] = useState<Partial<Record<Kind, MediaStream>>>( {} );
    const asked = useRef<MediaStream[]>( [] );
    const left = useRef( false );
    useEffect( () => {
        left.current = false;
        return () => {
            left.current = true;
            asked.current.forEach( ( stream ) => stream.getTracks().forEach( ( track ) => track.stop() ) );
        };
    }, [] );

    // These devices asked for in one request, so the browser asks once, each test then taking its own track of it: the
    // camera's preview and the microphone's level, Allow Access's answer. One the call sends meanwhile is let go at once.
    // Refused, each is blocked, the browser having refused them together, and no test asks again (the browser would
    // ask again, or refuse each alike); a missing or busy one is found by each test opening its own.
    const request = async ( kinds: Kind[] ) => {
        if ( kinds.length === 0 || typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) return;
        const device = ( id: string ) => id ? { deviceId: { ideal: id } } : true;
        const camera = kinds.includes( 'camera' );
        const microphone = kinds.includes( 'microphone' );
        let given = true;
        setTrying( true );
        try {
            const stream = await navigator.mediaDevices.getUserMedia( { audio: microphone ? device( selectedMicrophoneDevice ) : false, video: camera ? previewCamera( cameraDevice ) : false } );
            if ( left.current ) {
                stream.getTracks().forEach( ( track ) => track.stop() );
                return;
            }
            asked.current.push( stream );
            if ( cameraOn ) stream.getVideoTracks().forEach( ( track ) => track.stop() );
            if ( microphoneOn || micHeld ) stream.getAudioTracks().forEach( ( track ) => track.stop() );
            setSeeds( ( was ) => ( { ...was, ...( camera ? { camera: stream } : {} ), ...( microphone ? { microphone: stream } : {} ) } ) );
            kinds.forEach( ( kind ) => settle( kind, null ) );
        } catch ( error ) {
            const why = stuckBy( error );
            if ( why === 'blocked' || kinds.length === 1 ) {
                given = false;
                kinds.forEach( ( kind ) => settle( kind, why ) );
            }
        } finally {
            void updateMediaPermissions();
            if ( ! left.current ) setTrying( false );
        }
        if ( left.current || ! given ) return;
        if ( camera ) setTestCamera( true );
        if ( microphone ) setTestMicrophone( true );
    };

    // Both from the start (the join prompt's Preview): the camera and the microphone in one request.
    useEffect( () => { if ( start === 'both' ) void request( video ? [ 'camera', 'microphone' ] : [ 'microphone' ] ); }, [] );

    const cameraTest = usePrivateTest( 'video', testCamera && cameraTestable, cameraDevice, seeds.camera ?? null, ( why ) => settle( 'camera', why ) );
    const microphoneTest = usePrivateTest( 'audio', testMicrophone && microphoneTestable, selectedMicrophoneDevice, seeds.microphone ?? null, ( why ) => settle( 'microphone', why ) );

    // Allowed: the browser says so, or gave it here, or the call sends it.
    const cameraAllowed = cameraOn || !! cameraTest || ( ! cameraBlocked && cameraRead === 'allowed' );
    const microphoneAllowed = microphoneOn || !! microphoneTest || ( ! microphoneBlocked && microphoneRead === 'allowed' );

    // The card at the top, for the devices the user may send: someone who only watches has nothing to allow.
    const kinds: Kind[] = video ? [ 'camera', 'microphone' ] : [ 'microphone' ];
    const devices = {
        camera: { blocked: cameraBlocked, allowed: cameraAllowed, live: cameraOn || !! cameraTest },
        microphone: { blocked: microphoneBlocked, allowed: microphoneAllowed, live: microphoneOn || !! microphoneTest },
    };
    const problems = mayPublish ? kinds.flatMap( ( kind ) => {
        if ( devices[ kind ].blocked ) return [ { kind, why: 'blocked' as Stuck } ];
        const why = stuck[ kind ];
        return why && why !== 'blocked' && ! devices[ kind ].live ? [ { kind, why } ] : [];
    } ) : [];
    const asking = mayPublish ? kinds.filter( ( kind ) => ! devices[ kind ].allowed && ! problems.some( ( one ) => one.kind === kind ) ) : [];
    const unavailable = ( kind: Kind ) => devices[ kind ].blocked
        ? _x( 'Blocked', 'Call Devices', 'bp-better-messages' )
        : devices[ kind ].allowed ? undefined : _x( 'Not allowed yet', 'Call Devices', 'bp-better-messages' );

    // The effects, where the call puts them on what it sends (`effects`) and this browser runs them, and the tests
    // with them: the preview shows the background the others would see, and the microphone's test plays back what they
    // would hear. Only once the device is allowed: there is nothing to put them on before.
    const chosen = useEffectsChoice();
    const cameraEffects = video && !! effects && cameraAllowed && effectOffered( 'camera' );
    const noiseEffect = !! effects && microphoneAllowed && effectOffered( 'noise' );
    const cameraEffectState = useEffectState( 'camera' );
    const noiseEffectState = useEffectState( 'noise' );
    const rawCamera = cameraTest?.getTracks().find( ( track ) => track.kind === 'video' ) ?? null;
    const rawMicrophone = microphoneTest?.getTracks().find( ( track ) => track.kind === 'audio' ) ?? null;
    const backgroundsUnavailable = useCameraEffectsUnavailable();
    const shownCamera = useEffectTrack( 'camera', rawCamera, cameraEffects && ! backgroundsUnavailable ? cameraLook( chosen.camera ) : null );
    const testTrack = useEffectTrack( 'noise', rawMicrophone, noiseEffect && chosen.noise ? true : null );
    // The test as the microphone gives it, and with AI Noise Removal where it is on: Play Back plays the one, then the other.
    const recording = useTestRecording( rawMicrophone, testTrack && testTrack !== rawMicrophone ? testTrack : null, selectedSpeakerDevice );

    // The backgrounds made ready on this device while the settings offer them, so the first one chosen in the call goes
    // on at once, the page's freeze as its GPU programs compile taken here, where "Preparing backgrounds…" says so,
    // rather than on the call screen as the background goes on (warmEffects()). On a small picture of the engine's own:
    // no camera is opened for it and none waits for it.
    useEffect( () => cameraEffects ? warmEffects() : undefined, [ cameraEffects ] );

    // Gone live from the dock: the test is over, and does not open the device again once it is turned off.
    useEffect( () => { if ( cameraOn ) setTestCamera( false ); }, [ cameraOn ] );
    useEffect( () => { if ( microphoneOn ) setTestMicrophone( false ); }, [ microphoneOn ] );

    const level = useMicLevel( myMicrophoneTrack );
    const testLevel = useTrackLevel( testTrack );

    const box = useRef<HTMLDivElement>( null );
    const own = useRef<HTMLVideoElement>( null );
    const [ room, setRoom ] = useState<number | null>( null );

    // No taller than the stage above where it stands, scrolling past that: the stage of a call in a conversation is
    // shorter than the three devices with a preview. And under the card over the dock (a moderator's ask, the join's
    // notice), which stands at the top of the stage while these are open (_call-stage.scss): where, under the status
    // line where it shows, is said to it here (--wplus-call-prompt-top), and these end above its foot, so the two never
    // lie over each other. The REC pill is in the bar at the foot, not over the stage.
    const watch = useRef<ResizeObserver | null>( null );
    const watched = useRef<Element | null>( null );
    const fit = useRef( () => {} );
    fit.current = () => {
        const panel = box.current;
        const stage = panel?.closest<HTMLElement>( '.wplus-call-wrap' );
        if ( ! panel || ! stage ) return;

        const region = Array.from( stage.querySelectorAll<HTMLElement>( '.wplus-call-join-prompt-region' ) ).find( ( el ) => el.getClientRects().length > 0 );
        const card = region?.querySelector( '.wplus-call-join-prompt' ) ?? null;
        let ceiling = stage.getBoundingClientRect().top + 14;
        if ( region && card ) {
            const origin = ( region.offsetParent ?? stage ).getBoundingClientRect().top;
            const above = Array.from( stage.querySelectorAll( '.wplus-group-call-status' ) )
                .map( ( el ) => el.getBoundingClientRect() ).filter( ( rect ) => rect.height > 0 );
            const top = Math.max( 10, ...above.map( ( rect ) => Math.ceil( rect.bottom - origin + 8 ) ) ) + 'px';
            if ( stage.style.getPropertyValue( '--wplus-call-prompt-top' ) !== top ) stage.style.setProperty( '--wplus-call-prompt-top', top );
            ceiling = card.getBoundingClientRect().bottom + 10;
        }

        // The card changes size by itself too (a stuck device's steps): watched with the stage.
        if ( watch.current && watched.current !== card ) {
            if ( watched.current ) watch.current.unobserve( watched.current );
            if ( card ) watch.current.observe( card );
            watched.current = card;
        }
        setRoom( Math.max( 160, Math.floor( panel.getBoundingClientRect().bottom - ceiling ) ) );
    };

    // On every render, as a card comes or goes with the call, which draws these again; and as the stage or the card
    // changes size.
    useLayoutEffect( () => fit.current() );
    useLayoutEffect( () => {
        const stage = box.current?.closest<HTMLElement>( '.wplus-call-wrap' );
        if ( typeof ResizeObserver !== 'undefined' ) {
            watch.current = new ResizeObserver( () => fit.current() );
            if ( stage ) watch.current.observe( stage );
            fit.current();
        }
        return () => {
            watch.current?.disconnect();
            watch.current = null;
            watched.current = null;
            stage?.style.removeProperty( '--wplus-call-prompt-top' );
        };
    }, [] );

    useEffect( () => {
        if ( ! own.current ) return;
        own.current.srcObject = ! shownCamera ? null : shownCamera === rawCamera ? cameraTest : new MediaStream( [ shownCamera ] );
    }, [ shownCamera ] );

    // The camera the call sends, in its row, where the user hid their own tile (Hide Self View, layout-choice.tsx): there
    // is nowhere else to see it then. And while Effect Settings is open, as the settings may lie over the own tile and
    // each move of the tuning shows at once only on a picture in sight. The track the others get, its background effect
    // and all, not a test of the device.
    const { choice } = useContext( LayoutChoiceContext );
    const [ tuning, setTuning ] = useState( false );
    const sentShown = video && cameraOn && ( choice.hideSelf || tuning );
    const sent = useRef<HTMLVideoElement>( null );
    useEffect( () => {
        const element = sent.current;
        const track = myCameraTrack;
        if ( ! sentShown || ! element || ! track ) return;
        track.attach( element );
        return () => { track.detach( element ); };
    }, [ sentShown, myCameraTrack ] );

    const note = ( tone: string, icon: IconName, text: string ) => <span className="wplus-call-device-note" data-tone={ tone }>
        <Icon name={ icon } size={ 13 } />
        <span>{ text }</span>
    </span>;

    // Who is live to: everyone in a group call, the other person by name in a call between two, the host drawing the
    // name where the translation puts it.
    const peer = ! group ? thread?.participants?.[ 0 ] : undefined;
    const toPeer = ( text: string ) => {
        const [ before, after = '' ] = text.split( '%s' );
        return <>{ before }<UserName user_id={ peer! } link={ false } fromThread={ thread } />{ after }</>;
    };

    const cameraState: DeviceState = cameraOn
        ? { live: true, text: peer !== undefined ? toPeer( _x( '%s sees you', 'Call Devices', 'bp-better-messages' ) ) : _x( 'Everyone sees you', 'Call Devices', 'bp-better-messages' ) }
        : { live: false, text: _x( 'Nobody sees you', 'Call Devices', 'bp-better-messages' ) };

    let microphoneStatus: ReactNode = null;
    let microphoneState: DeviceState;
    if ( microphoneOn ) {
        microphoneStatus = <MicLevel level={ level } />;
        microphoneState = { live: true, text: peer !== undefined ? toPeer( _x( '%s hears you', 'Call Devices', 'bp-better-messages' ) ) : _x( 'Everyone hears you', 'Call Devices', 'bp-better-messages' ) };
    } else {
        // A blocked one is said in its row and in the card at the top.
        if ( testTrack ) {
            microphoneStatus = <span className="wplus-call-device-meter">
                <MicLevel level={ testLevel } />
                <span className="wplus-call-device-private">{ _x( 'Speak to test. Nobody hears it.', 'Call Devices', 'bp-better-messages' ) }</span>
                { ( recording.ready || recording.playing ) &&
                    <span { ...pressable( recording.play ) } className="wplus-call-device-playback" data-active={ recording.playing ? 1 : undefined }
                        data-part={ recording.playing ?? undefined }>
                        <Icon name="play" size={ 11 } />
                        <span>{ recording.playing === 'without' ? _x( 'Without AI Noise Removal', 'Call Devices', 'bp-better-messages' )
                            : recording.playing === 'with' ? _x( 'With AI Noise Removal', 'Call Devices', 'bp-better-messages' )
                            : recording.playing ? _x( 'Playing...', 'Call Devices', 'bp-better-messages' )
                            : _x( 'Play Back', 'Call Devices', 'bp-better-messages' ) }</span>
                    </span> }
            </span>;
        } else if ( micHeld && mayPublish ) {
            microphoneStatus = note( 'off', 'mute', _x( 'A moderator muted your microphone.', 'Call Moderation', 'bp-better-messages' ) );
        } else if ( muted?.talking ) {
            // The pill over the dock stays hidden while the devices lie over it: the row it is about says it instead.
            microphoneStatus = note( 'talking', 'micOff', _x( 'You are muted', 'Call Controls', 'bp-better-messages' ) );
        }
        microphoneState = { live: false, text: _x( 'Nobody hears you', 'Call Devices', 'bp-better-messages' ) };
    }

    const privatePreview = ! sentShown && !! ( testCamera && cameraTestable && cameraTest );
    const cameraPreview = sentShown
        ? <div className="wplus-call-device-preview" data-live="1">
            <video ref={ sent } autoPlay muted playsInline />
            <span className="wplus-call-devices-badge"><Icon name="users" size={ 12 } />{ _x( 'Everyone sees this', 'Call Devices', 'bp-better-messages' ) }</span>
        </div>
        : privatePreview &&
        <div className="wplus-call-device-preview">
            <video ref={ own } autoPlay muted playsInline />
            <span className="wplus-call-devices-badge"><Icon name="lock" size={ 12 } />{ _x( 'Only you see this', 'Call Devices', 'bp-better-messages' ) }</span>
        </div>;

    // While Effect Settings is open the picture stays at the top of the settings as they scroll, its sliders passing
    // under it, and the settings scroll to put it there as it opens (asked on 2026-11-02: "when I open effect settings I
    // do not see the video so I can see the changes live"). Not where the settings are too short to leave the sliders
    // room under it. Always in a holder of its own, so pinning it never draws the video again.
    const pinned = tuning && !! cameraPreview && ( room === null || room >= PIN_ROOM );
    const held = useRef<HTMLDivElement>( null );
    useLayoutEffect( () => {
        const panel = box.current;
        const holder = held.current;
        if ( ! pinned || ! panel || ! holder ) return;
        panel.scrollTop += holder.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    }, [ pinned ] );
    const preview = cameraPreview && <div ref={ held } className="wplus-call-device-preview-holder" data-pinned={ pinned ? 1 : undefined }>{ cameraPreview }</div>;

    const title = _x( 'Device Settings', 'Call Devices', 'bp-better-messages' );

    return <div ref={ box } className="wplus-call-settings wplus-call-devices" role="dialog" aria-label={ title }
        style={ room ? { maxHeight: room } : undefined }
        onKeyDown={ ( event ) => {
            if ( event.key !== 'Escape' ) return;
            event.stopPropagation();
            close();
        } }>
        <div className="wplus-call-devices-title">{ title }</div>

        {/* Refused, missing or busy first, with Try Again; then those never allowed yet, with Allow Access: a camera the
            user keeps blocked never hides the microphone's. */}
        { problems.length > 0 && <AccessCard asking={ [] } stuck={ problems } trying={ trying } request={ () => void request( problems.map( ( one ) => one.kind ) ) } /> }
        { asking.length > 0 && <AccessCard asking={ asking } stuck={ [] } trying={ trying } request={ () => void request( asking ) } /> }

        {/* "Nobody sees you" goes while the private preview runs, whose badge says it, and "Nobody hears you" while the
            microphone's test does: each was said twice. */}
        { video &&
            <DeviceRow kind="camera" icon={ cameraOn ? 'video' : 'videoOff' } label={ _x( 'Camera', 'Media Inputs', 'bp-better-messages' ) }
                devices={ cameras } selected={ activeCameraDevice } choose={ setSelectedCameraDevice }
                live={ cameraOn } state={ cameraAllowed && ! privatePreview ? cameraState : undefined } preview={ preview }
                effects={ cameraEffects && <BackgroundPicker state={ cameraEffectState } tuning={ setTuning } /> }
                unavailable={ unavailable( 'camera' ) }
                action={ cameraTestable && <TestButton running={ testCamera } toggle={ () => setTestCamera( ! testCamera ) } label={ _x( 'Preview', 'Call Devices', 'bp-better-messages' ) } /> } /> }

        <DeviceRow kind="microphone" icon={ microphoneOn ? 'mic' : 'micOff' } label={ _x( 'Microphone', 'Media Inputs', 'bp-better-messages' ) }
            devices={ microphones } selected={ selectedMicrophoneDevice } choose={ setSelectedMicrophoneDevice }
            live={ microphoneOn } state={ microphoneAllowed && ! testTrack ? microphoneState : undefined } status={ microphoneStatus }
            unavailable={ unavailable( 'microphone' ) }
            effects={ noiseEffect && <NoiseSwitch state={ noiseEffectState } /> }
            action={ microphoneTestable && <TestButton running={ testMicrophone } toggle={ () => setTestMicrophone( ! testMicrophone ) } /> } />

        <DeviceRow kind="speaker" icon="speaker" label={ _x( 'Speaker', 'Media Inputs', 'bp-better-messages' ) }
            devices={ speakers } selected={ selectedSpeakerDevice } choose={ setSelectedSpeakerDevice }
            action={ <TestButton running={ playing } toggle={ () => {
                if ( playing ) return;
                setPlaying( true );
                void testSound( selectedSpeakerDevice ).finally( () => setPlaying( false ) );
            } } /> } />

        { children }

        <span { ...pressable( close ) } className="wplus-call-devices-done">{ _x( 'Done', 'Call Devices', 'bp-better-messages' ) }</span>
    </div>;
}
