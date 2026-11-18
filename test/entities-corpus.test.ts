// @vitest-environment node
// The kit's decoder of character references against html-entities, which plainName() used until 2026-10-31, without a
// document, as an app's server renders: numeric references and the names WordPress stores the same, and a rarer name
// left as written, never read as another character. In a browser every name is the browser's own, the same as
// html-entities' for each of the 2231 (gallery/entities.spec.ts, in Chromium).
import { expect, it } from 'vitest';
import { decodeEntities, plainName } from '../src/inc/names.ts';
import { NAMED, NAMES, RARER, STORED, decodeBefore, namedInText, numeric, plainNameBefore } from './corpus/entities.ts';

it( 'runs without a document', () => {
    expect( typeof document ).toBe( 'undefined' );
} );

it( 'decodes every numeric reference as html-entities did', () => {
    const corpus = numeric();
    expect( corpus.length ).toBeGreaterThan( 700 );
    expect( corpus.filter( ( text ) => decodeEntities( text ) !== decodeBefore( text ) ) ).toEqual( [] );
} );

it( 'reads every name as WordPress stores and shows it as html-entities did, in plainName() too', () => {
    expect( STORED.filter( ( name ) => decodeEntities( name ) !== decodeBefore( name ) ) ).toEqual( [] );
    expect( STORED.filter( ( name ) => plainName( name ) !== plainNameBefore( name ) ) ).toEqual( [] );
    expect( plainName( null ) ).toBe( plainNameBefore( null ) );
    expect( plainName( undefined ) ).toBe( '' );
} );

it( 'leaves the rarer names as written in a name, where a browser reads them as html-entities did', () => {
    for ( const name of RARER ) {
        // Reference by reference: "&iquest;Qu&eacute;?" is "¿Qu&eacute;?" here.
        for ( const [ reference ] of name.matchAll( /&(?:#\d+|#[xX][\da-fA-F]+|[0-9a-zA-Z]+);?/g ) ) {
            const now = decodeEntities( reference );
            expect( now === decodeBefore( reference ) || now === reference, reference ).toBe( true );
        }
    }
    expect( NAMES.length ).toBe( STORED.length + RARER.length );
} );

it( 'leaves a rarer named reference as written, and reads none as another character', () => {
    expect( NAMED.length ).toBe( 2231 );
    const wrong: string[] = [];
    let same = 0;
    for ( const text of namedInText() ) {
        const now = decodeEntities( text );
        if ( now === decodeBefore( text ) ) same++;
        else if ( now !== text ) wrong.push( `${ text } → ${ now }, was ${ decodeBefore( text ) }` );
    }
    expect( wrong ).toEqual( [] );
    // The common names, and every number, are most of what a name holds: some thousands of these read the same.
    expect( same ).toBeGreaterThan( 2000 );
} );

it( 'keeps text without a reference as it is, and an empty one empty', () => {
    for ( const text of [ 'Ann', 'Ben <3', '', 'a; b', '#1' ] ) expect( decodeEntities( text ) ).toBe( text );
    expect( decodeEntities( null ) ).toBe( '' );
    expect( decodeEntities( undefined ) ).toBe( '' );
} );
