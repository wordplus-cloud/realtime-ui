import React, { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallTrack } from "./context.ts";
import Icon, { type IconName } from "../../primitives/icon.tsx";
import { readLevel } from "../../inc/calls/mic-level.ts";
import pressable from "./pressable.ts";
import { MutedHintContext } from "./muted-hint.tsx";
import UserName from "../users/user-name.tsx";
import {
    mediaAccess,
    mediaUpdatedSubject,
    updateMediaPermissions,
    useCameras,
    useMicrophones,
    useSpeakers
} from "../../inc/calls/permissions.ts";

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
 * Whether the browser refuses the page this device, as it last said. Read again as it starts listening, as
 * useMicrophoneAllowed is (muted-hint.tsx).
 */
function useBlocked( kind: 'camera' | 'microphone' ): boolean {
    const read = () => mediaAccess.get( kind ) === 'denied';
    const [ blocked, setBlocked ] = useState( read );

    useEffect( () => {
        const update = () => setBlocked( read() );
        const sub = mediaUpdatedSubject.subscribe( { next: update } );
        update();
        return () => sub.unsubscribe();
    }, [ kind ] );

    return blocked;
}

/**
 * One device's test, only the user's: the camera or the microphone opened here while `wanted` and never published,
 * each on its own, so testing one never starts the other. `seed`, a stream that asked for both at once (one prompt),
 * gives the first test its track of this kind instead of asking again. It goes once the call sends that device itself,
 * and when the panel closes, letting go only of its own kind in a stream it shares.
 */
function usePrivateTest( kind: 'audio' | 'video', wanted: boolean, deviceId: string, seed: MediaStream | null = null ): MediaStream | null {
    const [ stream, setStream ] = useState<MediaStream | null>( null );
    const open = useRef<MediaStream | null>( null );
    const seeded = useRef( false );

    useEffect( () => {
        if ( ! wanted || typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) return;
        let left = false;
        const device = deviceId ? { deviceId: { ideal: deviceId } } : true;
        const stop = () => {
            open.current?.getTracks().forEach( ( track ) => { if ( track.kind === kind ) track.stop(); } );
            open.current = null;
            setStream( null );
        };

        if ( ! seeded.current && seed?.getTracks().some( ( track ) => track.kind === kind && track.readyState !== 'ended' ) ) {
            seeded.current = true;
            open.current = seed;
            setStream( seed );
            return stop;
        }

        navigator.mediaDevices.getUserMedia( kind === 'audio' ? { audio: device, video: false } : { audio: false, video: device } ).then( ( got ) => {
            if ( left ) {
                got.getTracks().forEach( ( track ) => track.stop() );
                return;
            }
            open.current = got;
            setStream( got );
        } ).catch( () => null ).finally( () => { void updateMediaPermissions(); } );

        return () => {
            left = true;
            stop();
        };
    }, [ kind, wanted, deviceId, seed ] );

    return stream;
}

// How long the prompt of a join stands before it goes by itself.
export const JOIN_PROMPT_MS = 10000;

/**
 * Whether to tell the user, as a group call is first joined, that their microphone and camera are off, where the
 * context asks for it (`devicesOnJoin`) and the user may send: someone who only watches has nothing to turn on. It goes
 * after JOIN_PROMPT_MS, once either is turned on, once the devices open, or on the second value. A reconnect is not a
 * join.
 */
export function useJoinPrompt( devicesOpen: boolean ): [ boolean, () => void ] {
    const { devicesOnJoin, connectionState, canPublish, myCameraTrack, myMicrophoneTrack } = useContext<CallContextInterface>( CallContext );
    const joined = useRef( false );
    const [ shown, setShown ] = useState( false );

    useEffect( () => {
        if ( joined.current || connectionState !== 'connected' ) return;
        joined.current = true;
        if ( devicesOnJoin && canPublish && ! myCameraTrack && ! myMicrophoneTrack ) setShown( true );
    }, [ connectionState ] );

    useEffect( () => {
        if ( ! shown ) return;
        const timer = setTimeout( () => setShown( false ), JOIN_PROMPT_MS );
        return () => clearTimeout( timer );
    }, [ shown ] );

    const over = devicesOpen || !! myCameraTrack || !! myMicrophoneTrack || ! canPublish || connectionState === 'disconnected';
    useEffect( () => {
        if ( over ) setShown( false );
    }, [ over ] );

    return [ shown && ! over, () => setShown( false ) ];
}

/**
 * The prompt of a join, a card over the dock: the microphone, and on a video call the camera, are off, and the buttons
 * below turn them on, with Preview, or Test Microphone on an audio call, which opens the device settings with it running
 * (`preview`), and a ×. It covers nothing of the call and opens nothing by itself.
 */
export function JoinPrompt( { video, preview, dismiss }: { video: boolean, preview: () => void, dismiss: () => void } ) {
    return <div className="wplus-call-join-prompt-region" role="status">
        <div className="wplus-call-join-prompt">
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name="micOff" size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ video
                    ? _x( 'Microphone and camera are off', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Microphone is off', 'Call Devices', 'bp-better-messages' ) }</span>
                <span className="wplus-call-join-prompt-note">{ video
                    ? _x( 'Turn them on with the buttons below when you are ready.', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Turn it on with the button below when you are ready.', 'Call Devices', 'bp-better-messages' ) }</span>
            </span>
            <span { ...pressable( preview ) } className="wplus-call-join-prompt-preview">{ video
                ? _x( 'Preview', 'Call Devices', 'bp-better-messages' )
                : _x( 'Test Microphone', 'Call Devices', 'bp-better-messages' ) }</span>
            <span { ...pressable( dismiss ) } className="wplus-call-join-prompt-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                <Icon name="x" size={ 14 } />
            </span>
        </div>
    </div>;
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
 * One device: its glyph on a tile, its name and the device in use, which opens the list of the others, a line under it
 * (the microphone's level, or why it is off), its test on the end of the row, the camera's private preview while it is
 * tested, and the line that says whether the others see or hear it.
 */
function DeviceRow( { kind, icon, label, devices, selected, choose, open, setOpen, live, status, preview, state, action }: {
    kind: 'camera' | 'microphone' | 'speaker',
    icon: IconName,
    label: string,
    devices: Map<string, MediaDeviceInfo>,
    selected: string,
    choose: ( id: string ) => void,
    open: boolean,
    setOpen: ( open: boolean ) => void,
    live?: boolean,
    status?: ReactNode,
    preview?: ReactNode,
    state?: DeviceState,
    action?: ReactNode,
} ) {
    const list = choices( devices, label );
    const current = selected || ( devices.has( 'default' ) ? 'default' : '' );
    const shown = list.find( ( choice ) => choice.id === current ) ?? list[ 0 ];
    const pickable = devices.size > 0;

    return <div className="wplus-call-device" data-kind={ kind } data-on={ live ? 1 : undefined } data-open={ open ? 1 : undefined }>
        <div className="wplus-call-device-head">
            <span className="wplus-call-device-icon" aria-hidden="true"><Icon name={ icon } size={ 18 } /></span>
            <span className="wplus-call-device-text">
                <span className="wplus-call-device-label">{ label }</span>
                { pickable
                    ? <span { ...pressable( () => setOpen( ! open ) ) } className="wplus-call-device-current" aria-expanded={ open } aria-haspopup="listbox">
                        <span className="wplus-call-device-name">{ shown?.label }</span>
                        <Icon name="chevronD" size={ 14 } />
                    </span>
                    : <span className="wplus-call-device-current" data-fixed="1"><span className="wplus-call-device-name">{ shown?.label }</span></span> }
                { status }
            </span>
            { action }
        </div>
        { preview }
        { state &&
            <div className="wplus-call-device-state" data-live={ state.live ? 1 : undefined }>
                <span className="wplus-call-device-status">
                    <i className="wplus-call-device-dot" aria-hidden="true" />
                    { state.live && <span className="wplus-call-device-live">{ _x( 'Live', 'Call Devices', 'bp-better-messages' ) }</span> }
                    <span>{ state.text }</span>
                </span>
            </div> }
        { ( open && pickable ) &&
            <div className="wplus-call-device-list" role="listbox" aria-label={ label }>
                { list.map( ( choice ) =>
                    <span key={ choice.id || 'none' } { ...pressable( () => { choose( choice.id ); setOpen( false ); } ) } role="option"
                        aria-selected={ choice.id === current } className="wplus-call-device-choice">
                        <span className="wplus-call-device-check" aria-hidden="true">{ choice.id === current && <Icon name="check" size={ 14 } /> }</span>
                        <span className="wplus-call-device-name">{ choice.label }</span>
                    </span>
                ) }
            </div> }
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
 * The user's device settings over the call, from the dock's Configure or the prompt of a join (JoinPrompt,
 * `devicesOnJoin`). Each device tries out on its own before it goes live, only for the user: the camera's Preview opens
 * a picture in its row, the microphone's Test a level, the speaker's Test plays a sound. Each then says in words whether
 * the others see or hear it, and lists its devices. Going live is the dock's camera and microphone alone: a button here
 * that sent them read as one more test. Nothing is opened before a press: `start`, the press that opened the panel, runs
 * the camera's preview, the microphone's test, or both from the start, asked of the browser together so it asks once.
 * `group`, a group call, live to everyone, whose microphone a moderator can hold. Else a call between two, live to the
 * other person, named. `children` go under the devices (a call between two puts its traffic there).
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
    } = useContext<CallContextInterface>( CallContext );

    const cameras = useCameras();
    const microphones = useMicrophones();
    const speakers = useSpeakers();
    const cameraBlocked = useBlocked( 'camera' );
    const microphoneBlocked = useBlocked( 'microphone' );
    const [ listed, setListed ] = useState<'camera' | 'microphone' | 'speaker' | null>( null );
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

    // A test opens only what the call does not send yet, and only once asked: a camera light that comes on by itself as
    // a call opens, or a prompt nobody asked for, is what people refuse.
    const cameraDevice = selectedCameraDevice || activeCameraDevice;
    const cameraTestable = video && ! cameraOn && ! cameraBlocked;
    const microphoneTestable = ! microphoneOn && ! microphoneBlocked && ! micHeld;
    // Both from the start: the camera and the microphone asked for in one request, so the browser asks once, and each
    // test then takes its own track of it. A kind that cannot be tested here is let go at once.
    const [ seed, setSeed ] = useState<MediaStream | null>( null );
    useEffect( () => {
        if ( start !== 'both' || typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) return;
        let left = false;
        let got: MediaStream | null = null;
        const device = ( id: string ) => id ? { deviceId: { ideal: id } } : true;

        navigator.mediaDevices.getUserMedia( { audio: device( selectedMicrophoneDevice ), video: device( cameraDevice ) } ).then( ( stream ) => {
            if ( left ) {
                stream.getTracks().forEach( ( track ) => track.stop() );
                return;
            }
            got = stream;
            if ( ! cameraTestable ) stream.getVideoTracks().forEach( ( track ) => track.stop() );
            if ( ! microphoneTestable ) stream.getAudioTracks().forEach( ( track ) => track.stop() );
            setSeed( stream );
        } ).catch( () => null ).finally( () => {
            void updateMediaPermissions();
            if ( left ) return;
            setTestCamera( true );
            setTestMicrophone( true );
        } );

        return () => {
            left = true;
            got?.getTracks().forEach( ( track ) => track.stop() );
        };
    }, [] );

    const cameraTest = usePrivateTest( 'video', testCamera && cameraTestable, cameraDevice, seed );
    const microphoneTest = usePrivateTest( 'audio', testMicrophone && microphoneTestable, selectedMicrophoneDevice, seed );
    const testTrack = microphoneTest?.getAudioTracks()[ 0 ] ?? null;

    // Gone live from the dock: the test is over, and does not open the device again once it is turned off.
    useEffect( () => { if ( cameraOn ) setTestCamera( false ); }, [ cameraOn ] );
    useEffect( () => { if ( microphoneOn ) setTestMicrophone( false ); }, [ microphoneOn ] );

    const level = useMicLevel( myMicrophoneTrack );
    const testLevel = useTrackLevel( testTrack );

    const box = useRef<HTMLDivElement>( null );
    const own = useRef<HTMLVideoElement>( null );
    const [ room, setRoom ] = useState<number | null>( null );

    // No taller than the stage above where it stands, scrolling past that: the stage of a call in a conversation is
    // shorter than the three devices with a preview.
    useLayoutEffect( () => {
        const panel = box.current;
        const stage = panel?.closest( '.wplus-call-wrap' );
        if ( ! panel || ! stage ) return;

        const fit = () => setRoom( Math.max( 160, Math.floor( panel.getBoundingClientRect().bottom - stage.getBoundingClientRect().top - 14 ) ) );
        fit();

        if ( typeof ResizeObserver === 'undefined' ) return;
        const watch = new ResizeObserver( fit );
        watch.observe( stage );
        return () => watch.disconnect();
    }, [] );

    useEffect( () => {
        if ( own.current ) own.current.srcObject = cameraTest;
    }, [ cameraTest ] );

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
        if ( microphoneBlocked ) {
            microphoneStatus = note( 'warning', 'alert', _x( 'The browser blocks your microphone. Allow it in the site settings to turn it on.', 'Call Devices', 'bp-better-messages' ) );
        } else if ( testTrack ) {
            microphoneStatus = <span className="wplus-call-device-meter">
                <MicLevel level={ testLevel } />
                <span className="wplus-call-device-private">{ _x( 'Speak to test. Nobody hears it.', 'Call Devices', 'bp-better-messages' ) }</span>
            </span>;
        } else if ( micHeld && mayPublish ) {
            microphoneStatus = note( 'off', 'mute', _x( 'A moderator muted your microphone.', 'Call Moderation', 'bp-better-messages' ) );
        } else if ( muted?.talking ) {
            // The pill over the dock stays hidden while the devices lie over it: the row it is about says it instead.
            microphoneStatus = note( 'talking', 'micOff', _x( 'You are muted', 'Call Controls', 'bp-better-messages' ) );
        }
        microphoneState = { live: false, text: _x( 'Nobody hears you', 'Call Devices', 'bp-better-messages' ) };
    }

    const cameraPreview = ( testCamera && cameraTestable && cameraTest ) &&
        <div className="wplus-call-device-preview">
            <video ref={ own } autoPlay muted playsInline />
            <span className="wplus-call-devices-badge"><Icon name="lock" size={ 12 } />{ _x( 'Only you see this', 'Call Devices', 'bp-better-messages' ) }</span>
        </div>;

    const title = _x( 'Device Settings', 'Call Devices', 'bp-better-messages' );

    return <div ref={ box } className="wplus-call-settings wplus-call-devices" role="dialog" aria-label={ title }
        style={ room ? { maxHeight: room } : undefined }
        onKeyDown={ ( event ) => {
            if ( event.key !== 'Escape' ) return;
            event.stopPropagation();
            close();
        } }>
        <div className="wplus-call-devices-title">{ title }</div>

        { video &&
            <DeviceRow kind="camera" icon={ cameraOn ? 'video' : 'videoOff' } label={ _x( 'Camera', 'Media Inputs', 'bp-better-messages' ) }
                devices={ cameras } selected={ activeCameraDevice } choose={ setSelectedCameraDevice }
                open={ listed === 'camera' } setOpen={ ( open ) => setListed( open ? 'camera' : null ) }
                live={ cameraOn } state={ cameraState } preview={ cameraPreview }
                status={ cameraBlocked ? note( 'warning', 'alert', _x( 'The browser blocks your camera. Allow it in the site settings to turn it on.', 'Call Devices', 'bp-better-messages' ) ) : undefined }
                action={ cameraTestable && <TestButton running={ testCamera } toggle={ () => setTestCamera( ! testCamera ) } label={ _x( 'Preview', 'Call Devices', 'bp-better-messages' ) } /> } /> }

        <DeviceRow kind="microphone" icon={ microphoneOn ? 'mic' : 'micOff' } label={ _x( 'Microphone', 'Media Inputs', 'bp-better-messages' ) }
            devices={ microphones } selected={ selectedMicrophoneDevice } choose={ setSelectedMicrophoneDevice }
            open={ listed === 'microphone' } setOpen={ ( open ) => setListed( open ? 'microphone' : null ) }
            live={ microphoneOn } state={ microphoneState } status={ microphoneStatus }
            action={ microphoneTestable && <TestButton running={ testMicrophone } toggle={ () => setTestMicrophone( ! testMicrophone ) } /> } />

        <DeviceRow kind="speaker" icon="speaker" label={ _x( 'Speaker', 'Media Inputs', 'bp-better-messages' ) }
            devices={ speakers } selected={ selectedSpeakerDevice } choose={ setSelectedSpeakerDevice }
            open={ listed === 'speaker' } setOpen={ ( open ) => setListed( open ? 'speaker' : null ) }
            action={ <TestButton running={ playing } toggle={ () => {
                if ( playing ) return;
                setPlaying( true );
                void testSound( selectedSpeakerDevice ).finally( () => setPlaying( false ) );
            } } /> } />

        { children }

        <span { ...pressable( close ) } className="wplus-call-devices-done">{ _x( 'Done', 'Call Devices', 'bp-better-messages' ) }</span>
    </div>;
}
