import {useEffect, useRef, useState} from "react";
import {__, _x, sprintf} from "./i18n.ts";
import type {EasyStreamClient, EasyStreamState} from "@wordplus/realtime-client/streams";
import {useStream} from "./context.tsx";
import {clock} from "./format.ts";
import {Icon} from "./icons.tsx";
import {usePlayer, useNow} from "./player.tsx";
import type {StudioControls} from "./studio.tsx";

// The test stream, on a site whose streams the cloud doesn't take yet: the host goes live in this browser alone and
// watches it on the stream's page, opened from the studio, as its viewers will (the engine's startTest(), its test.ts).
// Nothing of it reaches the cloud, and nobody else can see it. The studio says it is a test, and once it has ended, that
// going live for everyone needs the site connected.

type TestClient = EasyStreamClient & { startTest? : () => Promise<{ ok : boolean, error? : string }>, endTest? : () => void };

// The name of the tab the stream's page opens in, so a second press brings the same one forward.
const WATCH_WINDOW = 'wplus-live-stream-test';

// Whether this engine runs tests at all: with one from before them, the studio stays as it was.
export const testsRun = ( client : EasyStreamClient, state : EasyStreamState ) : boolean =>
    'test' in state && typeof ( client as TestClient ).startTest === 'function';

// The studio's test while it runs; null before, after, and on a page that watches it.
export const testRunning = ( state : EasyStreamState ) => state.test && ! state.test.watch && state.test.ended_at === null ? state.test : null;

// The studio's last test, ended, for its summary.
export const testEnded = ( state : EasyStreamState ) => state.test && ! state.test.watch && state.test.ended_at !== null ? state.test : null;

// The stream's page in a tab of its own, which keeps this window as its opener: that is how the page finds the test.
export function openWatch( url : string ){
    window.open( url, WATCH_WINDOW );
}

// Starting, with the studio's 3, 2, 1 where it counts down, and ending.
export function useTest( studio : StudioControls ){
    const client = studio.client as TestClient;
    const { player, run, countdownOn } = studio;
    const counting = useRef<ReturnType<typeof setInterval> | null>( null );

    useEffect( () => () => {
        if( counting.current ) clearInterval( counting.current );
    }, [] );

    const go = () => void run( async () => ( await client.startTest?.() ) ?? { ok: false, error: 'not_configured' } );

    const start = () => {
        if( ! countdownOn ){
            go();
            return;
        }
        let n = 3;
        player.setCountdown( n );
        counting.current = setInterval( () => {
            n -= 1;
            if( n > 0 ){
                player.setCountdown( n );
                return;
            }
            if( counting.current ) clearInterval( counting.current );
            counting.current = null;
            player.setCountdown( null );
            go();
        }, 1000 );
    };

    const cancel = () => {
        if( counting.current ) clearInterval( counting.current );
        counting.current = null;
        player.setCountdown( null );
    };

    return { start, cancel, end: () => client.endTest?.() };
}

// Where Go live is, on a site the cloud doesn't take: a test stream, and the way to connect the site for those who may.
// While it runs, its end.
export function TestControls( props : { studio : StudioControls } ){
    const { state, player, busy, previewing } = props.studio;
    const test = useTest( props.studio );

    if( testRunning( state ) ){
        return (
            <button type="button" className="wplus-live-stream-button wplus-live-stream-button--danger-solid wplus-live-stream-studio__go" onClick={ test.end }>
                <Icon name="stop" />
                { __( 'End test', 'wordplus-live-stream' ) }
            </button>
        );
    }

    if( player.countdown !== null ){
        return <button type="button" className="wplus-live-stream-button wplus-live-stream-studio__go" onClick={ test.cancel }>{ __( 'Cancel', 'wordplus-live-stream' ) }</button>;
    }

    return (
        <>
            { player.connectUrl && (
                <a className="wplus-live-stream-button wplus-live-stream-button--quiet" href={ player.connectUrl }>
                    { __( 'Connect to go live', 'wordplus-live-stream' ) }
                </a>
            ) }
            <button
                type="button"
                className="wplus-live-stream-button wplus-live-stream-button--primary wplus-live-stream-button--large wplus-live-stream-studio__go"
                disabled={ busy || ! previewing }
                data-wplus-live-stream-tip={ __( 'Go live for yourself alone, and watch it on the page of the stream as viewers will.', 'wordplus-live-stream' ) }
                onClick={ test.start }
            >
                <Icon name="broadcast" />
                { __( 'Start a test stream', 'wordplus-live-stream' ) }
            </button>
        </>
    );
}

// While the studio's test runs: how long, and that only the host sees it.
export function TestStatus(){
    const state = useStream();
    const now = useNow( 1000 );
    const running = testRunning( state );
    if( ! running ) return null;

    return (
        <div className="wplus-live-stream-studio__status">
            <span className="wplus-live-stream-chip wplus-live-stream-chip--live">
                { _x( 'Test', 'a test stream, beside its time on air', 'wordplus-live-stream' ) } <span className="wplus-live-stream-chip__number">{ clock( now - running.started_at ) }</span>
            </span>
            <span className="wplus-live-stream-chip">
                <Icon name="eye" />
                { __( 'Only you can see it', 'wordplus-live-stream' ) }
            </span>
        </div>
    );
}

// How long after Watch it as viewers do the page should be watching, before the studio says it did not reach the test.
const WATCH_WAIT_MS = 8000;

// In the studio while its test runs, where the setup was: what a test is, and the way to watch it. `url`: the stream's
// page, '' for a stream no page shows yet. A page opened from here that never watches (kept apart from this window by a
// security setting of the site) is said, as the page says it too.
export function TestPanel( props : { url : string } ){
    const state = useStream();
    const now = useNow( 1000 );
    const [ opened, setOpened ] = useState<number | null>( null );
    const [ reached, setReached ] = useState( false );
    const watching = state.test?.watching ?? 0;
    // Once a page has watched, a tab closed since is no failure to reach it.
    useEffect( () => {
        if( watching > 0 ) setReached( true );
    }, [ watching ] );
    const unreached = opened !== null && ! reached && now - opened >= WATCH_WAIT_MS;

    return (
        <div className="wplus-live-stream-test-panel" role="status">
            <p className="wplus-live-stream-test-panel__title">{ __( 'Your test stream is on', 'wordplus-live-stream' ) }</p>
            <p className="wplus-live-stream-test-panel__text">{ __( 'It runs in this browser alone. Nobody else can see it, and nothing of it is sent anywhere.', 'wordplus-live-stream' ) }</p>
            { props.url ? (
                <>
                    <button type="button" className="wplus-live-stream-button wplus-live-stream-button--primary" onClick={ () => { openWatch( props.url ); setOpened( Date.now() ); } }>
                        <Icon name="external" />
                        { __( 'Watch it as viewers do', 'wordplus-live-stream' ) }
                    </button>
                    { unreached && (
                        <p className="wplus-live-stream-controls__error" role="alert">
                            { __( 'The page has not reached this test. A security setting of the site may keep the two tabs apart, such as a Cross-Origin-Opener-Policy header.', 'wordplus-live-stream' ) }
                        </p>
                    ) }
                </>
            ) : (
                <p className="wplus-live-stream-test-panel__text">{ __( 'To watch it as viewers do, create a page for this stream in the Stream tab, then open it from here.', 'wordplus-live-stream' ) }</p>
            ) }
        </div>
    );
}

// Once the studio's test has ended: how long it ran, and once, what going live for everyone needs.
export function TestSummary(){
    const state = useStream();
    const player = usePlayer();
    const ended = testEnded( state );
    if( ! ended ) return null;
    const ran = Math.max( 0, ( ended.ended_at ?? ended.started_at ) - ended.started_at );

    return (
        <div className="wplus-live-stream-test-panel wplus-live-stream-test-panel--ended">
            <p className="wplus-live-stream-test-panel__title">{ __( 'Your test has ended', 'wordplus-live-stream' ) }</p>
            { ran > 0 && <p className="wplus-live-stream-test-panel__text">{ sprintf( _x( 'It ran for %s', 'how long a stream lasted, as 1:02:15', 'wordplus-live-stream' ), clock( ran ) ) }</p> }
            <p className="wplus-live-stream-test-panel__text">{ __( 'Viewers see your stream like this once you go live. Going live for everyone needs the site connected to WordPlus Cloud.', 'wordplus-live-stream' ) }</p>
            { player.connectUrl && (
                <a className="wplus-live-stream-button wplus-live-stream-button--primary" href={ player.connectUrl }>
                    { __( 'Connect to go live', 'wordplus-live-stream' ) }
                </a>
            ) }
        </div>
    );
}

// In the picture's top bar: in the studio while its test runs, Test where Preview was, as Live is drawn; on the stream's
// page that shows it, beside Live, that only the host who opened it sees it.
export function TestBadge(){
    const state = useStream();
    if( testRunning( state ) ) return <span className="wplus-live-stream-badge wplus-live-stream-badge--live">{ _x( 'Test', 'a test stream, beside its time on air', 'wordplus-live-stream' ) }</span>;
    if( ! state.test?.watch ) return null;

    return (
        <span className="wplus-live-stream-badge wplus-live-stream-badge--test" role="note">
            <Icon name="eye" />
            { __( 'Only you can see this test', 'wordplus-live-stream' ) }
        </span>
    );
}
