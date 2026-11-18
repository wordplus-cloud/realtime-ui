import { useEffect, useMemo, useRef, useState } from "react";
import { callName } from "./call-name.ts";
import type { CallsSource } from "./use-controller.ts";

// What the screens read of @wordplus/realtime's rooms (its realtime-client's Rooms and Room), by shape, as types.ts
// reads its calls: an app's `Realtime` (`connect()`), and the room client a WordPress page shares
// (`window.wordplusRealtimeCalls.page().rt`), both fit.

type Listener = ( ...args: any[] ) => void;

export interface SdkEventMeta {
    from?: string;
    id?: string;
    at?: number;
    replayed?: boolean;
}

export interface SdkHistoryEvent {
    event: string;
    data: unknown;
    id?: string;
    at?: number;
    from?: string;
}

export interface SdkRoom {
    readonly name: string;
    state: 'joining' | 'joined' | 'failed' | 'left';
    error: string | null;
    readonly members: Map<string, unknown>;
    count: number | null;
    on( event: string, fn: Listener ): unknown;
    off( event?: string, fn?: Listener ): unknown;
    emit( event: string, data?: unknown ): void;
    emitWithAck( event: string, data?: unknown ): Promise<{ id: string; at: number }>;
    readonly volatile: { emit( event: string, data?: unknown ): void };
    history( ask?: { before?: string; after?: string; limit?: number } ): Promise<{ events: SdkHistoryEvent[]; more: boolean }>;
}

export interface SdkOnline {
    watch( ids: Array<number | string> ): unknown;
    unwatch( ids: Array<number | string> ): unknown;
    has( id: number | string ): boolean;
    lastSeen( id: number | string ): number | null;
    readonly count: number | null;
    on( event: 'change' | 'count', fn: Listener ): unknown;
    off( event?: 'change' | 'count', fn?: Listener ): unknown;
}

export interface SdkProfile {
    user_id: number | string;
    name?: string | null;
    avatar?: string | null;
    [ field: string ]: unknown;
}

export interface SdkRooms {
    readonly tab: string;
    /** Who the page's user is, once known: their id. */
    readonly user: string | null;
    readonly online: SdkOnline;
    join( name: string ): SdkRoom;
    leave( name: string ): void;
    room?( name: string ): SdkRoom | undefined;
    users( ids: Array<number | string> ): Promise<Record<string, SdkProfile>>;
}

/** A room client and its calls, as @wordplus/realtime's Realtime is both. */
export type Realtime = SdkRooms & CallsSource;

// The page's connection as <RealtimeProvider> gives it. The React entry says how to read it (react.tsx): the elements and
// the chat's parts have no provider, and a React of their own, so there it is nothing and no hook runs.
let provided: () => Realtime | null = () => null;

/** @internal The React entry's way to read the provider. */
export function provideRealtime( read: () => Realtime | null ): void {
    provided = read;
}

/** The app's connection from <RealtimeProvider>, or null until it is up; or the one given, for a screen given its own. */
export function useRealtime(): Realtime | null;
export function useRealtime<T>( given: T | null | undefined ): T | Realtime | null;
export function useRealtime( given?: unknown ): unknown {
    const from = provided();
    return given ?? from;
}

// A room a screen joined, counted per page, so a room two screens show is left only when both are gone, and a room the
// app had joined itself is never left by a screen.
const holds = new WeakMap<SdkRooms, Map<string, { count: number; ours: boolean }>>();

function hold( rt: SdkRooms, name: string ): SdkRoom {
    let held = holds.get( rt );
    if ( ! held ) holds.set( rt, ( held = new Map() ) );
    const entry = held.get( name );
    if ( entry ) entry.count++;
    else held.set( name, { count: 1, ours: ! rt.room?.( name ) } );
    return rt.join( name );
}

function release( rt: SdkRooms, name: string ): void {
    const held = holds.get( rt );
    const entry = held?.get( name );
    if ( ! held || ! entry ) return;
    if ( --entry.count > 0 ) return;
    held.delete( name );
    if ( entry.ours ) rt.leave( name );
}

export interface RoomMember {
    id: string;
    info: Record<string, unknown>;
}

export interface RoomView {
    room: SdkRoom | null;
    state: SdkRoom[ 'state' ] | 'idle';
    error: string | null;
    members: RoomMember[];
    count: number | null;
}

/** A room as a component reads it, with what it sends. */
export interface RoomHook extends RoomView {
    emit( event: string, data?: unknown ): void;
    emitWithAck( event: string, data?: unknown ): Promise<{ id: string; at: number }>;
}

/** What a component hears of a room, by event: each given the event's data and its meta. */
export type RoomHandlers = Record<string, ( data: any, meta: SdkEventMeta ) => void>;

/** What useRoom() takes beside a room's name. */
export interface RoomOptions {
    /** The other person of `{pair}` in the name. While empty, as they load, it joins nothing yet. */
    with?: number | string | null;
}

/**
 * A room's name for the page's user and another, as a call's is: `{pair}` the two ids in order, `{me}`, `{id}`, so both of
 * them name the same room. A name with none of them is as it is.
 */
export function roomName( name: string, me: string | null, other: number | string ): string {
    return callName( name, me, String( other ) );
}

/**
 * Joins a room while the component is on the page: `handlers` by event name, each given the event's data and its meta
 * `{ from, id, at, replayed? }`. Its state, its members (a presence room's) and its count stay current. A null `name`
 * joins nothing. On <RealtimeProvider>'s connection, or the one given first, for a screen given its own. `{pair}` in the
 * name is this user and `with`, in order: `useRoom( 'chat:{pair}', handlers, { with: 34 } )`.
 */
export function useRoom( name: string | null | undefined, handlers?: RoomHandlers, options?: RoomOptions ): RoomHook;
export function useRoom( rt: SdkRooms | null | undefined, name: string | null | undefined, handlers?: RoomHandlers, options?: RoomOptions ): RoomHook;
export function useRoom( first: SdkRooms | string | null | undefined, second?: RoomHandlers | string | null, third?: RoomHandlers | RoomOptions, fourth?: RoomOptions ): RoomHook {
    // `rt` first: an object there, or a name after it. A name first otherwise.
    const given = first !== null && typeof first === 'object' ? first : typeof second === 'string' ? null : undefined;
    const rtFirst = given !== undefined || second === null;
    const rt = useRealtime<SdkRooms>( given );
    const name = ( rtFirst ? second : first ) as string | null | undefined;
    const handlers = ( rtFirst ? third : second ) as RoomHandlers | undefined;
    const other = ( ( rtFirst ? fourth : third ) as RoomOptions | undefined )?.with;

    const [ view, setView ] = useState<RoomView>( { room: null, state: 'idle', error: null, members: [], count: null } );
    // The handlers as the latest render has them: an inline function is another one each time.
    const latest = useRef( handlers );
    latest.current = handlers;
    const heard = handlers ? Object.keys( handlers ).sort().join( '|' ) : '';

    useEffect( () => {
        if ( ! rt || ! name || ( /\{(pair|id)\}/.test( name ) && ( other === undefined || other === null ) ) ) {
            setView( { room: null, state: 'idle', error: null, members: [], count: null } );
            return;
        }
        // `{pair}` on a page with nobody signed in.
        if ( /\{(pair|me)\}/.test( name ) && ! rt.user ) {
            setView( { room: null, state: 'failed', error: 'no_identity', members: [], count: null } );
            return;
        }
        const named = roomName( name, rt.user ?? null, other ?? '' );
        const room = hold( rt, named );
        const update = () => setView( {
            room,
            state: room.state,
            error: room.error,
            members: [ ...room.members ].map( ( [ id, info ] ) => ( { id, info: info && typeof info === 'object' ? info as Record<string, unknown> : {} } ) ),
            count: room.count,
        } );
        const events = [ 'joined', 'join', 'leave', 'count', 'error', 'kicked' ];
        const own = heard === '' ? [] : heard.split( '|' ).map( ( event ): [ string, Listener ] => [ event, ( data, meta ) => latest.current?.[ event ]?.( data, meta ) ] );
        for ( const event of events ) room.on( event, update );
        for ( const [ event, fn ] of own ) room.on( event, fn );
        update();

        return () => {
            for ( const event of events ) room.off( event, update );
            for ( const [ event, fn ] of own ) room.off( event, fn );
            release( rt, named );
        };
    }, [ rt, name, other, heard ] );

    return {
        ...view,
        emit: ( event, data ) => view.room?.emit( event, data ),
        emitWithAck: ( event, data ) => view.room ? view.room.emitWithAck( event, data ) : Promise.reject( Object.assign( new Error( 'not_joined' ), { code: 'not_joined' } ) ),
    };
}

/** Who is in a presence room now: each member's id and info, as the others see them. */
export function usePresence( name: string | null | undefined, options?: RoomOptions ): RoomMember[] {
    return useRoom( name, undefined, options ).members;
}

export interface OnlineState {
    online: Record<string, boolean>;
    lastSeen: Record<string, number>;
    count: number | null;
}

/**
 * The online status of users, by id, kept current, when they were last seen, and how many are online across the app, with
 * `count`. With the connection given first: whether each is online, alone.
 */
export function useOnline( ids: Array<number | string>, options?: { count?: boolean } ): OnlineState;
export function useOnline( rt: SdkRooms | null | undefined, ids: Array<number | string> ): Record<string, boolean>;
export function useOnline( first: Array<number | string> | SdkRooms | null | undefined, second?: Array<number | string> | { count?: boolean } ): OnlineState | Record<string, boolean> {
    const idsFirst = Array.isArray( first );
    const rt = useRealtime<SdkRooms>( idsFirst ? null : first );
    const ids = ( idsFirst ? first : second ) as Array<number | string>;
    const counting = idsFirst && !! ( second as { count?: boolean } | undefined )?.count;
    const key = [ ...new Set( ids.map( String ) ) ].sort().join( '|' );
    const [ state, setState ] = useState<OnlineState>( { online: {}, lastSeen: {}, count: null } );

    useEffect( () => {
        if ( ! rt ) return;
        const watched = key === '' ? [] : key.split( '|' );
        const update = () => {
            const online: Record<string, boolean> = {};
            const lastSeen: Record<string, number> = {};
            for ( const id of watched ) {
                online[ id ] = rt.online.has( id );
                const at = rt.online.lastSeen( id );
                if ( at !== null ) lastSeen[ id ] = at;
            }
            setState( { online, lastSeen, count: rt.online.count } );
        };
        if ( watched.length > 0 ) rt.online.watch( watched );
        rt.online.on( 'change', update );
        if ( counting ) rt.online.on( 'count', update );
        update();
        return () => {
            rt.online.off( 'change', update );
            if ( counting ) rt.online.off( 'count', update );
        };
    }, [ rt, key, counting ] );

    return idsFirst ? state : state.online;
}

/** Names and pictures from the app's directory (rt.users()), for the ids given, as they arrive. */
export function useProfiles( ids: Array<number | string> ): Record<string, SdkProfile>;
export function useProfiles( rt: SdkRooms | null | undefined, ids: Array<number | string> ): Record<string, SdkProfile>;
export function useProfiles( first: Array<number | string> | SdkRooms | null | undefined, second?: Array<number | string> ): Record<string, SdkProfile> {
    const idsFirst = Array.isArray( first );
    const rt = useRealtime<SdkRooms>( idsFirst ? null : first );
    const ids = ( idsFirst ? first : second ) as Array<number | string>;
    const key = [ ...new Set( ids.map( String ) ) ].sort().join( '|' );
    const [ profiles, setProfiles ] = useState<Record<string, SdkProfile>>( {} );

    useEffect( () => {
        if ( ! rt || key === '' ) return;
        let live = true;
        rt.users( key.split( '|' ) ).then( ( found ) => live && setProfiles( ( known ) => ( { ...known, ...found } ) ), () => {} );
        return () => {
            live = false;
        };
    }, [ rt, key ] );

    return profiles;
}

/**
 * Who is typing in a room now: the senders of its `event` (`{ on: true }` while typing, `{ on: false }` when they stop,
 * sent volatile), each gone `ttl` ms after their last word unless they say more. The page's own user is left out.
 */
export function useTyping( room: SdkRoom | null, event?: string, ttl?: number ): string[];
export function useTyping( rt: SdkRooms | null | undefined, room: SdkRoom | null, event?: string, ttl?: number ): string[];
export function useTyping( first: SdkRoom | SdkRooms | null | undefined, second?: SdkRoom | string | null, third?: string | number, fourth?: number ): string[] {
    // The room first where nothing, or the event's name, comes after it.
    const roomFirst = second === undefined || typeof second === 'string';
    const rt = useRealtime<SdkRooms>( roomFirst ? null : first as SdkRooms | null | undefined );
    const room = ( roomFirst ? first : second ) as SdkRoom | null;
    const event = ( ( roomFirst ? second : third ) as string | undefined ) ?? 'typing';
    const ttl = ( ( roomFirst ? third : fourth ) as number | undefined ) ?? 4000;
    const [ writers, setWriters ] = useState<string[]>( [] );
    const timers = useRef( new Map<string, ReturnType<typeof setTimeout>>() );

    useEffect( () => {
        if ( ! room ) return;
        const all = timers.current;
        const drop = ( id: string ) => {
            clearTimeout( all.get( id ) );
            all.delete( id );
            setWriters( ( list ) => list.filter( ( w ) => w !== id ) );
        };
        const heard = ( data: unknown, meta: SdkEventMeta = {} ) => {
            const id = meta.from;
            if ( ! id || id === rt?.user ) return;
            if ( ! ( data as { on?: boolean } | null )?.on ) return drop( id );
            clearTimeout( all.get( id ) );
            all.set( id, setTimeout( () => drop( id ), ttl ) );
            setWriters( ( list ) => ( list.includes( id ) ? list : [ ...list, id ] ) );
        };
        // A message from someone ends their typing.
        const spoke = ( _data: unknown, meta: SdkEventMeta = {} ) => meta.from && drop( meta.from );
        room.on( event, heard );
        room.on( 'message', spoke );
        return () => {
            room.off( event, heard );
            room.off( 'message', spoke );
            for ( const timer of all.values() ) clearTimeout( timer );
            all.clear();
            setWriters( [] );
        };
    }, [ rt, room, event, ttl ] );

    return writers;
}

/** A member's name and picture: the room's info first, then the directory's. */
export function personOf( id: string, info: Record<string, unknown>, profiles: Record<string, SdkProfile> ) {
    const profile = profiles[ id ];
    const text = ( value: unknown ) => ( typeof value === 'string' && value !== '' ? value : undefined );
    return {
        user_id: id,
        name: text( info.name ) ?? text( profile?.name ) ?? '',
        avatar: text( info.avatar ) ?? text( profile?.avatar ),
    };
}

/** Ids as the memo key a list of them makes. */
export function useIds( ids: Array<number | string> ): string[] {
    const key = ids.map( String ).join( '|' );
    return useMemo( () => ( key === '' ? [] : key.split( '|' ) ), [ key ] );
}
