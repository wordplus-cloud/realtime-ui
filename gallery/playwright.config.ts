// The picture checks: gallery.spec.ts photographs every shot of the gallery in each theme and direction, at a
// computer's width and a phone's, and compares each with its picture in gallery/pictures. `npm run gallery` checks,
// `npm run gallery:update` takes the pictures again after a change meant to be seen.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig( {
    testDir: '.',
    testMatch: 'gallery.spec.ts',
    snapshotPathTemplate: '{testDir}/pictures/{projectName}/{arg}{ext}',
    fullyParallel: true,
    reporter: [ [ 'line' ] ],
    use: {
        baseURL: 'http://127.0.0.1:4870/',
        // Pictures taken where the page's fonts are the system's: one machine's.
        ...devices[ 'Desktop Chrome' ],
    },
    expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' },
    },
    projects: [
        { name: 'computer', use: { viewport: { width: 1100, height: 900 } } },
        { name: 'phone', use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    ],
    webServer: {
        command: 'node serve.mjs',
        cwd: '.',
        url: 'http://127.0.0.1:4870/',
        reuseExistingServer: true,
    },
} );
