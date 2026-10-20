import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownTooltips } from '../src/inc/floater.ts';

afterEach( () => {
    delete ( globalThis as Record<string, unknown> ).wordplusTooltips;
    document.body.innerHTML = '';
} );

describe( 'the package\'s tooltip floater', () => {
    it( 'shows a label in its anchor\'s shadow root, above it, inside the window\'s edges, and goes', () => {
        const holder = document.createElement( 'div' );
        document.body.appendChild( holder );
        const root = holder.attachShadow( { mode: 'open' } );
        const anchor = document.createElement( 'button' );
        root.appendChild( anchor );
        anchor.getBoundingClientRect = () => ( { left: 2, right: 34, top: 100, bottom: 132, width: 32, height: 32, x: 2, y: 100, toJSON() {} } ) as DOMRect;

        const tooltips = ownTooltips();
        tooltips.show( anchor, 'Turn off camera', { className: 'bm-tooltip' } );

        const box = root.querySelector( '.realtime-tooltip.bm-tooltip' ) as HTMLElement;
        expect( box.textContent ).toBe( 'Turn off camera' );
        expect( box.getAttribute( 'role' ) ).toBe( 'tooltip' );
        // Centred over a button at the window's left edge, it slides to stay 8px inside.
        expect( Number.parseInt( box.style.left ) ).toBeGreaterThanOrEqual( 8 );
        expect( Number.parseInt( box.style.top ) ).toBeLessThan( 100 );

        tooltips.hide( document.body );
        expect( root.querySelector( '.realtime-tooltip' ) ).not.toBeNull();
        tooltips.hide( anchor );
        expect( root.querySelector( '.realtime-tooltip' ) ).toBeNull();
    } );

    it( 'flips below an anchor at the top, and draws a label a screen builds', () => {
        const anchor = document.createElement( 'button' );
        document.body.appendChild( anchor );
        anchor.getBoundingClientRect = () => ( { left: 200, right: 232, top: 2, bottom: 34, width: 32, height: 32, x: 200, y: 2, toJSON() {} } ) as DOMRect;

        const gone = vi.fn();
        const tooltips = ownTooltips();
        tooltips.show( anchor, ( el ) => {
            el.append( 'Ann ', Object.assign( document.createElement( 'b' ), { textContent: 'speaking' } ) );
            return gone;
        } );

        const box = document.body.querySelector( '.realtime-tooltip' ) as HTMLElement;
        expect( box.innerHTML ).toBe( 'Ann <b>speaking</b>' );
        expect( Number.parseInt( box.style.top ) ).toBeGreaterThanOrEqual( 34 );

        tooltips.hide();
        expect( gone ).toHaveBeenCalled();
    } );

    it( 'gives way to the WordPlus SDK\'s floater where the page has it', async () => {
        const sdk = { canHover: true, show: vi.fn(), hide: vi.fn(), place: vi.fn() };
        ( globalThis as Record<string, unknown> ).wordplusTooltips = sdk;
        const { sharedTooltips, setOwnTooltips } = await import( '../src/inc/shared-parts.ts' );
        setOwnTooltips( ownTooltips() );
        expect( sharedTooltips() ).toBe( sdk );
        delete ( globalThis as Record<string, unknown> ).wordplusTooltips;
        expect( sharedTooltips() ).not.toBe( sdk );
        expect( sharedTooltips() ).toBeTruthy();
    } );
} );
