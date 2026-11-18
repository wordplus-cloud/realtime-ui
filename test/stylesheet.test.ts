// @vitest-environment node
// styles/compile.mjs, the package's way of compiling the stylesheet of the parts an app takes (K9 of the slimming of
// 2026-10-31), which scripts/build.mjs builds dist/*.css and the elements' stylesheet with: the same chat stylesheet the
// build wrote, under an app's own names as Better Messages' build names them, and on a shadow root's host.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { compileStylesheet, hostOf, prefixed, usedRules, usedTokens, wordsOf } from '../styles/compile.mjs';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const files = ( dir: string ): string[] => readdirSync( dir ).flatMap( ( name ) => statSync( join( dir, name ) ).isDirectory() ? files( join( dir, name ) ) : [ join( dir, name ) ] );
const sources = files( join( root, 'src' ) ).map( ( file ) => readFileSync( file, 'utf8' ) ).join( '\n' );
const CHAT = [ 'chat/messages', 'chat/reactions', 'chat/composer', 'chat/attachments', 'chat/chat' ];

it( 'compiles the chat\'s stylesheet the build wrote, tokens and all', async () => {
    const css = await compileStylesheet( { parts: CHAT, reads: sources } );
    expect( css ).toBe( readFileSync( join( root, 'dist/chat.css' ), 'utf8' ) );
}, 60_000 );

it( 'names it as an app names the package\'s names, as Better Messages\' build does', async () => {
    const plain = await compileStylesheet( { parts: [ 'chat/messages', 'chat/reactions' ] } );
    const named = await compileStylesheet( { parts: [ 'chat/messages', 'chat/reactions' ], prefix: 'wps' } );
    expect( named ).not.toMatch( /wplus-/ );
    expect( named ).toMatch( /--wps-color-accent/ );
    expect( named ).toMatch( /\.wps-msg-body/ );
    expect( named ).toBe( prefixed( plain, 'wps' ) );

    // Better Messages' toMessenger() (src/webpack-realtime-ui.js), for `bm-`: the same over every source and stylesheet.
    const toMessenger = ( source: string ) => source
        .replace( /--wplus-(?=[a-z0-9])/g, '--bm-' )
        .replace( /data-wplus-(?=[a-z0-9])/g, 'data-bm-' )
        .replace( /(?<![\w-])wplus-(?=[a-z0-9])/g, 'bm-' );
    const everything = sources + files( join( root, 'styles' ) ).filter( ( file ) => file.endsWith( '.scss' ) ).map( ( file ) => readFileSync( file, 'utf8' ) ).join( '\n' );
    expect( prefixed( everything, 'bm' ) ).toBe( toMessenger( everything ) );
    expect( prefixed( everything, 'wplus' ) ).toBe( everything );
}, 60_000 );

it( 'puts the tokens on a shadow root\'s host, light and dark as its data-scheme says', async () => {
    const css = await compileStylesheet( { parts: [ 'chat/messages' ], prefix: 'wps', host: true } );
    const page = await compileStylesheet( { parts: [ 'chat/messages' ], prefix: 'wps' } );
    // The tokens, as the elements' stylesheet has them (scripts/build.mjs): the parts' own rules as they are.
    expect( css ).toBe( hostOf( page.slice( 0, page.indexOf( '\n.wps-' ) ), 'wps' ) + page.slice( page.indexOf( '\n.wps-' ) ) );
    expect( css.slice( 0, css.indexOf( '\n.wps-' ) ) ).not.toMatch( /:root\b|body/ );
    expect( css ).toMatch( /^:host\s*\{/ );
    expect( css ).toMatch( /:host\(\[data-scheme="dark"\]\)/ );
    expect( hostOf( 'body.wps-messages-dark { --a: 1; }', 'wps' ) ).toBe( ':host([data-scheme="dark"]) { --a: 1; }' );
}, 60_000 );

it( 'keeps the tokens the stylesheet reads, and those they read, and no other', () => {
    const tokens = ':root {\n  --a: var(--b);\n  --b: 1px;\n  --c: 2px;\n}\nbody.x {\n  --c: 3px;\n}';
    expect( usedTokens( tokens, '.p { margin: var(--a); }' ) ).toBe( ':root {\n  --a: var(--b);\n  --b: 1px;\n}' );
} );

// `uses`, for an app that takes a few parts and wants only their rules (Live Support's visitor panel, under a budget):
// the rules whose classes its code names, and the tokens those read.
it( 'takes the words of an app\'s code, and the stems of the names it completes', () => {
    const { words, stems } = wordsOf( 'e("div",{className:"wps-msg-body wps-message"}),"wps-hover-actions__btn--"+m,`wps-dock-${x}`,"wps-",a-b' );
    expect( [ ...words ] ).toEqual( expect.arrayContaining( [ 'wps-msg-body', 'wps-message', 'className', 'wps-hover-actions__btn--', 'wps-dock-', 'wps-', 'a-b' ] ) );
    expect( stems ).toEqual( [ 'wps-hover-actions__btn--', 'wps-dock-' ] );
} );

it( 'keeps the rules whose classes the code names, and the animations they run', () => {
    const css = [
        '.a {\n  color: red;\n}',
        '.a .b,\n.a .c {\n  margin: 0;\n}',
        '.a:not(.gone) [data-x=".gone"] {\n  padding: 0;\n}',
        '.a:is(.gone) {\n  top: 0;\n}',
        '.gone > .a {\n  left: 0;\n}',
        '.a:not(#\\9) {\n  border-radius: 4px;\n}',
        '.k-btn--big {\n  font-size: 2em;\n}',
        '@media (hover: hover) {\n  .gone:hover {\n    color: blue;\n  }\n  .a:hover {\n    color: green;\n  }\n}',
        '@media print {\n  .gone {\n    display: none;\n  }\n}',
        '@keyframes spin {\n  from {\n    opacity: 0;\n  }\n}',
        '@keyframes left {\n  to {\n    opacity: 1;\n  }\n}',
        '.c {\n  animation: spin 1s infinite;\n}',
        '@font-face {\n  font-family: x;\n}',
    ].join( '\n' ) + '\n';

    const kept = usedRules( css, 'el("a b"), "k-btn--" + size, c' );
    expect( kept ).toBe( [
        '.a {\n  color: red;\n}',
        '.a .b,\n.a .c {\n  margin: 0;\n}',
        '.a:not(.gone) [data-x=".gone"] {\n  padding: 0;\n}',
        '.a:is(.gone) {\n  top: 0;\n}',
        '.a:not(#\\9) {\n  border-radius: 4px;\n}',
        '.k-btn--big {\n  font-size: 2em;\n}',
        '@media (hover: hover) {\n  .a:hover {\n    color: green;\n  }\n}',
        '@keyframes spin {\n  from {\n    opacity: 0;\n  }\n}',
        '.c {\n  animation: spin 1s infinite;\n}',
        '@font-face {\n  font-family: x;\n}',
    ].join( '\n' ) + '\n' );
    // A list keeps the selectors that stay.
    expect( usedRules( '.a .b,\n.a .c {\n  margin: 0;\n}\n', 'a c' ) ).toBe( '.a .c {\n  margin: 0;\n}\n' );
    // Every rule, when the code names every class.
    expect( usedRules( css, 'a b c gone k-btn--big' ) ).toBe( css.replace( /@keyframes left \{\n {2}to \{\n {4}opacity: 1;\n {2}\}\n\}\n/, '' ) );
} );

it( 'gives the floater\'s look as a part of its own, the one the elements\' stylesheet takes', async () => {
    const part = await compileStylesheet( { parts: [ 'chat/tooltip' ], prefix: 'wps', host: true } );
    expect( part ).toContain( '.realtime-tooltip {' );
    expect( part ).toContain( 'background: rgba(var(--wps-tooltip-bg, 17, 24, 39), 1);' );
    expect( part ).not.toMatch( /wplus-/ );
    // Where the floater draws: the rule stays with the code that names its class, and goes without it.
    expect( await compileStylesheet( { parts: [ 'chat/tooltip' ], prefix: 'wps', uses: 'box.className = "realtime-tooltip"' } ) ).toContain( '.realtime-tooltip {' );
    expect( await compileStylesheet( { parts: [ 'chat/tooltip' ], prefix: 'wps', uses: 'nothing' } ) ).not.toContain( '.realtime-tooltip' );
    const elements = readFileSync( join( root, 'styles/_elements.scss' ), 'utf8' );
    expect( elements ).toContain( '@import "chat/tooltip";' );
    expect( elements ).not.toContain( '.realtime-tooltip {' );
}, 60_000 );

it( 'gives IconButton its look as a part of its own, which no other part imports, Better Messages styling its own', async () => {
    const part = await compileStylesheet( { parts: [ 'chat/icon-button' ], prefix: 'wps', host: true, uses: 'wps-icon-btn' } );
    // Send in the accent, the others quiet with a hover under them, as Better Messages draws them.
    expect( part ).toMatch( /\.wps-icon-btn\[data-emphasis=accent\] \{\s*background: rgba\(var\(--wps-color-accent\), 1\);\s*color: rgba\(var\(--wps-color-text-on-accent\), 1\);/ );
    expect( part ).toContain( '.wps-icon-btn[data-emphasis=none]:not(:disabled):not([aria-disabled=true]):hover {' );
    expect( part ).toContain( '--wps-radius-button:' );
    expect( part ).not.toMatch( /wplus-/ );
    // None of the parts Better Messages imports (the chat's, presence's and the calls') brings it, nor the elements'.
    for ( const file of files( join( root, 'styles' ) ).filter( ( name ) => name.endsWith( '.scss' ) && ! name.endsWith( '_icon-button.scss' ) ) ) {
        expect( readFileSync( file, 'utf8' ), file ).not.toMatch( /@(import|use|forward)[^;]*icon-button/ );
    }
}, 60_000 );

it( 'sizes an avatar\'s letters by the avatar\'s own size, in the shape of every avatar, the picture over them', async () => {
    const part = await compileStylesheet( { parts: [ 'presence/presence' ], prefix: 'wps', host: true, uses: 'wps-avatar-wrap wps-avatar-letters wps-avatar-letters__picture' } );
    // The face's wrap as tall as the face, so a row that stretches what it holds leaves the dot at the face's corner.
    expect( part ).toMatch( /\.wps-avatar-wrap \{[^}]*height: max-content;/ );
    expect( part ).toMatch( /\.wps-avatar-letters \{\s*position: relative;[^}]*font-size: calc\(var\(--wps-avatar-size, 36px\) \* 0\.38\);/ );
    expect( part ).toMatch( /\.wps-avatar-letters:not\(#\\9 ?\) \{\s*border-radius: var\(--wps-radius-avatar\);/ );
    expect( part ).toMatch( /\.wps-avatar-letters__picture \{\s*position: absolute;\s*inset: 0;\s*object-fit: cover;\s*border-radius: inherit;/ );
    expect( part ).not.toMatch( /wplus-/ );
}, 60_000 );

it( 'leaves out the colour zones for an app that colours its chat as one surface, the colours read as they were', async () => {
    // What Live Support's panel draws of the composer: the row, its field and Send.
    const uses = 'wps-composer wps-composer__row wps-composer__editor wps-editor wps-editor-content wps-composer__editable wps-icon-btn';
    const zoned = await compileStylesheet( { parts: [ 'chat/composer' ], prefix: 'wps', host: true, uses } );
    const plain = await compileStylesheet( { parts: [ 'chat/composer' ], prefix: 'wps', host: true, uses, zones: false } );
    const tokens = ( css: string ) => new Set( [ ...css.matchAll( /^\s+(--wps-[a-z0-9-]+):/gm ) ].map( ( m ) => m[ 1 ] ) );

    // Better Messages' reply area points the colours at its zone's, each of which reads the colour itself.
    expect( zoned ).toContain( '--wps-color-bg: var(--wps-zone-reply-bg);' );
    expect( zoned ).toContain( '--wps-zone-reply-bg: var(--wps-color-bg);' );
    expect( plain ).not.toMatch( /--wps-zone-/ );
    expect( tokens( plain ).size ).toBeLessThan( tokens( zoned ).size - 50 );
    // The same rules read the same colours, from the host now.
    expect( plain ).toMatch( /\.wps-composer \{[^}]*background: rgba\(var\(--wps-color-composer-bg\), 1\)/ );
    expect( tokens( plain ).has( '--wps-color-composer-bg' ) ).toBe( true );
    expect( plain.length ).toBeLessThan( zoned.length / 2 );
}, 60_000 );

it( 'keeps the typing dots still where motion is asked to be reduced, as the durations\' tokens are there', async () => {
    const css = await compileStylesheet( { parts: [ 'presence/presence' ], prefix: 'wps', uses: 'wps-typing-dots wps-typing-dots__dot' } );
    expect( css ).toMatch( /animation: wps-typing / );
    expect( css ).toMatch( /@media \(prefers-reduced-motion: reduce\) \{\s*\.wps-typing-dots__dot \{\s*animation: none;\s*\}\s*\}/ );
}, 60_000 );

it( 'compiles only the rules and tokens of the parts an app\'s code draws', async () => {
    // What a list of a day, a system line and one message draws: the classes its parts write.
    const code = prefixed( readFileSync( join( root, 'src/components/chat/message-parts.tsx' ), 'utf8' ), 'wps' );
    const used = code.slice( code.indexOf( 'export function DaySeparator' ), code.indexOf( '// ─── HOVER ACTIONS' ) );
    const whole = await compileStylesheet( { parts: [ 'chat/messages' ], prefix: 'wps', host: true } );
    const cut = await compileStylesheet( { parts: [ 'chat/messages' ], prefix: 'wps', host: true, uses: used } );

    expect( cut.length ).toBeLessThan( whole.length / 2 );
    for ( const rule of [ '.wps-day-sep {', '.wps-system-row {', '.wps-msg-stack {', '.wps-msg-body {', '.wps-msg-bubble {', '.wps-msg-meta {', '.wps-msg-status' ] ) {
        expect( cut ).toContain( rule );
    }
    for ( const gone of [ '.wps-hover-actions', '.wps-empty-thread', '.wps-typing-pinned', '.wps-sticker', '@keyframes wps-msg-in' ] ) {
        expect( cut ).not.toContain( gone );
    }
    // The tokens are those the rules kept read: fewer, and none that no rule kept reads.
    const tokens = ( css: string ) => new Set( [ ...css.matchAll( /^\s+(--wps-[a-z0-9-]+):/gm ) ].map( ( m ) => m[ 1 ] ) );
    expect( tokens( cut ).size ).toBeLessThan( tokens( whole ).size );
    expect( cut ).toBe( hostOf( usedTokens( whole.slice( 0, whole.indexOf( '\n.wps-' ) ), cut.slice( cut.indexOf( '\n.wps-' ) ) ), 'wps' ) + cut.slice( cut.indexOf( '\n.wps-' ) ) );
}, 60_000 );
