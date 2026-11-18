/**
 * What a page sends in a call from the browser's own devices: `setCamera( true )` opens the camera at the size calls send
 * (room-publish.ts), hands its track to the call and stops it when turned off, so a page needs no getUserMedia of its own.
 * A track the page opened itself goes through `setTrack()` and stays the page's.
 */
import { type CallSettings } from '../calls/room-publish.js';
import type { MediaSource } from './media.js';
/** A device of the browser: its id for `{ deviceId }`, and its name, empty until the browser gave this site a device. */
export interface DeviceChoice {
    id: string;
    label: string;
}
/** The devices the browser has. */
export interface DeviceLists {
    cameras: DeviceChoice[];
    microphones: DeviceChoice[];
    speakers: DeviceChoice[];
}
/** Which device to open: the one last chosen, or the browser's own choice, unless named. */
export interface DeviceOptions {
    deviceId?: string;
}
/** The cameras, microphones and speakers this browser has. */
export declare function listDevices(): Promise<DeviceLists>;
type Send = (source: MediaSource, track: MediaStreamTrack | null) => void | Promise<void>;
type Settings = () => CallSettings | null | undefined;
/** The devices a call has open for its page. One at a time for each source, in the order asked, so on then off ends off. */
export declare class LocalDevices {
    private send;
    private settings;
    private readonly open;
    private readonly chosen;
    private queue;
    private over;
    constructor(send: Send, settings: Settings);
    setCamera(on: boolean, options?: DeviceOptions): Promise<void>;
    setMicrophone(on: boolean, options?: DeviceOptions): Promise<void>;
    /** Shares a screen, or stops: whether one is shared now. A person who picks nothing in the browser's dialog is no error. */
    setScreenShare(on: boolean): Promise<boolean>;
    /** A track came through `setTrack()`: a device this opened for that source is no longer sent, so it closes. */
    replaced(source: MediaSource, track: MediaStreamTrack | null): void;
    /** Sent on through someone else from here on: a call that became a group call goes on with the same devices. */
    handTo(send: Send, settings: Settings): void;
    /** Closes what is open, the call going on: a listener sends nothing, so their camera's light goes off too. */
    release(): void;
    /** The call is over: what is open closes, and what is still opening closes as it opens. */
    stop(): void;
    private inTurn;
    private turnOn;
    private turnOff;
    /** The camera at the size calls send, facing the user unless a device is named: asked for no size, Chrome opens 640x480. */
    private cameraAsked;
    private microphoneAsked;
}
export {};
