import { expect, it } from 'vitest';
import { pageWithCalls } from './page-calls.ts';

it( 'starts by itself on a page with its calls, once, and takes the settings a later start() gives', async () => {
    pageWithCalls();
    document.documentElement.lang = 'de';
    const elements = await import( '../src/elements.tsx' );

    expect( customElements.get( 'call-button' ) ).toBeTruthy();
    expect( customElements.get( 'room-button' ) ).toBeTruthy();
    const holders = document.querySelectorAll( 'call-screen' );
    expect( holders ).toHaveLength( 1 );
    const mount = holders[ 0 ].shadowRoot!.querySelector( '.realtime-calls' ) as HTMLElement;
    expect( mount.dir ).toBe( 'ltr' );

    // rt.callScreen() starting it again: the same screens, in the language asked for.
    expect( elements.start( { lang: 'he' } ) ).toBe( true );
    expect( document.querySelectorAll( 'call-screen' ) ).toHaveLength( 1 );
    expect( mount.dir ).toBe( 'rtl' );
} );
