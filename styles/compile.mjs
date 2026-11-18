// The package's way of compiling a stylesheet for the parts an app takes (K9 of the slimming of 2026-10-31): the
// parts' SCSS (styles/chat/_messages.scss and the rest) with the design tokens they read, and those they read in
// turn, and nothing else of styles/_tokens.scss, whose colour matrices no part reads. scripts/build.mjs builds
// dist/*.css and the elements' stylesheet with it, and an app that compiles the parts' stylesheet itself (Live Support's
// panel and inbox, Better Messages if it moves to it) takes the same, from the package's copy:
//
//   import { compileStylesheet } from '@wordplus/realtime-ui/styles/compile.mjs';
//   const css = await compileStylesheet( { parts: [ 'chat/messages', 'chat/reactions' ], prefix: 'wps', host: true } );
//
// - `parts`: the stylesheets, as styles/ names them without their underscore and .scss (chat/messages for
//   styles/chat/_messages.scss), each compiled with the tokens' mixins in scope, as Better Messages has them in its own;
// - `prefix`: the app's names for the package's `wplus-`, as Better Messages' build reads `wplus-` as `bm-`
//   (--wplus-color-accent as --bm-color-accent, .wplus-msg-body as .bm-msg-body, data-wplus-tip as data-bm-tip);
// - `host`: the tokens on a shadow root's host, where there is no :root and no body (the elements', a panel's);
// - `reads`: more text whose var(--wplus-…) the tokens kept must cover, the parts' markup that sets tokens inline;
// - `uses`: the text of the app's bundle, where only the rules it can draw are wanted (usedRules(), below): a rule is
//   kept when every class it names is a word of that text, or begins with one that ends a name the code completes
//   (`wps-hover-actions__btn--` + a modifier), and an animation when a rule kept runs it. The tokens follow the rules
//   kept. Left out, every rule of the parts, as before;
// - `zones`: false for an app that colours its chat as one surface, without the colour zones of Better Messages'
//   messenger (withoutZones(), below). True by default, as before;
// - `sass`: the app's own sass, where the package's is not installed beside it.
//
// No app needs the package's sass: an app passes its own, or the package's dev install gives it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STYLES = dirname( fileURLToPath( import.meta.url ) );
const SILENCED = [ 'import', 'global-builtin', 'color-functions' ];

/** The package's names as an app's: `wplus-` as `<prefix>-`, as Better Messages' build rewrites them. */
export function prefixed( source, prefix = 'wplus' ) {
    if ( prefix === 'wplus' ) return source;
    return source
        .replace( /--wplus-(?=[a-z0-9])/g, `--${ prefix }-` )
        .replace( /data-wplus-(?=[a-z0-9])/g, `data-${ prefix }-` )
        .replace( /(?<![\w-])wplus-(?=[a-z0-9])/g, `${ prefix }-` );
}

/** The token rules with only the custom properties `css` reads, and those they read; empty rules dropped. */
export function usedTokens( compiled, css ) {
    const reads = ( text ) => [ ...text.matchAll( /var\(\s*(--[a-z0-9-]+)/gi ) ].map( ( m ) => m[ 1 ] );
    const values = new Map();

    for ( const [ , name, value ] of compiled.matchAll( /^\s+(--[a-z0-9-]+):\s*(.*);$/gm ) ) {
        values.set( name, ( values.get( name ) ?? '' ) + ' ' + value );
    }

    const used = new Set();
    const queue = reads( css );

    while ( queue.length ) {
        const name = queue.pop();
        if ( used.has( name ) ) continue;
        used.add( name );
        queue.push( ...reads( values.get( name ) ?? '' ) );
    }

    let kept = compiled.split( '\n' ).filter( ( line ) => {
        const declared = line.match( /^\s+(--[a-z0-9-]+):/ );
        return ! declared || used.has( declared[ 1 ] );
    } ).join( '\n' );

    for ( let before = ''; before !== kept; ) {
        before = kept;
        kept = kept.replace( /^[ \t]*[^\n{};]+\{\s*\}\n?/gm, '' );
    }

    return kept.trim();
}

/**
 * A stylesheet source's top-level variables and `@mixin` blocks (brackets matched), in order: what its mixins need,
 * without the rules they sit among.
 */
export function mixinsOf( source ) {
    const out = [];
    for ( const match of source.matchAll( /^(@mixin\b|\$[a-z0-9_-]+\s*:)/gm ) ) {
        const variable = match[ 1 ].startsWith( '$' );
        let depth = 0;
        let i = variable ? match.index : source.indexOf( '{', match.index );
        for ( ; i < source.length; i++ ) {
            const c = source[ i ];
            if ( c === '{' || c === '(' ) depth++;
            else if ( ( c === '}' || c === ')' ) && --depth === 0 && ! variable ) break;
            else if ( variable && c === ';' && depth === 0 ) break;
        }
        out.push( source.slice( match.index, i + 1 ) );
    }
    return out.join( '\n' );
}

/**
 * Token rules for a shadow root: Better Messages' `:root`, and its dark theme's `body` selectors, on the host, whose
 * `data-scheme` says the page's own light or dark (src/elements.tsx, schemeOf()). `prefix` is the names' prefix in `css`.
 */
export function hostOf( css, prefix = 'wplus' ) {
    return css
        .replace( /:root\b/g, ':host' )
        .replace( new RegExp( `body:not\\(\\.${ prefix }-messages-light\\)`, 'g' ), ':host(:not([data-scheme="light"]))' )
        .replace( new RegExp( `body\\.${ prefix }-messages-dark`, 'g' ), ':host([data-scheme="dark"])' );
}

/** The package's sass, or the app's. */
async function sassOf( given ) {
    return given ?? await import( 'sass' );
}

/** An importer that reads the package's stylesheets under the app's names. */
function namesImporter( prefix ) {
    return {
        canonicalize( url, context ) {
            const base = context?.containingUrl ? fileURLToPath( context.containingUrl ) : join( STYLES, 'index.scss' );
            const asked = url.startsWith( 'file:' ) ? fileURLToPath( url ) : join( dirname( base ), url );
            for ( const candidate of [ asked + '.scss', join( dirname( asked ), '_' + asked.split( /[/\\]/ ).pop() + '.scss' ), asked ] ) {
                try {
                    readFileSync( candidate );
                    return pathToFileURL( candidate );
                } catch {
                    // the next way of naming it
                }
            }
            return null;
        },
        load( canonical ) {
            return { contents: prefixed( readFileSync( fileURLToPath( canonical ), 'utf8' ), prefix ), syntax: 'scss' };
        },
    };
}

/** One stylesheet of styles/ compiled as it is (its own imports and none of the tokens' mixins), under `prefix`. */
export async function compileFile( file, { prefix = 'wplus', sass } = {} ) {
    const compiler = await sassOf( sass );
    const path = join( STYLES, file );
    if ( prefix === 'wplus' ) return compiler.compile( path, { style: 'expanded', silenceDeprecations: SILENCED } ).css;
    return compiler.compileString( prefixed( readFileSync( path, 'utf8' ), prefix ), {
        url: pathToFileURL( path ), importer: namesImporter( prefix ), style: 'expanded', silenceDeprecations: SILENCED,
    } ).css;
}

/** A part's stylesheet (chat/messages) compiled with the tokens' mixins in scope, as Better Messages has them. */
export async function compilePart( part, { prefix = 'wplus', sass } = {} ) {
    const compiler = await sassOf( sass );
    const mixins = mixinsOf( prefixed( readFileSync( join( STYLES, '_tokens.scss' ), 'utf8' ), prefix ) );
    // The package's names as they are: the files read from styles/ as the build always read them. Else each read
    // through the importer that names them as the app's.
    const where = prefix === 'wplus'
        ? { loadPaths: [ STYLES ] }
        : { url: pathToFileURL( join( STYLES, 'index.scss' ) ), importer: namesImporter( prefix ) };
    return compiler.compileString( mixins + `\n@import "${ part }";`, { ...where, style: 'expanded', silenceDeprecations: SILENCED } ).css;
}

/**
 * A stylesheet without the colour zones' re-pointing. Better Messages colours each cell of its messenger apart (the reply
 * area, the list, a mini chat) with rules that point the colour tokens at the cell's own (wplus-zone-surface() of
 * styles/_tokens.scss), each of which reads the colour token itself until a theme sets it. An app that colours its chat
 * as one surface (Live Support's visitor panel and inbox) draws the same without them: its rules read the colour tokens
 * themselves, and the zones' tokens, with the colours only they read, stay out of its stylesheet.
 */
export function withoutZones( css, prefix = 'wplus' ) {
    const pointed = new RegExp( `^[ \\t]*--${ prefix }-color-[a-z0-9-]+:\\s*var\\(--${ prefix }-zone-[a-z0-9-]+\\);\\n?`, 'gm' );
    let kept = css.replace( pointed, '' );
    for ( let before = ''; before !== kept; ) {
        before = kept;
        kept = kept.replace( /^[ \t]*[^\n{};]+\{\s*\}\n?/gm, '' );
    }
    return kept;
}

/** The parts' stylesheet, with the tokens they read: see the head of this file. */
export async function compileStylesheet( { parts, prefix = 'wplus', host = false, reads = '', uses, zones = true, sass } ) {
    const all = ( await Promise.all( parts.map( ( part ) => compilePart( part, { prefix, sass } ) ) ) ).join( '\n' );
    const drawn = uses === undefined ? all : usedRules( all, uses );
    const css = zones ? drawn : withoutZones( drawn, prefix );
    const tokens = usedTokens( await compileFile( '_tokens.scss', { prefix, sass } ), css + '\n' + prefixed( reads, prefix ) );
    return ( host ? hostOf( tokens, prefix ) : tokens ) + '\n' + css;
}

/**
 * The words of an app's code that may name a class (`wps-msg-body`, `ls-panel`), and among them the beginnings of
 * names the code completes (`wps-hover-actions__btn--`, `wps-dock-`), which end in `-` or `_` after two parts at least:
 * `wps-` alone would keep every rule.
 */
export function wordsOf( text ) {
    const words = new Set();
    const stems = [];
    for ( const [ word ] of text.matchAll( /[A-Za-z_][\w-]*/g ) ) {
        if ( words.has( word ) ) continue;
        words.add( word );
        if ( /[a-z0-9][-_]+[a-z0-9]+[-_]+$/i.test( word ) ) stems.push( word );
    }
    return { words, stems };
}

/**
 * A compiled stylesheet with only the rules an app's code `uses` (its text, or wordsOf() it) can draw. A selector is
 * kept when each class it names is a word of the code, or begins with a stem of it. Its classes are those outside its
 * attribute tests and outside :not(), :is(), :where() and :has(), which decide nothing alone: `:root:not(.wps-pointer-
 * mouse) .wps-msg-body` stays for .wps-msg-body. A rule keeps the selectors of its list that stay; @media, @supports,
 * @container, @layer, @starting-style and @scope keep what stays inside them and go when nothing does; @keyframes go
 * when no rule kept runs them (animation, animation-name); any other at-rule stays as it is.
 */
export function usedRules( css, uses ) {
    const { words, stems } = typeof uses === 'string' ? wordsOf( uses ) : uses;
    const known = new Map();
    const used = ( name ) => {
        if ( ! known.has( name ) ) known.set( name, words.has( name ) || stems.some( ( stem ) => name.startsWith( stem ) ) );
        return known.get( name );
    };
    const drawn = ( selector ) => {
        let bare = selector.replace( /\\[0-9a-f]{1,6}\s?|\\./gi, '_' ).replace( /\[[^\]]*\]/g, '' );
        for ( let before = ''; before !== bare; ) {
            before = bare;
            bare = bare.replace( /:(?:not|is|where|has)\([^()]*\)/g, '' );
        }
        return [ ...bare.matchAll( /\.(-?[A-Za-z_][\w-]*)/g ) ].every( ( [ , name ] ) => used( name ) );
    };

    const kept = keep( statements( css ), drawn );
    const runs = kept.filter( ( s ) => ! s.keyframes ).map( ( s ) => s.text ).join( '' );
    const animated = ( name ) => new RegExp( `animation(?:-name)?\\s*:[^;{}]*(?<![\\w-])${ name }(?![\\w-])` ).test( runs );
    return kept.filter( ( s ) => ! s.keyframes || animated( s.keyframes ) ).map( ( s ) => s.text ).join( '' )
        .replace( /^\s*\n/, '' ).replace( /\n\s*\n/g, '\n' );
}

/** The statements of one level of a stylesheet kept by `drawn`, each as its text with the white space before it. */
function keep( list, drawn ) {
    const out = [];
    for ( const s of list ) {
        if ( s.body === null ) {
            out.push( s );
            continue;
        }
        const lead = s.text.match( /^\s*/ )[ 0 ];
        const keyframes = /^@(?:-[a-z]+-)?keyframes\s+([\w-]+)/i.exec( s.prelude );
        if ( keyframes ) {
            out.push( { text: s.text, keyframes: keyframes[ 1 ] } );
        } else if ( /^@(?:media|supports|container|layer|starting-style|scope)\b/i.test( s.prelude ) ) {
            const inner = keep( statements( s.body ), drawn ).filter( ( r ) => r.text.trim() );
            if ( inner.some( ( r ) => r.body !== null ) ) out.push( { text: `${ lead }${ s.prelude } {${ inner.map( ( r ) => r.text ).join( '' ) }\n${ lead.replace( /^\n+/, '' ) }}` } );
        } else if ( s.prelude.startsWith( '@' ) ) {
            out.push( { text: s.text } );
        } else {
            const selectors = split( s.prelude );
            const shown = selectors.filter( drawn );
            if ( shown.length === selectors.length ) out.push( { text: s.text } );
            else if ( shown.length ) out.push( { text: `${ lead }${ shown.join( ',' + ( lead.includes( '\n' ) ? lead : '\n' ) ) } {${ s.body }}` } );
        }
    }
    return out;
}

/** A selector list split at its own commas, never those inside brackets, parentheses or strings. */
function split( prelude ) {
    const out = [];
    let depth = 0;
    let start = 0;
    for ( let i = 0; i < prelude.length; i++ ) {
        const c = prelude[ i ];
        if ( c === '\\' ) {
            i++;
        } else if ( c === '"' || c === "'" ) {
            for ( i++; i < prelude.length && prelude[ i ] !== c; i++ ) if ( prelude[ i ] === '\\' ) i++;
        } else if ( c === '(' || c === '[' ) {
            depth++;
        } else if ( c === ')' || c === ']' ) {
            depth--;
        } else if ( c === ',' && depth === 0 ) {
            out.push( prelude.slice( start, i ).trim() );
            start = i + 1;
        }
    }
    out.push( prelude.slice( start ).trim() );
    return out.filter( Boolean );
}

/**
 * The statements of one level of a stylesheet: each block with its prelude and the text between its braces, and what
 * lies between them (declarations, comments, `@charset …;`) with a `body` of null, each text with the white space
 * before it. Strings, escapes and comments are passed over.
 */
function statements( css ) {
    const out = [];
    let start = 0;
    let depth = 0;
    let open = -1;
    for ( let i = 0; i < css.length; i++ ) {
        const c = css[ i ];
        if ( c === '\\' ) {
            i++;
        } else if ( c === '/' && css[ i + 1 ] === '*' ) {
            const end = css.indexOf( '*/', i + 2 );
            i = end === -1 ? css.length : end + 1;
        } else if ( c === '"' || c === "'" ) {
            for ( i++; i < css.length && css[ i ] !== c; i++ ) if ( css[ i ] === '\\' ) i++;
        } else if ( c === '{' ) {
            if ( depth++ === 0 ) open = i;
        } else if ( c === '}' && depth > 0 && --depth === 0 ) {
            const head = css.slice( start, open );
            const cut = head.lastIndexOf( ';' ) + 1;
            if ( cut > 0 ) out.push( { text: head.slice( 0, cut ), prelude: '', body: null } );
            const prelude = head.slice( cut ).replace( /\/\*[\s\S]*?\*\//g, '' ).trim();
            out.push( { text: css.slice( start + cut, i + 1 ), prelude, body: css.slice( open + 1, i ) } );
            start = i + 1;
        }
    }
    if ( start < css.length ) out.push( { text: css.slice( start ), prelude: '', body: null } );
    return out;
}
