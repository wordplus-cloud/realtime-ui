import React, { useEffect, useMemo, useRef, useState } from "react";
import { _x, sprintf } from "../../inc/globals.ts";
import { Glyph as Icon } from "./glyph.tsx";
import { asText, clock, highlight, initials, matches, speakerHue } from "./transcript-data.ts";
import type { TranscriptLine } from "./types.ts";

/** How long the transcript stops following the playback after the viewer scrolls it themselves. */
const HELD = 5000;

export interface TranscriptProps {
    lines: TranscriptLine[];
    /** The line being said now, or -1. */
    current: number;
    /** A line was pressed: play from its start. */
    onSeek: ( seconds: number ) => void;
    /** The file name a download gets. */
    name?: string;
}

/**
 * The transcript beside a recording: each line with who said it and when, the line being said marked and kept in view
 * (unless the viewer scrolled in the last few seconds), a search that marks what it finds and steps through it, a
 * press on a line to play from there, and Copy and Download as text.
 */
export function Transcript( { lines, current, onSeek, name }: TranscriptProps ) {
    const [ query, setQuery ] = useState( "" );
    const [ step, setStep ] = useState( 0 );
    const list = useRef<HTMLOListElement>( null );
    const heldUntil = useRef( 0 );
    const found = useMemo( () => matches( lines, query ), [ lines, query ] );
    const foundSet = useMemo( () => new Set( found ), [ found ] );
    const at = found.length ? Math.min( step, found.length - 1 ) : -1;

    useEffect( () => setStep( 0 ), [ query ] );

    // The line to keep in view: the search's, else the one being said.
    const shown = at >= 0 ? found[ at ] : current;

    useEffect( () => {
        const box = list.current;
        if ( ! box || shown < 0 || ( at < 0 && Date.now() < heldUntil.current ) ) return;
        const row = box.querySelector<HTMLElement>( `[data-line="${ shown }"]` );
        if ( ! row ) return;
        // Within the list only: scrollIntoView would move the page under it too.
        const top = row.offsetTop - box.offsetTop;
        if ( top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight ) {
            box.scrollTo( { top: Math.max( 0, top - box.clientHeight / 3 ), behavior: "smooth" } );
        }
    }, [ shown, at ] );

    const hold = () => {
        heldUntil.current = Date.now() + HELD;
    };

    const move = ( by: number ) => {
        if ( ! found.length ) return;
        const next = ( at + by + found.length ) % found.length;
        setStep( next );
        onSeek( lines[ found[ next ] ].start );
    };

    const copy = () => {
        navigator.clipboard?.writeText( asText( lines ) ).catch( () => undefined );
    };

    const download = () => {
        const url = URL.createObjectURL( new Blob( [ asText( lines ) ], { type: "text/plain;charset=utf-8" } ) );
        const link = document.createElement( "a" );
        link.href = url;
        link.download = ( name || "transcript" ).replace( /[\\/:*?"<>|]+/g, " " ).trim() + ".txt";
        link.click();
        setTimeout( () => URL.revokeObjectURL( url ), 1000 );
    };

    return <section className="wplus-recording-transcript" aria-label={ _x( 'Transcript', 'Recording player', 'wordplus-recording' ) }>
        <div className="wplus-recording-transcript-search">
            <Icon name="search" size={ 16 } />
            <input
                type="search"
                value={ query }
                placeholder={ _x( 'Search the transcript', 'Recording player', 'wordplus-recording' ) }
                aria-label={ _x( 'Search the transcript', 'Recording player', 'wordplus-recording' ) }
                onChange={ ( event ) => setQuery( event.target.value ) }
                onKeyDown={ ( event ) => {
                    if ( event.key === "Enter" ) {
                        event.preventDefault();
                        move( event.shiftKey ? -1 : 1 );
                    }
                    if ( event.key === "Escape" && query ) {
                        event.stopPropagation();
                        setQuery( "" );
                    }
                } }
            />
            { query.trim() !== "" && <span className="wplus-recording-transcript-count" aria-live="polite">
                { found.length
                    ? sprintf( /* translators: 1: which match is shown, 2: how many there are */ _x( '%1$s of %2$s', 'Recording player', 'wordplus-recording' ), String( at + 1 ), String( found.length ) )
                    : _x( 'Nothing found', 'Recording player', 'wordplus-recording' ) }
            </span> }
            { found.length > 1 && <>
                <button type="button" className="wplus-recording-icon-button" aria-label={ _x( 'Previous match', 'Recording player', 'wordplus-recording' ) } onClick={ () => move( -1 ) }><Icon name="chevronU" size={ 16 } /></button>
                <button type="button" className="wplus-recording-icon-button" aria-label={ _x( 'Next match', 'Recording player', 'wordplus-recording' ) } onClick={ () => move( 1 ) }><Icon name="chevronD" size={ 16 } /></button>
            </> }
        </div>

        <ol ref={ list } className="wplus-recording-transcript-lines" onWheel={ hold } onTouchMove={ hold } onKeyDown={ hold }>
            { lines.map( ( line ) => <li key={ line.index } data-line={ line.index } data-current={ line.index === current ? 1 : undefined } data-found={ foundSet.has( line.index ) ? 1 : undefined }>
                <button type="button" className="wplus-recording-line" onClick={ () => onSeek( line.start ) }>
                    <span className="wplus-recording-line-head">
                        <span className="wplus-recording-speaker" style={ { "--wplus-recording-hue": speakerHue( line.speaker || line.name ) } as React.CSSProperties } aria-hidden="true">{ initials( line.name ) }</span>
                        <span className="wplus-recording-line-name">{ line.name }</span>
                        <span className="wplus-recording-line-time">{ clock( line.start ) }</span>
                    </span>
                    <span className="wplus-recording-line-text">
                        { highlight( line.text, query ).map( ( part, i ) => part.found ? <mark key={ i }>{ part.text }</mark> : <React.Fragment key={ i }>{ part.text }</React.Fragment> ) }
                    </span>
                </button>
            </li> ) }
        </ol>

        <div className="wplus-recording-transcript-actions">
            <button type="button" className="wplus-recording-text-button" onClick={ copy }><Icon name="copy" size={ 14 } />{ _x( 'Copy', 'Recording player', 'wordplus-recording' ) }</button>
            <button type="button" className="wplus-recording-text-button" onClick={ download }><Icon name="download" size={ 14 } />{ _x( 'Download', 'Recording player', 'wordplus-recording' ) }</button>
        </div>
    </section>;
}
