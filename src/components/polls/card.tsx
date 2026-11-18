import React, { useEffect, useMemo, useRef, useState } from "react";
import Btn from "../../inc/helpers/btn.tsx";
import Icon from "../../primitives/icon.tsx";
import UserAvatar from "../users/user-avatar.tsx";
import UserName from "../users/user-name.tsx";
import { host } from "../../host.ts";
import { POLL_LIMITS, isOpen, lengthOf, percentages, winners, type PollMember, type PollState, type PollUser } from "./core.ts";
import { _n, _x, sprintf } from "./i18n.ts";

// PollCard: a poll inside a message. It draws what the poll's server sent, a PollState for everyone and a
// PollMember for the user, and hands every act back to the host, which sends it to that server: Better Messages to
// its REST routes, an app to its own. It never counts a vote itself: a pick shows at once as the host's call starts,
// and the card settles on whatever comes back, or goes back to how it was when the call fails.
//
// It stands in its message's bubble in place of the text, with no frame of its own, and takes the bubble's ink: its
// marks, lines and acts are drawn in the accent, or in the bubble's text colour on the user's own filled bubble, whose
// ground is the accent. Each option is a row with its mark, and once the shares show a line under it as long as its
// share.
//
// A single-choice poll votes on a tap, a tap on another option moves the vote there and a tap on the user's own pick
// takes it back. A multiple-answer poll ticks options and sends them with Vote, or Update vote once the user voted. A
// quiz takes one answer for good, then shows the right one, and why. The shares show once the user voted, or the poll
// ended, or to its creator, except while a poll keeps its results hidden: then everyone sees how many voted, and the
// shares when it ends. A poll that lets members add options takes theirs at its foot, each named with who added it.
//
// Styles: styles/polls/_polls.scss.

export interface PollCardProps {
    state: PollState;
    /** The user's own side, from the server. Until it came, the user has no votes as far as the card knows. */
    member?: PollMember | null;
    /** The user created the poll: they see the shares before voting. */
    isCreator?: boolean;
    /** The user may end the poll: its creator, a moderator. */
    canEnd?: boolean;
    /** Drawn in the user's own message: its edge takes the accent. */
    isMine?: boolean;
    /** The server's clock in unix seconds, for the deadline: the page's by default. */
    now?: () => number;
    onVote?: ( options: number[] ) => Promise<unknown> | void;
    onRetract?: () => Promise<unknown> | void;
    onEnd?: () => Promise<unknown> | void;
    /** Adds an option, on a poll that lets members add them. */
    onAddOption?: ( text: string ) => Promise<unknown> | void;
    /** Opens who voted: for one option, or all of them. Public polls only. */
    onVoters?: ( option?: number ) => void;
    /** The acts under the options (Vote, Retract vote, View votes, End poll), for a host whose menu has them instead. */
    actions?: boolean;
}

const pageNow = () => Date.now() / 1000;

// The time again every 30 seconds while a deadline is ahead, so "Ends in" counts down and the poll closes on time.
function useNow( clock: () => number, ticking: boolean ): number {
    const [ now, setNow ] = useState( clock );

    useEffect( () => {
        setNow( clock() );
        if ( ! ticking ) return;
        const timer = setInterval( () => setNow( clock() ), 30_000 );
        return () => clearInterval( timer );
    }, [ clock, ticking ] );

    return now;
}

/** "Anonymous poll", "Quiz", …: what kind of poll it is. */
export function pollKind( state: Pick<PollState, "quiz" | "anonymous"> ): string {
    if ( state.quiz ) return state.anonymous ? _x( "Anonymous quiz", "Poll kind", "wordplus-polls" ) : _x( "Quiz", "Poll kind", "wordplus-polls" );
    return state.anonymous ? _x( "Anonymous poll", "Poll kind", "wordplus-polls" ) : _x( "Public poll", "Poll kind", "wordplus-polls" );
}

/** How long a poll has left, or that it ended. */
export function pollDeadline( state: Pick<PollState, "closesAt" | "closedAt" | "closed">, now: number ): string | null {
    if ( ! isOpen( state, now ) ) return _x( "Final results", "Poll that has ended", "wordplus-polls" );
    if ( state.closesAt === null ) return null;

    const left = state.closesAt - now;
    if ( left < 60 ) return _x( "Ends in less than a minute", "Poll deadline", "wordplus-polls" );
    if ( left < 3600 ) {
        const minutes = Math.round( left / 60 );
        return sprintf( _n( "Ends in %d minute", "Ends in %d minutes", minutes, "wordplus-polls" ), minutes );
    }
    if ( left < 48 * 3600 ) {
        const hours = Math.round( left / 3600 );
        return sprintf( _n( "Ends in %d hour", "Ends in %d hours", hours, "wordplus-polls" ), hours );
    }
    if ( left < 7 * 86400 ) {
        const days = Math.round( left / 86400 );
        return sprintf( _n( "Ends in %d day", "Ends in %d days", days, "wordplus-polls" ), days );
    }

    const lang = typeof document === "undefined" ? undefined : document.documentElement.lang || undefined;
    const date = new Date( state.closesAt * 1000 ).toLocaleDateString( lang, { month: "short", day: "numeric" } );
    return sprintf( _x( "Ends %s", "Poll deadline, a date such as Nov 5", "wordplus-polls" ), date );
}

// The counts as they will be once the user's picks land: theirs taken out, the new ones in. Hidden counts stay hidden.
function withPicks( state: PollState, before: number[], after: number[], me: PollUser ): PollState {
    const voters = Math.max( 0, state.voters - ( before.length ? 1 : 0 ) + ( after.length ? 1 : 0 ) );
    if ( state.hidden ) return { ...state, voters };

    const counts = { ...state.counts };
    for ( const id of before ) counts[ id ] = Math.max( 0, ( counts[ id ] ?? 0 ) - 1 );
    for ( const id of after ) counts[ id ] = ( counts[ id ] ?? 0 ) + 1;

    let recent = state.recent;
    if ( recent ) {
        recent = {};
        for ( const o of state.options ) {
            const others = ( state.recent?.[ o.id ] ?? [] ).filter( ( u ) => String( u ) !== String( me ) );
            recent[ o.id ] = ( after.includes( o.id ) ? [ me, ...others ] : others ).slice( 0, POLL_LIMITS.recent );
        }
    }

    return { ...state, counts, voters, recent };
}

const sameList = ( a: number[], b: number[] ) => a.length === b.length && a.every( ( id, i ) => id === b[ i ] );

// The user's picks on their way, laid on the state and the votes they saw when they first acted (`base`, `before`).
// `settled` once the server answered them all.
interface Pending {
    base    : PollState;
    before  : number[];
    picks   : number[];
    settled : boolean;
}

// How long answered picks wait for the server to show them before the card shows the poll as the server has it.
const SETTLE_MS = 4000;

const sameCounts = ( a: PollState, b: PollState ) => a.voters === b.voters
    && a.options.every( ( o ) => ( a.counts[ o.id ] ?? 0 ) === ( b.counts[ o.id ] ?? 0 ) );

/** The poll's glyph, three bars of a chart, in the shared icons' 24 grid and stroke: for a composer's menu. */
export function PollIcon( { size = 18 }: { size?: number } ) {
    return (
        <svg className="wplus-poll-icon" width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth={ 2 } strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 20v-6" />
            <path d="M12 20V4" />
            <path d="M18 20v-10" />
        </svg>
    );
}

// The field that adds an option, under the options of a poll that lets members add them.
function AddOption( { state, onAdd }: { state: PollState; onAdd: ( text: string ) => Promise<unknown> | void } ) {
    const [ open, setOpen ] = useState( false );
    const [ text, setText ] = useState( "" );
    const [ busy, setBusy ] = useState( false );
    const field = useRef<HTMLInputElement | null>( null );

    useEffect( () => { if ( open ) field.current?.focus(); }, [ open ] );

    const trimmed = text.trim();
    const taken = state.options.some( ( o ) => o.text.toLocaleLowerCase() === trimmed.toLocaleLowerCase() );
    const tooLong = lengthOf( trimmed ) > POLL_LIMITS.option;
    const problem = taken ? _x( "This option is there already.", "Poll form error", "wordplus-polls" )
        : tooLong ? sprintf( _x( "Keep it under %d characters.", "Poll form error", "wordplus-polls" ), POLL_LIMITS.option ) : null;

    const add = async () => {
        if ( trimmed === "" || problem || busy ) return;
        setBusy( true );
        try {
            await onAdd( trimmed );
            setText( "" );
            setOpen( false );
        } catch ( error ) {
            host().showError( error );
        } finally {
            setBusy( false );
        }
    };

    if ( ! open ) {
        return (
            <Btn className="wplus-poll__add" onClick={ () => setOpen( true ) }>
                <Icon name="plus" size={ 14 } strokeWidth={ 2.4 } />
                { _x( "Add an option", "Poll action", "wordplus-polls" ) }
            </Btn>
        );
    }

    return (
        <div className="wplus-poll__adding">
            <input ref={ field } type="text" className="wplus-poll__add-input" value={ text } disabled={ busy }
                   placeholder={ _x( "Your option", "Poll, adding an option", "wordplus-polls" ) }
                   aria-label={ _x( "Add an option", "Poll action", "wordplus-polls" ) } aria-invalid={ problem ? true : undefined }
                   onChange={ ( e ) => setText( e.target.value ) }
                   onKeyDown={ ( e ) => {
                       if ( e.key === "Enter" ) { e.preventDefault(); void add(); }
                       if ( e.key === "Escape" ) { e.preventDefault(); setOpen( false ); setText( "" ); }
                   } } />
            <Btn className="wplus-poll__action" data-primary={ 1 } disabled={ trimmed === "" || !! problem || busy } onClick={ add }>
                { _x( "Add", "Poll, adding an option", "wordplus-polls" ) }
            </Btn>
            <Btn className="wplus-poll__action" onClick={ () => { setOpen( false ); setText( "" ); } }>
                { _x( "Cancel", "Poll form", "wordplus-polls" ) }
            </Btn>
            { problem && <span className="wplus-poll__add-error" role="alert">{ problem }</span> }
        </div>
    );
}

export function PollCard( props: PollCardProps ) {
    const { member, isCreator = false, canEnd = false, isMine = false, actions = true } = props;
    const clock = props.now ?? pageNow;
    const ticking = props.state.closesAt !== null && ! props.state.closed && props.state.closedAt === null;
    const now = useNow( clock, ticking );

    // The user's picks drawn before the server has them. The counts and the user's votes reach a host apart (the state
    // every member gets, over a socket and in answers, and the user's own part, in answers), so a pick is never laid
    // on whatever state came last: one that already counted it, with the user's votes not yet caught up, counted it
    // twice (over 100%). The card keeps the state and the votes it showed when the user first acted, lays every pick
    // since on them, and lets them go once the server's votes for the user are what they picked, or after a while.
    const [ pending, setPending ] = useState<Pending | null>( null );
    // A multiple-answer poll's ticks before Vote or Update vote: null while they are the user's votes.
    const [ ticked, setTicked ] = useState<number[] | null>( null );
    // From a yes to End poll until the server's state says it ended, so the poll never shows open again between.
    const [ ending, setEnding ] = useState<"sending" | "answered" | null>( null );

    const known = member?.votes ?? [];
    const mine = pending ? pending.picks : known;
    const sending = pending !== null && ! pending.settled;
    // The counts as the user's picks make them, on what they saw, over the options there are now.
    const counted = ( held: Pending ) => withPicks( { ...held.base, options: props.state.options }, held.before, held.picks, host().currentUserId() );
    const state = useMemo( () => {
        if ( ! pending ) return props.state;
        const shown = counted( pending );
        return { ...props.state, counts: shown.counts, voters: shown.voters, recent: shown.recent };
    }, [ props.state, pending ] );

    // Answered picks go once the server's votes for the user are what they picked and its counts are what the card
    // shows: letting them go on the votes alone could take the next pick's snapshot from a state not yet caught up.
    useEffect( () => {
        if ( ! pending?.settled || ! sameList( known, pending.picks ) ) return;
        if ( sameCounts( props.state, counted( pending ) ) ) setPending( null );
    }, [ pending, known.join(), props.state ] );

    // Or after a while, as when others voted meanwhile and the counts never match the card's.
    useEffect( () => {
        if ( ! pending?.settled ) return;
        const timer = setTimeout( () => setPending( null ), SETTLE_MS );
        return () => clearTimeout( timer );
    }, [ pending ] );

    useEffect( () => {
        if ( ending === null ) return;
        if ( ! isOpen( props.state, now ) ) return void setEnding( null );
        if ( ending !== "answered" ) return;
        const timer = setTimeout( () => setEnding( null ), SETTLE_MS );
        return () => clearTimeout( timer );
    }, [ ending, props.state, now ] );

    const open = isOpen( state, now ) && ending === null;
    const voted = mine.length > 0;
    // A quiz answered stays answered; any other open poll takes picks again.
    const picking = open && !! props.onVote && ! ( state.quiz && voted );
    const hidden = state.hidden && open;
    // The creator follows the votes as they come, from the first one: before it, shares of 0% say nothing.
    const showShares = ! hidden && ( voted || ! open || ( isCreator && state.voters > 0 ) );
    const shares = percentages( state );
    const leaders = open ? [] : winners( state );
    const answer = member?.answer ?? state.answer;
    const explanation = member?.explanation ?? state.explanation;
    const deadline = pollDeadline( state, now );
    const ticks = ticked ?? mine;
    const changed = state.multiple && ! sameList( ticks, mine );

    // One call at a time, in the order the user acted: a pick made while one is on its way waits for it, and only the
    // latest of those is sent, so the server ends on what the user picked last, whatever order the answers come in.
    const busy = useRef( false );
    const wanted = useRef<number[] | null>( null );

    const act = ( picks: number[] ) => picks.length > 0
        ? props.onVote?.( picks )
        : ( props.onRetract ? props.onRetract() : props.onVote?.( [] ) );

    const send = async ( picks: number[] ) => {
        if ( ! props.onVote && ! ( picks.length === 0 && props.onRetract ) ) return;
        wanted.current = picks;
        const base = props.state;
        const before = known;
        setPending( ( held ) => ( held
            ? { ...held, picks, settled: false }
            : { base, before, picks, settled: false } ) );
        if ( busy.current ) return;

        busy.current = true;
        let failed = false;
        try {
            while ( wanted.current ) {
                const next = wanted.current;
                wanted.current = null;
                try {
                    await act( next );
                } catch ( error ) {
                    host().showError( error );
                    failed = true;
                    wanted.current = null;
                }
            }
        } finally {
            busy.current = false;
            setTicked( null );
            // A refusal shows the poll as the server has it; an answer keeps the picks until the votes catch up.
            setPending( ( held ) => ( failed || ! held ? null : { ...held, settled: true } ) );
        }
    };

    const vote = ( picks: number[] ) => send( picks );
    const retract = () => send( [] );

    const end = async () => {
        if ( ! props.onEnd ) return;
        const yes = await host().confirm( {
            title   : _x( "End this poll?", "Poll, asked before ending it", "wordplus-polls" ),
            message : _x( "No one can vote after it ends. Everyone sees the final results.", "Poll, asked before ending it", "wordplus-polls" ),
            confirm : _x( "End poll", "Poll action", "wordplus-polls" ),
            danger  : true,
        } );
        if ( ! yes ) return;
        setEnding( "sending" );
        try {
            await props.onEnd();
            setEnding( ( held ) => ( held === null ? null : "answered" ) );
        } catch ( error ) {
            host().showError( error );
            setEnding( null );
        }
    };

    const pick = ( id: number ) => {
        if ( ! picking ) return;
        if ( ! state.multiple ) return void ( mine.includes( id ) && ! state.quiz ? retract() : vote( [ id ] ) );
        const list = ticks.includes( id ) ? ticks.filter( ( t ) => t !== id ) : [ ...ticks, id ].sort( ( a, b ) => a - b );
        setTicked( sameList( list, mine ) ? null : list );
    };

    const canRetract = open && voted && ! state.quiz && ( !! props.onRetract || !! props.onVote );
    const canSee = ! state.anonymous && ! hidden && state.voters > 0 && showShares && !! props.onVoters;
    const canAdd = open && state.addOptions && ! state.quiz && !! props.onAddOption && state.options.length < POLL_LIMITS.maxOptions;

    const count = state.voters === 0
        ? _x( "No votes yet", "Poll", "wordplus-polls" )
        : sprintf( _n( "%d vote", "%d votes", state.voters, "wordplus-polls" ), state.voters );

    return (
        <div className="wplus-poll" data-is-me={ isMine ? 1 : 0 } data-closed={ open ? undefined : 1 } data-shares={ showShares ? 1 : undefined }
             data-sending={ sending ? 1 : undefined } data-hidden={ hidden ? 1 : undefined }>
            <div className="wplus-poll__question">{ state.question }</div>
            <div className="wplus-poll__meta">
                <span>{ pollKind( state ) }</span>
                { state.multiple && picking && <span>{ _x( "Choose one or more", "Poll with multiple answers", "wordplus-polls" ) }</span> }
                { deadline && <span className="wplus-poll__deadline">{ deadline }</span> }
            </div>

            <div className="wplus-poll__options" role={ picking ? ( state.multiple ? "group" : "radiogroup" ) : "list" } aria-label={ state.question }>
                { state.options.map( ( option ) => {
                    const picked = mine.includes( option.id );
                    const isTicked = state.multiple ? ticks.includes( option.id ) : picked;
                    const share = shares[ option.id ] ?? 0;
                    const votes = state.counts[ option.id ] ?? 0;
                    const leading = leaders.includes( option.id );
                    const result = answer === undefined || ! showShares ? undefined
                        : option.id === answer ? "right" : picked ? "wrong" : undefined;
                    const faces = ! state.anonymous && showShares ? ( state.recent?.[ option.id ] ?? [] ) : [];
                    const label = showShares
                        ? [ option.text, share + "%", sprintf( _n( "%d vote", "%d votes", votes, "wordplus-polls" ), votes ), picked ? _x( "your vote", "Poll option, read out", "wordplus-polls" ) : "" ].filter( Boolean ).join( ", " )
                        : [ option.text, picked ? _x( "your vote", "Poll option, read out", "wordplus-polls" ) : "" ].filter( Boolean ).join( ", " );

                    const body = <>
                        { showShares && <span className="wplus-poll__bar" style={ { "--wplus-poll-share": share / 100 } as React.CSSProperties } /> }
                        <span className="wplus-poll__mark" aria-hidden="true">
                            { result === "right" ? <Icon name="check" size={ 12 } strokeWidth={ 3 } />
                                : result === "wrong" ? <Icon name="x" size={ 12 } strokeWidth={ 3 } />
                                : isTicked ? <Icon name="check" size={ 12 } strokeWidth={ 3 } /> : null }
                        </span>
                        <span className="wplus-poll__label">
                            <span className="wplus-poll__text">{ option.text }</span>
                            { option.by !== undefined && option.by !== null && (
                                <span className="wplus-poll__by">{ _x( "Added by", "Poll option a member added, before their name", "wordplus-polls" ) } <UserName user_id={ option.by } /></span>
                            ) }
                        </span>
                        { faces.length > 0 && ( props.onVoters
                            ? <Btn as="span" className="wplus-poll__faces" aria-label={ sprintf( _x( "Who voted for %s", "Poll, the faces beside an option", "wordplus-polls" ), option.text ) }
                                   onClick={ ( e: React.MouseEvent ) => { e.stopPropagation(); props.onVoters!( option.id ); } }>
                                { faces.map( ( user ) => <UserAvatar key={ String( user ) } user_id={ user } size={ 20 } /> ) }
                            </Btn>
                            : <span className="wplus-poll__faces" aria-hidden="true">
                                { faces.map( ( user ) => <UserAvatar key={ String( user ) } user_id={ user } size={ 20 } /> ) }
                            </span> ) }
                        { showShares && <span className="wplus-poll__share">{ share }%</span> }
                    </>;

                    const data = {
                        "data-picked"  : picked ? 1 : undefined,
                        "data-ticked"  : isTicked ? 1 : undefined,
                        "data-result"  : result,
                        "data-leading" : leading ? 1 : undefined,
                    };

                    return picking
                        ? <Btn key={ option.id } as="div" className="wplus-poll__option" role={ state.multiple ? "checkbox" : "radio" }
                               aria-checked={ isTicked } aria-label={ label } onClick={ () => pick( option.id ) } { ...data }>{ body }</Btn>
                        : <div key={ option.id } className="wplus-poll__option" role="listitem" aria-label={ label } { ...data }>{ body }</div>;
                } ) }
                { canAdd && <AddOption state={ state } onAdd={ props.onAddOption! } /> }
            </div>

            { hidden && (
                <div className="wplus-poll__note">{ _x( "Results show when the poll ends.", "Poll with hidden results", "wordplus-polls" ) }</div>
            ) }

            { answer !== undefined && showShares && explanation && (
                <div className="wplus-poll__explanation">{ explanation }</div>
            ) }

            <div className="wplus-poll__footer">
                <span className="wplus-poll__count">{ count }</span>
                { actions && (
                    <span className="wplus-poll__actions">
                        { picking && state.multiple && ( changed || ! voted ) && (
                            <Btn className="wplus-poll__action" data-primary={ 1 } disabled={ ticks.length === 0 && ! voted } onClick={ () => vote( ticks ) }>
                                { voted ? _x( "Update vote", "Poll action", "wordplus-polls" ) : _x( "Vote", "Poll action", "wordplus-polls" ) }
                            </Btn>
                        ) }
                        { canSee && <Btn className="wplus-poll__action" onClick={ () => props.onVoters!() }>{ _x( "View votes", "Poll action", "wordplus-polls" ) }</Btn> }
                        { canRetract && ! changed && <Btn className="wplus-poll__action" onClick={ retract }>{ _x( "Retract vote", "Poll action", "wordplus-polls" ) }</Btn> }
                        { canEnd && open && props.onEnd && <Btn className="wplus-poll__action" disabled={ sending } onClick={ end }>{ _x( "End poll", "Poll action", "wordplus-polls" ) }</Btn> }
                    </span>
                ) }
            </div>
        </div>
    );
}

export interface PollEndedCardProps {
    /** The poll as it ended. */
    state: PollState;
    /** The user's own side, for their marks. */
    member?: PollMember | null;
    /** The server's clock in unix seconds: the page's by default. */
    now?: () => number;
    /** Goes to the poll itself, where its conversation holds it. */
    onShow?: () => void;
    /** Opens who voted: for one option, or all of them. Public polls only. */
    onVoters?: ( option?: number ) => void;
}

/**
 * A poll that ended, where its conversation says so: its final results in the poll's own card, under a line that
 * says it ended and leads back to the poll.
 */
export function PollEndedCard( { state, member, now, onShow, onVoters }: PollEndedCardProps ) {
    const title = state.quiz
        ? _x( "Quiz ended", "Poll that has ended, over its results", "wordplus-polls" )
        : _x( "Poll ended", "Poll that has ended, over its results", "wordplus-polls" );

    return (
        <div className="wplus-poll-ended" role="group" aria-label={ title }>
            <div className="wplus-poll-ended__head">
                <PollIcon size={ 14 } />
                <span className="wplus-poll-ended__title">{ title }</span>
                { onShow && (
                    <Btn className="wplus-poll-ended__show" onClick={ onShow }>
                        { _x( "Go to poll", "Poll that has ended, an action", "wordplus-polls" ) }
                        <Icon name="chevronR" size={ 14 } strokeWidth={ 2.2 } />
                    </Btn>
                ) }
            </div>
            <PollCard state={ { ...state, closed: true } } member={ member } now={ now } onVoters={ onVoters } />
        </div>
    );
}
