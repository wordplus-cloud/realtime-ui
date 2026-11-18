// The corpus the kit's own decoder of character references (src/inc/names.ts, decodeEntities()) is held to against
// html-entities' decode(), which plainName() used until 2026-10-31: html-entities stays a dev dependency for this
// alone. test/entities-corpus.test.ts runs it without a document (an app's server), gallery/entities.spec.ts in
// Chromium, where every named reference is the browser's own.
import { decode } from 'html-entities';
// The library's table of every HTML5 name, read from its file (its package exports only the decoder).
import { namedReferences } from '../../node_modules/html-entities/dist/esm/named-references.js';

/** plainName() as it was, on html-entities. */
export function plainNameBefore( name: string | null | undefined ): string {
    const stripped = ( name ?? '' ).replace( /<[^>]*>/g, ' ' );
    const once = stripped.indexOf( '&' ) === -1 ? stripped : decode( stripped );
    return once.replace( /<\/?[a-zA-Z][^>]*>/g, ' ' ).replace( /\s+/g, ' ' ).trim();
}

export const decodeBefore = ( text: string ): string => decode( text );

/** Every HTML5 named reference, as written with its semicolon, and the 106 old ones without it too. */
export const NAMED: string[] = Object.keys( ( namedReferences as Record<string, { entities: Record<string, string> }> ).html5.entities );

/** Each named reference where it stands in text: alone, between words, before letters, digits, a semicolon, a sign. */
export function namedInText(): string[] {
    const out: string[] = [];
    for ( const reference of NAMED ) {
        const bare = reference.replace( /;$/, '' );
        out.push( reference, `a${ reference }b`, `${ bare }x`, `${ bare }x;`, `${ bare }1;`, `${ bare };;`, `${ bare }=`, `${ reference }${ reference }`, `${ bare } ${ bare }` );
    }
    return out;
}

const CODES = [
    0, 1, 8, 9, 10, 11, 12, 13, 31, 32, 38, 39, 60, 62, 65, 127, ...Array.from( { length: 34 }, ( _, i ) => 127 + i ), 173,
    0x2019, 0x2026, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000, 0xfdd0, 0xfffd, 0xfffe, 0xffff, 0x10000, 0x1f600,
    0x1f468, 0x10fffe, 0x10ffff, 0x110000, 0x7fffffff, 0xffffffff,
];

/** Numeric references: decimal and hexadecimal, with and without a semicolon, leading zeros, both cases of x. */
export function numeric(): string[] {
    const out: string[] = [];
    for ( const code of CODES ) {
        const hex = code.toString( 16 );
        out.push( `&#${ code };`, `&#${ code }`, `&#000${ code };`, `&#x${ hex };`, `&#X${ hex.toUpperCase() };`, `&#x${ hex }`, `&#x00${ hex };`, `a&#${ code }b`, `&#${ code }abc;`, `&#x${ hex }g;` );
    }
    out.push( '&#99999999999999999999;', '&#x1234567890abcdef;', '&#;', '&#x;', '&#X;', '&#', '&#x', '&#-1;', '&# 65;', '&#+65;' );
    return out;
}

/**
 * Names as WordPress stores and shows them (esc_html's five, wptexturize's numbers), as people type them, badges and
 * all: the same everywhere, on a server too.
 */
export const STORED: string[] = [
    'Ann', 'Ann &amp; Ben', 'Tom & Jerry', 'R&D', 'AT&T', 'Ben &lt;3', 'Ben <3', 'O&#039;Brien', 'O&#39;Brien', 'O&#x27;Brien',
    'O\'Brien', 'Jos&#233;', '&#8220;Bob&#8221;', 'Bob&#8217;s shop', 'Ann&hellip;', 'Ann &mdash; support', 'Ann &ndash; 2',
    '&nbsp;Lead', 'Lead&nbsp;&nbsp;Dev', '&copy; Ann', 'Ann&reg;', 'Ann&trade;', '&laquo;Ann&raquo;', '&lsquo;A&rsquo;',
    'a &amp;amp; b', '&amp;lt;b&amp;gt;', '&lt;b&gt;Bold&lt;/b&gt;', '&lt;img src=x onerror=alert(1)&gt;Ben <b>VIP</b>',
    '&lt;script&gt;alert(1)&lt;/script&gt;', '&#60;b&#62;x&#60;/b&#62;', '&#x3C;i&#x3E;y&#x3C;/i&#x3E;',
    '<span class="bm-badge">Pro</span> Ann', 'Ann <img class="bm-emoji" src="/e.png" alt="&#x1F600;">',
    'Ann <span class="badge" title="Top &amp; Best">&#9733;</span>', '<a href="/u/ann">Ann</a>', 'Ann&#x1F600;', 'Ann &#128512;',
    '&#x1F468;&#x200D;&#x1F4BB; Dev', 'Ann&', 'Ann &', '& Ann', '&&&', '&;', '&amp', '&ampAnn', '&copy2026', '&lt3', '&gtx',
    'Ann&Ben;', 'Ann&ben;', 'A&B&C', '&euro;5', '5&pound;', '&yen;', '&deg;C', '1&times;2', '1&divide;2', '&sect;1', '&para;',
    '&iexcl;Hola!', '&bull; Ann', '&middot;Ann&middot;', 'Ann\u00a0Ben', 'Ann\n\tBen', '  Ann  ', '', 'Ann &#13;&#10; Ben', 'Ann&#0;',
    '&#128;uro', '&#150; dash', '&#x96;', '&#x81;', '&hearts; Ann', '&star;', '&check;', 'الاسم &amp; שם',
    '你好&amp;', '&Amp;', '&AMP;', '&QUOT;Ann&QUOT;',
];

/** Names with the rarer named references: the same in a browser, and on a server left as written. */
export const RARER: string[] = [
    'Caf&eacute; Owner', 'M&uuml;ller', 'Zo&euml;', 'Fran&ccedil;ois', 'Bj&ouml;rk', '&iquest;Qu&eacute;?', '&notit;', '&notin;',
    '&ltcc;', '&Auml;rger', '&AElig;', '&szlig;', '&THORN;', '&Alpha;&Omega;', '&alpha;&beta;', '&rarr; Ann', '&larr;', '&harr;',
    '&spades;&clubs;&diams;', '&frac12;', '&sup2;', '&micro;', '&plusmn;', '&shy;Ann', '&zwj;', '&zwnj;', '&lrm;Ann&rlm;',
    '&ensp;&emsp;&thinsp;', '&centerdot;', '&copysr;', '&timesbar;',
];

export const NAMES: string[] = [ ...STORED, ...RARER ];
