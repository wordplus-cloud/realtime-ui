import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import {__, _x} from "../../inc/globals.ts";
import { moderates } from "./moderation.ts";
import DevicePanel, { JoinPrompt, useJoinPrompt } from "./device-panel.tsx";
import { screenShareSupport, useConfigAvailable } from "../../inc/calls/permissions.ts";
import {CallContext, CallContextInterface} from "./context.ts";
import ConnectionStatus from "../parts/connection-status.tsx";
import Tooltip from "../helpers/tooltip.tsx";
import GroupAudioGrid from "./group-audio-grid.tsx";
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
 * A group audio call, from the CallContext: its roster (GroupAudioGrid) and its dock. The dock holds the user's own
 * controls (microphone, locked while a moderator keeps it off, raised hand for someone who can't send, the settings
 * with the devices, leaving), Show Chat / Hide Chat where the call has a chat beside it, Add Person where the call can
 * add people, and a moderator's Host Controls, as in the video room (moderation-panels.tsx).
 */
export default function GroupAudioCallLayout() {
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
    // Opened from the prompt of the join's Test Microphone: the microphone's test runs from the start, once.
    const [ previewOnOpen, setPreviewOnOpen ] = useState( false );
    useEffect( () => { if ( ! configOpen ) setPreviewOnOpen( false ); }, [ configOpen ] );
    const [ addOpen, setAddOpen ] = useState( false );
    const [ panel, setPanel ] = useState<ModerationPanel>( null );
    const closePanel = useCallback( () => setPanel( null ), [] );
    const stageRef = useRef<HTMLDivElement>( null );
    const { notice, remind } = useModeratorNotice( myMicMuted );
    const status = statusMessage || notice;
    const handOffered = ! canPublish && ! adminMode && ( callMode === 'broadcast' || moderates( moderation, 'raise_hand' ) );

    // The user's own hand shows a spinner while its request is out (see pending.ts).
    const [ isPending, run ] = usePendingActions();
    const busy = ( key: string ) => isPending( key ) ? 1 : undefined;
    const glyph = ( key: string, name: IconName ) => isPending( key )
        ? <Icon name="spinner" size={ 20 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 20 } />;
    const controlsRef = useRef<HTMLDivElement>(null);

    const configAvailable = useConfigAvailable();
    const [ joinPrompt, dismissJoinPrompt ] = useJoinPrompt( configOpen );

    const localParticipant = participants.has('me') ? participants.get('me') : null;
    // Someone who only listens has no tile of their own, and sends nothing to measure: connected, they read as good.
    const quality = localParticipant ? localParticipant.quality : connectionState === 'connected' ? 'good' : 'connecting';

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
        <GroupAudioGrid />

        <Piece name="CallStatus" props={ { layout: 'group-audio', action, text: status, duration: callDurationRef?.current ?? 0 } }>
            { status && <div className="wplus-group-call-status" role="status" part="call-status">{ status }</div> }
        </Piece>

        {/* A raised hand and who joined, for a moderator (host-toasts.tsx). */}
        { adminMode && <HostToasts /> }

        {/* Joined with the microphone off, and Test Microphone (device-panel.tsx). */}
        { joinPrompt && <JoinPrompt video={ false } preview={ () => { setPreviewOnOpen( true ); setConfigOpen( true ); } } dismiss={ dismissJoinPrompt } /> }

            <div ref={controlsRef} className="wplus-group-call-controls-v2" part="call-controls">
                { configOpen === true && <DevicePanel video={ false } start={ previewOnOpen ? 'microphone' : undefined } close={ () => setConfigOpen( false ) } /> }
                { addOpen && <AddPersonPanel close={ () => setAddOpen( false ) } /> }
                <ConnectionStatus state={connectionState} quality={quality}></ConnectionStatus>

                <CallDock className="wplus-group-call-controls-buttons" pinned={ 1 }>
                    {/* Show / hide the conversation — see the video room. */}
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
                                    <Tooltip content={_x('Raise Hand', 'Group Audio Chat', 'bp-better-messages')}>
                                        <span onClick={() => run( 'own-hand', raiseHand )} data-busy={ busy( 'own-hand' ) } className="wplus-raise-hand">
                                            { glyph( 'own-hand', 'raisehand' ) }
                                        </span>
                                    </Tooltip>
                                }
                                { myHandRaised &&
                                    <Tooltip content={_x('Lower Hand', 'Group Audio Chat', 'bp-better-messages')}>
                                        <span onClick={() => run( 'own-hand', raiseHand )} data-busy={ busy( 'own-hand' ) } className="wplus-lower-hand wplus-hand-active">
                                            { glyph( 'own-hand', 'raisehand' ) }
                                        </span>
                                    </Tooltip>
                                }
                            </> }

                            {/* The room's rules in one panel — see the video room. */}
                            { ( adminMode && roomModerated( moderation ) ) &&
                                hostControlsItem( panel === 'room', roomMuted || roomLocked || callMode === 'broadcast', () => setPanel( panel === 'room' ? null : 'room' ) )
                            }
                        </>
                    }
                    <Tooltip content={_x('Exit Chat', 'Group Audio Chat', 'bp-better-messages')}>
                        <span onClick={ () => endCall() } className="wplus-exit-room">
                            <Icon name="logout" size={ 20 } />
                        </span>
                    </Tooltip>
                </CallDock>
            </div>

            {/* The moderator's menus, at the button that opened them (moderation-panels.tsx). */}
            { ( adminMode && panel === 'room' ) && <RoomPanel stage={ stageRef } close={ closePanel } /> }
            { ( adminMode && panel !== null && panel !== 'room' ) && <PersonPanel key={ panel } stage={ stageRef } tileKey={ panel } type="audio" close={ closePanel } /> }
        </div>
    </ModerationPanelContext.Provider>
    )
}
