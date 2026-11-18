import React, { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { CallViewContext, useLiftedCall, useWindowedPage } from "./call-view.tsx";
import { CallContext, type CallContextInterface } from "./context.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icons.tsx";
import { _x } from "../../inc/globals.ts";
import PrivateCallLayout from "./private-call.tsx";
import GroupVideoCallLayout from "./group-video-call.tsx";
import GroupAudioCallLayout from "./group-audio-call.tsx";
import { MutedHintScope } from "./muted-hint.tsx";
import { PiecesProvider, type Pieces } from "../../pieces.tsx";
import { CallKeysContext, useCallKeys } from "./call-keys.tsx";
import { useGroupPip } from "./group-pip.tsx";
import { PinsContext, usePins } from "./spotlight.tsx";
import { RecordingLayerContext, useRecordingLayer } from "./recording.tsx";
import { useTurningOn } from "./turning-on.ts";

export type CallLayout = 'private' | 'group-video' | 'group-audio';

/**
 * A call on the screen: its layout (a call between two, a group video call, a group audio call) drawn from `call`,
 * which whoever runs the call provides, and null once there is no call: what the screen held for a call (filling the
 * window, the keys, the picture-in-picture window) goes with it. `chatToggle` (the prop, or the context's), where the
 * call sits beside a chat, draws the chevron that hides and shows it. `components`, the host's own pieces in place of
 * ours (pieces.tsx). `shortcuts`, on unless false: Alt (Option) and a letter press the dock's controls, held Space
 * talks while muted, and ? lists them (call-keys.tsx). Better Messages' call container renders this.
 */
export default function CallScreen( { call, layout, chatToggle, components, shortcuts = true }: {
    call: CallContextInterface,
    layout: CallLayout | null,
    chatToggle?: Dispatch<SetStateAction<boolean>> | null,
    components?: Pieces,
    shortcuts?: boolean,
} ) {
    return <PiecesProvider pieces={ components }><CallLayoutOf call={ call } layout={ layout } chatToggle={ chatToggle } shortcuts={ shortcuts } /></PiecesProvider>;
}

function CallLayoutOf( { call: given, layout, chatToggle: toggleProp, shortcuts }: {
    call: CallContextInterface,
    layout: CallLayout | null,
    chatToggle?: Dispatch<SetStateAction<boolean>> | null,
    shortcuts: boolean,
} ) {
    // The recording's notice, question and confirms (recording.tsx), and the call with the microphone, camera and
    // screen kept off until the user agrees to be recorded, where the admin asks for that: for everything below.
    const { call: held, layer: recordingLayer } = useRecordingLayer( given );
    // The camera and the microphone spinning from a press until they are on (turning-on.ts).
    const call = useTurningOn( held );
    const chatToggle = toggleProp ?? call.chatToggle ?? null;
    // The call filling the browser window (call-view.tsx): from Expand until Collapse, Escape or the call's end. A screen
    // kept for the next call (Better Messages') starts that one in its place.
    const [ windowed, setWindowed ] = useState( false );
    const shown = windowed && !! layout;
    useEffect( () => {
        if ( ! layout ) setWindowed( false );
    }, [ layout ] );
    useWindowedPage( shown, () => setWindowed( false ) );
    useLiftedCall( call.wrapper, shown && ! call.fullScreenEnabled );
    const keys = useCallKeys( call, shortcuts && !! layout );
    // The user's own pins (Pin for Me, spotlight.tsx), here so the grid and the picture-in-picture window share them.
    const pins = usePins( call.participants );
    // A group call in a window over the others (group-pip.tsx): the dock's Picture in Picture, and the window.
    const pip = useGroupPip( call, layout, keys.value, pins.pinned );
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

    return <CallContext.Provider value={ call }><RecordingLayerContext.Provider value={ recordingLayer }><CallKeysContext.Provider value={ keys.value }><CallViewContext.Provider value={ { windowed: shown, setWindowed, pip: pip.control } }>
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
            <MutedHintScope layout={ layout }><PinsContext.Provider value={ pins }>
                { layout === 'private' && <PrivateCallLayout /> }
                { layout === 'group-video' && <GroupVideoCallLayout /> }
                { layout === 'group-audio' && <GroupAudioCallLayout /> }
            </PinsContext.Provider></MutedHintScope>

            { pip.view }
        </div>
    </CallViewContext.Provider></CallKeysContext.Provider></RecordingLayerContext.Provider></CallContext.Provider>;
}
