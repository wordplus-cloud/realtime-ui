import React, { useContext, useEffect, useRef, useState } from "react";
import { _nx, _x, sprintf } from "../../inc/globals.ts";
import Icon from "../../primitives/icon.tsx";
import { host } from "../../host.ts";
import { CallContext, type CallContextInterface } from "./context.ts";
import pressable from "./pressable.ts";

/** Whether this browser plays a sound when someone raises a hand: on unless a moderator turned it off in Host Controls. */
export const HAND_SOUND_KEY = 'wordplus-call-hand-sound';

export function handSoundOn(): boolean {
    try {
        return window.localStorage.getItem( HAND_SOUND_KEY ) !== '0';
    } catch ( e ) {
        return true;
    }
}

export function keepHandSound( on: boolean ) {
    try {
        window.localStorage.setItem( HAND_SOUND_KEY, on ? '1' : '0' );
    } catch ( e ) {}
}

/** Whether this browser says who joined: off unless a moderator turned it on in Host Controls. */
export const JOIN_ALERTS_KEY = 'wordplus-call-join-alerts';

export function joinAlertsOn(): boolean {
    try {
        return window.localStorage.getItem( JOIN_ALERTS_KEY ) === '1';
    } catch ( e ) {
        return false;
    }
}

export function keepJoinAlerts( on: boolean ) {
    try {
        window.localStorage.setItem( JOIN_ALERTS_KEY, on ? '1' : '0' );
    } catch ( e ) {}
}

// A hand stays until it is likely seen, a join only briefly. Joins this close together share one toast, so a room
// filling up says so once, and no more than three toasts stand at a time.
export const HAND_TOAST_MS = 10000;
export const JOIN_TOAST_MS = 5000;
const JOINS_TOGETHER_MS = 3000;
const MOST_TOASTS = 3;

// A hand raised again this soon after its toast, or someone back this soon after leaving, is not news again: a hand
// going up and down, or a connection coming and going, would fill the corner.
export const HAND_AGAIN_MS = 60000;
export const REJOIN_MS = 120000;

export interface HostToastPerson {
    key: string,
    name: string,
    avatar: string,
}

export interface HostToast {
    id: number,
    kind: 'hand' | 'join',
    people: HostToastPerson[],
}

// A name as text: a site's badges in it are markup the tiles draw, and a toast has no room for them.
const plain = ( name: string ) => name.replace( /<[^>]*>/g, '' ).trim();

function toastText( toast: HostToast ): string {
    const [ first, second ] = toast.people.map( ( person ) => person.name );

    if ( toast.kind === 'hand' ) return sprintf( _x( '%s raised a hand', 'Call Moderation', 'bp-better-messages' ), first );
    if ( toast.people.length === 1 ) return sprintf( _x( '%s joined', 'Call Moderation', 'bp-better-messages' ), first );
    if ( toast.people.length === 2 ) return sprintf( _x( '%1$s and %2$s joined', 'Call Moderation', 'bp-better-messages' ), first, second );

    const more = toast.people.length - 1;
    return sprintf( _nx( '%1$s and %2$d other joined', '%1$s and %2$d others joined', more, 'Call Moderation', 'bp-better-messages' ), first, more );
}

// Two soft rising notes, on the speaker the call uses where the browser lets a page choose it.
function chime( context: AudioContext ) {
    const now = context.currentTime;

    [ 660, 880 ].forEach( ( frequency, i ) => {
        const tone = context.createOscillator();
        const gain = context.createGain();
        const start = now + i * 0.14;

        tone.type = 'sine';
        tone.frequency.value = frequency;
        gain.gain.setValueAtTime( 0.0001, start );
        gain.gain.exponentialRampToValueAtTime( 0.08, start + 0.02 );
        gain.gain.exponentialRampToValueAtTime( 0.0001, start + 0.3 );
        tone.connect( gain ).connect( context.destination );
        tone.start( start );
        tone.stop( start + 0.32 );
    } );
}

/**
 * What a moderator is told of the people in the call: a raised hand, with the sound unless it is off, and who joined
 * where Join Alerts is on. Who was there when the moderator came in is not news, and neither is a tile that comes back
 * from reconnecting, as it never left the participants. Each person is in one toast at most: a new one about them
 * takes them out of the one before, and a lowered hand or a departure takes theirs down. The second value takes a
 * toast down.
 */
export function useHostToasts(): [ HostToast[], ( id: number ) => void ] {
    const { participants, connectionState, selectedSpeakerDevice } = useContext<CallContextInterface>( CallContext );
    const [ toasts, setToasts ] = useState<HostToast[]>( [] );
    const shown = useRef<HostToast[]>( [] );
    const seen = useRef<Map<string, boolean> | null>( null );
    const leftAt = useRef( new Map<string, number>() );
    const handAt = useRef( new Map<string, number>() );
    const nextId = useRef( 1 );
    const lastJoin = useRef<{ id: number, at: number } | null>( null );
    const timers = useRef( new Map<number, ReturnType<typeof setTimeout>>() );
    const audio = useRef<AudioContext | null>( null );

    const show = ( next: HostToast[] ) => {
        shown.current.forEach( ( toast ) => {
            if ( next.some( ( kept ) => kept.id === toast.id ) ) return;
            clearTimeout( timers.current.get( toast.id ) );
            timers.current.delete( toast.id );
        } );
        shown.current = next;
        setToasts( next );
    };

    const dismiss = ( id: number ) => show( shown.current.filter( ( toast ) => toast.id !== id ) );

    const expireIn = ( id: number, ms: number ) => {
        clearTimeout( timers.current.get( id ) );
        timers.current.set( id, setTimeout( () => dismiss( id ), ms ) );
    };

    const ring = () => {
        if ( ! handSoundOn() || typeof window === 'undefined' || ! window.AudioContext ) return;

        try {
            if ( ! audio.current ) {
                audio.current = new window.AudioContext();
                const sink = ( audio.current as AudioContext & { setSinkId?: ( id: string ) => Promise<void> } ).setSinkId;
                if ( selectedSpeakerDevice && sink ) void sink.call( audio.current, selectedSpeakerDevice ).catch( () => null );
            }
            void audio.current.resume().catch( () => null );
            chime( audio.current );
        } catch ( e ) {}
    };

    useEffect( () => {
        if ( connectionState !== 'connected' ) {
            seen.current = null;
            return;
        }

        const before = seen.current;
        const now = new Map<string, boolean>();
        participants.forEach( ( participant, key ) => {
            if ( key !== 'me' ) now.set( key, !! participant.handRaised );
        } );
        seen.current = now;

        if ( ! before ) return;

        const at = Date.now();
        const left = new Set<string>();
        const lowered = new Set<string>();
        before.forEach( ( hand, key ) => {
            if ( ! now.has( key ) ) {
                left.add( key );
                leftAt.current.set( key, at );
            } else if ( hand && ! now.get( key ) ) {
                lowered.add( key );
            }
        } );

        const joined: string[] = [];
        const hands: string[] = [];
        now.forEach( ( hand, key ) => {
            if ( ! before.has( key ) ) {
                const gone = leftAt.current.get( key );
                leftAt.current.delete( key );
                if ( joinAlertsOn() && ! ( gone && at - gone < REJOIN_MS ) ) joined.push( key );
            }

            if ( hand && ! before.get( key ) ) {
                const last = handAt.current.get( key );
                if ( last && at - last < HAND_AGAIN_MS ) return;
                handAt.current.set( key, at );
                hands.push( key );
            }
        } );

        if ( ! left.size && ! lowered.size && ! joined.length && ! hands.length ) return;

        const person = ( key: string ): HostToastPerson => {
            const participant = participants.get( key )!;
            return { key, name: plain( participant.name ), avatar: participant.avatar };
        };

        const raised = new Set( hands );
        let next = shown.current
            .map( ( toast ) => {
                const people = toast.people.filter( ( { key } ) =>
                    ! left.has( key ) && ! raised.has( key ) && ! ( toast.kind === 'hand' && lowered.has( key ) ) );
                return people.length === toast.people.length ? toast : { ...toast, people };
            } )
            .filter( ( toast ) => toast.people.length > 0 );

        if ( joined.length ) {
            const last = lastJoin.current;
            const open = last && at - last.at < JOINS_TOGETHER_MS ? next.find( ( toast ) => toast.id === last.id ) : undefined;

            if ( open ) {
                next = next.map( ( toast ) => toast === open ? { ...toast, people: [ ...toast.people, ...joined.map( person ) ] } : toast );
                lastJoin.current = { id: open.id, at };
                expireIn( open.id, JOIN_TOAST_MS );
            } else {
                const toast: HostToast = { id: nextId.current++, kind: 'join', people: joined.map( person ) };
                next.push( toast );
                lastJoin.current = { id: toast.id, at };
                expireIn( toast.id, JOIN_TOAST_MS );
            }
        }

        hands.forEach( ( key ) => {
            const toast: HostToast = { id: nextId.current++, kind: 'hand', people: [ person( key ) ] };
            next.push( toast );
            expireIn( toast.id, HAND_TOAST_MS );
        } );

        show( next.slice( -MOST_TOASTS ) );
        if ( hands.length ) ring();
    }, [ participants, connectionState ] );

    useEffect( () => () => {
        timers.current.forEach( ( timer ) => clearTimeout( timer ) );
        void audio.current?.close().catch( () => null );
    }, [] );

    return [ toasts, dismiss ];
}

/**
 * A moderator's toasts, in the stage's top corner, newest first (useHostToasts). Better Messages draws them for its
 * moderators alone: a member is not told of every hand and every arrival.
 */
export default function HostToasts() {
    const [ toasts, dismiss ] = useHostToasts();

    return <div className="wplus-call-host-toasts" role="status">
        { toasts.slice().reverse().map( ( toast ) =>
            <div key={ toast.id } className="wplus-call-host-toast" data-kind={ toast.kind }>
                { toast.kind === 'hand'
                    ? <span className="wplus-call-host-toast-icon" aria-hidden="true"><Icon name="raisehand" size={ 16 } /></span>
                    : <img className="wplus-call-host-toast-avatar" src={ toast.people[ 0 ].avatar || host().defaultAvatar() } alt="" /> }
                <span className="wplus-call-host-toast-text">{ toastText( toast ) }</span>
                <span { ...pressable( () => dismiss( toast.id ) ) } className="wplus-call-host-toast-close" aria-label={ _x( 'Dismiss', 'Call Controls', 'bp-better-messages' ) }>
                    <Icon name="x" size={ 14 } />
                </span>
            </div>
        ) }
    </div>;
}
