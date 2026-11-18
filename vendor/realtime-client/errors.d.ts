/**
 * What the SDK refuses with, in rooms, calls and live streams alike: a short code, the same in a rejected promise, an
 * `error` event and a call's end, so a page has one thing to read. The docs' errors page says what each means.
 */
/** Every code the SDK and the realtime server name now. Open at its end, as a newer server may name another. */
export type RealtimeErrorCode = 'not_licensed' | 'not_included' | 'wrong_origin' | 'over_capacity' | 'try_later' | 'bad_request' | 'keys_failed' | 'forbidden' | 'no_rule' | 'bad_room' | 'expired' | 'bad_token' | 'too_many' | 'full' | 'auth_failed' | 'no_auth' | 'timeout' | 'server' | 'kicked' | 'left' | 'unopened' | 'gap' | 'not_allowed' | 'bad_event' | 'rate_limited' | 'too_large' | 'not_joined' | 'no_history' | 'no_presence' | 'no_identity' | 'no_user' | 'no_call' | 'call_ended' | 'answered_elsewhere' | 'not_connected' | 'not_ringing' | 'already_in' | 'ringing' | 'not_a_call' | 'not_moderated' | 'spotlight_full' | 'no_minutes' | 'no_credits' | 'already_recording' | 'encryption_unsupported' | 'no_encryption_worker' | 'encryption_failed' | 'publish_failed' | 'room_failed' | 'ended' | 'no_rooms_script' | 'rooms_script_failed' | 'rooms_script_broken' | 'signaling_unavailable' | 'no_webrtc' | 'locked' | 'mic_held' | 'not_offered' | 'asked_recently' | 'device_denied' | 'device_missing' | 'device_busy' | 'no_devices' | 'banned' | 'no_hours' | 'rate' | 'bad_grant' | 'not_host' | 'not_mod' | 'read_only' | 'empty' | 'too_long' | 'not_live' | 'links' | 'slow' | 'anonymous' | 'not_viewer' | 'no_stage' | 'not_invited' | 'devices' | 'no_encoder' | 'self' | 'host' | 'bad_seconds' | 'not_found' | 'bad_identity' | 'bad_id' | 'bad_layout' | 'bad_corner' | 'offline' | (string & {});
/** What an `error` event carries: its code, and what it is about where it is about something. */
export interface RealtimeErrorEvent {
    code: RealtimeErrorCode;
    /** The event that was refused, or that could not be opened. */
    event?: string;
    /** The key missing, for `unopened`. */
    label?: string;
    /** The HTTP status your route answered, for `keys_failed`: none when it did not answer. */
    status?: number;
    [detail: string]: unknown;
}
/** A refusal the realtime server or the app's server answered, by its code (`forbidden`, `rate_limited`, `too_large` …). */
export declare class RealtimeError extends Error {
    readonly code: RealtimeErrorCode;
    constructor(code: RealtimeErrorCode);
}
