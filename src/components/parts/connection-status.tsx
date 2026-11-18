import React, { useState, useRef, useEffect } from "react";
import {_x} from "../../inc/globals.ts";
import Tooltip from "../helpers/tooltip.tsx";
import Icon from "../../primitives/icons.tsx";
import { useJamTip } from "./jam-tip.tsx";

interface GroupVideoGridItemInterface{
    state : string,
    quality: string,
    /** The person's own upload is jammed: the badge carries a warning mark, and the jam's words in a tip (jam-tip.tsx). */
    jammed?: boolean
}

/**
 * The call's connection: its state and quality as an icon with words for screen readers, bright for a moment after it
 * changes and faded again once it holds. While the person's upload is jammed it stays bright, with a warning mark in
 * the dot's place and the jam's words in place of its own tooltip, and its quality reads poor whatever the node says.
 */
const ConnectionStatus: React.FC<GroupVideoGridItemInterface> = ({ state, quality, jammed = false }) => {
    const jam = useJamTip( jammed );
    const [lastState, setLastState] = useState<string>('');
    const [stateJustChanged, setStateJustChanged] = useState<boolean>(false);
    const removeOpacityTimeout = useRef<number | null>(null);
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (state !== lastState) {
            setStateJustChanged( true )
            ref.current?.classList.add('wplus-opacity');

            removeOpacityTimeout.current = window.setTimeout(() => {
                setStateJustChanged( false );
            }, 3000);

            setLastState(state);
        }

        return () => {
            if ( removeOpacityTimeout.current) {
                window.clearTimeout(removeOpacityTimeout.current);
            }
        };
    }, [state]);

    let loadingIcon =  <Icon name="wifi" size={ 13 } />
    if( state === 'reconnecting' || state === 'connecting' || state === 'signalReconnecting' ){
        loadingIcon = <Icon name="spinner" size={ 13 } className="wplus-svg-animate" />
    } else if ( state === 'disconnected' ){
        loadingIcon = <Icon name="x" size={ 13 } />
    }

    if( state === 'signalReconnecting' ) state = 'reconnecting';

    // The quality is the node's word for the whole connection, which can still read good while what the person sends
    // is stuck on their own line: a badge that warns doesn't say good beside it.
    if( jammed && quality !== 'lost' ) quality = 'poor';

    if( state === 'connected' && quality !== 'unknown' ){
        state = state + ' (' + quality + ')';
    }

    let spanClass = "wplus-connection-quality wplus-state-" + state + " wplus-quality-" + quality;

    if( stateJustChanged ) {
        spanClass += ' wplus-opacity';
    }

    if( jammed ) {
        spanClass += ' wplus-upload-jammed';
    }

    const badge = (
        <span ref={ref} className={spanClass} { ...jam.trigger }>
            { jammed && <Icon name="warning" size={ 13 } className="wplus-jam-icon" /> }
            {loadingIcon}
            <span>{state}</span>
        </span>
    );

    return (
        <div ref={ jam.wrapRef as React.RefObject<HTMLDivElement> } className="wplus-connection-control">
            { jammed
                ? badge
                : <Tooltip content={ _x('Connection Status (Quality)', 'Group Call Screen', 'bp-better-messages') }>{ badge }</Tooltip> }
            { jam.parts }
        </div>
    );
}

export default ConnectionStatus;
