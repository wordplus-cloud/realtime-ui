import { vi } from 'vitest';
import type { SdkRoom, SdkRooms } from '../src/sdk/rooms.ts';

// The SDK's rooms by shape: a room whose events are fired by hand.
export function fakeRoom( name: string, members: Record<string, unknown> = {} ) {
    const handlers = new Map<string, Array<( ...args: any[] ) => void>>();
    const room = {
        name,
        state: 'joined' as SdkRoom[ 'state' ],
        error: null,
        members: new Map( Object.entries( members ) ),
        count: null as number | null,
        on: ( event: string, fn: ( ...args: any[] ) => void ) => void handlers.set( event, [ ...( handlers.get( event ) ?? [] ), fn ] ),
        off: ( event?: string, fn?: ( ...args: any[] ) => void ) => void ( event && handlers.set( event, ( handlers.get( event ) ?? [] ).filter( ( f ) => f !== fn ) ) ),
        emit: vi.fn(),
        emitWithAck: vi.fn( async () => ( { id: 'e1', at: 1 } ) ),
        volatile: { emit: vi.fn() },
        history: vi.fn( async () => ( { events: [], more: false } ) ),
        fire: ( event: string, ...args: unknown[] ) => ( handlers.get( event ) ?? [] ).forEach( ( fn ) => fn( ...args ) ),
    };
    return room;
}

export function fakeRooms( rooms: Record<string, ReturnType<typeof fakeRoom>>, own: string[] = [] ) {
    const joined = new Set( own );
    const rt = {
        tab: 't1',
        user: '34',
        online: { watch: vi.fn(), unwatch: vi.fn(), has: () => true, lastSeen: () => null, count: null, on: vi.fn(), off: vi.fn() },
        join: vi.fn( ( name: string ) => ( joined.add( name ), rooms[ name ] ) ),
        leave: vi.fn( ( name: string ) => void joined.delete( name ) ),
        room: ( name: string ) => ( joined.has( name ) ? rooms[ name ] : undefined ),
        users: vi.fn( async ( ids: Array<number | string> ) => Object.fromEntries( ids.map( String ).filter( ( id ) => PROFILES[ id ] ).map( ( id ) => [ id, PROFILES[ id ] ] ) ) ),
    };
    return rt as typeof rt & SdkRooms;
}

const PROFILES: Record<string, { user_id: number; name: string; avatar: string }> = {
    34: { user_id: 34, name: 'Ann', avatar: '/avatars/ann.svg' },
    42: { user_id: 42, name: 'Ben', avatar: '/avatars/ben.svg' },
    43: { user_id: 43, name: 'Cara', avatar: '/avatars/cara.svg' },
};
