export declare const GRANT_AUDIENCE = "easy-stream";
export declare const GRANT_KEY_LABEL = "easy-stream grant v1";
export declare const GRANT_MAX_LIFETIME_S: number;
export declare const STREAM_ID: RegExp;
export declare const USER_ID: RegExp;
export declare const JOIN_PATH = "/easy-stream/v1/join";
export declare const WHIP_PATH = "/easy-stream/v1/whip";
export declare const INGEST_IDENTITY = "ingest";
export declare const LIVE_PATH = "/easy-stream/v1/live";
export declare const REACTIONS_PATH = "/easy-stream/v1/reactions";
export declare const CHAT_MAX = 500;
export declare const SLOW_MAX_S = 300;
export declare const REACTIONS: readonly ["❤️", "👏", "😂", "😮", "🔥"];
export declare const REACTION_EMOJI: Readonly<Record<string, string>>;
export declare const CHOSEN_MAX_SIDE = 720;
export type Role = 'host' | 'guest' | 'viewer';
export type Source = 'camera' | 'microphone' | 'screen';
export type Quality = '720p' | '1080p';
export type ChatRight = 'write' | 'read';
export type Reaction = string;
export interface GrantClaims {
    iss: string;
    aud?: typeof GRANT_AUDIENCE;
    str: string;
    role: Role;
    sub?: string;
    name?: string;
    avatar?: string;
    chat?: ChatRight;
    mod?: boolean;
    src?: Source[];
    q?: Quality;
    stage?: boolean;
    offline?: 'open' | 'closed';
    links?: boolean;
    fresh?: boolean;
    people?: 'all' | 'mods';
    reactions?: boolean;
    track?: boolean;
    org?: string[];
    iat?: number;
    exp: number;
}
export declare const CLAIM_ORDER: readonly ["iss", "aud", "str", "role", "sub", "name", "avatar", "chat", "mod", "src", "q", "stage", "offline", "links", "fresh", "people", "reactions", "track", "org", "iat", "exp"];
export type StreamPhase = 'idle' | 'live' | 'ended';
export interface StreamState {
    id: string;
    state: StreamPhase;
    started_at: number | null;
    ended_at: number | null;
}
export interface LiveStream {
    id: string;
    started_at: number;
    viewers: number;
}
export interface You {
    identity: string;
    role: Role;
    name: string;
    chat: ChatRight;
    mod: boolean;
    stage?: boolean;
    src?: Source[];
    quality?: Quality;
    offline?: 'open' | 'closed' | null;
    links?: boolean;
    people?: boolean;
}
export interface Person {
    identity: string;
    name: string;
    avatar: string | null;
    role: Role;
    timeoutUntil?: number;
}
export interface Banned {
    identity: string;
    name: string;
    avatar: string | null;
    at: number | null;
}
export interface MediaSeat {
    url: string;
    token: string;
}
export interface JoinReply {
    ok: true;
    stream: StreamState;
    you: You;
    media: MediaSeat;
    audience?: number;
    chat: {
        url?: string;
        path: string;
        namespace: string;
        token: string;
        multi?: boolean;
    };
    usage?: Usage | null;
}
export interface Usage {
    included_left_seconds: number | null;
    credits_left: number | null;
    borrowed_seconds?: number | null;
    allowance_seconds?: number | null;
    admit: boolean;
    unmetered_viewers?: number | null;
    buy_url: string | null;
    at: number;
}
export declare const CHECK_PATH = "/easy-stream/v1/check";
export type JoinError = 'bad_request' | 'bad_grant' | 'expired' | 'not_licensed' | 'not_included' | 'wrong_origin' | 'banned' | 'rate' | 'no_hours' | 'server';
export interface JoinFailure {
    ok: false;
    error: JoinError;
    retry_after?: number;
}
export interface ChatMessage {
    id: string;
    from: {
        id: string;
        name: string;
        avatar: string | null;
        role: Role;
    };
    text: string;
    at: number;
}
export interface Hand {
    identity: string;
    name: string;
    at: number;
}
export interface Layout {
    mode: 'grid' | 'speaker' | 'spotlight';
    identity: string | null;
    corner?: Corner;
}
export interface Corner {
    x: number;
    y: number;
}
export declare const LAYOUTS: readonly ["grid", "speaker", "spotlight"];
export declare const TIMEOUT_MIN_S = 60;
export declare const TIMEOUT_MAX_S: number;
export interface Hello {
    stream: StreamState;
    you: You;
    viewers: number;
    peak?: number;
    slow: number;
    history: ChatMessage[];
    hands: Hand[];
    pinned?: ChatMessage | null;
    layout?: Layout;
    timeout?: number | null;
    reactions?: boolean;
}
export type Ack<T extends object = {}> = ({
    ok: true;
} & T) | {
    ok: false;
    error: string;
};
export interface IngestReply {
    key: string;
    path: string;
}
export interface Watched {
    w: string;
    key: string;
    hello: Hello;
}
export interface ServerEvents {
    hello: (hello: Hello) => void;
    state: (state: StreamState) => void;
    chat: (message: ChatMessage) => void;
    chat_deleted: (p: {
        id: string;
    }) => void;
    reactions: (counts: Partial<Record<Reaction, number>>) => void;
    viewers: (p: {
        n: number;
        peak?: number;
    }) => void;
    slow: (p: {
        seconds: number;
    }) => void;
    hands: (hands: Hand[]) => void;
    invited: () => void;
    unstaged: () => void;
    banned: () => void;
    pinned: (p: {
        message: ChatMessage | null;
    }) => void;
    layout: (layout: Layout) => void;
    muted: () => void;
    timeout: (p: {
        until: number;
    }) => void;
}
