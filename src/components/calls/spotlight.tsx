import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallParticipant } from "./context.ts";
import { moderates } from "./moderation.ts";
import { host } from "../../host.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icons.tsx";

/**
 * Spotlight for everyone and Pin for Me (asked on 2026-10-30). A moderator puts up to four people on the main tiles for
 * everyone in a group video call: the room's state (the context's `spotlight`), so it outlives a reconnect and whoever
 * joins later sees it, each such tile labeled Spotlight. Anyone pins someone for themselves (Pin for Me, this page
 * alone), which shows while nobody is in the spotlight: a spotlight comes first, as in Zoom and Teams, and the pins wait
 * for it to end. Pin for Me is offered only where a pin shows (usePinOffered, layout-choice.tsx). A moderator's pin from an older client (the person's `isPinned`) is a spotlight too, as everyone
 * already saw it as one.
 */

/** How many can be in the spotlight at once, as the call's server keeps it. */
export const SPOTLIGHT_MOST = 4;

/**
 * Who is in the spotlight, by their tile's key, in the order they were spotlighted: the room's spotlight for those in
 * the call now, then anyone an older client pinned for everyone.
 */
export function spotlitKeys( participants: Map<string, CallParticipant>, spotlight: readonly string[] | undefined ): string[] {
    const keys: string[] = [];
    for ( const identity of spotlight ?? [] ) {
        for ( const [ key, participant ] of participants ) {
            if ( participant.identity === identity && ! keys.includes( key ) ) keys.push( key );
        }
    }
    participants.forEach( ( participant, key ) => {
        if ( participant.isPinned && ! keys.includes( key ) ) keys.push( key );
    } );
    return keys;
}

/**
 * The tiles of the main block, in their order: the spotlight while anyone is in it, else this page's own pins, else in
 * broadcast mode the speakers. A pin beside the speakers made it one large tile of the same size among them, so pinning a
 * speaker changed nothing on screen.
 */
export function mainKeys( participants: Map<string, CallParticipant>, spotlight: readonly string[] | undefined, pinned: ReadonlySet<string>, broadcast: boolean ): string[] {
    const spotlit = spotlitKeys( participants, spotlight );
    if ( spotlit.length ) return spotlit;

    const keys = [ ...pinned ].filter( ( key ) => participants.has( key ) );
    if ( keys.length ) return keys;
    if ( broadcast ) participants.forEach( ( participant, key ) => {
        if ( ( participant.canPublish || participant.canAdmin ) && ! keys.includes( key ) ) keys.push( key );
    } );
    return keys;
}

/** This page's own pins, as a group layout keeps them for PinsContext, by tile key. */
export interface Pins {
    pinned: ReadonlySet<string>;
    toggle( key: string ): void;
}

export const PinsContext = createContext<Pins>( { pinned: new Set(), toggle: () => {} } );

/** A layout's pins: someone who leaves is unpinned, so coming back they are a tile like the others. */
export function usePins( participants: Map<string, CallParticipant> ): Pins {
    const [ pinned, setPinned ] = useState<ReadonlySet<string>>( () => new Set() );
    const toggle = useCallback( ( key: string ) => setPinned( ( was ) => {
        const next = new Set( was );
        if ( next.has( key ) ) next.delete( key );
        else next.add( key );
        return next;
    } ), [] );

    useEffect( () => {
        if ( [ ...pinned ].every( ( key ) => participants.has( key ) ) ) return;
        setPinned( new Set( [ ...pinned ].filter( ( key ) => participants.has( key ) ) ) );
    }, [ participants ] );

    return { pinned, toggle };
}

// The error code an answer was refused with: an SDK call's `code`, or the site's REST answer's.
function codeOf( error: unknown ): string | undefined {
    const e = error as { code?: unknown, response?: { data?: { code?: unknown } } } | null;
    const code = e?.response?.data?.code ?? e?.code;
    return typeof code === 'string' ? code : undefined;
}

/**
 * A moderator's spotlight acts through the context's `moderate`, each its answer or false once its error is shown: a
 * fifth person is refused with the call's own words.
 */
export function useSpotlightActs() {
    const { moderate, moderation, callInfo } = useContext<CallContextInterface>( CallContext );

    const act = async ( name: string, identity?: string ) => {
        try {
            return await moderate( { act: name, type: callInfo.type, ...( identity ? { identity } : {} ) } );
        } catch ( e ) {
            host().showError( codeOf( e ) === 'spotlight_full' ? spotlightFull() : e );
            return false;
        }
    };

    return {
        offered: moderates( moderation, 'spotlight_participant' ),
        spotlight: ( identity: string ) => act( 'spotlight_participant', identity ),
        unspotlight: ( identity: string ) => act( 'unspotlight_participant', identity ),
        clear: () => act( 'unspotlight_participant' ),
        clears: moderates( moderation, 'unspotlight_participant' ),
    };
}

export const spotlightFull = () => _x('Up to four people can be in the spotlight.', 'Call Moderation', 'bp-better-messages');

/** A spotlighted tile's label, beside their name, for everyone. */
export function SpotlightLabel() {
    return <span className="wplus-call-spotlight-label">
        <Icon name="star" size={ 12 } />
        <span>{_x('Spotlight', 'Call Moderation', 'bp-better-messages')}</span>
    </span>;
}

/**
 * Pin for Me on a tile, for everyone, beside a moderator's ⋯: latched and on show while the tile is pinned, as a pin
 * that is waiting for a spotlight to end is pinned all the same.
 */
export function PinForMe( { tileKey, name }: { tileKey: string, name: string } ) {
    const { pinned, toggle } = useContext( PinsContext );
    const on = pinned.has( tileKey );

    return <Tooltip content={ on ? _x('Unpin for Me', 'Call Moderation', 'bp-better-messages') : _x('Pin for Me', 'Call Moderation', 'bp-better-messages') }>
        <span onClick={ () => toggle( tileKey ) } className="wplus-pin-for-me" data-active={ on ? 1 : undefined } aria-pressed={ on } role="button" tabIndex={ 0 } data-name={ name }
            onKeyDown={ ( event ) => {
                if ( event.key !== 'Enter' && event.key !== ' ' ) return;
                event.preventDefault();
                toggle( tileKey );
            } }>
            <Icon name={ on ? 'pinOff' : 'pin' } size={ 14 } />
        </span>
    </Tooltip>;
}
