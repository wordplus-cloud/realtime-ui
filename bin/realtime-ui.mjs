#!/usr/bin/env node
// npx @wordplus/realtime-ui: an app's own copies of the package's views.
//
//   add <component…>       copies the view into the app, with its tests: components/wordplus/<component>/ by default
//   list                   the components there are, and those the app has
//   diff [component…]      what changed in ours since each copy was taken, to merge into the app's version
//   update [component…]    takes ours into every file the app never changed; the rest is left to merge (diff)
//   accept <component…>    records that the app's copy now has ours (after merging what diff showed)
//   preview                serves every component in every state, the app's copies in place of ours, with the app's own
//                          pieces, stylesheets and page classes where it names them (--pieces, --css, --class; kept in
//                          wordplus-ui.json for the next run)
//
// Only the view is copied: what runs it stays in the package (usePrivateCall, useGroupCall, useChat, useRoom), so the
// engine's fixes still reach the app. wordplus-ui.json records each copied file's version and the hash of ours as it
// was copied, and .wordplus-ui/<component>.json keeps ours as it was, which diff compares with ours now. Nothing
// changes an app's copy but update, and update only where the app never changed it.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const pkg = JSON.parse( readFileSync( join( PACKAGE, 'package.json' ), 'utf8' ) );
const VIEWS = join( PACKAGE, 'dist', 'views' );
const CONFIG = 'wordplus-ui.json';
const BASE = '.wordplus-ui';
const ELEMENTS_ENTRY = 'wordplus-ui.elements.tsx';
const ELEMENTS_BUILD = 'wordplus-ui.build.mjs';
const MADE = '// Made by npx @wordplus/realtime-ui add, which writes it again while this line is here.';

const out = ( line = '' ) => process.stdout.write( line + '\n' );
const fail = ( message ) => {
    process.stderr.write( message + '\n' );
    process.exit( 1 );
};

if ( ! existsSync( join( VIEWS, 'manifest.json' ) ) ) fail( `${ pkg.name }: dist/views is missing. Build the package first (npm run build).` );
const manifest = JSON.parse( readFileSync( join( VIEWS, 'manifest.json' ), 'utf8' ) );

// ------------------------------------------------------------------------------------------------- the app's side

/** The app: the nearest folder with a package.json above where the command runs, never inside node_modules. */
function appRoot() {
    for ( let dir = process.cwd(); ; dir = dirname( dir ) ) {
        if ( existsSync( join( dir, 'package.json' ) ) && ! dir.split( /[/\\]/ ).includes( 'node_modules' ) ) return dir;
        if ( dirname( dir ) === dir ) return process.cwd();
    }
}

const root = appRoot();
const sha = ( text ) => createHash( 'sha256' ).update( text ).digest( 'hex' );
const readConfig = () => existsSync( join( root, CONFIG ) ) ? JSON.parse( readFileSync( join( root, CONFIG ), 'utf8' ) ) : { dir: 'components/wordplus', components: {} };
const writeConfig = ( config ) => writeFileSync( join( root, CONFIG ), JSON.stringify( config, null, 2 ) + '\n' );
const baseFile = ( component ) => join( root, BASE, component + '.json' );
const readBase = ( component ) => existsSync( baseFile( component ) ) ? JSON.parse( readFileSync( baseFile( component ), 'utf8' ) ) : {};
const writeBase = ( component, base ) => {
    mkdirSync( join( root, BASE ), { recursive: true } );
    writeFileSync( baseFile( component ), JSON.stringify( base, null, 1 ) + '\n' );
};
/** Ours now: a file of the component as this version of the package has it, or null where it has none. */
const oursNow = ( component, file ) => existsSync( join( VIEWS, component, file ) ) ? readFileSync( join( VIEWS, component, file ), 'utf8' ) : null;
const filesOf = ( component ) => [ ...manifest.components[ component ].files, ...manifest.components[ component ].tests ];
/** Whether the app draws with React itself (else its pages take the elements, built with its copies). */
const usesReact = () => {
    try {
        const app = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) );
        return !! ( app.dependencies?.react || app.devDependencies?.react || app.peerDependencies?.react );
    } catch {
        return false;
    }
};
/** Whether a package can be imported from the app. */
const resolvable = ( name ) => {
    try {
        createRequire( join( root, 'package.json' ) ).resolve( name );
        return true;
    } catch {
        return false;
    }
};

function named( list ) {
    if ( ! list.length ) fail( `Name a component: ${ Object.keys( manifest.components ).join( ', ' ) }.` );
    for ( const name of list ) if ( ! manifest.components[ name ] ) fail( `${ name }: no such component. There are ${ Object.keys( manifest.components ).join( ', ' ) }.` );
    return list;
}

function taken( list ) {
    const config = readConfig();
    const names = list.length ? list : Object.keys( config.components );
    if ( ! names.length ) fail( `No copy here yet: npx ${ pkg.name } add <component>.` );
    for ( const name of names ) if ( ! config.components[ name ] ) fail( `${ name } was never added here (${ CONFIG } has no record of it).` );
    return { config, names };
}

// ------------------------------------------------------------------------------------------------------- commands

function add( args ) {
    const force = args.includes( '--force' );
    const dirFlag = args.indexOf( '--dir' );
    const config = readConfig();
    if ( dirFlag >= 0 ) config.dir = args[ dirFlag + 1 ] ?? fail( '--dir needs a folder.' );
    const names = named( args.filter( ( a, i ) => ! a.startsWith( '--' ) && args[ i - 1 ] !== '--dir' ) );

    for ( const name of names ) {
        const target = join( root, config.dir, name );
        if ( config.components[ name ] && ! force ) {
            out( `${ name }: already in ${ relative( root, target ) }. \`npx ${ pkg.name } diff ${ name }\` shows what changed in ours since; --force copies it again over yours.` );
            continue;
        }
        mkdirSync( target, { recursive: true } );
        const base = {};
        const files = {};
        for ( const file of filesOf( name ) ) {
            const text = oursNow( name, file );
            writeFileSync( join( target, file ), text );
            base[ file ] = text;
            files[ file ] = { version: manifest.version, sha256: sha( text ) };
        }
        config.components[ name ] = { files };
        writeBase( name, base );
        out( `${ name }: copied into ${ relative( root, target ) }/ (${ manifest.components[ name ].files.length } files and the tests). It is yours now.` );
        out( `  ${ manifest.components[ name ].about }` );
    }
    writeConfig( config );

    const react = usesReact();
    out();
    if ( react ) {
        out( 'Draw it in place of ours:' );
        for ( const name of names ) out( `  ${ name }: import { … } from './${ config.dir }/${ name }';  ${ manifest.components[ name ].react }` );
    } else {
        writeElements( config );
        out( `Your own elements script, with your copies: ${ ELEMENTS_ENTRY } (built by \`node ${ ELEMENTS_BUILD }\` into ${ elementsOut() }).` );
        out( `Load it in place of ours: connect( { ui: '/realtime-ui.js' } ), or name it realtime-ui.min.js beside the worker.` );
    }

    const needed = [ 'react', 'react-dom', ...( react ? [] : [ 'esbuild' ] ), 'vitest', '@testing-library/react', 'happy-dom' ].filter( ( name ) => ! resolvable( name ) );
    if ( needed.length ) out( `\nFor the copies and their tests: npm i -D ${ needed.join( ' ' ) }` );
    out( `Check a change: npx vitest run ${ config.dir }  ·  see every state: npx ${ pkg.name } preview` );
}

function list() {
    const config = readConfig();
    for ( const [ name, component ] of Object.entries( manifest.components ) ) {
        const mine = config.components[ name ];
        out( `${ name }${ mine ? `  (yours, in ${ config.dir }/${ name })` : '' }` );
        out( `  ${ component.about }` );
    }
}

/** Each file of a copy: ours as copied, ours now, the app's now, and what that makes it. */
function states( config, name ) {
    const base = readBase( name );
    const files = new Set( [ ...Object.keys( config.components[ name ].files ), ...filesOf( name ) ] );
    return [ ...files ].map( ( file ) => {
        const record = config.components[ name ].files[ file ];
        const then = base[ file ] ?? null;
        const now = oursNow( name, file );
        const path = join( root, config.dir, name, file );
        const yours = existsSync( path ) ? readFileSync( path, 'utf8' ) : null;
        return {
            file, record, then, now, yours, path,
            oursChanged: then !== now,
            yoursChanged: yours !== null && record ? sha( yours ) !== record.sha256 : yours !== null,
        };
    } );
}

function diff( args ) {
    const { config, names } = taken( args.filter( ( a ) => ! a.startsWith( '--' ) ) );
    let changes = 0;
    for ( const name of names ) {
        for ( const s of states( config, name ) ) {
            if ( ! s.oursChanged ) continue;
            changes++;
            const from = s.record ? s.record.version : 'none';
            out( `\n=== ${ name }/${ s.file }: ours changed since ${ from } (now ${ manifest.version })${ s.yoursChanged ? '; yours changed too: merge by hand' : '; yours is as copied: `update` takes ours' }` );
            if ( s.then === null ) out( '(new in ours)' );
            if ( s.now === null ) out( '(no longer in ours)' );
            out( unified( s.then ?? '', s.now ?? '', `ours@${ from }/${ s.file }`, `ours@${ manifest.version }/${ s.file }` ) );
        }
    }
    out( changes
        ? `\n${ changes } file(s) changed in ours. Merge each into yours, run its tests, then \`npx ${ pkg.name } accept <component>\`.`
        : `Nothing changed in ours since your copies (${ pkg.name } ${ manifest.version }).` );
}

function update( args ) {
    const { config, names } = taken( args.filter( ( a ) => ! a.startsWith( '--' ) ) );
    for ( const name of names ) {
        const base = readBase( name );
        for ( const s of states( config, name ) ) {
            if ( ! s.oursChanged ) continue;
            if ( s.yoursChanged ) {
                out( `${ name }/${ s.file }: yours changed, and so did ours: \`npx ${ pkg.name } diff ${ name }\` shows ours to merge.` );
                continue;
            }
            if ( s.now === null ) {
                rmSync( s.path, { force: true } );
                delete base[ s.file ];
                delete config.components[ name ].files[ s.file ];
                out( `${ name }/${ s.file }: gone from ours, and you never changed it: removed.` );
                continue;
            }
            mkdirSync( dirname( s.path ), { recursive: true } );
            writeFileSync( s.path, s.now );
            base[ s.file ] = s.now;
            config.components[ name ].files[ s.file ] = { version: manifest.version, sha256: sha( s.now ) };
            out( `${ name }/${ s.file }: you never changed it: now ours of ${ manifest.version }.` );
        }
        writeBase( name, base );
    }
    writeConfig( config );
}

function accept( args ) {
    const fileFlag = args.indexOf( '--file' );
    const only = fileFlag >= 0 ? args[ fileFlag + 1 ] : null;
    const { config, names } = taken( named( args.filter( ( a, i ) => ! a.startsWith( '--' ) && args[ i - 1 ] !== '--file' ) ) );
    for ( const name of names ) {
        const base = readBase( name );
        for ( const s of states( config, name ) ) {
            if ( only && s.file !== only ) continue;
            if ( s.now === null ) {
                delete base[ s.file ];
                delete config.components[ name ].files[ s.file ];
                continue;
            }
            base[ s.file ] = s.now;
            // The hash of ours as accepted: a file of yours equal to it counts as unchanged by you from here on.
            config.components[ name ].files[ s.file ] = { version: manifest.version, sha256: sha( s.now ) };
            if ( s.yours === null ) {
                mkdirSync( dirname( s.path ), { recursive: true } );
                writeFileSync( s.path, s.now );
                out( `${ name }/${ s.file }: new in ours, copied.` );
            }
        }
        writeBase( name, base );
        out( `${ name }: yours has ours of ${ manifest.version }${ only ? ` (${ only })` : '' }.` );
    }
    writeConfig( config );
}

// --------------------------------------------------------------------------------------------------------- preview

async function preview( args ) {
    const esbuild = await load( 'esbuild' );
    const portFlag = args.indexOf( '--port' );
    const outFlag = args.indexOf( '--out' );
    const port = portFlag >= 0 ? Number( args[ portFlag + 1 ] ) : 4871;
    const dir = outFlag >= 0 ? resolve( args[ outFlag + 1 ] ) : join( tmpdir(), 'wordplus-ui-preview-' + sha( root ).slice( 0, 8 ) );
    const config = readConfig();

    // The app's own pieces (a module's export: `app/calls.tsx#shopPieces`, `pieces` by default), its stylesheets and
    // the classes its CSS is scoped under: those given, kept in wordplus-ui.json so the next run needs none.
    const flag = ( name ) => ( args.indexOf( name ) >= 0 ? args[ args.indexOf( name ) + 1 ] : undefined );
    const given = { pieces: flag( '--pieces' ), css: args.flatMap( ( a, i ) => ( a === '--css' && args[ i + 1 ] ? [ args[ i + 1 ] ] : [] ) ), class: flag( '--class' ) };
    if ( given.pieces || given.css.length || given.class ) {
        config.preview = {
            ...config.preview,
            ...( given.pieces ? { pieces: given.pieces } : {} ),
            ...( given.css.length ? { css: given.css } : {} ),
            ...( given.class ? { class: given.class } : {} ),
        };
        writeConfig( config );
    }
    const app = config.preview ?? {};
    for ( const file of [ app.pieces?.split( '#' )[ 0 ], ...( app.css ?? [] ) ].filter( Boolean ) ) {
        if ( ! existsSync( resolve( root, file ) ) ) fail( `${ file } (in ${ CONFIG }'s preview) is not there.` );
    }

    rmSync( dir, { recursive: true, force: true } );
    mkdirSync( dir, { recursive: true } );
    let page = readFileSync( join( PACKAGE, 'preview', 'index.html' ), 'utf8' );
    if ( app.css?.length ) page = page.replace( '<link rel="stylesheet" href="ui.css">', '<link rel="stylesheet" href="ui.css">\n    <link rel="stylesheet" href="app.css">' );
    // Built once, it has no server to reload it.
    if ( outFlag >= 0 ) page = page.replace( /\s*<script data-live>[\s\S]*?<\/script>/, '' );
    writeFileSync( join( dir, 'index.html' ), page );
    cpSync( join( PACKAGE, 'preview', 'avatars' ), join( dir, 'avatars' ), { recursive: true } );
    writeFileSync( join( dir, 'ui.css' ), [ 'calls.css', 'presence.css', 'chat.css' ].map( ( f ) => readFileSync( join( PACKAGE, 'dist', f ), 'utf8' ) ).join( '\n' ) );

    const clients = new Set();
    const reload = { name: 'wordplus-ui-reload', setup( b ) {
        b.onEnd( ( result ) => {
            if ( ! result.errors.length ) for ( const client of clients ) client.write( 'data: built\n\n' );
        } );
    } };
    // The app's stylesheets after ours, with what they load.
    const styles = app.css?.length ? {
        stdin: { contents: app.css.map( ( file ) => `@import ${ JSON.stringify( resolve( root, file ) ) };` ).join( '\n' ), resolveDir: root, loader: 'css' },
        outfile: join( dir, 'app.css' ), bundle: true, logLevel: 'warning',
        loader: Object.fromEntries( [ '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.otf' ].map( ( ext ) => [ ext, 'file' ] ) ),
        plugins: [ reload ],
    } : null;
    const options = {
        entryPoints: [ join( PACKAGE, 'preview', 'preview.tsx' ) ],
        outfile: join( dir, 'preview.js' ),
        bundle: true, format: 'esm', platform: 'browser', target: 'es2021', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"development"' },
        logLevel: 'warning',
        plugins: [ {
            name: 'wordplus-ui-preview',
            setup( b ) {
                // Each component: the app's copy where it has one, else ours.
                b.onResolve( { filter: /^wordplus-views:/ }, ( a ) => {
                    const name = a.path.slice( 'wordplus-views:'.length );
                    const yours = config.components[ name ] && join( root, config.dir, name, 'index.ts' );
                    return { path: yours && existsSync( yours ) ? yours : join( VIEWS, name, 'index.ts' ) };
                } );
                // The app's pieces and page classes, or none.
                b.onResolve( { filter: /^wordplus-preview:app$/ }, () => ( { path: 'app', namespace: 'wordplus-preview' } ) );
                b.onLoad( { filter: /.*/, namespace: 'wordplus-preview' }, () => {
                    const [ file, name = 'pieces' ] = ( app.pieces ?? '' ).split( '#' );
                    const pieces = app.pieces
                        ? `export { ${ name } as pieces } from ${ JSON.stringify( resolve( root, file ) ) };`
                        : 'export const pieces = undefined;';
                    return {
                        contents: `${ pieces }\nexport const piecesFrom = ${ JSON.stringify( app.pieces ?? '' ) };\nexport const bodyClass = ${ JSON.stringify( app.class ?? '' ) };`,
                        resolveDir: root, loader: 'js',
                    };
                } );
                // The package as this command's version builds it, and one React, the app's.
                const entries = { '': 'index.js', '/calls': 'calls.js', '/react': 'react.js', '/testing': 'testing.js', '/elements': 'elements.js' };
                b.onResolve( { filter: /^@wordplus\/realtime-ui(\/[a-z]+)?$/ }, ( a ) => ( { path: join( PACKAGE, 'dist', entries[ a.path.slice( pkg.name.length ) ] ) } ) );
                b.onResolve( { filter: /^(react|react-dom)(\/.*)?$/ }, ( a ) => {
                    for ( const from of [ root, PACKAGE ] ) {
                        try {
                            return { path: createRequire( join( from, 'package.json' ) ).resolve( a.path ) };
                        } catch {}
                    }
                    return undefined;
                } );
            },
        }, reload ],
    };

    if ( outFlag >= 0 ) {
        await esbuild.build( options );
        if ( styles ) await esbuild.build( styles );
        out( `The preview, built into ${ dir }: open its index.html through any web server.` );
        return;
    }

    const context = await esbuild.context( options );
    await context.watch();
    if ( styles ) await ( await esbuild.context( styles ) ).watch();
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
    createServer( ( req, res ) => {
        const path = normalize( decodeURIComponent( new URL( req.url ?? '/', 'http://x' ).pathname ) ).replace( /^(\.\.[/\\])+/, '' );
        if ( path === '/events' ) {
            res.writeHead( 200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } );
            clients.add( res );
            req.on( 'close', () => clients.delete( res ) );
            return;
        }
        const file = join( dir, path === '/' ? 'index.html' : path );
        try {
            const body = readFileSync( file );
            res.writeHead( 200, { 'Content-Type': TYPES[ extname( file ) ] ?? 'application/octet-stream', 'Cache-Control': 'no-store' } );
            res.end( body );
        } catch {
            res.writeHead( 404 );
            res.end();
        }
    } ).listen( port, '127.0.0.1', () => {
        out( `Every component in every state, yours in place of ours: http://127.0.0.1:${ port }/` );
        out( `  ?theme=dark  ?dir=rtl  ?width=phone  — it reloads as you change your copies. Ctrl+C stops it.` );
    } );
}

/** A package the app has, else the one beside this package (its own development). */
async function load( name ) {
    for ( const from of [ root, PACKAGE ] ) {
        try {
            return await import( pathToFileURL( createRequire( join( from, 'package.json' ) ).resolve( name ) ).href );
        } catch {}
    }
    fail( `${ name } is needed for this: npm i -D ${ name }` );
}

// ------------------------------------------------------------------------------------- an elements page's own script

function elementsOut() {
    for ( const dir of [ 'public', 'static', 'web' ] ) if ( existsSync( join( root, dir ) ) ) return dir + '/realtime-ui.js';
    return 'public/realtime-ui.js';
}

/** The app's own elements script's entry, from the components it has, and the build that makes it. */
function writeElements( config ) {
    const entry = join( root, ELEMENTS_ENTRY );
    if ( ! existsSync( entry ) || readFileSync( entry, 'utf8' ).includes( MADE ) ) {
        const has = ( name ) => !! config.components[ name ];
        const lines = [
            MADE,
            `// Your own elements script: ${ pkg.name }'s elements with your copies of its views. \`node ${ ELEMENTS_BUILD }\` builds it.`,
            `import { setViews, start } from '${ pkg.name }/elements';`,
            has( 'call-screen' ) && `import { CallView, RingCard } from './${ config.dir }/call-screen';`,
            has( 'online-list' ) && `import { OnlineList, Typing, OnlineCount } from './${ config.dir }/online-list';`,
            has( 'chat' ) && `import { Chat } from './${ config.dir }/chat';`,
            '',
            `setViews( { ${ [
                has( 'call-screen' ) && 'CallView, components: { RingCard }',
                has( 'online-list' ) && 'OnlineList, Typing, OnlineCount',
                has( 'chat' ) && 'Chat',
            ].filter( Boolean ).join( ', ' ) } } );`,
            '',
            '// What @wordplus/realtime calls to start it (window.wordplusRealtimeUi.start).',
            'export { start };',
            '',
        ];
        writeFileSync( entry, lines.filter( ( l ) => l !== false ).join( '\n' ) );
    }
    const build = join( root, ELEMENTS_BUILD );
    if ( ! existsSync( build ) ) {
        writeFileSync( build, [
            `// Builds ${ ELEMENTS_ENTRY } into ${ elementsOut() }: ${ pkg.name }'s elements with your copies of its views, React inside,`,
            `// for a page without React of its own. Load it in place of ours: connect( { ui: '/realtime-ui.js' } ).`,
            `import { build } from 'esbuild';`,
            '',
            'await build( {',
            `    entryPoints: [ '${ ELEMENTS_ENTRY }' ],`,
            `    outfile: '${ elementsOut() }',`,
            `    bundle: true, format: 'iife', globalName: 'wordplusRealtimeUi', platform: 'browser', target: 'es2021', jsx: 'automatic',`,
            `    minify: true, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' },`,
            '} );',
            '',
        ].join( '\n' ) );
    }
}

// -------------------------------------------------------------------------------------------------- a line diff

/** A unified diff of two texts, three lines of context (Myers' algorithm). */
export function unified( a, b, fromName, toName ) {
    const x = a === '' ? [] : a.split( '\n' );
    const y = b === '' ? [] : b.split( '\n' );
    const ops = edits( x, y );
    const changed = ops.map( ( op, i ) => ( op[ 0 ] === ' ' ? -1 : i ) ).filter( ( i ) => i >= 0 );
    if ( ! changed.length ) return '';
    const CONTEXT = 3;
    // Changes closer than twice the context share a hunk.
    const groups = [];
    for ( const i of changed ) {
        const last = groups[ groups.length - 1 ];
        if ( last && i - last[ 1 ] <= CONTEXT * 2 ) last[ 1 ] = i;
        else groups.push( [ i, i ] );
    }
    const lines = [ `--- ${ fromName }`, `+++ ${ toName }` ];
    for ( const [ first, last ] of groups ) {
        const start = Math.max( 0, first - CONTEXT );
        const end = Math.min( ops.length, last + CONTEXT + 1 );
        const hunk = ops.slice( start, end );
        const before = ops.slice( 0, start );
        const fromStart = before.filter( ( op ) => op[ 0 ] !== '+' ).length + 1;
        const toStart = before.filter( ( op ) => op[ 0 ] !== '-' ).length + 1;
        lines.push( `@@ -${ fromStart },${ hunk.filter( ( op ) => op[ 0 ] !== '+' ).length } +${ toStart },${ hunk.filter( ( op ) => op[ 0 ] !== '-' ).length } @@` );
        for ( const [ mark, line ] of hunk ) lines.push( mark + line );
    }
    return lines.join( '\n' );
}

/** The edit script from x to y: [' ', line], ['-', line], ['+', line], in order. */
function edits( x, y ) {
    const n = x.length, m = y.length, max = n + m;
    const v = new Int32Array( 2 * max + 2 );
    const trace = [];
    let found = false;
    for ( let d = 0; d <= max && ! found; d++ ) {
        trace.push( v.slice() );
        for ( let k = -d; k <= d; k += 2 ) {
            let i = k === -d || ( k !== d && v[ max + k - 1 ] < v[ max + k + 1 ] ) ? v[ max + k + 1 ] : v[ max + k - 1 ] + 1;
            let j = i - k;
            while ( i < n && j < m && x[ i ] === y[ j ] ) {
                i++;
                j++;
            }
            v[ max + k ] = i;
            if ( i >= n && j >= m ) {
                found = true;
                break;
            }
        }
    }
    const ops = [];
    let i = n, j = m;
    for ( let d = trace.length - 1; d >= 0; d-- ) {
        const w = trace[ d ];
        const k = i - j;
        const prevK = k === -d || ( k !== d && w[ max + k - 1 ] < w[ max + k + 1 ] ) ? k + 1 : k - 1;
        const prevI = w[ max + prevK ];
        const prevJ = prevI - prevK;
        while ( i > prevI && j > prevJ ) {
            i--;
            j--;
            ops.push( [ ' ', x[ i ] ] );
        }
        if ( d > 0 ) {
            if ( i === prevI ) ops.push( [ '+', y[ --j ] ] );
            else ops.push( [ '-', x[ --i ] ] );
        }
    }
    return ops.reverse();
}

// ------------------------------------------------------------------------------------------------------------ main

const [ command, ...args ] = process.argv.slice( 2 );
const COMMANDS = { add, list, diff, update, accept, preview };
if ( ! command || command === 'help' || command === '--help' || ! COMMANDS[ command ] ) {
    out( `npx ${ pkg.name } <command>  (${ pkg.version })` );
    out( '  add <component…> [--dir components/wordplus] [--force]   copy a view into your app, with its tests' );
    out( '  list                                                      the components, and which are yours' );
    out( '  diff [component…]                                         what changed in ours since you copied it' );
    out( '  update [component…]                                       take ours into the files you never changed' );
    out( '  accept <component…> [--file name]                         record that yours now has ours' );
    out( '  preview [--port 4871] [--out folder]                      every component in every state, yours in place of ours' );
    out( '          [--pieces app/calls.tsx#pieces] [--css app/globals.css] [--class shop]   with your pieces, styles and page classes (kept)' );
    out( `Components: ${ Object.keys( manifest.components ).join( ', ' ) }.` );
    if ( command && command !== 'help' && command !== '--help' ) process.exit( 1 );
} else {
    await COMMANDS[ command ]( args );
}
