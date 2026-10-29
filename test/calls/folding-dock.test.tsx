import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, within} from "@testing-library/react";
import type {ReactNode} from "react";
import FoldingDock from "../../src/components/calls/folding-dock.tsx";

// The dock a call and anything drawn in a call's place share (calls/folding-dock.tsx): one row, its tail folded into a
// More sheet. A page with no layout wraps nothing, so the row here breaks past its fourth item, as a narrow one would.

const ROOM = 4;
let offsetTop : PropertyDescriptor | undefined;
let rects : PropertyDescriptor | undefined;

beforeEach( () => {
    offsetTop = Object.getOwnPropertyDescriptor( HTMLElement.prototype, 'offsetTop' );
    rects = Object.getOwnPropertyDescriptor( Element.prototype, 'getClientRects' );
    Object.defineProperty( HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get(){
            const row = this.parentElement;
            return row?.classList.contains( 'dock' ) && [ ...row.children ].indexOf( this ) >= ROOM ? 40 : 0;
        }
    } );
    Object.defineProperty( Element.prototype, 'getClientRects', { configurable: true, value: () => [ {} ] } );
} );

afterEach( () => {
    cleanup();
    if( offsetTop ) Object.defineProperty( HTMLElement.prototype, 'offsetTop', offsetTop );
    if( rects ) Object.defineProperty( Element.prototype, 'getClientRects', rects );
} );

// A tooltip as a call wraps its controls in: its copy is the control's label.
const Tip = ( props : { content : string, children : ReactNode } ) => <>{ props.children }</>;

const more = ( props : { open : boolean, toggle : () => void, sheet : ReactNode } ) => (
    <span className="wplus-call-more" role="button" aria-label="More" data-active={ props.open ? 1 : undefined } onClick={ props.toggle }>{ props.sheet }</span>
);

describe( 'a dock that folds', () => {
    it( 'keeps one row, folding its tail into More, never its pinned controls, and each folded one acts from the sheet labelled', () => {
        const pressed = vi.fn();
        const { container } = render(
            <FoldingDock className="dock" pinned={ 1 } more={ more }>
                <span className="a" aria-label="Camera" />
                <>
                    <span className="b" aria-label="Microphone" />
                    <Tip content="Settings"><span className="c" /></Tip>
                </>
                <span className="d" aria-label="Full screen" data-wplus-tip="Full screen" onClick={ pressed } />
                { false }
                <span className="e" aria-label="Share screen" />
                <span className="leave" aria-label="Leave" />
            </FoldingDock>
        );
        const dock = container.querySelector( '.dock' ) as HTMLElement;

        // Two inline, More, and the pinned one: four in the row.
        expect( [ ...dock.children ].map( ( el ) => el.className ) ).toEqual( [ 'a', 'b', 'wplus-call-more', 'leave' ] );
        expect( dock.getAttribute( 'data-folded' ) ).toBe( '3' );

        fireEvent.click( within( dock ).getByRole( 'button', { name: 'More' } ) );
        const sheet = dock.querySelector( '.wplus-call-dock-sheet' ) as HTMLElement;
        const rows = within( sheet ).getAllByRole( 'menuitem' );
        // Labelled by the tooltip's copy, or the control's own label; no tooltip of its own in the sheet.
        expect( rows.map( ( row ) => row.textContent ) ).toEqual( [ 'Settings', 'Full screen', 'Share screen' ] );
        expect( rows.map( ( row ) => row.className ) ).toEqual( [ 'c wplus-call-dock-sheet__row', 'd wplus-call-dock-sheet__row', 'e wplus-call-dock-sheet__row' ] );
        expect( rows[ 1 ].getAttribute( 'data-wplus-tip' ) ).toBeNull();

        // A row acts, then the sheet goes.
        fireEvent.click( rows[ 1 ] );
        expect( pressed ).toHaveBeenCalledTimes( 1 );
        expect( dock.querySelector( '.wplus-call-dock-sheet' ) ).toBeNull();

        // Escape and a press outside close it too.
        fireEvent.click( within( dock ).getByRole( 'button', { name: 'More' } ) );
        fireEvent.keyDown( document, { key: 'Escape' } );
        expect( dock.querySelector( '.wplus-call-dock-sheet' ) ).toBeNull();
        fireEvent.click( within( dock ).getByRole( 'button', { name: 'More' } ) );
        fireEvent.pointerDown( document.body );
        expect( dock.querySelector( '.wplus-call-dock-sheet' ) ).toBeNull();
    } );

    it( 'draws no More while everything fits', () => {
        const { container } = render(
            <FoldingDock className="dock" pinned={ 1 } more={ more }>
                <span className="a" aria-label="Camera" />
                <span className="leave" aria-label="Leave" />
            </FoldingDock>
        );

        expect( [ ...( container.querySelector( '.dock' ) as HTMLElement ).children ].map( ( el ) => el.className ) ).toEqual( [ 'a', 'leave' ] );
        expect( container.querySelector( '.wplus-call-more' ) ).toBeNull();
    } );
} );
