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
import { CallScreen, CallButton, GroupCallButton, OnlineList, OnlineCount, Typing, Chat } from '@wordplus/realtime-ui/react';

<CallScreen rt={ rt } />                                  // the rings and the call window: once on the page
<CallButton rt={ rt } to={ 34 } call="support:34:42" name="Ann">Call Ann</CallButton>
<GroupCallButton rt={ rt } room="staff:daily" title="Staff meeting">Join the meeting</GroupCallButton>
<OnlineList rt={ rt } room="shop" actions={ ( member ) => <CallButton rt={ rt } to={ Number( member.id ) } call={ `support:${ member.id }` } name={ member.name }>Call</CallButton> } />
<OnlineCount rt={ rt } room="product:7" />
<Typing rt={ rt } room="chat:34:42" />
<Chat rt={ rt } room="chat:34:42" load={ ( before ) => fetchMessages( before ) } />
<Chat rt={ rt } room="chat:34:42" to="42" call />          // the other person on top, and your call in the chat
```

- **`rt`** is the page's `Realtime` from `@wordplus/realtime` (`useRealtime()` in React, or `connect()`'s).
- **The rooms and calls** are your app's, as its server declares them: the names above are examples.
- **The hooks under them** are yours too: `useRoom( rt, name )`, `useOnline( rt, ids )`, `useProfiles( rt, ids )`
  and `useTyping( rt, room )`.
- **`<CallScreen>`** takes `lang`, `strings` and `add`:
  - `lang` picks the words of the screens in English, German, Spanish, French, Italian, Dutch, Polish, Croatian or
    Hebrew. The page's language is the default.
  - `strings` puts your words over any of theirs, by the English text.
  - `add` offers Add Person.
- **`<Chat>`** pages back through the conversation your server keeps (`load`), and the room's last 5 minutes fill in
  what came since. It has typing, reactions and read ticks. `onSent` hears each message the room took, with its id, for
  your server to keep it and tell the other person (`sent`, an event on `<chat-room>`). In a chat between two, `to`
  shows the other person on its top bar with their calls, and `call` (`true` for the call named as the room) shows
  the call in the chat, beside the messages, with Show Chat and Hide Chat in its controls.

## The look

The Better Messages class names (`bm-…`) and design tokens are kept. Set the tokens on the page to make the screens
your app's own:

```css
:root {
    --bm-color-accent: 37, 99, 235;                 /* red, green and blue */
    --bm-messenger-font: Inter, system-ui, sans-serif;
    --bm-radius-card: 12px;
}
```

The elements keep their own tokens in their shadow roots, so `:root` does not reach them: set the tokens on the
elements themselves (`call-screen, chat-room, online-list { --bm-color-accent: 37, 99, 235; }`), where
they hold in light and dark alike.

Light and dark follow the system. `bm-messages-light` on `<body>` keeps the light look, and `bm-messages-dark` the
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
    Avatar, Name,                             // a user's picture and name, as your app draws them
} );
```

`domain` is the text domain a string is written with: `bp-better-messages` for the call screens, `wordplus-live-stream` for
the live streams, for a host that translates more than one product's words.

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
Stream do on any site, every class `estream-`:

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

- **Their look:** the `estream-` classes, the `--estream-*` properties on their theme root, and the appearance settings
  as props (`appearance.ts`), the shape Easy Stream's WordPress plugin saves.
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
npm test          # the build, the screens drawn from fake calls and rooms in happy-dom, and the languages
npm run gallery   # every component in its states, photographed and compared with gallery/pictures
```

- **The builds:** `npm run build` writes:
  - the ES modules and their types for bundlers (`dist/index.js`, `dist/calls.js`, `dist/react.js`),
  - the stylesheets (`dist/calls.css`, `presence.css`, `chat.css`),
  - the elements as one script with React, the styles and the languages inside (`dist/realtime-ui.min.js`),
  - the licences of what that script bundles (`dist/THIRD-PARTY-NOTICES.txt`).
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
