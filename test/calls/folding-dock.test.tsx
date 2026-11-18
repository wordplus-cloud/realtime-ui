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

    it( 'draws one control always in More as its own button in More\'s place, and More, holding it, as the row folds or holds two', () => {
        const pip = <Tip key="pip" content="Picture in Picture"><span className="pip" /></Tip>;
        const add = <Tip key="add" content="Add Person"><span className="add" /></Tip>;
        const dock = ( extra : boolean, always = [ pip ], keep = false ) => (
            <FoldingDock className="dock" pinned={ 1 } more={ more } always={ always } keep={ keep }>
                <span className="a" aria-label="Camera" />
                <span className="b" aria-label="Microphone" />
                { extra && <span className="c" aria-label="Share screen" /> }
                <span className="leave" aria-label="Leave" />
            </FoldingDock>
        );
        const { container, rerender } = render( dock( false ) );
        const row = () => [ ...( container.querySelector( '.dock' ) as HTMLElement ).children ].map( ( el ) => el.className );

        // Room for four: two, the lone control where More would be, and the pinned one.
        expect( row() ).toEqual( [ 'a', 'b', 'pip', 'leave' ] );
        expect( container.querySelector( '.wplus-call-more' ) ).toBeNull();

        // One more in the row: it breaks, folds its last, and More is back with that and the lone one, in the same room.
        rerender( dock( true ) );
        expect( row() ).toEqual( [ 'a', 'b', 'wplus-call-more', 'leave' ] );
        fireEvent.click( within( container.querySelector( '.dock' ) as HTMLElement ).getByRole( 'button', { name: 'More' } ) );
        expect( [ ...container.querySelectorAll( '.wplus-call-dock-sheet__row' ) ].map( ( el ) => el.textContent ) ).toEqual( [ 'Share screen', 'Picture in Picture' ] );

        // Room again: the lone control, and the open sheet goes with More.
        rerender( dock( false ) );
        expect( row() ).toEqual( [ 'a', 'b', 'pip', 'leave' ] );
        expect( container.querySelector( '.wplus-call-dock-sheet' ) ).toBeNull();

        // Two always in More, or a More with something of its own: More.
        rerender( dock( false, [ pip, add ] ) );
        expect( row() ).toEqual( [ 'a', 'b', 'wplus-call-more', 'leave' ] );
        rerender( dock( false, [ pip ], true ) );
        expect( row() ).toEqual( [ 'a', 'b', 'wplus-call-more', 'leave' ] );
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

describe( 'controls always in More (call-dock.tsx, DockMore)', () => {
    it( 'puts them in More\'s menu whatever the room, after what the row folded and the call\'s own part, labelled and acting from there', async () => {
        const { default: CallDock, DockMore } = await import( '../../src/components/calls/call-dock.tsx' );
        const { default: Tooltip } = await import( '../../src/components/helpers/tooltip.tsx' );
        const pressed : string[] = [];
        const item = ( cls : string, label : string ) => <Tooltip content={ label }><span className={ cls } onClick={ () => pressed.push( label ) } /></Tooltip>;
        const { container } = render(
            <div className="wplus-call-container">
                <CallDock className="dock" pinned={ 1 } menu={ <span className="own-part">The call's own</span> }>
                    { item( 'mic', 'Microphone' ) }
                    <>
                        { item( 'size', 'Expand' ) }
                        <DockMore>
                            { item( 'pip', 'Picture in Picture' ) }
                            { item( 'add', 'Add Person' ) }
                        </DockMore>
                    </>
                    { item( 'leave', 'Leave' ) }
                </CallDock>
            </div>
        );

        const row = () => [ ...( container.querySelector( '.dock' ) as HTMLElement ).children ].map( ( el ) => el.className.split( ' ' )[ 0 ] );
        // Room for all four, and More there all the same, before Leave.
        expect( row() ).toEqual( [ 'mic', 'size', 'wplus-call-more', 'leave' ] );

        // One menu over the stage, as Host Controls: the call's own part, then the rows.
        fireEvent.click( container.querySelector( '.wplus-call-more' )! );
        const menu = container.querySelector( '.wplus-call-container > .wplus-call-more-menu' ) as HTMLElement;
        expect( menu.getAttribute( 'role' ) ).toBe( 'menu' );
        expect( [ ...menu.children ].map( ( el ) => el.className.split( ' ' ).pop() ) ).toEqual( [ 'own-part', 'wplus-call-more-rows' ] );
        expect( [ ...menu.querySelectorAll( '.wplus-call-dock-sheet__row' ) ].map( ( el ) => el.textContent ) ).toEqual( [ 'Picture in Picture', 'Add Person' ] );

        // What the call's part holds keeps the menu open, a row acts and puts it away.
        fireEvent.click( within( menu ).getByText( "The call's own" ) );
        expect( container.querySelector( '.wplus-call-more-menu' ) ).not.toBeNull();
        fireEvent.click( within( menu ).getByText( 'Add Person' ) );
        expect( pressed ).toEqual( [ 'Add Person' ] );
        expect( container.querySelector( '.wplus-call-more-menu' ) ).toBeNull();

        // From the keyboard too: each row is in the Tab order, and Enter presses it.
        fireEvent.click( container.querySelector( '.wplus-call-more' )! );
        const pip = container.querySelector<HTMLElement>( '.wplus-call-more-menu .pip' )!;
        expect( pip.tabIndex ).toBe( 0 );
        fireEvent.keyDown( pip, { key: 'Enter' } );
        expect( pressed ).toEqual( [ 'Add Person', 'Picture in Picture' ] );
    } );
} );
