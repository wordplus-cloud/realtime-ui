// What the screens ask of the browser they run in: the eleven answers below, read from the user agent and the few
// navigator properties that say more than it does, on the first question and once, never as the page loads.
//
// The answers are those ua-parser-js 1.0.41 gave, which the kit carried until 2026-10-31 with compare-versions (8.6 KB
// of a visitor's chat panel, gzipped, for eleven questions): test/browser-info-corpus.test.ts holds the two side by side
// over some ninety user agents. Only what the answers need is read here: the browser's name and version, the system's
// name and version, and whether the device is held in the hand (a phone or a tablet).

/** The parts of `navigator` that are read. */
export interface AgentSource {
    userAgent?: string;
    /** User-Agent Client Hints: a phone where the user agent names no device, the system where it names none. */
    userAgentData?: { mobile?: boolean; platform?: string } | null;
    /** iOS Safari's alone: with touch, it is an iPad asking for desktop sites, whose user agent says Mac. */
    standalone?: unknown;
    maxTouchPoints?: number;
    /** Brave says so here, never in its user agent. */
    brave?: { isBrave?: unknown } | null;
}

export interface AgentInfo {
    browser: { name?: string; version?: string };
    os: { name?: string; version?: string };
    /** A phone or a tablet. */
    handheld: boolean;
}

type Named = [ string | undefined, string | undefined ];
type Rule = [ RegExp, ( m: RegExpExecArray ) => Named ];

// Safari 1 and 2 named their build, not their version, after "Safari/".
const OLD_SAFARI: Array<[ string, string ]> = [ [ "/8", "1.0" ], [ "/1", "1.2" ], [ "/3", "1.3" ], [ "/412", "2.0" ], [ "/416", "2.0.2" ], [ "/417", "2.0.3" ], [ "/419", "2.0.4" ] ];
const oldSafari = ( build: string ): string | undefined => OLD_SAFARI.find( ( [ token ] ) => build.toLowerCase().includes( token ) )?.[ 1 ];

// The browsers, the first rule that matches naming it, so the order is what decides: an app's view says Chrome and its
// own name, Edge and Opera say Chrome and Safari too, Chrome says Safari.
const BROWSERS: Rule[] = [
    [ /\b(?:crmo|crios)\/([\w.]+)/i, ( m ) => [ "Chrome", m[ 1 ] ] ],
    [ /edg(?:e|ios|a)?\/([\w.]+)/i, ( m ) => [ "Edge", m[ 1 ] ] ],
    [ /(opera mini)\/([-\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(opera (?:mobi|tablet))\b.+version\/([-\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(opera)(?:.+version\/|[/ ]+)([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /opios[/ ]+([\w.]+)/i, ( m ) => [ "Opera Mini", m[ 1 ] ] ],
    [ /\bop(?:rg)?x\/([\w.]+)/i, ( m ) => [ "Opera GX", m[ 1 ] ] ],
    [ /\bopr\/([\w.]+)/i, ( m ) => [ "Opera", m[ 1 ] ] ],
    [ /(?:ms|\()(ie) ([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(vivaldi|silk|brave|whale(?!.+naver)|duckduckgo|puffin|midori|epiphany|falkon|iron)\/([-\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /\bddg\/([\w.]+)/i, ( m ) => [ "DuckDuckGo", m[ 1 ] ] ],
    [ /(?:\buc? ?browser|juc.+ucweb)[/ ]?([\w.]+)/i, ( m ) => [ "UCBrowser", m[ 1 ] ] ],
    [ /micromessenger\/([\w.]+)/i, ( m ) => [ "WeChat", m[ 1 ] ] ],
    [ /trident.+rv[: ]([\w.]{1,9})\b.+like gecko/i, ( m ) => [ "IE", m[ 1 ] ] ],
    [ /ya(?:search)?browser\/([\w.]+)/i, ( m ) => [ "Yandex", m[ 1 ] ] ],
    [ /(avast|avg)\/([\w.]+)/i, ( m ) => [ m[ 1 ] + " Secure Browser", m[ 2 ] ] ],
    [ /\bfocus\/([\w.]+)/i, ( m ) => [ "Firefox Focus", m[ 1 ] ] ],
    [ /\bopt\/([\w.]+)/i, ( m ) => [ "Opera Touch", m[ 1 ] ] ],
    [ /coc_coc\w+\/([\w.]+)/i, ( m ) => [ "Coc Coc", m[ 1 ] ] ],
    [ /miuibrowser\/([\w.]+)/i, ( m ) => [ "MIUI Browser", m[ 1 ] ] ],
    [ /fxios\/([\w.-]+)/i, ( m ) => [ "Firefox", m[ 1 ] ] ],
    [ /(oculus|huawei|vivo|pico)browser\/([\w.]+)/i, ( m ) => [ m[ 1 ] + " Browser", m[ 2 ] ] ],
    [ /samsungbrowser\/([\w.]+)/i, ( m ) => [ "Samsung Internet", m[ 1 ] ] ],
    [ /(electron)\/([\w.]+) safari/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w.]+);/i, ( m ) => [ "Facebook", m[ 1 ] ] ],
    [ /safari (line)\/([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /\b(line)\/([\w.]+)\/iab/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(chromium|instagram|snapchat)[/ ]([-\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /\bgsa\/([\w.]+) .*safari\//i, ( m ) => [ "GSA", m[ 1 ] ] ],
    [ /musical_ly(?:.+app_?version\/|_)([\w.]+)/i, ( m ) => [ "TikTok", m[ 1 ] ] ],
    [ /headlesschrome(?:\/([\w.]+)| )/i, ( m ) => [ "Chrome Headless", m[ 1 ] ] ],
    [ / wv\).+chrome\/([\w.]+)/i, ( m ) => [ "Chrome WebView", m[ 1 ] ] ],
    [ /droid.+ version\/([\w.]+)\b.+(?:mobile safari|safari)/i, ( m ) => [ "Android Browser", m[ 1 ] ] ],
    [ /(chrome)\/v?([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /version\/([\w.,]+) .*mobile\/\w+ safari/i, ( m ) => [ "Mobile Safari", m[ 1 ] ] ],
    [ /version\/([\w(.|,)]+) .*(mobile ?safari|safari)/i, ( m ) => [ m[ 2 ], m[ 1 ] ] ],
    [ /webkit.+?(mobile ?safari|safari)(\/[\w.]+)/i, ( m ) => [ m[ 1 ], oldSafari( m[ 2 ] ) ] ],
    [ /(webkit|khtml)\/([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(waterfox|palemoon|seamonkey|librewolf)\/([-\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(firefox)\/([\w.]+)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(mozilla)\/([\w.]+) .+rv:.+gecko\/\d+/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
];

// Windows names its version by its kernel's.
const WINDOWS: Record<string, string> = { "4.90": "ME", "5.0": "2000", "5.1": "XP", "5.2": "XP", "6.0": "Vista", "6.1": "7", "6.2": "8", "6.3": "8.1", "6.4": "10", "10.0": "10" };
const dotted = ( version: string | undefined ) => version?.replace( /_/g, "." );

const SYSTEMS: Rule[] = [
    [ /(windows (?:phone(?: os)?|mobile))[/ ]?([\d.]*)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /windows nt 6\.2; arm/i, () => [ "Windows", "RT" ] ],
    [ /windows nt ([\d.]+)(?!.+xbox)/i, ( m ) => [ "Windows", WINDOWS[ m[ 1 ] ] ?? "NT " + m[ 1 ] ] ],
    // An iPhone, an iPad or an iPod, then an app's view on one that names the system itself.
    [ /(?:iphone|ipad|ipod|phone)\b.*os (\w+) like mac/i, ( m ) => [ "iOS", dotted( m[ 1 ] ) ] ],
    [ /(?:ios;fbsv\/|iphone.+ios[/ ])([\d.]+)/i, ( m ) => [ "iOS", dotted( m[ 1 ] ) ] ],
    [ /cfnetwork\/.+darwin/i, () => [ "iOS", undefined ] ],
    [ /mac os x ?([\w. ]*)/i, ( m ) => [ "Mac OS", dotted( m[ 1 ] ) ] ],
    [ /macintosh|mac_powerpc\b/i, () => [ "Mac OS", undefined ] ],
    [ /droid ([\w.]+)\b.+(android[- ]x86|harmonyos)/i, ( m ) => [ m[ 2 ], m[ 1 ] ] ],
    [ /(android|bada|blackberry|kaios|maemo|meego|openharmony|qnx|sailfish|series40|symbian|tizen|webos)\w*[-/; ]?([\d.]*)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /\(bb(10);/i, ( m ) => [ "BlackBerry", m[ 1 ] ] ],
    [ /crkey\/([\d.]+)/i, ( m ) => [ "Chromecast", m[ 1 ] ] ],
    [ /cros \w+(?:\)| ([\w.]+)\b)/i, ( m ) => [ "Chromium OS", m[ 1 ] ] ],
    [ /([kxl]?ubuntu|debian|fedora|opensuse|suse|gentoo|arch(?= linux)|centos|red ?hat|manjaro|raspbian)(?: gnu\/linux)?(?:[- ]linux)?[-/ ]?(?!chrom|package)([-\w.]*)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /(linux)(?: arm\w*| x86\w*| ?)([\w.]*)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
    [ /\b((?:free|open|net)bsd)[/ ]?([\w.]*)/i, ( m ) => [ m[ 1 ], m[ 2 ] ] ],
];

// Held in the hand: a phone or a tablet by what its user agent names, unless it names a television, a console, a watch
// or a headset, whose browsers say Android and Mobile too.
const NOT_IN_HAND = /smart-tv|\b(?:android tv|smart[- ]?tv|opera tv|tv; rv:)\b|aquos|bravia[\w ]+(?: bui|\))|netcast|hbbtv|\broku|apple ?tv|crkey|droid.+aft\w+(?: bui|\))|shield \w+ tv|mi(?:tv|box)-?\w+ bui|playstation \w+|xbox|nintendo [wids3utch]+|ouya|droid.+; shield(?: bui|\))|\bsm-[lr]\d\d[0156]|gear live|pebbleapp|(?:asus|google|lg|oppo) (?:pixel |zen)?watch|watch(?: ?os[,/]|\d,\d\/)|droid.+; glass \d|; quest|pico (?:4|neo3)|tesla|windows iot|homepod.+mac os/i;
const IN_HAND = /\(ip(?:hone|od|ad)|ip(?:hone|od)[\w, ]*[/;]|\bipad\d\d?,\d|droid .*?;|mobile(?:[;/]| [ \w/.]*safari)|phone|tablet|\btab[;/]|playbook|\(bb10;|iemobile|focus\/\d(?!.+mobile)/i;

/** The answers' parts for one navigator, as the eleven functions read them. */
export function agentInfo( source: AgentSource | undefined ): AgentInfo {
    let ua = source?.userAgent ?? "";
    if ( ua.length > 500 ) ua = ua.replace( /^\s\s*/, "" ).substring( 0, 500 );

    const first = ( rules: Rule[] ): Named => {
        for ( const [ pattern, take ] of rules ) {
            const m = pattern.exec( ua );
            if ( m ) return take( m );
        }
        return [ undefined, undefined ];
    };

    let [ browserName, browserVersion ] = first( BROWSERS );
    if ( source?.brave && typeof source.brave.isBrave === "function" ) browserName = "Brave";

    let [ osName, osVersion ] = first( SYSTEMS );
    const hints = source?.userAgentData;
    if ( ! osName && hints?.platform && hints.platform !== "Unknown" ) osName = hints.platform.replace( /chrome os/i, "Chromium OS" ).replace( /macos/i, "Mac OS" );

    const elsewhere = NOT_IN_HAND.test( ua );
    let handheld = ! elsewhere && IN_HAND.test( ua );
    // A phone whose user agent names no device says so in its hints.
    if ( ! handheld && ! elsewhere && hints?.mobile ) handheld = true;
    // An iPad asking for desktop sites says Mac: touch, and iOS Safari's own property, say otherwise.
    if ( /macintosh;/i.test( ua ) && ! /\(ip(?:hone|od|ad)/i.test( ua ) && typeof source?.standalone !== "undefined" && ( source.maxTouchPoints ?? 0 ) > 2 ) handheld = true;

    return {
        browser: { name: browserName || undefined, version: browserVersion || undefined },
        os: { name: osName || undefined, version: osVersion || undefined },
        handheld,
    };
}

let read: AgentInfo | undefined;

/** This browser's, read on the first question. */
function info(): AgentInfo {
    return read ??= agentInfo( typeof navigator !== "undefined" ? navigator as AgentSource : undefined );
}

/** -1, 0 or 1, number by number ("14.4.2" before "14.5", "17" as "17.0.0"). */
function compareVersions( a: string, b: string ): number {
    const x = a.split( "." ), y = b.split( "." );
    for ( let i = 0; i < Math.max( x.length, y.length ); i++ ) {
        const d = ( parseInt( x[ i ] ?? "0", 10 ) || 0 ) - ( parseInt( y[ i ] ?? "0", 10 ) || 0 );
        if ( d ) return d < 0 ? -1 : 1;
    }
    return 0;
}

// The browser and platform a call ran on, as short labels for the call
// record: "Chrome 152", "macOS 26". Never the user agent string itself.
export function browserLabel(){
    const { browser } = info();
    const name = browser.name ?? 'unknown';
    const major = ( browser.version ?? '' ).split( '.' )[0];

    return major ? name + ' ' + major : name;
}

export function platformLabel(){
    const { os } = info();
    const name = os.name ?? 'unknown';
    const major = ( os.version ?? '' ).split( '.' )[0];

    return major ? name + ' ' + major : name;
}

export function isMobile(){
    // The admin Design preview renders the messenger in a 375px iframe on a
    // desktop, where the UA says "desktop" and the mobile layout would never
    // appear. PHP sets this only for that iframe. On a server (an app's first render) there is no window, and no device.
    if( typeof window !== 'undefined' && ( window as any ).Better_Messages?.forceMobileView === '1' ){
        return true;
    }

    return info().handheld;
}


export function isNewSafari(){
    const { os, browser } = info();
    if( os.name === 'iOS' && os.version ){
        return compareVersions( os.version, '17' ) >= 0;
    }

    return !! browser.name && browser.name.toLowerCase().includes('safari');
}


export function isSafari(){
    if( isIOS() ){
        return true;
    }

    const { browser } = info();
    return !! browser.name && browser.name.toLowerCase().includes('safari');
}

export function isIOS(){
    return info().os.name === 'iOS';
}

export function isWindows(){
    const { os } = info();
    return !! os.name && os.name.toLowerCase() === 'windows';
}

export function isMac(){
    const { os } = info();
    return !! os.name && os.name.toLowerCase() === 'mac os';
}

export function isAndroid(){
    const { os } = info();
    return !! os.name && os.name.includes('Android');
}

export function isFirefox(){
    const { browser } = info();
    return !! browser.name && browser.name.toLowerCase() === 'firefox';
}

export function isOldIOS(){
    const { os, browser } = info();
    if( os.name === 'iOS' && os.version ){
        return compareVersions( os.version, '14.5' ) === -1;
    }
    if( os.name === 'Mac OS' && browser.name === 'Safari' && browser.version ){
        return compareVersions( browser.version, '14' ) === -1;
    }

    return false;
}
