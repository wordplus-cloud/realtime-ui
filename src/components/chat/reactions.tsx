import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Btn from "../../inc/helpers/btn.tsx";
import { _x } from "../../inc/globals.ts";
import { isMobile } from "../../inc/functions/browser-info.ts";
import Tooltip from "../../primitives/tooltip.tsx";
import { type ClampedPosition, clampToViewport, liveAnchorRect, viewportSize } from "../../primitives/viewport.ts";

// Reactions, Better Messages' (its message-reactions.tsx): the pill row under a message and the picker, a small round
// trigger at the bubble's corner whose strip grows out of it on hover (a tap on a phone). Whoever draws them gives the
// set to pick from, which pick is the user's, what a pick does and how an emoji is drawn: Better Messages keeps its
// admin-curated set, its emoji images, its API and the "who reacted" list; an app's Chat picks from a set of its own
// and emits.
//
// A reaction travels as 2.0 stored it: the emoji's hex code point key ("1f44d", parts joined by "-"), or the emoji.
//
// Styles: styles/chat/_reactions.scss.

export interface ReactionEntry {
    reaction : string;
    users    : Array<number | string>;
}

const HEX_KEY_RE = /^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$/i;

/** A reaction's emoji, from its key or as it is. */
export function decodeReaction( value: string ): string {
    if ( ! HEX_KEY_RE.test( value ) ) return value;
    try {
        return String.fromCodePoint( ...value.split( "-" ).map( p => parseInt( p, 16 ) ) );
    } catch {
        return value;
    }
}

/** A reaction's key, as 2.0 stores them, from its emoji. */
export function encodeReaction( emoji: string ): string {
    return [ ...emoji ].map( ( c ) => c.codePointAt( 0 )!.toString( 16 ) ).filter( ( h ) => h !== "fe0f" ).join( "-" );
}

/** The pills under a message, and its meta where it rides their row. */
export function ReactionPills( { children, meta }: { children: ReactNode; meta?: ReactNode } ) {
    return (
        <div className="wplus-reactions">
            { children }
            { meta }
        </div>
    );
}

export interface ReactionPillProps {
    /** The emoji, as the host draws it. */
    emoji: ReactNode;
    /** How many picked it: shown from two up. */
    count: number;
    mine?: boolean;
    /**
     * Who reacted, in words, as a screen reader says the pill and its tooltip shows it ("Tom reacted with a thumbs
     * up"): in place of the emoji and the count, which a reader names by the emoji's own name or not at all. A pill
     * that only shows is then an image of it, never a control.
     */
    label?: string;
    /** Toggles the user's own, or opens who reacted: none for a pill that only shows. */
    onClick?: () => void;
}

export function ReactionPill( { emoji, count, mine, label, onClick }: ReactionPillProps ) {
    const still = !! label && ! onClick;
    const pill = (
        <Btn
            className="wplus-reaction-pill"
            data-reacted-by-me={ mine ? 1 : undefined }
            data-static={ onClick ? undefined : 1 }
            role={ still ? "img" : undefined }
            tabIndex={ still ? -1 : undefined }
            onClick={ onClick }
        >
            <span className="wplus-reaction-pill__emoji" aria-hidden={ label ? true : undefined }>{ emoji }</span>
            { count > 1 && <span className="wplus-reaction-pill__count" aria-hidden={ label ? true : undefined }>{ count }</span> }
        </Btn>
    );
    return label ? <Tooltip label={ label }>{ pill }</Tooltip> : pill;
}

let iconHeight = 32;

// How tall one column of the strip may grow before the set wraps into a second one.
const STRIP_MAX_HEIGHT = 300;
// The scale-fade, matched to _reactions.scss. The exit has to outlive its transition or the strip is unmounted
// mid-fade.
const STRIP_CLOSE_MS = 120;
// How long the strip survives the pointer being on neither it nor the trigger: the frames where the pointer crosses
// the sliver between their rounded corners.
const HOVER_GRACE_MS = 120;

/**
 * The trigger's LAYOUT box in viewport coordinates, its bottom-right corner, which the strip hangs off. The trigger
 * is mid-transform when the strip opens (it scales down as the strip covers it), and its transform keeps its centre,
 * so the corner comes from that centre and the untransformed size: an anchor that moves only when the trigger does.
 */
function triggerCorner( el: HTMLElement | null ): { right: number; bottom: number } | null {
    const r = liveAnchorRect( el );
    if ( ! r || ! el ) return null;
    return {
        right:  r.left + r.width  / 2 + el.offsetWidth  / 2,
        bottom: r.top  + r.height / 2 + el.offsetHeight / 2,
    };
}

export interface ReactionPickerProps {
    /** The set to pick from: keys or emoji, in order. */
    keys: string[];
    /** The user's own reaction, which the trigger fronts. */
    mine?: string;
    onPick: ( key: string ) => void;
    /** How an emoji is drawn, at a size: the emoji as text by default. */
    renderEmoji?: ( key: string, size: number ) => ReactNode;
    /** The trigger's name, and the strip's: "React" by default. */
    label?: string;
    /**
     * Each emoji of the set in words ("Thumbs up"), its name: none by default. Never a tooltip, which would cover the
     * emoji next to it in the strip.
     */
    labelOf?: ( key: string ) => string;
}

/**
 * An emoji as text, drawn as an emoji: a lone symbol older than the emoji blocks (the heart, U+2764) is text by default,
 * a black glyph, until U+FE0F asks for its colour, which a key leaves out (encodeReaction). The emoji blocks from
 * U+1F000 are colour already and stay as they are.
 */
export function emojiText( key: string ): string {
    const text = decodeReaction( key );
    const points = [ ...text ];
    return points.length === 1 && points[ 0 ].codePointAt( 0 )! < 0x1f000 ? text + "️" : text;
}

const textEmoji = ( key: string, size: number ) => (
    <span className="wplus-reaction-emoji" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, fontSize: Math.round( size * 0.85 ), lineHeight: 1 }}>{ emojiText( key ) }</span>
);

/** The reaction picker at a message's corner: its trigger, and the strip of the set it opens. */
export function ReactionPicker( { keys, mine, onPick, renderEmoji = textEmoji, label, labelOf }: ReactionPickerProps ) {
    const touch = isMobile();
    const name = label || _x( "React", "Reactions selector trigger", "bp-better-messages" );

    const [ isOpen, setIsOpen ] = useState( false );
    // Kept mounted through the closing transition: unmounting on the state flip would cut the fade off at its first
    // frame.
    const [ mounted, setMounted ] = useState( false );
    // Drives the CSS scale-fade, flipped a frame after the strip is placed, so the transition has a frame to run from
    // and no frame paints at the wrong spot.
    const [ entered, setEntered ] = useState( false );
    const [ pos, setPos ] = useState<ClampedPosition | null>( null );

    const triggerRef = useRef<HTMLElement | null>( null );
    const anchorRef  = useRef<HTMLDivElement | null>( null );
    const closeTimer = useRef<number>( 0 );
    const hoverBlocked = useRef( false );
    const unblockRef   = useRef<( () => void ) | null>( null );

    // Set from a pick onwards: the strip holds its place instead of following the trigger. A pick is what moves the
    // trigger (a first reaction adds the pill row, the bubble grows a line), and a strip that followed slid a
    // different emoji under a pointer that had not moved.
    const holdRef = useRef( false );

    // Opened from the keyboard (Enter or Space on the trigger, which Btn passes on as a click): focus goes into the
    // strip once it is placed, the arrows walk it, and a pick or Escape gives focus back to the trigger. Hover alone
    // opened it on a computer, so the set could not be reached without a pointer.
    const keysRef = useRef( false );
    const focusTrigger = () => requestAnimationFrame( () => triggerRef.current?.focus() );
    // Whether the click being handled is a key's: set by the key before Btn clicks for it, read once by the click.
    const pressRef = useRef( false );
    const markPress = ( e: React.KeyboardEvent ) => { pressRef.current = e.key === "Enter" || e.key === " " || e.key === "Spacebar"; };
    const takePress = () => { const pressed = pressRef.current; pressRef.current = false; return pressed; };

    const cancelClose = () => {
        if ( ! closeTimer.current ) return;
        clearTimeout( closeTimer.current );
        closeTimer.current = 0;
    };
    const unblockHover = () => {
        hoverBlocked.current = false;
        if ( ! unblockRef.current ) return;
        document.removeEventListener( "pointermove", unblockRef.current, true );
        unblockRef.current = null;
    };
    const openStrip = ( fromKeys = false ) => { cancelClose(); holdRef.current = false; keysRef.current = fromKeys; setMounted( true ); setIsOpen( true ); };
    const closeStrip = () => { cancelClose(); setIsOpen( false ); };
    const scheduleClose = () => {
        cancelClose();
        closeTimer.current = window.setTimeout( () => setIsOpen( false ), HOVER_GRACE_MS );
    };
    const pinThroughThePick = () => { holdRef.current = true; };
    // Hover opens the strip, except straight after a dismissal: taking the strip away sends a fresh mouseover to the
    // trigger under it, and the strip reopened on a pointer that had not moved. Hover waits for the pointer to move.
    const hoverOpen = () => { if ( ! hoverBlocked.current ) openStrip(); };
    const dismissStrip = () => {
        closeStrip();
        unblockHover();
        hoverBlocked.current = true;
        const onMove = () => unblockHover();
        unblockRef.current = onMove;
        document.addEventListener( "pointermove", onMove, true );
    };

    useEffect( () => () => { cancelClose(); unblockHover(); }, [] );

    // Unmount once the exit transition has played out.
    useEffect( () => {
        if ( isOpen ) return;
        setEntered( false );
        const t = window.setTimeout( () => { setMounted( false ); setPos( null ); }, STRIP_CLOSE_MS );
        return () => clearTimeout( t );
    }, [ isOpen ] );

    // Place the strip, then keep it placed.
    useLayoutEffect( () => {
        if ( ! mounted ) return;

        let raf = 0;
        let sig = "";

        const place = ( corner: { right: number; bottom: number } | null ) => {
            const el = anchorRef.current;
            if ( ! el || ! corner ) return;

            // Columns first, read off the rendered cell, so density and page zoom don't break the math.
            const cells = el.querySelectorAll<HTMLElement>( ".wplus-reaction-strip__item" );
            const cell  = cells.length ? cells[ cells.length - 1 ].offsetHeight : 0;
            if ( cell > 0 ) iconHeight = cell;
            const perColumn = Math.max( 1, Math.floor( STRIP_MAX_HEIGHT / iconHeight ) );
            const columns   = Math.max( 1, Math.ceil( keys.length / perColumn ) );
            el.style.setProperty( "--columns", String( columns ) );
            el.setAttribute( "data-columns", String( columns ) );

            // offsetWidth/Height: the inner strip is scaled down for its entrance. The strip's bottom-right corner
            // goes on the trigger's, growing up and to the left, clamped into the viewport.
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            const next = clampToViewport( corner.right - w, corner.bottom - h, w, h );
            setPos( prev => ( prev && prev.left === next.left && prev.top === next.top ) ? prev : next );
        };

        place( triggerCorner( triggerRef.current ) );

        // Per frame: the moves that matter (the list scrolling, the composer resizing the column, the keyboard
        // folding away) don't all arrive as events.
        const follow = () => {
            raf = requestAnimationFrame( follow );
            const el = anchorRef.current;
            if ( ! el ) return;
            if ( holdRef.current ) return;
            const corner = triggerCorner( triggerRef.current );
            const vp     = viewportSize();
            const now = [ corner?.right, corner?.bottom, el.offsetWidth, el.offsetHeight, vp.width, vp.height ].join( "|" );
            if ( now === sig ) return;
            sig = now;
            place( corner );
        };
        raf = requestAnimationFrame( follow );

        return () => cancelAnimationFrame( raf );
    }, [ mounted, keys.length ] );

    // The entrance only once the strip has a position, from the frame after.
    useLayoutEffect( () => {
        if ( ! isOpen || ! pos ) return;
        const raf = requestAnimationFrame( () => setEntered( true ) );
        return () => cancelAnimationFrame( raf );
    }, [ isOpen, !! pos ] );

    // Opened from the keyboard: focus on the user's own reaction, else the first of the set, once the strip is placed
    // and so can take it.
    useEffect( () => {
        if ( ! isOpen || ! pos || ! keysRef.current ) return;
        const items = stripItems();
        ( items.find( ( el ) => el.getAttribute( "data-mine" ) === "1" ) ?? items[ 0 ] )?.focus();
    }, [ isOpen, !! pos ] );

    const stripItems = () => [ ...( anchorRef.current?.querySelectorAll<HTMLElement>( ".wplus-reaction-strip__item" ) ?? [] ) ];

    // The arrows walk the strip as a menu's do, round from either end, and Home and End go to its ends.
    const walk = ( e: React.KeyboardEvent ) => {
        const items = stripItems();
        const at = items.indexOf( e.target as HTMLElement );
        if ( at < 0 ) return;
        const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[ e.key ];
        if ( to === undefined ) return;
        e.preventDefault();
        items[ ( to + items.length ) % items.length ]?.focus();
    };

    // Outside press and Escape, in the capture phase, so a handler that stops propagation can't strand it open.
    useEffect( () => {
        if ( ! isOpen ) return;
        const outside = ( e: PointerEvent ) => {
            const t = ( e.composedPath?.()[ 0 ] ?? e.target ) as Node | null;
            if ( ! t ) return;
            if ( anchorRef.current?.contains( t ) || triggerRef.current?.contains( t ) ) return;
            dismissStrip();
        };
        const escape = ( e: KeyboardEvent ) => {
            if ( e.key !== "Escape" ) return;
            dismissStrip();
            if ( keysRef.current ) focusTrigger();
        };
        document.addEventListener( "pointerdown", outside, true );
        document.addEventListener( "keydown", escape, true );
        return () => {
            document.removeEventListener( "pointerdown", outside, true );
            document.removeEventListener( "keydown", escape, true );
        };
    }, [ isOpen ] );

    if ( keys.length === 0 ) return null;

    // The trigger fronts the user's own reaction when they have one, else the last of the set.
    const faceKey = mine && keys.includes( mine ) ? mine : keys[ keys.length - 1 ];
    // The strip goes in the trigger's own root, so a shadow root's styles reach it.
    const root = triggerRef.current?.getRootNode();
    const target = root instanceof ShadowRoot ? root : document.body;

    return (
        <>
            <Btn
                className={ "wplus-reaction-trigger" + ( isOpen ? " wplus-hidden" : "" ) }
                ref={ triggerRef }
                aria-label={ name }
                aria-haspopup="menu"
                aria-expanded={ isOpen }
                onMouseEnter={ touch ? undefined : hoverOpen }
                onMouseLeave={ touch ? undefined : scheduleClose }
                // A tap toggles it on a phone. On a computer hover opens it, and Enter or Space opens it for the
                // keyboard.
                onKeyDown={ markPress }
                onClick={ touch
                    ? ( () => { takePress(); isOpen ? closeStrip() : openStrip(); } )
                    : ( () => { const pressed = takePress(); if ( ! isOpen ) openStrip( pressed ); } ) }
            >
                { renderEmoji( faceKey, 14 ) }
            </Btn>
            { mounted && createPortal(
                <div
                    className="wplus-reaction-strip-anchor"
                    ref={ anchorRef }
                    data-open={ entered ? "1" : undefined }
                    style={ { left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? undefined : "hidden" } }
                    onMouseEnter={ touch ? undefined : cancelClose }
                    onMouseLeave={ touch ? undefined : scheduleClose }
                    // Focus that leaves the strip for anything but the trigger closes what the keyboard opened.
                    onBlur={ ( e ) => {
                        const to = e.relatedTarget as Node | null;
                        if ( keysRef.current && to && ! anchorRef.current?.contains( to ) && to !== triggerRef.current ) closeStrip();
                    } }
                >
                    <div className="wplus-reaction-strip" role="menu" aria-label={ name } onKeyDownCapture={ markPress } onKeyDown={ walk }>
                        { keys.map( key => (
                            <Btn
                                key={ "reaction-" + key }
                                role="menuitem"
                                className="wplus-reaction-strip__item"
                                aria-label={ labelOf?.( key ) || undefined }
                                data-mine={ key === mine ? 1 : undefined }
                                // A finger never leaves the strip, so a pick closes it on a phone; a pointer
                                // walks off on its own, and the keyboard goes back to the trigger. Pinned first:
                                // the pill row the pick adds resizes the bubble.
                                onClick={ () => {
                                    const pressed = takePress();
                                    pinThroughThePick();
                                    onPick( key );
                                    if ( touch || pressed ) closeStrip();
                                    if ( pressed ) focusTrigger();
                                } }
                            >
                                { renderEmoji( key, 20 ) }
                            </Btn>
                        ) ) }
                    </div>
                </div>,
                target,
            ) }
        </>
    );
}
