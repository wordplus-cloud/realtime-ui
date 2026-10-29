import { createContext } from "react";

/**
 * What an app's call screen does beyond the call itself, as Better Messages' admin switches set it for its own (both on
 * there by default too). `mutedHint`: "You are muted" for someone who talks with the microphone off, which keeps a
 * microphone open while muted, measured on the device and never sent, so the browser shows it in use. `devicesOnJoin`:
 * a group call is joined with the camera and the microphone off unless the app names what to turn on, and a prompt over
 * the dock says so with Preview, so the browser asks for nothing until the person presses something.
 */
export interface CallOptions {
    mutedHint: boolean;
    devicesOnJoin: boolean;
}

export const CallOptionsContext = createContext<CallOptions>( { mutedHint: true, devicesOnJoin: true } );
