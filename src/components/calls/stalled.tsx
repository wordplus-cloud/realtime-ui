import React, { type ReactNode } from "react";
import { _x } from "../../inc/globals.ts";
import Icon from "../../primitives/icon.tsx";
import Tooltip from "../helpers/tooltip.tsx";
import type { CallParticipant } from "./context.ts";

/**
 * Someone whose media stopped arriving while they are still in the call (CallParticipant.stalled, which whoever runs
 * the call reads off what it receives). Their tile used to show their last frame as if it were live until the room
 * said they went, 15 s and more; now that frame is blurred and dimmed (the wplus-call-video-stalled class), and the tile
 * says what is going on: "Video interrupted" while only their camera stopped, "Reconnecting..." when their sound
 * stopped too, as it says for a tile away for a moment. A call between two says "The other side lost connection"
 * for the second. A camera whose picture never came here (nothing arrived since its <video> was drawn) has no last
 * frame to blur, and showed an empty box: their face is shown instead, as for a camera turned off.
 */

/** What of participant's stopped arriving, as their tile says it: never for the user's own, nor for a tile already away. */
export function stalledShown( participant: CallParticipant | null | undefined, own: boolean ): 'video' | 'all' | null {
    if( own || ! participant || participant.reconnecting ) return null;
    return participant.stalled ?? null;
}

/** The class a stalled picture's <video> takes. */
export const STALLED_VIDEO_CLASS = 'wplus-call-video-stalled';

/** Whether a stalled picture's <video> has nothing to show: no frame of what it plays was ever drawn in it. */
export function pictureless( element: HTMLVideoElement | null | undefined ): boolean {
    return !! element && ! element.videoWidth;
}

const explanation = () => _x( 'Their video stopped arriving. It comes back by itself.', 'Call Screen', 'bp-better-messages' );

/**
 * "Video interrupted" over a camera's blurred last frame; main: the stage of a call between two, which says why too.
 * face: their face above it, where the camera has no frame to show.
 */
export function VideoInterruptedNotice( { main, face }: { main?: boolean, face?: ReactNode } ) {
    const title = _x( 'Video interrupted', 'Call Screen', 'bp-better-messages' );
    const faced = face ? ' wplus-call-stalled-faced' : '';

    if( main ){
        return <div className={ 'wplus-call-paused wplus-call-paused-main wplus-call-stalled' + faced } part="video-stalled" role="status">
            { face }
            <div className="wplus-call-paused-notice">
                <Icon name="videoOff" size={ 22 } />
                <div>
                    <p>{ title }</p>
                    <p>{ explanation() }</p>
                </div>
            </div>
        </div>;
    }

    return <span className={ 'wplus-call-paused wplus-call-stalled' + faced } part="video-stalled" role="status">
        { face }
        <Tooltip content={ explanation() }>
            <span className="wplus-call-paused-notice">
                <Icon name="videoOff" size={ 16 } />
                <span>{ title }</span>
            </span>
        </Tooltip>
    </span>;
}
