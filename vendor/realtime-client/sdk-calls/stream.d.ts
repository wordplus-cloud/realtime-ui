/**
 * A live stream on the app's calls: `calls.stream( name )` asks the app's route
 * for Easy Stream's grant, as `group()` asks for a group call's, joins, and the stream's chat rides the page's one
 * connection, as its rooms do. Easy Stream's engine (`../streams`) runs it; this is the SDK's shape of it, the same object
 * for every role. What a role may not do rejects with the cloud's code (`not_host`, `read_only`, `no_stage` …).
 *
 * The app's users are named by their ids, as its grants name them (`sub`); the cloud's own names for them (`u:<id>`, a
 * place in the room `u:<id>.<8 hex>`) stay inside.
 */
import { type Listener } from '../channel.js';
import type { ChatMessage, Hand, Layout, Reaction, Role, StreamState as StreamInfo, You } from '../streams/protocol.js';
import type { LayerQuality, PictureLayer, PlaybackStats } from '../streams/playback-types.js';
export type { LayerQuality, PictureLayer, PlaybackStats };
export type StreamState = 'idle' | 'live' | 'ended';
export type StreamEvent = 'state' | 'viewers' | 'tiles' | 'message' | 'hands' | 'invited' | 'stage' | 'waiting' | 'error' | 'change';
/** A hand raised to come on stage, as its hosts see it: the user by the app's id, their name, and since when (ms). */
export interface StreamHand {
    user: string;
    name: string;
    at: number;
}
/** A picture or a sound on the stage: the room client's track. */
export interface StreamTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    attach(element?: HTMLMediaElement): HTMLMediaElement;
    detach(element?: HTMLMediaElement): unknown;
}
/** Someone on the stage, or OBS's picture (`encoder`). */
export interface StreamTile {
    identity: string;
    name: string;
    avatar?: string | null;
    role: Role;
    local: boolean;
    camera: StreamTrack | null;
    screen: StreamTrack | null;
    audio: StreamTrack[];
    micMuted: boolean;
    speaking: boolean;
    encoder: boolean;
}
/** The stream as a screen of one's own draws it: Easy Stream's state, the parts an app reads. */
export interface StreamSnapshot {
    status: 'joining' | 'ready' | 'error';
    error: string | null;
    stream: StreamInfo | null;
    you: You | null;
    viewers: number;
    audience: number | null;
    chat: ChatMessage[];
    pinned: ChatMessage | null;
    slow: number;
    timeoutUntil: number | null;
    hands: Hand[];
    handRaised: boolean;
    invited: boolean;
    onStage: boolean;
    media: 'off' | 'connecting' | 'waiting' | 'live' | 'reconnecting';
    waitUntil: number | null;
    tiles: StreamTile[];
    layout: Layout;
    audioBlocked: boolean;
    devices: {
        camera: boolean;
        microphone: boolean;
    };
    screenSharing: boolean;
    canShareScreen: boolean;
    reactionsOn: boolean;
    encoder: {
        url: string;
        key: string;
    } | null;
}
type Answer = Promise<{
    ok: boolean;
    error?: string;
}>;
/** The engine as this file uses it (../streams/client.ts, EasyStreamClient). @internal */
export interface StreamEngine {
    getState(): StreamSnapshot;
    subscribe(listener: () => void): () => void;
    stop(): void;
    wantVideo(): void;
    startAudio(): Promise<void>;
    react(kind: Reaction): void;
    raiseHand(up: boolean): Answer;
    acceptStage(): Answer;
    leaveStage(): Promise<unknown>;
    sendChat(text: string): Answer;
    deleteMessage(id: string): Answer;
    pin(id: string): Answer;
    unpin(): Answer;
    timeOut(identity: string, seconds: number): Answer;
    setSlow(seconds: number): Answer;
    clearChat(): Answer;
    startPreview(devices?: {
        camera?: boolean;
        microphone?: boolean;
    }): Promise<unknown>;
    setCamera(on: boolean): Promise<unknown>;
    setMicrophone(on: boolean): Promise<unknown>;
    setScreenShare(on: boolean): Promise<boolean>;
    goLive(): Answer;
    end(): Answer;
    invite(identity: string): Answer;
    unstage(identity: string): Answer;
    setLayout(mode: Layout['mode'], identity?: string): Answer;
    useEncoder(renew?: boolean): Answer;
    kick(identity: string): Answer;
    ban(identity: string): Answer;
    playbackStats(): PlaybackStats;
    pictureLayers(track: unknown): PictureLayer[];
    setQuality(quality: 'auto' | LayerQuality): void;
}
export declare class Stream {
    readonly name: string;
    private readonly listeners;
    private last;
    private readonly unsubscribe;
    /**
     * Easy Stream's engine under the stream, which @wordplus/realtime-ui's stream views (its StreamView and the
     * `<live-stream>` element) draw as Easy Stream does. @internal
     */
    readonly engine: StreamEngine;
    /** @internal */
    constructor(name: string, engine: StreamEngine);
    /** `host`, `guest` or `viewer`, as the app's grant made this user. */
    get role(): Role | null;
    /** `idle` before it starts, `live`, `ended`. */
    get state(): StreamState;
    /** How many watch now. */
    get viewers(): number;
    /** Everyone on the stage, with their pictures and sound (`camera`, `screen`, `audio`: the room client's tracks). */
    get tiles(): StreamTile[];
    /** The chat's last messages, oldest first. */
    get messages(): ChatMessage[];
    /** Whether this page waits for a place: the stream is full, and the join goes on by itself. */
    get waiting(): boolean;
    /** The hands raised to come on stage, the oldest first: its hosts see them, a viewer none but their own (`handRaised`). */
    get hands(): StreamHand[];
    /** Whether this page is on stage as a guest, sending its camera and microphone. */
    get onStage(): boolean;
    /** The stream as it is now, for a screen of one's own; `subscribe` hears every change (React's useSyncExternalStore). */
    snapshot: () => StreamSnapshot;
    subscribe: (fn: () => void) => (() => void);
    /**
     * `state` (StreamState), `viewers` (n), `tiles` (StreamTile[]), `message` (ChatMessage, each one new), `hands`
     * (StreamHand[], for its hosts), `invited` (a host asks this user on stage: `joinStage()`), `stage` (whether this page
     * is on stage now), `waiting` ({ until }: full), `error` ({ code }), `change` (any of it).
     */
    on(event: StreamEvent, fn: Listener): this;
    off(event?: StreamEvent, fn?: Listener): this;
    /**
     * Shows the stream in `video`: the stage's main picture, as it changes, and its sound. Answers a function that
     * stops showing it there.
     */
    watch(video: HTMLVideoElement): () => void;
    /**
     * The stream's sound, where the browser held it back until a click (`snapshot().audioBlocked`): call it from one,
     * such as a "Turn the sound on" button.
     */
    startAudio(): Promise<void>;
    /**
     * How the stream plays here, to debug it: the picture and the sound that arrive, the media server and the way they
     * come, and the session so far (how long the picture took to start, stalls, reconnects), with the last things that
     * happened. Measured in this browser once a second while the picture comes, and sent nowhere.
     */
    stats(): PlaybackStats;
    /**
     * The layers of the main picture a viewer may choose, the best first, each `high`, `medium` or `low` with its size:
     * what `setQuality()` chooses from. None above 720p, which comes only on `auto`, to a player big enough for it. None
     * before the picture arrives, and for a host's own.
     */
    qualities(): PictureLayer[];
    /**
     * The picture's quality: one of the layers `qualities()` gives whatever the player's size, or `auto`, the default, by
     * its size. A layer above 720p chosen still gives 720p.
     */
    setQuality(quality: 'auto' | LayerQuality): void;
    /**
     * A reaction everyone watching sees float up: any one emoji. The player offers ❤️ 👏 😂 😮 🔥 unless the page offers
     * its own.
     */
    react(kind: Reaction): void;
    /** Asks to come on stage, or no longer. */
    hand(up: boolean): Promise<void>;
    /** Comes on stage when invited (`invited`), with the camera and microphone. */
    joinStage(): Promise<void>;
    leaveStage(): Promise<void>;
    /** The chat: writing, and for its moderators, keeping it. */
    readonly chat: {
        send: (text: string) => Promise<void>;
        delete: (id: string) => Promise<void>;
        pin: (id: string) => Promise<void>;
        unpin: () => Promise<void>;
        timeout: (user: string | number, seconds: number) => Promise<void>;
        slow: (seconds: number) => Promise<void>;
        clear: () => Promise<void>;
    };
    /** The camera and microphone, shown here before going live. */
    preview(devices?: {
        camera?: boolean;
        microphone?: boolean;
    }): Promise<void>;
    setCamera(on: boolean): Promise<void>;
    setMicrophone(on: boolean): Promise<void>;
    /** Shares a screen in place of the camera, or stops; whether it is shared now. */
    setScreenShare(on: boolean): Promise<boolean>;
    goLive(): Promise<void>;
    end(): Promise<void>;
    /** Asks someone who raised a hand, or anyone watching, on stage; `unstage` takes them off. */
    invite(user: string | number): Promise<void>;
    unstage(user: string | number): Promise<void>;
    /** How the stage shows: everyone in a grid, the one speaking large, or one person in the spotlight. */
    layout(mode: Layout['mode'], user?: string | number): Promise<void>;
    /** Where OBS streams to, over WHIP, and its key; `renew` makes a new key, which cuts off one using the old. */
    ingest(renew?: boolean): Promise<{
        url: string;
        key: string;
    }>;
    kick(user: string | number): Promise<void>;
    ban(user: string | number): Promise<void>;
    /** Leaves the stream: its picture, what this page sends, and its chat. */
    leave(): void;
    private changed;
}
