/**
 * Live streams: Easy Stream's engine, moved here whole in step 2 so the SDK's `calls.stream()` and
 * Easy Stream's WordPress plugin run the same code. Its own entry (`@wordplus/realtime-client/streams`), which the page
 * script never bundles.
 *
 * protocol.ts is a copy of Easy Stream's packages/protocol/src/index.ts, byte for byte: Easy Stream's tests fail when
 * the two differ, so a change to the protocol is made in both.
 */
export { EasyStreamClient, cameraCodec, canShareScreen, personOf } from './client.js';
export { pageMedia } from './media.js';
export { choosableLayers, chosenLayer } from './playback.js';
export { avatarIn, expiresAt, issuerOf } from './grant.js';
export * from './protocol.js';
