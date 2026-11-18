import type { ChatMessage, Reaction } from "./protocol.js";
export declare const TEST_REGISTRY = "wordplusLiveStreamTests";
export declare const TEST_CHAT_MAX = 200;
export declare const TEST_IDENTITY = "local";
export interface TestMedia {
    camera: MediaStreamTrack | null;
    screen: MediaStreamTrack | null;
    audio: MediaStreamTrack[];
    micMuted: boolean;
}
export type TestEvent = {
    type: 'change';
} | {
    type: 'reaction';
    kind: Reaction;
};
export declare class TestFeed {
    readonly stream: string;
    readonly host: {
        name: string;
        avatar: string | null;
    };
    readonly startedAt: number;
    endedAt: number | null;
    media: TestMedia;
    chat: ChatMessage[];
    watching: number;
    private readonly listeners;
    private seq;
    constructor(stream: string, host: {
        name: string;
        avatar: string | null;
    }, startedAt: number);
    listen(listener: (event: TestEvent) => void): () => void;
    update(media: TestMedia): void;
    end(at?: number): void;
    watch(): () => void;
    say(text: string): ChatMessage | null;
    react(kind: Reaction): void;
    private tell;
}
type Scope = Record<string, unknown>;
export declare function publishTest(feed: TestFeed, scope?: Scope): void;
export declare function withdrawTest(feed: TestFeed, scope?: Scope): void;
export declare function openerTest(stream: string, scope?: Scope): TestFeed | null;
export declare const TEST_CHANNEL = "wplus-live-stream-test";
export interface TestWord {
    test: 'on' | 'off' | 'ask';
    stream: string;
}
export interface TestWords {
    say(word: TestWord): void;
    close(): void;
}
export declare function testChannel(listen: (word: TestWord) => void, scope?: Scope): TestWords | null;
export declare class TestTrack {
    readonly mediaStreamTrack: MediaStreamTrack;
    readonly sid: string;
    private readonly attached;
    private silent;
    constructor(mediaStreamTrack: MediaStreamTrack, silent?: boolean);
    get kind(): string;
    attach(element: HTMLMediaElement): HTMLMediaElement;
    detach(element?: HTMLMediaElement): HTMLMediaElement[];
    setSilent(silent: boolean): void;
    private play;
}
export {};
