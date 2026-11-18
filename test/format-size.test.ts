// @vitest-environment node
// formatSize() (src/inc/functions.ts) against filesize with its defaults, which wrote the sizes until 2026-10-31 and
// stays a dev dependency for this alone: the same text for 0 bytes to 5 TB at every edge, and well past them.
import { filesize } from 'filesize';
import { expect, it } from 'vitest';
import { formatSize } from '../src/inc/functions.ts';

const EDGES = [ 0, 1, 9, 10, 99, 100, 999, 1000, 1001, 1023, 1024, 1025, 1500, 1536, 1999, 2047, 2048, 4095, 4096, 9994, 9995, 9999,
    10_000, 10_240, 99_994, 99_995, 99_999, 100_000, 102_400, 999_000, 999_499, 999_500, 999_994, 999_995, 999_999, 1_000_000,
    1_000_001, 1_048_575, 1_048_576, 1_500_000, 1_572_864, 9_999_999, 10_485_760, 99_999_999, 104_857_600, 123_456_789,
    999_994_999, 999_995_000, 999_999_999, 1e9, 2 ** 30, 1_500_000_000, 2 ** 31, 2 ** 32, 999_995_000_000, 1e12, 2 ** 40,
    1.5e12, 5e12, 5 * 2 ** 40, 1e15, 2 ** 50, 1e18, 2 ** 60, 1e21, 1e24, 1e27, 1e30, Number.MAX_SAFE_INTEGER, Infinity,
    0.4, 0.5, 0.9, 1.005, 1.5, 2.675, 12.345, 1234.5, 1004.999, 1005, 1005.5, -1, -999, -1000, -1536, -1e6, -0, Number.MIN_VALUE ];

it( 'writes every size of the edges as filesize did', () => {
    const differ = EDGES.filter( ( bytes ) => formatSize( bytes ) !== filesize( bytes ) ).map( ( bytes ) => `${ bytes }: ${ formatSize( bytes ) }, was ${ filesize( bytes ) }` );
    expect( differ ).toEqual( [] );
} );

it( 'writes every size from 0 bytes to 5 TB as filesize did, at each power of 2 and of 10 and around them', () => {
    const sizes = new Set<number>();
    for ( let power = 0; power <= 42; power++ ) for ( const near of [ -3, -2, -1, 0, 1, 2, 3 ] ) sizes.add( Math.max( 0, 2 ** power + near ) );
    for ( let power = 0; power <= 12; power++ ) for ( const step of [ 1, 1.5, 2, 2.5, 5, 9.99, 9.994, 9.995, 9.999 ] ) for ( const near of [ -1, 0, 1 ] ) sizes.add( Math.max( 0, Math.round( step * 10 ** power ) + near ) );
    // And 20,000 draws spread over the range, small sizes the most, the same each run.
    let seed = 42;
    for ( let i = 0; i < 20_000; i++ ) {
        seed = ( seed * 1103515245 + 12345 ) % 2 ** 31;
        sizes.add( Math.floor( 5e12 * ( seed / 2 ** 31 ) ** 4 ) );
    }
    const differ = [ ...sizes ].filter( ( bytes ) => formatSize( bytes ) !== filesize( bytes ) );
    expect( sizes.size ).toBeGreaterThan( 15_000 );
    expect( differ ).toEqual( [] );
} );

it( 'refuses what is not a number, as filesize did', () => {
    expect( () => formatSize( NaN ) ).toThrow( 'Invalid number' );
    expect( () => filesize( NaN ) ).toThrow( 'Invalid number' );
} );
