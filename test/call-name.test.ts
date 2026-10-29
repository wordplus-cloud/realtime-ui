import { describe, expect, it } from 'vitest';
import { callName } from '../src/sdk/call-name.ts';

describe( 'callName', () => {
    it( 'puts the smaller of two numbers first, as an app server sorts them', () => {
        expect( callName( 'chat:{pair}', '10', '9' ) ).toBe( 'chat:9:10' );
        expect( callName( 'chat:{pair}', '9', '10' ) ).toBe( 'chat:9:10' );
        expect( callName( 'support:{pair}', '42', '34' ) ).toBe( 'support:34:42' );
        expect( callName( 'support:{pair}', '100', '99' ) ).toBe( 'support:99:100' );
    } );

    it( 'orders numbers past what a JavaScript number holds exactly', () => {
        expect( callName( '{pair}', '90071992547409930', '90071992547409929' ) ).toBe( '90071992547409929:90071992547409930' );
    } );

    it( 'orders text ids as text', () => {
        expect( callName( 'help:{pair}', 'user_ben', 'user_ann' ) ).toBe( 'help:user_ann:user_ben' );
        expect( callName( 'help:{pair}', 'auth0|5f7c', '42' ) ).toBe( 'help:42:auth0|5f7c' );
    } );

    it( 'fills {me} and {id} as given', () => {
        expect( callName( 'room:{me}:{id}', '10', '9' ) ).toBe( 'room:10:9' );
    } );
} );
