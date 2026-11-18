import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallParticipant } from "./context.ts";
import { moderates, useModerationActs } from "./moderation.ts";
import usePendingActions from "../../inc/calls/pending.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon, { type IconName } from "../../primitives/icons.tsx";
import UserAvatar from "../users/user-avatar.tsx";
import UserName from "../users/user-name.tsx";
import { host } from "../../host.ts";
import {
    ModerationPanelContext, ModerationRow, heldMute, tileModerated, useMuteEveryone, userIdOf,
} from "./moderation-panels.tsx";
import { PinsContext, spotlitKeys } from "./spotlight.tsx";
import { usePinOffered } from "./layout-choice.tsx";
import { createFixedProbe, fixedOrigin } from "../../primitives/viewport.ts";
import { useKeyAction } from "./call-keys.tsx";

/**
 * Participants: everyone in a group call in one list, opened from the dock, where the ⋯ on each tile stops scaling
 * once a call is past ten or so. The user first, then raised hands in the order they went up, then everyone else by
 * name, each row with their picture, name, a Moderator badge, their microphone (on, off, or held off by a moderator),
 * camera, shared screen and a weak connection, and a search once the call is large. A moderator gets Mute Everyone and
 * Lower All Hands at the top, and on each row lowers a hand (its chip, as on the tile), mutes a microphone that is on,
 * and opens the person's menu (moderation-panels.tsx) from its ⋯, beside the row. A member gets the list alone.
 *
 * On a stage wide enough it stands as a column at the stage's end edge, and the tiles make room for it
 * (`data-people="column"` on the stage, PeopleColumnContext for the video grid): a sheet over the tiles would cover
 * the people it lists. Narrower, on a phone or beside the chat, it is a sheet above the dock, as the device settings
 * are, which a press outside closes.
 */

/** The stage's width from which the list stands as a column beside the tiles. */
export const PEOPLE_COLUMN_FROM = 720;
/** How many people a call has before the list offers its search. */
export const PEOPLE_SEARCH_FROM = 9;

export type PeopleMode = 'column' | 'sheet';

/** Whether the list stands as a column now, which the video grid takes its width from. */
export const PeopleColumnContext = createContext( false );

/**
 * Who raised a hand when, as this page saw them go up: their key and a number that grows with each hand. Kept by the
 * layout while the list is closed too, so it opens in the order the hands went up. A hand already up when the call
 * was joined counts from then, as that is when this page saw it.
 */
export function useHandOrder( participants: Map<string, CallParticipant> ): Map<string, number> {
    const order = useRef( new Map<string, number>() );
    const last = useRef( 0 );
    const now = order.current;
    // In the render, and the same however often it runs: a hand lowered or gone drops out, a new one goes last.
    now.forEach( ( _, key ) => {
        if ( ! participants.get( key )?.handRaised ) now.delete( key );
    } );
    participants.forEach( ( person, key ) => {
        if ( person.handRaised && ! now.has( key ) ) now.set( key, ++last.current );
    } );
    return now;
}

/** The list's order: the user, raised hands as they went up, everyone else by name. */
export function peopleOrder( participants: Map<string, CallParticipant>, hands: Map<string, number> ): string[] {
    const others = [ ...participants.keys() ].filter( ( key ) => key !== 'me' );
    const name = ( key: string ) => participants.get( key )?.name ?? '';
    const raised = others.filter( ( key ) => hands.has( key ) ).sort( ( a, b ) => hands.get( a )! - hands.get( b )! );
    const rest = others.filter( ( key ) => ! hands.has( key ) )
        .sort( ( a, b ) => name( a ).localeCompare( name( b ), undefined, { sensitivity: 'base', numeric: true } ) || ( a < b ? -1 : 1 ) );
    return [ ...( participants.has( 'me' ) ? [ 'me' ] : [] ), ...raised, ...rest ];
}

// A name as the search compares it: no case, no accents.
const folded = ( text: string ) => text.normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' ).toLocaleLowerCase();

/**
 * Everyone in the call, the user too: someone who only listens has no tile of their own (an SDK group call draws
 * none), and is in the list as a viewer all the same.
 */
export function peopleOf( participants: Map<string, CallParticipant> ): Map<string, CallParticipant> {
    if ( participants.has( 'me' ) ) return participants;
    const listener: CallParticipant = {
        identity: 'me', name: '', avatar: '', link: '', audioLevel: 0, isSpeaking: false, isPinned: false, quality: 'unknown',
        video: null, videoPub: null, audio: null, audioPub: null, screen: null, screenPub: null, screenAudio: null,
        screenAudioPub: null, canPublish: false, canAdmin: false, handRaised: false, micMuted: false,
    };
    return new Map( [ [ 'me', listener ], ...participants ] );
}

/**
 * The list's state, as a group layout keeps it: open or not, and a column or a sheet by the stage's width, measured as
 * the stage changes size (the call expanded to the window, the chat shown beside it, a phone turned).
 *
 * A video call's: an audio call's roster is the list of everyone. Offered only where it shows someone the stage doesn't
 * (GroupVideoGrid's `onStage`: a second page, a strip scrolled past someone, a person the layout hides), or where the
 * call can add people (`canAdd`), which the list does: a small call shows everyone already, and each tile has what the
 * list would. Closed as it stops being offered.
 */
export function usePeoplePanel( stage: RefObject<HTMLElement | null>, canAdd = false ) {
    const [ open, setOpen ] = useState( false );
    const [ wide, setWide ] = useState( false );
    const [ everyoneOnStage, setEveryoneOnStage ] = useState( true );
    const offered = canAdd || ! everyoneOnStage;
    useEffect( () => {
        if ( ! offered ) setOpen( false );
    }, [ offered ] );

    useLayoutEffect( () => {
        const root = stage.current;
        if ( ! root ) return;
        const measure = () => setWide( root.getBoundingClientRect().width >= PEOPLE_COLUMN_FROM );
        measure();
        if ( typeof ResizeObserver === 'undefined' ) return;
        const observer = new ResizeObserver( measure );
        observer.observe( root );
        return () => observer.disconnect();
    }, [] );

    const mode: PeopleMode = wide ? 'column' : 'sheet';
    return { open, setOpen, mode, column: open && mode === 'column', sheet: open && mode === 'sheet', offered, onStage: setEveryoneOnStage };
}

/** A count as the page's language writes it: "1,000", "1 000" or "1.000", not "1000". */
export function formatCount( count: number ): string {
    try {
        return new Intl.NumberFormat( ( typeof document !== 'undefined' && document.documentElement.lang ) || undefined ).format( count );
    } catch {
        return String( count );
    }
}

/**
 * The dock's Participants, with how many are in the call, as an item the dock lays out and folds like its others (a
 * Tooltip around a span). Latched while the list is open.
 */
export function peopleItem( open: boolean, count: number, toggle: () => void ) {
    return <Tooltip content={_x('Participants', 'Group Video Chat', 'bp-better-messages')}>
        <span onClick={ toggle } className="wplus-call-people-toggle" data-active={ open ? 1 : undefined } aria-expanded={ open } data-count={ count }>
            <Icon name="users" size={ 20 } />
            <span className="wplus-call-people-count" aria-hidden="true">{ formatCount( count ) }</span>
        </span>
    </Tooltip>;
}

/**
 * Add Person (add-person.tsx) as an item the dock lays out (a Tooltip around a span), so its More sheet spells it out:
 * the dock keeps it there, in a call between two, which has no Participants. A group call has it at the top of
 * Participants (PeoplePanel's `add`). Nothing where the call can't add people.
 */
export function addPersonItem( call: Pick<CallContextInterface, 'people'>, open: boolean, toggle: () => void ) {
    if ( ! call.people ) return null;
    return <Tooltip content={_x('Add Person', 'Call Screen', 'bp-better-messages')}>
        <span onClick={ toggle } className="wplus-add-person" data-active={ open ? 1 : undefined } aria-expanded={ open }>
            <Icon name="userPlus" size={ 20 } />
        </span>
    </Tooltip>;
}

// A state of the person's, as a small glyph with what it means.
function Mark( { icon, label, tone, className }: { icon: IconName, label: string, tone?: 'on' | 'off' | 'danger' | 'warning' | 'accent', className: string } ) {
    return <Tooltip content={ label }>
        <span className={ 'wplus-call-people-mark ' + className } data-tone={ tone } role="img" aria-label={ label }>
            <Icon name={ icon } size={ 16 } />
        </span>
    </Tooltip>;
}

// What a moderator does from a row: a round button with its glyph, spinning while its request is out.
function Action( { icon, label, className, busy, onClick, open, pressed }: { icon: IconName, label: string, className: string, busy: boolean, onClick: () => void, open?: boolean, pressed?: boolean } ) {
    return <Tooltip content={ label }>
        <span className={ 'wplus-call-people-action ' + className } role="button" tabIndex={ 0 } aria-label={ label }
            aria-expanded={ open } aria-pressed={ pressed } data-active={ open || pressed ? 1 : undefined } data-busy={ busy ? 1 : undefined }
            onClick={ onClick }
            onKeyDown={ ( event ) => {
                if ( event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar' ) return;
                event.preventDefault();
                onClick();
            } }>
            <Icon name={ busy ? 'spinner' : icon } size={ 16 } className={ busy ? 'wplus-svg-animate' : undefined } />
        </span>
    </Tooltip>;
}

function PersonRow( { tileKey, person, type, spotlit }: { tileKey: string, person: CallParticipant, type: 'audio' | 'video', spotlit: boolean } ) {
    const { adminMode, connectionState, moderation, moderate, lowerHand } = useContext<CallContextInterface>( CallContext );
    const { panel, setPanel, from } = useContext( ModerationPanelContext );
    const pins = useContext( PinsContext );
    const { muteMic } = useModerationActs( moderate, type );
    // A press waits until the row shows what it asked for (pending.ts), as on the tile.
    const [ isPending, run ] = usePendingActions( [ person.micMuted, person.handRaised, person.canPublish ].join( '|' ) );

    const you = tileKey === 'me';
    const admin = adminMode && connectionState === 'connected';
    const viewer = ! person.canPublish && ! person.canAdmin;
    const held = heldMute( moderation, person );
    const micOn = ! viewer && ! held && !! person.audio;
    const weak = person.quality === 'poor' || person.quality === 'lost';
    const open = panel === tileKey && from === 'people';
    const lowers = admin && ! you && person.handRaised;
    const mutes = admin && ! you && micOn && ! person.micMuted && moderates( moderation, 'mute_mic' );
    const manages = admin && tileModerated( moderation, tileKey, type );
    // Pin for Me on a video call, where a moderator has it in the person's menu, and only where a pin shows.
    const pinShows = usePinOffered()( tileKey );
    const pinOffered = type === 'video' && ! manages && connectionState === 'connected' && pinShows;
    const pinnedHere = pins.pinned.has( tileKey );

    let mic: React.ReactNode = null;
    if ( held ) mic = <Mark icon="mute" className="wplus-call-people-mic" tone="danger" label={_x('Muted by a moderator', 'Call Moderation', 'bp-better-messages')} />;
    else if ( micOn ) mic = <Mark icon="mic" className="wplus-call-people-mic" tone={ person.isSpeaking ? 'accent' : 'on' } label={_x('Microphone Enabled', 'Group Audio Chat', 'bp-better-messages')} />;
    else if ( ! viewer ) mic = <Mark icon="micOff" className="wplus-call-people-mic" tone="off" label={_x('Microphone Disabled', 'Group Video Chat', 'bp-better-messages')} />;

    // `data-person`, not a tile's `data-key`: whatever counts the tiles by theirs must not count the rows.
    return <div className="wplus-call-people-row" role="listitem" data-person={ tileKey } data-speaking={ person.isSpeaking && micOn ? 1 : undefined }>
        <span className="wplus-call-people-avatar" aria-hidden="true"><UserAvatar user_id={ userIdOf( tileKey ) } size={ 28 } presence={ false } /></span>
        <span className="wplus-call-people-who">
            <span className="wplus-call-people-name">
                <span className="wplus-call-people-name-text">{ person.name || <UserName user_id={ userIdOf( tileKey ) } /> }</span>
                { you && <span className="wplus-call-people-you">{_x('You', 'Conversation admin', 'bp-better-messages')}</span> }
            </span>
            { ( spotlit || person.canAdmin || viewer || weak || person.reconnecting ) && <span className="wplus-call-people-tags">
                { spotlit && <span className="wplus-call-people-tag wplus-call-people-spotlit" data-tone="accent"><Icon name="star" size={ 11 } />{_x('Spotlight', 'Call Moderation', 'bp-better-messages')}</span> }
                { person.canAdmin && <span className="wplus-call-people-tag" data-tone="accent">{_x('Moderator', 'Moderator Icon Tooltip', 'bp-better-messages')}</span> }
                { viewer && <span className="wplus-call-people-tag">{_x('Viewer', 'Group Video Chat', 'bp-better-messages')}</span> }
                { person.reconnecting
                    ? <span className="wplus-call-people-tag" data-tone="warning">{_x('Reconnecting...', 'Call Screen', 'bp-better-messages')}</span>
                    : weak && <span className="wplus-call-people-tag wplus-call-people-weak" data-tone="warning"><Icon name="wifiWeak" size={ 11 } />{_x('Weak Connection', 'Call Screen', 'bp-better-messages')}</span> }
            </span> }
        </span>
        <span className="wplus-call-people-marks">
            { person.handRaised && ( lowers
                ? <Action icon="raisehand" className="wplus-call-people-lower-hand" busy={ isPending( 'hand' ) }
                    label={_x('Lower Hand', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'hand', () => lowerHand( person.identity ) ) } />
                : <Mark icon="raisehand" className="wplus-call-people-hand" tone="warning" label={_x('Hand Raised', 'Group Video Chat', 'bp-better-messages')} /> ) }
            { !! person.screen && <Mark icon="screenShare" className="wplus-call-people-screen" tone="accent" label={_x('Sharing Screen', 'Group Video Chat', 'bp-better-messages')} /> }
            { type === 'video' && ! viewer && ( person.video
                ? <Mark icon="video" className="wplus-call-people-camera" tone="on" label={_x('Camera Enabled', 'Group Video Chat', 'bp-better-messages')} />
                : <Mark icon="videoOff" className="wplus-call-people-camera" tone="off" label={_x('Camera Disabled', 'Group Video Chat', 'bp-better-messages')} /> ) }
            { mic }
        </span>
        { ( mutes || manages || pinOffered ) && <span className="wplus-call-people-actions">
            { pinOffered && <Action icon={ pinnedHere ? 'pinOff' : 'pin' } className="wplus-call-people-pin" busy={ false } pressed={ pinnedHere }
                label={ pinnedHere ? _x('Unpin for Me', 'Call Moderation', 'bp-better-messages') : _x('Pin for Me', 'Call Moderation', 'bp-better-messages') }
                onClick={ () => pins.toggle( tileKey ) } /> }
            { mutes && <Action icon="micOff" className="wplus-call-people-mute" busy={ isPending( 'mic' ) }
                label={_x('Mute Microphone', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'mic', () => muteMic( person.identity ) ) } /> }
            { manages && <Action icon="more" className="wplus-call-people-more" busy={ false } open={ open }
                label={_x('Manage Participant', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => setPanel( open ? null : tileKey, 'people' ) } /> }
        </span> }
    </div>;
}

// A control with a tooltip only where there is something to say (`tip`).
const withKeyTip = ( tip: string | null | false, control: ReactElement ) => tip ? <Tooltip content={ tip }>{ control }</Tooltip> : control;

/**
 * The list, drawn in the layout's stage (`stage`) as a column or a sheet (`mode`), clear of the bar under it.
 * `hands`: when each raised hand went up (useHandOrder).
 */
export function PeoplePanel( { stage, mode, type, hands, close, add }: {
    stage: RefObject<HTMLElement | null>,
    mode: PeopleMode,
    type: 'audio' | 'video',
    hands: Map<string, number>,
    close: () => void,
    // Add Person (add-person.tsx), at the top of the list, where the call can add people: whether its panel is open,
    // and the press that opens or closes it.
    add?: { open: boolean, toggle: () => void },
} ) {
    const { participants, adminMode, connectionState, lowerAllHands, spotlight, people: addable } = useContext<CallContextInterface>( CallContext );
    const addLabel = _x('Add Person', 'Call Screen', 'bp-better-messages');
    // The call's key for Add Person, while its pill is at the top of the list.
    const addKey = useKeyAction( 'add', () => add && addable ? { run: add.toggle, label: addLabel } : undefined );
    const spotlit = type === 'video' ? spotlitKeys( participants, spotlight ) : [];
    const muteAll = useMuteEveryone();
    const [ isPending, run ] = usePendingActions();
    const [ query, setQuery ] = useState( '' );
    const box = useRef<HTMLDivElement>( null );
    const closeRef = useRef( close );
    closeRef.current = close;

    // Clear of the bar under the tiles, whose height follows the dock's buttons.
    const [ bar, setBar ] = useState( 64 );
    useLayoutEffect( () => {
        const controls = stage.current?.querySelector<HTMLElement>( '.wplus-group-call-controls-v2' );
        if ( ! controls ) return;
        const measure = () => setBar( Math.round( controls.getBoundingClientRect().height ) || 64 );
        measure();
        if ( typeof ResizeObserver === 'undefined' ) return;
        const observer = new ResizeObserver( measure );
        observer.observe( controls );
        return () => observer.disconnect();
    }, [] );

    // A phone's keyboard, up for the search, over the foot of the stage: the sheet stands on it rather than under it.
    const keyboard = useKeyboardOver( stage, mode === 'sheet' );

    // A sheet over the call closes on a press outside it, as the dock's More does: not on its own button, nor in a
    // person's menu opened from one of its rows. What was pressed, from the path: in a shadow root (the elements
    // script's) the document is told the root's host.
    useEffect( () => {
        if ( mode !== 'sheet' ) return;
        const onPress = ( event: PointerEvent ) => {
            const target = ( event.composedPath?.()[ 0 ] ?? event.target ) as Element | null;
            if ( ! target || box.current?.contains( target ) || target.closest?.( '.wplus-call-people-toggle, .wplus-call-popover' ) ) return;
            closeRef.current();
        };
        document.addEventListener( 'pointerdown', onPress, true );
        return () => document.removeEventListener( 'pointerdown', onPress, true );
    }, [ mode ] );

    const people = peopleOf( participants );
    const order = peopleOrder( people, hands );
    const searches = people.size >= PEOPLE_SEARCH_FROM;
    const wanted = searches ? folded( query.trim() ) : '';
    const shown = wanted ? order.filter( ( key ) => folded( people.get( key )?.name ?? '' ).includes( wanted ) ) : order;
    const handsUp = [ ...people.values() ].some( ( person ) => person.handRaised );
    const admin = adminMode && connectionState === 'connected';
    const title = _x('Participants', 'Group Video Chat', 'bp-better-messages');

    return <div ref={ box } className="wplus-call-people wplus-call-moderation" data-mode={ mode } role="dialog" aria-label={ title }
        style={ mode === 'sheet' ? { bottom: Math.max( bar + 4, keyboard + 8 ), maxHeight: `calc(100% - ${ Math.max( bar + 12, keyboard + 16 ) }px)` } : { bottom: bar } }
        onKeyDown={ ( event ) => {
            // Escape closes the list where it is pressed, before the call's own Escape (an expanded call collapses on
            // it, call-view.tsx), and leaves a person's menu over it to close itself first.
            if ( event.key !== 'Escape' || stage.current?.querySelector( '.wplus-call-popover' ) ) return;
            event.stopPropagation();
            close();
        } }>
        <div className="wplus-call-people-head">
            <span className="wplus-call-people-title">{ title }</span>
            <span className="wplus-call-people-total">{ formatCount( people.size ) }</span>
            {/* Its own label, so its tooltip says only what the label does not: the call's key, while the keys listen. */}
            { ( add && addable ) && withKeyTip( addKey && addLabel + ' (' + addKey.name + ')',
                <span className="wplus-call-people-add wplus-add-person" role="button" tabIndex={ 0 } aria-expanded={ add.open }
                    aria-label={ addKey ? addLabel : undefined }
                    aria-keyshortcuts={ addKey?.aria }
                    data-active={ add.open ? 1 : undefined }
                    onClick={ add.toggle }
                    onKeyDown={ ( event ) => {
                        if ( event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar' ) return;
                        event.preventDefault();
                        add.toggle();
                    } }>
                    <Icon name="userPlus" size={ 16 } />
                    <span>{ addLabel }</span>
                </span> ) }
            <Tooltip content={_x('Close', '"Close" Button Tooltip', 'bp-better-messages')}>
                <span className="wplus-call-people-close" role="button" tabIndex={ 0 } aria-label={_x('Close', '"Close" Button Tooltip', 'bp-better-messages')}
                    onClick={ close }
                    onKeyDown={ ( event ) => {
                        if ( event.key !== 'Enter' && event.key !== ' ' ) return;
                        event.preventDefault();
                        close();
                    } }>
                    <Icon name="x" size={ 16 } />
                </span>
            </Tooltip>
        </div>

        { searches && <label className="wplus-call-people-search">
            <Icon name="search" size={ 14 } />
            <input type="search" value={ query } onChange={ ( event ) => setQuery( event.target.value ) }
                placeholder={_x('Search...', 'Search input field placeholder', 'bp-better-messages')}
                aria-label={_x('Search...', 'Search input field placeholder', 'bp-better-messages')} />
        </label> }

        {/* The room's rules a moderator reaches for while looking down the list, as in Host Controls. */}
        { admin && ( muteAll.offered || handsUp ) && <div className="wplus-call-people-room">
            { muteAll.offered &&
                <ModerationRow icon="micOff" className="wplus-call-people-mute-all" checked={ muteAll.on } busy={ muteAll.busy }
                    label={_x('Mute Everyone', 'Call Moderation', 'bp-better-messages')}
                    onClick={ muteAll.toggle } /> }
            { handsUp &&
                <ModerationRow icon="raisehand" className="wplus-call-people-lower-hands" busy={ isPending( 'hands' ) }
                    label={_x('Lower All Hands', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'hands', async () => {
                        try {
                            await lowerAllHands();
                        } catch ( e ) {
                            host().showError( e );
                        }
                    } ) } /> }
        </div> }

        <PeopleRows keys={ shown } people={ people } type={ type } spotlit={ spotlit } />
    </div>;
}

/**
 * How much of the stage's foot the on-screen keyboard hides, in pixels: the stage's bottom past the visual viewport's,
 * both read in the page's rect coordinates. A fixed marker at (0, 0) says where those start, as WebKit on iOS reads a
 * rect from the visual viewport while the keyboard is up and Chrome from the layout one (primitives/viewport.ts).
 */
function useKeyboardOver( stage: RefObject<HTMLElement | null>, on: boolean ): number {
    const [ over, setOver ] = useState( 0 );
    useEffect( () => {
        const view = typeof window !== 'undefined' ? window.visualViewport : null;
        if ( ! on || ! view ) return;
        const probe = createFixedProbe();
        const read = () => {
            const el = stage.current;
            if ( ! el ) return;
            const seen = fixedOrigin( probe ).top + view.offsetTop + view.height;
            setOver( Math.max( 0, Math.round( el.getBoundingClientRect().bottom - seen ) ) );
        };
        read();
        view.addEventListener( 'resize', read );
        view.addEventListener( 'scroll', read );
        return () => {
            view.removeEventListener( 'resize', read );
            view.removeEventListener( 'scroll', read );
            probe.remove();
        };
    }, [ on ] );
    return on ? over : 0;
}

/** From how many rows the list draws only those in view. */
export const PEOPLE_WINDOW_FROM = 60;
/** A row's height while the list is windowed, as its stylesheet holds it (_people.scss, [data-windowed]). */
export const PEOPLE_ROW_HEIGHT = 52;
const WINDOW_SPARE = 10;

// The list's rows: every one in a call of a few dozen, and only those in view, with some either side, in a bigger one
// (an audio call of a thousand), the rest of its height held by space above and below.
function PeopleRows( { keys, people, type, spotlit }: { keys: string[], people: Map<string, CallParticipant>, type: 'audio' | 'video', spotlit: string[] } ) {
    const list = useRef<HTMLDivElement>( null );
    const windowed = keys.length >= PEOPLE_WINDOW_FROM;
    const [ view, setView ] = useState( { top: 0, height: 600 } );

    useEffect( () => {
        const el = list.current;
        if ( ! el || ! windowed ) return;
        const read = () => setView( ( was ) => was.top === el.scrollTop && was.height === ( el.clientHeight || 600 ) ? was : { top: el.scrollTop, height: el.clientHeight || 600 } );
        read();
        el.addEventListener( 'scroll', read, { passive: true } );
        return () => el.removeEventListener( 'scroll', read );
    }, [ windowed ] );

    const from = windowed ? Math.max( 0, Math.floor( view.top / PEOPLE_ROW_HEIGHT ) - WINDOW_SPARE ) : 0;
    const to = windowed ? Math.min( keys.length, Math.ceil( ( view.top + view.height ) / PEOPLE_ROW_HEIGHT ) + WINDOW_SPARE ) : keys.length;
    const spotlitSet = new Set( spotlit );

    return <div ref={ list } className="wplus-call-people-list" role="list" data-windowed={ windowed ? 1 : undefined } aria-rowcount={ windowed ? keys.length : undefined }>
        { windowed && from > 0 && <div className="wplus-call-people-spacer" aria-hidden="true" style={ { height: from * PEOPLE_ROW_HEIGHT } } /> }
        { keys.slice( from, to ).map( ( key ) => <PersonRow key={ key } tileKey={ key } person={ people.get( key )! } type={ type } spotlit={ spotlitSet.has( key ) } /> ) }
        { windowed && to < keys.length && <div className="wplus-call-people-spacer" aria-hidden="true" style={ { height: ( keys.length - to ) * PEOPLE_ROW_HEIGHT } } /> }
        { keys.length === 0 && <div className="wplus-call-people-empty">{_x('Nothing found', 'Search Results', 'bp-better-messages')}</div> }
    </div>;
}
