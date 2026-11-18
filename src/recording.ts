// The recording player, its own entry so a page showing a recording loads no call screen: the player with its
// transcript (React), the transcript's model, the source choice, the control row's plan and the sound, and the
// player's own glyphs. The call screens' Record row and REC mark are the call screens' own (calls.ts).
export { RecordingPlayer, BESIDE as RECORDING_TRANSCRIPT_BESIDE, type RecordingPlayerProps } from "./components/recording/player.tsx";
export { FOLD_ORDER, ROW, planRow, rowNeed, timeWidth, volumeSettable, savedVolume, saveVolume, speakerGlyph, type Folding, type RowNeeds, type RowPlan, type TimeShown } from "./components/recording/controls.ts";
export { Transcript, type TranscriptProps } from "./components/recording/transcript.tsx";
export { Glyph as RecordingGlyph, type GlyphName as RecordingGlyphName } from "./components/recording/glyph.tsx";
export { transcriptLines, lineAt, matches, highlight, clock, asText, speakerHue, initials } from "./components/recording/transcript-data.ts";
export { attach, loadHls, mp4For, sizes, soundOnly, type Quality, type SourceMode } from "./components/recording/sources.ts";
export { addRecordingLanguages, RECORDING_DOMAIN } from "./inc/recording-languages.ts";
export type { RecordingData, TranscriptData, TranscriptLine } from "./components/recording/types.ts";
