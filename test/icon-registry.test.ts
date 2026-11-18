// The package's Icon (primitives/icons.tsx), which the call screens and every app draw through, Better Messages among
// them: every glyph of the registry's sets, as the one registry held them until K6 of the slimming of 2026-10-31
// (test/icon-sets.test.tsx holds the chat's parts on the chat's set alone).
import { expect, it } from 'vitest';
import { CALL_ICONS, CHAT_ICONS, MESSENGER_ICONS, iconPathD, isRegistryIcon, registerIcons, type IconName } from '../src/index.ts';

const ALL = { ...CHAT_ICONS, ...CALL_ICONS, ...MESSENGER_ICONS } as Record<string, string>;

it( 'holds every glyph of the three sets through the package\'s Icon', () => {
    const names = Object.keys( ALL );
    expect( names.length ).toBe( 125 );
    expect( names.filter( ( name ) => ! isRegistryIcon( name ) ) ).toEqual( [] );
    expect( names.filter( ( name ) => iconPathD( name as IconName ) !== ALL[ name ].replace( /(^|\|)\*/g, '$1' ).split( '|' ).map( ( part, i, parts ) => ( parts.length > 1 ? part.replace( /^m/, 'M0 0m' ) : part ) ).join( ' ' ) ) ).toEqual( [] );
} );

it( 'takes an app\'s own glyphs', () => {
    expect( isRegistryIcon( 'myLogo' ) ).toBe( false );
    registerIcons( { myLogo: 'M4 4h16v16H4z' } );
    expect( isRegistryIcon( 'myLogo' ) ).toBe( true );
} );
