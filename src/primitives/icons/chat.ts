// The icons the chat's own parts draw (the message list, its ticks and system lines, the composer's row, reactions,
// presence, who is online, the files and their viewer): primitives/icon.tsx holds these from the start, so a bundle of
// the chat parts carries them and no other. An app that gives a part another name registers it (registerIcons()).
// Many are Lucide's own, under its ISC licence (LICENSE-lucide.txt beside this file), which the banner of
// primitives/icon.tsx carries into every build that draws them.
//
// Each glyph keeps Lucide's envelope (primitives/icon.tsx says how a value draws): a new one goes in the set of the
// screens that draw it.
export const CHAT_ICONS = {
    edit:       "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
    phone:      "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.94.34 1.86.66 2.74a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.34-1.34a2 2 0 0 1 2.11-.45c.88.32 1.8.54 2.74.66A2 2 0 0 1 22 16.92Z",
    video:      "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5|M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
    smile:      "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM8 14.5s1.5 2.5 4 2.5 4-2.5 4-2.5M9 10h.01M15 10h.01",
    paperclip:  "m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
    mic:        "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 11v1a7 7 0 0 1-14 0v-1M12 19v3M8 22h8",
    send:       "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
    // A square, so 3..21: drawn to 2..22 it stood a size above the camera beside it in the composer.
    sticker:    "M18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h7l8-8V6a3 3 0 0 0-3-3z|M13 21v-4a4 4 0 0 1 4-4h4",
    // The GIF badge: a frame of the camera's proportions with the letters drawn in the same stroke, 7 units tall
    // about the grid's centre. Bold text in their place read darker than every line icon beside it, and sat on
    // the font's baseline, a unit low.
    gif:        "M5 5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z|M9 8.5H7.5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2H9v-3H8|M12 8.5v7|M18.5 8.5H15v7|M15 12h2.75",
    pin:        "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z",
    check2:     "M20 6 9 17l-5-5",
    check:      "M20 6 9 17l-5-5",
    // Double check drawn as two IDENTICAL checks offset horizontally
    // (both diagonals span y7–16.5), the second's leg clipped where it
    // meets the first's diagonal — lucide's check-check crops the second
    // check visibly shorter, which read as mismatched heights at tick size.
    checks:     "M2 12l4.5 4.5L16 7M9.5 13.5l3 3L22 7",
    spinner:    "M12 2a10 10 0 0 1 10 10",
    clock:      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 6v6l4 2",
    chevronL:   "m15 18-6-6 6-6",
    chevronR:   "m9 18 6-6-6-6",
    chevronD:   "m6 9 6 6 6-6",
    x:          "M18 6 6 18M6 6l12 12",
    bolt:       "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
    image:      "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
    textFormat: "M4 20h16|m6 16 6-12 6 12|M8 12h8",
    thread:     "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
    archive:    "M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-18a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z|M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8|M10 12h4",
    file:       "M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7zM13 2v7h7",
    copy:       "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z|M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
    download:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
    reaction:   "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0zM8 14.5s1.5 2.5 4 2.5 4-2.5 4-2.5M9 10h.01M15 10h.01",
    alert:          "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z|M12 8v4|M12 16h.01",
} as const;
