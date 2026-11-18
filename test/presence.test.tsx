import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ActivityIndicator, Avatar, AvatarFace, AvatarStack, GroupAvatar, OnlineCount, OnlineList, PersonRow, PresenceLabel, ReadBy, configureUi, host, plainName,
} from '../src/index.ts';
import { translator } from '../src/inc/translations.ts';

const defaults = {
    translate: ( text: string ) => text,
    translatePlural: ( single: string, plural: string, count: number ) => ( count === 1 ? single : plural ),
    applyFilters: <T,>( _name: string, value: T ) => value,
    nameHtml: host().nameHtml,
    defaultAvatar: () => '',
    presenceKnown: () => true,
};

beforeEach( () => configureUi( defaults ) );
afterEach( cleanup );

describe( 'presence: the avatar', () => {
    it( 'draws the picture, named for the reader, with the dot only while the person is not offline', () => {
        const ann = { user_id: 34, name: 'Ann', avatar: '/avatars/ann.svg' };
        const { container, rerender } = render( <Avatar user={ ann } size={ 32 } presence="online" /> );

        const img = container.querySelector( 'img.wplus-avatar' )!;
        expect( img.getAttribute( 'src' ) ).toBe( '/avatars/ann.svg' );
        expect( img.getAttribute( 'alt' ) ).toBe( 'Ann' );
        expect( container.querySelector( '.wplus-presence-dot' )?.getAttribute( 'data-presence' ) ).toBe( 'online' );

        rerender( <Avatar user={ ann } size={ 32 } presence="offline" /> );
        expect( container.querySelector( '.wplus-presence-dot' ) ).toBeNull();
    } );

    it( 'keeps a name a user typed as text: no markup of it becomes an element by default', () => {
        const name = '&lt;img src=x onerror=alert(1)&gt;Ben <b>VIP</b>';
        expect( plainName( name ) ).toBe( 'Ben VIP' );
        expect( host().nameHtml( 'Ben <3' ) ).toBe( 'Ben &lt;3' );

        const { container } = render( <Avatar user={ { user_id: 42, name, avatar: '/b.svg' } } /> );
        expect( container.querySelector( 'img' )!.getAttribute( 'alt' ) ).toBe( 'Ben VIP' );
        expect( container.querySelector( '[onerror]' ) ).toBeNull();
    } );

    it( 'draws the blank of its shape for a person with no picture, where the app gives no default one', () => {
        const { container } = render( <Avatar user={ { user_id: 43, name: 'Cara' } } size={ 28 } /> );
        const blank = container.querySelector( '.wplus-avatar-blank' ) as HTMLElement;
        expect( blank.getAttribute( 'aria-label' ) ).toBe( 'Cara' );
        expect( blank.style.width ).toBe( '28px' );
        expect( container.querySelector( 'img' ) ).toBeNull();
    } );

    it( 'takes the classes and attributes the host\'s filters add, as Better Messages\' integrations add them', () => {
        configureUi( {
            applyFilters: <T,>( name: string, value: T ) => ( name === 'avatar_class' ? `${ value } vip-frame` : name === 'avatar_attributes' ? { 'data-level': 'gold' } : value ) as T,
        } );
        const { container } = render( <Avatar user={ { user_id: 34, name: 'Ann', avatar: '/a.svg' } } /> );
        const wrap = container.querySelector( '.wplus-avatar-wrap' )!;
        expect( wrap.className ).toBe( 'wplus-avatar-wrap vip-frame' );
        expect( wrap.getAttribute( 'data-level' ) ).toBe( 'gold' );
    } );

    it( 'groups up to four faces, stacks a few with a count of the rest, and shows who read a message', () => {
        const people = [ 34, 42, 43, 44, 45 ].map( ( id ) => ( { user_id: id, name: 'P' + id, avatar: `/p${ id }.svg` } ) );

        const group = render( <GroupAvatar users={ people.slice( 0, 3 ) } /> ).container;
        expect( group.querySelectorAll( '.wplus-group-avatar__tile' ) ).toHaveLength( 3 );
        expect( ( group.querySelector( '.wplus-group-avatar__tile' ) as HTMLElement ).style.gridRow ).toBe( 'span 2' );

        const stack = render( <AvatarStack users={ people } max={ 3 } /> ).container;
        expect( stack.querySelectorAll( '.wplus-avatar-stack__item' ) ).toHaveLength( 3 );
        expect( stack.querySelector( '.wplus-avatar-stack__more' )?.textContent ).toBe( '+2' );

        const read = render( <ReadBy users={ [ people[ 0 ], null, people[ 1 ] ] } /> ).container;
        expect( [ ...read.querySelectorAll( 'img' ) ].map( ( i ) => i.getAttribute( 'alt' ) ) ).toEqual( [ 'P34', 'P42' ] );
    } );
} );

describe( 'presence: letters, the offline dot and a face beside its name, for an app whose people have no picture', () => {
    const ann = { user_id: 34, name: 'Ann Lee' };
    const letters = { text: 'A', background: '#FDE68A', color: '#78350F' };

    it( 'draws the letters on their colour in place of the host\'s default picture, named for the reader', () => {
        configureUi( { defaultAvatar: () => '/avatars/default.svg' } );
        const { container, rerender } = render( <Avatar user={ ann } size={ 40 } letters={ letters } /> );

        const drawn = container.querySelector( '.wplus-avatar-letters' ) as HTMLElement;
        expect( drawn.textContent ).toBe( 'A' );
        expect( drawn.getAttribute( 'role' ) ).toBe( 'img' );
        expect( drawn.getAttribute( 'aria-label' ) ).toBe( 'Ann Lee' );
        expect( drawn.style.width ).toBe( '40px' );
        expect( drawn.style.getPropertyValue( '--wplus-avatar-size' ) ).toBe( '40px' );
        expect( drawn.style.background ).toMatch( /#fde68a|rgb\(253, 230, 138\)/i );
        expect( container.querySelector( 'img' ) ).toBeNull();

        // Without letters the host's default picture, as before.
        rerender( <Avatar user={ ann } size={ 40 } /> );
        expect( container.querySelector( 'img' )!.getAttribute( 'src' ) ).toBe( '/avatars/default.svg' );
    } );

    it( 'lays the person\'s own picture over the letters, which show through it and stay where it fails to load', () => {
        const { container, rerender } = render( <Avatar user={ { ...ann, avatar: '/ann.jpg' } } letters={ letters } /> );
        // Over the letters, which name the face: a picture see-through where the person chose none shows them.
        const drawn = container.querySelector( '.wplus-avatar-letters' )!;
        const picture = drawn.querySelector( 'img.wplus-avatar-letters__picture' )!;
        expect( [ picture.getAttribute( 'src' ), picture.getAttribute( 'alt' ) ] ).toEqual( [ '/ann.jpg', '' ] );
        expect( drawn.textContent ).toBe( 'A' );
        expect( drawn.getAttribute( 'aria-label' ) ).toBe( 'Ann Lee' );
        fireEvent.error( picture );
        expect( container.querySelector( 'img' ) ).toBeNull();
        expect( container.querySelector( '.wplus-avatar-letters' )?.textContent ).toBe( 'A' );

        rerender( <Avatar user={ { ...ann, avatar: '/ann-new.jpg' } } letters={ letters } /> );
        expect( container.querySelector( 'img' )!.getAttribute( 'src' ) ).toBe( '/ann-new.jpg' );

        // Without letters a picture that fails stays, as Better Messages has it.
        const plain = render( <Avatar user={ { ...ann, avatar: '/gone.jpg' } } /> ).container;
        fireEvent.error( plain.querySelector( 'img' )! );
        expect( plain.querySelector( 'img' )!.getAttribute( 'src' ) ).toBe( '/gone.jpg' );
    } );

    it( 'draws the dot for an offline person only where asked', () => {
        const { container, rerender } = render( <Avatar user={ ann } letters={ letters } presence="offline" showOffline /> );
        expect( container.querySelector( '.wplus-presence-dot' )?.getAttribute( 'data-presence' ) ).toBe( 'offline' );

        rerender( <Avatar user={ ann } letters={ letters } presence="offline" /> );
        expect( container.querySelector( '.wplus-presence-dot' ) ).toBeNull();
    } );

    it( 'leaves a face beside its name to the name: no tooltip, nothing read twice', () => {
        const named = render( <Avatar user={ { ...ann, avatar: '/ann.jpg' } } /> ).container;
        expect( named.querySelector( '.wplus-avatar-wrap' )!.getAttribute( 'aria-label' ) ).toBe( 'Ann Lee' );

        const { container } = render( <Avatar user={ { ...ann, avatar: '/ann.jpg' } } presence="online" decorative /> );
        const wrap = container.querySelector( '.wplus-avatar-wrap' )!;
        expect( wrap.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
        expect( wrap.getAttribute( 'aria-label' ) ).toBeNull();
        expect( container.querySelector( 'img' )!.getAttribute( 'alt' ) ).toBe( '' );

        const blank = render( <Avatar user={ ann } letters={ letters } decorative /> ).container;
        expect( blank.querySelector( '.wplus-avatar-letters' )!.getAttribute( 'role' ) ).toBeNull();
    } );

    it( 'stacks the faces as the app draws each, overlapped from the side the line starts', () => {
        const team = [ ann, { user_id: 42, name: 'Tom' } ];
        const { container } = render(
            <AvatarStack users={ team } size={ 36 } avatar={ ( person, i ) => ( {
                letters: { ...letters, text: person.name!.charAt( 0 ) },
                presence: i === 0 ? 'online' : null,
                decorative: true,
            } ) } />,
        );

        expect( [ ...container.querySelectorAll( '.wplus-avatar-letters' ) ].map( ( l ) => l.textContent ) ).toEqual( [ 'A', 'T' ] );
        expect( container.querySelectorAll( '.wplus-presence-dot' ) ).toHaveLength( 1 );
        const items = container.querySelectorAll<HTMLElement>( '.wplus-avatar-stack__item' );
        expect( items[ 1 ]!.style.marginInlineStart ).toBe( '-12.6px' );
        expect( items[ 1 ]!.style.marginLeft ).toBe( '' );
    } );

    it( 'draws a face with no tooltip, and a stack\'s faces with their names as text, never as markup', () => {
        configureUi( { nameHtml: ( name: string ) => `${ name } <img class="badge" src="/vip.svg">` } );
        const face = render( <AvatarFace user={ { ...ann, avatar: '/ann.jpg' } } presence="online" /> ).container;
        expect( face.querySelector( '.wplus-avatar-wrap' )!.getAttribute( 'aria-label' ) ).toBeNull();
        expect( face.querySelector( 'img' )!.getAttribute( 'alt' ) ).toBe( 'Ann Lee' );
        expect( face.querySelector( '.wplus-presence-dot' ) ).not.toBeNull();

        const stack = render( <AvatarStack users={ [ ann, { user_id: 42, name: 'Tom' } ] } /> ).container;
        expect( [ ...stack.querySelectorAll( '.wplus-avatar-wrap' ) ].map( ( w ) => w.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Ann Lee', 'Tom' ] );
        expect( stack.querySelector( '.badge' ) ).toBeNull();

        // The avatar of a name gives the name to its tooltip on the face's own wrap, as before the face was a part.
        const avatar = render( <Avatar user={ { ...ann, avatar: '/ann.jpg' } } /> ).container;
        expect( avatar.firstElementChild!.className ).toBe( 'wplus-avatar-wrap' );
        expect( avatar.firstElementChild!.getAttribute( 'aria-label' ) ).toBe( 'Ann Lee' );
    } );
} );

describe( 'presence: typing and the label', () => {
    it( 'spells out up to two names, counts more, and gives each activity its own part', () => {
        const { container, rerender } = render( <ActivityIndicator names={ [ 'Ann' ] } /> );
        expect( container.textContent ).toBe( 'Ann typing' );

        rerender( <ActivityIndicator /> );
        expect( container.textContent ).toBe( 'typing' );
        expect( container.querySelector( '.wplus-typing-dots' ) ).not.toBeNull();

        rerender( <ActivityIndicator entries={ [ { name: 'Ann', activity: 'typing' }, { name: 'Ben', activity: 'typing' }, { name: 'Cara', activity: 'recording' } ] } /> );
        expect( container.textContent ).toBe( 'Ann, Ben typing, Cara recording' );

        rerender( <ActivityIndicator names={ [ 'A', 'B', 'C' ] } /> );
        expect( container.textContent ).toBe( '3 typing' );
    } );

    it( 'takes the form of the reader\'s language for the number of people typing', () => {
        configureUi( translator( 'pl' ) );
        const { container, rerender } = render( <ActivityIndicator names={ [ 'Ola' ] } /> );
        expect( container.textContent ).toBe( 'Ola pisze' );
        rerender( <ActivityIndicator names={ [ 'Ola', 'Jan' ] } /> );
        expect( container.textContent ).toBe( 'Ola, Jan piszą' );

        configureUi( translator( 'hr' ) );
        rerender( <ActivityIndicator names={ [ 'A', 'B', 'C', 'D', 'E' ] } /> );
        expect( container.textContent ).toBe( '5 piše' );
    } );

    it( 'says Offline only where the page can know who is online, and a status\'s own words while online', () => {
        const { container, rerender } = render( <PresenceLabel presence="offline" /> );
        expect( container.textContent ).toBe( 'Offline' );

        configureUi( { presenceKnown: () => false } );
        rerender( <PresenceLabel presence="offline" /> );
        expect( container.textContent ).toBe( '' );

        rerender( <PresenceLabel presence="online" label="In a meeting" color="#d97706" detail="since 10:00" /> );
        const label = container.querySelector( '.wplus-presence-label' ) as HTMLElement;
        expect( label.textContent ).toBe( 'In a meetingsince 10:00' );
        expect( label.style.color ).toBe( '#d97706' );
    } );
} );

describe( 'presence: who is online', () => {
    it( 'lists the people with the count in its title, says when nobody is there, and closes', () => {
        const onClose = vi.fn();
        const { container, rerender } = render(
            <OnlineList count={ 1 } onClose={ onClose }>
                <PersonRow avatar={ <Avatar user={ { user_id: 34, name: 'Ann', avatar: '/a.svg' } } presence="online" /> } name="Ann" sub="Support"
                           actions={ <button className="call">Call</button> } />
            </OnlineList>,
        );
        expect( container.querySelector( '.wplus-chat-online__title' )?.textContent ).toBe( 'Online (1)' );
        expect( container.querySelector( '.wplus-conv-admin__member-name' )?.textContent ).toBe( 'Ann' );
        expect( container.querySelector( '.wplus-conv-admin__member-sub' )?.textContent ).toBe( 'Support' );
        expect( container.querySelector( '.wplus-conv-admin__member .call' ) ).not.toBeNull();

        fireEvent.click( container.querySelector( '.wplus-chat-online__close' )! );
        expect( onClose ).toHaveBeenCalled();

        rerender( <OnlineList count={ 0 } /> );
        expect( container.querySelector( '.wplus-chat-online__empty' )?.textContent ).toBe( 'No users online' );
        expect( container.querySelector( '.wplus-chat-online__close' ) ).toBeNull();
    } );

    it( 'counts live, showing nothing at none and 99+ past 99', () => {
        const { container, rerender } = render( <OnlineCount count={ 0 } /> );
        expect( container.innerHTML ).toBe( '' );
        rerender( <OnlineCount count={ 7 } /> );
        expect( container.textContent ).toBe( '7' );
        rerender( <OnlineCount count={ 120 } /> );
        expect( container.textContent ).toBe( '99+' );
    } );
} );
