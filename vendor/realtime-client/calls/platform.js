/**
 * What the engine needs to know about the browser: the short labels a call
 * record names it by ("Chrome 152", "macOS 26", never the user agent), and
 * which engine it is, since some codecs fail in one engine and not another.
 *
 * The defaults read the user agent themselves. A product that already parses
 * it (Better Messages, with ua-parser-js) hands its own answers to
 * `setCallPlatform()`, so its records read the same as before.
 *
 * `appLabel` is the product and its version ("better-messages 3.2.0"), which only
 * the product knows, as a group call's client names it with `meshApp`.
 */
function agent() {
    return typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
}
function major(version) {
    return (version ?? '').split('.')[0];
}
function labelled(name, version) {
    const number = major(version);
    return number ? name + ' ' + number : name;
}
const BROWSERS = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari\//],
];
function isIOS(ua) {
    return /iPhone|iPad|iPod/.test(ua);
}
export const defaultPlatform = {
    browserLabel() {
        const ua = agent();
        for (const [name, pattern] of BROWSERS) {
            const found = ua.match(pattern);
            if (found)
                return labelled(name === 'Safari' && isIOS(ua) ? 'Mobile Safari' : name, found[1]);
        }
        return 'unknown';
    },
    platformLabel() {
        const ua = agent();
        let found;
        if ((found = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)/)))
            return labelled('iOS', found[1]);
        if ((found = ua.match(/Android (\d+)/)))
            return labelled('Android', found[1]);
        if ((found = ua.match(/Windows NT ([\d.]+)/)))
            return 'Windows' + (found[1] === '10.0' ? ' 10' : '');
        if ((found = ua.match(/Mac OS X (\d+)/)))
            return labelled('macOS', found[1]);
        if (/CrOS/.test(ua))
            return 'Chrome OS';
        if (/Linux/.test(ua))
            return 'Linux';
        return 'unknown';
    },
    // Every browser on iOS is WebKit underneath.
    isSafari() {
        const ua = agent();
        return isIOS(ua) || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|FxiOS\/|Edg|OPR\/|Android/.test(ua));
    },
    isFirefox() {
        return /Firefox\/|FxiOS\//.test(agent());
    },
    appLabel() {
        return '';
    },
};
let platform = defaultPlatform;
export function setCallPlatform(answers) {
    platform = { ...defaultPlatform, ...answers };
}
export const browserLabel = () => platform.browserLabel();
export const platformLabel = () => platform.platformLabel();
export const isSafari = () => platform.isSafari();
export const isFirefox = () => platform.isFirefox();
export const appLabel = () => platform.appLabel();
// What else a group call's client tells its node of the device and the network
// on a join (rtc-client's room/utils.ts), for a direct call's report: nothing
// where the browser won't say.
/** The kind of device: an iPad's Safari says it is a Mac, and only touch tells. */
export function deviceKind() {
    const ua = agent();
    if (!ua)
        return undefined;
    const nav = navigator;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1))
        return 'tablet';
    if (/iPhone|iPod|Mobi/.test(ua) || nav.userAgentData?.mobile)
        return 'phone';
    if (/Android/.test(ua))
        return 'tablet';
    return 'desktop';
}
/** The network's type ("wifi", "cellular"), Chromium on Android's alone. */
export function networkType() {
    const type = typeof navigator !== 'undefined' ? navigator.connection?.type : undefined;
    return type ? String(type).replace(/[^a-z0-9-]/gi, '').slice(0, 16) || undefined : undefined;
}
/** Chromium's estimate of the network from the page's own downloads: class, Mbit/s down (10 at most), round trip ms. */
export function networkEstimate() {
    const c = typeof navigator !== 'undefined' ? navigator.connection : undefined;
    if (!c?.effectiveType)
        return undefined;
    const figure = (v) => typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
    return [String(c.effectiveType).replace(/[^a-z0-9-]/gi, '').slice(0, 10), figure(c.downlink), figure(c.rtt)].join(',');
}
