import {describe, expect, it} from "vitest";
import {iconPathD, type IconName} from "../../src/primitives/icon.tsx";
import {BM_ICONS} from "../../src/components/streams/better-messages.tsx";

// The stream's stage in a Better Messages conversation draws a copy of the few call icons it needs, so a page with a
// stream carries no icon registry. The copy is the registry's, glyph for glyph, so a call's icon changing changes
// these too: this fails until it is copied.

const STREAM_ONLY = [ 'live', 'volume', 'volumeOff', 'stop', 'eye' ];

describe( 'the icons of the stream\'s Better Messages stage', () => {
    it( 'are the call\'s own, but for the stream\'s few', () => {
        const differ = Object.entries( BM_ICONS )
            .filter( ( [ name ] ) => ! STREAM_ONLY.includes( name ) )
            .filter( ( [ name, d ] ) => iconPathD( name as IconName ) !== d.split( '|' ).join( ' ' ) )
            .map( ( [ name ] ) => name );

        expect( differ ).toEqual( [] );
    } );
} );
