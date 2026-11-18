// A display name in its two forms. A name may be markup by the time it reaches a screen (a WordPress site hangs badges
// off it), and it is also whatever its owner typed, so a screen never prints one raw:
//
//   - plainName: anything that cannot hold markup (aria-labels, alt text, a sprintf'd label);
//   - host().nameHtml(): anything that renders it, through the host's allowlist (Better Messages' keeps a site's
//     badges); by default the plain name, escaped.

/**
 * A display name as plain text: tags out, entities decoded, then tag-shaped runs out again, so a name that arrived
 * escaped can't become markup once decoded, and "Ben <3" keeps its name. As Better Messages' plainUserName().
 */
export function plainName( name: string | null | undefined ): string {
    const stripped = ( name ?? "" ).replace( /<[^>]*>/g, " " );
    const once = stripped.indexOf( "&" ) === -1 ? stripped : decodeEntities( stripped );
    return once.replace( /<\/?[a-zA-Z][^>]*>/g, " " ).replace( /\s+/g, " " ).trim();
}

/**
 * The words of a tooltip given as markup, for its control's accessible name: as string-strip-html read them until
 * 2026-10-31 (13.8 KB of a visitor's chat panel, gzipped, for an aria-label). Its character references decoded, each
 * with its semicolon, again until none is left; its tags out, with a script's, a style's and an XML island's text; and
 * where tags stood, what reads as a gap: nothing where a single tag stood after an opening bracket or a quote or before
 * a closing one or a stop, else its line breaks (two at most) or one space. The rest of its spaces and lines kept, the
 * whole trimmed.
 */
export function plainLabel( content: string | null | undefined ): string {
    let text = content ?? "";
    for ( let next = decodeStrictly( text ); next !== text; next = decodeStrictly( text ) ) text = next;
    if ( ! /<[a-zA-Z!/]/.test( text ) ) return text.trim();
    const GAP = "\u0000";
    text = text.replace( /<(script|style|xml)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, GAP ).replace( /<[a-zA-Z!/][^>]*>/g, GAP );
    text = text.replace( /\s*\u0000[\s\u0000]*/g, ( gap: string, at: number, whole: string ) => {
        const before = whole[ at - 1 ] ?? "", after = whole[ at + gap.length ] ?? "";
        if ( ! before || ! after ) return "";
        const space = ( run: string ) => ( run.includes( "\n" ) ? "\n".repeat( Math.min( run.split( "\n" ).length - 1, 2 ) ) : run ? " " : "" );
        // A single tag beside a bracket, a quote or a stop: only the white space on the far side of it.
        if ( gap.split( GAP ).length === 2 ) {
            const [ lead, trail ] = gap.split( GAP );
            if ( /[)\]}"'»”’.,:;!?…]/.test( after ) ) return space( lead );
            if ( /[([{"'«“‘]/.test( before ) ) return space( trail );
        }
        return space( gap.replace( /\u0000/g, "" ) ) || " ";
    } );
    return text.trim();
}

/** Plain text as markup that shows it as it is. */
export function escapeHtml( text: string ): string {
    return text.replace( /&/g, "&amp;" ).replace( /</g, "&lt;" ).replace( />/g, "&gt;" ).replace( /"/g, "&quot;" ).replace( /'/g, "&#39;" );
}

// ─── CHARACTER REFERENCES ─────────────────────────────────────────────
//
// Text with its character references decoded, as html-entities' decode() did it (its HTML5 level, in text, not in an
// attribute), the package's until 2026-10-31: its table of every HTML5 name was 13.5 KB of a visitor's chat panel,
// gzipped, for a decoder every browser has. test/entities-corpus.test.ts and gallery/entities.spec.ts hold the two
// side by side, the second over every name in a real browser.
//
// - A numeric reference is decoded here, as html-entities does: 0 and U+10FFFF on as U+FFFD, 128 to 159 as Windows
//   1252 has them (&#150; is an en dash), every other number as its character.
// - A named one is the browser's own: the reference alone, its letters and digits only, as the text of a <textarea>,
//   which holds no markup, so nothing in it can become an element or run. A name that is not one stays as written,
//   and an old one written without its semicolon (&amp, &copy) is decoded before what follows it, as a page does.
// - Without a document (an app's server, a worker), or where the page forbids markup from a string (Trusted Types),
//   the names WordPress and the people who type names use (&amp;, &quot;, &nbsp;, &hellip; and the like). A rarer
//   one stays as written there: never another character.

const REFERENCE = /&(?:#(\d+)|#[xX]([\da-fA-F]+)|([0-9a-zA-Z]+));?/g;

// The numbers 128 to 159 as Windows 1252 has them, which is what a page that wrote one meant, and 0.
const WINDOWS_1252: Record<number, number> = {
    0: 65533, 128: 8364, 130: 8218, 131: 402, 132: 8222, 133: 8230, 134: 8224, 135: 8225, 136: 710, 137: 8240, 138: 352,
    139: 8249, 140: 338, 142: 381, 145: 8216, 146: 8217, 147: 8220, 148: 8221, 149: 8226, 150: 8211, 151: 8212, 152: 732,
    153: 8482, 154: 353, 155: 8250, 156: 339, 158: 382, 159: 376,
};

// Without a document: the names a display name holds as WordPress stores it (esc_html, wptexturize's named ones) and as
// people type them. Those of HTML before 5 decode without their semicolon too, as a page reads them (LEGACY).
const COMMON: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00a0", AMP: "&", LT: "<", GT: ">", QUOT: "\"",
    copy: "©", reg: "®", COPY: "©", REG: "®", trade: "™", hellip: "…", mdash: "—",
    ndash: "–", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
    laquo: "«", raquo: "»", bull: "•", middot: "·", euro: "€", pound: "£", yen: "¥",
    cent: "¢", deg: "°", times: "×", divide: "÷", sect: "§", para: "¶", iexcl: "¡",
    iquest: "¿", hearts: "♥", star: "☆", check: "✓",
};
const LEGACY = [ "amp", "lt", "gt", "quot", "nbsp", "AMP", "LT", "GT", "QUOT", "copy", "reg", "COPY", "REG", "laquo",
    "raquo", "middot", "pound", "yen", "cent", "deg", "times", "divide", "sect", "para", "iexcl", "iquest" ]
    // The longest first, so a name read without its semicolon takes all of itself ("&middot" before nothing shorter).
    .sort( ( a, b ) => b.length - a.length );
// The HTML5 names that start with one of those: "&ltcc;" is one character, not "<cc;", and stays as written here.
const LONGER = new Set( [ "centerdot", "copysr", "divideontimes", "gtcc", "gtcir", "gtdot", "gtlPar", "gtquest", "gtrapprox",
    "gtrarr", "gtrdot", "gtreqless", "gtreqqless", "gtrless", "gtrsim", "ltcc", "ltcir", "ltdot", "lthree", "ltimes", "ltlarr",
    "ltquest", "ltrPar", "ltri", "ltrie", "ltrif", "parallel", "timesb", "timesbar", "timesd" ] );

// The browser's readers: a textarea's text for a reference in text, an inert template's element for one in an
// attribute's value, where an old name without its semicolon is not decoded before a letter, a digit or "=". A reference
// is letters, digits, "&", "#" and ";" alone, so it can be no markup, and neither loads nor runs anything.
let readers: { text: HTMLTextAreaElement; attribute: HTMLTemplateElement } | null | undefined;

/** The browser's own reading of one named reference, or null where there is no document to read it. */
function browserReads( reference: string, inAttribute: boolean ): string | null {
    if ( readers === undefined ) {
        try {
            readers = typeof document !== "undefined" && typeof document.createElement === "function"
                ? { text: document.createElement( "textarea" ), attribute: document.createElement( "template" ) }
                : null;
        } catch {
            readers = null;
        }
        // A document that does not read every name as a browser does (a test DOM reads a few) reads none here.
        if ( readers ) {
            const lt = browserReads( "&lt;", false ), eacute = browserReads( "&eacute;", true );
            if ( lt !== "<" || eacute !== "é" ) readers = null;
        }
    }
    if ( ! readers ) return null;
    try {
        if ( ! inAttribute ) {
            readers.text.innerHTML = reference;
            return readers.text.value;
        }
        readers.attribute.innerHTML = `<i title="${ reference }"></i>`;
        return ( readers.attribute.content.firstChild as Element ).getAttribute( "title" );
    } catch {
        // A page that forbids markup from a string (Trusted Types): the names below, from now on.
        readers = null;
        return null;
    }
}

/** A numeric reference's character: as html-entities read it, or as a page reads it (`asPage`, markup's own). */
function numeric( code: number, asPage: boolean ): string {
    // A page reads a surrogate on its own as U+FFFD too, and U+10FFFF as itself.
    if ( asPage ? code > 0x10ffff || ( code >= 0xd800 && code <= 0xdfff ) : code >= 0x10ffff ) return String.fromCharCode( 0xfffd );
    return code > 0xffff ? String.fromCodePoint( code ) : String.fromCharCode( WINDOWS_1252[ code ] || code );
}

// The two names html-entities read as HTML 4 had them, where HTML5 and every browser read ⟨ and ⟩: kept, so no name
// a person sees changes. A page's own markup reads them as a page does (markup()).
const HTML4: Record<string, string> = { "&lang;": "\u2329", "&rang;": "\u232a" };

function named( reference: string, name: string, inAttribute: boolean, asPage: boolean ): string {
    if ( ! asPage && Object.prototype.hasOwnProperty.call( HTML4, reference ) ) return HTML4[ reference ];
    const read = browserReads( reference, inAttribute );
    if ( read !== null ) return read;

    if ( reference.endsWith( ";" ) && Object.prototype.hasOwnProperty.call( COMMON, name ) ) return COMMON[ name ];
    if ( reference.endsWith( ";" ) && LONGER.has( name ) ) return reference;
    const legacy = LEGACY.find( ( old ) => name.startsWith( old ) );
    if ( ! legacy || ( inAttribute && legacy !== name ) ) return reference;
    return COMMON[ legacy ] + reference.slice( legacy.length + 1 );
}

function decode( text: string | null | undefined, inAttribute: boolean, asPage: boolean ): string {
    if ( ! text ) return "";
    if ( text.indexOf( "&" ) === -1 ) return text;
    return text.replace( REFERENCE, ( reference: string, decimal: string | undefined, hex: string | undefined, name: string | undefined, at: number ) => {
        if ( name !== undefined ) {
            // An old name before "=" in an attribute's value is a URL's parameter, not a character.
            if ( inAttribute && ! reference.endsWith( ";" ) && text[ at + reference.length ] === "=" ) return reference;
            return named( reference, name, inAttribute, asPage );
        }
        return numeric( decimal !== undefined ? parseInt( decimal, 10 ) : parseInt( hex as string, 16 ), asPage );
    } );
}

/**
 * Text with its character references decoded (`&amp;` as `&`, `&#8217;` as `’`, `&eacute;` as `é`), as a page reads
 * them in its text. Plain text out: whatever markup the references spell stays text.
 */
export function decodeEntities( text: string | null | undefined ): string {
    return decode( text, false, false );
}

/** Each reference that ends with its semicolon decoded, as html-entities' "strict" decode() did (plainLabel()'s). */
function decodeStrictly( text: string ): string {
    if ( text.indexOf( "&" ) === -1 ) return text;
    return text.replace( REFERENCE, ( reference: string, decimal: string | undefined, hex: string | undefined, name: string | undefined ) => {
        if ( ! reference.endsWith( ";" ) ) return reference;
        // In an attribute's value a name is the whole name or none ("&notit;" no "¬it;"), as html-entities read it.
        if ( name !== undefined ) return named( reference, name, true, false );
        return numeric( decimal !== undefined ? parseInt( decimal, 10 ) : parseInt( hex as string, 16 ), false );
    } );
}

/**
 * Character references as a page's parser reads them in markup (markup()'s): in its text, or with `inAttribute` in an
 * attribute's value, where an old name before a letter, a digit or "=" is none (`?a=1&copy=2` keeps its `&copy`).
 * Where decodeEntities() reads a name as html-entities did, this reads every one as a page does (U+D800 as U+FFFD).
 */
export function pageText( text: string, inAttribute = false ): string {
    return decode( text, inAttribute, true );
}
