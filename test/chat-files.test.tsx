import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chat } from '../src/react.tsx';
import { configureUi } from '../src/index.ts';
import { fakeRoom, fakeRooms } from './fake-rooms.ts';

// Files in an app's chat (Chat's `upload`, src/sdk/chat-files.tsx): picked, pasted or dropped, each goes up to the app's
// own route as it is picked, and the message carries where it is.

beforeEach( () => configureUi( { translate: ( text: string ) => text } ) );
afterEach( () => {
    cleanup();
    vi.unstubAllGlobals();
} );

const settle = async () => {
    for ( let i = 0; i < 3; i++ ) await act( async () => {} );
};

/** XMLHttpRequest by shape: each request kept, answered by hand. */
class FakeRequest {
    static all: FakeRequest[] = [];
    method = '';
    url = '';
    body: FormData | null = null;
    status = 0;
    responseText = '';
    upload: { onprogress: ( ( e: { lengthComputable: boolean; loaded: number; total: number } ) => void ) | null } = { onprogress: null };
    onload: ( () => void ) | null = null;
    onerror: ( () => void ) | null = null;
    onabort: ( () => void ) | null = null;
    aborted = false;
    constructor() {
        FakeRequest.all.push( this );
    }
    open( method: string, url: string ) {
        this.method = method;
        this.url = url;
    }
    send( body: FormData ) {
        this.body = body;
    }
    abort() {
        this.aborted = true;
        this.onabort?.();
    }
    progress( loaded: number, total: number ) {
        this.upload.onprogress?.( { lengthComputable: true, loaded, total } );
    }
    answer( status: number, body: unknown ) {
        this.status = status;
        this.responseText = JSON.stringify( body );
        this.onload?.();
    }
}

function chatWith( events: Array<{ event: string; data: unknown; id?: string; at?: number; from?: string }> = [] ) {
    const room = fakeRoom( 'chat:34:42', { 34: { name: 'Ann' }, 42: { name: 'Ben' } } );
    room.history.mockImplementation( async () => ( { events, more: false } ) );
    const rt = fakeRooms( { 'chat:34:42': room } );
    return { room, rt };
}

const photo = ( name = 'mug.jpg', size = 2048 ) => new File( [ 'x'.repeat( size ) ], name, { type: 'image/jpeg' } );
const pick = async ( container: HTMLElement, files: File[] ) => {
    const input = container.querySelector( '.wplus-attachments-input' ) as HTMLInputElement;
    Object.defineProperty( input, 'files', { value: files, configurable: true } );
    await act( async () => { fireEvent.change( input ); } );
};
const send = ( container: HTMLElement ) => container.querySelector( '.wplus-composer__row [role="button"]:last-of-type' ) as HTMLElement;

describe( 'files in the chat', () => {
    beforeEach( () => {
        FakeRequest.all = [];
        vi.stubGlobal( 'XMLHttpRequest', FakeRequest );
    } );

    it( 'has no paperclip without an upload', async () => {
        const { rt } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();
        expect( container.querySelector( '.wplus-composer__attach-wrap' ) ).toBeNull();
        expect( container.querySelector( '.wplus-attachments-input' ) ).toBeNull();
    } );

    it( 'takes a picked file up to the app route as it is picked, shows how far, and sends it alone once up', async () => {
        const { rt, room } = chatWith();
        const at = Date.now();
        room.emitWithAck.mockImplementation( async () => ( { id: 'm1', at } ) );
        const sent = vi.fn();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" onSent={ sent } /> );
        await settle();
        expect( container.querySelector( '.wplus-composer__attach-wrap' ) ).not.toBeNull();

        await pick( container, [ photo() ] );
        const request = FakeRequest.all[ 0 ];
        expect( request.method ).toBe( 'POST' );
        expect( request.url ).toBe( '/api/uploads' );
        expect( request.body?.get( 'room' ) ).toBe( 'chat:34:42' );
        expect( ( request.body?.get( 'file' ) as File ).name ).toBe( 'mug.jpg' );

        const chip = () => container.querySelector( '.wplus-staged-chip' ) as HTMLElement;
        expect( chip().getAttribute( 'data-status' ) ).toBe( 'uploading' );
        await act( async () => request.progress( 1024, 2048 ) );
        expect( chip().querySelector( '.wplus-staged-chip__status' )?.textContent ).toBe( 'Uploading… 50%' );
        // Nothing to send while it goes up.
        expect( send( container ).getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        const kept = { id: 'f7', url: '/files/f7', name: 'mug.jpg', type: 'image/jpeg', size: 2048, width: 800, height: 600 };
        await act( async () => request.answer( 200, kept ) );
        expect( chip().getAttribute( 'data-status' ) ).toBe( 'done' );
        expect( chip().querySelector( '.wplus-staged-chip__status' )?.textContent ).toBe( 'Ready' );

        const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
        await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
        await settle();
        expect( room.emitWithAck ).toHaveBeenCalledWith( 'message', { text: '', files: [ kept ] } );
        expect( sent ).toHaveBeenCalledWith( { id: 'm1', room: 'chat:34:42', text: '', at, files: [ kept ] } );
        expect( container.querySelector( '.wplus-staged-chip' ) ).toBeNull();
        // In the message: the picture, its time and ticks under it, no empty bubble.
        const body = container.querySelector( '[data-message-id="m1"]' )!;
        expect( body.getAttribute( 'data-has-files' ) ).toBe( '1' );
        expect( body.getAttribute( 'data-has-text' ) ).toBe( '0' );
        expect( body.querySelector( '.wplus-image-grid[data-count="1"] img' )?.getAttribute( 'src' ) ).toBe( '/files/f7' );
        expect( body.querySelector( '.wplus-msg-bubble' ) ).toBeNull();
        expect( body.querySelector( '.wplus-reactions .wplus-msg-meta' ) ).not.toBeNull();
    } );

    it( 'sends the text with the files, the files above its bubble', async () => {
        const { rt, room } = chatWith();
        room.emitWithAck.mockImplementation( async () => ( { id: 'm2', at: Date.now() } ) );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" /> );
        await settle();
        await pick( container, [ new File( [ 'pdf' ], 'invoice.pdf', { type: 'application/pdf' } ) ] );
        const kept = { id: 'f8', url: '/files/f8', name: 'invoice.pdf', type: 'application/pdf', size: 52_000 };
        await act( async () => FakeRequest.all[ 0 ].answer( 201, kept ) );

        const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
        editable.textContent = 'The invoice for March';
        await act( async () => { fireEvent.input( editable ); } );
        await act( async () => { fireEvent.keyDown( editable, { key: 'Enter' } ); } );
        await settle();
        expect( room.emitWithAck ).toHaveBeenCalledWith( 'message', { text: 'The invoice for March', files: [ kept ] } );
        const body = container.querySelector( '[data-message-id="m2"]' )!;
        expect( body.getAttribute( 'data-has-text' ) ).toBe( '1' );
        const row = body.querySelector( 'a.wplus-file-row' ) as HTMLAnchorElement;
        expect( row.getAttribute( 'href' ) ).toBe( '/files/f8' );
        expect( row.querySelector( '.wplus-file-row__badge' )?.textContent ).toBe( 'PDF' );
        expect( row.querySelector( '.wplus-file-row__meta' )?.textContent ).toBe( '51 KB · pdf' );
        expect( body.querySelector( '.wplus-chat-text' )?.textContent ).toBe( 'The invoice for March' );
    } );

    it( 'says why a file was refused, by the app or for its size, and leaves it out of the message', async () => {
        const { rt, room } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" maxFileSize={ 1024 * 1024 } /> );
        await settle();

        await pick( container, [ photo( 'huge.jpg', 2 * 1024 * 1024 ) ] );
        expect( FakeRequest.all ).toHaveLength( 0 );
        const chips = () => [ ...container.querySelectorAll( '.wplus-staged-chip' ) ];
        expect( chips()[ 0 ].getAttribute( 'data-status' ) ).toBe( 'error' );
        expect( chips()[ 0 ].querySelector( '.wplus-staged-chip__status' )?.textContent ).toBe( 'Exceeds maximum size of 1 MB' );

        await pick( container, [ photo( 'other.jpg' ) ] );
        await act( async () => FakeRequest.all[ 0 ].answer( 422, { error: 'Only pictures of the item, please' } ) );
        expect( chips()[ 1 ].querySelector( '.wplus-staged-chip__status' )?.textContent ).toBe( 'Only pictures of the item, please' );
        // Neither goes: nothing to send.
        expect( send( container ).getAttribute( 'aria-disabled' ) ).toBe( 'true' );

        await act( async () => { fireEvent.click( chips()[ 0 ].querySelector( '.wplus-staged-chip__remove' )! ); } );
        expect( chips() ).toHaveLength( 1 );
        expect( room.emitWithAck ).not.toHaveBeenCalled();
    } );

    it( 'stops a file going up when it is removed', async () => {
        const { rt } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" /> );
        await settle();
        await pick( container, [ photo() ] );
        await act( async () => { fireEvent.click( container.querySelector( '.wplus-staged-chip__remove' )! ); } );
        expect( FakeRequest.all[ 0 ].aborted ).toBe( true );
        expect( container.querySelector( '.wplus-staged-chip' ) ).toBeNull();
    } );

    it( 'takes files pasted into the composer, a screenshot among them, and keeps to the most a message takes', async () => {
        const { rt } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" maxFiles={ 2 } /> );
        await settle();
        const editable = container.querySelector( '.wplus-composer__editable' ) as HTMLElement;
        await act( async () => {
            fireEvent.paste( editable, { clipboardData: { files: [ photo( 'a.png' ), photo( 'b.png' ), photo( 'c.png' ) ], getData: () => '' } } );
        } );
        expect( container.querySelectorAll( '.wplus-staged-chip' ) ).toHaveLength( 2 );
        expect( FakeRequest.all ).toHaveLength( 2 );
    } );

    it( 'takes files dropped on the chat, with the strip while they are dragged over it', async () => {
        const { rt } = chatWith();
        const { container } = render( <Chat rt={ rt } room="chat:34:42" upload="/api/uploads" /> );
        await settle();
        const chat = container.querySelector( '.realtime-chat' )!;
        const transfer = { types: [ 'Files' ], files: [ photo() ], dropEffect: '' };
        await act( async () => { fireEvent.dragEnter( chat, { dataTransfer: transfer } ); } );
        expect( container.querySelector( '.wplus-attachments-dropzone' )?.textContent ).toBe( 'Drop your files here' );
        await act( async () => { fireEvent.drop( chat, { dataTransfer: transfer } ); } );
        expect( container.querySelector( '.wplus-attachments-dropzone' ) ).toBeNull();
        expect( container.querySelectorAll( '.wplus-staged-chip' ) ).toHaveLength( 1 );
    } );

    it( 'shows the files of a message from another, opens its pictures large, and steps through them', async () => {
        const files = [
            { id: '1', url: '/files/1', name: 'front.jpg', type: 'image/jpeg', size: 1000 },
            { id: '2', url: '/files/2', name: 'back.jpg', type: 'image/jpeg', size: 1000, thumb: '/files/2/small' },
            { id: '3', url: '/files/3', name: 'manual.zip', type: 'application/zip', size: 3_500_000 },
        ];
        const { rt } = chatWith( [ { event: 'message', data: { text: 'Both sides', files }, id: 'h1', at: Date.now(), from: '42' } ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" /> );
        await settle();

        const grid = container.querySelector( '.wplus-image-grid' )!;
        expect( grid.getAttribute( 'data-count' ) ).toBe( '2' );
        expect( grid.getAttribute( 'data-attached' ) ).toBe( '1' );
        expect( [ ...grid.querySelectorAll( 'img' ) ].map( ( img ) => img.getAttribute( 'src' ) ) ).toEqual( [ '/files/1', '/files/2/small' ] );
        expect( container.querySelector( '.wplus-file-row__name' )?.textContent ).toBe( 'manual.zip' );
        expect( container.querySelector( '.wplus-file-row__badge' )?.getAttribute( 'data-kind' ) ).toBe( 'archive' );

        await act( async () => { fireEvent.click( grid.querySelectorAll( '.wplus-image-tile' )[ 1 ] ); } );
        const viewer = () => container.querySelector( '.realtime-viewer' );
        expect( viewer()?.querySelector( '.realtime-viewer__image' )?.getAttribute( 'src' ) ).toBe( '/files/2' );
        expect( viewer()?.querySelector( '.realtime-viewer__count' )?.textContent ).toBe( '2 / 2' );
        await act( async () => { fireEvent.keyDown( document, { key: 'ArrowRight' } ); } );
        expect( viewer()?.querySelector( '.realtime-viewer__name' )?.textContent ).toBe( 'front.jpg' );
        await act( async () => { fireEvent.keyDown( document, { key: 'Escape' } ); } );
        expect( viewer() ).toBeNull();
    } );

    it( 'never shows a file of another site, nor a script, that a member wrote into a message of their own', async () => {
        const files = [
            { id: '1', url: 'https://tracker.example.net/pixel.jpg', name: 'cute.jpg', type: 'image/jpeg', size: 10 },
            { id: '2', url: 'javascript:alert(1)', name: 'invoice.pdf', type: 'application/pdf', size: 10 },
            { id: '3', url: 'https://files.shop.test/a.pdf', name: 'terms.pdf', type: 'application/pdf', size: 10 },
        ];
        const { rt } = chatWith( [ { event: 'message', data: { text: '', files }, id: 'h1', at: Date.now(), from: '42' } ] );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" fileHosts={ [ 'files.shop.test' ] } /> );
        await settle();

        expect( container.querySelector( '.wplus-image-grid' ) ).toBeNull();
        expect( container.querySelectorAll( 'img[src*="tracker"]' ) ).toHaveLength( 0 );
        const links = [ ...container.querySelectorAll( 'a.wplus-file-row' ) ].map( ( a ) => a.getAttribute( 'href' ) );
        expect( links ).toEqual( [ 'https://files.shop.test/a.pdf' ] );
        // The others keep their names, unlinked.
        expect( container.querySelectorAll( '.wplus-file-row[data-unlinked]' ) ).toHaveLength( 2 );
    } );

    it( 'shows the files of the app\'s own page of messages', async () => {
        const { rt } = chatWith();
        const load = vi.fn( async () => ( {
            messages: [ { id: 'k1', from: 42, text: 'The scan', at: Date.now(), files: [ { id: '9', url: '/files/9', name: 'scan.png', type: 'image/png', size: 100 } ] } ],
            more: false,
        } ) );
        const { container } = render( <Chat rt={ rt } room="chat:34:42" load={ load } /> );
        await settle();
        expect( container.querySelector( '[data-message-id="k1"] .wplus-image-grid img' )?.getAttribute( 'alt' ) ).toBe( 'scan.png' );
    } );
} );
