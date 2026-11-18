# @wordplus/realtime-ui

The Better Messages screens for apps on WordPlus Cloud's realtime SDK ([`@wordplus/realtime`](https://www.npmjs.com/package/@wordplus/realtime)):
the call screen with its ring, the group video and audio grids and the call dock, who is online, who is typing, and
the chat. Better Messages draws its own screens with this package, so every improvement made there reaches your app.

Every screen is optional. An app that draws its own screens on the SDK's rooms and calls never loads these.

## Two ways in

| | Where it draws | Your styles | What to install |
|---|---|---|---|
| **React components** (this package) | in your React tree | reach it: its classes and tokens are yours to set | `@wordplus/realtime-ui` |
| **Elements** (`<call-button>`, `<online-list>`, `<chat-room>`, `<live-stream>` …) | in a shadow root, on any page (a live stream in the page itself) | do not reach in, only its tokens | nothing: `@wordplus/realtime` loads them |

The elements are the quickest: no stylesheet to import, and a theme can't break them. The components are for an app
that wants the Better Messages screens to belong to its own design. The docs cover both:
[the call screen](https://docs.wordplus.cloud/apps/calls/#the-call-screen) and [React](https://docs.wordplus.cloud/apps/react/).

The names of the elements are plain words, so your pages name nothing but your app. To put your own name before each, or
where another script on the page has one of these names, give them a prefix: `screen: { prefix: 'shop' }` in
`connect()` (or `data-prefix="shop"` on the script's tag) makes `<shop-call-button>`, `<shop-chat-room>` and
`<shop-live-stream>`. One prefix a page. Where a name is already another script's, the console says so and names the
prefix setting. The classes of the components are `realtime-` (`.realtime-chat`, `.realtime-call-button`).

## In a React app

```bash
npm install @wordplus/realtime @wordplus/realtime-ui
```

```tsx
import '@wordplus/realtime-ui/calls.css';
import '@wordplus/realtime-ui/presence.css';
import '@wordplus/realtime-ui/chat.css';
import { RealtimeProvider } from '@wordplus/realtime/react';
import { CallScreen, CallButton, GroupCallButton, OnlineList, OnlineCount, Typing, Chat } from '@wordplus/realtime-ui/react';

<RealtimeProvider>
    <CallScreen />                                  // the rings and the call window: once on the page
    <CallButton to={ 34 } call="support:{pair}" name="Ann">Call Ann</CallButton>
    <GroupCallButton call="staff:daily" title="Staff meeting">Join the meeting</GroupCallButton>
    <OnlineList room="shop" call="support:{pair}" />
    <OnlineCount room="product:7" />
    <Typing room="chat:34:42" />
    <Chat room="chat:34:42" load={ ( before ) => fetchMessages( before ) } />
    <Chat room="chat:34:42" to="42" call />         // the other person on top, and your call in the chat
</RealtimeProvider>
```

- **The connection** comes from `<RealtimeProvider>` of `@wordplus/realtime/react`, or from `rt` on each, for a page that
  holds its own. These are the same names as `@wordplus/realtime/react`, whose parts are elements with no stylesheet: here
  they draw in your React tree.
- **`{pair}`** in a call's name is the page's user and `to`, in order, so either side names the same call.
- **The rooms and calls** are your app's, as its server declares them: the names above are examples.
- **The hooks under them** are yours too: `useRoom( name, handlers )`, `usePresence( name )`, `useOnline( ids )`,
  `useProfiles( ids )` and `useTyping( room )`, each on the provider's connection. `useRoom( rt, name )` and the others
  with `rt` first still work.
- **`<CallScreen>`** takes `lang`, `strings`, `add`, `mutedHint`, `devicesOnJoin`, `effects` and `noise`:
  - `lang` picks the words of the screens in English, German, Spanish, French, Italian, Dutch, Polish, Croatian or
    Hebrew. The page's language is the default.
  - `strings` puts your words over any of theirs, by the English text.
  - `add` offers Add Person.
  - `mutedHint` says "You are muted" to someone who talks with the microphone off. It keeps a microphone open while
    muted, measured on the device and never sent, so the browser shows it in use. On unless `false`.
  - `devicesOnJoin` joins a group call with the camera and the microphone off, and says so over the dock: its buttons
    turn them on. Its Preview asks the browser for both once and opens the device settings with a picture of the
    camera and the microphone's level, only the person's. There each stops on its own, the speaker plays a test sound,
    and each device has its list. Nothing asks the browser until the person presses something. On unless `false`,
    where a group call starts with the microphone and, on a video call, the camera.
  - `effects` names where your app serves this package's effects pack (`dist/effects`, the folder as it is, 20.2 MB,
    or `dist/effects-<hash>.zip` unpacked, 11.2 MB, which WordPress sites download through the WordPlus SDK): the
    device settings then offer a blurred background or a picture behind the person, off until chosen and kept by the
    browser (`wordplus-call-effects` in its storage). The pictures
    are not in the pack: `dist/backgrounds` is a catalog of them (its `manifest.json` lists each with its names in
    WordPress's locales, its file and thumbnail, sizes and SHA-256), which WordPlus Cloud serves for the WordPlus SDK's
    sites to pick from. Those you serve go first with `configureUi( { builtInBackgrounds: () => [ { id, url, thumb,
    name } ] } )`, `id` the catalog's, and pictures of your own after them with `backgrounds` in the same shape (`url`
    about 1280x720, served with CORS from another origin, as WebGL draws no other picture). The person is found in every frame on the GPU, in MediaPipe, by
    Baidu's PP-HumanSegV2 (a smooth, steady edge), on every device that can run it: none falls back to a quicker, worse
    model. Where it can't run (WebGL drawn in software, or the model starting nowhere), the device settings say so and
    offer no background (`cameraEffectsUnavailable()`), and where it slows the device the call screens say so once a
    call, with Turn Off (`EffectsSlowNotice`, on the engine's `wordplus-call-effects-slow`). Where the device blurs the
    camera itself (Portrait, in the Video Effects of Control Center on a Mac, an iPhone and an iPad) and the browser says
    so (Safari: `backgroundBlur` in the camera's settings, `configurationchange` as it changes), Blur is left to it, the
    choice kept, and comes back once Portrait is off, and the device settings say why (`blurredByDevice()`). With Blur
    chosen on those devices they suggest Portrait or Background, the menu's replaced background, which no browser is
    told of, so the person chooses None with it. The line closes for good. A frame that isn't 16:9, a
    phone held upright, is letterboxed into the model's shape. The effects go on what the call sends from its first frame, and
    switch on the same track mid-call. Their engine (MediaPipe's tasks-vision on the GPU) loads from that folder once
    someone turns one on, or on a computer as the device settings open, to make it ready (`warmEffects()`, so the first
    background's GPU programs compile there rather than as it goes on), never with the screens, and a browser that can't run one is not offered it.
    `ownBackgrounds: () => true` lets people add a picture of their own device too (Add Your Own, after yours): JPEG,
    PNG, WebP, and HEIC where the browser decodes it, read and scaled to cover 1280x720 on the page and kept by the
    browser in IndexedDB (`wordplus-call-backgrounds`), the newest three, each to be removed. It is never sent
    anywhere: the others see it only in the camera, as with any background. A browser that keeps nothing (its storage
    refused or not answering) has it for the page alone. Off by default, and turned off, those a browser keeps are not
    offered and a call that used one has none, the copies left for when it is on again.
    `cameraSize: () => ( { width, height, frameRate } )` names the size your call opens the camera at (1920x1080 at 30
    by default, as realtime-client's `cameraCapture()`): the device settings' preview asks the same, as ideals, so it
    shows the shape the others get, and the SDK's own calls open the camera at it.
  - `noise` names where your app serves AI Noise Removal, a pack of its own (`dist/noise`, 22.9 MB, or
    `dist/noise-<hash>.zip` unpacked, 12.1 MB, which WordPress sites download through the WordPlus SDK apart from the
    effects): the device settings then offer it for the microphone, off until chosen and kept by the browser with the
    effects. DeepFilterNet3 runs it in an AudioWorklet: the whole voice band kept, keyboard typing taken out as well as
    steady noise, some 70 ms more delay. Where it cannot start, or a device cannot keep up with it (remembered by the
    browser, `wordplus-call-noise-light`), GTCRN takes its place behind the same track: lighter, with nothing of the
    voice above 8 kHz. The microphone's test plays the same seconds without and with it. Its engine loads from that
    folder only once someone turns it on. DeepFilterNet3's runtime and model, 12 MB, are then kept by the browser in a
    store of their own (Cache Storage, `wordplus-noise`), as its HTTP cache lets files that large go within the day,
    and are read ahead as a call's screen opens for someone who has it on. A microphone turned on waits a second at
    most for it: with the files still on their way it goes out as it hears, and the noise removal's track takes its
    place once it is on. `configureUi( { noiseDefault: () => 'auto' } )` turns it on for those who never chose, on a
    computer that can run it (a fine pointer, no data saving, not a device already too slow for it): phones and
    tablets keep it off, as their own microphones take the wind and the noise around out. The person's choice in the
    device settings always comes first, and a background picked leaves it unchosen. Once it runs by the default, the
    call says so over the dock, once a call, with Turn Off (kept as their choice), Do Not Show Again (kept by the
    browser, `wordplus-call-noise-auto-tip`) and ×, and the dock's Device Settings has a small badge while noise
    removal runs, whoever turned it on.
    `<call-screen>` takes the same from `screen: { effects, noise, backgrounds, builtInBackgrounds, ownBackgrounds }`.
  - A moderator of a group call is told who raises a hand, and who joins where Host Controls has Join Alerts on (on
    that device), and Host Controls has End for Everyone, asked again through the host's `confirm` first.
- **`<Chat>`** pages back through the conversation your server keeps (`load`), and the room's last 5 minutes fill in
  what came since. It has typing, reactions and read ticks. `onSent` hears each message the room took, with its id, for
  your server to keep it and tell the other person (`sent`, an event on `<chat-room>`). In a chat between two, `to`
  shows the other person on its top bar with their calls, and `call` (`true` for the call named as the room) shows
  the call in the chat, beside the messages, with Show Chat and Hide Chat in its controls.

An app that keeps its own conversation and draws it with the chat's parts, as Better Messages does, takes them from
`@wordplus/realtime-ui/chat`: the message list's parts, the composer's row, reactions, presence and who is online, the
files and their viewer, and what they stand on, with no call screen, no language table and the chat's glyphs alone. They
are the root entry's own, so a page with both meets one host.

## The look

Every class name starts with `wplus-` and every design token with `--wplus-`. Set the tokens on the page to make the
screens your app's own:

```css
:root {
    --wplus-color-accent: 37, 99, 235;              /* red, green and blue */
    --wplus-messenger-font: Inter, system-ui, sans-serif;
    --wplus-radius-card: 12px;
}
```

An app that styled the screens before 1.0.6 named them `bm-…` and `--bm-…`: the same names after the prefix.

An app that compiles the parts' stylesheet itself, under names of its own or for a shadow root, takes the package's
way of compiling it, which builds `dist/*.css`: the parts it draws, with only the tokens they read.

```js
import { compileStylesheet } from '@wordplus/realtime-ui/styles/compile.mjs';

// `wps-msg-body` and `--wps-color-accent` for `wplus-msg-body` and `--wplus-color-accent`, the tokens on :host.
const css = await compileStylesheet( { parts: [ 'chat/messages', 'chat/reactions', 'chat/composer' ], prefix: 'wps', host: true } );
```

The elements keep their own tokens in their shadow roots, so `:root` does not reach them: set the tokens on the
elements themselves (`call-screen, chat-room, online-list { --wplus-color-accent: 37, 99, 235; }`), where
they hold in light and dark alike.

Light and dark follow the system. `wplus-messages-light` on `<body>` keeps the light look, and `wplus-messages-dark` the
dark one. The elements also keep the one a page names alone in its `color-scheme`, so a page drawn only light
(`color-scheme: light`) has them light. Right-to-left pages mirror.

## What the screens ask of your app

What the screens need from the app they are in goes through one host, set before the first screen draws. Every part
has a default:

```ts
import { configureUi } from '@wordplus/realtime-ui';

configureUi( {
    translate: ( text, context, domain ) => …, // your translations; the package's own by default
    accentColor: () => '#2563eb',             // the ring around whoever speaks
    showError: ( error ) => …,                // how your app shows an error
    confirm: ( question ) => …,               // asks before End for Everyone, in your dialog: true goes ahead
    Avatar, Name,                             // a user's picture and name, as your app draws them
    effectsUrl: () => '/realtime/effects/',   // where you serve dist/effects; '' (the default) offers no backgrounds
    noiseUrl: () => '/realtime/noise/',       // where you serve dist/noise; '' (the default) offers no AI Noise Removal
} );
```

A call of your own that sends the room client's tracks (LiveKit's) puts the effects on them with `useTrackEffects(
camera, microphone )` and `applyEffect( track, 'camera' | 'noise' )` from `@wordplus/realtime-ui/calls`, and sets
`effects: true` in its call context. `applyEffect( microphone, 'noise', true )` is for a microphone the call is waiting
to send: it answers after a second at most, and the noise removal goes on the track by itself once it is ready. A
browser's own track takes them through `TrackEffect`, as the SDK's calls do.

`domain` is the text domain a string is written with: `bp-better-messages` for the call screens, `wordplus-live-stream` for
the live streams, for a host that translates more than one product's words.

The icons are a registry in sets: `CHAT_ICONS`, which the chat's parts draw, `CALL_ICONS` and `MESSENGER_ICONS`. `Icon`
draws every one of them. The chat's parts carry their own set alone, so a bundle of them carries no other, and an app
that gives a part another glyph adds it first with `registerIcons( { name: 'M4 4h16v16H4z' } )` or a set of the
package's.

## Live streams

The live stream of `calls.stream()` drawn ready: the player of Easy Stream, the chat beside it, and the studio where
the host of the stream goes live:

```tsx
import '@wordplus/realtime-ui/streams.css';
import { StreamView } from '@wordplus/realtime-ui/streams';
import { useStream } from '@wordplus/realtime/react';

const { stream } = useStream( 'show:42' );
return stream && <StreamView stream={ stream } title="New mugs" />;
```

On any other page, the elements, which `rt.streamScreen()` loads (`realtime-ui-streams.min.js`, a script of its own, so
a page with calls alone never carries the views of the streams). They draw in the page itself, as the views of Easy
Stream do on any site, every class `wplus-live-stream-`:

```html
<live-stream name="show:42" title="New mugs"></live-stream>
<!-- or its parts, each where the page puts it: player, chat, details, studio -->
<live-stream name="show:42" view="player"></live-stream>
<live-stream name="show:42" view="chat" height="480"></live-stream>
<stream-studio name="show:42"></stream-studio>
```

The elements of one stream share one join. Their attributes: `title`, `cover`, `url` (the page to share), `login-url`
(where a visitor signs in to chat), `studio-url`, `chat="off"`, and `sticky` on the player.

`@wordplus/realtime-ui/streams` is Easy Stream's player, studio, chat and stage, moved here whole on 2026-10-13,
on the engine of `@wordplus/realtime-client/streams`, which
their host gives them (`EasyStreamProvider`, or `EasyStreamParts` for the parts placed apart, with `streamEngine( stream )`
for a stream of the SDK). Their stylesheet is `@wordplus/realtime-ui/streams.css`. Three things are kept as Easy Stream has
them:

- **Their look:** the `wplus-live-stream-` classes, the `--wplus-live-stream-*` properties on their theme root, and the
  appearance settings as props (`appearance.ts`), the shape Easy Stream's WordPress plugin saves. Until 1.2.0 the
  prefix was `estream-`: a page that styled the streams renames its `.estream-` classes, `--estream-` properties and
  `data-estream-` attributes, and nothing after the prefix.
- **Their words:** written once through `src/components/streams/i18n.ts`, in the `wordplus-live-stream` text domain, apostrophe-
  and semicolon-free, translated in this package's eight languages. Easy Stream's WordPress build puts WordPress's own
  wp.i18n in that one module's place, so WordPress translates them on its sites. Keep every call a literal.
- **Where they draw in Better Messages:** `better-messages.tsx` draws the stream in a Better Messages conversation, in
  its markup. The build of Better Messages never imports this entry, and its extraction keeps only `bp-better-messages`
  calls.

Their tests are `test/streams/`. Easy Stream vendors a commit of this package (its scripts/vendor-realtime-ui.sh) and
runs its end-to-end tests on its dev site with it.

## Developing

```bash
npm install
npm test          # the build, the screens drawn from fake calls and rooms in happy-dom (the chat's parts on Preact too), and the languages
npm run gallery   # every component in its states, photographed and compared with gallery/pictures
```

- **The builds:** `npm run build` writes:
  - the ES modules and their types for bundlers (`dist/index.js`, `dist/calls.js`, `dist/react.js`),
  - the stylesheets (`dist/calls.css`, `presence.css`, `chat.css`),
  - the elements as one script with React, the styles and the languages inside (`dist/realtime-ui.min.js`),
  - the licences of what that script bundles (`dist/THIRD-PARTY-NOTICES.txt`),
  - the call effects' pack, a folder an app serves as it is (`dist/effects`): their engine (`realtime-effects.min.js`,
    from `src/effects`), MediaPipe's runtime and the two models (from `effects/`), their licences and a manifest with
    each file's SHA-256; the same as one zip made the same from the same files (`dist/effects-<hash>.zip`), and
    `dist/effects.json` naming it, which the WordPlus SDK's copy carries. The build refuses an elements script that
    takes any of it in.
  - AI Noise Removal's pack, the same way (`dist/noise`, `dist/noise-<hash>.zip`, `dist/noise.json`): its engine
    (`realtime-noise.min.js`, from `src/effects/noise-engine.ts`), DeepFilterNet3's worklet, runtime and model (from
    `@workadventure/noise-suppression`), GTCRN's worklet and build (from `@sapphi-red/web-noise-suppressor`), their
    licences and a manifest.
- **The gallery** (`gallery/`) is a page with every component in each of its states, on fixed people and a faked
  call:
  - the ring, a call between two, a group video and audio call,
  - presence, who is online,
  - a conversation, a message hovered, the composer, an empty conversation.

  `npm run gallery` photographs each one in the light and dark themes and right to left at a computer's width, and in
  the light look at a phone's width (Playwright 1.63). It compares every picture with its own in `gallery/pictures`.
  A change meant to be seen takes the pictures again with `npm run gallery:update`, after looking at them.
- **Languages** (`src/languages`): the strings of the screens in de, es, fr, it, nl, pl, hr and he, from the
  translations of Better Messages (`node scripts/languages.mjs`, `--check` to find one missing or a file not as the
  script writes it). The words of the live streams are apart, in `src/languages/streams`, given to the translator by
  the views of the streams
  (`addStreamLanguages()`, in their `wordplus-live-stream` text domain), so `realtime-ui.min.js` carries none of them: its build
  stops if it takes in a stream's view or its words.

## Licence

MIT. The script of the elements bundles React and other packages, each under its own licence, listed in full in
`dist/THIRD-PARTY-NOTICES.txt`.

The icons are drawn on [Lucide](https://lucide.dev)'s geometry, many of them copied from it, under Lucide's ISC licence
(with portions of Feather, MIT): `src/primitives/icons/LICENSE-lucide.txt`. The notices list it too, and
`src/primitives/icon.tsx` carries it as a `/*! */` banner, so an app's own bundle of the package keeps it among its
licence comments. A new icon from another set brings its licence the same way.
