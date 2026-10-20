// StreamView (src/sdk/stream-view.tsx): the SDK's stream in Easy Stream's views, for a React app. The stream is the
// app's: the view draws it, and neither starts nor leaves it.
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
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
