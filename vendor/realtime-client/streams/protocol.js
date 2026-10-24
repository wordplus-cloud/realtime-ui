// Easy Stream protocol, version 1: what a site signs, what the cloud answers, and
// what travels over the chat socket. Types and limits only, so the browser client and the backend
// helpers share them without pulling in each other's code.
//
// Under Live Stream's names: the grant's audience and key label, and the endpoints under /live-stream/v1. The cloud
// still takes the names before them (`easy-stream`, `easy-stream grant v1`, /easy-stream/v1), which earlier clients use.
export const GRANT_AUDIENCE = 'live-stream';
export const GRANT_KEY_LABEL = 'live-stream grant v1';
export const GRANT_MAX_LIFETIME_S = 7 * 24 * 3600;
export const STREAM_ID = /^[A-Za-z0-9-]{1,64}$/;
export const USER_ID = /^[\w.@-]{1,64}$/;
export const JOIN_PATH = '/live-stream/v1/join';
// Where an encoder (OBS) posts its offer over WHIP, with the stream's ingest key as its bearer token, and
// the identity it has in the stream's room.
export const WHIP_PATH = '/live-stream/v1/whip';
export const INGEST_IDENTITY = 'ingest';
// A site's live streams, once (`?site=`), with how many watch each: a Live now list's, and a page's that follows a stream
// without watching it.
export const LIVE_PATH = '/live-stream/v1/live';
// A site's server turns a stream's reactions off or on, with a host's grant for it: `{ grant, on }`.
export const REACTIONS_PATH = '/live-stream/v1/reactions';
export const CHAT_MAX = 500;
export const SLOW_MAX_S = 300;
// A reaction is one emoji, which a site chooses for its streams: these where it chooses none. The cloud takes any one
// emoji, and the names players sent before (REACTION_EMOJI's) as their emoji. A player offers the site's and shows no
// other.
export const REACTIONS = ['❤️', '👏', '😂', '😮', '🔥'];
export const REACTION_EMOJI = { heart: '❤️', clap: '👏', laugh: '😂', wow: '😮', fire: '🔥' };
// The largest picture a viewer may choose, by its short side: Full HD comes only on auto, to a player that needs it.
export const CHOSEN_MAX_SIDE = 720;
export const CLAIM_ORDER = ['iss', 'aud', 'str', 'role', 'sub', 'name', 'avatar', 'chat', 'mod', 'src', 'q', 'stage', 'offline', 'links', 'fresh', 'people', 'viewers', 'reactions', 'track', 'autostart', 'org', 'iat', 'exp'];
// The check a site's admin and a host's studio ask (`POST`, `{grant}`): whether the cloud takes the site's grants,
// and what it has left.
export const CHECK_PATH = '/live-stream/v1/check';
export const LAYOUTS = ['grid', 'speaker', 'spotlight'];
// A timeout lasts from a minute to a day.
export const TIMEOUT_MIN_S = 60;
export const TIMEOUT_MAX_S = 24 * 3600;
