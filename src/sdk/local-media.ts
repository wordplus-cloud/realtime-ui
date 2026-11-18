import { useEffect, useRef, useState } from "react";
import useStateRef from "../inc/hooks/state-ref.ts";
import { updateMediaPermissions } from "../inc/calls/permissions.ts";
import { getPermissionFailure } from "../inc/device-error.ts";
import { _x } from "../inc/globals.ts";
import { host } from "../host.ts";
import { localTrack } from "./tracks.ts";
import type { SdkMediaSource } from "./types.ts";
import { chosenEffect, NOISE_WAIT_MS, TrackEffect, useEffectsChoice, warmNoise, type EffectKind } from "../inc/calls/effects.ts";
import { useOwnBackgroundsVersion } from "../inc/calls/own-backgrounds.ts";
import { CAMERA_CAPTURE, cameraConstraints } from "../inc/calls/camera-size.ts";

export type LocalTrack = ReturnType<typeof localTrack>;

// The size and frames a camera is opened at where the app says nothing (useLocalMedia asks cameraConstraints(), the
// device settings' preview too).
export const CAMERA_SIZE = { width: { ideal: CAMERA_CAPTURE.width }, height: { ideal: CAMERA_CAPTURE.height }, frameRate: { ideal: CAMERA_CAPTURE.frameRate } } as const;

/**
 * What this page sends in a call made with the SDK: its camera, microphone and screen, opened on the devices the call
 * screen's switches pick, each handed to the call (`send`) as it opens and taken back as it closes. Better Messages'
 * call container does the same with LiveKit's tracks; the SDK's calls take the browser's.
 */
export function useLocalMedia( send: ( source: SdkMediaSource, track: MediaStreamTrack | null ) => void | Promise<void> ) {
    const [ camera, setCamera, cameraRef ] = useStateRef<LocalTrack | null>( null );
    const [ microphone, setMicrophone, microphoneRef ] = useStateRef<LocalTrack | null>( null );
    const [ screen, setScreen, screenRef ] = useStateRef<LocalTrack | null>( null );
    const screenAudio = useRef<MediaStreamTrack | null>( null );

    const [ activeCameraDevice, setActiveCameraDevice ] = useState( '' );
    const [ selectedCameraDevice, setSelectedCameraDevice ] = useState( '' );
    const [ selectedMicrophoneDevice, setSelectedMicrophoneDevice ] = useState( '' );
    const [ selectedSpeakerDevice, setSelectedSpeakerDevice ] = useState( '' );
    const [ switchingCamera, setSwitchingCamera ] = useState( false );
    const facing = useRef<'user' | 'environment'>( 'user' );
    const opening = useRef( { camera: false, microphone: false, screen: false } );
    const ended = useRef( false );

    const failed = ( error: unknown, kind: 'camera' | 'microphone' ) => {
        host().showError( getPermissionFailure( error, kind === 'camera'
            ? _x( 'Camera', 'Media Inputs', 'bp-better-messages' )
            : _x( 'Microphone', 'Media Inputs', 'bp-better-messages' ) ) );
    };

    // What the devices give, under what is sent: with an effect on (the device settings' background or noise removal,
    // inc/calls/effects.ts) the call sends the effect's track, and turning a device off stops the device itself. A
    // camera with an effect goes out only once the effect is on, so the room it hides is never sent.
    const rawCamera = useRef<MediaStreamTrack | null>( null );
    const rawMicrophone = useRef<MediaStreamTrack | null>( null );
    const effects = useRef<Record<EffectKind, TrackEffect> | null>( null );
    const effectFailed = () => host().showError( _x( 'This effect could not start on this device.', 'Call Effects', 'bp-better-messages' ) );
    const effectOf = ( kind: EffectKind ) => {
        effects.current ??= { camera: new TrackEffect( 'camera', undefined, effectFailed ), noise: new TrackEffect( 'noise', undefined, effectFailed ) };
        return effects.current[ kind ];
    };
    const withEffect = async ( kind: EffectKind, raw: MediaStreamTrack ) => {
        const effect = effectOf( kind );
        await effect.set( raw, chosenEffect( kind ) );
        return effect.output ?? raw;
    };

    // What the browser is asked for: the device picked in the switches, else the camera facing the user and the default
    // microphone; a camera at up to 1080p and 30 frames, as Better Messages' call opens one (tracks.ts, LiveKit's
    // h1080), which the call's encoder lowers where it can't keep up (realtime-client's fitCameraTrack), or the app's
    // own size (UiHost.cameraSize), as the device settings' preview asks it. Asked for no size, Chrome opens 640x480,
    // and the SDK's calls went out at 480p (the review after the move to the mesh, 2026-10-21).
    const constraints = ( kind: 'camera' | 'microphone' ): MediaTrackConstraints | true => {
        const device = kind === 'camera' ? selectedCameraDevice : selectedMicrophoneDevice;
        if ( kind === 'microphone' ) return device ? { deviceId: { exact: device } } : true;
        return { ...( device ? { deviceId: { exact: device } } : { facingMode: facing.current } ), ...cameraConstraints() };
    };

    const open = async ( kind: 'camera' | 'microphone' ): Promise<MediaStreamTrack> => {
        const stream = await navigator.mediaDevices.getUserMedia( kind === 'camera'
            ? { video: constraints( 'camera' ) }
            : { audio: constraints( 'microphone' ) } );
        return stream.getTracks()[ 0 ];
    };

    // A track opened, handed to the call, unless the call ended meanwhile.
    const takeCamera = async ( track: MediaStreamTrack ) => {
        if ( ended.current ) return void track.stop();
        rawCamera.current = track;
        setActiveCameraDevice( track.getSettings().deviceId ?? '' );
        const sent = await withEffect( 'camera', track );
        // Turned off, or the call over, while the effect started.
        if ( rawCamera.current !== track || ended.current ) return;
        setCamera( localTrack( sent ) );
        await send( 'camera', sent );
    };

    // AI Noise Removal is waited for NOISE_WAIT_MS at most: with its files still on their way (the first time on a
    // browser) the call takes the microphone as it hears, and the noise removal's track takes its place once it is on,
    // as one turned on during the call does (swapEffect).
    const takeMicrophone = async ( track: MediaStreamTrack ) => {
        if ( ended.current ) return void track.stop();
        rawMicrophone.current = track;
        const effect = withEffect( 'noise', track );
        const sent = await Promise.race( [ effect, new Promise<null>( ( late ) => setTimeout( late, NOISE_WAIT_MS, null ) ) ] );
        if ( rawMicrophone.current !== track || ended.current ) return;
        setMicrophone( localTrack( sent ?? track ) );
        await send( 'microphone', sent ?? track );
        if ( ! sent ) void effect.then( () => swapEffect( 'noise' ) );
    };

    const enableCamera = async () => {
        if ( cameraRef.current || opening.current.camera || ended.current ) return;
        opening.current.camera = true;
        try {
            await takeCamera( await open( 'camera' ) );
        } catch ( error ) {
            failed( error, 'camera' );
        } finally {
            opening.current.camera = false;
            void updateMediaPermissions();
        }
    };

    const disableCamera = async () => {
        const current = cameraRef.current;
        const raw = rawCamera.current;
        rawCamera.current = null;
        raw?.stop();
        void effectOf( 'camera' ).set( null, null );
        if ( ! current ) return;
        current.track.stop();
        setCamera( null );
        await send( 'camera', null );
    };

    const enableMic = async () => {
        if ( microphoneRef.current || opening.current.microphone || ended.current ) return;
        opening.current.microphone = true;
        try {
            await takeMicrophone( await open( 'microphone' ) );
        } catch ( error ) {
            failed( error, 'microphone' );
        } finally {
            opening.current.microphone = false;
            void updateMediaPermissions();
        }
    };

    /**
     * The microphone and the camera together, as a video call starts: one request, so the browser asks once for both.
     * Refused, it says so once and asks no more: the call's switches ask for either again. When it can't be met
     * otherwise (no camera, say), each is asked for alone, and says what went wrong with it.
     */
    const enableMicAndCamera = async () => {
        const busy = opening.current.microphone || opening.current.camera;
        if ( busy || microphoneRef.current || cameraRef.current || ended.current ) {
            await Promise.all( [ enableMic(), enableCamera() ] );
            return;
        }
        opening.current.microphone = opening.current.camera = true;
        let stream: MediaStream | null = null;
        let refused = false;
        try {
            stream = await navigator.mediaDevices.getUserMedia( { audio: constraints( 'microphone' ), video: constraints( 'camera' ) } );
        } catch ( error ) {
            const name = ( error as { name?: string } | null )?.name;
            refused = name === 'NotAllowedError' || name === 'PermissionDeniedError';
            if ( refused ) host().showError( getPermissionFailure( error ) );
        } finally {
            opening.current.microphone = opening.current.camera = false;
            void updateMediaPermissions();
        }
        if ( refused ) return;
        if ( ! stream ) {
            await enableMic();
            await enableCamera();
            return;
        }
        // A track the stream came without is asked for alone.
        const [ microphone ] = stream.getAudioTracks();
        const [ camera ] = stream.getVideoTracks();
        await ( microphone ? takeMicrophone( microphone ).catch( ( error ) => failed( error, 'microphone' ) ) : enableMic() );
        await ( camera ? takeCamera( camera ).catch( ( error ) => failed( error, 'camera' ) ) : enableCamera() );
    };

    const disableMic = async () => {
        const current = microphoneRef.current;
        const raw = rawMicrophone.current;
        rawMicrophone.current = null;
        raw?.stop();
        void effectOf( 'noise' ).set( null, null );
        if ( ! current ) return;
        current.track.stop();
        setMicrophone( null );
        await send( 'microphone', null );
    };

    // An effect turned on, off or changed in the device settings during the call: what goes out is swapped for the
    // device's track with the new effect, the device kept as it is. A picture of the person's own the same, once the
    // browser has read it.
    const chosen = useEffectsChoice();
    const own = useOwnBackgroundsVersion();
    const swapEffect = async ( kind: EffectKind ) => {
        const raw = ( kind === 'camera' ? rawCamera : rawMicrophone ).current;
        if ( ! raw ) return;
        const sent = await withEffect( kind, raw );
        const held = kind === 'camera' ? cameraRef : microphoneRef;
        if ( ( kind === 'camera' ? rawCamera : rawMicrophone ).current !== raw || held.current?.track === sent || ended.current ) return;
        ( kind === 'camera' ? setCamera : setMicrophone )( localTrack( sent ) );
        await send( kind === 'camera' ? 'camera' : 'microphone', sent );
    };
    useEffect( () => void swapEffect( 'camera' ), [ chosen.camera, chosen.camera.startsWith( 'own:' ) ? own : 0 ] );
    useEffect( () => void swapEffect( 'noise' ), [ chosen.noise ] );
    // AI Noise Removal's files, read ahead of the microphone as the call's screen opens for someone who has it on.
    useEffect( () => warmNoise(), [ chosen.noise ] );

    const disableShareScreen = async () => {
        const current = screenRef.current;
        if ( current ) {
            current.track.stop();
            setScreen( null );
            await send( 'screen_share', null );
        }
        if ( screenAudio.current ) {
            screenAudio.current.stop();
            screenAudio.current = null;
            await send( 'screen_share_audio', null );
        }
    };

    const enableShareScreen = async () => {
        if ( screenRef.current || opening.current.screen || ended.current ) return;
        opening.current.screen = true;
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia( { video: true, audio: true } );
            const video = stream.getVideoTracks()[ 0 ];
            const audio = stream.getAudioTracks()[ 0 ] ?? null;
            if ( ended.current ) return void stream.getTracks().forEach( ( track ) => track.stop() );
            // The browser's own "Stop sharing" ends it too.
            video.addEventListener( 'ended', () => void disableShareScreen() );
            setScreen( localTrack( video ) );
            await send( 'screen_share', video );
            if ( audio ) {
                screenAudio.current = audio;
                await send( 'screen_share_audio', audio );
            }
        } catch {
            // Picking nothing is not an error.
        } finally {
            opening.current.screen = false;
        }
    };

    const switchCamera = async () => {
        setSwitchingCamera( true );
        facing.current = facing.current === 'user' ? 'environment' : 'user';
        setSelectedCameraDevice( '' );
        setActiveCameraDevice( '' );
        try {
            await disableCamera();
            await enableCamera();
        } finally {
            setSwitchingCamera( false );
        }
    };

    // A device picked in the call screen's switches: opened in place of the one before, while that one is on.
    const reopen = async ( kind: 'camera' | 'microphone' ) => {
        if ( kind === 'camera' && cameraRef.current ) {
            await disableCamera();
            await enableCamera();
        }
        if ( kind === 'microphone' && microphoneRef.current ) {
            await disableMic();
            await enableMic();
        }
    };

    const firstCamera = useRef( true );
    useEffect( () => {
        if ( firstCamera.current ) return void ( firstCamera.current = false );
        void reopen( 'camera' );
    }, [ selectedCameraDevice ] );

    const firstMicrophone = useRef( true );
    useEffect( () => {
        if ( firstMicrophone.current ) return void ( firstMicrophone.current = false );
        void reopen( 'microphone' );
    }, [ selectedMicrophoneDevice ] );

    /** Stops everything this page sends, for good: the call is over. */
    const stopAll = () => {
        ended.current = true;
        for ( const held of [ cameraRef.current, microphoneRef.current, screenRef.current ] ) held?.track.stop();
        rawCamera.current?.stop();
        rawMicrophone.current?.stop();
        screenAudio.current?.stop();
        void effects.current?.camera.dispose();
        void effects.current?.noise.dispose();
        effects.current = null;
    };

    // Mounted again after React's Strict Mode rehearses an unmount (a Next.js or Vite app in development): the call is
    // still on, and what was opening before the rehearsal is handed to the call once it opens.
    useEffect( () => {
        ended.current = false;
        return () => stopAll();
    }, [] );

    return {
        camera, cameraRef, microphone, microphoneRef, screen, screenRef,
        activeCameraDevice, setActiveCameraDevice, selectedCameraDevice, setSelectedCameraDevice,
        selectedMicrophoneDevice, setSelectedMicrophoneDevice, selectedSpeakerDevice, setSelectedSpeakerDevice,
        switchingCamera, switchCamera, enableCamera, disableCamera, enableMic, disableMic, enableMicAndCamera, enableShareScreen,
        disableShareScreen, stopAll,
    };
}
