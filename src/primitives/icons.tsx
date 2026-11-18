import type { ReactElement } from "react";
import ChatIcon, { iconPathD as chatPathD, isRegistryIcon as inChat, registerIcons, ResolvedIcon as ChatResolvedIcon, type IconName, type IconProps, type ResolvedIconProps } from "./icon.tsx";
import { CALL_ICONS } from "./icons/calls.ts";
import { MESSENGER_ICONS } from "./icons/messenger.ts";

export type { IconName, IconProps, IconSource, ResolvedIconProps } from "./icon.tsx";

// The package's Icon, with every glyph of the registry: the chat's, the call screens' and Better Messages' own screens'
// (primitives/icons/). The call screens draw through it, and so does every app that imports Icon, ResolvedIcon,
// isRegistryIcon or iconPathD from @wordplus/realtime-ui, Better Messages among them, so each keeps every icon. The
// chat's parts draw through primitives/icon.tsx and carry the chat's glyphs alone (K6 of the slimming of 2026-10-31).
//
// Functions of this module's own, each the registry's as it is, not a pass-through of icon.tsx's: a bundler that may
// skip a module of re-exports keeps this one wherever one of them is used, and so registers the sets below first.
registerIcons( CALL_ICONS, MESSENGER_ICONS );

export default function Icon( props: IconProps ): ReactElement | null {
    return ChatIcon( props );
}

export function iconPathD( name: IconName ): string {
    return chatPathD( name );
}

export function isRegistryIcon( icon: unknown ): icon is IconName | "gif" {
    return inChat( icon );
}

export function ResolvedIcon( props: ResolvedIconProps ): ReactElement | null {
    return ChatResolvedIcon( props );
}
