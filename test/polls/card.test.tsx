import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../../src/index.ts';
import { translator } from '../../src/inc/translations.ts';
import { PollCard, PollEndedCard, PollIcon, pollDeadline, type PollState } from '../../src/polls.ts';

const NOW = 1_800_000_000;
const clock = () => NOW;

const state = ( over: Partial<PollState> = {} ): PollState => ( {
    question: 'Coming on Saturday?',
    options: [ { id: 1, text: 'Yes' }, { id: 2, text: 'No' }, { id: 3, text: 'Maybe' } ],
    multiple: false, anonymous: false, quiz: false, closesAt: null, closedAt: null, closed: false, addOptions: false, hidden: false,
    counts: { 1: 2, 2: 1, 3: 0 }, voters: 3, recent: { 1: [ 11, 12 ], 2: [ 13 ], 3: [] },
    ...over,
} );

const options = ( c: HTMLElement ) => [ ...c.querySelectorAll<HTMLElement>( '.wplus-poll__option' ) ];
const text = ( c: HTMLElement, selector: string ) => c.querySelector( selector )?.textContent ?? null;

// A promise the test settles by hand, to look at the card while a vote is on its way.
function later() {
    let resolve!: () => void, reject!: ( e: unknown ) => void;
    const promise = new Promise<void>( ( y, n ) => { resolve = y; reject = n; } );
    return { promise, resolve, reject };
}

beforeEach( () => configureUi( { translate: ( t: string ) => t, translatePlural: ( one: string, many: string, n: number ) => ( n === 1 ? one : many ), currentUserId: () => 99, Avatar: ( p ) => <i data-face={ String( p.user_id ) } /> } ) );
afterEach( cleanup );

describe( 'PollCard', () => {
    it( 'offers the options as choices before the user votes, with no shares', () => {
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } /> );
        expect( text( container, '.wplus-poll__question' ) ).toBe( 'Coming on Saturday?' );
        expect( text( container, '.wplus-poll__meta' ) ).toBe( 'Public poll' );
        expect( options( container ).map( ( o ) => o.getAttribute( 'role' ) ) ).toEqual( [ 'radio', 'radio', 'radio' ] );
        expect( container.querySelector( '.wplus-poll__share' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll__faces' ) ).toBeNull();
        expect( text( container, '.wplus-poll__count' ) ).toBe( '3 votes' );
    } );

    it( 'votes on a tap, shows the pick and its shares at once, and settles on what the server sends', async () => {
        const call = later();
        const onVote = vi.fn( () => call.promise );
        const { container, rerender } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ onVote } /> );

        fireEvent.click( options( container )[ 1 ] );
        expect( onVote ).toHaveBeenCalledWith( [ 2 ] );
        // Drawn as if it landed: 2, 2, 0 of 4.
        expect( options( container )[ 1 ].getAttribute( 'data-picked' ) ).toBe( '1' );
        expect( [ ...container.querySelectorAll( '.wplus-poll__share' ) ].map( ( s ) => s.textContent ) ).toEqual( [ '50%', '50%', '0%' ] );
        expect( text( container, '.wplus-poll__count' ) ).toBe( '4 votes' );
        // The user's own face goes first on what they picked.
        expect( [ ...options( container )[ 1 ].querySelectorAll( '[data-face]' ) ].map( ( f ) => f.getAttribute( 'data-face' ) ) ).toEqual( [ '99', '13' ] );

        rerender( <PollCard state={ state( { counts: { 1: 2, 2: 2, 3: 0 }, voters: 4, recent: { 1: [ 11, 12 ], 2: [ 99, 13 ], 3: [] } } ) } member={ { votes: [ 2 ] } } now={ clock } onVote={ onVote } /> );
        await act( async () => call.resolve() );
        expect( options( container )[ 1 ].getAttribute( 'data-picked' ) ).toBe( '1' );
        // Still choices: a tap elsewhere moves the vote.
        expect( options( container ).map( ( o ) => o.getAttribute( 'aria-checked' ) ) ).toEqual( [ 'false', 'true', 'false' ] );
    } );

    it( 'goes back to the choices when the vote fails, and shows the error', async () => {
        const call = later();
        const showError = vi.fn();
        configureUi( { showError } );
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ () => call.promise } /> );

        fireEvent.click( options( container )[ 0 ] );
        expect( options( container )[ 0 ].getAttribute( 'data-picked' ) ).toBe( '1' );
        await act( async () => call.reject( new Error( 'closed' ) ) );

        expect( showError ).toHaveBeenCalled();
        expect( options( container )[ 0 ].getAttribute( 'data-picked' ) ).toBeNull();
        expect( options( container )[ 0 ].getAttribute( 'role' ) ).toBe( 'radio' );
    } );

    it( 'ticks options of a multiple-answer poll and votes with Vote', () => {
        const onVote = vi.fn();
        const { container, getByText } = render( <PollCard state={ state( { multiple: true } ) } member={ { votes: [] } } now={ clock } onVote={ onVote } /> );
        const vote = getByText( 'Vote' );
        expect( vote.getAttribute( 'data-disabled' ) ).toBe( '1' );
        expect( text( container, '.wplus-poll__meta' ) ).toBe( 'Public pollChoose one or more' );

        fireEvent.click( options( container )[ 2 ] );
        fireEvent.click( options( container )[ 0 ] );
        expect( options( container ).map( ( o ) => o.getAttribute( 'aria-checked' ) ) ).toEqual( [ 'true', 'false', 'true' ] );
        expect( onVote ).not.toHaveBeenCalled();

        fireEvent.click( vote );
        expect( onVote ).toHaveBeenCalledWith( [ 1, 3 ] );
    } );

    it( 'lets the user take a vote back, and never on a quiz', () => {
        const onRetract = vi.fn();
        const { getByText, queryByText, rerender } = render( <PollCard state={ state() } member={ { votes: [ 1 ] } } now={ clock } onRetract={ onRetract } /> );
        fireEvent.click( getByText( 'Retract vote' ) );
        expect( onRetract ).toHaveBeenCalled();

        rerender( <PollCard state={ state( { quiz: true } ) } member={ { votes: [ 1 ], answer: 2, explanation: '' } } now={ clock } onRetract={ onRetract } /> );
        expect( queryByText( 'Retract vote' ) ).toBeNull();
    } );

    it( 'draws an anonymous poll with no faces and no list of voters', () => {
        const onVoters = vi.fn();
        const { container, queryByText } = render( <PollCard state={ state( { anonymous: true, recent: undefined } ) } member={ { votes: [ 1 ] } } now={ clock } onVoters={ onVoters } /> );
        expect( text( container, '.wplus-poll__meta' ) ).toBe( 'Anonymous poll' );
        expect( container.querySelector( '[data-face]' ) ).toBeNull();
        expect( queryByText( 'View votes' ) ).toBeNull();
    } );

    it( 'opens who voted from an option’s faces and from View votes, on a public poll', () => {
        const onVoters = vi.fn();
        const { container, getByText } = render( <PollCard state={ state() } member={ { votes: [ 1 ] } } now={ clock } onVoters={ onVoters } /> );
        fireEvent.click( options( container )[ 0 ].querySelector( '.wplus-poll__faces' )! );
        expect( onVoters ).toHaveBeenLastCalledWith( 1 );
        fireEvent.click( getByText( 'View votes' ) );
        expect( onVoters ).toHaveBeenLastCalledWith();
    } );

    it( 'marks a quiz answer right or wrong once given, with why', () => {
        const { container } = render(
            <PollCard state={ state( { quiz: true, anonymous: true, recent: undefined } ) } member={ { votes: [ 1 ], answer: 2, explanation: 'It rains.' } } now={ clock } />,
        );
        expect( text( container, '.wplus-poll__meta' ) ).toBe( 'Anonymous quiz' );
        expect( options( container ).map( ( o ) => o.getAttribute( 'data-result' ) ) ).toEqual( [ 'wrong', 'right', null ] );
        expect( text( container, '.wplus-poll__explanation' ) ).toBe( 'It rains.' );
    } );

    it( 'shows nothing of the right answer before the user answers a quiz', () => {
        const { container } = render( <PollCard state={ state( { quiz: true } ) } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } /> );
        expect( container.querySelector( '[data-result]' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll__explanation' ) ).toBeNull();
    } );

    it( 'shows the creator the shares and still lets them vote', () => {
        const onVote = vi.fn();
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } isCreator now={ clock } onVote={ onVote } /> );
        expect( container.querySelectorAll( '.wplus-poll__share' ).length ).toBe( 3 );
        fireEvent.click( options( container )[ 2 ] );
        expect( onVote ).toHaveBeenCalledWith( [ 3 ] );
    } );

    it( 'shows the creator no shares before the first vote', () => {
        const { container } = render( <PollCard state={ state( { counts: { 1: 0, 2: 0, 3: 0 }, voters: 0, recent: undefined } ) } member={ { votes: [] } } isCreator now={ clock } onVote={ vi.fn() } /> );
        expect( container.querySelector( '.wplus-poll__share' ) ).toBeNull();
    } );

    it( 'shows final results on an ended poll, takes no votes, and offers no End poll', () => {
        const onVote = vi.fn();
        const { container, queryByText } = render(
            <PollCard state={ state( { closed: true, closedAt: NOW - 60 } ) } member={ { votes: [] } } canEnd now={ clock } onVote={ onVote } onEnd={ vi.fn() } />,
        );
        expect( container.querySelector( '.wplus-poll__deadline' )?.textContent ).toBe( 'Final results' );
        expect( container.querySelector( '[role="radio"]' ) ).toBeNull();
        fireEvent.click( options( container )[ 0 ] );
        expect( onVote ).not.toHaveBeenCalled();
        expect( queryByText( 'End poll' ) ).toBeNull();
    } );

    it( 'treats a poll past its deadline as ended even before the server says so', () => {
        const { container } = render( <PollCard state={ state( { closesAt: NOW - 1 } ) } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } /> );
        expect( container.querySelector( '[role="radio"]' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll' )?.getAttribute( 'data-closed' ) ).toBe( '1' );
    } );

    it( 'asks before ending a poll, and ends it only on yes', async () => {
        const onEnd = vi.fn();
        const confirm = vi.fn().mockResolvedValueOnce( false ).mockResolvedValueOnce( true );
        configureUi( { confirm } );
        const { getByText } = render( <PollCard state={ state() } member={ { votes: [] } } canEnd now={ clock } onEnd={ onEnd } /> );

        await act( async () => { fireEvent.click( getByText( 'End poll' ) ); } );
        expect( confirm ).toHaveBeenCalledWith( expect.objectContaining( { title: 'End this poll?', danger: true } ) );
        expect( onEnd ).not.toHaveBeenCalled();

        await act( async () => { fireEvent.click( getByText( 'End poll' ) ); } );
        expect( onEnd ).toHaveBeenCalled();
    } );

    it( 'leaves its acts to the host’s menu when told to', () => {
        const { container } = render( <PollCard state={ state() } member={ { votes: [ 1 ] } } now={ clock } actions={ false } onRetract={ vi.fn() } onVoters={ vi.fn() } /> );
        expect( container.querySelector( '.wplus-poll__actions' ) ).toBeNull();
    } );

    it( 'marks the user’s own poll', () => {
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } isMine now={ clock } /> );
        expect( container.querySelector( '.wplus-poll' )?.getAttribute( 'data-is-me' ) ).toBe( '1' );
    } );

    it( 'moves a vote to another option on a tap, and takes it back on a tap of the user’s pick', () => {
        const onVote = vi.fn();
        const onRetract = vi.fn();
        const { container } = render( <PollCard state={ state() } member={ { votes: [ 1 ] } } now={ clock } onVote={ onVote } onRetract={ onRetract } /> );
        expect( options( container ).map( ( o ) => o.getAttribute( 'role' ) ) ).toEqual( [ 'radio', 'radio', 'radio' ] );

        fireEvent.click( options( container )[ 2 ] );
        expect( onVote ).toHaveBeenLastCalledWith( [ 3 ] );

        cleanup();
        const { container: again } = render( <PollCard state={ state() } member={ { votes: [ 1 ] } } now={ clock } onVote={ onVote } onRetract={ onRetract } /> );
        fireEvent.click( options( again )[ 0 ] );
        expect( onRetract ).toHaveBeenCalled();
    } );

    it( 'sends picks made while a vote is on its way after it, only the last of them', async () => {
        const first = later();
        const onVote = vi.fn().mockReturnValueOnce( first.promise ).mockResolvedValue( undefined );
        const onRetract = vi.fn();
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ onVote } onRetract={ onRetract } /> );

        fireEvent.click( options( container )[ 0 ] );
        fireEvent.click( options( container )[ 1 ] );
        fireEvent.click( options( container )[ 2 ] );
        expect( onVote ).toHaveBeenCalledTimes( 1 );
        // The card already shows the last pick.
        expect( options( container )[ 2 ].getAttribute( 'data-picked' ) ).toBe( '1' );

        await act( async () => first.resolve() );
        expect( onVote ).toHaveBeenCalledTimes( 2 );
        expect( onVote ).toHaveBeenLastCalledWith( [ 3 ] );
        expect( onRetract ).not.toHaveBeenCalled();
    } );

    it( 'counts a vote taken back and given again once, whatever order the counts and the user’s votes come in', async () => {
        const shares = ( c: HTMLElement ) => [ ...c.querySelectorAll( '.wplus-poll__share' ) ].map( ( s ) => s.textContent );
        const retracting = later();
        const voting = later();
        const onRetract = vi.fn( () => retracting.promise );
        const onVote = vi.fn( () => voting.promise );
        // The user's vote on Yes and one other on No.
        const before = state( { counts: { 1: 1, 2: 1, 3: 0 }, voters: 2, recent: { 1: [ 99 ], 2: [ 13 ], 3: [] } } );
        const without = state( { counts: { 1: 0, 2: 1, 3: 0 }, voters: 1, recent: { 1: [], 2: [ 13 ], 3: [] } } );
        const card = ( s: PollState, votes: number[] ) => <PollCard state={ s } member={ { votes } } now={ clock } onVote={ onVote } onRetract={ onRetract } isCreator />;
        const { container, rerender } = render( card( before, [ 1 ] ) );

        fireEvent.click( options( container )[ 0 ] );
        expect( onRetract ).toHaveBeenCalledTimes( 1 );
        expect( shares( container ) ).toEqual( [ '0%', '100%', '0%' ] );

        // The counts without the vote arrive, the user's votes still list it, and Yes is tapped again.
        rerender( card( without, [ 1 ] ) );
        fireEvent.click( options( container )[ 0 ] );
        expect( shares( container ) ).toEqual( [ '50%', '50%', '0%' ] );
        expect( text( container, '.wplus-poll__count' ) ).toBe( '2 votes' );

        await act( async () => retracting.resolve() );
        expect( onVote ).toHaveBeenLastCalledWith( [ 1 ] );

        // The new vote's counts come before the answer, beside the user's votes from the retract.
        rerender( card( before, [] ) );
        expect( shares( container ) ).toEqual( [ '50%', '50%', '0%' ] );
        expect( options( container )[ 0 ].getAttribute( 'data-picked' ) ).toBe( '1' );

        await act( async () => voting.resolve() );
        // Answered, the counts behind the answer still on their way: the pick stays drawn.
        rerender( card( without, [ 1 ] ) );
        expect( shares( container ) ).toEqual( [ '50%', '50%', '0%' ] );

        rerender( card( before, [ 1 ] ) );
        expect( shares( container ) ).toEqual( [ '50%', '50%', '0%' ] );
        expect( container.querySelector( '.wplus-poll' )?.getAttribute( 'data-sending' ) ).toBeNull();
        expect( options( container )[ 0 ].getAttribute( 'data-picked' ) ).toBe( '1' );
    } );

    it( 'shows the server’s poll again once it shows the pick, and follows others’ votes from there', async () => {
        const onVote = vi.fn().mockResolvedValue( undefined );
        const card = ( s: PollState, votes: number[] ) => <PollCard state={ s } member={ { votes } } now={ clock } onVote={ onVote } />;
        const { container, rerender } = render( card( state(), [] ) );

        fireEvent.click( options( container )[ 2 ] );
        await act( async () => {} );
        rerender( card( state( { counts: { 1: 2, 2: 1, 3: 1 }, voters: 4 } ), [ 3 ] ) );
        // Someone else's vote after it shows.
        rerender( card( state( { counts: { 1: 3, 2: 1, 3: 1 }, voters: 5 } ), [ 3 ] ) );
        expect( text( container, '.wplus-poll__count' ) ).toBe( '5 votes' );
    } );

    it( 'lets a drawn pick go after a while when the server never shows it', async () => {
        vi.useFakeTimers();
        try {
            const onVote = vi.fn().mockResolvedValue( undefined );
            const { container } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ onVote } /> );

            fireEvent.click( options( container )[ 2 ] );
            await act( async () => {} );
            expect( options( container )[ 2 ].getAttribute( 'data-picked' ) ).toBe( '1' );

            await act( async () => { vi.advanceTimersByTime( 4000 ); } );
            expect( options( container )[ 2 ].getAttribute( 'data-picked' ) ).toBeNull();
            expect( text( container, '.wplus-poll__count' ) ).toBe( '3 votes' );
        } finally {
            vi.useRealTimers();
        }
    } );

    it( 'holds End poll while a vote is on its way', async () => {
        const call = later();
        const { container } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ () => call.promise } onEnd={ vi.fn() } canEnd isCreator /> );
        const held = () => [ ...container.querySelectorAll( '.wplus-poll__action' ) ].find( ( b ) => b.textContent === 'End poll' )?.getAttribute( 'aria-disabled' ) ?? null;

        expect( held() ).toBeNull();
        fireEvent.click( options( container )[ 0 ] );
        expect( held() ).toBe( 'true' );
        await act( async () => call.resolve() );
        expect( held() ).toBeNull();
    } );

    it( 'shows a poll ended from the yes until the server says so, and open again when the server refuses', async () => {
        configureUi( { confirm: vi.fn().mockResolvedValue( true ), showError: vi.fn() } );
        const onEnd = vi.fn().mockResolvedValueOnce( undefined ).mockRejectedValueOnce( new Error( 'no' ) );
        const card = ( s: PollState ) => <PollCard state={ s } member={ { votes: [] } } canEnd now={ clock } onEnd={ onEnd } onVote={ vi.fn() } />;
        const { container, getByText, rerender } = render( card( state() ) );
        const closed = () => container.querySelector( '.wplus-poll' )?.getAttribute( 'data-closed' ) ?? null;

        await act( async () => { fireEvent.click( getByText( 'End poll' ) ); } );
        // Answered, the ended state still on its way: never open again between.
        expect( closed() ).toBe( '1' );
        rerender( card( state( { voters: 4, counts: { 1: 3, 2: 1, 3: 0 } } ) ) );
        expect( closed() ).toBe( '1' );
        rerender( card( state( { closed: true, closedAt: NOW } ) ) );
        expect( closed() ).toBe( '1' );

        cleanup();
        const again = render( card( state() ) );
        await act( async () => { fireEvent.click( again.getByText( 'End poll' ) ); } );
        expect( again.container.querySelector( '.wplus-poll' )?.getAttribute( 'data-closed' ) ).toBeNull();
    } );

    it( 'never moves a quiz answer', () => {
        const onVote = vi.fn();
        const { container } = render( <PollCard state={ state( { quiz: true } ) } member={ { votes: [ 1 ], answer: 2, explanation: '' } } now={ clock } onVote={ onVote } /> );
        expect( container.querySelector( '[role="radio"]' ) ).toBeNull();
        fireEvent.click( options( container )[ 1 ] );
        expect( onVote ).not.toHaveBeenCalled();
    } );

    it( 'changes the ticks of a multiple-answer vote with Update vote', () => {
        const onVote = vi.fn();
        const { container, getByText, queryByText } = render( <PollCard state={ state( { multiple: true } ) } member={ { votes: [ 1 ] } } now={ clock } onVote={ onVote } onRetract={ vi.fn() } /> );
        expect( queryByText( 'Update vote' ) ).toBeNull();
        expect( getByText( 'Retract vote' ) ).toBeTruthy();

        fireEvent.click( options( container )[ 1 ] );
        expect( options( container ).map( ( o ) => o.getAttribute( 'aria-checked' ) ) ).toEqual( [ 'true', 'true', 'false' ] );
        expect( queryByText( 'Retract vote' ) ).toBeNull();
        fireEvent.click( getByText( 'Update vote' ) );
        expect( onVote ).toHaveBeenCalledWith( [ 1, 2 ] );
    } );

    it( 'keeps hidden results hidden until the poll ends, saying how many voted', () => {
        const hiddenState = state( { hidden: true, counts: { 1: 0, 2: 0, 3: 0 }, recent: undefined } );
        const { container, rerender } = render( <PollCard state={ hiddenState } member={ { votes: [ 1 ] } } isCreator now={ clock } onVote={ vi.fn() } onVoters={ vi.fn() } /> );
        expect( container.querySelector( '.wplus-poll__share' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll__bar' ) ).toBeNull();
        expect( text( container, '.wplus-poll__note' ) ).toBe( 'Results show when the poll ends.' );
        expect( text( container, '.wplus-poll__count' ) ).toBe( '3 votes' );
        expect( options( container )[ 0 ].getAttribute( 'data-picked' ) ).toBe( '1' );

        rerender( <PollCard state={ state( { closed: true, closedAt: NOW - 1 } ) } member={ { votes: [ 1 ] } } now={ clock } /> );
        expect( container.querySelectorAll( '.wplus-poll__share' ).length ).toBe( 3 );
        expect( container.querySelector( '.wplus-poll__note' ) ).toBeNull();
    } );

    it( 'marks the winners of an ended poll, all of them in a tie', () => {
        const { container, rerender } = render( <PollCard state={ state( { closed: true, closedAt: NOW - 1 } ) } member={ { votes: [] } } now={ clock } /> );
        expect( options( container ).map( ( o ) => o.getAttribute( 'data-leading' ) ) ).toEqual( [ '1', null, null ] );

        rerender( <PollCard state={ state( { closed: true, closedAt: NOW - 1, counts: { 1: 2, 2: 2, 3: 0 }, voters: 4 } ) } member={ { votes: [] } } now={ clock } /> );
        expect( options( container ).map( ( o ) => o.getAttribute( 'data-leading' ) ) ).toEqual( [ '1', '1', null ] );
    } );

    it( 'takes a member’s option on a poll that allows it, never one already there', async () => {
        const onAddOption = vi.fn();
        const { container, getByText, queryByText } = render( <PollCard state={ state( { addOptions: true } ) } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } onAddOption={ onAddOption } /> );

        fireEvent.click( getByText( 'Add an option' ) );
        const field = container.querySelector<HTMLInputElement>( '.wplus-poll__add-input' )!;
        fireEvent.change( field, { target: { value: 'maybe' } } );
        expect( text( container, '.wplus-poll__add-error' ) ).toBe( 'This option is there already.' );
        fireEvent.keyDown( field, { key: 'Enter' } );
        expect( onAddOption ).not.toHaveBeenCalled();

        fireEvent.change( field, { target: { value: '  Sunday ' } } );
        await act( async () => { fireEvent.keyDown( field, { key: 'Enter' } ); } );
        expect( onAddOption ).toHaveBeenCalledWith( 'Sunday' );
        expect( queryByText( 'Add an option' ) ).toBeTruthy();
    } );

    it( 'offers no adding on a poll that does not allow it, or once it ended', () => {
        const { queryByText, rerender } = render( <PollCard state={ state() } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } onAddOption={ vi.fn() } /> );
        expect( queryByText( 'Add an option' ) ).toBeNull();
        rerender( <PollCard state={ state( { addOptions: true, closed: true, closedAt: NOW - 1 } ) } member={ { votes: [] } } now={ clock } onAddOption={ vi.fn() } /> );
        expect( queryByText( 'Add an option' ) ).toBeNull();
    } );

    it( 'names who added an option', () => {
        configureUi( { Name: ( p ) => <b>{ 'User ' + String( p.user_id ) }</b> } );
        const { container } = render( <PollCard state={ state( { options: [ { id: 1, text: 'Yes' }, { id: 2, text: 'Sunday', by: 7 } ], counts: { 1: 0, 2: 0 }, voters: 0, recent: undefined } ) } member={ { votes: [] } } now={ clock } /> );
        expect( text( container, '.wplus-poll__by' ) ).toBe( 'Added by User 7' );
    } );

    it( 'says how long a poll has left', () => {
        const at = ( left: number ) => pollDeadline( { closesAt: NOW + left, closedAt: null, closed: false }, NOW );
        expect( pollDeadline( { closesAt: null, closedAt: null, closed: false }, NOW ) ).toBeNull();
        expect( at( 30 ) ).toBe( 'Ends in less than a minute' );
        expect( at( 60 ) ).toBe( 'Ends in 1 minute' );
        expect( at( 45 * 60 ) ).toBe( 'Ends in 45 minutes' );
        expect( at( 2 * 3600 ) ).toBe( 'Ends in 2 hours' );
        expect( at( 47 * 3600 ) ).toBe( 'Ends in 47 hours' );
        expect( at( 3 * 86400 ) ).toBe( 'Ends in 3 days' );
        expect( at( 30 * 86400 ) ).toMatch( /^Ends / );
    } );

    it( 'speaks the polls’ languages through the package’s translator', () => {
        configureUi( translator( 'de' ) );
        const { getByText, container } = render( <PollCard state={ state( { multiple: true } ) } member={ { votes: [] } } now={ clock } onVote={ vi.fn() } /> );
        expect( getByText( 'Abstimmen' ) ).toBeTruthy();
        expect( text( container, '.wplus-poll__meta' ) ).toBe( 'Öffentliche UmfrageEine oder mehrere wählen' );
        expect( text( container, '.wplus-poll__count' ) ).toBe( '3 Stimmen' );

        configureUi( translator( 'pl' ) );
        cleanup();
        const { container: pl } = render( <PollCard state={ state( { voters: 5 } ) } member={ { votes: [] } } now={ clock } /> );
        expect( text( pl, '.wplus-poll__count' ) ).toBe( '5 głosów' );
    } );

    it( 'draws the poll glyph for a composer menu', () => {
        const { container } = render( <PollIcon size={ 20 } /> );
        expect( container.querySelector( 'svg.wplus-poll-icon' )?.getAttribute( 'width' ) ).toBe( '20' );
    } );

    it( 'shows an ended poll’s final results with the user’s marks, and goes to the poll', () => {
        const onShow = vi.fn();
        const onVoters = vi.fn();
        // The state as the conversation last had it, the end not yet in: the card still shows it ended.
        const { container, getByText } = render( <PollEndedCard state={ state() } member={ { votes: [ 2 ] } } now={ clock } onShow={ onShow } onVoters={ onVoters } /> );

        expect( text( container, '.wplus-poll-ended__title' ) ).toBe( 'Poll ended' );
        expect( container.querySelector( '.wplus-poll' )?.getAttribute( 'data-closed' ) ).toBe( '1' );
        expect( [ ...container.querySelectorAll( '.wplus-poll__share' ) ].map( ( s ) => s.textContent ) ).toEqual( [ '67%', '33%', '0%' ] );
        expect( options( container )[ 1 ].getAttribute( 'data-picked' ) ).toBe( '1' );
        expect( options( container )[ 0 ].getAttribute( 'data-leading' ) ).toBe( '1' );
        expect( options( container ).map( ( o ) => o.getAttribute( 'role' ) ) ).toEqual( [ 'listitem', 'listitem', 'listitem' ] );
        expect( container.querySelector( '.wplus-poll__add' ) ).toBeNull();

        fireEvent.click( getByText( 'Go to poll' ) );
        expect( onShow ).toHaveBeenCalledTimes( 1 );
        fireEvent.click( getByText( 'View votes' ) );
        expect( onVoters ).toHaveBeenCalled();
    } );

    it( 'names an ended quiz, and offers no way to the poll when the host has none', () => {
        const { container } = render( <PollEndedCard state={ state( { quiz: true, anonymous: true, closed: true, answer: 1, recent: undefined } ) } member={ { votes: [ 1 ] } } now={ clock } /> );
        expect( text( container, '.wplus-poll-ended__title' ) ).toBe( 'Quiz ended' );
        expect( container.querySelector( '.wplus-poll-ended__show' ) ).toBeNull();
        expect( options( container )[ 0 ].getAttribute( 'data-result' ) ).toBe( 'right' );
    } );
} );
