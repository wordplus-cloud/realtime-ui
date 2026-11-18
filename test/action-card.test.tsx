import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActionCard } from '../src/chat.ts';

afterEach( cleanup );

describe( 'chat: a request in a chat', () => {
    it( 'draws its head, how it stands, and what can be done', () => {
        const { container } = render(
            <ActionCard title="Booking a seat" subtitle="1 seat" state="Waiting for the team" line="You get the answer here." actions={ <button type="button">Cancel this request</button> } live />,
        );
        const card = container.querySelector( '.wplus-action-card' )!;

        expect( card.className ).toContain( 'is-waiting' );
        expect( card.getAttribute( 'role' ) ).toBe( 'status' );
        expect( card.getAttribute( 'aria-live' ) ).toBe( 'polite' );
        expect( card.querySelector( '.wplus-action-card__title strong' )!.textContent ).toBe( 'Booking a seat' );
        expect( card.querySelector( '.wplus-action-card__pulse' ) ).not.toBeNull();
        expect( card.querySelector( '.wplus-action-card__actions button' )!.textContent ).toBe( 'Cancel this request' );
    } );

    it( 'pulses only while it waits, and is a named group for the one who decides', () => {
        const { container } = render( <ActionCard tone="done" title="Approved" state="Done" label="A request of the assistant">Ran in 0.7 s</ActionCard> );
        const card = container.querySelector( '.wplus-action-card' )!;

        expect( card.className ).toContain( 'is-done' );
        expect( card.querySelector( '.wplus-action-card__pulse' ) ).toBeNull();
        expect( card.getAttribute( 'role' ) ).toBe( 'group' );
        expect( card.getAttribute( 'aria-label' ) ).toBe( 'A request of the assistant' );
        expect( card.querySelector( '.wplus-action-card__body' )!.textContent ).toBe( 'Ran in 0.7 s' );
    } );
} );
