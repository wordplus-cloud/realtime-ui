import {useEffect, useId, useRef, useState, type ReactNode} from "react";
import type {EasyStreamClient} from "@wordplus/realtime-client/streams";
import {__, _x} from "./i18n.ts";
import {configureUi, type HostBackground} from "../../host.ts";
import {
    applyEffect, builtInBackgrounds, cameraEffectsUnavailable, chooseEffects, effectOffered, effectsChoice, effectState, effectsTunable,
    siteBackgrounds, TUNE_KEYS, useCameraEffectsUnavailable, useEffectState, useEffectsChoice, type CameraEffect, type ProcessorTrack
} from "../../inc/calls/effects.ts";
import {
    addOwnBackground, OWN_ACCEPT, OWN_MAX_BYTES, ownBackgroundsAllowed, ownBackgroundsLast, removeOwnBackground, useOwnBackgrounds
} from "../../inc/calls/own-backgrounds.ts";

// The host's effects in the studio, the call screens' own (inc/calls/effects.ts, src/effects): the background behind
// them blurred or replaced by a picture, and AI noise removal, on the camera and the microphone the stream sends, so
// every viewer gets the picture and the sound as processed. The engines and their models come from the folders the
// host's page names (configureStreamEffects(): the packs a site downloads, the WordPlus SDK's video effects), each
// loaded only once an effect is turned on, and nothing is offered without them or where the browser cannot run them.
//
// The choice is the call screens' too, kept by the browser (EFFECTS_KEY), so a host who blurs their room in a call has
// it blurred when they go live, and off until they turn it on. A picture of their own stays in their browser
// (inc/calls/own-backgrounds.ts), never sent anywhere: the viewers see it only in the camera's picture.
//
// The words are the stream's (i18n.ts), in its text domain: the device settings' are Better Messages', which the
// stream's WordPress build would not translate.

/** What the host's page says of the effects: the WordPlus SDK's video effects as their page data gives them. */
export interface StreamEffects {
    /** The effects' folder, ending in a slash: '' until a site has the pack. */
    url? : string;
    /** AI noise removal's folder, a pack of its own: '' until a site has it. */
    noiseUrl? : string;
    /** The site's own pictures for the background. */
    pictures? : HostBackground[];
    /** The pictures of WordPlus's catalog the site picked. */
    builtIn? : HostBackground[];
    /** Whether hosts may use a picture of their own device, kept by their browser. */
    ownPictures? : boolean;
}

const list = ( value : unknown ) : HostBackground[] => Array.isArray( value ) ? value as HostBackground[] : [];
const folder = ( value : unknown ) => typeof value === 'string' ? value : '';

/**
 * Hands the effects' folders and pictures to the screens' host (UiHost), once a page: the first config that names them.
 * Nothing changes for a page without them, which offers no effect.
 */
export function configureStreamEffects( effects : StreamEffects | null | undefined ) : void {
    if( ! effects || typeof effects !== 'object' ) return;
    configureUi( {
        effectsUrl: () => folder( effects.url ),
        noiseUrl: () => folder( effects.noiseUrl ),
        backgrounds: () => list( effects.pictures ),
        builtInBackgrounds: () => list( effects.builtIn ),
        ownBackgrounds: () => effects.ownPictures === true
    } );
}

// The client's camera or microphone as the room client has it (realtime-client 1.0.71): none from an engine before it.
function deviceTrack( client : EasyStreamClient, kind : 'camera' | 'microphone' ) : ProcessorTrack | null {
    const read = ( client as unknown as { deviceTrack? : ( kind : 'camera' | 'microphone' ) => unknown } ).deviceTrack;
    return typeof read === 'function' ? ( read.call( client, kind ) as ProcessorTrack | null ) ?? null : null;
}

export interface StudioEffects {
    /** Whether the background is offered here: the site has the pack, and this browser runs it. */
    camera : boolean;
    /** Whether AI noise removal is. */
    noise : boolean;
    /** Which of them is still loading onto its track: what going live waits for, which the studio says. */
    loading : { camera : boolean, noise : boolean };
    /**
     * Waits for the effects to be on the camera and the microphone, or to have failed there, so the stream goes out with
     * them from its start: null while none is on its way, so going live then waits for nothing. However long they take,
     * with no time after which the camera goes out without its background, which would show the room it hides: the
     * first background on a computer compiles its GPU programs, 7 s on an M1 Max and 8 s in software, and the studio
     * says what it waits for meanwhile, with Cancel.
     */
    ready() : Promise<void> | null;
    /**
     * Whether the camera would go out without the background the host chose: it could not start, or this device runs
     * no background at all (WebGL drawn in software, or the engine's EffectsUnavailable). Going live then waits for
     * the host to choose None, as a background chosen to hide a room must never show it.
     */
    bare() : boolean;
}

/**
 * Follows the host's choice on the camera and the microphone this window sends (`sends`), each while it is on: the
 * effect goes on the track itself, which sends what it gives, before going live too, so the preview shows what the
 * viewers will see and the camera's check measures it as it goes out (realtime-client's checkCamera). A microphone in
 * original sound gets no noise removal: it goes out as it hears.
 */
export function useStudioEffects( client : EasyStreamClient, props : { sends : boolean, camera : boolean, microphone : boolean, originalSound : boolean } ) : StudioEffects {
    const chosen = useEffectsChoice();
    // The host's own pictures as the browser has read them: one chosen goes on once it is read, and off once removed.
    const own = useOwnBackgrounds().map( ( picture ) => picture.id + ' ' + picture.url ).join( '|' );
    const camera = props.sends && props.camera ? deviceTrack( client, 'camera' ) : null;
    const microphone = props.sends && props.microphone && ! props.originalSound ? deviceTrack( client, 'microphone' ) : null;
    // Read by bare() after Go live's wait, which a render's values would have gone stale for.
    const sendsCamera = useRef( false );
    sendsCamera.current = Boolean( camera );
    // What is on its way to the tracks, each change in turn (applyEffect queues them on its track).
    const pending = useRef<Set<Promise<void>>>( new Set() );
    const follow = ( work : Promise<void> ) => {
        pending.current.add( work );
        void work.finally( () => pending.current.delete( work ) );
    };

    useEffect( () => {
        if( camera ) follow( applyEffect( camera, 'camera' ) );
    }, [ camera, chosen.camera, JSON.stringify( chosen.tune ), chosen.camera.startsWith( 'own:' ) ? own : 0 ] );

    useEffect( () => {
        if( microphone ) follow( applyEffect( microphone, 'noise' ) );
    }, [ microphone, chosen.noise ] );

    const cameraState = useEffectState( 'camera' );
    const noiseState = useEffectState( 'noise' );

    return {
        camera: effectOffered( 'camera' ),
        noise: effectOffered( 'noise' ),
        loading: { camera: Boolean( camera ) && cameraState === 'loading', noise: Boolean( microphone ) && noiseState === 'loading' },
        ready: () => pending.current.size === 0 ? null : Promise.allSettled( [ ...pending.current ] ).then( () => {} ),
        bare: () => sendsCamera.current && effectOffered( 'camera' ) && effectsChoice().camera !== 'none'
            && ( cameraEffectsUnavailable() || effectState( 'camera' ) === 'failed' )
    };
}

// The few glyphs the tiles draw, as the stream's icons are drawn: 24 × 24, stroked in the text's colour.
const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const GLYPHS = {
    none: <path { ...STROKE } d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8" />,
    blur: <path { ...STROKE } d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 20a5.5 5.5 0 0 1 11 0M3 6h.01M3 12h.01M3 18h.01M21 6h.01M21 12h.01M21 18h.01" />,
    plus: <path { ...STROKE } d="M12 5v14M5 12h14" />,
    close: <path { ...STROKE } d="m7 7 10 10M17 7 7 17" />,
    alert: <path { ...STROKE } d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V13M12 16.5v.01" />,
    sparkle: <path { ...STROKE } d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9zM18.5 3v3M17 4.5h3" />
} as const;

export type EffectGlyph = keyof typeof GLYPHS;

export function Glyph( props : { name : EffectGlyph } ){
    return <svg className="wplus-live-stream-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">{ GLYPHS[ props.name ] }</svg>;
}

const couldNotStart = () => __( 'The effect could not start on this device.', 'wordplus-live-stream' );

interface Option {
    id : CameraEffect;
    name : string;
    glyph? : EffectGlyph;
    thumb? : string;
    own? : boolean;
}

/**
 * What is behind the host: None, Blur, the pictures of WordPlus's catalog the site picked, the site's own, and where
 * the site lets hosts, those of their own this browser keeps, each with a way to remove it, and a tile to add one. The
 * chosen one is marked, with a spinner while its files load. A picture its server will not let WebGL draw (CORS) is
 * marked as not usable here instead of breaking the camera. While a background is on, a line says to turn it off where
 * the device struggles, and the effect's settings open under it.
 */
export function BackgroundChoice(){
    const { camera } = useEffectsChoice();
    const state = useEffectState( 'camera' );
    // A device that runs no background (WebGL drawn in software, or the model starting nowhere here) says so, and only
    // None can be chosen, as the call screens' device settings do.
    const unavailable = useCameraEffectsUnavailable();
    const own = useOwnBackgrounds();
    const allowed = ownBackgroundsAllowed();
    const [ refused, setRefused ] = useState<string[]>( [] );
    const [ adding, setAdding ] = useState( false );
    const [ problem, setProblem ] = useState( '' );
    const picker = useRef<HTMLInputElement>( null );
    const label = __( 'Background', 'wordplus-live-stream' );
    const yours = __( 'Your picture', 'wordplus-live-stream' );
    const unusable = __( 'This picture cannot be used here', 'wordplus-live-stream' );
    const removeLabel = __( 'Remove this picture', 'wordplus-live-stream' );
    const addLabel = __( 'Add your own picture', 'wordplus-live-stream' );

    const options : Option[] = [
        { id: 'none', name: __( 'None', 'wordplus-live-stream' ), glyph: 'none' },
        { id: 'blur', name: __( 'Blur', 'wordplus-live-stream' ), glyph: 'blur' },
        ...builtInBackgrounds().map( ( p ) => ( { id: `image:${ p.id }` as CameraEffect, name: p.name, thumb: p.thumb || p.url } ) ),
        ...siteBackgrounds().map( ( p ) => ( { id: `site:${ p.id }` as CameraEffect, name: p.name, thumb: p.thumb || p.url } ) ),
        ...own.map( ( p ) => ( { id: `own:${ p.id }` as CameraEffect, name: yours, thumb: p.url, own: true } ) )
    ];
    const current = options.some( ( o ) => o.id === camera ) ? camera : 'none';
    const on = current !== 'none';

    const add = async ( file : File | undefined ) => {
        if( ! file ) return;
        setProblem( '' );
        if( file.size > OWN_MAX_BYTES ){
            setProblem( __( 'This picture is too big. Try one under 40 MB.', 'wordplus-live-stream' ) );
            return;
        }
        setAdding( true );
        try {
            const id = await addOwnBackground( file );
            chooseEffects( { camera: `own:${ id }` } );
        } catch ( e ) {
            setProblem( __( 'This picture could not be opened. Try a JPEG, PNG or WebP.', 'wordplus-live-stream' ) );
        } finally {
            setAdding( false );
        }
    };

    const remove = ( id : CameraEffect ) => {
        if( camera === id ) chooseEffects( { camera: 'none' } );
        void removeOwnBackground( id.slice( 'own:'.length ) );
    };

    return (
        <div className="wplus-live-stream-effects">
            <div className="wplus-live-stream-effects__tiles" role="radiogroup" aria-label={ label }>
                { options.map( ( option ) => {
                    const chosen = current === option.id;
                    const busy = chosen && on && state === 'loading';
                    const blocked = unavailable && option.id !== 'none';
                    const off = blocked || refused.includes( option.id );
                    const name = off ? option.name + '. ' + ( blocked ? couldNotStart() : unusable ) : option.name;
                    return (
                        <div key={ option.id } className="wplus-live-stream-effects__tile" data-effect={ option.own ? 'own' : option.thumb ? 'picture' : option.id }
                            data-busy={ busy ? 1 : undefined } data-unusable={ off ? 1 : undefined }>
                            <button type="button" role="radio" aria-checked={ chosen } aria-label={ name } aria-disabled={ off || undefined }
                                className="wplus-live-stream-effects__pick" data-wplus-live-stream-tip={ name }
                                onClick={ () => { if( ! off ) chooseEffects( { camera: option.id } ); } }>
                                { option.glyph
                                    ? <Glyph name={ option.glyph } />
                                    : <img src={ option.thumb } alt="" loading="lazy" draggable={ false } crossOrigin="anonymous"
                                        onError={ () => setRefused( ( was ) => was.includes( option.id ) ? was : [ ...was, option.id ] ) } /> }
                                { off && <span className="wplus-live-stream-effects__mark"><Glyph name="alert" /></span> }
                                { busy && <span className="wplus-live-stream-effects__mark"><span className="wplus-live-stream-spinner wplus-live-stream-spinner--small" /></span> }
                            </button>
                            { option.own && (
                                <button type="button" className="wplus-live-stream-effects__remove" aria-label={ removeLabel } data-wplus-live-stream-tip={ removeLabel } onClick={ () => remove( option.id ) }>
                                    <Glyph name="close" />
                                </button>
                            ) }
                        </div>
                    );
                } ) }
                { allowed && (
                    <div className="wplus-live-stream-effects__tile" data-effect="add" data-busy={ adding ? 1 : undefined }>
                        <button type="button" className="wplus-live-stream-effects__pick" aria-label={ addLabel } data-wplus-live-stream-tip={ addLabel } disabled={ adding }
                            onClick={ () => picker.current?.click() }>
                            <Glyph name="plus" />
                            { adding && <span className="wplus-live-stream-effects__mark"><span className="wplus-live-stream-spinner wplus-live-stream-spinner--small" /></span> }
                        </button>
                    </div>
                ) }
            </div>
            { allowed && (
                <input ref={ picker } type="file" accept={ OWN_ACCEPT } hidden tabIndex={ -1 } className="wplus-live-stream-effects__file"
                    onChange={ ( e ) => {
                        const file = e.target.files?.[ 0 ];
                        e.target.value = '';
                        void add( file );
                    } } />
            ) }
            { allowed && own.length > 0 && ! ownBackgroundsLast() && (
                <p className="wplus-live-stream-setup__note">{ __( 'This browser does not keep your pictures, so they last until this page is closed.', 'wordplus-live-stream' ) }</p>
            ) }
            { problem && <p className="wplus-live-stream-setup__note wplus-live-stream-effects__warn" role="alert">{ problem }</p> }
            { ( unavailable || ( on && state === 'failed' ) ) && <p className="wplus-live-stream-setup__note wplus-live-stream-effects__warn" role="status">{ couldNotStart() }</p> }
            { on && state !== 'failed' && ! unavailable && (
                <p className="wplus-live-stream-setup__note">{ __( 'If your picture stutters or your device gets warm, turn the background off.', 'wordplus-live-stream' ) }</p>
            ) }
            { on && state === 'on' && effectsTunable() && <EffectSettings blur={ current === 'blur' } /> }
        </div>
    );
}

/**
 * The effect's settings, closed at first: a line that it may miss and what helps, and a slider for each of the host's
 * tunings, kept by the browser with the choice. Each slider's middle is the effect as it ships, and Reset goes back to
 * it. The picture above shows each move at once. Blur strength only while the room is blurred.
 */
function EffectSettings( props : { blur : boolean } ){
    const { tune } = useEffectsChoice();
    const [ open, setOpen ] = useState( false );
    const id = useId();
    const settings : Record<typeof TUNE_KEYS[ number ], { name : string, low : string, high : string }> = {
        outline: { name: __( 'Outline', 'wordplus-live-stream' ), low: __( 'Tighter', 'wordplus-live-stream' ), high: __( 'Wider', 'wordplus-live-stream' ) },
        edge: { name: __( 'Edge', 'wordplus-live-stream' ), low: __( 'Sharp', 'wordplus-live-stream' ), high: __( 'Soft', 'wordplus-live-stream' ) },
        steady: { name: __( 'Steadiness', 'wordplus-live-stream' ), low: __( 'Quick', 'wordplus-live-stream' ), high: __( 'Steady', 'wordplus-live-stream' ) },
        blur: { name: __( 'Blur strength', 'wordplus-live-stream' ), low: __( 'Light', 'wordplus-live-stream' ), high: __( 'Strong', 'wordplus-live-stream' ) }
    };
    const keys = TUNE_KEYS.filter( ( key ) => key !== 'blur' || props.blur );

    return (
        <div className="wplus-live-stream-effects__tune" data-open={ open ? 1 : undefined }>
            <button type="button" className="wplus-live-stream-effects__tune-head" aria-expanded={ open } aria-controls={ id } onClick={ () => setOpen( ! open ) }>
                <TuneGlyph />
                <span>{ __( 'Effect settings', 'wordplus-live-stream' ) }</span>
            </button>
            { open && (
                <div id={ id } className="wplus-live-stream-effects__sliders">
                    <p className="wplus-live-stream-setup__note">{ __( 'Edges not quite right? Even light and a plain wall behind you help, and these tune the effect for your room.', 'wordplus-live-stream' ) }</p>
                    { keys.map( ( key ) => (
                        <label key={ key } className="wplus-live-stream-effects__slider" data-tune={ key }>
                            <span className="wplus-live-stream-effects__slider-name">{ settings[ key ].name }</span>
                            <input type="range" min={ 0 } max={ 1 } step={ 0.05 } value={ tune[ key ] ?? 0.5 } aria-label={ settings[ key ].name }
                                onChange={ ( e ) => chooseEffects( { tune: { ...tune, [ key ]: Number( e.target.value ) } } ) } />
                            <span className="wplus-live-stream-effects__ends" aria-hidden="true"><span>{ settings[ key ].low }</span><span>{ settings[ key ].high }</span></span>
                        </label>
                    ) ) }
                    { Object.keys( tune ).length > 0 && (
                        <button type="button" className="wplus-live-stream-button wplus-live-stream-button--quiet wplus-live-stream-effects__reset" onClick={ () => chooseEffects( { tune: {} } ) }>
                            { __( 'Reset', 'wordplus-live-stream' ) }
                        </button>
                    ) }
                </div>
            ) }
        </div>
    );
}

function TuneGlyph(){
    return (
        <svg className="wplus-live-stream-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
            <path { ...STROKE } d="M4 7h9M17 7h3M4 17h3M11 17h9" />
            <circle { ...STROKE } cx="15" cy="7" r="2" />
            <circle { ...STROKE } cx="9" cy="17" r="2" />
        </svg>
    );
}

/**
 * AI noise removal, a switch the browser keeps: what it adds to what the browser does anyway, and what to do where the
 * device struggles with it. Off, and said so, while the microphone goes out in original sound, as it hears.
 */
export function NoiseChoice( props : { original : boolean } ){
    const { noise } = useEffectsChoice();
    const state = useEffectState( 'noise' );
    const on = noise && ! props.original;

    return (
        <div className="wplus-live-stream-effects wplus-live-stream-effects--noise">
            <label className="wplus-live-stream-switch">
                <input type="checkbox" role="switch" checked={ on } disabled={ props.original } onChange={ ( e ) => chooseEffects( { noise: e.target.checked } ) } />
                <span className="wplus-live-stream-switch__track" aria-hidden="true" />
                { __( 'AI noise removal', 'wordplus-live-stream' ) }
                { on && state === 'loading' && <span className="wplus-live-stream-spinner wplus-live-stream-spinner--small wplus-live-stream-effects__loading" /> }
            </label>
            <p className="wplus-live-stream-setup__note">{ props.original
                ? __( 'Off while original sound is on, which sends the microphone as it hears.', 'wordplus-live-stream' )
                : __( 'Takes out typing, fans and other sounds the browser leaves in. If your voice breaks up or your device gets warm, turn it off.', 'wordplus-live-stream' ) }</p>
            { on && state === 'failed' && <p className="wplus-live-stream-setup__note wplus-live-stream-effects__warn" role="status">{ couldNotStart() }</p> }
        </div>
    );
}

/** The background as a row of the studio's settings, where it is offered and the camera is on. */
export function BackgroundRow( props : { effects : StudioEffects, camera : boolean } ){
    if( ! props.effects.camera || ! props.camera ) return null;

    return (
        <div className="wplus-live-stream-setup__row wplus-live-stream-setup__row--top">
            <span className="wplus-live-stream-setup__label">{ __( 'Background', 'wordplus-live-stream' ) }</span>
            <div className="wplus-live-stream-setup__field wplus-live-stream-setup__field--stack">
                <BackgroundChoice />
            </div>
        </div>
    );
}

/** AI noise removal as a row of the studio's settings, where it is offered and the microphone is on. */
export function NoiseRow( props : { effects : StudioEffects, microphone : boolean, original : boolean } ){
    if( ! props.effects.noise || ! props.microphone ) return null;

    return (
        <div className="wplus-live-stream-setup__row wplus-live-stream-setup__row--top">
            <span className="wplus-live-stream-setup__label">{ _x( 'Noise', 'the studio row of AI noise removal', 'wordplus-live-stream' ) }</span>
            <div className="wplus-live-stream-setup__field wplus-live-stream-setup__field--stack">
                <NoiseChoice original={ props.original } />
            </div>
        </div>
    );
}

/** Whether the studio has an effect to offer for the devices on now. */
export const effectsShown = ( effects : StudioEffects, camera : boolean, microphone : boolean ) => ( effects.camera && camera ) || ( effects.noise && microphone );

/**
 * Both while live, from the bar's Effects: a line that each change goes out at once, then the rows. Nothing where
 * neither is offered for the devices on.
 */
export function EffectRows( props : { effects : StudioEffects, camera : boolean, microphone : boolean, original : boolean, children? : ReactNode } ){
    if( ! effectsShown( props.effects, props.camera, props.microphone ) ) return null;

    return (
        <div className="wplus-live-stream-setup wplus-live-stream-effects-panel">
            <p className="wplus-live-stream-controls__hint">{ __( 'Everyone watching sees and hears each change at once.', 'wordplus-live-stream' ) }</p>
            <BackgroundRow effects={ props.effects } camera={ props.camera } />
            <NoiseRow effects={ props.effects } microphone={ props.microphone } original={ props.original } />
        </div>
    );
}
