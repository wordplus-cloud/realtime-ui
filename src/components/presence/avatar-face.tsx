import React, { forwardRef, useState } from "react";
import Tooltip from "../../primitives/tooltip.tsx";
import { host } from "../../host.ts";
import { applyFilters } from "../../inc/globals.ts";
import { plainName } from "../../inc/names.ts";

// A person's face: their picture, or their letters, or the blank of its shape, with their status dot, and the faces
// overlapped in a stack. The part of presence (presence.tsx) that never draws a name as markup, so an app that draws
// faces alone does not carry the markup reader (inc/markup.tsx, 7.5 KB minified): Live Support's visitor panel, whose
// faces stand by a name or a line that says who. presence.tsx's Avatar is this face with its name over it in the
// shared tooltip, drawn as markup (a site's badges), as Better Messages has it.
//
// Styles: styles/presence/_presence.scss.

export type Presence = "online" | "busy" | "away" | "offline";

export interface PresenceUser {
    user_id  : number | string;
    name?    : string;
    avatar?  : string;
    is_bot?  : number;
}

export interface PresenceDotProps {
    presence : Presence | null | undefined;
    size?    : number;
    ringColor? : string;
    // A user status's own colour (Better Messages' admin-defined statuses): the dot wears it while the user is not
    // offline.
    color?   : string;
}

export function PresenceDot( { presence, size = 10, ringColor = "rgba(var(--wplus-color-surface), 1)", color }: PresenceDotProps ) {
    const p = presence || "offline";
    return (
        <span
            className="wplus-presence-dot"
            aria-label={ `presence-${p}` }
            data-presence={ p }
            style={{
                width: size,
                height: size,
                boxShadow: `0 0 0 2px ${ringColor}`,
                ...( color && p !== "offline" ? { background: color } : {} ),
            }}
        />
    );
}

export type AvatarShape = "circle" | "rounded" | "square";

/** A person's letters and the colours they are drawn in, as an app gives them (the face's `letters`). */
export interface AvatarLetters {
    text       : string;
    background : string;
    color      : string;
}

export interface AvatarFaceProps {
    user        : PresenceUser | null | undefined;
    size?       : number;
    shape?      : AvatarShape;
    presence?   : Presence | null;
    presenceColor? : string;
    presenceRing? : string;
    dotSize?    : number;
    // Letters on a colour for a person with no picture of their own, in place of the host's default picture, and for one
    // whose picture does not load: an app whose people are mostly without one (Live Support's visitors and team, whose
    // boards draw everyone so).
    letters?    : AvatarLetters;
    // The dot for an offline person too, in the offline colour, where no dot would say nothing: a support chat's head
    // saying its team is away.
    showOffline? : boolean;
    // The name is beside the face already: nothing for a screen reader to read twice, and no tooltip over it (Avatar's,
    // AvatarStack's).
    decorative? : boolean;
}

// Avatars take their radius from the design token (--wplus-radius-avatar, which a site's avatar shape remaps): the shape
// prop is an explicit override for one spot only, so every surface agrees on the shape by default.
export const SHAPE_RADIUS: Record<AvatarShape, string> = {
    circle:  "var(--wplus-radius-circle)",
    rounded: "var(--wplus-radius-md)",
    square:  "var(--wplus-radius-xs)",
};

/** The picture for a user who has none of their own: the host's (Better Messages ships one). */
export function defaultAvatarSrc(): string {
    return host().defaultAvatar();
}

// A user record can reach a surface before its picture has: every avatar falls back to the default picture rather
// than to an empty <img>.
export function avatarSrc( user: { avatar?: string } | null | undefined ): string {
    return ( user && user.avatar ) || defaultAvatarSrc();
}

// Keys for avatar lists. The id alone is not unique (unresolved people all carry 0), and React orphans duplicates
// instead of removing them; the index tells them apart, as these lists are short, capped and keep their order.
export function avatarKey( user: { user_id?: number | string }, index: number ): string {
    return String( user.user_id ?? "x" ) + "-" + index;
}

// Integrations append classes and attributes to every avatar (Better Messages' better_messages_avatar_class and
// better_messages_avatar_attributes). The class filter runs with 2.0's default class string, so callbacks written for
// it keep working, but only the classes an integration ADDED are applied.
const V2_AVATAR_CLASS_BASE = "avatar bbpm-avatar";

function avatarFilterExtras( user: PresenceUser ): { extraClass: string; attributes: Record<string, unknown> } {
    const filtered = String( applyFilters( "avatar_class", V2_AVATAR_CLASS_BASE, user ) );
    const extraClass = filtered === V2_AVATAR_CLASS_BASE
        ? ""
        : filtered.split( /\s+/ ).filter( c => c && c !== "avatar" && c !== "bbpm-avatar" ).join( " " );
    const attributes = applyFilters( "avatar_attributes", {}, user ) as Record<string, unknown>;
    return { extraClass, attributes };
}

/**
 * A person's face, with no tooltip: the wrap, with the classes and attributes the host's filters add, around the
 * picture and the dot. What a tooltip around it adds (Avatar's, AvatarStack's: its ref, its handlers, the name for a
 * reader) goes on the wrap itself.
 */
export const AvatarFace = forwardRef<HTMLSpanElement, AvatarFaceProps & React.HTMLAttributes<HTMLSpanElement>>( function AvatarFace(
    { user, size, shape, presence, presenceColor, presenceRing, dotSize, letters, showOffline, decorative, ...wrap },
    ref,
) {
    if ( ! user ) return null;
    const { extraClass, attributes } = avatarFilterExtras( user );
    return (
        <span ref={ ref } className={ "wplus-avatar-wrap" + ( extraClass ? " " + extraClass : "" ) }
              { ...attributes } { ...wrap } aria-hidden={ decorative ? "true" : undefined }>
            <FaceInside user={ user } size={ size } shape={ shape } presence={ presence } presenceColor={ presenceColor }
                        presenceRing={ presenceRing } dotSize={ dotSize } letters={ letters } showOffline={ showOffline }
                        decorative={ decorative } />
        </span>
    );
} );

// The picture, the letters or the blank, and the dot.
function FaceInside( { user, size = 36, shape, presence, presenceColor, presenceRing, dotSize, letters, showOffline, decorative }: AvatarFaceProps & { user: PresenceUser } ) {
    // The picture that did not load, which leaves the letters alone. Another picture is tried again.
    const [ failed, setFailed ] = useState( "" );
    const dot = dotSize != null ? dotSize : Math.max( 6, Math.round( size * 0.28 ) );
    const radius = shape ? SHAPE_RADIUS[ shape ] : undefined;
    const ring = presenceRing ?? "rgba(var(--wplus-color-surface), 1)";
    const name = decorative ? "" : plainName( user.name );
    if ( letters ) {
        // The letters always, and the person's own picture over them: a picture that is see-through where they chose
        // none (WordPress's blank avatar) shows them, as one that does not load does. The letters are sized by the
        // face's own size (--wplus-avatar-size), which an app's rule can override for one spot.
        const own = user.avatar && user.avatar !== failed ? user.avatar : "";
        return (
            <>
                <span className="wplus-avatar wplus-avatar-letters" role={ decorative ? undefined : "img" } aria-label={ decorative ? undefined : name }
                      style={ {
                          width: size,
                          height: size,
                          borderRadius: radius,
                          background: letters.background,
                          color: letters.color,
                          "--wplus-avatar-size": size + "px",
                      } as React.CSSProperties }>
                    { letters.text }
                    { own ? <img className="wplus-avatar-letters__picture" src={ own } alt="" onError={ () => setFailed( own ) } /> : null }
                </span>
                <Dot { ...{ presence, showOffline, dot, ring, presenceColor } } />
            </>
        );
    }
    const src = avatarSrc( user );
    return (
        <>
            { src
                ? <img className="wplus-avatar wplus-avatar-img avatar"
                       src={ src } alt={ name }
                       width={ size } height={ size }
                       style={{
                           width: size,
                           height: size,
                           borderRadius: radius,
                       }} />
                // No picture and no default: the blank of the avatar's shape.
                : <span className="wplus-avatar wplus-avatar-img wplus-avatar-blank" role={ decorative ? undefined : "img" } aria-label={ decorative ? undefined : name }
                        style={{ width: size, height: size, borderRadius: radius }} /> }
            <Dot { ...{ presence, showOffline, dot, ring, presenceColor } } />
        </>
    );
}

// The status dot at the face's corner: while the person is not offline, or for offline too where asked.
function Dot( { presence, showOffline, dot, ring, presenceColor }: { presence?: Presence | null; showOffline?: boolean; dot: number; ring: string; presenceColor?: string } ) {
    if ( ! presence || ( presence === "offline" && ! showOffline ) ) return null;
    return (
        <span className="wplus-presence-dot-wrap">
            <PresenceDot presence={ presence } size={ dot } ringColor={ ring } color={ presenceColor } />
        </span>
    );
}

export interface AvatarStackProps {
    users : ( PresenceUser | null | undefined )[];
    size? : number;
    max?  : number;
    shape? : AvatarShape;
    // Each person's face as the app draws it: their letters, the first one's presence dot, decorative where the names
    // are beside the stack (Live Support's team in the head of its visitor chat).
    avatar? : ( user: PresenceUser, index: number ) => Partial<AvatarFaceProps>;
}

// Each face overlaps the one before it on the side the line starts from, in either writing direction: a left margin
// overlapped the faces left to right only, and in right to left it pulled each face onto the next one instead. A face
// shows its person's name in the shared tooltip, as text: a stack is small faces together, and their names in full
// are where the stack is (a list of who reads, who is in the room).
export function AvatarStack( { users, size = 28, max = 3, shape, avatar }: AvatarStackProps ) {
    const valid = users.filter( ( u ): u is PresenceUser => !! u );
    const list = valid.slice( 0, max );
    const more = valid.length - list.length;
    const radius = shape ? SHAPE_RADIUS[ shape ] : undefined;
    return (
        <span className="wplus-avatar-stack">
            { list.map( ( u, i ) => {
                const drawn = avatar?.( u, i ) ?? {};
                const face = <AvatarFace size={ size } shape={ shape } { ...drawn } user={ u } />;
                const name = drawn.decorative ? "" : plainName( u.name );
                return (
                    <span key={ avatarKey( u, i ) } className="wplus-avatar-stack__item" style={{
                        marginInlineStart: i === 0 ? 0 : -size * 0.35,
                        borderRadius: radius,
                    }}>
                        { name ? <Tooltip label={ name } ariaLabel={ name }>{ face }</Tooltip> : face }
                    </span>
                );
            } ) }
            { more > 0 && (
                <span className="wplus-avatar-stack__more" style={{
                    marginInlineStart: -size * 0.35,
                    width: size,
                    height: size,
                    borderRadius: radius,
                    fontSize: size * 0.32,
                }}>+{ more }</span>
            ) }
        </span>
    );
}
