import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The kit's decoder of character references (src/inc/names.ts) against html-entities, which plainName() used until
// 2026-10-31, in Chromium: every HTML5 named reference where it stands in text, the numbers, and the names WordPress
// stores, each the same. A browser reads the names itself, and a test DOM may know fewer of them than a browser does,
// so this runs here and not in happy-dom (test/entities-corpus.test.ts holds the same without a document).
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );

test( 'decodes every character reference as html-entities did, in a browser', async ( { page }, info ) => {
    test.skip( info.project.name === 'phone', 'the same browser: once is enough' );
    const bundled = await build( {
        stdin: {
            contents: `
                import { decodeEntities, pageText, plainName } from './src/inc/names.ts';
                import { NAMES, decodeBefore, namedInText, numeric, plainNameBefore } from './test/corpus/entities.ts';
                window.corpus = { decodeEntities, pageText, plainName, NAMES, decodeBefore, namedInText, numeric, plainNameBefore };
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
    await page.setContent( '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' );
    await page.addScriptTag( { content: bundled.outputFiles[ 0 ].text } );

    const result = await page.evaluate( () => {
        const c = ( window as unknown as { corpus: Record<string, any> } ).corpus;
        const texts: string[] = [ ...c.numeric(), ...c.namedInText(), ...c.NAMES ];
        const decoded = texts.filter( ( text ) => c.decodeEntities( text ) !== c.decodeBefore( text ) );
        const plain = [ ...texts, null, undefined ].filter( ( text ) => c.plainName( text ) !== c.plainNameBefore( text ) );
        // As markup() reads them (pageText()), the same as the browser's own parser reads the whole text, in text and
        // in an attribute's value, where an old name before a letter, a digit or "=" is no reference ("?a=1&copy=2").
        const area = document.createElement( 'textarea' );
        const template = document.createElement( 'template' );
        const inText = texts.filter( ( text ) => {
            area.innerHTML = text.replace( /</g, '&lt;' );
            // Its text as read, not its value, which writes a carriage return as a line feed.
            return c.pageText( text ) !== area.textContent;
        } );
        const inAttribute = texts.filter( ( text ) => ! text.includes( '"' ) ).filter( ( text ) => {
            template.innerHTML = `<i title="${ text }"></i>`;
            return c.pageText( text, true ) !== ( template.content.firstChild as Element ).getAttribute( 'title' );
        } );
        // The browser read the names: a rare one decodes, which the names kept without a document do not hold.
        return { count: texts.length, decoded, plain, inText, inAttribute, eacute: c.decodeEntities( '&eacute;&ltcc;&notit;' ), url: c.pageText( '?a=1&copy=2&copyx&reg', true ) };
    } );

    expect( result.count ).toBeGreaterThan( 20_000 );
    expect( result.decoded ).toEqual( [] );
    expect( result.plain ).toEqual( [] );
    expect( result.inText ).toEqual( [] );
    expect( result.inAttribute ).toEqual( [] );
    expect( result.url ).toBe( '?a=1&copy=2&copyx®' );
    expect( result.eacute ).toBe( 'é⪦¬it;' );
} );
