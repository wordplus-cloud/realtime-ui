import {useState} from "react";
import {__, _nx, _x, sprintf} from "./i18n.ts";
import {useStream} from "./context.tsx";
import {count, relative} from "./format.ts";
import {Icon} from "./icons.tsx";
import {pageUrl, usePlayer, useNow} from "./player.tsx";
import {ViewerControls} from "./controls.tsx";

// Under the picture: the stream's title, when it went live and how many watch, and what a viewer can do
// (react, share, ask to come on stage).

function Share(){
    const { title, url } = usePlayer();
    const [ copied, setCopied ] = useState( false );

    const share = async () => {
        const link = pageUrl( url );

        if( typeof navigator.share === 'function' ){
            try {
                await navigator.share( { title: title || undefined, url: link } );
                return;
            } catch ( e ) {
                // Closed, or not allowed here: a copied link instead, unless the person closed it.
                if( ( e as Error ).name === 'AbortError' ) return;
            }
        }

        try {
            await navigator.clipboard.writeText( link );
            setCopied( true );
            setTimeout( () => setCopied( false ), 2000 );
        } catch ( e ) {
            // No clipboard either (a page that isn't https): nothing more to try.
        }
    };

    return (
        <button type="button" className="wplus-live-stream-button wplus-live-stream-button--quiet" onClick={ () => void share() } aria-live="polite">
            <Icon name={ copied ? 'check' : 'share' } />
            { copied ? __( 'Link copied', 'wordplus-live-stream' ) : __( 'Share', 'wordplus-live-stream' ) }
        </button>
    );
}

// Which of it shows (a Stream details block's choice): all of it by default.
export interface InfoShows {
    title? : boolean;
    meta? : boolean;
    actions? : boolean;
}

export function Info( props : { guests : boolean, show? : InfoShows } ){
    const state = useStream();
    const player = usePlayer();
    const now = useNow( 30000 );
    const stream = state.stream;
    const host = state.you?.role === 'host';
    const show = props.show ?? {};
    const titled = show.title !== false && Boolean( player.title ) && player.appearance.title !== false;
    const counted = show.meta !== false && ( player.appearance.viewers !== false || host ) && state.status === 'ready' && stream?.state !== 'ended';

    const when = show.meta === false ? ''
        : stream?.state === 'live' && stream.started_at
            ? sprintf( _x( 'Started %s', 'a time, as "12 minutes ago"', 'wordplus-live-stream' ), relative( stream.started_at, now ) )
            : stream?.state === 'ended' && stream.ended_at
                ? sprintf( _x( 'Ended %s', 'a time, as "5 minutes ago"', 'wordplus-live-stream' ), relative( stream.ended_at, now ) )
                : '';

    return (
        <div className="wplus-live-stream-info">
            <div className="wplus-live-stream-info__text">
                { titled && <h2 className="wplus-live-stream-info__title">{ player.title }</h2> }
                { ( when || counted ) && (
                    <p className="wplus-live-stream-info__meta">
                        { when && <span>{ when }</span> }
                        { counted && (
                            <span className="wplus-live-stream-info__count">
                                { sprintf( _nx( '%s watching', '%s watching', state.viewers, 'how many people watch', 'wordplus-live-stream' ), count( state.viewers ) ) }
                            </span>
                        ) }
                    </p>
                ) }
            </div>
            { state.status === 'ready' && show.actions !== false && (
                <div className="wplus-live-stream-info__actions">
                    { ! host && <ViewerControls guests={ props.guests } /> }
                    <Share />
                </div>
            ) }
        </div>
    );
}
