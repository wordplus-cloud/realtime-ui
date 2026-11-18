import {createElement, useEffect, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {__, _x, sprintf} from "./i18n.ts";
import {useStream} from "./context.tsx";
import {DialogBox, useConfirm} from "./dialog.tsx";
import {clock} from "./format.ts";
import {Icon} from "./icons.tsx";
import {usePlayer, useNow} from "./player.tsx";

// A stream's recording, as its page hands it to the views: the host records from the studio (Record in its bar, the
// REC chip among its figures, and before going live a switch to record every time it goes live), viewers see REC over
// the picture while it records as the site tells them, and once it has ended a recording of it plays on its page
// (`<recording-player>`, a script of its own the page loads).
//
// The page does the work (start and stop through its own server, the state as it changes): the views draw it and ask
// first. Absent, nothing of recording shows.

export interface StreamRecording {
    state : 'off' | 'starting' | 'on' | 'stopping';
    // The recording's own id.
    id? : number | string;
    // When it started, in seconds since the epoch.
    since? : number;
    // Whether the user starts and stops it: the hosts of the stream, the only ones who see REC. A stream records its
    // stage, its hosts, never its audience, so its viewers are told nothing and see no REC.
    can : boolean;
    // How the site tells people in a call. A stream's viewers, out of the picture, are not told whatever it says.
    tell? : 'indicator' | 'moderators' | 'notice' | 'ask' | 'muted';
    // Whether the stream records every time it goes live, and the way to change that, for its hosts.
    auto? : boolean;
    setAuto? : ( on : boolean ) => Promise<unknown>;
    // Who watches it afterwards: the stream's viewers on its page, or the site's administrators alone.
    watch? : 'everyone' | 'admins';
    transcript? : boolean;
    start : () => Promise<unknown>;
    stop : () => Promise<unknown>;
}

// A recording of the stream to play on its page once it has ended: the read route of the WordPlus SDK's recordings,
// which `<recording-player>` fetches, and the element's name where the page gives its elements a prefix.
export interface StreamReplay {
    src : string;
    element? : string;
    // Called as the recording is opened: the page fetches the element's script then, not with the stream.
    prepare? : () => void;
}

// What the confirm to start says: what is recorded, who watches it, that viewers see nothing of it, and what it costs.
export function startMessage( recording : StreamRecording ) : string {
    const said = [ __( 'Everything viewers see and hear is recorded, until you stop it or the stream ends.', 'wordplus-live-stream' ) ];

    said.push( recording.watch === 'everyone'
        ? __( 'Viewers can watch the recording on the page of the stream after it ends.', 'wordplus-live-stream' )
        : __( 'Only site administrators can watch it, in the Recordings list.', 'wordplus-live-stream' ) );

    if( recording.transcript ) said.push( __( 'A transcript is made too.', 'wordplus-live-stream' ) );

    // A stream records its stage, not its audience: only its hosts see REC.
    said.push( __( 'Viewers are not in the recording and see no REC.', 'wordplus-live-stream' ) );

    said.push( __( 'Recording takes 1 credit a minute from the credits of this site.', 'wordplus-live-stream' ) );

    return said.join( ' ' );
}

// The start and the stop, each asked first, and starting by itself as the stream goes live where it records every time.
export function useRecordingActions(){
    const { recording } = usePlayer();
    const confirm = useConfirm();
    const [ error, setError ] = useState( '' );

    const run = async ( work : () => Promise<unknown> ) => {
        setError( '' );
        try {
            await work();
        } catch ( e ) {
            setError( e instanceof Error && e.message ? e.message : __( 'Recording is not available right now.', 'wordplus-live-stream' ) );
        }
    };

    const start = async () => {
        if( ! recording ) return;
        const yes = await confirm( {
            title: __( 'Start recording?', 'wordplus-live-stream' ),
            message: startMessage( recording ),
            confirm: __( 'Start recording', 'wordplus-live-stream' )
        } );
        if( yes ) await run( recording.start );
    };

    const stop = async () => {
        if( ! recording ) return;
        const yes = await confirm( {
            title: __( 'Stop recording?', 'wordplus-live-stream' ),
            message: recording.watch === 'everyone'
                ? __( 'Viewers can watch it on the page of the stream a few minutes after the stream ends.', 'wordplus-live-stream' )
                : __( 'It is ready in the Recordings list a few minutes after it stops.', 'wordplus-live-stream' ),
            confirm: __( 'Stop recording', 'wordplus-live-stream' ),
            danger: true
        } );
        if( yes ) await run( recording.stop );
    };

    return { recording, start, stop, error, run };
}

// Starts it as the stream goes live from this page, where the stream records every time: once for each time on air.
export function useAutoRecord( sending : boolean ){
    const { recording } = usePlayer();
    const { stream } = useStream();
    const started = useRef<number | null>( null );
    const onAir = sending && stream?.state === 'live' ? stream.started_at ?? 0 : null;

    useEffect( () => {
        if( onAir === null || ! recording?.can || ! recording.auto || recording.state !== 'off' || started.current === onAir ) return;
        started.current = onAir;
        recording.start().catch( () => undefined );
    }, [ onAir, recording?.can, recording?.auto, recording?.state ] );
}

// Among the studio's figures while live: REC and how long, which stops it for those who may. Starting and saving, said.
export function RecordingChip(){
    const { recording, stop } = useRecordingActions();
    const { stream } = useStream();
    const now = useNow( 1000, recording?.state === 'on' );

    if( ! recording || stream?.state !== 'live' ) return null;

    if( recording.state === 'starting' || recording.state === 'stopping' ){
        return (
            <span className="wplus-live-stream-chip wplus-live-stream-chip--rec" data-state={ recording.state } role="status">
                <span className="wplus-live-stream-rec__dot" aria-hidden="true" />
                { recording.state === 'starting' ? __( 'Starting recording…', 'wordplus-live-stream' ) : __( 'Saving recording…', 'wordplus-live-stream' ) }
            </span>
        );
    }

    if( recording.state !== 'on' ) return null;

    const time = clock( now - ( recording.since ? recording.since * 1000 : now ) );
    const inside = <>
        <span className="wplus-live-stream-rec__dot" aria-hidden="true" />
        { _x( 'REC', 'a stream being recorded', 'wordplus-live-stream' ) }
        <span className="wplus-live-stream-chip__number">{ time }</span>
    </>;

    return recording.can ? (
        <button type="button" className="wplus-live-stream-chip wplus-live-stream-chip--rec wplus-live-stream-chip--button" data-state="on" onClick={ () => void stop() }
            aria-label={ sprintf( _x( 'Recording, %s. Stop recording', 'how long a stream has been recorded, as 12:04', 'wordplus-live-stream' ), time ) }
            data-wplus-live-stream-tip={ __( 'Stop recording', 'wordplus-live-stream' ) }>
            { inside }
        </button>
    ) : (
        <span className="wplus-live-stream-chip wplus-live-stream-chip--rec" data-state="on">{ inside }</span>
    );
}

// Record in the studio's bar while live, for those who may: Stop recording while it records.
export function RecordButton(){
    const { recording, start, stop, error } = useRecordingActions();
    const { stream } = useStream();

    if( ! recording?.can || stream?.state !== 'live' ) return null;

    const on = recording.state === 'on';
    const busy = recording.state === 'starting' || recording.state === 'stopping';
    const label = on ? __( 'Stop recording', 'wordplus-live-stream' ) : __( 'Record', 'wordplus-live-stream' );

    return (
        <>
            <button type="button" className={ 'wplus-live-stream-button wplus-live-stream-studio__record' + ( on ? ' wplus-live-stream-button--on' : '' ) } aria-pressed={ on } disabled={ busy }
                data-wplus-live-stream-tip={ label } onClick={ () => void ( on ? stop() : start() ) }>
                <Icon name="record" />
                <span className="wplus-live-stream-label">{ label }</span>
            </button>
            { error && <span className="wplus-live-stream-controls__error wplus-live-stream-studio__record-error" role="alert">{ error }</span> }
        </>
    );
}

// Before going live, for those who may: whether the stream records every time it goes live, kept with the stream.
export function RecordSetting(){
    const { recording } = usePlayer();
    const [ on, setOn ] = useState( Boolean( recording?.auto ) );
    const [ failed, setFailed ] = useState( false );

    useEffect( () => setOn( Boolean( recording?.auto ) ), [ recording?.auto ] );

    if( ! recording?.can || ! recording.setAuto ) return null;

    const change = ( value : boolean ) => {
        setOn( value );
        setFailed( false );
        recording.setAuto!( value ).catch( () => {
            setOn( ! value );
            setFailed( true );
        } );
    };

    return (
        <div className="wplus-live-stream-setup__row">
            <span className="wplus-live-stream-setup__label">{ _x( 'Recording', 'the studio setting', 'wordplus-live-stream' ) }</span>
            <div className="wplus-live-stream-setup__field wplus-live-stream-setup__field--stack">
                <label className="wplus-live-stream-switch">
                    <input type="checkbox" role="switch" checked={ on } onChange={ ( e ) => change( e.target.checked ) } />
                    <span className="wplus-live-stream-switch__track" aria-hidden="true" />
                    { __( 'Record every time this stream goes live', 'wordplus-live-stream' ) }
                </label>
                <p className="wplus-live-stream-setup__note">
                    { __( 'It starts as you go live and stops as the stream ends. You can also start and stop it while live. Recording takes 1 credit a minute from the credits of this site.', 'wordplus-live-stream' ) }
                </p>
                { failed && <p className="wplus-live-stream-controls__error" role="alert">{ __( 'The setting was not saved. Try again.', 'wordplus-live-stream' ) }</p> }
            </div>
        </div>
    );
}

// REC over the picture while it records, for its hosts alone (asked on 2026-11-02: "REC pill should not be shown if
// frontend for users"): a stream records its stage, not its audience, so its viewers have nothing to be told.
export function RecMark(){
    const { recording } = usePlayer();
    const { stream, you } = useStream();

    if( ! recording || recording.state !== 'on' || stream?.state !== 'live' ) return null;
    if( ! recording.can && you?.role !== 'host' ) return null;

    return (
        <span className="wplus-live-stream-badge wplus-live-stream-badge--rec" title={ __( 'This stream is being recorded.', 'wordplus-live-stream' ) }>
            { _x( 'REC', 'a stream being recorded', 'wordplus-live-stream' ) }
        </span>
    );
}

// The recording of a stream that ended, played in a dialog of its own: the player beside its transcript where there is
// room. In the theme root, which goes full screen with it.
function ReplayDialog( props : { replay : StreamReplay, onClose : () => void } ){
    const { root } = usePlayer();
    const target = root.current ?? ( typeof document !== 'undefined' ? document.body : null );
    const element = createElement( props.replay.element || 'recording-player', { src: props.replay.src, autoplay: '' } );

    if( ! target ) return null;

    return createPortal(
        <DialogBox
            labelId="wplus-live-stream-replay-title"
            title={ __( 'Recording of the stream', 'wordplus-live-stream' ) }
            wide
            onCancel={ props.onClose }
            actions={ <button type="button" className="wplus-live-stream-button" onClick={ props.onClose }>{ _x( 'Close', 'the recording of a stream', 'wordplus-live-stream' ) }</button> }
        >
            <div className="wplus-live-stream-replay">{ element }</div>
        </DialogBox>,
        target
    );
}

// Under the end's thanks, where the page has a recording of it: the way to watch it.
export function ReplayButton(){
    const { replay } = usePlayer();
    const [ open, setOpen ] = useState( false );

    if( ! replay?.src ) return null;

    return (
        <div className="wplus-live-stream-screen__actions">
            <button type="button" className="wplus-live-stream-button wplus-live-stream-button--primary" onClick={ () => {
                replay.prepare?.();
                setOpen( true );
            } }>
                <Icon name="play" />
                { __( 'Watch the recording', 'wordplus-live-stream' ) }
            </button>
            { open && <ReplayDialog replay={ replay } onClose={ () => setOpen( false ) } /> }
        </div>
    );
}
