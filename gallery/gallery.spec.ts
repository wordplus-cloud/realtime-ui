import { expect, test } from '@playwright/test';

// Every shot of the gallery, in each look: light and dark, left to right and right to left (Hebrew). A phone sees
// the light, left-to-right page only: its width is what it checks.
const SHOTS = [ 'ring', 'private-call', 'group-video', 'group-audio', 'presence', 'online', 'messages', 'hover-actions', 'composer', 'empty' ];
const LOOKS = [
    { name: 'light', query: 'theme=light&dir=ltr' },
    { name: 'dark', query: 'theme=dark&dir=ltr' },
    { name: 'rtl', query: 'theme=light&dir=rtl' },
];

for ( const look of LOOKS ) {
    test( `the gallery, ${ look.name }`, async ( { page }, info ) => {
        test.skip( info.project.name === 'phone' && look.name !== 'light', 'a phone checks its width, in the light look' );
        await page.goto( '/?' + look.query );
        await page.locator( '[data-shot="empty"]' ).waitFor();
        // Every picture loaded before the first photo.
        await page.waitForFunction( () => [ ...document.images ].every( ( img ) => img.complete ) );

        for ( const shot of SHOTS ) {
            const section = page.locator( `[data-shot="${ shot }"] .gallery-frame` );
            await section.scrollIntoViewIfNeeded();
            // The hover strip shows under the pointer, as on a page.
            if ( shot === 'hover-actions' ) await page.locator( '.gallery-hovered' ).hover();
            else await page.mouse.move( 0, 0 );
            await expect( section, `${ shot } (${ look.name })` ).toHaveScreenshot( `${ look.name }-${ shot }.png` );
        }
    } );
}
