import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureUi, host } from '../src/host.ts';
import { CallScreen } from '../src/react.tsx';
import { start } from '../src/elements.tsx';
import { pageWithCalls } from './page-calls.ts';
import { Emitter, devices, fakeCall } from './fake-sdk-call.ts';

// An app's default for AI Noise Removal (UiHost.noiseDefault), given the two ways an app starts the call screen:
// the elements script's start() (and the page's config) and the React CallScreen. `off` stays what nothing says.

const rt = () => ( { calls: async () => Object.assign( new Emitter(), { start: async () => fakeCall(), people: async () => [] } ) } ) as never;

beforeEach( () => {
    configureUi( { translate: ( text ) => text, noiseDefault: () => 'off' } );
    devices();
    delete ( globalThis as any ).wordplusRealtimeConfig;
} );
afterEach( () => {
    cleanup();
    delete ( globalThis as any ).wordplusRealtimeConfig;
} );

describe( 'elements start()', () => {
    it( 'leaves AI Noise Removal off when nothing says', () => {
        pageWithCalls();
        start( {} );
        expect( host().noiseDefault?.() ).toBe( 'off' );
    } );

    it( 'takes noiseDefault: auto from the settings', () => {
        pageWithCalls();
        start( { noise: '/nx/', noiseDefault: 'auto' } );
        expect( host().noiseDefault?.() ).toBe( 'auto' );
        expect( host().noiseUrl() ).toBe( '/nx/' );
    } );

    it( 'takes it from the page config when start() is given none, and the settings win over it', () => {
        ( globalThis as any ).wordplusRealtimeConfig = { screen: { noiseDefault: 'auto' } };
        pageWithCalls();
        start( {} );
        expect( host().noiseDefault?.() ).toBe( 'auto' );
        start( { noiseDefault: 'off' } );
        expect( host().noiseDefault?.() ).toBe( 'off' );
    } );

    it( 'treats anything but auto as off', () => {
        pageWithCalls();
        start( { noiseDefault: 'on' as never } );
        expect( host().noiseDefault?.() ).toBe( 'off' );
    } );
} );

describe( 'React CallScreen', () => {
    it( 'leaves it off by default', () => {
        render( <CallScreen rt={ rt() } /> );
        expect( host().noiseDefault?.() ).toBe( 'off' );
    } );

    it( 'takes noiseDefault: auto', () => {
        render( <CallScreen rt={ rt() } noise="/nx/" noiseDefault="auto" /> );
        expect( host().noiseDefault?.() ).toBe( 'auto' );
    } );

    it( 'takes noiseDefault: off', () => {
        configureUi( { noiseDefault: () => 'auto' } );
        render( <CallScreen rt={ rt() } noiseDefault="off" /> );
        expect( host().noiseDefault?.() ).toBe( 'off' );
    } );
} );
