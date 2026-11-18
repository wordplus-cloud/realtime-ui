import {
    cloneElement, createContext, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef,
    type MutableRefObject, type ReactElement,
} from "react";
import { _x } from "../../inc/globals.ts";
import { host } from "../../host.ts";
import type { CallContextInterface } from "./context.ts";
import {
    ariaKeys, isSpace, keyName, onControl, readKeyboardLayout, shortcutOf, shortcutOfClass, talkKeyAt, typingIn, type CallShortcut,
} from "../../inc/calls/keys.ts";

/**
 * A dock control the keys press: its own onClick, so a key does what the button does (a hand raised through its
 * spinner, the microphone a moderator holds reminding of it), and its label. `talk`: the microphone is off and the
 * user may turn it on, where holding Space talks.
 */
export interface DockAction {
    run: () => unknown;
    label: string;
    talk?: boolean;
}

export type DockActions = Partial<Record<CallShortcut, DockAction>>;

export interface CallKeysValue {
    /** Whether the keys listen (CallScreen's `shortcuts`). The dock's actions are kept either way. */
    on: boolean;
    /** What the dock offers now, by shortcut: written by the dock (useDockKeys), read by the keys and the picture-in-picture window. */
    actions: MutableRefObject<DockActions>;
    /** Where Space talks besides the call itself: the picture-in-picture window's document. */
    roots: MutableRefObject<Set<Node>>;
    /**
     * The keys of controls outside the dock's items (useKeyAction): More's own button, Add Person at the top of
     * Participants, the recording's Start and Stop. Each says what it does now, or nothing while its control isn't
     * shown. The dock's own come first.
     */
    others: MutableRefObject<Map<CallShortcut, () => DockAction | undefined>>;
}

export const CallKeysContext = createContext<CallKeysValue | null>( null );

interface Listener {
    action( shortcut: CallShortcut ): DockAction | undefined;
    talk( down: boolean, target?: EventTarget | null, pointed?: EventTarget | null ): boolean;
    talking(): boolean;
}

// One call screen listens at a time, the one drawn last: a second screen on the page (a preview of the call in a
// settings page) takes the keys while it is there and gives them back as it goes.
const screens: Listener[] = [];
const top = () => screens[ screens.length - 1 ];

let leaving = false;

/**
 * Leaving asks first, once at a time for the page. Answered Leave, it is the dock's control as the call has it then
 * (Cancel while it rang, End Call once answered), from whichever screen listens by then: an app's dialog can draw the
 * call anew under it, and the screen that asked is gone. Else the control that was there when the key was pressed.
 */
async function leave( asked: DockAction ) {
    if ( leaving ) return;
    leaving = true;
    try {
        const yes = await host().confirm( {
            title: _x( 'Leave the call?', 'Call Shortcuts', 'bp-better-messages' ),
            confirm: _x( 'Leave', 'Call Shortcuts', 'bp-better-messages' ),
            danger: true,
        } );
        if ( yes ) ( top()?.action( 'leave' ) ?? asked ).run();
    } finally {
        leaving = false;
    }
}

const target = ( event: Event ) => event.composedPath?.()[ 0 ] ?? event.target;

// Where the focus came from. A control the pointer pressed keeps the focus, and its own Space pressed it again where
// the user held Space to talk: the microphone clicked off and then held Space turned it on for good. A focus that
// follows a press of the pointer, before any key, is the pointer's (a menu's first row too); one a key moved is not.
let pointing = false;
let pointed: EventTarget | null = null;

function onPointerDown() {
    pointing = true;
}

function onFocusIn( event: FocusEvent ) {
    pointed = pointing ? target( event ) : null;
}

const talkKey = ( event: KeyboardEvent ) => isSpace( event ) && ! event.altKey && ! event.ctrlKey && ! event.metaKey && ! event.shiftKey;

// Space, heard before the page: a control the pointer left the focus on would press itself with it first.
function onSpace( event: KeyboardEvent ) {
    pointing = false;
    const screen = top();
    if ( ! screen || ! talkKey( event ) || event.defaultPrevented || event.isComposing || event.key === 'Process' ) return;
    const at = target( event );
    if ( typingIn( at ) ) return;

    // A held key repeats: the first press turned the microphone on, the rest keep the page from scrolling.
    if ( ! ( event.repeat ? screen.talking() : screen.talk( true, at, pointed ) ) ) return;
    event.preventDefault();
    if ( onControl( at ) ) {
        // The control is not pressed, and lets the focus go: a key would ring it, as a control the keyboard reached.
        event.stopPropagation();
        ( at as HTMLElement | null )?.blur?.();
    }
}

function onKeyDown( event: KeyboardEvent ) {
    const screen = top();
    if ( ! screen || talkKey( event ) || event.defaultPrevented || event.isComposing || event.key === 'Process' ) return;
    if ( typingIn( target( event ) ) ) return;

    const shortcut = shortcutOf( event );
    const action = shortcut && screen.action( shortcut );
    if ( ! action ) return;
    // A Mac's Option types a character of its own, and Firefox on Windows opens a menu: neither, for a shortcut.
    event.preventDefault();
    if ( event.repeat ) return;
    if ( shortcut === 'leave' ) void leave( action );
    else action.run();
}

function onKeyUp( event: KeyboardEvent ) {
    if ( isSpace( event ) && top()?.talk( false ) ) event.preventDefault();
}

// Space let go while the page was away (another window took the focus) never comes as a key: the microphone goes off
// as the page loses the focus.
function onAway() {
    top()?.talk( false );
}

const listened = new Map<Window, number>();

/** The keys of the call screen on top, heard in `win` too (the picture-in-picture window), until the returned call. */
export function listenIn( win: Window ): () => void {
    const count = listened.get( win ) ?? 0;
    listened.set( win, count + 1 );
    if ( count === 0 ) {
        win.addEventListener( 'pointerdown', onPointerDown, true );
        win.addEventListener( 'focusin', onFocusIn, true );
        win.addEventListener( 'keydown', onSpace, true );
        win.addEventListener( 'keydown', onKeyDown );
        win.addEventListener( 'keyup', onKeyUp );
        win.addEventListener( 'blur', onAway );
    }

    return () => {
        const left = ( listened.get( win ) ?? 1 ) - 1;
        if ( left > 0 ) {
            listened.set( win, left );
            return;
        }
        listened.delete( win );
        win.removeEventListener( 'pointerdown', onPointerDown, true );
        win.removeEventListener( 'focusin', onFocusIn, true );
        win.removeEventListener( 'keydown', onSpace, true );
        win.removeEventListener( 'keydown', onKeyDown );
        win.removeEventListener( 'keyup', onKeyUp );
        win.removeEventListener( 'blur', onAway );
    };
}

/** Space held to talk: `letGo` once it is up, `answered` once the call's enableMic has. */
interface Held {
    letGo: boolean;
    answered: boolean;
}

/**
 * Space let go: the microphone goes off once the call has drawn it on, by the call's disableMic of then. One from before
 * it opened knows of no microphone (Better Messages' does nothing then), and an enableMic answers before the call draws
 * the microphone it opened, so a press shorter than a microphone takes to open left it on. A microphone that never
 * opened leaves nothing to turn off.
 */
function letGo( pushed: MutableRefObject<Held | null>, call: CallContextInterface ) {
    const held = pushed.current;
    if ( ! held?.letGo ) return;
    if ( call.myMicrophoneTrack ) {
        pushed.current = null;
        void call.disableMic();
    } else if ( held.answered && ! call.myMicrophoneTrackRef?.current ) {
        pushed.current = null;
    }
}

function addScreen( screen: Listener ): () => void {
    screens.push( screen );
    const stop = listenIn( window );
    readKeyboardLayout();

    return () => {
        const at = screens.indexOf( screen );
        if ( at >= 0 ) screens.splice( at, 1 );
        stop();
    };
}

/**
 * The keys of a call (CallScreen): Alt and a letter press the dock's controls, held Space talks while the microphone
 * is off. Each control's tooltip names its key (useDockKeys), the microphone's off Space too: there is no list of them
 * apart. The value is the dock's and the picture-in-picture window's (CallKeysContext).
 */
export function useCallKeys( call: CallContextInterface, on: boolean ): { value: CallKeysValue } {
    const actions = useRef<DockActions>( {} );
    const roots = useRef( new Set<Node>() );
    const others = useRef( new Map<CallShortcut, () => DockAction | undefined>() );
    const latest = useRef( call );
    latest.current = call;
    const pushed = useRef<Held | null>( null );

    // Let go before the microphone was on, it goes off as the call draws it on.
    useEffect( () => letGo( pushed, latest.current ), [ call.myMicrophoneTrack ] );

    useEffect( () => {
        if ( ! on || typeof window === 'undefined' ) return;

        return addScreen( {
            action: ( shortcut ) => actions.current[ shortcut ] ?? others.current.get( shortcut )?.(),
            talk: ( down, at, pointer ) => {
                const held = pushed.current;
                if ( down ) {
                    // Pressed again before the microphone was on: it stays on.
                    if ( held ) {
                        held.letGo = false;
                        return true;
                    }
                    if ( ! actions.current.mic?.talk ) return false;
                    if ( ! talkKeyAt( at, [ latest.current.wrapper?.current, ...roots.current ], pointer ) ) return false;
                    const now: Held = { letGo: false, answered: false };
                    pushed.current = now;
                    void Promise.resolve( latest.current.enableMic() ).catch( () => {} ).then( () => {
                        now.answered = true;
                        letGo( pushed, latest.current );
                    } );
                    return true;
                }

                if ( ! held ) return false;
                held.letGo = true;
                letGo( pushed, latest.current );
                return true;
            },
            talking: () => !! pushed.current,
        } );
    }, [ on ] );

    const value = useMemo<CallKeysValue>( () => ( { on, actions, roots, others } ), [ on ] );

    return { value };
}

/**
 * The key of a control drawn outside the dock's items: `get` says what it does now, or nothing while the control isn't
 * shown, read as the key is pressed. Gives the key as the keyboard shows it and for aria-keyshortcuts while the keys
 * listen, for the control to name it, else null.
 */
export function useKeyAction( shortcut: CallShortcut, get: () => DockAction | undefined ): { name: string, aria: string } | null {
    const keys = useContext( CallKeysContext );
    const latest = useRef( get );
    latest.current = get;

    useLayoutEffect( () => {
        if ( ! keys ) return;
        const read = () => latest.current();
        keys.others.current.set( shortcut, read );
        return () => {
            if ( keys.others.current.get( shortcut ) === read ) keys.others.current.delete( shortcut );
        };
    }, [ keys, shortcut ] );

    return keys?.on ? { name: keyName( shortcut ), aria: ariaKeys( shortcut ) } : null;
}

/** A shortcut as a menu row shows it, at the row's end: nothing while the keys don't listen. */
export function useKeyHint( shortcut: CallShortcut | undefined ): { name: string, aria: string } | null {
    const keys = useContext( CallKeysContext );
    return keys?.on && shortcut ? { name: keyName( shortcut ), aria: ariaKeys( shortcut ) } : null;
}

// A dock item as the layouts write it: <Tooltip content="Disable Microphone"><span className="wplus-disable-mic" onClick>.
// While the keys listen, `data-wplus-label` and `data-wplus-key` carry its label and key apart, for More's row to show
// the label with the key as a hint at its end (folding-dock.tsx), where the tooltip has both in one line.
type DockButton = ReactElement<{ className?: string, onClick?: () => unknown, 'aria-label'?: string, 'data-wplus-label'?: string, 'data-wplus-key'?: string }>;

function dockItem( el: ReactElement ): { label: string, button: DockButton } | null {
    const props = el.props as { content?: unknown, children?: unknown };
    if ( typeof props.content !== 'string' || ! isValidElement( props.children ) ) return null;
    return { label: props.content, button: props.children as DockButton };
}

/**
 * The dock's keys (call-dock.tsx), on the row and the sheet as they are drawn (`mark`): each control a shortcut presses
 * is kept for the keys, in More too, and while they listen its tooltip names the key and a screen reader hears it
 * (aria-keyshortcuts). The microphone's, while it is off and the user may turn it on, names held Space too.
 */
export function useDockKeys() {
    const keys = useContext( CallKeysContext );
    const found = useRef<DockActions>( {} );

    useLayoutEffect( () => {
        if ( keys ) keys.actions.current = found.current;
    } );
    useLayoutEffect( () => () => {
        if ( keys ) keys.actions.current = {};
    }, [] );

    const mark = ( items: ReactElement[] ): ReactElement[] => {
        found.current = {};
        return items.map( ( el ) => {
            const item = dockItem( el );
            const className = item?.button.props.className;
            if ( ! item ) return el;

            const shortcut = shortcutOfClass( className );
            if ( ! shortcut || typeof item.button.props.onClick !== 'function' ) return el;

            const run = item.button.props.onClick;
            const talk = shortcut === 'mic' && ( className ?? '' ).split( /\s+/ ).includes( 'wplus-enable-mic' );
            found.current[ shortcut ] = { run: () => run(), label: item.label, talk };
            if ( ! keys?.on ) return el;

            const named = keyName( shortcut ) + ( talk ? ', ' + _x( 'hold Space to talk', 'Call Shortcuts', 'bp-better-messages' ) : '' );
            return cloneElement( el as ReactElement<{ content: string }>, { content: item.label + ' (' + named + ')' },
                cloneElement( item.button, {
                    'aria-label': item.button.props[ 'aria-label' ] ?? item.label,
                    'aria-keyshortcuts': ariaKeys( shortcut ),
                    'data-wplus-label': item.label,
                    'data-wplus-key': keyName( shortcut ),
                } as Partial<DockButton[ 'props' ]> ) );
        } );
    };

    return { mark };
}
