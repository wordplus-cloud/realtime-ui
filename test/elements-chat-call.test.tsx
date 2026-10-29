import { expect, it, vi } from 'vitest';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

// `<chat-room to call>`: the chat with the other person on top and their call in it. A page of its own, as the
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

it( 'shows the other person on top of <chat-room>, and its call in it once placed from there', async () => {
    Object.defineProperty( navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: vi.fn( async () => ( { getTracks: () => [], getAudioTracks: () => [], getVideoTracks: () => [] } ) ), getDisplayMedia: vi.fn(), enumerateDevices: vi.fn( async () => [] ) },
    } );
    const placed = Object.assign( new Emitter(), {
        id: 'call-1', name: 'chat:34:42', type: 'video', role: 'caller', peer: { user: 42, info: { name: 'Ben' } }, state: 'connected', endReason: null,
        remote: { camera: null, microphone: null, screen: null, screenAudio: null, media: { camera: false, microphone: false, screen_share: false, screen_share_audio: false }, quality: 'unknown' },
        setTrack: vi.fn(), end: vi.fn(),
    } );
    const calls = Object.assign( new Emitter(), { start: vi.fn( async () => placed ), group: vi.fn(), people: vi.fn( async () => [] ) } );
    const rt = fakeRooms( { 'chat:34:42': fakeRoom( 'chat:34:42' ) } );
    ( globalThis as Record<string, unknown> ).wordplusRealtimeCalls = { page: () => ( { rt, calls } ) };

    // On the page before the screens start: it holds its call once they do.
    document.body.insertAdjacentHTML( 'beforeend', '<chat-room room="chat:34:42" to="42" call style="height: 480px"></chat-room>' );
    const elements = await import( '../src/elements.tsx' );
    expect( elements.start() ).toBe( true );
    const shadow = document.querySelector( 'chat-room' )!.shadowRoot!;
    // Their name once the app's profiles answer.
    for ( let i = 0; i < 50 && ! shadow.querySelector( '.realtime-chat-top__name' )?.textContent; i++ ) await settle();
    expect( shadow.querySelector( '.realtime-chat-top__name' )?.textContent ).toBe( 'Ben' );

    ( shadow.querySelector( '[aria-label="Video Call"]' ) as HTMLElement ).click();
    await settle();
    expect( calls.start ).toHaveBeenCalledWith( 'chat:34:42', { to: '42', type: 'video' } );
    expect( shadow.querySelector( '.realtime-chat-call .realtime-call-window .wplus-private-call' ) ).not.toBeNull();
    expect( shadow.querySelector( '.realtime-chat' )?.getAttribute( 'data-call' ) ).toBe( 'chat:34:42' );
} );
