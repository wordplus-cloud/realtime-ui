import React from "react";

// The player's glyphs, the registry's (primitives/icon.tsx) drawn the same way: the registry takes in an HTML parser
// for custom icons, 40 KB the player's own script has no use for.
const GLYPHS = {
    play: "M6 3l14 9-14 9V3z",
    pause: "M6 4h4v16H6zM14 4h4v16h-4z",
    speaker: "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14",
    speakerLow: "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7",
    speakerOff: "M11 5 6 9H2v6h4l5 4V5z|m23 9-6 6|m17 9 6 6",
    settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    captions: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z|M7 15h4M15 15h2M7 11h2M13 11h4",
    pip: "M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4|M12 13h8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z",
    download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    maximize: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
    minimize: "M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M16 16l5 5",
    chevronU: "m18 15-6-6-6 6",
    chevronD: "m6 9 6 6 6-6",
    copy: "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z|M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
    spinner: "M12 2a10 10 0 0 1 10 10",
} as const;

export type GlyphName = keyof typeof GLYPHS;

export function Glyph( { name, size = 18 }: { name: GlyphName; size?: number } ) {
    const stroke = Math.max( 1.6, Math.min( 2.9, ( 1.15 * 24 ) / size ) );

    return <svg viewBox="0 0 24 24" width={ size } height={ size } fill="none" stroke="currentColor" strokeWidth={ stroke } strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        { GLYPHS[ name ].split( "|" ).map( ( d ) => <path key={ d } d={ d } /> ) }
    </svg>;
}
