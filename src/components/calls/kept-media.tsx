import React, { useLayoutEffect, useRef } from "react";

/**
 * A tile's video or audio element that outlives the tile, for a moment, so the same person drawn again elsewhere
 * goes on playing without a break (asked on 2026-10-30: "the animation is not smooth when I changing layout or
 * spotlight user"). A group video call's large tiles and the rest are two blocks, so a tile going from one to the
 * other, as a spotlight or Speaker puts someone large, is a new tile: its picture went blank and started again, and
 * its sound with it. Here the element is the page's, kept by `id` (the person and what it plays), and moved into
 * whichever tile draws it now, in the same commit, so the browser never pauses it. Let go KEEP_MS after the last tile
 * drawing it went, as an element in a tile that went would be. A second tile drawing the same `id` at the same time
 * gets an element of its own.
 *
 * Its host is a span with `display: contents`, so the element lays out and is styled as the tile's own child.
 */
const KEEP_MS = 1000;

type Kept = { element: HTMLMediaElement, owner: object | null, release: ReturnType<typeof setTimeout> | undefined };

const kept = new Map<string, Kept>();

export type KeptMediaProps = {
    /** Whose and which: a person's key and camera, screen or audio. */
    id: string,
    tag: 'video' | 'audio',
    className?: string,
    muted?: boolean,
    /** Attributes the element carries (`datatype`), as React would set them. */
    attributes?: Record<string, string>,
    hidden?: boolean,
    /** The element, once it is in the tile, and null as the tile goes. */
    onElement: ( element: HTMLMediaElement | null ) => void,
};

function fresh( tag: 'video' | 'audio' ): HTMLMediaElement {
    const element = document.createElement( tag );
    element.autoplay = true;
    element.setAttribute( 'playsinline', '' );
    ( element as HTMLVideoElement ).playsInline = true;
    return element;
}

export default function KeptMedia( { id, tag, className, muted, attributes, hidden, onElement }: KeptMediaProps ) {
    const host = useRef<HTMLSpanElement>( null );
    const current = useRef<HTMLMediaElement | null>( null );

    useLayoutEffect( () => {
        const me = {};
        let entry = kept.get( id );
        let element: HTMLMediaElement;
        let owned = true;

        if ( entry && entry.owner === null && entry.element.localName === tag ) {
            // The tile that drew it went in this same commit, or a moment ago: carry on with its element.
            clearTimeout( entry.release );
            entry.owner = me;
            element = entry.element;
        } else if ( entry && entry.owner !== null ) {
            element = fresh( tag );
            owned = false;
        } else {
            element = fresh( tag );
            entry = { element, owner: me, release: undefined };
            kept.set( id, entry );
        }

        current.current = element;
        host.current?.appendChild( element );
        // An element moved while playing plays on; one a browser paused as it left its tile starts again.
        if ( element.paused && element.srcObject ) {
            try {
                void element.play()?.catch( () => null );
            } catch {}
        }
        onElement( element );

        return () => {
            onElement( null );
            current.current = null;
            if ( ! owned || ! entry || entry.owner !== me ) {
                element.remove();
                element.srcObject = null;
                return;
            }
            const leaving = entry;
            leaving.owner = null;
            leaving.release = setTimeout( () => {
                if ( leaving.owner !== null || kept.get( id ) !== leaving ) return;
                kept.delete( id );
                leaving.element.remove();
                leaving.element.srcObject = null;
            }, KEEP_MS );
        };
    }, [ id, tag ] );

    useLayoutEffect( () => {
        const element = current.current;
        if ( ! element ) return;
        element.className = className ?? '';
        element.muted = !! muted;
        element.style.display = hidden ? 'none' : '';
        Object.entries( attributes ?? {} ).forEach( ( [ name, value ] ) => element.setAttribute( name, value ) );
    } );

    return <span ref={ host } className="wplus-kept-media" style={ { display: 'contents' } } />;
}

/** For a test: whether `id`'s element is kept now. */
export function keptElement( id: string ): HTMLMediaElement | null {
    return kept.get( id )?.element ?? null;
}
