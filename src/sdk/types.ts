// What the screens read of @wordplus/realtime's calls (its realtime-client's sdk-calls), by shape: this package takes
// the page's calls as the SDK made them and imports none of it, so it never carries a second copy of the call engine.

export type SdkCallType = 'audio' | 'video';
export type SdkMediaSource = 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio';
export type SdkQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** A track another person sends. */
export interface SdkRemoteTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    attach( element: HTMLMediaElement ): HTMLMediaElement;
    detach( element?: HTMLMediaElement ): HTMLMediaElement[];
}

export interface SdkMediaState {
    camera: boolean;
    microphone: boolean;
    screen_share: boolean;
    screen_share_audio: boolean;
}

export interface SdkRemoteMedia {
    camera: SdkRemoteTrack | null;
    microphone: SdkRemoteTrack | null;
    screen: SdkRemoteTrack | null;
    screenAudio: SdkRemoteTrack | null;
    media: SdkMediaState;
    quality: SdkQuality;
}

type Listener = ( ...args: any[] ) => void;

/** A user of a call: a number for an id of digits, else the app's own id of text (@wordplus/realtime-client's CallUser). */
export type CallUser = number | string;

/**
 * An id as calls take it, the rule of @wordplus/realtime-client's callUserOf(): an id of digits as a number, any other
 * id of text as it is, else null (at most 64 characters, none a space or a control character). 0 is nobody.
 */
export function callUserOf( raw: unknown ): CallUser | null {
    if ( typeof raw === 'number' ) return Number.isSafeInteger( raw ) && raw !== 0 ? raw : null;
    if ( typeof raw !== 'string' || ! /^[^\s\u0000-\u001f\u007f]{1,64}$/.test( raw ) ) return null;
    if ( /^-?[1-9][0-9]*$/.test( raw ) && Number.isSafeInteger( Number( raw ) ) ) return Number( raw );
    return raw === '0' ? null : raw;
}

export interface SdkInvite {
    /** Whom it rings. */
    readonly to: CallUser;
    state: string;
    on( event: string, fn: Listener ): unknown;
}

/** A call between two people. */
export interface SdkCall {
    readonly id: string;
    readonly name: string;
    readonly type: SdkCallType;
    readonly role: 'caller' | 'callee';
    readonly peer: { user: CallUser; info: unknown };
    state: 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
    endReason: string | null;
    remote: SdkRemoteMedia;
    on( event: string, fn: Listener ): unknown;
    off( event: string, fn?: Listener ): unknown;
    add( user: CallUser ): Promise<SdkInvite>;
    setTrack( source: SdkMediaSource, track: MediaStreamTrack | null ): void;
    end(): void;
}

/** Someone in a group call. */
export interface SdkPerson {
    identity: string;
    user: CallUser | null;
    info: unknown;
    camera: SdkRemoteTrack | null;
    microphone: SdkRemoteTrack | null;
    screen: SdkRemoteTrack | null;
    screenAudio: SdkRemoteTrack | null;
    speaking: boolean;
    /** Whether they may send: false for someone who only listens. */
    publish?: boolean;
    /** Their camera or screen paused by the media server for this page's download. A client without them pauses nothing. */
    cameraPaused?: boolean;
    screenPaused?: boolean;
    /** How their connection is, as the media server rates it. A client without it reads as good. */
    quality?: SdkQuality;
    /** They left and may come back (a reload, a dropped connection): their tile is kept, marked, for a while. */
    reconnecting?: boolean;
    /** What of theirs stopped reaching the media server while they are still in: `video`, or `all` with their sound. */
    stalled?: 'video' | 'all' | null;
    /** A host holds their microphone off (`holdMic()`), or Mute Everyone does, until it is let go. */
    micHeld?: boolean;
}

/** What this page may do in a group call now, as its rule said or the app server changed since (`permissions`). */
export interface SdkCallPermissions {
    publish: boolean;
    subscribe: boolean;
    /** Host the call (its rule's `admin`): `moderate()` the others. */
    admin?: boolean;
    /** This page's microphone is held off by a host or Mute Everyone, its camera and screen still allowed. */
    micHeld?: boolean;
}

/**
 * What a host does to someone else in a group call: `mute` their microphone, `speak`, `listen`, `remove`, and
 * `spotlight` or `unspotlight` anyone, the host too, `unspotlight` with no user for everyone.
 */
export type SdkModerationAct = 'mute' | 'speak' | 'listen' | 'remove' | 'spotlight' | 'unspotlight'
    | 'ban' | 'unban' | 'hold_mic' | 'release_mic' | 'rules' | 'ask' | 'end';

/**
 * What a group call offers, as the realtime server and the app's server package both name it (the client's `acts`):
 * the screens draw a control only for an act named there. `hand` is raising hands, for everyone; the rest are a host's.
 */
export type SdkCallAct = 'remove' | 'ban' | 'listen' | 'speak' | 'mute' | 'hold_mic' | 'release_mic' | 'rules' | 'hand' | 'ask' | 'end' | 'spotlight';

/** The room's rules, as the realtime server keeps them until the room empties, and every host's screen follows them. */
export interface SdkRoomRules {
    mode: 'broadcast' | 'participatory';
    locked: boolean;
    muted: boolean;
}

export type SdkAskDevice = 'camera' | 'microphone';
export type SdkAskAnswerKind = 'on' | 'not_now' | 'blocked' | 'no_device' | 'busy';

/** A host asks this page's user to turn on a camera or microphone: the ask's id, what, and which host. */
export interface SdkAsk {
    id: string;
    devices: SdkAskDevice[];
    by: CallUser | null;
}

/** Someone's answer to this page's ask, sent to this page alone. */
export interface SdkAskAnswer {
    id: string;
    answer: SdkAskAnswerKind;
    from: CallUser | null;
}

/** A group call on the mesh. */
export interface SdkGroupCall {
    state: 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'ended';
    on( event: string, fn: Listener ): unknown;
    off( event: string, fn?: Listener ): unknown;
    people(): SdkPerson[];
    setTrack( source: SdkMediaSource, track: MediaStreamTrack | null ): Promise<void>;
    /** This page leaves; the call goes on for the others. Never `end()`, which ends it for everyone. */
    leave(): void | Promise<void>;
    add?( user: CallUser ): Promise<SdkInvite>;
    /** What this page may do now. A client without it sends as everyone else. */
    readonly can?: SdkCallPermissions;
    /** This page's own user as the others see them, once connected: their info for their own tile. */
    readonly self?: SdkPerson | null;
    /** How this page's own connection is, as the media server rates it (`quality` event when it changes). */
    readonly quality?: SdkQuality;
    /** A host's act on someone else, through the app's calls route: whether it changed anything. */
    moderate?( act: SdkModerationAct, user: CallUser | null, options?: { minutes?: number } ): Promise<boolean>;
    /**
     * What the call offers (SdkCallAct), as the server and the app's package both name it: only those are drawn. A
     * client without it offers the acts of before (remove, listen, speak, mute, spotlight), and no room rules.
     */
    readonly acts?: readonly SdkCallAct[];
    /** The room's rules now (`rules` event when they change, by any host). */
    readonly rules?: SdkRoomRules;
    /** Whose hands are up, by user, the earliest first (`hands` event when it changes), raised before this page joined too. */
    readonly hands?: CallUser[];
    /** Whether this page's user has a hand up. */
    readonly handRaised?: boolean;
    /** A host takes someone out and keeps them out for `minutes`, or until the call ends. */
    ban?( user: CallUser, minutes?: number ): Promise<boolean>;
    /** A host holds someone's microphone off until the call ends, and lets it go. */
    holdMic?( user: CallUser ): Promise<boolean>;
    releaseMic?( user: CallUser ): Promise<boolean>;
    /** A host sets the room's rules: the rules now. */
    setRules?( rules: Partial<SdkRoomRules> ): Promise<SdkRoomRules>;
    /** A host asks someone to turn on their camera or microphone: the ask's id, which their answer names. */
    askToTurnOn?( user: CallUser, devices: SdkAskDevice[] ): Promise<string>;
    /** This page's user answers a host's ask, to that host alone. */
    answerAsk?( ask: SdkAsk, answer: SdkAskAnswerKind ): Promise<void>;
    /** A host ends the call for everyone, and what it held goes with it. */
    end?(): Promise<boolean>;
    /** This page's user raises a hand, which stays up until lowered. */
    raiseHand?(): Promise<boolean>;
    /** Lowers this page's user's hand, or as a host another's, or everyone's with null. */
    lowerHand?( user?: CallUser | null ): Promise<boolean>;
    /**
     * Who a host put on the main tiles for everyone, by the media server's identity, as the room keeps it (`spotlight`
     * event when it changes). A client without it has no spotlight.
     */
    readonly spotlight?: string[];
    /** Whether the room says it is being recorded, by whoever started it (`recording` event when it changes). */
    readonly isRecording?: boolean;
    /** Whether to offer this page's user a recording of the call. A client without it offers none. */
    readonly canRecord?: boolean;
    /** Starts recording the call, through the app's calls route: the recording. */
    startRecording?(): Promise<SdkGroupRecording>;
    /** Stops the recording `id` of the call, through the app's calls route. */
    stopRecording?( id: string ): Promise<SdkGroupRecording>;
}

/** A group call's recording, as the app's calls route answers. */
export interface SdkGroupRecording {
    id: string;
    state: string;
}

/** A call ringing for the page's user. */
export interface SdkIncoming {
    readonly id: string;
    readonly call: string;
    readonly from: CallUser;
    info: unknown;
    readonly type: SdkCallType;
    readonly group: string | null;
    state: string;
    on( event: 'over', fn: Listener ): unknown;
    off( event: 'over', fn?: Listener ): unknown;
    accept(): Promise<SdkCall | SdkGroupCall>;
    decline( reason?: 'declined' | 'busy' ): Promise<void>;
}

export interface SdkPerson2 {
    id: CallUser;
    name: string;
    avatar?: string;
}

/** The page's calls. */
export interface SdkCalls {
    on( event: 'incoming' | 'error', fn: Listener ): unknown;
    off( event: 'incoming' | 'error', fn?: Listener ): unknown;
    start( name: string, options: { to: CallUser; type?: SdkCallType } ): Promise<SdkCall>;
    /** Starts the call in a token from the app's own server. */
    startCall( token: string ): Promise<SdkCall>;
    /** A token from a route of the app's own, which gets what is asked in its query. */
    tokenFrom( url: string, ask: Record<string, string | number> ): Promise<string>;
    group( name: string, options?: { type?: SdkCallType } ): Promise<SdkGroupCall>;
    /** Joins the group call in a token from the app's own server. */
    joinGroupCall( token: string ): Promise<SdkGroupCall>;
    people( name: string ): Promise<SdkPerson2[]>;
    /** Whether the page's user may call each person about each call, in the order asked: null where the app can't say. */
    may?( asks: Array<{ call: string; to: CallUser }> ): Promise<Array<boolean | null>>;
    /** The live stream `name` (`calls.stream()`): where the SDK has live streams. */
    stream?( name: string, options?: { video?: boolean } ): Promise<SdkStream>;
    /** Joins the live stream in a token from the app's own server, the function asked again as each runs out. */
    joinStream?( token: string | ( () => string | Promise<string> ), options?: { video?: boolean } ): Promise<SdkStream>;
}

/** A live stream as the SDK's `calls.stream()` answers it: Easy Stream's engine under it, which the stream views draw. */
export interface SdkStream {
    readonly name: string;
    readonly engine: unknown;
    leave(): void;
}

/** What the site's token said about a person: their name and picture, as the SDK opened it. */
export interface SdkInfo {
    name?: string;
    avatar?: string;
}

export const infoOf = ( info: unknown ): SdkInfo => ( info && typeof info === 'object' ? info as SdkInfo : {} );
