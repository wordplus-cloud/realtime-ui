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
export { cameraCodecFor, screenCodecFor, screenCodecOrder, roomCallCodec, roomCallChoice, hardwareFromCaps, backupFor, cameraPublish, cameraMaxHeight, fitCameraTrack, fasterCameraMode, CAMERA_MIN_FPS, screenPublish, screenVideoMode, directScreenMode, applyScreenVideoMode, roomPixelDensity, SCREEN_ENCODING, SCREEN_CONTENT_HINT, DIRECT_SCREEN_CONTENT_HINT, SCREEN_SCALABILITY_MODE_SVC, SCREEN_DEGRADATION, SCREEN_DEGRADATION_VIDEO, DEFAULT_CAMERA_POLICY, DEFAULT_SCREEN_POLICY } from "./room-publish.js";
export type { CameraCodec, CameraCodecCaps, CameraChoice, CameraHardware, CodecPolicy, CallLayer, CameraPublish, ScreenPublish, ScreenVideoMode, ScreenShareTrack } from "./room-publish.js";
export { droppedHardwareCodecs, rememberDroppedHardware, HARDWARE_DROPS_KEY } from "./room-publish.js";
export { watchCameraEncoder, dropsFrames, cpuHeld, readingsFor, hardwareReading, readEncoder, layerEncoders } from "./encoder-watch.js";
export type { EncoderReading, EncoderLayer } from "./encoder-watch.js";
export { cameraCodecOrder, cameraCodecRecord, cameraCodecRecords, cameraFinding, rememberCameraCodec, droppedCameraCodecs, heavySoftwareCodecs, cameraCheckPassed, browserVersion, windowsDesktopChromium, legacyCamera, uncheckedBrowser, knownAdapter, CAMERA_CODECS_KEY, CAMERA_CODEC_KEEP_MS } from "./room-publish.js";
export type { CameraCodecRecord, CameraCodecResult } from "./room-publish.js";
export { choiceHeight, vp9Height, VP9_TOP_HEIGHT, CAMERA_STEP_DOWN_HEIGHT } from "./room-publish.js";
export { fitsLower, CHECK_INFER_HEADROOM } from "./camera-check.js";
export { stepDownCamera, stepsDown } from "./camera-adapt.js";
export { cameraTune, cameraRules, cameraRuleFor, cameraRuleOrder, cameraEnvironment, gpuMaker, CAMERA_TUNE_DEFAULTS, CAMERA_TUNE_RANGES, DEFAULT_CAMERA_RULES } from "./room-publish.js";
export type { CameraTune, CameraRule, CameraEnvironment, CameraOs, CameraBrowser, CameraGpu, CameraDevice } from "./room-publish.js";
export { checkedCameraChoice, todaysCameraChoice, measureCameraEncoder, judgeEncoder, cameraCheckRunning, onCameraCheck, meshCameraReport, reportMeshCamera, graphicsAdapter, CAMERA_CHECK_BUDGET_MS, CAMERA_CHECK_POLL_MS, MESH_CAMERA_SWITCHES } from "./camera-check.js";
export type { CameraCheckVerdict, CheckWarmup, CheckedCameraChoice, CameraTest, CameraSwitch, MeshCameraReport, CameraCheckOptions, EncoderSample } from "./camera-check.js";
export { CameraSwitchGuard, CameraOptimizing, switchCameraCodec, nextCameraChoice, encodeCameraState, decodeCameraState, CAMERA_STATE_TOPIC, CAMERA_SWITCHES_MAX, CAMERA_SWITCH_GAP_MS, CAMERA_SWITCH_WARMUP_MS, CAMERA_REPUBLISH_TIMEOUT_MS, CAMERA_OPTIMIZING_MAX_MS, CAMERA_ANNOUNCE_TIMEOUT_MS } from "./camera-adapt.js";
export type { CameraState, CameraSwitchRefusal, CameraSwitchSteps } from "./camera-adapt.js";
export { setCallPlatform, defaultPlatform, type CallPlatform } from "./platform.js";
export { syncPair, playoutLag, audioOutputDelay, closeAudioOutput, LIP_SYNC } from "./lip-sync.js";
export type { SyncPair, SyncReceiver, LipSyncState } from "./lip-sync.js";
export { callPolicy, settingNumber, settingFlag, settingWord, screenEncoding, applyScreenSettings, micPublish, screenAudioPublish, micCapture, cameraCapture, screenCapture, connectGiveUpMs, cameraPublishChanged, screenPublishChanged, applyNowDelayMs } from "./room-publish.js";
export type { CallSettings, CameraScalability, ScreenContentHint } from "./room-publish.js";
export { checkNumbers, type CheckNumbers } from "./camera-check.js";
export { watchNumbers, type WatchNumbers } from "./encoder-watch.js";
export { lipSyncNumbers } from "./lip-sync.js";
export { roomSettings, roomPolicy, applyViewSettings, type SettingsRoom } from "./room-settings.js";
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
