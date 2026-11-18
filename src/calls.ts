// @wordplus/realtime-ui/calls: the call screens. A call between two (ringing out and in, connected, its picture
// and its controls), the group video grid and the group audio roster, the call dock, the devices, and what a
// moderator does. Drawn from a CallContext that whoever runs the call provides: Better Messages' call container, or
// an app's calls on @wordplus/realtime.

export { default as CallScreen } from "./components/calls/call-screen.tsx";
export type { CallLayout } from "./components/calls/call-screen.tsx";
// A call between two alone, for an app whose calls are only that: CallScreen's private layout without the group calls,
// and the call as it runs on the app's own calls of @wordplus/realtime (`calls.start()`, or an incoming call accepted),
// with its camera, microphone and screen, and what to say once it ends. Live Support's calls with visitors.
export { default as PrivateCallScreen } from "./components/calls/private-call-screen.tsx";
export { usePrivateCall, noticeFor } from "./sdk/use-private-call.ts";
export { CallOptionsContext } from "./sdk/call-options.ts";
export type { CallOptions } from "./sdk/call-options.ts";
export type { SdkCall, SdkRemoteMedia, SdkRemoteTrack, SdkMediaSource } from "./sdk/types.ts";
export { CallContext, callInfoDefaults } from "./components/calls/context.ts";
export type {
    CallContextInterface, CallParticipant, CallInfo, CallThread, CallTrack, CallPublication, CallAction,
    CallConnectionQuality, CallConnectionState, CallModeration,
} from "./components/calls/context.ts";
export { default as PrivateCallLayout } from "./components/calls/private-call.tsx";
export { default as GroupVideoCallLayout } from "./components/calls/group-video-call.tsx";
export { default as GroupAudioCallLayout } from "./components/calls/group-audio-call.tsx";
export { default as GroupVideoGrid, SHOWS_TILES } from "./components/calls/group-video-grid.tsx";
export { default as GroupAudioGrid, AUDIO_WINDOW_FROM } from "./components/calls/group-audio-grid.tsx";
export { default as GroupVideoGridItem } from "./components/calls/group-video-grid-item.tsx";
export { default as GroupAudioGridItem } from "./components/calls/group-audio-grid-item.tsx";
// A tile's video or audio element kept for a moment as the tile goes, so the same person drawn again elsewhere plays on.
export { default as KeptMedia, keptElement } from "./components/calls/kept-media.tsx";
// The grid's tiles moved to a new layout's places from where they were, by a transform.
export { default as useGridMoves, MOVE_MS } from "./components/calls/grid-moves.ts";
export type { KeptMediaProps } from "./components/calls/kept-media.tsx";
export { default as CallDock } from "./components/calls/call-dock.tsx";
// Controls in the dock's More whatever the room: what a call is set up with once.
export { DockMore } from "./components/calls/call-dock.tsx";
// The dock's fold, its tail in a More sheet, for a dock in a call's place that draws its own More button.
export { default as FoldingDock } from "./components/calls/folding-dock.tsx";
// A button of the app's own in the dock (the `controls` piece).
export { default as CallControl } from "./components/calls/call-control.tsx";
export type { CallControlProps } from "./components/calls/call-control.tsx";
export { default as DeviceSwitch } from "./components/calls/device-switch.tsx";
export { AddPersonButton, AddPersonPanel } from "./components/calls/add-person.tsx";
export type { CallPerson } from "./components/calls/context.ts";
export { moderates, useModerationActs } from "./components/calls/moderation.ts";
// A moderator's controls spelled out: Host Controls and a person's panel above the dock, the ⋯ on a tile that opens
// it, and the locked microphone of someone a moderator muted, on their dock and their tile.
export {
    ModerationPanelContext, RoomPanel, PersonPanel, ManageParticipant, MicLockedChip, hostControlsItem, lockedMicItem,
    roomModerated, tileModerated, personState, heldMute, useModeratorNotice, useModerationPanel, useMuteEveryone,
    ModerationRow, userIdOf, CallPopover,
} from "./components/calls/moderation-panels.tsx";
export type { ModerationPanel, ModerationPanelFrom } from "./components/calls/moderation-panels.tsx";
// Participants: everyone in a group call as one list, from the dock, a column beside the tiles on a wide stage and a
// sheet above the dock on a narrow one, with a moderator's actions on each row.
export {
    PeoplePanel, PeopleColumnContext, peopleItem, peopleOf, peopleOrder, useHandOrder, usePeoplePanel, addPersonItem,
    PEOPLE_COLUMN_FROM, PEOPLE_SEARCH_FROM, PEOPLE_WINDOW_FROM, PEOPLE_ROW_HEIGHT, formatCount,
} from "./components/calls/people-panel.tsx";
export type { PeopleMode } from "./components/calls/people-panel.tsx";
// Spotlight for everyone (the context's `spotlight`, up to four, the room's) and Pin for Me (this page's own), which the
// spotlight comes before.
export {
    PinsContext, usePins, mainKeys, spotlitKeys, useSpotlightActs, SpotlightLabel, PinForMe, SPOTLIGHT_MOST, spotlightFull,
} from "./components/calls/spotlight.tsx";
export type { Pins } from "./components/calls/spotlight.tsx";
// The layout of a group video call's tiles, Auto, Speaker or Tiled, with people hidden on this page, kept by the
// browser, people without video shown while they speak, a stage left empty saying so, and the pages of a block of tiles
// wider than the call.
export {
    LayoutChoiceContext, LayoutChoices, useLayoutChoice, layoutChoice, keepLayoutChoice, visibleTiles, useVoiced,
    emptyStage, StageNote, layoutMainKeys, usePinOffered, useSpeakerFocus, HiddenSound, PageArrows, LAYOUT_KEY, SPEAKER_HOLD_MS, hasPicture,
} from "./components/calls/layout-choice.tsx";
export type { LayoutChoice, LayoutMode, EmptyStage } from "./components/calls/layout-choice.tsx";
// The call's recording (the context's `recording`): Start Recording in Host Controls, its confirm, the REC pill beside
// the connection status, and the notice or the question to everyone else.
export {
    RecordingDialog, RecordingLayerContext, RecordingLayerView, RecordingNotice, RecordingPill, recordingOn, startNote, useRecordingLayer,
    CallDialog,
} from "./components/calls/recording.tsx";
// Remove and Ban from Calls' length, where the call screen asks for it (the context's `banning`, an app's call).
export { BanDialog } from "./components/calls/ban-dialog.tsx";
export type { RecordingLayer } from "./components/calls/recording.tsx";
export type { CallRecording, RecordingSummary } from "./components/calls/context.ts";
// The camera and the microphone spinning from a press until the call has them (the context's cameraTurningOn and
// microphoneTurningOn), as the call screen hands its presses on.
export { useTurningOn } from "./components/calls/turning-on.ts";
// What someone in the call sees as it is recorded, for an admin choosing how people are told.
export { RecordingTellPreview } from "./components/calls/recording-preview.tsx";
export type { RecordingTellPreviewProps } from "./components/calls/recording-preview.tsx";
// How big the call is drawn: in its place, filling the window, or the whole screen, and the dock's controls for it.
export {
    CallViewContext, fullScreenItems, useCallExpanded, useWindowedPage, useLiftedCall, liftCall, dropCall,
} from "./components/calls/call-view.tsx";
// The device settings over the call, from the dock or the prompt of a join (the context's `devicesOnJoin`): the
// camera's preview and the microphone's test, each on its own and only for the user, whether everyone sees and hears
// them, the device in use of each and the list of the others, and the speaker's test sound. How to allow a device the
// browser does not give the site yet, and whether it blocks one, which marks the dock's Configure.
export { default as DevicePanel, JoinPrompt, useJoinPrompt, useMicLevel, useDevicesBlocked, JOIN_PROMPT_MS, EffectsSlowNotice,
    NoiseAutoNotice, NOISE_AUTO_NOTICE_MS, useConfigureCall, ConfigureBadge } from "./components/calls/device-panel.tsx";
// "You are muted" while the user talks with the microphone off (the context's `mutedHint`), and how loud a microphone
// is, which it and the device panel read.
export { default as MutedHint, MutedSpeech, MutedHintScope, MutedHintContext, useMutedHint } from "./components/calls/muted-hint.tsx";
export type { MutedHintState } from "./components/calls/muted-hint.tsx";
// The person's own upload jammed (the context's `uploadJammed`): the warning mark of a screen with no connection badge,
// the call between two's. The group screens' badge carries it itself (ConnectionStatus's `jammed`).
export { default as UploadJamChip } from "./components/calls/upload-jam.tsx";
export { readLevel } from "./inc/calls/mic-level.ts";
// The call effects (the context's `effects`): a blurred or replaced background and the noise removed, chosen in the
// device settings and kept by the browser, run by engines of their own that load from the host's folders
// (UiHost.effectsUrl, and UiHost.noiseUrl for AI Noise Removal's own pack) only once one is on. applyEffect and
// useTrackEffects put them on the room client's tracks, which take a processor, TrackEffect on a browser's own track.
// warmEffects makes the camera's ready on a computer before one is chosen (the device settings do it as they open),
// and useEffectsWarmth says where that stands. cameraEffectsUnavailable says where the background can't run on this
// device (the settings then offer nothing to choose), and useEffectsSlowTimes how often it has slowed the device in
// this page (EffectsSlowNotice, over the dock, once a call). blurredByDevice says whether a camera's device blurs it
// itself (Portrait, where the browser tells: Safari), which Blur then leaves to it, and useCameraBlurredByDevice whether
// a camera the effects follow says so. noiseAutoHere says whether the app's default (UiHost.noiseDefault) turns AI Noise
// Removal on here for someone who never chose, which NoiseAutoNotice then says over the dock, once a call, and
// ConfigureBadge marks on the dock's Device Settings while it runs (useConfigureCall).
export {
    noiseAutoHere, NOISE_AUTO_TIP_KEY,
    EFFECTS_KEY, effectsChoice, chooseEffects, useEffectsChoice, useEffectState, effectState, effectOffered,
    cameraEffectsSupported, noiseRemovalSupported, loadEffects, loadNoiseEngine, applyEffect, useTrackEffects, TrackEffect, chosenEffect,
    useEffectTrack, cameraLook, builtInBackgrounds, siteBackgrounds, effectsTunable, TUNE_KEYS, warmEffects, useEffectsWarmth, WARM_KEY,
    cameraEffectsUnavailable, useCameraEffectsUnavailable, useEffectsSlowTimes, EFFECTS_SLOW_EVENT,
    blurredByDevice, cameraBlurredByDevice, useCameraBlurredByDevice, deviceBlurReported, deviceBlurHere, DEVICE_BLUR_TIP_KEY,
} from "./inc/calls/effects.ts";
// People's own pictures for the background, where the app lets them (UiHost.ownBackgrounds): read, scaled and kept by
// the browser alone, never sent anywhere.
export {
    ownBackgrounds, ownBackgroundsAllowed, ownBackgroundsLast, addOwnBackground, removeOwnBackground, useOwnBackgrounds,
    OWN_LIMIT, OWN_WIDTH, OWN_HEIGHT, OWN_ACCEPT, OWN_MAX_BYTES,
} from "./inc/calls/own-backgrounds.ts";
// The size a call opens the camera at (UiHost.cameraSize), which the SDK's calls and the device settings' preview ask.
export { CAMERA_CAPTURE, cameraConstraints } from "./inc/calls/camera-size.ts";
export type { CameraCapture } from "./inc/calls/camera-size.ts";
// The last seconds a microphone's test heard, played back on the chosen speaker (the device settings' Play Back): with
// AI Noise Removal on, without it and then with it.
export { useTestRecording } from "./inc/calls/test-recording.ts";
export type { PlaybackPart } from "./inc/calls/test-recording.ts";
export type { CameraEffect, EffectsChoice, EffectState, EffectKind, EffectsWarmth, ProcessorTrack } from "./inc/calls/effects.ts";
// A moderator's toasts for a raised hand and who joined, and, on this device, the sound of a raised hand and whether
// joins are told at all.
export {
    default as HostToasts, useHostToasts, handSoundOn, keepHandSound, HAND_SOUND_KEY, joinAlertsOn, keepJoinAlerts,
    JOIN_ALERTS_KEY,
} from "./components/calls/host-toasts.tsx";
export type { HostToast, HostToastPerson } from "./components/calls/host-toasts.tsx";
// A moderator's ask that someone turn on their camera or microphone (the context's `turnOnAsks`): the person's menu,
// the ask over that person's dock with help where the browser blocks the device, and the moderator's toast of the answer.
export {
    default as TurnOnAskPrompt, useTurnOnAskActs, turnOnAnswerText, whyNotOn, unblockSteps, stuckBy, stuckTitle, stuckSteps, ASKED_MS,
} from "./components/calls/ask-prompt.tsx";
export type { Stuck } from "./components/calls/ask-prompt.tsx";
export type { TurnOnAsk, TurnOnAsks, TurnOnAnswer, TurnOnAnswerKind } from "./components/calls/context.ts";
// The call's keyboard shortcuts (CallScreen's `shortcuts`): Alt (Option) and a letter press the dock's controls, held
// Space talks while muted, each named in its control's tooltip or at the end of its menu row, one call screen listening
// at a time, never while the user types. A control outside the dock's items gives its own key (useKeyAction).
export { CallKeysContext, useCallKeys, useDockKeys, useKeyAction, useKeyHint, listenIn } from "./components/calls/call-keys.tsx";
export type { CallKeysValue, DockAction, DockActions } from "./components/calls/call-keys.tsx";
export {
    SHORTCUTS, SHORTCUT_LETTERS, shortcutOf, shortcutOfClass, letterOf, readKeyboardLayout, isSpace, isMac,
    keyName, ariaKeys, typingIn, talkKeyAt, onControl,
} from "./inc/calls/keys.ts";
export type { CallShortcut, KeyLike } from "./inc/calls/keys.ts";
// A group call in a window over the others (a video call's, the browser's own of a canvas at the shape of what it
// shows; an audio call's, Document Picture-in-Picture): whom it shows, and the canvas.
export { useGroupPip } from "./components/calls/group-pip.tsx";
export type { PipControl } from "./components/calls/group-pip.tsx";
export { pipFocus } from "./inc/calls/pip-focus.ts";
export type { PipFocus } from "./inc/calls/pip-focus.ts";
export { PipCanvas, pipCanvasSize, PIP_CAMERA, PIP_SCREEN, PIP_FACE_RATIO } from "./inc/calls/pip-canvas.ts";
export type { PipScene } from "./inc/calls/pip-canvas.ts";
// A span that works as a button from the keyboard too.
export { default as pressable } from "./components/calls/pressable.ts";
// A control that waits on the server: its spinner, a second click turned away.
export { default as usePendingActions } from "./inc/calls/pending.ts";
export type { RunPending } from "./inc/calls/pending.ts";

// The devices a call can use, kept up to date for every screen. Only here: the registry asks the browser for its
// permissions and devices the moment it loads, which a page without a call should never do.
export {
    screenShareSupport, pictureInPictureSupport, mediaAccess, mediaUpdatedSubject, cameras, microphones, speakers,
    useCameras, useMicrophones, useSpeakers, useConfigAvailable, mediaPreauthorized, updateMediaPermissions, deviceUsable,
    useDeviceUsable, deviceAccess, useDeviceAccess,
} from "./inc/calls/permissions.ts";
export type { DeviceAccess } from "./inc/calls/permissions.ts";
