import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The kit's own reader of markup (src/inc/markup.tsx) against html-react-parser, which drew a screen's markup until
// 2026-10-31 through the browser's own parser, in Chromium as on every page of Better Messages: for every icon, name,
// template and word of test/corpus/markup.ts, the same static markup and the same elements, their properties and keys.
// test/markup-corpus.test.tsx holds the same without a document.
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );

test( 'draws every icon, name, template and word as html-react-parser did, in a browser', async ( { page }, info ) => {
    test.skip( info.project.name === 'phone', 'the same browser: once is enough' );
    const bundled = await build( {
        stdin: {
            contents: `
                import React, { isValidElement } from 'react';
                import { renderToStaticMarkup } from 'react-dom/server.browser';
                import parse from 'html-react-parser';
                import { markup } from './src/inc/markup.tsx';
                import { BADGES, BLOCKED, ICONS, NAMES_DRAWN, TEMPLATES, words } from './test/corpus/markup.ts';
                const shape = ( node ) => {
                    if ( Array.isArray( node ) ) return node.map( shape );
                    if ( ! isValidElement( node ) ) return node;
                    const { children, ...props } = node.props;
                    return { type: node.type, key: node.key, props: Object.fromEntries( Object.entries( props ).sort( ( [ a ], [ b ] ) => a.localeCompare( b ) ) ), children: shape( children ) };
                };
                const html = ( node ) => renderToStaticMarkup( React.createElement( React.Fragment, null, node ) );
                window.compare = ( languages ) => {
                    const corpus = [ ...ICONS, ...BADGES, ...TEMPLATES, ...NAMES_DRAWN, ...words( languages ) ];
                    const differ = [];
                    for ( const text of corpus ) {
                        if ( html( markup( text ) ) !== html( parse( text ) ) ) differ.push( 'markup: ' + text + ' | ' + html( markup( text ) ) + ' | ' + html( parse( text ) ) );
                        else if ( JSON.stringify( shape( markup( text ) ) ) !== JSON.stringify( shape( parse( text ) ) ) ) differ.push( 'elements: ' + text );
                    }
                    const blocked = BLOCKED.map( ( text ) => html( markup( text ) ) );
                    return { count: corpus.length, differ, blocked };
                };
            `,
            resolveDir: root,
            loader: 'tsx',
        },
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2021',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'warning',
    } );
    const dir = join( root, 'src', 'languages' );
    const languages = Object.fromEntries( readdirSync( dir ).filter( ( file ) => file.endsWith( '.json' ) ).map( ( file ) => [ file, JSON.parse( readFileSync( join( dir, file ), 'utf8' ) ) ] ) );

    await page.setContent( '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' );
    await page.addScriptTag( { content: bundled.outputFiles[ 0 ].text } );
    const result = await page.evaluate( ( tables ) => ( window as unknown as { compare: ( t: unknown ) => { count: number; differ: string[]; blocked: string[] } } ).compare( tables ), languages );

    expect( result.count ).toBeGreaterThan( 2500 );
    expect( result.differ ).toEqual( [] );
    for ( const drawn of result.blocked ) expect( drawn ).not.toMatch( /javascript|href=/i );
} );
