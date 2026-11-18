import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../../src/index.ts';
import { PollVoters, type PollState } from '../../src/polls.ts';

const state: PollState = {
    question: 'Coming on Saturday?',
    options: [ { id: 1, text: 'Yes' }, { id: 2, text: 'No' }, { id: 3, text: 'Maybe' } ],
    multiple: false, anonymous: false, quiz: false, closesAt: null, closedAt: null, closed: false,
    counts: { 1: 0, 2: 3, 3: 1 }, voters: 4, recent: { 1: [], 2: [ 5, 6, 7 ], 3: [ 8 ] },
};

beforeEach( () => configureUi( {
    translate: ( t: string ) => t,
    translatePlural: ( one: string, many: string, n: number ) => ( n === 1 ? one : many ),
    Avatar: ( p ) => <i data-face={ String( p.user_id ) } />,
    Name: ( p ) => <b>{ 'User ' + p.user_id }</b>,
} ) );
afterEach( cleanup );

const names = ( c: HTMLElement ) => [ ...c.querySelectorAll( '.wplus-poll-voters__name' ) ].map( ( n ) => n.textContent );
const settle = () => act( async () => { await Promise.resolve(); } );

describe( 'PollVoters', () => {
    it( 'opens on the first option with votes and pages its voters in', async () => {
        const load = vi.fn( async ( _option: number, page: number ) => ( page === 1 ? { users: [ 5, 6 ], more: true } : { users: [ 6, 7 ], more: false } ) );
        const { container, getByText, queryByText } = render( <PollVoters state={ state } load={ load } /> );
        await settle();

        expect( load ).toHaveBeenCalledWith( 2, 1 );
        expect( container.querySelector( '[data-active="1"] .wplus-poll-voters__tab-text' )?.textContent ).toBe( 'No' );
        expect( names( container ) ).toEqual( [ 'User 5', 'User 6' ] );

        fireEvent.click( getByText( 'Show more' ) );
        await settle();
        expect( load ).toHaveBeenLastCalledWith( 2, 2 );
        // A voter who moved between pages is listed once.
        expect( names( container ) ).toEqual( [ 'User 5', 'User 6', 'User 7' ] );
        expect( queryByText( 'Show more' ) ).toBeNull();
    } );

    it( 'loads another option on its tab, and an option nobody picked says so without asking', async () => {
        const load = vi.fn( async ( option: number ) => ( { users: option === 3 ? [ 8 ] : [ 5 ], more: false } ) );
        const { container, getByText } = render( <PollVoters state={ state } load={ load } option={ 3 } /> );
        await settle();
        expect( names( container ) ).toEqual( [ 'User 8' ] );

        fireEvent.click( getByText( 'Yes' ) );
        await settle();
        expect( load ).not.toHaveBeenCalledWith( 1, 1 );
        expect( getByText( 'No one voted for this option yet.' ) ).toBeTruthy();
    } );

    it( 'offers to try again when a page fails', async () => {
        const load = vi.fn().mockRejectedValueOnce( new Error( 'offline' ) ).mockResolvedValueOnce( { users: [ 5 ], more: false } );
        const { container, getByText } = render( <PollVoters state={ state } load={ load } /> );
        await settle();
        expect( getByText( 'The votes could not be loaded.' ) ).toBeTruthy();

        fireEvent.click( getByText( 'Try again' ) );
        await settle();
        expect( names( container ) ).toEqual( [ 'User 5' ] );
    } );

    it( 'closes', () => {
        const onClose = vi.fn();
        const { container } = render( <PollVoters state={ state } load={ async () => ( { users: [], more: false } ) } onClose={ onClose } /> );
        fireEvent.click( container.querySelector( '.wplus-poll-voters__close' )! );
        expect( onClose ).toHaveBeenCalled();
    } );

    it( 'leaves its title to a host dialog that has one', () => {
        const { container } = render( <PollVoters state={ state } load={ async () => ( { users: [], more: false } ) } heading={ false } /> );
        expect( container.querySelector( '.wplus-poll-voters__head' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll-voters__question' )?.textContent ).toBe( 'Coming on Saturday?' );
    } );
} );
