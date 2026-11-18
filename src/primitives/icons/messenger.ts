// The icons no screen of the kit draws itself: Better Messages' own (its rail, its inbox, its formatting bar, its
// lightbox, its settings), which it draws through the package's Icon, primitives/icons.tsx, as an app may.
//
// Each glyph keeps Lucide's envelope (primitives/icon.tsx says how a value draws): a new one goes in the set of the
// screens that draw it. Many are Lucide's own, under its ISC licence (LICENSE-lucide.txt beside this file), which the
// banner of primitives/icon.tsx carries into every build that draws them.
export const MESSENGER_ICONS = {
    // Bulk Message (v2's FaMailBulk): Lucide's "mails" — stacked envelopes.
    mails:      "M8 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|m22 7-7.1 3.78a2 2 0 0 1-1.8 0L6 7|M2 8v11a2 2 0 0 0 2 2h14",
    reply:      "M9 14 4 9l5-5M4 9h12a5 5 0 0 1 5 5v6",
    "at-sign":  "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9",
    chevronU:   "m18 15-6-6-6 6",
    minus:      "M5 12h14",
    // Minimize-to-mini-chat: v2's window-minimize glyph, a low dash.
    windowMinimize: "M5 19h14",
    // Site-wide member directory: three figures, so it stays distinct from
    // friends (one) and groups (two). Drawn as `users` with one more figure —
    // a front figure with a full shoulder arc flanked by two partials — so the
    // head size and line mass match its neighbours in the tab strip, inside
    // the same 2..22 envelope as `users`. (v2's own
    // mark here is a Heroicons solid-ish group that reads far heavier than the
    // Feather-family icons around it, so it is deliberately not reused.)
    // Three abreast, so it fills the envelope's width (2..22) and can only be
    // 15.2 tall — but it was drawn 4.4..19.6 shifted 1.4 DOWN the grid, which
    // in a tab strip beside thread / users / book (all centred, 18 tall) read
    // as one icon hanging below the others. Translated up; not rescaled,
    // which would take it past the width envelope.
    community:  "M12 10a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4z|M16.8 19.6v-1.4a4.8 4.8 0 0 0-9.6 0V19.6|M5.8 9.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z|M2 17.2v-1a4 4 0 0 1 3.4-3.95|M18.2 9.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z|M22 17.2v-1a4 4 0 0 0-3.4-3.95",
    globe:      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
    home:       "M3 9.5 12 2l9 7.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z|M9 22v-8h6v8",
    cart:       "m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18|M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25|M18 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M8 22a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    hash:       "M4 9h16M4 15h16M10 3 8 21M16 3l-2 18",
    sparkles:   "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1",
    unlink:     "m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71|m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71|M8 2v3|M2 8h3|M16 19v3|M19 16h3",
    bold:       "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
    italic:     "M19 4h-9|M14 20H5|M15 4 9 20",
    underline:  "M6 4v6a6 6 0 0 0 12 0V4|M4 20h16",
    strikethrough: "M16 4H9a3 3 0 0 0-2.83 4|M14 12a4 4 0 0 1 0 8H6|M4 12h16",
    listBulleted: "M3 12h.01|M3 18h.01|M3 6h.01|M8 12h13|M8 18h13|M8 6h13",
    listNumbered: "M10 12h11|M10 18h11|M10 6h11|M4 10h2|M4 6h1v4|M6 18H4c0-1 2-2 2-3s-1-1.5-2-1",
    heading1:   "M4 12h8|M4 18V6|M12 18V6|m17 12 3-2v8",
    heading2:   "M4 12h8|M4 18V6|M12 18V6|M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1",
    heading3:   "M4 12h8|M4 18V6|M12 18V6|M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2|M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2",
    plus:       "M12 5v14M5 12h14",
    filter:     "M22 3H2l8 9.5V19l4 2v-8.5L22 3z",
    incognito:  "M2 14h20M5 14l2-5h10l2 5|M7 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M10 16h4",
    mapPin:     "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0|M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    panelOpen:  "M3 3h18v18H3zM9 3v18|M12 9l3 3-3 3",
    panelClose: "M3 3h18v18H3zM9 3v18|M14 9l-3 3 3 3",
    // Lucide's badge-check: eight scallops on 2..22 around the same check as
    // `shield`. The hand-drawn 12-point badge it replaces spanned 0.1..21.3
    // and sat 1.3 units left of centre.
    verified:   "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z|m9 12 2 2 4-4",
    // Image editor toolbar (Cropper.js actions).
    history:    "M3 12a9 9 0 1 0 3-6.7L3 8|M3 3v5h5|M12 7v5l3 2",
    rotate:     "M3 12a9 9 0 1 1 3 6.7|M3 12H8M3 12V7",
    flip:       "M12 3v18|M9 7 4 12l5 5V7zM15 7l5 5-5 5V7z",
    zoomIn:     "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3|M11 8v6M8 11h6",
    zoomOut:    "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3|M8 11h6",
    // 18 tall like its neighbours, but drawn 2..20 — a unit ABOVE the grid's
    // centre, the mirror of what community did below it. Translated down to
    // 3..21, the envelope's own square.
    bot:        "M9 3h6M12 3v3M5 9h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM2 14v3M22 14v3M9 14h.01M15 14h.01M8 19h8",
    coin:       "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z|M16.5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
    eraser:     "M20 20H7L3 16a2 2 0 0 1 0-2.8L13.2 3a2 2 0 0 1 2.8 0L21 8a2 2 0 0 1 0 2.8L11 20M14 8l5 5",
    trash:      "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
    unarchive:  "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z|M4 8v11a2 2 0 0 0 2 2h2|M20 8v11a2 2 0 0 1-2 2h-2|m9 15 3-3 3 3|M12 12v9",
    flag:       "M4 22V4M4 4h13l-2 4 2 4H4",
    pause:      "M6 4h4v16H6zM14 4h4v16h-4z",
    book:       "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
    // Voice transcription marker (v2's CgTranscript) — lucide "captions".
    captions:   "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z|M7 15h4M15 15h2M7 11h2M13 11h4",
    shopping:   "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4ZM3 6h18M16 10a4 4 0 1 1-8 0",
    // A conversation that notifies only about mentions and replies (lucide "at-sign"). An icon, not
    // a typed @: a glyph of text sits on its own baseline, which moved a pixel against the icons
    // beside it wherever the row landed on a fraction of a pixel.
    at:         "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8",
    // Someone reacted to your message (lucide "heart"): the reaction picker keeps the smiley.
    heart:      "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
    // Group-call icons (ported from the 2026 redesign design source).
    videoGroup: "M4 4.5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 4v-4H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z|M18 8.5l4-2v7l-4-2V8.5z",
    phoneGroup: "M3 13.5a9 9 0 0 1 18 0|M3 13.5v4a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-5H3z|M21 13.5v4a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-5h4z",
    translate:  "m5 8 6 6|m4 14 6-6 2-3|M2 5h12|M7 2h1|m22 22-5-10-5 10|M14 18h6",
    // A call's keyboard shortcuts (lucide "keyboard").
    keyboard:       "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z|M6 8h.01|M10 8h.01|M14 8h.01|M18 8h.01|M8 12h.01|M12 12h.01|M16 12h.01|M7 16h10",
    lockOpen:       "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z|M7 11V7a5 5 0 0 1 9.9-1",
    megaphoneOff:   "M9.26 9.26 3 11v3l14.14 3.14|M21 15.34V6l-7.31 2.03|M11.6 16.8a3 3 0 1 1-5.8-1.6|m2 2 20 20",
    activity:       "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
} as const;
