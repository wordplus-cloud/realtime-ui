import { expect, it, vi } from 'vitest';

// `<call-spot>`: a call in the page, in place of the window in the corner. A page of its own, as the elements define
// themselves once per window.

class Emitter {
    private handlers = new Map<string, Array<( ...args: any[] ) => void>>();
    on( event: string, fn: ( ...args: any[] ) => void ) {
        this.handlers.set( event, [ ...( this.handlers.get( event ) ?? [] ), fn ] );
        return this;
    }
    off( event: string, fn?: ( ...args: any[] ) => void ) {
        this.handlers.set( event, ( this.handlers.get( event ) ?? [] ).filter( ( f ) => fn && f !== fn ) );
        return this;
    }
    fire( event: string, ...args: any[] ) {
        for ( const fn of this.handlers.get( event ) ?? [] ) fn( ...args );
    }
}

const settle = () => new Promise( ( done ) => setTimeout( done, 20 ) );

it( 'shows a call in its <call-spot>, its children until then, and the call back in the window when the spot leaves', async () => {
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn( async () => ( { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } ) ), getDisplayMedia: vi.fn(), enumerateDevices: vi.fn( async () => [] ) },
    } );
    const placed = Object.assign( new Emitter(), {
        id: 'call-1', name: 'match:34:42', type: 'video', role: 'caller', peer: { user: 34, info: { name: 'Ann' } }, state: 'connected', endReason: null,
        remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: { camera: false, microphone: false, screen_share: false, screen_share_audio: false }, quality: 'unknown' },
        setTrack: vi.fn(), end: vi.fn(),
    } );
    const calls = Object.assign( new Emitter(), { start: vi.fn( async () => placed ), group: vi.fn(), people: vi.fn( async () => [] ) } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt: { user: '42' }, calls } ) };

    // A spot on the page before the screens start: it takes its calls once they do.
    document.body.insertAdjacentHTML( 'beforeend', '<call-spot call="match:{a}:{b}" style="height: 420px"><p>The chat</p></call-spot><call-spot call="office:{id}"></call-spot>' );
    const elements = await import( '../src/elements.tsx' );
    expect( elements.start() ).toBe( true );
    const [ spot, empty ] = [ ...document.querySelectorAll( 'call-spot' ) ];
    expect( empty.hasAttribute( 'data-empty' ) ).toBe( true );
    expect( spot.hasAttribute( 'data-empty' ) ).toBe( false );

    await elements.place( 'match:34:42', 34, 'video', { name: 'Ann' } );
    await settle();
    const window = spot.shadowRoot!.querySelector( '.realtime-call-spot .realtime-call-window' );
    expect( window?.querySelector( '.wplus-private-call' ) ).not.toBeNull();
    expect( spot.getAttribute( 'data-call' ) ).toBe( 'match:34:42' );
    expect( empty.hasAttribute( 'data-call' ) ).toBe( false );
    const started = placed.setTrack.mock.calls.length;

    // The spot leaves the page: the call goes on in the window of <call-screen>, the same element.
    spot.remove();
    await settle();
    expect( document.querySelector( 'call-screen' )!.shadowRoot!.querySelector( '.realtime-call-window' ) ).toBe( window );
    expect( placed.end ).not.toHaveBeenCalled();
    expect( placed.setTrack.mock.calls.length ).toBe( started );

    // Back on the page: the call comes back to it.
    document.body.append( spot );
    await settle();
    expect( spot.shadowRoot!.querySelector( '.realtime-call-window' ) ).toBe( window );
    expect( spot.getAttribute( 'data-call' ) ).toBe( 'match:34:42' );
} );
