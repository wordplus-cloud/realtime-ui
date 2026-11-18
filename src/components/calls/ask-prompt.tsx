import React, { useContext, useEffect, useRef, useState } from "react";
import { _x, sprintf } from "../../inc/globals.ts";
import Icon from "../../primitives/icons.tsx";
import { host } from "../../host.ts";
import { CallContext, type CallContextInterface, type CallParticipant, type TurnOnAnswer, type TurnOnAnswerKind, type TurnOnAsk } from "./context.ts";
import pressable from "./pressable.ts";
import { moderates } from "./moderation.ts";
import { browserLabel, isAndroid, isFirefox, isIOS, isMac, isSafari, isWindows } from "../../inc/functions/browser-info.ts";
import { mediaAccess, updateMediaPermissions } from "../../inc/calls/permissions.ts";

/**
 * A moderator asking someone to turn on their camera or microphone, for people who do not find it themselves (asked on
 * 2026-10-30: "Ask user to enable camera/mic" in the person's menu, "which should users who do not know how to enable
 * camera to be helped by admin"). The moderator's side: Ask to Turn On Camera and Ask to Turn On Microphone in a
 * person's menu while theirs is off, one row for both while both are (asked on 2026-11-02: "i have 2 options and need
 * to click both of them"), "Asked…" for ASKED_MS after with the answer under it once it comes, and a toast of the
 * answer, one for both where they agree. The person's side: the ask over their dock in the join prompt's card, with
 * Turn On, which does what the dock's button does (for both, with one prompt of the browser), Preview, and Not Now.
 * Nothing is turned on without their press. Where the browser blocks the
 * device, or there is none, or another app holds it, the card says how to fix it in this browser, with Try Again, and
 * the moderator hears which. The card waits for the person: it has no time limit, so a moderator is never told that
 * someone did not answer, and nothing is told of someone who leaves with the card open.
 */
export const ASKED_MS = 30000;

type Device = 'camera' | 'microphone';
export type Stuck = 'blocked' | 'no_device' | 'busy';
// What a moderator asks for: one device, or both at once (the act `ask_camera_microphone`).
type Asked = Device | 'both';
const devicesOf = ( what: Asked ): Device[] => what === 'both' ? [ 'camera', 'microphone' ] : [ what ];

// The asks this page sent, by person and device, for ASKED_MS: the menu says "Asked…" and does not ask again. `after`
// is how many answers the page had heard as it asked, so the menu says the answer to this ask and to none before it.
const asked = new Map<string, { at: number, after: number }>();

const plain = ( name: string ) => name.replace( /<[^>]*>/g, '' ).trim();

/** A moderator's asks, as a person's menu offers them. */
export function useTurnOnAskActs() {
    const { moderate, moderation, turnOnAsks } = useContext<CallContextInterface>( CallContext );
    const [ busy, setBusy ] = useState<string | null>( null );
    const [ , redraw ] = useState( 0 );
    const key = ( identity: string, what: Asked ) => identity + '|' + what;
    // For both, each of the two: a device's own row comes back while the other still says "Asked…".
    const isAsked = ( identity: string, what: Asked ) =>
        devicesOf( what ).every( ( device ) => ( asked.get( key( identity, device ) )?.at ?? 0 ) > Date.now() - ASKED_MS );

    // The newest answer to this page's ask for the device, while it says "Asked…".
    const answerTo = ( identity: string, device: Device ): TurnOnAnswer | undefined => {
        const sent = asked.get( key( identity, device ) );
        if ( ! sent || ! turnOnAsks || ! isAsked( identity, device ) ) return undefined;
        return turnOnAsks.answers.slice( sent.after ).filter( ( one ) => one.from === identity && one.device === device ).pop();
    };

    // Drawn again as the soonest "Asked…" runs out.
    useEffect( () => {
        const now = Date.now();
        const next = Math.min( ...[ ...asked.values() ].map( ( { at } ) => at + ASKED_MS ).filter( ( at ) => at > now ) );
        if ( ! Number.isFinite( next ) ) return;
        const timer = setTimeout( () => redraw( ( n ) => n + 1 ), next - now + 50 );
        return () => clearTimeout( timer );
    } );

    return {
        /** Whether the call takes the ask: for both, where it takes each and the one for both. */
        offered: ( what: Asked ) => !! turnOnAsks && devicesOf( what ).every( ( device ) => moderates( moderation, 'ask_' + device ) )
            && ( what !== 'both' || moderates( moderation, 'ask_camera_microphone' ) ),
        isAsked,
        busy: ( identity: string, what: Asked ) => busy === key( identity, what ),
        /**
         * The answer to this page's ask, as the toast says it, while the row says "Asked…". For both, one line where
         * the two agree, else each that came.
         */
        answered: ( identity: string, what: Asked, name: string ): string | undefined => {
            const answers = devicesOf( what ).map( ( device ) => answerTo( identity, device ) ).filter( ( one ): one is TurnOnAnswer => !! one );
            if ( answers.length === 2 && answers[ 0 ].answer === answers[ 1 ].answer ) return turnOnAnswerText( answers[ 0 ], plain( name ), true );
            return answers.length ? answers.map( ( one ) => turnOnAnswerText( one, plain( name ) ) ).join( ' · ' ) : undefined;
        },
        ask: async ( identity: string, what: Asked ) => {
            const devices = devicesOf( what );
            if ( busy || devices.some( ( device ) => isAsked( identity, device ) ) ) return;
            setBusy( key( identity, what ) );
            const after = turnOnAsks?.answers.length ?? 0;
            try {
                await moderate( { act: what === 'both' ? 'ask_camera_microphone' : 'ask_' + what, identity } );
                const at = Date.now();
                devices.forEach( ( device ) => asked.set( key( identity, device ), { at, after } ) );
            } catch ( e ) {
                host().showError( e );
            } finally {
                setBusy( null );
            }
        },
    };
}

/**
 * What the moderator is told of an answer, `name` being whom they asked; `both` where they answered an ask for both
 * alike, for the two devices.
 */
export function turnOnAnswerText( answer: TurnOnAnswer, name: string, both = false ): string {
    if ( both ) {
        switch ( answer.answer ) {
            case 'on': return sprintf( _x( '%s turned on their camera and microphone', 'Call Ask', 'bp-better-messages' ), name );
            case 'not_now': return sprintf( _x( '%s is not turning on their camera and microphone now', 'Call Ask', 'bp-better-messages' ), name );
            case 'blocked': return sprintf( _x( '%s: their browser blocks the camera and microphone', 'Call Ask', 'bp-better-messages' ), name );
            case 'no_device': return sprintf( _x( '%s: no camera or microphone found', 'Call Ask', 'bp-better-messages' ), name );
            default: return sprintf( _x( '%s: another app is using their camera and microphone', 'Call Ask', 'bp-better-messages' ), name );
        }
    }

    const camera = answer.device === 'camera';
    switch ( answer.answer ) {
        case 'on':
            return sprintf( camera ? _x( '%s turned on their camera', 'Call Ask', 'bp-better-messages' ) : _x( '%s turned on their microphone', 'Call Ask', 'bp-better-messages' ), name );
        case 'not_now':
            return sprintf( camera ? _x( '%s is not turning on their camera now', 'Call Ask', 'bp-better-messages' ) : _x( '%s is not turning on their microphone now', 'Call Ask', 'bp-better-messages' ), name );
        case 'blocked':
            return sprintf( camera ? _x( '%s: their browser blocks the camera', 'Call Ask', 'bp-better-messages' ) : _x( '%s: their browser blocks the microphone', 'Call Ask', 'bp-better-messages' ), name );
        case 'no_device':
            return sprintf( camera ? _x( '%s: no camera found', 'Call Ask', 'bp-better-messages' ) : _x( '%s: no microphone found', 'Call Ask', 'bp-better-messages' ), name );
        default:
            return sprintf( camera ? _x( '%s: another app is using their camera', 'Call Ask', 'bp-better-messages' ) : _x( '%s: another app is using their microphone', 'Call Ask', 'bp-better-messages' ), name );
    }
}

/**
 * Why the device would not turn on, asked before it is: none where the browser has allowed it already, else the
 * browser's own answer to opening it once, let go at once. Where the browser would ask, the person answers it here,
 * from their own press of Turn On.
 */
export async function whyNotOn( device: Device ): Promise<Stuck | null> {
    await updateMediaPermissions().catch( () => null );
    if ( mediaAccess.get( device ) === 'granted' ) return null;
    if ( typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) return 'blocked';

    try {
        const stream = await navigator.mediaDevices.getUserMedia( device === 'camera' ? { video: true } : { audio: true } );
        stream.getTracks().forEach( ( track ) => track.stop() );
        return null;
    } catch ( e ) {
        return stuckBy( e );
    }
}

/** Why the browser would not open a device, by the error it refused it with. */
export function stuckBy( error: unknown ): Stuck {
    const name = ( error as { name?: string } )?.name ?? '';
    if ( name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError' ) return 'no_device';
    if ( name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError' ) return 'busy';
    return 'blocked';
}

/**
 * whyNotOn for each device, the person answering one prompt of the browser for the two where it would ask for each. A
 * device the browser said it blocks is blocked without asking. Refused together, both are blocked: asking for each
 * again would put the prompt up again. A device that would not open (none, or another app's) is told apart by opening
 * each, once the prompt is answered.
 */
async function whyNotOnEach( devices: readonly Device[] ): Promise<Map<Device, Stuck>> {
    const stuck = new Map<Device, Stuck>();
    const each = async ( list: readonly Device[] ) => {
        for ( const device of list ) {
            const why = await whyNotOn( device );
            if ( why ) stuck.set( device, why );
        }
    };

    if ( devices.length < 2 ) {
        await each( devices );
        return stuck;
    }

    await updateMediaPermissions().catch( () => null );
    const open: Device[] = [];
    devices.forEach( ( device ) => {
        const access = mediaAccess.get( device );
        if ( access === 'denied' ) stuck.set( device, 'blocked' );
        else if ( access !== 'granted' ) open.push( device );
    } );

    if ( open.length < 2 || typeof navigator === 'undefined' || ! navigator.mediaDevices?.getUserMedia ) {
        await each( open );
        return stuck;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia( { video: true, audio: true } );
        stream.getTracks().forEach( ( track ) => track.stop() );
    } catch ( e ) {
        if ( stuckBy( e ) === 'blocked' ) open.forEach( ( device ) => stuck.set( device, 'blocked' ) );
        else await each( open );
    }

    return stuck;
}

/** What a device that would not turn on is told by, the ask's card and the device settings alike. */
export function stuckTitle( device: Device, stuck: Stuck ): string {
    const camera = device === 'camera';
    if ( stuck === 'blocked' ) return camera ? _x( 'Your browser blocks the camera for this site', 'Call Ask', 'bp-better-messages' ) : _x( 'Your browser blocks the microphone for this site', 'Call Ask', 'bp-better-messages' );
    if ( stuck === 'no_device' ) return camera ? _x( 'No camera found', 'Call Ask', 'bp-better-messages' ) : _x( 'No microphone found', 'Call Ask', 'bp-better-messages' );
    return camera ? _x( 'Another app is using your camera', 'Call Ask', 'bp-better-messages' ) : _x( 'Another app is using your microphone', 'Call Ask', 'bp-better-messages' );
}

/** What to do about it, each step ending in Try Again. */
export function stuckSteps( device: Device, stuck: Stuck ): string[] {
    if ( stuck === 'blocked' ) return unblockSteps( device === 'camera' ? _x( 'Camera', 'Media Inputs', 'bp-better-messages' ) : _x( 'Microphone', 'Media Inputs', 'bp-better-messages' ) );
    if ( stuck === 'no_device' ) return [ _x( 'Connect one, or check that it is switched on, then press Try Again.', 'Call Ask', 'bp-better-messages' ) ];
    return [ _x( 'Close the other app that uses it, then press Try Again.', 'Call Ask', 'bp-better-messages' ) ];
}

/** How to let this site use the device in this browser, `label` the device as the browser's settings name it. */
export function unblockSteps( label: string ): string[] {
    const browser = browserLabel().toLowerCase();
    let step: string;

    if ( isIOS() ) {
        step = browser.includes( 'safari' )
            ? _x( 'Tap aA in the address bar, choose Website Settings, set %s to Allow, then press Try Again.', 'Call Ask', 'bp-better-messages' )
            : _x( 'Open the Settings app, find this browser, turn %s on, then come back and press Try Again.', 'Call Ask', 'bp-better-messages' );
    } else if ( isAndroid() ) {
        step = _x( 'Tap the icon to the left of the web address, choose Permissions, allow %s, then press Try Again.', 'Call Ask', 'bp-better-messages' );
    } else if ( isFirefox() ) {
        step = _x( 'Click the crossed out icon in the address bar, clear the block on %s, then press Try Again.', 'Call Ask', 'bp-better-messages' );
    } else if ( isSafari() ) {
        step = _x( 'In the Safari menu, choose Settings for This Website, set %s to Allow, then press Try Again.', 'Call Ask', 'bp-better-messages' );
    } else if ( /chrom|edge|opera|brave|vivaldi|yandex/.test( browser ) ) {
        step = _x( 'Click the icon to the left of the web address, set %s to Allow, then press Try Again.', 'Call Ask', 'bp-better-messages' );
    } else {
        step = _x( 'Open the settings of this site in your browser, allow %s, then press Try Again.', 'Call Ask', 'bp-better-messages' );
    }

    const steps = [ sprintf( step, label ) ];
    if ( isMac() ) steps.push( sprintf( _x( 'Still blocked? Open System Settings, Privacy & Security, %s, and turn it on for this browser.', 'Call Ask', 'bp-better-messages' ), label ) );
    if ( isWindows() ) steps.push( sprintf( _x( 'Still blocked? Open Settings, Privacy & security, %s, and let this browser use it.', 'Call Ask', 'bp-better-messages' ), label ) );

    return steps;
}

const nameOf = ( participants: Map<string, CallParticipant>, identity: string ) =>
    plain( [ ...participants.values() ].find( ( person ) => person.identity === identity )?.name ?? '' );

/**
 * The ask the user was sent, over their dock in the join prompt's card, until they turn the device on (here or from
 * the dock) or say Not Now. `preview` opens the device settings with it running, as the join prompt's Preview does.
 * Where two moderators asked for the same device, the card names the one who asked last and the answer goes to each;
 * an ask for the other device shows once these are answered. Where the one who asked last asked for the other device
 * too (an ask for both is one for each), the card asks for both while both are off: Turn On turns on both, with one
 * prompt of the browser for the two, and Not Now answers both. A device that would not turn on is said first, the
 * camera's before the microphone's, and Try Again tries each still off.
 */
export default function TurnOnAskPrompt( { video, preview }: { video: boolean, preview: () => void } ) {
    const { turnOnAsks, participants, enableCamera, enableMic, myCameraTrack, myMicrophoneTrack, canPublish } = useContext<CallContextInterface>( CallContext );
    const ask = turnOnAsks?.received ?? null;
    const pending = turnOnAsks?.pending?.length ? turnOnAsks.pending : ask ? [ ask ] : [];
    // Why each device would not turn on, from the last press.
    const [ stuck, setStuck ] = useState<Partial<Record<Device, Stuck>>>( {} );
    const [ trying, setTrying ] = useState( false );
    // What each ask was answered already, by its device as the two of an ask for both share its id: each answer once.
    const told = useRef( new Map<string, Set<TurnOnAnswerKind>>() );

    const forDevice = ( device: Device ) => pending.filter( ( one ) => one.device === device );

    const tellEach = ( asks: readonly TurnOnAsk[], answer: TurnOnAnswerKind ) => asks.forEach( ( one ) => {
        const id = one.id + '|' + one.device;
        const said = told.current.get( id ) ?? new Set<TurnOnAnswerKind>();
        if ( said.has( answer ) ) return;
        said.add( answer );
        told.current.set( id, said );
        turnOnAsks?.answer( one, answer );
    } );

    const tell = ( device: Device, answer: TurnOnAnswerKind ) => tellEach( forDevice( device ), answer );

    useEffect( () => {
        setStuck( {} );
        setTrying( false );
    }, [ ask?.id ] );

    // Turned on, from here or from the dock: said to each who asked for it, and their asks go.
    const cameraOn = !! myCameraTrack;
    const micOn = !! myMicrophoneTrack;
    useEffect( () => {
        if ( ! turnOnAsks ) return;
        ( [ [ 'camera', cameraOn ], [ 'microphone', micOn ] ] as const ).forEach( ( [ device, isOn ] ) => {
            const asks = forDevice( device );
            if ( ! isOn || ! asks.length ) return;
            tellEach( asks, 'on' );
            asks.forEach( ( one ) => turnOnAsks.dismiss( one ) );
        } );
    }, [ pending.map( ( one ) => one.id ).join(), cameraOn, micOn ] );

    if ( ! ask || ! turnOnAsks || ! canPublish ) return null;

    // What the card asks for, the camera first: the newest ask's device, and the other one too where the same moderator
    // asked for it; a camera on a video call alone, and neither once it is on.
    const isOn = ( device: Device ) => device === 'camera' ? cameraOn : micOn;
    const also = pending.some( ( one ) => one.by === ask.by && one.device !== ask.device );
    const devices = ( [ 'camera', 'microphone' ] as const ).filter( ( device ) => ( device === ask.device || also ) && ! isOn( device ) && ( device !== 'camera' || video ) );
    if ( ! devices.length ) return null;

    const stuckOn = devices.find( ( device ) => stuck[ device ] );
    const both = ! stuckOn && devices.length > 1;
    const shown: Device = stuckOn ?? devices[ 0 ];
    const camera = shown === 'camera';
    const who = nameOf( participants, ask.by ) || _x( 'A moderator', 'Call Ask', 'bp-better-messages' );

    const turnOn = async () => {
        if ( trying ) return;
        setTrying( true );
        try {
            const why = await whyNotOnEach( devices );
            const next: Partial<Record<Device, Stuck>> = {};
            why.forEach( ( one, device ) => {
                next[ device ] = one;
                tell( device, one );
            } );
            setStuck( next );
            for ( const device of devices ) {
                if ( ! why.has( device ) ) await ( device === 'camera' ? enableCamera() : enableMic() );
            }
        } finally {
            setTrying( false );
        }
    };

    const notNow = () => devices.forEach( ( device ) => {
        tell( device, 'not_now' );
        forDevice( device ).forEach( ( one ) => turnOnAsks.dismiss( one ) );
    } );

    const title = stuckOn
        ? stuckTitle( stuckOn, stuck[ stuckOn ]! )
        : both
            ? sprintf( _x( '%s asks you to turn on your camera and microphone', 'Call Ask', 'bp-better-messages' ), who )
            : sprintf( camera ? _x( '%s asks you to turn on your camera', 'Call Ask', 'bp-better-messages' ) : _x( '%s asks you to turn on your microphone', 'Call Ask', 'bp-better-messages' ), who );

    const steps = stuckOn ? stuckSteps( stuckOn, stuck[ stuckOn ]! ) : [];
    // Preview opens what the app's `preview` opens: the newest ask's device.
    const previews = ask.device === 'camera';

    return <div className="wplus-call-join-prompt-region" role="status">
        <div className="wplus-call-join-prompt wplus-call-ask-prompt" data-device={ both ? 'both' : shown } data-stuck={ stuckOn ? stuck[ stuckOn ] : undefined }>
            <span className="wplus-call-join-prompt-icon" aria-hidden="true"><Icon name={ camera ? 'video' : 'mic' } size={ 16 } /></span>
            <span className="wplus-call-join-prompt-text">
                <span className="wplus-call-join-prompt-title">{ title }</span>
                { steps.length > 0 && <span className="wplus-call-ask-steps">
                    { steps.map( ( step, i ) => <span key={ i } className="wplus-call-join-prompt-note">{ step }</span> ) }
                </span> }
            </span>
            <span className="wplus-call-ask-actions">
                <span { ...pressable( turnOn ) } className="wplus-call-join-prompt-preview wplus-call-ask-on" data-busy={ trying ? 1 : undefined }>{ stuckOn
                    ? _x( 'Try Again', 'Call Ask', 'bp-better-messages' )
                    : _x( 'Turn On', 'Call Ask', 'bp-better-messages' ) }</span>
                { ! stuckOn && <span { ...pressable( preview ) } className="wplus-call-ask-preview">{ previews
                    ? _x( 'Preview', 'Call Devices', 'bp-better-messages' )
                    : _x( 'Test Microphone', 'Call Devices', 'bp-better-messages' ) }</span> }
                <span { ...pressable( notNow ) } className="wplus-call-ask-not-now">{ _x( 'Not Now', 'Call Ask', 'bp-better-messages' ) }</span>
            </span>
        </div>
    </div>;
}
