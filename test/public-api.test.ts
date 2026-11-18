// What a view uses is the package's public API, and only the public API is under every view: a view an app copies into
// its own code (level 3) imports from `@wordplus/realtime-ui`, `@wordplus/realtime-ui/calls`,
// `@wordplus/realtime-ui/streams` (the live streams' views), `@wordplus/realtime-ui/recording` (the recording player) and
// `@wordplus/realtime-ui/chat` (the chat's parts alone) in place of what it imported from beside it, so everything it
// imports at run time must be something those entries export, the very same function or value.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const src = join( dirname( fileURLToPath( import.meta.url ) ), '..', 'src' );
const files = ( dir: string ): string[] => readdirSync( dir ).flatMap( ( name ) => statSync( join( dir, name ) ).isDirectory() ? files( join( dir, name ) ) : [ join( dir, name ) ] );

/** Each relative import of a file at run time: the module and the names it takes (`default` for the default). */
function importsOf( file: string ): Array<{ module: string, names: string[] }> {
    const text = readFileSync( file, 'utf8' );
    const found: Array<{ module: string, names: string[] }> = [];
    for ( const m of text.matchAll( /^import\s+(?!type\b)([^;]*?)\s+from\s+['"](\.[^'"]+)['"]/gm ) ) {
        const [ , clause, spec ] = m;
        const names: string[] = [];
        const named = /\{([^}]*)\}/.exec( clause );
        const head = clause.replace( /\{[^}]*\}/, '' ).replace( /,/g, ' ' ).trim();
        if ( head && ! head.startsWith( '*' ) ) names.push( 'default' );
        for ( const part of named?.[ 1 ].split( ',' ) ?? [] ) {
            const name = part.trim();
            if ( ! name || name.startsWith( 'type ' ) ) continue;
            names.push( name.split( /\s+as\s+/ )[ 0 ].trim() );
        }
        if ( names.length ) found.push( { module: resolve( dirname( file ), spec ), names } );
    }
    return found;
}

it( 'every view imports only what the public entries export', async () => {
    const entries = [ await import( '../src/index.ts' ), await import( '../src/calls.ts' ), await import( '../src/streams.ts' ), await import( '../src/recording.ts' ), await import( '../src/chat.ts' ), await import( '../src/polls.ts' ) ];
    const exported = new Set<unknown>( entries.flatMap( ( entry ) => Object.values( entry ) ) );
    const views = files( join( src, 'components' ) ).filter( ( file ) => /\.tsx?$/.test( file ) );
    const missing: string[] = [];

    for ( const view of views ) {
        for ( const { module, names } of importsOf( view ) ) {
            const loaded = await import( /* @vite-ignore */ module ) as Record<string, unknown>;
            for ( const name of names ) {
                // A type, an interface: nothing at run time to copy.
                if ( ! ( name in loaded ) ) continue;
                if ( ! exported.has( loaded[ name ] ) ) missing.push( `${ view.slice( src.length + 1 ) }: ${ name } from ${ module.slice( src.length + 1 ) }` );
            }
        }
    }

    expect( missing ).toEqual( [] );
} );

// The chat's entry (K7 of the slimming of 2026-10-31): the chat's parts alone, the root entry's own, for an app whose
// bundler keeps what an entry imports and does not use, as the visitor panel of Live Support on Preact.
it( 'gives the chat\'s parts alone, the very ones of the root entry', async () => {
    const chat = await import( '../src/chat.ts' ) as Record<string, unknown>;
    const index = await import( '../src/index.ts' ) as Record<string, unknown>;
    // Its icons are the chat's glyphs and an app's (ChatIcon of the root entry), where the root entry's draw every one.
    const ICONS = [ 'Icon', 'iconPathD', 'isRegistryIcon', 'ResolvedIcon' ];
    // The files' views were behind /react alone until now.
    const react = await import( '../src/react.tsx' ) as Record<string, unknown>;
    const elsewhere = ( name: string ) => ( name in index ? index[ name ] : react[ name ] );
    expect( Object.keys( chat ).filter( ( name ) => ! ICONS.includes( name ) && chat[ name ] !== elsewhere( name ) ) ).toEqual( [] );
    expect( chat.Icon ).toBe( index.ChatIcon );
    expect( chat.registerIcons ).toBe( index.registerIcons );
    expect( Object.keys( chat ).length ).toBeGreaterThan( 80 );

    const { build } = await import( 'esbuild' );
    const result = await build( {
        entryPoints: [ join( src, 'chat.ts' ) ], bundle: true, write: false, format: 'esm', minify: true, metafile: true, logLevel: 'error',
        external: [ 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client' ], jsx: 'automatic',
    } );
    const taken = Object.keys( result.metafile.inputs ).map( ( input ) => input.replace( /^.*?src\//, 'src/' ) );
    expect( taken.filter( ( input ) => /src\/(components\/(calls|streams|recording)|inc\/calls|languages|effects|sdk\/(calls|chat-call|controller|use-.*-call|local-media|tracks))|node_modules\/(?!react-merge-refs\/)/.test( input ) ) ).toEqual( [] );
    const { CALL_ICONS, MESSENGER_ICONS } = index as { CALL_ICONS: Record<string, string>; MESSENGER_ICONS: Record<string, string> };
    const code = result.outputFiles[ 0 ].text;
    expect( Object.values( { ...CALL_ICONS, ...MESSENGER_ICONS } ).filter( ( d ) => code.includes( d ) ) ).toEqual( [] );
} );

it( 'lets an app that draws faces alone leave the markup reader out, which the avatar with its name tooltip takes', async () => {
    const { build } = await import( 'esbuild' );
    // What reaches an app's bundle of the parts it imports from the chat's entry: a module read and left out is not in it.
    const taken = async ( names: string ) => {
        const result = await build( {
            stdin: { contents: `import { ${ names } } from ${ JSON.stringify( join( src, 'chat.ts' ) ) }; export default [ ${ names } ];`, resolveDir: src, loader: 'ts' },
            bundle: true, write: false, format: 'esm', minify: true, metafile: true, logLevel: 'error',
            external: [ 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client' ], jsx: 'automatic',
        } );
        const inputs = Object.values( result.metafile.outputs )[ 0 ].inputs;
        return Object.keys( inputs ).filter( ( input ) => inputs[ input ].bytesInOutput > 0 ).map( ( input ) => input.replace( /^.*?src\//, 'src/' ) );
    };

    // Live Support's visitor panel: its faces stand by a name or a line that says who, so they show no name as markup.
    const faces = await taken( 'AvatarFace, AvatarStack, PresenceDot, TypingDots' );
    expect( faces ).toContain( 'src/components/presence/avatar-face.tsx' );
    expect( faces ).not.toContain( 'src/inc/markup.tsx' );
    // Better Messages' avatar draws the name over the face as markup, a site's badges in it.
    expect( await taken( 'Avatar' ) ).toContain( 'src/inc/markup.tsx' );
}, 60_000 );

it( 'lets an app whose calls are between two alone leave the group calls out', async () => {
    const { build } = await import( 'esbuild' );
    const result = await build( {
        stdin: { contents: `import { PrivateCallScreen, usePrivateCall } from ${ JSON.stringify( join( src, 'calls.ts' ) ) }; export default [ PrivateCallScreen, usePrivateCall ];`, resolveDir: src, loader: 'ts' },
        bundle: true, write: false, format: 'esm', minify: true, metafile: true, logLevel: 'error',
        external: [ 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client' ], jsx: 'automatic',
    } );
    const inputs = Object.values( result.metafile.outputs )[ 0 ].inputs;
    const taken = Object.keys( inputs ).filter( ( input ) => inputs[ input ].bytesInOutput > 0 ).map( ( input ) => input.replace( /^.*?src\//, 'src/' ) );
    expect( taken ).toContain( 'src/components/calls/private-call.tsx' );
    expect( taken ).toContain( 'src/sdk/use-private-call.ts' );
    // None of what only a group call draws: its grids and rosters, their window over the others, the recording and the
    // spotlight. The dock takes a few small pieces of the moderation's, the asks' and the layouts' modules.
    expect( taken.filter( ( input ) => /components\/calls\/(group-|recording|spotlight|grid-moves|kept-media)/.test( input ) ) ).toEqual( [] );
    expect( taken ).not.toContain( 'src/components/calls/call-screen.tsx' );
}, 60_000 );
