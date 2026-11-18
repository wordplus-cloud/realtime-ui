import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { useGroupCall } from '../src/sdk/use-group-call.ts';
import { devices, Emitter } from './fake-sdk-call.ts';

// The call screen reads how each connection is, where the client says it, as Better Messages' does: a weak one shows on
// the people's panel and on the page's own status. A client that says nothing reads as good, as every tile read before.

function group( fields: Record<string, unknown> = {} ) {
    return Object.assign( new Emitter(), { state: 'connected', people: () => [], setTrack: vi.fn( async () => {} ), leave: vi.fn(), ...fields } ) as any;
}

const person = ( quality?: string ) => ( { identity: 'user_42', user: 42, info: { name: 'Ben' }, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false, ...( quality ? { quality } : {} ) } );

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 34 } );
    devices();
} );

afterEach( cleanup );

it( 'draws each person\'s connection and this page\'s own as the client says them', () => {
    const call = group( { quality: 'poor', people: () => [ person( 'lost' ) ] } );

    const { result } = renderHook( () => useGroupCall( call, 'video', () => {} ) );

    expect( result.current.participants.get( 'me' )?.quality ).toBe( 'poor' );
    expect( result.current.participants.get( 'user_42' )?.quality ).toBe( 'lost' );

    act( () => call.fire( 'quality', 'excellent' ) );
    expect( result.current.participants.get( 'me' )?.quality ).toBe( 'excellent' );
} );

it( 'reads as good with a client that says nothing of it', () => {
    const call = group( { people: () => [ person() ] } );

    const { result } = renderHook( () => useGroupCall( call, 'video', () => {} ) );

    expect( result.current.participants.get( 'me' )?.quality ).toBe( 'good' );
    expect( result.current.participants.get( 'user_42' )?.quality ).toBe( 'good' );
} );
