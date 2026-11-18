// A call's keyboard shortcuts: which key does what, and when a key belongs to the page instead (typing, a focused
// button). Alt (Option on a Mac) and a letter, as Zoom has them: no browser binds them but Firefox on Windows, whose
// menu bar a call takes over while it is on, and screen readers pass them through, where single letters are their
// own quick keys in a page and Ctrl or Cmd with a letter is the browser's. The call screen listens (call-keys.tsx).
// Every control of the dock and of More has one, Zoom's letter where Zoom has one. Alt+D is the address bar in Chrome
// and Edge, so no control has it. Alt+E and Alt+F open their menu on Windows and Linux, and Firefox's menu bar has its
// letters, but a call that listens takes them, as a page that edits documents takes Alt+F.

export type CallShortcut = 'mic' | 'camera' | 'hand' | 'screen' | 'people' | 'settings' | 'leave' | 'chat' | 'expand'
    | 'fullscreen' | 'host' | 'more' | 'pip' | 'add' | 'answer' | 'switchCamera' | 'record';

export const SHORTCUTS: readonly CallShortcut[] = [
    'mic', 'camera', 'hand', 'screen', 'people', 'settings', 'leave', 'chat', 'expand', 'fullscreen', 'host', 'more', 'pip',
    'add', 'answer', 'switchCamera', 'record',
];

/** The letter of each, with Alt. */
export const SHORTCUT_LETTERS: Readonly<Record<CallShortcut, string>> = {
    mic: 'a',
    camera: 'v',
    hand: 'y',
    screen: 's',
    people: 'u',
    settings: 'c',
    leave: 'q',
    chat: 'h',
    expand: 'e',
    fullscreen: 'f',
    host: 'm',
    more: 'o',
    pip: 'p',
    add: 'i',
    answer: 'j',
    switchCamera: 'b',
    record: 'r',
};

/**
 * A dock control by its class (the markup 2.0 emitted, which the specs read too), and the shortcut that presses it,
 * the first that matches: Collapse is also .wplus-fs-disable, which alone is Exit Full Screen.
 */
const DOCK_CLASSES: ReadonlyArray<[ string, CallShortcut ]> = [
    [ 'wplus-enable-mic', 'mic' ],
    [ 'wplus-disable-mic', 'mic' ],
    [ 'wplus-mic-locked', 'mic' ],
    [ 'wplus-enable-video', 'camera' ],
    [ 'wplus-disable-video', 'camera' ],
    [ 'wplus-raise-hand', 'hand' ],
    [ 'wplus-lower-hand', 'hand' ],
    [ 'wplus-switch-share-screen', 'screen' ],
    [ 'wplus-call-people-toggle', 'people' ],
    [ 'wplus-configure-call', 'settings' ],
    [ 'wplus-exit-room', 'leave' ],
    [ 'wplus-cancel', 'leave' ],
    [ 'wplus-toggle-chat', 'chat' ],
    [ 'wplus-fs-enable', 'expand' ],
    [ 'wplus-fs-collapse', 'expand' ],
    [ 'wplus-fs-screen', 'fullscreen' ],
    [ 'wplus-fs-disable', 'fullscreen' ],
    [ 'wplus-host-controls', 'host' ],
    [ 'wplus-pic-in-pic', 'pip' ],
    [ 'wplus-add-person', 'add' ],
    [ 'wplus-answer', 'answer' ],
    [ 'wplus-switch-camera-video', 'switchCamera' ],
];

export function shortcutOfClass( className: string | undefined ): CallShortcut | null {
    if ( ! className ) return null;
    const classes = className.split( /\s+/ );
    return DOCK_CLASSES.find( ( [ cls ] ) => classes.includes( cls ) )?.[ 1 ] ?? null;
}

export interface KeyLike {
    key: string;
    code: string;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
}

interface LayoutMap {
    get( code: string ): string | undefined;
}

let layout: LayoutMap | null = null;

/**
 * Reads the keyboard's layout where the browser says it (Chrome and Edge), so Alt+A is the key labelled A on an AZERTY
 * keyboard too. Elsewhere a Mac's Option, which types a character of its own (å), leaves only the key's place, read as
 * on a US keyboard.
 */
export function readKeyboardLayout(): void {
    const keyboard = typeof navigator === 'undefined' ? null : ( navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } } ).keyboard;
    try {
        keyboard?.getLayoutMap?.().then( ( map ) => { layout = map; }, () => {} );
    } catch {}
}

const LATIN = /^[a-z]$/i;

/**
 * The Latin letter a key stands for: the one it types where that is a letter (Windows and Linux with Alt), else the
 * one on its label in the layout, else its place. A key typing another script (Cyrillic) is the Latin letter of its place.
 */
export function letterOf( event: Pick<KeyLike, 'key' | 'code'>, map: LayoutMap | null = layout ): string | null {
    if ( LATIN.test( event.key ) ) return event.key.toLowerCase();
    const place = /^Key([A-Z])$/.exec( event.code );
    if ( ! place ) return null;
    const labelled = map?.get( event.code );
    return ( labelled && LATIN.test( labelled ) ? labelled : place[ 1 ] ).toLowerCase();
}

/** The shortcut a key press is, if any: Alt and a letter, nothing else held (AltGr is Ctrl and Alt on Windows). */
export function shortcutOf( event: KeyLike, map?: LayoutMap | null ): CallShortcut | null {
    if ( ! event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ) return null;
    const letter = letterOf( event, map );
    return SHORTCUTS.find( ( shortcut ) => SHORTCUT_LETTERS[ shortcut ] === letter ) ?? null;
}

export function isSpace( event: Pick<KeyLike, 'key' | 'code'> ): boolean {
    return event.code === 'Space' || event.key === ' ';
}

export function isMac(): boolean {
    if ( typeof navigator === 'undefined' ) return false;
    const platform = ( navigator as Navigator & { userAgentData?: { platform?: string } } ).userAgentData?.platform || navigator.platform || '';
    return /mac|iphone|ipad|ipod/i.test( platform );
}

/** A shortcut as the user's keyboard shows it: ⌥A on a Mac, Alt+A elsewhere. */
export function keyName( shortcut: CallShortcut, mac = isMac() ): string {
    const letter = SHORTCUT_LETTERS[ shortcut ].toUpperCase();
    return mac ? '⌥' + letter : 'Alt+' + letter;
}

/** As aria-keyshortcuts writes it, Alt for Option too. */
export function ariaKeys( shortcut: CallShortcut ): string {
    return 'Alt+' + SHORTCUT_LETTERS[ shortcut ].toUpperCase();
}

// An element by its kind, not by `instanceof`: an element of the picture-in-picture window is another window's.
const elementOf = ( target: EventTarget | null | undefined ): Element | null =>
    target && ( target as Node ).nodeType === 1 ? target as Element : null;

const FIELD_ROLES = '[role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
const NOT_TYPED = /^(button|submit|reset|checkbox|radio|range|color|file|image|hidden)$/i;

/**
 * Whether a key there is typing: a field, the composer, anything editable. A shortcut never fires there. A <select> is
 * none: the focus stays in the one a device was just chosen from, and the shortcuts, all with Alt, type nothing in it.
 */
export function typingIn( target: EventTarget | null | undefined ): boolean {
    const element = elementOf( target );
    if ( ! element ) return false;
    const tag = element.tagName;
    if ( tag === 'TEXTAREA' ) return true;
    if ( tag === 'INPUT' ) return ! NOT_TYPED.test( ( element as HTMLInputElement ).type );
    if ( ( element as HTMLElement ).isContentEditable ) return true;
    return !! element.closest( FIELD_ROLES );
}

const PRESSABLE = 'button, a[href], input, textarea, select, summary, label, audio[controls], video[controls], [role="button"], [role="link"], '
    + '[role="checkbox"], [role="switch"], [role="radio"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], '
    + '[role="option"], [role="tab"], [role="slider"], [role="treeitem"], [role="gridcell"], ' + FIELD_ROLES;

/**
 * Whether Space there is the talk key: on the call (or in its picture-in-picture window) but not on a control the
 * keyboard reached, whose own Space presses it, or with nothing focused. A control the pointer pressed (`pointed`) keeps
 * the focus too, and its Space would press it again where the user holds Space to talk: on the call, Space talks there.
 * Elsewhere on the page Space scrolls and presses as it always does.
 */
export function talkKeyAt( target: EventTarget | null | undefined, calls: ReadonlyArray<Node | null | undefined>, pointed: EventTarget | null = null ): boolean {
    const element = elementOf( target );
    if ( ! element ) return true;
    if ( element.closest( PRESSABLE ) && element !== pointed ) return false;
    const document = element.ownerDocument;
    if ( element === document.body || element === document.documentElement ) return true;
    return calls.some( ( call ) => !! call && call.contains( element ) );
}

/** Whether a key there lands on a control or a field, which Space presses or types in. */
export function onControl( target: EventTarget | null | undefined ): boolean {
    return !! elementOf( target )?.closest( PRESSABLE );
}
