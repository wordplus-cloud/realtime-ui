import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { CallOptionsContext } from "./call-options.ts";
import type { CallConnectionState, CallContextInterface, CallParticipant, TurnOnAnswer, TurnOnAnswerKind, TurnOnAsk } from "../components/calls/context.ts";
import { callInfoDefaults } from "../components/calls/context.ts";
import { _x } from "../inc/globals.ts";
import { configureUi, host, setUiUsers } from "../host.ts";
import { useLocalMedia } from "./local-media.ts";
import { useFullScreen } from "./fullscreen.ts";
import { useGroupRecording } from "./group-recording.ts";
import { remoteTrack } from "./tracks.ts";
import { blankParticipant } from "./use-private-call.ts";
import {
    infoOf, type CallUser, type SdkAsk, type SdkAskAnswer, type SdkAskDevice, type SdkCallAct, type SdkCallPermissions,
    type SdkGroupCall, type SdkModerationAct, type SdkPerson, type SdkQuality, type SdkRoomRules,
} from "./types.ts";
import type { CallModeration } from "../components/calls/context.ts";
import type { JoinMedia } from "./controller.ts";

const refusal = ( code: string ) => Object.assign( new Error( code ), { code } );
const notModerated = () => refusal( 'not_moderated' );
const noModeration = () => Promise.reject( notModerated() );

/** A room that says nothing of its rules: participatory, unlocked, unmuted. */
const OPEN: SdkRoomRules = { mode: 'participatory', locked: false, muted: false };

/** The longest ban the realtime server keeps, in minutes: 7 days (better-messages-server's BAN_MOST_MINUTES). */
export const BAN_MOST_MINUTES = 7 * 24 * 60;

/**
 * Better Messages' moderator controls a host of an SDK group call gets on the others' tiles, and what each asks of the
 * app's calls route (group.moderate()), which asks the call's rule again, for a client from before the call named what
 * it offers (`acts`): remove, make a listener, let speak, mute a microphone once, and spotlight for everyone, the host
 * too, where the call's client reads the room's spotlight. No room rules there.
 */
const ACTS: Record<string, SdkModerationAct> = {
    remove_participant: 'remove', mute_participant: 'listen', unmute_participant: 'speak', mute_mic: 'mute',
    spotlight_participant: 'spotlight', unspotlight_participant: 'unspotlight',
};
const SPOTLIGHT_ACTS = [ 'spotlight_participant', 'unspotlight_participant' ];

/** What the call offers by the client's `acts`: null for a client from before them. */
const offersOf = ( group: SdkGroupCall ): readonly SdkCallAct[] | null => Array.isArray( group.acts ) ? group.acts : null;

/**
 * The screens' acts (`moderation`) a call offers, each from an act both the realtime server and the app's package name:
 * Better Messages' rows, each pair of a switch both ways, and nothing the call doesn't offer. Mute Microphone holds the
 * microphone off where the call holds one (`hold_mic`, with Allow Microphone by `release_mic`), as Better Messages'
 * does, else it mutes it once. A client from before `acts`: the acts of before alone.
 */
function moderationOf( group: SdkGroupCall ): string[] {
    const offers = offersOf( group );
    const spotlight = Array.isArray( group.spotlight );
    if ( ! offers ) return Object.keys( ACTS ).filter( ( act ) => spotlight || ! SPOTLIGHT_ACTS.includes( act ) );
    const has = ( act: SdkCallAct ) => offers.includes( act );
    return [
        ...( has( 'remove' ) ? [ 'remove_participant' ] : [] ),
        ...( has( 'listen' ) ? [ 'mute_participant' ] : [] ),
        ...( has( 'speak' ) ? [ 'unmute_participant' ] : [] ),
        ...( has( 'hold_mic' ) || has( 'mute' ) ? [ 'mute_mic' ] : [] ),
        ...( has( 'hold_mic' ) && has( 'release_mic' ) ? [ 'unmute_mic' ] : [] ),
        ...( has( 'rules' ) ? [ 'mute_all', 'unmute_all', 'lock_room', 'unlock_room', 'set_broadcast_mode', 'set_participatory_mode' ] : [] ),
        ...( has( 'hand' ) ? [ 'raise_hand' ] : [] ),
        ...( has( 'ask' ) ? [ 'ask_camera', 'ask_microphone', 'ask_camera_microphone' ] : [] ),
        ...( has( 'spotlight' ) && spotlight ? SPOTLIGHT_ACTS : [] ),
    ];
}

/** The rules each of Host Controls' switches sets. */
const RULE_OF_ACT: Record<string, Partial<SdkRoomRules>> = {
    set_broadcast_mode: { mode: 'broadcast' }, set_participatory_mode: { mode: 'participatory' },
    lock_room: { locked: true }, unlock_room: { locked: false },
    mute_all: { muted: true }, unmute_all: { muted: false },
};

/** Whether this page hosts the call: its rule's `admin`, on a call whose client takes a host's acts. */
const hosts = ( group: SdkGroupCall, can: SdkCallPermissions | undefined ) => !! can?.admin && typeof group.moderate === 'function';

const showError = ( e: unknown ) => host().showError( e );

/**
 * A group call made with the SDK (`calls.group()`, a call that became one, or a ring into one accepted), as the group
 * video grid and the group audio roster read it: everyone in its room with their pictures and sound and who speaks,
 * this page's own tile, its camera, microphone and screen, and leaving. `close` is called once it is over. `turnOn`: what
 * it turns on as it starts. When not given, nothing where the join offers the devices (CallOptions' devicesOnJoin),
 * else the microphone and on a video call the camera.
 *
 * The room's rules (Broadcast Mode, Lock Room, Mute Everyone), the hands up and the held microphones are the realtime
 * server's, as the client reads them from the room: a host's press asks for a change and the switch moves when the room
 * says it, so two hosts' screens follow each other, and a host who joins later sees what is on and whose hands are up.
 */
export function useGroupCall(
    group: SdkGroupCall,
    type: 'audio' | 'video',
    close: ( notice: string | null ) => void,
    adding: Pick<CallContextInterface, 'people' | 'addPerson'> = {},
    turnOn?: JoinMedia,
): CallContextInterface {
    const wrapper = useRef<HTMLDivElement | null>( null );
    const options = useContext( CallOptionsContext );
    const media = useLocalMedia( ( source, track ) => group.setTrack( source, track ) );
    const full = useFullScreen( wrapper );
    const recording = useGroupRecording( group );
    const offers = offersOf( group );
    const offered = ( act: SdkCallAct ) => !! offers?.includes( act );

    const [ people, setPeople ] = useState<SdkPerson[]>( () => group.people() );
    // This page's own user, for the name and picture on their own tile (an SDK review, 2026-10-14: it had neither).
    const [ self, setSelf ] = useState<SdkPerson | null>( () => group.self ?? null );
    const [ state, setState ] = useState<SdkGroupCall[ 'state' ]>( group.state );
    const [ statusMessage, setStatusMessage ] = useState( '' );
    // Whether this page may send: someone who only listens (the rule's `publish: false`) has no camera, microphone or
    // tile of their own until the app server lets them speak (`permit`), and none again if it takes that back.
    const [ canPublish, setCanPublish ] = useState( () => group.can?.publish !== false );
    const [ admin, setAdmin ] = useState( () => hosts( group, group.can ) );
    // This page's microphone held off by a host or Mute Everyone: the dock's microphone turns into the locked one.
    const [ micHeld, setMicHeld ] = useState( () => !! group.can?.micHeld );
    // The room's spotlight for everyone, by the media server's identity (spotlight.tsx).
    const [ spotlit, setSpotlit ] = useState<string[]>( () => group.spotlight ?? [] );
    // This page's own connection, as the media server rates it. A client without it reads as good.
    const [ quality, setQuality ] = useState<SdkQuality>( () => group.quality ?? 'good' );
    // The room's rules and the hands up, as the room says them: read as it mounts too, as the join said them already.
    const [ rules, setRules ] = useState<SdkRoomRules>( () => group.rules ?? OPEN );
    const [ hands, setHands ] = useState<CallUser[]>( () => group.hands ?? [] );
    const [ myHand, setMyHand ] = useState( () => !! group.handRaised );
    // A host's asks of this page's user, each device apart, the oldest first, and the answers to this page's own asks.
    const [ asks, setAsks ] = useState<TurnOnAsk[]>( [] );
    const [ answers, setAnswers ] = useState<TurnOnAnswer[]>( [] );
    const askedBy = useRef( new Map<string, CallUser>() );
    const askedFor = useRef( new Map<string, SdkAskDevice>() );
    // Whom a host is banning, while the ban's dialog asks for how long.
    const [ banning, setBanning ] = useState<CallParticipant | null>( null );
    // This page ended the call for everyone: it closes with nothing said.
    const endingAll = useRef( false );
    const startedAt = useRef( Date.now() );
    const callDurationRef = useRef( 0 );
    const zero = useRef( 0 );

    useEffect( () => {
        const refresh = () => {
            setPeople( [ ...group.people() ] );
            setSelf( group.self ?? null );
        };
        const onState = ( next: SdkGroupCall[ 'state' ] ) => {
            setState( next );
            if ( next === 'connected' ) setSelf( group.self ?? null );
            setStatusMessage( next === 'connecting' || next === 'reconnecting' ? _x( 'Connecting...', 'Call Screen', 'bp-better-messages' ) : '' );
        };
        const onWaiting = () => setStatusMessage( _x( 'Waiting for a free place in the call...', 'Call Screen', 'bp-better-messages' ) );
        const onError = ( error: { code?: string } ) => host().showError( error?.code ?? error );
        const onPermissions = ( can: SdkCallPermissions ) => {
            setCanPublish( can?.publish !== false );
            setAdmin( hosts( group, can ) );
            setMicHeld( !! can?.micHeld );
        };
        const onEnded = ( reason: string ) => {
            media.stopAll();
            // Taken out by the app server (remove()): said, as the window just went before (an SDK review, 2026-10-14).
            // Ended for everyone by a host (end()), as Better Messages says it, but not to the host who did it.
            close( reason === 'removed' ? _x( 'You were removed from this call', 'Call Screen', 'bp-better-messages' )
                : reason === 'encryption_unsupported' ? _x( 'This call could not be connected', 'Call Screen', 'bp-better-messages' )
                : reason === 'closed' && offersOf( group ) && ! endingAll.current ? _x( 'A moderator ended the call for everyone.', 'Call Moderation', 'bp-better-messages' )
                : null );
        };
        const onRules = ( next: SdkRoomRules ) => setRules( next ?? OPEN );
        const onHands = ( list: CallUser[] ) => {
            setHands( Array.isArray( list ) ? list : [] );
            setMyHand( !! group.handRaised );
        };
        // A host's ask, shown over the dock: an ask for both is one for each device under its id, the camera's last, so
        // it is `received`, as Better Messages has it. The same host asking again for a device replaces their ask.
        const onAsk = ( ask: SdkAsk ) => {
            if ( ! ask || typeof ask.id !== 'string' || ask.by === null || ask.by === undefined ) return;
            const devices = ( [ 'microphone', 'camera' ] as const ).filter( ( device ) => ask.devices?.includes( device ) );
            if ( devices.length === 0 ) return;
            const by = 'user_' + String( ask.by );
            askedBy.current.set( ask.id, ask.by );
            const fresh = devices.map( ( device ) => ( { id: ask.id, device, by } ) );
            setAsks( ( was ) => [ ...was.filter( ( one ) => one.by !== by || ! devices.includes( one.device ) ), ...fresh ] );
        };
        // An answer to one of this page's asks: each asks for one device (moderate()), so its id says which.
        const onAskAnswer = ( answer: SdkAskAnswer ) => {
            const device = answer && askedFor.current.get( answer.id );
            if ( ! device || answer.from === null ) return;
            setAnswers( ( was ) => [ ...was, { id: answer.id, from: 'user_' + String( answer.from ), device, answer: answer.answer } ] );
        };

        group.on( 'person', refresh );
        group.on( 'person_left', refresh );
        // Away for a moment (a reload, a dropped connection): the tile stays, marked Reconnecting...; and media stopped.
        group.on( 'person_away', refresh );
        group.on( 'stalled', refresh );
        group.on( 'speakers', refresh );
        group.on( 'state', onState );
        group.on( 'waiting', onWaiting );
        group.on( 'error', onError );
        group.on( 'ended', onEnded );
        group.on( 'permissions', onPermissions );
        const onSpotlight = ( list: string[] ) => setSpotlit( Array.isArray( list ) ? list : [] );
        group.on( 'spotlight', onSpotlight );
        group.on( 'quality', setQuality );
        group.on( 'rules', onRules );
        group.on( 'hands', onHands );
        group.on( 'ask', onAsk );
        group.on( 'ask_answer', onAskAnswer );
        onState( group.state );
        refresh();
        if ( group.rules ) setRules( group.rules );
        if ( group.hands ) onHands( group.hands );

        // A listener starts with nothing on: what they may not send, they never ask the browser for. A page that joined by
        // itself turns on only what it was given, and so does one whose join offers the devices (devicesOnJoin): there
        // nothing is asked of the browser until the person turns it on. A held microphone is not turned on.
        const join = turnOn ?? ( options.devicesOnJoin ? { microphone: false, camera: false } : undefined );
        if ( group.can?.publish !== false ) {
            const microphone = ( join?.microphone ?? true ) && ! group.can?.micHeld;
            const camera = type === 'video' && ( join?.camera ?? true );
            // On a video call, the camera asked for with the microphone, so the browser asks once.
            if ( microphone && camera ) void media.enableMicAndCamera();
            else if ( microphone ) void media.enableMic();
            else if ( camera ) void media.enableCamera();
        }

        const tick = window.setInterval( () => {
            callDurationRef.current = Date.now() - startedAt.current;
        }, 250 );

        return () => {
            window.clearInterval( tick );
            group.off( 'person', refresh );
            group.off( 'person_left', refresh );
            group.off( 'person_away', refresh );
            group.off( 'stalled', refresh );
            group.off( 'speakers', refresh );
            group.off( 'state', onState );
            group.off( 'waiting', onWaiting );
            group.off( 'error', onError );
            group.off( 'ended', onEnded );
            group.off( 'permissions', onPermissions );
            group.off( 'spotlight', onSpotlight );
            group.off( 'quality', setQuality );
            group.off( 'rules', onRules );
            group.off( 'hands', onHands );
            group.off( 'ask', onAsk );
            group.off( 'ask_answer', onAskAnswer );
        };
    }, [ group ] );

    // The grids name each tile from the host's users: everyone's name and picture as the site's tokens gave them.
    // Their own name on their tile: the grids read it as the current user's, which the SDK screens learn here.
    useEffect( () => {
        if ( ! self || self.user === null ) return;
        const user = self.user;
        const info = infoOf( self.info );
        setUiUsers( [ [ user, { name: info.name ?? '', avatar: info.avatar } ] ] );
        configureUi( { currentUserId: () => user } );
    }, [ self ] );

    useEffect( () => {
        setUiUsers( people.filter( ( person ) => person.user !== null ).map( ( person ) => {
            const info = infoOf( person.info );
            return [ person.user as number, { name: info.name ?? '', avatar: info.avatar } ];
        } ) );
    }, [ people ] );

    // A held microphone is the client's `micHeld` where the call holds one; otherwise a microphone simply off.
    const holds = offered( 'hold_mic' );

    const participants = useMemo( () => {
        const map = new Map<string, CallParticipant>();
        const up = new Set( hands.map( String ) );
        if ( canPublish ) {
            const own = infoOf( self?.info );
            const me = blankParticipant( 'me', own.name ?? '', own.avatar ?? '' );
            me.video = media.camera;
            me.audio = media.microphone;
            me.screen = media.screen;
            me.quality = quality;
            me.handRaised = myHand;
            map.set( 'me', me );
        }

        for ( const person of people ) {
            const info = infoOf( person.info );
            const key = person.user !== null ? 'user_' + person.user : person.identity;
            const tile = blankParticipant( person.identity, info.name ?? '', info.avatar ?? '' );
            const away = !! person.reconnecting;
            tile.video = remoteTrack( person.camera );
            tile.audio = remoteTrack( person.microphone );
            tile.screen = remoteTrack( person.screen );
            tile.screenAudio = remoteTrack( person.screenAudio );
            tile.isSpeaking = person.speaking && ! away;
            tile.audioLevel = tile.isSpeaking ? 0.4 : 0;
            tile.micMuted = holds ? !! person.micHeld : ! person.microphone;
            tile.canPublish = person.publish !== false;
            tile.videoPaused = !! person.cameraPaused;
            tile.screenPaused = !! person.screenPaused;
            tile.quality = person.quality ?? 'good';
            tile.handRaised = person.user !== null && up.has( String( person.user ) );
            tile.reconnecting = away;
            tile.stalled = away ? null : person.stalled ?? null;
            map.set( key, tile );
        }

        return map;
    }, [ people, self, canPublish, quality, hands, myHand, holds, media.camera, media.microphone, media.screen ] );

    const participantsRef = useRef( participants );
    participantsRef.current = participants;

    const connectionState: CallConnectionState = state === 'connected' ? 'connected' : state === 'reconnecting' ? 'reconnecting' : state === 'ended' ? 'disconnected' : 'connecting';

    // Who a tile names: by their identity (the video grid) or their key, user_<id> (the audio roster).
    const personOf = ( identity: string | undefined ) => people.find( ( p ) => p.identity === identity || ( p.user !== null && 'user_' + p.user === identity ) );
    const userOf = ( identity: string | undefined ): CallUser => {
        const person = personOf( identity );
        if ( ! person || person.user === null ) throw notModerated();
        return person.user;
    };

    // The room's rules asked of the server; the switch moves when the room says it (`rules`), as it does for another
    // host's press, read again here from the room once the server took it.
    const setRoomRules = async ( change: Partial<SdkRoomRules> ) => {
        if ( ! group.setRules || ! offered( 'rules' ) ) throw refusal( 'not_offered' );
        await group.setRules( change );
        if ( group.rules ) setRules( group.rules );
    };

    // A host's ask for one device: its id, which the answer names.
    const askFor = async ( user: CallUser, device: SdkAskDevice ) => {
        const id = await group.askToTurnOn!( user, [ device ] );
        askedFor.current.set( id, device );
        return id;
    };

    // A tile names its person by their identity (the video grid) or their key, user_<id> (the audio roster), the user's
    // own as `me`, which a host spotlights too. Taking everyone out of the spotlight names nobody.
    const moderate = async ( request: CallModeration ) => {
        if ( ! group.moderate ) throw notModerated();
        const rule = RULE_OF_ACT[ request.act ];
        if ( rule ) {
            if ( ! offers ) throw notModerated();
            return setRoomRules( rule );
        }

        if ( offers ) {
            if ( request.act === 'ask_camera' || request.act === 'ask_microphone' || request.act === 'ask_camera_microphone' ) {
                if ( ! offered( 'ask' ) || ! group.askToTurnOn ) throw refusal( 'not_offered' );
                const user = userOf( request.identity );
                // Both as two asks, one a device, so each answer says which it is: the person sees one card for them.
                const devices: SdkAskDevice[] = request.act === 'ask_camera' ? [ 'camera' ] : request.act === 'ask_microphone' ? [ 'microphone' ] : [ 'microphone', 'camera' ];
                const sent = await Promise.allSettled( devices.map( ( device ) => askFor( user, device ) ) );
                const failed = sent.find( ( one ): one is PromiseRejectedResult => one.status === 'rejected' );
                if ( failed && sent.every( ( one ) => one.status === 'rejected' ) ) throw failed.reason;
                return true;
            }
            if ( request.act === 'mute_mic' && offered( 'hold_mic' ) ) return group.moderate( 'hold_mic', userOf( request.identity ) );
            if ( request.act === 'unmute_mic' ) {
                if ( ! offered( 'release_mic' ) ) throw refusal( 'not_offered' );
                return group.moderate( 'release_mic', userOf( request.identity ) );
            }
        }

        const act = ACTS[ request.act ];
        if ( ! act ) throw notModerated();
        if ( act === 'unspotlight' && ! request.identity ) return group.moderate( act, null );
        const person = request.identity === 'me' && SPOTLIGHT_ACTS.includes( request.act ) ? self : personOf( request.identity );
        if ( ! person || person.user === null ) throw notModerated();
        return group.moderate( act, person.user );
    };

    // The spotlight by the tiles' identities: the user's own tile is `me`.
    const spotlight = useMemo( () => spotlit.map( ( identity ) => self && identity === self.identity ? 'me' : identity ), [ spotlit, self ] );

    // Leaves: the call goes on for the others. Never group.end(), which ends it for everyone.
    const endCall = async () => {
        await Promise.resolve( group.leave() ).catch( () => {} );
        media.stopAll();
        close( null );
    };

    // Host Controls' End for Everyone. Where the call offers `end`, the server ends it, takes everyone out and forgets
    // what it held, and the others are told a moderator ended it. A call that doesn't offer it, but takes Remove (a
    // client or server from before), has each of the others taken out through the app's calls route, who are told they
    // were removed, and then this page leaves.
    const endForEveryone = async () => {
        if ( offered( 'end' ) && group.end ) {
            endingAll.current = true;
            try {
                await group.end();
            } catch ( e ) {
                endingAll.current = false;
                throw e;
            }
            if ( group.state !== 'ended' ) await endCall();
            return;
        }
        await Promise.all( people.filter( ( person ) => person.user !== null )
            .map( ( person ) => group.moderate!( 'remove', person.user! ).catch( () => false ) ) );
        await endCall();
    };
    const endsForEveryone = admin && ( offers ? offered( 'end' ) || offered( 'remove' ) : true );

    // A viewer or a speaker in broadcast mode: the server holds it until the call ends or the mode changes.
    const speaker = ( act: 'speak' | 'listen' ) => async ( identity: string ) => {
        try {
            return await group.moderate!( act, userOf( identity ) );
        } catch ( e ) {
            showError( e );
            return false;
        }
    };

    // Hands: the server keeps them until lowered, so every host sees them, a host who joins later too.
    const raiseHand = async () => {
        try {
            if ( myHand ) await group.lowerHand!();
            else await group.raiseHand!();
        } catch ( e ) {
            showError( e );
        }
    };
    const lowerHand = async ( identity: string ) => {
        try {
            return await group.lowerHand!( userOf( identity ) );
        } catch ( e ) {
            showError( e );
            return false;
        }
    };
    const lowerAllHands = async () => {
        try {
            await group.lowerHand!( null );
        } catch ( e ) {
            showError( e );
        }
    };
    const hands$ = offered( 'hand' ) && typeof group.raiseHand === 'function';

    const setCallMode = async ( mode: 'participatory' | 'broadcast' ) => {
        try {
            await setRoomRules( { mode } );
        } catch ( e ) {
            showError( e );
        }
    };

    // Remove and Ban from Calls: how long in the call screen's own dialog (ban-dialog.tsx), then the server takes them
    // out and keeps them out until it ends.
    const bans = admin && offered( 'ban' ) && typeof group.ban === 'function';
    const banFromCalls = ( participant: CallParticipant ) => setBanning( participant );
    const banDialog = bans && banning ? {
        participant: banning,
        most: BAN_MOST_MINUTES,
        ban: async ( minutes: number ) => {
            setBanning( null );
            try {
                await group.ban!( userOf( banning.identity ), minutes );
            } catch ( e ) {
                showError( e );
            }
        },
        cancel: () => setBanning( null ),
    } : null;

    // A host's asks, on the asked person's screen, and the answers to this page's own (ask-prompt.tsx).
    const turnOnAsks = offered( 'ask' ) ? {
        received: asks[ asks.length - 1 ] ?? null,
        pending: asks,
        answers,
        answer: ( ask: TurnOnAsk, answer: TurnOnAnswerKind ) => {
            const by = askedBy.current.get( ask.id );
            if ( by === undefined || ! group.answerAsk ) return;
            void group.answerAsk( { id: ask.id, devices: [ ask.device ], by }, answer ).catch( () => {} );
        },
        dismiss: ( ask: TurnOnAsk ) => setAsks( ( was ) => was.filter( ( one ) => one.id !== ask.id || one.device !== ask.device ) ),
    } : undefined;

    const moderation = moderationOf( group );

    return {
        wrapper,
        thread: { thread_id: 0, participants: [] },
        callInfo: { ...callInfoDefaults, type },
        adminMode: admin,
        canPublish,
        statusMessage,
        participants,
        participantsRef,
        action: 'call_in_progress',
        errorMessages: [],
        callDurationRef,
        bytesReceivedRef: zero,
        bytesSentRef: zero,
        connectionState,
        endCall,
        answerCall: async () => true,
        activeCameraDevice: media.activeCameraDevice,
        setActiveCameraDevice: media.setActiveCameraDevice,
        selectedCameraDevice: media.selectedCameraDevice,
        setSelectedCameraDevice: media.setSelectedCameraDevice,
        selectedMicrophoneDevice: media.selectedMicrophoneDevice,
        setSelectedMicrophoneDevice: media.setSelectedMicrophoneDevice,
        selectedSpeakerDevice: media.selectedSpeakerDevice,
        setSelectedSpeakerDevice: media.setSelectedSpeakerDevice,
        ...full,
        myCameraTrack: media.camera,
        myCameraTrackRef: media.cameraRef,
        myMicrophoneTrack: media.microphone,
        myMicrophoneTrackRef: media.microphoneRef,
        myScreenVideoTrack: media.screen,
        myScreenVideoTrackRef: media.screenRef,
        switchingCamera: media.switchingCamera,
        switchCamera: media.switchCamera,
        enableCamera: media.enableCamera,
        disableCamera: media.disableCamera,
        enableMic: media.enableMic,
        disableMic: media.disableMic,
        enableShareScreen: media.enableShareScreen,
        disableShareScreen: media.disableShareScreen,
        // The room's rules, as the room says them: Host Controls' presses go through moderate(), and the setters are the
        // room's, not the screen's, so they do nothing here.
        roomLocked: rules.locked,
        setRoomLocked: () => {},
        roomMuted: rules.muted,
        setRoomMuted: () => {},
        raiseHand: hands$ ? raiseHand : async () => {},
        lowerHand: hands$ ? lowerHand : async () => false,
        lowerAllHands: hands$ ? lowerAllHands : async () => {},
        myHandRaised: myHand,
        myMicMuted: micHeld,
        callMode: rules.mode,
        setCallMode,
        promoteParticipant: speaker( 'speak' ),
        demoteParticipant: speaker( 'listen' ),
        moderate: admin ? moderate : noModeration,
        moderation: endsForEveryone ? [ ...moderation, 'end_call' ] : moderation,
        spotlight,
        endForEveryone: endsForEveryone ? endForEveryone : undefined,
        banFromCalls: bans ? banFromCalls : undefined,
        banning: banDialog,
        turnOnAsks,
        recording,
        ...adding,
        iconsReverted: false,
        mutedHint: options.mutedHint,
        devicesOnJoin: options.devicesOnJoin,
        // local-media.ts sends the camera and the microphone with the effects chosen.
        effects: true,
    } as CallContextInterface;
}
