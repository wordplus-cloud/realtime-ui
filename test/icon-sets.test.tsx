// The icon registry in sets (K6 of the slimming of 2026-10-31): the chat's parts draw from the chat's set alone
// (primitives/icon.tsx), and a bundle of them carries no other glyph. This file loads the chat's parts and never the
// package's Icon (primitives/icons.tsx), so only the chat's set is registered here, as in such a bundle.
// test/icon-registry.test.ts holds the package's Icon, with every glyph.
import React, { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { configureUi } from '../src/host.ts';
import { ComposerRow } from '../src/components/chat/composer-row.tsx';
import { HoverButton, StatusTick, SystemRow } from '../src/components/chat/message-parts.tsx';
import { ActivityIndicator } from '../src/components/presence/presence.tsx';
import { MessageFiles, StagedFiles } from '../src/sdk/chat-files.tsx';
import { isRegistryIcon } from '../src/primitives/icon.tsx';
import { CHAT_ICONS } from '../src/primitives/icons/chat.ts';
import { CALL_ICONS } from '../src/primitives/icons/calls.ts';
import { MESSENGER_ICONS } from '../src/primitives/icons/messenger.ts';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const SETS = { chat: CHAT_ICONS, calls: CALL_ICONS, messenger: MESSENGER_ICONS } as Record<string, Record<string, string>>;
const ALL = Object.assign( {}, ...Object.values( SETS ) ) as Record<string, string>;

beforeEach( () => configureUi( { translate: ( text: string ) => text } ) );
afterEach( cleanup );

it( 'holds the registry\'s 125 glyphs in three sets, each glyph in one', () => {
    const names = Object.values( SETS ).flatMap( ( set ) => Object.keys( set ) );
    expect( names.length ).toBe( 125 );
    expect( new Set( names ).size ).toBe( 125 );
} );

it( 'has the chat\'s parts draw every glyph of theirs from the chat\'s set', () => {
    // Every name of a glyph that the chat's sources write, the registry's: in the chat's set.
    const sources = [ 'components/chat/message-parts.tsx', 'components/chat/composer-row.tsx', 'components/chat/reactions.tsx',
        'components/presence/presence.tsx', 'components/presence/online-list.tsx', 'sdk/chat-files.tsx', 'sdk/chat.tsx', 'primitives/icon-button.tsx' ];
    const outside: string[] = [];
    for ( const file of sources ) {
        const text = readFileSync( join( root, 'src', file ), 'utf8' );
        for ( const [ , name ] of text.matchAll( /["'`]([A-Za-z0-9-]+)["'`]/g ) ) {
            if ( name in ALL && ! ( name in CHAT_ICONS ) ) outside.push( `${ file }: ${ name }` );
        }
    }
    expect( outside ).toEqual( [] );
    expect( isRegistryIcon( 'send' ) ).toBe( true );
    expect( isRegistryIcon( 'raisehand' ) ).toBe( false );
} );

it( 'draws the chat\'s parts whole with the chat\'s set alone', () => {
    const glyphs = ( node: React.ReactElement ) => {
        const { container } = render( node );
        const drawn = [ ...container.querySelectorAll( 'svg' ) ].filter( ( svg ) => svg.querySelector( 'path' ) ).length;
        cleanup();
        return drawn;
    };
    for ( const status of [ 'failed', 'queued', 'seen', 'delivered', 'sent' ] as const ) expect( glyphs( <StatusTick status={ status } /> ), status ).toBe( 1 );
    expect( glyphs( <SystemRow>Ann joined</SystemRow> ) ).toBe( 1 );
    expect( glyphs( <HoverButton icon="edit" label="Edit" onClick={ () => {} } /> ) ).toBe( 1 );
    const composer = { hostRef: createRef<HTMLDivElement>(), onInput: () => {}, placeholder: 'Write', maxLength: 0, charCount: 0, onKeyDown: () => {}, limited: false, onSend: () => {}, canSend: true, hasContent: true };
    // Each of the row's buttons (attach, the picker, the camera, the microphone or Send) with its glyph.
    for ( const props of [ { hasContent: true }, { hasContent: false }, { sending: true }, { isEdit: true }, { pickerIcon: 'gif' as const }, { pickerIcon: 'sticker' as const } ] ) {
        const { container } = render( <ComposerRow { ...composer } canRecordVoice canRecordVideo onStartVoice={ () => {} } onStartVideo={ () => {} } onAttachClick={ () => {} } onEmojiClick={ () => {} } pickerLabel="Emoji" formatToggle={ { open: false, onToggle: () => {} } } { ...props } /> );
        const buttons = [ ...container.querySelectorAll( '.wplus-icon-btn' ) ];
        expect( buttons.length, JSON.stringify( props ) ).toBeGreaterThanOrEqual( 3 );
        expect( buttons.filter( ( button ) => ! button.querySelector( 'svg path, svg text' ) ).map( ( button ) => button.outerHTML ), JSON.stringify( props ) ).toEqual( [] );
        cleanup();
    }
    expect( glyphs( <ActivityIndicator entries={ [ { activity: 'recording', name: 'Ann' } ] } /> ) ).toBe( 1 );
    expect( glyphs( <StagedFiles staged={ [ { key: 'a', name: 'notes.pdf', size: 1200, type: 'application/pdf', preview: null, status: 'done', progress: 1 } ] } onRemove={ () => {} } onOpen={ () => {} } /> ) ).toBeGreaterThanOrEqual( 1 );
    expect( glyphs( <MessageFiles files={ [ { id: '1', url: '/notes.pdf', name: 'notes.pdf', size: 1200, type: 'application/pdf' } ] } /> ) ).toBeGreaterThanOrEqual( 1 );
} );

it( 'leaves the call screens\' glyphs and Better Messages\' own out of a bundle of the chat\'s parts, and keeps them in one of the package\'s Icon', async () => {
    const bundle = async ( contents: string ) => ( await build( {
        stdin: { contents, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'esm', minify: true, logLevel: 'error',
        external: [ 'react', 'react-dom', 'react/jsx-runtime', 'react-dom/client' ], jsx: 'automatic',
    } ) ).outputFiles[ 0 ].text;
    const parts = await bundle( `export { ComposerRow } from './src/components/chat/composer-row.tsx'; export { StatusTick, SystemRow, MessageMeta } from './src/components/chat/message-parts.tsx'; export { ReactionPicker } from './src/components/chat/reactions.tsx'; export { Avatar, ActivityIndicator } from './src/components/presence/presence.tsx'; export { MessageFiles } from './src/sdk/chat-files.tsx';` );
    const whole = await bundle( `export { Icon } from './src/index.ts';` );
    const inside = ( text: string, set: Record<string, string> ) => Object.values( set ).filter( ( d ) => text.includes( d ) ).length;
    expect( inside( parts, CHAT_ICONS ) ).toBe( Object.keys( CHAT_ICONS ).length );
    expect( inside( parts, CALL_ICONS ) ).toBe( 0 );
    expect( inside( parts, MESSENGER_ICONS ) ).toBe( 0 );
    expect( inside( whole, ALL ) ).toBe( 125 );
} );
