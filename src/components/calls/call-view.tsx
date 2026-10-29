import React, { createContext, useContext, useEffect, useLayoutEffect, type MutableRefObject } from "react";
import { _x } from "../../inc/globals.ts";
import { CallContext, type CallContextInterface } from "./context.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icon.tsx";

/**
 * How big the call is drawn: in its place on the page, filling the browser window (`windowed`), or the whole screen
 * (the call's own full screen, `fullScreenEnabled`). Expand fills the window first, where a call on a phone or beside a
 * chat is big enough without leaving the browser, and from there Full Screen takes the whole screen; leaving the whole
 * screen (the browser's Escape among the ways) comes back to the window, and Collapse or Escape to the page. The window
 * needs nothing from the browser, so a page without full screen (Safari on an iPhone) expands too. The call screen
 * keeps `windowed` (call-screen.tsx); the layouts draw the controls (`fullScreenItems`).
 */
export const CallViewContext = createContext<{ windowed: boolean, setWindowed: ( on: boolean ) => void }>( {
    windowed: false,
    setWindowed: () => {},
} );

/** Whether the call covers the page, filling the window or the screen: no chat beside it to show or hide then. */
export function useCallExpanded(): boolean {
    const { fullScreenEnabled } = useContext<CallContextInterface>( CallContext );
    return useContext( CallViewContext ).windowed || !! fullScreenEnabled;
}

/**
 * The call over everything on the page, in the browser's top layer: a popover the page shows. Fixed and at the top of
 * the z-order alone, it stayed under a site's header, sidebar and headings wherever an element around the messenger
 * made a stacking context of its own, which no z-index inside it can leave. Without popovers (a browser older than
 * 2024) the fixed position is all there is. `drop` takes it out again: before Full Screen too, as a popover showing is
 * hidden by the browser's full screen and would stay hidden.
 */
export function liftCall( element: HTMLElement | null | undefined ) {
    if ( ! element || typeof element.showPopover !== 'function' ) return;
    element.setAttribute( 'popover', 'manual' );
    try {
        if ( ! element.matches( ':popover-open' ) ) element.showPopover();
    } catch {
        element.removeAttribute( 'popover' );
    }
}

export function dropCall( element: HTMLElement | null | undefined ) {
    if ( ! element || ! element.hasAttribute( 'popover' ) ) return;
    try {
        if ( element.matches( ':popover-open' ) ) element.hidePopover();
    } catch {}
    element.removeAttribute( 'popover' );
}

/**
 * The call in the top layer exactly while it fills the window and is not the whole screen: lifted on Expand and on
 * coming back from the whole screen, dropped on Collapse and at the call's end.
 */
export function useLiftedCall( wrapper: MutableRefObject<HTMLDivElement | null>, lifted: boolean ) {
    useLayoutEffect( () => {
        if ( lifted ) liftCall( wrapper.current );
        else dropCall( wrapper.current );
    }, [ lifted ] );

    useLayoutEffect( () => () => dropCall( wrapper.current ), [] );
}

/**
 * While the call fills the window: the page under it doesn't scroll, and Escape collapses it (a menu open in the call
 * takes its Escape first, moderation-panels.tsx, and a dialog the app draws over it, UiHost.confirm, keeps its own).
 */
export function useWindowedPage( windowed: boolean, collapse: () => void ) {
    useEffect( () => {
        if ( ! windowed || typeof document === 'undefined' ) return;
        const root = document.documentElement;
        root.classList.add( 'wplus-call-windowed' );

        const onKey = ( event: KeyboardEvent ) => {
            if ( event.key !== 'Escape' || document.fullscreenElement ) return;
            if ( ( event.target as Element | null )?.closest?.( '[role="dialog"], [role="alertdialog"], [aria-modal="true"]' ) ) return;
            collapse();
        };
        document.addEventListener( 'keydown', onKey );

        return () => {
            root.classList.remove( 'wplus-call-windowed' );
            document.removeEventListener( 'keydown', onKey );
        };
    }, [ windowed ] );
}

/**
 * The dock's size controls, as items the dock lays out and folds like its others (call-dock.tsx reads each label from
 * its tooltip): Expand on the page; Collapse and, where the browser has it, Full Screen in the window; Exit Full Screen
 * on the whole screen, which leaves the window too.
 */
export function fullScreenItems( call: CallContextInterface, view: { windowed: boolean, setWindowed: ( on: boolean ) => void } ) {
    if ( call.fullScreenEnabled ) {
        return <Tooltip content={_x('Exit Full Screen Mode', 'Group Video Chat', 'bp-better-messages')}>
            <span onClick={ () => { call.disableFullScreen(); view.setWindowed( false ); } } className="wplus-fs-disable">
                <Icon name="minimize" size={ 20 } />
            </span>
        </Tooltip>;
    }

    if ( view.windowed ) {
        return <>
            <Tooltip content={_x('Collapse', 'Call Controls', 'bp-better-messages')}>
                <span onClick={ () => view.setWindowed( false ) } className="wplus-fs-disable wplus-fs-collapse">
                    <Icon name="minimize" size={ 20 } />
                </span>
            </Tooltip>
            { call.fullScreenAvailable &&
                <Tooltip content={_x('Full Screen', 'Call Controls', 'bp-better-messages')}>
                    <span onClick={ () => {
                        // Out of the top layer first, in the same press the browser takes full screen from; back in
                        // if it refused, the call still filling the window.
                        const element = call.wrapper.current;
                        dropCall( element );
                        call.enableFullScreen();
                        setTimeout( () => {
                            if ( ! document.fullscreenElement && element?.classList.contains( 'wplus-call-wrap--window' ) ) liftCall( element );
                        }, 600 );
                    } } className="wplus-fs-screen">
                        <Icon name="maximize" size={ 20 } />
                    </span>
                </Tooltip>
            }
        </>;
    }

    return <Tooltip content={_x('Expand', 'Call Controls', 'bp-better-messages')}>
        <span onClick={ () => view.setWindowed( true ) } className="wplus-fs-enable">
            <Icon name="maximize" size={ 20 } />
        </span>
    </Tooltip>;
}
