import { fireEvent } from '@testing-library/react';

// A screen in a shadow root, as the elements script draws one (src/elements.tsx): a host in the page, its open shadow
// root, and the div React renders into.
//
// A browser retargets an event that leaves a shadow root (DOM, "retarget"): a listener on the document or the window
// sees the root's host as its target, and only composedPath() names what was pressed. happy-dom keeps the target as
// dispatched for every listener, so a check that reads `event.target` there passes in a test and fails in a browser.
// retargetAsBrowsers() gives `Event.prototype.target` the browser's rule until the function it returns is called.

/** A host in the page with an open shadow root, and the element to render in it. remove() takes the host away. */
export function shadowRoot(): { host: HTMLElement, container: HTMLDivElement, remove: () => void } {
    const host = document.body.appendChild( document.createElement( 'call-screen' ) );
    const container = document.createElement( 'div' );
    container.className = 'realtime-calls';
    host.attachShadow( { mode: 'open' } ).append( container );
    return { host, container, remove: () => host.remove() };
}

/** Event.prototype.target as a browser gives it to each listener; the function returned puts happy-dom's back. */
export function retargetAsBrowsers(): () => void {
    const own = Object.getOwnPropertyDescriptor( Event.prototype, 'target' )!;
    Object.defineProperty( Event.prototype, 'target', {
        configurable: true,
        get( this: Event ) {
            const target = own.get!.call( this ) as EventTarget | null;
            return this.currentTarget ? retarget( target, this.currentTarget ) : target;
        },
    } );
    return () => Object.defineProperty( Event.prototype, 'target', own );
}

// While what was pressed is in a shadow root the listener is outside of, its host stands for it.
function retarget( target: EventTarget | null, listener: EventTarget ): EventTarget | null {
    let node = target;
    while ( node instanceof Node ) {
        const root = node.getRootNode();
        if ( ! ( root instanceof ShadowRoot ) || holds( root, listener ) ) return node;
        node = root.host;
    }
    return node;
}

// Whether the listener is in the root, or in a shadow root inside it.
function holds( root: ShadowRoot, listener: EventTarget ): boolean {
    let node: Node | null = listener instanceof Node ? listener : null;
    while ( node ) {
        if ( node === root ) return true;
        node = node.parentNode ?? ( node instanceof ShadowRoot ? node.host : null );
    }
    return false;
}

/**
 * A press of the pointer on the element as a browser sends it: down, then up, then the click, each drawn before the
 * next, as a browser draws between them. Never inside act(), which holds what each changes until all were sent: a
 * menu that a press closes would still be there for the click.
 */
export function press( element: Element ): void {
    fireEvent.pointerDown( element );
    fireEvent.mouseDown( element );
    fireEvent.pointerUp( element );
    fireEvent.mouseUp( element );
    fireEvent.click( element );
}
