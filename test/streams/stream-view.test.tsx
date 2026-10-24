// StreamView (src/sdk/stream-view.tsx): the SDK's stream in Easy Stream's views, for a React app. The stream is the
// app's: the view draws it, and neither starts nor leaves it.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { StreamView, streamEngine } from '../../src/streams.ts';
import { fakeClient } from './fake.tsx';

afterEach( cleanup );

it( 'draws the stream on its engine, in the language given, and leaves the stream to the app', () => {
    const { client } = fakeClient( { stream: { id: 'show:mugs', state: 'live', started_at: 1, ended_at: null } } );
    const stream = { name: 'show:mugs', engine: client, leave: vi.fn() };

    const { container, unmount } = render( <StreamView stream={ stream } title="New mugs" lang="he" /> );

    expect( container.querySelector( '.estream-app' ) ).toBeTruthy();
    expect( ( container.firstElementChild as HTMLElement ).dir ).toBe( 'rtl' );
    expect( streamEngine( stream ) ).toBe( client );

    unmount();
    expect( client.start ).not.toHaveBeenCalled();
    expect( client.stop ).not.toHaveBeenCalled();
    expect( stream.leave ).not.toHaveBeenCalled();
} );

it( 'offers a signed-in viewer the hand while live, as the app\'s rule allows the stage, and nobody else', () => {
    const live = { id: 'lesson:1', state: 'live' as const, started_at: 1, ended_at: null };
    const view = ( state: Parameters<typeof fakeClient>[0] ) => {
        const fake = fakeClient( state );
        return { ...fake, ...render( <StreamView stream={ { name: 'lesson:1', engine: fake.client, leave: vi.fn() } } lang="en" /> ) };
    };

    // A signed-in viewer of a stream that takes guests: the hand, which asks the cloud.
    const student = view( { stream: live } );
    fireEvent.click( student.getByRole( 'button', { name: 'Ask to join on stage' } ) );
    expect( student.client.raiseHand ).toHaveBeenCalledWith( true );
    student.unmount();

    // A grant that says no stage, and a visitor who isn't signed in: no hand.
    const noStage = view( { stream: live, you: { identity: 'u:7', role: 'viewer', name: 'Maya', chat: 'write', mod: false, stage: false } } );
    expect( noStage.queryByRole( 'button', { name: 'Ask to join on stage' } ) ).toBeNull();
    noStage.unmount();
    const visitor = view( { stream: live, you: { identity: 'v:3', role: 'viewer', name: 'Guest', chat: 'read', mod: false } } );
    expect( visitor.queryByRole( 'button', { name: 'Ask to join on stage' } ) ).toBeNull();
    visitor.unmount();

    // Before the stream is live, no hand either.
    const waiting = view( { stream: { ...live, state: 'idle', started_at: null } } );
    expect( waiting.queryByRole( 'button', { name: 'Ask to join on stage' } ) ).toBeNull();
} );
