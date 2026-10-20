import { expect, it } from 'vitest';
import { pageWithCalls } from './page-calls.ts';

it( 'draws the call screen in the page\'s own <call-screen>, where the page keeps its templates', async () => {
    pageWithCalls();
    document.body.innerHTML = '<main></main><call-screen id="mine"><template slot="control" data-control="raise" data-label="Raise hand" data-icon="raisehand"></template></call-screen>';
    await import( '../src/elements.tsx' );

    const holders = document.querySelectorAll( 'call-screen' );
    expect( holders ).toHaveLength( 1 );
    expect( holders[ 0 ].id ).toBe( 'mine' );
    expect( holders[ 0 ].shadowRoot?.querySelector( '.realtime-calls' ) ).not.toBeNull();
    expect( holders[ 0 ].querySelector( 'template[slot="control"]' ) ).not.toBeNull();
} );
