import { vi } from 'vitest';
import type { SdkCall, SdkRemoteTrack } from '../src/sdk/types.ts';

// The SDK's calls as the screens read them, by shape: events fired by hand. A call, the other side's track, and the
// browser's devices giving what was asked for (test/sdk.test.tsx, test/private-call-screen.test.tsx).
export class Emitter {
    private handlers = new Map<string, Array<( ...args: any[] ) => void>>();
    on( event: string, fn: ( ...args: any[] ) => void ) {
        this.handlers.set( event, [ ...( this.handlers.get( event ) ?? [] ), fn ] );
        return this;
    }
    off( event: string, fn?: ( ...args: any[] ) => void ) {
        this.handlers.set( event, ( this.handlers.get( event ) ?? [] ).filter( ( f ) => fn && f !== fn ) );
        return this;
    }
    fire( event: string, ...args: any[] ) {
        for ( const fn of this.handlers.get( event ) ?? [] ) fn( ...args );
    }
}

export const remote = (): SdkRemoteTrack & { on: HTMLMediaElement[] } => {
    const on: HTMLMediaElement[] = [];
    return {
        on,
        mediaStreamTrack: {} as MediaStreamTrack,
        attach: ( el ) => ( on.push( el ), el ),
        detach: () => [],
    };
};

export function fakeCall( over: Partial<SdkCall> = {} ) {
    const e = new Emitter();
    const call = Object.assign( e, {
        id: 'call-1', name: 'support:34:42', type: 'video' as const, role: 'caller' as const, peer: { user: 34, info: { name: 'Ann' } },
        state: 'ringing' as SdkCall[ 'state' ], endReason: null,
        remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: { camera: false, microphone: false, screen_share: false, screen_share_audio: false }, quality: 'unknown' as const },
        sent: [] as Array<[ string, unknown ]>,
        add: vi.fn( async () => ( {} as any ) ),
        setTrack( source: string, track: unknown ) { this.sent.push( [ source, track ] ); },
        ended: false,
        end() { this.ended = true; },
        ...over,
    } );
    return call;
}

export const devices = () => {
    const track = { stop: vi.fn(), getSettings: () => ( { deviceId: 'cam-1' } ), addEventListener: () => {} };
    // A stream of what was asked for, as the browser gives it: the microphone, the camera, or both.
    const stream = ( asked: MediaStreamConstraints ) => {
        const audio = asked.audio ? [ track ] : [];
        const video = asked.video ? [ track ] : [];
        return { getTracks: () => [ ...audio, ...video ], getAudioTracks: () => audio, getVideoTracks: () => video };
    };
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: {
            getUserMedia: vi.fn( async ( asked: MediaStreamConstraints ) => stream( asked ) ),
            getDisplayMedia: vi.fn(),
            enumerateDevices: vi.fn( async () => [] ),
        },
    } );
    return track;
};
