import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { _x } from "../../inc/globals.ts";
import Icon from "../../primitives/icon.tsx";
import { CallContext, type CallContextInterface } from "./context.ts";
import type { CallLayout } from "./call-screen.tsx";
import { mediaPreauthorized, mediaUpdatedSubject } from "../../inc/calls/permissions.ts";
import { readLevel } from "../../inc/calls/mic-level.ts";
import pressable from "./pressable.ts";

// What counts as the user talking: a reading over 0.45 on the scale of mic-level.ts (about -37 dB, a voice at a laptop's
// microphone and well over a quiet room) for half of the last second, so a cough, a door or a key pressed does not.
// Once said, it stays until four seconds after the last of it.
const SPEECH_LEVEL = 0.45;
const SPEECH_WINDOW = 20;
const SPEECH_READINGS = 10;
export const MUTED_HINT_HOLD_MS = 4000;

/**
 * Whether the user is talking with their microphone muted, from its level readings as they come (twenty a second). A
 * reading taken while someone else in the call speaks does not count: their voice from the speakers is not the user's.
 */
export class MutedSpeech {
    private readings: boolean[] = [];
    private lastSpeech = 0;
    talking = false;

    reading( level: number, othersSpeaking: boolean, now: number ): boolean {
        this.readings.push( level >= SPEECH_LEVEL && ! othersSpeaking );
        if ( this.readings.length > SPEECH_WINDOW ) this.readings.shift();

        if ( this.readings.filter( Boolean ).length >= SPEECH_READINGS ) {
            this.lastSpeech = now;
            this.talking = true;
        } else if ( this.talking && now - this.lastSpeech > MUTED_HINT_HOLD_MS ) {
            this.talking = false;
        }

        return this.talking;
    }
}

/**
 * Whether the browser has already allowed the page a microphone, so opening one puts up no prompt. Read again as it
 * starts listening: the permissions read when the page loads can land between the first draw and the subscription,
 * and the hint then never opened a microphone the browser had long allowed.
 */
function useMicrophoneAllowed(): boolean {
    const [ allowed, setAllowed ] = useState( () => mediaPreauthorized( 'microphone' ) );

    useEffect( () => {
        const read = () => setAllowed( mediaPreauthorized( 'microphone' ) );
        const sub = mediaUpdatedSubject.subscribe( { next: read } );
        read();
        return () => sub.unsubscribe();
    }, [] );

    return allowed;
}

/**
 * A microphone of its own while `listening`, only measured, and whether the user is talking into it. The second value
 * lets go of it at once, before the call opens its own.
 */
function useMutedSpeech( listening: boolean, deviceId: string, othersSpeaking: { current: boolean } ): [ boolean, () => void ] {
    const [ talking, setTalking ] = useState( false );
    const release = useRef<() => void>( () => {} );

    useEffect( () => {
        if ( ! listening || ! navigator.mediaDevices?.getUserMedia ) return;

        let ended = false;
        let stream: MediaStream | null = null;
        let stopReading = () => {};
        const speech = new MutedSpeech();

        const end = () => {
            if ( ended ) return;
            ended = true;
            stopReading();
            stream?.getTracks().forEach( ( track ) => track.stop() );
            setTalking( false );
        };
        release.current = end;

        // The device the call uses, processed as the call's is (the browser's echo cancelling and noise suppression),
        // so the others in the call and a quiet room stay under the level that counts.
        navigator.mediaDevices.getUserMedia( { audio: deviceId ? { deviceId } : true } ).then( ( opened ) => {
            stream = opened;
            if ( ended ) {
                opened.getTracks().forEach( ( track ) => track.stop() );
                return;
            }

            const track = opened.getAudioTracks()[ 0 ];
            if ( track ) stopReading = readLevel( track, ( level ) => setTalking( speech.reading( level, othersSpeaking.current, performance.now() ) ) );
        } ).catch( () => null );

        return end;
    }, [ listening, deviceId ] );

    return [ talking, () => release.current() ];
}

/**
 * Whether the user talks with their microphone off, and what to do about it: `unmute` lets go of the hint's own
 * microphone and turns the call's on, `release` only lets go of it (before the call opens its own some other way), and
 * `dismiss` keeps it quiet until the call is over.
 */
export interface MutedHintState {
    talking: boolean,
    unmute: () => void,
    release: () => void,
    dismiss: () => void,
}

/**
 * The hint's state for everything on the call screen that tells it: the pill over the dock, and the devices'
 * microphone row while the devices lie over the dock and the pill stays hidden (device-panel.tsx). Null outside a call
 * screen that asks for the hint.
 */
export const MutedHintContext = createContext<MutedHintState | null>( null );

/**
 * Listens for the user talking while muted, where `on` and the call allow it. It opens only a microphone the browser has
 * already allowed, never with a prompt, and none while a moderator keeps the microphone off or the user may not send,
 * where Unmute could not help. Only once the user has had the microphone on in this call: someone who joined muted
 * has not muted themselves, and a microphone opened for the hint the moment they join shows in the browser as one
 * asked for. Dismissed, it says nothing more until the next call.
 */
export function useMutedHint( layout: CallLayout, on: boolean ): MutedHintState {
    const {
        action,
        connectionState,
        canPublish,
        myMicMuted,
        myMicrophoneTrack,
        selectedMicrophoneDevice,
        participants,
        enableMic,
    } = useContext<CallContextInterface>( CallContext );

    const inCall = layout === 'private'
        ? action === 'call_in_progress'
        : connectionState === 'connected' && canPublish && ! myMicMuted;
    const allowed = useMicrophoneAllowed();
    const [ dismissed, setDismissed ] = useState( false );
    const [ hadMicrophone, setHadMicrophone ] = useState( false );

    useEffect( () => {
        if ( myMicrophoneTrack ) setHadMicrophone( true );
    }, [ myMicrophoneTrack ] );

    // Read as each reading comes, not as the hint last drew.
    const othersSpeaking = useRef( false );
    othersSpeaking.current = Array.from( participants ).some( ( [ key, participant ] ) => key !== 'me' && participant.isSpeaking );

    const listening = on && inCall && allowed && hadMicrophone && ! myMicrophoneTrack && ! dismissed;
    const [ talking, release ] = useMutedSpeech( listening, selectedMicrophoneDevice, othersSpeaking );

    // Dismissed until the call is over: a moderator's mute, broadcast mode or a connection coming back keep it so. The
    // next call starts with no microphone had again.
    const callOver = layout === 'private' ? ! action : connectionState === 'disconnected';
    useEffect( () => {
        if ( ! callOver ) return;
        setDismissed( false );
        setHadMicrophone( false );
    }, [ callOver ] );

    return {
        talking,
        release,
        unmute: () => {
            release();
            void enableMic();
        },
        dismiss: () => setDismissed( true ),
    };
}

/**
 * The hint's state for its call screen, around everything that tells it (MutedHintContext), and the pill itself where
 * the call's context asks for it (`mutedHint`, context.ts).
 */
export function MutedHintScope( { layout, children }: { layout: CallLayout | null, children: ReactNode } ) {
    const { mutedHint } = useContext<CallContextInterface>( CallContext );
    const on = !! mutedHint && !! layout;
    const state = useMutedHint( layout ?? 'private', on );

    return <MutedHintContext.Provider value={ on ? state : null }>
        { children }
        { on && <MutedHint layout={ layout! } /> }
    </MutedHintContext.Provider>;
}

/**
 * "You are muted", over the dock while the user talks with their microphone off, with Unmute, as Meet, Zoom and Teams
 * say it. Inside a MutedHintScope it tells the scope's state, and on its own it listens for itself.
 */
export default function MutedHint( { layout }: { layout: CallLayout } ) {
    const scope = useContext( MutedHintContext );
    const own = useMutedHint( layout, ! scope );
    const { talking, unmute, dismiss } = scope ?? own;

    // The region stays while the hint comes and goes, so a screen reader reads it out as it appears.
    return <div className="wplus-call-muted-hint-region" role="status">
        { talking &&
            <div className="wplus-call-muted-hint">
                <Icon name="micOff" size={ 16 } />
                <span className="wplus-call-muted-hint-text">{ _x( 'You are muted', 'Call Controls', 'bp-better-messages' ) }</span>
                <span { ...pressable( unmute ) } className="wplus-call-muted-hint-unmute">{ _x( 'Unmute', 'Call Controls', 'bp-better-messages' ) }</span>
                <span { ...pressable( dismiss ) } className="wplus-call-muted-hint-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                    <Icon name="x" size={ 14 } />
                </span>
            </div>
        }
    </div>;
}
