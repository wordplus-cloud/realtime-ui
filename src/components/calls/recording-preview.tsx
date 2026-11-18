import React, { useContext, useMemo } from "react";
import { _x } from "../../inc/globals.ts";
import ConnectionStatus from "../parts/connection-status.tsx";
import { CallContext, type CallContextInterface, type CallRecording, type RecordingSummary } from "./context.ts";
import { RecordingDialog, RecordingLayerContext, RecordingNotice, RecordingPill, type RecordingLayer } from "./recording.tsx";

const nothing = () => undefined;

export interface RecordingTellPreviewProps {
    /** How everyone else in the call is told, as the admin chose it. */
    tell: 'indicator' | 'notice' | 'ask' | 'muted' | 'moderators';
    /** Who started it, as the notice names them. */
    by?: string;
    /** The settings the notice tells of (who may watch it). */
    settings?: RecordingSummary;
    /** The people on the stage, by name. */
    people?: string[];
}

/**
 * What someone in a group call sees once a moderator starts recording it, drawn from the call's own pieces for an
 * admin choosing how people are told: the pill in the bar, and the notice, the question to stay or leave, or the one to
 * agree with the microphone off. REC alone (`indicator`) is the pill and no more, and where moderators alone know of
 * it, nothing. Still and out of reach: nothing in it can be pressed or focused. It needs the call's stylesheet, as the
 * call does.
 */
export function RecordingTellPreview( { tell, by = '', settings, people = [] }: RecordingTellPreviewProps ) {
    const call = useContext<CallContextInterface>( CallContext );
    // A minute and a bit into it, in seconds as the call has it.
    const since = useMemo( () => Math.floor( Date.now() / 1000 ) - 65, [] );

    const recording: CallRecording = {
        state: 'on',
        id: 'preview',
        since,
        can: false,
        tell,
        by,
        mine: false,
        settings,
        // The notice as the app keeps the choice of each user: with its Do Not Show Again.
        notice: { shown: true, dontShowAgain: nothing },
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
    };
    const asking = tell === 'ask' || tell === 'muted';
    const layer: RecordingLayer = {
        confirming: null,
        confirm: nothing,
        asking,
        agree: nothing,
        notice: tell === 'notice',
        seen: nothing,
        late: false,
    };
    const value: CallContextInterface = { ...call, recording, connectionState: 'connected', adminMode: false };
    const names = people.length ? people : [ by || _x( 'Moderator', 'Call recording', 'bp-better-messages' ) ];

    // A call surface of its own, which the stage's colours are set on.
    return <div className="wplus-call-surface wplus-call-wrap wplus-call-recording-preview" data-tell={ tell } aria-hidden="true" inert>
        <CallContext.Provider value={ value }>
            <RecordingLayerContext.Provider value={ layer }>
                <div className="wplus-group-call-container wplus-call-container" style={ { display: 'block' } }>
                    <div className="wplus-call-recording-preview-people">
                        { names.slice( 0, 3 ).map( ( name, i ) => <span key={ i } className="wplus-call-recording-preview-person">
                            <span className="wplus-call-recording-preview-face">{ initials( name ) }</span>
                            <span className="wplus-call-recording-preview-name">{ name }</span>
                        </span> ) }
                    </div>
                    <RecordingNotice />
                    <RecordingDialog audio={ false } />
                    <div className="wplus-group-call-controls-v2">
                        <ConnectionStatus state="connected" quality="excellent" />
                        <RecordingPill />
                    </div>
                </div>
            </RecordingLayerContext.Provider>
        </CallContext.Provider>
    </div>;
}

function initials( name: string ): string {
    return name.split( /\s+/ ).filter( Boolean ).slice( 0, 2 ).map( ( word ) => Array.from( word )[ 0 ] ?? '' ).join( '' ).toUpperCase();
}
