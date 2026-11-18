// @vitest-environment node
// The eleven questions about the browser (src/inc/functions/browser-info.ts) against ua-parser-js and
// compare-versions, which answered them until 2026-10-31: for each browser of test/corpus/user-agents.ts, the same
// eleven answers. Each is asked of a fresh copy of the module, as a page asks once, on its first question.
import { afterEach, expect, it, vi } from 'vitest';
import { AGENTS, answersBefore, type Agent } from './corpus/user-agents.ts';
import { QUESTIONS } from './corpus/browser-info-before.ts';

async function answersNow( agent: Agent ): Promise<Record<string, string | boolean>> {
    vi.resetModules();
    vi.stubGlobal( 'navigator', agent );
    const info = await import( '../src/inc/functions/browser-info.ts' );
    return Object.fromEntries( QUESTIONS.map( ( question ) => [ question, info[ question ]() ] ) );
}

afterEach( () => {
    vi.unstubAllGlobals();
} );

it( 'answers every browser of the corpus as ua-parser-js did', async () => {
    expect( AGENTS.length ).toBeGreaterThanOrEqual( 90 );
    const differ: string[] = [];
    for ( const agent of AGENTS ) {
        const before = answersBefore( agent );
        const now = await answersNow( agent );
        for ( const question of QUESTIONS ) {
            if ( now[ question ] !== before[ question ] ) differ.push( `${ agent.name }: ${ question } ${ JSON.stringify( now[ question ] ) }, was ${ JSON.stringify( before[ question ] ) }` );
        }
    }
    expect( differ ).toEqual( [] );
} );

it( 'covers what the answers turn on: phones and tablets and not, each system, the Safari versions on both sides of 14, 14.5 and 17', () => {
    const before = AGENTS.map( answersBefore );
    const some = ( question: string, value: unknown ) => before.filter( ( answers ) => answers[ question ] === value ).length;
    for ( const question of [ 'isMobile', 'isNewSafari', 'isSafari', 'isIOS', 'isWindows', 'isMac', 'isAndroid', 'isFirefox', 'isOldIOS' ] ) {
        expect( some( question, true ), `${ question } true` ).toBeGreaterThan( 2 );
        expect( some( question, false ), `${ question } false` ).toBeGreaterThan( 2 );
    }
    expect( new Set( before.map( ( answers ) => answers.browserLabel ) ).size ).toBeGreaterThan( 40 );
    expect( new Set( before.map( ( answers ) => answers.platformLabel ) ).size ).toBeGreaterThan( 15 );
} );

it( 'reads nothing as it loads, and answers on a server as there is no browser', async () => {
    vi.resetModules();
    const read = vi.fn( () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' );
    vi.stubGlobal( 'navigator', { get userAgent() { return read(); } } );
    const info = await import( '../src/inc/functions/browser-info.ts' );
    expect( read ).not.toHaveBeenCalled();
    expect( info.isIOS() ).toBe( true );
    expect( info.isMobile() ).toBe( true );
    expect( read ).toHaveBeenCalledTimes( 1 );

    vi.resetModules();
    vi.stubGlobal( 'navigator', undefined );
    const server = await import( '../src/inc/functions/browser-info.ts' );
    expect( [ server.browserLabel(), server.platformLabel(), server.isMobile(), server.isSafari(), server.isOldIOS() ] ).toEqual( [ 'unknown', 'unknown', false, false, false ] );
} );
