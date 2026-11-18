// The package's build:
//
// - dist/index.js and dist/calls.js: the screens as ES modules for an app's bundler (React and the libraries they use
//   stay imports, so the app's own copies serve them), the two entries over shared chunks;
// - dist/types: their declarations;
// - dist/calls.css, dist/presence.css and dist/chat.css: the call screens', presence's and chat's stylesheets, compiled
//   for apps;
// - dist/realtime-ui.min.js: the elements (src/elements.tsx), one script with React, the styles and the languages
//   inside, for any page: @wordplus/realtime's rt.callScreen() loads it;
// - dist/THIRD-PARTY-NOTICES.txt: every package that script bundles, with its licence in full. Every copy of the script
//   carries it beside it. A bundled package without a licence file stops the build.
//
// The stylesheets carry the design tokens (styles/_tokens.scss: Better Messages' assets/css/_tokens.scss under the
// package's prefix, `--wplus-` for `--bm-`), but only those the screens read, and those they read in turn: the whole file is its design customiser's colour
// matrices too, 220 KB that no screen of this package uses.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, transformSync } from 'esbuild';
import { compileFile, compilePart, hostOf, usedTokens } from '../styles/compile.mjs';
import { createHash } from 'node:crypto';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' );
const pkg = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) );
const external = [ ...Object.keys( pkg.peerDependencies ), ...Object.keys( pkg.dependencies ), 'react/jsx-runtime', 'react-dom/client' ];

rmSync( join( root, 'dist' ), { recursive: true, force: true } );
mkdirSync( join( root, 'dist' ), { recursive: true } );

// The stylesheets first: the elements' script carries its own as text. Compiled as styles/compile.mjs compiles them,
// the package's way of compiling the stylesheet of the parts an app takes, which an app uses too.
const compile = ( file ) => compileFile( file.replace( /^styles\//, '' ) );
const screens = ( await Promise.all( [ 'styles/calls/_call-stage.scss', 'styles/calls/_incoming-call.scss', 'styles/calls/_add-person.scss' ].map( compile ) ) ).join( '\n' );
const presence = ( await Promise.all( [ 'styles/presence/_presence.scss', 'styles/presence/_online-list.scss' ].map( compile ) ) ).join( '\n' );
// The chat's stylesheets use the tokens' mixins (wplus-zone-surface), which Better Messages' stylesheet has in scope
// from its own _tokens.scss before it imports them (its build reads `wplus-` as its own `bm-`): here they get the
// package's copy's mixins first, and nothing else of it (a mixin writes nothing until it is included).
const chat = ( await Promise.all( [ 'chat/messages', 'chat/reactions', 'chat/composer', 'chat/attachments', 'chat/chat' ].map( ( part ) => compilePart( part ) ) ) ).join( '\n' );
const chrome = await compile( 'styles/_elements.scss' );
const tokens = await compile( 'styles/_tokens.scss' );

// What the screens' markup sets inline (an avatar's radius) reads tokens too.
const sources = ( dir ) => readdirSync( dir ).flatMap( ( name ) => statSync( join( dir, name ) ).isDirectory() ? sources( join( dir, name ) ) : [ join( dir, name ) ] );
const markup = sources( join( root, 'src' ) ).map( ( file ) => readFileSync( file, 'utf8' ) ).join( '\n' );

// An app's calls.css carries the window, the rings and the tooltip floater too (the elements' chrome), which the
// React CallScreen draws in the page itself.
writeFileSync( join( root, 'dist/calls.css' ), usedTokens( tokens, screens + chrome + markup ) + '\n' + screens + '\n' + chrome );
writeFileSync( join( root, 'dist/presence.css' ), usedTokens( tokens, presence + markup ) + '\n' + presence );
writeFileSync( join( root, 'dist/chat.css' ), usedTokens( tokens, chat + markup ) + '\n' + chat );
// All three in one import, their tokens once, for an app that shows them all.
writeFileSync( join( root, 'dist/styles.css' ), usedTokens( tokens, screens + chrome + presence + chat + markup ) + '\n' + screens + '\n' + chrome + '\n' + presence + '\n' + chat );
// The live streams' stylesheet, Easy Stream's own: its --wplus-live-stream-* properties on its theme
// root, none of Better Messages' tokens. Easy Stream's WordPress build compiles the same source itself.
const streamsCss = await compile( 'styles/streams/_streams.scss' );
writeFileSync( join( root, 'dist/streams.css' ), streamsCss );
// The recording player's (components/recording): its colours are its own properties, so it needs none of the tokens.
const recordingCss = await compile( 'styles/recording/_player.scss' );
writeFileSync( join( root, 'dist/recording.css' ), recordingCss );
// The polls' stylesheet, for the polls' script alone, with the tokens it reads.
const polls = await compile( 'styles/polls/_polls.scss' );
writeFileSync( join( root, 'dist/polls.css' ), usedTokens( tokens, polls ) + '\n' + polls );

// In a shadow root there is no :root, and no body to read a theme from: the tokens go on the host. The script carries
// it as text, its white space taken out (13% of it), nothing else changed.
const elementsCss = transformSync( hostOf( usedTokens( tokens, screens + presence + chat + chrome + markup ) ) + '\n' + screens + '\n' + presence + '\n' + chat + '\n' + chrome,
    { loader: 'css', minifyWhitespace: true } ).code;

// The entries over shared chunks, so the host, the pieces and the device registry are one each however many entries a
// page imports: the root, which Better Messages' free build uses too, the call screens, which it never does, the React
// components on the SDK (react), the fakes for tests (testing), and the elements as an ES module (elements), what an
// app's own elements script is built from with its copies of the views given to setViews() (`npx @wordplus/realtime-ui
// add`, wordplus-ui.elements.tsx): its copies import the root and /calls, and must meet the same host and pieces. The
// chat's parts alone (chat), for an app that draws its own chat with them, share those chunks too.
await build( {
    entryPoints: {
        index: join( root, 'src/index.ts' ), calls: join( root, 'src/calls.ts' ), react: join( root, 'src/react.tsx' ),
        chat: join( root, 'src/chat.ts' ),
        testing: join( root, 'src/testing.ts' ), elements: join( root, 'src/elements.tsx' ),
        streams: join( root, 'src/streams.ts' ), recording: join( root, 'src/recording.ts' ),
        polls: join( root, 'src/polls.ts' ),
    },
    outdir: join( root, 'dist' ),
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2021',
    jsx: 'automatic',
    external,
    sourcemap: true,
    // A licence comment stays where its module's code is, with the code an app's bundler keeps: Lucide's, at the top of
    // primitives/icon.tsx. At the end of a chunk (esbuild's 'eof') webpack's production build lost it with the chunk's
    // tail, where its terser moves the comments it keeps into the bundle's LICENSE.txt.
    legalComments: 'inline',
    plugins: [ elementsCssPlugin(), protocolPlugin() ],
    logLevel: 'warning',
} );

// A client module, as @wordplus/realtime/react is, so a server layout of Next.js's renders <CallScreen /> and the rest
// as it renders any client component, with no file of the app's own between them. esbuild leaves a directive out of a bundle.
writeFileSync( join( root, 'dist/react.js' ), "'use client';\n" + readFileSync( join( root, 'dist/react.js' ), 'utf8' ) );

const elements = await build( {
    entryPoints: [ join( root, 'src/elements.tsx' ) ],
    outfile: join( root, 'dist/realtime-ui.min.js' ),
    metafile: true,
    bundle: true,
    format: 'iife',
    globalName: 'wordplusRealtimeUi',
    platform: 'browser',
    target: 'es2021',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [ elementsCssPlugin() ],
    logLevel: 'warning',
} );

// The elements' script is what any page loads for a call (rt.callScreen()): the live streams' views and their languages
// stay out of it, which took it from 774 KB to 964 KB once (their words were in the shared languages, 9dbc364).
const streamInputs = Object.keys( elements.metafile.inputs ).filter( ( input ) => /src\/(components\/streams|languages\/streams|inc\/stream-languages|stream-elements)/.test( input ) );
if ( streamInputs.length ) throw new Error( `realtime-ui.min.js takes in the live streams' ${ streamInputs.join( ', ' ) }. Nothing more was built.` );
// Nor the call effects' engine, which loads by itself once someone turns an effect on (dist/effects, below).
const effectInputs = Object.keys( elements.metafile.inputs ).filter( ( input ) => /src\/effects\/|@tensorflow|web-noise-suppressor|@workadventure/.test( input ) );
if ( effectInputs.length ) throw new Error( `realtime-ui.min.js takes in the call effects' ${ effectInputs.join( ', ' ) }. Nothing more was built.` );
// Nor the recording player, which a page showing a recording loads by itself (below).
const playerInputs = Object.keys( elements.metafile.inputs ).filter( ( input ) => /src\/(components\/recording|languages\/recording|recording-elements)/.test( input ) );
if ( playerInputs.length ) throw new Error( `realtime-ui.min.js takes in the recording player's ${ playerInputs.join( ', ' ) }. Nothing more was built.` );

// The recording player's element (src/recording-elements.tsx), a script of its own for a page that shows a recording:
// React, the player, its stylesheet and its words inside, none of the call screens' or their languages. hls.js's light
// build goes beside it (dist/hls.light.min.js), loaded by the player only in a browser without HLS of its own.
const recordingElements = await build( {
    entryPoints: [ join( root, 'src/recording-elements.tsx' ) ],
    outfile: join( root, 'dist/realtime-ui-recording.min.js' ),
    metafile: true,
    bundle: true,
    format: 'iife',
    globalName: 'wordplusRecordingUi',
    platform: 'browser',
    target: 'es2021',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [ elementsCssPlugin(), streamLanguagesPlugin() ],
    logLevel: 'warning',
} );
const callInputs = Object.keys( recordingElements.metafile.inputs ).filter( ( input ) => /src\/components\/calls\//.test( input ) );
if ( callInputs.length ) throw new Error( `realtime-ui-recording.min.js takes in the call screens' ${ callInputs.join( ', ' ) }. Nothing more was built.` );
cpSync( join( root, 'node_modules/hls.js/dist/hls.light.min.js' ), join( root, 'dist/hls.light.min.js' ) );
cpSync( join( root, 'node_modules/hls.js/LICENSE' ), join( root, 'dist/hls.light.min.js.LICENSE.txt' ) );

// The live streams' elements (src/stream-elements.tsx), a script of their own that @wordplus/realtime's
// rt.streamScreen() loads: React, the views, their stylesheet and their languages inside. The stream's engine is the
// page's own, under its calls, never a copy in here.
const streamElements = await build( {
    entryPoints: [ join( root, 'src/stream-elements.tsx' ) ],
    outfile: join( root, 'dist/realtime-ui-streams.min.js' ),
    metafile: true,
    bundle: true,
    format: 'iife',
    globalName: 'wordplusRealtimeStreams',
    platform: 'browser',
    target: 'es2021',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [ elementsCssPlugin(), protocolPlugin(), streamLanguagesPlugin() ],
    logLevel: 'warning',
} );
const engineInputs = Object.keys( streamElements.metafile.inputs ).filter( ( input ) => /realtime-client\/(src|dist)\/streams\/client\.|rtc-client|livekit/.test( input ) );
if ( engineInputs.length ) throw new Error( `realtime-ui-streams.min.js takes in the stream's engine: ${ engineInputs.join( ', ' ) }. Nothing more was built.` );

// What each script may weigh at most, minified: what any page loads for a call, and what a page with a stream adds. A
// change that grows one past it stops the build, to be looked at before the limit is raised. The streams' was 650,000
// until the player's statistics, quality by layer and offline notice came with their words in the eight languages
// (661 KB, 171 KB gzipped), and 700,000 until the host could drag the sharer's camera over a shared screen (3.6 KB more,
// 702.6 KB in all), and 720,000 until OBS's steps said where its Keyframe Interval is and the studio said when its key
// frames come far apart, in the eight languages (13.1 KB more, 727 KB in all), and 740,000 until those steps named
// Max B-frames and said the numbers are a starting point to try, and the studio said when OBS sends too few frames a
// second (15.5 KB more, 742.5 KB in all), and 760,000 until the engine watched for a hardware encoder dropping the
// camera's frames, and the studio set up a host's preview before their site is connected and said when OBS stopped
// sending, in the eight languages (760.7 KB in all), and 780,000 until their names took the package's prefix,
// `wplus-live-stream-` for `estream-`, ten letters more in each of some two thousand names (19.8 KB more, 799.4 KB in
// all), and 820,000 until the host's background and AI noise removal came to the studio, with the call effects' choice
// and the host's own pictures (inc/calls/effects.ts, own-backgrounds.ts), their stylesheet and their words in the eight
// languages (45.9 KB more, 851.0 KB in all, against 805.1 KB at ae91853), and 860,000 until a host on a site the cloud
// does not take yet could start a test stream and watch it on the stream's page (test-stream.tsx), the page saying how
// to watch it where it cannot reach the studio, in the eight languages (35.2 KB more, 886.2 KB in all, against 851.0 KB
// at f5daf0e, most of it the twenty strings keyed by their English in each language). The one for calls was 800,000 until a call could show in the page
// (<call-spot>) and in its chat (<chat-room to call>), with the chat's bar for the other person (10 KB more, 805 KB in
// all), and 820,000 until a spot could join its meeting with the camera and microphone off or as `join-with` says, and
// the call screen said Turn sound on where the browser held the others' sound back, in the eight languages (2.2 KB
// more, 821 KB in all), and 840,000 until the chat took files: picked, pasted or dropped, going up to the app's route,
// its pictures in a grid with a viewer of its own, its other files as rows, in the eight languages (31.5 KB more,
// 25 KB of it given back by carrying the stylesheet without its white space, 844.5 KB in all), and 860,000 until a
// group call was checked before joining: the own picture or avatar, the microphone's level, the devices, the camera
// and microphone on or off, in the eight languages (21.2 KB more, 865.7 KB in all), and 880,000 until a call said "You
// are muted" to someone talking with the microphone off, and told a moderator who joined and who raised a hand and let
// them end the call for everyone, in the eight languages (20.3 KB more, 886.0 KB in all), and 900,000 until the check
// before joining gave way to the device settings over the call in every call, a private preview or test of each
// device and a line saying who sees and hears them, offered by a card as a group call is joined, and the SDK's own
// calls took them and the hint, in the eight languages (19.8 KB more, 905.8 KB in all), and 920,000 until every class
// and token took the package's prefix, `wplus-` for Better Messages' `bm-`, three letters more in each of some six
// thousand names (19.0 KB more, 924.9 KB in all), and 940,000 until the device settings offered a blurred or replaced
// background, the app's own pictures among them (UiHost.backgrounds), and AI Noise Removal, kept by the browser and put
// on what the SDK's own calls send, and played the microphone's test back without and with it, in the eight languages,
// their engine a script of its own in dist/effects (27.9 KB more, 952.8 KB in all), and 970,000 until a call took
// keyboard shortcuts (Alt or Option and a letter for the dock's controls, Space held to talk, ? for their list) and a
// group call a picture-in-picture window with its speaker and Mute, Camera and Leave, in the eight languages (31.5 KB
// more: 14.8 KB of code, 7.2 KB of stylesheet, 9.5 KB of words), beside the People panel (1,009.5 KB in all), and
// 1,020,000 until a group call listed everyone in it, with a search and a moderator's actions, and could put one person
// in the spotlight for everyone or pin them for oneself. Measured together against the last commit (925.9 KB), file by
// file from this build's metafile: the People panel with Spotlight 39.0 KB (16.2 KB of code, 12.5 KB of stylesheet,
// 10.4 KB of words), the shortcuts with picture-in-picture 31.4 KB (15.1, 7.3 and 9.0), the effects 26.7 KB (12.1, 5.1
// and 9.6), 1,023.2 KB in all. And 1,050,000 until a group call could choose its layout (layout-choice.tsx 6.6 KB, the
// dock and grids 1.4 KB, most of 14.8 KB of words and 4.1 KB of stylesheet), and the device settings offered High
// Quality backgrounds where the device runs the better model, with what they cost, and said when it went back (some
// 4.5 KB with their words), 1,052.5 KB in all, measured file by file against the build before. And 1,090,000 until a
// moderator could ask someone to turn on their camera or microphone, with the steps to allow it for each browser where
// it is blocked, in the eight languages (ask-prompt.tsx 6.5 KB, most of 36.0 KB of words, 1.4 KB of stylesheet, 1.9 KB
// in the person's menu, the toasts and the browser's name), and a group call's tiles moved to a new layout with their
// pictures playing on (grid-moves.ts 1.4 KB, kept-media.tsx 1.1 KB), 1,099.7 KB in all, 48.2 KB over the build
// before (1,052.6 KB), measured file by file, the backgrounds catalog taking 0.5 KB off. And 1,140,000 until a recorded
// group call told everyone in it: a REC pill at the top of the call, Start Recording and Stop asked first in the call's
// own card with the settings it records with, and a notice to everyone else, or a question to stay or leave, or that
// question with the microphone and camera held until they agree, in the eight languages (59.1 KB more, 38.6 KB of it
// words), 1,185.5 KB in all, against the build before (1,126.4 KB). And 1,200,000 until everyone else could be told by
// REC alone, the notice had Do Not Show Again and said nothing of who watches where only the site keeps a recording,
// and the start's confirm listed an audio call's picture in its own layout, in the eight languages (4.0 KB more,
// 1,200.5 KB in all, against 1,196.4 KB at 7a608da).
// The recording player's own script is React with the player, its stylesheet and its words in the eight languages:
// 268.6 KB (86.3 KB gzipped) when it came, React DOM 176 KB of it, the player and transcript 15 KB. And 280,000 until its
// row went away while it played with nothing moving, it drew the captions itself above the row, and full screen took the
// host's dark scheme, with Exit full screen in the eight languages (5.1 KB more, 284.5 KB in all, against 279.4 KB).
const BUDGETS = { 'realtime-ui.min.js': 1_210_000, 'realtime-ui-streams.min.js': 900_000, 'realtime-ui-recording.min.js': 290_000 };
for ( const [ file, most ] of Object.entries( BUDGETS ) ) {
    const size = statSync( join( root, 'dist', file ) ).size;
    if ( size > most ) throw new Error( `dist/${ file } is ${ size } bytes, over its ${ most }. Nothing more was built.` );
}

await buildEffects();
await buildNoise();
buildBackgrounds();

/** An engine's script, minified alone into `outfile`, as the page loads it by itself (a script tag, no module). */
function buildEngine( entry, outfile ) {
    return build( {
        entryPoints: [ join( root, entry ) ],
        outfile,
        metafile: true,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2021',
        minify: true,
        legalComments: 'none',
        define: { 'process.env.NODE_ENV': '"production"' },
        logLevel: 'warning',
    } );
}

/**
 * A pack's folder sealed as a site downloads it: its THIRD-PARTY-NOTICES.txt (`about`, then `entries`, each licence in
 * full), manifest.json with each file's size and SHA-256, the folder and the zip held to their budgets, then the zip,
 * dist/<name>-<hash>.zip, made the same byte for byte from the same files (so its name changes only when they do), and
 * dist/<name>.json naming it with its size and SHA-256, which the SDK's copy carries to know which pack its plugins take.
 */
function seal( name, { engine, about, entries, folderMost, zipMost } ) {
    const out = join( root, 'dist', name );
    writeFileSync( join( out, 'THIRD-PARTY-NOTICES.txt' ), [
        about,
        '',
        ...entries.map( ( entry ) => `- ${ entry.title }` ),
        '',
        ...entries.flatMap( ( entry ) => [ '='.repeat( 80 ), entry.title, '='.repeat( 80 ), '', entry.text, '' ] ),
    ].join( '\n' ) );

    // Each file's size and SHA-256, for a site to check what it unpacked.
    const files = sources( out ).map( ( file ) => file.slice( out.length + 1 ) ).sort();
    const listed = Object.fromEntries( files.map( ( file ) => {
        const bytes = readFileSync( join( out, file ) );
        return [ file, { size: bytes.length, sha256: createHash( 'sha256' ).update( bytes ).digest( 'hex' ) } ];
    } ) );
    writeFileSync( join( out, 'manifest.json' ), JSON.stringify( { engine, version: pkg.version, files: listed }, null, 2 ) + '\n' );

    const folder = sources( out ).reduce( ( total, file ) => total + statSync( file ).size, 0 );
    if ( folder > folderMost ) throw new Error( `dist/${ name } is ${ folder } bytes, over its ${ folderMost }. Nothing more was built.` );

    const zip = zipFolder( out );
    const sha256 = createHash( 'sha256' ).update( zip ).digest( 'hex' );
    const file = `${ name }-${ sha256.slice( 0, 12 ) }.zip`;
    writeFileSync( join( root, 'dist', file ), zip );
    if ( zip.length > zipMost ) throw new Error( `dist/${ file } is ${ zip.length } bytes, over its ${ zipMost }. Nothing more was built.` );
    writeFileSync( join( root, 'dist', name + '.json' ), JSON.stringify( { engine, version: pkg.version, file, size: zip.length, sha256, unpacked: folder }, null, 2 ) + '\n' );
}

/** A pack's folder, emptied, with its zips of before gone. */
function freshPack( name, folders ) {
    const out = join( root, 'dist', name );
    rmSync( out, { recursive: true, force: true } );
    for ( const old of readdirSync( join( root, 'dist' ) ).filter( ( file ) => new RegExp( `^${ name }-[0-9a-f]+\\.zip$` ).test( file ) ) ) rmSync( join( root, 'dist', old ) );
    for ( const folder of folders ) mkdirSync( join( out, folder ), { recursive: true } );
    return out;
}

/**
 * The call effects' pack (src/effects/engine.ts), which no plugin carries: a site downloads it from WordPlus Cloud (the
 * WordPlus SDK's video effects) and its host names the folder it went to (UiHost.effectsUrl), from which a page fetches
 * the files only once someone turns an effect on. In dist/effects: the engine (realtime-effects.min.js, with MediaPipe's
 * tasks-vision), MediaPipe's runtime in its SIMD build (mediapipe/), the model (effects/models: Baidu's PP-HumanSegV2-Lite
 * converted to TFLite, src/effects/segmenter.ts, MediaPipe's landscape model gone since 2026-11-02, as no device falls
 * back to it any more), the licences of all of it, and manifest.json with each file's size
 * and SHA-256. The backgrounds are not in it: they are a catalog of their own (buildBackgrounds()), and AI Noise
 * Removal is a pack of its own (buildNoise()). Then dist/effects-<hash>.zip and dist/effects.json (seal()). The engine,
 * the folder and the zip are watched as the scripts are.
 */
async function buildEffects() {
    const out = freshPack( 'effects', [ 'mediapipe' ] );
    const engine = await buildEngine( 'src/effects/engine.ts', join( out, 'realtime-effects.min.js' ) );
    // MediaPipe's tasks-vision is most of it.
    const most = 200_000;
    const size = statSync( join( out, 'realtime-effects.min.js' ) ).size;
    if ( size > most ) throw new Error( `dist/effects/realtime-effects.min.js is ${ size } bytes, over its ${ most }. Nothing more was built.` );

    // MediaPipe's runtime with WebAssembly's SIMD alone: every browser that runs the effects has it, and one without is
    // offered none of them (inc/calls/effects.ts). Each file is served under a name that says what it is, as a site's
    // network log and its uploads folder show it, the engine reading them by those names (src/effects/segmenter.ts).
    const vision = join( root, 'node_modules/@mediapipe/tasks-vision' );
    cpSync( join( vision, 'wasm/vision_wasm_internal.js' ), join( out, 'mediapipe/runtime.js' ) );
    cpSync( join( vision, 'wasm/vision_wasm_internal.wasm' ), join( out, 'mediapipe/runtime.wasm' ) );
    mkdirSync( join( out, 'models' ), { recursive: true } );
    cpSync( join( root, 'effects/models/pphumansegv2_lite_256x144_fp16.tflite' ), join( out, 'models/person-segmentation.tflite' ) );

    // What the files carry, each licence in full: the packages the engine bundles as esbuild read them (tasks-vision
    // ships no licence file, and its package.json names Apache 2.0), then the runtime and the models.
    const apache = readFileSync( join( root, 'effects/licenses/apache-2.0.txt' ), 'utf8' ).trim();
    const packages = new Map();
    for ( const input of Object.keys( engine.metafile.inputs ) ) {
        const at = input.lastIndexOf( 'node_modules/' );
        if ( at < 0 || input.startsWith( '(disabled):' ) ) continue;
        const parts = input.slice( at + 'node_modules/'.length ).split( '/' );
        const name = parts[ 0 ].startsWith( '@' ) ? parts[ 0 ] + '/' + parts[ 1 ] : parts[ 0 ];
        if ( packages.has( name ) ) continue;
        const dir = join( process.cwd(), input.slice( 0, at ), 'node_modules', name );
        const info = JSON.parse( readFileSync( join( dir, 'package.json' ), 'utf8' ) );
        const file = readdirSync( dir ).find( ( f ) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test( f ) );
        if ( ! file && info.license !== 'Apache-2.0' ) throw new Error( `${ name } is bundled in the effects with no licence file in ${ dir }. Nothing more was built.` );
        packages.set( name, {
            title: `${ name } ${ info.version } (${ info.license }), in realtime-effects.min.js`,
            text: ( file ? readFileSync( join( dir, file ), 'utf8' ) : apache ).replace( /\r\n?/g, '\n' ).trim(),
        } );
    }
    const visionInfo = JSON.parse( readFileSync( join( vision, 'package.json' ), 'utf8' ) );
    seal( 'effects', {
        engine: 2,
        about: `Third-party software in the call effects of @wordplus/realtime-ui ${ pkg.version }.`,
        entries: [
            ...[ ...packages.values() ].sort( ( a, b ) => a.title.localeCompare( b.title ) ),
            { title: `MediaPipe's runtime, from @mediapipe/tasks-vision ${ visionInfo.version }, Google LLC (Apache-2.0), mediapipe/runtime.js and mediapipe/runtime.wasm (its vision_wasm_internal.js and vision_wasm_internal.wasm)`, text: apache },
            { title: 'PP-HumanSegV2-Lite, its portrait model (256x144), PaddleSeg, PaddlePaddle Authors (Apache-2.0), models/person-segmentation.tflite. Changed by WordPlus: its input fixed at 144x256, converted from Paddle to TFLite (paddle2onnx, onnx2tf), its weights stored as float16, and MediaPipe\'s segmenter metadata added', text: apache },
        ],
        // The folder: 20.4 MB when MediaPipe and the multiclass model came (2026-10-30), 1.2 MB with TensorFlow.js's
        // model, 20.2 MB once RNNoise left for AI Noise Removal's own pack, 13.8 MB with Baidu's model in multiclass's
        // place (2026-11-01), 13.6 MB without the landscape model (2026-11-02).
        folderMost: 15_000_000,
        zipMost: 6_500_000,
    } );
}

/**
 * AI Noise Removal's pack (src/effects/noise-engine.ts), apart from the effects' (asked on 2026-11-01: "it should not be
 * included to SDK, users should be able to download it in plugin settings like the blurs"): DeepFilterNet3 is 11 MB
 * more than all of them, and a site may want either alone. A site downloads it from WordPlus Cloud as it does the
 * effects (the WordPlus SDK's video effects), and its host names the folder it went to (UiHost.noiseUrl). In
 * dist/noise: the engine (realtime-noise.min.js), DeepFilterNet3 as @workadventure/noise-suppression builds it for a
 * worklet (deepfilternet/: the worklet, its runtime df_bg.wasm, and DeepFilterNet3_onnx.tar.gz as deepfilternet3.bin, a
 * name no server unzips on the way), GTCRN as @sapphi-red/web-noise-suppressor builds it (gtcrn/: the worklet and
 * gtcrn.wasm), the licences, and manifest.json. Then dist/noise-<hash>.zip and dist/noise.json (seal()).
 */
async function buildNoise() {
    const out = freshPack( 'noise', [ 'deepfilternet', 'gtcrn' ] );
    const engine = await buildEngine( 'src/effects/noise-engine.ts', join( out, 'realtime-noise.min.js' ) );
    const bundled = Object.keys( engine.metafile.inputs ).filter( ( input ) => input.includes( 'node_modules/' ) );
    if ( bundled.length ) throw new Error( `realtime-noise.min.js takes in ${ bundled.join( ', ' ) }, whose licences its notices do not carry. Nothing more was built.` );
    const most = 12_000;
    const size = statSync( join( out, 'realtime-noise.min.js' ) ).size;
    if ( size > most ) throw new Error( `dist/noise/realtime-noise.min.js is ${ size } bytes, over its ${ most }. Nothing more was built.` );

    const deepFilterNet = join( root, 'node_modules/@workadventure/noise-suppression' );
    cpSync( join( deepFilterNet, 'dist/assets/deepfilternet-worklet-processor.js' ), join( out, 'deepfilternet/worklet.js' ) );
    cpSync( join( deepFilterNet, 'dist/assets/deepfilternet/df_bg.wasm' ), join( out, 'deepfilternet/df_bg.wasm' ) );
    cpSync( join( deepFilterNet, 'dist/assets/deepfilternet/DeepFilterNet3_onnx.tar.gz' ), join( out, 'deepfilternet/deepfilternet3.bin' ) );
    const suppressor = join( root, 'node_modules/@sapphi-red/web-noise-suppressor' );
    cpSync( join( suppressor, 'dist/gtcrn/workletProcessor.js' ), join( out, 'gtcrn/worklet.js' ) );
    cpSync( join( suppressor, 'dist/gtcrn.wasm' ), join( out, 'gtcrn/gtcrn.wasm' ) );

    const apache = readFileSync( join( root, 'effects/licenses/apache-2.0.txt' ), 'utf8' ).trim();
    const licence = ( dir ) => readFileSync( join( dir, 'LICENSE' ), 'utf8' ).replace( /\r\n?/g, '\n' ).trim();
    const version = ( dir ) => JSON.parse( readFileSync( join( dir, 'package.json' ), 'utf8' ) ).version;
    // GTCRN's worklet opens with the licences of what it and its build are made of (GTCRN, pffft, ...): each in full.
    const heads = [ ...readFileSync( join( out, 'gtcrn/worklet.js' ), 'utf8' ).matchAll( /\/\*!([\s\S]*?)\*\//g ) ]
        .map( ( match ) => match[ 1 ].split( '\n' ).map( ( line ) => line.replace( /^\s*\* ?/, '' ) ).join( '\n' ).trim() );
    if ( ! heads.some( ( head ) => /Rong Xiaobin/.test( head ) ) ) throw new Error( 'gtcrn/worklet.js no longer opens with GTCRN\'s licence: its notices need another source. Nothing more was built.' );
    seal( 'noise', {
        engine: 1,
        about: `Third-party software in AI Noise Removal of @wordplus/realtime-ui ${ pkg.version }.`,
        entries: [
            { title: `@workadventure/noise-suppression ${ version( deepFilterNet ) }, WorkAdventure (MIT), deepfilternet/worklet.js`, text: licence( deepFilterNet ) },
            { title: 'DeepFilterNet, Hendrik Schröter (MIT OR Apache-2.0): libDF and the Rust crates it is built with (tract, Sonos, among them, each MIT OR Apache-2.0) in deepfilternet/df_bg.wasm and deepfilternet/worklet.js, and the DeepFilterNet3 model, deepfilternet/deepfilternet3.bin (DeepFilterNet3_onnx.tar.gz)', text: readFileSync( join( root, 'effects/licenses/deepfilternet-mit.txt' ), 'utf8' ).trim() + '\n\n' + '-'.repeat( 80 ) + '\n\n' + apache },
            { title: `@sapphi-red/web-noise-suppressor ${ version( suppressor ) } (MIT), gtcrn/worklet.js`, text: licence( suppressor ) },
            { title: 'gtcrn-wasm, sapphi-red (MIT), in gtcrn/gtcrn.wasm and gtcrn/worklet.js', text: readFileSync( join( root, 'effects/licenses/gtcrn-wasm.txt' ), 'utf8' ).trim() },
            ...heads.map( ( head ) => ( { title: `${ head.split( '\n' )[ 0 ] }, in gtcrn/gtcrn.wasm and gtcrn/worklet.js`, text: head } ) ),
        ],
        // The folder and the zip as DeepFilterNet3 came (2026-11-01): its runtime 14.6 MB and its model 8.0 MB.
        folderMost: 24_000_000,
        zipMost: 13_500_000,
    } );
}

/**
 * The catalog of backgrounds WordPlus Cloud serves beside the pack (effects/backgrounds/catalog.json), from which a
 * site's administrator picks those its calls offer, each downloaded to the site on its own (asked on 2026-10-30:
 * "built-in background also should be downloadable from the server and user must be able to select which of them to
 * enable"). In dist/backgrounds: each picture and its thumbnail under a name with its hash, so a cache never serves an
 * older one under the same name, and manifest.json listing them in order with their names, sizes and SHA-256. The
 * whole folder is what is uploaded, to WordPlus Cloud's effects/backgrounds/.
 */
function buildBackgrounds() {
    const from = join( root, 'effects/backgrounds' );
    const out = join( root, 'dist/backgrounds' );
    rmSync( out, { recursive: true, force: true } );
    mkdirSync( out, { recursive: true } );
    const catalog = JSON.parse( readFileSync( join( from, 'catalog.json' ), 'utf8' ) );
    const copy = ( source, name ) => {
        const bytes = readFileSync( join( from, source ) );
        const sha256 = createHash( 'sha256' ).update( bytes ).digest( 'hex' );
        const file = `${ name }-${ sha256.slice( 0, 12 ) }.webp`;
        writeFileSync( join( out, file ), bytes );
        return { file, size: bytes.length, sha256 };
    };
    const backgrounds = catalog.backgrounds.map( ( one ) => {
        if ( ! /^[a-z0-9-]{1,64}$/.test( one.id ) || ! one.name ) throw new Error( `effects/backgrounds/catalog.json: ${ JSON.stringify( one.id ) } needs an id of a-z, 0-9 and - and a name. Nothing more was built.` );
        const picture = copy( one.id + '.webp', one.id );
        const thumb = copy( one.id + '-thumb.webp', one.id + '-thumb' );
        return {
            id: one.id,
            name: one.name,
            names: one.names ?? {},
            default: one.default === true,
            file: picture.file,
            size: picture.size,
            sha256: picture.sha256,
            thumb: thumb.file,
            thumb_size: thumb.size,
            thumb_sha256: thumb.sha256,
            licence: "WordPlus's own, for the backgrounds of calls and streams on the WordPlus SDK",
        };
    } );
    writeFileSync( join( out, 'manifest.json' ), JSON.stringify( { version: 1, backgrounds }, null, 2 ) + '\n' );
}

/**
 * A folder as one zip, the same bytes from the same files: its entries in order, each with the same time (1980-01-01),
 * deflated, or stored where that saves nothing.
 */
function zipFolder( dir ) {
    const files = sources( dir ).map( ( file ) => file.slice( dir.length + 1 ) ).sort();
    const local = [];
    const central = [];
    let offset = 0;
    for ( const file of files ) {
        const data = readFileSync( join( dir, file ) );
        const deflated = deflateRawSync( data, { level: 9 } );
        const stored = deflated.length >= data.length;
        const body = stored ? data : deflated;
        const name = Buffer.from( file.split( '\\' ).join( '/' ), 'utf8' );
        const crc = crc32( data );
        const head = Buffer.alloc( 30 );
        head.writeUInt32LE( 0x04034b50, 0 );
        head.writeUInt16LE( 20, 4 );
        head.writeUInt16LE( 0x0800, 6 );
        head.writeUInt16LE( stored ? 0 : 8, 8 );
        head.writeUInt16LE( 0, 10 );
        head.writeUInt16LE( 33, 12 );
        head.writeUInt32LE( crc, 14 );
        head.writeUInt32LE( body.length, 18 );
        head.writeUInt32LE( data.length, 22 );
        head.writeUInt16LE( name.length, 26 );
        head.writeUInt16LE( 0, 28 );
        local.push( head, name, body );
        const entry = Buffer.alloc( 46 );
        entry.writeUInt32LE( 0x02014b50, 0 );
        entry.writeUInt16LE( 20, 4 );
        entry.writeUInt16LE( 20, 6 );
        entry.writeUInt16LE( 0x0800, 8 );
        entry.writeUInt16LE( stored ? 0 : 8, 10 );
        entry.writeUInt16LE( 0, 12 );
        entry.writeUInt16LE( 33, 14 );
        entry.writeUInt32LE( crc, 16 );
        entry.writeUInt32LE( body.length, 20 );
        entry.writeUInt32LE( data.length, 24 );
        entry.writeUInt16LE( name.length, 28 );
        entry.writeUInt32LE( offset, 42 );
        central.push( entry, name );
        offset += head.length + name.length + body.length;
    }
    const directory = Buffer.concat( central );
    const end = Buffer.alloc( 22 );
    end.writeUInt32LE( 0x06054b50, 0 );
    end.writeUInt16LE( files.length, 8 );
    end.writeUInt16LE( files.length, 10 );
    end.writeUInt32LE( directory.length, 12 );
    end.writeUInt32LE( offset, 16 );
    return Buffer.concat( [ ...local, directory, end ] );
}

/**
 * The views take four constants of the stream's protocol from @wordplus/realtime-client/streams (CHAT_MAX, REACTIONS,
 * REACTION_EMOJI, CHOSEN_MAX_SIDE), whose entry is the engine too: in every build, that entry is its protocol module
 * alone, from the package's own copy of the client (vendor/realtime-client, scripts/client.mjs), so neither the stream
 * elements' script nor dist/streams.js carries the engine or imports a package that isn't published.
 */
function protocolPlugin() {
    return {
        name: 'protocol-only',
        setup( b ) {
            b.onResolve( { filter: /^@wordplus\/realtime-client\/streams$/ }, () => ( { path: join( root, 'vendor/realtime-client/streams/protocol.js' ) } ) );
        },
    };
}

function streamLanguagesPlugin() {
    return {
        name: 'stream-languages',
        setup( b ) {
            // The shared languages are Better Messages' screens' words, which no stream view asks for: the views' words
            // are in their own domain (src/languages/streams/). Empty tables in their place keep 87 KB out.
            b.onLoad( { filter: /src\/languages\/[a-z]{2}\.json$/ }, () => ( { contents: '{}', loader: 'json' } ) );
        },
    };
}

/** The stylesheets as the text `virtual:elements-css` and `virtual:streams-css` import. */
function elementsCssPlugin() {
    return {
        name: 'elements-css',
        setup( b ) {
            b.onResolve( { filter: /^virtual:(elements|streams|recording)-css$/ }, ( args ) => ( { path: args.path.slice( 'virtual:'.length ), namespace: 'virtual' } ) );
            b.onLoad( { filter: /.*/, namespace: 'virtual' }, ( args ) => ( { contents: args.path === 'streams-css' ? streamsCss : args.path === 'recording-css' ? transformSync( recordingCss, { loader: 'css', minifyWhitespace: true } ).code : elementsCss, loader: 'text' } ) );
        },
    };
}

// The notices: the packages the two scripts bundle, as esbuild read them, each with its licence in full, with plain
// line ends whatever its package wrote, so each copy of the notices is the same file.
const bundled = new Map();
for ( const input of [ ...Object.keys( elements.metafile.inputs ), ...Object.keys( streamElements.metafile.inputs ), ...Object.keys( recordingElements.metafile.inputs ) ] ) {
    const at = input.lastIndexOf( 'node_modules/' );
    if ( at < 0 ) continue;
    const parts = input.slice( at + 'node_modules/'.length ).split( '/' );
    const name = parts[ 0 ].startsWith( '@' ) ? parts[ 0 ] + '/' + parts[ 1 ] : parts[ 0 ];
    const dir = join( process.cwd(), input.slice( 0, at ), 'node_modules', name );
    if ( ! bundled.has( dir ) ) bundled.set( dir, JSON.parse( readFileSync( join( dir, 'package.json' ), 'utf8' ) ) );
}
// A package that ships no licence file of its own but names another's: react-property's README gives React's licence,
// as its code is taken from React's.
const LICENCE_OF = { 'react-property': 'react' };
const licenceOf = ( dir, name ) => {
    if ( LICENCE_OF[ name ] ) {
        const from = join( dir, '..', LICENCE_OF[ name ] );
        return `(${ name } carries ${ LICENCE_OF[ name ] }'s licence, as its README says.)\n\n` + licenceOf( from, LICENCE_OF[ name ] );
    }
    const file = readdirSync( dir ).find( ( f ) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test( f ) );
    if ( ! file ) throw new Error( `${ name } is bundled but has no licence file in ${ dir }. Nothing more was built.` );
    return readFileSync( join( dir, file ), 'utf8' ).replace( /\r\n?/g, '\n' ).trim();
};
const rule = '='.repeat( 80 );
const packages = [ ...bundled.entries() ].sort( ( a, b ) => a[ 1 ].name.localeCompare( b[ 1 ].name ) );
const named = ( p ) => `${ p.name } ${ p.version } (${ typeof p.license === 'string' ? p.license : 'see its licence' })`;
// Code copied into the package's own sources, which no bundled package.json names, with its licence beside it: the
// icons, drawn on Lucide's geometry and many of them Lucide's own (primitives/icon.tsx, primitives/icons/). They are in
// every script of the package, and primitives/icon.tsx carries the same licence as a /*! */ banner, so an app's own
// bundle of the package keeps it too.
const copied = [
    { name: 'Lucide icons (ISC, with portions of Feather, MIT), in src/primitives/icon.tsx and src/primitives/icons/', file: 'src/primitives/icons/LICENSE-lucide.txt' },
];
const copiedText = ( c ) => {
    if ( ! statSync( join( root, c.file ), { throwIfNoEntry: false } ) ) throw new Error( `${ c.file }, the licence of ${ c.name }, is missing. Nothing more was built.` );
    return readFileSync( join( root, c.file ), 'utf8' ).replace( /\r\n?/g, '\n' ).trim();
};
writeFileSync( join( root, 'dist/THIRD-PARTY-NOTICES.txt' ), [
    `Third-party software in realtime-ui.min.js, realtime-ui-streams.min.js and realtime-ui-recording.min.js, @wordplus/realtime-ui ${ pkg.version }`,
    '',
    ...packages.map( ( [ , p ] ) => `- ${ named( p ) }` ),
    ...copied.map( ( c ) => `- ${ c.name }` ),
    '',
    ...packages.flatMap( ( [ dir, p ] ) => [ rule, named( p ), rule, '', licenceOf( dir, p.name ), '' ] ),
    ...copied.flatMap( ( c ) => [ rule, c.name, rule, '', copiedText( c ), '' ] ),
].join( '\n' ) );

execFileSync( join( root, 'node_modules/.bin/tsc' ), [ '-p', join( root, 'tsconfig.json' ) ], { stdio: 'inherit' } );

console.log( 'built dist/index.js, dist/calls.js, dist/react.js, dist/chat.js, dist/testing.js, dist/types, dist/calls.css, dist/realtime-ui.min.js, dist/realtime-ui-streams.min.js, dist/THIRD-PARTY-NOTICES.txt' );

// The views an app copies, on the declarations just written (scripts/views.mjs).
await import( './views.mjs' );

