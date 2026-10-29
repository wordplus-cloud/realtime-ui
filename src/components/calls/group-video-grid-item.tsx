import React, {memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import {CallContext, CallContextInterface, CallParticipant} from "./context.ts";
import {getSpeakerHighlightStyles} from "../../inc/functions.ts";
import {_x} from "../../inc/globals.ts";
import { host } from "../../host.ts";
import Tooltip from "../helpers/tooltip.tsx";
import useStateRef from "../../inc/hooks/state-ref.ts";
import UserName from "../users/user-name.tsx";
import Resizable from "../helpers/resizable.tsx";
import Icon, { IconName } from "../../primitives/icon.tsx";
import { ManageParticipant, MicLockedChip, ModerationPanelContext, heldMute, tileModerated } from "./moderation-panels.tsx";
import { usePictureDrawn } from "../../inc/calls/ratio.ts";
import usePendingActions from "../../inc/calls/pending.ts";
import useHeld, { PAUSED_NOTICE_MS } from "../../inc/hooks/held.ts";
import { Piece } from "../../pieces.tsx";
import { CameraOptimizingNotice, useCameraOptimizing } from "./optimizing.tsx";
import { pictureless, stalledShown, STALLED_VIDEO_CLASS, VideoInterruptedNotice } from "./stalled.tsx";

/**
 * One person's tile in a group video call: their camera or shared screen (their picture until one comes; the user's
 * own camera shown once a frame of it is drawn), their name, the ring of whoever speaks, microphone and raised hand,
 * "Reconnecting..." while they are briefly away or nothing of theirs arrives, "Video interrupted" over their blurred
 * last frame while their camera alone stopped arriving (stalled.tsx), "Paused: weak connection" over their last frame
 * while the media server holds their video back from this page's download, "Viewer" for someone who can't send, a
 * locked microphone for one a moderator muted, and for a moderator the ⋯ that opens what they can do about this person
 * (moderation-panels.tsx), the tile outlined while that panel is open.
 */
export default memo(function GroupVideoGridItem({ unique_key, participant, width, height, x, y } : {
    unique_key: string,
    participant: CallParticipant,
    width: number,
    height: number,
    x: number,
    y: number
}){
    const itemRef = useRef<HTMLDivElement>(null);

    const {
        connectionState,
        adminMode,
        selectedSpeakerDevice,
        lowerHand,
        moderation,
        optimizingMaxMs
    } = useContext<CallContextInterface>( CallContext );

    const [ videoElement, setVideoElement ] = useStateRef<HTMLVideoElement | null>(null);
    const [ audioElement, setAudioElement ] = useState<HTMLAudioElement | null>(null);
    const [ screenElement, setScreenElement ] = useState<HTMLVideoElement | null>(null);

    useEffect(() => {
        if( !! audioElement && audioElement.setSinkId ){
            audioElement.setSinkId(selectedSpeakerDevice);
        }
    }, [ audioElement, selectedSpeakerDevice ]);

    useEffect(() => {
        if( !! screenElement && screenElement.setSinkId ){
            screenElement.setSinkId(selectedSpeakerDevice);
        }
    }, [ screenElement, selectedSpeakerDevice ]);

    useEffect(() => {
        if ( videoElement && !! participant && !! participant.video && ! participant.video.attachedElements.includes(videoElement) ) {
            participant.video.attach(videoElement);
        }
    }, [ videoElement, participant ]);

    useEffect(() => {
        if ( audioElement && !! participant && !! participant.audio && ! participant.audio.attachedElements.includes(audioElement) ) {
            participant.audio.attach(audioElement);
        }
    }, [ audioElement, participant ]);

    useEffect(() => {
        if ( screenElement && !! participant && !! participant.screen && ! participant.screen.attachedElements.includes(screenElement) ) {
            participant.screen.attach(screenElement);

            if ( unique_key !== 'me' && !! participant.screenAudio && ! participant.screenAudio.attachedElements.includes(screenElement) ) {
                participant.screenAudio.attach(screenElement);
            }
        }
    }, [ screenElement, participant ]);

    // The own camera's picture waits for the browser to have drawn a frame of
    // it before it takes the tile's size, as the 1:1 call's own chip does: on
    // a phone, WebKit fits the camera's turned frame only when the picture
    // is resized, and a picture already at its size when the first frame came
    // in stayed about half the tile's width in a black frame (see
    // usePictureDrawn).
    const selfPicture = usePictureDrawn( unique_key === 'me' ? videoElement : null, participant.video );

    const selfPictureClass = unique_key !== 'me' ? undefined : "wplus-group-call-self-video"
        + ( selfPicture ? " wplus-group-call-self-video--ready" : "" )
        + ( selfPicture === 'counted' ? " wplus-group-call-self-video--counted" : "" );

    let className = "wplus-group-call-input-video";
    let innerClass = "wplus-group-call-input-video-inner";

    if( !! participant.screen ) className += " wplus-group-call-input-video-screen";
    if( unique_key === 'me' ) className += " wplus-group-call-input-mine";

    let style : React.CSSProperties = {
        width: width + '%',
        height: height + '%',
        top: y + '%',
        left: x + '%'
    }

    let callerInfoStyle : React.CSSProperties = {}

    let innerStyle : React.CSSProperties = {
        backgroundImage: "url('" + participant.avatar + "')"
    };

    if( !! participant.video || !! participant.screen ) {
        delete innerStyle.backgroundImage;
    }

    const accentColor = host().accentColor();

    const speakerHighlight = useMemo(() => {
        return getSpeakerHighlightStyles( participant.isSpeaking, participant.audioLevel, accentColor );
    }, [ accentColor, participant.audioLevel, participant.isSpeaking ]);

    if( speakerHighlight ){
        innerClass += " wplus-active-speaker";
        innerStyle['boxShadow'] = speakerHighlight.boxShadow;
    }

    let user_id : number | string = host().currentUserId();

    if( unique_key.startsWith('user_') ){
        // A user of the app: their id of digits as a number, as Better Messages has it, any other id as it is.
        const id = unique_key.substring(5);
        user_id = /^[1-9][0-9]*$/.test( id ) ? Number( id ) : id;
    }

    // Someone who can't send: "Viewer" on their tile, in broadcast mode or made one, and no microphone chip.
    const viewer = ! participant.canPublish && ! participant.canAdmin;
    const held = heldMute( moderation, participant );

    const moderating = useContext( ModerationPanelContext ).panel === unique_key;
    if( moderating ) innerClass += " wplus-moderating";

    // The moderator's lowering of a raised hand waits from the click until the tile shows it (see pending.ts).
    const [ isPending, run ] = usePendingActions(
        [ participant.isPinned, participant.canPublish, participant.micMuted, participant.handRaised ].join( '|' )
    );
    const busy = ( key: string ) => isPending( key ) ? 1 : undefined;
    const glyph = ( key: string, name: IconName ) => isPending( key )
        ? <Icon name="spinner" size={ 14 } className="wplus-svg-animate" />
        : <Icon name={ name } size={ 14 } />;

    // Their camera moving to another codec: "Optimizing video quality..." over its last frame until the new one draws,
    // the user's own tile too while theirs moves (the call marks it), rather than their avatar for the gap. Only where
    // the tile shows their camera: a shared screen fills it then, and is never covered for the camera.
    const optimizing = useCameraOptimizing( participant, videoElement, optimizingMaxMs );
    const optimizingShown = optimizing.shown && ! participant.screen && ! participant.reconnecting;

    // A picture the media server paused for this page's download: frozen on its last frame, so the tile says why once
    // it has stayed so for a moment (most pauses end within one, when its guard finds a smaller picture fits).
    const paused = useHeld( unique_key !== 'me' && ! participant.reconnecting && ! optimizingShown
        && ( ( !! participant.video && !! participant.videoPaused ) || ( !! participant.screen && !! participant.screenPaused ) ), PAUSED_NOTICE_MS );

    // Their media stopped arriving while they are still in the call: their camera's last frame blurred, and their
    // screen's too when nothing of theirs arrives; "Video interrupted" only where the tile shows their camera, a screen
    // being still for as long as nothing on it moves. A camera the call says why it holds (moving codec, paused for the
    // download) isn't said to be interrupted as well.
    const stalled = stalledShown( participant, unique_key === 'me' );
    const interrupted = stalled === 'video' && ! optimizingShown && ! paused;
    const cameraClass = ( base?: string ) => [ base, stalled === 'all' || interrupted ? STALLED_VIDEO_CLASS : '' ].filter( Boolean ).join( ' ' ) || undefined;
    const screenClass = stalled === 'all' ? STALLED_VIDEO_CLASS : undefined;
    // Their camera never showed a frame here, so there is no last frame to blur: their face over the empty picture,
    // above "Video interrupted", or under "Reconnecting..." as on a tile away.
    const faceShown = ( stalled === 'all' || interrupted ) && !! participant.video && ! participant.screen && pictureless( videoElement );
    if( faceShown && stalled === 'all' ){
        innerClass += " wplus-call-pictureless";
        innerStyle.backgroundImage = "url('" + participant.avatar + "')";
    }
    const face = faceShown && interrupted
        ? <span className="wplus-call-stalled-face" aria-hidden="true" style={ { backgroundImage: "url('" + participant.avatar + "')" } } />
        : undefined;

    // Their sound, in the tile's media, and after an app's own tile in its place (pieces.tsx).
    const sound = ( !! participant.audio && unique_key !== 'me' ) &&
        <audio ref={setAudioElement} autoPlay playsInline muted={false} style={{display: 'none'}}/>;

    return <div ref={itemRef} data-key={ unique_key } className={className} style={style} part="grid-tile">
        <Piece name="GridTile" props={ { participant, layout: 'group-video' } } always={ sound }>
        <Tooltip content={ participant.name }>
            <div className={innerClass} style={innerStyle}>
                {/* A moderator's actions for this person, in their panel above the dock (moderation-panels.tsx). */}
                { ( adminMode && connectionState === 'connected' && tileModerated( moderation, unique_key, 'video' ) ) &&
                    <ManageParticipant tileKey={ unique_key } participant={ participant } />
                }

                { ( participant.reconnecting || stalled === 'all' ) &&
                    <span className="wplus-call-reconnecting" role="status">{ _x('Reconnecting...', 'Call Screen', 'bp-better-messages') }</span>
                }

                { optimizingShown && <CameraOptimizingNotice state={ optimizing } avatar={ participant.avatar } /> }

                { ( interrupted && !! participant.video && ! participant.screen ) && <VideoInterruptedNotice face={ face } /> }

                { paused &&
                    <span className="wplus-call-paused" part="video-paused">
                        <Tooltip content={ _x('Your connection cannot carry this video right now. The sound goes on and the video comes back by itself.', 'Call Screen', 'bp-better-messages') }>
                            <span className="wplus-call-paused-notice">
                                <Icon name="wifiWeak" size={ 16 } />
                                <span>{ _x('Paused: weak connection', 'Call Screen', 'bp-better-messages') }</span>
                            </span>
                        </Tooltip>
                    </span>
                }

                {/* The microphone off: locked when a moderator keeps it so, which is what they look here for. */}
                { ( connectionState === 'connected' && ! participant.reconnecting && ! viewer && ( held || ( ! participant.audio && ! participant.screenAudio ) ) ) && <span className="wplus-caller-status">
                    { held
                        ? <MicLockedChip />
                        : <Tooltip content={_x('Microphone Disabled', 'Group Video Chat', 'bp-better-messages')}>
                            <span className="wplus-mic-disabled">
                                <Icon name="micOff" size={ 14 } />
                            </span>
                        </Tooltip> }
                </span> }

                { ( connectionState === 'connected' && participant.handRaised ) && <span className="wplus-hand-raised-status">
                    <Tooltip content={ adminMode && unique_key !== 'me' ? _x('Lower Hand', 'Group Video Chat', 'bp-better-messages') : _x('Hand Raised', 'Group Video Chat', 'bp-better-messages') }>
                        <span className="wplus-hand-raised" onClick={ adminMode && unique_key !== 'me' ? () => run( 'hand', () => lowerHand( participant.identity ) ) : undefined } data-busy={ busy( 'hand' ) } style={ adminMode && unique_key !== 'me' ? { cursor: 'pointer' } : undefined }>
                            { glyph( 'hand', 'raisehand' ) }
                        </span>
                    </Tooltip>
                </span> }

                { ( connectionState === 'connected' && viewer ) &&
                    <span className="wplus-viewer-badge">
                        <Tooltip content={_x('Viewer', 'Group Video Chat', 'bp-better-messages')}>
                            <span>{_x('Viewer', 'Group Video Chat', 'bp-better-messages')}</span>
                        </Tooltip>
                    </span>
                }

                {/* The name on every tile, over a picture too: who is who stays on screen for everyone. */}
                <div className="wplus-group-call-input-video-inner-info">
                    <span className="wplus-caller-info" style={callerInfoStyle}>
                        <span className="wplus-info-name">
                            <span className="wplus-caller-name"><UserName user_id={user_id}/></span>
                        </span>
                    </span>
                </div>

                <div className={"wplus-media-container" + ( !! participant.screen ? " wplus-screen-shared" : "" )}>
                    { ( !! participant.screen ) && <video ref={setScreenElement} className={screenClass} datatype="screen" autoPlay={true} playsInline={true}></video> }

                    { ( !! participant.video && !! participant.screen ) &&
                        <Resizable className="wplus-small-video" resizeDirection="none">
                            <video ref={setVideoElement} className={cameraClass()} datatype="camera" autoPlay playsInline muted={unique_key === 'me'}/>
                        </Resizable>
                    }

                    { ( !! participant.video && ! participant.screen ) &&
                        <video ref={setVideoElement} className={cameraClass( selfPictureClass )} datatype="camera" autoPlay={true} playsInline={true}></video>
                    }
                    { sound }
                </div>
            </div>
        </Tooltip>
        </Piece>
    </div>
})
