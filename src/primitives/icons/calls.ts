// The icons the call screens draw beside the chat's (the dock, the grids, the panels, the rings and their notices):
// primitives/icons.tsx registers them, which the call screens draw through.
//
// Each glyph keeps Lucide's envelope (primitives/icon.tsx says how a value draws): a new one goes in the set of the
// screens that draw it. Many are Lucide's own, under its ISC licence (LICENSE-lucide.txt beside this file), which the
// banner of primitives/icon.tsx carries into every build that draws them.
export const CALL_ICONS = {
    search:     "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z|M16 16l5 5",
    more:       "M12 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2z",
    minimize:   "M5 14h6v6M19 10h-6V4M14 10l7-7M3 21l7-7",
    maximize:   "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
    settings:   "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    bell:       "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.7 21a2 2 0 0 1-3.4 0",
    users:      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M16 3.128a4 4 0 0 1 0 7.744|M22 21v-2a4 4 0 0 0-3-3.87|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    user:       "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    mute:       "M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z|m16.5 14.5 5-5|m16.5 9.5 5 5",
    link:       "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
    camera:     "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z|M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    lock:       "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4",
    shield:     "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z|m9 12 2 2 4-4",
    star:       "m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    ban:        "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2",
    userPlus:   "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6",
    // Lucide geometry (x 6..20) — the off-box position IS the optical
    // centering for a right-pointing triangle in a circular button.
    play:       "M6 3l14 9-14 9V3z",
    speaker:    "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14",
    raisehand:  "M7 11V5a2 2 0 1 1 4 0v6M11 11V3a2 2 0 1 1 4 0v8M15 11V5a2 2 0 1 1 4 0v9a8 8 0 0 1-8 8H9a4 4 0 0 1-4-4l-2-5 1.5-1.5L7 13",
    layout:     "M3 3h18v18H3zM3 9h18M9 21V9",
    screen:     "M2 4h20v12H2zM8 20h8M12 16v4",
    // AI Noise Removal running (its notice over the dock and the badge on Device Settings): Lucide's audio-lines, a
    // voice as a waveform.
    noiseRemoval:   "M2 10v3|M6 6v11|M10 3v18|M14 8v7|M18 5v13|M22 10v3",
    // Call chrome (3.0 call screens): slashed and paired variants of the
    // media controls, room moderation, and connection state.
    micOff:         "M12 19v3|M8 22h8|m2 2 20 20|M18.89 13.23A7.12 7.12 0 0 0 19 12v-2|M5 10v2a7 7 0 0 0 12 5|M15 9.34V5a3 3 0 0 0-5.68-1.33|M9 9v3a3 3 0 0 0 5.12 2.12",
    videoOff:       "M10.66 6H14a2 2 0 0 1 2 2v2.5l5.248-3.494A.5.5 0 0 1 22 7.435v8.13a.5.5 0 0 1-.752.43L16 13.5|M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2|m2 2 20 20",
    screenShare:    "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3|M8 21h8|M12 17v4|m17 8 5-5|M17 3h5v5",
    screenShareOff: "M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3|M8 21h8|M12 17v4|m22 3-5 5|m17 3 5 5",
    pip:            "M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10c0 1.1.9 2 2 2h4|M12 13h8a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z",
    switchCamera:   "M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5|M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5|M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z|m18 22-3-3 3-3|m6 2 3 3-3 3",
    // Swapping which of the other side's two pictures is the big one. The
    // image editor's `flip` was standing in for this and read as "mirror it";
    // 2.0 used Font Awesome's circular-arrows `sync-alt`, which is this shape.
    swapVideos:     "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8|M21 3v5h-5|M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16|M8 16H3v5",
    megaphone:      "m3 11 18-5v12L3 14v-3z|M11.6 16.8a3 3 0 1 1-5.8-1.6",
    logout:         "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|m16 17 5-5-5-5|M21 12H9",
    arrowUp:        "M12 19V5|m5 12 7-7 7 7",
    arrowDown:      "M12 5v14|m19 12-7 7-7-7",
    wifiOff:        "M12 20h.01|M8.5 16.429a5 5 0 0 1 7 0|M5 12.859a10 10 0 0 1 5.17-2.69|M19 12.859a10 10 0 0 0-2.007-1.523|M2 8.82a15 15 0 0 1 4.177-2.643|M22 8.82a15 15 0 0 0-11.288-3.764|m2 2 20 20",
    pinOff:         "M12 17v5|M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89|m2 2 20 20|M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11",
    userX:          "M2 21a8 8 0 0 1 13.292-6|M10 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z|m17 17 5 5|m22 17-5 5",
    wifi:           "M12 20h.01|M2 8.82a15 15 0 0 1 20 0|M5 12.859a10 10 0 0 1 14 0|M8.5 16.429a5 5 0 0 1 7 0",
    speakerOff:    "M11 5 6 9H2v6h4l5 4V5z|m23 9-6 6|m17 9 6 6",
    // The camera's background blurred (the call effects): the person sharp, the room around them as dots.
    blur:          "M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M6.5 20a5.5 5.5 0 0 1 11 0|M3 6h.01|M3 12h.01|M3 18h.01|M21 6h.01|M21 12h.01|M21 18h.01",
    // A line to know rather than to fix (the device settings' lines on the blur of the device itself): Lucide's info.
    info:          "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 16v-4|M12 8h.01",
    // The person's tuning of the camera's effect (the device settings' Adjust): Lucide's sliders-horizontal.
    tune:          "M21 4h-7|M10 4H3|M21 12h-9|M8 12H3|M21 20h-5|M12 20H3|M14 2v4|M8 10v4|M16 18v4",
    // Recording (Host Controls' Record): Lucide's circle-dot.
    record:        "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z|*M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    // Something of the person's own to mend (their upload jammed, on the connection badge): Lucide's triangle-alert.
    warning:       "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3|M12 9v4|M12 17h.01",
} as const;
