import type { createLocalScreenTracks, createLocalTracks, Room, RoomOptions, Track } from "@wordplus/rtc-client";
import { type RealtimeClient, type RealtimeOptions } from "../index.js";
import { type Banned, type ChatMessage, type Corner, type Hand, type Layout, type Person, type Quality, type Reaction, type Role, type StreamState, type Usage, type You } from "./protocol.js";
import { type Media } from "./media.js";
import { type PictureLayer, type PlaybackStats } from "./playback.js";
import type { SendingStats } from "./playback-types.js";
import { type CameraCodec, type CameraCodecCaps } from "../calls/room-publish.js";
export type MediaPhase = 'off' | 'connecting' | 'waiting' | 'live' | 'reconnecting';
export type VideoChoice = 'auto' | 'high' | 'medium' | 'low';
export type ConnectionHealth = 'good' | 'poor' | 'lost' | 'unknown';
export interface Tally {
    peak: number;
    messages: number;
    reactions: number;
}
export interface DeviceChoice {
    id: string;
    label: string;
}
export interface Devices {
    cameras: DeviceChoice[];
    microphones: DeviceChoice[];
    speakers: DeviceChoice[];
}
export interface MediaStats {
    width: number;
    height: number;
    fps: number;
    kbps: number;
    limited: 'bandwidth' | 'cpu' | null;
    paused?: boolean;
    held?: boolean;
}
export interface Tile {
    identity: string;
    name: string;
    avatar?: string | null;
    role: Role;
    local: boolean;
    camera: Track | null;
    screen: Track | null;
    audio: Track[];
    micMuted: boolean;
    speaking: boolean;
    encoder: boolean;
}
export interface EncoderSetup {
    url: string;
    key: string;
}
export interface FloatingReaction {
    id: number;
    kind: Reaction;
    at: number;
}
export interface EasyStreamState {
    status: 'joining' | 'ready' | 'error';
    error: string | null;
    stream: StreamState | null;
    you: You | null;
    chatConnected: boolean;
    viewers: number;
    audience: number | null;
    usage: Usage | null;
    slow: number;
    chat: ChatMessage[];
    hands: Hand[];
    handRaised: boolean;
    invited: boolean;
    onStage: boolean;
    media: MediaPhase;
    waitUntil: number | null;
    tiles: Tile[];
    audioBlocked: boolean;
    devices: {
        camera: boolean;
        microphone: boolean;
    };
    screenSharing: boolean;
    canShareScreen: boolean;
    reactions: FloatingReaction[];
    encoder: EncoderSetup | null;
    quality: VideoChoice;
    sendQuality: Quality;
    topQuality: Quality;
    connection: ConnectionHealth;
    tally: Tally;
    facing: 'user' | 'environment';
    pinned: ChatMessage | null;
    layout: Layout;
    timeoutUntil: number | null;
    reactionsOn: boolean;
    mutedByHost: number | null;
    elsewhere: boolean;
    sentHere: boolean;
    stalled: boolean;
    offline: boolean;
}
export type GrantSource = string | (() => Promise<string>);
export interface EasyStreamOptions {
    cloud: string;
    grant: GrantSource;
    media?: () => Promise<Media>;
    worker?: string | null;
    video?: boolean;
    fetch?: typeof fetch;
    realtime?: (options: RealtimeOptions) => RealtimeClient;
    Room?: new (options?: RoomOptions) => Room;
    createLocalTracks?: typeof createLocalTracks;
    createLocalScreenTracks?: typeof createLocalScreenTracks;
    random?: () => number;
    cameraCodec?: () => Promise<CameraCodec>;
    codecCaps?: () => Promise<CameraCodecCaps | null>;
}
export type { CameraCodec };
type CodecNavigator = {
    userAgent?: string;
    mediaCapabilities?: {
        encodingInfo?: (config: any) => Promise<{
            supported: boolean;
            powerEfficient?: boolean;
        }>;
    };
};
export declare function cameraCodec(nav?: CodecNavigator | undefined, options?: {
    h265?: boolean;
}): Promise<CameraCodec>;
type Ack = {
    ok: true;
    [key: string]: any;
} | {
    ok: false;
    error: string;
};
export declare function canShareScreen(nav?: {
    mediaDevices?: {
        getDisplayMedia?: unknown;
    };
} | undefined): boolean;
export declare function personOf(identity: string): string;
export declare class EasyStreamClient {
    private readonly options;
    private state;
    private readonly listeners;
    private readonly fetch;
    private readonly realtime;
    private readonly random;
    private lk;
    private lkLoading;
    private mediaRetries;
    private joined;
    private joinedAt;
    private chat;
    private multi;
    private single;
    private watching;
    private watchRound;
    private room;
    private seatUrl;
    private joining;
    private connectingMedia;
    private localTracks;
    private screenTracks;
    private deviceIds;
    private wantedQuality;
    private watchTimer;
    private reactionTimer;
    private reactionSeq;
    private stopped;
    private video;
    private awayWanted;
    private away;
    private recheck;
    private listTimer;
    private awayTimer;
    private site;
    private avatar;
    private stallTimer;
    private onSight;
    private syncTimer;
    private joinTimer;
    private usageTimer;
    private syncing;
    private pictureHolds;
    private readonly playback;
    private readonly sending;
    private pixelDensity;
    private onNetwork;
    constructor(options: EasyStreamOptions);
    wantVideo(): void;
    dropVideo(): void;
    private media;
    getState: () => EasyStreamState;
    subscribe: (listener: () => void) => (() => void);
    private set;
    start(): Promise<void>;
    stop(): void;
    playbackStats(): PlaybackStats;
    sendingDetail(): Promise<SendingStats | null>;
    pictureLayers(track: Track | null | undefined): PictureLayer[];
    setAway(away: boolean): void;
    private wantsAway;
    private settleAway;
    private askListIn;
    private stopList;
    private askList;
    private grant;
    private requestSeats;
    private join;
    private watchUsage;
    private askUsage;
    private sendQualities;
    private renewSeats;
    private openChat;
    private closeChat;
    private watchOn;
    private watchChat;
    private watched;
    private parted;
    private watchFailed;
    private forUs;
    private greet;
    private listen;
    private takeOver;
    private ack;
    private send;
    private addressed;
    private onStreamState;
    private sendingKey;
    private rememberSending;
    private forgetSending;
    private resume;
    private watch;
    private connectMedia;
    private publisherRoom;
    private sendHere;
    private joinRoom;
    private full;
    private mediaFailed;
    private wireRoom;
    private disconnectMedia;
    private followSight;
    private followNetwork;
    private lookAgain;
    private rejoinStalled;
    private arriving;
    private bytesIn;
    private capQuality;
    private holdArrivals;
    private keepEncoderOn;
    private ownHold;
    private followPictures;
    private stopFollowing;
    private soundFollowsPicture;
    private pictureHold;
    private refreshTiles;
    private publishing;
    private previewTiles;
    private stopLocalTracks;
    private openDevices;
    private makeTracks;
    private resolution;
    private cameraOptions;
    private microphoneOptions;
    private localTrack;
    listDevices(): Promise<Devices>;
    useDevice(kind: 'camera' | 'microphone', deviceId: string): Promise<boolean>;
    flipCamera(): Promise<void>;
    localMedia(kind: 'audio' | 'video'): MediaStreamTrack | null;
    sendingStats(): Promise<MediaStats | null>;
    private lastDecoded;
    encoderStats(): Promise<MediaStats | null>;
    private cameraPublishing;
    private codecChoice;
    private chosenCodecs;
    private pickCodecs;
    private publishUnpublished;
    startPreview(devices?: {
        camera?: boolean;
        microphone?: boolean;
    }): Promise<void>;
    setSendQuality(quality: Quality): Promise<Quality>;
    goLive(): Promise<Ack>;
    useEncoder(renew?: boolean): Promise<Ack>;
    leaveEncoder(): void;
    end(): Promise<Ack>;
    setCamera(on: boolean): Promise<void>;
    setMicrophone(on: boolean): Promise<void>;
    private setDevice;
    setScreenShare(on: boolean): Promise<boolean>;
    private stopScreenTracks;
    private stopScreen;
    invite(identity: string): Promise<Ack>;
    unstage(identity: string): Promise<Ack>;
    raiseHand(up: boolean): Promise<Ack>;
    acceptStage(): Promise<Ack>;
    declineStage(): void;
    leaveStage(): Promise<void>;
    sendChat(text: string): Promise<Ack>;
    deleteMessage(id: string): Promise<Ack>;
    ban(identity: string, who?: {
        name: string;
        avatar: string | null;
    }): Promise<Ack>;
    setSlow(seconds: number): Promise<Ack>;
    pin(id: string): Promise<Ack>;
    unpin(): Promise<Ack>;
    timeOut(identity: string, seconds: number): Promise<Ack>;
    liftTimeout(identity: string): Promise<Ack>;
    kick(identity: string): Promise<Ack>;
    bans(): Promise<Ack & {
        bans?: Banned[];
    }>;
    unban(identity: string): Promise<Ack>;
    clearChat(): Promise<Ack>;
    people(): Promise<Ack & {
        people?: Person[];
        watching?: number;
    }>;
    setLayout(mode: Layout['mode'], identity?: string): Promise<Ack>;
    setCorner(corner: Corner | null): Promise<Ack>;
    muteGuest(identity: string): Promise<Ack>;
    react(kind: Reaction): void;
    setQuality(quality: VideoChoice): void;
    startAudio(): Promise<void>;
    private live;
    private startTally;
    private count;
    private addReactions;
}
