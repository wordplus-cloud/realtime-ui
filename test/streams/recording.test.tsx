import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {EasyStreamApp, startMessage, type StreamRecording} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// A stream's recording, as its page hands it to the views: Record and the REC chip in the studio, the switch to record
// every time it goes live, REC and the notice over the picture for viewers as the site tells them, and the recording of
// a stream that ended played on its page.

beforeEach( () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
} );
afterEach( () => {
    cleanup();
    vi.useRealTimers();
} );

const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
const live = { id: 's', state: 'live' as const, started_at: Date.now() - 125_000, ended_at: null };
const ended = { id: 's', state: 'ended' as const, started_at: Date.now() - 600_000, ended_at: Date.now() - 60_000 };
const flush = () => act( async () => {} );

function recordingOf( patch : Partial<StreamRecording> = {} ) : StreamRecording {
    return {
        state: 'off',
        can: false,
        tell: 'indicator',
        watch: 'everyone',
        transcript: true,
        start: vi.fn( async () => {} ),
        stop: vi.fn( async () => {} ),
        ...patch
    };
}

const confirmYes = async () => {
    const dialog = document.querySelector( '.wplus-live-stream-dialog' )!;
    const buttons = dialog.querySelectorAll( 'button' );
    await act( async () => { fireEvent.click( buttons[ buttons.length - 1 ] ); } );
};

describe( 'recording a stream', () => {
    it( 'says what is recorded, who watches it, that viewers see nothing of it and what it costs before it starts', () => {
        const said = startMessage( recordingOf( { tell: 'notice' } ) );
        expect( said ).toContain( 'Viewers can watch the recording on the page of the stream after it ends.' );
        expect( said ).toContain( 'A transcript is made too.' );
        expect( said ).toContain( 'Viewers are not in the recording and see no REC.' );
        expect( said ).toContain( 'Recording takes 1 credit a minute from the credits of this site.' );

        const quiet = startMessage( recordingOf( { tell: 'moderators', watch: 'admins', transcript: false } ) );
        expect( quiet ).toContain( 'Only site administrators can watch it, in the Recordings list.' );
        expect( quiet ).toContain( 'Viewers are not in the recording and see no REC.' );
        expect( quiet ).not.toContain( 'transcript' );
        // No apostrophes and no semicolons, as every word a person reads.
        expect( said + quiet ).not.toMatch( /[;'’]/ );
    } );

    it( 'starts from Record in the studio while live, asking first, and stops from the REC chip', async () => {
        const recording = recordingOf( { can: true } );
        const { asClient } = fakeClient( { you: host, stream: live, devices: { camera: true, microphone: true } } );
        const { rerender } = render( <EasyStreamApp client={ asClient } recording={ recording } /> );
        await flush();

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Record' } ) ); } );
        expect( screen.getByText( 'Start recording?' ) ).toBeTruthy();
        expect( document.querySelector( '.wplus-live-stream-dialog' )?.textContent ).toContain( '1 credit a minute' );
        await confirmYes();
        expect( recording.start ).toHaveBeenCalledTimes( 1 );

        const on = { ...recording, state: 'on' as const, since: Math.floor( Date.now() / 1000 ) - 65 };
        rerender( <EasyStreamApp client={ asClient } recording={ on } /> );
        await flush();
        const chip = document.querySelector<HTMLElement>( '.wplus-live-stream-chip--rec' )!;
        expect( chip.textContent ).toContain( 'REC' );
        // how long it has recorded: 1:05, or a second or two more on a busy machine
        expect( chip.textContent ).toMatch( /1:0[5-7]/ );
        // The host sees REC over the picture too.
        expect( document.querySelector( '.wplus-live-stream-badge--rec' ) ).toBeTruthy();

        await act( async () => { fireEvent.click( chip ); } );
        expect( screen.getByText( 'Stop recording?' ) ).toBeTruthy();
        await confirmYes();
        expect( on.stop ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'says why a start failed', async () => {
        const recording = recordingOf( { can: true, start: vi.fn( async () => { throw new Error( 'Recording is not available right now.' ); } ) } );
        const { asClient } = fakeClient( { you: host, stream: live, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } recording={ recording } /> );
        await flush();

        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Record' } ) ); } );
        await confirmYes();
        expect( screen.getByRole( 'alert' ).textContent ).toBe( 'Recording is not available right now.' );
    } );

    it( 'offers no Record to those who may not, nor before going live', async () => {
        const { asClient, update } = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } recording={ recordingOf( { can: false } ) } /> );
        await flush();
        expect( screen.queryByRole( 'button', { name: 'Record' } ) ).toBeNull();
        update( { stream: live } );
        expect( screen.queryByRole( 'button', { name: 'Record' } ) ).toBeNull();
    } );

    it( 'keeps the switch to record every time it goes live, and takes it back where it was not saved', async () => {
        let fail = false;
        const setAuto = vi.fn( async () => { if( fail ) throw new Error( 'no' ); } );
        const { asClient } = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } recording={ recordingOf( { can: true, auto: false, setAuto } ) } /> );
        await flush();

        const box = screen.getByRole( 'switch', { name: 'Record every time this stream goes live' } ) as HTMLInputElement;
        expect( box.checked ).toBe( false );
        expect( box.closest( '.wplus-live-stream-setup__row' )?.textContent ).toContain( '1 credit a minute' );
        await act( async () => { fireEvent.click( box ); } );
        expect( setAuto ).toHaveBeenLastCalledWith( true );
        expect( box.checked ).toBe( true );

        fail = true;
        await act( async () => { fireEvent.click( box ); } );
        expect( setAuto ).toHaveBeenLastCalledWith( false );
        expect( box.checked ).toBe( true );
        expect( screen.getByText( 'The setting was not saved. Try again.' ) ).toBeTruthy();
    } );

    it( 'starts by itself as this page takes a stream live that records every time, once each time on air', async () => {
        const recording = recordingOf( { can: true, auto: true } );
        const { asClient, update } = fakeClient( { you: host, devices: { camera: true, microphone: true } } );
        const { rerender } = render( <EasyStreamApp client={ asClient } recording={ recording } /> );
        await flush();
        expect( recording.start ).not.toHaveBeenCalled();

        update( { stream: live } );
        await flush();
        expect( recording.start ).toHaveBeenCalledTimes( 1 );

        // Stopped by hand while still live: not started again.
        rerender( <EasyStreamApp client={ asClient } recording={ { ...recording, state: 'on' } } /> );
        rerender( <EasyStreamApp client={ asClient } recording={ recording } /> );
        await flush();
        expect( recording.start ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'does not start by itself in a window that does not send the stream', async () => {
        const recording = recordingOf( { can: true, auto: true } );
        const { asClient } = fakeClient( { you: host, stream: live, elsewhere: true } );
        render( <EasyStreamApp client={ asClient } recording={ recording } /> );
        await flush();
        expect( recording.start ).not.toHaveBeenCalled();
    } );

    it( 'shows viewers no REC and no notice, whatever the site tells people in calls: a stream records its stage', async () => {
        // Asked on 2026-11-02: "REC pill should not be shown if frontend for users"
        const { asClient } = fakeClient( { stream: live } );
        const { rerender } = render( <EasyStreamApp client={ asClient } recording={ recordingOf( { state: 'on' } ) } /> );
        await flush();
        expect( document.querySelector( '.wplus-live-stream-badge--rec' ) ).toBeNull();

        for( const tell of [ 'notice', 'ask', 'muted' ] as const ){
            rerender( <EasyStreamApp client={ asClient } recording={ recordingOf( { state: 'on', id: 9, tell } ) } /> );
            expect( document.querySelector( '.wplus-live-stream-badge--rec' ), tell ).toBeNull();
            expect( screen.queryByText( /being recorded/ ), tell ).toBeNull();
        }
    } );

    it( 'shows its hosts REC over the picture while it records, and nothing once it stopped', async () => {
        const { asClient } = fakeClient( { you: host, stream: live, devices: { camera: true, microphone: true } } );
        const { rerender } = render( <EasyStreamApp client={ asClient } recording={ recordingOf( { state: 'on', can: true, tell: 'moderators' } ) } /> );
        await flush();
        expect( document.querySelector( '.wplus-live-stream-badge--rec' )?.textContent ).toBe( 'REC' );

        rerender( <EasyStreamApp client={ asClient } recording={ recordingOf( { state: 'off', can: true } ) } /> );
        expect( document.querySelector( '.wplus-live-stream-badge--rec' ) ).toBeNull();
    } );

    it( 'plays the recording of a stream that ended on its page', async () => {
        const { asClient } = fakeClient( { stream: ended } );
        const prepare = vi.fn();
        render( <EasyStreamApp client={ asClient } replay={ { src: 'https://site.test/wp-json/wordplus/v1/recordings/4', prepare } } /> );
        await flush();

        expect( screen.getByText( 'This stream has ended' ) ).toBeTruthy();
        expect( prepare ).not.toHaveBeenCalled();
        await act( async () => { fireEvent.click( screen.getByRole( 'button', { name: 'Watch the recording' } ) ); } );
        // The page fetches the player as it is opened.
        expect( prepare ).toHaveBeenCalledTimes( 1 );
        const player = document.querySelector( '.wplus-live-stream-dialog recording-player' )!;
        expect( player.getAttribute( 'src' ) ).toBe( 'https://site.test/wp-json/wordplus/v1/recordings/4' );
        expect( player.hasAttribute( 'autoplay' ) ).toBe( true );
        expect( document.querySelector( '.wplus-live-stream-dialog__box--wide' ) ).toBeTruthy();

        fireEvent.click( screen.getByRole( 'button', { name: 'Close' } ) );
        expect( document.querySelector( 'recording-player' ) ).toBeNull();
    } );

    it( 'offers nothing to watch without a recording', async () => {
        const { asClient } = fakeClient( { stream: ended } );
        render( <EasyStreamApp client={ asClient } /> );
        await flush();
        expect( screen.queryByRole( 'button', { name: 'Watch the recording' } ) ).toBeNull();
    } );
} );
