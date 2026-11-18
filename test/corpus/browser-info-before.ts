// The eleven answers of src/inc/functions/browser-info.ts as it gave them until 2026-10-31, from what ua-parser-js
// parsed and with compare-versions, line for line: the reference test/browser-info-corpus.test.ts and
// gallery/browser-info.spec.ts hold the kit's own detector to.
import { compareVersions } from 'compare-versions';

interface Parsed {
    device: { type?: string };
    os: { name?: string; version?: string };
    browser: { name?: string; version?: string };
}

export const QUESTIONS = [ 'browserLabel', 'platformLabel', 'isMobile', 'isNewSafari', 'isSafari', 'isIOS', 'isWindows', 'isMac', 'isAndroid', 'isFirefox', 'isOldIOS' ] as const;

export function elevenOf( { device, os, browser }: Parsed ): Record<string, string | boolean> {
    const isIOS = os.name === 'iOS';
    const safariNamed = !! browser.name && browser.name.toLowerCase().includes( 'safari' );
    const name = browser.name ?? 'unknown';
    const major = ( browser.version ?? '' ).split( '.' )[ 0 ];
    const osName = os.name ?? 'unknown';
    const osMajor = ( os.version ?? '' ).split( '.' )[ 0 ];
    let isOldIOS = false;
    if ( os.name === 'iOS' && os.version ) {
        if ( compareVersions( os.version, '14.5' ) === -1 ) isOldIOS = true;
    } else if ( os.name === 'Mac OS' ) {
        if ( browser.name === 'Safari' && browser.version && compareVersions( browser.version, '14' ) === -1 ) isOldIOS = true;
    }

    return {
        browserLabel: major ? name + ' ' + major : name,
        platformLabel: osMajor ? osName + ' ' + osMajor : osName,
        isMobile: device.type === 'mobile' || device.type === 'tablet',
        isNewSafari: os.name === 'iOS' && os.version ? compareVersions( os.version, '17' ) >= 0 : safariNamed,
        isSafari: isIOS || safariNamed,
        isIOS,
        isWindows: !! os.name && os.name.toLowerCase() === 'windows',
        isMac: !! os.name && os.name.toLowerCase() === 'mac os',
        isAndroid: !! os.name && os.name.includes( 'Android' ),
        isFirefox: !! browser.name && browser.name.toLowerCase() === 'firefox',
        isOldIOS,
    };
}
