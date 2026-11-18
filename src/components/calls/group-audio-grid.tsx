import React, {useContext, useEffect, useLayoutEffect, useRef, useState} from "react";
import {CallContext, CallContextInterface} from "./context.ts";
import useStateRef from "../../inc/hooks/state-ref.ts";
import GroupAudioGridItem from "./group-audio-grid-item.tsx";
import useFlipReorder from "../../utils/use-flip-reorder.ts";
import { HiddenSound } from "./layout-choice.tsx";

/** From how many people the roster draws only the rows in view (an audio call of a thousand). */
export const AUDIO_WINDOW_FROM = 60;
const WINDOW_SPARE = 8;
// The roster's gap between rows and a row's height, as _call-stage.scss holds them: the height is measured once a row
// is drawn.
const ROW_GAP = 8;
const ROW_HEIGHT = 58;

/**
 * A group audio call's roster: a row for each person in the CallContext, the loudest first, fitted to the call's area
 * and sliding into their new places as the order changes. Past AUDIO_WINDOW_FROM people it draws the rows in view and
 * a few either side, the rest of its height held by space above and below, and plays the sound of those out of view
 * on its own.
 */
export default function GroupAudioGrid() {
    const audioGridEl = useRef<HTMLDivElement>(null);
    const restStart = useRef<HTMLDivElement>(null);
    const lastHeight = useRef(0)
    const lastWidth = useRef(0)

    const [itemPositions, setItemPositions] = useStateRef<string[]>([])
    const [ view, setView ] = useState( { top: 0, height: 800 } );
    const [ rowStep, setRowStep ] = useState( ROW_HEIGHT + ROW_GAP );
    // Who has had a row: one drawn again as the roster scrolls to it doesn't play the entrance of someone joining.
    const seen = useRef( new Set<string>() );

    const {
        wrapper,
        participants,
        participantsRef,
        callMode
    } = useContext<CallContextInterface>(CallContext);

    const callModeRef = useRef(callMode);
    useEffect(() => { callModeRef.current = callMode; }, [callMode]);

    const checkSizeChangeInterval = useRef<number | undefined>(undefined);

    useEffect(() => {
        window.addEventListener('resize', updateGrid);
        checkSizeChangeInterval.current = window.setInterval(checkSizeChange, 1000);

        return () => {
            window.removeEventListener('resize', updateGrid);
            window.clearInterval(checkSizeChangeInterval.current);
        }
    }, []);

    const controlsOf = () => audioGridEl.current!.parentElement!.querySelector<HTMLElement>('.wplus-group-call-controls-v2')!;

    const checkSizeChange = () => {
        const containerWidth = wrapper.current!.getBoundingClientRect().width;
        const containerHeight = wrapper.current!.getBoundingClientRect().height;
        const controlsHeight = controlsOf().getBoundingClientRect().height;

        let resultHeight = containerHeight - controlsHeight - 4;

        if (lastHeight.current !== resultHeight || lastWidth.current !== containerWidth) {
            updateGrid();
        }
    }

    const lastList = useRef<string[]>([]);

    const isListener = (key: string) => {
        const p = participantsRef.current.get(key);
        return p && callModeRef.current === 'broadcast' && !p.canPublish && !p.canAdmin;
    };

    const updateGrid = () => {
        const containerWidth = wrapper.current!.getBoundingClientRect().width;
        const containerHeight = wrapper.current!.getBoundingClientRect().height;
        const controls = controlsOf();

        const controlsStyle = window.getComputedStyle(controls);
        const controlsHeight = controls.getBoundingClientRect().height;
        const controlsBottom = parseInt(controlsStyle.getPropertyValue('bottom'));

        let resultHeight = containerHeight - controlsHeight - controlsBottom - 4;
        let resultWidth = containerWidth;

        lastHeight.current = resultHeight;
        lastWidth.current = resultWidth;

        const numSquares = participantsRef.current.size;

        if (numSquares === 0) return;

        const sortedUsers: Array<[string, number]> = [];

        participantsRef.current.forEach((participant, key) => {
            let soundLevel: number = participant.audioLevel;

            if (!participant.audio) {
                soundLevel = 0;
            } else {
                soundLevel = 1;
            }

            if (!!participant.screen) {
                soundLevel = 999;
            }

            sortedUsers.push([key, soundLevel]);
        });

        sortedUsers.sort(function (a, b) {
            return b[1] - a[1];
        });

        const topList : string[] = [];
        const lowList : string[] = [];

        for (const [userId, soundLevel] of sortedUsers) {
            if (soundLevel > 0) {
                topList.push(userId);
            } else {
                lowList.push(userId);
            }
        }

        const currentList = [ ...topList ];
        const low = new Set( lowList );
        const placed = new Set( topList );

        lastList.current.forEach((userId) => {
            if ( ! placed.has(userId) && low.has(userId) ) {
                currentList.push(userId);
                placed.add(userId);
            }
        });

        lowList.forEach((userId) => {
            if ( ! placed.has(userId) ) {
                currentList.push(userId);
                placed.add(userId);
            }
        });

        lastList.current = currentList;

        // In broadcast mode, sort listeners to the bottom
        if( callModeRef.current === 'broadcast' ) {
            const speakers = currentList.filter(key => !isListener(key));
            const listeners = currentList.filter(key => isListener(key));
            setItemPositions([ ...speakers, ...listeners ]);
        } else {
            setItemPositions(currentList);
        }
    }

    useEffect(() => {
        updateGrid();
    }, [participants]);

    const windowed = itemPositions.length >= AUDIO_WINDOW_FROM;

    useEffect(() => {
        const el = audioGridEl.current;
        if ( ! el || ! windowed ) return;
        const read = () => {
            const top = el.scrollTop - ( restStart.current?.offsetTop || 0 );
            const height = el.clientHeight || 800;
            setView( ( was ) => was.top === top && was.height === height ? was : { top, height } );
        };
        read();
        el.addEventListener( 'scroll', read, { passive: true } );
        window.addEventListener( 'resize', read );
        return () => {
            el.removeEventListener( 'scroll', read );
            window.removeEventListener( 'resize', read );
        };
    }, [ windowed ]);

    useLayoutEffect(() => {
        seen.current = new Set( itemPositions );
        if ( ! windowed ) return;
        const row = audioGridEl.current?.querySelector<HTMLElement>( ':scope > .wplus-group-call-input-audio:not(.wplus-group-call-input-audio-screen)' );
        const height = row?.offsetHeight || 0;
        if ( height > 0 && Math.abs( height + ROW_GAP - rowStep ) > 0.5 ) setRowStep( height + ROW_GAP );
    });

    const row = (unique_key: string) => {
        const participant = participants.get(unique_key);
        if (!participant) return null;

        return (<GroupAudioGridItem key={unique_key} unique_key={unique_key} participant={participant} entered={ seen.current.has( unique_key ) }/>)
    };

    let items: React.ReactNode;

    if ( ! windowed ) {
        items = itemPositions.map(row);
    } else {
        // A shared screen takes the stage at the top, whatever the scroll: the rows after it are the windowed ones.
        const lead = itemPositions.filter( ( key ) => !! participants.get( key )?.screen );
        const rest = lead.length > 0 ? itemPositions.filter( ( key ) => ! participants.get( key )?.screen ) : itemPositions;
        const from = Math.min( rest.length, Math.max( 0, Math.floor( view.top / rowStep ) - WINDOW_SPARE ) );
        const to = Math.max( from, Math.min( rest.length, Math.ceil( ( view.top + view.height ) / rowStep ) + WINDOW_SPARE ) );

        items = <>
            { lead.map(row) }
            <div ref={ restStart } className="wplus-group-call-audios-spacer" aria-hidden="true" style={ { height: from * rowStep, marginBottom: -ROW_GAP } } />
            { rest.slice( from, to ).map(row) }
            { to < rest.length && <div className="wplus-group-call-audios-spacer" aria-hidden="true" style={ { height: ( rest.length - to ) * rowStep - ROW_GAP } } /> }
            { [ ...rest.slice( 0, from ), ...rest.slice( to ) ].map( ( key ) => {
                const participant = participants.get( key );
                return participant && key !== 'me' && participant.audio ? <HiddenSound key={ 'sound-' + key } participant={ participant } /> : null;
            } ) }
        </>;
    }

    // Tiles are reordered as people speak, so their positions change without
    // any property to transition. useFlipReorder animates the move itself.
    //
    // A participant who leaves now vanishes on the spot rather than fading:
    // the fade meant keeping their tile — and the LiveKit participant object
    // behind it — alive for a third of a second after they had gone, which is
    // not a trade worth making inside call code for a closing animation.
    useFlipReorder( audioGridEl );

    // While someone shares a screen, the stage is no taller than its card at the roster's width (_call-stage.scss),
    // which the stylesheet reads off the roster as a container.
    let sharing = false;
    participants.forEach( ( participant ) => { if ( participant.screen ) sharing = true; } );

    return <div ref={audioGridEl} className={ "wplus-group-call-audios-grid" + ( sharing ? " wplus-group-call-audios-sharing" : "" ) }>
        {items}
    </div>
}
