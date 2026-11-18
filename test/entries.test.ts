import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// What the build leaves for an app to import, read from dist/ (`npm test` builds first).

const dist = ( file: string ) => readFileSync( new URL( '../dist/' + file, import.meta.url ), 'utf8' );

describe( 'the entries an app imports', () => {
    it( 'have the React components as a client module, which a server layout of Next.js renders with no file between', () => {
        expect( dist( 'react.js' ).startsWith( "'use client';\n" ) ).toBe( true );
    } );

    it( 'have one stylesheet with the call screen, the list of who is online and the chat, their tokens once', () => {
        const all = dist( 'styles.css' );
        const rule = ( css: string ) => css.slice( css.lastIndexOf( '}', css.length - 2 ) - 200 );

        for ( const file of [ 'calls.css', 'presence.css', 'chat.css' ] ) expect( all ).toContain( rule( dist( file ) ) );
        expect( all.length ).toBeLessThan( dist( 'calls.css' ).length + dist( 'presence.css' ).length + dist( 'chat.css' ).length );
    } );

    it( 'name it in the package', () => {
        const pkg = JSON.parse( readFileSync( process.cwd() + '/package.json', 'utf8' ) );

        expect( pkg.exports[ './styles.css' ] ).toBe( './dist/styles.css' );
    } );
} );
