// The types of the package as the npm registry and the CDN mirror publish it: its declarations take
// @wordplus/realtime-client/streams from a copy inside the package (dist/types/vendor/realtime-client, the declarations
// of vendor/realtime-client), since that package isn't published on its own and an app installs none.
//
//   node scripts/public-types.mjs      (npm's prepublishOnly, after npm run build; the publish script's npm target too)
//
// Only there: a build for Easy Stream and Better Messages, which the WordPlus SDK packs, keeps the specifier, so each
// types the views against its own client, whose engine they hand the views (a class TypeScript tells apart by its
// declaration). The four constants the views take are inside dist/streams.js in every build (scripts/build.mjs).
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const types = join( root, 'dist', 'types' );
const copy = join( types, 'vendor', 'realtime-client' );

if ( ! existsSync( types ) ) throw new Error( 'dist/types is missing: npm run build first.' );

const walk = ( dir ) => readdirSync( dir ).flatMap( ( name ) => {
    const path = join( dir, name );
    return statSync( path ).isDirectory() ? walk( path ) : [ path ];
} );

// The client's declarations, without its modules.
for ( const file of walk( join( root, 'vendor', 'realtime-client' ) ).filter( ( path ) => path.endsWith( '.d.ts' ) ) ) {
    cpSync( file, join( copy, relative( join( root, 'vendor', 'realtime-client' ), file ) ) );
}

// The mesh's room client (@wordplus/rtc-client) is the page's own script, not a package an app installs: the few of its
// names the stream engine's declarations take stand in loosely (dist/types/vendor/rtc-client.d.ts), each a type and a
// value, as an import list and a Pick<typeof rtc, '…'> name them.
const RTC = /(['"])@wordplus\/rtc-client\1/g;
const rtcNames = new Set();
for ( const file of walk( copy ).filter( ( path ) => RTC.test( readFileSync( path, 'utf8' ) ) ) ) {
    const text = readFileSync( file, 'utf8' );
    for ( const [ , list ] of text.matchAll( /import\s+type\s*\{([^}]*)\}\s*from\s*['"]@wordplus\/rtc-client['"]/g ) ) {
        for ( const name of list.split( ',' ) ) if ( name.trim() ) rtcNames.add( name.trim().split( /\s+as\s+/ )[ 0 ] );
    }
    for ( const [ , picked ] of text.matchAll( /Pick<typeof \w+,\s*([^>]+)>/g ) ) {
        for ( const [ , name ] of picked.matchAll( /'(\w+)'/g ) ) rtcNames.add( name );
    }
    writeFileSync( file, text.replace( RTC, ( _, q ) => `${ q }${ relative( dirname( file ), join( types, 'vendor', 'rtc-client.js' ) ).replace( /^(?!\.)/, './' ) }${ q }` ) );
}
if ( rtcNames.size ) {
    writeFileSync( join( types, 'vendor', 'rtc-client.d.ts' ), [
        '// The mesh\'s room client, which the page loads as a script of its own: what the stream engine\'s declarations name of it.',
        ...[ ...rtcNames ].sort().flatMap( ( name ) => [ `export type ${ name } = any;`, `export declare const ${ name }: any;` ] ),
        '',
    ].join( '\n' ) );
}

let rewritten = 0;
for ( const file of walk( types ).filter( ( path ) => path.endsWith( '.d.ts' ) && ! path.startsWith( copy ) ) ) {
    const text = readFileSync( file, 'utf8' );
    const to = ( target ) => relative( dirname( file ), join( copy, target ) ).replace( /^(?!\.)/, './' );
    const next = text
        .replace( /(['"])@wordplus\/realtime-client\/streams\1/g, ( _, q ) => `${ q }${ to( 'streams/index.js' ) }${ q }` )
        .replace( /(['"])@wordplus\/realtime-client\1/g, ( _, q ) => `${ q }${ to( 'index.js' ) }${ q }` );
    if ( next !== text ) {
        writeFileSync( file, next );
        rewritten++;
    }
}

console.log( `dist/types: @wordplus/realtime-client from dist/types/vendor/realtime-client in ${ rewritten } declarations` );
