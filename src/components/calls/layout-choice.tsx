import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallParticipant } from "./context.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon, { type IconName } from "../../primitives/icons.tsx";
import { ModerationRow } from "./moderation-panels.tsx";
import KeptMedia from "./kept-media.tsx";
import pressable from "./pressable.ts";
import { PinsContext, mainKeys, spotlitKeys } from "./spotlight.tsx";
import { isMobile } from "../../inc/functions/browser-info.ts";

/**
 * Layout choice for a group video call (asked on 2026-10-30): Auto, today's grid with the spotlight and the user's pins
 * large; Speaker, a shared screen large while someone shares, else whoever speaks, who stays large until someone else
 * has spoken for SPEAKER_HOLD_MS, the others in a strip; Tiled, everyone the same size, a page at a time. Hide People
 * Without Video and Hide Self View take tiles out on this page alone, and a stage they leave empty says so (StageNote).
 * A spotlight comes first in every layout, and a spotlighted tile is never hidden. The browser keeps the choice
 * (LAYOUT_KEY). Set in the dock's More (LayoutChoices).
 */

export type LayoutMode = 'auto' | 'speaker' | 'tiled';

export interface LayoutChoice {
    mode: LayoutMode;
    hideNoVideo: boolean;
    hideSelf: boolean;
}

/** Where the browser keeps the choice. */
export const LAYOUT_KEY = 'wordplus-call-layout';
/** How long someone else speaks before Speaker makes them the large tile. */
export const SPEAKER_HOLD_MS = 2000;

const DEFAULT_CHOICE: LayoutChoice = { mode: 'auto', hideNoVideo: false, hideSelf: false };

/** The choice the browser keeps, or Auto with nothing hidden. */
export function layoutChoice(): LayoutChoice {
    try {
        const kept = JSON.parse( window.localStorage.getItem( LAYOUT_KEY ) || 'null' );
        if ( ! kept || typeof kept !== 'object' ) return DEFAULT_CHOICE;
        return {
            mode: [ 'auto', 'speaker', 'tiled' ].includes( kept.mode ) ? kept.mode : 'auto',
            hideNoVideo: kept.hideNoVideo === true,
            hideSelf: kept.hideSelf === true,
        };
    } catch {
        return DEFAULT_CHOICE;
    }
}

export function keepLayoutChoice( choice: LayoutChoice ) {
    try {
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( choice ) );
    } catch {}
}

export const LayoutChoiceContext = createContext<{ choice: LayoutChoice, setChoice: ( choice: LayoutChoice ) => void }>( {
    choice: DEFAULT_CHOICE,
    setChoice: () => {},
} );

/**
 * Whether Pin for Me is offered for a tile: in Auto, the one layout whose large tiles a pin makes, while nobody is in the
 * spotlight, which comes first. A pinned tile keeps its Unpin for Me in any layout. Offered where it did nothing, the pin
 * read as broken: in Tiled, in Speaker, and under a spotlight.
 */
export function usePinOffered(): ( tileKey: string ) => boolean {
    const { choice } = useContext( LayoutChoiceContext );
    const { participants, spotlight } = useContext<CallContextInterface>( CallContext );
    const { pinned } = useContext( PinsContext );
    const free = choice.mode === 'auto' && spotlitKeys( participants, spotlight ).length === 0;
    return ( tileKey ) => free || pinned.has( tileKey );
}

/** A layout's choice, kept by the browser as it changes. */
export function useLayoutChoice() {
    const [ choice, setState ] = useState<LayoutChoice>( layoutChoice );
    const setChoice = useCallback( ( next: LayoutChoice ) => {
        keepLayoutChoice( next );
        setState( next );
    }, [] );
    return { choice, setChoice };
}

// A camera or screen to show, received or not: a big call receives only the tiles drawn (showTiles), and one off the
// screen keeps its place among those with a picture.
export const hasPicture = ( p: CallParticipant ) => !! ( p.video || p.screen || p.videoOptimizing || p.videoPublished || p.screenPublished );

const NOBODY: ReadonlySet<string> = new Set();

/**
 * The tiles this page shows: the user's own unless Hide Self View is on, and where Hide People Without Video is, those
 * with a picture and those of the rest who speak (`voiced`, useVoiced). Someone in the spotlight always shows. A stage
 * left empty says why (StageNote).
 */
export function visibleTiles( participants: Map<string, CallParticipant>, choice: LayoutChoice, spotlight: readonly string[] | undefined, voiced: ReadonlySet<string> = NOBODY ): Map<string, CallParticipant> {
    if ( ! choice.hideNoVideo && ! choice.hideSelf ) return participants;
    const spotlit = new Set( spotlitKeys( participants, spotlight ) );
    const shown = new Map<string, CallParticipant>();
    participants.forEach( ( p, key ) => {
        const hides = ( choice.hideSelf && key === 'me' ) || ( choice.hideNoVideo && ! hasPicture( p ) && ! voiced.has( key ) );
        if ( spotlit.has( key ) || ! hides ) shown.set( key, p );
    } );
    return shown;
}

/**
 * Whom Hide People Without Video shows for speaking: the others without a picture who speak, at once, and for
 * SPEAKER_HOLD_MS after, so a pause between sentences does not take their tile away and bring it back. Never the user's
 * own: they know they speak.
 */
export function useVoiced( participants: Map<string, CallParticipant>, on: boolean ): ReadonlySet<string> {
    // Each one heard: speaking now, or since when they are quiet.
    const heard = useRef( new Map<string, { speaking: boolean, at: number }>() );
    const [ , setTick ] = useState( 0 );
    const now = Date.now();
    let next = Infinity;
    const voiced: string[] = [];

    if ( on ) {
        participants.forEach( ( p, key ) => {
            if ( key === 'me' ) return;
            const was = heard.current.get( key );
            if ( p.isSpeaking ) heard.current.set( key, { speaking: true, at: now } );
            else if ( was?.speaking ) heard.current.set( key, { speaking: false, at: now } );
        } );
        heard.current.forEach( ( { speaking, at }, key ) => {
            const p = participants.get( key );
            const left = speaking ? Infinity : at + SPEAKER_HOLD_MS - now;
            if ( ! p || left <= 0 ) {
                heard.current.delete( key );
                return;
            }
            if ( ! hasPicture( p ) ) voiced.push( key );
            next = Math.min( next, left );
        } );
    } else {
        heard.current.clear();
    }

    // Again as the first hold left runs out.
    useEffect( () => {
        if ( next === Infinity ) return;
        const timer = setTimeout( () => setTick( ( n ) => n + 1 ), next );
        return () => clearTimeout( timer );
    } );

    const named = voiced.sort().join( '|' );
    return useMemo( () => named ? new Set( named.split( '|' ) ) : NOBODY, [ named ] );
}

/** Why the stage is empty, where the switches emptied it: nobody with video, the user's own tile hidden, or both. */
export type EmptyStage = 'video' | 'self' | 'both';

export function emptyStage( participants: Map<string, CallParticipant>, shown: Map<string, CallParticipant>, choice: LayoutChoice ): EmptyStage | null {
    if ( shown.size || ! participants.size ) return null;
    const self = choice.hideSelf && participants.has( 'me' );
    const video = choice.hideNoVideo && [ ...participants.values() ].some( ( p ) => ! hasPicture( p ) );
    return self && video ? 'both' : self ? 'self' : video ? 'video' : null;
}

/**
 * A stage the switches left empty, saying why in the middle of it, with what shows the tiles again: Show Everyone turns
 * Hide People Without Video off (and Hide Self View, where both emptied it), Show turns Hide Self View off. It goes as
 * anyone comes on the stage.
 */
export function StageNote( { why }: { why: EmptyStage } ) {
    const { choice, setChoice } = useContext( LayoutChoiceContext );
    const text = why === 'self'
        ? _x( 'Your self view is hidden', 'Call Layout', 'bp-better-messages' )
        : why === 'video'
            ? _x( 'Nobody has video on', 'Call Layout', 'bp-better-messages' )
            : _x( 'Nobody else has video on, and your self view is hidden', 'Call Layout', 'bp-better-messages' );
    const show = why === 'self'
        ? _x( 'Show', 'Call Layout', 'bp-better-messages' )
        : _x( 'Show Everyone', 'Call Layout', 'bp-better-messages' );
    const press = () => setChoice( {
        ...choice,
        hideNoVideo: why === 'self' ? choice.hideNoVideo : false,
        hideSelf: why === 'video' ? choice.hideSelf : false,
    } );

    return <div className="wplus-call-stage-note" role="status" data-why={ why }>
        <span className="wplus-call-stage-note-text">{ text }</span>
        <span { ...pressable( press ) } className="wplus-call-stage-note-show">{ show }</span>
    </div>;
}

/**
 * The large tiles, in their order: the spotlight in every layout; else Auto's pins and a broadcast's speakers
 * (spotlight.tsx), Speaker's one (`focus`), and none for Tiled.
 */
export function layoutMainKeys( shown: Map<string, CallParticipant>, spotlight: readonly string[] | undefined, pinned: ReadonlySet<string>, broadcast: boolean, mode: LayoutMode, focus: string | null ): string[] {
    const spotlit = spotlitKeys( shown, spotlight );
    if ( spotlit.length ) return spotlit;
    if ( mode === 'tiled' ) return [];
    if ( mode === 'speaker' ) return focus && shown.has( focus ) ? [ focus ] : [];
    return mainKeys( shown, spotlight, pinned, broadcast );
}

/**
 * Speaker's large tile: the screen shared last while anyone shares, else whoever speaks, kept until someone else has
 * spoken for SPEAKER_HOLD_MS, a cough or a word not moving it. Never the user's own while anyone else is there.
 */
export function useSpeakerFocus( shown: Map<string, CallParticipant>, on: boolean ): string | null {
    const [ focus, setFocus ] = useState<string | null>( null );
    const [ tick, setTick ] = useState( 0 );
    const sharedAt = useRef( new Map<string, number>() );
    const next = useRef<{ key: string, since: number } | null>( null );
    const order = useRef( 0 );

    // Who shares, in the order they started: the last one is the large tile.
    shown.forEach( ( p, key ) => {
        if ( ( p.screen || p.screenPublished ) && ! sharedAt.current.has( key ) ) sharedAt.current.set( key, ++order.current );
    } );
    sharedAt.current.forEach( ( _, key ) => {
        const p = shown.get( key );
        if ( ! p?.screen && ! p?.screenPublished ) sharedAt.current.delete( key );
    } );
    const sharer = [ ...sharedAt.current.entries() ].sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ]?.[ 0 ] ?? null;

    useEffect( () => {
        if ( ! on ) return;
        const others = [ ...shown.keys() ].filter( ( key ) => key !== 'me' );
        const speaking = others.filter( ( key ) => shown.get( key )!.isSpeaking );

        if ( ! focus || ! shown.has( focus ) || ( focus === 'me' && others.length ) ) {
            next.current = null;
            setFocus( speaking[ 0 ] ?? others.find( ( key ) => hasPicture( shown.get( key )! ) ) ?? others[ 0 ] ?? ( shown.has( 'me' ) ? 'me' : null ) );
            return;
        }

        const candidate = speaking.includes( focus ) ? undefined : speaking[ 0 ];
        if ( ! candidate ) {
            next.current = null;
            return;
        }
        if ( next.current?.key !== candidate ) next.current = { key: candidate, since: Date.now() };
        const left = SPEAKER_HOLD_MS - ( Date.now() - next.current.since );
        if ( left <= 0 ) {
            next.current = null;
            setFocus( candidate );
            return;
        }
        const timer = setTimeout( () => setTick( ( n ) => n + 1 ), left );
        return () => clearTimeout( timer );
    }, [ shown, on, focus, tick ] );

    return on ? ( sharer ?? focus ) : null;
}

/**
 * Layout, in the dock's More (call-dock.tsx, its `menu`): Auto, Speaker and Tiled side by side, the one in use lit and
 * what it does said under them, then the tiles to hide as switches. All at hand at once, nothing opened to choose from,
 * and a choice leaves More open, so a layout and what to hide are set in one go.
 */
export function LayoutChoices() {
    const { choice, setChoice } = useContext( LayoutChoiceContext );
    const { spotlight, participants } = useContext<CallContextInterface>( CallContext );
    const spotlit = spotlitKeys( participants, spotlight ).length > 0;
    const title = _x('Layout', 'Settings page', 'bp-better-messages');
    const modes: { mode: LayoutMode, icon: IconName, label: string, note: string }[] = [
        { mode: 'auto', icon: 'layout', label: _x('Auto', 'Call Layout', 'bp-better-messages'),
            note: _x('The grid, with the spotlight and your pins large.', 'Call Layout', 'bp-better-messages') },
        { mode: 'speaker', icon: 'user', label: _x('Speaker', 'Call Layout', 'bp-better-messages'),
            note: _x('A shared screen or whoever speaks large, everyone else in a strip.', 'Call Layout', 'bp-better-messages') },
        { mode: 'tiled', icon: 'users', label: _x('Tiled', 'Call Layout', 'bp-better-messages'),
            note: _x('Everyone the same size, a page at a time.', 'Call Layout', 'bp-better-messages') },
    ];
    const chosen = modes.find( ( one ) => one.mode === choice.mode ) ?? modes[ 0 ];

    return <div className="wplus-call-layout-choices" role="group" aria-label={ title }>
        <span className="wplus-call-more-title" aria-hidden="true">{ title }</span>
        <div className="wplus-call-layout-modes">
            { modes.map( ( one ) => <span key={ one.mode } className={ 'wplus-call-layout-mode wplus-layout-' + one.mode }
                role="menuitemradio" tabIndex={ 0 } aria-label={ one.label } aria-checked={ choice.mode === one.mode } data-on={ choice.mode === one.mode ? 1 : undefined }
                onClick={ () => setChoice( { ...choice, mode: one.mode } ) }
                onKeyDown={ ( event ) => {
                    if ( event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar' ) return;
                    event.preventDefault();
                    setChoice( { ...choice, mode: one.mode } );
                } }>
                <Icon name={ one.icon } size={ 18 } />
                <span>{ one.label }</span>
            </span> ) }
        </div>
        <span className="wplus-call-layout-note">{ chosen.note }</span>
        { spotlit && <span className="wplus-call-layout-spotlit">{_x('A moderator spotlighted someone: their tiles are large in every layout.', 'Call Layout', 'bp-better-messages')}</span> }
        <ModerationRow icon="videoOff" className="wplus-layout-hide-no-video" checked={ choice.hideNoVideo } busy={ false }
            label={_x('Hide People Without Video', 'Call Layout', 'bp-better-messages')}
            note={_x('People without video show while they speak.', 'Call Layout', 'bp-better-messages')}
            onClick={ () => setChoice( { ...choice, hideNoVideo: ! choice.hideNoVideo } ) } />
        <ModerationRow icon="user" className="wplus-layout-hide-self" checked={ choice.hideSelf } busy={ false }
            label={_x('Hide Self View', 'Call Layout', 'bp-better-messages')}
            note={_x('Only on your screen: the others still see you.', 'Call Layout', 'bp-better-messages')}
            onClick={ () => setChoice( { ...choice, hideSelf: ! choice.hideSelf } ) } />
    </div>;
}

/**
 * Someone's sound while their tile is hidden: their tile plays it otherwise (group-video-grid-item.tsx), and hiding
 * them must not mute them. With `id`, their tile's (`<key>:audio`), it plays in the tile's own element (KeptMedia),
 * which goes on playing into the tile as it shows: someone Hide People Without Video shows as they start speaking
 * loses nothing of what they say.
 */
export function HiddenSound( { participant, id }: { participant: CallParticipant, id?: string } ) {
    const { selectedSpeakerDevice } = useContext<CallContextInterface>( CallContext );
    const [ element, setElement ] = useState<HTMLAudioElement | null>( null );

    useEffect( () => {
        if ( element && participant.audio && ! participant.audio.attachedElements.includes( element ) ) participant.audio.attach( element );
    }, [ element, participant.audio ] );

    // A kept element is let go by KeptMedia, as the tile's is, once nothing draws it: it may be the tile's now.
    useEffect( () => () => {
        if ( element && participant.audio && ! id ) participant.audio.detach( element );
    }, [ element, participant.audio ] );

    useEffect( () => {
        if ( element && element.setSinkId ) void element.setSinkId( selectedSpeakerDevice ).catch( () => {} );
    }, [ element, selectedSpeakerDevice ] );

    if ( ! participant.audio ) return null;
    if ( id ) return <KeptMedia id={ id } tag="audio" className="wplus-call-hidden-sound" hidden
        onElement={ setElement as ( element: HTMLMediaElement | null ) => void } />;
    return <audio ref={ setElement } className="wplus-call-hidden-sound" autoPlay playsInline style={ { display: 'none' } } />;
}

const PAGE_DOTS_MOST = 10;

/**
 * Previous and Next over a block of tiles wider than its box (Tiled's pages, a strip), and which page shows, at the
 * foot of the block, beside it as the block scrolls under it, a dot for each page on a phone or a tablet. Nothing while
 * it all fits.
 */
export function PageArrows( { block }: { block: RefObject<HTMLDivElement | null> } ) {
    const [ pages, setPages ] = useState( { at: 1, of: 1, left: 0, top: 0 } );

    const measure = useCallback( () => {
        const el = block.current;
        if ( ! el || el.clientWidth <= 0 ) return;
        const of = Math.max( 1, Math.round( el.scrollWidth / el.clientWidth ) );
        const at = Math.min( of, Math.round( Math.abs( el.scrollLeft ) / el.clientWidth ) + 1 );
        const left = Math.round( el.offsetLeft + el.offsetWidth / 2 );
        const top = Math.round( el.offsetTop + el.offsetHeight );
        setPages( ( was ) => was.at === at && was.of === of && was.left === left && was.top === top ? was : { at, of, left, top } );
    }, [] );

    useEffect( () => {
        const el = block.current;
        if ( ! el ) return;
        measure();
        el.addEventListener( 'scroll', measure, { passive: true } );
        const timer = window.setInterval( measure, 1000 );
        return () => {
            el.removeEventListener( 'scroll', measure );
            window.clearInterval( timer );
        };
    }, [] );

    if ( pages.of < 2 ) return null;

    const go = ( step: number ) => {
        const el = block.current;
        if ( ! el ) return;
        el.scrollTo( { left: ( pages.at - 1 + step ) * el.clientWidth, behavior: 'smooth' } );
    };

    // A phone or a tablet swipes the pages (group-video-grid.tsx): a dot for each, up to PAGE_DOTS_MOST, then the count.
    if ( isMobile() ) return <div className="wplus-call-pages wplus-call-page-dots" style={ { left: pages.left, top: pages.top } }>
        { pages.of <= PAGE_DOTS_MOST
            ? Array.from( { length: pages.of }, ( _, at ) => <span key={ at } className="wplus-call-page-dot" role="button" tabIndex={ 0 }
                aria-label={ ( at + 1 ) + ' / ' + pages.of } aria-current={ at === pages.at - 1 ? true : undefined }
                onClick={ () => go( at - pages.at + 1 ) } /> )
            : <span className="wplus-call-page-count" aria-live="polite">{ pages.at + ' / ' + pages.of }</span> }
    </div>;

    return <div className="wplus-call-pages" style={ { left: pages.left, top: pages.top } }>
        <Tooltip content={_x('Previous', 'Lightbox', 'bp-better-messages')}>
            <span className="wplus-call-page-prev" role="button" tabIndex={ 0 } aria-label={_x('Previous', 'Lightbox', 'bp-better-messages')} aria-disabled={ pages.at <= 1 } onClick={ () => pages.at > 1 && go( -1 ) }>
                <Icon name="chevronL" size={ 16 } />
            </span>
        </Tooltip>
        <span className="wplus-call-page-count" aria-live="polite">{ pages.at + ' / ' + pages.of }</span>
        <Tooltip content={_x('Next', 'Lightbox', 'bp-better-messages')}>
            <span className="wplus-call-page-next" role="button" tabIndex={ 0 } aria-label={_x('Next', 'Lightbox', 'bp-better-messages')} aria-disabled={ pages.at >= pages.of } onClick={ () => pages.at < pages.of && go( 1 ) }>
                <Icon name="chevronR" size={ 16 } />
            </span>
        </Tooltip>
    </div>;
}
