import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {__, _x} from "../../inc/globals.ts";
import { moderates } from "./moderation.ts";
import DevicePanel, { JoinPrompt, useJoinPrompt } from "./device-panel.tsx";
import { screenShareSupport, useConfigAvailable } from "../../inc/calls/permissions.ts";
import {CallContext, CallContextInterface} from "./context.ts";
import ConnectionStatus from "../parts/connection-status.tsx";
import Tooltip from "../helpers/tooltip.tsx";
import GroupVideoGrid from "./group-video-grid.tsx";
import useHeld, { PAUSED_NOTICE_MS } from "../../inc/hooks/held.ts";
import { host } from "../../host.ts";
import Icon, { IconName } from "../../primitives/icon.tsx";
import CallDock from "./call-dock.tsx";
import { AddPersonButton, AddPersonPanel } from "./add-person.tsx";
import usePendingActions from "../../inc/calls/pending.ts";
import { Piece } from "../../pieces.tsx";
import { CallViewContext, fullScreenItems } from "./call-view.tsx";
import HostToasts from "./host-toasts.tsx";
import {
    ModerationPanelContext, PersonPanel, RoomPanel, hostControlsItem, lockedMicItem, roomModerated, useModeratorNotice,
    type ModerationPanel,
} from "./moderation-panels.tsx";

/**
 * A group video call, from the CallContext: its tiles (GroupVideoGrid) and its dock. The dock holds the user's own
 * controls (camera, microphone, locked while a moderator keeps it off, sharing the screen, full screen, raised hand for
 * someone who can't send, the settings with the devices, leaving), Show Chat / Hide Chat where the call has a chat
 * beside it, Add Person where the call can add people, and a moderator's Host Controls, whose panel holds the room's
 * rules (moderation-panels.tsx). A moderator's ⋯ on a tile opens that person's panel in the same place.
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
        enableMic,
        disableMic,
        enableShareScreen,
        disableShareScreen,
        enableFullScreen,
        disableFullScreen,
        fullScreenAvailable,
        fullScreenEnabled,
        setFullScreenEnabled,
        connectionState,
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
        callDurationRef
    } = useContext<CallContextInterface>( CallContext );
    const call = useContext<CallContextInterface>( CallContext );
    // Filling the window or the screen (call-view.tsx): the chat beside the call is out of reach then.
    const view = useContext( CallViewContext );
    const expanded = view.windowed || fullScreenEnabled;

    const [ configOpen, setConfigOpen ] = useState( false );
    // Opened from the prompt of the join's Preview: the camera's preview and the microphone's test run from the start,
    // asked of the browser together, once.
    const [ previewOnOpen, setPreviewOnOpen ] = useState( false );
    useEffect( () => { if ( ! configOpen ) setPreviewOnOpen( false ); }, [ configOpen ] );
    const [ addOpen, setAddOpen ] = useState( false );
    const [ panel, setPanel ] = useState<ModerationPanel>( null );
    const closePanel = useCallback( () => setPanel( null ), [] );
    const stageRef = useRef<HTMLDivElement>( null );
    const { notice, remind } = useModeratorNotice( myMicMuted );

    // The user's own hand shows a spinner while its request is out (see pending.ts).
    const [ isPending, run ] = usePendingActions();
    const busy = ( key: string ) => isPending( key ) ? 1 : undefined;
    const glyph = ( key: string, name: IconName ) => isPending( key )
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    // The camera spins as they do while it is checked before it goes out (context.ts). It still takes a press: turning
    // the camera off wins over its check at once.
    const cameraGlyph = ( name: IconName ) => cameraChecking
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    const controlsRef = useRef<HTMLDivElement>(null);

    const configAvailable = useConfigAvailable();
    const [ joinPrompt, dismissJoinPrompt ] = useJoinPrompt( configOpen );

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

    return (<ModerationPanelContext.Provider value={ { panel, setPanel } }>
        <div ref={ stageRef } className="wplus-group-call-container wplus-call-container" style={{display: "block"}}>
        <GroupVideoGrid />

        <Piece name="CallStatus" props={ { layout: 'group-video', action, text: status, duration: callDurationRef?.current ?? 0 } }>
            { status && <div className="wplus-group-call-status" role="status" part="call-status">{ status }</div> }
        </Piece>

        {/* A raised hand and who joined, for a moderator (host-toasts.tsx). */}
        { adminMode && <HostToasts /> }

        {/* Joined with the microphone and camera off, and Preview (device-panel.tsx). */}
        { joinPrompt && <JoinPrompt video preview={ () => { setPreviewOnOpen( true ); setConfigOpen( true ); } } dismiss={ dismissJoinPrompt } /> }

            <div ref={controlsRef} className="wplus-group-call-controls-v2" part="call-controls">
                { configOpen === true && <DevicePanel video start={ previewOnOpen ? 'both' : undefined } close={ () => setConfigOpen( false ) } /> }
                { addOpen && <AddPersonPanel close={ () => setAddOpen( false ) } /> }
                <ConnectionStatus state={connectionState} quality={quality}></ConnectionStatus>

                <CallDock className="wplus-group-call-controls-buttons" pinned={ 1 }>
                    {/* Show / hide the conversation beside the call, or under
                        it in a single column (a phone). First, so it is the
                        last to fold into More, and in the dock so nothing on
                        the stage can sit under it. Not while the call fills
                        the window or the screen, which the chat is outside
                        of. */}
                    { ( chatToggle && ! expanded ) &&
                        <Tooltip content={ chatShown ? _x('Hide Chat', 'Call Controls', 'bp-better-messages') : _x('Show Chat', 'Call Controls', 'bp-better-messages') }>
                            <span onClick={ () => chatToggle( ( shown: boolean ) => ! shown ) } className="wplus-toggle-chat" data-active={ chatShown ? 1 : undefined }>
                                <Icon name="thread" size={ 20 } />
                            </span>
                        </Tooltip>
                    }
                    { connectionState === 'connected' &&
                        <>
                            { configAvailable &&
                                <Tooltip content={_x('Configure', 'Group Video Chat', 'bp-better-messages')}>
                                    <span onClick={() => { setConfigOpen(!configOpen) }} className="wplus-configure-call">
                                        <Icon name="settings" size={ 20 } />
                                    </span>
                                </Tooltip>
                            }

                            <AddPersonButton open={ addOpen } setOpen={ setAddOpen } />

                            { canPublish && <>
                                { myCameraTrack &&
                                    <Tooltip content={_x('Disable Camera', 'Group Video Chat', 'bp-better-messages')}>
                                    <span onClick={ disableCamera } data-busy={ cameraChecking ? 1 : undefined } className="wplus-disable-video">
                                        { cameraGlyph( iconsReverted ? 'video' : 'videoOff' ) }
                                    </span>
                                    </Tooltip>}

                                { ! myCameraTrack &&
                                    <Tooltip content={_x('Enable Camera', 'Group Video Chat', 'bp-better-messages')}>
                                        <span onClick={ enableCamera } data-busy={ cameraChecking ? 1 : undefined } className="wplus-enable-video">
                                            { cameraGlyph( iconsReverted ? 'videoOff' : 'video' ) }
                                        </span>
                                    </Tooltip>}
                            </>}

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
                                            <span onClick={enableMic} className="wplus-enable-mic">
                                                { ! iconsReverted && <Icon name="mic" size={ 20 } />}
                                                { iconsReverted && <Icon name="micOff" size={ 20 } />}
                                            </span>
                                        </Tooltip>
                                    }
                                </>
                            }
                            { ( canPublish && myMicMuted ) && lockedMicItem( remind ) }

                            {/* Expand to the window, then the whole screen (call-view.tsx). */}
                            { fullScreenItems( call, view ) }

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

                            {/* The room's rules — everyone muted, the lock, broadcast mode, every hand lowered — in one
                                panel whose rows say what each does and whether it is on, where four bare icons were.
                                Muting everyone is a rule the room keeps and the join route reports it back as
                                `roomMuted`, so a moderator who walks into a muted room finds the switch on. */}
                            { ( adminMode && roomModerated( moderation ) ) &&
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

            {/* The moderator's menus, at the button that opened them (moderation-panels.tsx). */}
            { ( adminMode && panel === 'room' ) && <RoomPanel stage={ stageRef } close={ closePanel } /> }
            { ( adminMode && panel !== null && panel !== 'room' ) && <PersonPanel key={ panel } stage={ stageRef } tileKey={ panel } type="video" close={ closePanel } /> }
        </div>
    </ModerationPanelContext.Provider>
    )
}
