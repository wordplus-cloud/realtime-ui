import { useSyncExternalStore } from "react";

// The others' sound in a call, where the browser holds it back. A page plays sound only once the person has clicked or
// typed on it, or on the page of the site they came from, so a page that joined a call by itself (a spot's `join`,
// opened in a new tab) shows the others' pictures but plays no voice. Each element held back waits here: the next click
// or key anywhere on the page plays them, and the call screen offers Turn sound on while any waits.

const held = new Set<HTMLMediaElement>();
const listeners = new Set<() => void>();
const GESTURES = [ 'pointerdown', 'pointerup', 'keydown', 'touchend' ] as const;
let armed = false;

const changed = () => listeners.forEach( ( listener ) => listener() );
const refused = ( error: unknown ) => ( error as { name?: string } | null )?.name === 'NotAllowedError';

/** Plays an element with the others' sound, keeping it for the person's next click when the browser refuses. */
export function playSound( element: HTMLMediaElement ): void {
    const playing = element.play?.();
    playing?.catch?.( ( error: unknown ) => {
        if ( ! refused( error ) || ! element.isConnected ) return;
        held.add( element );
        arm();
        changed();
    } );
}

/** An element taken off its track: nothing more to play there. */
export function forgetSound( element: HTMLMediaElement ): void {
    if ( held.delete( element ) ) changed();
}

/** Plays every element held back: from a click or a key, which the browser takes as the person's leave to. */
export function soundOn(): void {
    for ( const element of [ ...held ] ) {
        if ( ! element.isConnected ) {
            held.delete( element );
            continue;
        }
        element.play?.()?.then?.( () => {
            held.delete( element );
            if ( held.size === 0 ) disarm();
            changed();
        }, () => {} );
    }
    if ( held.size === 0 ) disarm();
    changed();
}

function arm(): void {
    if ( armed || typeof document === 'undefined' ) return;
    armed = true;
    for ( const gesture of GESTURES ) document.addEventListener( gesture, soundOn, true );
}

function disarm(): void {
    if ( ! armed ) return;
    armed = false;
    for ( const gesture of GESTURES ) document.removeEventListener( gesture, soundOn, true );
}

const subscribe = ( listener: () => void ) => {
    listeners.add( listener );
    return () => void listeners.delete( listener );
};

/** Whether some of the others' sound waits for a click: the call screen shows Turn sound on. */
export function useSoundHeld(): boolean {
    return useSyncExternalStore( subscribe, () => held.size > 0, () => false );
}
