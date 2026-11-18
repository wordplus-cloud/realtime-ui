import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The Tooltip helper's accessible name, plainLabel() (src/inc/names.ts), against string-strip-html, which made it until
// 2026-10-31, in Chromium, where every named reference is the browser's: the same label for every word of the kit's
// eight languages, with and without a control's key, Better Messages' own tooltips, every name and badge of the
// corpora, and markup and white space at their edges. test/label-corpus.test.tsx holds the same in a test DOM.
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );

test( 'labels every word, tooltip, name and edge as string-strip-html did, in a browser', async ( { page }, info ) => {
    test.skip( info.project.name === 'phone', 'the same browser: once is enough' );
    const bundled = await build( {
        stdin: {
            contents: `
                import { plainLabel } from './src/inc/names.ts';
                import { BETTER_MESSAGES, EDGES, labelBefore, withKeys } from './test/corpus/labels.ts';
                import { NAMES } from './test/corpus/entities.ts';
                import { BADGES, words } from './test/corpus/markup.ts';
                window.compare = ( languages ) => {
                    const all = words( languages );
                    const corpus = [ ...all, ...withKeys( all ), ...BETTER_MESSAGES, ...NAMES, ...BADGES, ...EDGES ];
                    return { count: corpus.length, differ: corpus.filter( ( content ) => plainLabel( content ) !== labelBefore( content ) ) };
                };
            `,
            resolveDir: root,
            loader: 'ts',
        },
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2021',
        logLevel: 'warning',
    } );
    const dir = join( root, 'src', 'languages' );
    const languages = Object.fromEntries( readdirSync( dir ).filter( ( file ) => file.endsWith( '.json' ) ).map( ( file ) => [ file, JSON.parse( readFileSync( join( dir, file ), 'utf8' ) ) ] ) );

    await page.setContent( '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' );
    await page.addScriptTag( { content: bundled.outputFiles[ 0 ].text } );
    const result = await page.evaluate( ( tables ) => ( window as unknown as { compare: ( t: unknown ) => { count: number; differ: string[] } } ).compare( tables ), languages );

    expect( result.count ).toBeGreaterThan( 11_000 );
    expect( result.differ ).toEqual( [] );
} );
