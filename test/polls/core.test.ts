import { describe, expect, it } from 'vitest';
import vectors from '../../src/components/polls/vectors.json';
import { applyVote, checkDefinition, checkOption, isOpen, labelOf, memberOf, percentages, stateOf, winners, type PollRecord, type PollState, type PollVote } from '../../src/components/polls/core.ts';

// The cases every implementation of polls passes (vectors.json): the WordPlus SDK's PHP and the server helpers of
// @wordplus/realtime run the same file.

describe( 'polls: the shared cases', () => {
    it.each( vectors.definitions.map( ( c ) => [ c.name, c ] as const ) )( 'definition: %s', ( _name, c ) => {
        expect( checkDefinition( c.input, c.now ) ).toEqual( c.expect );
    } );

    it.each( vectors.votes.map( ( c ) => [ c.name, c ] as const ) )( 'vote: %s', ( _name, c ) => {
        const r = applyVote( c.poll as PollRecord, c.votes as PollVote[], c.user, c.picks, c.now );
        expect( r.ok ? { ok: true, votes: r.value } : { ok: false, error: r.error } ).toEqual( c.expect );
    } );

    it.each( vectors.options.map( ( c ) => [ c.name, c ] as const ) )( 'added option: %s', ( _name, c ) => {
        const r = checkOption( c.poll as PollRecord, c.text, c.user, c.now );
        expect( r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error } ).toEqual( c.expect );
    } );

    it.each( vectors.winners.map( ( c ) => [ c.name, c ] as const ) )( 'winners: %s', ( _name, c ) => {
        expect( winners( c.state as Pick<PollState, 'options' | 'counts' | 'voters' | 'hidden'> ) ).toEqual( c.expect );
    } );

    it.each( vectors.states.map( ( c ) => [ c.name, c ] as const ) )( 'state: %s', ( _name, c ) => {
        expect( stateOf( c.poll as PollRecord, c.votes as PollVote[], c.now ) ).toEqual( c.expect );
    } );

    it.each( vectors.members.map( ( c ) => [ c.name, c ] as const ) )( 'member: %s', ( _name, c ) => {
        expect( memberOf( c.poll as PollRecord, c.votes as PollVote[], c.user ) ).toEqual( c.expect );
    } );

    it.each( vectors.percentages.map( ( c ) => [ c.name, c ] as const ) )( 'percentages: %s', ( _name, c ) => {
        expect( percentages( c.state as Pick<PollState, 'options' | 'counts' | 'voters' | 'multiple'> ) ).toEqual( c.expect );
    } );

    it( 'labels a poll message', () => {
        for ( const c of vectors.labels ) expect( labelOf( c.question ) ).toBe( c.expect );
    } );
} );

describe( 'polls: beyond the shared cases', () => {
    const NOW = 1_800_000_000;
    const poll: PollRecord = {
        question: 'Q', options: [ { id: 1, text: 'A' }, { id: 2, text: 'B' } ], multiple: false, anonymous: false, quiz: null, closesAt: null, closedAt: null,
        addOptions: false, hideResults: false,
    };

    it( 'keeps an app’s text ids as they are, in the faces of a public poll', () => {
        const r = applyVote( poll, [ { user: 'auth0|ann', option: 1, at: NOW - 5 } ], 'user_ben', [ 1 ], NOW );
        expect( r.ok && stateOf( poll, r.value, NOW ).recent ).toEqual( { 1: [ 'user_ben', 'auth0|ann' ], 2: [] } );
    } );

    it( 'reads a state as ended by its flag, its time ended or its deadline', () => {
        expect( isOpen( { closed: true, closedAt: null, closesAt: null }, NOW ) ).toBe( false );
        expect( isOpen( { closedAt: NOW - 1, closesAt: null }, NOW ) ).toBe( false );
        expect( isOpen( { closedAt: null, closesAt: NOW }, NOW ) ).toBe( false );
        expect( isOpen( { closedAt: null, closesAt: NOW + 1 }, NOW ) ).toBe( true );
    } );

    it( 'never puts a quiz answer in the state of an open quiz, whoever voted', () => {
        const quiz = { ...poll, quiz: { answer: 2, explanation: 'Why.' } };
        const state = stateOf( quiz, [ { user: 1, option: 2, at: NOW - 1 } ], NOW );
        expect( JSON.stringify( state ) ).not.toContain( 'Why.' );
        expect( state ).not.toHaveProperty( 'answer' );
    } );

    it( 'never names a voter in the state of an anonymous poll', () => {
        const state = stateOf( { ...poll, anonymous: true }, [ { user: 31337, option: 1, at: NOW - 1 } ], NOW );
        expect( JSON.stringify( state ) ).not.toContain( '31337' );
    } );
} );
