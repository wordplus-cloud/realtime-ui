// @vitest-environment node
// The call screens' stylesheet as styles/calls/_call-stage.scss compiles: what a jsdom render cannot see of it.
import { expect, it } from 'vitest';
import { compileFile } from '../../styles/compile.mjs';

const css = await compileFile( 'calls/_call-stage.scss' );

// A rule's declarations, by its exact selector.
const rule = ( selector: string ) => {
    const at = css.indexOf( '\n' + selector + ' {' );
    return at < 0 ? null : css.slice( css.indexOf( '{', at ) + 1, css.indexOf( '}', at ) );
};
const DEVICES = '.wplus-call-wrap .wplus-call-devices ';

it( 'keeps each Effect Settings slider\'s ends by its own track, nearer it than the next slider\'s name, in a theme with tall inputs', () => {
    // BuddyX's `input[type="range"] { padding: 10px; min-height: 38px }` and its 1.75 line height made the 18 pixel
    // slider 38 tall: its ends stood 21 pixels below the track's middle and 10 above the next name (measured in
    // Chromium with dev.local's theme rules). Now 11 and 14.
    const range = rule( DEVICES + '.wplus-call-tune-row > input[type=range]' )!;
    expect( range ).toContain( 'height: 18px;' );
    expect( range, 'a theme\'s least height for inputs stretches the slider' ).toContain( 'min-height: 0;' );
    expect( range ).toContain( 'padding: 0;' );
    expect( rule( DEVICES + '.wplus-call-tune-row' ) ).toContain( 'gap: 2px;' );
    expect( rule( DEVICES + '.wplus-call-tune-sliders' ) ).toContain( 'gap: 14px;' );
    expect( rule( DEVICES + '.wplus-call-tune-name' ), 'a theme\'s line height spreads the name from its track' ).toContain( 'line-height: 16px;' );
    expect( rule( DEVICES + '.wplus-call-tune-ends' ), 'a theme\'s line height spreads the ends from their track' ).toContain( 'line-height: 14px;' );
} );

it( 'gives a group video tile the gutter the grid cuts its cells to pictures with, 4 pixels a side (TILE_GUTTER)', () => {
    // group-video-grid.tsx cuts a cell to its picture and the gutter round it, so the picture fills what is inside.
    const tile = rule( '.wplus-call-wrap.wplus-call-wrap-group .wplus-group-call-input-video' )!;
    expect( tile ).toContain( 'box-sizing: border-box;' );
    expect( tile ).toContain( 'padding: 4px;' );
} );
