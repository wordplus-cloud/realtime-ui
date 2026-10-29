// @wordplus/realtime-ui/calls: the call screens. A call between two (ringing out and in, connected, its picture
// and its controls), the group video grid and the group audio roster, the call dock, the devices, and what a
// moderator does. Drawn from a CallContext that whoever runs the call provides: Better Messages' call container, or
// an app's calls on @wordplus/realtime.

export { default as CallScreen } from "./components/calls/call-screen.tsx";
export type { CallLayout } from "./components/calls/call-screen.tsx";
export { CallContext, callInfoDefaults } from "./components/calls/context.ts";
export type {
    CallContextInterface, CallParticipant, CallInfo, CallThread, CallTrack, CallPublication, CallAction,
    CallConnectionQuality, CallConnectionState, CallModeration,
} from "./components/calls/context.ts";
export { default as PrivateCallLayout } from "./components/calls/private-call.tsx";
export { default as GroupVideoCallLayout } from "./components/calls/group-video-call.tsx";
export { default as GroupAudioCallLayout } from "./components/calls/group-audio-call.tsx";
export { default as GroupVideoGrid } from "./components/calls/group-video-grid.tsx";
export { default as GroupAudioGrid } from "./components/calls/group-audio-grid.tsx";
export { default as GroupVideoGridItem } from "./components/calls/group-video-grid-item.tsx";
export { default as GroupAudioGridItem } from "./components/calls/group-audio-grid-item.tsx";
export { default as CallDock } from "./components/calls/call-dock.tsx";
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
    roomModerated, tileModerated, personState, heldMute, useModeratorNotice,
} from "./components/calls/moderation-panels.tsx";
export type { ModerationPanel } from "./components/calls/moderation-panels.tsx";
// How big the call is drawn: in its place, filling the window, or the whole screen, and the dock's controls for it.
export {
    CallViewContext, fullScreenItems, useCallExpanded, useWindowedPage, useLiftedCall, liftCall, dropCall,
} from "./components/calls/call-view.tsx";
// The device settings over the call, from the dock or the prompt of a join (the context's `devicesOnJoin`): the
// camera's preview and the microphone's test, each on its own and only for the user, whether everyone sees and hears
// them, the device in use of each and the list of the others, and the speaker's test sound.
export { default as DevicePanel, JoinPrompt, useJoinPrompt, useMicLevel, JOIN_PROMPT_MS } from "./components/calls/device-panel.tsx";
// "You are muted" while the user talks with the microphone off (the context's `mutedHint`), and how loud a microphone
// is, which it and the device panel read.
export { default as MutedHint, MutedSpeech, MutedHintScope, MutedHintContext, useMutedHint } from "./components/calls/muted-hint.tsx";
export type { MutedHintState } from "./components/calls/muted-hint.tsx";
export { readLevel } from "./inc/calls/mic-level.ts";
// A moderator's toasts for a raised hand and who joined, and, on this device, the sound of a raised hand and whether
// joins are told at all.
export {
    default as HostToasts, useHostToasts, handSoundOn, keepHandSound, HAND_SOUND_KEY, joinAlertsOn, keepJoinAlerts,
    JOIN_ALERTS_KEY,
} from "./components/calls/host-toasts.tsx";
export type { HostToast, HostToastPerson } from "./components/calls/host-toasts.tsx";
// A span that works as a button from the keyboard too.
export { default as pressable } from "./components/calls/pressable.ts";
// A control that waits on the server: its spinner, a second click turned away.
export { default as usePendingActions } from "./inc/calls/pending.ts";
export type { RunPending } from "./inc/calls/pending.ts";

// The devices a call can use, kept up to date for every screen. Only here: the registry asks the browser for its
// permissions and devices the moment it loads, which a page without a call should never do.
export {
    screenShareSupport, pictureInPictureSupport, mediaAccess, mediaUpdatedSubject, cameras, microphones, speakers,
    useCameras, useMicrophones, useSpeakers, useConfigAvailable, mediaPreauthorized, updateMediaPermissions,
} from "./inc/calls/permissions.ts";
