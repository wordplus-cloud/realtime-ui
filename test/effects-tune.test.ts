import { describe, expect, it } from 'vitest';
import { tuned } from '../src/effects/camera.ts';

// What the person's own tuning of the camera's effect (the device settings' Adjust) makes of the engine's passes
// (src/effects/camera.ts): the middle of each slider is the effect as it ships.
describe( 'the camera effect\'s tuning', () => {
    it( 'is the effect as it ships with nothing moved, or every slider in its middle', () => {
        const shipped = { edge: [ 0.3, 0.7 ], keep: 0.3, blurs: 3 };
        expect( tuned() ).toEqual( shipped );
        expect( tuned( {} ) ).toEqual( shipped );
        const middle = tuned( { outline: 0.5, edge: 0.5, steady: 0.5, blur: 0.5 } );
        expect( middle.edge[ 0 ] ).toBeCloseTo( 0.3 );
        expect( middle.edge[ 1 ] ).toBeCloseTo( 0.7 );
        expect( middle.keep ).toBeCloseTo( 0.3 );
        expect( middle.blurs ).toBe( 3 );
    } );

    it( 'keeps more around the person the wider the outline, and less the tighter', () => {
        const wider = tuned( { outline: 1 } ).edge;
        const tighter = tuned( { outline: 0 } ).edge;
        expect( wider[ 0 ] ).toBeLessThan( 0.3 );
        expect( wider[ 1 ] ).toBeLessThan( 0.7 );
        expect( tighter[ 0 ] ).toBeGreaterThan( 0.3 );
        expect( tighter[ 1 ] ).toBeGreaterThan( 0.7 );
    } );

    it( 'softens the edge, steadies it and blurs more toward each slider\'s end, and less toward its start', () => {
        const width = ( edge: number[] ) => edge[ 1 ] - edge[ 0 ];
        expect( width( tuned( { edge: 1 } ).edge ) ).toBeGreaterThan( width( tuned( { edge: 0 } ).edge ) );
        expect( tuned( { steady: 0 } ).keep ).toBe( 0 );
        expect( tuned( { steady: 1 } ).keep ).toBeCloseTo( 0.6 );
        expect( tuned( { blur: 0 } ).blurs ).toBe( 1 );
        expect( tuned( { blur: 1 } ).blurs ).toBe( 5 );
    } );

    it( 'keeps the edge inside the mask\'s range and in order at every end, and reads what is not a number as the middle', () => {
        for ( const outline of [ 0, 0.25, 0.5, 0.75, 1 ] ) {
            for ( const edge of [ 0, 0.5, 1 ] ) {
                const [ low, high ] = tuned( { outline, edge } ).edge;
                expect( low ).toBeGreaterThan( 0 );
                expect( high ).toBeLessThan( 1 );
                expect( low ).toBeLessThan( high );
            }
        }
        expect( tuned( { outline: Number.NaN, blur: 7, steady: -3 } as never ) ).toEqual( { edge: [ 0.3, 0.7 ], keep: 0, blurs: 5 } );
    } );
} );
