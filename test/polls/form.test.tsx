import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../../src/index.ts';
import { PollForm } from '../../src/polls.ts';

const NOW = 1_800_000_000;
const clock = () => NOW;

beforeEach( () => configureUi( { translate: ( t: string ) => t, translatePlural: ( one: string, many: string, n: number ) => ( n === 1 ? one : many ) } ) );
afterEach( cleanup );

const fields = ( c: HTMLElement ) => [ ...c.querySelectorAll<HTMLInputElement>( '.wplus-poll-form__options input[type="text"]' ) ];
const type = ( el: HTMLInputElement | HTMLTextAreaElement, value: string ) => fireEvent.change( el, { target: { value } } );
const question = ( c: HTMLElement ) => c.querySelector<HTMLTextAreaElement>( '.wplus-poll-form__question' )!;
const create = ( c: HTMLElement ) => [ ...c.querySelectorAll<HTMLElement>( '.wplus-poll__action' ) ].find( ( b ) => b.textContent === 'Create poll' )!;
const switchOf = ( c: HTMLElement, label: string ) => [ ...c.querySelectorAll<HTMLLabelElement>( '.wplus-poll-form__switch' ) ].find( ( l ) => l.textContent === label )!.querySelector( 'input' )!;

describe( 'PollForm', () => {
    it( 'is ready once it has a question and two options, and sends the definition as the server reads it', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        expect( create( container ).getAttribute( 'data-disabled' ) ).toBe( '1' );

        type( question( container ), '  Coming on Saturday? ' );
        type( fields( container )[ 0 ], 'Yes' );
        expect( create( container ).getAttribute( 'data-disabled' ) ).toBe( '1' );
        type( fields( container )[ 1 ], 'No' );
        expect( create( container ).getAttribute( 'data-disabled' ) ).toBeNull();

        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit ).toHaveBeenCalledWith( {
            question: 'Coming on Saturday?', options: [ { id: 1, text: 'Yes' }, { id: 2, text: 'No' } ],
            multiple: false, anonymous: true, quiz: null, closesAt: null, addOptions: false, hideResults: false,
        } );
    } );

    it( 'lets members add options and hides the results when switched on, and never adding to a quiz', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), 'Where?' );
        type( fields( container )[ 0 ], 'Office' );
        type( fields( container )[ 1 ], 'Cafe' );
        fireEvent.click( switchOf( container, 'Let members add options' ) );
        fireEvent.click( switchOf( container, 'Hide results until the poll ends' ) );
        expect( [ ...container.querySelectorAll( '.wplus-poll-form__note' ) ].map( ( n ) => n.textContent ) ).toContain( 'Anyone who can vote adds an option while the poll is open, up to 12 in all.' );

        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit.mock.calls[ 0 ][ 0 ] ).toMatchObject( { addOptions: true, hideResults: true } );

        fireEvent.click( switchOf( container, 'Quiz mode' ) );
        expect( switchOf( container, 'Let members add options' ).disabled ).toBe( true );
    } );
    it( 'opens the next option as the last one is filled, up to twelve, and leaves empty ones out', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), 'Lunch?' );
        for ( let i = 0; i < 12; i++ ) type( fields( container )[ i ], 'Place ' + ( i + 1 ) );
        expect( fields( container ).length ).toBe( 12 );

        type( fields( container )[ 4 ], '' );
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit.mock.calls[ 0 ][ 0 ].options.map( ( o: { text: string } ) => o.text ) ).toEqual(
            [ 'Place 1', 'Place 2', 'Place 3', 'Place 4', 'Place 6', 'Place 7', 'Place 8', 'Place 9', 'Place 10', 'Place 11', 'Place 12' ],
        );
    } );

    it( 'marks a duplicate option under its own field and sends nothing', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), 'Q' );
        type( fields( container )[ 0 ], 'Yes' );
        type( fields( container )[ 1 ], '' );
        type( fields( container )[ 1 ], 'No' );
        type( fields( container )[ 2 ], 'yes' );

        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit ).not.toHaveBeenCalled();
        const third = container.querySelectorAll( '.wplus-poll-form__option' )[ 2 ];
        expect( third.querySelector( '.wplus-poll-form__error' )?.textContent ).toBe( 'This option is there already.' );
        expect( third.querySelector( 'input' )?.getAttribute( 'aria-invalid' ) ).toBe( 'true' );
    } );

    it( 'makes a quiz: its right answer by the place among the filled options, and one answer only', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), '2 + 2?' );
        type( fields( container )[ 0 ], '3' );
        // Filling the last field opens a third, and emptying it again leaves a gap between the two options.
        type( fields( container )[ 1 ], 'x' );
        type( fields( container )[ 1 ], '' );
        type( fields( container )[ 2 ], '4' );
        fireEvent.click( switchOf( container, 'Multiple answers' ) );
        fireEvent.click( switchOf( container, 'Quiz mode' ) );
        expect( switchOf( container, 'Multiple answers' ).disabled ).toBe( true );
        // A quiz waits for its answer.
        expect( create( container ).getAttribute( 'data-disabled' ) ).toBe( '1' );

        fireEvent.click( container.querySelectorAll<HTMLElement>( '.wplus-poll-form__answer' )[ 2 ] );
        type( container.querySelector<HTMLTextAreaElement>( '.wplus-poll-form__setting textarea' )!, 'Two pairs.' );
        await act( async () => { fireEvent.click( create( container ) ); } );

        expect( onSubmit.mock.calls[ 0 ][ 0 ] ).toMatchObject( { multiple: false, quiz: { answer: 2, explanation: 'Two pairs.' }, options: [ { id: 1, text: '3' }, { id: 2, text: '4' } ] } );
    } );

    it( 'ends a poll in a day, or at a time chosen, held to the server’s clock', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), 'Q' );
        type( fields( container )[ 0 ], 'A' );
        type( fields( container )[ 1 ], 'B' );
        fireEvent.change( container.querySelector( 'select' )!, { target: { value: 'day' } } );
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit.mock.calls[ 0 ][ 0 ].closesAt ).toBe( NOW + 86400 );

        fireEvent.change( container.querySelector( 'select' )!, { target: { value: 'custom' } } );
        const at = container.querySelector<HTMLInputElement>( 'input[type="datetime-local"]' )!;
        const past = new Date( ( NOW - 3600 ) * 1000 );
        const pad = ( n: number ) => String( n ).padStart( 2, '0' );
        type( at, `${ past.getFullYear() }-${ pad( past.getMonth() + 1 ) }-${ pad( past.getDate() ) }T${ pad( past.getHours() ) }:${ pad( past.getMinutes() ) }` );
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit ).toHaveBeenCalledTimes( 1 );
        expect( container.querySelector( '.wplus-poll-form__error' )?.textContent ).toBe( 'Pick a time at least a minute from now.' );
    } );

    it( 'shows only the switches the host offers, and starts them as it says', async () => {
        const onSubmit = vi.fn();
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } features={ { quiz: false, deadline: false, addOptions: false, hideResults: false } } defaults={ { anonymous: false } } /> );
        expect( [ ...container.querySelectorAll( '.wplus-poll-form__switch' ) ].map( ( l ) => l.textContent ) ).toEqual( [ 'Anonymous voting', 'Multiple answers' ] );
        expect( container.querySelector( 'select' ) ).toBeNull();
        expect( container.querySelector( '.wplus-poll-form__note' )?.textContent ).toBe( 'Everyone sees who voted for each option.' );

        type( question( container ), 'Q' );
        type( fields( container )[ 0 ], 'A' );
        type( fields( container )[ 1 ], 'B' );
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit.mock.calls[ 0 ][ 0 ] ).toMatchObject( { anonymous: false, quiz: null, closesAt: null } );
    } );

    it( 'shows the host’s error when sending fails, and can be sent again', async () => {
        const showError = vi.fn();
        configureUi( { showError } );
        const onSubmit = vi.fn().mockRejectedValueOnce( new Error( 'offline' ) ).mockResolvedValueOnce( undefined );
        const { container } = render( <PollForm now={ clock } onSubmit={ onSubmit } /> );
        type( question( container ), 'Q' );
        type( fields( container )[ 0 ], 'A' );
        type( fields( container )[ 1 ], 'B' );
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( showError ).toHaveBeenCalled();
        await act( async () => { fireEvent.click( create( container ) ); } );
        expect( onSubmit ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'removes an option, keeping two fields at least', () => {
        const { container } = render( <PollForm now={ clock } onSubmit={ vi.fn() } /> );
        type( fields( container )[ 0 ], 'A' );
        type( fields( container )[ 1 ], 'B' );
        expect( fields( container ).length ).toBe( 3 );
        fireEvent.click( container.querySelectorAll<HTMLElement>( '.wplus-poll-form__remove' )[ 0 ] );
        expect( fields( container ).map( ( f ) => f.value ) ).toEqual( [ 'B', '' ] );
        fireEvent.click( container.querySelectorAll<HTMLElement>( '.wplus-poll-form__remove' )[ 0 ] );
        expect( fields( container ).map( ( f ) => f.value ) ).toEqual( [ '', '' ] );
    } );
} );
