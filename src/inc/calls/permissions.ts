import {isMobile} from "../functions/browser-info.ts";
import {useEffect, useState } from "react";

// Read once the module loads, in a browser. Rendered on a server (a Next.js page's first render), there is no device
// to share or show in picture in picture, and the call screens draw nothing until a call is up in the browser.
const inBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
export const screenShareSupport : boolean = inBrowser && !! navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices
export const pictureInPictureSupport : boolean = inBrowser && ! isMobile() && 'pictureInPictureEnabled' in document

export const mediaAccess : Map<string, string> = new Map([
    ['microphone', 'unknown'],
    ['camera', 'unknown']
]);

const media = inBrowser ? navigator.mediaDevices : undefined;

let monitorStarted = false;

// A device plugged in or out is read again at once. The check was `media.ondevicechange`, null until something sets
// it, so the list was read again only when something else asked.
function startChangeMonitor(){
    if( ! monitorStarted && media && typeof media.addEventListener === 'function' ) {
        monitorStarted = true;
        media.addEventListener( 'devicechange', () => {
            void updateMediaPermissions();
        } );
    }
}

// A permission the user changes in the browser (the site's settings in the address bar) is read again at once too: what
// a call offers for the device changes with it. Watched once a name, as each query hands back a status of its own, and
// the status kept, as one nothing holds can be collected with its listener.
const watchedPermissions = new Map<string, PermissionStatus>();

function watchPermission( name: string, status: PermissionStatus ){
    if( watchedPermissions.has( name ) || typeof status.addEventListener !== 'function' ) return;
    watchedPermissions.set( name, status );
    status.addEventListener( 'change', () => {
        void updateMediaPermissions();
    } );
}

/**
 * Who hears that the devices or their permissions changed: `subscribe( { next } )`, or a function, and the subscription
 * back with its `unsubscribe()`, as rxjs' Subject took them, which this was until the call screens ran in Live Support's
 * visitor panel, whose call script would have carried rxjs and tslib for this alone.
 */
export class MediaUpdates {
    private readonly listeners = new Set<() => void>();

    subscribe( observer: { next: () => void } | ( () => void ) ): { unsubscribe(): void } {
        const listener = typeof observer === 'function' ? observer : () => observer.next();
        this.listeners.add( listener );
        return { unsubscribe: () => void this.listeners.delete( listener ) };
    }

    next(): void {
        for ( const listener of [ ...this.listeners ] ) listener();
    }
}

export const mediaUpdatedSubject = new MediaUpdates();

export const cameras : Map<string, MediaDeviceInfo> = new Map();

export const microphones : Map<string, MediaDeviceInfo> = new Map();
export const speakers : Map<string, MediaDeviceInfo> = new Map();

// Whether the device settings are offered: wherever the browser can open a camera or a microphone at all. Not only once
// a device is listed: until the site is allowed them the browser lists its devices without ids, which the lists skip,
// and the settings, gone from the dock then, were the one place to say the camera needs allowing (asked on 2026-11-01:
// "when access is not allowed yet the configuration icon is completely hidden from bar, thats wrong approach"). Read
// each time, as a page can be handed its mediaDevices after this module loads.
function configAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

// What the registry holds, kept up to date in a component. Read again as it starts listening: the read this module
// starts when it loads can land between the first draw and the subscription, and nothing said so again. A copy each
// time, as the lists change in place and React draws nothing for the same Map handed back.
function useRegistry<T>( read: () => T ): T {
    const [ value, setValue ] = useState<T>( read );

    useEffect( () => {
        const update = () => setValue( read() );
        const sub = mediaUpdatedSubject.subscribe( { next: update } );
        update();

        return () => {
            sub.unsubscribe();
        }
    }, [] );

    return value;
}

export function useCameras(){
    return useRegistry( () => new Map( cameras ) );
}

export function useMicrophones(){
    return useRegistry( () => new Map( microphones ) );
}

export function useSpeakers(){
    return useRegistry( () => new Map( speakers ) );
}

export function useConfigAvailable(){
    return useRegistry( configAvailable );
}

/**
 * Where the browser stands on the site using a device, as it last said: `allowed` (mediaPreauthorized), `blocked` (the
 * user or the browser refused it), or `ask`, never allowed yet, where opening it puts the browser's prompt up.
 */
export type DeviceAccess = 'allowed' | 'ask' | 'blocked';

export function deviceAccess( kind: 'camera' | 'microphone' ): DeviceAccess {
    if( mediaAccess.get( kind ) === 'denied' ) return 'blocked';
    return mediaPreauthorized( kind ) ? 'allowed' : 'ask';
}

/** deviceAccess, kept up to date as the permission changes. */
export function useDeviceAccess( kind: 'camera' | 'microphone' ): DeviceAccess {
    return useRegistry( () => deviceAccess( kind ) );
}

/**
 * Whether the browser would give the page this device now, without asking: the site allowed it (mediaPreauthorized,
 * which reads a browser that doesn't say, Safari, by its devices' labels), and there is one. Not where the user refused
 * it, nor where it was never asked for: the browser's prompt stands on the call's tab, which may be out of sight.
 */
export function deviceUsable( kind: 'camera' | 'microphone' ): boolean {
    return mediaPreauthorized( kind ) && ( kind === 'camera' ? cameras : microphones ).size > 0;
}

/** deviceUsable, kept up to date as devices come and go and as the permission changes. */
export function useDeviceUsable( kind: 'camera' | 'microphone' ): boolean {
    return useRegistry( () => deviceUsable( kind ) );
}

// Whether opening this device will put a permission prompt on the screen.
//
// A prompt belongs to the browser and the page cannot take it back down: it
// stands until somebody answers it. A call rings for thirty seconds, so a
// ring that opens a camera nobody has allowed yet leaves its prompt behind
// when the call is missed — still sitting there minutes later, offering a
// camera to a call that is long over. The ring therefore only opens what has
// already been allowed; anything that would ask waits until Answer is
// pressed, where the prompt is something the person just asked for.
export function mediaPreauthorized( kind: 'camera' | 'microphone' ): boolean {
    const state = mediaAccess.get( kind );

    if( state === 'granted' ) return true;
    if( state === 'denied' || state === 'prompt' ) return false;

    // Safari answers nothing at all when asked about these two, and reports
    // 'unknown' here. A device only carries a label once this origin has been
    // allowed to see it, so a labelled one is a permission already given.
    const devices = kind === 'camera' ? cameras : microphones;

    for( const device of devices.values() ){
        if( !! device.label ) return true;
    }

    return false;
}

export async function updateMediaPermissions() {
    try {
        //const supported = media.getSupportedConstraints()

        if (typeof media !== 'object' || typeof media.enumerateDevices !== 'function') {
            mediaAccess.set('camera', 'unknown');
            mediaAccess.set('microphone', 'unknown');
            mediaUpdatedSubject.next();
            return;
        }

        const [cameraState, microphoneState, devices] = await Promise.all([
            getPermissionState("camera"),
            getPermissionState("microphone"),
            media.enumerateDevices()
        ]);

        mediaAccess.set('camera', cameraState);
        mediaAccess.set('microphone', microphoneState);

        cameras.clear();
        microphones.clear();
        speakers.clear();

        devices.forEach((device) => {
            if (!!device.deviceId) {
                switch (device.kind) {
                    case "videoinput":
                        cameras.set(device.deviceId, device);
                        break;
                    case "audioinput":
                        microphones.set(device.deviceId, device);
                        break;
                    case "audiooutput":
                        speakers.set(device.deviceId, device);
                        break;
                }
            }
        });

        mediaUpdatedSubject.next();
    } finally {
        startChangeMonitor()
    }
}

updateMediaPermissions();

async function getPermissionState( name : string ) : Promise<string> {
    return new Promise(async function(resolve, reject) {
        try {
            navigator.permissions.query({
                name: name as PermissionName
            }).then((res) => {
                watchPermission( name, res );
                resolve(res.state);
            }).catch((err) => {
                resolve('unknown');
            });
        } catch (e){
            resolve('unknown');
        }
    });
}
