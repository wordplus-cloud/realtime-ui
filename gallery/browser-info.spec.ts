import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, expect, test } from '@playwright/test';

// The eleven questions about the browser (src/inc/functions/browser-info.ts) asked of a real navigator, as Playwright's
// devices give it: its user agent, its User-Agent Client Hints where Chromium has them, its touch points. The answers
// must be ua-parser-js's, which gave them until 2026-10-31 (test/browser-info-corpus.test.ts holds the same over the
// corpus of user agents, with the navigators faked).
const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const DEVICES = [ 'Desktop Chrome', 'Desktop Safari', 'Desktop Firefox', 'Pixel 7', 'Galaxy S9+', 'iPhone 15', 'iPhone 12', 'iPad Pro 11', 'Galaxy Tab S4' ];

let script = '';
test.beforeAll( async () => {
    const bundled = await build( {
        stdin: {
            contents: `
                import UAParser from 'ua-parser-js';
                import { QUESTIONS, elevenOf } from './test/corpus/browser-info-before.ts';
                import * as now from './src/inc/functions/browser-info.ts';
                window.answers = () => {
                    const parser = new UAParser();
                    const before = elevenOf( { device: parser.getDevice(), os: parser.getOS(), browser: parser.getBrowser() } );
                    return { before, now: Object.fromEntries( QUESTIONS.map( ( question ) => [ question, now[ question ]() ] ) ) };
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
    script = bundled.outputFiles[ 0 ].text;
} );

for ( const device of DEVICES ) {
    test( `answers as ua-parser-js did on ${ device }`, async ( { browser }, info ) => {
        test.skip( info.project.name === 'phone', 'the devices are emulated here: once is enough' );
        const { defaultBrowserType: _, ...emulated } = devices[ device ];
        const context = await browser.newContext( emulated );
        const page = await context.newPage();
        await page.setContent( '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' );
        await page.addScriptTag( { content: script } );
        const { before, now } = await page.evaluate( () => ( window as unknown as { answers: () => { before: object; now: object } } ).answers() );
        expect( now ).toEqual( before );
        await context.close();
    } );
}
