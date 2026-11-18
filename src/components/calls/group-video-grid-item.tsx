import React, {memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {CallContext, CallContextInterface, CallParticipant} from "./context.ts";
import {getSpeakerHighlightStyles} from "../../inc/functions.ts";
import {_x} from "../../inc/globals.ts";
import { host } from "../../host.ts";
import Tooltip from "../helpers/tooltip.tsx";
import BaseTooltip from "../../primitives/tooltip.tsx";
import useStateRef from "../../inc/hooks/state-ref.ts";
import UserName from "../users/user-name.tsx";
import Resizable from "../helpers/resizable.tsx";
import Icon, { IconName } from "../../primitives/icons.tsx";
import { ManageParticipant, MicLockedChip, ModerationPanelContext, heldMute, tileModerated } from "./moderation-panels.tsx";
import { usePictureDrawn } from "../../inc/calls/ratio.ts";
import usePendingActions from "../../inc/calls/pending.ts";
import useHeld, { PAUSED_NOTICE_MS } from "../../inc/hooks/held.ts";
import { Piece } from "../../pieces.tsx";
import { CameraOptimizingNotice, useCameraOptimizing } from "./optimizing.tsx";
import { pictureless, stalledShown, STALLED_VIDEO_CLASS, VideoInterruptedNotice } from "./stalled.tsx";
import { PinForMe, PinsContext, SpotlightLabel } from "./spotlight.tsx";
import { usePinOffered } from "./layout-choice.tsx";
import { isMobile } from "../../inc/functions/browser-info.ts";
import KeptMedia from "./kept-media.tsx";

const TILE_TAPPED_MS = 4000;
const CAMERA = { datatype: 'camera' };
const SCREEN = { datatype: 'screen' };

/**
 * A tile's name pill. It says the name, so no tooltip repeats it, unless the pill cuts the name short with an ellipsis
 * (a narrow tile, a long name): then the whole of what it writes shows over the pill, as text. The host writes the name
 * (UserName), which can differ from the one the call carries. Measured again whenever the pill or the name in it
 * changes size, or the name changes.
 */
function TileName( { user_id }: { user_id: number | string } ) {
    const pill = useRef<HTMLSpanElement | null>( null );
    // The pill's text while the pill cuts it short, else empty.
    const [ whole, setWhole ] = useState( '' );

    useLayoutEffect( () => {
        const element = pill.current;
        if ( ! element ) return;
        const text = element.querySelector<HTMLElement>( '.wplus-caller-name' );
        const measure = () => {
            const cut = [ element, text ].some( ( box ) => !! box && box.scrollWidth > box.clientWidth + 1 );
            setWhole( cut ? ( element.textContent ?? '' ).trim() : '' );
        };
        measure();
        const resized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver( measure );
        resized?.observe( element );
        if ( text ) resized?.observe( text );
        const written = typeof MutationObserver === 'undefined' ? null : new MutationObserver( measure );
        written?.observe( element, { childList: true, subtree: true, characterData: true } );
        return () => {
            resized?.disconnect();
            written?.disconnect();
        };
    }, [ user_id ] );

    return <BaseTooltip label={ whole } disabled={ whole === '' }>
        <span ref={ pill } className="wplus-info-name">
            <span className="wplus-caller-name"><UserName user_id={ user_id }/></span>
        </span>
    </BaseTooltip>;
}

/**
 * One person's tile in a group video call: their camera or shared screen (their picture until one comes; the user's
 * own camera shown once a frame of it is drawn), their name, the ring of whoever speaks, microphone and raised hand,
 * "Reconnecting..." while they are briefly away or nothing of theirs arrives, "Video interrupted" over their blurred
 * last frame while their camera alone stopped arriving (stalled.tsx), "Paused: weak connection" over their last frame
 * while the media server holds their video back from this page's download, "Viewer" for someone who can't send, a
 * locked microphone for one a moderator muted, and for a moderator the ⋯ that opens what they can do about this person
 * (moderation-panels.tsx), the tile outlined while that panel is open.
 */
export default memo(function GroupVideoGridItem({ unique_key, participant, width, height, x, y, spotlit = false, cover = false } : {
    unique_key: string,
    participant: CallParticipant,
    width: number,
    height: number,
    x: number,
    y: number,
    // In the spotlight for everyone (spotlight.tsx).
    spotlit?: boolean,
    // The camera fills the tile, its edges cropped (a phone's or a tablet's grid, group-video-grid.tsx).
    cover?: boolean
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
    if( cover && ! participant.screen ) className += " wplus-cover-video";

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

    // On a touch screen a tile's pin and ⋯ show for TILE_TAPPED_MS once it is tapped (_touch.scss), a tap on them
    // aside, and go on a second tap.
    const touchTiles = isMobile();
    const [ tapped, setTapped ] = useState( false );
    useEffect( () => {
        if ( ! tapped ) return;
        const timer = window.setTimeout( () => setTapped( false ), TILE_TAPPED_MS );
        return () => window.clearTimeout( timer );
    }, [ tapped ] );
    const onTileTap = ( event: React.MouseEvent<HTMLDivElement> ) => {
        if ( ( event.target as Element ).closest?.( '.wplus-admin-controls' ) ) return;
        setTapped( ( was ) => ! was );
    };
    const pinnedHere = useContext( PinsContext ).pinned.has( unique_key );
    const pin = usePinOffered()( unique_key ) ? <PinForMe tileKey={ unique_key } name={ participant.name } /> : null;

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
    // The page's elements, kept as the tile is drawn again elsewhere (kept-media.tsx), so the picture and the sound play on.
    const sound = ( !! participant.audio && unique_key !== 'me' ) &&
        <KeptMedia id={ unique_key + ':audio' } tag="audio" hidden onElement={ setAudioElement as ( element: HTMLMediaElement | null ) => void } />;

    // The wrapper still names the tile and makes a tapped tile a control on a touch screen, with no tooltip: the name
    // pill says who it is (TileName).
    return <div ref={itemRef} data-key={ unique_key } className={className} style={style} part="grid-tile">
        <Piece name="GridTile" props={ { participant, layout: 'group-video' } } always={ sound }>
        <Tooltip content={ participant.name } disabled>
            <div className={innerClass} style={innerStyle} data-tapped={ tapped ? 1 : undefined } onClick={ touchTiles ? onTileTap : undefined }>
                {/* Pin for Me for everyone (spotlight.tsx), and a moderator's actions for this person, in their panel
                    above the dock (moderation-panels.tsx). */}
                { connectionState === 'connected' && ( ( adminMode && tileModerated( moderation, unique_key, 'video' ) )
                    ? <ManageParticipant tileKey={ unique_key } participant={ participant } shown={ pinnedHere }>{ pin }</ManageParticipant>
                    : pin && <span className="wplus-admin-controls" data-open={ pinnedHere ? 1 : undefined }>{ pin }</span> )
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

                {/* The name on every tile, over a picture too: who is who stays on screen for everyone. A spotlighted
                    tile says so beside it. */}
                <div className="wplus-group-call-input-video-inner-info">
                    { spotlit && <SpotlightLabel /> }
                    <span className="wplus-caller-info" style={callerInfoStyle}>
                        <TileName user_id={ user_id } />
                    </span>
                </div>

                <div className={"wplus-media-container" + ( !! participant.screen ? " wplus-screen-shared" : "" )}>
                    { ( !! participant.screen ) && <KeptMedia id={ unique_key + ':screen' } tag="video" className={ screenClass } attributes={ SCREEN } onElement={ setScreenElement as ( element: HTMLMediaElement | null ) => void } /> }

                    { ( !! participant.video && !! participant.screen ) &&
                        <Resizable className="wplus-small-video" resizeDirection="none">
                            <KeptMedia id={ unique_key + ':camera' } tag="video" className={ cameraClass() } attributes={ CAMERA } muted={ unique_key === 'me' } onElement={ setVideoElement as ( element: HTMLMediaElement | null ) => void } />
                        </Resizable>
                    }

                    { ( !! participant.video && ! participant.screen ) &&
                        <KeptMedia id={ unique_key + ':camera' } tag="video" className={ cameraClass( selfPictureClass ) } attributes={ CAMERA } muted={ unique_key === 'me' } onElement={ setVideoElement as ( element: HTMLMediaElement | null ) => void } />
                    }
                    { sound }
                </div>
            </div>
        </Tooltip>
        </Piece>
    </div>
})
