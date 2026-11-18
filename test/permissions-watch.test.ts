// The devices registry (permissions.ts) reads the permissions and the devices again as they change, so what a call
// offers for a device follows at once: a permission changed in the browser's site settings, a device plugged in or out.
import { afterEach, describe, expect, it, vi } from 'vitest';

const device = ( kind: MediaDeviceKind, deviceId: string ) => ( { kind, deviceId, label: deviceId, groupId: '', toJSON() {} } ) as MediaDeviceInfo;

afterEach( () => {
    vi.resetModules();
    vi.restoreAllMocks();
} );

describe( 'the devices registry', () => {
    it( 'reads a permission again as the user changes it, and the devices as they are plugged in or out', async () => {
        const states: Record<string, PermissionState> = { camera: 'granted', microphone: 'granted' };
        const statuses: Record<string, EventTarget & { state: PermissionState }> = {};
        let devices = [ device( 'audioinput', 'mic-1' ), device( 'videoinput', 'cam-1' ) ];
        const mediaDevices = Object.assign( new EventTarget(), { enumerateDevices: async () => devices } );
        Object.defineProperty( navigator, 'mediaDevices', { configurable: true, value: mediaDevices } );
        Object.defineProperty( navigator, 'permissions', {
            configurable: true,
            value: {
                // A status of its own each query, as the browser hands back.
                query: async ( { name }: { name: string } ) => {
                    const status = Object.assign( new EventTarget(), { state: states[ name ] } );
                    statuses[ name ] ??= status;
                    return status;
                },
            },
        } );

        const registry = await import( '../src/inc/calls/permissions.ts' );
        const settled = () => new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
        await registry.updateMediaPermissions();
        expect( [ registry.deviceUsable( 'microphone' ), registry.deviceUsable( 'camera' ) ] ).toEqual( [ true, true ] );

        // Never asked yet: not offered, as a press would only ask on the call's tab.
        states.camera = 'prompt';
        statuses.camera.state = 'prompt';
        statuses.camera.dispatchEvent( new Event( 'change' ) );
        await settled();
        expect( registry.deviceUsable( 'camera' ) ).toBe( false );
        states.camera = 'granted';
        statuses.camera.state = 'granted';
        statuses.camera.dispatchEvent( new Event( 'change' ) );
        await settled();
        expect( registry.deviceUsable( 'camera' ) ).toBe( true );

        // The microphone refused the site: told by the status the first read got.
        states.microphone = 'denied';
        statuses.microphone.state = 'denied';
        statuses.microphone.dispatchEvent( new Event( 'change' ) );
        await settled();
        expect( registry.mediaAccess.get( 'microphone' ) ).toBe( 'denied' );
        expect( registry.deviceUsable( 'microphone' ) ).toBe( false );

        // The only camera unplugged, then plugged in again.
        devices = [ device( 'audioinput', 'mic-1' ) ];
        mediaDevices.dispatchEvent( new Event( 'devicechange' ) );
        await settled();
        expect( registry.deviceUsable( 'camera' ) ).toBe( false );
        devices = [ device( 'audioinput', 'mic-1' ), device( 'videoinput', 'cam-2' ) ];
        mediaDevices.dispatchEvent( new Event( 'devicechange' ) );
        await settled();
        expect( registry.deviceUsable( 'camera' ) ).toBe( true );
    } );
} );
