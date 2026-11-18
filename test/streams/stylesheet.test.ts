// @vitest-environment node
// The streams' stylesheet as styles/streams/_streams.scss compiles: what a jsdom render cannot see of it.
import { expect, it } from 'vitest';
import { compileFile } from '../../styles/compile.mjs';

const css = await compileFile( 'streams/_streams.scss' );

// A rule's declarations, by its exact selector, outside or inside an at-rule.
const rule = ( selector: string ) => {
    const at = css.indexOf( '\n' + selector + ' {' ) >= 0 ? css.indexOf( '\n' + selector + ' {' ) : css.search( new RegExp( '\\n\\s+' + selector.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' ) + ' \\{' ) );
    return at < 0 ? null : css.slice( css.indexOf( '{', at ) + 1, css.indexOf( '}', at ) );
};

it( 'keeps the effects\' tiles, their cross and their settings line in their own colours in a theme\'s hovered and focused buttons', () => {
    // A theme's `button:hover, button:focus { background-color: #1175e9; color: #fff }` gave the tiles its blue, as the
    // other buttons of the streams had before the button-colours mixin.
    for( const [ name, color, background ] of [
        [ 'effects__pick', 'var(--wplus-live-stream-muted)', 'var(--wplus-live-stream-surface-2)' ],
        [ 'effects__remove', '#fff', 'rgba(0, 0, 0, 0.6)' ],
        [ 'effects__tune-head', 'var(--wplus-live-stream-text)', 'none' ],
    ] ){
        const held = rule( 'html body button.wplus-live-stream-' + name + ':where(:hover, :focus, :active)' );
        expect( held, name ).not.toBeNull();
        expect( held ).toContain( 'color: ' + color + ';' );
        expect( held ).toContain( 'background: ' + background + ';' );
        expect( rule( '.wplus-live-stream-' + name ) ).toContain( 'background: ' + background + ';' );
    }
    // Their own hover and choice still outrank it: a rule of two classes against one class and three elements.
    expect( rule( '.wplus-live-stream-effects__pick:hover' ) ).toContain( 'color: var(--wplus-live-stream-text);' );
    expect( rule( '.wplus-live-stream-effects__pick[aria-checked=true]' ) ).toContain( 'color: var(--wplus-live-stream-accent);' );
} );

it( 'lets a screen taller than the picture start at the top and scroll, and drops the countdown\'s clock on a phone', () => {
    // Before a scheduled stream on a phone (412 pixels wide), the words, the countdown and Add to calendar ran out of
    // the 16:9 picture at both edges, centred.
    const screen = rule( '.wplus-live-stream-screen' )!;
    expect( screen ).toContain( 'justify-content: center;' );
    expect( screen ).toContain( 'justify-content: safe center;' );
    expect( screen.indexOf( 'justify-content: center;' ) ).toBeLessThan( screen.indexOf( 'justify-content: safe center;' ) );
    expect( screen ).toContain( 'overflow: hidden auto;' );

    // On a phone its clock goes and its lines draw closer: the words, a countdown of days, when and Add to calendar
    // then fit a 380 by 214 picture, measured in Chromium at 412 pixels wide.
    const narrow = css.slice( css.indexOf( '@container (max-width: 420px)' ) );
    expect( narrow ).toMatch( /\.wplus-live-stream-screen:has\(\.wplus-live-stream-countdown\) \{\s*gap: 4px;\s*padding: 8px 12px;/ );
    expect( narrow ).toMatch( /\.wplus-live-stream-screen:has\(\.wplus-live-stream-countdown\) \.wplus-live-stream-countdown \{\s*margin: 0;/ );
    expect( narrow ).toMatch( /\.wplus-live-stream-screen:has\(\.wplus-live-stream-countdown\) \.wplus-live-stream-screen__icon \{\s*display: none;/ );
} );
