import {vi} from "vitest";
import {act} from "@testing-library/react";
import type {EasyStreamClient, EasyStreamState} from "@wordplus/realtime-client/streams";

// A stand-in client whose state the test sets, for the UI's tests.

export const base : EasyStreamState = {
    status: 'ready',
    error: null,
    stream: { id: 's', state: 'idle', started_at: null, ended_at: null },
    you: { identity: 'u:7', role: 'viewer', name: 'Maya', chat: 'write', mod: false },
    chatConnected: true,
    viewers: 12,
    audience: null,
    usage: null,
    slow: 0,
    chat: [],
    hands: [],
    handRaised: false,
    invited: false,
    onStage: false,
    media: 'off',
    waitUntil: null,
    tiles: [],
    audioBlocked: false,
    devices: { camera: false, microphone: false },
    originalSound: false,
    screenSharing: false,
    canShareScreen: true,
    reactions: [],
    encoder: null,
    quality: 'auto',
    sendQuality: '720p',
    topQuality: '720p',
    connection: 'unknown',
    tally: { peak: 0, messages: 0, reactions: 0 },
    facing: 'user',
    pinned: null,
    layout: { mode: 'grid', identity: null },
    timeoutUntil: null,
    reactionsOn: true,
    mutedByHost: null,
    elsewhere: false,
    sentHere: false,
    stalled: false,
    offline: false
};

export function fakeClient( state : Partial<EasyStreamState> = {} ){
    let current = { ...base, ...state };
    const listeners = new Set<() => void>();

    // Changes the state as the client would, outside React's act() (a test wraps what calls it).
    const patch = ( p : Partial<EasyStreamState> ) => {
        current = { ...current, ...p };
        listeners.forEach( ( l ) => l() );
    };

    const client = {
        getState: () => current,
        subscribe: ( l : () => void ) => { listeners.add( l ); return () => listeners.delete( l ); },
        start: vi.fn( async () => {} ),
        stop: vi.fn(),
        sendChat: vi.fn( async () => ( { ok: true, id: '1-0' } ) ),
        react: vi.fn(),
        raiseHand: vi.fn( async () => ( { ok: true } ) ),
        goLive: vi.fn( async () => ( { ok: true } ) ),
        startPreview: vi.fn( async () => { patch( { devices: { camera: true, microphone: true } } ); } ),
        setCamera: vi.fn( async ( on : boolean ) => { patch( { devices: { ...current.devices, camera: on } } ); } ),
        setMicrophone: vi.fn( async ( on : boolean ) => { patch( { devices: { ...current.devices, microphone: on } } ); } ),
        setScreenShare: vi.fn( async ( on : boolean ) => { patch( { screenSharing: on } ); return on; } ),
        setOriginalSound: vi.fn( async ( on : boolean ) => { patch( { originalSound: on } ); return on; } ),
        end: vi.fn( async () => ( { ok: true } ) ),
        unstage: vi.fn( async () => ( { ok: true } ) ),
        leaveStage: vi.fn( async () => {} ),
        listDevices: vi.fn( async () => ( {
            cameras: [ { id: 'cam-1', label: 'FaceTime HD Camera' }, { id: 'cam-2', label: 'Studio Display Camera' } ],
            microphones: [ { id: 'mic-1', label: 'MacBook Pro Microphone' }, { id: 'mic-2', label: 'Shure MV7' } ],
            speakers: []
        } ) ),
        useDevice: vi.fn( async () => true ),
        flipCamera: vi.fn( async () => {} ),
        localMedia: vi.fn( () => null ),
        sendingStats: vi.fn( async () => null ),
        sendingDetail: vi.fn( async () => null as any ),
        encoderStats: vi.fn( async () => null ),
        acceptStage: vi.fn( async () => ( { ok: true } ) ),
        declineStage: vi.fn(),
        invite: vi.fn( async () => ( { ok: true } ) ),
        setSlow: vi.fn( async () => ( { ok: true } ) ),
        deleteMessage: vi.fn( async () => ( { ok: true } ) ),
        ban: vi.fn( async () => ( { ok: true } ) ),
        pin: vi.fn( async () => ( { ok: true } ) ),
        unpin: vi.fn( async () => ( { ok: true } ) ),
        timeOut: vi.fn( async () => ( { ok: true } ) ),
        liftTimeout: vi.fn( async () => ( { ok: true } ) ),
        kick: vi.fn( async () => ( { ok: true } ) ),
        unban: vi.fn( async () => ( { ok: true } ) ),
        clearChat: vi.fn( async () => ( { ok: true } ) ),
        people: vi.fn( async () => ( { ok: true, people: [], watching: 0 } as any ) ),
        bans: vi.fn( async () => ( { ok: true, bans: [] } as any ) ),
        setLayout: vi.fn( async () => ( { ok: true } ) ),
        // As the client does: here at once.
        setCorner: vi.fn( async ( corner : { x : number, y : number } | null ) => {
            const { mode, identity } = current.layout;
            patch( { layout: { mode, identity, ...( corner ? { corner } : {} ) } } );
            return { ok: true };
        } ),
        muteGuest: vi.fn( async () => ( { ok: true } ) ),
        useEncoder: vi.fn( async () => ( { ok: true } ) ),
        leaveEncoder: vi.fn(),
        setQuality: vi.fn( ( quality : string ) => { current = { ...current, quality: quality as any }; listeners.forEach( ( l ) => l() ); } ),
        // As the client does: no more than the plan allows.
        setSendQuality: vi.fn( async ( quality : '720p' | '1080p' ) => {
            const sent = current.topQuality === '1080p' ? quality : '720p';
            patch( { sendQuality: sent } );
            return sent;
        } ),
        startAudio: vi.fn( async () => {} ),
        retryPicture: vi.fn( () => patch( { tooSlow: false } ) ),
        // No layers known and nothing measured, unless a test says.
        pictureLayers: vi.fn( () => [] as any[] ),
        playbackStats: vi.fn( () => null as any ),
        wantVideo: vi.fn(),
        dropVideo: vi.fn(),
        setAway: vi.fn()
    };

    const update = ( patch : Partial<EasyStreamState> ) => act( () => {
        current = { ...current, ...patch };
        listeners.forEach( ( l ) => l() );
    } );

    return { client, update, asClient: client as unknown as EasyStreamClient };
}

// The element whose tooltip says this (data-estream-tip), as getByTitle found the browser's.
export function byTip( text : string ) : HTMLElement {
    const el = document.querySelector<HTMLElement>( '[data-estream-tip=' + JSON.stringify( text ) + ']' );
    if( ! el ) throw new Error( 'nothing with the tooltip ' + JSON.stringify( text ) );
    return el;
}
