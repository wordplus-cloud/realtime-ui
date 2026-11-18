import React, { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { _n, _x, sprintf } from "../../inc/globals.ts";
import { host } from "../../host.ts";
import Icon, { type IconName } from "../../primitives/icons.tsx";
import pressable from "./pressable.ts";
import Tooltip from "../helpers/tooltip.tsx";
import { useKeyAction, useKeyHint } from "./call-keys.tsx";
import { CallContext, type CallContextInterface, type CallRecording, type RecordingSummary } from "./context.ts";

/** How long "Saving recording…" stays at the top of the call once a recording stops. */
export const SAVING_MS = 4000;

/** Where an answer to a recording's notice or question is kept, by its id, for as long as the tab is open. */
const KEPT = 'wplus-recording-told-';

/** m:ss, h:mm:ss past an hour. */
function elapsed( seconds: number ): string {
    const s = Math.max( 0, Math.floor( seconds ) );
    const h = Math.floor( s / 3600 );
    const m = Math.floor( ( s % 3600 ) / 60 );
    const rest = String( s % 60 ).padStart( 2, "0" );

    return h > 0 ? h + ":" + String( m ).padStart( 2, "0" ) + ":" + rest : m + ":" + rest;
}

/** Whether the recording runs, or is on its way to. */
export function recordingOn( recording: CallRecording | undefined ): boolean {
    return !! recording && ( recording.state === 'on' || recording.state === 'starting' );
}

function keptAnswer( id: string ): string | null {
    try {
        return window.sessionStorage.getItem( KEPT + id );
    } catch {
        return null;
    }
}

function keepAnswer( id: string, answer: string ): void {
    try {
        window.sessionStorage.setItem( KEPT + id, answer );
    } catch {
        // the answer still holds for this page
    }
}

type Confirm = 'start' | 'stop';

/**
 * What the call screen knows of the recording besides the call's own state: the confirm a moderator has open, whether
 * the user has seen the notice or answered the question, and whether they joined while it recorded.
 */
export interface RecordingLayer {
    confirming: Confirm | null,
    confirm: ( which: Confirm | null ) => void,
    /** The question to stay (or agree) or leave, open until it is answered. */
    asking: boolean,
    agree: () => void,
    /** The notice, until Got It. */
    notice: boolean,
    seen: () => void,
    /** Joined while it recorded, rather than there as it started. */
    late: boolean,
}

export const RecordingLayerContext = createContext<RecordingLayer>( {
    confirming: null,
    confirm: () => undefined,
    asking: false,
    agree: () => undefined,
    notice: false,
    seen: () => undefined,
    late: false,
} );

/**
 * The recording's side of a call screen, for its context (call-screen.tsx): the layer the pill, the notice and the
 * dialogs draw from, and the call itself, where its microphone, camera and screen stay off until the user agrees to be
 * recorded (the admin's "stays muted until they agree"). Turning one on then does nothing: the question over the call
 * is the way back, whatever pressed it (the dock, a key, the device settings, the picture-in-picture window).
 */
export function useRecordingLayer( call: CallContextInterface ): { call: CallContextInterface, layer: RecordingLayer } {
    const recording = call.recording;
    const state = recording?.state;
    const id = recording?.id !== undefined && recording.id !== '' ? String( recording.id ) : '';
    const tell = recording?.tell ?? 'notice';
    const [ confirming, setConfirming ] = useState<Confirm | null>( null );
    const [ answers, setAnswers ] = useState<Record<string, string>>( {} );
    const answer = id ? ( answers[ id ] ?? keptAnswer( id ) ) : null;

    // Whether the user was in the call as it started: connected to it before this recording was first seen running. A
    // host may give a member no recording at all until one runs, so its state before says nothing of that. Someone who
    // joins while it records hears of it with the join, before the call is connected.
    const connected = call.connectionState === 'connected';
    const without = useRef( false );
    if ( ! connected ) without.current = false;
    else if ( state !== 'on' ) without.current = true;
    const lateOf = useRef( new Map<string, boolean>() );
    if ( state === 'on' && id && ! lateOf.current.has( id ) ) lateOf.current.set( id, ! without.current );

    // Where moderators alone know of it, or REC alone tells of it (the admin's choice), nobody is told or asked more.
    const told = !! recording && state === 'on' && ! recording.mine && !! id && tell !== 'moderators' && tell !== 'indicator';
    const asking = told && tell !== 'notice' && answer !== 'agreed';
    const holding = asking && tell === 'muted';

    // A confirm that no longer fits closes: Start once it records, Stop once it stopped.
    useEffect( () => {
        if ( confirming === 'start' && ( recordingOn( recording ) || state === 'stopping' ) ) setConfirming( null );
        if ( confirming === 'stop' && state !== 'on' ) setConfirming( null );
    }, [ confirming, state ] );

    useEffect( () => {
        if ( ! holding ) return;
        if ( call.myMicrophoneTrackRef?.current ) void call.disableMic();
        if ( call.myCameraTrackRef?.current ) void call.disableCamera();
        if ( call.myScreenVideoTrackRef?.current ) void call.disableShareScreen();
    }, [ holding, call.myMicrophoneTrack, call.myCameraTrack, call.myScreenVideoTrack ] );

    const held = useMemo( () => {
        if ( ! holding ) return call;
        const nothing = async () => undefined;
        return { ...call, enableMic: nothing, enableCamera: nothing, enableShareScreen: nothing };
    }, [ call, holding ] );

    const answered = ( value: string ) => {
        if ( ! id ) return;
        keepAnswer( id, value );
        setAnswers( ( was ) => ( { ...was, [ id ]: value } ) );
    };

    const layer = {
        confirming,
        confirm: setConfirming,
        asking,
        agree: () => answered( 'agreed' ),
        // A user who said Do Not Show Again sees REC alone.
        notice: told && tell === 'notice' && answer !== 'seen' && recording?.notice?.shown !== false,
        seen: () => answered( 'seen' ),
        late: !! id && !! lateOf.current.get( id ),
    };

    return { call: held, layer };
}

/**
 * Who may watch it, as one sentence for the notice and the question. Where it goes only to the site's own list
 * (`admins`), nothing: that it is recorded says enough.
 */
function watchNote( settings: RecordingSummary | undefined ): string {
    const who = settings?.watch === 'moderators' ? _x( 'Moderators can watch it afterwards.', 'Call recording', 'bp-better-messages' )
        : settings?.watch === 'everyone' ? _x( 'Everyone in the conversation can watch it afterwards.', 'Call recording', 'bp-better-messages' )
        : settings?.watch === 'people' ? _x( 'The people who were in the call can watch it afterwards.', 'Call recording', 'bp-better-messages' )
        : '';
    const transcript = settings?.transcript ? _x( 'A transcript is made too.', 'Call recording', 'bp-better-messages' ) : '';

    return [ who, transcript ].filter( Boolean ).join( ' ' );
}

function languageName( code: string ): string {
    try {
        const lang = ( typeof document !== 'undefined' && document.documentElement.lang ) || 'en';
        return new Intl.DisplayNames( [ lang ], { type: 'language' } ).of( code ) || code;
    } catch {
        return code;
    }
}

/** The start's confirm: the admin's settings, each as a row. */
function facts( settings: RecordingSummary | undefined, audio: boolean ): Array<[ string, string ]> {
    if ( ! settings ) return [];
    const rows: Array<[ string, string ]> = [];

    // An audio call is a video of its call screen too, in a layout of its own: the site sends none before it had one.
    if ( settings.size && ( ! audio || settings.audioLayout ) ) {
        const layout = audio
            ? settings.audioLayout === 'gallery' ? _x( 'Gallery layout', 'Call recording', 'bp-better-messages' ) : _x( 'As in the call', 'Call recording', 'bp-better-messages' )
            : settings.layout === 'gallery' ? _x( 'Gallery layout', 'Call recording', 'bp-better-messages' )
                : settings.layout === 'speaker_only' ? _x( 'Speaker only', 'Call recording', 'bp-better-messages' )
                    : _x( 'Speaker layout', 'Call recording', 'bp-better-messages' );
        rows.push( [ _x( 'Picture', 'Call recording', 'bp-better-messages' ), settings.size + 'p, ' + layout ] );
    }

    if ( settings.transcript !== undefined ) {
        rows.push( [ _x( 'Transcript', 'Call recording', 'bp-better-messages' ), ! settings.transcript
            ? _x( 'Off', 'Call recording: the transcript', 'bp-better-messages' )
            : ! settings.language || settings.language === 'auto'
                ? _x( 'Automatic', 'Call recording: the language of a transcript', 'bp-better-messages' )
                : languageName( settings.language ) ] );
    }

    if ( settings.watch ) {
        rows.push( [ _x( 'Who can watch', 'Call recording', 'bp-better-messages' ), settings.watch === 'moderators' ? _x( 'Moderators', 'Call recording', 'bp-better-messages' )
            : settings.watch === 'everyone' ? _x( 'Everyone in the conversation', 'Call recording', 'bp-better-messages' )
            : settings.watch === 'admins' ? _x( 'Site administrators', 'Call recording', 'bp-better-messages' )
            : _x( 'The people who were in the call', 'Call recording', 'bp-better-messages' ) ] );
    }

    if ( settings.keepDays !== undefined ) {
        rows.push( [ _x( 'Kept', 'Call recording', 'bp-better-messages' ), settings.keepDays > 0
            ? sprintf( _n( '%d day', '%d days', settings.keepDays, 'bp-better-messages' ), settings.keepDays )
            : _x( 'Until deleted', 'Call recording', 'bp-better-messages' ) ] );
    }

    return rows;
}

/** What Start Recording says in Host Controls, by how everyone else is told. */
export function startNote( recording: CallRecording ): string {
    switch ( recording.tell ) {
        case 'moderators':
            return _x( 'Asks you first. Nobody else in the call is told.', 'Call recording', 'bp-better-messages' );
        case 'ask':
            return _x( 'Asks you first. Everyone in the call is then asked to stay or leave.', 'Call recording', 'bp-better-messages' );
        case 'muted':
            return _x( 'Asks you first. Everyone in the call then keeps the microphone and camera off until they agree.', 'Call recording', 'bp-better-messages' );
        case 'indicator':
            return _x( 'Asks you first. Everyone in the call then sees REC beside the call controls.', 'Call recording', 'bp-better-messages' );
        default:
            return _x( 'Asks you first. Everyone in the call then sees a notice.', 'Call recording', 'bp-better-messages' );
    }
}

/**
 * The REC pill beside the call's connection status at the start of the bar, clear of every tile: a red dot that
 * breathes, REC and the time, for everyone in it while it records, or only its moderators where they alone know of it.
 * A moderator's is a button with Stop, which asks first. Starting, it says so to whoever pressed Start, and once
 * stopped it says "Saving recording…" for a few seconds, then goes.
 */
export function RecordingPill() {
    const { recording } = useContext<CallContextInterface>( CallContext );
    const layer = useContext( RecordingLayerContext );
    const state = recording?.state ?? 'off';
    const [ now, setNow ] = useState( () => Date.now() );
    const [ saving, setSaving ] = useState( false );
    const key = useKeyHint( 'record' );

    useEffect( () => {
        if ( state !== 'on' ) return undefined;
        const timer = setInterval( () => setNow( Date.now() ), 1000 );
        return () => clearInterval( timer );
    }, [ state ] );

    useEffect( () => {
        if ( state !== 'stopping' ) {
            setSaving( false );
            return undefined;
        }
        setSaving( true );
        const timer = setTimeout( () => setSaving( false ), SAVING_MS );
        return () => clearTimeout( timer );
    }, [ state ] );

    if ( ! recording || ( recording.tell === 'moderators' && ! recording.can ) ) return null;

    let pill: ReactNode = null;

    if ( state === 'on' ) {
        const since = recording.since ? recording.since * 1000 : now;
        const time = elapsed( ( now - since ) / 1000 );
        const inside = <>
            <span className="wplus-call-rec-dot" aria-hidden="true" />
            <span className="wplus-call-rec-label" aria-hidden="true">{ _x( 'REC', 'Call recording mark', 'bp-better-messages' ) }</span>
            <span className="wplus-call-rec-time" aria-hidden="true">{ time }</span>
        </>;

        const stop = <span { ...pressable( () => layer.confirm( 'stop' ) ) } className="wplus-call-rec-pill" data-state="on"
            aria-label={ sprintf( /* translators: %s: how long it has recorded, such as 12:04 */ _x( 'Recording, %s. Stop recording', 'Call recording', 'bp-better-messages' ), time ) }
            aria-keyshortcuts={ key?.aria }>
            { inside }
            <span className="wplus-call-rec-stop" aria-hidden="true"><i /><span className="wplus-call-rec-stop-word">{ _x( 'Stop', 'Call recording', 'bp-better-messages' ) }</span></span>
        </span>;

        // The call's key that stops it too, named on hover while the keys listen.
        pill = recording.can
            ? ( key ? <Tooltip content={ _x( 'Stop Recording', 'Call recording', 'bp-better-messages' ) + ' (' + key.name + ')' }>{ stop }</Tooltip> : stop )
            : <span className="wplus-call-rec-pill" data-state="on" title={ _x( 'This call is being recorded.', 'Call recording', 'bp-better-messages' ) }>{ inside }</span>;
    } else if ( state === 'starting' && recording.can ) {
        pill = <span className="wplus-call-rec-pill" data-state="starting">
            <Icon name="spinner" size={ 14 } className="wplus-svg-animate" />
            { _x( 'Starting recording…', 'Call recording', 'bp-better-messages' ) }
        </span>;
    } else if ( state === 'stopping' && saving ) {
        pill = <span className="wplus-call-rec-pill" data-state="stopping">
            <Icon name="spinner" size={ 14 } className="wplus-svg-animate" />
            { _x( 'Saving recording…', 'Call recording', 'bp-better-messages' ) }
        </span>;
    }

    return <span className="wplus-call-rec-region">
        { pill }
        {/* Read once by a screen reader as it starts. */}
        <span className="wplus-call-recording-announce" aria-live="polite">{ state === 'on' ? _x( 'This call is being recorded.', 'Call recording', 'bp-better-messages' ) : '' }</span>
    </span>;
}

/**
 * The notice to everyone else in the call, in the join prompt's card and place over the dock: who started recording,
 * or that it records for someone who joined since, and who can watch it. Got It puts it away for this recording, and
 * where the app keeps the user's choice (`notice`), Do Not Show Again for good, REC alone telling them from then on.
 */
export function RecordingNotice() {
    const { recording } = useContext<CallContextInterface>( CallContext );
    const layer = useContext( RecordingLayerContext );
    if ( ! recording || ! layer.notice ) return null;
    const keep = recording.notice;
    const never = () => {
        keep?.dontShowAgain();
        layer.seen();
    };

    const by = recording.by || '';
    const title = by && ! layer.late
        ? sprintf( /* translators: %s: who started recording */ _x( '%s started recording this call', 'Call recording', 'bp-better-messages' ), by )
        : _x( 'This call is being recorded', 'Call recording', 'bp-better-messages' );
    const note = [
        by && layer.late ? sprintf( /* translators: %s: who started recording */ _x( '%s started recording.', 'Call recording', 'bp-better-messages' ), by ) : '',
        watchNote( recording.settings ),
    ].filter( Boolean ).join( ' ' );

    return <div className="wplus-call-join-prompt-region wplus-call-recording-notice-region" role="status">
        <div className="wplus-call-join-prompt wplus-call-ask-prompt wplus-call-recording-notice">
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name="record" size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ title }</span>
                { note && <span className="wplus-call-join-prompt-note">{ note }</span> }
            </span>
            <span className="wplus-call-ask-actions">
                <span { ...pressable( layer.seen ) } className="wplus-call-join-prompt-preview wplus-call-recording-got-it">{ _x( 'Got It', 'Call recording', 'bp-better-messages' ) }</span>
                { keep && <span { ...pressable( never ) } className="wplus-call-join-prompt-never wplus-call-recording-never">{ _x( 'Do Not Show Again', 'Call recording', 'bp-better-messages' ) }</span> }
            </span>
        </div>
    </div>;
}

/**
 * A question over the call, in its own dark card (Host Controls' look): centred over the dimmed stage, and a sheet on the
 * dock on a phone. Escape is Cancel where there is one, and a question everyone else must answer has none.
 */
export function CallDialog( { title, children, no, yes, danger, onNo, onYes, escape, icon = 'record', disabled }: {
    title: string,
    children: ReactNode,
    no: string,
    yes: string,
    danger?: boolean,
    onNo: () => void,
    onYes: () => void,
    escape: boolean,
    // The glyph beside its title: a recording's by default; a ban's (ban-dialog.tsx).
    icon?: IconName,
    // Its yes can't be pressed yet, as while a ban has no length.
    disabled?: boolean,
} ) {
    const named = useId();
    const said = useId();
    const primary = useRef<HTMLSpanElement>( null );

    useEffect( () => {
        primary.current?.focus( { preventScroll: true } );
        if ( ! escape ) return undefined;
        const onKey = ( event: KeyboardEvent ) => {
            if ( event.key !== 'Escape' ) return;
            event.stopPropagation();
            onNo();
        };
        document.addEventListener( 'keydown', onKey, true );
        return () => document.removeEventListener( 'keydown', onKey, true );
    }, [ escape ] );

    return <div className="wplus-call-dialog-scrim">
        <div className="wplus-call-dialog" role="alertdialog" aria-modal="true" aria-labelledby={ named } aria-describedby={ said }>
            <div className="wplus-call-dialog-head">
                <span className="wplus-call-dialog-badge" aria-hidden="true"><Icon name={ icon } size={ 16 } /></span>
                <span className="wplus-call-dialog-title" id={ named }>{ title }</span>
            </div>
            <div className="wplus-call-dialog-body" id={ said }>{ children }</div>
            <div className="wplus-call-dialog-actions">
                <span { ...pressable( onNo ) } className="wplus-call-dialog-button wplus-call-dialog-no">{ no }</span>
                <span { ...pressable( () => { if ( ! disabled ) onYes(); } ) } ref={ primary } className="wplus-call-dialog-button wplus-call-dialog-yes" data-danger={ danger ? 1 : undefined } aria-disabled={ disabled ? true : undefined }>{ yes }</span>
            </div>
        </div>
    </div>;
}

/** The confirms of Start and Stop, for a moderator, and the question to everyone else as it records. */
export function RecordingDialog( { audio }: { audio: boolean } ) {
    const { recording, endCall } = useContext<CallContextInterface>( CallContext );
    const layer = useContext( RecordingLayerContext );
    if ( ! recording ) return null;

    if ( layer.asking ) {
        const by = recording.by || '';
        const said = recording.tell === 'muted'
            ? ( by
                ? sprintf( /* translators: %s: who started recording */ _x( '%s started recording. Your microphone and camera stay off until you agree to be recorded.', 'Call recording', 'bp-better-messages' ), by )
                : _x( 'Your microphone and camera stay off until you agree to be recorded.', 'Call recording', 'bp-better-messages' ) )
            : ( by
                ? sprintf( /* translators: %s: who started recording */ _x( '%s started recording. If you stay in the call, you agree to be recorded.', 'Call recording', 'bp-better-messages' ), by )
                : _x( 'If you stay in the call, you agree to be recorded.', 'Call recording', 'bp-better-messages' ) );
        const note = watchNote( recording.settings );

        return <CallDialog
            title={ _x( 'This call is being recorded', 'Call recording', 'bp-better-messages' ) }
            no={ _x( 'Leave Call', 'Call recording', 'bp-better-messages' ) }
            yes={ recording.tell === 'muted' ? _x( 'I Agree', 'Call recording', 'bp-better-messages' ) : _x( 'Stay in Call', 'Call recording', 'bp-better-messages' ) }
            onNo={ () => void endCall() }
            onYes={ layer.agree }
            escape={ false }
        >
            <p className="wplus-call-dialog-lead">{ said }</p>
            { note && <p className="wplus-call-dialog-note">{ note }</p> }
        </CallDialog>;
    }

    if ( layer.confirming === 'start' ) {
        const told = recording.tell === 'moderators'
            ? _x( 'Nobody else in the call is told: only moderators see REC, and nothing about it is posted in the conversation.', 'Call recording', 'bp-better-messages' )
            : recording.tell === 'ask'
                ? _x( 'Everyone in the call is asked to stay or leave, and so is anyone who joins later.', 'Call recording', 'bp-better-messages' )
                : recording.tell === 'muted'
                    ? _x( 'Everyone else in the call keeps the microphone and camera off until they agree to be recorded, and so does anyone who joins later.', 'Call recording', 'bp-better-messages' )
                    : recording.tell === 'indicator'
                        ? _x( 'Everyone in the call sees REC beside the call controls while it records, with no notice.', 'Call recording', 'bp-better-messages' )
                        : _x( 'Everyone in the call sees a notice that it is recorded, and so does anyone who joins later.', 'Call recording', 'bp-better-messages' );
        const rows = facts( recording.settings, audio );

        return <CallDialog
            title={ _x( 'Start recording?', 'Call recording', 'bp-better-messages' ) }
            no={ _x( 'Cancel', 'Call recording', 'bp-better-messages' ) }
            yes={ _x( 'Start Recording', 'Call recording', 'bp-better-messages' ) }
            onNo={ () => layer.confirm( null ) }
            onYes={ () => {
                layer.confirm( null );
                recording.start().catch( ( e ) => host().showError( e ) );
            } }
            escape
        >
            <p className="wplus-call-dialog-lead">{ told }</p>
            { rows.length > 0 && <dl className="wplus-call-dialog-facts">
                { rows.map( ( [ label, value ] ) => <React.Fragment key={ label }><dt>{ label }</dt><dd>{ value }</dd></React.Fragment> ) }
            </dl> }
            <p className="wplus-call-dialog-note">{ _x( 'It stops when the call ends, or when you press REC beside the call controls.', 'Call recording', 'bp-better-messages' ) }</p>
        </CallDialog>;
    }

    if ( layer.confirming === 'stop' ) {
        const watch = recording.settings?.watch;
        const when = watch === 'moderators' ? _x( 'Moderators can watch it in a few minutes.', 'Call recording', 'bp-better-messages' )
            : watch === 'everyone' ? _x( 'Everyone in the conversation can watch it in a few minutes.', 'Call recording', 'bp-better-messages' )
            : watch === 'admins' ? _x( 'Site administrators can watch it in a few minutes.', 'Call recording', 'bp-better-messages' )
            : watch === 'people' ? _x( 'The people who were in the call can watch it in a few minutes.', 'Call recording', 'bp-better-messages' )
            : _x( 'It is ready to watch a few minutes after it stops.', 'Call recording', 'bp-better-messages' );

        return <CallDialog
            title={ _x( 'Stop recording?', 'Call recording', 'bp-better-messages' ) }
            no={ _x( 'Cancel', 'Call recording', 'bp-better-messages' ) }
            yes={ _x( 'Stop Recording', 'Call recording', 'bp-better-messages' ) }
            danger
            onNo={ () => layer.confirm( null ) }
            onYes={ () => {
                layer.confirm( null );
                recording.stop().catch( ( e ) => host().showError( e ) );
            } }
            escape
        >
            <p className="wplus-call-dialog-lead">{ when }</p>
        </CallDialog>;
    }

    return null;
}

/** A recording over a group call's stage: the notice and the dialogs. The pill is in the bar (RecordingPill). */
export function RecordingLayerView( { audio }: { audio: boolean } ) {
    const { recording, adminMode } = useContext<CallContextInterface>( CallContext );
    const layer = useContext( RecordingLayerContext );

    // The call's key for recording does what its controls do, asking first: Start Recording where Host Controls offers
    // it, to a moderator, and Stop where the pill or Host Controls does. Nothing while it starts or stops.
    useKeyAction( 'record', () => {
        if ( ! recording?.can ) return undefined;
        if ( recording.state === 'off' && adminMode ) return { run: () => layer.confirm( 'start' ), label: _x( 'Start Recording', 'Call recording', 'bp-better-messages' ) };
        if ( recording.state === 'on' ) return { run: () => layer.confirm( 'stop' ), label: _x( 'Stop Recording', 'Call recording', 'bp-better-messages' ) };
        return undefined;
    } );

    if ( ! recording ) return null;

    return <>
        <RecordingNotice />
        <RecordingDialog audio={ audio } />
    </>;
}
