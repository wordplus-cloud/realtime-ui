// A plugin's own screen for the calls it declares (a WordPress plugin may own the SDK's screens for the calls and
// rooms it declares): calls whose names match its pattern ring, start and join on its
// screen, as the SDK's own objects, never on ours; the rest are ours as before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallsController, namePattern, type OwnedCall } from '../src/sdk/controller.ts';
import type { SdkCalls, SdkIncoming } from '../src/sdk/types.ts';

function fakeCalls() {
    const handlers = new Map<string, Array<( ...a: any[] ) => void>>();
    const calls = {
        on: ( e: string, fn: ( ...a: any[] ) => void ) => void handlers.set( e, [ ...( handlers.get( e ) ?? [] ), fn ] ),
        off: () => {},
        start: vi.fn( async ( name: string ) => ( { name, id: 'c1', type: 'video', on: () => {}, off: () => {} } ) ),
        group: vi.fn( async ( name: string ) => ( { name, on: () => {}, off: () => {} } ) ),
        people: vi.fn( async () => [] ),
        fire: ( e: string, ...a: unknown[] ) => ( handlers.get( e ) ?? [] ).forEach( ( fn ) => fn( ...a ) ),
    };
    return calls as typeof calls & SdkCalls;
}

const ring = ( call: string ) => ( {
    id: 'r-' + call, call, from: 34, info: { name: 'Ann' }, type: 'video', group: null, state: 'ringing',
    on: () => {}, off: () => {}, accept: vi.fn(), decline: vi.fn( async () => {} ),
} ) as unknown as SdkIncoming & { decline: ReturnType<typeof vi.fn> };

describe( 'a call name pattern', () => {
    it( 'takes one part between colons for each named part, the rest as written', () => {
        const support = namePattern( 'support:{a}:{b}' );
        expect( support.test( 'support:34:42' ) ).toBe( true );
        expect( support.test( 'support:34' ) ).toBe( false );
        expect( support.test( 'support:34:42:x' ) ).toBe( false );
        expect( support.test( 'supportX34:42' ) ).toBe( false );
        expect( namePattern( 'order.{id}' ).test( 'orderX7' ) ).toBe( false );
        expect( namePattern( 'order.{id}' ).test( 'order.7' ) ).toBe( true );
    } );
} );

describe( 'a plugin\'s own screen', () => {
    it( 'gets the rings, the calls placed and the group calls joined that it declares, and ours the rest', async () => {
        const calls = fakeCalls();
        const controller = new CallsController( calls );
        const taken: OwnedCall[] = [];
        const release = controller.own( 'support:{a}:{b}', ( call ) => taken.push( call ) );

        calls.fire( 'incoming', ring( 'support:34:42' ) );
        expect( taken.map( ( t ) => t.kind ) ).toEqual( [ 'ring' ] );
        expect( controller.snapshot().rings ).toEqual( [] );

        calls.fire( 'incoming', ring( 'meeting:daily' ) );
        expect( controller.snapshot().rings.map( ( r ) => r.call ) ).toEqual( [ 'meeting:daily' ] );

        await controller.place( 'support:34:42', 34, 'video', { name: 'Ann' } );
        expect( calls.start ).toHaveBeenCalledWith( 'support:34:42', { to: 34, type: 'video' } );
        expect( taken.at( -1 ) ).toMatchObject( { kind: 'call', call: { name: 'support:34:42' } } );
        expect( controller.snapshot().showing ).toBeNull();

        controller.own( 'staff:{id}', ( call ) => taken.push( call ) );
        await controller.join( 'staff:daily', 'video', 'Staff' );
        expect( taken.at( -1 ) ).toMatchObject( { kind: 'group', group: { name: 'staff:daily' } } );

        // While ours shows a call, the plugin's still ring on its own screen rather than being answered busy.
        await controller.place( 'chat:1:2', 2, 'video', { name: 'Ben' } );
        expect( controller.snapshot().showing?.kind ).toBe( 'call' );
        const owned = ring( 'support:34:43' );
        calls.fire( 'incoming', owned );
        expect( owned.decline ).not.toHaveBeenCalled();
        expect( taken.at( -1 ) ).toMatchObject( { kind: 'ring', incoming: { call: 'support:34:43' } } );

        // Taken back: ours again, here answered busy as ours is in a call.
        release();
        const ours = ring( 'support:34:44' );
        calls.fire( 'incoming', ours );
        expect( ours.decline ).toHaveBeenCalledWith( 'busy' );
    } );
} );

describe( 'the elements\' own()', () => {
    afterEach( () => {
        delete ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls;
    } );

    it( 'keeps a claim made before the page has its calls, and applies it once it does', async () => {
        const elements = await import( '../src/elements.tsx' );
        const taken: string[] = [];
        elements.own( 'support:{a}:{b}', ( call ) => taken.push( call.kind ) );

        const calls = fakeCalls();
        ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt: {}, calls } ) };
        expect( elements.start() ).toBe( true );

        calls.fire( 'incoming', ring( 'support:34:42' ) );
        expect( taken ).toEqual( [ 'ring' ] );
    } );
} );
