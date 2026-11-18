import React, { useEffect, useId, useRef, useState } from "react";
import { _x } from "../../inc/globals.ts";

/**
 * The jam in words: what it is, what it may do to the call for everyone else (their picture of this person freezing and
 * their sound of them breaking up, not only arriving late), and what may help. Said lightly: what the others get isn't
 * known here, only that the upload is jammed.
 */
export function uploadJamWords(): { title: string; text: string } {
    return {
        title: _x( 'Your upload is jammed', 'Call Notice', 'bp-better-messages' ),
        text: _x( 'Others may see your video freeze or hear your sound break up. Pausing other uploads on your network can help: a backup, cloud sync or another device.', 'Call Notice', 'bp-better-messages' ),
    };
}

export interface JamTip {
    /** The tip's words are on screen. */
    open: boolean;
    /** For the element that holds the mark and the tip: a tap or a click anywhere else closes the tip. */
    wrapRef: React.RefObject<HTMLElement | null>;
    /** For the mark itself, while jammed: a button of the keyboard's and the pointer's, named by the jam. */
    trigger: React.HTMLAttributes<HTMLElement> & { tabIndex?: number };
    /** The tip while open, and the jam's title for a screen reader as it begins; both go beside the mark. */
    parts: React.ReactNode;
}

/**
 * The person's own upload jammed (the call context's `uploadJammed`, the calls engine's upload-jam judge), said small:
 * a warning mark where the call says its connection, and the words in a tip by it. Nothing on the stage moves and
 * nothing stands over it.
 *
 * The tip shows while a mouse is on the mark and while the mark has the keyboard's focus. A touch screen has no hover,
 * so a tap opens it and keeps it until a tap elsewhere; a click does the same for a mouse, and Escape closes it. A
 * screen reader hears the title once as the jam begins and reads the rest from the mark, which the tip describes.
 */
export function useJamTip( jammed: boolean ): JamTip {
    const id = useId();
    const wrapRef = useRef<HTMLElement | null>( null );
    const hovering = useRef( false );
    const [ pinned, setPinned ] = useState( false );
    const [ shown, setShown ] = useState( false );
    const open = jammed && ( shown || pinned );

    const close = () => {
        hovering.current = false;
        setPinned( false );
        setShown( false );
    };

    useEffect( () => {
        if ( ! jammed ) close();
    }, [ jammed ] );

    useEffect( () => {
        if ( ! open ) return;
        const outside = ( e: PointerEvent ) => {
            if ( wrapRef.current && e.target instanceof Node && wrapRef.current.contains( e.target ) ) return;
            close();
        };
        document.addEventListener( 'pointerdown', outside, true );
        return () => document.removeEventListener( 'pointerdown', outside, true );
    }, [ open ] );

    const words = uploadJamWords();

    const trigger: JamTip[ 'trigger' ] = ! jammed ? {} : {
        role: 'button',
        tabIndex: 0,
        'aria-label': words.title,
        'aria-expanded': open,
        'aria-describedby': open ? id : undefined,
        // A finger's enter is its tap, which the click below answers.
        onPointerEnter: ( e ) => { if ( e.pointerType === 'mouse' ) { hovering.current = true; setShown( true ); } },
        onPointerLeave: ( e ) => { if ( e.pointerType === 'mouse' ) { hovering.current = false; setShown( false ); } },
        onFocus: () => setShown( true ),
        onBlur: () => { if ( ! hovering.current ) setShown( false ); setPinned( false ); },
        onClick: () => setPinned( ( was ) => ! was ),
        onKeyDown: ( e ) => {
            if ( e.key === 'Escape' && open ) { e.stopPropagation(); close(); }
            else if ( e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' ) { e.preventDefault(); setPinned( ( was ) => ! was ); }
        },
    };

    const parts = <>
        { open &&
            <span id={ id } role="tooltip" className="wplus-call-jam-tip" part="call-jam-tip">
                <strong>{ words.title }</strong>
                <span>{ words.text }</span>
            </span>
        }
        <span className="wplus-call-jam-said" role="status">{ jammed ? words.title : '' }</span>
    </>;

    return { open, wrapRef, trigger, parts };
}
