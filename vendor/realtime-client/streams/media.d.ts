/**
 * The mesh's room client, as a stream uses it: the parts of @wordplus/rtc-client the engine needs. Never imported
 * here as a value, so no build of this package carries it: the live stream plugin fetches it as wordplus-stream-media.js, the SDK as
 * its rooms script (`loadLiveKit`), and either hands it in as the engine's `media` option.
 */
import type * as rtc from '@wordplus/rtc-client';
export type Media = Pick<typeof rtc, 'ConnectionState' | 'createLocalScreenTracks' | 'createLocalTracks' | 'DisconnectReason' | 'Room' | 'RoomEvent' | 'Track' | 'VideoPreset' | 'VideoPresets' | 'VideoQuality'> & Partial<Pick<typeof rtc, 'isMeshServer'>>;
/** The room client a rooms script put on the page (window.WordPlusRTC), for an engine given no `media`. */
export declare function pageMedia(): Promise<Media>;
