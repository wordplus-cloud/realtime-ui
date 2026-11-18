// The markup the kit's own reader (src/inc/markup.tsx, markup()) is held to against html-react-parser's parse(), which
// drew it until 2026-10-31 and stays a dev dependency for this alone: what a screen is given as markup to draw. Each
// drawn by both, then rendered to static markup, must give the same markup, and the same elements and properties
// (test/markup-corpus.test.tsx without a document, gallery/markup.spec.ts in Chromium, where html-react-parser read
// markup through the browser's own parser, as it did for every person on Better Messages).
import { escapeHtml, plainName } from '../../src/inc/names.ts';
import { NAMES } from './entities.ts';

/** The integrations' icons Better Messages ships (its inc/ and addons/, as in its 3.1 development), as ResolvedIcon draws them. */
export const ICONS: string[] = [
    '<svg style="width:60%;height:60%;max-width:36px;max-height:36px" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
    '<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'><path d=\'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z\'/></svg>',
    '<svg class="rh-ultra-dark bm-realhomes-contact-icon" xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M4 4h16v12H5.17L4 17.17V4z" opacity=".3"/><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>',
    '<svg style="width:60%;height:60%;max-width:36px;max-height:36px" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="portal-feeds-icon" style="flex-shrink:0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    '<svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true" height="20px" width="20px" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"></path></svg>',
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M2.678 11.894a1 1 0 0 1 .287.801 11 11 0 0 1-.398 2c1.395-.323 2.247-.697 2.634-.893a1 1 0 0 1 .71-.074A8 8 0 0 0 8 14c3.996 0 7-2.807 7-6s-3.004-6-7-6-7 2.808-7 6c0 1.468.617 2.83 1.678 3.894m-.493 3.905a22 22 0 0 1-.713.129c-.2.032-.352-.176-.273-.362a10 10 0 0 0 .244-.637l.003-.01c.248-.72.45-1.548.524-2.319C.743 11.37 0 9.76 0 8c0-3.866 3.582-7 8-7s8 3.134 8 7-3.582 7-8 7a9 9 0 0 1-2.347-.306c-.52.263-1.639.742-3.468 1.105"></path></svg>',
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M374.79 308.78 457.5 367a16 16 0 0 0 22.5-14.62V159.62A16 16 0 0 0 457.5 145l-82.71 58.22A16 16 0 0 0 368 216.3v79.4a16 16 0 0 0 6.79 13.08z"></path><path fill="none" stroke-miterlimit="10" stroke-width="32" d="M268 384H84a52.15 52.15 0 0 1-52-52V180a52.15 52.15 0 0 1 52-52h184.48A51.68 51.68 0 0 1 320 179.52V332a52.15 52.15 0 0 1-52 52z"></path></svg>',
    '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke-miterlimit="10" stroke-width="32" d="M451 374c-15.88-16-54.34-39.35-73-48.76-24.3-12.24-26.3-13.24-45.4.95-12.74 9.47-21.21 17.93-36.12 14.75s-47.31-21.11-75.68-49.39-47.34-61.62-50.53-76.48 5.41-23.23 14.79-36c13.22-18 12.22-21 .92-45.3-8.81-18.9-32.84-57-48.9-72.8C119.9 44 119.9 47 108.83 51.6A160.15 160.15 0 0 0 83 65.37C67 76 58.12 84.83 51.91 98.1s-9 44.38 23.07 102.64 54.57 88.05 101.14 134.49S258.5 406.64 310.85 436c64.76 36.27 89.6 29.2 102.91 23s22.18-15 32.83-31a159.09 159.09 0 0 0 13.8-25.8C465 391.17 468 391.17 451 374z"></path></svg>',
    // As SVG editors write them: a gradient, a stylesheet, a link to a symbol, a title, a clip path, attributes in capitals.
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#000"/></linearGradient><clipPath id="c"><rect width="24" height="24"/></clipPath><style>.a{fill:url(#g)}</style></defs><title>Chat &amp; calls</title><g clip-path="url(#c)"><use xlink:href="#s" class="a"/><path fill-rule="evenodd" clip-rule="evenodd" d="M1 1h22v22H1z"/></g></svg>',
    '<SVG VIEWBOX="0 0 24 24" FILL="none"><PATH D="M4 4h16" STROKE-WIDTH="2" strokeLinecap="round"/></SVG>',
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><circle cx="8" cy="8" r="7" vector-effect="non-scaling-stroke"></circle><text x="8" y="12" text-anchor="middle" font-size="10">!</text></svg>',
    '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M12 2a10 10 0 1 0 0 20"/></svg>\n',
];

/** Names, as Better Messages' nameHtml() gives them to draw (its allowlist, through the browser's own markup): badges, emoji pictures, links. */
export const BADGES: string[] = [
    'Ann',
    'Ann <span class="bm-badge" style="background-color: rgb(238, 51, 51); color: rgb(255, 255, 255); border-radius: 3px; padding: 0px 4px; font-size: 10px;">PRO</span>',
    'Ann <img class="emoji" draggable="false" role="img" alt="😀" src="https://s.w.org/images/core/emoji/15.0.3/svg/1f600.svg">',
    '<img src="https://example.com/wp-content/uploads/verified.png" width="14" height="14" alt="" loading="lazy" decoding="async"> Ben',
    '<a href="https://example.com/members/ann/?tab=profile&amp;region=eu&amp;copy=1" target="_blank" rel="noopener">Ann</a>',
    '<a href="https://example.com/?a=1&region=eu&copy=2&para">Ann</a>',
    '<strong>Ann</strong> <em>Lead</em><br><small>Support</small>',
    '<span class="um-verified" title="Verified &amp; trusted" data-tooltip="Verified" aria-label="Verified">✔</span>Cara',
    '<abbr title="Chief &quot;Fun&quot; Officer">CFO</abbr> Dan',
    '<b>Eve</b><sup>2</sup><sub>x</sub><mark>!</mark><u>u</u><s>s</s><bdi>إيف</bdi><i>i</i>',
    '<span dir="rtl" lang="he">שרה</span> &amp; Sara',
    '<span style="color:red;/* a note */font-weight:bold">Red</span>',
    '<span style="-webkit-text-stroke: 1px #000; -ms-filter: none; --badge: 1; COLOR: Blue">Vendor</span>',
    '<span style="color red">Broken style</span>',
    '<span style="">Empty style</span>',
    '<span style="background:url(https://e.com/a;b.png) no-repeat; content: \'a;b\'">Url</span>',
    '<span class="a" class="b" title="one" title="two">Twice</span>',
    'Ben &lt;3 <3 &amp; 1 < 2 > 0',
    '&lt;b&gt;not bold&lt;/b&gt;',
    // Numbers a page reads otherwise than html-entities did (a surrogate alone, U+10FFFF), and its ⟨ and ⟩.
    '<span title="&#xD800;&#x10FFFF;&#0;&#128;&lang;">&#xD800;&#xDBFF;&#x10FFFF;&#x110000;&#150; &lang;x&rang;</span>',
    'Ann<!-- a note -->Ben',
    '  Ann  ',
    '',
    '<span>a</span>\n<span>b</span>',
    'Ann\r\nBen',
];

/** The page's own markup in an element's <template>, as the browser gives it back (innerHTML). */
export const TEMPLATES: string[] = [
    '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2v20M2 12h20" stroke="currentColor"></path></svg>',
    '<span class="my-icon">★</span>',
    '<img src="/icons/raise.png" alt="">',
    '<div class="ring"><b data-field="name"></b> calls (<span data-field="type"></span>)\n                <button data-action="answer">Pick up</button> <button data-action="reject">Not now</button></div>',
    '<style>.x { color: red; } .x > b { font-weight: 700; }</style><p>Ask us anything about your order.</p>',
    '<custom-badge level="gold" class="b" style="color: gold">Gold</custom-badge>',
    '<button is="fancy-button" class="x" tabindex="0">Go</button>',
    '<table><tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody></table>',
    '<input type="checkbox" checked disabled value="1"><input type="submit" value="Send">',
    '<textarea readonly maxlength="5">Hi &amp; bye</textarea>',
    '<label for="x" class="lbl" contenteditable="false" spellcheck="false">Label</label>',
    '<video src="/v.mp4" autoplay muted loop playsinline controls></video><a href="/f.pdf" download>File</a>',
];

/** Kinds of markup no screen is given, to show what it does with them: none may be more than html-react-parser drew. */
export const HOSTILE: string[] = [
    '<img src="x" onerror="alert(1)">',
    '<a href="https://e.com" onclick="alert(1)" onMouseOver="x()">Ann</a>',
    '<svg onload="alert(1)"><path d="M1 1"/></svg>',
    // A custom element took its attributes as they were, so React set this one, a handler from a string, on the page.
    '<custom-badge level="gold" onclick="alert(1)">Gold</custom-badge>',
    '<b>Ann<i>Ben</b>Cara</i>',
    '<span>unclosed <b>bold',
    '</span>stray end',
    '<!doctype html><span>x</span>',
];

/** Markup React itself blocked, which markup() leaves out: a javascript: address. */
export const BLOCKED: string[] = [
    '<a href="javascript:alert(1)">x</a>',
    '<a href=" JaVaScRiPt:alert(1)">x</a>',
    '<a href="java&#x09;script:alert(1)">x</a>',
    '<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>',
];

/** A name as the kit's own nameHtml() gives it (the plain name, escaped), and as it arrives, for the names of entities.ts. */
export const NAMES_DRAWN: string[] = NAMES.flatMap( ( name ) => [ escapeHtml( plainName( name ) ), name ] );

/** Every word of the kit's eight languages, the English and its translations, as a tooltip is given them. */
export function words( languages: Record<string, Record<string, string | string[]>> ): string[] {
    const all = new Set<string>();
    for ( const table of Object.values( languages ) ) {
        for ( const [ key, value ] of Object.entries( table ) ) {
            all.add( key.split( '\u0004' ).pop()! );
            for ( const text of Array.isArray( value ) ? value : [ value ] ) all.add( text );
        }
    }
    return [ ...all ];
}
