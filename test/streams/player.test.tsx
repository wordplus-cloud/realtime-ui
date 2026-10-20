import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {googleCalendarUrl, icsFile} from "../../src/components/streams/calendar.ts";
import {clock, until} from "../../src/components/streams/format.ts";
import {base, fakeClient} from "./fake.tsx";

// The player: its controls on the picture, what it remembers in the browser, its keys, and the screen
// for each moment of a stream.

beforeEach( () => window.localStorage.clear() );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
} );

const track = ( id : string ) => ( { attach: vi.fn(), detach: vi.fn(), sid: 'TR_' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;

const hostTile = () : Tile => ( {
    identity: 'u:1', name: 'Maya Lee', role: 'host', local: false, camera: track( 'v' ), screen: null, audio: [ track( 'a' ) ],
    micMuted: false, speaking: false, encoder: false
} );

const live = ( patch : Partial<EasyStreamState> = {} ) : Partial<EasyStreamState> => ( {
    stream: { id: 's', state: 'live', started_at: Date.now() - 65_000, ended_at: null },
    media: 'live',
    tiles: [ hostTile() ],
    ...patch
} );

const stage = () => document.querySelector( '.estream-stage' ) as HTMLElement;
const audio = () => document.querySelector( '.estream-audio audio' ) as HTMLAudioElement;

describe( 'the player', () => {
    it( 'puts its controls on the picture: sound, the time on air, settings, the chat and the Live badge', () => {
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } title="Launch" /> );

        expect( screen.getByText( 'Live' ).className ).toContain( 'estream-badge--live' );
        expect( screen.getByLabelText( 'Time on air' ).textContent ).toBe( '1:05' );
        expect( screen.getByLabelText( 'Settings' ) ).toBeTruthy();
        expect( screen.getByLabelText( 'Hide chat' ) ).toBeTruthy();

        // Muting, and the volume, on the stream's sound, kept for the next visit.
        fireEvent.click( screen.getByLabelText( 'Mute' ) );
        expect( audio().muted ).toBe( true );
        expect( screen.getByLabelText( 'Unmute' ) ).toBeTruthy();
        expect( window.localStorage.getItem( 'wordplus-stream:muted' ) ).toBe( 'true' );

        fireEvent.change( screen.getByLabelText( 'Volume' ), { target: { value: '0.3' } } );
        expect( [ audio().volume, audio().muted ] ).toEqual( [ 0.3, false ] );
        expect( window.localStorage.getItem( 'wordplus-stream:volume' ) ).toBe( '0.3' );
    } );

    it( 'takes no press on its controls from the tap that wakes them, and their own taps as before (Better Messages ticket 10500 sweep)', () => {
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } title="Launch" /> );
        const mute = screen.getByLabelText( 'Mute' );

        // At rest the bar takes no touch: it lands on the picture, and the click on the button woken under the finger.
        fireEvent.pointerDown( stage(), { pointerType: 'touch' } );
        fireEvent.click( mute );
        expect( audio().muted, 'a tap meant to show the controls muted the stream' ).toBe( false );

        fireEvent.pointerDown( mute, { pointerType: 'touch' } );
        fireEvent.click( mute );
        expect( audio().muted ).toBe( true );
    } );

    it( 'remembers the volume and the hidden chat in this browser', () => {
        window.localStorage.setItem( 'wordplus-stream:volume', '0.4' );
        window.localStorage.setItem( 'wordplus-stream:chat-hidden', 'true' );
        const { asClient } = fakeClient( live() );
        const { container } = render( <EasyStreamApp client={ asClient } /> );

        expect( audio().volume ).toBe( 0.4 );
        expect( container.querySelector( '.estream-app__side' ) ).toBeNull();

        fireEvent.click( screen.getByLabelText( 'Show chat' ) );
        expect( container.querySelector( '.estream-app__side' ) ).toBeTruthy();
        expect( window.localStorage.getItem( 'wordplus-stream:chat-hidden' ) ).toBe( 'false' );
    } );

    it( 'takes no stored volume that is not one', () => {
        window.localStorage.setItem( 'wordplus-stream:volume', '"loud"' );
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );

        expect( audio().volume ).toBe( 1 );
    } );

    it( 'answers its keys on the player, but not while someone types in the chat', () => {
        const { asClient } = fakeClient( live() );
        const { container } = render( <EasyStreamApp client={ asClient } /> );

        fireEvent.keyDown( stage(), { key: 'm' } );
        expect( audio().muted ).toBe( true );
        fireEvent.keyDown( stage(), { key: 'M' } );
        expect( audio().muted ).toBe( false );

        fireEvent.keyDown( stage(), { key: 'ArrowDown' } );
        expect( audio().volume ).toBe( 0.9 );

        fireEvent.keyDown( screen.getByPlaceholderText( 'Say something…' ), { key: 'c' } );
        expect( container.querySelector( '.estream-app__side' ) ).toBeTruthy();

        fireEvent.keyDown( stage(), { key: 'c' } );
        expect( container.querySelector( '.estream-app__side' ) ).toBeNull();
    } );

    it( 'caps the picture\'s quality from its settings, shows what arrives, and keeps the choice', async () => {
        const { client, asClient } = fakeClient( live() );
        const { unmount } = render( <EasyStreamApp client={ asClient } /> );

        // What arrives, as the main picture's size says.
        const video = document.querySelector( '.estream-video' ) as HTMLVideoElement;
        Object.defineProperty( video, 'videoHeight', { configurable: true, value: 720 } );
        fireEvent( video, new Event( 'resize' ) );

        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        const menu = screen.getByRole( 'menu' );
        expect( menu.textContent ).toContain( '720p' );
        expect( screen.getByRole( 'menuitemradio', { name: /Auto/ } ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        // What Auto does, so 720p of a 1080p stream isn't a surprise.
        expect( screen.getByRole( 'menuitemradio', { name: /Auto/ } ).textContent ).toContain( 'Follows the size of the player and your connection' );

        fireEvent.click( screen.getByRole( 'menuitemradio', { name: /Low/ } ) );
        expect( client.setQuality ).toHaveBeenCalledWith( 'low' );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();
        expect( window.localStorage.getItem( 'wordplus-stream:quality' ) ).toBe( '"low"' );
        unmount();

        // The next visit starts at it.
        const next = fakeClient( live() );
        render( <EasyStreamApp client={ next.asClient } /> );
        expect( next.client.setQuality ).toHaveBeenCalledWith( 'low' );
    } );

    it( 'offers each layer the host sends by its height up to 720p, High included, the smallest saving data, and words where the sender gives no sizes', () => {
        const { client, update, asClient } = fakeClient( live() );
        client.pictureLayers.mockReturnValue( [ { quality: 'high', width: 1280, height: 720 }, { quality: 'medium', width: 960, height: 540 }, { quality: 'low', width: 640, height: 360 } ] );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        const choices = screen.getAllByRole( 'menuitemradio' ).map( ( c ) => c.textContent );
        expect( choices ).toEqual( [ 'AutoFollows the size of the player and your connection', '720p', '540p', '360pSaves data' ] );
        // The layers asked of the picture the stage shows.
        expect( client.pictureLayers ).toHaveBeenCalledWith( expect.objectContaining( { sid: 'TR_v' } ) );

        fireEvent.click( screen.getByRole( 'menuitemradio', { name: '720p' } ) );
        expect( client.setQuality ).toHaveBeenCalledWith( 'high' );
        expect( window.localStorage.getItem( 'wordplus-stream:quality' ) ).toBe( '"high"' );

        // Full HD is not a viewer's to choose: Auto brings it to a player that needs it. One chosen before shows as
        // 720p, which the engine sends instead.
        client.pictureLayers.mockReturnValue( [ { quality: 'high', width: 1920, height: 1080 }, { quality: 'medium', width: 1280, height: 720 }, { quality: 'low', width: 640, height: 360 } ] );
        update( {} );
        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        expect( screen.getAllByRole( 'menuitemradio' ).map( ( c ) => c.textContent ) ).toEqual( [ 'AutoFollows the size of the player and your connection', '720p', '360pSaves data' ] );
        expect( screen.getByRole( 'menuitemradio', { name: '720p' } ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
        fireEvent.click( screen.getByRole( 'menuitemradio', { name: '720p' } ) );
        expect( client.setQuality ).toHaveBeenLastCalledWith( 'medium' );

        // OBS over WHIP says no sizes: its layers by a word.
        client.pictureLayers.mockReturnValue( [ { quality: 'high', width: 0, height: 0 }, { quality: 'low', width: 0, height: 0 } ] );
        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        expect( screen.getAllByRole( 'menuitemradio' ).map( ( c ) => c.textContent ) ).toEqual( [ 'AutoFollows the size of the player and your connection', 'High', 'LowSaves data' ] );
        expect( screen.getByRole( 'menuitemradio', { name: 'High' } ).getAttribute( 'aria-checked' ) ).toBe( 'true' );
    } );

    it( 'shows its statistics from the menu or i, copies them for a support request, and closes them on Escape', async () => {
        const writeText = vi.fn( async ( _text : string ) => {} );
        vi.stubGlobal( 'navigator', { clipboard: { writeText }, userAgent: 'Test browser', language: 'en' } );
        const { client, asClient } = fakeClient( live() );
        client.playbackStats.mockReturnValue( {
            at: 1,
            server: { url: 'wss://bhs.rtc.example', node: 'ND_bhs_1', region: 'bhs', version: '1.0.15' },
            video: {
                codec: 'H264', width: 1280, height: 720, fps: 30, kbps: 1840, layer: 'high', layers: [ { quality: 'high', width: 1280, height: 720 }, { quality: 'low', width: 640, height: 360 } ],
                lossPct: 0.4, jitterMs: 12, bufferMs: 1000, dropped: 3, freezes: 1, frozenMs: 400, nacks: 5, plis: 1, decoder: 'VideoToolbox', hardware: true
            },
            audio: { codec: 'opus', kbps: 32, lossPct: 0, jitterMs: 4, bufferMs: 1000, concealedPct: 0.1 },
            transport: { protocol: 'udp', relayed: true, relayProtocol: 'tls', rttMs: 140 },
            session: { startupMs: 1200, watchedMs: 65_000, stalls: 2, stalledMs: 3100, reconnects: 1, rejoins: 0, errors: 0 },
            events: [ { at: Date.now() - 1000, kind: 'joined', detail: 'wss://bhs.rtc.example' }, { at: Date.now(), kind: 'stalled' } ]
        } );
        render( <EasyStreamApp client={ asClient } /> );

        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        fireEvent.click( screen.getByRole( 'menuitem', { name: 'Statistics' } ) );
        const panel = screen.getByRole( 'region', { name: 'Statistics' } );
        expect( document.activeElement ).toBe( panel );
        const row = ( label : string ) => [ ...panel.querySelectorAll( '.estream-stats__row' ) ].find( ( r ) => r.querySelector( 'dt' )?.textContent === label )?.querySelector( 'dd' )?.textContent;
        expect( row( 'Resolution' ) ).toBe( '1280×720' );
        expect( row( 'Layer' ) ).toBe( '720p, of 720p, 360p sent' );
        expect( row( 'Frame rate' ) ).toBe( '30 fps' );
        expect( row( 'Codec' ) ).toBe( 'H264, VideoToolbox, in hardware' );
        expect( row( 'Transport' ) ).toBe( 'UDP, through a relay (TLS)' );
        expect( row( 'Delay after the server' ) ).toBe( '1,070 ms' );
        expect( row( 'Server' ) ).toBe( 'ND_bhs_1, bhs' );
        expect( row( 'Picture in' ) ).toBe( '1.2 s' );
        expect( row( 'Stalls' ) ).toBe( '2, 3.1 s in all' );
        expect( panel.querySelector( '.estream-stats__events' )?.textContent ).toContain( 'Picture stopped' );

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Copy' } ) ); } );
        const copied = JSON.parse( writeText.mock.calls[0]![0] );
        expect( copied ).toMatchObject( { browser: 'Test browser', stream: 's', media: 'live', quality: 'auto', playback: { video: { kbps: 1840 } } } );
        expect( screen.getByRole( 'button', { name: 'Copied' } ) ).toBeTruthy();

        fireEvent.keyDown( panel, { key: 'Escape' } );
        expect( screen.queryByRole( 'region', { name: 'Statistics' } ) ).toBeNull();
        expect( document.activeElement ).toBe( stage() );

        // i opens them again, and closes them.
        fireEvent.keyDown( stage(), { key: 'i' } );
        expect( screen.getByRole( 'region', { name: 'Statistics' } ) ).toBeTruthy();
        fireEvent.keyDown( stage(), { key: 'i' } );
        expect( screen.queryByRole( 'region', { name: 'Statistics' } ) ).toBeNull();
    } );

    it( 'shows a spinner while the picture stopped, and says when the browser is offline', () => {
        const { update, asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );
        expect( document.querySelector( '.estream-buffering' ) ).toBeNull();

        update( { stalled: true } );
        expect( document.querySelector( '.estream-buffering' )?.getAttribute( 'role' ) ).toBe( 'status' );
        expect( screen.getByText( 'The picture stopped. Waiting for it.' ) ).toBeTruthy();

        // Offline says so, in place of the spinner and of reconnecting.
        update( { offline: true, media: 'reconnecting' } );
        expect( screen.getByText( 'You are offline' ) ).toBeTruthy();
        expect( screen.queryByText( 'Reconnecting…' ) ).toBeNull();
        expect( document.querySelector( '.estream-buffering' ) ).toBeNull();

        update( { offline: false, media: 'live', stalled: false } );
        expect( screen.queryByText( 'You are offline' ) ).toBeNull();
    } );

    it( 'closes its menu on Escape, giving focus back to its button', () => {
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );

        const button = screen.getByLabelText( 'Settings' );
        fireEvent.click( button );
        fireEvent.keyDown( screen.getByRole( 'menu' ), { key: 'Escape' } );

        expect( screen.queryByRole( 'menu' ) ).toBeNull();
        expect( document.activeElement ).toBe( button );
    } );

    it( 'goes full screen with its chat where the browser lets it, the title over the picture', async () => {
        let full : Element | null = null;
        Object.defineProperty( document, 'fullscreenEnabled', { configurable: true, value: true } );
        Object.defineProperty( document, 'fullscreenElement', { configurable: true, get: () => full } );
        const request = vi.fn( async function( this : Element ){
            full = this;
            document.dispatchEvent( new Event( 'fullscreenchange' ) );
        } );
        Element.prototype.requestFullscreen = request as any;

        try {
            const { asClient } = fakeClient( live() );
            const { container } = render( <EasyStreamApp client={ asClient } title="Launch" /> );

            await act( async () => { fireEvent.click( screen.getByLabelText( 'Full screen' ) ); } );

            const root = container.querySelector( '.estream-theme' )!;
            expect( request.mock.contexts[0] ).toBe( root );
            expect( root.className ).toContain( 'estream-theme--full' );
            expect( screen.getByLabelText( 'Exit full screen' ) ).toBeTruthy();
            expect( container.querySelector( '.estream-top__title' )?.textContent ).toBe( 'Launch' );
            expect( container.querySelector( '.estream-app__side' ), 'the chat goes with it' ).toBeTruthy();
        } finally {
            delete ( document as any ).fullscreenEnabled;
            delete ( document as any ).fullscreenElement;
            delete ( Element.prototype as any ).requestFullscreen;
        }
    } );

    it( 'plays the picture and the sound again as iOS pauses them: leaving its full screen, picture-in-picture, the background', () => {
        vi.useFakeTimers();
        const played : HTMLMediaElement[] = [];
        vi.spyOn( HTMLMediaElement.prototype, 'play' ).mockImplementation( function ( this : HTMLMediaElement ){
            played.push( this );
            return Promise.resolve();
        } );
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );

        // Both attached (a stream on each) and paused by the system.
        const video = stage().querySelector( 'video' ) as HTMLVideoElement;
        const sound = audio();
        let hidden = false;
        Object.defineProperty( document, 'hidden', { configurable: true, get: () => hidden } );
        for( const element of [ video, sound ] ){
            Object.defineProperty( element, 'srcObject', { configurable: true, writable: true, value: {} } );
            Object.defineProperty( element, 'paused', { configurable: true, get: () => true } );
        }
        const after = ( event : string, target : Element | Document ) => {
            played.length = 0;
            fireEvent( target, new Event( event ) );
            act( () => { vi.advanceTimersByTime( 100 ); } );
            return [ ...played ];
        };

        try {
            // The iPhone's full screen closed: its picture plays again, a moment later.
            expect( after( 'webkitendfullscreen', video ) ).toEqual( [ video ] );
            expect( after( 'leavepictureinpicture', video ) ).toEqual( [ video ] );
            expect( after( 'pause', sound ) ).toEqual( [ sound ] );

            // Out of sight, nothing is played; back in sight, everything is.
            hidden = true;
            expect( after( 'pause', video ) ).toEqual( [] );
            hidden = false;
            expect( after( 'visibilitychange', document ) ).toEqual( expect.arrayContaining( [ video, sound ] ) );

            // Detached, it is left as it is.
            ( video as any ).srcObject = null;
            expect( after( 'pause', video ) ).toEqual( [] );
        } finally {
            delete ( document as any ).hidden;
        }
    } );

    it( 'hides its controls once the pointer rests, and shows them on the next move', () => {
        vi.useFakeTimers();
        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } /> );
        const bar = () => document.querySelector( '.estream-bar' )!;

        fireEvent.pointerMove( stage(), { pointerType: 'mouse' } );
        expect( bar().className ).not.toContain( 'estream-bar--hidden' );

        act( () => { vi.advanceTimersByTime( 3100 ); } );
        expect( bar().className ).toContain( 'estream-bar--hidden' );

        fireEvent.pointerMove( stage(), { pointerType: 'mouse' } );
        expect( bar().className ).not.toContain( 'estream-bar--hidden' );
    } );

    it( 'warns of a weak connection, says when it reconnects, and offers sound the browser held back', () => {
        const { client, update, asClient } = fakeClient( live( { connection: 'poor' } ) );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'Weak connection' ) ).toBeTruthy();

        update( { connection: 'good', media: 'reconnecting' } );
        expect( screen.queryByText( 'Weak connection' ) ).toBeNull();
        expect( screen.getByText( 'Reconnecting…' ) ).toBeTruthy();

        update( { media: 'live', audioBlocked: true } );
        fireEvent.click( screen.getByText( 'Turn sound on' ) );
        expect( client.startAudio ).toHaveBeenCalled();
    } );

    it( 'shares the page: a copied link where there is no share sheet', async () => {
        const writeText = vi.fn( async () => {} );
        vi.stubGlobal( 'navigator', { ...navigator, share: undefined, clipboard: { writeText } } );

        const { asClient } = fakeClient( live() );
        render( <EasyStreamApp client={ asClient } url="https://site.example/launch/" /> );

        await act( async () => { fireEvent.click( screen.getByText( 'Share' ) ); } );
        expect( writeText ).toHaveBeenCalledWith( 'https://site.example/launch/' );
        expect( screen.getByText( 'Link copied' ) ).toBeTruthy();
    } );
} );

describe( 'the screen for each moment', () => {
    it( 'counts down to a start within the week, and offers it to calendars', () => {
        vi.useFakeTimers( { now: Date.UTC( 2026, 9, 8, 12 ) } );
        const { asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } title="Launch" scheduled={ Date.now() + ( 2 * 86400 + 3 * 3600 + 5 ) * 1000 } /> );

        expect( screen.getByRole( 'timer' ).textContent ).toBe( '02days03hours00minutes05seconds' );
        act( () => { vi.advanceTimersByTime( 4000 ); } );
        expect( screen.getByRole( 'timer' ).textContent, 'one of each, in the singular' ).toBe( '02days03hours00minutes01second' );
        expect( screen.getByText( /^Starts / ) ).toBeTruthy();
        vi.useRealTimers();

        fireEvent.click( screen.getByText( 'Add to calendar' ) );
        expect( screen.getByRole( 'menuitem', { name: 'Google Calendar' } ) ).toBeTruthy();
        expect( screen.getByRole( 'menuitem', { name: /\.ics/ } ) ).toBeTruthy();
    } );

    it( 'shows only the date of a start further off, and says so once its time has passed', () => {
        const { update, asClient } = fakeClient();
        const { rerender } = render( <EasyStreamApp client={ asClient } scheduled={ Date.now() + 30 * 86400 * 1000 } /> );

        expect( screen.queryByRole( 'timer' ) ).toBeNull();
        expect( screen.getByText( /^Starts / ) ).toBeTruthy();

        rerender( <EasyStreamApp client={ asClient } scheduled={ Date.now() - 60_000 } /> );
        update( {} );
        expect( screen.getByText( 'Starting any moment now' ) ).toBeTruthy();
        expect( screen.queryByText( 'Add to calendar' ) ).toBeNull();
    } );

    it( 'says how long a stream ran once it has ended', () => {
        const { asClient } = fakeClient( { stream: { id: 's', state: 'ended', started_at: 1_000, ended_at: 1_000 + 3_735_000 } } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'This stream has ended' ) ).toBeTruthy();
        expect( screen.getByText( 'It ran for 1:02:15' ) ).toBeTruthy();
    } );

    it( 'offers to try again where a new join may help, and not where it can\'t', async () => {
        const { client, asClient } = fakeClient( { status: 'error', error: 'server' } );
        const { unmount } = render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByText( 'Try again' ) ); } );
        expect( client.start ).toHaveBeenCalledTimes( 2 );
        unmount();

        const banned = fakeClient( { status: 'error', error: 'banned' } );
        render( <EasyStreamApp client={ banned.asClient } /> );
        expect( screen.getByText( 'You cannot join this stream' ) ).toBeTruthy();
        expect( screen.queryByText( 'Try again' ) ).toBeNull();
    } );

    it( 'waits for OBS\'s picture, for a host whose stream is live from it', () => {
        const { asClient } = fakeClient( {
            ...live( { tiles: [] } ),
            you: { ...base.you!, role: 'host', mod: true },
            encoder: { url: 'https://cloud.example/easy-stream/v1/whip', key: 'esk_x' }
        } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getAllByText( 'Waiting for OBS…' ).length ).toBeGreaterThan( 0 );
    } );
} );

describe( 'times and calendars', () => {
    it( 'reads a length of time as a clock does', () => {
        expect( [ clock( 4_000 ), clock( 65_000 ), clock( 3_735_000 ), clock( -5 ) ] ).toEqual( [ '0:04', '1:05', '1:02:15', '0:00' ] );
        expect( until( 1_000 + ( 86400 + 3661 ) * 1000, 1_000 ) ).toEqual( { days: 1, hours: 1, minutes: 1, seconds: 1 } );
    } );

    it( 'writes an .ics event a calendar reads, its text escaped', () => {
        const start = Date.UTC( 2026, 9, 10, 18, 0, 0 );
        const ics = icsFile( { title: 'Launch; Q&A, live', start, url: 'https://site.example/launch/', uid: 'u1@site.example' }, Date.UTC( 2026, 9, 8 ) );

        expect( ics ).toContain( '\r\nDTSTART:20261010T180000Z\r\n' );
        expect( ics ).toContain( '\r\nDTEND:20261010T190000Z\r\n' );
        expect( ics ).toContain( '\r\nSUMMARY:Launch\\; Q&A\\, live\r\n' );
        expect( ics.startsWith( 'BEGIN:VCALENDAR\r\n' ) ).toBe( true );
        expect( googleCalendarUrl( { title: 'Launch', start, url: 'https://site.example/launch/' } ) )
            .toBe( 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Launch&dates=20261010T180000Z%2F20261010T190000Z&details=https%3A%2F%2Fsite.example%2Flaunch%2F' );
    } );
} );
