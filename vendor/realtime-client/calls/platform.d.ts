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
export interface CallPlatform {
    browserLabel(): string;
    platformLabel(): string;
    isSafari(): boolean;
    isFirefox(): boolean;
    appLabel(): string;
}
export declare const defaultPlatform: CallPlatform;
export declare function setCallPlatform(answers: Partial<CallPlatform>): void;
export declare const browserLabel: () => string;
export declare const platformLabel: () => string;
export declare const isSafari: () => boolean;
export declare const isFirefox: () => boolean;
export declare const appLabel: () => string;
/** The kind of device: an iPad's Safari says it is a Mac, and only touch tells. */
export declare function deviceKind(): 'phone' | 'tablet' | 'desktop' | undefined;
/** The network's type ("wifi", "cellular"), Chromium on Android's alone. */
export declare function networkType(): string | undefined;
/** Chromium's estimate of the network from the page's own downloads: class, Mbit/s down (10 at most), round trip ms. */
export declare function networkEstimate(): string | undefined;
