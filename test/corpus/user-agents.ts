// The browsers the kit's eleven questions about the browser (src/inc/functions/browser-info.ts) are held to, against
// ua-parser-js and compare-versions, which answered them until 2026-10-31 and stay dev dependencies for this alone
// (test/browser-info-corpus.test.ts). Each is the navigator a page reads: its user agent, and where a browser says more
// than its user agent, the properties that say it.
import { createRequire } from 'node:module';
import { elevenOf } from './browser-info-before.ts';

// ua-parser-js takes the page's `window` once, as it loads, and reads its navigator at each `new UAParser()`: it loads
// here with a window of the corpus's own, whose navigator each browser of the corpus takes in turn.
const page: { navigator?: Agent } = {};
const require = createRequire( import.meta.url );
const holder = globalThis as { window?: unknown };
const had = 'window' in holder;
const before = holder.window;
holder.window = page;
delete require.cache[ require.resolve( 'ua-parser-js' ) ];
const UAParser = require( 'ua-parser-js' ) as typeof import( 'ua-parser-js' );
if ( had ) holder.window = before;
else delete holder.window;

export interface Agent {
    name: string;
    userAgent: string;
    userAgentData?: { mobile?: boolean; platform?: string };
    standalone?: boolean;
    maxTouchPoints?: number;
    brave?: { isBrave: () => Promise<boolean> };
}

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)';
const iphone = ( version: string ) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${ version } like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko)';
const brave = { isBrave: () => Promise.resolve( true ) };

export const AGENTS: Agent[] = [
    // Computers.
    { name: 'Chrome, macOS', userAgent: `${ MAC_CHROME } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'macOS' } },
    { name: 'Chrome, Windows', userAgent: `${ WIN } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'Windows' } },
    { name: 'Chrome, Windows 7', userAgent: 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36' },
    { name: 'Chrome, Linux', userAgent: `${ LINUX } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'Linux' } },
    { name: 'Chrome, ChromeOS', userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', userAgentData: { mobile: false, platform: 'Chrome OS' } },
    { name: 'Chrome, Linux i686', userAgent: 'Mozilla/5.0 (X11; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    { name: 'Chrome Headless', userAgent: `${ LINUX } HeadlessChrome/141.0.0.0 Safari/537.36` },
    { name: 'Brave, macOS', userAgent: `${ MAC_CHROME } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'macOS' }, brave },
    { name: 'Brave, Windows', userAgent: `${ WIN } Chrome/141.0.0.0 Safari/537.36`, brave },
    { name: 'Edge, Windows', userAgent: `${ WIN } Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71`, userAgentData: { mobile: false, platform: 'Windows' } },
    { name: 'Edge, macOS', userAgent: `${ MAC_CHROME } Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71` },
    { name: 'Edge before Chromium', userAgent: `${ WIN } Chrome/70.0.3538.102 Safari/537.36 Edge/18.19582` },
    { name: 'Internet Explorer 11', userAgent: 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko' },
    { name: 'Internet Explorer 10', userAgent: 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; Trident/6.0)' },
    { name: 'Firefox, macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { name: 'Firefox, Windows', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { name: 'Firefox, Windows 8.1', userAgent: 'Mozilla/5.0 (Windows NT 6.3; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0' },
    { name: 'Firefox, Linux', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { name: 'Firefox, Ubuntu', userAgent: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { name: 'Firefox, Fedora', userAgent: 'Mozilla/5.0 (X11; Fedora; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0' },
    { name: 'Firefox ESR, Windows 7', userAgent: 'Mozilla/5.0 (Windows NT 6.1; rv:115.0) Gecko/20100101 Firefox/115.0' },
    { name: 'Safari 26, macOS', userAgent: `${ MAC } Version/26.0 Safari/605.1.15` },
    { name: 'Safari 18, macOS', userAgent: `${ MAC } Version/18.6 Safari/605.1.15` },
    { name: 'Safari 17, macOS', userAgent: `${ MAC } Version/17.4.1 Safari/605.1.15` },
    { name: 'Safari 14, macOS', userAgent: `${ MAC } Version/14.0 Safari/605.1.15` },
    { name: 'Safari 13.1, macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1 Safari/605.1.15' },
    { name: 'Safari 12, macOS', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Safari/605.1.15' },
    { name: 'Safari 17, a Mac with a touch screen that is no iPad', userAgent: `${ MAC } Version/17.4.1 Safari/605.1.15`, maxTouchPoints: 10 },
    { name: 'Opera, Windows', userAgent: `${ WIN } Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0` },
    { name: 'Opera, macOS', userAgent: `${ MAC_CHROME } Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0` },
    { name: 'Opera before Chromium', userAgent: 'Opera/9.80 (Windows NT 6.1; WOW64) Presto/2.12.388 Version/12.18' },
    { name: 'Vivaldi', userAgent: `${ WIN } Chrome/124.0.0.0 Safari/537.36 Vivaldi/6.7.3329.31` },
    { name: 'Yandex', userAgent: `${ WIN } Chrome/124.0.0.0 YaBrowser/24.4.0.0 Safari/537.36` },
    { name: 'Avast Secure Browser', userAgent: `${ WIN } Chrome/120.0.0.0 Safari/537.36 Avast/120.0.23745.268` },
    { name: 'Electron app', userAgent: `${ MAC_CHROME } BetterMessages/1.0.0 Chrome/120.0.6099.291 Electron/28.3.3 Safari/537.36` },
    { name: 'Waterfox', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0 Waterfox/6.5.0' },
    { name: 'Coc Coc', userAgent: `${ WIN } coc_coc_browser/130.0.264 Chrome/124.0.6367.264 Safari/537.36` },
    { name: 'no system named, the hints name it', userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', userAgentData: { mobile: false, platform: 'Windows' } },
    { name: 'no system named, the hints say Unknown', userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', userAgentData: { mobile: false, platform: 'Unknown' } },
    { name: 'no device named, the hints say a phone', userAgent: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', userAgentData: { mobile: true, platform: 'Android' } },

    // iPhones and iPads.
    { name: 'iOS 12 Safari', userAgent: `${ iphone( '12_5_7' ) } Version/12.1.2 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 14.4 Safari', userAgent: `${ iphone( '14_4' ) } Version/14.0.3 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 14.5 Safari', userAgent: `${ iphone( '14_5' ) } Version/14.1 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 16 Safari', userAgent: `${ iphone( '16_6' ) } Version/16.6 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 16 home screen app', userAgent: `${ iphone( '16_7_10' ) } Mobile/15E148`, standalone: true, maxTouchPoints: 5 },
    { name: 'iOS 17 Safari', userAgent: `${ iphone( '17_4_1' ) } Version/17.4.1 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 17.0 Safari', userAgent: `${ iphone( '17_0' ) } Version/17.0 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 18 Safari', userAgent: `${ iphone( '18_6' ) } Version/18.6 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iOS 26 Safari, its version kept at 18.6', userAgent: `${ iphone( '18_6' ) } Version/26.0 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iPad, iOS 16', userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', standalone: false, maxTouchPoints: 5 },
    { name: 'iPad asking for desktop sites (iPadOS 17)', userAgent: `${ MAC } Version/17.4 Safari/605.1.15`, standalone: false, maxTouchPoints: 5 },
    { name: 'iPad asking for desktop sites, Chrome', userAgent: `${ MAC } CriOS/124.0.6367.88 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'iPad mini 4 asking for desktop sites (iPadOS 15)', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15', standalone: false, maxTouchPoints: 5 },
    { name: 'Chrome, iOS', userAgent: `${ iphone( '17_4' ) } CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'Firefox, iOS', userAgent: `${ iphone( '17_4' ) } FxiOS/125.0 Mobile/15E148 Safari/605.1.15`, standalone: false, maxTouchPoints: 5 },
    { name: 'Edge, iOS', userAgent: `${ iphone( '17_4' ) } Version/17.0 EdgiOS/124.2478.71 Mobile/15E148 Safari/605.1.15`, standalone: false, maxTouchPoints: 5 },
    { name: 'Opera, iOS', userAgent: `${ iphone( '16_6' ) } OPT/4.5.2 Mobile/15E148`, standalone: false, maxTouchPoints: 5 },
    { name: 'Google app, iOS', userAgent: `${ iphone( '17_4' ) } GSA/315.0.630091404 Mobile/15E148 Safari/604.1`, standalone: false, maxTouchPoints: 5 },
    { name: 'DuckDuckGo, iOS', userAgent: `${ iphone( '17_4' ) } Version/17.4 Mobile/15E148 DuckDuckGo/7 Safari/605.1.15`, standalone: false, maxTouchPoints: 5 },
    { name: 'Facebook, iOS', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.36.106;FBBV/602187654;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/17.4;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/0]`, maxTouchPoints: 5 },
    { name: 'Instagram, iOS', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 Instagram 330.0.3.31.86 (iPhone15,2; iOS 17_4; en_US; en; scale=3.00; 1179x2556; 595316346)`, maxTouchPoints: 5 },
    { name: 'Instagram, iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.3.31.86 (iPad13,4; iPadOS 17_4; en_US; en; scale=2.00; 1640x2360; 595316346)', maxTouchPoints: 5 },
    { name: 'TikTok, iOS', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 musical_ly_34.1.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US`, maxTouchPoints: 5 },
    { name: 'LINE, iOS', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 Safari Line/14.5.0`, maxTouchPoints: 5 },
    { name: 'Snapchat, iOS', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 Snapchat/13.10.0.40 (like Safari/8617.2.4.10.8, panda)`, maxTouchPoints: 5 },
    { name: 'Better Messages app, iOS (its view)', userAgent: `${ iphone( '17_4' ) } Mobile/15E148 better-messages-app`, maxTouchPoints: 5 },
    { name: 'an app view, iOS, with Safari in its name', userAgent: `${ iphone( '15_8' ) } Mobile/15E148 Safari/604.1`, maxTouchPoints: 5 },

    // Android.
    { name: 'Chrome, Android phone', userAgent: `${ ANDROID } Chrome/141.0.0.0 Mobile Safari/537.36`, userAgentData: { mobile: true, platform: 'Android' } },
    { name: 'Chrome, Android tablet', userAgent: `${ ANDROID } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'Android' } },
    { name: 'Chrome, Pixel 7 (Android 13, as Chrome 109 wrote it)', userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36' },
    { name: 'Chrome, Android asking for desktop sites', userAgent: `${ LINUX } Chrome/141.0.0.0 Safari/537.36`, userAgentData: { mobile: false, platform: 'Linux' } },
    { name: 'Brave, Android', userAgent: `${ ANDROID } Chrome/141.0.0.0 Mobile Safari/537.36`, userAgentData: { mobile: true, platform: 'Android' }, brave },
    { name: 'Samsung Internet', userAgent: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36' },
    { name: 'Samsung Internet, Galaxy Tab', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36' },
    { name: 'Firefox, Android phone', userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0' },
    { name: 'Firefox, Android tablet', userAgent: 'Mozilla/5.0 (Android 14; Tablet; rv:144.0) Gecko/144.0 Firefox/144.0' },
    { name: 'Firefox Focus, Android', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Focus/124.1 Chrome/124.0.6367.123 Mobile Safari/537.36' },
    { name: 'Edge, Android', userAgent: `${ ANDROID } Chrome/124.0.0.0 Mobile Safari/537.36 EdgA/124.0.2478.64` },
    { name: 'Opera, Android', userAgent: `${ ANDROID } Chrome/119.0.0.0 Mobile Safari/537.36 OPR/79.0.4195.76524` },
    { name: 'Opera Mini, Android', userAgent: 'Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16' },
    { name: 'Yandex, Android', userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 YaBrowser/24.1.4.89.00 SA/3 Mobile Safari/537.36' },
    { name: 'UC Browser, Android', userAgent: 'Mozilla/5.0 (Linux; U; Android 10; en-US; RMX1911 Build/QKQ1.200209.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/78.0.3904.108 UCBrowser/13.4.0.1306 Mobile Safari/537.36' },
    { name: 'Xiaomi browser', userAgent: 'Mozilla/5.0 (Linux; U; Android 13; en-us; 2201117TG Build/TKQ1.221114.001) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.5615.136 Mobile Safari/537.36 XiaoMi/MiuiBrowser/14.5.6-gn' },
    { name: 'Huawei browser, HarmonyOS', userAgent: 'Mozilla/5.0 (Linux; Android 12; HarmonyOS; ANA-AN00; HMSCore 6.13.0.302) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.196 HuaweiBrowser/14.0.6.300 Mobile Safari/537.36' },
    { name: 'Android browser, Android 4', userAgent: 'Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30' },
    { name: 'Better Messages app, Android (its view)', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 better-messages-app' },
    { name: 'Facebook, Android', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/462.0.0.48.106;]' },
    { name: 'Instagram, Android', userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.82 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm1q; qcom; en_US; 597409867)' },
    { name: 'an app view, Android, no model', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Safari/537.36' },
    { name: 'Kindle Fire, Silk', userAgent: 'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/124.3.6 like Chrome/124.0.6367.219 Safari/537.36' },
    { name: 'Kindle Fire asking for desktop sites', userAgent: `${ LINUX } Silk/124.3.6 like Chrome/124.0.6367.219 Safari/537.36` },
    { name: 'Fire TV', userAgent: 'Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.120 Mobile Safari/537.36' },
    { name: 'Android TV, Sony', userAgent: 'Mozilla/5.0 (Linux; Android 10; BRAVIA 4K UR2 Build/PTT1.190515.001.S104) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.128 Safari/537.36' },
    { name: 'Samsung TV', userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36' },
    { name: 'Meta Quest', userAgent: 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.2.0.4 SamsungBrowser/4.0 Chrome/126.0.6478.122 VR Safari/537.36' },
    { name: 'Galaxy Watch', userAgent: 'Mozilla/5.0 (Linux; Tizen 5.5; SAMSUNG SM-R820) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/1.0 Chrome/69.0.3497.106 Mobile Safari/537.36' },
    { name: 'KaiOS phone', userAgent: 'Mozilla/5.0 (Mobile; LYF/F300B/LYF-F300B-001-01-15-130718-i;Android; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/2.5' },

    // Playwright's, as Better Messages' end to end projects run (dev-mobile and websocket-mobile on the Pixel 7,
    // dev-firefox and dev-webkit on the desktop ones), its WebKit and Chromium on a Mac with a touch screen faked.
    { name: 'Playwright, Pixel 7', userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Mobile Safari/537.36', userAgentData: { mobile: true, platform: 'Android' } },
    { name: 'Playwright, Galaxy S9+', userAgent: 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G965U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Mobile Safari/537.36' },
    { name: 'Playwright, iPhone 15', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
    { name: 'Playwright, iPhone 12', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
    { name: 'Playwright, iPad Pro 11', userAgent: 'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1', maxTouchPoints: 5 },
    { name: 'Playwright, Desktop Firefox', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0' },
    { name: 'Playwright, Desktop Safari', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15' },
    { name: 'Playwright, Desktop Safari, touch faked', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15', maxTouchPoints: 5 },
    { name: 'Playwright, Desktop Chrome', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.4 Safari/537.36', userAgentData: { mobile: false, platform: 'Windows' } },

    // Neither.
    { name: 'a crawler', userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
    { name: 'an empty user agent', userAgent: '' },
];

/** The eleven answers as browser-info.ts gave them on ua-parser-js and compare-versions, for one navigator. */
export function answersBefore( agent: Agent ): Record<string, string | boolean> {
    page.navigator = agent;
    const parser = new UAParser();
    return elevenOf( { device: parser.getDevice(), os: parser.getOS(), browser: parser.getBrowser() } );
}
