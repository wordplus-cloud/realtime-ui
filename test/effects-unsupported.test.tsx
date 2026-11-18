import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { DevicePanel, cameraEffectsSupported } from '../src/calls.ts';
import { CallContext } from '../src/components/calls/context.ts';
import { fakeCall } from './fake-call.ts';

// A browser that cannot capture a canvas (happy-dom, as an old one) has no way to send a camera with an effect: the
// device settings offer no background there, while the noise removal, which needs only an AudioWorklet, stays.

vi.mock( '../src/inc/calls/mic-level.ts', () => ( { readLevel: () => () => {} } ) );

// The camera and the microphone allowed, as the browser says when the settings ask it: the effects are offered only
// then. The registry's own read finds no devices here (the page's mediaDevices come after it loads).
vi.mock( '../src/inc/calls/permissions.ts', async ( original ) => {
    const real = await original<typeof import( '../src/inc/calls/permissions.ts' )>();
    real.mediaAccess.set( 'camera', 'granted' );
    real.mediaAccess.set( 'microphone', 'granted' );
    return {
        ...real,
        updateMediaPermissions: async () => {
            real.mediaAccess.set( 'camera', 'granted' );
            real.mediaAccess.set( 'microphone', 'granted' );
            real.mediaUpdatedSubject.next();
        },
    };
} );

afterEach( () => {
    cleanup();
    delete ( globalThis as Record<string, unknown> ).AudioWorkletNode;
    delete ( window as unknown as { AudioContext?: unknown } ).AudioContext;
} );

describe( 'a browser that cannot run the camera effects', () => {
    it( 'is offered no background, and still the noise removal', () => {
        configureUi( { translate: ( text ) => text, effectsUrl: () => '/fx/', noiseUrl: () => '/nx/' } );
        ( globalThis as Record<string, unknown> ).AudioWorkletNode = class {};
        ( window as unknown as { AudioContext: unknown } ).AudioContext = class { createMediaStreamDestination() {} };
        Object.defineProperty( navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [] } } );

        expect( cameraEffectsSupported() ).toBe( false );
        const { container } = render( <CallContext.Provider value={ fakeCall( { effects: true } ) }>
            <DevicePanel video group close={ () => {} } />
        </CallContext.Provider> );
        expect( container.querySelector( '.wplus-call-effect' ) ).toBeNull();
        expect( container.querySelector( '.wplus-call-noise[role="switch"]' ) ).not.toBeNull();
    } );

    it( 'without WebAssembly\'s SIMD, which the builds of DeepFilterNet3 and of MediaPipe need, is not offered AI Noise Removal', () => {
        configureUi( { translate: ( text ) => text, effectsUrl: () => '/fx/', noiseUrl: () => '/nx/' } );
        ( globalThis as Record<string, unknown> ).AudioWorkletNode = class {};
        ( window as unknown as { AudioContext: unknown } ).AudioContext = class { createMediaStreamDestination() {} };
        Object.defineProperty( navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: async () => [] } } );
        const validate = vi.spyOn( WebAssembly, 'validate' ).mockReturnValue( false );

        const { container } = render( <CallContext.Provider value={ fakeCall( { effects: true } ) }>
            <DevicePanel video group close={ () => {} } />
        </CallContext.Provider> );
        expect( container.querySelector( '.wplus-call-noise[role="switch"]' ) ).toBeNull();
        validate.mockRestore();
    } );
} );
