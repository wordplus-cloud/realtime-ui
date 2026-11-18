# Changelog

## 1.2.0 - 2026-11-18

### Changes that need a look in your code

- **Live stream styling was renamed.** Every class, custom property and data attribute of the live stream views is now
  `wplus-live-stream-...`, `--wplus-live-stream-...` and `data-wplus-live-stream-...`, where they were `estream-...`,
  `--estream-...` and `data-estream-...`. If your own CSS or tests reach into the stream views, rename those three
  prefixes; nothing after the prefix changed.
- **No High Quality choice for call effects.** The call screens leave the model to the engine, which uses the better
  model wherever the device can run it and falls back by itself. `highQualityEffects()`, `useDeviceQuality()`,
  `noticeQualityDrop()`, `QUALITY_KEY`, `DeviceQuality`, the `quality` field of a saved effects choice and the
  `highQualityEffects` option of the host and of `<call-screen>` are gone. A choice saved with `quality` is read without it.
- **No Keyboard Shortcuts list or `?` key** on the call screens. Each key is named in its control's tooltip instead.
- **Fewer dependencies.** `compare-versions`, `filesize`, `html-entities`, `html-react-parser`, `rxjs`,
  `string-strip-html` and `ua-parser-js` are no longer installed with the package (the parts they served are built in);
  only `react-merge-refs` is. If your app imported one of them through this package's tree, add it yourself.
- **Document Picture-in-Picture is gone from calls.** Picture in picture uses the browser's own window.

### New

- **Polls.** `@wordplus/realtime-ui/polls` (with `polls.css`): `PollCard`, `PollForm`, `PollVoters`, `PollEndedCard` and
  `PollIcon`. The card sits in its message's bubble and takes the conversation's look, a vote moves on a tap, members
  can add options, results can stay hidden until the poll ends, and winners of an ended poll are marked.
- **Chat parts on their own.** `@wordplus/realtime-ui/chat` has the message list, composer row, reactions, who is online,
  files and their viewer, with no call screen and no language table, for an app that keeps its own conversation. Also:
  `ownTooltips()` and `setOwnTooltips()`, `AvatarFace`, `AvatarStack` drawing faces as you give them, `ActionCard` (a
  request in a chat), `compileStylesheet()` keeping only the rules a bundle draws, and chat parts that run on Preact.
- **Calls, ready-made screens.**
  - Spotlight for everyone (up to four), pin for yourself, and layouts that keep every tile at its picture's shape.
  - Participants, with Add Person at its top, shown only where the stage cannot show everyone.
  - Picture in picture for a group call, drawn as one window of the person who matters.
  - A key for every control of the dock and of More.
  - Join notice with Preview and Do Not Show Again (the app keeps the choice with `joinNotice`).
  - A moderator asks for the camera and the microphone in one row, and is told what came of it.
  - Group calls moderated as in Better Messages, drawn from the acts the call offers (`acts` of the client's group call):
    Remove and Ban from Calls with its own dialog, Mute Microphone that holds until Allow Microphone, Ask to Turn On,
    and Host Controls with Mute Everyone, Lock Room, Broadcast Mode and End for Everyone. The switches follow the
    room, so a second host sees what the first one set. Everyone may raise a hand, which every host sees and may lower. The
    tile of someone who dropped is kept for 20 seconds, in case they come back, and a join refused because the call is locked or the
    person is banned says so. A client that names no acts gets the screen as before. `/calls` also exports `BanDialog`
    and `CallDialog`.
  - AI Noise Removal by the app's default: `noiseDefault: 'auto'` in `start()` of the elements (or the page's `screen`
    config) and on the React `CallScreen` turns it on for people who never chose, where the device can run it, with a
    notice and Turn Off. `'off'` stays the default.
  - Hide People Without Video, a screen shared in an audio call in a card of its share's shape, and a small warning mark
    on the connection badge when the upload is jammed.
  - `PrivateCallScreen` and `usePrivateCall` for an app whose calls are only between two people.
- **Device Settings.** Offered before the browser allows a device, with how to allow it; the device in use is a field that
  opens the browser's own menu; your own camera is shown as the call sends it; the first background goes on at once
  because it is prepared as the panel opens.
- **Better video backgrounds.** A smoother, steadier person model that runs on every device that can, a picture of your own
  device as a background where the app allows it (kept in the browser, never sent), and tuning for your light and room.
  Where the device offers its own Portrait effect, Blur is left to it and the settings say why.
- **AI Noise Removal** is a pack of its own and no longer lets typing through, and a microphone turned on no longer waits for
  its files, which the browser keeps.
- **Live streams.** A test stream a host can watch as a viewer gets it, the host's background and noise removal in the
  studio, a viewer's reactions in full screen, Go live that waits for the background rather than
  going out bare,.
- **Your own token route.** The call, group call and stream elements take `token-url` (React `tokenUrl`), a route of your
  app that decides whether someone may call, join or watch.
- **Rooms of two.** `<Chat room="chat:{pair}" to="34">` and `useRoom( 'chat:{pair}', handlers, { with: 34 } )`.
- **One set of names with `@wordplus/realtime/react`**, with the connection from `<RealtimeProvider>`; every old form
  keeps working. The ready-made screens can be rendered from a server layout.

### Changed

- Group calls tell the browser the microphone and camera are on or off only where that lights the picture-in-picture
  buttons, so Safari no longer mutes a camera or microphone you have just turned on.
- The effects pack's files have names that say what they are (`models/person-segmentation.tflite`, `mediapipe/runtime.js`).
- The words of the call screens agree with each other (the gear says Device Settings), the join notice stays while the
  pointer or focus is on it, and the stream effects' tiles keep their colours under a theme's hover styles.
- Languages: the new words in the package's eight languages.

### Fixed

- A call answered into a `<call-spot>` below the fold came into view, so the other side's camera is no longer held back.
- A held Space talks after the microphone was clicked, and a press shorter than the microphone takes to open ends muted.
- A vote taken back and given again in a poll is counted once, and several quick picks send only the latest.
- The sticker suggestion strip floats over the message list instead of moving the conversation.
- A photo's caption wraps to the width of the photo, and a long name in the mention list breaks inside the list.
- Grid layout: speaker layout cuts to a new speaker at once, a tile back from the main block returns to its place, and a
  panel taller than the stage keeps its scrollbar.
- No online dot on the host's avatar or on the avatars of a group call.
- Group call tiles and strips no longer cover or squeeze a camera's picture on phones and tablets.
