import React, { useContext, useEffect, useRef, useState } from "react";
import {__, _x} from "../../inc/globals.ts";
import { moderates } from "./moderation.ts";
import DevicePanel, { ConfigureBadge, EffectsSlowNotice, JoinPrompt, NoiseAutoNotice, useConfigureCall, useDevicesBlocked, useJoinPrompt } from "./device-panel.tsx";
import TurnOnAskPrompt from "./ask-prompt.tsx";
import { screenShareSupport, useConfigAvailable } from "../../inc/calls/permissions.ts";
import {CallContext, CallContextInterface} from "./context.ts";
import ConnectionStatus from "../parts/connection-status.tsx";
import Tooltip from "../helpers/tooltip.tsx";
import GroupVideoGrid from "./group-video-grid.tsx";
import useHeld, { PAUSED_NOTICE_MS } from "../../inc/hooks/held.ts";
import { host } from "../../host.ts";
import Icon, { IconName } from "../../primitives/icons.tsx";
import CallDock from "./call-dock.tsx";
import { AddPersonPanel } from "./add-person.tsx";
import usePendingActions from "../../inc/calls/pending.ts";
import { Piece } from "../../pieces.tsx";
import { CallViewContext, fullScreenItems } from "./call-view.tsx";
import HostToasts from "./host-toasts.tsx";
import {
    ModerationPanelContext, PersonPanel, RoomPanel, hostControlsItem, lockedMicItem, roomModerated, useModerationPanel,
    useModeratorNotice,
} from "./moderation-panels.tsx";
import { PeopleColumnContext, PeoplePanel, peopleItem, peopleOf, useHandOrder, usePeoplePanel } from "./people-panel.tsx";
import { LayoutChoiceContext, LayoutChoices, useLayoutChoice } from "./layout-choice.tsx";
import { RecordingLayerView, RecordingPill } from "./recording.tsx";
import { BanDialog } from "./ban-dialog.tsx";

/**
 * A group video call, from the CallContext: its tiles (GroupVideoGrid) and its dock. The dock holds the user's own
 * controls (camera, microphone, locked while a moderator keeps it off, sharing the screen, full screen, raised hand for
 * someone who can't send, the settings with the devices, leaving), Participants with how many are in the call
 * (people-panel.tsx), Layout (layout-choice.tsx), Show Chat / Hide Chat where the call has a chat beside it, Add
 * Person where the call can add people, and a moderator's Host Controls, whose panel holds the room's rules
 * (moderation-panels.tsx). A moderator's ⋯ on a tile, or on a row of Participants, opens that person's panel in the
 * same place.
 */
export default function GroupVideoCallLayout() {
    const {
        thread,
        statusMessage,
        participants,
        action,
        errorMessages,
        iconsReverted,
        endCall,
        answerCall,
        activeCameraDevice,
        selectedCameraDevice,
        selectedMicrophoneDevice,
        selectedSpeakerDevice,
        setSelectedCameraDevice,
        setSelectedMicrophoneDevice,
        setSelectedSpeakerDevice,
        myCameraTrack,
        myCameraTrackRef,
        myMicrophoneTrack,
        myMicrophoneTrackRef,
        myScreenVideoTrack,
        myScreenVideoTrackRef,
        enableCamera,
        disableCamera,
        cameraChecking,
        cameraTurningOn,
        enableMic,
        disableMic,
        microphoneTurningOn,
        enableShareScreen,
        disableShareScreen,
        enableFullScreen,
        disableFullScreen,
        fullScreenAvailable,
        fullScreenEnabled,
        setFullScreenEnabled,
        connectionState,
        uploadJammed,
        canPublish,
        adminMode,
        callInfo,
        roomLocked,
        setRoomLocked,
        roomMuted,
        setRoomMuted,
        raiseHand,
        lowerAllHands,
        myHandRaised,
        myMicMuted,
        callMode,
        setCallMode,
        moderate,
        moderation,
        chatShown,
        chatToggle,
        callDurationRef,
        turnOnAsks
    } = useContext<CallContextInterface>( CallContext );
    const call = useContext<CallContextInterface>( CallContext );
    // Filling the window or the screen (call-view.tsx): the chat beside the call is out of reach then.
    const view = useContext( CallViewContext );
    const expanded = view.windowed || fullScreenEnabled;

    const [ configOpen, setConfigOpen ] = useState( false );
    // Opened from the prompt of the join's Preview: the camera's preview and the microphone's test run from the start,
    // asked of the browser together, once. From an ask's Preview (ask-prompt.tsx), the device asked for alone.
    const [ previewOnOpen, setPreviewOnOpen ] = useState<'camera' | 'microphone' | 'both' | false>( false );
    useEffect( () => { if ( ! configOpen ) setPreviewOnOpen( false ); }, [ configOpen ] );
    const turnOnAsk = turnOnAsks?.received ?? null;
    const [ addOpen, setAddOpen ] = useState( false );
    const { panel, from, setPanel, close: closePanel } = useModerationPanel();
    const stageRef = useRef<HTMLDivElement>( null );
    const { notice, remind } = useModeratorNotice( myMicMuted );
    const people = usePeoplePanel( stageRef, !! call.people );
    const hands = useHandOrder( participants );
    // A sheet over the call stands where the device settings, Add Person and Host Controls do: one at a time.
    const togglePeople = () => {
        if ( ! people.open && people.mode === 'sheet' ) {
            setConfigOpen( false );
            setAddOpen( false );
            if ( panel === 'room' ) closePanel();
        }
        people.setOpen( ! people.open );
    };
    useEffect( () => {
        if ( people.sheet && ( configOpen || addOpen || panel === 'room' ) ) people.setOpen( false );
    }, [ configOpen, addOpen, panel ] );

    // The layout (layout-choice.tsx), set in the dock's More.
    const layout = useLayoutChoice();

    // The user's own hand shows a spinner while its request is out (see pending.ts).
    const [ isPending, run ] = usePendingActions();
    const busy = ( key: string ) => isPending( key ) ? 1 : undefined;
    const glyph = ( key: string, name: IconName ) => isPending( key )
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    // The camera spins as they do while it turns on (turning-on.ts) and while it is checked before it goes out
    // (context.ts), the microphone while it turns on. The camera still takes a press: turning it off wins over its check
    // at once.
    const cameraBusy = cameraChecking || cameraTurningOn;
    const cameraGlyph = ( name: IconName ) => cameraBusy
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    const micGlyph = ( name: IconName ) => microphoneTurningOn
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    const controlsRef = useRef<HTMLDivElement>(null);

    const configAvailable = useConfigAvailable();
    // A mark on Configure while the browser blocks the camera or microphone of someone who may send them: the settings
    // say why.
    const devicesBlocked = useDevicesBlocked( true ) && canPublish;
    const configure = useConfigureCall();
    const [ joinPrompt, dismissJoinPrompt, holdJoinPrompt ] = useJoinPrompt( configOpen );

    const localParticipant = participants.has('me') ? participants.get('me') : null;
    // Someone who only listens has no tile of their own, and sends nothing to measure: connected, they read as good.
    const quality = localParticipant ? localParticipant.quality : connectionState === 'connected' ? 'good' : 'connecting';

    // Every picture this page gets, paused by the media server for its download: the call says so once, beside the
    // tiles that each say it (group-video-grid-item.tsx). Sound is never paused for it.
    const received: boolean[] = [];
    participants.forEach( ( participant, key ) => {
        if( key === 'me' || participant.reconnecting ) return;
        if( participant.video ) received.push( !! participant.videoPaused );
        if( participant.screen ) received.push( !! participant.screenPaused );
    } );
    const allPaused = useHeld( connectionState === 'connected' && received.length > 0 && received.every( Boolean ), PAUSED_NOTICE_MS );
    const status = statusMessage || notice || ( allPaused ? _x('Your connection is weak: videos are paused, sound continues.', 'Group Video Chat', 'bp-better-messages') : '' );
    // Someone who can't send asks to: in broadcast mode always, otherwise where the call takes raised hands.
    const handOffered = ! canPublish && ! adminMode && ( callMode === 'broadcast' || moderates( moderation, 'raise_hand' ) );

    // Only once in the call: until then nothing has said what this side may send.
    useEffect(() => {
        if( connectionState === 'connected' && ! canPublish ){
            if( myCameraTrackRef.current ){
                disableCamera();
            }

            if( myMicrophoneTrackRef.current ){
                disableMic();
            }

            if( myScreenVideoTrackRef.current ) {
                disableShareScreen();
            }
        }
    }, [ canPublish, connectionState ])

    useEffect(() => {
        if( myMicMuted && myMicrophoneTrackRef.current ){
            disableMic();
        }
    }, [ myMicMuted ])

    return (<ModerationPanelContext.Provider value={ { panel, setPanel, from } }>
        <LayoutChoiceContext.Provider value={ layout }>
        <PeopleColumnContext.Provider value={ people.column }>
        <div ref={ stageRef } className="wplus-group-call-container wplus-call-container" style={{display: "block"}} data-people={ people.column ? 'column' : undefined }>
        <GroupVideoGrid onStage={ people.onStage } />

        <Piece name="CallStatus" props={ { layout: 'group-video', action, text: status, duration: callDurationRef?.current ?? 0 } }>
            { status && <div className="wplus-group-call-status" role="status" part="call-status">{ status }</div> }
        </Piece>

        {/* A raised hand and who joined, for a moderator (host-toasts.tsx). */}
        { adminMode && <HostToasts /> }

        {/* A moderator's ask to turn on the camera or the microphone (ask-prompt.tsx), in the join prompt's place while it
            waits. Else joined with the microphone and camera off, and Preview (device-panel.tsx). */}
        { turnOnAsk
            ? <TurnOnAskPrompt video preview={ () => { setPreviewOnOpen( turnOnAsk.device ); setConfigOpen( true ); } } />
            : joinPrompt && <JoinPrompt video preview={ () => { setPreviewOnOpen( 'both' ); setConfigOpen( true ); } } dismiss={ dismissJoinPrompt } hold={ holdJoinPrompt } /> }

        {/* The recording's notice in the prompt's place, and its dialogs over it all (recording.tsx). Its REC pill is in
            the bar, beside the connection status. */}
        <RecordingLayerView audio={ false } />
        {/* Remove and Ban from Calls' length, where the call asks for it here (an app's call). */}
        <BanDialog />

        {/* The camera's background slowing this device, once a call, with Turn Off (device-panel.tsx). */}
        <EffectsSlowNotice />

        {/* AI Noise Removal turned on by the app's default, once a call (device-panel.tsx). */}
        <NoiseAutoNotice />

            <div ref={controlsRef} className="wplus-group-call-controls-v2" part="call-controls">
                { configOpen === true && <DevicePanel video start={ previewOnOpen || undefined } close={ () => setConfigOpen( false ) } /> }
                { addOpen && <AddPersonPanel close={ () => setAddOpen( false ) } /> }
                <ConnectionStatus state={connectionState} quality={quality} jammed={ !! uploadJammed }></ConnectionStatus>
                <RecordingPill />

                <CallDock className="wplus-group-call-controls-buttons" pinned={ 1 } menu={ connectionState === 'connected' ? <LayoutChoices /> : undefined }>
                    {/* The lean dock (asked on 2026-10-30: "lean dock, keep full screen control, host controls (only
                        shown to moderator), settings"), as a narrow dock folds its tail into More: the chat beside
                        the call and the device settings at its start, where they were before it (as asked: "configure
                        button should be on left side after chat, like it was before"), then what is pressed most:
                        the microphone, the camera, sharing, a hand for someone who can't send, Participants, the
                        call's size, Host Controls. What a call is set up with once is in More whatever the room
                        (DockMore, call-dock.tsx): the layout (its `menu`) here and picture in picture from
                        call-view.tsx. Add Person is at the top of Participants. */}

                    {/* Show / hide the conversation beside the call, or under it in a single column (a phone), before
                        the call is connected too. Not while the call fills the window or the screen, which the chat
                        is outside of. */}
                    { ( chatToggle && ! expanded ) &&
                        <Tooltip content={ chatShown ? _x('Hide Chat', 'Call Controls', 'bp-better-messages') : _x('Show Chat', 'Call Controls', 'bp-better-messages') }>
                            <span onClick={ () => chatToggle( ( shown: boolean ) => ! shown ) } className="wplus-toggle-chat" data-active={ chatShown ? 1 : undefined }>
                                <Icon name="thread" size={ 20 } />
                            </span>
                        </Tooltip>
                    }

                    { ( connectionState === 'connected' && configAvailable ) &&
                        <Tooltip content={ configure.label }>
                            <span onClick={() => { setConfigOpen(!configOpen) }} className="wplus-configure-call" aria-label={ configure.label } aria-expanded={ configOpen } data-warning={ devicesBlocked ? 1 : undefined } data-noise={ configure.noise ? 1 : undefined }>
                                <Icon name="settings" size={ 20 } />
                                <ConfigureBadge noise={ configure.noise } />
                            </span>
                        </Tooltip>
                    }

                    { connectionState === 'connected' &&
                        <>
                            { ( canPublish && ! myMicMuted ) &&
                                <>
                                    { myMicrophoneTrack &&
                                        <Tooltip content={_x('Disable Microphone', 'Group Video Chat', 'bp-better-messages')}>
                                            <span onClick={disableMic} className="wplus-disable-mic">
                                                { ! iconsReverted && <Icon name="micOff" size={ 20 } />}
                                                { iconsReverted && <Icon name="mic" size={ 20 } />}
                                            </span>
                                        </Tooltip>
                                    }
                                    {! myMicrophoneTrack &&
                                        <Tooltip content={_x('Enable Microphone', 'Group Video Chat', 'bp-better-messages')}>
                                            <span onClick={enableMic} data-busy={ microphoneTurningOn ? 1 : undefined } className="wplus-enable-mic">
                                                { micGlyph( iconsReverted ? 'micOff' : 'mic' ) }
                                            </span>
                                        </Tooltip>
                                    }
                                </>
                            }
                            { ( canPublish && myMicMuted ) && lockedMicItem( remind ) }

                            { canPublish && <>
                                { myCameraTrack &&
                                    <Tooltip content={_x('Disable Camera', 'Group Video Chat', 'bp-better-messages')}>
                                    <span onClick={ disableCamera } data-busy={ cameraBusy ? 1 : undefined } className="wplus-disable-video">
                                        { cameraGlyph( iconsReverted ? 'video' : 'videoOff' ) }
                                    </span>
                                    </Tooltip>}

                                { ! myCameraTrack &&
                                    <Tooltip content={_x('Enable Camera', 'Group Video Chat', 'bp-better-messages')}>
                                        <span onClick={ enableCamera } data-busy={ cameraBusy ? 1 : undefined } className="wplus-enable-video">
                                            { cameraGlyph( iconsReverted ? 'videoOff' : 'video' ) }
                                        </span>
                                    </Tooltip>}
                            </>}

                            { ( canPublish && screenShareSupport ) &&
                                <>
                                    { ! myScreenVideoTrack &&
                                        <Tooltip content={_x('Share Screen', 'Group Video Chat', 'bp-better-messages')}>
                                            <span onClick={enableShareScreen} className="wplus-switch-share-screen">
                                                <Icon name="screenShare" size={ 20 } />
                                            </span>
                                        </Tooltip>
                                    }

                                    { myScreenVideoTrack &&
                                        <Tooltip content={_x('Stop Screen Sharing', 'Group Video Chat', 'bp-better-messages')}>
                                            <span onClick={disableShareScreen} className="wplus-switch-share-screen" data-active="1">
                                                <Icon name="screenShareOff" size={ 20 } />
                                            </span>
                                        </Tooltip>
                                    }
                                </>
                            }

                            { handOffered && <>
                                { ! myHandRaised &&
                                    <Tooltip content={_x('Raise Hand', 'Group Video Chat', 'bp-better-messages')}>
                                        <span onClick={() => run( 'own-hand', raiseHand )} data-busy={ busy( 'own-hand' ) } className="wplus-raise-hand">
                                            { glyph( 'own-hand', 'raisehand' ) }
                                        </span>
                                    </Tooltip>
                                }
                                { myHandRaised &&
                                    <Tooltip content={_x('Lower Hand', 'Group Video Chat', 'bp-better-messages')}>
                                        <span onClick={() => run( 'own-hand', raiseHand )} data-busy={ busy( 'own-hand' ) } className="wplus-lower-hand wplus-hand-active">
                                            { glyph( 'own-hand', 'raisehand' ) }
                                        </span>
                                    </Tooltip>
                                }
                            </> }

                            {/* Everyone in the call, as a list (people-panel.tsx). */}
                            { people.offered && peopleItem( people.open, peopleOf( participants ).size, togglePeople ) }

                            {/* Expand to the window, then the whole screen (call-view.tsx). */}
                            { fullScreenItems( call, view ) }

                            {/* The room's rules — everyone muted, the lock, broadcast mode, every hand lowered — in one
                                panel whose rows say what each does and whether it is on, where four bare icons were.
                                Muting everyone is a rule the room keeps and the join route reports it back as
                                `roomMuted`, so a moderator who walks into a muted room finds the switch on. */}
                            { ( adminMode && roomModerated( moderation, call.recording ) ) &&
                                hostControlsItem( panel === 'room', roomMuted || roomLocked || callMode === 'broadcast', () => setPanel( panel === 'room' ? null : 'room' ) )
                            }
                        </>
                    }
                    <Tooltip content={_x('Exit Chat', 'Group Video Chat', 'bp-better-messages')}>
                        <span onClick={ () => endCall() } className="wplus-exit-room">
                            <Icon name="logout" size={ 20 } />
                        </span>
                    </Tooltip>
                </CallDock>
            </div>

            {/* Bringing someone in, at the top of the list. */}
            { ( people.open && connectionState === 'connected' ) &&
                <PeoplePanel stage={ stageRef } mode={ people.mode } type="video" hands={ hands } close={ () => people.setOpen( false ) }
                    add={ { open: addOpen, toggle: () => setAddOpen( ! addOpen ) } } /> }

            {/* The moderator's menus, at the button that opened them (moderation-panels.tsx). */}
            { ( adminMode && panel === 'room' ) && <RoomPanel stage={ stageRef } close={ closePanel } /> }
            { ( adminMode && panel !== null && panel !== 'room' ) && <PersonPanel key={ panel + from } stage={ stageRef } tileKey={ panel } type="video" from={ people.open ? from : 'tile' } close={ closePanel } /> }
        </div>
        </PeopleColumnContext.Provider>
        </LayoutChoiceContext.Provider>
    </ModerationPanelContext.Provider>
    )
}
