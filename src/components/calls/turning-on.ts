import { useEffect, useMemo, useRef, useState } from "react";
import type { CallContextInterface } from "./context.ts";

type Device = 'camera' | 'microphone';

/**
 * The call with its camera and microphone said to be turning on from a press until the call has the track: the dock,
 * a key, a moderator's ask and the picture-in-picture window all press through `enableCamera` and `enableMic`, and the
 * control spins meanwhile, as a room's controls do while their request is out. Opening a device is a real wait, and with
 * a background or the noise removal chosen the call waits for the effect to start too (inc/calls/effects.ts), the first
 * time after the page loads seconds of its files: a control that kept its glyph that long read as a press that did
 * nothing. A press while one is out is the host's to turn away, as it does; the spin holds until the last one ends. What
 * the host says itself (`cameraTurningOn`, `microphoneTurningOn`) spins it too.
 */
export function useTurningOn( call: CallContextInterface ): CallContextInterface {
    const [ out, setOut ] = useState<Record<Device, number>>( { camera: 0, microphone: 0 } );
    const mounted = useRef( true );
    useEffect( () => {
        mounted.current = true;
        return () => void ( mounted.current = false );
    }, [] );

    return useMemo( () => {
        const count = ( device: Device, by: number ) => {
            if ( mounted.current ) setOut( ( was ) => ( { ...was, [ device ]: Math.max( 0, was[ device ] + by ) } ) );
        };
        const pressed = ( device: Device, enable: () => Promise<void> ) => async () => {
            count( device, 1 );
            try {
                return await enable();
            } finally {
                count( device, -1 );
            }
        };

        return {
            ...call,
            enableCamera: pressed( 'camera', call.enableCamera ),
            enableMic: pressed( 'microphone', call.enableMic ),
            // Once the track is there the control is the one that turns it off: its own press, never this one's spin.
            cameraTurningOn: ! call.myCameraTrack && ( out.camera > 0 || !! call.cameraTurningOn ),
            microphoneTurningOn: ! call.myMicrophoneTrack && ( out.microphone > 0 || !! call.microphoneTurningOn ),
        };
    }, [ call, out.camera, out.microphone ] );
}
