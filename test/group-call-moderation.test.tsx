import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureUi } from '../src/index.ts';
import { CallsController, refusalNotice } from '../src/sdk/controller.ts';
import CallsApp from '../src/sdk/calls-app.tsx';
import { useGroupCall } from '../src/sdk/use-group-call.ts';
import type { SdkCallAct, SdkCalls, SdkGroupCall, SdkPerson, SdkRoomRules } from '../src/sdk/types.ts';
import { Emitter, devices, remote } from './fake-sdk-call.ts';

// Group call moderation for an app's call screen, exactly as Better Messages moderates its calls: each control drawn only where the call offers its act (the client's `acts`), the
// room's rules, hands and held microphones as the room says them, so two hosts follow each other, the tiles of someone
// away or whose media stopped, the refusals of a locked call and a ban, and the asks on the asked person's screen.

const ALL: SdkCallAct[] = [ 'remove', 'ban', 'listen', 'speak', 'mute', 'hold_mic', 'release_mic', 'rules', 'hand', 'ask', 'end', 'spotlight' ];
const BASE: SdkCallAct[] = [ 'remove', 'listen', 'speak', 'mute', 'spotlight' ];
const OPEN: SdkRoomRules = { mode: 'participatory', locked: false, muted: false };

const ben = ( over: Partial<SdkPerson> = {} ): SdkPerson => ( { identity: 'user_42', user: 42, info: { name: 'Ben' }, camera: remote(), microphone: remote(), screen: null, screenAudio: null, speaking: false, publish: true, ...over } );
const cara = ( over: Partial<SdkPerson> = {} ): SdkPerson => ( { identity: 'user_43', user: 43, info: { name: 'Cara' }, camera: null, microphone: null, screen: null, screenAudio: null, speaking: false, publish: true, ...over } );

/** A group call as WP2's client makes one (realtime-client launch/moderation), by shape, with what it fires by hand. */
function room( over: Record<string, unknown> = {} ) {
    let people: SdkPerson[] = [ ben(), cara() ];
    const group = Object.assign( new Emitter(), {
        state: 'connected',
        can: { publish: true, subscribe: true, admin: true },
        acts: ALL,
        rules: { ...OPEN },
        hands: [] as Array<number | string>,
        handRaised: false,
        spotlight: [] as string[],
        people: () => people,
        setPeople: ( next: SdkPerson[] ) => { people = next; },
        setTrack: vi.fn( async () => {} ),
        leave: vi.fn( async () => {} ),
        moderate: vi.fn( async () => true ),
        setRules: vi.fn( async ( change: Partial<SdkRoomRules> ) => ( { ...group.rules, ...change } ) ),
        ban: vi.fn( async () => true ),
        end: vi.fn( async () => true ),
        raiseHand: vi.fn( async () => true ),
        lowerHand: vi.fn( async () => true ),
        askToTurnOn: vi.fn( async ( _user: unknown, devices: string[] ) => 'ask-' + devices.join( '-' ) ),
        answerAsk: vi.fn( async () => {} ),
        ...over,
    } );
    return group;
}
type Room = ReturnType<typeof room>;

function fakeCalls() {
    return Object.assign( new Emitter(), { start: vi.fn(), group: vi.fn(), people: vi.fn( async () => [] ) } ) as unknown as SdkCalls & { group: ReturnType<typeof vi.fn> };
}

async function screen( group: Room, type: 'audio' | 'video' = 'audio' ) {
    const calls = fakeCalls();
    calls.group.mockResolvedValue( group );
    const controller = new CallsController( calls );
    const { container } = render( <CallsApp controller={ controller } /> );
    await act( async () => controller.join( 'meeting:daily', type, 'Daily' ) );
    return { container, controller };
}

/** The hook alone, its context as the screens read it. */
async function probe( group: Room, close: ( notice: string | null ) => void = () => {} ) {
    const seen: { context: any } = { context: null };
    const Probe = () => {
        seen.context = useGroupCall( group as unknown as SdkGroupCall, 'video', close );
        return null;
    };
    render( <Probe /> );
    await act( async () => {} );
    return seen;
}

const roomRows = async ( container: HTMLElement ) => {
    const button = container.querySelector( '.wplus-host-controls' );
    if ( ! button ) return null;
    if ( button.getAttribute( 'aria-expanded' ) !== 'true' ) await act( async () => fireEvent.click( button ) );
    return [ ...container.querySelectorAll( '.wplus-call-moderation-room .wplus-call-moderation-row' ) ].map( ( row ) => row.getAttribute( 'aria-label' ) );
};
const openPerson = async ( container: HTMLElement, key: string ) => {
    const button = container.querySelector( `[data-key="${ key }"] .wplus-manage-participant` )!;
    if ( button.getAttribute( 'aria-expanded' ) !== 'true' ) await act( async () => fireEvent.click( button ) );
};
const personRows = async ( container: HTMLElement, key: string ) => {
    await openPerson( container, key );
    return [ ...container.querySelectorAll( '.wplus-call-moderation-person .wplus-call-moderation-row' ) ].map( ( row ) => row.getAttribute( 'aria-label' ) );
};
const press = async ( container: HTMLElement, selector: string ) => act( async () => fireEvent.click( container.querySelector( selector )! ) );

beforeEach( () => {
    configureUi( { translate: ( text ) => text, currentUserId: () => 34 } );
    devices();
} );

afterEach( cleanup );

describe( 'Host Controls, drawn from what the call offers', () => {
    it( 'shows Mute Everyone, Lock Room and Broadcast Mode, and End for Everyone, where the call offers them, and no recording', async () => {
        const { container } = await screen( room() );
        expect( await roomRows( container ) ).toEqual( [ 'Mute Everyone', 'Lock Room', 'Broadcast Mode', 'Sound for Raised Hands', 'Join Alerts', 'End for Everyone' ] );
        expect( container.querySelector( '.wplus-room-record' ) ).toBeNull();
    } );

    it( 'shows none of the room\'s rules where the call offers only the acts of before', async () => {
        const { container } = await screen( room( { acts: BASE } ) );
        expect( await roomRows( container ) ).toEqual( [ 'Join Alerts', 'End for Everyone' ] );
    } );

    it( 'has no Host Controls at all in a room that offers no host acts', async () => {
        const { container } = await screen( room( { acts: [] } ) );
        expect( await roomRows( container ) ).toBeNull();
        expect( container.querySelectorAll( '.wplus-admin-controls' ) ).toHaveLength( 0 );
    } );

    it( 'offers a person\'s held mute, Ban, and spotlight where offered, and none of them where not', async () => {
        const all = await screen( room() );
        const rows = await personRows( all.container, 'user_42' );
        expect( rows ).toEqual( expect.arrayContaining( [ 'Mute Microphone', 'Demote to Viewer', 'Remove from Call', 'Remove and Ban from Calls…' ] ) );
        expect( ( await probe( room() ) ).context.moderation ).toEqual( expect.arrayContaining( [ 'spotlight_participant', 'unspotlight_participant', 'unmute_mic', 'end_call' ] ) );
        cleanup();

        const base = await screen( room( { acts: [ 'remove', 'listen', 'speak' ] } ) );
        const fewer = await personRows( base.container, 'user_42' );
        expect( fewer ).toEqual( [ 'Demote to Viewer', 'Remove from Call' ] );
    } );
} );

describe( 'the room\'s rules come from the room', () => {
    it( 'asks the server on a press, and the switch moves only when the room says it', async () => {
        const group = room();
        const { container } = await screen( group );
        await roomRows( container );
        await press( container, '.wplus-room-lock' );
        expect( group.setRules ).toHaveBeenCalledWith( { locked: true } );
        expect( container.querySelector( '.wplus-room-lock' )?.getAttribute( 'aria-checked' ) ).toBe( 'false' );

        await act( async () => {
            group.rules = { ...OPEN, locked: true };
            group.fire( 'rules', group.rules );
        } );
        expect( container.querySelector( '.wplus-room-lock' )?.getAttribute( 'aria-checked' ) ).toBe( 'true' );

        await press( container, '.wplus-room-mute' );
        expect( group.setRules ).toHaveBeenLastCalledWith( { muted: true } );
        await press( container, '.wplus-room-broadcast' );
        expect( group.setRules ).toHaveBeenLastCalledWith( { mode: 'broadcast' } );
        expect( group.moderate ).not.toHaveBeenCalled();
    } );

    it( 'follows another host: each rule they set shows here, and a press here turns it off rather than sending it again', async () => {
        const group = room();
        const { container } = await screen( group );
        await act( async () => {
            group.rules = { mode: 'broadcast', locked: true, muted: true };
            group.fire( 'rules', group.rules );
        } );
        await roomRows( container );
        for ( const row of [ '.wplus-room-lock', '.wplus-room-mute', '.wplus-room-broadcast' ] ) {
            expect( container.querySelector( row )?.getAttribute( 'aria-checked' ) ).toBe( 'true' );
        }
        // Lit in the dock too, as a rule holds.
        expect( container.querySelector( '.wplus-host-controls' )?.getAttribute( 'data-ruled' ) ).toBe( '1' );

        await press( container, '.wplus-room-lock' );
        expect( group.setRules ).toHaveBeenLastCalledWith( { locked: false } );
        await press( container, '.wplus-room-mute' );
        expect( group.setRules ).toHaveBeenLastCalledWith( { muted: false } );
        await press( container, '.wplus-room-broadcast' );
        expect( group.setRules ).toHaveBeenLastCalledWith( { mode: 'participatory' } );
    } );

    it( 'reads the rules a host finds as it joins', async () => {
        const seen = await probe( room( { rules: { mode: 'broadcast', locked: true, muted: false } } ) );
        expect( seen.context ).toMatchObject( { callMode: 'broadcast', roomLocked: true, roomMuted: false } );
    } );

    it( 'promotes and demotes in broadcast mode through speak and listen', async () => {
        const group = room( { rules: { mode: 'broadcast', locked: false, muted: false } } );
        const seen = await probe( group );
        await act( async () => seen.context.promoteParticipant( 'user_43' ) );
        await act( async () => seen.context.demoteParticipant( 'user_42' ) );
        expect( group.moderate.mock.calls ).toEqual( [ [ 'speak', 43 ], [ 'listen', 42 ] ] );
    } );
} );

describe( 'held microphones', () => {
    it( 'holds and lets go of a microphone where the call holds one, and marks the tile', async () => {
        const group = room();
        const { container } = await screen( group );
        await openPerson( container, 'user_42' );
        await press( container, '.wplus-call-moderation-person .wplus-mute-mic' );
        expect( group.moderate ).toHaveBeenLastCalledWith( 'hold_mic', 42 );

        await act( async () => {
            group.setPeople( [ ben( { microphone: null, micHeld: true } ), cara() ] );
            group.fire( 'person', group.people()[ 0 ] );
        } );
        expect( container.querySelectorAll( '[data-key="user_42"] .wplus-mic-locked-chip' ).length ).toBeGreaterThan( 0 );
        await openPerson( container, 'user_42' );
        await press( container, '.wplus-call-moderation-person .wplus-allow-unmute' );
        expect( group.moderate ).toHaveBeenLastCalledWith( 'release_mic', 42 );
        // Cara's microphone is simply off: not said to be a moderator's.
        expect( container.querySelectorAll( '[data-key="user_43"] .wplus-mic-locked-chip' ) ).toHaveLength( 0 );
    } );

    it( 'mutes once where the call offers no hold', async () => {
        const group = room( { acts: BASE } );
        const seen = await probe( group );
        await seen.context.moderate( { act: 'mute_mic', identity: 'user_42' } );
        expect( group.moderate ).toHaveBeenLastCalledWith( 'mute', 42 );
        await expect( seen.context.moderate( { act: 'unmute_mic', identity: 'user_42' } ) ).rejects.toMatchObject( { code: 'not_offered' } );
    } );

    it( 'locks this page\'s own microphone while a host holds it, and lets it go', async () => {
        const group = room( { can: { publish: true, subscribe: true, micHeld: true } } );
        const { container } = await screen( group );
        expect( container.querySelector( '.wplus-mic-locked' ) ).not.toBeNull();
        await act( async () => group.fire( 'permissions', { publish: true, subscribe: true } ) );
        expect( container.querySelector( '.wplus-mic-locked' ) ).toBeNull();
    } );
} );

describe( 'tiles of someone away or whose media stopped', () => {
    it( 'keeps the tile of someone away, saying Reconnecting..., and drops it when they go', async () => {
        const group = room();
        const { container } = await screen( group );
        await act( async () => {
            group.setPeople( [ ben( { camera: null, microphone: null, reconnecting: true } ), cara() ] );
            group.fire( 'person_away', group.people()[ 0 ] );
        } );
        expect( container.querySelector( '[data-key="user_42"] .wplus-call-reconnecting' )?.textContent ).toBe( 'Reconnecting...' );

        await act( async () => {
            group.setPeople( [ cara() ] );
            group.fire( 'person_left', ben() );
        } );
        expect( container.querySelector( '[data-key="user_42"]' ) ).toBeNull();
    } );

    it( 'marks a stalled tile: Reconnecting... when nothing arrives, video alone otherwise', async () => {
        const group = room();
        const seen = await probe( group );
        await act( async () => {
            group.setPeople( [ ben( { stalled: 'video' } ), cara() ] );
            group.fire( 'stalled', group.people()[ 0 ] );
        } );
        expect( seen.context.participants.get( 'user_42' ) ).toMatchObject( { stalled: 'video', reconnecting: false } );
        cleanup();

        const shown = room();
        const { container } = await screen( shown );
        await act( async () => {
            shown.setPeople( [ ben( { stalled: 'all' } ), cara() ] );
            shown.fire( 'stalled', shown.people()[ 0 ] );
        } );
        expect( container.querySelector( '[data-key="user_42"] .wplus-call-reconnecting' )?.textContent ).toBe( 'Reconnecting...' );
    } );
} );

describe( 'a join refused', () => {
    it( 'says a locked call is locked, and a ban until when, as Better Messages\' banner does', async () => {
        const calls = fakeCalls();
        calls.group.mockRejectedValueOnce( Object.assign( new Error( 'locked' ), { code: 'locked' } ) );
        const controller = new CallsController( calls );
        const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} );
        await controller.join( 'meeting:daily', 'video', 'Daily' );
        expect( controller.snapshot().notice ).toBe( 'This call is locked' );

        const until = Date.UTC( 2026, 10, 18, 9, 30 );
        calls.group.mockRejectedValueOnce( Object.assign( new Error( 'banned' ), { code: 'banned', until } ) );
        await controller.join( 'meeting:daily', 'video', 'Daily' );
        expect( controller.snapshot().notice ).toMatch( /^A moderator removed you from the calls of this conversation until .*2026/ );
        warn.mockRestore();

        expect( refusalNotice( { code: 'banned' } ) ).toBe( 'A moderator removed you from this call until it ends' );
        expect( refusalNotice( { code: 'forbidden' } ) ).toBe( 'You cannot make this call' );
    } );
} );

describe( 'raised hands', () => {
    it( 'shows a host the hands raised before they joined, lowers one and all, as the room says them', async () => {
        const group = room( { hands: [ 43 ] } );
        const { container } = await screen( group );
        expect( container.querySelector( '[data-key="user_43"] .wplus-hand-raised' ) ).not.toBeNull();
        expect( container.querySelector( '[data-key="user_42"] .wplus-hand-raised' ) ).toBeNull();

        await openPerson( container, 'user_43' );
        await press( container, '.wplus-call-moderation-person .wplus-lower-participant-hand' );
        expect( group.lowerHand ).toHaveBeenLastCalledWith( 43 );
        await roomRows( container );
        await press( container, '.wplus-lower-all-hands' );
        expect( group.lowerHand ).toHaveBeenLastCalledWith( null );

        await act( async () => {
            group.hands = [];
            group.fire( 'hands', [] );
        } );
        expect( container.querySelector( '[data-key="user_43"] .wplus-hand-raised' ) ).toBeNull();
    } );

    it( 'lets a listener raise and lower their own hand, which shows when the room says it', async () => {
        const group = room( { can: { publish: false, subscribe: true } } );
        const { container } = await screen( group );
        await press( container, '.wplus-raise-hand' );
        expect( group.raiseHand ).toHaveBeenCalled();
        await act( async () => {
            group.handRaised = true;
            group.fire( 'hands', [ 34 ] );
        } );
        await press( container, '.wplus-lower-hand' );
        expect( group.lowerHand ).toHaveBeenCalledWith();
    } );

    it( 'offers no hand where the call does not take hands', async () => {
        const { container } = await screen( room( { acts: BASE, can: { publish: false, subscribe: true } } ) );
        expect( container.querySelector( '.wplus-raise-hand' ) ).toBeNull();
    } );
} );

describe( 'asks to turn on a camera or microphone', () => {
    it( 'asks from a person\'s menu, and says the answer under "Asked…"', async () => {
        const group = room();
        const { container } = await screen( group );
        const rows = await personRows( container, 'user_43' );
        expect( rows ).toContain( 'Ask to Turn On Microphone' );
        await press( container, '.wplus-call-moderation-person .wplus-ask-microphone' );
        expect( group.askToTurnOn.mock.calls ).toEqual( [ [ 43, [ 'microphone' ] ] ] );
        await openPerson( container, 'user_43' );
        expect( container.querySelector( '.wplus-call-moderation-person .wplus-ask-microphone' )?.getAttribute( 'aria-label' ) ).toBe( 'Asked…' );
        await act( async () => group.fire( 'ask_answer', { id: 'ask-microphone', answer: 'on', from: 43 } ) );
        expect( container.querySelector( '.wplus-call-moderation-person .wplus-ask-microphone .wplus-call-moderation-note' )?.textContent ).toBe( 'Cara turned on their microphone' );
    } );

    it( 'shows the ask on the asked person\'s screen, and answers it to that host alone', async () => {
        const group = room( { can: { publish: true, subscribe: true } } );
        const seen = await probe( group );
        await act( async () => group.fire( 'ask', { id: 'a1', devices: [ 'camera', 'microphone' ], by: 34 } ) );
        expect( seen.context.turnOnAsks.pending ).toEqual( [
            { id: 'a1', device: 'microphone', by: 'user_34' },
            { id: 'a1', device: 'camera', by: 'user_34' },
        ] );
        expect( seen.context.turnOnAsks.received ).toEqual( { id: 'a1', device: 'camera', by: 'user_34' } );
        await act( async () => seen.context.turnOnAsks.answer( seen.context.turnOnAsks.received, 'not_now' ) );
        expect( group.answerAsk ).toHaveBeenCalledWith( { id: 'a1', devices: [ 'camera' ], by: 34 }, 'not_now' );
        await act( async () => seen.context.turnOnAsks.dismiss( seen.context.turnOnAsks.received ) );
        expect( seen.context.turnOnAsks.pending ).toHaveLength( 1 );
        cleanup();

        const drawn = room( { can: { publish: true, subscribe: true } } );
        const { container } = await screen( drawn );
        await act( async () => drawn.fire( 'ask', { id: 'a2', devices: [ 'microphone' ], by: 34 } ) );
        expect( container.querySelector( '.wplus-call-ask-prompt' ) ).not.toBeNull();
    } );

    it( 'has no asks where the call offers none', async () => {
        const seen = await probe( room( { acts: BASE } ) );
        expect( seen.context.turnOnAsks ).toBeUndefined();
        expect( seen.context.moderation ).not.toContain( 'ask_camera' );
    } );

    it( 'tells the host each answer to their own asks', async () => {
        const group = room();
        const seen = await probe( group );
        await act( async () => seen.context.moderate( { act: 'ask_camera_microphone', identity: 'user_43' } ) );
        // Both as two asks, one a device, as the answers name no device: the person sees them as one card.
        expect( group.askToTurnOn.mock.calls ).toEqual( [ [ 43, [ 'microphone' ] ], [ 43, [ 'camera' ] ] ] );
        await act( async () => group.fire( 'ask_answer', { id: 'ask-camera', answer: 'blocked', from: 43 } ) );
        await act( async () => group.fire( 'ask_answer', { id: 'ask-microphone', answer: 'on', from: 43 } ) );
        await act( async () => group.fire( 'ask_answer', { id: 'someone-else', answer: 'on', from: 43 } ) );
        expect( seen.context.turnOnAsks.answers ).toEqual( [
            { id: 'ask-camera', from: 'user_43', device: 'camera', answer: 'blocked' },
            { id: 'ask-microphone', from: 'user_43', device: 'microphone', answer: 'on' },
        ] );
    } );
} );

describe( 'ending and banning', () => {
    it( 'ends the call for everyone through end(), says nothing to the host who did it, and tells the others', async () => {
        const host = room();
        const closed = vi.fn();
        const seen = await probe( host, closed );
        await act( async () => {
            await seen.context.endForEveryone();
        } );
        expect( host.end ).toHaveBeenCalled();
        expect( host.moderate ).not.toHaveBeenCalled();
        await act( async () => host.fire( 'ended', 'closed' ) );
        expect( closed.mock.calls.every( ( [ notice ] ) => notice === null ) ).toBe( true );
        cleanup();

        const guest = room( { can: { publish: true, subscribe: true } } );
        const told = vi.fn();
        await probe( guest, told );
        await act( async () => guest.fire( 'ended', 'closed' ) );
        expect( told ).toHaveBeenCalledWith( 'A moderator ended the call for everyone.' );
    } );

    it( 'leaves with leave(), never end()', async () => {
        const group = room();
        const seen = await probe( group );
        await act( async () => seen.context.endCall() );
        expect( group.leave ).toHaveBeenCalled();
        expect( group.end ).not.toHaveBeenCalled();
    } );

    it( 'bans for the minutes chosen in the call\'s own dialog, and has no ban where the call offers none', async () => {
        const group = room();
        const { container } = await screen( group );
        await openPerson( container, 'user_43' );
        await press( container, '.wplus-call-moderation-person .wplus-ban-participant' );
        expect( container.querySelector( '.wplus-call-dialog' ) ).not.toBeNull();
        // Two days.
        await act( async () => fireEvent.change( container.querySelector( '.wplus-call-ban-amount' )!, { target: { value: '2' } } ) );
        await act( async () => fireEvent.change( container.querySelector( '.wplus-call-ban-unit' )!, { target: { value: String( 60 * 24 ) } } ) );
        await press( container, '.wplus-call-dialog-yes' );
        expect( group.ban ).toHaveBeenCalledWith( 43, 2 * 24 * 60 );
        expect( container.querySelector( '.wplus-call-dialog' ) ).toBeNull();

        // Never longer than the server keeps a ban: 7 days.
        await openPerson( container, 'user_43' );
        await press( container, '.wplus-call-moderation-person .wplus-ban-participant' );
        await act( async () => fireEvent.change( container.querySelector( '.wplus-call-ban-amount' )!, { target: { value: '30' } } ) );
        await act( async () => fireEvent.change( container.querySelector( '.wplus-call-ban-unit' )!, { target: { value: String( 60 * 24 ) } } ) );
        await press( container, '.wplus-call-dialog-yes' );
        expect( group.ban ).toHaveBeenLastCalledWith( 43, 7 * 24 * 60 );
        cleanup();

        const base = await screen( room( { acts: BASE } ) );
        expect( await personRows( base.container, 'user_43' ) ).not.toContain( 'Remove and Ban from Calls…' );
    } );
} );
