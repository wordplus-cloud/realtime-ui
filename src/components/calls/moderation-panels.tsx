import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallParticipant } from "./context.ts";
import { moderates, useModerationActs } from "./moderation.ts";
import usePendingActions from "../../inc/calls/pending.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon, { type IconName } from "../../primitives/icons.tsx";
import UserAvatar from "../users/user-avatar.tsx";
import { host } from "../../host.ts";
import { handSoundOn, joinAlertsOn, keepHandSound, keepJoinAlerts } from "./host-toasts.tsx";
import { PinsContext, SPOTLIGHT_MOST, spotlightFull, spotlitKeys, useSpotlightActs } from "./spotlight.tsx";
import { RecordingLayerContext, recordingOn, startNote } from "./recording.tsx";
import { useTurnOnAskActs } from "./ask-prompt.tsx";
import { usePinOffered } from "./layout-choice.tsx";
import { useKeyHint } from "./call-keys.tsx";
import type { CallShortcut } from "../../inc/calls/keys.ts";

/**
 * A moderator's controls, spelled out: the room's (Host Controls in the dock) and one person's (the ⋯ on their tile),
 * each a menu that opens at the button that opened it, whose rows say what they do and what is on now. They were bare
 * icons: Mute All beside the user's own microphone, a pressed Mute Microphone turning into a plain microphone, and
 * nothing on the tile but the corner chip of someone who never turned theirs on.
 *
 * The group video and audio layouts keep which menu is open and hand it to their tiles through
 * ModerationPanelContext: 'room', a tile's key, or null, and for a person's menu whether it was opened from their tile
 * or their row in the People list (people-panel.tsx), where it opens. The menus are drawn in the layout's own box
 * (`stage`), which places them beside their button and keeps them inside it, as a tile or the dock can't: a small tile
 * or the stage's floor would cut a menu off.
 */
export type ModerationPanel = 'room' | string | null;

/** Where a person's menu was opened from: the ⋯ on their tile, or the ⋯ on their row in the People list. */
export type ModerationPanelFrom = 'tile' | 'people';

export const ModerationPanelContext = createContext<{
    panel: ModerationPanel,
    setPanel: ( panel: ModerationPanel, from?: ModerationPanelFrom ) => void,
    from?: ModerationPanelFrom,
}>( { panel: null, setPanel: () => {} } );

/** Which menu is open and where a person's was opened from, as a group layout keeps them for ModerationPanelContext. */
export function useModerationPanel() {
    const [ open, setOpen ] = useState<{ panel: ModerationPanel, from: ModerationPanelFrom }>( { panel: null, from: 'tile' } );
    const setPanel = useCallback( ( panel: ModerationPanel, from: ModerationPanelFrom = 'tile' ) => setOpen( { panel, from } ), [] );
    const close = useCallback( () => setOpen( ( was ) => ( { panel: null, from: was.from } ) ), [] );
    return { panel: open.panel, from: open.from, setPanel, close };
}

/**
 * Whether the call takes any of the room's acts, which is when a moderator is offered Host Controls: Record among them,
 * where the call's recording says they may.
 */
export function roomModerated( moderation: CallContextInterface['moderation'], recording?: CallContextInterface['recording'] ): boolean {
    return !! recording?.can || [ 'mute_all', 'lock_room', 'set_broadcast_mode', 'set_participatory_mode', 'end_call' ].some( ( act ) => moderates( moderation, act ) );
}

/**
 * Whether a moderator keeps this person's microphone off: `micMuted` in a call whose moderators let a microphone back
 * on (`unmute_mic`), as Better Messages' do. An app's call has no such hold, and its `micMuted` is a microphone simply off.
 */
export function heldMute( moderation: CallContextInterface['moderation'], participant: CallParticipant ): boolean {
    return participant.micMuted && moderates( moderation, 'unmute_mic' );
}

/** One thing that is on for a person, as their menu's header says it: what, its glyph, and its tone. */
export interface PersonStateItem {
    key: string,
    label: string,
    icon: IconName,
    tone: 'danger' | 'warning' | 'neutral',
}

/** What is on for the person now, as their menu's header and their tile say it. */
export function personState( participant: CallParticipant, moderation: CallContextInterface['moderation'] ): PersonStateItem[] {
    const state: PersonStateItem[] = [];
    if ( participant.handRaised ) state.push( { key: 'hand', label: _x('Hand Raised', 'Group Video Chat', 'bp-better-messages'), icon: 'raisehand', tone: 'warning' } );
    if ( ! participant.canPublish && ! participant.canAdmin ) state.push( { key: 'viewer', label: _x('Viewer', 'Group Video Chat', 'bp-better-messages'), icon: 'videoOff', tone: 'neutral' } );
    else if ( heldMute( moderation, participant ) ) state.push( { key: 'held', label: _x('Muted by a moderator', 'Call Moderation', 'bp-better-messages'), icon: 'mute', tone: 'danger' } );
    else if ( ! participant.audio && ! participant.screenAudio ) state.push( { key: 'mic', label: _x('Microphone Disabled', 'Group Video Chat', 'bp-better-messages'), icon: 'micOff', tone: 'neutral' } );
    return state;
}

// A user of the app by their tile's key: their id of digits as a number, as Better Messages has it, any other as it is,
// and the user's own for their own tile.
export function userIdOf( tileKey: string ): number | string {
    if ( ! tileKey.startsWith( 'user_' ) ) return host().currentUserId();
    const id = tileKey.substring( 5 );
    return /^[1-9][0-9]*$/.test( id ) ? Number( id ) : id;
}

/**
 * The dock's Host Controls, as an item the dock lays out and folds like its others (a Tooltip around a span: call-dock.tsx
 * reads its label from the tooltip). Latched while its panel is open; warning-toned while a room rule holds, so a
 * moderator sees from the dock that everyone is muted, the call locked or broadcasting.
 */
export function hostControlsItem( open: boolean, ruled: boolean, toggle: () => void ) {
    return <Tooltip content={_x('Host Controls', 'Call Moderation', 'bp-better-messages')}>
        <span onClick={ toggle } className="wplus-host-controls" data-active={ open ? 1 : undefined } data-ruled={ ruled ? 1 : undefined } aria-expanded={ open }>
            <Icon name="shield" size={ 20 } />
        </span>
    </Tooltip>;
}

const NOTICE_MS = 6000;

/**
 * What the user is told when a moderator mutes their microphone or lets them unmute it, in the call's status line for
 * a few seconds: the microphone button turns into a locked one, which alone said nothing of who did it or why.
 * `remind` says it again, for a press on the locked button.
 */
export function useModeratorNotice( myMicMuted: boolean ): { notice: string, remind: () => void } {
    const [ notice, setNotice ] = useState( '' );
    const timer = useRef<ReturnType<typeof setTimeout> | null>( null );
    const was = useRef( myMicMuted );

    const say = ( text: string ) => {
        setNotice( text );
        if ( timer.current ) clearTimeout( timer.current );
        timer.current = setTimeout( () => setNotice( '' ), NOTICE_MS );
    };

    useEffect( () => {
        if ( myMicMuted === was.current ) return;
        was.current = myMicMuted;
        say( myMicMuted ? mutedByModerator() : _x('A moderator allowed you to unmute your microphone.', 'Call Moderation', 'bp-better-messages') );
    }, [ myMicMuted ] );

    useEffect( () => () => {
        if ( timer.current ) clearTimeout( timer.current );
    }, [] );

    return { notice, remind: () => say( mutedByModerator() ) };
}

const mutedByModerator = () => _x('A moderator muted your microphone.', 'Call Moderation', 'bp-better-messages');

/**
 * The user's own microphone while a moderator keeps it off: in the dock where it was, the silenced glyph (a speaker
 * crossed out) on the amber of a restriction a moderator holds, rather than gone. A press says why again in the
 * status line.
 */
export function lockedMicItem( remind: () => void ) {
    return <Tooltip content={ mutedByModerator() }>
        <span onClick={ remind } className="wplus-mic-locked" aria-disabled="true">
            <Icon name="mute" size={ 20 } />
        </span>
    </Tooltip>;
}

/**
 * A tile's mark for a microphone a moderator muted: the round red chip a microphone off has, with the silenced glyph
 * (a speaker crossed out) in place of the crossed microphone. A lock badge on the chip was too small to see, and a red
 * pill that said Muted shouted over the tile.
 */
export function MicLockedChip() {
    return <Tooltip content={_x('Muted by a moderator', 'Call Moderation', 'bp-better-messages')}>
        <span className="wplus-mic-disabled wplus-mic-locked-chip">
            <Icon name="mute" size={ 14 } />
        </span>
    </Tooltip>;
}

/**
 * The ⋯ on a tile that opens its person's panel, for a moderator, after what the tile puts beside it (`children`: Pin
 * for Me, spotlight.tsx). `shown` keeps the row on show without a hover, as for a pinned tile.
 */
export function ManageParticipant( { tileKey, participant, children, shown }: { tileKey: string, participant: CallParticipant, children?: ReactNode, shown?: boolean } ) {
    const { panel, setPanel, from } = useContext( ModerationPanelContext );
    // Their menu opened from their row in the People list is the list's: a press here moves it to the tile.
    const open = panel === tileKey && from !== 'people';

    return <span className="wplus-admin-controls" data-open={ open || shown ? 1 : undefined }>
        { children }
        <Tooltip content={_x('Manage Participant', 'Call Moderation', 'bp-better-messages')}>
            <span onClick={ () => setPanel( open ? null : tileKey, 'tile' ) } className="wplus-manage-participant" data-active={ open ? 1 : undefined } aria-expanded={ open } data-name={ participant.name }>
                <Icon name="more" size={ 14 } />
            </span>
        </Tooltip>
    </span>;
}

/**
 * Whether a moderator has anything to do on this tile: spotlight it for everyone (a video tile: an audio roster has no
 * main tiles), or for anyone else, any of the person's acts.
 */
export function tileModerated( moderation: CallContextInterface['moderation'], tileKey: string, type: 'audio' | 'video' ): boolean {
    if ( type === 'video' && ( moderates( moderation, 'spotlight_participant' ) || moderates( moderation, 'pin_participant' ) ) ) return true;
    if ( tileKey === 'me' ) return false;
    return [ 'mute_mic', 'mute_participant', 'remove_participant' ].some( ( act ) => moderates( moderation, act ) );
}

// The buttons that open a menu: a press on one is theirs to handle (open another, or close this one), not a press
// outside that closes it.
const TOGGLES = '.wplus-manage-participant, .wplus-host-controls, .wplus-call-people-more';

// The People list standing as a column at the stage's end edge (people-panel.tsx): a menu held to that edge as the
// dock is stands at the column's start edge instead, over the tiles rather than over the list.
const COLUMN = '.wplus-call-people[data-mode="column"]';

// Between a menu and its button, and the least clearance from the stage's edges.
const GAP = 6;
const EDGE = 8;
// A menu held to the stage's end edge keeps the dock's own clearance from it (the bar's padding, _call-stage.scss).
const DOCK_EDGE = 14;

interface Place {
    left: number,
    top: number,
    maxHeight: number,
    up: boolean,
}

/**
 * A menu in the stage beside its button: on the side asked where it fits, or on the side with more room, aligned to
 * the button's start or end edge, or held to the stage's end edge as the dock is (`stage-end`), moved in from the
 * stage's edges, and no taller than the side's room (scrolling the rest). Placed again as the stage or the tiles move.
 * `anchor`: what it opens beside, by selectors tried in turn. Escape and a press outside close it, but for one on
 * `keep`, the button that toggles it where that is none of TOGGLES. The dock's More is one too (call-dock.tsx).
 */
export function CallPopover( { stage, anchor, side, align, label, className, close, keep, children }: {
    stage: RefObject<HTMLElement | null>,
    anchor: string[],
    side: 'above' | 'below',
    align: 'start' | 'end' | 'stage-end',
    label: string,
    className: string,
    close: () => void,
    keep?: string,
    children: ReactNode,
} ) {
    const box = useRef<HTMLDivElement>( null );
    const [ place, setPlace ] = useState<Place | null>( null );
    const closeRef = useRef( close );
    closeRef.current = close;

    const measure = () => {
        const root = stage.current;
        const menu = box.current;
        if ( ! root || ! menu ) return;
        const button = anchor.map( ( selector ) => root.querySelector<HTMLElement>( selector ) ).find( ( found ) => found && found.offsetParent !== null );
        if ( ! button ) return;

        const s = root.getBoundingClientRect();
        const a = button.getBoundingClientRect();
        const rtl = getComputedStyle( root ).direction === 'rtl';
        const width = menu.offsetWidth;
        const height = menu.scrollHeight;

        const above = a.top - s.top - GAP - EDGE;
        const below = s.bottom - a.bottom - GAP - EDGE;
        const up = side === 'above' ? ( height <= above || above >= below ) : ( height > below && above > below );
        const room = Math.max( 80, up ? above : below );
        const shown = Math.min( height, room );

        const start = ( align === 'start' ) !== rtl;
        const column = root.querySelector<HTMLElement>( COLUMN )?.offsetWidth ?? 0;
        const left = align === 'stage-end'
            ? Math.max( EDGE, rtl ? DOCK_EDGE + column : s.width - width - DOCK_EDGE - column )
            : Math.max( EDGE, Math.min( s.width - width - EDGE, ( start ? a.left : a.right - width ) - s.left ) );
        const top = up ? a.top - s.top - GAP - shown : a.bottom - s.top + GAP;

        const next = { left: Math.round( left ), top: Math.round( top ), maxHeight: Math.floor( room ), up };
        setPlace( ( was ) => was && was.left === next.left && was.top === next.top && was.maxHeight === next.maxHeight && was.up === next.up ? was : next );
    };

    // Each render, before it is painted: a person joining or leaving moves the tiles, and a menu's rows change its height.
    useLayoutEffect( measure );

    useEffect( () => {
        // And every frame while open: a tile pinned to the stage, or someone made a speaker or a viewer, moves the
        // grid after the render, through its own transition, and the menu went on pointing at where the tile was.
        // Placed only when it moved (setPlace keeps the same place), so a still menu costs a measurement a frame.
        let frame = 0;
        const follow = () => {
            measure();
            frame = requestAnimationFrame( follow );
        };
        if ( typeof requestAnimationFrame === 'function' ) frame = requestAnimationFrame( follow );

        // Escape closes the menu alone, before the call's own Escape (an expanded call collapses on it, call-view.tsx).
        const onKey = ( event: KeyboardEvent ) => {
            if ( event.key !== 'Escape' ) return;
            event.stopPropagation();
            closeRef.current();
        };
        // What was pressed, from the path: in a shadow root (the elements script's) the document is told the root's
        // host, so a press on a row was outside the menu, which went before the row's click.
        const onPress = ( event: PointerEvent ) => {
            const target = ( event.composedPath?.()[ 0 ] ?? event.target ) as Element | null;
            if ( ! target || box.current?.contains( target ) || target.closest?.( TOGGLES ) || ( keep && target.closest?.( keep ) ) ) return;
            closeRef.current();
        };
        document.addEventListener( 'keydown', onKey, true );
        document.addEventListener( 'pointerdown', onPress, true );

        return () => {
            if ( frame ) cancelAnimationFrame( frame );
            document.removeEventListener( 'keydown', onKey, true );
            document.removeEventListener( 'pointerdown', onPress, true );
        };
    }, [] );

    return <div
        ref={ box }
        className={ 'wplus-call-popover ' + className }
        role="menu"
        aria-label={ label }
        data-side={ place ? ( place.up ? 'above' : 'below' ) : undefined }
        data-align={ align }
        style={ place ? { left: place.left, top: place.top, maxHeight: place.maxHeight } : { visibility: 'hidden', left: 0, top: 0 } }
    >
        { children }
    </div>;
}

interface RowProps {
    icon: IconName,
    label: string,
    note?: string,
    className: string,
    busy: boolean,
    onClick: () => void,
    // A rule the room keeps (everyone muted, locked, broadcasting): drawn as a switch that says whether it is on.
    checked?: boolean,
    danger?: boolean,
    highlight?: boolean,
    // Can't be done now, which the note says why: drawn dimmed, and a press does nothing.
    disabled?: boolean,
    // One of a choice, as the Layout menu's (layout-choice.tsx): `checked` drawn as a radio, not a switch.
    radio?: boolean,
    // The call's key that does what the row does (call-keys.tsx), shown at its end while the keys listen.
    keys?: CallShortcut,
}

// A row is a span with a menu item's role and keys, not a <button>: inside the messenger a site's and Better Messages'
// own resets style every button with !important (no padding, no corners, no background, the colour inherited), which
// laid the rows flat against the menu's edge and turned Remove from Call white. The call's other controls are spans
// for the same reason (helpers/tooltip.tsx). The People list's own rows for the room are these too (people-panel.tsx).
export function ModerationRow( { icon, label, note, className, busy, onClick, checked, danger, highlight, disabled, radio, keys }: RowProps ) {
    const toggle = checked !== undefined;
    const hint = useKeyHint( keys );

    return <span
        className={ 'wplus-call-moderation-row ' + className + ( danger ? ' wplus-call-moderation-danger' : '' ) + ( highlight ? ' wplus-call-moderation-highlight' : '' ) }
        role={ radio ? 'menuitemradio' : toggle ? 'menuitemcheckbox' : 'menuitem' }
        tabIndex={ 0 }
        aria-checked={ toggle ? checked : undefined }
        aria-disabled={ disabled ? true : undefined }
        aria-label={ label }
        aria-keyshortcuts={ hint?.aria }
        data-busy={ busy ? 1 : undefined }
        data-on={ checked ? 1 : undefined }
        onClick={ disabled ? undefined : onClick }
        onKeyDown={ ( event ) => {
            if ( event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar' ) return;
            event.preventDefault();
            if ( ! disabled ) onClick();
        } }
    >
        <span className="wplus-call-moderation-icon" aria-hidden="true">
            <Icon name={ busy ? 'spinner' : icon } size={ 16 } className={ busy ? 'wplus-svg-animate' : undefined } />
        </span>
        <span className="wplus-call-moderation-text">
            <span className="wplus-call-moderation-label">{ label }</span>
            { note && <span className="wplus-call-moderation-note">{ note }</span> }
        </span>
        { hint && <span className="wplus-call-key-hint" aria-hidden="true">{ hint.name }</span> }
        { toggle && <span className={ radio ? 'wplus-call-moderation-radio' : 'wplus-call-moderation-switch' } aria-hidden="true" /> }
    </span>;
}

/**
 * Mute Everyone, as Host Controls and the People list offer it: whether the call takes it, whether it is on, its
 * request out, and the press, which mutes, or lets back on, everyone else's microphone but the moderators' and flips
 * once its request succeeds. One request at a time, whichever of the two it was pressed in.
 */
export function useMuteEveryone() {
    const { callInfo, moderate, moderation, participants, roomMuted, setRoomMuted } = useContext<CallContextInterface>( CallContext );
    const [ isPending, run ] = usePendingActions();
    // Whose microphones it mutes and lets back on: everyone else but the moderators.
    const others = Array.from( participants.entries() ).filter( ( [ key, p ] ) => key !== 'me' && ! p.canAdmin ).map( ( [ , p ] ) => p.identity );

    return {
        offered: moderates( moderation, roomMuted ? 'unmute_all' : 'mute_all' ),
        on: roomMuted,
        busy: isPending( 'room-mute' ),
        toggle: () => run( 'room-mute', async () => {
            try {
                await moderate( { act: roomMuted ? 'unmute_all' : 'mute_all', type: callInfo.type, identities: others } );
                setRoomMuted( ! roomMuted );
            } catch ( e ) {
                host().showError( e );
            }
        } ),
    };
}

/**
 * The room's rules for a moderator: everyone's microphone, the lock, broadcast mode, lowering every raised hand while
 * one is up, clearing the spotlight while anyone is in it (spotlight.tsx), the sound of a raised hand and the toasts of
 * who joined on this device (host-toasts.tsx), and ending the
 * call for everyone, asked again in the app's dialog (UiHost.confirm) before it goes. Each rule flips once its request
 * succeeds, as the dock's buttons did.
 */
export function RoomPanel( { stage, close }: { stage: RefObject<HTMLElement | null>, close: () => void } ) {
    const {
        callInfo, moderate, moderation, participants,
        roomLocked, setRoomLocked,
        callMode, setCallMode, lowerAllHands, endForEveryone, spotlight, recording,
    } = useContext<CallContextInterface>( CallContext );
    const recordingLayer = useContext( RecordingLayerContext );
    const [ isPending, run ] = usePendingActions();
    const [ handSound, setHandSound ] = useState( handSoundOn );
    const [ joinAlerts, setJoinAlerts ] = useState( joinAlertsOn );

    // The menu closes first: the dialog is the app's, outside the menu, and a press in it or its Escape would close the
    // menu under it anyway.
    const endCall = async ( end: () => Promise<unknown> ) => {
        close();
        const yes = await host().confirm( {
            title: _x('End the call for everyone?', 'Call Moderation', 'bp-better-messages'),
            message: _x('Everyone leaves the call, you too.', 'Call Moderation', 'bp-better-messages'),
            confirm: _x('End for Everyone', 'Call Moderation', 'bp-better-messages'),
            danger: true,
        } );
        if ( ! yes ) return;
        try {
            await end();
        } catch ( e ) {
            host().showError( e );
        }
    };

    const act = ( key: string, request: () => Promise<unknown> ) => run( key, async () => {
        try {
            await request();
        } catch ( e ) {
            host().showError( e );
        }
    } );

    const broadcast = callMode === 'broadcast';
    const handsUp = Array.from( participants.values() ).some( ( p ) => p.handRaised );
    const muteAll = useMuteEveryone();
    const spot = useSpotlightActs();
    const spotlit = spotlitKeys( participants, spotlight );

    const title = _x('Host Controls', 'Call Moderation', 'bp-better-messages');

    // Above the dock, against the stage's end edge where the dock ends too, the same on a phone and a desktop.
    return <CallPopover stage={ stage } anchor={ [ '.wplus-group-call-controls-buttons', '.wplus-host-controls' ] } side="above" align="stage-end" label={ title } close={ close } className="wplus-call-moderation wplus-call-moderation-room">
        <div className="wplus-call-moderation-head">
            <span className="wplus-call-moderation-badge" aria-hidden="true"><Icon name="shield" size={ 16 } /></span>
            <span className="wplus-call-moderation-title">{ title }</span>
        </div>
        { muteAll.offered &&
            <ModerationRow icon="micOff" className="wplus-room-mute" checked={ muteAll.on } busy={ muteAll.busy }
                label={_x('Mute Everyone', 'Call Moderation', 'bp-better-messages')}
                note={_x('Microphones stay off until you allow them again. Cameras and screens keep going.', 'Call Moderation', 'bp-better-messages')}
                onClick={ muteAll.toggle } /> }

        { moderates( moderation, roomLocked ? 'unlock_room' : 'lock_room' ) &&
            <ModerationRow icon="lock" className="wplus-room-lock" checked={ roomLocked } busy={ isPending( 'room-lock' ) }
                label={_x('Lock Room', 'Group Video Chat', 'bp-better-messages')}
                note={_x('Nobody else can join.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => act( 'room-lock', async () => {
                    await moderate( { act: roomLocked ? 'unlock_room' : 'lock_room', type: callInfo.type } );
                    setRoomLocked( ! roomLocked );
                } ) } /> }

        { moderates( moderation, broadcast ? 'set_participatory_mode' : 'set_broadcast_mode' ) &&
            <ModerationRow icon="megaphone" className="wplus-room-broadcast" checked={ broadcast } busy={ isPending( 'mode' ) }
                label={_x('Broadcast Mode', 'Call Moderation', 'bp-better-messages')}
                note={_x('Only speakers can turn on a camera or microphone. Everyone else watches and can raise a hand.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'mode', () => setCallMode( broadcast ? 'participatory' : 'broadcast' ) ) } /> }

        { ( broadcast || moderates( moderation, 'raise_hand' ) ) &&
            <ModerationRow icon="bell" className="wplus-room-hand-sound" checked={ handSound } busy={ false }
                label={_x('Sound for Raised Hands', 'Call Moderation', 'bp-better-messages')}
                note={_x('A short sound when someone raises a hand, on this device.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => {
                    keepHandSound( ! handSound );
                    setHandSound( ! handSound );
                } } /> }

        <ModerationRow icon="userPlus" className="wplus-room-join-alerts" checked={ joinAlerts } busy={ false }
            label={_x('Join Alerts', 'Call Moderation', 'bp-better-messages')}
            note={_x('A toast when someone joins the call, on this device.', 'Call Moderation', 'bp-better-messages')}
            onClick={ () => {
                keepJoinAlerts( ! joinAlerts );
                setJoinAlerts( ! joinAlerts );
            } } />

        { handsUp && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <ModerationRow icon="raisehand" className="wplus-lower-all-hands" busy={ isPending( 'hands' ) }
                label={_x('Lower All Hands', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'hands', lowerAllHands ) } />
        </> }

        {/* An act, not a rule of the room: it asks first in the call's own dialog (recording.tsx), and the pill at the
            top of the call stops it too. */}
        { recording?.can && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            { recordingOn( recording )
                ? <ModerationRow icon="record" className="wplus-room-record" danger busy={ recording.state === 'starting' } keys="record"
                    label={_x('Stop Recording', 'Call recording', 'bp-better-messages')}
                    note={_x('Asks you first. It is ready to watch a few minutes later.', 'Call recording', 'bp-better-messages')}
                    onClick={ () => {
                        if ( recording.state !== 'on' ) return;
                        close();
                        recordingLayer.confirm( 'stop' );
                    } } />
                : <ModerationRow icon="record" className="wplus-room-record" busy={ recording.state === 'stopping' } keys="record"
                    label={_x('Start Recording', 'Call recording', 'bp-better-messages')}
                    note={ startNote( recording ) }
                    onClick={ () => {
                        if ( recording.state !== 'off' ) return;
                        close();
                        recordingLayer.confirm( 'start' );
                    } } /> }
        </> }

        { ( spotlit.length > 0 && spot.clears ) && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <ModerationRow icon="star" className="wplus-room-clear-spotlight" busy={ isPending( 'spotlight' ) }
                label={_x('Clear Spotlight', 'Call Moderation', 'bp-better-messages')}
                note={_x('Everyone sees the usual tiles again.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'spotlight', spot.clear ) } />
        </> }

        { ( endForEveryone && moderates( moderation, 'end_call' ) ) && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <ModerationRow icon="logout" className="wplus-room-end" danger busy={ false }
                label={_x('End for Everyone', 'Call Moderation', 'bp-better-messages')}
                note={_x('Everyone leaves the call, you too.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => void endCall( endForEveryone ) } />
        </> }
    </CallPopover>;
}

/**
 * One person's actions, for a moderator: on a video call the spotlight for everyone and their own Pin for Me
 * (spotlight.tsx), and for anyone else their microphone, whether they may send at all (a viewer or a speaker, by the
 * call's mode), their raised hand, and removing them. Its second line says what is on now. A row waits until the tile
 * shows what it asked for (pending.ts), and the panel closes when they leave.
 */
export function PersonPanel( { stage, tileKey, type, close, from = 'tile' }: { stage: RefObject<HTMLElement | null>, tileKey: string, type: 'audio' | 'video', close: () => void, from?: ModerationPanelFrom } ) {
    const {
        participants, moderate, moderation, callMode, promoteParticipant, demoteParticipant, lowerHand, spotlight, banFromCalls,
    } = useContext<CallContextInterface>( CallContext );
    const participant = participants.get( tileKey );
    const { kickUser, muteUser, unmuteUser, muteMic, unmuteMic, pinUser, unpinUser } = useModerationActs( moderate, type );
    const spot = useSpotlightActs();
    const asks = useTurnOnAskActs();
    const pins = useContext( PinsContext );
    const pinOffered = usePinOffered()( tileKey );
    const spotlit = spotlitKeys( participants, spotlight );
    const inSpotlight = spotlit.includes( tileKey );

    const [ isPending, run ] = usePendingActions(
        participant ? [ participant.isPinned, inSpotlight, participant.canPublish, participant.micMuted, participant.handRaised ].join( '|' ) : 'gone'
    );

    useEffect( () => {
        if ( ! participant ) close();
    }, [ !! participant ] );

    if ( ! participant ) return null;

    const identity = participant.identity;
    const other = tileKey !== 'me';
    const broadcast = callMode === 'broadcast';
    const state = personState( participant, moderation );
    const video = type === 'video';
    const full = spotlit.length >= SPOTLIGHT_MOST;
    const pinnedHere = pins.pinned.has( tileKey );
    const removable = other && moderates( moderation, 'remove_participant' );
    const quoted = tileKey.replace( /["\\]/g, '\\$&' );
    const onTile = `[data-key="${ quoted }"] .wplus-manage-participant`;
    // From Participants: below the row's ⋯, toward the tiles, and at their tile should the list close under it.
    const anchor = from === 'people' ? [ `.wplus-call-people [data-person="${ quoted }"] .wplus-call-people-more`, onTile ] : [ onTile ];
    // What is off to ask for: their microphone, unless a moderator holds it off, and on a video call their camera. Both
    // off, one row asks for both (asked on 2026-11-02: "i have 2 options and need to click both of them"), unless one
    // of them was asked for alone a moment ago, when each keeps its own row.
    const askMicrophone = other && participant.canPublish && asks.offered( 'microphone' ) && ! participant.audio && ! participant.micMuted;
    const askCamera = other && video && participant.canPublish && asks.offered( 'camera' ) && ! participant.video && ! participant.videoPublished;
    const askBoth = askMicrophone && askCamera && asks.offered( 'both' ) && asks.isAsked( identity, 'camera' ) === asks.isAsked( identity, 'microphone' );
    // Whether they send anything a stop would take: their microphone, camera or screen.
    const sending = !! ( participant.audio || participant.video || participant.videoPublished || participant.screen || participant.screenPublished || participant.screenAudio );

    return <CallPopover stage={ stage } anchor={ anchor } side="below" align={ from === 'people' ? 'end' : 'start' } label={ participant.name } close={ close } className="wplus-call-moderation wplus-call-moderation-person">
        <div className="wplus-call-moderation-head">
            <span className="wplus-call-moderation-avatar" aria-hidden="true"><UserAvatar user_id={ userIdOf( tileKey ) } size={ 32 } presence={ false } /></span>
            <span className="wplus-call-moderation-who">
                <span className="wplus-call-moderation-title">{ participant.name }</span>
                { state.length > 0 && <span className="wplus-call-moderation-state">
                    { state.map( ( item ) => <span key={ item.key } className="wplus-call-moderation-pill" data-tone={ item.tone }>
                        <Icon name={ item.icon } size={ 11 } />{ item.label }
                    </span> ) }
                </span> }
            </span>
        </div>
        {/* Asking them to turn on what is off (ask-prompt.tsx), both at once where both are. "Asked…" for a while
            after, with their answer under it once it comes. */}
        { askBoth &&
            <ModerationRow icon="video" className="wplus-ask-camera-microphone" busy={ asks.busy( identity, 'both' ) } disabled={ asks.isAsked( identity, 'both' ) }
                label={ asks.isAsked( identity, 'both' ) ? _x('Asked…', 'Call Ask', 'bp-better-messages') : _x('Ask to Turn On Camera and Microphone', 'Call Ask', 'bp-better-messages') }
                note={ asks.answered( identity, 'both', participant.name ) }
                onClick={ () => void asks.ask( identity, 'both' ) } /> }
        { askMicrophone && ! askBoth &&
            <ModerationRow icon="mic" className="wplus-ask-microphone" busy={ asks.busy( identity, 'microphone' ) } disabled={ asks.isAsked( identity, 'microphone' ) }
                label={ asks.isAsked( identity, 'microphone' ) ? _x('Asked…', 'Call Ask', 'bp-better-messages') : _x('Ask to Turn On Microphone', 'Call Ask', 'bp-better-messages') }
                note={ asks.answered( identity, 'microphone', participant.name ) }
                onClick={ () => void asks.ask( identity, 'microphone' ) } /> }
        { askCamera && ! askBoth &&
            <ModerationRow icon="video" className="wplus-ask-camera" busy={ asks.busy( identity, 'camera' ) } disabled={ asks.isAsked( identity, 'camera' ) }
                label={ asks.isAsked( identity, 'camera' ) ? _x('Asked…', 'Call Ask', 'bp-better-messages') : _x('Ask to Turn On Camera', 'Call Ask', 'bp-better-messages') }
                note={ asks.answered( identity, 'camera', participant.name ) }
                onClick={ () => void asks.ask( identity, 'camera' ) } /> }

        {/* The spotlight for everyone, the room's: where the call takes it, in place of the pin for everyone of
            before, which the call keeps for a call that only pins. */}
        { video && spot.offered && ! inSpotlight &&
            <ModerationRow icon="star" className="wplus-spotlight-participant" busy={ isPending( 'spot' ) } disabled={ full }
                label={_x('Spotlight for Everyone', 'Call Moderation', 'bp-better-messages')}
                note={ full ? spotlightFull() : _x('Their tile is the main one for everyone in the call.', 'Call Moderation', 'bp-better-messages') }
                onClick={ () => run( 'spot', () => spot.spotlight( identity ) ) } /> }
        { video && spot.clears && inSpotlight &&
            <ModerationRow icon="x" className="wplus-unspotlight-participant" busy={ isPending( 'spot' ) }
                label={_x('Remove Spotlight', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'spot', () => spot.unspotlight( identity ) ) } /> }
        { video && ! spot.offered && ! participant.isPinned && moderates( moderation, 'pin_participant' ) &&
            <ModerationRow icon="pin" className="wplus-pin-participant" busy={ isPending( 'pin' ) }
                label={_x('Pin Participant', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'pin', () => pinUser( identity ) ) } /> }
        { video && ! spot.offered && participant.isPinned && moderates( moderation, 'unpin_participant' ) &&
            <ModerationRow icon="pinOff" className="wplus-unpin-participant" busy={ isPending( 'pin' ) }
                label={_x('Unpin Participant', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'pin', () => unpinUser( identity ) ) } /> }
        { video && pinOffered &&
            <ModerationRow icon={ pinnedHere ? 'pinOff' : 'pin' } className="wplus-pin-for-me-row" busy={ false }
                label={ pinnedHere ? _x('Unpin for Me', 'Call Moderation', 'bp-better-messages') : _x('Pin for Me', 'Call Moderation', 'bp-better-messages') }
                onClick={ () => pins.toggle( tileKey ) } /> }

        {/* A mute holds the microphone off until it is allowed: where it is off already, the row says that, as "Mute
            Microphone" read as if it were on (asked on 2026-11-02: "shown even if user does not have them enabled and
            this can create confusion"). Stop Camera and Microphone below likewise, both named in full as the asks above
            name them. */}
        { other && participant.canPublish && <>
            { ! participant.micMuted && moderates( moderation, 'mute_mic' ) &&
                <ModerationRow icon="micOff" className="wplus-mute-mic" busy={ isPending( 'mic' ) }
                    label={ participant.audio ? _x('Mute Microphone', 'Group Video Chat', 'bp-better-messages') : _x('Keep Microphone Off', 'Call Moderation', 'bp-better-messages') }
                    note={ participant.audio ? undefined : _x('They cannot turn it on until you allow it.', 'Call Moderation', 'bp-better-messages') }
                    onClick={ () => run( 'mic', () => muteMic( identity ) ) } /> }
            { participant.micMuted && moderates( moderation, 'unmute_mic' ) &&
                <ModerationRow icon="mic" className="wplus-allow-unmute" busy={ isPending( 'mic' ) }
                    label={_x('Allow Microphone', 'Call Moderation', 'bp-better-messages')}
                    onClick={ () => run( 'mic', () => unmuteMic( identity ) ) } /> }
        </> }

        {/* A viewer or a speaker: in broadcast mode by promoting and demoting, otherwise by the right to send. */}
        { other && broadcast && ! participant.canAdmin && <>
            { participant.canPublish &&
                <ModerationRow icon="arrowDown" className="wplus-demote-participant" busy={ isPending( 'speaker' ) }
                    label={_x('Demote to Viewer', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'speaker', () => demoteParticipant( identity ) ) } /> }
            { ! participant.canPublish &&
                <ModerationRow icon="arrowUp" className="wplus-promote-participant" busy={ isPending( 'speaker' ) } highlight={ participant.handRaised }
                    label={_x('Promote to Speaker', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'speaker', () => promoteParticipant( identity ) ) } /> }
        </> }
        {/* Outside broadcast mode, on a video call, said as what it does to them: their camera and microphone (and
            screen) stopped, or let back on. An audio call has no camera to name, and keeps viewer and speaker. */}
        { other && ! broadcast && <>
            { participant.canPublish && moderates( moderation, 'mute_participant' ) &&
                <ModerationRow icon={ type === 'video' ? 'videoOff' : 'arrowDown' } className="wplus-demote-participant" busy={ isPending( 'speaker' ) }
                    label={ type !== 'video'
                        ? _x('Demote to Viewer', 'Group Video Chat', 'bp-better-messages')
                        : sending ? _x('Stop Camera and Microphone', 'Call Moderation', 'bp-better-messages') : _x('Keep Camera and Microphone Off', 'Call Moderation', 'bp-better-messages') }
                    note={ type === 'video' && ! sending ? _x('They cannot turn them on until you allow them.', 'Call Moderation', 'bp-better-messages') : undefined }
                    onClick={ () => run( 'speaker', () => muteUser( identity ) ) } /> }
            { ! participant.canPublish && moderates( moderation, 'unmute_participant' ) &&
                <ModerationRow icon={ type === 'video' ? 'video' : 'arrowUp' } className="wplus-promote-participant" busy={ isPending( 'speaker' ) } highlight={ participant.handRaised }
                    label={ type === 'video' ? _x('Allow Camera and Microphone', 'Call Moderation', 'bp-better-messages') : _x('Promote to Speaker', 'Group Video Chat', 'bp-better-messages') }
                    onClick={ () => run( 'speaker', () => unmuteUser( identity ) ) } /> }
        </> }

        { other && participant.handRaised &&
            <ModerationRow icon="raisehand" className="wplus-lower-participant-hand" busy={ isPending( 'hand' ) }
                label={_x('Lower Hand', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'hand', () => lowerHand( identity ) ) } /> }

        { removable && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <ModerationRow icon="userX" className="wplus-remove-participant" busy={ isPending( 'kick' ) } danger
                label={_x('Remove from Call', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'kick', () => kickUser( identity ) ) } />
            {/* The ban asks for how long in the app's own dialog (the context's `banFromCalls`), so the menu goes first. */}
            { banFromCalls && <ModerationRow icon="ban" className="wplus-ban-participant" busy={ false } danger
                label={_x('Remove and Ban from Calls…', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => { close(); banFromCalls( participant ); } } /> }
        </> }
    </CallPopover>;
}
