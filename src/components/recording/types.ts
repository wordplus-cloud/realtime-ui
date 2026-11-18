/**
 * A recording as a player is handed it: what the WordPlus SDK's `GET wordplus/v1/recordings/{id}` answers, or what an
 * app's own server answers from the realtime server's `recording.ready`. Every address is one the viewer may open: the
 * site's own, or the storage's signed one.
 */
export interface RecordingData {
    id?: number | string;
    title?: string;
    /**
     * A recording of an audio call. Since 1.0.4 it is a video of the call screen as any call's: it is the sound alone
     * only where it has no video (soundOnly()), as one made before.
     */
    audio?: boolean;
    seconds?: number;
    poster?: string;
    sources?: {
        /** The HLS master playlist, its variants and segments linked in. */
        hls?: string;
        /** Each size's MP4 by its height: `{ "720": url, "480": url }`. */
        mp4?: Record<string, string>;
        /** The sound alone (an audio call's, or the extras' M4A). */
        audio?: string;
    };
    /** WebVTT, each cue's speaker as `<v Name>`. */
    captions?: string;
    /** transcript.json's address. */
    transcript?: string;
    /** Where the file downloads from, for those allowed. */
    download?: string;
    startedAt?: number;
    /**
     * The host's dark scheme, which the transcript takes in full screen beside the black picture: CSS colours for its
     * `surface` (the transcript), `text`, `muted` (names, times), `border`, `accent` and `current` (the line playing).
     * Each left out keeps the player's own.
     */
    theme?: RecordingTheme;
}

export interface RecordingTheme {
    surface?: string;
    text?: string;
    muted?: string;
    border?: string;
    accent?: string;
    current?: string;
}

/** transcript.json as the cloud makes it: the speakers by id, the segments in milliseconds. */
export interface TranscriptData {
    speakers: Record<string, { name?: string; language?: string }>;
    segments: Array<{ speaker: string; start: number; end: number; text: string }>;
}

/** One line of the transcript as the player draws it. */
export interface TranscriptLine {
    index: number;
    speaker: string;
    name: string;
    /** Seconds. */
    start: number;
    end: number;
    text: string;
}
