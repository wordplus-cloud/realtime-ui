import React, { useContext } from "react";
import Icon from "../../primitives/icons.tsx";
import { useJamTip } from "../parts/jam-tip.tsx";
import { CallContext } from "./context.ts";

/**
 * The person's own upload jammed, on a screen with no connection badge to carry the mark (connection-status.tsx): the
 * call between two. The mark stands alone in the top end corner of its stage, there only while the upload is jammed,
 * with the same tip (jam-tip.tsx).
 */
export default function UploadJamChip() {
    const { uploadJammed } = useContext( CallContext );
    const jam = useJamTip( !! uploadJammed );

    return <span ref={ jam.wrapRef as React.RefObject<HTMLSpanElement> } className="wplus-call-jam-chip">
        { !! uploadJammed &&
            <span { ...jam.trigger } className="wplus-call-jam-mark" part="call-jam">
                <Icon name="warning" size={ 15 } />
            </span>
        }
        { jam.parts }
    </span>;
}
