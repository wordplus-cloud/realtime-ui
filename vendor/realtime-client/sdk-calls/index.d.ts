/**
 * Calls and group calls for any plugin or app, on the realtime SDK's connection. Its own script
 * (dist/realtime-calls.min.js, window.wordplusRealtimeCalls), so the page script
 * every site loads stays small; the mesh's room client is a third, loaded only when a group call needs it.
 */
import type { Rooms, RoomsOptions } from '../rooms.js';
import { type Calls, type CallsOptions } from './calls.js';
export { calls, Calls, Call, Incoming, type CallsOptions, type CallRequest, type CallGrant, type CallPerson, type CallState, type CallPath, type CallType, type RemoteMedia } from './calls.js';
export { GroupCall, type Person, type RemoteTrack, type RoomPermissions, type ModerationAct, type GroupCallState, type GroupCallPlace } from './group-call.js';
export { callUserOf, type CallUser } from '../calls/users.js';
export { Invite, type InviteState } from './invite.js';
export { Stream, type StreamState, type StreamEvent, type StreamHand, type StreamTile, type StreamTrack, type StreamSnapshot, type PlaybackStats, type PictureLayer, type LayerQuality } from './stream.js';
export { loadLiveKit, type MediaSource, type LiveKit } from './media.js';
export { supportsP2P } from '../calls/index.js';
/**
 * The page's rooms and calls, made once from the server package's settings (`window.wordplusRealtimeConfig`) on the
 * page script's rooms (its `page()`, which a plugin's own code shares; `rooms()` from a copy before it): what the call
 * screen and every plugin's code share, so the page holds one line and a call rings once. Null on a page without the
 * settings (a site without credentials).
 */
export declare function page(config?: RoomsOptions & CallsOptions): {
    rt: Rooms;
    calls: Calls;
} | null;
