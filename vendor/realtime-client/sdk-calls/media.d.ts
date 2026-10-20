/**
 * The mesh's room client: WordPlus Mesh's @wordplus/rtc-client, built as a script of its own
 * (`realtime-rooms.min.js`, window.WordPlusRTC) and loaded only when a page first needs a room: a group call,
 * or a call between two people that leaves the direct path. Every page that only places direct calls never loads it.
 */
/** The parts of the room client the kit uses, as loose as the library's own types would make them here. */
export interface LiveKit {
    Room: new (options?: Record<string, unknown>) => any;
    RoomEvent: Record<string, string>;
    Track: {
        Source: Record<string, string>;
        Kind: Record<string, string>;
    };
    ConnectionState?: Record<string, string>;
    /** A simulcast layer's size, bitrate and frame rate. */
    VideoPreset?: new (width: number, height: number, maxBitrate: number, maxFramerate?: number) => unknown;
    /** Whether a server is the mesh's, which forwards H.265 (@wordplus/rtc-client 1.0.1 and later). */
    isMeshServer?: (serverUrl: string) => boolean;
    /** End-to-end encryption: the key a room's people share, and whether this browser can encrypt each frame. */
    ExternalE2EEKeyProvider?: new () => {
        setKey(key: string | ArrayBuffer): Promise<void>;
    };
    isE2EESupported?: () => boolean;
}
/** The room client, from `url` the first time: the script the PHP package names in the page's settings (`rooms`). */
export declare function loadLiveKit(url: string | undefined): Promise<LiveKit>;
/**
 * The room client's encryption worker, which encrypts and decrypts every frame: `realtime-rooms-e2ee.worker.js` beside the
 * rooms script unless the page names it. A worker starts only from the page's own address, so one served from another
 * (a site whose plugin files come from a CDN) starts from its text instead.
 */
export declare function encryptionWorker(url: string | undefined, rooms: string | undefined): Promise<Worker>;
/** The kit's names for the sources a person sends, and LiveKit's. */
export type MediaSource = 'camera' | 'microphone' | 'screen_share' | 'screen_share_audio';
export declare function liveKitSource(lib: LiveKit, source: MediaSource): string;
export declare function kitSource(lib: LiveKit, source: string): MediaSource | null;
/** How long a join may wait for a place on the mesh: a full mesh adds a server within minutes. */
export declare const MESH_JOIN_BUDGET_MS: number;
