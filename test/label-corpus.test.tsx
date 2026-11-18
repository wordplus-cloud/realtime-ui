// @vitest-environment happy-dom
// The Tooltip helper's accessible name, plainLabel() (src/inc/names.ts), against string-strip-html, which made it until
// 2026-10-31: the same label for every word of the kit's eight languages, with and without a control's key, Better
// Messages' own tooltips, names, and markup and white space at their edges, here without a document, as on an app's
// server. gallery/label.spec.ts holds the same in Chromium, where every named reference is the browser's.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { plainLabel } from '../src/inc/names.ts';
import { BETTER_MESSAGES, EDGES, labelBefore, withKeys } from './corpus/labels.ts';
import { RARER, STORED } from './corpus/entities.ts';
import { BADGES, words } from './corpus/markup.ts';

const languages = join( dirname( fileURLToPath( import.meta.url ) ), '..', 'src', 'languages' );
const WORDS = words( Object.fromEntries( readdirSync( languages ).filter( ( file ) => file.endsWith( '.json' ) ).map( ( file ) => [ file, JSON.parse( readFileSync( join( languages, file ), 'utf8' ) ) ] ) ) );

it( 'labels every word, key, tooltip, name and edge as string-strip-html did', () => {
    const corpus = [ ...WORDS, ...withKeys( WORDS ), ...BETTER_MESSAGES, ...STORED, ...BADGES, ...EDGES ];
    expect( corpus.length ).toBeGreaterThan( 11_000 );
    expect( corpus.filter( ( content ) => plainLabel( content ) !== labelBefore( content ) ) ).toEqual( [] );
} );

it( 'leaves a rarer named reference as written without a document, where a browser reads it as before', () => {
    for ( const name of RARER ) {
        const now = plainLabel( name );
        if ( now === labelBefore( name ) ) continue;
        // Each reference read as before, or as written.
        expect( now.replace( /&[a-zA-Z0-9]+;/g, ( reference ) => labelBefore( reference ) ), name ).toBe( labelBefore( name ) );
    }
} );

it( 'stamps the label on the control it names, as the Tooltip helper did', async () => {
    const { default: Tooltip } = await import( '../src/components/helpers/tooltip.tsx' );
    for ( const content of [ 'Hide Chat (Alt+H)', 'Ann <span class="badge">Pro</span>', '&lt;b&gt;x&lt;/b&gt; &amp;amp; y' ] ) {
        const { container } = render( <Tooltip content={ content } disabled><span>x</span></Tooltip> );
        expect( container.querySelector( 'span' )!.getAttribute( 'aria-label' ) ).toBe( labelBefore( content ) );
        cleanup();
    }
} );
