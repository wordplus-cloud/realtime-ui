// npx @wordplus/realtime-ui (bin/realtime-ui.mjs), run in an app of its own made for each test: add copies a view with
// its tests and records it, diff shows what changed in ours since, update takes ours only where the app never changed a
// file, accept records a merge, a page without React gets its own elements script, and preview builds with the app's
// copies in place of ours. Needs the package built (npm test builds it first).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const bin = join( dirname( fileURLToPath( import.meta.url ) ), '..', 'bin', 'realtime-ui.mjs' );
// The package's version, which the copies are recorded at.
const VERSION: string = JSON.parse( readFileSync( join( dirname( bin ), '..', 'package.json' ), 'utf8' ) ).version;
const apps: string[] = [];

afterEach( () => {
    for ( const app of apps.splice( 0 ) ) rmSync( app, { recursive: true, force: true } );
} );

function app( dependencies: Record<string, string> = { react: '19.2.3' } ) {
    const dir = mkdtempSync( join( tmpdir(), 'wordplus-ui-app-' ) );
    apps.push( dir );
    writeFileSync( join( dir, 'package.json' ), JSON.stringify( { name: 'shop', private: true, dependencies } ) );
    return dir;
}

const run = ( dir: string, ...args: string[] ) => execFileSync( process.execPath, [ bin, ...args ], { cwd: dir, encoding: 'utf8' } );
const read = ( dir: string, file: string ) => readFileSync( join( dir, file ), 'utf8' );
const config = ( dir: string ) => JSON.parse( read( dir, 'wordplus-ui.json' ) );

/** Pretends ours of `file` was something else when the app copied it, as an older version of the package had it. */
function olderOurs( dir: string, component: string, file: string, then: string, yoursToo: boolean ) {
    const base = JSON.parse( read( dir, `.wordplus-ui/${ component }.json` ) );
    base[ file ] = then;
    writeFileSync( join( dir, `.wordplus-ui/${ component }.json` ), JSON.stringify( base ) );
    const record = config( dir );
    record.components[ component ].files[ file ] = { version: '0.9.0', sha256: createHash( 'sha256' ).update( then ).digest( 'hex' ) };
    writeFileSync( join( dir, 'wordplus-ui.json' ), JSON.stringify( record ) );
    if ( yoursToo ) writeFileSync( join( dir, 'components/wordplus', component, file ), then );
}

describe( 'npx @wordplus/realtime-ui', () => {
    it( 'copies a view with its tests, its imports the package\'s entries, and records each file', () => {
        const dir = app();
        const said = run( dir, 'add', 'chat' );

        expect( said ).toContain( 'chat: copied into components/wordplus/chat/' );
        expect( said ).toContain( '<Chat rt={ rt } room="chat:34:42" />' );
        const view = read( dir, 'components/wordplus/chat/chat.tsx' );
        expect( view.startsWith( '"use client";' ) ).toBe( true );
        expect( view ).toContain( "from '@wordplus/realtime-ui/react'" );
        expect( view ).not.toMatch( /from ['"]\.\.?\/(sdk|components|inc)\// );
        expect( read( dir, 'components/wordplus/chat/chat.test.tsx' ) ).toContain( "from '@wordplus/realtime-ui/testing'" );
        expect( read( dir, 'components/wordplus/chat/index.ts' ) ).toContain( "export { Chat } from './chat'" );

        expect( Object.keys( config( dir ).components.chat.files ).sort() ).toEqual( [ 'chat.test.tsx', 'chat.tsx', 'index.ts' ] );
        expect( JSON.parse( read( dir, '.wordplus-ui/chat.json' ) )[ 'chat.tsx' ] ).toBe( view );

        // Added again, it keeps yours unless told.
        writeFileSync( join( dir, 'components/wordplus/chat/chat.tsx' ), view + '\n// mine\n' );
        expect( run( dir, 'add', 'chat' ) ).toContain( 'already in components/wordplus/chat' );
        expect( read( dir, 'components/wordplus/chat/chat.tsx' ) ).toContain( '// mine' );
    } );

    it( 'shows what changed in ours since the copy, and takes ours only into the files the app never changed', () => {
        const dir = app();
        run( dir, 'add', 'call-screen' );
        expect( run( dir, 'diff' ) ).toContain( 'Nothing changed in ours' );

        // Ours changed in two files since an older copy: the app changed one of them, not the other.
        const ringNow = read( dir, 'components/wordplus/call-screen/incoming-call-card.tsx' );
        const dockNow = read( dir, 'components/wordplus/call-screen/call-dock.tsx' );
        olderOurs( dir, 'call-screen', 'incoming-call-card.tsx', ringNow.replace( 'Incoming Video Call', 'Video call for you' ), true );
        olderOurs( dir, 'call-screen', 'call-dock.tsx', dockNow.replace( 'kept to ONE row', 'kept to one row' ), false );
        writeFileSync( join( dir, 'components/wordplus/call-screen/call-dock.tsx' ), dockNow.replace( 'kept to ONE row', 'kept to one row' ) + '\n// my dock\n' );

        const diff = run( dir, 'diff', 'call-screen' );
        expect( diff ).toContain( `=== call-screen/incoming-call-card.tsx: ours changed since 0.9.0 (now ${ VERSION }); yours is as copied: \`update\` takes ours` );
        expect( diff ).toContain( '-                    { type === \'video\' && <>{ _x( \'Video call for you\'' );
        expect( diff ).toContain( '+                    { type === \'video\' && <>{ _x( \'Incoming Video Call\'' );
        expect( diff ).toContain( `=== call-screen/call-dock.tsx: ours changed since 0.9.0 (now ${ VERSION }); yours changed too: merge by hand` );
        expect( diff ).toMatch( /@@ -\d+,\d+ \+\d+,\d+ @@/ );

        const updated = run( dir, 'update' );
        expect( updated ).toContain( `incoming-call-card.tsx: you never changed it: now ours of ${ VERSION }` );
        expect( updated ).toContain( 'call-dock.tsx: yours changed, and so did ours' );
        expect( read( dir, 'components/wordplus/call-screen/incoming-call-card.tsx' ) ).toBe( ringNow );
        expect( read( dir, 'components/wordplus/call-screen/call-dock.tsx' ) ).toContain( '// my dock' );

        // The app merges ours into its dock and says so.
        writeFileSync( join( dir, 'components/wordplus/call-screen/call-dock.tsx' ), dockNow + '\n// my dock\n' );
        expect( run( dir, 'accept', 'call-screen' ) ).toContain( `call-screen: yours has ours of ${ VERSION }` );
        expect( run( dir, 'diff' ) ).toContain( 'Nothing changed in ours' );
        expect( read( dir, 'components/wordplus/call-screen/call-dock.tsx' ) ).toContain( '// my dock' );
    } );

    it( 'gives a page without React its own elements script, with its copies, and says how to load it', () => {
        const dir = app( {} );
        const said = run( dir, 'add', 'online-list', 'chat' );

        expect( said ).toContain( 'wordplus-ui.elements.tsx' );
        expect( said ).toContain( "connect( { ui: '/realtime-ui.js' } )" );
        const entry = read( dir, 'wordplus-ui.elements.tsx' );
        expect( entry ).toContain( "import { setViews, start } from '@wordplus/realtime-ui/elements';" );
        expect( entry ).toContain( "import { OnlineList, Typing, OnlineCount } from './components/wordplus/online-list';" );
        expect( entry ).toContain( "import { Chat } from './components/wordplus/chat';" );
        expect( entry ).toContain( 'setViews( { OnlineList, Typing, OnlineCount, Chat } );' );
        expect( read( dir, 'wordplus-ui.build.mjs' ) ).toContain( "globalName: 'wordplusRealtimeUi'" );
    } );

    it( 'builds the preview with the app\'s copies in place of ours', () => {
        const dir = app();
        run( dir, 'add', 'call-screen' );
        const view = join( dir, 'components/wordplus/call-screen/private-call.tsx' );
        writeFileSync( view, read( dir, 'components/wordplus/call-screen/private-call.tsx' ).replace( "'Calling...'", "'Ringing Ann...'" ) );

        expect( run( dir, 'preview', '--out', join( dir, 'preview' ) ) ).toContain( 'The preview, built into' );
        const script = read( dir, 'preview/preview.js' );
        expect( script ).toContain( 'Ringing Ann...' );
        expect( script ).not.toContain( 'Calling...' );
        expect( existsSync( join( dir, 'preview/index.html' ) ) ).toBe( true );
        expect( existsSync( join( dir, 'preview/ui.css' ) ) ).toBe( true );
    }, 60_000 );

    it( 'builds the preview with the app\'s own pieces, styles and page classes, and keeps them for the next run', () => {
        const dir = app();
        writeFileSync( join( dir, 'calls.tsx' ), [
            "import { CallControl, type Pieces } from '@wordplus/realtime-ui/react';",
            "export const shopPieces: Pieces = { controls: ( buttons ) => [ ...buttons, <CallControl key=\"order\" icon=\"cart\" label=\"Order shown\" onClick={ () => {} } /> ] };",
        ].join( '\n' ) );
        writeFileSync( join( dir, 'shop.css' ), '.shop .wplus-call-buttons > * { border-radius: 50%; }\n' );

        run( dir, 'preview', '--out', join( dir, 'preview' ), '--pieces', 'calls.tsx#shopPieces', '--css', 'shop.css', '--class', 'shop' );
        expect( read( dir, 'preview/preview.js' ) ).toContain( 'Order shown' );
        expect( read( dir, 'preview/preview.js' ) ).toContain( '"shop"' );
        expect( read( dir, 'preview/app.css' ) ).toContain( '.shop .wplus-call-buttons > *' );
        expect( read( dir, 'preview/index.html' ) ).toContain( '<link rel="stylesheet" href="app.css">' );
        expect( config( dir ).preview ).toEqual( { pieces: 'calls.tsx#shopPieces', css: [ 'shop.css' ], class: 'shop' } );

        // The next run takes them from wordplus-ui.json.
        rmSync( join( dir, 'preview' ), { recursive: true } );
        run( dir, 'preview', '--out', join( dir, 'preview' ) );
        expect( read( dir, 'preview/preview.js' ) ).toContain( 'Order shown' );
        expect( existsSync( join( dir, 'preview/app.css' ) ) ).toBe( true );
    }, 60_000 );

    it( 'names the components, and refuses one there is not', () => {
        const dir = app();
        expect( run( dir, 'list' ) ).toMatch( /call-screen[\s\S]*online-list[\s\S]*chat/ );
        expect( () => run( dir, 'add', 'nope' ) ).toThrow( /no such component/ );
    } );
} );
