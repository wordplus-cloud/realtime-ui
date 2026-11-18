// The recording player's control row fitted to its width (player.tsx), and its sound: what folds into the settings
// button and in what order, so the row is one line from a phone to a wide screen, and the volume a browser lets a page
// set, kept for the next recording.

/** A control that folds into the settings button when the row has no room for it. */
export type Folding = "speed" | "quality" | "pip" | "captions" | "download";

/**
 * What folds first: the controls reached for least. Picture in picture goes before the captions, which some people
 * need to follow at all. The time then shortens to where the recording is, and download folds last, below about
 * 370px on a touch screen. Narrower than any phone's page, the seek bar gives way to 48px, then the time goes.
 */
export const FOLD_ORDER: Folding[] = [ "speed", "quality", "pip", "captions" ];

/**
 * The row's widths in px, as _player.scss draws them. A touch screen's buttons are 44px targets, with no gap between
 * them, their own space around an 18px glyph being the gap.
 */
export const ROW = {
    button: 36,
    touchButton: 44,
    speed: 48,
    quality: 72,
    gap: 4,
    touchGap: 0,
    pad: 16,
    touchPad: 8,
    seek: 96,
    leastSeek: 48,
    slider: 72,
    char: 7,
} as const;

export interface RowNeeds {
    /** The row's width, 0 before it is measured. */
    width: number;
    touch: boolean;
    /** The recording's length as the clock shows it, which sizes the time. */
    duration: string;
    speed: boolean;
    quality: boolean;
    captions: boolean;
    pip: boolean;
    download: boolean;
    full: boolean;
    /** A volume slider to open beside the speaker. */
    slider: boolean;
}

/** The time as "12:34 / 45:03", "12:34" alone, or not at all. */
export type TimeShown = "long" | "short" | "none";

export interface RowPlan {
    /** In the settings button, in FOLD_ORDER. */
    folded: Folding[];
    time: TimeShown;
    /** The seek bar's least width: ROW.seek, less only where nothing else is left to fold. */
    seek: number;
    /** Room for the volume slider in the row, else it opens over the row. */
    sliderInline: boolean;
}

/** The time's width: "12:34 / 45:03", or "12:34" short. */
export function timeWidth( duration: string, time: TimeShown ): number {
    if ( time === "none" ) return 0;
    const chars = time === "short" ? duration.length : duration.length * 2 + 3;
    return chars * ROW.char + 8;
}

/** How wide the row is with these controls folded, this time and this seek bar, its slider closed. */
export function rowNeed( needs: RowNeeds, folded: Folding[], time: TimeShown, seek: number = ROW.seek ): number {
    const button = needs.touch ? ROW.touchButton : ROW.button;
    const shown = ( control: Folding ) => needs[ control ] && ! folded.includes( control );
    const widths = [ button, seek, button ];
    if ( time !== "none" ) widths.push( timeWidth( needs.duration, time ) );
    if ( shown( "speed" ) ) widths.push( ROW.speed );
    if ( shown( "captions" ) ) widths.push( button );
    if ( shown( "quality" ) ) widths.push( ROW.quality );
    if ( shown( "pip" ) ) widths.push( button );
    if ( shown( "download" ) ) widths.push( button );
    if ( needs.full ) widths.push( button );
    if ( folded.length ) widths.push( button );
    return ( needs.touch ? ROW.touchPad : ROW.pad ) + widths.reduce( ( sum, width ) => sum + width, 0 ) + ( needs.touch ? ROW.touchGap : ROW.gap ) * ( widths.length - 1 );
}

/**
 * The row for a width: the controls that fit, the rest folded in FOLD_ORDER, then the time shortened, then download
 * folded. Still too narrow, the seek bar narrows to ROW.leastSeek, and then the time goes.
 */
export function planRow( needs: RowNeeds ): RowPlan {
    const folded: Folding[] = [];
    let time: TimeShown = "long";
    let seek: number = ROW.seek;

    if ( needs.width > 0 ) {
        for ( const step of [ ...FOLD_ORDER, "time", "download" ] as const ) {
            if ( rowNeed( needs, folded, time ) <= needs.width ) break;
            if ( step === "time" ) time = "short";
            else if ( needs[ step ] ) folded.push( step );
        }

        const over = rowNeed( needs, folded, time ) - needs.width;
        if ( over > 0 ) seek = Math.max( ROW.leastSeek, ROW.seek - over );
        if ( rowNeed( needs, folded, time, seek ) > needs.width ) {
            time = "none";
            seek = Math.max( ROW.leastSeek, Math.min( ROW.seek, ROW.seek - ( rowNeed( needs, folded, time ) - needs.width ) ) );
        }
    }

    const spare = needs.width > 0 ? needs.width - rowNeed( needs, folded, time, seek ) : Infinity;

    return { folded, time, seek, sliderInline: needs.slider && spare >= ROW.slider + ( needs.touch ? ROW.touchGap : ROW.gap ) };
}

/** Whether this browser lets a page set the volume: iOS keeps it to the hardware buttons, and reads back 1. */
export function volumeSettable(): boolean {
    try {
        const probe = document.createElement( "audio" );
        probe.volume = 0.5;
        return Math.abs( probe.volume - 0.5 ) < 0.01;
    } catch {
        return false;
    }
}

const VOLUME_KEY = "wplus-recording-volume";

/** The level and mute this browser last left a recording at, or null. */
export function savedVolume(): { level: number; muted: boolean } | null {
    try {
        const saved = JSON.parse( localStorage.getItem( VOLUME_KEY ) || "null" ) as { level?: unknown; muted?: unknown } | null;
        if ( ! saved || typeof saved.level !== "number" || ! Number.isFinite( saved.level ) ) return null;
        return { level: Math.min( 1, Math.max( 0, saved.level ) ), muted: !! saved.muted };
    } catch {
        return null;
    }
}

export function saveVolume( level: number, muted: boolean ): void {
    try {
        localStorage.setItem( VOLUME_KEY, JSON.stringify( { level: Math.round( level * 100 ) / 100, muted } ) );
    } catch {
        // a browser that keeps nothing starts at full volume next time
    }
}

/** The speaker's glyph for a level: muted, low or high. */
export function speakerGlyph( level: number, muted: boolean ): "speakerOff" | "speakerLow" | "speaker" {
    if ( muted || level <= 0 ) return "speakerOff";
    return level < 0.5 ? "speakerLow" : "speaker";
}
