// @wordplus/realtime-ui/react: Better Messages' screens for a React app on @wordplus/realtime, under the same names as
// @wordplus/realtime/react, inside its <RealtimeProvider>, or each given the `rt` it shows. Optional, as the whole
// package is: an app that draws its own screens imports none of it.
//
//     import '@wordplus/realtime-ui/calls.css';
//     import '@wordplus/realtime-ui/presence.css';
//     import '@wordplus/realtime-ui/chat.css';
//     import { CallScreen, CallButton, OnlineList, Typing, Chat } from '@wordplus/realtime-ui/react';
//
//     <CallScreen lang="de" />                      // the rings and the call window, once on the page
//     <CallSpot call="match:34:42" className="h-96" /> // that call in the page, in place of the window
//     <CallSpot call="meeting:daily" join="video" />   // that group call, joined as the page opens, camera and microphone off
//     <CallSpot call="meeting:daily" join="video" joinWith="microphone" />   // joined with the microphone on
//     <OnlineList room="shop" actions={ ( m ) => <CallButton to={ m.id } call={ … } name={ m.name } /> } />
//     <Typing room="chat:34:42" />
//     <Chat room="chat:34:42" />                     // the conversation, its history, typing and reactions
//     <Chat room="chat:34:42" to="42" call />        // with them on top, and their calls in it
import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type Context, type CSSProperties, type ReactNode } from "react";
import { CallOptionsContext } from "./sdk/call-options.ts";
import { configureUi, setUiUsers } from "./host.ts";
import { translator, direction } from "./inc/translations.ts";
import { setOwnTooltips } from "./inc/shared-parts.ts";
import { ownTooltips } from "./inc/floater.ts";
import { _x } from "./inc/globals.ts";
import { joinMedia, showingName } from "./sdk/controller.ts";
import { useController, type CallsSource } from "./sdk/use-controller.ts";
import CallsApp, { type CallView } from "./sdk/calls-app.tsx";
import { callUserOf } from "./sdk/types.ts";
import { provideRealtime, useRealtime, type Realtime, type SdkRooms } from "./sdk/rooms.ts";
import { callName } from "./sdk/call-name.ts";
import { MayCall } from "./sdk/may-call.tsx";
import { RoomOnline, type RoomOnlineProps, type RoomPerson } from "./sdk/presence-views.tsx";
import { RowAction } from "./components/presence/online-list.tsx";
import { PiecesProvider, type Pieces } from "./pieces.tsx";

export { PiecesProvider, usePieces } from "./pieces.tsx";
export type {
    Pieces, Drawn, RingCardProps, CallStatusProps, VideoTileProps, SelfViewProps, GridTileProps, OnlineRowProps, MessageProps,
    ComposerProps, ChatMessageView, ChatHeaderProps,
} from "./pieces.tsx";
export { default as CallControl } from "./components/calls/call-control.tsx";
export type { CallControlProps } from "./components/calls/call-control.tsx";
export type { CallView } from "./sdk/calls-app.tsx";

export { RoomTyping as Typing, RoomCount as OnlineCount } from "./sdk/presence-views.tsx";
export type { RoomTypingProps as TypingProps, RoomCountProps as OnlineCountProps, RoomPerson } from "./sdk/presence-views.tsx";
export { Chat, DEFAULT_REACTIONS } from "./sdk/chat.tsx";
export { routeLoader } from "./sdk/route-loader.ts";
export type { ChatProps, ChatLoader, ChatPage, StoredMessage, SentMessage, ChatFile, ChatUploader } from "./sdk/chat.tsx";
export { MessageFiles, StagedFiles, ImageViewer, DropStrip, routeUploader, shownUrl, kindOf as fileKindOf, badgeOf as fileBadgeOf, bytesLabel, UploadError, useStagedFiles, useFileDrop } from "./sdk/chat-files.tsx";
export type { FileKind, StagedFile, ViewedImage, MessageFilesProps, StagedFilesProps, ImageViewerProps, StagedFilesOptions, StagedFilesState, FileDrop } from "./sdk/chat-files.tsx";
// The engines under the views, which an app's own copy of a view runs on (`npx @wordplus/realtime-ui add`).
export { useChat, grouped as groupedByDay, filesOf } from "./sdk/use-chat.ts";
export type { UseChatOptions, ChatState, ChatMessage, ChatPerson, ChatEvents } from "./sdk/use-chat.ts";
export { useChatCall, useChatPeer, useStartCall } from "./sdk/chat-call.tsx";
export type { ChatCall, ChatPeer } from "./sdk/chat-call.tsx";
export { useRealtime, useRoom, usePresence, useOnline, useProfiles, useTyping, personOf, roomName } from "./sdk/rooms.ts";
export type { Realtime, SdkRooms, SdkRoom, RoomMember, RoomView, RoomHook, RoomHandlers, RoomOptions, OnlineState, SdkEventMeta, SdkHistoryEvent, SdkProfile } from "./sdk/rooms.ts";
export { configureUi } from "./host.ts";

export type { CallsSource };

// <RealtimeProvider> of @wordplus/realtime/react gives the page's connection through this context, which that package
// makes under the same global name: this one imports nothing of that one, so an app that draws everything itself carries
// none of this. In this entry alone, never in the elements' script, whose React is its own copy.
const REALTIME_CONTEXT = Symbol.for( "wordplus.realtime.react-context" );
const shared = globalThis as unknown as Record<symbol, Context<Realtime | null> | undefined>;
const RealtimeContext = ( shared[ REALTIME_CONTEXT ] ??= createContext<Realtime | null>( null ) );

provideRealtime( () => useContext( RealtimeContext ) );

export interface CallScreenProps {
    /** The page's connection: <RealtimeProvider>'s when left out. */
    rt?: CallsSource | null;
    /** The page's language, two letters: the screens' own translations (de es fr it nl pl hr he). The page's by default. */
    lang?: string;
    /** The app's own translations, by the English text, over the package's. */
    strings?: Record<string, string | string[]>;
    /** Offer Add Person, where the app lists whom a user may add (the server's `calls()` with `people`). */
    add?: boolean;
    /** The app's own pieces in place of ours: the ring card, a tile, the controls … (pieces.tsx). */
    components?: Pieces;
    /**
     * The app's own call view in place of ours, its copy of it (`npx @wordplus/realtime-ui add call-screen`), drawn on
     * the same calls: `view={ CallView }`.
     */
    view?: CallView;
    /**
     * "You are muted" for someone who talks with the microphone off. It keeps a microphone open while muted, never
     * sent, so the browser shows it in use. On unless `false`.
     */
    mutedHint?: boolean;
    /**
     * A group call joined with the camera and the microphone off, unless the app names what to turn on, and a prompt
     * over the dock that says so and that the dock turns them on, with Preview: the device settings with a picture of
     * the camera and the microphone's level, only the person's, asked of the browser once. The browser asks for nothing
     * until the person presses something. On unless `false`: then a group call starts with the microphone and, on a
     * video call, the camera.
     */
    devicesOnJoin?: boolean;
    /**
     * Where the app serves the call effects, this package's dist/effects (`/realtime/effects/`): the device settings
     * then offer a blurred or replaced background, loaded from there once someone turns one on.
     */
    effects?: string;
    /**
     * Where the app serves AI Noise Removal, this package's dist/noise (`/realtime/noise/`): the device settings then
     * offer it, loaded from there once someone turns it on.
     */
    noise?: string;
    /**
     * AI Noise Removal before a person chooses: `off` (the default), or `auto`, which turns it on where the device can run
     * it, with a notice that says so and offers Turn Off (UiHost.noiseDefault). It needs `noise` too.
     */
    noiseDefault?: "off" | "auto";
}

/** The rings and the call window, Better Messages' call screens, on the page's calls. Once on the page, in its layout. */
export function CallScreen( { rt, lang, strings, add, components, view, mutedHint = true, devicesOnJoin = true, effects, noise, noiseDefault }: CallScreenProps ) {
    const controller = useController( useRealtime( rt ), add );
    const language = lang ?? ( typeof document !== "undefined" ? document.documentElement.lang || "en" : "en" );
    const options = useMemo( () => ( { mutedHint, devicesOnJoin } ), [ mutedHint, devicesOnJoin ] );

    // Before the first screen draws, and again when the language changes. The controls' tooltips from the WordPlus
    // SDK's floater where the page has it, else the package's own.
    useState( () => {
        configureUi( translator( language, strings ) );
        if ( effects !== undefined ) configureUi( { effectsUrl: () => effects } );
        if ( noise !== undefined ) configureUi( { noiseUrl: () => noise } );
        if ( noiseDefault !== undefined ) configureUi( { noiseDefault: () => noiseDefault === "auto" ? "auto" : "off" } );
        setOwnTooltips( ownTooltips() );
    } );
    useEffect( () => configureUi( translator( language, strings ) ), [ language, strings ] );

    if ( ! controller ) return null;
    // Its rings and window are fixed over the page, so it takes no place in the app's layout, a grid's cell included
    // (an SDK review, 2026-10-15), while its look still reaches them through the wrapper.
    return <div className="realtime-calls" dir={ direction( language ) } style={ { display: "contents" } }>
        <CallOptionsContext.Provider value={ options }>
            <PiecesProvider pieces={ components }><CallsApp controller={ controller } view={ view } /></PiecesProvider>
        </CallOptionsContext.Provider>
    </div>;
}

export interface CallSpotProps {
    /** The page's connection: <RealtimeProvider>'s when left out. */
    rt?: CallsSource | null;
    /**
     * Which calls show here: a call's name (`match:34:42`), a pattern as the server's rules write them
     * (`match:{a}:{b}`), or every call when left out. A group call by its name (`meeting:daily`).
     */
    call?: string;
    /**
     * Joins the group call `call` names as the spot comes onto the page, as its GroupCallButton would: `video` or
     * `audio`. Once: someone who leaves it isn't brought back while the spot stays, and one already in a call stays there.
     * With the camera and the microphone off, turned on from the call's controls, unless `joinWith` names them.
     */
    join?: "audio" | "video";
    /** What `join` turns on as it joins: `microphone`, `camera`, or both (`microphone camera`). Nothing when left out. */
    joinWith?: "microphone" | "camera" | "microphone camera" | "camera microphone";
    /** With `join`, your own route, which decides who joins: it gets `?call=meeting:7&type=video` and answers `{ token }`. */
    tokenUrl?: string;
    className?: string;
    style?: CSSProperties;
    /** What the spot shows while no call is in it. With none, the spot is hidden until a call comes. */
    children?: ReactNode;
}

const noCalls = () => () => {};
const noView = () => null;

/**
 * A place in the page for a call: the calls `call` names show here, in place of the CallScreen's window in the corner.
 * A call moves in when it starts, or once the spot is on the page, the page scrolling to it where it is off the screen,
 * and back to the window when the spot goes, going on throughout, its camera and microphone as they were. `data-call` holds the call's name while one is here, for the
 * page's CSS. The CallScreen on the page still rings for it and runs it: the spot only says where it shows.
 */
export function CallSpot( { rt, call, tokenUrl, join, joinWith, className, style, children }: CallSpotProps ) {
    const controller = useController( useRealtime( rt ) );
    const place = useRef<HTMLDivElement>( null );

    useLayoutEffect( () => {
        if ( ! controller || ! place.current ) return;
        return controller.spot( call ?? null, place.current );
    }, [ controller, call ] );

    // A group call by its name only: a pattern names no one call to join.
    useEffect( () => {
        if ( ! controller || ! join || ! call || call.includes( "{" ) ) return;
        void controller.join( call, join, call, joinMedia( joinWith ), tokenUrl );
    }, [ controller, call, tokenUrl, join, joinWith ] );

    const view = useSyncExternalStore( controller?.subscribe ?? noCalls, controller?.snapshot ?? noView, noView );
    const here = view !== null && view.spot !== null && view.spot === place.current;

    return <div ref={ place } className={ className ? "realtime-call-spot " + className : "realtime-call-spot" } style={ style }
                data-call={ here ? showingName( view.showing ) ?? undefined : undefined } hidden={ ! here && children == null }>
        { here ? null : children }
    </div>;
}

/** The look a call button has unless the app gives its own: as the elements' buttons, which an app's CSS reset leaves. */
const BUTTON_CLASS = "realtime-call-button";

export interface CallButtonProps {
    /** The page's connection: <RealtimeProvider>'s when left out. */
    rt?: ( CallsSource & { user?: string | null } ) | null;
    /** Whom to call: their id, a number or the app's own id of text. */
    to: number | string;
    /**
     * The call's name, as the app's server's calls() rule allows it (`support:34:42`), or a template as
     * `<call-button>` takes it: `{pair}` the page's user and `to` in order, `{me}`, `{id}`.
     */
    call?: string;
    /** Your own route, which decides whether they may be called: it gets `?to=34&type=video` and answers `{ token }`. */
    tokenUrl?: string;
    type?: "audio" | "video";
    /** The other person's name and picture, for the call window. */
    name?: string;
    avatar?: string;
    className?: string;
    children?: ReactNode;
}

/** A button that calls `to` about `call`, on the CallScreen's window. `className` adds to its own look. */
export function CallButton( { rt, to, call, tokenUrl, type = "video", name = "", avatar, className, children }: CallButtonProps ) {
    const source = useRealtime( rt );
    const controller = useController( source );
    return (
        <button type="button" className={ className ? BUTTON_CLASS + " " + className : BUTTON_CLASS } disabled={ ! controller }
                onClick={ () => void ( tokenUrl
                    ? controller?.placeWithToken( tokenUrl, to, type, { name, avatar } )
                    : controller?.place( callName( call ?? "", source?.user ?? null, String( to ) ), to, type, { name, avatar } ) ) }>
            { children }
        </button>
    );
}

export interface GroupCallButtonProps {
    /** The page's connection: <RealtimeProvider>'s when left out. */
    rt?: CallsSource | null;
    /** The group call's name, as the app's server's groupCalls() rule allows it (`meeting:daily`). */
    call?: string;
    /** Your own route, which decides who joins: it gets `?call=meeting:7&type=video` and answers `{ token }`. */
    tokenUrl?: string;
    /** @deprecated The same as `call`. */
    room?: string;
    type?: "audio" | "video";
    title?: string;
    className?: string;
    children?: ReactNode;
}

/** A button that joins the group call `call`, on the CallScreen's window. `className` adds to its own look. */
export function GroupCallButton( { rt, call, tokenUrl, room, type = "video", title, className, children }: GroupCallButtonProps ) {
    const controller = useController( useRealtime( rt ) );
    const name = call ?? room ?? "";
    return (
        <button type="button" className={ className ? BUTTON_CLASS + " " + className : BUTTON_CLASS } disabled={ ! controller || name === "" }
                onClick={ () => void controller?.join( name, type, title ?? name, undefined, tokenUrl ) }>
            { children }
        </button>
    );
}

export interface OnlineListProps extends Omit<RoomOnlineProps, "rt"> {
    /** The page's connection: <RealtimeProvider>'s when left out. */
    rt?: ( SdkRooms & Partial<CallsSource> ) | null;
    /**
     * A call button for each of the others, as `<online-list call>` has them: the call's name, `{pair}` filled in
     * with the page's user and the other, in order (`support:{pair}`). `actions`, when given, is drawn instead.
     */
    call?: string;
    /** A call button for each of the others that asks your own route, as CallButton's `tokenUrl` does. */
    tokenUrl?: string;
    /** Which call buttons: `video` (the default), `audio`, or `audio video`. */
    type?: "audio" | "video" | "audio video";
}

/** Who is in a presence room now, each with their picture, their name, their role, and the call buttons `call` asks for. */
export function OnlineList( { call, tokenUrl, type = "video", actions, rt: given, ...props }: OnlineListProps ) {
    const rt = useRealtime<SdkRooms & Partial<CallsSource>>( given );
    const controller = useController( ( call || tokenUrl ) && rt?.calls ? ( rt as CallsSource ) : null );
    const types = type.split( /\s+/ ).filter( ( t ): t is "audio" | "video" => t === "audio" || t === "video" );
    const buttons = ( member: RoomPerson, starts: ( kind: "audio" | "video", peer: { name: string; avatar?: string } ) => void ) => types.map( ( kind ) => (
        <RowAction key={ kind }
                   icon={ kind === "audio" ? "phone" : "video" }
                   label={ kind === "audio" ? _x( "Audio Call", "Users List", "bp-better-messages" ) : _x( "Video Call", "Users List", "bp-better-messages" ) }
                   onClick={ () => {
                       const peer = { name: member.name, avatar: member.avatar };
                       setUiUsers( [ [ member.id, peer ] ] );
                       starts( kind, peer );
                   } } />
    ) );
    // Each row's buttons: asking the app's route as each is pressed, or once the app's rules let the page's user call that
    // member (MayCall, may-call.tsx).
    const calls = ( call || tokenUrl ) && controller && rt
        ? ( member: RoomPerson ) => {
            const to = callUserOf( member.id );
            if ( to === null ) return null;
            if ( tokenUrl ) return <>{ buttons( member, ( kind, peer ) => void controller.placeWithToken( tokenUrl, to, kind, peer ) ) }</>;
            const name = callName( call!, rt.user, member.id );
            return <MayCall calls={ controller.calls } call={ name } to={ to }>{ buttons( member, ( kind, peer ) => void controller.place( name, to, kind, peer ) ) }</MayCall>;
        }
        : undefined;
    // On its own, filling the place the app gives it, as <online-list> does (presence.css, .realtime-online).
    return <div className="realtime-online"><RoomOnline { ...props } rt={ rt } actions={ actions ?? calls } /></div>;
}
