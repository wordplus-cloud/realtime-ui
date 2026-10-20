// What a view uses is the package's public API, and only the public API is under every view: a view an app copies into
// its own code (level 3) imports from `@wordplus/realtime-ui`, `@wordplus/realtime-ui/calls` and
// `@wordplus/realtime-ui/streams` (the live streams' views) in place of what it imported from beside it, so everything
// it imports at run time must be something those entries export, the very same function or value.
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
    const entries = [ await import( '../src/index.ts' ), await import( '../src/calls.ts' ), await import( '../src/streams.ts' ) ];
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
