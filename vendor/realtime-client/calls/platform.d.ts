/**
 * What the engine needs to know about the browser: the short labels a call
 * record names it by ("Chrome 152", "macOS 26", never the user agent), and
 * which engine it is, since some codecs fail in one engine and not another.
 *
 * The defaults read the user agent themselves. A product that already parses
 * it (Better Messages, with ua-parser-js) hands its own answers to
 * `setCallPlatform()`, so its records read the same as before.
 */
export interface CallPlatform {
    browserLabel(): string;
    platformLabel(): string;
    isSafari(): boolean;
    isFirefox(): boolean;
}
export declare const defaultPlatform: CallPlatform;
export declare function setCallPlatform(answers: Partial<CallPlatform>): void;
export declare const browserLabel: () => string;
export declare const platformLabel: () => string;
export declare const isSafari: () => boolean;
export declare const isFirefox: () => boolean;
