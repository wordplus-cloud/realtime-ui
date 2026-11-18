import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, within} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamParts, type Part, type PartName, type PartOptions} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// The test stream (test-stream.tsx): on a site whose streams the cloud doesn't take yet, the studio starts a stream the
// host alone watches, on the stream's page opened from it, and the page shows it as a viewer gets it, saying it is a
// test. The engine's side is realtime-client's test/streams-test.test.ts.

beforeEach( () => {
    window.localStorage.clear();
    document.body.innerHTML = '';
} );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
} );

const connect = 'https://site.example/wp-admin/admin.php?page=wordplus-stream-upgrade';
const watchPage = 'https://site.example/friday-qa/';
const options = ( page : string ) => ( { 'studio-page': { page: { back: 'https://site.example/wp-admin/admin.php?page=wordplus-stream', page, nonce: 'n0nce' } } } );
const host = { identity: 'local', role: 'host' as const, name: 'Maya', chat: 'read' as const, mod: true };
const unconnected : Partial<EasyStreamState> = { status: 'unconnected', error: 'not_configured', you: host, stream: null };
const track = ( id : string ) => ( { attach: vi.fn(), detach: vi.fn(), sid: 'test-' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;

function show( state : Partial<EasyStreamState>, names : PartName[], extra : { options? : Partial<Record<PartName, PartOptions>>, connectUrl? : string, studioUrl? : string } = {} ){
    const fake = fakeClient( state );
    const parts : Part[] = names.map( ( name, i ) => {
        const element = document.createElement( 'div' );
        element.id = name;
        document.body.appendChild( element );
        return { key: 'p' + i, element, name, options: extra.options?.[ name ] };
    } );
    const dialogs = document.createElement( 'div' );
    document.body.appendChild( dialogs );
    render( <EasyStreamParts client={ fake.asClient } parts={ parts } dialogs={ dialogs } title="Friday Q&A" connectUrl={ extra.connectUrl } studioUrl={ extra.studioUrl } chat manage={ false } /> );
    const at = ( name : string ) => document.getElementById( name )!;
    return { ...fake, at };
}

const bar = ( part : HTMLElement ) => part.querySelector( '.wplus-live-stream-studio__bar' ) as HTMLElement;

describe( 'the test stream in the studio', () => {
    it( 'is offered where Go live is, beside the way to connect the site, and starts after the 3, 2, 1', async () => {
        vi.useFakeTimers();
        const { at, client } = show( { ...unconnected, devices: { camera: true, microphone: true } }, [ 'studio-page' ], { options: options( watchPage ), connectUrl: connect } );
        const part = at( 'studio-page' );
        const start = within( bar( part ) ).getByRole( 'button', { name: 'Start a test stream' } );

        expect( start.className ).toContain( 'wplus-live-stream-studio__go' );
        expect( start.getAttribute( 'data-wplus-live-stream-tip' ) ).toBe( 'Go live for yourself alone, and watch it on the page of the stream as viewers will.' );
        expect( within( bar( part ) ).getByRole( 'link', { name: 'Connect to go live' } ).getAttribute( 'href' ) ).toBe( connect );
        expect( within( bar( part ) ).queryByRole( 'button', { name: 'Go live' } ) ).toBeNull();

        fireEvent.click( start );
        expect( part.querySelector( '.wplus-live-stream-going__number' )?.textContent ).toBe( '3' );
        expect( within( bar( part ) ).getByRole( 'button', { name: 'Cancel' } ) ).toBeTruthy();
        await act( async () => { await vi.advanceTimersByTimeAsync( 3000 ); } );
        expect( client.startTest ).toHaveBeenCalledTimes( 1 );
        expect( client.goLive ).not.toHaveBeenCalled();
    } );

    it( 'starts at once without the countdown, and cancels with it', async () => {
        vi.useFakeTimers();
        const counted = show( { ...unconnected, devices: { camera: true, microphone: true } }, [ 'studio-page' ], { options: options( watchPage ) } );
        fireEvent.click( within( bar( counted.at( 'studio-page' ) ) ).getByRole( 'button', { name: 'Start a test stream' } ) );
        fireEvent.click( within( bar( counted.at( 'studio-page' ) ) ).getByRole( 'button', { name: 'Cancel' } ) );
        await act( async () => { await vi.advanceTimersByTimeAsync( 4000 ); } );
        expect( counted.client.startTest ).not.toHaveBeenCalled();
        cleanup();
        document.body.innerHTML = '';

        window.localStorage.setItem( 'wordplus-stream:countdown', 'false' );
        const now = show( { ...unconnected, devices: { camera: true, microphone: true } }, [ 'studio-page' ], { options: options( watchPage ) } );
        const switches = within( now.at( 'studio-page' ) ).getAllByRole( 'switch' ) as HTMLInputElement[];
        const countdown = switches.find( ( s ) => s.closest( 'label' )?.textContent?.includes( 'Count down' ) )!;
        if( countdown.checked ) fireEvent.click( countdown );
        await act( async () => { fireEvent.click( within( bar( now.at( 'studio-page' ) ) ).getByRole( 'button', { name: 'Start a test stream' } ) ); } );
        expect( now.client.startTest ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'says while it runs that only the host sees it, opens the stream\'s page to watch it, and ends', async () => {
        const open = vi.fn();
        vi.stubGlobal( 'open', open );
        const started = Date.now() - 65_000;
        const { at, client } = show( {
            ...unconnected, you: { ...host, chat: 'write', mod: false }, devices: { camera: true, microphone: true }, chatConnected: true,
            test: { started_at: started, ended_at: null, watching: 0, watch: false }
        }, [ 'studio-page' ], { options: options( watchPage ), connectUrl: connect } );
        const part = at( 'studio-page' );
        const studio = within( part );

        expect( studio.getByText( /^Testing since / ) ).toBeTruthy();
        expect( part.querySelector( '.wplus-live-stream-studio__status .wplus-live-stream-chip--live' )?.textContent ).toBe( 'Test 1:05' );
        expect( studio.getByText( 'Only you can see it' ) ).toBeTruthy();
        expect( studio.getByText( 'Your test stream is on' ) ).toBeTruthy();
        expect( studio.getByText( 'It runs in this browser alone. Nobody else can see it, and nothing of it is sent anywhere.' ) ).toBeTruthy();
        // Its chat, which the page shares, and the devices' setup under it.
        expect( studio.getAllByRole( 'tab' ).map( ( t ) => t.textContent ) ).toEqual( [ 'Chat', 'Stream' ] );
        expect( studio.getByPlaceholderText( 'Say something…' ) ).toBeTruthy();
        expect( studio.getByText( 'Best quality' ) ).toBeTruthy();
        // Nothing of connecting while it runs: the end says it.
        expect( within( bar( part ) ).queryByRole( 'link', { name: 'Connect to go live' } ) ).toBeNull();

        fireEvent.click( studio.getByRole( 'button', { name: 'Watch it as viewers do' } ) );
        // Its own tab, with this window as its opener: no noopener.
        expect( open ).toHaveBeenCalledWith( watchPage, 'wplus-live-stream-test' );

        fireEvent.click( within( bar( part ) ).getByRole( 'button', { name: 'End test' } ) );
        expect( client.endTest ).toHaveBeenCalled();
    } );

    it( 'says Test over the host\'s own picture while it runs, where Preview was', () => {
        const own : Tile = { identity: 'local', name: 'Maya', role: 'host', local: true, camera: track( 'camera' ), screen: null, audio: [], micMuted: false, speaking: false, encoder: false };
        const previewing = show( { ...unconnected, devices: { camera: true, microphone: true }, tiles: [ own ] }, [ 'studio-page' ], { options: options( watchPage ) } );
        const top = () => previewing.at( 'studio-page' ).querySelector( '.wplus-live-stream-top' ) as HTMLElement;
        expect( within( top() ).getByText( 'Preview' ) ).toBeTruthy();

        previewing.update( { test: { started_at: Date.now(), ended_at: null, watching: 0, watch: false } } );
        expect( within( top() ).queryByText( 'Preview' ) ).toBeNull();
        expect( within( top() ).getByText( 'Test' ).className ).toContain( 'wplus-live-stream-badge--live' );
        expect( within( top() ).queryByText( 'Only you can see this test' ) ).toBeNull();
    } );

    it( 'keeps the bar with everything turned off, for the devices and its end', () => {
        const { at } = show( { ...unconnected, test: { started_at: Date.now(), ended_at: null, watching: 1, watch: false } }, [ 'studio-page' ], { options: options( watchPage ) } );
        const part = at( 'studio-page' );
        expect( within( bar( part ) ).getByRole( 'button', { name: 'Camera' } ) ).toBeTruthy();
        expect( within( bar( part ) ).getByRole( 'button', { name: 'End test' } ) ).toBeTruthy();
        // The way to watch it alone, no sources to choose.
        expect( within( part ).getByRole( 'button', { name: 'Watch it as viewers do' } ) ).toBeTruthy();
        expect( within( part ).queryByText( 'Turn on camera and microphone' ) ).toBeNull();
    } );

    it( 'says when the page opened from it never reached the test, and not once a page has watched', async () => {
        vi.useFakeTimers();
        vi.stubGlobal( 'open', vi.fn() );
        const running = { started_at: Date.now(), ended_at: null, watching: 0, watch: false };
        const { at, update } = show( { ...unconnected, devices: { camera: true, microphone: true }, test: running }, [ 'studio-page' ], { options: options( watchPage ) } );
        const studio = within( at( 'studio-page' ) );
        const unreached = /The page has not reached this test/;

        fireEvent.click( studio.getByRole( 'button', { name: 'Watch it as viewers do' } ) );
        await act( async () => { await vi.advanceTimersByTimeAsync( 9000 ); } );
        expect( studio.getByRole( 'alert' ).textContent ).toBe( 'The page has not reached this test. A security setting of the site may keep the two tabs apart, such as a Cross-Origin-Opener-Policy header.' );

        update( { test: { ...running, watching: 1 } } );
        expect( studio.queryByText( unreached ) ).toBeNull();
        // The tab closed since: no failure to reach it.
        update( { test: { ...running, watching: 0 } } );
        await act( async () => { await vi.advanceTimersByTimeAsync( 9000 ); } );
        expect( studio.queryByText( unreached ) ).toBeNull();
    } );

    it( 'points to making a page for a stream that has none', () => {
        const { at } = show( { ...unconnected, devices: { camera: true, microphone: true }, test: { started_at: Date.now(), ended_at: null, watching: 0, watch: false } }, [ 'studio-page' ], { options: options( '' ) } );
        expect( within( at( 'studio-page' ) ).queryByRole( 'button', { name: 'Watch it as viewers do' } ) ).toBeNull();
        expect( within( at( 'studio-page' ) ).getByText( 'To watch it as viewers do, create a page for this stream in the Stream tab, then open it from here.' ) ).toBeTruthy();
    } );

    it( 'sums it up once it has ended, with the way to connect the site, until the camera is on again', () => {
        const ended = { started_at: Date.now() - 125_000, ended_at: Date.now() - 60_000, watching: 0, watch: false };
        const { at, update } = show( { ...unconnected, test: ended }, [ 'studio-page' ], { options: options( watchPage ), connectUrl: connect } );
        const studio = within( at( 'studio-page' ) );

        expect( studio.getByText( 'Your test has ended' ) ).toBeTruthy();
        expect( studio.getByText( 'It ran for 1:05' ) ).toBeTruthy();
        expect( studio.getByText( 'Viewers see your stream like this once you go live. Going live for everyone needs the site connected to WordPlus Cloud.' ) ).toBeTruthy();
        const summary = studio.getByText( 'Your test has ended' ).closest( '.wplus-live-stream-test-panel' ) as HTMLElement;
        expect( within( summary ).getByRole( 'link', { name: 'Connect to go live' } ).getAttribute( 'href' ) ).toBe( connect );
        // The chat closed with it, and the sources to start again.
        expect( studio.getAllByRole( 'tab' ).map( ( t ) => t.textContent ) ).toEqual( [ 'Stream' ] );
        expect( studio.getByText( 'Turn on camera and microphone' ) ).toBeTruthy();

        update( { devices: { camera: true, microphone: true } } );
        expect( studio.queryByText( 'Your test has ended' ) ).toBeNull();
    } );

    it( 'keeps the studio as it was with an engine that runs no tests', () => {
        const fake = fakeClient( { ...unconnected, devices: { camera: true, microphone: true } } );
        delete ( fake.client.getState() as Partial<EasyStreamState> ).test;
        delete ( fake.client as Partial<typeof fake.client> ).startTest;
        const element = document.createElement( 'div' );
        document.body.appendChild( element );
        render( <EasyStreamParts client={ fake.asClient } parts={ [ { key: 'p', element, name: 'studio-page', options: options( watchPage )[ 'studio-page' ] } ] } dialogs={ document.body } connectUrl={ connect } manage={ false } /> );
        const go = element.querySelector( '.wplus-live-stream-studio__go' ) as HTMLAnchorElement;
        expect( [ go.tagName, go.textContent, go.getAttribute( 'href' ) ] ).toEqual( [ 'A', 'Connect to go live', connect ] );
        expect( within( element ).queryByText( 'Start a test stream' ) ).toBeNull();
    } );
} );

describe( 'the test stream on the stream\'s page', () => {
    const watched : Partial<EasyStreamState> = {
        status: 'ready',
        you: { identity: 'local', role: 'viewer', name: 'Maya', chat: 'write', mod: false, offline: 'closed' },
        stream: { id: 's12', state: 'live', started_at: Date.now() - 30_000, ended_at: null },
        media: 'live',
        tiles: [ { identity: 'test:local', name: 'Maya', avatar: null, role: 'host', local: false, camera: track( 'camera' ), screen: null, audio: [ track( 'mic' ) ], micMuted: false, speaking: false, encoder: false } ],
        viewers: 1,
        audioBlocked: true,
        test: { started_at: Date.now() - 30_000, ended_at: null, watching: 1, watch: true }
    };

    it( 'shows it as a viewer gets it, live, with a badge saying only the host sees it and its sound waiting', async () => {
        const { at, client } = show( watched, [ 'player', 'chat' ] );
        const player = within( at( 'player' ) );

        expect( player.getByText( 'Live' ) ).toBeTruthy();
        const badge = player.getByText( 'Only you can see this test' );
        expect( badge.closest( '.wplus-live-stream-top' ) ).toBeTruthy();
        expect( badge.className ).toContain( 'wplus-live-stream-badge--test' );
        expect( at( 'player' ).querySelector( 'video' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( player.getByRole( 'button', { name: 'Turn sound on' } ) ); } );
        expect( client.startAudio ).toHaveBeenCalled();
        // The chat writable, as a viewer has it.
        expect( within( at( 'chat' ) ).getByPlaceholderText( 'Say something…' ) ).toBeTruthy();
    } );

    it( 'shows no badge on a stream that is no test', () => {
        const { at } = show( { ...watched, test: null }, [ 'player' ] );
        expect( within( at( 'player' ) ).queryByText( 'Only you can see this test' ) ).toBeNull();
    } );

    it( 'tells its host how to watch a test on it, and plainly when a test runs that it cannot reach', () => {
        const { at, update } = show( unconnected, [ 'player' ], { connectUrl: connect, studioUrl: 'https://site.example/wp-admin/admin.php?page=wordplus-stream#/studio/12' } );
        const player = within( at( 'player' ) );

        expect( player.getByText( 'To watch a test stream here, start it in the studio and choose Watch it as viewers do.' ) ).toBeTruthy();

        update( { testElsewhere: true } );
        expect( player.getByText( 'Your test stream is on in another tab' ) ).toBeTruthy();
        expect( player.getByText( 'This page cannot show it. To watch it here, go back to the studio and choose Watch it as viewers do, which opens this page from there.' ) ).toBeTruthy();
        expect( player.getByText( /a security setting of the site keeps the two tabs apart, such as a Cross-Origin-Opener-Policy header/ ) ).toBeTruthy();
        expect( player.queryByText( 'Not connected to WordPlus Cloud yet' ) ).toBeNull();
    } );
} );
