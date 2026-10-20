// Builds the gallery page into gallery/build: the page, its script (gallery.tsx with the package's source and React
// bundled), the package's three stylesheets as one (dist/calls.css, presence.css, chat.css: run the package's build
// first) and the avatars. `npm run gallery` builds the package, then this, then runs the picture checks.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname( fileURLToPath( import.meta.url ) );
const root = join( here, '..' );
const out = join( here, 'build' );

rmSync( out, { recursive: true, force: true } );
mkdirSync( out, { recursive: true } );

await build( {
    entryPoints: [ join( here, 'gallery.tsx' ) ],
    outfile: join( out, 'gallery.js' ),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2021',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning',
} );

writeFileSync( join( out, 'ui.css' ), [ 'calls.css', 'presence.css', 'chat.css' ].map( ( f ) => readFileSync( join( root, 'dist', f ), 'utf8' ) ).join( '\n' ) );
cpSync( join( here, 'index.html' ), join( out, 'index.html' ) );
cpSync( join( here, 'avatars' ), join( out, 'avatars' ), { recursive: true } );

console.log( 'gallery/build: index.html, gallery.js, ui.css, avatars' );
