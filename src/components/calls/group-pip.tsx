import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { host } from "../../host.ts";
import UserAvatar from "../users/user-avatar.tsx";
import UserName from "../users/user-name.tsx";
import { type CallContextInterface, type CallParticipant, type CallTrack } from "./context.ts";
import { type CallKeysValue } from "./call-keys.tsx";
import { userIdOf } from "./moderation-panels.tsx";
import { pipFocus, type PipFocus } from "../../inc/calls/pip-focus.ts";
import { PipCanvas, type PipScene } from "../../inc/calls/pip-canvas.ts";
import { publicationRatio } from "../../inc/calls/ratio.ts";
import { isMobile } from "../../inc/functions/browser-info.ts";
import { useDeviceUsable } from "../../inc/calls/permissions.ts";
import { plainName } from "../../inc/names.ts";
import { spotlitKeys } from "./spotlight.tsx";
import type { CallLayout } from "./call-screen.tsx";

/** The dock's Picture in Picture (call-view.tsx, fullScreenItems): whether the window is open, and the press. */
export interface PipControl {
    open: boolean;
    toggle: () => void;
}

// The browser's own picture-in-picture of a video, of a canvas drawn here (pip-canvas.ts): not on a phone, which has
// none for a page.
const canvasPip = (): boolean =>
    typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && ! isMobile()
    && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';

/** Whether someone else in the call shares a screen: all an audio call's window would show. */
export function screenShared( participants: ReadonlyMap<string, CallParticipant> ): boolean {
    for ( const [ key, participant ] of participants ) {
        if ( key !== 'me' && ( participant.screen || participant.screenPublished ) ) return true;
    }
    return false;
}

// What lights the window's own buttons (Chrome's and Edge's, Media Session): not in every browser's types. WebKit's
// setMicrophoneActive and setCameraActive answer with a promise (see sessionLightsButtons).
interface CallSession {
    setActionHandler( action: string, handler: ( () => void ) | null ): void;
    setMicrophoneActive?( active: boolean ): void | Promise<void>;
    setCameraActive?( active: boolean ): void | Promise<void>;
}

const mediaSession = (): CallSession | undefined =>
    typeof navigator === 'undefined' ? undefined : ( navigator as Navigator & { mediaSession?: CallSession } ).mediaSession;

/**
 * Whether telling the browser the call's microphone and camera (setMicrophoneActive, setCameraActive) only lights the
 * buttons it draws in the window: Chromium's (Chrome, Edge, Opera, the browsers with navigator.userAgentData). WebKit's
 * turn the page's capture itself off and on. false mutes the microphone or the camera the page has, and true is refused
 * outside a user gesture ("Activating capture must be called from a user gesture handler."), so a press in a call never
 * gets it back. Safari's window draws no buttons, and the call told it the camera was off the moment the site was
 * allowed one, while the camera the press asked for was still starting: it started muted, and the true that followed
 * came after the browser's prompt had used up the press and was refused. The camera stayed on in the call with nothing
 * drawn or sent until it was turned off and on again (asked on 2026-11-02, in Safari: "after I agree to
 * enable camera it does not enabled from first time and I need to disable and enable it to make it work"). The
 * microphone the same way, and the muted hint's own microphone was muted too whenever it was open as the call said its
 * microphone was off. Safari still has the actions: its address bar's indicators call togglemicrophone and togglecamera.
 */
export function sessionLightsButtons(): boolean {
    return typeof navigator !== 'undefined' && 'userAgentData' in navigator;
}

// A browser's answer to setMicrophoneActive or setCameraActive: a refusal is nothing to report.
const quietly = ( told: void | Promise<void> | undefined ) => {
    if ( told && typeof ( told as Promise<void> ).then === 'function' ) ( told as Promise<void> ).then( undefined, () => {} );
};

/**
 * The window's Mute and Camera as the browser can draw them (Media Session): a button on (true), crossed out (false),
 * or none (null). The browser has no look for a button that can't be pressed, and a press in the window can't show why
 * it did nothing, as the dock's does on the page the user is away from: so a microphone a moderator holds, a device the
 * site was never allowed (its prompt would stand on the call's tab) or was refused or has none of, and someone who only
 * watches, have no button, nor a camera in an audio call (`video` false). A device allowed from the call itself brings
 * its button, as the call has it. The microphone and camera turned on stay pressable to turn off whatever the browser
 * says of the device.
 */
export function pipButtons( call: Pick<CallContextInterface, 'canPublish' | 'myMicMuted' | 'myMicrophoneTrack' | 'myCameraTrack'>, micUsable: boolean, cameraUsable: boolean, video = true ): { mic: boolean | null, camera: boolean | null } {
    if ( ! call.canPublish ) return { mic: null, camera: null };
    const micOn = !! call.myMicrophoneTrack, cameraOn = !! call.myCameraTrack;
    return {
        mic: call.myMicMuted ? null : micOn || micUsable ? micOn : null,
        camera: video && ( cameraOn || cameraUsable ) ? cameraOn : null,
    };
}

/** `action`'s handler with the browser while `on`, pressing whatever `press` is at the press. */
function useSessionAction( action: string, on: boolean, press: () => void ) {
    const pressRef = useRef( press );
    pressRef.current = press;
    useEffect( () => {
        const session = mediaSession();
        if ( ! on || ! session ) return;
        try {
            session.setActionHandler( action, () => pressRef.current() );
        } catch {
            return;
        }
        return () => {
            try {
                session.setActionHandler( action, null );
            } catch {}
        };
    }, [ on ] );
}

/**
 * A group call in a small window over every other, while the user is in another tab or app: the browser's own window
 * of a video (Chrome, Edge and Safari), which plays a canvas of whom the call is about (pip-canvas.ts; pipFocus: the
 * spotlight or a pin, a shared screen, the speaker). It has the shape of their camera or screen, keeps it as the user
 * resizes it and takes a new one with the picture, so the picture fills it, nothing cut. Its Mute, Camera and Leave are
 * the browser's buttons in it (Media Session), where the browser draws them (Chrome and Edge).
 *
 * A video call has it all through. An audio call has it only while someone else shares a screen, which is all it would
 * show, with Mute and Leave, and the window closes as the last share stops. It opens from the dock, and by itself as the
 * user leaves the tab where the call allows it, follows the call (a new speaker, a screen shared or stopped) and closes
 * as the call ends.
 */
export function useGroupPip( call: CallContextInterface, layout: CallLayout | null, keys: CallKeysValue, pinned: ReadonlySet<string> ): { control: PipControl | null, view: ReactNode } {
    const video = layout === 'group-video';
    const live = ( video || layout === 'group-audio' ) && call.connectionState === 'connected';
    const on = live && canvasPip() && ( video || screenShared( call.participants ) );

    // Who spoke last: the window stays on them through a silence, and comes back to them after a screen. The spotlight
    // for everyone first, then the user's own pins, as the grid has them (spotlight.tsx).
    const last = useRef<string | null>( null );
    const first = on ? [ ...spotlitKeys( call.participants, call.spotlight ), ...pinned ] : [];
    const focus = on ? pipFocus( call.participants, { last: last.current, first } ) : null;
    if ( focus?.participant.isSpeaking ) last.current = focus.key;

    // The canvas the window plays, made as the window can be had and let go as it can't (the call ends, an audio
    // call's last share stops), and the page's video that plays it, which the browser's window is of.
    const [ source, setSource ] = useState<HTMLVideoElement | null>( null );
    const [ drawer, setDrawer ] = useState<PipCanvas | null>( null );
    const [ videoOpen, setVideoOpen ] = useState( false );
    useEffect( () => {
        if ( ! on ) return;
        const made = new PipCanvas( () => host().accentColor() );
        setDrawer( made );
        return () => {
            made.release();
            setDrawer( ( shown ) => shown === made ? null : shown );
        };
    }, [ on ] );

    // Whom it shows, by name and face as their tile has them (read off the hidden copies in the view): every render,
    // as who speaks and whose microphone is on change all through a call.
    const label = useRef<HTMLSpanElement | null>( null );
    const micOn = !! call.myMicrophoneTrack;
    useEffect( () => {
        drawer?.show( focus ? sceneOf( focus, label.current, micOn ) : null );
    } );

    // The window closes with the video it is of: as the call ends, or an audio call's last share stops, the page needs
    // no press to close it.
    useEffect( () => {
        if ( ! source || ! drawer ) return;
        source.srcObject = drawer.stream;
        drawer.paint();
        // The browser's window, as wide as it is now: the canvas draws the name and the ring at their size in it.
        const enter = ( event: Event ) => {
            setVideoOpen( true );
            drawer.start( ( event as Event & { pictureInPictureWindow?: { readonly width: number } } ).pictureInPictureWindow ?? null );
        };
        const leave = () => {
            setVideoOpen( false );
            drawer.pause();
        };
        source.addEventListener( 'enterpictureinpicture', enter );
        source.addEventListener( 'leavepictureinpicture', leave );
        return () => {
            source.removeEventListener( 'enterpictureinpicture', enter );
            source.removeEventListener( 'leavepictureinpicture', leave );
            if ( document.pictureInPictureElement === source ) void document.exitPictureInPicture().catch( () => {} );
            setVideoOpen( false );
            drawer.pause();
            if ( source.srcObject === drawer.stream ) source.srcObject = null;
        };
    }, [ source, drawer ] );

    // The frame it opens on is the call as it is now, at its shape.
    const openVideo = () => {
        if ( ! source || ! drawer ) return;
        drawer.paint();
        void source.requestPictureInPicture().catch( () => {} );
    };
    const openRef = useRef( openVideo );
    openRef.current = openVideo;

    // By itself as the tab is left, where the call allows it (autoPictureInPicture, off unless given) and the browser lets
    // a call do that (Chrome's automatic picture-in-picture for a page that uses the camera or the microphone): the
    // browser asks for it, the user can turn it off there. An audio call's only while a screen is shared.
    const auto = !! call.autoPictureInPicture;
    useEffect( () => {
        const session = mediaSession();
        if ( ! on || ! auto || ! session ) return;
        const action = 'enterpictureinpicture';
        try {
            session.setActionHandler( action, () => openRef.current() );
        } catch {
            return;
        }
        return () => {
            try {
                session.setActionHandler( action, null );
            } catch {}
        };
    }, [ on, auto ] );

    // The window's own Mute, Camera and Leave, where the browser draws them (pipButtons): pressed as the dock's are,
    // else the call's own, crossed out while off, and gone while a press could do nothing the user would see.
    const callRef = useRef( call );
    callRef.current = call;
    const keysRef = useRef( keys );
    keysRef.current = keys;
    const press = ( shortcut: 'mic' | 'camera' | 'leave', otherwise: ( now: CallContextInterface ) => unknown ) => () => {
        const action = keysRef.current.actions.current[ shortcut ];
        void ( action ? action.run() : otherwise( callRef.current ) );
    };
    const micUsable = useDeviceUsable( 'microphone' );
    const cameraUsable = useDeviceUsable( 'camera' );
    const buttons = pipButtons( call, micUsable, cameraUsable, video );
    useSessionAction( 'togglemicrophone', on && buttons.mic !== null, press( 'mic', ( now ) => now.myMicrophoneTrack ? now.disableMic() : now.enableMic() ) );
    useSessionAction( 'togglecamera', on && buttons.camera !== null, press( 'camera', ( now ) => now.myCameraTrack ? now.disableCamera() : now.enableCamera() ) );
    useSessionAction( 'hangup', on, press( 'leave', ( now ) => now.endCall() ) );
    // Lit as the call has them, said again whenever a button comes back: the browser keeps the last word. Only where
    // that lights buttons and nothing more (sessionLightsButtons): in Safari it would mute the devices themselves.
    useEffect( () => {
        const session = mediaSession();
        if ( ! on || ! session || ! sessionLightsButtons() ) return;
        try {
            if ( buttons.mic !== null ) quietly( session.setMicrophoneActive?.( buttons.mic ) );
            if ( buttons.camera !== null ) quietly( session.setCameraActive?.( buttons.camera ) );
        } catch {}
    }, [ on, buttons.mic, buttons.camera ] );

    // Whom the window shows, told as a screen of its own (the context's showTiles), as a big call receives only the
    // pictures a screen draws: while the window is open. None as it closes and as the call ends.
    const showTiles = useRef( call.showTiles );
    showTiles.current = call.showTiles;
    const showing = focus && videoOpen ? focus.key : '';
    useEffect( () => {
        showTiles.current?.( 'pip', showing ? [ showing ] : [] );
    }, [ showing ] );
    useEffect( () => () => showTiles.current?.( 'pip', [] ), [] );

    const control: PipControl | null = on && drawer ? {
        open: videoOpen,
        toggle: () => {
            if ( document.pictureInPictureElement === source ) void document.exitPictureInPicture().catch( () => {} );
            else openVideo();
        },
    } : null;

    const view = on && <>
        <video ref={ setSource } className="wplus-pip-source" autoPlay playsInline muted aria-hidden="true" />
        { focus &&
            <span ref={ label } className="wplus-pip-source-label" hidden aria-hidden="true">
                <span className="wplus-pip-source-name"><UserName user_id={ userIdOf( focus.key ) } /></span>
                <span className="wplus-pip-source-face"><UserAvatar user_id={ userIdOf( focus.key ) } link={ false } size={ 72 } presence={ false } /></span>
            </span> }
    </>;

    return { control, view };
}

/** What the window draws of `focus`: their picture, its shape while it is on its way, their name and face. */
function sceneOf( focus: PipFocus, label: HTMLElement | null, micOn: boolean ): PipScene {
    const who = focus.participant;
    const face = label?.querySelector<HTMLImageElement>( '.wplus-pip-source-face img' );
    return {
        key: focus.key,
        source: focus.source,
        track: trackOf( focus ),
        ratio: focus.source === 'screen' ? publicationRatio( who.screenPub ) : focus.source === 'camera' ? publicationRatio( who.videoPub ) : null,
        name: label?.querySelector( '.wplus-pip-source-name' )?.textContent?.trim() || plainName( who.name ),
        avatar: face?.src || who.avatar || '',
        muted: focus.key === 'me' ? ! micOn : ( ! who.audio || who.micMuted ),
        speaking: who.isSpeaking,
    };
}

const trackOf = ( focus: PipFocus ): CallTrack | null =>
    ( focus.source === 'screen' ? focus.participant.screen : focus.source === 'camera' ? focus.participant.video : null ) ?? null;
