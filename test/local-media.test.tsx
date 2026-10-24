import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { useLocalMedia } from '../src/sdk/local-media.ts';

const showError = vi.fn();

beforeEach( () => {
    showError.mockClear();
    configureUi( { translate: ( text ) => text, showError } );
} );

afterEach( cleanup );

/** A track as the browser hands it over. */
const track = ( kind: 'audio' | 'video' ) => ( {
    kind,
    id: kind,
    stop: vi.fn(),
    getSettings: () => ( { deviceId: `${ kind }-1` } ),
    addEventListener: () => {},
    removeEventListener: () => {},
} ) as unknown as MediaStreamTrack;

const failure = ( name: string ) => Object.assign( new Error( name ), { name } );

/** The browser's getUserMedia, answering each request as `answer` says, and what it was asked for. */
function browser( answer: ( asked: MediaStreamConstraints ) => MediaStreamTrack[] | Error ) {
    const asked: MediaStreamConstraints[] = [];
    const getUserMedia = async ( constraints: MediaStreamConstraints ) => {
        asked.push( constraints );
        const tracks = answer( constraints );
        if ( tracks instanceof Error ) throw tracks;
        return {
            getTracks: () => tracks,
            getAudioTracks: () => tracks.filter( ( one ) => one.kind === 'audio' ),
            getVideoTracks: () => tracks.filter( ( one ) => one.kind === 'video' ),
        } as unknown as MediaStream;
    };
    Object.defineProperty( navigator, 'mediaDevices', { configurable: true, value: { getUserMedia, enumerateDevices: async () => [] } } );
    return asked;
}

/** The hook, and what it handed to the call. */
function media() {
    const sent: string[] = [];
    const hook = renderHook( () => useLocalMedia( ( source, sending ) => void sent.push( `${ source } ${ sending ? 'on' : 'off' }` ) ) );
    return { hook, sent };
}

describe( 'a video call\'s microphone and camera', () => {
    it( 'are asked for together, so the browser asks once, and both go to the call', async () => {
        const asked = browser( ( constraints ) => [
            ...( constraints.audio ? [ track( 'audio' ) ] : [] ),
            ...( constraints.video ? [ track( 'video' ) ] : [] ),
        ] );
        const { hook, sent } = media();
        await act( () => hook.result.current.enableMicAndCamera() );

        // the camera at up to 1080p and 30 frames, as Better Messages' call: asked for no size, Chrome opens 640x480
        expect( asked ).toEqual( [ { audio: true, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } } ] );
        expect( sent ).toEqual( [ 'microphone on', 'camera on' ] );
        expect( hook.result.current.microphone ).not.toBeNull();
        expect( hook.result.current.camera ).not.toBeNull();
        expect( showError ).not.toHaveBeenCalled();
    } );

    it( 'refused, say so once and ask no more', async () => {
        const asked = browser( () => failure( 'NotAllowedError' ) );
        const { hook, sent } = media();
        await act( () => hook.result.current.enableMicAndCamera() );

        expect( asked ).toHaveLength( 1 );
        expect( sent ).toEqual( [] );
        expect( showError ).toHaveBeenCalledTimes( 1 );
        expect( showError.mock.calls[ 0 ][ 0 ] ).toContain( 'camera or microphone' );
    } );

    it( 'without a camera, the microphone alone, and the camera says it is not found', async () => {
        const asked = browser( ( constraints ) => ( constraints.video ? failure( 'NotFoundError' ) : [ track( 'audio' ) ] ) );
        const { hook, sent } = media();
        await act( () => hook.result.current.enableMicAndCamera() );

        expect( asked.map( ( one ) => Object.keys( one ).join( ' and ' ) ) ).toEqual( [ 'audio and video', 'audio', 'video' ] );
        expect( sent ).toEqual( [ 'microphone on' ] );
        expect( showError ).toHaveBeenCalledTimes( 1 );
        expect( showError.mock.calls[ 0 ][ 0 ] ).toContain( 'Camera not found' );
    } );

    it( 'take the devices picked in the call\'s switches', async () => {
        const asked = browser( () => [ track( 'audio' ), track( 'video' ) ] );
        const { hook } = media();
        act( () => {
            hook.result.current.setSelectedMicrophoneDevice( 'mic-2' );
            hook.result.current.setSelectedCameraDevice( 'cam-3' );
        } );
        await act( () => hook.result.current.enableMicAndCamera() );

        expect( asked ).toEqual( [ { audio: { deviceId: { exact: 'mic-2' } },
            video: { deviceId: { exact: 'cam-3' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } } ] );
    } );
} );

describe( 'a voice call', () => {
    it( 'asks for the microphone alone', async () => {
        const asked = browser( () => [ track( 'audio' ) ] );
        const { hook, sent } = media();
        await act( () => hook.result.current.enableMic() );

        expect( asked ).toEqual( [ { audio: true } ] );
        expect( sent ).toEqual( [ 'microphone on' ] );
    } );
} );
