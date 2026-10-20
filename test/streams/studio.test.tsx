import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {byTip, fakeClient} from "./fake.tsx";

// The host's studio: the source, the devices, going live with 3-2-1, the bar and the status while live,
// OBS, the guests, and the summary at the end.

beforeEach( () => window.localStorage.clear() );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
} );

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const liveStream = { id: 's', state: 'live' as const, started_at: Date.now() - 125_000, ended_at: null };
const flush = () => act( async () => {} );

describe( 'the studio', () => {
    it( 'offers the camera or OBS, sets up the devices, and goes live after 3, 2, 1', async () => {
        const { client, asClient } = fakeClient( { you: host } );
        render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByText( 'Turn on camera and microphone' ) ); } );
        expect( client.startPreview ).toHaveBeenCalled();
        expect( screen.getByText( 'Preview: only you can see this' ) ).toBeTruthy();

        // The devices, by name.
        await flush();
        const cameras = screen.getByLabelText( 'Camera', { selector: 'select' } ) as HTMLSelectElement;
        expect( [ ...cameras.options ].map( ( o ) => o.text ) ).toEqual( [ 'Chosen by the system', 'FaceTime HD Camera', 'Studio Display Camera' ] );
        expect( screen.getByLabelText( 'Microphone', { selector: 'select' } ) ).toBeTruthy();

        vi.useFakeTimers();
        // A switch in a row of its own, as the devices and the quality.
        const checkbox = screen.getByRole( 'switch', { name: 'Count down 3, 2, 1 before going live' } ) as HTMLInputElement;
        expect( checkbox.checked ).toBe( true );
        expect( checkbox.closest( '.estream-setup__row' )?.textContent ).toContain( 'Countdown' );

        fireEvent.click( screen.getByText( 'Go live' ) );
        expect( document.querySelector( '.estream-going__number' )?.textContent ).toBe( '3' );
        act( () => { vi.advanceTimersByTime( 1000 ); } );
        expect( document.querySelector( '.estream-going__number' )?.textContent ).toBe( '2' );
        expect( client.goLive ).not.toHaveBeenCalled();
        act( () => { vi.advanceTimersByTime( 2000 ); } );
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
        expect( document.querySelector( '.estream-going' ) ).toBeNull();
    } );

    it( 'lets the host stop the countdown, or go live at once without it, remembering that', async () => {
        const { client, asClient } = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        vi.useFakeTimers();
        fireEvent.click( screen.getByText( 'Go live' ) );
        fireEvent.click( screen.getByText( 'Cancel' ) );
        act( () => { vi.advanceTimersByTime( 5000 ); } );
        expect( client.goLive ).not.toHaveBeenCalled();

        fireEvent.click( screen.getByLabelText( 'Count down 3, 2, 1 before going live' ) );
        expect( window.localStorage.getItem( 'wordplus-stream:countdown' ) ).toBe( 'false' );
        await act( async () => { fireEvent.click( screen.getByText( 'Go live' ) ); } );
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'switches the camera and microphone, and opens the same ones next time', async () => {
        const { client, asClient } = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        const { unmount } = render( <EasyStreamApp client={ asClient } /> );
        await flush();

        await act( async () => { fireEvent.change( screen.getByLabelText( 'Camera', { selector: 'select' } ), { target: { value: 'cam-2' } } ); } );
        expect( client.useDevice ).toHaveBeenCalledWith( 'camera', 'cam-2' );
        expect( window.localStorage.getItem( 'wordplus-stream:camera' ) ).toBe( '"cam-2"' );

        // From the bar's menu too.
        fireEvent.click( screen.getByLabelText( 'Choose a microphone' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitemradio', { name: 'Shure MV7' } ) ); } );
        expect( client.useDevice ).toHaveBeenCalledWith( 'microphone', 'mic-2' );
        unmount();

        const next = fakeClient( { you: host } );
        render( <EasyStreamApp client={ next.asClient } /> );
        expect( next.client.useDevice ).toHaveBeenCalledWith( 'camera', 'cam-2' );
        expect( next.client.useDevice ).toHaveBeenCalledWith( 'microphone', 'mic-2' );
    } );

    it( 'while live: the bar, the time, the viewers and their peak, how the picture goes out, and the keys', async () => {
        const { client, update, asClient } = fakeClient( {
            you: host, stream: { ...liveStream, started_at: Date.now() - 125_000 }, devices: { camera: true, microphone: true }, viewers: 12, tally: { peak: 30, messages: 4, reactions: 9 }
        } );
        client.sendingStats.mockResolvedValue( { width: 1280, height: 720, fps: 30, kbps: 2412, limited: null } as any );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( screen.getByText( 'You are live' ) ).toBeTruthy();
        expect( byTip( 'Time on air' ).textContent ).toBe( 'Live 2:05' );
        expect( byTip( 'The most watching at once since you went live' ).textContent ).toBe( 'Peak 30' );
        expect( screen.getByText( 'Good connection' ) ).toBeTruthy();
        // Shown while as many watch as at the peak too, never under those watching.
        act( () => { update( { viewers: 31 } ); } );
        expect( byTip( 'The most watching at once since you went live' ).textContent ).toBe( 'Peak 31' );
        act( () => { update( { viewers: 12 } ); } );

        // A cap from the cloud isn't said on the count until it is reached ("up to 50 viewers is not actual"); then "full".
        act( () => { update( { audience: 50 } ); } );
        expect( document.querySelector( '.estream-studio__status' )?.textContent ).not.toMatch( /up to/i );
        expect( byTip( 'The most watching at once since you went live' ).textContent ).toBe( 'Peak 30' );
        act( () => { update( { audience: 12 } ); } );
        const full = byTip( 'The stream is full: it takes 12 viewers, and the next ones wait for a place.' );
        expect( full.textContent ).toBe( '12 watchingfull' );
        expect( full.className ).toContain( 'estream-chip--warn' );
        act( () => { update( { audience: null } ); } );
        expect( screen.getByText( '720p · 30 fps · 2.4 Mbps' ) ).toBeTruthy();
        expect( screen.getByRole( 'button', { name: 'Share screen' } ).getAttribute( 'data-estream-tip' ) ).toBe( 'Share screen' );

        // The plan's credits, the bought and a month's borrowing all used, as the cloud says, from a cloud that says no
        // unmetered viewers: new viewers cannot join, with the way to buy more.
        const warning = () => document.querySelector<HTMLElement>( '.estream-studio__status .estream-chip--warn' );
        expect( warning() ).toBeNull();
        act( () => { update( { usage: { included_left_seconds: 0, credits_left: 0, borrowed_seconds: 300_000, admit: false, buy_url: 'https://www.wordplus.cloud/credits', at: 1 } } ); } );
        const spent = warning()!;
        expect( spent.getAttribute( 'data-estream-tip' ) ).toBe( 'Your credits are used up, and so is what you may borrow. Those watching stay, and nobody new can join until you buy more.' );
        expect( spent.textContent ).toBe( 'New viewers cannot joinBuy credits' );
        expect( spent.querySelector( 'a' )?.getAttribute( 'href' ) ).toBe( 'https://www.wordplus.cloud/credits' );
        // With the site's unmetered viewers, who still join.
        act( () => { update( { usage: { included_left_seconds: 0, credits_left: 0, borrowed_seconds: 300_000, admit: false, unmetered_viewers: 50, buy_url: 'https://www.wordplus.cloud/credits', at: 2 } } ); } );
        expect( warning()!.getAttribute( 'data-estream-tip' ) ).toBe( 'Your credits are used up, and so is what you may borrow. Up to 50 viewers at once still join, and those above wait until you buy more. Those watching are never cut off.' );
        expect( warning()!.textContent ).toBe( 'Viewers above 50 cannot joinBuy credits' );
        act( () => { update( { usage: { included_left_seconds: 0, credits_left: 500, admit: true, unmetered_viewers: 50, buy_url: 'https://www.wordplus.cloud/credits', at: 3 } } ); } );
        expect( warning() ).toBeNull();

        // Switching to OBS while live, from the bar's More.
        fireEvent.click( screen.getByLabelText( 'More' ) );
        await act( async () => { fireEvent.click( screen.getByRole( 'menuitem', { name: 'Stream from OBS' } ) ); } );
        expect( client.useEncoder ).toHaveBeenCalledWith();

        // ⌘/Ctrl+D and ⌘/Ctrl+E, as in calls.
        await act( async () => { fireEvent.keyDown( document, { key: 'd', metaKey: true } ); } );
        expect( client.setMicrophone ).toHaveBeenCalledWith( false );
        await act( async () => { fireEvent.keyDown( document, { key: 'e', ctrlKey: true } ); } );
        expect( client.setCamera ).toHaveBeenCalledWith( false );

        // Both off, the buttons stay, to turn them on again.
        expect( byTip( 'Unmute the microphone (⌘/Ctrl+D)' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( byTip( 'Turn on the camera (⌘/Ctrl+E)' ) ); } );
        expect( client.setCamera ).toHaveBeenLastCalledWith( true );

        // What holds the picture back.
        client.sendingStats.mockResolvedValue( { width: 640, height: 360, fps: 24, kbps: 600, limited: 'bandwidth' } as any );
        update( { connection: 'good' } );
        await act( async () => { await new Promise( ( r ) => setTimeout( r, 2100 ) ); } );
        expect( screen.getByText( 'Your connection is holding the picture back' ) ).toBeTruthy();
    }, 10_000 );

    it( 'shows the host everything that goes out, from its figures or the player\'s menu: each layer, the sound, the way out', async () => {
        const camera = { attach: vi.fn(), detach: vi.fn(), sid: 'TR_v', mediaStreamTrack: { id: 'v' } } as unknown as NonNullable<Tile['camera']>;
        const mine : Tile = { identity: 'u:1', name: 'Host', role: 'host', local: true, camera, screen: null, audio: [], micMuted: false, speaking: false, encoder: false };
        const { client, asClient } = fakeClient( { you: host, stream: liveStream, media: 'live', tiles: [ mine ], devices: { camera: true, microphone: true } } );
        const layer = { targetKbps: null, resentKbps: 0, limited: null, encoder: 'VideoToolbox', hardware: true, lossPct: 0, rttMs: 120, nacks: 1, plis: 0, firs: 0 };
        client.sendingDetail.mockResolvedValue( {
            at: 1,
            video: [ {
                source: 'camera', codec: 'H264', capture: { width: 1280, height: 720, fps: 30 }, kbps: 1400, limitedMs: { bandwidth: 750, cpu: 2500, other: 0 },
                layers: [
                    { ...layer, rid: 'f', active: true, width: 1280, height: 720, fps: 30, kbps: 1200, targetKbps: 1500, resentKbps: 40, limited: 'cpu', lossPct: 2.1, rttMs: 118, nacks: 4, plis: 1 },
                    { ...layer, rid: 'h', active: false, width: 0, height: 0, fps: 0, kbps: 0 },
                    // Just on, before its first frame.
                    { ...layer, rid: 'm', active: true, width: 0, height: 0, fps: 0, kbps: 0 },
                    { ...layer, rid: 'q', active: true, width: 640, height: 360, fps: 30, kbps: 200, lossPct: 0.5 }
                ]
            } ],
            audio: { codec: 'opus', kbps: 32, lossPct: 0.4, jitterMs: 2, rttMs: 120, level: 0.31, muted: false },
            transport: { protocol: 'udp', relayed: false, relayProtocol: null, rttMs: 117, availableKbps: 3250 }
        } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        // The player's menu has the statistics alone: a picture of this window's own has no quality to choose.
        fireEvent.click( screen.getByLabelText( 'Settings' ) );
        expect( screen.queryAllByRole( 'menuitemradio' ) ).toEqual( [] );
        fireEvent.click( screen.getByRole( 'menuitem', { name: 'Statistics' } ) );
        await flush();

        const panel = screen.getByRole( 'region', { name: 'Statistics' } );
        const section = ( title : string ) => [ ...panel.querySelectorAll( '.estream-stats__section' ) ].find( ( s ) => s.querySelector( 'h3' )?.textContent === title )!;
        const rows = ( title : string ) => Object.fromEntries( [ ...section( title ).querySelectorAll( '.estream-stats__row' ) ].map( ( r ) => [ r.querySelector( 'dt' )?.textContent, r.querySelector( 'dd' )?.textContent ] ) );
        expect( [ ...panel.querySelectorAll( 'h3' ) ].map( ( h ) => h.textContent )[0] ).toBe( 'Sending the camera' );
        expect( rows( 'Sending the camera' ) ).toEqual( {
            'Captured': '1280×720 · 30 fps',
            'Codec': 'H264, VideoToolbox, in hardware',
            'Bitrate': '1,400 kbps',
            'Layer 720p': '1280×720 · 30 fps · 1,200 kbps',
            'Layer h': 'Off, no viewer needs it',
            'Layer m': '–',
            'Layer 360p': '640×360 · 30 fps · 200 kbps',
            'Held back by': 'The computer',
            'Time held back': 'Computer 2.5 s, connection 0.8 s',
            'Packet loss': '2.1%',
            'Round trip': '118 ms',
            'Sent again': '40 kbps',
            'Repairs asked': '7 NACK, 1 PLI, 0 FIR'
        } );
        expect( rows( 'Sending the sound' ) ).toEqual( { 'Codec': 'opus', 'Level': '31%', 'Bitrate': '32 kbps', 'Packet loss': '0.4%', 'Jitter': '2 ms', 'Round trip': '120 ms' } );
        // Nothing arrives for a host alone: the way out is the connection.
        expect( rows( 'Connection' ) ).toMatchObject( { 'Transport': 'UDP', 'Round trip': '117 ms', 'Upload estimate': '3,250 kbps' } );
        expect( panel.textContent ).not.toContain( 'Nothing arrives yet' );

        // The button among the figures while live closes and opens the same panel.
        const button = screen.getByRole( 'button', { name: 'Hide statistics' } );
        expect( button.getAttribute( 'aria-pressed' ) ).toBe( 'true' );
        fireEvent.click( button );
        expect( screen.queryByRole( 'region', { name: 'Statistics' } ) ).toBeNull();
        fireEvent.click( screen.getByRole( 'button', { name: 'Statistics' } ) );
        expect( screen.getByRole( 'region', { name: 'Statistics' } ) ).toBeTruthy();
        expect( client.sendingDetail ).toHaveBeenCalled();
    } );

    it( 'says nothing of a pause while nobody has the video on screen: the quality chosen, as when it goes out', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: liveStream, viewers: 3, devices: { camera: true, microphone: true } } );
        client.sendingStats.mockResolvedValue( { width: 0, height: 0, fps: 0, kbps: 0, limited: null, paused: true } as any );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        // Viewers are what a stream costs: a stream said to be paused would raise the question.
        const status = document.querySelector( '.estream-studio__status' ) as HTMLElement;
        expect( status.textContent ).not.toMatch( /paus/i );
        expect( screen.getByText( '720p' ).className ).toBe( 'estream-studio__numbers' );
        expect( screen.getByText( 'Good connection' ) ).toBeTruthy();

        client.sendingStats.mockResolvedValue( { width: 1280, height: 720, fps: 30, kbps: 2412, limited: null } as any );
        await act( async () => { await new Promise( ( r ) => setTimeout( r, 2100 ) ); } );
        expect( screen.getByText( '720p · 30 fps · 2.4 Mbps' ) ).toBeTruthy();
    }, 10_000 );

    it( 'shows in its numbers when less than the quality chosen goes out, because no player needs more', async () => {
        window.localStorage.setItem( 'wordplus-stream:send-quality', '"1080p"' );
        const { client, asClient } = fakeClient( { you: host, stream: liveStream, topQuality: '1080p', devices: { camera: true, microphone: true } } );
        client.sendingStats.mockResolvedValue( { width: 1280, height: 720, fps: 30, kbps: 2412, limited: null, held: true } as any );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        const numbers = screen.getByText( '720p of 1080p · 30 fps · 2.4 Mbps' );
        expect( numbers.getAttribute( 'data-estream-tip' ) ).toBe( 'Viewers get 1080p when one watches in a big window or full screen.' );
        // No chip of its own.
        expect( screen.queryByText( /no player/ ) ).toBeNull();

        client.sendingStats.mockResolvedValue( { width: 1920, height: 1080, fps: 30, kbps: 4400, limited: null } as any );
        await act( async () => { await new Promise( ( r ) => setTimeout( r, 2100 ) ); } );
        expect( screen.getByText( '1080p · 30 fps · 4.4 Mbps' ).hasAttribute( 'data-estream-tip' ) ).toBe( false );
    }, 10_000 );

    it( 'doesn\'t blame the connection in the first seconds live, while the browser finds what it takes', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: { ...liveStream, started_at: Date.now() - 3000 }, devices: { camera: true, microphone: true } } );
        client.sendingStats.mockResolvedValue( { width: 640, height: 360, fps: 30, kbps: 600, limited: 'bandwidth' } as any );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( screen.queryByText( 'Your connection is holding the picture back' ) ).toBeNull();
        expect( screen.getByText( 'Good connection' ) ).toBeTruthy();
    } );

    it( 'says the computer is busy when that is what reduces the picture, though the media server rates the connection poor', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: liveStream, connection: 'poor', devices: { camera: true, microphone: true } } );
        client.sendingStats.mockResolvedValue( { width: 640, height: 360, fps: 30, kbps: 600, limited: 'cpu' } as any );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( screen.getByText( 'Your computer is busy: the picture is reduced' ) ).toBeTruthy();
        expect( screen.queryByText( 'Weak connection' ) ).toBeNull();
    } );

    it( 'ends the stream only after asking, in its own dialog', async () => {
        const { client, asClient } = fakeClient( { you: host, stream: liveStream, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByText( 'End stream' ) ); } );
        expect( screen.getByRole( 'dialog', { name: 'End the stream for everyone?' } ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByText( 'Cancel' ) ); } );
        expect( client.end ).not.toHaveBeenCalled();

        await act( async () => { fireEvent.click( screen.getByText( 'End stream' ) ); } );
        await act( async () => { fireEvent.click( screen.getByText( 'End for everyone' ) ); } );
        expect( client.end ).toHaveBeenCalled();
    } );

    it( 'warns before the page is left while live, and keeps the screen awake', async () => {
        const request = vi.fn( async () => ( { release: vi.fn( async () => {} ) } ) );
        vi.stubGlobal( 'navigator', { ...navigator, wakeLock: { request } } );
        const { update, asClient } = fakeClient( { you: host, stream: liveStream, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        expect( request ).toHaveBeenCalledWith( 'screen' );
        const leaving = new Event( 'beforeunload', { cancelable: true } );
        window.dispatchEvent( leaving );
        expect( leaving.defaultPrevented ).toBe( true );

        update( { stream: { ...liveStream, state: 'ended', ended_at: Date.now() } } );
        const after = new Event( 'beforeunload', { cancelable: true } );
        window.dispatchEvent( after );
        expect( after.defaultPrevented ).toBe( false );
    } );

    it( 'warns before leaving a stream this window sent with everything off for now, and tells the host nothing is going out', async () => {
        const { asClient } = fakeClient( { you: host, stream: liveStream, media: 'live', tiles: [], sentHere: true } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        const leaving = new Event( 'beforeunload', { cancelable: true } );
        window.dispatchEvent( leaving );
        expect( leaving.defaultPrevented ).toBe( true );
        expect( screen.getByText( 'You are live, but nothing is going out' ) ).toBeTruthy();
        expect( screen.queryByText( 'Waiting for the picture of the host…' ) ).toBeNull();
    } );

    it( 'sums a stream up at its end, with the way to go live again right under it', async () => {
        const { update, asClient } = fakeClient( { you: host, stream: liveStream, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } /> );

        update( {
            stream: { ...liveStream, started_at: 1_000, state: 'ended', ended_at: 1_000 + 3_735_000 },
            devices: { camera: false, microphone: false },
            tally: { peak: 1240, messages: 87, reactions: 1503 }
        } );

        // The picture says so to the host, never a viewer's thanks, and points down to what's next.
        const picture = document.querySelector( '.estream-stage' )!;
        expect( picture.textContent ).toContain( 'Your stream has ended' );
        expect( picture.textContent ).toContain( 'It ran for 1:02:15' );
        expect( picture.textContent ).not.toContain( 'Thanks for watching' );
        const figures = [ ...document.querySelectorAll( '.estream-summary__figure' ) ].map( ( f ) => f.textContent );
        expect( figures ).toEqual( [ 'On air1:02:15', 'Watching at the peak1,240', 'Messages87', 'Reactions1,503' ] );

        expect( screen.getByRole( 'heading', { name: 'Go live again' } ) ).toBeTruthy();
        expect( screen.getByText( 'Turn on camera and microphone' ) ).toBeTruthy();
    } );

    it( 'tells a host in the studio what to do before the first stream, not that it starts soon', async () => {
        const { asClient } = fakeClient( { you: host } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        const picture = document.querySelector( '.estream-stage' )!;
        expect( picture.textContent ).toContain( 'Ready when you are' );
        expect( picture.textContent ).not.toContain( 'The stream starts soon' );
        expect( screen.getByRole( 'heading', { name: 'How do you want to go live?' } ) ).toBeTruthy();
    } );

    it( 'offers the screen alone too, shared before going live, where the browser can share one', async () => {
        const { client, asClient } = fakeClient( { you: host } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();

        // A way to go live of its own: the screen, then a preview of it, Go live, and the bar's button to stop it.
        await act( async () => { fireEvent.click( screen.getByText( 'Share your screen' ) ); } );
        expect( client.setScreenShare ).toHaveBeenCalledWith( true );
        expect( client.startPreview ).not.toHaveBeenCalled();
        expect( screen.getByText( 'Preview: only you can see this' ) ).toBeTruthy();
        expect( screen.getByText( 'Go live' ) ).toBeTruthy();
        // Named as a tip too, for a narrow bar that shows only its icon.
        const stop = screen.getByRole( 'button', { name: 'Stop sharing' } );
        expect( stop.getAttribute( 'data-estream-tip' ) ).toBe( 'Stop sharing' );
        await act( async () => { fireEvent.click( stop ); } );
        expect( client.setScreenShare ).toHaveBeenLastCalledWith( false );
        cleanup();

        // A phone's browser shares no screen: neither is offered.
        const phone = fakeClient( { you: host, canShareScreen: false } );
        render( <EasyStreamApp client={ phone.asClient } /> );
        await flush();
        expect( screen.getByText( 'Turn on camera and microphone' ) ).toBeTruthy();
        expect( screen.queryByText( 'Share your screen' ) ).toBeNull();
        await act( async () => { fireEvent.click( screen.getByText( 'Turn on camera and microphone' ) ); } );
        expect( screen.queryByText( 'Share screen' ) ).toBeNull();
    } );

    it( 'offers the quality to send before going live: Full HD where the cloud allows it, remembered here', async () => {
        // Where the cloud says 720p at most: HD alone, nothing said of plans.
        const regular = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        const first = render( <EasyStreamApp client={ regular.asClient } /> );
        await flush();
        // The best a viewer may get, each getting up to it.
        const group = screen.getByRole( 'radiogroup', { name: 'Best quality' } );
        const hd = screen.getByRole( 'radio', { name: /720p · HD/ } ) as HTMLInputElement;
        expect( hd.checked ).toBe( true );
        expect( screen.queryByRole( 'radio', { name: /1080p · Full HD/ } ) ).toBeNull();
        expect( group.textContent ).toContain( 'Up to about 4 Mbps of upload' );
        expect( group.textContent ).not.toContain( 'plan' );
        first.unmount();

        // With Full HD: it, until another is chosen, and what is chosen again on the next visit.
        const { client, update, asClient } = fakeClient( { you: host, topQuality: '1080p', devices: { camera: true, microphone: true } } );
        const second = render( <EasyStreamApp client={ asClient } /> );
        await flush();
        expect( client.setSendQuality ).toHaveBeenLastCalledWith( '1080p' );
        expect( ( screen.getByRole( 'radio', { name: /1080p · Full HD/ } ) as HTMLInputElement ).checked ).toBe( true );
        expect( screen.getByRole( 'radiogroup', { name: 'Best quality' } ).textContent ).toContain( 'Up to about 8 Mbps of upload' );
        await act( async () => { fireEvent.click( screen.getByRole( 'radio', { name: /720p · HD/ } ) ); } );
        expect( client.setSendQuality ).toHaveBeenLastCalledWith( '720p' );
        expect( ( screen.getByRole( 'radio', { name: /720p · HD/ } ) as HTMLInputElement ).checked ).toBe( true );

        // Live, the stream keeps it: nothing to choose.
        update( { stream: liveStream } );
        expect( screen.queryByRole( 'radiogroup', { name: 'Best quality' } ) ).toBeNull();
        second.unmount();

        const again = fakeClient( { you: host, topQuality: '1080p' } );
        render( <EasyStreamApp client={ again.asClient } /> );
        await flush();
        expect( again.client.setSendQuality ).toHaveBeenCalledWith( '720p' );
        expect( again.client.setSendQuality ).not.toHaveBeenCalledWith( '1080p' );
    } );

    it( 'doesn\'t go live with a bigger picture from OBS than a stream takes, and says what to set, naming no plan', async () => {
        const encoder = { url: 'https://cloud.example/easy-stream/v1/whip', key: 'esk_secret' };
        const picture = { attach: vi.fn(), detach: vi.fn() } as unknown as Tile['camera'];
        const tiles : Tile[] = [ { identity: 'ingest', name: 'Host', role: 'host', local: false, camera: picture, screen: null, audio: [], micMuted: false, speaking: false, encoder: true } ];

        for( const [ width, height, size ] of [ [ 1920, 1080, '1280×720' ], [ 1080, 1920, '720×1280' ] ] as const ){
            const { client, asClient } = fakeClient( { you: host, encoder, tiles } );
            client.encoderStats.mockResolvedValue( { width, height, fps: 30, kbps: 4500, limited: null } as any );
            const view = render( <EasyStreamApp client={ asClient } /> );
            await flush();

            expect( screen.getByRole( 'alert' ).textContent ).toBe( 'OBS sends ' + width + '×' + height + ', more than the 720p a stream takes. In OBS, set Settings → Video → Output (Scaled) Resolution to ' + size + '.' );
            expect( ( screen.getByText( 'Go live' ).closest( 'button' ) as HTMLButtonElement ).disabled ).toBe( true );
            view.unmount();
        }

        // 720p, or a plan with Full HD: on it goes.
        for( const [ state, width, height ] of [ [ {}, 1280, 720 ], [ { topQuality: '1080p' as const }, 1920, 1080 ] ] as const ){
            const { client, asClient } = fakeClient( { you: host, encoder, tiles, ...state } );
            client.encoderStats.mockResolvedValue( { width, height, fps: 30, kbps: 4500, limited: null } as any );
            const view = render( <EasyStreamApp client={ asClient } /> );
            await flush();
            expect( screen.queryByRole( 'alert' ) ).toBeNull();
            expect( ( screen.getByText( 'Go live' ).closest( 'button' ) as HTMLButtonElement ).disabled ).toBe( false );
            view.unmount();
        }
    } );

    it( 'streams from OBS: the steps, its address and key, what arrives, and Go live once its picture has come', async () => {
        window.localStorage.setItem( 'wordplus-stream:countdown', 'false' );
        // A plan with Full HD, which OBS sends.
        const { client, update, asClient } = fakeClient( { you: host, topQuality: '1080p' } );
        client.encoderStats.mockResolvedValue( { width: 1920, height: 1080, fps: 30, kbps: 4500, limited: null } as any );
        render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByText( 'Stream from OBS' ) ); } );
        expect( client.useEncoder ).toHaveBeenCalledWith();

        update( { encoder: { url: 'https://cloud.example/easy-stream/v1/whip', key: 'esk_secret' } } );
        expect( screen.getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'Waiting for OBS…' );
        expect( ( screen.getByLabelText( 'Server' ) as HTMLInputElement ).value ).toBe( 'https://cloud.example/easy-stream/v1/whip' );
        // The key is hidden until asked for.
        const key = screen.getByLabelText( 'Bearer token' ) as HTMLInputElement;
        expect( [ key.type, key.value ] ).toEqual( [ 'password', 'esk_secret' ] );
        fireEvent.click( screen.getByText( 'Show' ) );
        expect( key.type ).toBe( 'text' );
        // Not live without a picture, and no camera controls meanwhile.
        expect( ( screen.getByText( 'Go live' ).closest( 'button' ) as HTMLButtonElement ).disabled ).toBe( true );
        expect( screen.queryByText( 'Camera' ) ).toBeNull();

        const picture = { attach: vi.fn(), detach: vi.fn() } as unknown as Tile['camera'];
        update( { tiles: [ { identity: 'ingest', name: 'Host', role: 'host', local: false, camera: picture, screen: null, audio: [], micMuted: false, speaking: false, encoder: true } ] } );
        await flush();
        expect( screen.getAllByRole( 'status' ).map( ( s ) => s.textContent ) ).toContain( 'OBS is connected' );
        expect( screen.getByText( '1080p · 30 fps · 4.5 Mbps' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( screen.getByText( 'Go live' ) ); } );
        expect( client.goLive ).toHaveBeenCalled();
    } );

    it( 'makes a new OBS key only after asking, and goes back to the camera before going live', async () => {
        const { client, asClient } = fakeClient( { you: host, encoder: { url: 'https://cloud.example/easy-stream/v1/whip', key: 'esk_secret' } } );
        render( <EasyStreamApp client={ asClient } /> );

        await act( async () => { fireEvent.click( screen.getByText( 'New key' ) ); } );
        expect( screen.getByRole( 'dialog', { name: 'Make a new key?' } ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByText( 'Make a new key' ) ); } );
        expect( client.useEncoder ).toHaveBeenLastCalledWith( true );

        // Back to the camera's preview, on again, not to the choice of source.
        await act( async () => { fireEvent.click( screen.getByText( 'Use the camera instead' ) ); } );
        expect( client.leaveEncoder ).toHaveBeenCalled();
        expect( client.startPreview ).toHaveBeenCalled();
    } );

    it( 'shows who asks to come on stage and since when, while live only, invites them, and takes guests off', async () => {
        const asked = Date.now() - 2 * 60_000;
        const guest : Tile = { identity: 'u:5', name: 'Olena K', role: 'guest', local: false, camera: null, screen: null, audio: [], micMuted: true, speaking: false, encoder: false };
        const state : Partial<EasyStreamState> = { you: host, hands: [ { identity: 'u:7', name: 'Maya Lee', at: asked } ] };
        const { client, update, asClient } = fakeClient( state );
        render( <EasyStreamApp client={ asClient } /> );

        // A hand from before going live is left from another time.
        expect( screen.queryByText( 'Asking to join' ) ).toBeNull();

        update( { stream: liveStream, tiles: [ guest ] } );
        expect( screen.getByText( 'asked 2 minutes ago' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByText( 'Invite' ) ); } );
        expect( client.invite ).toHaveBeenCalledWith( 'u:7' );

        expect( screen.getByText( 'On stage' ) ).toBeTruthy();
        expect( document.querySelector( '.estream-queue__note' )?.textContent ).toBe( 'Microphone off' );
        await act( async () => { fireEvent.click( screen.getByText( 'Remove from stage' ) ); } );
        expect( client.unstage ).toHaveBeenCalledWith( 'u:5' );
    } );
} );
