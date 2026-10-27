import { expect, it, vi } from 'vitest';

// `<call-spot join>`: the group call it names, joined as the spot comes onto the page. A page of its own, as the
// elements define themselves once per window.

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

it( 'joins the group call of a <call-spot join> as the spot comes onto the page, and not again once left', async () => {
    // The camera and microphone as the browser gives them, for a video call joined.
    const track = { stop: vi.fn(), getSettings: () => ( { deviceId: 'cam-1' } ), addEventListener: () => {} };
    const stream = ( asked: MediaStreamConstraints ) => {
        const audio = asked.audio ? [ track ] : [];
        const video = asked.video ? [ track ] : [];
        return { getTracks: () => [ ...audio, ...video ], getAudioTracks: () => audio, getVideoTracks: () => video };
    };
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn( async ( asked: MediaStreamConstraints ) => stream( asked ) ), getDisplayMedia: vi.fn(), enumerateDevices: vi.fn( async () => [] ) },
    } );
    const group = Object.assign( new Emitter(), { state: 'connected', people: () => [], setTrack: vi.fn( async () => {} ), leave: vi.fn() } );
    const calls = Object.assign( new Emitter(), { start: vi.fn(), group: vi.fn( async () => group ), people: vi.fn( async () => [] ) } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt: { user: '42' }, calls } ) };

    // On the page before the screens start: joined once they do. A pattern's spot joins nothing, as it names no one call.
    document.body.insertAdjacentHTML( 'beforeend', '<call-spot call="meeting:daily" join="video"><p>The daily meeting</p></call-spot><call-spot call="meeting:{id}" join></call-spot>' );
    const elements = await import( '../src/elements.tsx' );
    expect( elements.start() ).toBe( true );
    await settle();
    expect( calls.group.mock.calls ).toEqual( [ [ 'meeting:daily', { type: 'video' } ] ] );
    const spot = document.querySelector( 'call-spot' )!;
    expect( spot.getAttribute( 'data-call' ) ).toBe( 'meeting:daily' );
    // In with the camera and the microphone off: the browser asked for neither.
    expect( navigator.mediaDevices.getUserMedia ).not.toHaveBeenCalled();
    expect( group.setTrack ).not.toHaveBeenCalled();

    // Left: nothing joins it again while the spot stays, though its attributes change.
    ( spot.shadowRoot!.querySelector( '.bm-exit-room' ) as HTMLElement ).click();
    await settle();
    expect( group.leave ).toHaveBeenCalled();
    expect( spot.hasAttribute( 'data-call' ) ).toBe( false );
    spot.setAttribute( 'join', 'audio' );
    await settle();
    expect( calls.group ).toHaveBeenCalledTimes( 1 );
    spot.remove();

    // `join-with` turns on what it names as it joins: here the microphone alone, the camera left off.
    document.body.insertAdjacentHTML( 'beforeend', '<call-spot call="meeting:team" join="video" join-with="microphone"></call-spot>' );
    await settle();
    expect( calls.group ).toHaveBeenLastCalledWith( 'meeting:team', { type: 'video' } );
    expect( navigator.mediaDevices.getUserMedia ).toHaveBeenCalledTimes( 1 );
    expect( navigator.mediaDevices.getUserMedia ).toHaveBeenCalledWith( { audio: true } );
} );
