// The screens' own translations, in the WordPlus languages (de es fr it nl pl hr he), for apps; Better Messages
// translates them itself, through WordPress. src/languages/{locale}.json maps each string, keyed as WordPress keys it
// (`context\u0004text`, or the text alone), to its translation.
//
//   node scripts/languages.mjs             # take what Better Messages' translation caches already have, list the rest
//   node scripts/languages.mjs --check     # fail when a string the screens show has no translation in a language
//
// The strings come from the source, as Better Messages' extract-translations.js finds them: `__( 'text' … )` and
// `_x( 'text', 'context' … )`. Strings Better Messages has never had (and Croatian, which it doesn't carry) are
// translated by hand into src/languages/{locale}.json, which this keeps.
//
// The live streams' words go apart, into src/languages/streams/{locale}.json, which only the stream's views load
// (src/components/streams/languages.ts): the elements' realtime-ui.min.js, which bundles the shared files, stays its
// size without them. A string the streams share with another screen stays in the shared file.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const LOCALES = { de: 'de', es: 'es', fr: 'fr', it: 'it', nl: 'nl', pl: 'pl', hr: 'hr', he: 'he' };
const CACHES = join( homedir(), 'Projects/bm.com/wp-content/plugins/better-messages-dev/src/translations/results' );

const files = ( dir ) => readdirSync( dir ).flatMap( ( name ) => statSync( join( dir, name ) ).isDirectory() ? files( join( dir, name ) ) : [ join( dir, name ) ] );
const unquote = ( s ) => s.slice( 1, -1 ).replace( /\\(['"\\])/g, '$1' );
const quoted = `('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*")`;

// A string with a number in it (`_n( 'single', 'plural', n )`, `_nx( …, n, 'context' )`) is keyed by its singular, and
// translated as its forms, in the language's order.
const plurals = new Set();

const STREAMS = join( root, 'src', 'components', 'streams' );
const inStreams = ( file ) => file.startsWith( STREAMS + '/' );

/** The strings of the source files `which` takes: every one by default. */
export function strings( which = () => true ) {
    const found = new Set();
    for ( const file of files( join( root, 'src' ) ) ) {
        if ( ! /\.(tsx?)$/.test( file ) || ! which( file ) ) continue;
        const source = readFileSync( file, 'utf8' );
        for ( const m of source.matchAll( new RegExp( `\\b_x\\(\\s*${ quoted }\\s*,\\s*${ quoted }`, 'g' ) ) ) found.add( unquote( m[ 2 ] ) + '\u0004' + unquote( m[ 1 ] ) );
        for ( const m of source.matchAll( new RegExp( `\\b__\\(\\s*${ quoted }`, 'g' ) ) ) found.add( unquote( m[ 1 ] ) );
        for ( const m of source.matchAll( new RegExp( `\\b_nx\\(\\s*${ quoted }\\s*,\\s*${ quoted }\\s*,[^,]+,\\s*${ quoted }`, 'g' ) ) ) {
            const key = unquote( m[ 3 ] ) + '\u0004' + unquote( m[ 1 ] );
            found.add( key );
            plurals.add( key );
        }
        for ( const m of source.matchAll( new RegExp( `\\b_n\\(\\s*${ quoted }\\s*,\\s*${ quoted }\\s*,`, 'g' ) ) ) {
            found.add( unquote( m[ 1 ] ) );
            plurals.add( unquote( m[ 1 ] ) );
        }
    }
    return [ ...found ].sort();
}

// With the words an app's screens show in place of some of Better Messages' (src/languages/in-apps.json), translated
// by hand as Better Messages never has them.
const inApps = Object.values( JSON.parse( readFileSync( join( root, 'src', 'languages', 'in-apps.json' ), 'utf8' ) ) );
const shared = [ ...new Set( [ ...strings( ( file ) => ! inStreams( file ) ), ...inApps ] ) ].sort();
const ofStreams = strings( inStreams ).filter( ( key ) => ! shared.includes( key ) );
const check = process.argv.includes( '--check' );
let missing = 0;
let stale = 0;

// How many forms each language's plurals take, as its WordPress translations' Plural-Forms say.
const FORMS = { pl: 3, hr: 3 };
const formsOf = ( locale ) => FORMS[ locale ] ?? 2;

// Each file and the strings it holds.
const FILES = [
    { wanted: shared, path: ( locale ) => join( root, 'src', 'languages', locale + '.json' ) },
    { wanted: ofStreams, path: ( locale ) => join( root, 'src', 'languages', 'streams', locale + '.json' ) },
];
const read = ( file ) => existsSync( file ) ? JSON.parse( readFileSync( file, 'utf8' ) ) : {};

mkdirSync( join( root, 'src', 'languages', 'streams' ), { recursive: true } );

for ( const [ locale, cacheName ] of Object.entries( LOCALES ) ) {
    // What either file has, so a string moving from one to the other keeps its translation.
    const kept = Object.assign( {}, ...FILES.map( ( f ) => read( f.path( locale ) ) ) );
    const cacheFile = join( CACHES, cacheName, 'cache.json' );
    const cache = ! check && existsSync( cacheFile ) ? JSON.parse( readFileSync( cacheFile, 'utf8' ) ) : {};
    const lacking = [];

    for ( const { wanted, path } of FILES ) {
        const out = {};

        for ( const key of wanted ) {
            if ( plurals.has( key ) ) {
                const forms = kept[ key ] ?? cache[ key ]?.translations;
                if ( Array.isArray( forms ) && forms.length === formsOf( locale ) && forms.every( ( f ) => typeof f === 'string' && f !== '' ) ) out[ key ] = forms;
                else lacking.push( key );
                continue;
            }
            const value = kept[ key ] ?? cache[ key ]?.translation;
            if ( typeof value === 'string' && value !== '' ) out[ key ] = value;
            else lacking.push( key );
        }

        const written = JSON.stringify( out, null, 2 ) + '\n';
        if ( ! check ) writeFileSync( path( locale ), written );
        // A file holding what it shouldn't, such as the streams' words in a shared file the elements' script bundles.
        else if ( ! existsSync( path( locale ) ) || readFileSync( path( locale ), 'utf8' ) !== written ) {
            stale++;
            console.log( `${ path( locale ).slice( root.length + 1 ) } is not as this script writes it: run node scripts/languages.mjs` );
        }
    }

    if ( lacking.length ) {
        missing += lacking.length;
        console.log( `${ locale }: ${ lacking.length } without a translation` + ( check ? '' : ':\n  ' + lacking.map( ( k ) => JSON.stringify( k ) ).join( '\n  ' ) ) );
    }
}

console.log( `${ shared.length } strings, and the live streams' ${ ofStreams.length }` );
if ( check && ( missing || stale ) ) process.exit( 1 );
