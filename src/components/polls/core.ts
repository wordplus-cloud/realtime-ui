// Polls: the shapes every side of a poll speaks, and the rules that decide them. Pure, with no React and no DOM, so a
// server written in TypeScript runs the same checks as the page. The WordPlus SDK's polls part (PHP) and the server
// helpers of @wordplus/realtime (Node, PHP, Python) follow this file, and all of them pass vectors.json.
//
// A server counts the votes, never the pages: a vote sent to a room would reach every member with its sender, which an
// anonymous poll cannot allow, a quiz cannot carry its answer in a message every member receives, and counts added up
// by each page are whatever a page says they are. So a page sends a definition and its votes to the app's server, and
// draws what comes back: a PollState for everyone, and a PollMember for the one who asked.
//
// Times are unix seconds. Option ids are positions, 1 to 12, given again by checkDefinition() in the order the options
// came, so a quiz names its answer by position too.

export const POLL_LIMITS = {
    /** Characters of the question, counted as people see them (code points), not UTF-16 units. */
    question: 255,
    /** Characters of one option. */
    option: 100,
    /** Characters of a quiz's explanation. */
    explanation: 200,
    minOptions: 2,
    maxOptions: 12,
    /** Voters shown on each option of a public poll. */
    recent: 3,
    /** How soon a deadline may be, and how far, in seconds. */
    soonest: 60,
    furthest: 366 * 24 * 3600,
} as const;

/** A user, as the app names them: WordPress's numbers (negative for Better Messages' guests), or an app's own text. */
export type PollUser = number | string;

export interface PollOption {
    id   : number;
    text : string;
    /** Who added it, on an option a member added to an open poll. The creator's options have none. */
    by?  : PollUser;
}

/** What the creator sends. */
export interface PollDefinition {
    question    : string;
    options     : PollOption[];
    multiple    : boolean;
    anonymous   : boolean;
    /** The right option and why, for a quiz: kept by the server, never sent to a member before they answer. */
    quiz        : { answer: number; explanation: string } | null;
    closesAt    : number | null;
    /** Members may add options while it is open, up to maxOptions. Never on a quiz. */
    addOptions  : boolean;
    /** Nobody sees the counts until it ends, so early votes do not sway later ones. */
    hideResults : boolean;
}

/** A poll as its server keeps it. */
export interface PollRecord extends PollDefinition {
    closedAt : number | null;
}

/** One pick of one user. A multiple-answer poll keeps one per option picked. */
export interface PollVote {
    user   : PollUser;
    option : number;
    /** When it was cast, which orders the faces of a public poll. */
    at     : number;
}

/** What every member may see. Built once and sent to all of them, so it holds nothing about any one of them. */
export interface PollState {
    question   : string;
    options    : PollOption[];
    multiple   : boolean;
    anonymous  : boolean;
    quiz       : boolean;
    closesAt   : number | null;
    closedAt   : number | null;
    closed     : boolean;
    /** Members may add options. */
    addOptions : boolean;
    /** The counts are kept back until it ends: every count reads 0 and no one is named, the people who voted still count. */
    hidden     : boolean;
    /** Picks of each option, by its id. */
    counts     : Record<string, number>;
    /** People who voted, not picks. */
    voters     : number;
    /** The latest voters of each option, newest first: public polls only. */
    recent?    : Record<string, PollUser[]>;
    /** The right option and why, once the quiz has ended. */
    answer?      : number;
    explanation? : string;
}

/** What one member may see about themselves. */
export interface PollMember {
    /** The options they picked, in id order. */
    votes        : number[];
    /** The right option and why, once they answered the quiz. */
    answer?      : number;
    explanation? : string;
}

export type PollField = 'question' | 'options' | 'option' | 'quiz' | 'explanation' | 'closesAt';

export type PollProblem =
    | 'empty' | 'too_long' | 'too_few' | 'too_many' | 'duplicate' | 'unknown_answer' | 'past' | 'too_far' | 'invalid';

export interface PollError {
    field : PollField;
    code  : PollProblem;
    /** The option's position, from 1, for an `option` error. */
    index? : number;
}

export type VoteRefusal = 'closed' | 'unknown_option' | 'one_only' | 'answered' | 'invalid';

/** Why an option a member sent was not added. */
export type OptionRefusal = 'closed' | 'not_allowed' | 'too_many' | 'empty' | 'too_long' | 'duplicate';

export type Checked<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Characters as a person counts them: an emoji is one, not two UTF-16 units. */
export const lengthOf = ( text: string ): number => [ ...text ].length;

// Line breaks and tabs become spaces and runs of spaces one, so a question pasted from somewhere reads as one line.
// Other control characters go, and the invisible spaces with them (zero width, word joiner, byte order mark), which
// could make two options look the same. The joiners stay: emoji sequences and Persian are written with them.
const clean = ( value: unknown ): string => typeof value === 'string'
    ? value.replace( /[\t\n\r\f\v]+/g, ' ' ).replace( /[\u0000-\u001f\u007f​⁠﻿]/g, '' ).replace( / {2,}/g, ' ' ).trim()
    : '';

const wholeNumber = ( value: unknown ): number | null => {
    const n = typeof value === 'string' && /^-?\d+$/.test( value.trim() ) ? Number( value ) : value;
    return typeof n === 'number' && Number.isSafeInteger( n ) ? n : null;
};

const truthy = ( value: unknown, otherwise: boolean ): boolean =>
    value === undefined || value === null ? otherwise : value === true || value === 1 || value === '1' || value === 'true';

/**
 * A definition as a creator sent it, checked and made canonical: text trimmed, option ids given by position, a quiz
 * with one answer, anonymous unless it says otherwise. Every problem is reported, so a form can mark each field.
 * `now` is the server's clock, which a deadline is held to.
 */
export function checkDefinition( input: unknown, now: number ): { ok: true; value: PollDefinition } | { ok: false; errors: PollError[] } {
    const errors: PollError[] = [];
    const raw = ( input && typeof input === 'object' ? input : {} ) as Record<string, unknown>;

    const question = clean( raw.question );
    if ( question === '' ) errors.push( { field: 'question', code: 'empty' } );
    else if ( lengthOf( question ) > POLL_LIMITS.question ) errors.push( { field: 'question', code: 'too_long' } );

    const given = Array.isArray( raw.options ) ? raw.options : [];
    const options: PollOption[] = [];
    const seen = new Set<string>();

    if ( given.length < POLL_LIMITS.minOptions ) errors.push( { field: 'options', code: 'too_few' } );
    else if ( given.length > POLL_LIMITS.maxOptions ) errors.push( { field: 'options', code: 'too_many' } );
    else {
        given.forEach( ( option, i ) => {
            const text = clean( option && typeof option === 'object' ? ( option as { text?: unknown } ).text : option );
            const index = i + 1;
            if ( text === '' ) errors.push( { field: 'option', code: 'empty', index } );
            else if ( lengthOf( text ) > POLL_LIMITS.option ) errors.push( { field: 'option', code: 'too_long', index } );
            else if ( seen.has( text.toLocaleLowerCase() ) ) errors.push( { field: 'option', code: 'duplicate', index } );
            seen.add( text.toLocaleLowerCase() );
            options.push( { id: index, text } );
        } );
    }

    let quiz: PollDefinition[ 'quiz' ] = null;
    if ( raw.quiz !== undefined && raw.quiz !== null && raw.quiz !== false ) {
        const q = ( typeof raw.quiz === 'object' ? raw.quiz : {} ) as Record<string, unknown>;
        const answer = wholeNumber( q.answer );
        const explanation = clean( q.explanation );
        // Against the options only when they could be read: a list too short or too long is the one problem to fix.
        if ( options.length && ( answer === null || answer < 1 || answer > options.length ) ) errors.push( { field: 'quiz', code: 'unknown_answer' } );
        if ( lengthOf( explanation ) > POLL_LIMITS.explanation ) errors.push( { field: 'explanation', code: 'too_long' } );
        quiz = { answer: answer ?? 0, explanation };
    }

    let closesAt: number | null = null;
    if ( raw.closesAt !== undefined && raw.closesAt !== null && raw.closesAt !== '' && raw.closesAt !== 0 ) {
        closesAt = wholeNumber( raw.closesAt );
        if ( closesAt === null ) errors.push( { field: 'closesAt', code: 'invalid' } );
        else if ( closesAt < now + POLL_LIMITS.soonest ) errors.push( { field: 'closesAt', code: 'past' } );
        else if ( closesAt > now + POLL_LIMITS.furthest ) errors.push( { field: 'closesAt', code: 'too_far' } );
    }

    if ( errors.length ) return { ok: false, errors };

    return {
        ok: true,
        value: {
            question,
            options,
            // A quiz has one right answer, so one pick, and its options are the creator's.
            multiple    : quiz ? false : truthy( raw.multiple, false ),
            anonymous   : truthy( raw.anonymous, true ),
            quiz,
            closesAt,
            addOptions  : quiz ? false : truthy( raw.addOptions, false ),
            hideResults : truthy( raw.hideResults, false ),
        },
    };
}

/**
 * An option a member adds to an open poll that allows it: cleaned as the creator's are, not one already there,
 * while there is room. Its id is the next one, so ids stay positions, and it names who added it.
 */
export function checkOption( poll: PollRecord, text: unknown, user: PollUser, now: number ): Checked<PollOption, OptionRefusal> {
    if ( ! isOpen( poll, now ) ) return { ok: false, error: 'closed' };
    if ( ! poll.addOptions || poll.quiz ) return { ok: false, error: 'not_allowed' };
    if ( poll.options.length >= POLL_LIMITS.maxOptions ) return { ok: false, error: 'too_many' };

    const cleaned = clean( text );
    if ( cleaned === '' ) return { ok: false, error: 'empty' };
    if ( lengthOf( cleaned ) > POLL_LIMITS.option ) return { ok: false, error: 'too_long' };

    const folded = cleaned.toLocaleLowerCase();
    if ( poll.options.some( ( o ) => o.text.toLocaleLowerCase() === folded ) ) return { ok: false, error: 'duplicate' };

    const id = poll.options.reduce( ( most, o ) => Math.max( most, o.id ), 0 ) + 1;

    return { ok: true, value: { id, text: cleaned, by: user } };
}

/** Whether votes are still taken: not ended by hand, and its deadline, if any, not reached. */
export function isOpen( poll: { closedAt: number | null; closesAt: number | null; closed?: boolean }, now: number ): boolean {
    if ( poll.closed || poll.closedAt !== null ) return false;
    return poll.closesAt === null || now < poll.closesAt;
}

/** The options a user picked, in id order. */
export function picksOf( votes: readonly PollVote[], user: PollUser ): number[] {
    return votes.filter( ( v ) => sameUser( v.user, user ) ).map( ( v ) => v.option ).sort( ( a, b ) => a - b );
}

// 42 and "42" are one user: an id may arrive as text from a form or a JSON column.
const sameUser = ( a: PollUser, b: PollUser ): boolean => String( a ) === String( b );

/**
 * A user's picks checked against the poll: open, known options, one unless it allows more, and a quiz answered once
 * and for good. The same options again come back as they are, an empty list takes the vote back. Duplicates go.
 */
export function checkVote( poll: PollRecord, votes: readonly PollVote[], user: PollUser, picks: unknown, now: number ): Checked<number[], VoteRefusal> {
    if ( ! Array.isArray( picks ) ) return { ok: false, error: 'invalid' };
    if ( ! isOpen( poll, now ) ) return { ok: false, error: 'closed' };

    const ids: number[] = [];
    for ( const pick of picks ) {
        const id = wholeNumber( pick );
        if ( id === null ) return { ok: false, error: 'invalid' };
        if ( ! poll.options.some( ( o ) => o.id === id ) ) return { ok: false, error: 'unknown_option' };
        if ( ! ids.includes( id ) ) ids.push( id );
    }
    ids.sort( ( a, b ) => a - b );

    if ( ids.length > 1 && ! poll.multiple ) return { ok: false, error: 'one_only' };

    const before = picksOf( votes, user );
    if ( poll.quiz && before.length && before.join() !== ids.join() ) return { ok: false, error: 'answered' };

    return { ok: true, value: ids };
}

/** The votes after a user's picks: theirs replaced, everyone else's as they were. Checks first, as checkVote(). */
export function applyVote( poll: PollRecord, votes: readonly PollVote[], user: PollUser, picks: unknown, now: number ): Checked<PollVote[], VoteRefusal> {
    const checked = checkVote( poll, votes, user, picks, now );
    if ( ! checked.ok ) return checked;

    const before = picksOf( votes, user );
    // Nothing changed: the user's votes keep the times they were cast, so their faces keep their places.
    if ( before.join() === checked.value.join() ) return { ok: true, value: [ ...votes ] };

    return {
        ok: true,
        value: [ ...votes.filter( ( v ) => ! sameUser( v.user, user ) ), ...checked.value.map( ( option ) => ( { user, option, at: now } ) ) ],
    };
}

/** Picks of each option, people who voted, and on a public poll the latest voters of each option, newest first. */
export function countVotes( poll: Pick<PollRecord, 'options' | 'anonymous'>, votes: readonly PollVote[] ): Pick<PollState, 'counts' | 'voters' | 'recent'> {
    const counts: Record<string, number> = {};
    for ( const o of poll.options ) counts[ o.id ] = 0;

    const people = new Set<string>();
    for ( const v of votes ) {
        if ( counts[ v.option ] === undefined ) continue;
        counts[ v.option ]++;
        people.add( String( v.user ) );
    }

    if ( poll.anonymous ) return { counts, voters: people.size };

    // Newest first, and of two cast in one second the one later in the list, which is the later write.
    const newest = votes.map( ( v, i ) => ( { v, i } ) ).sort( ( a, b ) => b.v.at - a.v.at || b.i - a.i );
    const recent: Record<string, PollUser[]> = {};
    for ( const o of poll.options ) {
        recent[ o.id ] = newest.filter( ( { v } ) => v.option === o.id ).slice( 0, POLL_LIMITS.recent ).map( ( { v } ) => v.user );
    }

    return { counts, voters: people.size, recent };
}

/**
 * What every member sees of a poll: never who voted on an anonymous one, never a quiz's answer before it ends, and
 * while a poll with hidden results is open, no counts and no faces, only how many people voted.
 */
export function stateOf( poll: PollRecord, votes: readonly PollVote[], now: number ): PollState {
    const closed = ! isOpen( poll, now );
    const hidden = !! poll.hideResults && ! closed;
    const counted = countVotes( poll, votes );

    if ( hidden ) {
        for ( const id of Object.keys( counted.counts ) ) counted.counts[ id ] = 0;
        delete counted.recent;
    }

    const state: PollState = {
        question   : poll.question,
        options    : poll.options.map( ( o ) => ( o.by === undefined || o.by === null ? { id: o.id, text: o.text } : { id: o.id, text: o.text, by: o.by } ) ),
        multiple   : poll.multiple,
        anonymous  : poll.anonymous,
        quiz       : poll.quiz !== null,
        closesAt   : poll.closesAt,
        closedAt   : poll.closedAt,
        closed,
        addOptions : !! poll.addOptions && poll.quiz === null,
        hidden,
        ...counted,
    };

    if ( closed && poll.quiz ) {
        state.answer = poll.quiz.answer;
        state.explanation = poll.quiz.explanation;
    }

    return state;
}

/** What one user sees of themselves: their picks, and a quiz's answer once they gave theirs. */
export function memberOf( poll: PollRecord, votes: readonly PollVote[], user: PollUser ): PollMember {
    const member: PollMember = { votes: picksOf( votes, user ) };

    if ( poll.quiz && member.votes.length ) {
        member.answer = poll.quiz.answer;
        member.explanation = poll.quiz.explanation;
    }

    return member;
}

/**
 * Each option's share, whole percents of the people who voted. A multiple-answer poll's are each rounded and may add
 * up past 100. A single-choice poll's add up to exactly 100: each is rounded down, and the points that loses go to the
 * largest remainders, ties to the earlier option, so three people voting one each read 34, 33 and 33.
 */
export function percentages( state: Pick<PollState, 'options' | 'counts' | 'voters' | 'multiple'> ): Record<string, number> {
    const out: Record<string, number> = {};
    const total = state.voters;

    if ( total === 0 ) {
        for ( const o of state.options ) out[ o.id ] = 0;
        return out;
    }

    const exact = state.options.map( ( o ) => ( { id: o.id, value: ( ( state.counts[ o.id ] ?? 0 ) * 100 ) / total } ) );
    if ( state.multiple ) {
        for ( const e of exact ) out[ e.id ] = Math.round( e.value );
        return out;
    }
    for ( const e of exact ) out[ e.id ] = Math.floor( e.value );

    let left = 100 - exact.reduce( ( sum, e ) => sum + Math.floor( e.value ), 0 );
    const order = exact.map( ( e, i ) => ( { ...e, i, rest: e.value - Math.floor( e.value ) } ) ).filter( ( e ) => e.rest > 0 ).sort( ( a, b ) => b.rest - a.rest || a.i - b.i );
    for ( const e of order ) {
        if ( left <= 0 ) break;
        out[ e.id ]++;
        left--;
    }

    return out;
}

/** The options with the most picks, in id order: none before anyone voted, or while the counts are hidden. */
export function winners( state: Pick<PollState, 'options' | 'counts' | 'voters' | 'hidden'> ): number[] {
    if ( state.hidden || state.voters === 0 ) return [];

    const most = state.options.reduce( ( top, o ) => Math.max( top, state.counts[ o.id ] ?? 0 ), 0 );
    if ( most === 0 ) return [];

    return state.options.filter( ( o ) => ( state.counts[ o.id ] ?? 0 ) === most ).map( ( o ) => o.id ).sort( ( a, b ) => a - b );
}

/** The text a poll's message carries, read by everything that does not draw polls: lists, replies, push, email, search. */
export function labelOf( question: string ): string {
    return '📊 ' + question;
}
