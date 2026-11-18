/*! The icons of @wordplus/realtime-ui are drawn on Lucide's geometry (https://lucide.dev), many copied from Lucide.

ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2026 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2026.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

---

The MIT License (MIT) (for portions derived from Feather)

Copyright (c) 2013-2026 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING OUT OF
OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The same text is src/primitives/icons/LICENSE-lucide.txt, and THIRD-PARTY-NOTICES.txt beside the package's scripts. */
import React, { CSSProperties, ReactNode } from "react";
import { markup } from "../inc/markup.tsx";
import { CHAT_ICONS } from "./icons/chat.ts";
import type { CALL_ICONS } from "./icons/calls.ts";
import type { MESSENGER_ICONS } from "./icons/messenger.ts";

// Lucide-style 1.6-stroke icon registry. Single <Icon name="..." /> component
// with the registry typed via keyof so adding a new icon is one place.
//
// Every glyph keeps Lucide's envelope: 2..22 of the 24 grid, 3..21 for
// squares. Header rows put these side by side at one nominal size, so a
// glyph drawn to Feather's 1..23 (the old gear, users, video, camera…)
// stood a fifth taller than its neighbours. tests/specs/header-icon-parity
// measures the registry against that envelope.
//
// Pipe separator (|) in a value renders multiple <path> elements — useful for
// composite icons like settings (gear + center dot) or video (rectangle +
// triangle). A part starting with * is filled in the icon's own colour as well
// as stroked: the solid dot of record.
//
// The registry in sets (primitives/icons/): the chat's (CHAT_ICONS) from the start, so the chat parts carry theirs
// alone; the call screens' (CALL_ICONS) and the rest (MESSENGER_ICONS, Better Messages' own screens) registered by
// primitives/icons.tsx, the package's Icon, which the call screens and every app draw through. registerIcons() adds a
// set, an app's own too. The slimming of 2026-10-31 (live-support-releases/studies/ui-kit-plan.md, K6): the whole
// registry was 3.2 KB of a visitor's chat panel, gzipped, which draws some thirty of its 121 glyphs.
const ICONS: Record<string, string> = { ...CHAT_ICONS };

export type IconName = keyof typeof CHAT_ICONS | keyof typeof CALL_ICONS | keyof typeof MESSENGER_ICONS;

/** Glyphs for the registry, as the sets give them (a name and its paths): an app's own, or a set of the package's. */
export function registerIcons( ...sets: Array<Readonly<Record<string, string>>> ): void {
    for ( const set of sets ) Object.assign( ICONS, set );
}

// The registry glyph as ONE path, for the few places that cannot render an
// <Icon> and take a bare `d` instead — fslightbox's toolbar buttons, which
// build their own <svg><path> and only accept that (image-lightbox.tsx), and
// the canvas of a call's picture-in-picture (pip-canvas.ts). Multi-path
// glyphs join into subpaths of a single `d`, which draws identically: a path
// that starts with a relative move starts from the origin again, as it does on
// its own, not from where the path before it ended. The caller supplies the
// stroke: these are stroke artwork on a 24 viewBox, not fills.
export function iconPathD( name: IconName ): string {
    const d = ( ICONS[ name ] as string ).replace( /(^|\|)\*/g, "$1" );
    return d.includes( "|" ) ? d.split( "|" ).map( ( part ) => part.replace( /^m/, "M0 0m" ) ).join( " " ) : d;
}

// ─── GLYPHS THAT CARRY A DIRECTION ────────────────────────────────────
//
// An RTL document flips the layout but not the artwork: the back chevron
// still pointed left with the inbox now on the right, and both panel
// toggles still drew their sidebar on the left with the panel on the
// right. These are mirrored under [dir="rtl"] by a single rule in
// _rtl.scss, which the class below opts into.
//
// Only glyphs whose meaning IS the direction belong here. A magnifier, a
// play triangle, a volume cone, a fullscreen pair and the chat bubble
// read the same in both directions — mirroring those is the other half
// of the same bug, so they are deliberately absent.
//
// A caller that sets its own `transform` on the svg overrides this (one
// property, not two) — see the call surface's chat toggle, whose hidden
// and stacked states re-state the flip in _call-surface.scss.
const RTL_MIRRORED: ReadonlySet<string> = new Set( [
    "chevronL", "chevronR",
    "reply", "send",
    "panelOpen", "panelClose",
    "logout",
    "screenShare", "screenShareOff",
] );

export interface IconProps {
    name: IconName | "gif" | "wifiWeak";
    size?: number;
    strokeWidth?: number;
    className?: string;
    style?: CSSProperties;
}

export default function Icon( { name, size = 18, strokeWidth, className, style }: IconProps ) {
    // The 24-viewBox paths scale their stroke with the render size, so tiny
    // renders come out as sub-pixel hairlines (1.6 @ 12px paints 0.8px).
    // Unless the caller pins a width, hold the RENDERED weight at ~1.15px
    // minimum by thickening the stroke as the size shrinks.
    const sw = strokeWidth ?? Math.max( 1.6, Math.min( 2.9, ( 1.15 * 24 ) / size ) );

    // One bar of signal: lucide's wifi with its two outer arcs faint, as a phone shows a weak network (a video paused
    // for the viewer's download). A registry glyph draws in one ink, and lucide's "wifi-low", its dot and lowest arc
    // alone, read as a stray mark at 14 px (2026-10-19).
    if ( name === "wifiWeak" ) {
        return (
            <svg viewBox="0 0 24 24" width={ size } height={ size }
                 className={ className } style={ style }
                 fill="none" stroke="currentColor" strokeWidth={ sw }
                 strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true">
                <path d="M12 20h.01" />
                <path d="M8.5 16.429a5 5 0 0 1 7 0" />
                <path d="M5 12.859a10 10 0 0 1 14 0" opacity="0.3" />
                <path d="M2 8.82a15 15 0 0 1 20 0" opacity="0.3" />
            </svg>
        );
    }

    // hasOwnProperty, not a truthiness test: a name that lands on something
    // inherited from Object.prototype ("constructor", "toString") reads as a
    // hit and then crashes on .includes.
    const d = Object.prototype.hasOwnProperty.call( ICONS, name ) ? ICONS[ name ] : undefined;
    if ( typeof d !== "string" ) return null;

    const paths = d.includes( "|" ) ? d.split( "|" ) : [ d ];

    const cls = RTL_MIRRORED.has( name )
        ? ( className ? className + " wplus-icon-rtl" : "wplus-icon-rtl" )
        : className;

    return (
        <svg viewBox="0 0 24 24" width={ size } height={ size }
             className={ cls } style={ style }
             fill="none" stroke="currentColor" strokeWidth={ sw }
             strokeLinecap="round" strokeLinejoin="round"
             aria-hidden="true">
            { paths.map( ( pathD, i ) => pathD.startsWith( "*" )
                ? <path key={ i } d={ pathD.slice( 1 ) } fill="currentColor" />
                : <path key={ i } d={ pathD } /> ) }
        </svg>
    );
}

// ─── ICONS THAT DID NOT COME FROM THE REGISTRY ────────────────────────
//
// The JS extension points (better_messages_thread_context_menu,
// better_messages_single_message_context_menu, …) hand back whatever the
// integration wrote. Three shapes are in the wild, and all three have to
// render:
//
//   · a registry name  — our own items ("pin", "mute", …)
//   · an `<svg …>` markup STRING — the shape the hook docs document, and
//     what integrations actually ship
//   · a React node — what 2.0's own thread actions carried, so anything
//     copied from them passes one along
//
// A registry lookup alone silently dropped the last two: `<Icon name="<svg
// …>">` finds nothing and renders null, so the entry appeared with a blank
// where its icon should be. Resolving all three in one place keeps every
// menu surface honest. Registry FIRST — "pin" is a key, not markup.

export type IconSource = IconName | "gif" | ReactNode;

export function isRegistryIcon( icon: unknown ): icon is IconName | "gif" {
    return typeof icon === "string"
        && Object.prototype.hasOwnProperty.call( ICONS, icon );
}

export interface ResolvedIconProps {
    icon    : IconSource;
    size?   : number;
    className? : string;
}

export function ResolvedIcon( { icon, size = 18, className }: ResolvedIconProps ) {
    if ( icon === null || icon === undefined || icon === false || icon === "" ) return null;

    if ( isRegistryIcon( icon ) ) {
        return <Icon name={ icon } size={ size } className={ className } />;
    }

    // The box is ours, the artwork is theirs: integration SVG arrives drawn
    // at whatever size its author picked (the documented example is 24) and
    // would otherwise stand half again as tall as the glyphs beside it.
    // _icon.scss scales whatever lands inside down to this square.
    return (
        <span className={ "wplus-icon-custom" + ( className ? " " + className : "" ) }
              style={ { width: size, height: size } } aria-hidden="true">
            { typeof icon === "string" ? markup( icon ) : icon }
        </span>
    );
}
