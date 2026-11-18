import { expect, test } from '@playwright/test';

// Every shot of the gallery, in each look: light and dark, left to right and right to left (Hebrew). A phone sees
// the light, left-to-right page only: its width is what it checks.
const SHOTS = [ 'ring', 'private-call', 'group-video', 'group-audio', 'presence', 'online', 'messages', 'photos', 'hover-actions', 'composer', 'empty' ];
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

// A photo's caption wraps to the photo: its bubble starts and ends where the photo does, a long caption's too, which
// stood out past the photo's 320px.
test( 'a caption is as wide as its photo', async ( { page } ) => {
    await page.goto( '/?theme=light&dir=ltr' );
    const bodies = page.locator( '[data-shot="photos"] .gallery-captioned' );
    await bodies.first().waitFor();
    for ( const body of await bodies.all() ) {
        const photo = ( await body.locator( '.wplus-image-grid' ).boundingBox() )!;
        const caption = ( await body.locator( '.wplus-msg-bubble' ).boundingBox() )!;
        expect( caption.x ).toBeCloseTo( photo.x, 0 );
        expect( caption.width ).toBeCloseTo( photo.width, 0 );
    }
} );
