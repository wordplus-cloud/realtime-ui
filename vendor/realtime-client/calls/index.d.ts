/**
 * The call engine every WordPlus product runs: a call between two people over
 * one direct peer connection, through TURN when no direct path works, handed
 * to a room on the mesh when TURN fails too (README.md). The product hands a
 * session its way to the relay (transport.ts); Better Messages and the
 * realtime SDK each have their own.
 */
export { P2PCallSession } from "./session.js";
export type { P2PParticipantView, P2PSessionOptions } from "./session.js";
export { leaveUnjoined } from "./signaling.js";
export { RemoteMediaTrack } from "./remote-track.js";
export { SfuReporter, type ReportableRoom } from "./sfu-report.js";
export { probeCodecCaps, roomPublishCodec } from "./codecs.js";
export type { RoomCodec } from "./codecs.js";
export { cameraCodecFor, screenCodecFor, roomCallCodec, roomCallChoice, hardwareFromCaps, backupFor, cameraPublish, cameraMaxHeight, fitCameraTrack, fasterCameraMode, CAMERA_MIN_FPS, screenPublish, roomPixelDensity, SCREEN_ENCODING, SCREEN_CONTENT_HINT, SCREEN_DEGRADATION, DEFAULT_CAMERA_POLICY, DEFAULT_SCREEN_POLICY } from "./room-publish.js";
export type { CameraCodec, CameraCodecCaps, CameraChoice, CameraHardware, CodecPolicy, CallLayer, CameraPublish, ScreenPublish } from "./room-publish.js";
export { setCallPlatform, defaultPlatform, type CallPlatform } from "./platform.js";
export { syncPair, playoutLag, audioOutputDelay, closeAudioOutput, LIP_SYNC } from "./lip-sync.js";
export type { SyncPair, SyncReceiver, LipSyncState } from "./lip-sync.js";
export type { CallId, CallTransport, RelayMessage } from "./transport.js";
export type { P2PSource, P2PQuality, P2PConnection, P2PStats, SfuHandoff, IceServer, MediaState } from "./types.js";
/**
 * Direct is how a call between two people runs. There is no setting for it —
 * a room is where the server puts a call the direct path could not carry, not
 * a choice a site makes — so the only questions left are whether this browser
 * can hold a peer connection at all and whether a test has asked for the
 * other path.
 */
export declare function supportsP2P(): boolean;
export declare function callTransport(): 'p2p' | 'sfu';
