import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * A group video call's tiles moving to their new places as its layout changes: Auto, Speaker or Tiled, someone into
 * the spotlight or out of it, Participants beside the call, a resize (asked on 2026-10-30: "the animation is not smooth
 * when I changing layout or spotlight user"). The tiles are placed in percentages of two blocks, the large tiles and
 * the rest, and moved with CSS transitions of their top, left, width and height while the blocks' own heights
 * transitioned too: a tile followed two animations at once, a tile going from one block to the other was a new one in
 * its new place at once, and every frame of the move laid the page out again. Now the blocks and the tiles take their
 * new places at once, and each tile drawn before and after is moved from where it was by a transform, which the
 * compositor runs (the FLIP technique): read where every tile is before the change (during the render that brings it,
 * while the page still shows the old layout), then, once it is in, start each from there. A tile is known by its
 * `data-key`, in whichever block it is now, and one that grows into the large tiles passes over the rest. A browser
 * that asks for less motion has none.
 *
 * `deps` are what places the tiles: a change of any of them is a change of layout. `still`, true when such a change
 * comes, makes it a cut instead: every tile is at its new place at once, a move still running ended. It is put back to
 * false after every commit, so it never reaches a later change.
 */
export const MOVE_MS = 300;
const TILES = '.wplus-group-call-input-video[data-key]';

const changed = ( was: readonly unknown[], now: readonly unknown[] ) => was.length !== now.length || now.some( ( value, at ) => value !== was[ at ] );

function stillMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
}

export default function useGridMoves( grid: RefObject<HTMLElement | null>, deps: readonly unknown[], still?: RefObject<boolean> ): void {
    const committed = useRef<readonly unknown[]>( [] );
    const before = useRef<Map<string, DOMRect> | null>( null );
    const running = useRef( new WeakMap<Element, Animation>() );

    // Where the tiles are now, read in the render of a new layout, before the page changes.
    if ( grid.current && before.current === null && ! still?.current && committed.current.length > 0 && changed( committed.current, deps ) ) {
        const places = new Map<string, DOMRect>();
        grid.current.querySelectorAll<HTMLElement>( TILES ).forEach( ( tile ) => places.set( tile.dataset.key!, tile.getBoundingClientRect() ) );
        before.current = places;
    }

    useLayoutEffect( () => {
        committed.current = deps;
        const was = before.current;
        before.current = null;
        const element = grid.current;
        if ( element && still?.current ) {
            element.querySelectorAll( TILES ).forEach( ( tile ) => running.current.get( tile )?.cancel() );
            return;
        }
        if ( ! was || ! element || typeof element.animate !== 'function' || stillMotion() ) return;

        const tiles = Array.from( element.querySelectorAll<HTMLElement>( TILES ) );
        // A move still running is stopped first, so where each tile ends is read without it.
        tiles.forEach( ( tile ) => running.current.get( tile )?.cancel() );
        const moves = tiles.map( ( tile ) => ( { tile, from: was.get( tile.dataset.key! ), to: tile.getBoundingClientRect() } ) );

        moves.forEach( ( { tile, from, to } ) => {
            if ( ! from || to.width === 0 || to.height === 0 || from.width === 0 || from.height === 0 ) return;
            const dx = from.left - to.left;
            const dy = from.top - to.top;
            const sx = from.width / to.width;
            const sy = from.height / to.height;
            if ( Math.abs( dx ) < 1 && Math.abs( dy ) < 1 && Math.abs( sx - 1 ) < 0.01 && Math.abs( sy - 1 ) < 0.01 ) return;

            // Growing: over the tiles it passes.
            const grows = to.width * to.height > from.width * from.height * 1.5;
            if ( grows ) tile.style.zIndex = '2';
            const move = tile.animate( [
                { transform: `translate(${ dx }px, ${ dy }px) scale(${ sx }, ${ sy })`, transformOrigin: '0 0' },
                { transform: 'none', transformOrigin: '0 0' },
            ], { duration: MOVE_MS, easing: 'ease' } );
            running.current.set( tile, move );
            // Only the move still running cleans up: a cancelled one says so later, after the next has begun.
            const done = () => {
                if ( running.current.get( tile ) !== move ) return;
                running.current.delete( tile );
                if ( grows ) tile.style.zIndex = '';
            };
            move.onfinish = done;
            move.oncancel = done;
        } );
    }, deps );

    // After the effect above, in every commit: a cut asked for applies to the change it came with alone.
    useLayoutEffect( () => {
        if ( still ) still.current = false;
    } );
}
