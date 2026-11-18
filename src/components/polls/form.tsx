import React, { useId, useRef, useState } from "react";
import Btn from "../../inc/helpers/btn.tsx";
import Icon from "../../primitives/icon.tsx";
import { host } from "../../host.ts";
import { checkDefinition, lengthOf, POLL_LIMITS, type PollDefinition, type PollError } from "./core.ts";
import { _x, sprintf } from "./i18n.ts";

// PollForm: what a poll is made of, before it is sent. The host puts it where it asks things (Better Messages in its
// modal, an app in its own) and sends what onSubmit gives it: a definition already checked by core.ts, so a form that
// passes is one the server takes, and the server checks it again all the same.
//
// The options grow as they are filled: typing in the last one adds another, up to twelve, and empty ones are left out
// when it is sent. A quiz marks its right option with the round mark in front of it.
//
// Styles: styles/polls/_polls.scss.

export interface PollFormFeatures {
    anonymous?   : boolean;
    multiple?    : boolean;
    quiz?        : boolean;
    deadline?    : boolean;
    addOptions?  : boolean;
    hideResults? : boolean;
}

export interface PollFormProps {
    /** Which switches the form shows: every one by default. One left out keeps its default. */
    features?: PollFormFeatures;
    /** How the switches start: anonymous by default, one answer. */
    defaults?: { anonymous?: boolean; multiple?: boolean };
    /** The server's clock in unix seconds, which a deadline is held to: the page's by default. */
    now?: () => number;
    onSubmit: ( definition: PollDefinition ) => Promise<unknown> | void;
    onCancel?: () => void;
}

type Ends = "never" | "hour" | "day" | "week" | "custom";

const SPANS: Record<Exclude<Ends, "never" | "custom">, number> = { hour: 3600, day: 86400, week: 7 * 86400 };

// A datetime-local field's value for a time: local, to the minute.
const localValue = ( seconds: number ): string => {
    const d = new Date( seconds * 1000 );
    const pad = ( n: number ) => String( n ).padStart( 2, "0" );
    return `${ d.getFullYear() }-${ pad( d.getMonth() + 1 ) }-${ pad( d.getDate() ) }T${ pad( d.getHours() ) }:${ pad( d.getMinutes() ) }`;
};

/** What a problem with a field says, in a line under it. */
export function pollErrorText( error: PollError ): string {
    switch ( error.code ) {
        case "empty":
            return error.field === "question" ? _x( "Write a question.", "Poll form error", "wordplus-polls" ) : _x( "Write the option, or remove it.", "Poll form error", "wordplus-polls" );
        case "too_long":
            return sprintf( _x( "Keep it under %d characters.", "Poll form error", "wordplus-polls" ), error.field === "question" ? POLL_LIMITS.question : error.field === "explanation" ? POLL_LIMITS.explanation : POLL_LIMITS.option );
        case "too_few":
            return sprintf( _x( "Add at least %d options.", "Poll form error", "wordplus-polls" ), POLL_LIMITS.minOptions );
        case "too_many":
            return sprintf( _x( "A poll takes up to %d options.", "Poll form error", "wordplus-polls" ), POLL_LIMITS.maxOptions );
        case "duplicate":
            return _x( "This option is there already.", "Poll form error", "wordplus-polls" );
        case "unknown_answer":
            return _x( "Mark the right answer.", "Poll form error", "wordplus-polls" );
        case "past":
            return _x( "Pick a time at least a minute from now.", "Poll form error", "wordplus-polls" );
        case "too_far":
            return _x( "Pick a time within a year.", "Poll form error", "wordplus-polls" );
        default:
            return _x( "Check this field.", "Poll form error", "wordplus-polls" );
    }
}

export function PollForm( props: PollFormProps ) {
    const features = { anonymous: true, multiple: true, quiz: true, deadline: true, addOptions: true, hideResults: true, ...props.features };
    const clock = props.now ?? ( () => Date.now() / 1000 );
    const id = useId();

    const [ question, setQuestion ] = useState( "" );
    const [ options, setOptions ] = useState<string[]>( [ "", "" ] );
    const [ anonymous, setAnonymous ] = useState( props.defaults?.anonymous ?? true );
    const [ multiple, setMultiple ] = useState( props.defaults?.multiple ?? false );
    const [ quiz, setQuiz ] = useState( false );
    const [ addOptions, setAddOptions ] = useState( false );
    const [ hideResults, setHideResults ] = useState( false );
    // The right option, by its field's place in the list.
    const [ answer, setAnswer ] = useState<number | null>( null );
    const [ explanation, setExplanation ] = useState( "" );
    const [ ends, setEnds ] = useState<Ends>( "never" );
    const [ custom, setCustom ] = useState( () => localValue( clock() + 86400 ) );
    const [ errors, setErrors ] = useState<PollError[]>( [] );
    const [ busy, setBusy ] = useState( false );
    const fields = useRef<Array<HTMLInputElement | null>>( [] );

    const filled = options.map( ( text, field ) => ( { text: text.trim(), field } ) ).filter( ( o ) => o.text !== "" );
    const ready = question.trim() !== "" && filled.length >= POLL_LIMITS.minOptions && ( ! quiz || ( answer !== null && options[ answer ]?.trim() !== "" ) ) && ! busy;

    const errorOf = ( field: PollError[ "field" ], index?: number ) => errors.find( ( e ) => e.field === field && ( index === undefined || e.index === index ) );

    const setOption = ( field: number, text: string ) => {
        setOptions( ( list ) => {
            const next = [ ...list ];
            next[ field ] = text;
            // The last field taking text opens the next one.
            if ( field === next.length - 1 && text.trim() !== "" && next.length < POLL_LIMITS.maxOptions ) next.push( "" );
            return next;
        } );
        setErrors( ( list ) => list.filter( ( e ) => e.field !== "option" && e.field !== "options" ) );
    };

    const removeOption = ( field: number ) => {
        setOptions( ( list ) => ( list.length > POLL_LIMITS.minOptions ? list.filter( ( _, i ) => i !== field ) : list.map( ( t, i ) => ( i === field ? "" : t ) ) ) );
        setAnswer( ( a ) => ( a === null || a === field ? null : a > field ? a - 1 : a ) );
    };

    const closesAt = (): number | null => {
        if ( ends === "never" || ! features.deadline ) return null;
        if ( ends === "custom" ) {
            const at = new Date( custom ).getTime();
            return Number.isNaN( at ) ? -1 : Math.floor( at / 1000 );
        }
        return Math.floor( clock() ) + SPANS[ ends ];
    };

    const submit = async () => {
        if ( ! ready ) return;
        // The quiz's answer is a field's place; the definition counts the filled options only.
        const position = answer === null ? 0 : filled.findIndex( ( o ) => o.field === answer ) + 1;
        const checked = checkDefinition( {
            question,
            options   : filled.map( ( o ) => o.text ),
            anonymous : features.anonymous ? anonymous : undefined,
            multiple  : features.multiple ? multiple : undefined,
            quiz        : features.quiz && quiz ? { answer: position, explanation } : null,
            closesAt    : closesAt(),
            addOptions  : features.addOptions && addOptions && ! quiz,
            hideResults : features.hideResults && hideResults,
        }, clock() );

        if ( ! checked.ok ) {
            // An option's error names its place among the filled ones: point it back at its field.
            setErrors( checked.errors.map( ( e ) => ( e.field === "option" && e.index ? { ...e, index: filled[ e.index - 1 ]?.field } : e ) ) );
            return;
        }

        setBusy( true );
        try {
            await props.onSubmit( checked.value );
        } catch ( error ) {
            host().showError( error );
        } finally {
            setBusy( false );
        }
    };

    const line = ( error: PollError | undefined ) => error ? <span className="wplus-poll-form__error" role="alert">{ pollErrorText( error ) }</span> : null;
    const counter = ( text: string, most: number ) => lengthOf( text ) > most * 0.8 ? <span className="wplus-poll-form__counter">{ most - lengthOf( text ) }</span> : null;

    return (
        <div className="wplus-poll-form" onKeyDown={ ( e ) => { if ( e.key === "Enter" && ( e.metaKey || e.ctrlKey ) ) void submit(); } }>
            <label className="wplus-poll-form__label" htmlFor={ id + "-q" }>{ _x( "Question", "Poll form", "wordplus-polls" ) }</label>
            <div className="wplus-poll-form__field">
                <textarea id={ id + "-q" } className="wplus-poll-form__input wplus-poll-form__question" rows={ 2 } value={ question } autoFocus
                          placeholder={ _x( "Ask a question", "Poll form", "wordplus-polls" ) } aria-invalid={ errorOf( "question" ) ? true : undefined }
                          onChange={ ( e ) => { setQuestion( e.target.value ); setErrors( ( l ) => l.filter( ( x ) => x.field !== "question" ) ); } } />
                { counter( question, POLL_LIMITS.question ) }
            </div>
            { line( errorOf( "question" ) ) }

            <div className="wplus-poll-form__label" id={ id + "-o" }>{ _x( "Options", "Poll form", "wordplus-polls" ) }</div>
            <div className="wplus-poll-form__options" role="group" aria-labelledby={ id + "-o" }>
                { options.map( ( text, field ) => (
                    <div key={ field } className="wplus-poll-form__option" data-answer={ quiz && answer === field ? 1 : undefined }>
                        { quiz && (
                            <Btn className="wplus-poll-form__answer" role="radio" aria-checked={ answer === field }
                                 aria-label={ _x( "The right answer", "Poll form, quiz", "wordplus-polls" ) } onClick={ () => setAnswer( field ) }>
                                { answer === field && <Icon name="check" size={ 12 } strokeWidth={ 3 } /> }
                            </Btn>
                        ) }
                        <div className="wplus-poll-form__field">
                            <input ref={ ( el ) => { fields.current[ field ] = el; } } type="text" className="wplus-poll-form__input" value={ text }
                                   placeholder={ sprintf( _x( "Option %d", "Poll form, an empty option", "wordplus-polls" ), field + 1 ) }
                                   aria-invalid={ errorOf( "option", field ) ? true : undefined }
                                   onChange={ ( e ) => setOption( field, e.target.value ) }
                                   onKeyDown={ ( e ) => {
                                       if ( e.key !== "Enter" || e.metaKey || e.ctrlKey ) return;
                                       e.preventDefault();
                                       fields.current[ field + 1 ]?.focus();
                                   } } />
                            { counter( text, POLL_LIMITS.option ) }
                        </div>
                        { ( options.length > POLL_LIMITS.minOptions || text !== "" ) && (
                            <Btn className="wplus-poll-form__remove" aria-label={ _x( "Remove option", "Poll form", "wordplus-polls" ) } onClick={ () => removeOption( field ) }>
                                <Icon name="x" size={ 14 } />
                            </Btn>
                        ) }
                        { line( errorOf( "option", field ) ) }
                    </div>
                ) ) }
            </div>
            { line( errorOf( "options" ) ) }

            <div className="wplus-poll-form__settings">
                { features.anonymous && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__switch">
                            <input type="checkbox" role="switch" checked={ anonymous } onChange={ ( e ) => setAnonymous( e.target.checked ) } />
                            <span className="wplus-poll-form__track" aria-hidden="true" />
                            { _x( "Anonymous voting", "Poll form", "wordplus-polls" ) }
                        </label>
                        <p className="wplus-poll-form__note">{ anonymous
                            ? _x( "No one sees who voted for what. Each vote is still recorded, so each person votes once.", "Poll form", "wordplus-polls" )
                            : _x( "Everyone sees who voted for each option.", "Poll form", "wordplus-polls" ) }</p>
                    </div>
                ) }
                { features.multiple && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__switch" data-disabled={ quiz ? 1 : undefined }>
                            <input type="checkbox" role="switch" checked={ multiple && ! quiz } disabled={ quiz } onChange={ ( e ) => setMultiple( e.target.checked ) } />
                            <span className="wplus-poll-form__track" aria-hidden="true" />
                            { _x( "Multiple answers", "Poll form", "wordplus-polls" ) }
                        </label>
                    </div>
                ) }
                { features.addOptions && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__switch" data-disabled={ quiz ? 1 : undefined }>
                            <input type="checkbox" role="switch" checked={ addOptions && ! quiz } disabled={ quiz } onChange={ ( e ) => setAddOptions( e.target.checked ) } />
                            <span className="wplus-poll-form__track" aria-hidden="true" />
                            { _x( "Let members add options", "Poll form", "wordplus-polls" ) }
                        </label>
                        { addOptions && ! quiz && <p className="wplus-poll-form__note">{ sprintf( _x( "Anyone who can vote adds an option while the poll is open, up to %d in all.", "Poll form", "wordplus-polls" ), POLL_LIMITS.maxOptions ) }</p> }
                    </div>
                ) }
                { features.hideResults && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__switch">
                            <input type="checkbox" role="switch" checked={ hideResults } onChange={ ( e ) => setHideResults( e.target.checked ) } />
                            <span className="wplus-poll-form__track" aria-hidden="true" />
                            { _x( "Hide results until the poll ends", "Poll form", "wordplus-polls" ) }
                        </label>
                        { hideResults && <p className="wplus-poll-form__note">{ _x( "Everyone sees how many voted, and the results once the poll ends, so early votes do not sway later ones.", "Poll form", "wordplus-polls" ) }</p> }
                    </div>
                ) }
                { features.quiz && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__switch">
                            <input type="checkbox" role="switch" checked={ quiz } onChange={ ( e ) => { setQuiz( e.target.checked ); setErrors( ( l ) => l.filter( ( x ) => x.field !== "quiz" ) ); } } />
                            <span className="wplus-poll-form__track" aria-hidden="true" />
                            { _x( "Quiz mode", "Poll form", "wordplus-polls" ) }
                        </label>
                        { quiz && <p className="wplus-poll-form__note">{ _x( "Mark the right answer with the circle beside it. Each person answers once.", "Poll form, quiz", "wordplus-polls" ) }</p> }
                        { quiz && line( errorOf( "quiz" ) ) }
                        { quiz && (
                            <div className="wplus-poll-form__field">
                                <textarea className="wplus-poll-form__input" rows={ 2 } value={ explanation } aria-label={ _x( "Explanation", "Poll form, quiz", "wordplus-polls" ) }
                                          placeholder={ _x( "Explain the answer (optional)", "Poll form, quiz", "wordplus-polls" ) }
                                          aria-invalid={ errorOf( "explanation" ) ? true : undefined }
                                          onChange={ ( e ) => { setExplanation( e.target.value ); setErrors( ( l ) => l.filter( ( x ) => x.field !== "explanation" ) ); } } />
                                { counter( explanation, POLL_LIMITS.explanation ) }
                            </div>
                        ) }
                        { quiz && line( errorOf( "explanation" ) ) }
                    </div>
                ) }
                { features.deadline && (
                    <div className="wplus-poll-form__setting">
                        <label className="wplus-poll-form__label" htmlFor={ id + "-e" }>{ _x( "Ends", "Poll form, when voting stops", "wordplus-polls" ) }</label>
                        <select id={ id + "-e" } className="wplus-poll-form__input wplus-poll-form__select" value={ ends }
                                onChange={ ( e ) => { setEnds( e.target.value as Ends ); setErrors( ( l ) => l.filter( ( x ) => x.field !== "closesAt" ) ); } }>
                            <option value="never">{ _x( "Never", "Poll form, when voting stops", "wordplus-polls" ) }</option>
                            <option value="hour">{ _x( "In 1 hour", "Poll form, when voting stops", "wordplus-polls" ) }</option>
                            <option value="day">{ _x( "In 1 day", "Poll form, when voting stops", "wordplus-polls" ) }</option>
                            <option value="week">{ _x( "In 1 week", "Poll form, when voting stops", "wordplus-polls" ) }</option>
                            <option value="custom">{ _x( "At a time I choose", "Poll form, when voting stops", "wordplus-polls" ) }</option>
                        </select>
                        { ends === "custom" && (
                            <input type="datetime-local" className="wplus-poll-form__input" value={ custom } min={ localValue( clock() + POLL_LIMITS.soonest ) }
                                   aria-label={ _x( "End time", "Poll form", "wordplus-polls" ) } aria-invalid={ errorOf( "closesAt" ) ? true : undefined }
                                   onChange={ ( e ) => { setCustom( e.target.value ); setErrors( ( l ) => l.filter( ( x ) => x.field !== "closesAt" ) ); } } />
                        ) }
                        { line( errorOf( "closesAt" ) ) }
                    </div>
                ) }
            </div>

            <div className="wplus-poll-form__actions">
                { props.onCancel && <Btn className="wplus-poll__action" onClick={ props.onCancel }>{ _x( "Cancel", "Poll form", "wordplus-polls" ) }</Btn> }
                <Btn className="wplus-poll__action" data-primary={ 1 } disabled={ ! ready } onClick={ submit }>
                    { _x( "Create poll", "Poll form", "wordplus-polls" ) }
                </Btn>
            </div>
        </div>
    );
}
