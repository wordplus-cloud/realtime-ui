import { expect, it } from 'vitest';

// A page that loads the scripts with `data-prefix` on their tag, as @wordplus/realtime's callScreen() and
// streamScreen() load them for `screen.prefix`: both scripts read it as they run.
it( 'takes the prefix from its own script tag, for the call screen and the live streams alike', async () => {
    const script = document.createElement( 'script' );
    script.dataset.prefix = 'tv';
    Object.defineProperty( document, 'currentScript', { configurable: true, get: () => script } );

    await import( '../src/elements.tsx' );
    await import( '../src/stream-elements.tsx' );
    Object.defineProperty( document, 'currentScript', { configurable: true, get: () => null } );

    for ( const name of [ 'call-button', 'chat-room', 'call-screen', 'live-stream', 'stream-studio' ] ) {
        expect( customElements.get( 'tv-' + name ), 'tv-' + name ).toBeTruthy();
        expect( customElements.get( name ), name ).toBeUndefined();
    }
} );
