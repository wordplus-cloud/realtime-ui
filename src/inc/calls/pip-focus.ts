import type { CallParticipant } from "../../components/calls/context.ts";

/** Whom a group call's picture-in-picture window shows, and what of theirs: their shared screen, their camera, or neither (their face). */
export interface PipFocus {
    key: string;
    participant: CallParticipant;
    source: 'screen' | 'camera' | null;
}

export interface PipFocusOptions {
    /** Who spoke last, by tile key: the window stays on them through a silence. */
    last?: string | null;
    /**
     * Who comes before everyone, by tile key, in order: the spotlight for everyone, then the user's own pins, as the grid
     * puts them first (spotlight.tsx). Of several, the loudest while they speak.
     */
    first?: readonly string[];
}

// A picture they send, received or not: in a big call only what a screen reports (showTiles) is received, and the one
// the window shows is received once it reports them, their face meanwhile.
const pictureOf = ( participant: CallParticipant ): PipFocus[ 'source' ] =>
    participant.screen || participant.screenPublished ? 'screen' : participant.video || participant.videoPublished ? 'camera' : null;

type Entry = [ string, CallParticipant ];

const loudest = ( entries: Entry[] ): Entry | undefined =>
    entries.filter( ( [ , p ] ) => p.isSpeaking ).sort( ( a, b ) => b[ 1 ].audioLevel - a[ 1 ].audioLevel )[ 0 ];

/**
 * The one the window shows: someone in the spotlight or pinned (`first`), else a screen someone else shares, else
 * whoever speaks loudest, else who spoke last while they are still there, else the first with a picture, the first
 * other, the user.
 */
export function pipFocus( participants: ReadonlyMap<string, CallParticipant>, { last = null, first = [] }: PipFocusOptions = {} ): PipFocus | null {
    const usable = [ ...participants.entries() ];
    const others = usable.filter( ( [ key ] ) => key !== 'me' );
    const shown = ( [ key, participant ]: Entry ): PipFocus => ( { key, participant, source: pictureOf( participant ) } );

    const ahead = first.map( ( key ) => usable.find( ( [ at ] ) => at === key ) ).filter( ( entry ): entry is Entry => !! entry );
    if ( ahead.length ) return shown( loudest( ahead ) ?? ahead.find( ( [ key ] ) => key === last ) ?? ahead[ 0 ] );

    const sharing = others.find( ( [ , p ] ) => pictureOf( p ) === 'screen' );
    if ( sharing ) return shown( sharing );

    const speaking = loudest( others );
    if ( speaking ) return shown( speaking );

    const kept = others.find( ( [ key ] ) => key === last );
    if ( kept ) return shown( kept );

    const firstOther = others.find( ( [ , p ] ) => pictureOf( p ) ) ?? others[ 0 ] ?? usable[ 0 ];
    return firstOther ? shown( firstOther ) : null;
}
