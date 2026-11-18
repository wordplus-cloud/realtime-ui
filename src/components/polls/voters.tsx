import React, { useEffect, useState } from "react";
import Btn from "../../inc/helpers/btn.tsx";
import Icon from "../../primitives/icon.tsx";
import UserAvatar from "../users/user-avatar.tsx";
import UserName from "../users/user-name.tsx";
import type { PollState, PollUser } from "./core.ts";
import { _n, _x, sprintf } from "./i18n.ts";

// PollVoters: who voted for what, on a public poll. One tab for each option, its voters paged in as the host loads
// them from the poll's server (Better Messages' voters route, an app's own), newest first. A poll whose votes are
// anonymous has no voters to show, and the server refuses to list them.
//
// Styles: styles/polls/_polls.scss.

export interface PollVotersPage {
    users : PollUser[];
    /** More pages after this one. */
    more  : boolean;
}

export interface PollVotersProps {
    state: PollState;
    /** The option to open on: the first one with votes by default. */
    option?: number;
    /** A page of an option's voters, from 1. */
    load: ( option: number, page: number ) => Promise<PollVotersPage>;
    onClose?: () => void;
    /** The list's own title and close: off where the host's dialog has a title of its own. */
    heading?: boolean;
}

interface Loaded {
    users   : PollUser[];
    page    : number;
    more    : boolean;
    loading : boolean;
    failed  : boolean;
}

const EMPTY: Loaded = { users: [], page: 0, more: true, loading: false, failed: false };

export function PollVoters( props: PollVotersProps ) {
    const { state, load } = props;
    const first = props.option ?? state.options.find( ( o ) => ( state.counts[ o.id ] ?? 0 ) > 0 )?.id ?? state.options[ 0 ]?.id;
    const [ option, setOption ] = useState( first );
    const [ lists, setLists ] = useState<Record<number, Loaded>>( {} );
    const list = lists[ option ] ?? EMPTY;

    const next = ( id: number ) => {
        const now = lists[ id ] ?? EMPTY;
        if ( now.loading || ! now.more ) return;
        setLists( ( all ) => ( { ...all, [ id ]: { ...now, loading: true, failed: false } } ) );
        load( id, now.page + 1 ).then(
            ( got ) => setLists( ( all ) => {
                const had = all[ id ] ?? EMPTY;
                const seen = new Set( had.users.map( String ) );
                return { ...all, [ id ]: { users: [ ...had.users, ...got.users.filter( ( u ) => ! seen.has( String( u ) ) ) ], page: had.page + 1, more: got.more, loading: false, failed: false } };
            } ),
            () => setLists( ( all ) => ( { ...all, [ id ]: { ...( all[ id ] ?? EMPTY ), loading: false, failed: true } } ) ),
        );
    };

    useEffect( () => {
        if ( option !== undefined && ! lists[ option ] && ( state.counts[ option ] ?? 0 ) > 0 ) next( option );
    }, [ option ] );

    if ( option === undefined ) return null;

    const count = state.counts[ option ] ?? 0;

    return (
        <div className="wplus-poll-voters">
            { props.heading !== false && (
                <div className="wplus-poll-voters__head">
                    <span className="wplus-poll-voters__title">{ _x( "Votes", "Poll, who voted", "wordplus-polls" ) }</span>
                    { props.onClose && (
                        <Btn className="wplus-poll-voters__close" aria-label={ _x( "Close", "Poll, who voted", "wordplus-polls" ) } onClick={ props.onClose }>
                            <Icon name="x" size={ 16 } />
                        </Btn>
                    ) }
                </div>
            ) }
            <div className="wplus-poll-voters__question">{ state.question }</div>
            <div className="wplus-poll-voters__tabs" role="tablist">
                { state.options.map( ( o ) => (
                    <Btn key={ o.id } className="wplus-poll-voters__tab" role="tab" aria-selected={ o.id === option }
                         data-active={ o.id === option ? 1 : undefined } onClick={ () => setOption( o.id ) }>
                        <span className="wplus-poll-voters__tab-text">{ o.text }</span>
                        <span className="wplus-poll-voters__tab-count">{ state.counts[ o.id ] ?? 0 }</span>
                    </Btn>
                ) ) }
            </div>
            <div className="wplus-poll-voters__list" role="tabpanel" aria-label={ sprintf( _n( "%d vote", "%d votes", count, "wordplus-polls" ), count ) }>
                { count === 0 && <div className="wplus-poll-voters__empty">{ _x( "No one voted for this option yet.", "Poll, who voted", "wordplus-polls" ) }</div> }
                { list.users.map( ( user ) => (
                    <div key={ String( user ) } className="wplus-poll-voters__user">
                        <UserAvatar user_id={ user } size={ 32 } />
                        <span className="wplus-poll-voters__name"><UserName user_id={ user } /></span>
                    </div>
                ) ) }
                { list.loading && <div className="wplus-poll-voters__loading" aria-busy="true"><Icon name="spinner" size={ 16 } /></div> }
                { list.failed && (
                    <div className="wplus-poll-voters__empty">
                        { _x( "The votes could not be loaded.", "Poll, who voted", "wordplus-polls" ) }{ " " }
                        <Btn className="wplus-poll__action" onClick={ () => next( option ) }>{ _x( "Try again", "Poll, who voted", "wordplus-polls" ) }</Btn>
                    </div>
                ) }
                { count > 0 && list.more && ! list.loading && ! list.failed && list.page > 0 && (
                    <Btn className="wplus-poll__action" onClick={ () => next( option ) }>{ _x( "Show more", "Poll, who voted", "wordplus-polls" ) }</Btn>
                ) }
            </div>
        </div>
    );
}
