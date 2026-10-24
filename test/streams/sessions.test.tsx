import {afterEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, render, screen} from "@testing-library/react";
import {EasyStreamApp, scheduleOf, type StreamSession} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// A stream's schedule: its sessions, each a planned start with its own title, and which one is on air or next.

afterEach( () => {
    cleanup();
    vi.useRealTimers();
} );

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const now = Date.UTC( 2026, 9, 21, 12, 15 );
const week : StreamSession[] = [
    { at: now + 24 * HOUR, title: 'No. 1124' },
    { at: now, title: 'No. 1123' },
    { at: now + 48 * HOUR }
];

describe( 'a stream\'s sessions', () => {
    it( 'count down to the soonest not yet past, a late host\'s for 12 hours past its start', () => {
        expect( scheduleOf( week, { state: 'idle', started_at: null, ended_at: null }, now - HOUR ) ).toEqual( { current: null, next: week[1], counting: true } );
        expect( scheduleOf( week, null, now + 11 * HOUR ).next ).toBe( week[1] );
        expect( scheduleOf( week, null, now + 12 * HOUR ).next ).toBe( week[0] );
        expect( scheduleOf( [], null, now ) ).toEqual( { current: null, next: null, counting: false } );
    } );

    it( 'name the time on air after the session it went live for, up to an hour early or 12 hours late, the nearest', () => {
        const at = ( started : number ) => scheduleOf( week, { state: 'live', started_at: started, ended_at: null }, started + MINUTE );
        expect( at( now - 50 * MINUTE ) ).toEqual( { current: week[1], next: week[0], counting: false } );
        expect( at( now + 3 * HOUR ).current ).toBe( week[1] );
        // Unplanned: earlier than an hour before any.
        expect( at( now - 2 * HOUR ).current ).toBeNull();
        expect( at( now + 23.5 * HOUR ).current ).toBe( week[0] );
    } );

    it( 'thank the viewers of one that ended for 15 minutes, then count down to the next, and end for good without one', () => {
        const ended = { state: 'ended' as const, started_at: now - 5 * MINUTE, ended_at: now + HOUR };
        expect( scheduleOf( week, ended, now + HOUR + 14 * MINUTE ) ).toEqual( { current: week[1], next: week[0], counting: false } );
        expect( scheduleOf( week, ended, now + HOUR + 15 * MINUTE ).counting ).toBe( true );
        expect( scheduleOf( [ week[1]! ], ended, now + 2 * HOUR ) ).toEqual( { current: week[1], next: null, counting: false } );
        // Gone live early for a session and ended before its start: the next is the one after it.
        expect( scheduleOf( week, { state: 'ended', started_at: now - 30 * MINUTE, ended_at: now - 20 * MINUTE }, now - 19 * MINUTE ) ).toEqual( { current: week[1], next: week[0], counting: false } );
        // An end before the next session's start, a host trying it out in the morning: counted down to after the thanks.
        expect( scheduleOf( [ { at: now + 6 * HOUR } ], { state: 'ended', started_at: now - MINUTE, ended_at: now }, now + 20 * MINUTE ) ).toEqual( { current: null, next: { at: now + 6 * HOUR }, counting: true } );
    } );
} );

describe( 'what viewers see of a schedule', () => {
    it( 'counts down to the next session with its own title, else the stream\'s', () => {
        vi.useFakeTimers( { now: now - 2 * HOUR } );
        const { asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } title="Zoom Simulcast" sessions={ week } /> );

        expect( screen.getByRole( 'timer' ).textContent ).toBe( '02hours00minutes00seconds' );
        expect( screen.getByText( 'No. 1123' ) ).toBeTruthy();
        expect( screen.queryByText( 'Zoom Simulcast' ) ).toBeNull();
    } );

    it( 'names a stream on air after its session, and after the end thanks its viewers with the next session, then counts down to it', () => {
        vi.useFakeTimers( { now: now + HOUR } );
        const { asClient, update } = fakeClient( { stream: { id: 's', state: 'live', started_at: now - 5 * MINUTE, ended_at: null }, media: 'live' } );
        render( <EasyStreamApp client={ asClient } title="Zoom Simulcast" sessions={ week } /> );
        expect( screen.getByText( 'No. 1123' ) ).toBeTruthy();

        update( { stream: { id: 's', state: 'ended', started_at: now - 5 * MINUTE, ended_at: now + HOUR }, media: 'off' } );
        expect( screen.getByText( 'This stream has ended' ) ).toBeTruthy();
        expect( screen.getByText( /^Next: No\. 1124, / ) ).toBeTruthy();
        expect( screen.getByText( 'No. 1123' ) ).toBeTruthy();
        expect( screen.queryByRole( 'timer' ) ).toBeNull();

        // A quarter of an hour on: the countdown to the next, named after it.
        act( () => { vi.advanceTimersByTime( 15 * MINUTE ); } );
        expect( screen.queryByText( 'This stream has ended' ) ).toBeNull();
        expect( screen.getByRole( 'timer' ) ).toBeTruthy();
        expect( screen.getByText( 'No. 1124' ) ).toBeTruthy();
        expect( screen.getByText( 'Add to calendar' ) ).toBeTruthy();
    } );

    it( 'says the next session without a title of its own by its time alone, and a stream with none planned has ended for good', () => {
        vi.useFakeTimers( { now: now + 25 * HOUR } );
        const { asClient } = fakeClient( { stream: { id: 's', state: 'ended', started_at: now + 24 * HOUR, ended_at: now + 25 * HOUR } } );
        const { rerender } = render( <EasyStreamApp client={ asClient } title="Zoom Simulcast" sessions={ week } /> );
        expect( screen.getByText( /^Next: (?!No\.)/ ) ).toBeTruthy();

        rerender( <EasyStreamApp client={ asClient } title="Zoom Simulcast" sessions={ [ week[0]! ] } /> );
        act( () => { vi.advanceTimersByTime( 30 * MINUTE ); } );
        expect( screen.getByText( 'This stream has ended' ) ).toBeTruthy();
        expect( screen.queryByText( /^Next: / ) ).toBeNull();
    } );

    it( 'no longer hides a start planned after an end: a host trying it out in the morning', () => {
        vi.useFakeTimers( { now: now + 20 * MINUTE } );
        const { asClient } = fakeClient( { stream: { id: 's', state: 'ended', started_at: now - MINUTE, ended_at: now } } );
        render( <EasyStreamApp client={ asClient } title="Launch" scheduled={ now + 6 * HOUR } /> );

        expect( screen.queryByText( 'This stream has ended' ) ).toBeNull();
        expect( screen.getByText( /^Starts / ) ).toBeTruthy();
    } );
} );
