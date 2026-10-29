import React, { useState, type Dispatch, type SetStateAction } from "react";
import { CallViewContext, useLiftedCall, useWindowedPage } from "./call-view.tsx";
import { CallContext, type CallContextInterface } from "./context.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icon.tsx";
import { _x } from "../../inc/globals.ts";
import PrivateCallLayout from "./private-call.tsx";
import GroupVideoCallLayout from "./group-video-call.tsx";
import GroupAudioCallLayout from "./group-audio-call.tsx";
import { MutedHintScope } from "./muted-hint.tsx";
import { PiecesProvider, type Pieces } from "../../pieces.tsx";

export type CallLayout = 'private' | 'group-video' | 'group-audio';

/**
 * A call on the screen: its layout (a call between two, a group video call, a group audio call) drawn from `call`,
 * which whoever runs the call provides. `chatToggle` (the prop, or the context's), where the call sits beside a chat,
 * draws the chevron that hides and shows it. `components`, the host's own pieces in place of ours (pieces.tsx). Better
 * Messages' call container renders this.
 */
export default function CallScreen( { call, layout, chatToggle, components }: {
    call: CallContextInterface,
    layout: CallLayout | null,
    chatToggle?: Dispatch<SetStateAction<boolean>> | null,
    components?: Pieces,
} ) {
    return <PiecesProvider pieces={ components }><CallLayoutOf call={ call } layout={ layout } chatToggle={ chatToggle } /></PiecesProvider>;
}

function CallLayoutOf( { call, layout, chatToggle: toggleProp }: {
    call: CallContextInterface,
    layout: CallLayout | null,
    chatToggle?: Dispatch<SetStateAction<boolean>> | null,
} ) {
    const chatToggle = toggleProp ?? call.chatToggle ?? null;
    // The call filling the browser window (call-view.tsx): from Expand until Collapse, Escape or the call's end.
    const [ windowed, setWindowed ] = useState( false );
    const shown = windowed && !! layout;
    useWindowedPage( shown, () => setWindowed( false ) );
    useLiftedCall( call.wrapper, shown && ! call.fullScreenEnabled );
    let containerClass = 'wplus-call-wrap';

    if( layout === 'group-video' ){
        containerClass += ' wplus-call-wrap-group';
    }

    if( layout === 'group-audio' ){
        containerClass += ' wplus-group-audio-call-container';
    }

    if( shown ){
        containerClass += ' wplus-call-wrap--window';
    }

    return <CallContext.Provider value={ call }><CallViewContext.Provider value={ { windowed: shown, setWindowed } }>
        <div className={containerClass} ref={ call.wrapper }>
            {/* A chevron on the call's edge that hides and shows the chat, for
                a page whose stylesheet draws it. Better Messages' does not
                (_call-surface.scss): there the dock's Show Chat / Hide Chat is
                the toggle beside the chat and under it on a phone alike, as the
                chevron lay over whatever reached the edge, a tile's moderator
                row, a roster avatar, the own picture, and sat under the dock on
                a phone. Not while the call fills the window or the screen: the
                chat it would open is outside it. */}
            { ( chatToggle && ! call.fullScreenEnabled && ! shown ) &&
                <Tooltip content={_x('Toggle Chat Screen', 'Calling Features - Toggle Chat Screen', 'bp-better-messages')}>
                <span onClick={() => {
                    chatToggle((prev: boolean) => !prev);
                }} className={"wplus-switch-chat"}>
                    <Icon name="chevronL" size={ 14 } />
                </span>
            </Tooltip> }

            {/* "You are muted" over the dock, and in the devices while they lie over it, where the context asks for it
                (muted-hint.tsx). */}
            <MutedHintScope layout={ layout }>
                { layout === 'private' && <PrivateCallLayout /> }
                { layout === 'group-video' && <GroupVideoCallLayout /> }
                { layout === 'group-audio' && <GroupAudioCallLayout /> }
            </MutedHintScope>
        </div>
    </CallViewContext.Provider></CallContext.Provider>;
}
