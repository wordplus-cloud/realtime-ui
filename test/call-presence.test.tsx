import React, { createRef } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureUi, setUiUsers, type UserAvatarProps } from '../src/index.ts';
import { CallScreen, LAYOUT_KEY, type CallParticipant } from '../src/calls.ts';
import { fakeCall, participant } from './fake-call.ts';

// A call's avatars and the host's presence dot (UserAvatarProps.presence): the person a call with one person rings
// wears it, as a member list does; once the call is answered, and anywhere on a group call, no avatar does, as everyone
// on it is plainly there.

/** Every avatar drawn, with what it was asked for, by a host whose avatar draws a dot unless told not to. */
const drawn: UserAvatarProps[] = [];

beforeEach( () => {
    drawn.length = 0;
    configureUi( {
        translate: ( text ) => text,
        currentUserId: () => 42,
        accentColor: () => '#21759b',
        confirm: async () => false,
        showError: () => {},
        Avatar: ( props ) => {
            drawn.push( props );
            return <i className={ 'host-avatar' + ( props.presence === false ? '' : ' online' ) } data-user={ String( props.user_id ) } />;
        },
    } );
    setUiUsers( [ [ 34, { name: 'Ann' } ], [ 42, { name: 'Ben' } ], [ 43, { name: 'Cara' } ] ] );
    window.localStorage.clear();
} );

afterEach( () => cleanup() );

const draw = ( over: Parameters<typeof fakeCall>[ 0 ], layout: 'private' | 'group-audio' | 'group-video' ) =>
    render( <CallScreen call={ { ...fakeCall( over ), wrapper: createRef<HTMLDivElement>() as never } } layout={ layout } /> );

const dots = ( container: HTMLElement ) => container.querySelectorAll( '.host-avatar.online' ).length;

describe( 'the presence dot on a call', () => {
    it( 'is on the person a call with one person rings', () => {
        const { container } = draw( { action: 'outgoing_call', connectionState: 'disconnected' as never }, 'private' );

        expect( container.querySelector( '.host-avatar[data-user="34"]' ), 'their avatar is drawn' ).not.toBeNull();
        expect( dots( container ) ).toBe( 1 );
    } );

    it( 'is nowhere once the call is answered', () => {
        const { container } = draw( { action: 'call_in_progress' }, 'private' );

        expect( container.querySelector( '.host-avatar[data-user="34"]' ), 'their avatar is drawn with no camera' ).not.toBeNull();
        expect( dots( container ) ).toBe( 0 );
    } );

    const people = () => new Map<string, CallParticipant>( [
        [ 'me', participant( 'me', { name: 'Ben' } ) ],
        [ 'user_34', participant( 'user_34', { identity: 'user_34', name: 'Ann' } ) ],
        [ 'user_43', participant( 'user_43', { identity: 'user_43', name: 'Cara' } ) ],
    ] );
    const group = { thread_id: 7, participants: [ 34, 43 ] } as never;

    it( 'is on no tile of a group call', () => {
        const { container } = draw( { participants: people(), thread: group }, 'group-audio' );

        expect( container.querySelectorAll( '.wplus-info-avatar .host-avatar' ).length, 'a tile each' ).toBe( 3 );
        expect( dots( container ) ).toBe( 0 );
        expect( drawn.every( ( props ) => props.presence === false ), 'every avatar asked for none' ).toBe( true );
    } );

    it( 'is on nobody in a group call\'s list of people', () => {
        // The user's own tile hidden (Hide Self View), so the stage leaves someone out and the dock offers the list.
        window.localStorage.setItem( LAYOUT_KEY, JSON.stringify( { mode: 'auto', hideNoVideo: false, hideSelf: true } ) );
        const { container } = draw( { participants: people(), thread: group }, 'group-video' );

        fireEvent.click( container.querySelector<HTMLElement>( '.wplus-call-people-toggle' )! );
        expect( container.querySelectorAll( '.wplus-call-people-avatar .host-avatar' ).length, 'a row each' ).toBe( 3 );
        expect( dots( container ) ).toBe( 0 );
        expect( drawn.length, 'avatars were drawn' ).toBeGreaterThan( 0 );
        expect( drawn.every( ( props ) => props.presence === false ), 'every avatar asked for none' ).toBe( true );
    } );
} );
