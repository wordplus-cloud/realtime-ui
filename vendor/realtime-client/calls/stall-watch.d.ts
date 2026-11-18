/**
 * Whose media stopped reaching the media server while they are still in a room call. Someone whose connection drops
 * keeps their place in the room until its server gives up on them, 15 s and more, and an encoder that stops keeps its
 * sender in the room for good, and meanwhile their tile showed their last frame as if it were live.
 *
 * The media server decides it. WordPlus Mesh tells each viewer which of the tracks it subscribes to have stopped reaching
 * it (the mesh's rtc/sourcedry_ms.go, Room.meshSourcesDry from rtc-client 1.0.25), read from what arrives of each track,
 * with whatever was meant to stop left out: their mute, a hidden tile here, a layer nobody asks for. This page used to
 * judge it from the frames it decoded itself, which could only say that this page wasn't decoding: its own download, its
 * own stats, or a lookup that missed. On 2026-11-06 an iPhone said "Video interrupted" for 3.4 minutes over a camera it
 * played at 29.5 fps. So this page's own trouble marks nobody now, and a server that doesn't say it marks nobody either.
 *
 * Each sender's verdict, from their streams: `all` when their sound stopped too (or they send only sound), the tile
 * saying "Reconnecting..." as it does once the room says they went; `video` when only their camera stopped while their
 * sound still comes, or with their microphone off. A microphone stopped under a camera that still comes is nothing.
 * No imports, so the unit tests transpile it alone.
 *
 * Moved here from Better Messages' src/main/inc/calls/stall-watch.ts (development 0479d4f8b), unchanged, so its call
 * screen and the SDK's group calls (sdk-calls/group-call.ts) run one mechanism: Better Messages may import it from
 * `@wordplus/realtime-client/calls` in place of its own copy.
 */
/** One received stream the room has now. */
export interface StallStream {
    /** the sender's identity */
    who: string;
    kind: 'camera' | 'microphone';
    /** the track's sid, as the media server names it */
    id: string;
    /** something is meant to come now: not muted on their side, not turned off here (a hidden tile), not paused for this page's download */
    expected: boolean;
}
export type Stalled = 'video' | 'all';
export declare class StallWatch {
    private verdicts;
    /** The room's streams, and the sids the media server says stopped reaching it: the senders whose verdict changed, with the new one (null: none). */
    read(streams: StallStream[], dry: ReadonlySet<string>): Map<string, Stalled | null>;
    /** A sender's verdict now. */
    of(who: string): Stalled | null;
    /** Everything forgotten (the room went): the senders that were stalled. */
    clear(): Map<string, Stalled | null>;
    private replace;
}
