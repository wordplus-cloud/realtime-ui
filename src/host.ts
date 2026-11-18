import type { ComponentType } from "react";
import { FallbackAvatar } from "./components/users/user-avatar.tsx";
import { FallbackName } from "./components/users/user-name.tsx";
import { sharedTooltips } from "./inc/shared-parts.ts";
import { escapeHtml, plainName } from "./inc/names.ts";

/**
 * What the screens ask of the app they are in, and nothing else: its translations, its users' avatars and names, who
 * is signed in, how it shows an error and asks before an act, and the WordPlus SDK's shared parts. Better Messages
 * hands in its own (WordPress's translations, its user store, its toasts, its dialogs); an app on @wordplus/realtime
 * gets the defaults below, the package's own strings and the people its realtime server names.
 *
 * Set once, before the first screen draws: `configureUi( { translate, Avatar, … } )`. Anything left out keeps its
 * default.
 */
/** AI Noise Removal before a person chooses: off, or on where the device can run it (UiHost.noiseDefault). */
export type NoiseDefault = 'off' | 'auto';

export interface UiHost {
    /**
     * A string the screens show, translated: `text` as written, `context` telling apart two meanings of one text, and
     * `domain` the text domain it is written with (`bp-better-messages` for the call screens, `wordplus-live-stream` for the live
     * streams), for a host that translates more than one product's words.
     */
    translate( text: string, context?: string, domain?: string ): string;
    /** A string with a number in it, in the form the language takes for `count`, as WordPress's `_nx()`. */
    translatePlural( single: string, plural: string, count: number, context?: string, domain?: string ): string;
    /**
     * A value the app may change before a screen uses it, as WordPress's `apply_filters()`: the screens name their
     * filters without a product prefix (`group_video_call_items`), and a host adds its own.
     */
    applyFilters<T>( name: string, value: T, ...args: unknown[] ): T;
    /** The accent colour, a hex value, for the ring around whoever is speaking. */
    accentColor(): string;
    /** Who is signed in: their id, the one the screens compare participants with. */
    currentUserId(): number | string;
    /** Shows an error a screen's action ran into, as the app shows its errors. */
    showError( error: unknown ): void;
    /**
     * Asks before an act that cannot be taken back (End for Everyone), in the app's own dialog: true when the person
     * goes ahead. By default the browser's confirm().
     */
    confirm( question: UiConfirm ): Promise<boolean>;
    /** A user's picture, as the app draws it. */
    Avatar: ComponentType<UserAvatarProps>;
    /** A user's name, as the app writes it. */
    Name: ComponentType<UserNameProps>;
    /**
     * A display name as markup the screens may render. Better Messages keeps a site's badges through its allowlist;
     * by default the name is plain text, escaped, so no name a user typed becomes an element.
     */
    nameHtml( name: string ): string;
    /** The picture for a user who has none of their own. */
    defaultAvatar(): string;
    /**
     * Whether the page can know who is online at all. Where it can't, a screen says nothing of a user's presence
     * rather than "Offline" about everyone.
     */
    presenceKnown(): boolean;
    /**
     * Runs `run` once a WordPlus SDK part is on the page (`window.wordplusTooltips`, …): at once when it is. Better
     * Messages loads its own copy when a page has none.
     */
    whenShared( part: SharedPart, run: () => void ): void;
    /**
     * The folder the call effects are served from, dist/effects of this package as the app serves it, ending in a
     * slash: its engine and models load from there once someone turns an effect on. '' by default, and then the
     * device settings offer no blurred or replaced background.
     */
    effectsUrl(): string;
    /**
     * The folder AI Noise Removal is served from, dist/noise of this package as the app serves it, ending in a slash:
     * a pack of its own, apart from the effects, as its model is some 11 MB more. Its engine and models load from
     * there once someone turns it on. '' by default, and then the device settings do not offer it.
     */
    noiseUrl(): string;
    /**
     * Whether AI Noise Removal is on for someone who never turned it on or off in the device settings: 'off', as it
     * ships, or 'auto', on where the device is a computer that can run it and the browser is not asked to save data. A
     * person's own choice always comes first. 'off' by default.
     */
    noiseDefault?(): NoiseDefault;
    /**
     * Pictures the app adds to the call effects' backgrounds, shown after the built-in ones: the picture at about 1280
     * by 720, a small one for its tile and a name. One on another origin (a CDN) needs CORS headers, as WebGL draws no
     * other: without them its tile says it cannot be used here. [] by default.
     */
    backgrounds(): HostBackground[];
    /**
     * The built-in backgrounds offered: pictures of WordPlus's catalog (dist/backgrounds) the app picked and serves,
     * each by its id in the catalog (chosen as `image:<id>`) and with its name in the user's language, shown before the
     * app's own. The same CORS rule. [] by default.
     */
    builtInBackgrounds(): HostBackground[];
    /**
     * Whether people may use a picture of their own device as the background (chosen as `own:<id>`): the device
     * settings then offer Add Your Own after the app's pictures. The picture is read, scaled and kept by the browser
     * alone (inc/calls/own-backgrounds.ts), never sent anywhere: the others see it only in the camera, as with any
     * background. False by default. Turned off, those a browser keeps are not offered, and stay for when it is on again.
     */
    ownBackgrounds(): boolean;
    /**
     * The size and frame rate the app's call opens the camera at, which the device settings' preview asks too, so it
     * shows the shape the others get (inc/calls/camera-size.ts). Null by default: 1920x1080 at 30 frames, as
     * realtime-client's cameraCapture() without a call's settings.
     */
    cameraSize(): { width: number, height: number, frameRate: number } | null;
}

/** A background of the call effects: one of the catalog's, chosen as `image:<id>`, or the app's own, as `site:<id>`. */
export interface HostBackground {
    id: string | number;
    url: string;
    thumb?: string;
    name: string;
}

export type SharedPart = "toasts" | "tooltips" | "menus";

/** A question for UiHost.confirm: its title, a line on what follows, and the words of the button that goes ahead. */
export interface UiConfirm {
    title: string;
    message?: string;
    confirm: string;
    /** The way out, when not the app's own Cancel. */
    cancel?: string;
    /** An act that destroys something, its button in the danger colour. */
    danger?: boolean;
}

export interface UserAvatarProps {
    user_id: number | string;
    size: number;
    link?: boolean;
    /** The conversation the avatar is drawn for, which some hosts read a guest's picture from. */
    fromThread?: unknown;
    /**
     * `false` draws the avatar without the host's presence dot or status: the people a call is with once it has
     * connected, who are plainly there. The call screens keep the dot on a call that rings alone.
     */
    presence?: boolean;
}

export interface UserNameProps {
    user_id: number | string;
    /** What to write while the host knows no name for the user. */
    fallback?: string;
    link?: boolean;
    fromThread?: unknown;
}

/** A user's name and picture, as the defaults draw them. */
export interface UiUser {
    name: string;
    avatar?: string;
}

const users = new Map<string, UiUser>();

/** Names and pictures for the default Avatar and Name, as an app's realtime server gives them. */
export function setUiUsers( list: Iterable<[ number | string, UiUser ]> ): void {
    for ( const [ id, user ] of list ) users.set( String( id ), user );
}

export function uiUser( id: number | string ): UiUser | undefined {
    return users.get( String( id ) );
}

const defaults: UiHost = {
    translate: ( text ) => text,
    translatePlural: ( single, plural, count, context, domain ) => current.translate( count === 1 ? single : plural, context, domain ),
    applyFilters: ( _name, value ) => value,
    accentColor: () => "#21759b",
    currentUserId: () => 0,
    showError: ( error ) => console.error( error ),
    confirm: async ( question ) => typeof window !== "undefined" && window.confirm( question.message ? question.title + "\n\n" + question.message : question.title ),
    Avatar: FallbackAvatar,
    Name: FallbackName,
    nameHtml: ( name ) => escapeHtml( plainName( name ) ),
    // None: an avatar without a picture draws the blank of its shape.
    defaultAvatar: () => "",
    presenceKnown: () => true,
    whenShared: ( part, run ) => {
        if ( typeof window === "undefined" ) return;
        // Tooltips also from the package's own floater, on a page without the SDK's (the elements script sets it).
        if ( part === "tooltips" ? sharedTooltips() : ( window as unknown as Record<string, unknown> )[ SHARED_GLOBALS[ part ] ] ) run();
    },
    effectsUrl: () => "",
    noiseUrl: () => "",
    noiseDefault: () => "off",
    backgrounds: () => [],
    builtInBackgrounds: () => [],
    ownBackgrounds: () => false,
    cameraSize: () => null,
};

const SHARED_GLOBALS = {
    toasts   : "wordplusToasts",
    tooltips : "wordplusTooltips",
    menus    : "wordplusMenus",
} as const;

let current: UiHost = defaults;

/** Hands the screens what they ask of the app; what is left out keeps its default. */
export function configureUi( host: Partial<UiHost> ): void {
    current = { ...current, ...host };
}

export function host(): UiHost {
    return current;
}
