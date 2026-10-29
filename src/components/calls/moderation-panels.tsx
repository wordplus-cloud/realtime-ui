import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface, type CallParticipant } from "./context.ts";
import { moderates, useModerationActs } from "./moderation.ts";
import usePendingActions from "../../inc/calls/pending.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon, { type IconName } from "../../primitives/icon.tsx";
import UserAvatar from "../users/user-avatar.tsx";
import { host } from "../../host.ts";
import { handSoundOn, joinAlertsOn, keepHandSound, keepJoinAlerts } from "./host-toasts.tsx";

/**
 * A moderator's controls, spelled out: the room's (Host Controls in the dock) and one person's (the ⋯ on their tile),
 * each a menu that opens at the button that opened it, whose rows say what they do and what is on now. They were bare
 * icons: Mute All beside the user's own microphone, a pressed Mute Microphone turning into a plain microphone, and
 * nothing on the tile but the corner chip of someone who never turned theirs on.
 *
 * The group video and audio layouts keep which menu is open and hand it to their tiles through
 * ModerationPanelContext: 'room', a tile's key, or null. The menus are drawn in the layout's own box (`stage`), which
 * places them beside their button and keeps them inside it, as a tile or the dock can't: a small tile or the stage's
 * floor would cut a menu off.
 */
export type ModerationPanel = 'room' | string | null;

export const ModerationPanelContext = createContext<{
    panel: ModerationPanel,
    setPanel: ( panel: ModerationPanel ) => void,
}>( { panel: null, setPanel: () => {} } );

/** Whether the call takes any of the room's acts, which is when a moderator is offered Host Controls. */
export function roomModerated( moderation: CallContextInterface['moderation'] ): boolean {
    return [ 'mute_all', 'lock_room', 'set_broadcast_mode', 'set_participatory_mode', 'end_call' ].some( ( act ) => moderates( moderation, act ) );
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
function userIdOf( tileKey: string ): number | string {
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

/** The ⋯ on a tile that opens its person's panel, for a moderator. */
export function ManageParticipant( { tileKey, participant }: { tileKey: string, participant: CallParticipant } ) {
    const { panel, setPanel } = useContext( ModerationPanelContext );
    const open = panel === tileKey;

    return <span className="wplus-admin-controls" data-open={ open ? 1 : undefined }>
        <Tooltip content={_x('Manage Participant', 'Call Moderation', 'bp-better-messages')}>
            <span onClick={ () => setPanel( open ? null : tileKey ) } className="wplus-manage-participant" data-active={ open ? 1 : undefined } aria-expanded={ open } data-name={ participant.name }>
                <Icon name="more" size={ 14 } />
            </span>
        </Tooltip>
    </span>;
}

/**
 * Whether a moderator has anything to do on this tile: pin it (a video tile: an audio roster pins nobody), or for
 * anyone else, any of the person's acts.
 */
export function tileModerated( moderation: CallContextInterface['moderation'], tileKey: string, type: 'audio' | 'video' ): boolean {
    if ( type === 'video' && moderates( moderation, 'pin_participant' ) ) return true;
    if ( tileKey === 'me' ) return false;
    return [ 'mute_mic', 'mute_participant', 'remove_participant' ].some( ( act ) => moderates( moderation, act ) );
}

// The buttons that open a menu: a press on one is theirs to handle (open another, or close this one), not a press
// outside that closes it.
const TOGGLES = '.wplus-manage-participant, .wplus-host-controls';

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
 * `anchor`: what it opens beside, by selectors tried in turn. Escape and a press outside close it.
 */
function Popover( { stage, anchor, side, align, label, className, close, children }: {
    stage: RefObject<HTMLElement | null>,
    anchor: string[],
    side: 'above' | 'below',
    align: 'start' | 'end' | 'stage-end',
    label: string,
    className: string,
    close: () => void,
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
        const left = align === 'stage-end'
            ? Math.max( EDGE, rtl ? DOCK_EDGE : s.width - width - DOCK_EDGE )
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
        const onPress = ( event: PointerEvent ) => {
            const target = event.target as Element | null;
            if ( ! target || box.current?.contains( target ) || target.closest?.( TOGGLES ) ) return;
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
}

// A row is a span with a menu item's role and keys, not a <button>: inside the messenger a site's and Better Messages'
// own resets style every button with !important (no padding, no corners, no background, the colour inherited), which
// laid the rows flat against the menu's edge and turned Remove from Call white. The call's other controls are spans
// for the same reason (helpers/tooltip.tsx).
function Row( { icon, label, note, className, busy, onClick, checked, danger, highlight }: RowProps ) {
    const toggle = checked !== undefined;

    return <span
        className={ 'wplus-call-moderation-row ' + className + ( danger ? ' wplus-call-moderation-danger' : '' ) + ( highlight ? ' wplus-call-moderation-highlight' : '' ) }
        role={ toggle ? 'menuitemcheckbox' : 'menuitem' }
        tabIndex={ 0 }
        aria-checked={ toggle ? checked : undefined }
        aria-label={ label }
        data-busy={ busy ? 1 : undefined }
        data-on={ checked ? 1 : undefined }
        onClick={ onClick }
        onKeyDown={ ( event ) => {
            if ( event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar' ) return;
            event.preventDefault();
            onClick();
        } }
    >
        <span className="wplus-call-moderation-icon" aria-hidden="true">
            <Icon name={ busy ? 'spinner' : icon } size={ 16 } className={ busy ? 'wplus-svg-animate' : undefined } />
        </span>
        <span className="wplus-call-moderation-text">
            <span className="wplus-call-moderation-label">{ label }</span>
            { note && <span className="wplus-call-moderation-note">{ note }</span> }
        </span>
        { toggle && <span className="wplus-call-moderation-switch" aria-hidden="true" /> }
    </span>;
}

/**
 * The room's rules for a moderator: everyone's microphone, the lock, broadcast mode, lowering every raised hand while
 * one is up, the sound of a raised hand and the toasts of who joined on this device (host-toasts.tsx), and ending the
 * call for everyone, asked again in the app's dialog (UiHost.confirm) before it goes. Each rule flips once its request
 * succeeds, as the dock's buttons did.
 */
export function RoomPanel( { stage, close }: { stage: RefObject<HTMLElement | null>, close: () => void } ) {
    const {
        callInfo, moderate, moderation, participants,
        roomMuted, setRoomMuted, roomLocked, setRoomLocked,
        callMode, setCallMode, lowerAllHands, endForEveryone,
    } = useContext<CallContextInterface>( CallContext );
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
    // Whose microphones Mute Everyone mutes and lets back on: everyone else but the moderators.
    const others = Array.from( participants.entries() ).filter( ( [ key, p ] ) => key !== 'me' && ! p.canAdmin ).map( ( [ , p ] ) => p.identity );

    const title = _x('Host Controls', 'Call Moderation', 'bp-better-messages');

    // Above the dock, against the stage's end edge where the dock ends too, the same on a phone and a desktop.
    return <Popover stage={ stage } anchor={ [ '.wplus-group-call-controls-buttons', '.wplus-host-controls' ] } side="above" align="stage-end" label={ title } close={ close } className="wplus-call-moderation wplus-call-moderation-room">
        <div className="wplus-call-moderation-head">
            <span className="wplus-call-moderation-badge" aria-hidden="true"><Icon name="shield" size={ 16 } /></span>
            <span className="wplus-call-moderation-title">{ title }</span>
        </div>
        { moderates( moderation, roomMuted ? 'unmute_all' : 'mute_all' ) &&
            <Row icon="micOff" className="wplus-room-mute" checked={ roomMuted } busy={ isPending( 'room-mute' ) }
                label={_x('Mute Everyone', 'Call Moderation', 'bp-better-messages')}
                note={_x('Microphones stay off until you allow them again. Cameras and screens keep going.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => act( 'room-mute', async () => {
                    await moderate( { act: roomMuted ? 'unmute_all' : 'mute_all', type: callInfo.type, identities: others } );
                    setRoomMuted( ! roomMuted );
                } ) } /> }

        { moderates( moderation, roomLocked ? 'unlock_room' : 'lock_room' ) &&
            <Row icon="lock" className="wplus-room-lock" checked={ roomLocked } busy={ isPending( 'room-lock' ) }
                label={_x('Lock Room', 'Group Video Chat', 'bp-better-messages')}
                note={_x('Nobody else can join.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => act( 'room-lock', async () => {
                    await moderate( { act: roomLocked ? 'unlock_room' : 'lock_room', type: callInfo.type } );
                    setRoomLocked( ! roomLocked );
                } ) } /> }

        { moderates( moderation, broadcast ? 'set_participatory_mode' : 'set_broadcast_mode' ) &&
            <Row icon="megaphone" className="wplus-room-broadcast" checked={ broadcast } busy={ isPending( 'mode' ) }
                label={_x('Broadcast Mode', 'Call Moderation', 'bp-better-messages')}
                note={_x('Only speakers can turn on a camera or microphone. Everyone else watches and can raise a hand.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'mode', () => setCallMode( broadcast ? 'participatory' : 'broadcast' ) ) } /> }

        { ( broadcast || moderates( moderation, 'raise_hand' ) ) &&
            <Row icon="bell" className="wplus-room-hand-sound" checked={ handSound } busy={ false }
                label={_x('Sound for Raised Hands', 'Call Moderation', 'bp-better-messages')}
                note={_x('A short sound when someone raises a hand, on this device.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => {
                    keepHandSound( ! handSound );
                    setHandSound( ! handSound );
                } } /> }

        <Row icon="userPlus" className="wplus-room-join-alerts" checked={ joinAlerts } busy={ false }
            label={_x('Join Alerts', 'Call Moderation', 'bp-better-messages')}
            note={_x('A toast when someone joins the call, on this device.', 'Call Moderation', 'bp-better-messages')}
            onClick={ () => {
                keepJoinAlerts( ! joinAlerts );
                setJoinAlerts( ! joinAlerts );
            } } />

        { handsUp && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <Row icon="raisehand" className="wplus-lower-all-hands" busy={ isPending( 'hands' ) }
                label={_x('Lower All Hands', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'hands', lowerAllHands ) } />
        </> }

        { ( endForEveryone && moderates( moderation, 'end_call' ) ) && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <Row icon="logout" className="wplus-room-end" danger busy={ false }
                label={_x('End for Everyone', 'Call Moderation', 'bp-better-messages')}
                note={_x('Everyone leaves the call, you too.', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => void endCall( endForEveryone ) } />
        </> }
    </Popover>;
}

/**
 * One person's actions, for a moderator: pin them, and for anyone else their microphone, whether they may send at all
 * (a viewer or a speaker, by the call's mode), their raised hand, and removing them. Its second line says what is on
 * now. A row waits until the tile shows what it asked for (pending.ts), and the panel closes when they leave.
 */
export function PersonPanel( { stage, tileKey, type, close }: { stage: RefObject<HTMLElement | null>, tileKey: string, type: 'audio' | 'video', close: () => void } ) {
    const {
        participants, moderate, moderation, callMode, promoteParticipant, demoteParticipant, lowerHand,
    } = useContext<CallContextInterface>( CallContext );
    const participant = participants.get( tileKey );
    const { kickUser, muteUser, unmuteUser, muteMic, unmuteMic, pinUser, unpinUser } = useModerationActs( moderate, type );

    const [ isPending, run ] = usePendingActions(
        participant ? [ participant.isPinned, participant.canPublish, participant.micMuted, participant.handRaised ].join( '|' ) : 'gone'
    );

    useEffect( () => {
        if ( ! participant ) close();
    }, [ !! participant ] );

    if ( ! participant ) return null;

    const identity = participant.identity;
    const other = tileKey !== 'me';
    const broadcast = callMode === 'broadcast';
    const state = personState( participant, moderation );
    const pins = type === 'video';
    const removable = other && moderates( moderation, 'remove_participant' );
    const anchor = `[data-key="${ tileKey.replace( /["\\]/g, '\\$&' ) }"] .wplus-manage-participant`;

    return <Popover stage={ stage } anchor={ [ anchor ] } side="below" align="start" label={ participant.name } close={ close } className="wplus-call-moderation wplus-call-moderation-person">
        <div className="wplus-call-moderation-head">
            <span className="wplus-call-moderation-avatar" aria-hidden="true"><UserAvatar user_id={ userIdOf( tileKey ) } size={ 32 } /></span>
            <span className="wplus-call-moderation-who">
                <span className="wplus-call-moderation-title">{ participant.name }</span>
                { state.length > 0 && <span className="wplus-call-moderation-state">
                    { state.map( ( item ) => <span key={ item.key } className="wplus-call-moderation-pill" data-tone={ item.tone }>
                        <Icon name={ item.icon } size={ 11 } />{ item.label }
                    </span> ) }
                </span> }
            </span>
        </div>
        { pins && ! participant.isPinned && moderates( moderation, 'pin_participant' ) &&
            <Row icon="pin" className="wplus-pin-participant" busy={ isPending( 'pin' ) }
                label={_x('Pin Participant', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'pin', () => pinUser( identity ) ) } /> }
        { pins && participant.isPinned && moderates( moderation, 'unpin_participant' ) &&
            <Row icon="pinOff" className="wplus-unpin-participant" busy={ isPending( 'pin' ) }
                label={_x('Unpin Participant', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'pin', () => unpinUser( identity ) ) } /> }

        { other && participant.canPublish && <>
            { ! participant.micMuted && moderates( moderation, 'mute_mic' ) &&
                <Row icon="micOff" className="wplus-mute-mic" busy={ isPending( 'mic' ) }
                    label={_x('Mute Microphone', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'mic', () => muteMic( identity ) ) } /> }
            { participant.micMuted && moderates( moderation, 'unmute_mic' ) &&
                <Row icon="mic" className="wplus-allow-unmute" busy={ isPending( 'mic' ) }
                    label={_x('Allow Microphone', 'Call Moderation', 'bp-better-messages')}
                    onClick={ () => run( 'mic', () => unmuteMic( identity ) ) } /> }
        </> }

        {/* A viewer or a speaker: in broadcast mode by promoting and demoting, otherwise by the right to send. */}
        { other && broadcast && ! participant.canAdmin && <>
            { participant.canPublish &&
                <Row icon="arrowDown" className="wplus-demote-participant" busy={ isPending( 'speaker' ) }
                    label={_x('Demote to Viewer', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'speaker', () => demoteParticipant( identity ) ) } /> }
            { ! participant.canPublish &&
                <Row icon="arrowUp" className="wplus-promote-participant" busy={ isPending( 'speaker' ) } highlight={ participant.handRaised }
                    label={_x('Promote to Speaker', 'Group Video Chat', 'bp-better-messages')}
                    onClick={ () => run( 'speaker', () => promoteParticipant( identity ) ) } /> }
        </> }
        {/* Outside broadcast mode, on a video call, said as what it does to them: their camera and microphone (and
            screen) stopped, or let back on. An audio call has no camera to name, and keeps viewer and speaker. */}
        { other && ! broadcast && <>
            { participant.canPublish && moderates( moderation, 'mute_participant' ) &&
                <Row icon={ type === 'video' ? 'videoOff' : 'arrowDown' } className="wplus-demote-participant" busy={ isPending( 'speaker' ) }
                    label={ type === 'video' ? _x('Stop Camera & Mic', 'Call Moderation', 'bp-better-messages') : _x('Demote to Viewer', 'Group Video Chat', 'bp-better-messages') }
                    onClick={ () => run( 'speaker', () => muteUser( identity ) ) } /> }
            { ! participant.canPublish && moderates( moderation, 'unmute_participant' ) &&
                <Row icon={ type === 'video' ? 'video' : 'arrowUp' } className="wplus-promote-participant" busy={ isPending( 'speaker' ) } highlight={ participant.handRaised }
                    label={ type === 'video' ? _x('Allow Camera & Mic', 'Call Moderation', 'bp-better-messages') : _x('Promote to Speaker', 'Group Video Chat', 'bp-better-messages') }
                    onClick={ () => run( 'speaker', () => unmuteUser( identity ) ) } /> }
        </> }

        { other && participant.handRaised &&
            <Row icon="raisehand" className="wplus-lower-participant-hand" busy={ isPending( 'hand' ) }
                label={_x('Lower Hand', 'Group Video Chat', 'bp-better-messages')}
                onClick={ () => run( 'hand', () => lowerHand( identity ) ) } /> }

        { removable && <>
            <span className="wplus-call-moderation-divider" role="separator" />
            <Row icon="userX" className="wplus-remove-participant" busy={ isPending( 'kick' ) } danger
                label={_x('Remove from Call', 'Call Moderation', 'bp-better-messages')}
                onClick={ () => run( 'kick', () => kickUser( identity ) ) } />
        </> }
    </Popover>;
}
