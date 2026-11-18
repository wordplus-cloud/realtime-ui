// @vitest-environment node
// The kit's own reader of markup (src/inc/markup.tsx) against html-react-parser, which drew a screen's markup until
// 2026-10-31, without a document, where html-react-parser read it with htmlparser2: the same static markup and the
// same elements, with their properties and keys, for every icon, name, template and word of the corpus
// (test/corpus/markup.ts). gallery/markup.spec.ts holds the same in Chromium, where html-react-parser read markup with
// the browser's own parser, as it did on every page of Better Messages.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import parse from 'html-react-parser';
import { expect, it, vi } from 'vitest';
import { markup } from '../src/inc/markup.tsx';
import { BADGES, BLOCKED, HOSTILE, ICONS, NAMES_DRAWN, TEMPLATES, words } from './corpus/markup.ts';
import { decode } from 'html-entities';
import { pageText } from '../src/inc/names.ts';

const languages = join( dirname( fileURLToPath( import.meta.url ) ), '..', 'src', 'languages' );
const WORDS = words( Object.fromEntries( readdirSync( languages ).filter( ( file ) => file.endsWith( '.json' ) ).map( ( file ) => [ file, JSON.parse( readFileSync( join( languages, file ), 'utf8' ) ) ] ) ) );

/** An element tree as data: each element's type, key and properties, its children the same. */
function shape( node: ReactNode ): unknown {
    if ( Array.isArray( node ) ) return node.map( shape );
    if ( ! isValidElement( node ) ) return node;
    const { children, ...props } = node.props as Record<string, unknown>;
    return { type: node.type, key: node.key, props: Object.fromEntries( Object.entries( props ).sort( ( [ a ], [ b ] ) => a.localeCompare( b ) ) ), children: shape( children as ReactNode ) };
}

const html = ( node: ReactNode ) => renderToStaticMarkup( <>{ node }</> );

// Where htmlparser2 read markup otherwise than a browser, and markup() as a browser: SVG's own names (linearGradient,
// clipPath) it wrote in lower case, so html-react-parser drew elements unknown to SVG without a document, and a
// textarea's text it left undecoded. A name the kit decodes only in a browser (decodeEntities() without a document)
// is the third, in names alone (test/entities-corpus.test.ts).
const SVG_CASE = /<(linearGradient|radialGradient|clipPath|foreignObject|textPath|fe[A-Z]\w*|animate[A-Z]\w*)\b/;
const serverOnly = ( text: string ) => SVG_CASE.test( text ) || /<textarea/.test( text ) || decode( pageText( text ) ) !== pageText( text );

it( 'draws every icon, name, template and word of the corpus as html-react-parser did', () => {
    // React warns of the `on…` attributes html-react-parser passed it, which markup() leaves out: not this test's.
    vi.spyOn( console, 'error' ).mockImplementation( () => {} );
    const corpus = [ ...ICONS, ...BADGES, ...TEMPLATES, ...NAMES_DRAWN, ...WORDS ];
    expect( corpus.length ).toBeGreaterThan( 2500 );
    const differ: string[] = [];
    for ( const text of corpus ) {
        if ( serverOnly( text ) ) continue;
        if ( html( markup( text ) ) !== html( parse( text ) ) ) differ.push( `markup: ${ text }` );
        else if ( JSON.stringify( shape( markup( text ) ) ) !== JSON.stringify( shape( parse( text ) ) ) ) differ.push( `elements: ${ text }` );
    }
    expect( differ ).toEqual( [] );
    vi.restoreAllMocks();
} );

it( 'writes SVG\'s own names as a browser does, where htmlparser2 wrote them in lower case', () => {
    const cased = ICONS.filter( ( text ) => SVG_CASE.test( text ) );
    expect( cased.length ).toBeGreaterThan( 0 );
    for ( const text of cased ) {
        const now = html( markup( text ) );
        expect( now ).toMatch( SVG_CASE );
        expect( now.toLowerCase() ).toBe( html( parse( text ) ).toLowerCase() );
    }
} );

it( 'leaves out what React itself never ran: a javascript: address, an on… attribute, a script', () => {
    vi.spyOn( console, 'error' ).mockImplementation( () => {} );
    for ( const text of BLOCKED ) {
        expect( html( markup( text ) ), text ).not.toMatch( /javascript|href=/i );
        // React 19 drew it with an address of its own that throws, where React 18 ran it.
        expect( html( parse( text ) ), text ).toMatch( /javascript/i );
    }
    for ( const text of HOSTILE ) {
        const now = html( markup( text ) );
        expect( now, text ).not.toMatch( /\son\w+=/i );
        expect( now.replace( /<[^>]*>/g, '' ), text ).toBe( html( parse( text ) ).replace( /<[^>]*>/g, '' ) );
    }
    expect( html( markup( '<script>alert(1)</script>Hi' ) ) ).toBe( 'Hi' );
    vi.restoreAllMocks();
} );

it( 'gives what parse() gave for nothing, text alone and one element', () => {
    expect( markup( '' ) ).toEqual( [] );
    expect( markup( 'Ann' ) ).toBe( 'Ann' );
    expect( markup( 'Ann &amp; Ben' ) ).toBe( 'Ann & Ben' );
    const one = markup( '<b>Ann</b>' );
    expect( isValidElement( one ) && one.key ).toBe( null );
    expect( ( markup( '<b>A</b><i>B</i>' ) as React.ReactElement[] ).map( ( element ) => element.key ) ).toEqual( [ '0', '1' ] );
} );
