import {afterEach, describe, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {MenuButton, MenuItem} from "../../src/components/streams/menu.tsx";

// A menu on a page without the WordPlus SDK's menus (an app, the script-tag embed): it places itself beside its button,
// on the side with room, no taller than that side has, in the top layer where the browser has popovers. The window is
// happy-dom's, 768px tall; the button and the menu measure what each test gives them.

const proto = HTMLElement.prototype as any;
const saved = {
    rect: Object.getOwnPropertyDescriptor( Element.prototype, 'getBoundingClientRect' ),
    height: Object.getOwnPropertyDescriptor( proto, 'offsetHeight' ),
    width: Object.getOwnPropertyDescriptor( proto, 'offsetWidth' ),
    show: proto.showPopover,
    hide: proto.hidePopover
};

afterEach( () => {
    cleanup();
    for( const [ name, d ] of [ [ 'offsetHeight', saved.height ], [ 'offsetWidth', saved.width ] ] as const ){
        if( d ) Object.defineProperty( proto, name, d ); else delete proto[ name ];
    }
    if( saved.rect ) Object.defineProperty( Element.prototype, 'getBoundingClientRect', saved.rect );
    proto.showPopover = saved.show;
    proto.hidePopover = saved.hide;
} );

// The button at `top` (36px tall, its right edge at 540), the menu 220×`height`, as tall as its max-height lets it be.
function measure( top : number, height : number ){
    Object.defineProperty( Element.prototype, 'getBoundingClientRect', {
        configurable: true,
        value(){
            return this.classList?.contains( 'estream-menu__button' )
                ? { top, bottom: top + 36, left: 504, right: 540, width: 36, height: 36, x: 504, y: top }
                : { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0 };
        }
    } );
    Object.defineProperty( proto, 'offsetHeight', { configurable: true, get(){ return this.getAttribute?.( 'role' ) === 'menu' ? Math.min( height, parseFloat( this.style.maxHeight ) || Infinity ) : 0; } } );
    Object.defineProperty( proto, 'offsetWidth', { configurable: true, get(){ return this.getAttribute?.( 'role' ) === 'menu' ? 220 : 0; } } );
}

const open = () => {
    render( <MenuButton icon="sliders" label="Settings">{ ( close ) => <MenuItem onSelect={ close }>Statistics</MenuItem> }</MenuButton> );
    fireEvent.click( screen.getByLabelText( 'Settings' ) );
    return screen.getByRole( 'menu' );
};

describe( 'a menu without the SDK\'s menus', () => {
    it( 'opens under its button near the top of the window, where there is no room for it above', () => {
        proto.showPopover = undefined;
        measure( 40, 300 );
        const menu = open();
        expect( [ menu.style.top, menu.style.bottom, menu.style.maxHeight ] ).toEqual( [ 'calc(100% + 6px)', 'auto', '' ] );
        expect( menu.hasAttribute( 'popover' ) ).toBe( false );
    } );

    it( 'goes into the top layer where the browser has popovers, at a point inside the window, above its button where it fits', () => {
        proto.showPopover = vi.fn();
        proto.hidePopover = vi.fn();
        measure( 600, 300 );
        const menu = open();
        expect( menu.getAttribute( 'popover' ) ).toBe( 'manual' );
        expect( proto.showPopover ).toHaveBeenCalled();
        expect( [ menu.style.position, menu.style.top, menu.style.left ] ).toEqual( [ 'fixed', '292px', '320px' ] );

        // Closed, it leaves the top layer.
        fireEvent.click( screen.getByRole( 'menuitem', { name: 'Statistics' } ) );
        expect( proto.hidePopover ).toHaveBeenCalled();
    } );

    it( 'is no taller than the side with more room, scrolling the rest, and never over its button', () => {
        proto.showPopover = vi.fn();
        proto.hidePopover = vi.fn();
        // 300px above the button, 402 below: under it, 402 tall.
        measure( 316, 600 );
        const menu = open();
        expect( [ menu.style.maxHeight, menu.style.top ] ).toEqual( [ '402px', '358px' ] );
    } );
} );
