import { createContext, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

// What a call screen is drawn from, and what it does: the contract between the screens and whoever runs the call.
// Better Messages' call container provides it from its own engine and LiveKit's room; an app's from the SDK's calls
// (calls/sdk.tsx). Moved from Better Messages' call-container.tsx with its names, so its screens read it as before.

/** A picture or a sound a screen shows: attached to a <video> or an <audio>, and taken off again. LiveKit's tracks are one. */
export interface CallTrack {
    attach( element: HTMLMediaElement ): HTMLMediaElement;
    detach( element: HTMLMediaElement ): HTMLMediaElement;
    readonly attachedElements: HTMLMediaElement[];
    /** The browser's track under it, where whoever runs the call has one: the check before joining reads the microphone's level from it. */
    readonly mediaStreamTrack?: MediaStreamTrack;
}

/** How big a published picture is, once its sender said: what a grid divides its room by before anything is drawn. */
export interface CallPublication {
    dimensions?: { width: number; height: number } | null;
}

/** A connection's quality, as LiveKit names it. */
export type CallConnectionQuality = 'excellent' | 'good' | 'poor' | 'lost' | 'unknown';

/** Where the call's room connection is, as LiveKit names it. */
export type CallConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'signalReconnecting';

/** Someone in the call, `me` the local user (keyed so in `participants`). */
export interface CallParticipant {
    identity       : string,
    name           : string,
    avatar         : string,
    link           : string,
    audioLevel     : number,
    isSpeaking     : boolean,
    isPinned       : boolean,
    quality        : CallConnectionQuality,
    video          : CallTrack | null | undefined,
    videoPub       : CallPublication | null | undefined,
    audio          : CallTrack | null | undefined,
    audioPub       : CallPublication | null | undefined,
    screen         : CallTrack | null | undefined,
    screenPub      : CallPublication | null | undefined,
    screenAudio    : CallTrack | null | undefined,
    screenAudioPub : CallPublication | null | undefined,
    canPublish     : boolean,
    canAdmin       : boolean,
    handRaised     : boolean,
    micMuted       : boolean,
    // away for a moment: the tile stays, marked as reconnecting, without its media
    reconnecting?  : boolean,
    // their camera or screen as the media server paused it for this page, whose download can't carry it now (the
    // room's stream state "paused"): its last frame stays, and the tile says why
    videoPaused?   : boolean,
    screenPaused?  : boolean,
    // their camera moving to another codec during the call (the realtime client's camera-adapt.ts, from their
    // "optimizing" to their "ready"; `me` while the user's own moves): the tile says "Optimizing video quality..." over
    // their last frame (optimizing.tsx), and keeps its place in the grid as a tile with a picture does
    videoOptimizing?: boolean,
    // what of theirs stopped arriving while they are still in the call and nothing holds it back (no mute, no pause),
    // as whoever runs the call reads it off what it receives: `video` their camera, while their sound still comes or
    // their microphone is off; `all` their sound too. Their last frame is blurred, so it doesn't pass for live, and the
    // tile says "Video interrupted", or "Reconnecting..." as for a tile away for a moment (stalled.tsx)
    stalled?       : 'video' | 'all' | null,
    // their camera or screen is sent, whether this page receives it or not: a big call receives only the cameras and
    // screens of the tiles drawn (showTiles), and a tile off the screen still has a picture to take its place in the
    // grid. Missing: as `video` and `screen` say
    videoPublished?: boolean,
    screenPublished?: boolean,
}

export type CallAction = 'outgoing_call' | 'incoming_call' | 'call_in_progress' | 'connecting';

export interface CallInfo {
    thread_id: number,
    message_id: number,
    token: string,
    user_ids: number[],
    type: 'audio' | 'video',
    caller_id?: number,
    encryption_key: string,
    signal_key?: string,
    mode?: 'p2p' | 'sfu',
    // the call server the realtime cloud named for this call (a host name), where its room is joined
    // instead of video_server's: the cloud moves sites onto its call mesh with it
    server?: string
}

/** The conversation a call is in: whose face the private call shows, its first participant. */
export interface CallThread {
    thread_id: number,
    participants: number[],
}

/** What a moderator asks of a group call: `mute_all`, `lock_room`, `pin_participant`, … with whom, and the call's type. */
export interface CallModeration {
    act: string,
    identity?: string,
    type?: 'audio' | 'video',
    // For `mute_all` and `unmute_all`: whose microphones, everyone in the call but its moderators, so the app can mute
    // each microphone rather than ask the call server to silence the room.
    identities?: string[],
}

export interface CallContextInterface {
    wrapper: MutableRefObject<HTMLDivElement | null>,
    thread: CallThread,
    callInfo: CallInfo,
    adminMode: boolean,
    canPublish: boolean,
    statusMessage: string,
    /** The person's own upload is jammed (the calls engine's upload-jam judge): a warning mark where the call says its connection, with the words in a tip (upload-jam.tsx). */
    uploadJammed?: boolean,
    participants: Map<string, CallParticipant>,
    participantsRef: MutableRefObject<Map<string, CallParticipant>>,
    action: CallAction | null,
    errorMessages: string[],
    callDurationRef: MutableRefObject<number>,
    bytesReceivedRef: MutableRefObject<number>,
    bytesSentRef: MutableRefObject<number>,
    connectionState: CallConnectionState,
    endCall: ( action?: 'abort' | 'reject' | 'rejected' ) => Promise<void>
    answerCall: () => Promise<boolean>,
    activeCameraDevice: string,
    setActiveCameraDevice: Dispatch<SetStateAction<string>>,
    selectedCameraDevice: string,
    setSelectedCameraDevice: Dispatch<SetStateAction<string>>,
    selectedMicrophoneDevice: string,
    setSelectedMicrophoneDevice: Dispatch<SetStateAction<string>>,
    selectedSpeakerDevice: string,
    setSelectedSpeakerDevice: Dispatch<SetStateAction<string>>,

    fullScreenEnabled: boolean,
    setFullScreenEnabled: Dispatch<SetStateAction<boolean>>,

    myCameraTrack: CallTrack | null,
    myCameraTrackRef: MutableRefObject<CallTrack | null>,
    myMicrophoneTrack: CallTrack | null,
    myMicrophoneTrackRef: MutableRefObject<CallTrack | null>,

    myScreenVideoTrack: CallTrack | null,
    myScreenVideoTrackRef: MutableRefObject<CallTrack | null>,

    switchingCamera: boolean,
    switchCamera: () => Promise<void>,
    enableCamera: () => Promise<void>,
    disableCamera: () => Promise<void>,
    /**
     * The camera being checked before it goes out (the realtime client's camera-check.ts, a few seconds at most): the
     * camera control spins meanwhile, as a room's controls do while their request is out. Missing: never.
     */
    cameraChecking?: boolean,
    /**
     * The camera turning on, from a press until the call has its track: with a background chosen that waits for the
     * effect to start too. The call screen says so itself of the presses it hands on (turning-on.ts), and the control
     * spins; a host may say so of a camera it turns on by itself. Missing: only those presses.
     */
    cameraTurningOn?: boolean,
    /**
     * The longest a tile says "Optimizing video quality..." from when the camera's move began, ms: the node's (its codec
     * policy's tune.failsafeS, the realtime client's cameraTune()). Missing: 10 s (optimizing.tsx, OPTIMIZING_MAX_MS).
     */
    optimizingMaxMs?: number,

    enableMic: () => Promise<void>,
    disableMic: () => Promise<void>,
    /** The microphone turning on, as `cameraTurningOn` the camera: with the noise removal chosen, until it starts. */
    microphoneTurningOn?: boolean,

    enableFullScreen: () => void,
    disableFullScreen: () => void,

    enableShareScreen: () => Promise<void>,
    disableShareScreen: () => Promise<void>,

    roomLocked: boolean,
    setRoomLocked: Dispatch<SetStateAction<boolean>>,
    roomMuted: boolean,
    setRoomMuted: Dispatch<SetStateAction<boolean>>,

    raiseHand: () => Promise<void>,
    // These three may say whether the request went through: false keeps a tile's control from waiting for a change
    // that won't come (see inc/calls/pending.ts).
    lowerHand: (identity: string) => Promise<boolean | void>,
    lowerAllHands: () => Promise<void>,
    myHandRaised: boolean,
    myMicMuted: boolean,

    callMode: 'participatory' | 'broadcast',
    setCallMode: (mode: 'participatory' | 'broadcast') => Promise<void>,
    promoteParticipant: (identity: string) => Promise<boolean | void>,
    demoteParticipant: (identity: string) => Promise<boolean | void>,

    /**
     * Asks the call's server to moderate: resolves with its answer, rejects with what went wrong (the screens show
     * it). Better Messages posts it to its `groupCallAdmin` route.
     */
    moderate: ( request: CallModeration ) => Promise<unknown>,

    /**
     * The acts of `moderate` this call takes, where it takes only some (`remove_participant`, `mute_mic`, …): every one
     * where it lists none, as Better Messages' calls do. The screens draw no control for any other.
     */
    moderation?: readonly string[],

    /**
     * Whom the user may bring into the call, when whoever runs it can add people: the screens then offer Add Person,
     * and the call goes on as a group call. Better Messages provides none, and its screens draw no such button.
     */
    people?: () => Promise<CallPerson[]>,
    addPerson?: ( person: CallPerson ) => Promise<void>,

    iconsReverted: boolean,
    fullScreenAvailable?: boolean,

    /**
     * Tell the user, once a group call is joined with their microphone and camera off, that they are and that the dock
     * turns them on, with Preview (Test Microphone on an audio call), which opens the device settings with that running
     * for them alone (device-panel.tsx). Missing or false: nothing is said, and the settings open from the dock.
     */
    devicesOnJoin?: boolean,

    /**
     * The user's own choice about that notice, kept where the app keeps the user's settings: `shown` false and it is not
     * said to them, however `devicesOnJoin` is; `dontShowAgain` keeps that choice, from the notice's Do Not Show Again,
     * which it has only where this is given. The app gives the way back (a setting of the user's).
     */
    joinNotice?: { shown: boolean, dontShowAgain: () => void },

    /**
     * Tell the user who talks with their microphone muted that they are muted, with Unmute (muted-hint.tsx). It keeps a
     * microphone open while muted to hear them, measured on the device and never sent, so the browser shows the
     * microphone in use all through the call. Missing or false: muting lets go of the microphone and says nothing.
     */
    mutedHint?: boolean,

    /**
     * A group call opens its picture-in-picture window by itself as the user leaves the tab, where the browser offers
     * that (Chrome's and Edge's automatic picture-in-picture for a page that uses the camera or the microphone, which the
     * user can turn off there). Missing or false: it opens only from the dock's More.
     */
    autoPictureInPicture?: boolean,

    /**
     * Ends a group call for everyone in it, the moderator too: Host Controls offers it where it is set and the call
     * takes `end_call` (moderation-panels.tsx), and asks once more before it runs. Missing: no such row.
     */
    endForEveryone?: () => Promise<unknown>,

    /**
     * Removes someone from a group call and keeps them out of its calls for a while: a person's menu offers Remove and
     * Ban from Calls… beside Remove from Call where it is set (moderation-panels.tsx). Whoever runs the call asks for how
     * long in a dialog of its own, and, where the call has a chat it keeps, whether from the chat too, then refuses them
     * the call's join until then. Missing: Remove from Call alone.
     */
    banFromCalls?: ( participant: CallParticipant ) => void,

    /**
     * The ban's dialog, where the call screen asks for how long itself (ban-dialog.tsx), as an app's call does: whom, the
     * longest a ban may be in minutes, the ban, and Cancel. Better Messages asks in its own dialog and sets none.
     * Missing: no dialog is drawn.
     */
    banning?: { participant: CallParticipant, most: number, ban: ( minutes: number ) => Promise<unknown>, cancel: () => void } | null,

    /**
     * Spotlight for everyone: whom a moderator put on the main tiles for everyone in a group video call, by identity, in
     * the order they were spotlighted, up to four (spotlight.tsx), as the room's state says it (Better Messages: the
     * room's metadata; an SDK call: its group's `spotlight`). A moderator spotlights with `spotlight_participant` and
     * takes someone out with `unspotlight_participant`, everyone where it names nobody. Missing: nobody.
     */
    spotlight?: readonly string[],

    /**
     * Which tiles a screen draws now, by tile key (`me` too), so whoever runs the call receives only their cameras and
     * screens, as a big call needs on the device: `source` names the screen ('grid', 'pip'), the keys
     * of each kept apart and taken together. Called again as the page, the layout or the people change, and with none as
     * the screen goes. Every sound is received whatever is drawn. Missing: everything is received.
     */
    showTiles?: ( source: string, keys: readonly string[] ) => void,

    /**
     * Whoever runs the call puts the effects the device settings offer on what it sends: a blurred or replaced
     * background on the camera, the noise removed from the microphone (inc/calls/effects.ts, useTrackEffects for the
     * room client's tracks, TrackEffect for a browser's own). The settings offer each only where this is set, the host
     * serves the effects (UiHost.effectsUrl) and the browser can run it. Missing: no effects.
     */
    effects?: boolean,

    /**
     * The call's recording (calls/recording.tsx): Host Controls offers Record to whoever `can`, and the REC mark on the
     * dock shows while it runs, to whoever `can` (they stop it from there) and, where the host's admin chose `show`, to
     * everyone. Missing: nothing about recording shows, as in a call between two people.
     */
    recording?: CallRecording,

    /**
     * A moderator asking someone to turn on their camera or microphone, and that person's answer (ask-prompt.tsx): a
     * person's menu offers Ask to Turn On Camera and Ask to Turn On Microphone while theirs is off, sent with the
     * `moderate` acts `ask_camera` and `ask_microphone`, and the person is shown the ask over their dock until they
     * answer. While both are off on a video call it offers one row for both in their place, sent with the act
     * `ask_camera_microphone`, where the call takes that act too (`moderation`). Missing: neither.
     */
    turnOnAsks?: TurnOnAsks,

    // The conversation beside the call, for the dock's Show Chat / Hide Chat. No toggle where the call has no chat
    // beside it to show, as for an app's call screen.
    chatShown?: boolean,
    chatToggle?: Dispatch<SetStateAction<boolean>> | null
}

/**
 * A moderator's ask that the user turn on a device: `by` is the moderator's identity in the call. An ask for both
 * devices comes as two, one for each under the same id: the prompt shows them as one card while both are off, and
 * answers and puts them away a device at a time. The answers carry that id, so the moderator hears them as one where
 * they agree. One moderator's two asks for the two devices show as one card too.
 */
export interface TurnOnAsk {
    id: string,
    device: 'camera' | 'microphone',
    by: string,
}

/**
 * What became of an ask: turned on, not now, the browser blocks the device, there is none, or another app holds it.
 * Nothing more of the person's device is told.
 */
export type TurnOnAnswerKind = 'on' | 'not_now' | 'blocked' | 'no_device' | 'busy';

/** An answer to one of the user's asks: `from` is the identity of whoever was asked. */
export interface TurnOnAnswer {
    id: string,
    from: string,
    device: 'camera' | 'microphone',
    answer: TurnOnAnswerKind,
}

export interface TurnOnAsks {
    /** The ask the user was sent last, until they turn the device on or say not now. */
    received: TurnOnAsk | null,
    /**
     * Every ask the user has not answered yet, the oldest first, `received` the newest of them: two moderators may ask,
     * and each hears the answer to their own. An answer for a device goes to each ask for it, and an ask for the other
     * device shows once those are put away. Missing: `received` alone.
     */
    pending?: readonly TurnOnAsk[],
    /** The answers the user's own asks got, the newest last. */
    answers: readonly TurnOnAnswer[],
    /** The user's answer to an ask, sent to whoever asked: a stuck device's too, while the ask stays for Try Again. */
    answer: ( ask: TurnOnAsk, answer: TurnOnAnswerKind ) => void,
    /**
     * The ask put away, answered: the app takes it out of `pending`, and `received` is the newest left. Found by its
     * id and device, as the two of an ask for both share the id.
     */
    dismiss: ( ask: TurnOnAsk ) => void,
}

/**
 * A group call's recording, as whoever runs the call knows it: the WordPlus SDK's recordings on a WordPress site, the
 * app's server's `realtime.recordings` for an app. `since` is when it started, in seconds.
 */
export interface CallRecording {
    state: 'off' | 'starting' | 'on' | 'stopping',
    /** The recording's own id, which an answer to its notice or its question is kept by. */
    id?: number | string,
    since?: number,
    /** Whether the user may start and stop it. */
    can: boolean,
    /**
     * How everyone else in the call is told it is recorded, as it starts and as they join: REC beside the call controls
     * alone (`indicator`), not at all with its moderators alone seeing REC (`moderators`), a notice (by default), a
     * question to stay or leave, or the same question with their microphone and camera kept off until they agree.
     */
    tell?: 'indicator' | 'moderators' | 'notice' | 'ask' | 'muted',
    /**
     * The user's own choice about the notice, kept where the app keeps the user's settings: `shown` false and they see
     * REC alone; `dontShowAgain` keeps that choice, from the notice's Do Not Show Again, which it has only where this is
     * given. The question to stay or leave is consent, and is asked whatever this says.
     */
    notice?: { shown: boolean, dontShowAgain: () => void },
    /** Who started it, by name. */
    by?: string,
    /** Whether the user started it: they are told and asked nothing. */
    mine?: boolean,
    /** The admin's settings, which the start's confirm lists. */
    settings?: RecordingSummary,
    start: () => Promise<unknown>,
    stop: () => Promise<unknown>,
}

/** What a recording is made with and who may watch it, as the start's confirm lists it. */
export interface RecordingSummary {
    /** The height of the video, 720 or 1080. */
    size?: number,
    /** `speaker`, `gallery` or `speaker_only`. */
    layout?: string,
    /** An audio call's: `call` (listed as the call shows it) or `gallery`. */
    audioLayout?: string,
    transcript?: boolean,
    /** `auto`, or the language of everyone's speech, as a code. */
    language?: string,
    /** Who may watch it afterwards: `admins` where it goes only to the site's own list. */
    watch?: 'moderators' | 'people' | 'everyone' | 'admins',
    /** Days it is kept, 0 until deleted. */
    keepDays?: number,
}

/** Someone the user may add to a call. */
export interface CallPerson {
    id: number | string,
    name: string,
    avatar?: string,
}

export const callInfoDefaults: CallInfo = {
    thread_id: undefined as unknown as number,
    message_id: undefined as unknown as number,
    token: undefined as unknown as string,
    user_ids: undefined as unknown as number[],
    type: undefined as unknown as 'audio',
    caller_id: undefined,
    encryption_key: undefined as unknown as string,
    signal_key: undefined,
    mode: undefined,
    server: undefined
};

// The defaults a screen drawn outside a call sees: nothing is in it, and nothing it would call is there.
const missing = null as never;

export const CallContext = createContext<CallContextInterface>({
    wrapper: missing,
    thread: missing,
    callInfo: callInfoDefaults,
    adminMode: false,
    canPublish: false,
    statusMessage: '',
    participants: new Map(),
    participantsRef: missing,
    action: null,
    errorMessages: [],
    connectionState: 'disconnected',
    callDurationRef: missing,
    bytesReceivedRef: missing,
    bytesSentRef: missing,
    endCall: missing,
    answerCall: missing,
    activeCameraDevice: '',
    setActiveCameraDevice: missing,
    selectedCameraDevice: '',
    setSelectedCameraDevice: missing,
    selectedMicrophoneDevice: '',
    setSelectedMicrophoneDevice: missing,
    selectedSpeakerDevice: '',
    setSelectedSpeakerDevice: missing,
    myCameraTrack: null,
    myCameraTrackRef: missing,
    myMicrophoneTrack: null,
    myMicrophoneTrackRef: missing,
    myScreenVideoTrack: null,
    myScreenVideoTrackRef: missing,
    enableCamera: missing,
    switchCamera: missing,
    switchingCamera: false,
    disableCamera: missing,

    fullScreenEnabled: missing,
    setFullScreenEnabled: missing,

    enableMic: missing,
    disableMic: missing,

    enableFullScreen: missing,
    disableFullScreen: missing,

    enableShareScreen: missing,
    disableShareScreen: missing,

    roomLocked: false,
    setRoomLocked: missing,
    roomMuted: false,
    setRoomMuted: missing,

    raiseHand: missing,
    lowerHand: missing,
    lowerAllHands: missing,
    myHandRaised: false,
    myMicMuted: false,

    callMode: 'participatory',
    setCallMode: missing,
    promoteParticipant: missing,
    demoteParticipant: missing,
    moderate: missing,

    iconsReverted: missing,
    fullScreenAvailable: missing,

    chatShown: true,
    chatToggle: null
});
