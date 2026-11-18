import { createElement, type ReactNode } from "react";
import { pageText } from "./names.ts";

// Markup a screen is given as a string, drawn as React elements: a name with a site's badges and emoji pictures (the
// host's nameHtml()), a tooltip's words, an integration's SVG icon, a template of the page's own. html-react-parser
// did it until 2026-10-31, through the browser's parser or htmlparser2 and a table of every React property: 10.7 KB of
// a visitor's chat panel, gzipped. This reads the markup itself, the same on a server and in a browser, so a page drawn
// on a server and taken over in the browser finds the same elements, and builds the same elements and properties
// html-react-parser built from markup as a page writes it: test/markup-corpus.test.tsx and gallery/markup.spec.ts hold
// the two side by side.
//
// What it never builds is what React already left out of html-react-parser's elements: an `on…` attribute (a string
// is no handler) and a `javascript:` address (React 19 blocks it, React 18, WordPress's, runs it). A <script> is left
// out with its text. Nothing here goes through innerHTML.

// Elements that hold nothing, and those whose text is not markup.
const VOID = new Set( "area base br col embed hr img input link meta param source track wbr".split( " " ) );
const RAW = new Set( [ "script", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "textarea", "title" ] );
// Where text of white space alone is no child (React says so of a table's rows).
const NO_TEXT = new Set( "tr tbody thead tfoot colgroup table head html frameset".split( " " ) );

// SVG's names that HTML would write in lower case.
const SVG_TAGS = "animateMotion animateTransform clipPath feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject linearGradient radialGradient textPath";
const SVG_ATTRIBUTES = "attributeName attributeType baseFrequency baseProfile calcMode clipPathUnits diffuseConstant edgeMode filterUnits glyphRef gradientTransform gradientUnits kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY repeatCount repeatDur requiredExtensions requiredFeatures specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles surfaceScale systemLanguage tableValues targetX targetY textLength viewBox viewTarget xChannelSelector yChannelSelector zoomAndPan";
const cased = ( names: string ): Record<string, string> => Object.fromEntries( names.split( " " ).map( ( name ) => [ name.toLowerCase(), name ] ) );
const SVG_TAG_CASE = cased( SVG_TAGS );
const SVG_ATTRIBUTE_CASE = cased( SVG_ATTRIBUTES );

// React's names for the attributes it names otherwise, as html-react-parser read them in React's own list (an attribute
// in any case): HTML's, SVG's in their case, and SVG's and XML's written with a hyphen or a colon, or with neither
// (stroke-width and strokewidth as strokeWidth, xlink:href as xlinkHref).
const HYPHENATED = ( "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode x-height accept-charset http-equiv xlink:actuate xlink:arcrole xlink:href xlink:role xlink:show xlink:title xlink:type xml:base xml:lang xml:space xmlns:xlink" )
    .split( " " ).map( ( name ) => [ name, name.replace( /[-:](.)/g, ( _, letter: string ) => letter.toUpperCase() ) ] );
const PROPS: Record<string, string> = {
    ...cased( "acceptCharset accessKey allowFullScreen autoCapitalize autoComplete autoCorrect autoFocus autoPlay autoSave cellPadding cellSpacing charSet classID colSpan contentEditable contextMenu controlsList crossOrigin dateTime defaultChecked defaultValue disablePictureInPicture disableRemotePlayback encType enterKeyHint formAction formEncType formMethod formNoValidate formTarget frameBorder hrefLang htmlFor httpEquiv inputMode itemID itemProp itemRef itemScope itemType keyParams keyType marginHeight marginWidth maxLength mediaGroup minLength noModule noValidate playsInline radioGroup readOnly referrerPolicy rowSpan spellCheck srcDoc srcLang srcSet tabIndex useMap allowReorder autoReverse contentScriptType contentStyleType externalResourcesRequired filterRes " + SVG_ATTRIBUTES ),
    ...Object.fromEntries( HYPHENATED.map( ( [ , prop ] ) => [ prop.toLowerCase(), prop ] ) ),
    ...Object.fromEntries( HYPHENATED ),
    class: "className",
    classname: "className",
    for: "htmlFor",
};
// Properties React reads as true or false, and two that are also a value.
const BOOLEAN = new Set( "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope checked multiple muted selected".split( " " ) );
const BOOLEAN_OR_VALUE = new Set( [ "capture", "download" ] );

interface Element { name: string; attributes: Array<[ string, string ]>; children: Node[]; svg: boolean; text?: string }
type Node = string | Element | null;

/** The markup's nodes, as a page's parser reads markup a page writes (comments and declarations as nothing). */
function read( html: string ): Node[] {
    const root: Element = { name: "", attributes: [], children: [], svg: false };
    const open: Element[] = [ root ];
    const top = () => open[ open.length - 1 ];
    // Where a tag, an end tag, a comment or a declaration starts: any other "<" is text ("Ben <3").
    const markupAt = /<[a-zA-Z/!?]/g;
    let at = 0;

    while ( at < html.length ) {
        markupAt.lastIndex = at;
        const next = markupAt.exec( html );
        const lt = next ? next.index : html.length;
        if ( lt > at ) top().children.push( pageText( html.slice( at, lt ) ) );
        if ( ! next ) break;
        at = lt;

        if ( html.startsWith( "<!--", at ) ) {
            const end = html.indexOf( "-->", at + 4 );
            at = end === -1 ? html.length : end + 3;
            top().children.push( null );
            continue;
        }
        const close = /^<\/([a-zA-Z][^\s/>]*)[^>]*>?/.exec( html.slice( at ) );
        if ( close ) {
            at += close[ 0 ].length;
            const name = close[ 1 ].toLowerCase();
            for ( let i = open.length - 1; i > 0; i-- ) {
                if ( open[ i ].name.toLowerCase() === name ) {
                    open.length = i;
                    break;
                }
            }
            continue;
        }
        const tag = /^<([a-zA-Z][^\s/>]*)/.exec( html.slice( at ) );
        if ( ! tag ) {
            // A declaration (<!doctype>), an instruction, or "</" before no name: a comment, as a page has it.
            const end = html.indexOf( ">", at );
            at = end === -1 ? html.length : end + 1;
            top().children.push( null );
            continue;
        }
        at += tag[ 0 ].length;

        // Its attributes, the first of a name kept, as a page keeps it.
        const attributes: Array<[ string, string ]> = [];
        let selfClosing = false;
        for ( ;; ) {
            const space = /^[\s/]*/.exec( html.slice( at ) )![ 0 ];
            selfClosing = space.endsWith( "/" ) && html[ at + space.length ] === ">";
            at += space.length;
            if ( at >= html.length ) break;
            if ( html[ at ] === ">" ) {
                at++;
                break;
            }
            const attribute = /^([^\s"'>/=]+|=[^\s"'>/=]*)(?:\s*=\s*(?:"([^"]*)"?|'([^']*)'?|([^\s>]*)))?/.exec( html.slice( at ) )!;
            at += attribute[ 0 ].length;
            const name = attribute[ 1 ].toLowerCase();
            const value = attribute[ 2 ] ?? attribute[ 3 ] ?? attribute[ 4 ] ?? "";
            if ( ! attributes.some( ( [ seen ] ) => seen === name ) ) attributes.push( [ name, pageText( value, true ) ] );
        }

        const parent = top();
        const lower = tag[ 1 ].toLowerCase();
        const svg = parent.svg || lower === "svg";
        const element: Element = {
            name: svg ? SVG_TAG_CASE[ lower ] ?? lower : lower,
            attributes: svg ? attributes.map( ( [ name, value ] ) => [ SVG_ATTRIBUTE_CASE[ name ] ?? name, value ] ) : attributes,
            children: [],
            svg: svg && lower !== "foreignobject",
        };
        parent.children.push( element );

        if ( ! svg && RAW.has( lower ) ) {
            const end = html.toLowerCase().indexOf( "</" + lower, at );
            const raw = html.slice( at, end === -1 ? html.length : end );
            element.text = lower === "textarea" || lower === "title" ? pageText( raw ) : raw;
            at = end === -1 ? html.length : html.indexOf( ">", end ) + 1 || html.length;
            continue;
        }
        if ( VOID.has( lower ) || ( svg && selfClosing ) ) continue;
        open.push( element );
    }

    return root.children;
}

/** An inline style as React's object, as style-to-js wrote it: vendor prefixes capitalised but -ms-, custom properties kept. */
function styleOf( css: string ): Record<string, string> {
    const style: Record<string, string> = {};
    if ( ! css.trim() ) return style;
    let rest = css.replace( /^\s*/, "" );
    const skipComments = () => {
        while ( rest.startsWith( "/*" ) ) {
            const end = rest.indexOf( "*/", 2 );
            if ( end === -1 ) throw new Error( "comment" );
            rest = rest.slice( end + 2 ).replace( /^\s*/, "" );
        }
    };
    const take = ( pattern: RegExp ) => {
        const m = pattern.exec( rest );
        if ( m ) rest = rest.slice( m[ 0 ].length );
        return m;
    };
    const clean = ( text: string ) => text.replace( /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, "" ).trim();
    try {
        skipComments();
        for ( ;; ) {
            const property = take( /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/ );
            if ( ! property ) break;
            skipComments();
            if ( ! take( /^:\s*/ ) ) throw new Error( "colon" );
            const value = take( /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/ );
            take( /^[;\s]*/ );
            rest = rest.replace( /^\s*/, "" );
            const name = clean( property[ 0 ] );
            const text = value ? clean( value[ 0 ] ) : "";
            if ( name && text ) {
                const key = /^[^-]+$/.test( name ) || /^--[a-zA-Z0-9_-]+$/.test( name )
                    ? name
                    : name.toLowerCase().replace( /^-(ms)-/, "$1-" ).replace( /-([a-z])/g, ( _, letter: string ) => letter.toUpperCase() );
                style[ key ] = text;
            }
            skipComments();
        }
    } catch {
        return {};
    }
    return style;
}

/** An element's attributes as React's properties, as html-react-parser gave them. */
function propsOf( element: Element ): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const custom = element.name.includes( "-" ) || element.attributes.some( ( [ name ] ) => name === "is" );
    const resets = element.attributes.some( ( [ name, value ] ) => name === "type" && ( value === "reset" || value === "submit" ) );

    for ( const [ name, value ] of element.attributes ) {
        // React runs no handler from a string, and blocks a `javascript:` address only from 19 on.
        if ( /^on/i.test( name ) ) continue;
        if ( /^(href|src|action|formaction|xlink:href)$/.test( name ) && /^javascript:/i.test( value.replace( /[\x00-\x20]/g, "" ) ) ) continue;
        if ( custom || /^(data|aria)-/.test( name ) ) {
            props[ name ] = value;
            continue;
        }
        const prop = PROPS[ name.toLowerCase() ] ?? name;
        const uncontrolled = ( prop === "checked" || prop === "value" ) && /^(input|select|textarea)$/.test( element.name ) && ! resets;
        props[ uncontrolled ? ( prop === "checked" ? "defaultChecked" : "defaultValue" ) : prop ] = BOOLEAN.has( prop ) || ( BOOLEAN_OR_VALUE.has( prop ) && value === "" ) ? true : value;
    }
    const style = element.attributes.find( ( [ name ] ) => name === "style" );
    if ( style ) props.style = styleOf( style[ 1 ] );
    return props;
}

function draw( nodes: Node[], parent: Element | null ): ReactNode {
    const drawn: ReactNode[] = [];
    nodes.forEach( ( node, index ) => {
        if ( node === null ) return;
        if ( typeof node === "string" ) {
            if ( ! node.trim() && parent && NO_TEXT.has( parent.name ) ) return;
            drawn.push( node );
            return;
        }
        if ( node.name === "script" ) return;
        const props = propsOf( node );
        let children: ReactNode;
        // A stylesheet's text as it is, never escaped (an SVG's <style> read as text, an HTML one as written).
        const first = node.text ?? node.children[ 0 ];
        if ( node.name === "style" ) {
            if ( first ) props.dangerouslySetInnerHTML = { __html: typeof first === "string" ? first : undefined };
        } else if ( node.name === "textarea" ) {
            if ( first ) props.defaultValue = first;
        } else if ( node.text !== undefined ) {
            if ( node.text ) children = node.text;
        } else if ( node.children.length ) {
            children = draw( node.children, node );
        }
        if ( nodes.length > 1 ) props.key = index;
        drawn.push( createElement( node.name, props, children ) );
    } );
    return drawn.length === 1 ? drawn[ 0 ] : drawn;
}

/**
 * Markup as React elements: what html-react-parser's parse() gave, read here. An empty string is nothing; one node is
 * itself; several are a list with their keys.
 */
export function markup( html: string ): ReactNode {
    if ( ! html ) return [];
    return draw( read( html ), null );
}
