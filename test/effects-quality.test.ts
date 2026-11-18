import { afterEach, describe, expect, it } from 'vitest';
import { OLD_KEYS, SETTLE_MS, SLOW_MS, SLOW_SECONDS, Slowness, forgetOldRule, middle } from '../src/effects/quality.ts';
import { letterbox, MODEL, MODELS } from '../src/effects/segmenter.ts';
import { SOFTWARE_RENDERER } from '../src/effects/camera.ts';

// The effects' one model on every device (src/effects/quality.ts, segmenter.ts), since 2026-11-02: PP-HumanSegV2,
// never MediaPipe's landscape model by itself, and the page told once where it slows the device. The timing itself is
// a browser's: the effects harness and Better Messages' browser suite run it.
describe( 'the effects\' one model', () => {
    afterEach( () => window.localStorage.clear() );

    it( 'is PP-HumanSegV2 alone, the landscape model gone from the engine', () => {
        expect( Object.keys( MODELS ) ).toEqual( [ 'humanseg' ] );
        expect( MODEL.file ).toBe( 'models/person-segmentation.tflite' );
        expect( [ MODEL.width, MODEL.height ] ).toEqual( [ 256, 144 ] );
    } );

    it( 'believes nothing the rule before kept, and clears it', () => {
        window.localStorage.setItem( 'wordplus-call-effects-quality', 'dropped' );
        window.localStorage.setItem( 'wordplus-call-effects-trial', JSON.stringify( { v: 5, fails: 3, why: 'dropped: 41.0 ms' } ) );
        window.localStorage.setItem( 'wordplus-call-effects', '{"camera":"blur"}' );
        forgetOldRule();
        for ( const key of OLD_KEYS ) expect( window.localStorage.getItem( key ), key ).toBeNull();
        expect( window.localStorage.getItem( 'wordplus-call-effects' ), 'the person\'s choice is theirs' ).toBe( '{"camera":"blur"}' );
    } );

    it( 'takes WebGL drawn on the CPU for a device the effects are not for', () => {
        for ( const renderer of [ 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver', 'Google SwiftShader' ] ) {
            expect( SOFTWARE_RENDERER.test( renderer ), renderer ).toBe( true );
        }
        for ( const renderer of [ 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)', 'Apple GPU', 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Mali-G78' ] ) {
            expect( SOFTWARE_RENDERER.test( renderer ), renderer ).toBe( false );
        }
    } );
} );

describe( 'a frame not of the model\'s shape', () => {
    it( 'goes to the model letterboxed at its true shape: a phone held upright, 4:3 either way, an ultra-wide', () => {
        // 16:9, and near it, as it is.
        expect( letterbox( 1280, 720 ) ).toBeNull();
        expect( letterbox( 1920, 1080 ) ).toBeNull();
        expect( letterbox( 1280, 736 ) ).toBeNull();
        // Upright 9:16: 81 of the model's 256 columns, in the middle, the whole height.
        expect( letterbox( 720, 1280 ) ).toEqual( { width: 81, height: 144, x: 87, y: 0 } );
        expect( letterbox( 640, 480 ) ).toEqual( { width: 192, height: 144, x: 32, y: 0 } );
        expect( letterbox( 480, 640 ) ).toEqual( { width: 108, height: 144, x: 74, y: 0 } );
        // Wider than 16:9: bars above and below.
        expect( letterbox( 2560, 1080 ) ).toEqual( { width: 256, height: 108, x: 0, y: 18 } );
        expect( letterbox( 0, 0 ) ).toBeNull();
    } );
} );

describe( 'the background slowing the device', () => {
    // A frame timed every `every` ms for `seconds`, each taking `took` ms, from `from`: whether it said so, and when.
    const run = ( slowness: Slowness, from: number, seconds: number, took: ( at: number ) => number, hidden = () => false, every = 165 ) => {
        let said = -1;
        for ( let at = from; at < from + seconds * 1000; at += every ) {
            if ( slowness.feed( took( at ), at, hidden() ) && said < 0 ) said = at;
        }
        return said;
    };

    it( 'says so once, after SLOW_SECONDS in a row whose middle is over SLOW_MS, and never again', () => {
        expect( [ SLOW_MS, SLOW_SECONDS ] ).toEqual( [ 50, 5 ] );
        const slowness = new Slowness( 0 );
        const said = run( slowness, SETTLE_MS, 12, () => 70 );
        // A second ends with the first timed frame past it: at a frame in five of 30 a second, some 1.3 s.
        expect( said ).toBeGreaterThan( SETTLE_MS + SLOW_SECONDS * 1000 );
        expect( said ).toBeLessThan( SETTLE_MS + SLOW_SECONDS * 1400 );
        expect( slowness.last ).toBe( 70 );
        expect( run( slowness, 20000, 10, () => 90 ), 'once for the processor' ).toBe( -1 );
    } );

    it( 'says nothing of a device in time, of a slow second here and there, or of the first second, the GPU programs compiling', () => {
        expect( run( new Slowness( 0 ), 0, 30, () => 20 ) ).toBe( -1 );
        // One slow second in four.
        expect( run( new Slowness( 0 ), 0, 30, ( at ) => Math.floor( at / 1000 ) % 4 === 0 ? 90 : 20 ) ).toBe( -1 );
        // Four slow seconds, then one in time, then four again.
        expect( run( new Slowness( 0 ), SETTLE_MS, 9, ( at ) => at >= 5000 && at < 6000 ? 20 : 80 ) ).toBe( -1 );
        // The compile's 6.5 s first frame, and nothing slow after it.
        const slowness = new Slowness( 0 );
        expect( slowness.feed( 6500, 0 ) ).toBe( false );
        expect( run( slowness, 6600, 10, () => 15 ) ).toBe( -1 );
        // One slow frame in a second does not move its middle.
        expect( middle( [ 20, 21, 19, 22, 90, 20 ] ) ).toBe( 21 );
        expect( middle( [] ) ).toBe( Infinity );
    } );

    it( 'counts no second the tab is hidden, when a browser may slow its work, and starts again', () => {
        const slowness = new Slowness( 0 );
        expect( run( slowness, SETTLE_MS, 10, () => 120, () => true ), 'hidden the whole time' ).toBe( -1 );
        // Slow seconds visible, a moment hidden, slow seconds again: never SLOW_SECONDS of them in a row.
        expect( run( slowness, 12000, 4, () => 120 ) ).toBe( -1 );
        expect( run( slowness, 16000, 1, () => 120, () => true ) ).toBe( -1 );
        expect( run( slowness, 17000, 4, () => 120 ) ).toBe( -1 );
        expect( run( slowness, 21000, 1, () => 120, () => true ) ).toBe( -1 );
        // Visible long enough, at last.
        expect( run( slowness, 22000, 9, () => 120 ) ).toBeGreaterThan( 22000 + SLOW_SECONDS * 1000 );
    } );
} );
