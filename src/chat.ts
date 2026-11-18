// @wordplus/realtime-ui/chat: the chat's parts alone, for an app that draws its own chat with them and keeps its own
// engine (Live Support's visitor panel and inbox, as Better Messages draws its messenger with the same parts): the
// message list's parts, the composer's row, reactions, presence, who is online, the files and their viewer, and what
// they stand on. No call screen, no language table, no call icon: a bundler that cannot drop what an entry it imports
// does not use (the panel's, on Preact) takes the chat alone from here (K7 of the slimming of 2026-10-31). Its parts
// are the root entry's, the same functions, so a page that takes both meets one host and one set of pieces.

// What the screens ask of the app they are in.
export { configureUi, host, setUiUsers, uiUser } from "./host.ts";
export type { UiHost, UiUser, UiConfirm, UserAvatarProps, UserNameProps, SharedPart } from "./host.ts";
export { __, _x, _n, _nx, sprintf, applyFilters } from "./inc/globals.ts";
export { plainName, plainLabel, escapeHtml, decodeEntities } from "./inc/names.ts";
export { markup } from "./inc/markup.tsx";
export { Piece, PiecesProvider, usePieces } from "./pieces.tsx";
export type { Pieces, Drawn, OnlineRowProps, MessageProps, ComposerProps, ChatMessageView, ChatHeaderProps } from "./pieces.tsx";

// Presence and who is online.
export {
    PresenceDot, Avatar, AvatarFace, GroupAvatar, AvatarStack, TypingDots, ActivityIndicator, PresenceLabel, ReadBy,
    SHAPE_RADIUS, avatarSrc, avatarKey, defaultAvatarSrc,
} from "./components/presence/presence.tsx";
export type {
    Presence, PresenceUser, PresenceDotProps, AvatarShape, AvatarProps, AvatarFaceProps, AvatarLetters, GroupAvatarProps, AvatarStackProps, TypingDotsProps,
    Activity, ActivityEntry, ActivityIndicatorProps, PresenceLabelProps, ReadByProps,
} from "./components/presence/presence.tsx";
export { OnlineList, PersonRow, OnlineCount, RowAction } from "./components/presence/online-list.tsx";
export type { OnlineListProps, PersonRowProps, RowActionProps } from "./components/presence/online-list.tsx";

// The message list's parts, the composer's row, and reactions.
export {
    DaySeparator, UnreadDivider, SystemRow, DeletedBubble, MessageStack, MessageBody, MessageText, AiWaiting, StatusTick,
    MetaPieces, MessageMeta, HoverActions, HoverButton, TypingPinned, EmptyThread, ActionCard,
} from "./components/chat/message-parts.tsx";
export type {
    DaySeparatorProps, SystemRowProps, SystemTone, ActionCardProps, ActionCardTone, DeletedBubbleProps, MessageSide, BubbleFill, MessageStackProps,
    MessageBodyProps, MessageTextProps, DeliveryState, StatusTickProps, MetaPiecesProps, MetaVariant, MessageMetaProps,
    HoverButtonProps, EmptyThreadProps,
} from "./components/chat/message-parts.tsx";
export { ComposerRow } from "./components/chat/composer-row.tsx";
export type { ComposerRowProps } from "./components/chat/composer-row.tsx";
export { ReactionPills, ReactionPill, ReactionPicker, decodeReaction, encodeReaction } from "./components/chat/reactions.tsx";
export type { ReactionEntry, ReactionPillProps, ReactionPickerProps } from "./components/chat/reactions.tsx";

// The files: a message's, the ones picked above the composer, the strip a drop shows, and the pictures' viewer.
// An app that draws its own composer keeps its files as the kit's Chat keeps its own: picked, pasted or dropped, each
// goes up at once (useStagedFiles), and the strip shows while files are dragged over the chat (useFileDrop).
export { MessageFiles, StagedFiles, ImageViewer, DropStrip, routeUploader, shownUrl, kindOf as fileKindOf, badgeOf as fileBadgeOf, bytesLabel, UploadError, useStagedFiles, useFileDrop } from "./sdk/chat-files.tsx";
export type { FileKind, StagedFile, ViewedImage, MessageFilesProps, StagedFilesProps, ImageViewerProps, ChatUploader, StagedFilesOptions, StagedFilesState, FileDrop } from "./sdk/chat-files.tsx";
export type { ChatFile } from "./sdk/use-chat.ts";

// What they stand on. Icon here draws the chat's glyphs (CHAT_ICONS), and those an app adds with registerIcons(): the
// root entry's Icon draws every glyph of the registry.
export { default as Icon, iconPathD, isRegistryIcon, ResolvedIcon, registerIcons } from "./primitives/icon.tsx";
export type { IconName, IconProps, IconSource, ResolvedIconProps } from "./primitives/icon.tsx";
export { CHAT_ICONS } from "./primitives/icons/chat.ts";
export { default as IconButton } from "./primitives/icon-button.tsx";
export type { IconButtonEmphasis, IconButtonProps } from "./primitives/icon-button.tsx";
export { default as BaseTooltip, tooltipContent } from "./primitives/tooltip.tsx";
export type { TooltipSide, TooltipProps } from "./primitives/tooltip.tsx";
export { default as Tooltip } from "./components/helpers/tooltip.tsx";
export { default as Btn, keepPointerFocus } from "./inc/helpers/btn.tsx";
export type { BtnProps } from "./inc/helpers/btn.tsx";
export { default as UserAvatar, FallbackAvatar } from "./components/users/user-avatar.tsx";
export { default as UserName, FallbackName } from "./components/users/user-name.tsx";
export {
    VIEWPORT_EDGE, viewportSize, clampToViewport, createFixedProbe, fixedOrigin, liveAnchorRect, availableWidth,
} from "./primitives/viewport.ts";
export type { ViewportSize, ClampedPosition } from "./primitives/viewport.ts";
export { default as useStateRef } from "./inc/hooks/state-ref.ts";
export { isMobile, isFirefox, isSafari, isIOS, isAndroid } from "./inc/functions/browser-info.ts";
export { formatSize } from "./inc/functions.ts";
// The tooltips: the WordPlus SDK's floater where the page has one, else the package's own once an app sets it, which
// draws into its anchor's own root, a shadow root's too (setOwnTooltips( ownTooltips() ), and the part chat/tooltip
// of the stylesheet): a visitor's page has no SDK, and a panel in a shadow root keeps its look inside.
export { sharedTooltips, setOwnTooltips } from "./inc/shared-parts.ts";
export { ownTooltips } from "./inc/floater.ts";
export type { Tooltips, TooltipContent, TooltipOptions } from "./inc/shared-parts.ts";
