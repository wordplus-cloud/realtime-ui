import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { _x, sprintf } from "../../inc/globals.ts";
import { Glyph as Icon } from "./glyph.tsx";
import { addRecordingLanguages } from "../../inc/recording-languages.ts";
import { planRow, savedVolume, saveVolume, speakerGlyph, timeWidth, volumeSettable, type Folding } from "./controls.ts";
import { attach, sizes, soundOnly, type Quality, type SourceMode } from "./sources.ts";
import { clock, lineAt, transcriptLines } from "./transcript-data.ts";
import { Transcript } from "./transcript.tsx";
import type { RecordingData, TranscriptData } from "./types.ts";

addRecordingLanguages();

const SPEEDS = [ 1, 1.25, 1.5, 2, 0.75 ];

/**
 * From this width of the player itself the transcript stands beside the picture, as tall as it is, else it shows only
 * in full screen: the picture keeps about 580px, room for its whole control row.
 */
export const BESIDE = 880;

/** A volume step, for the arrows on the slider and Up and Down on the player. */
const STEP = 0.05;

/** How long the controls stay while it plays with nothing moving over it, no touch and no focus in its row. */
export const IDLE_MS = 2500;

/** A colour a host may give the theme: a hex, rgb() or rgba(). */
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*,\s*[0-9.]+%?\s*(,\s*[0-9.]+%?\s*)?\))$/i;

/** The host's dark scheme as the player's own properties, which the transcript takes in full screen. */
export function themeStyle( theme: RecordingData["theme"] ): Record<string, string> {
    const style: Record<string, string> = {};
    for ( const key of [ "surface", "text", "muted", "border", "accent", "current" ] as const ) {
        const value = theme?.[ key ];
        if ( typeof value === "string" && COLOUR.test( value.trim() ) ) style[ "--wplus-recording-dark-" + key ] = value.trim();
    }
    return style;
}

/** A cue's words without its markup (`<v Name>`), line by line. */
function cueLines( cue: TextTrackCue ): string[] {
    const vtt = cue as VTTCue;
    const text = typeof vtt.getCueAsHTML === "function" ? vtt.getCueAsHTML().textContent ?? "" : String( vtt.text ?? "" ).replace( /<[^>]*>/g, "" );
    return text.split( "\n" ).map( ( line ) => line.trim() ).filter( Boolean );
}

export interface RecordingPlayerProps {
    data: RecordingData;
    /** The transcript itself, when the host has it; else it is fetched from `data.transcript`. */
    transcript?: TranscriptData | null;
    /** Where hls.js's light build loads from, for a browser without HLS of its own: '' plays the MP4 there. */
    hlsUrl?: string;
    /** Whether the transcript is offered. True by default. */
    showTranscript?: boolean;
    autoPlay?: boolean;
    className?: string;
}

const matches = ( query: string ): boolean => typeof matchMedia === "function" && matchMedia( query ).matches;

/**
 * A recording of a group call or a live stream, played: its picture (or, for an audio call, its sound) with controls of
 * its own that are the same on every browser, at the size the page gives it, and its transcript beside it where it fits,
 * else in full screen alone. The captions show from the start. The control row is one line at
 * any width: play, the sound, the time, the seek bar, full screen and download stay, and speed, quality, picture in
 * picture and captions fold into a settings button as the row narrows (controls.ts). The sound opens a volume slider
 * where the browser lets a page set it, and the level is kept for the next recording. While it plays the row goes after
 * IDLE_MS with nothing moving over it, and comes back with a move, a touch or a key. The captions are drawn above the
 * row, lower while it is away. In full screen the transcript takes the host's dark scheme (`data.theme`). Keys while it
 * has the focus: Space or K, the arrows (5 s), Up and Down (the volume), J and L (10 s), C, F, M.
 */
export function RecordingPlayer( { data, transcript: given, hlsUrl = "", showTranscript = true, autoPlay = false, className }: RecordingPlayerProps ) {
    const box = useRef<HTMLDivElement>( null );
    const stageBox = useRef<HTMLDivElement>( null );
    const menuBox = useRef<HTMLDivElement>( null );
    const menuToggle = useRef<HTMLButtonElement>( null );
    const media = useRef<HTMLVideoElement & HTMLAudioElement>( null );
    const [ transcript, setTranscript ] = useState<TranscriptData | null>( given ?? null );
    const [ mode, setMode ] = useState<SourceMode>( "none" );
    // the source asked for: `auto` (HLS) or an MP4's height, and with hls.js the level it plays
    const [ quality, setQuality ] = useState<Quality>( "auto" );
    const [ levels, setLevels ] = useState<string[]>( [] );
    const [ hlsLevel, setHlsLevel ] = useState<Quality>( "auto" );
    const [ playingSize, setPlayingSize ] = useState( "" );
    const [ fellBack, setFellBack ] = useState( false );
    const attached = useRef<{ level?( quality: Quality ): void } | null>( null );
    const [ playing, setPlaying ] = useState( false );
    const [ started, setStarted ] = useState( false );
    const [ waiting, setWaiting ] = useState( false );
    const [ time, setTime ] = useState( 0 );
    const [ duration, setDuration ] = useState( data.seconds ?? 0 );
    const [ speed, setSpeed ] = useState( 1 );
    const [ muted, setMuted ] = useState( false );
    const [ volume, setVolume ] = useState( 1 );
    // The captions show on the picture until they are turned off.
    const [ captions, setCaptions ] = useState( true );
    const [ playerWidth, setPlayerWidth ] = useState( 0 );
    const [ rowWidth, setRowWidth ] = useState( 0 );
    const [ menuOpen, setMenuOpen ] = useState( false );
    const [ volumeOpen, setVolumeOpen ] = useState( false );
    const [ fullScreened, setFullScreened ] = useState( false );
    const [ failed, setFailed ] = useState( false );
    const resume = useRef( 0 );
    const lastLevel = useRef( 1 );
    const controlsBox = useRef<HTMLDivElement>( null );
    const [ rowHeight, setRowHeight ] = useState( 0 );
    // The controls put away while it plays and nothing moves (IDLE_MS), and the captions the player draws itself.
    const [ idle, setIdle ] = useState( false );
    const idleNow = useRef( false );
    idleNow.current = idle;
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>( null );
    const overRow = useRef( false );
    const held = useRef( false );
    // A touch that brings the controls back is not a tap on the picture too.
    const swallowTap = useRef( false );
    const [ caption, setCaption ] = useState<string[]>( [] );

    const touch = useMemo( () => matches( "(pointer: coarse)" ), [] );
    const settable = useMemo( () => volumeSettable(), [] );
    // A slider only where a pointer hovers and the page may set the volume: a phone has its own buttons for it.
    const slider = settable && ! touch;

    const theme = useMemo( () => themeStyle( data.theme ), [ data.theme ] );
    const lines = useMemo( () => transcriptLines( transcript ), [ transcript ] );
    const current = useMemo( () => lineAt( lines, time ), [ lines, time ] );
    // Sound alone (an audio call recorded before 1.0.4); an audio call's video plays as any other.
    const audioOnly = soundOnly( data );
    const qualities = sizes( data );
    const withTranscript = showTranscript && lines.length > 0;
    const beside = withTranscript && ( playerWidth === 0 || playerWidth >= BESIDE );
    const pipSupported = ! audioOnly && typeof document !== "undefined" && !! document.pictureInPictureEnabled;
    // A video has full screen everywhere (the iPhone's own one at least). Sound has it where the browser fills the screen
    // with an element, as the transcript is there.
    const fullAvailable = ! audioOnly || ( typeof document !== "undefined" && !! document.fullscreenEnabled );
    // The transcript beside the picture where it fits, else only in full screen, so the player keeps the size the page
    // gave it. Sound with no full screen keeps it under the row.
    const transcriptShown = withTranscript && ( beside || fullScreened || ! fullAvailable );
    // Sound's speaker and title where there is room for them, else the row alone.
    const face = audioOnly && ( beside || fullScreened );

    // The qualities to choose from, Auto first and the default wherever HLS plays: with hls.js its levels, played
    // without reloading. With the browser's own HLS (Safari), which picks its level itself, the MP4s' heights beside
    // Auto. Where there is no HLS, or it fell back, the MP4s' heights alone, the one that plays marked.
    const hlsPlays = !! data.sources?.hls && ! fellBack;
    const qualityChoices: Quality[] = audioOnly ? [] : "hls" === mode ? ( levels.length > 1 ? [ "auto", ...levels ] : [] ) : hlsPlays ? [ "auto", ...qualities ] : qualities;
    const qualityNow: Quality = "hls" === mode ? hlsLevel : hlsPlays || "auto" !== quality ? quality : playingSize;

    const chooseQuality = ( choice: Quality ) => {
        if ( "hls" === mode ) {
            setHlsLevel( choice );
            attached.current?.level?.( choice );
            return;
        }
        setQuality( choice );
    };

    const plan = planRow( {
        width: rowWidth,
        touch,
        duration: clock( duration ),
        speed: true,
        quality: qualityChoices.length > 1,
        captions: !! data.captions && ! audioOnly,
        pip: pipSupported,
        download: !! data.download,
        full: fullAvailable,
        slider,
    } );
    const folded = ( control: Folding ) => plan.folded.includes( control );

    useEffect( () => {
        if ( given !== undefined ) {
            setTranscript( given );
            return undefined;
        }
        if ( ! data.transcript ) return undefined;

        let live = true;
        fetch( data.transcript, { credentials: "same-origin" } ).then( ( r ) => r.ok ? r.json() : null ).then( ( json ) => {
            if ( live && json ) setTranscript( json as TranscriptData );
        } ).catch( () => undefined );

        return () => {
            live = false;
        };
    }, [ data.transcript, given ] );

    // The level this browser last left a recording at.
    useEffect( () => {
        const element = media.current;
        const saved = savedVolume();
        if ( ! element || ! saved ) return;
        if ( settable ) element.volume = saved.level;
        element.muted = saved.muted;
        if ( saved.level > 0 ) lastLevel.current = saved.level;
        setVolume( element.volume );
        setMuted( element.muted );
    }, [ settable ] );

    // The sources, again when the quality changes, carrying on from the same moment.
    useEffect( () => {
        const element = media.current;
        if ( ! element ) return undefined;

        let gone = false;
        let current: { detach(): void } | null = null;
        const at = resume.current;
        const wasPlaying = playing;

        const fallen = ( size: string ) => {
            if ( gone ) return;
            setFellBack( true );
            setMode( "mp4" );
            setPlayingSize( size );
        };
        const heights = ( found: string[] ) => {
            if ( ! gone ) setLevels( found );
        };

        attach( element, data, quality, hlsUrl, fallen, heights ).then( ( done ) => {
            if ( gone ) {
                done.detach();
                return;
            }
            current = done;
            attached.current = done;
            setMode( done.mode );
            setPlayingSize( done.size ?? "" );
            setLevels( [] );
            setHlsLevel( "auto" );
            setFailed( done.mode === "none" );
            if ( at > 0 ) {
                const seek = () => {
                    element.currentTime = at;
                };
                if ( element.readyState >= 1 ) seek();
                else element.addEventListener( "loadedmetadata", seek, { once: true } );
            }
            if ( wasPlaying || ( autoPlay && ! started ) ) element.play().catch( () => undefined );
        } );

        return () => {
            gone = true;
            current?.detach();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ data, quality, hlsUrl ] );

    // The captions: the one track's cues, which the player draws itself over the picture, above the control row while it
    // shows and lower once it goes. In the iPhone's own full screen, which shows nothing of the page, the browser
    // draws them.
    useEffect( () => {
        const element = media.current;
        const track = element?.textTracks?.[ 0 ];
        if ( ! element || ! track ) return undefined;
        let native = false;
        const apply = () => {
            track.mode = ! captions ? "disabled" : native ? "showing" : "hidden";
        };
        const read = () => {
            const cues = captions && ! native ? track.activeCues : null;
            const lines: string[] = [];
            for ( let i = 0; cues && i < cues.length; i++ ) lines.push( ...cueLines( cues[ i ] ) );
            setCaption( lines );
        };
        const begin = () => {
            native = true;
            apply();
            read();
        };
        const end = () => {
            native = false;
            apply();
            read();
        };
        apply();
        read();
        track.addEventListener( "cuechange", read );
        element.addEventListener( "webkitbeginfullscreen", begin );
        element.addEventListener( "webkitendfullscreen", end );
        return () => {
            track.removeEventListener( "cuechange", read );
            element.removeEventListener( "webkitbeginfullscreen", begin );
            element.removeEventListener( "webkitendfullscreen", end );
        };
    }, [ captions, mode ] );

    // The controls back for IDLE_MS from any move, touch, key or focus, then away while it plays, unless the pointer
    // is over the row, the focus is in it, or the settings or the volume are open.
    const wake = useCallback( () => {
        if ( idleTimer.current ) clearTimeout( idleTimer.current );
        if ( idleNow.current ) setIdle( false );
        idleTimer.current = setTimeout( () => {
            const element = media.current;
            const root = box.current?.getRootNode() as Document | ShadowRoot | undefined;
            // A keyboard's focus in the row, not the focus a click leaves on Play.
            const active = root?.activeElement;
            let focused = false;
            try {
                focused = !! active && !! controlsBox.current?.contains( active ) && active.matches( ":focus-visible" );
            } catch {
                focused = false;
            }
            if ( ! element || element.paused || overRow.current || held.current || focused ) return;
            setIdle( true );
        }, IDLE_MS );
    }, [] );

    held.current = menuOpen || volumeOpen;

    useEffect( () => {
        if ( playing && ! held.current ) wake();
        else {
            if ( idleTimer.current ) clearTimeout( idleTimer.current );
            setIdle( false );
        }
    }, [ playing, menuOpen, volumeOpen, wake ] );

    useEffect( () => () => {
        if ( idleTimer.current ) clearTimeout( idleTimer.current );
    }, [] );

    // How tall the row is, which the captions stand above.
    useEffect( () => {
        const row = controlsBox.current;
        if ( ! row || typeof ResizeObserver === "undefined" ) return undefined;
        const observer = new ResizeObserver( () => setRowHeight( Math.round( row.getBoundingClientRect().height ) ) );
        observer.observe( row );
        return () => observer.disconnect();
    }, [] );

    // The player's own width before its first paint, so a narrow one never draws the transcript for a frame.
    useLayoutEffect( () => {
        const width = Math.round( box.current?.getBoundingClientRect().width ?? 0 );
        if ( width > 0 ) setPlayerWidth( width );
    }, [] );

    // The player's own width (the transcript beside or under) and the control row's (what folds).
    useEffect( () => {
        const player = box.current;
        const stage = stageBox.current;
        if ( ! player || ! stage || typeof ResizeObserver === "undefined" ) return undefined;
        const observer = new ResizeObserver( ( entries ) => {
            for ( const entry of entries ) {
                const width = Math.round( entry.contentRect.width );
                if ( entry.target === player ) setPlayerWidth( width );
                else setRowWidth( width );
            }
        } );
        observer.observe( player );
        observer.observe( stage );
        return () => observer.disconnect();
    }, [] );

    // The settings closed by a press anywhere else, inside the player's shadow root too.
    useEffect( () => {
        if ( ! menuOpen ) return undefined;
        const root = ( box.current?.getRootNode() ?? document ) as Document | ShadowRoot;
        const away = ( event: Event ) => {
            const path = event.composedPath();
            if ( ! path.some( ( node ) => node === menuBox.current || node === menuToggle.current ) ) setMenuOpen( false );
        };
        root.addEventListener( "pointerdown", away );
        return () => root.removeEventListener( "pointerdown", away );
    }, [ menuOpen ] );

    // Nothing left to put in the settings: closed.
    useEffect( () => {
        if ( ! plan.folded.length ) setMenuOpen( false );
    }, [ plan.folded.length ] );

    // In the element's shadow root the document names its host as the one in full screen: the root names the player.
    useEffect( () => {
        const changed = () => {
            const root = box.current?.getRootNode() as Document | ShadowRoot | undefined;
            setFullScreened( !! box.current && ( root?.fullscreenElement ?? document.fullscreenElement ) === box.current );
        };
        document.addEventListener( "fullscreenchange", changed );
        return () => document.removeEventListener( "fullscreenchange", changed );
    }, [] );

    const toggle = useCallback( () => {
        const element = media.current;
        if ( ! element ) return;
        if ( element.paused ) element.play().catch( () => undefined );
        else element.pause();
    }, [] );

    const seek = useCallback( ( seconds: number ) => {
        const element = media.current;
        if ( ! element ) return;
        element.currentTime = Math.max( 0, Math.min( seconds, Number.isFinite( element.duration ) ? element.duration : seconds ) );
        setTime( element.currentTime );
    }, [] );

    const seekAndPlay = useCallback( ( seconds: number ) => {
        seek( seconds );
        media.current?.play().catch( () => undefined );
    }, [ seek ] );

    // The sound as the element has it, shown and kept: on its volumechange, and after each change of ours, which a
    // browser that sends no event for it would leave unshown.
    const readVolume = useCallback( () => {
        const element = media.current;
        if ( ! element ) return;
        setMuted( element.muted );
        setVolume( element.volume );
        if ( element.volume > 0 ) lastLevel.current = element.volume;
        saveVolume( element.volume, element.muted );
    }, [] );

    // Unmuted at the level it was muted at, or at the last level it had when the slider took it to nothing.
    const toggleMute = useCallback( () => {
        const element = media.current;
        if ( ! element ) return;
        if ( element.muted || element.volume === 0 ) {
            element.muted = false;
            if ( element.volume === 0 ) element.volume = lastLevel.current || 1;
        } else {
            element.muted = true;
        }
        readVolume();
    }, [ readVolume ] );

    const setLevel = useCallback( ( level: number ) => {
        const element = media.current;
        if ( ! element ) return;
        const next = Math.min( 1, Math.max( 0, Math.round( level * 100 ) / 100 ) );
        element.volume = next;
        element.muted = next === 0;
        readVolume();
    }, [ readVolume ] );

    const fullScreen = () => {
        const element = box.current;
        if ( ! element ) return;
        if ( document.fullscreenElement ) document.exitFullscreen().catch( () => undefined );
        else if ( element.requestFullscreen ) element.requestFullscreen().catch( () => undefined );
        // iOS: the video's own full screen, the only one it has
        else ( media.current as unknown as { webkitEnterFullscreen?: () => void } )?.webkitEnterFullscreen?.();
    };

    const pictureInPicture = () => {
        const element = media.current as HTMLVideoElement | null;
        if ( ! element ) return;
        if ( document.pictureInPictureElement ) document.exitPictureInPicture().catch( () => undefined );
        else element.requestPictureInPicture?.().catch( () => undefined );
    };

    const chooseSpeed = ( next: number ) => {
        setSpeed( next );
        if ( media.current ) media.current.playbackRate = next;
    };

    const nextSpeed = () => chooseSpeed( SPEEDS[ ( SPEEDS.indexOf( speed ) + 1 ) % SPEEDS.length ] );

    const onKey = ( event: React.KeyboardEvent ) => {
        wake();
        const target = event.target as HTMLElement;
        if ( event.key === "Escape" && menuOpen ) {
            event.preventDefault();
            setMenuOpen( false );
            return;
        }
        if ( target.closest( "input, textarea, select" ) || event.altKey || event.ctrlKey || event.metaKey ) return;
        const element = media.current;
        if ( ! element ) return;

        const keys: Record<string, () => void> = {
            " ": toggle,
            k: toggle,
            ArrowLeft: () => seek( element.currentTime - 5 ),
            ArrowRight: () => seek( element.currentTime + 5 ),
            j: () => seek( element.currentTime - 10 ),
            l: () => seek( element.currentTime + 10 ),
            c: () => setCaptions( ( on ) => ! on ),
            f: fullScreen,
            m: toggleMute,
            ...( settable ? {
                ArrowUp: () => setLevel( ( element.muted ? 0 : element.volume ) + STEP ),
                ArrowDown: () => setLevel( ( element.muted ? 0 : element.volume ) - STEP ),
            } : {} ),
        };
        const run = keys[ event.key.length === 1 ? event.key.toLowerCase() : event.key ];

        // A button keeps its own Space and Enter.
        if ( ! run || ( event.key === " " && target.closest( "button" ) ) ) return;
        event.preventDefault();
        run();
    };

    const events = {
        onPlay: () => {
            setPlaying( true );
            setStarted( true );
        },
        onPause: () => setPlaying( false ),
        onWaiting: () => setWaiting( true ),
        onPlaying: () => setWaiting( false ),
        onCanPlay: () => setWaiting( false ),
        onTimeUpdate: () => {
            const element = media.current;
            if ( ! element ) return;
            setTime( element.currentTime );
            resume.current = element.currentTime;
        },
        onDurationChange: () => {
            const element = media.current;
            if ( element && Number.isFinite( element.duration ) && element.duration > 0 ) setDuration( element.duration );
        },
        onVolumeChange: readVolume,
        // The browser's own HLS that can't play these playlists (Chrome's, which says it can) gives way to the MP4,
        // from the same moment. The MP4 failing too is a recording this browser can't play.
        onError: () => {
            if ( mode === "native" && qualities.length ) {
                setFellBack( true );
                setQuality( qualities.includes( "720" ) ? "720" : qualities[ qualities.length - 1 ] );
                return;
            }
            setFailed( true );
        },
    };

    const label = ( key: string ) => ( {
        play: _x( 'Play', 'Recording player', 'wordplus-recording' ),
        pause: _x( 'Pause', 'Recording player', 'wordplus-recording' ),
        seek: _x( 'Seek', 'Recording player', 'wordplus-recording' ),
        speed: _x( 'Playback speed', 'Recording player', 'wordplus-recording' ),
        captions: _x( 'Captions', 'Recording player', 'wordplus-recording' ),
        quality: _x( 'Quality', 'Recording player', 'wordplus-recording' ),
        pip: _x( 'Picture in picture', 'Recording player', 'wordplus-recording' ),
        full: _x( 'Full screen', 'Recording player', 'wordplus-recording' ),
        exit: _x( 'Exit full screen', 'Recording player', 'wordplus-recording' ),
        download: _x( 'Download', 'Recording player', 'wordplus-recording' ),
        mute: _x( 'Mute', 'Recording player', 'wordplus-recording' ),
        unmute: _x( 'Unmute', 'Recording player', 'wordplus-recording' ),
        volume: _x( 'Volume', 'Recording player', 'wordplus-recording' ),
        settings: _x( 'Settings', 'Recording player', 'wordplus-recording' ),
    } as Record<string, string> )[ key ];

    const level = muted ? 0 : volume;
    const qualityName = ( choice: Quality ) => choice === "auto" ? _x( 'Auto', 'Recording player quality', 'wordplus-recording' ) : choice + "p";

    const menuButton = plan.folded.length > 0 && <button ref={ menuToggle } type="button" className="wplus-recording-icon-button" aria-label={ label( "settings" ) } aria-haspopup="true" aria-expanded={ menuOpen } onClick={ () => setMenuOpen( ! menuOpen ) }>
        <Icon name="settings" size={ 18 } />
    </button>;

    // Over the picture, scrolling inside it, or on a touch screen under it, where a phone's short picture leaves no room
    // for them: over it again in full screen.
    const menuBelow = touch && ! fullScreened;
    const menu = plan.folded.length > 0 && menuOpen && <div ref={ menuBox } className="wplus-recording-menu" data-below={ menuBelow ? 1 : undefined } role="group" aria-label={ label( "settings" ) }>
            { folded( "speed" ) && <div className="wplus-recording-menu-row">
                <span className="wplus-recording-menu-label">{ label( "speed" ) }</span>
                <span className="wplus-recording-menu-choices">
                    { [ ...SPEEDS ].sort( ( a, b ) => a - b ).map( ( choice ) => <button key={ choice } type="button" aria-pressed={ speed === choice } onClick={ () => chooseSpeed( choice ) }>{ choice + "×" }</button> ) }
                </span>
            </div> }
            { folded( "quality" ) && <div className="wplus-recording-menu-row">
                <span className="wplus-recording-menu-label">{ label( "quality" ) }</span>
                <span className="wplus-recording-menu-choices">
                    { qualityChoices.map( ( choice ) => <button key={ choice } type="button" aria-pressed={ qualityNow === choice } onClick={ () => chooseQuality( choice ) }>{ qualityName( choice ) }</button> ) }
                </span>
            </div> }
            { folded( "captions" ) && <button type="button" className="wplus-recording-menu-item" aria-pressed={ captions } onClick={ () => setCaptions( ! captions ) }>
                <Icon name="captions" size={ 18 } />{ label( "captions" ) }
            </button> }
            { folded( "pip" ) && <button type="button" className="wplus-recording-menu-item" onClick={ () => {
                setMenuOpen( false );
                pictureInPicture();
            } }>
                <Icon name="pip" size={ 18 } />{ label( "pip" ) }
            </button> }
            { folded( "download" ) && data.download && <a className="wplus-recording-menu-item" href={ data.download } download onClick={ () => setMenuOpen( false ) }>
                <Icon name="download" size={ 18 } />{ label( "download" ) }
            </a> }
    </div>;

    // The sound first after play, where most players have it, its slider opening beside it.
    const volumeControl = <span
        className="wplus-recording-volume"
        data-open={ slider && volumeOpen ? 1 : undefined }
        data-inline={ plan.sliderInline ? 1 : undefined }
        onMouseEnter={ () => setVolumeOpen( true ) }
        onMouseLeave={ () => setVolumeOpen( false ) }
        onFocus={ () => setVolumeOpen( true ) }
        onBlur={ ( event ) => {
            if ( ! event.currentTarget.contains( event.relatedTarget as Node | null ) ) setVolumeOpen( false );
        } }
    >
        <button type="button" className="wplus-recording-icon-button" aria-label={ label( level === 0 ? "unmute" : "mute" ) } data-glyph={ speakerGlyph( volume, muted ) } onClick={ toggleMute }>
            <Icon name={ speakerGlyph( volume, muted ) } size={ 18 } />
        </button>
        { slider && <span className="wplus-recording-volume-slider">
            <input
                type="range"
                min={ 0 }
                max={ 1 }
                step={ STEP }
                value={ level }
                aria-label={ label( "volume" ) }
                aria-valuetext={ Math.round( level * 100 ) + "%" }
                style={ { "--wplus-recording-progress": level * 100 + "%" } as React.CSSProperties }
                onChange={ ( event ) => setLevel( Number( event.target.value ) ) }
            />
        </span> }
    </span>;

    const stage = <div ref={ stageBox } className="wplus-recording-stage" data-audio={ audioOnly ? 1 : undefined } data-face={ face ? 1 : undefined } style={ { "--wplus-recording-row-height": rowHeight + "px" } as React.CSSProperties }>
        { audioOnly
            ? <div className="wplus-recording-audio-face">
                { face && <Icon name="speaker" size={ 40 } /> }
                { face && data.title && <span className="wplus-recording-audio-title">{ data.title }</span> }
                <audio ref={ media } preload="metadata" { ...events } />
            </div>
            : <video ref={ media } playsInline preload="metadata" poster={ data.poster || undefined } onClick={ () => {
                if ( swallowTap.current ) {
                    swallowTap.current = false;
                    return;
                }
                toggle();
            } } { ...events }>
                { data.captions && <track kind="captions" src={ data.captions } srcLang="und" label={ label( "captions" ) } /> }
            </video> }

        { caption.length > 0 && <div className="wplus-recording-caption" aria-hidden="true" style={ { fontSize: Math.round( Math.max( 14, Math.min( 32, ( rowWidth || 640 ) * 0.03 ) ) ) } }>
            { caption.map( ( line, i ) => <span key={ i }>{ line }</span> ) }
        </div> }

        { ! started && ! audioOnly && ! failed && <button type="button" className="wplus-recording-big-play" aria-label={ label( "play" ) } onClick={ toggle }><Icon name="play" size={ 32 } /></button> }
        { waiting && started && <span className="wplus-recording-waiting" aria-hidden="true"><Icon name="spinner" size={ 28 } /></span> }
        { failed && <p className="wplus-recording-failed" role="alert">{ _x( 'This recording cannot be played here.', 'Recording player', 'wordplus-recording' ) }</p> }

        <div
            ref={ controlsBox }
            className="wplus-recording-controls"
            onPointerEnter={ ( event ) => {
                if ( event.pointerType === "mouse" ) overRow.current = true;
            } }
            onPointerLeave={ () => {
                overRow.current = false;
                wake();
            } }
        >
            <button type="button" className="wplus-recording-icon-button" aria-label={ label( playing ? "pause" : "play" ) } onClick={ toggle }>
                <Icon name={ playing ? "pause" : "play" } size={ 18 } />
            </button>
            { volumeControl }
            { plan.time !== "none" && <span className="wplus-recording-time" style={ { width: timeWidth( clock( duration ), plan.time ) } }>{ plan.time === "short" ? clock( time ) : clock( time ) + " / " + clock( duration ) }</span> }
            <input
                className="wplus-recording-seek"
                type="range"
                min={ 0 }
                max={ Math.max( duration, 0.1 ) }
                step={ 0.1 }
                value={ Math.min( time, duration || time ) }
                aria-label={ label( "seek" ) }
                aria-valuetext={ sprintf( /* translators: 1: where the recording is, 2: how long it is, such as 4:07 of 45:03 */ _x( '%1$s of %2$s', 'Recording player', 'wordplus-recording' ), clock( time ), clock( duration ) ) }
                style={ { "--wplus-recording-progress": ( duration > 0 ? ( time / duration ) * 100 : 0 ) + "%", minWidth: plan.seek } as React.CSSProperties }
                onChange={ ( event ) => seek( Number( event.target.value ) ) }
            />
            { ! folded( "speed" ) && <button type="button" className="wplus-recording-text-button wplus-recording-speed" aria-label={ label( "speed" ) } onClick={ nextSpeed }>{ speed + "×" }</button> }
            { data.captions && ! audioOnly && ! folded( "captions" ) && <button type="button" className="wplus-recording-icon-button" aria-label={ label( "captions" ) } aria-pressed={ captions } onClick={ () => setCaptions( ! captions ) }>
                <Icon name="captions" size={ 18 } />
            </button> }
            { qualityChoices.length > 1 && ! folded( "quality" ) && <select className="wplus-recording-quality" aria-label={ label( "quality" ) } value={ qualityNow } onChange={ ( event ) => chooseQuality( event.target.value ) }>
                { qualityChoices.map( ( choice ) => <option key={ choice } value={ choice }>{ qualityName( choice ) }</option> ) }
            </select> }
            { pipSupported && ! folded( "pip" ) && <button type="button" className="wplus-recording-icon-button" aria-label={ label( "pip" ) } onClick={ pictureInPicture }><Icon name="pip" size={ 18 } /></button> }
            { data.download && ! folded( "download" ) && <a className="wplus-recording-icon-button" href={ data.download } download aria-label={ label( "download" ) }><Icon name="download" size={ 18 } /></a> }
            { menuButton }
            { fullAvailable && <button type="button" className="wplus-recording-icon-button" aria-label={ label( fullScreened ? "exit" : "full" ) } title={ label( fullScreened ? "exit" : "full" ) } onClick={ fullScreen }>
                <Icon name={ fullScreened ? "minimize" : "maximize" } size={ 18 } />
            </button> }
        </div>
        { ! menuBelow && menu }
    </div>;

    return <div
        ref={ box }
        className={ "wplus-recording-player" + ( className ? " " + className : "" ) }
        data-wide={ beside ? 1 : undefined }
        data-touch={ touch ? 1 : undefined }
        data-mode={ mode }
        data-idle={ idle ? 1 : undefined }
        style={ theme as React.CSSProperties }
        tabIndex={ -1 }
        onKeyDown={ onKey }
        onPointerMove={ ( event ) => {
            if ( event.pointerType === "mouse" ) wake();
        } }
        onPointerDownCapture={ ( event ) => {
            if ( idleNow.current && event.pointerType !== "mouse" && !! stageBox.current?.contains( event.target as Node ) ) swallowTap.current = true;
            wake();
        } }
        onFocus={ wake }
    >
        { stage }
        { menuBelow && menu }
        { transcriptShown && <Transcript lines={ lines } current={ current } onSeek={ seekAndPlay } name={ data.title } /> }
    </div>;
}
