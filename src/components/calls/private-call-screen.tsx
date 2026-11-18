import React, { useState } from "react";
import { CallViewContext, useLiftedCall, useWindowedPage } from "./call-view.tsx";
import { CallContext, type CallContextInterface } from "./context.ts";
import PrivateCallLayout from "./private-call.tsx";
import { MutedHintScope } from "./muted-hint.tsx";
import { PiecesProvider, type Pieces } from "../../pieces.tsx";
import { CallKeysContext, useCallKeys } from "./call-keys.tsx";
import { useTurningOn } from "./turning-on.ts";

/**
 * A call between two on the screen, as CallScreen draws one (`layout` 'private'): the camera and the microphone spinning
 * from a press until they are on, the call filling the browser window from the dock's Expand, the dock's keys and "You
 * are muted". Without the group calls, their grid, roster, moderation, recording and picture-in-picture window, which a
 * call between two never draws: an app whose calls are between two alone (Live Support's calls with visitors, on its
 * own engine and usePrivateCall) loads about 36 KB less of it, gzipped. `call` is the call as usePrivateCall runs it;
 * `components` the host's own pieces (pieces.tsx); `shortcuts`, on unless false, as CallScreen's.
 *
 * It brings its stage's colours with it (.wplus-call-surface, which Better Messages puts on the container it draws
 * CallScreen in): in its place, and in the window it fills, which leaves that container.
 */
export default function PrivateCallScreen( { call: given, components, shortcuts = true }: {
    call: CallContextInterface,
    components?: Pieces,
    shortcuts?: boolean,
} ) {
    const call = useTurningOn( given );
    // The call filling the browser window (call-view.tsx): from Expand until Collapse, Escape or the call's end.
    const [ windowed, setWindowed ] = useState( false );
    useWindowedPage( windowed, () => setWindowed( false ) );
    useLiftedCall( call.wrapper, windowed && ! call.fullScreenEnabled );
    const keys = useCallKeys( call, shortcuts );
    return <PiecesProvider pieces={ components }>
        <CallContext.Provider value={ call }><CallKeysContext.Provider value={ keys.value }><CallViewContext.Provider value={ { windowed, setWindowed, pip: null } }>
            <div className={ 'wplus-call-wrap wplus-call-surface' + ( windowed ? ' wplus-call-wrap--window' : '' ) } ref={ call.wrapper }>
                <MutedHintScope layout="private"><PrivateCallLayout /></MutedHintScope>
            </div>
        </CallViewContext.Provider></CallKeysContext.Provider></CallContext.Provider>
    </PiecesProvider>;
}
