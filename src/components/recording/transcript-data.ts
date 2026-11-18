import type { TranscriptData, TranscriptLine } from "./types.ts";

/** The transcript's lines in time order, each with its speaker's name, in seconds. */
export function transcriptLines( data: TranscriptData | null | undefined ): TranscriptLine[] {
    if ( ! data || ! Array.isArray( data.segments ) ) return [];

    const speakers = data.speakers && typeof data.speakers === "object" ? data.speakers : {};

    return data.segments
        .filter( ( s ) => s && typeof s.text === "string" && s.text.trim() !== "" && Number.isFinite( s.start ) )
        .map( ( s ) => ( {
            speaker: String( s.speaker ?? "" ),
            name: speakers[ String( s.speaker ) ]?.name || String( s.speaker ?? "" ),
            start: Math.max( 0, s.start / 1000 ),
            end: Math.max( 0, ( Number.isFinite( s.end ) ? s.end : s.start ) / 1000 ),
            text: s.text.trim(),
        } ) )
        .sort( ( a, b ) => a.start - b.start )
        .map( ( line, index ) => ( { ...line, index } ) );
}

/** The line being said at `time`: the last that started by then, or -1 before the first. */
export function lineAt( lines: TranscriptLine[], time: number ): number {
    let low = 0;
    let high = lines.length - 1;
    let found = -1;

    while ( low <= high ) {
        const middle = ( low + high ) >> 1;
        if ( lines[ middle ].start <= time + 0.05 ) {
            found = middle;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }

    return found;
}

/** Folded for searching: lower case, without accents, so "cafe" finds "Café". */
export function fold( text: string ): string {
    return text.normalize( "NFD" ).replace( /[̀-ͯ]/g, "" ).toLocaleLowerCase();
}

/** The lines a search finds, in order: by their words, or by the speaker's name. */
export function matches( lines: TranscriptLine[], query: string ): number[] {
    const wanted = fold( query.trim() );
    if ( wanted === "" ) return [];

    return lines.filter( ( line ) => fold( line.text ).includes( wanted ) || fold( line.name ).includes( wanted ) ).map( ( line ) => line.index );
}

/** A line's text cut where the search found it, so the found part can be marked. */
export function highlight( text: string, query: string ): Array<{ text: string; found: boolean }> {
    const wanted = fold( query.trim() );
    if ( wanted === "" ) return [ { text, found: false } ];

    const folded = fold( text );
    const parts: Array<{ text: string; found: boolean }> = [];
    let from = 0;

    // Folding keeps each letter's place only when it removed no marks of its own, which is the case for whole words
    // typed without accents: where lengths differ, the line is shown whole and unmarked.
    if ( folded.length !== text.length ) return [ { text, found: false } ];

    for ( let at = folded.indexOf( wanted ); at !== -1; at = folded.indexOf( wanted, at + wanted.length ) ) {
        if ( at > from ) parts.push( { text: text.slice( from, at ), found: false } );
        parts.push( { text: text.slice( at, at + wanted.length ), found: true } );
        from = at + wanted.length;
    }

    if ( from < text.length ) parts.push( { text: text.slice( from ), found: false } );

    return parts;
}

/** 1:05:03, 4:07, 0:09 */
export function clock( seconds: number ): string {
    const s = Math.max( 0, Math.floor( Number.isFinite( seconds ) ? seconds : 0 ) );
    const h = Math.floor( s / 3600 );
    const m = Math.floor( ( s % 3600 ) / 60 );
    const rest = String( s % 60 ).padStart( 2, "0" );

    return h > 0 ? h + ":" + String( m ).padStart( 2, "0" ) + ":" + rest : m + ":" + rest;
}

/**
 * A speaker's colour, the same for one speaker every time: a hue from their id. FNV-1a with its bits mixed after, so ids
 * a letter apart (`chromium-0`, `chromium-1`, as a real recording names them) land far apart on the wheel: a plain
 * running hash gave them all the same green.
 */
export function speakerHue( speaker: string ): number {
    let hash = 0x811c9dc5;
    for ( let i = 0; i < speaker.length; i++ ) {
        hash ^= speaker.charCodeAt( i );
        hash = Math.imul( hash, 0x01000193 );
    }
    hash ^= hash >>> 15;
    hash = Math.imul( hash, 0x2c1b3c6d );
    hash ^= hash >>> 12;

    return ( hash >>> 0 ) % 360;
}

/** Up to two letters of a name, for its badge. */
export function initials( name: string ): string {
    const words = name.trim().split( /\s+/ ).filter( Boolean );

    return ( ( words[ 0 ]?.[ 0 ] ?? "" ) + ( words.length > 1 ? words[ words.length - 1 ][ 0 ] : "" ) ).toUpperCase();
}

/** The transcript as plain text, a line each: "[4:07] Lesya: Hello", for Copy and Download. */
export function asText( lines: TranscriptLine[] ): string {
    return lines.map( ( line ) => "[" + clock( line.start ) + "] " + line.name + ": " + line.text ).join( "\n" ) + "\n";
}
