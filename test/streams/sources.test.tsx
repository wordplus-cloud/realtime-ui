import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// A stream keeps the source it goes live with (asked on 2026-11-02: "When I press Go Live from browser the stream from OBS
// button must be hidden, I just clicked it during countdown and the stream was broken"): from Go live's press, through its
// 3, 2, 1 and while going live, and once live from the browser, Stream from OBS is not offered; from OBS, neither the
// camera's way back nor the camera itself. The engine refuses the same (realtime-client's streams-engine tests).

beforeEach( () => window.localStorage.clear() );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
} );

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const liveStream = { id: 's', state: 'live' as const, started_at: Date.now() - 60_000, ended_at: null };
const encoder = { url: 'https://cloud.example/live-stream/v1/whip', key: 'esk_one' };
const track = ( id : string ) => ( { attach: vi.fn(), detach: vi.fn(), sid: 'TR_' + id, mediaStreamTrack: { id } } ) as unknown as NonNullable<Tile['camera']>;
const obsTile : Tile = { identity: 'ingest', name: 'OBS', role: 'host', local: false, camera: track( 'obs' ), screen: null, audio: [], micMuted: false, speaking: false, encoder: true };
const flush = () => act( async () => {} );
const obsOffered = () => screen.queryByText( 'Stream from OBS' ) !== null;

function studio( state : Partial<EasyStreamState> ){
    const fake = fakeClient( { you: host, ...state } );
    render( <EasyStreamApp client={ fake.asClient } /> );
    return fake;
}

describe( 'the source a stream goes live with', () => {
    it( 'offers no Stream from OBS from Go live\'s press, through its 3, 2, 1 and while going live, and none once live from the browser', async () => {
        const { client, update } = studio( { devices: { camera: true, microphone: true } } );
        await flush();
        expect( obsOffered() ).toBe( true );

        // Going live takes a while (the room joined, the camera published): held here.
        let landed! : ( answer : { ok : true } ) => void;
        client.goLive.mockImplementation( () => new Promise( ( resolve ) => { landed = resolve; } ) );

        vi.useFakeTimers();
        fireEvent.click( screen.getByText( 'Go live' ) );
        expect( document.querySelector( '.wplus-live-stream-going__number' )?.textContent ).toBe( '3' );
        expect( obsOffered() ).toBe( false );
        act( () => { vi.advanceTimersByTime( 3000 ); } );
        expect( client.goLive ).toHaveBeenCalledTimes( 1 );
        // Going live under way, the 3, 2, 1 over.
        expect( document.querySelector( '.wplus-live-stream-going' ) ).toBeNull();
        expect( obsOffered() ).toBe( false );

        await act( async () => {
            update( { stream: liveStream, sentHere: true } );
            landed( { ok: true } );
        } );
        // Live from the browser: no Stream from OBS, nor the More menu that held it.
        expect( obsOffered() ).toBe( false );
        expect( screen.queryByLabelText( 'More' ) ).toBeNull();
        expect( screen.getByText( 'End stream' ) ).toBeTruthy();
        expect( client.useEncoder ).not.toHaveBeenCalled();
    } );

    it( 'offers it again once the countdown is cancelled, or going live was refused', async () => {
        const { client } = studio( { devices: { camera: true, microphone: true } } );
        await flush();

        vi.useFakeTimers();
        fireEvent.click( screen.getByText( 'Go live' ) );
        expect( obsOffered() ).toBe( false );
        fireEvent.click( screen.getByText( 'Cancel' ) );
        expect( obsOffered() ).toBe( true );

        client.goLive.mockImplementation( async () => ( { ok: false, error: 'publish_failed' } ) as any );
        fireEvent.click( screen.getByText( 'Go live' ) );
        await act( async () => { vi.advanceTimersByTime( 3000 ); } );
        await act( async () => {} );
        expect( screen.getByText( 'Going live failed. Check your connection and try again' ) ).toBeTruthy();
        expect( obsOffered() ).toBe( true );
    } );

    it( 'offers neither the camera\'s way back nor a new key while going live from OBS, and the way back again after', async () => {
        const { client } = studio( { encoder, tiles: [ obsTile ] } );
        await flush();
        expect( screen.getByText( 'Use the camera instead' ) ).toBeTruthy();
        expect( screen.getByText( 'New key' ) ).toBeTruthy();

        let landed! : ( answer : { ok : false, error : string } ) => void;
        client.goLive.mockImplementation( () => new Promise( ( resolve ) => { landed = resolve; } ) );
        vi.useFakeTimers();
        fireEvent.click( screen.getByText( 'Go live' ) );
        expect( screen.queryByText( 'Use the camera instead' ) ).toBeNull();
        expect( screen.queryByText( 'New key' ) ).toBeNull();
        act( () => { vi.advanceTimersByTime( 3000 ); } );
        expect( screen.queryByText( 'Use the camera instead' ) ).toBeNull();

        await act( async () => { landed( { ok: false, error: 'no_encoder' } ); } );
        expect( screen.getByText( 'Use the camera instead' ) ).toBeTruthy();
        expect( screen.getByText( 'New key' ) ).toBeTruthy();
        expect( client.leaveEncoder ).not.toHaveBeenCalled();
    } );

    it( 'offers no camera, screen or way back once live from OBS, and still a new key', async () => {
        studio( { encoder, tiles: [ obsTile ], stream: liveStream } );
        await flush();
        expect( screen.getByText( 'End stream' ) ).toBeTruthy();
        expect( screen.queryByRole( 'button', { name: 'Camera' } ) ).toBeNull();
        expect( screen.queryByRole( 'button', { name: 'Share screen' } ) ).toBeNull();
        expect( screen.queryByText( 'Use the camera instead' ) ).toBeNull();
        expect( screen.queryByText( 'Go live' ) ).toBeNull();
        expect( screen.getByText( 'New key' ) ).toBeTruthy();
    } );

    it( 'offers no camera or screen into a stream another window of the host takes live from OBS', async () => {
        // This window chose nothing (no `encoder` of its own), and OBS's picture is in the room.
        studio( { tiles: [ obsTile ], stream: liveStream, devices: { camera: true, microphone: true } } );
        await flush();
        expect( screen.getByText( 'End stream' ) ).toBeTruthy();
        expect( screen.queryByRole( 'button', { name: 'Camera' } ) ).toBeNull();
        expect( screen.queryByRole( 'button', { name: 'Microphone' } ) ).toBeNull();
        expect( screen.queryByRole( 'button', { name: 'Share screen' } ) ).toBeNull();
        expect( obsOffered() ).toBe( false );
    } );
} );
