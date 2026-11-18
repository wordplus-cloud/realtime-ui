import { useEffect, useState } from "react";
import type { CallRecording } from "../components/calls/context.ts";
import { _x } from "../inc/globals.ts";
import type { SdkGroupCall, SdkGroupRecording } from "./types.ts";

/** Where the notice's Do Not Show Again is kept, in this browser: an SDK page has no user's settings to keep it in. */
const NOTICE_OFF = 'wplus-recording-notice-off';

function noticeOff(): boolean {
    try {
        return window.localStorage.getItem( NOTICE_OFF ) === '1';
    } catch {
        return false;
    }
}

function keepNoticeOff(): void {
    try {
        window.localStorage.setItem( NOTICE_OFF, '1' );
    } catch {
        // the answer still holds for this page
    }
}

const inSeconds = () => Math.floor( Date.now() / 1000 );

/** What this page knows of the recording: the one it started, by its id, and the room's flag, which names no id. */
interface Known {
    own: SdkGroupRecording | null;
    /** While the app's calls route answers. */
    asked: '' | 'starting' | 'stopping';
    flag: boolean;
    /** When it started, or when this page heard of it, in seconds. */
    since: number;
    /** This page's recording, stopped, while the room still says it records. */
    stopping: string | null;
}

const fresh = ( group: SdkGroupCall ): Known => ( {
    own: null,
    asked: '',
    flag: !! group.isRecording,
    since: group.isRecording ? inSeconds() : 0,
    stopping: null,
} );

/** The room's flag changed. Off ends whatever this page knew, whoever stopped it. */
function flagged( was: Known, on: boolean ): Known {
    if ( on === was.flag ) return was;
    if ( on ) return { ...was, flag: true, since: was.own ? was.since : inSeconds() };
    return { ...was, flag: false, own: null, stopping: null, since: 0 };
}

/** A refusal in the screen's words, with its code for whoever reads it (`no_credits`, `not_included` …). */
const refusal = ( words: string, error: unknown ) => Object.assign( new Error( words ), { code: ( error as { code?: unknown } )?.code ?? 'server' } );

/**
 * A group call's recording as the call screen reads it (calls/recording.tsx): Start Recording in Host Controls for whoever
 * the app's rule lets record (`canRecord`), REC while it runs, with Stop for the page that started it, and REC and the
 * notice for everyone else, from the room's flag. A page that did not start it has no Stop, as the calls route stops a
 * recording by its id and the flag names none: the app's server can (`recordings.stop`).
 *
 * Nothing about it shows for a client without recording, or for someone who may not record while nothing records.
 */
export function useGroupRecording( group: SdkGroupCall ): CallRecording | undefined {
    const [ known, setKnown ] = useState<Known>( () => fresh( group ) );
    const [ off, setOff ] = useState( noticeOff );

    useEffect( () => {
        setKnown( fresh( group ) );
        const onRecording = ( on: boolean ) => setKnown( ( was ) => flagged( was, !! on ) );
        group.on( 'recording', onRecording );
        return () => {
            group.off( 'recording', onRecording );
        };
    }, [ group ] );

    if ( ! group.startRecording || ! group.stopRecording ) return undefined;

    const can = !! group.canRecord;
    const start = async () => {
        setKnown( ( was ) => ( { ...was, asked: 'starting' } ) );
        try {
            const own = await group.startRecording!();
            setKnown( ( was ) => ( { ...was, own, asked: '', since: inSeconds() } ) );
        } catch ( error ) {
            setKnown( ( was ) => ( { ...was, asked: '' } ) );
            throw refusal( _x( 'Could not start recording', 'Call recording', 'bp-better-messages' ), error );
        }
    };
    const stop = async () => {
        const id = known.own?.id;
        if ( ! id ) return;
        setKnown( ( was ) => ( { ...was, asked: 'stopping' } ) );
        try {
            await group.stopRecording!( id );
            setKnown( ( was ) => ( { ...was, own: null, asked: '', stopping: was.flag ? id : null } ) );
        } catch ( error ) {
            setKnown( ( was ) => ( { ...was, asked: '' } ) );
            throw refusal( _x( 'Could not stop recording', 'Call recording', 'bp-better-messages' ), error );
        }
    };
    const common = {
        start,
        stop,
        notice: { shown: ! off, dontShowAgain: () => {
            keepNoticeOff();
            setOff( true );
        } },
    };

    if ( known.asked === 'starting' ) return { ...common, state: 'starting', can, mine: true };
    if ( known.own ) return { ...common, state: known.asked === 'stopping' ? 'stopping' : 'on', id: known.own.id, since: known.since, can, mine: true };
    if ( known.stopping ) return { ...common, state: 'stopping', id: known.stopping, can, mine: true };
    // Someone else's: an answer to its notice is kept by this id for as long as the tab is open, so one for each recording.
    if ( known.flag ) return { ...common, state: 'on', id: 'room-' + known.since, since: known.since, can: false };
    return can ? { ...common, state: 'off', can } : undefined;
}
