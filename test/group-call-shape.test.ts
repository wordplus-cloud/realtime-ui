import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import ts from 'typescript';

// The screens read the client's group call by shape (src/sdk/types.ts) and import none of it: this checks that shape
// against the client the package vendors (vendor/realtime-client, scripts/client.mjs), so a GroupCall as the client
// makes it is an SdkGroupCall, with its moderation (WP2's acts, rules, hands, asks, bans and end) typed alike.

// vitest runs from the package's folder.
const root = process.cwd().replace( /\/?$/, '/' );

it( 'takes the vendored client\'s GroupCall as an SdkGroupCall', () => {
    const vendored = readFileSync( root + 'vendor/realtime-client/SOURCE.txt', 'utf8' );
    expect( vendored ).toMatch( /^@wordplus\/realtime-client \S+ [0-9a-f]+/ );

    const file = root + 'test/__shape__.ts';
    const source = [
        `import type { GroupCall } from '../vendor/realtime-client/sdk-calls/group-call.js';`,
        `import type { SdkGroupCall, SdkPerson } from '../src/sdk/types.ts';`,
        `export const shape = ( group: GroupCall ): SdkGroupCall => group;`,
        // What the screens' moderation reads is there, not only allowed: each optional in SdkGroupCall, for older clients.
        `type Moderation = Required<Pick<SdkGroupCall, 'acts' | 'rules' | 'hands' | 'handRaised' | 'moderate' | 'ban' | 'holdMic' | 'releaseMic' | 'setRules' | 'askToTurnOn' | 'answerAsk' | 'end' | 'raiseHand' | 'lowerHand' | 'spotlight'>>;`,
        `export const moderation = ( group: GroupCall ): Moderation => group;`,
        `type Tile = Required<Pick<SdkPerson, 'reconnecting' | 'stalled' | 'micHeld' | 'publish'>>;`,
        `export const tile = ( person: ReturnType<GroupCall[ 'people' ]>[ number ] ): Tile => person;`,
        `export const held = ( group: GroupCall ): boolean | undefined => group.can.micHeld;`,
    ].join( '\n' );
    const options: ts.CompilerOptions = {
        strict: true, noEmit: true, target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true, skipLibCheck: true,
        lib: [ 'lib.dom.d.ts', 'lib.es2021.d.ts' ], types: [],
    };
    const host = ts.createCompilerHost( options );
    const read = host.readFile.bind( host );
    host.readFile = ( name ) => name === file ? source : read( name );
    const exists = host.fileExists.bind( host );
    host.fileExists = ( name ) => name === file || exists( name );
    const getSource = host.getSourceFile.bind( host );
    host.getSourceFile = ( name, language ) => name === file ? ts.createSourceFile( name, source, language ) : getSource( name, language );

    const program = ts.createProgram( [ file ], options, host );
    const errors = ts.getPreEmitDiagnostics( program, program.getSourceFile( file ) )
        .map( ( d ) => ts.flattenDiagnosticMessageText( d.messageText, '\n' ) );
    expect( errors ).toEqual( [] );
} );
