// The elements' pieces from the page's own markup (templates.tsx): a `<template slot>` inside an element drawn in our
// piece's place and filled from the piece's props, the page's own `<call-screen>` taken as the call screen's holder,
// and a `control` template a button in the dock that tells the page when it is pressed.
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CallScreen, type CallParticipant } from '../src/calls.ts';
import { configureUi, setUiUsers } from '../src/index.ts';
import { templatePieces } from '../src/templates.tsx';
import { fakeCall, fakeTrack, participant } from './fake-call.ts';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

afterEach( cleanup );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

it( 'fills a chat\'s empty conversation and its messages from the page\'s templates', async () => {
    const chat = fakeRoom( 'chat:34:42', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
    const rt = fakeRooms( { 'chat:34:42': chat } );
    const calls = { on: () => calls, off: () => calls, start: vi.fn(), group: vi.fn(), people: vi.fn( async () => [] ) };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };
    await import( '../src/elements.tsx' );

    document.body.insertAdjacentHTML( 'beforeend', `<chat-room room="chat:34:42">
        <template slot="empty-conversation"><style>p { color: teal; }</style><p class="ask">Ask us about your order</p></template>
        <template slot="message"><div class="line"><b data-field="name"></b>: <span data-field="text"></span><i data-ours></i></div></template>
    </chat-room>` );
    await settle();

    const root = document.querySelector( 'chat-room' )!.shadowRoot!;
    expect( root.querySelector( '[part="empty-conversation"] .ask' )?.textContent ).toBe( 'Ask us about your order' );
    expect( root.querySelector( '.wplus-empty-thread' ) ).toBeNull();
    // Its own style, inside the element's root.
    expect( root.querySelector( '[part="empty-conversation"] style' ) ).not.toBeNull();

    await act( async () => chat.fire( 'message', { text: 'Where is my <b>mug</b>?' }, { from: '42', id: 'm1', at: Date.now() } ) );
    await settle();
    const line = root.querySelector( '[part="message"] .line' )!;
    // Filled as text: what a user wrote never becomes markup.
    expect( line.querySelector( 'span' )?.textContent ).toBe( 'Where is my <b>mug</b>?' );
    expect( line.querySelector( 'span b' ) ).toBeNull();
    expect( line.querySelector( 'b' )?.textContent ).toBe( 'Ben' );
    expect( root.querySelector( '[part="message"]' )?.getAttribute( 'data-mine' ) ).toBe( '0' );
    // Ours where the template asked for it.
    expect( line.querySelector( 'i[data-ours] .wplus-chat-text' )?.textContent ).toBe( 'Where is my <b>mug</b>?' );
} );

it( 'fills the online list\'s rows, with the call buttons where the template puts ours', async () => {
    const shop = fakeRoom( 'shop', { 34: { name: 'Ann' }, 42: { name: 'Ben', role: 'Customer' } } );
    const rt = fakeRooms( { shop } );
    const calls = { on: () => calls, off: () => calls, start: vi.fn( () => new Promise( () => {} ) ), group: vi.fn(), people: vi.fn( async () => [] ) };
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };
    await import( '../src/elements.tsx' );

    document.body.insertAdjacentHTML( 'beforeend', `<online-list room="shop" call="support:{pair}">
        <template slot="online-row"><li class="who"><img data-src="avatar"><span data-field="name"></span> <em data-field="role"></em><span data-ours></span></li></template>
    </online-list>` );
    await settle();

    const root = document.querySelector( 'online-list' )!.shadowRoot!;
    const rows = [ ...root.querySelectorAll( '.who' ) ];
    expect( rows.map( ( r ) => r.querySelector( 'span' )?.textContent ) ).toEqual( [ 'Ann', 'Ben' ] );
    expect( rows[ 1 ].querySelector( 'em' )?.textContent ).toBe( 'Customer' );
    expect( rows[ 1 ].querySelector( 'img' )?.getAttribute( 'src' ) ).toBe( '/avatars/ben.svg' );
    // The template's place for ours holds the row as we draw it, with its call button.
    expect( rows[ 1 ].querySelector( '[data-ours] .wplus-row-action' ) ).not.toBeNull();
    expect( rows[ 0 ].querySelector( '[data-ours] .wplus-row-action' ) ).toBeNull();
} );

it( 'adds the page\'s own buttons to the dock and tells the page when one is pressed, and fills the ring\'s card', async () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 42 } );
    setUiUsers( [ [ 34, { name: 'Ann' } ] ] );
    const holder = document.createElement( 'call-screen' );
    holder.innerHTML = `<template slot="control" data-control="raise" data-label="Raise hand" data-icon="raisehand"></template>
        <template slot="ring-card"><div class="ring"><b data-field="name"></b> <span data-field="type"></span>
        <button class="yes" data-action="answer">Pick up</button><button class="no" data-action="reject">Not now</button></div></template>`;
    document.body.append( holder );
    const pieces = templatePieces( holder );
    const pressed: string[] = [];
    document.addEventListener( 'realtime-control', ( e ) => pressed.push( ( e as CustomEvent ).detail.control ) );

    const call = fakeCall( {
        participants: new Map<string, CallParticipant>( [ [ 'me', participant( 'me' ) ], [ 'user_34', participant( 'user_34', { audio: fakeTrack() } ) ] ] ),
        myMicrophoneTrack: fakeTrack(),
    } );
    const { container } = render( <CallScreen call={ { ...call, wrapper: createRef<HTMLDivElement>() as never } } layout="private" components={ pieces } /> );

    const mine = container.querySelector( '.realtime-control-raise' )!;
    expect( mine.getAttribute( 'aria-label' ) ).toBe( 'Raise hand' );
    // Hanging up stays the last of the row.
    const last = container.querySelector( '.wplus-call-buttons' )!.lastElementChild!;
    expect( last.matches( '.wplus-cancel' ) || !! last.querySelector( '.wplus-cancel' ) ).toBe( true );
    fireEvent.click( mine );
    expect( pressed ).toEqual( [ 'raise' ] );

    const answer = vi.fn(), reject = vi.fn();
    const Ring = pieces.RingCard!;
    const ring = render( <Ring user_id={ 34 } name="Ann" type="video" onAnswer={ answer } onReject={ reject } /> );
    expect( ring.container.querySelector( '[part="ring-card"] b' )?.textContent ).toBe( 'Ann' );
    expect( ring.container.querySelector( '[part="ring-card"] span' )?.textContent ).toBe( 'Incoming Video Call' );
    fireEvent.click( ring.container.querySelector( '.yes' )! );
    fireEvent.click( ring.container.querySelector( '.no' )! );
    expect( [ answer.mock.calls.length, reject.mock.calls.length ] ).toEqual( [ 1, 1 ] );
} );
