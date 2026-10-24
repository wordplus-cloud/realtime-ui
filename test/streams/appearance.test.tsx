import {afterEach, describe, expect, it} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import type {EasyStreamState, Tile} from "@wordplus/realtime-client/streams";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {logoOf, safeImage, shapeOf, themeClass, themeStyle} from "../../src/components/streams/appearance.ts";
import {fakeClient} from "./fake.tsx";

// The Appearance tab's settings, as the player wears them.

afterEach( cleanup );

const track = () => ( { attach: () => {}, detach: () => {}, sid: 'TR_v', mediaStreamTrack: { id: 'v' } } ) as unknown as NonNullable<Tile['camera']>;
const person = ( identity : string, name : string ) : Tile => ( {
    identity, name, role: identity === 'u:1' ? 'host' : 'guest', local: false, camera: track(), screen: null, audio: [], micMuted: false, speaking: false, encoder: false
} );
const live = ( patch : Partial<EasyStreamState> = {} ) : Partial<EasyStreamState> => ( {
    stream: { id: 's', state: 'live', started_at: Date.now() - 60_000, ended_at: null },
    media: 'live',
    tiles: [ person( 'u:1', 'Maya Lee' ), person( 'u:5', 'Olena' ) ],
    ...patch
} );

describe( 'the appearance', () => {
    it( 'sets the theme root\'s classes and properties', () => {
        expect( themeClass( { shape: '9:16', font: 'system', times: true, avatars: false } ) )
            .toBe( 'estream-theme wp-exclude-emoji estream-theme--light estream-theme--system-font estream-theme--upright estream-theme--times estream-theme--no-avatars' );
        expect( themeClass( { shape: '4:3' } ) ).toBe( 'estream-theme wp-exclude-emoji estream-theme--light estream-theme--standard' );

        const style = themeStyle( { live: '#00aa55', chatHeight: 2000 } ) as Record<string, string>;
        expect( [ style[ '--estream-live' ], style[ '--estream-chat-height' ] ] ).toEqual( [ '#00aa55', '900px' ] );
        expect( ( themeStyle( { live: 'red' } ) as Record<string, string> )[ '--estream-live' ] ).toBeUndefined();
    } );

    it( 'takes the shape of the picture unless the site fixed one', () => {
        expect( [ shapeOf( 1280, 720 ), shapeOf( 1920, 1200 ), shapeOf( 640, 480 ), shapeOf( 1080, 1080 ), shapeOf( 720, 1280 ) ] )
            .toEqual( [ '16:9', '16:9', '4:3', '4:3', '9:16' ] );
        expect( themeClass( {}, '9:16' ) ).toContain( 'estream-theme--upright' );
        expect( themeClass( { shape: 'auto' }, '4:3' ) ).toContain( 'estream-theme--standard' );
        expect( themeClass( { shape: 'auto' } ) ).toBe( 'estream-theme wp-exclude-emoji estream-theme--light' );
        expect( themeClass( { shape: '16:9' }, '9:16' ) ).toBe( 'estream-theme wp-exclude-emoji estream-theme--light' );
    } );

    it( 'grows upright for a phone held upright alone on the stage, keeps that shape once the picture goes, and stays wide for several', () => {
        const { asClient, update } = fakeClient( live( { tiles: [ person( 'u:1', 'Maya Lee' ) ] } ) );
        const { container } = render( <EasyStreamApp client={ asClient } title="Launch" /> );
        const root = () => container.querySelector( '.estream-theme' )!;
        const arrives = ( width : number, height : number ) => {
            const video = container.querySelector( 'video' )!;
            Object.defineProperty( video, 'videoWidth', { value: width, configurable: true } );
            Object.defineProperty( video, 'videoHeight', { value: height, configurable: true } );
            fireEvent( video, new Event( 'resize' ) );
        };

        expect( root().className ).not.toContain( 'estream-theme--upright' );
        arrives( 720, 1280 );
        expect( root().className ).toContain( 'estream-theme--upright' );

        // The host away for a moment: the stage keeps its shape rather than jumping.
        update( { tiles: [] } );
        expect( root().className ).toContain( 'estream-theme--upright' );

        update( { tiles: [ person( 'u:1', 'Maya Lee' ), person( 'u:5', 'Olena' ) ] } );
        arrives( 720, 1280 );
        expect( root().className ).not.toContain( 'estream-theme--upright' );

        // A shape the site fixed stays whatever arrives.
        cleanup();
        const fixed = render( <EasyStreamApp client={ fakeClient( live( { tiles: [ person( 'u:1', 'Maya Lee' ) ] } ) ).asClient } appearance={ { shape: '16:9' } } /> );
        const video = fixed.container.querySelector( 'video' )!;
        Object.defineProperty( video, 'videoWidth', { value: 720, configurable: true } );
        Object.defineProperty( video, 'videoHeight', { value: 1280, configurable: true } );
        fireEvent( video, new Event( 'resize' ) );
        expect( fixed.container.querySelector( '.estream-theme' )!.className ).not.toContain( 'estream-theme--upright' );
    } );

    it( 'leaves the Live badge off the picture where the site says so', () => {
        const { asClient } = fakeClient( live() );
        const { rerender } = render( <EasyStreamApp client={ asClient } title="Launch" /> );
        expect( screen.getByText( 'Live' ).className ).toContain( 'estream-badge--live' );

        rerender( <EasyStreamApp client={ asClient } title="Launch" appearance={ { liveBadge: false } } /> );
        expect( screen.queryByText( 'Live' ) ).toBeNull();
    } );

    it( 'takes only plain http and https images into a style or an attribute', () => {
        expect( safeImage( 'https://site.example/logo.png' ) ).toBe( 'https://site.example/logo.png' );
        for( const bad of [ 'javascript:alert(1)', 'https://x.example/a.png"), url(x', 'data:image/png;base64,AA', '/relative.png', 42 ] ){
            expect( safeImage( bad ) ).toBeNull();
        }

        const logo = 'https://site.example/logo.png';
        expect( logoOf( { logo, logoPosition: 'bottom-left', logoWidth: 99, logoOpacity: 5 } ) )
            .toEqual( { src: logo, position: 'bottom-left', width: 40, opacity: 0.05, x: null, y: null } );
        // Its opacity from 1 per cent, and never under it; its width from 2 per cent of the picture's, 12 unless set.
        expect( logoOf( { logo, logoWidth: 0.5, logoOpacity: 0 } ) ).toMatchObject( { width: 2, opacity: 0.01 } );
        expect( logoOf( { logo } ) ).toMatchObject( { width: 12, x: null, y: null } );
        expect( logoOf( { logo, logoPosition: 'middle' as any } )?.position ).toBe( 'top-right' );
        // Its distance from the corner's sides in per cent of the picture, to a tenth, from 0 to 50, or the player's own.
        expect( logoOf( { logo, logoInsetX: 24.66, logoInsetY: 90 } ) ).toMatchObject( { x: 24.7, y: 50 } );
        expect( logoOf( { logo, logoInsetX: -5, logoInsetY: null } ) ).toMatchObject( { x: 0, y: null } );
        expect( logoOf( { logo, logoInsetX: '12' as any, logoInsetY: Number.NaN } ) ).toMatchObject( { x: null, y: null } );
        // The pixels of before, as their share of a picture 800 by 450, and the shares where both are there.
        expect( logoOf( { logo, logoSize: 120, logoX: 40, logoY: 45 } ) ).toMatchObject( { width: 15, x: 5, y: 10 } );
        expect( logoOf( { logo, logoWidth: 20, logoSize: 120, logoInsetX: 3, logoX: 40 } ) ).toMatchObject( { width: 20, x: 3 } );
    } );

    it( 'leaves out the title, the time on air and names on the video where the site says so', () => {
        const { asClient } = fakeClient( live() );
        const { container, rerender } = render( <EasyStreamApp client={ asClient } title="Launch" /> );

        expect( screen.getByText( 'Launch' ) ).toBeTruthy();
        expect( screen.getByLabelText( 'Time on air' ) ).toBeTruthy();
        expect( [ ...container.querySelectorAll( '.estream-tile__name' ) ].map( ( n ) => n.textContent ) ).toEqual( [ 'Maya Lee', 'Olena' ] );

        rerender( <EasyStreamApp client={ asClient } title="Launch" appearance={ { title: false, clock: false, names: false } } /> );
        expect( screen.queryByText( 'Launch' ) ).toBeNull();
        expect( screen.queryByLabelText( 'Time on air' ) ).toBeNull();
        expect( container.querySelectorAll( '.estream-tile__name' ) ).toHaveLength( 0 );
    } );

    it( 'offers the reactions the site chose, any emoji in its order, none at all, and keeps them off the picture where asked', () => {
        const { asClient, update } = fakeClient( { ...live(), reactions: [ { id: 1, kind: '❤️', at: Date.now() } ] } );
        // A name of before is its emoji, and each one is offered once.
        const { container, rerender } = render( <EasyStreamApp client={ asClient } appearance={ { reactions: [ '🔥', 'heart', '🎉', '❤️' ] } } /> );

        const offered = screen.getByRole( 'group', { name: 'Reactions' } );
        expect( [ ...offered.querySelectorAll( 'button' ) ].map( ( b ) => b.getAttribute( 'aria-label' ) ) ).toEqual( [ 'Fire', 'Heart', '🎉' ] );
        expect( container.querySelector( '.estream-floating' )?.textContent ).toBe( '❤️' );

        // What rises over the picture is only what the site offers, whatever else arrives.
        update( { reactions: [ { id: 2, kind: '🖕', at: Date.now() }, { id: 3, kind: '🎉', at: Date.now() }, { id: 4, kind: 'heart', at: Date.now() } ] } );
        expect( container.querySelector( '.estream-floating' )?.textContent ).toBe( '🎉❤️' );

        rerender( <EasyStreamApp client={ asClient } appearance={ { reactions: [], floating: false } } /> );
        expect( screen.queryByRole( 'group', { name: 'Reactions' } ) ).toBeNull();
        expect( container.querySelector( '.estream-floating' ) ).toBeNull();
    } );

    it( 'puts the logo over the picture, in its corner, at its size and opacity', () => {
        const { asClient } = fakeClient( live() );
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-right', logoWidth: 15, logoOpacity: 60 } } /> );

        const logo = container.querySelector( '.estream-stage .estream-logo-frame > .estream-logo' ) as HTMLImageElement;
        expect( logo.className ).toBe( 'estream-logo estream-logo--bottom-right' );
        expect( [ logo.getAttribute( 'src' ), logo.style.width, logo.style.opacity, logo.alt ] ).toEqual( [ 'https://site.example/logo.png', '15%', '0.6', '' ] );
        expect( logo.style.getPropertyValue( '--estream-logo-x' ) ).toBe( '' );
        // Viewers have the image alone, which never moves.
        expect( logo.getAttribute( 'data-estream-tip' ) ).toBeNull();
    } );

    it( 'puts the logo at the distance the site set from its corner\'s side and from its top or bottom, in shares of the picture', () => {
        const { asClient } = fakeClient( live() );
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'top-left', logoInsetX: 3.5, logoInsetY: 2 } } /> );

        const logo = container.querySelector( '.estream-stage .estream-logo' ) as HTMLImageElement;
        expect( logo.className ).toBe( 'estream-logo estream-logo--top-left estream-logo--x estream-logo--y' );
        expect( [ logo.style.getPropertyValue( '--estream-logo-x' ), logo.style.getPropertyValue( '--estream-logo-y' ) ] ).toEqual( [ '3.5%', '2%' ] );
    } );

    it( 'keeps the logo to the picture, without the bars a picture of another shape leaves in the stage', () => {
        const { asClient, update } = fakeClient( live( { tiles: [ person( 'u:1', 'Maya Lee' ) ] } ) );
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png' } } /> );
        const stage = container.querySelector( '.estream-stage' ) as HTMLElement;
        const frame = () => container.querySelector( '.estream-logo-frame' ) as HTMLElement;
        const box = ( width : number, height : number ) => () => ( { left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON(){} } ) as DOMRect;
        const arrives = ( stageWidth : number, stageHeight : number, width : number, height : number ) => {
            const video = container.querySelector( 'video' )!;
            stage.getBoundingClientRect = box( stageWidth, stageHeight );
            video.getBoundingClientRect = box( stageWidth, stageHeight );
            Object.defineProperty( video, 'videoWidth', { value: width, configurable: true } );
            Object.defineProperty( video, 'videoHeight', { value: height, configurable: true } );
            fireEvent( video, new Event( 'resize' ) );
        };
        const at = () => [ frame().style.left, frame().style.top, frame().style.width, frame().style.height, frame().style.getPropertyValue( '--estream-picture-below' ) ];

        // A camera alone, shown whole: a standard picture in a wide stage, with bars at its sides.
        arrives( 800, 450, 1440, 1080 );
        expect( at() ).toEqual( [ '100px', '0px', '600px', '450px', '0px' ] );
        // A wide one in a stage as tall as a standard screen in full screen, with bars above and below it.
        arrives( 800, 600, 1920, 1080 );
        expect( at() ).toEqual( [ '0px', '75px', '800px', '450px', '75px' ] );

        // Two side by side: the whole stage.
        update( { tiles: [ person( 'u:1', 'Maya Lee' ), person( 'u:5', 'Olena' ) ] } );
        expect( frame().getAttribute( 'style' ) ).toBeNull();
        // Before the start, a screen and no picture: the whole stage.
        update( { stream: { id: 's', state: 'idle', started_at: null, ended_at: null }, tiles: [] } );
        expect( frame().getAttribute( 'style' ) ).toBeNull();
    } );

    it( 'lets a settings page\'s preview drag the logo, saying where it was let go: the corner nearest it and its distance in shares of the picture', () => {
        const { asClient } = fakeClient( live() );
        const { container, rerender } = render( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'top-right', logoWidth: 12.5 } } /> );
        const logo = container.querySelector( '.estream-stage .estream-logo' ) as HTMLImageElement;
        expect( logo.className ).toContain( 'estream-logo--movable' );
        expect( logo.getAttribute( 'data-estream-tip' ) ).toBe( 'Drag the logo to place it. Pull its round handle to size it.' );

        const heard : any[] = [];
        container.addEventListener( 'estream-logo-move', ( e ) => heard.push( ( e as CustomEvent ).detail ) );
        // A picture of 800 by 450, a logo of 100 by 40 in its top right corner, held 10 pixels into it.
        const box = ( left : number, top : number, width : number, height : number ) => () => ( { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON(){} } ) as DOMRect;
        logo.parentElement!.getBoundingClientRect = box( 0, 0, 800, 450 );
        logo.getBoundingClientRect = box( 686, 14, 100, 40 );

        // A press without a move leaves it where it is.
        fireEvent.pointerDown( logo, { pointerId: 1, clientX: 696, clientY: 24 } );
        fireEvent.pointerUp( logo, { pointerId: 1, clientX: 697, clientY: 25 } );
        expect( heard ).toEqual( [] );

        fireEvent.pointerDown( logo, { pointerId: 1, clientX: 696, clientY: 24 } );
        // Moved where it is held, and let go near the bottom left: 40 pixels from the side, 30 from the bottom, 5 and
        // 6.7 per cent of the picture.
        fireEvent.pointerMove( logo, { pointerId: 1, clientX: 50, clientY: 390 } );
        expect( [ logo.style.left, logo.style.top ] ).toEqual( [ '40px', '380px' ] );
        fireEvent.pointerUp( logo, { pointerId: 1, clientX: 50, clientY: 390 } );
        expect( heard ).toEqual( [ { position: 'bottom-left', x: 5, y: 6.7 } ] );
        // It stays where it was let go, until the site's settings say again.
        expect( logo.style.left ).toBe( '' );
        expect( logo.className ).toContain( 'estream-logo--bottom-left' );
        expect( [ logo.style.getPropertyValue( '--estream-logo-x' ), logo.style.getPropertyValue( '--estream-logo-y' ) ] ).toEqual( [ '5%', '6.7%' ] );

        // Dragged past the edge, it is held at it.
        fireEvent.pointerDown( logo, { pointerId: 1, clientX: 696, clientY: 24 } );
        fireEvent.pointerUp( logo, { pointerId: 1, clientX: 2000, clientY: -300 } );
        expect( heard[1] ).toEqual( { position: 'top-right', x: 0, y: 0 } );

        // A preview drawn at half its size: the same shares of the picture, whatever the screen measures.
        Object.defineProperty( logo.parentElement!, 'offsetWidth', { configurable: true, value: 1600 } );
        fireEvent.pointerDown( logo, { pointerId: 1, clientX: 696, clientY: 24 } );
        fireEvent.pointerUp( logo, { pointerId: 1, clientX: 50, clientY: 390 } );
        expect( heard[2] ).toEqual( { position: 'bottom-left', x: 5, y: 6.7 } );

        // The site's settings again: where they say.
        rerender( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'top-left', logoInsetX: 1, logoInsetY: 2, logoWidth: 12.5 } } /> );
        expect( logo.className ).toContain( 'estream-logo--top-left' );
        expect( logo.style.getPropertyValue( '--estream-logo-x' ) ).toBe( '1%' );
    } );

    it( 'lets a studio that places the logo move it over the host\'s own picture before going live, and never while live', () => {
        const local : Tile = { ...person( 'u:1', 'Maya Lee' ), local: true };
        const { asClient, update } = fakeClient( { stream: { id: 's', state: 'idle', started_at: null, ended_at: null }, media: 'live', you: { identity: 'u:1', role: 'host', name: 'Maya Lee', chat: 'write', mod: true }, tiles: [ local ] } as Partial<EasyStreamState> );
        const { container, rerender } = render( <EasyStreamApp client={ asClient } placeLogo appearance={ { logo: 'https://site.example/logo.png' } } /> );
        const movable = () => container.querySelector( '.estream-logo' )?.className.includes( 'estream-logo--movable' );
        expect( movable() ).toBe( true );

        update( { stream: { id: 's', state: 'live', started_at: Date.now(), ended_at: null } } );
        expect( movable() ).toBe( false );

        // Only where the page places it.
        update( { stream: { id: 's', state: 'idle', started_at: null, ended_at: null } } );
        rerender( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png' } } /> );
        expect( movable() ).toBe( false );
    } );

    it( 'lets a settings page\'s preview size the logo with the handle at the corner away from its own, saying how wide in a share of the picture', () => {
        const { asClient } = fakeClient( live() );
        const { container } = render( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'top-right', logoWidth: 12.5, logoOpacity: 1 } } /> );
        const logo = container.querySelector( '.estream-stage .estream-logo' ) as HTMLElement;
        // The image faint as the site has it, the handle not: it is the frame's, beside the image.
        expect( ( logo.querySelector( '.estream-logo__image' ) as HTMLImageElement ).style.opacity ).toBe( '0.01' );
        expect( logo.style.opacity ).toBe( '' );
        // In the top right corner, so its handle is at the bottom left, pulled out leftwards and down.
        const handle = logo.querySelector( '.estream-logo__size' ) as HTMLElement;
        expect( handle.className ).toBe( 'estream-logo__size estream-logo__size--bottom-left' );

        const heard : any[] = [];
        const moved : any[] = [];
        container.addEventListener( 'estream-logo-size', ( e ) => heard.push( ( e as CustomEvent ).detail ) );
        container.addEventListener( 'estream-logo-move', ( e ) => moved.push( ( e as CustomEvent ).detail ) );
        const box = ( left : number, top : number, width : number, height : number ) => () => ( { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON(){} } ) as DOMRect;
        logo.parentElement!.getBoundingClientRect = box( 0, 0, 800, 450 );
        logo.getBoundingClientRect = box( 686, 14, 100, 40 );

        // 60 pixels to the left: 60 wider, 160 of the picture's 800, as it shows while pulled.
        fireEvent.pointerDown( handle, { pointerId: 1, clientX: 686, clientY: 54 } );
        fireEvent.pointerMove( handle, { pointerId: 1, clientX: 626, clientY: 54 } );
        expect( logo.style.width ).toBe( '20%' );
        expect( logo.className ).toContain( 'estream-logo--sizing' );
        fireEvent.pointerUp( handle, { pointerId: 1, clientX: 626, clientY: 54 } );
        expect( heard ).toEqual( [ { width: 20 } ] );
        // Not a move of the logo, and as wide as it was made until the site's settings say again.
        expect( moved ).toEqual( [] );
        expect( logo.style.width ).toBe( '20%' );
        expect( logo.className ).not.toContain( 'estream-logo--sizing' );

        // Pulled up, in towards its corner, by more than across: smaller as much as its shape says, 10 down is 25 wide.
        fireEvent.pointerDown( handle, { pointerId: 1, clientX: 686, clientY: 54 } );
        fireEvent.pointerUp( handle, { pointerId: 1, clientX: 690, clientY: 44 } );
        expect( heard[1] ).toEqual( { width: 9.4 } );

        // Never past the bounds of a logo's width.
        fireEvent.pointerDown( handle, { pointerId: 1, clientX: 686, clientY: 54 } );
        fireEvent.pointerUp( handle, { pointerId: 1, clientX: 2000, clientY: 54 } );
        expect( heard[2] ).toEqual( { width: 2 } );
        fireEvent.pointerDown( handle, { pointerId: 1, clientX: 686, clientY: 54 } );
        fireEvent.pointerUp( handle, { pointerId: 1, clientX: -2000, clientY: 54 } );
        expect( heard[3] ).toEqual( { width: 40 } );

        // A preview drawn at half its size: the same share of the picture, whatever the screen measures.
        Object.defineProperty( logo.parentElement!, 'offsetWidth', { configurable: true, value: 1600 } );
        fireEvent.pointerDown( handle, { pointerId: 1, clientX: 686, clientY: 54 } );
        fireEvent.pointerUp( handle, { pointerId: 1, clientX: 626, clientY: 54 } );
        expect( heard[4] ).toEqual( { width: 20 } );
    } );

    it( 'puts the handle at the corner away from the logo\'s own in each corner', () => {
        const { asClient } = fakeClient( live() );
        const { container, rerender } = render( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-left' } } /> );
        const handle = () => container.querySelector( '.estream-logo__size' )?.className;
        expect( handle() ).toBe( 'estream-logo__size estream-logo__size--top-right' );
        rerender( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'top-left' } } /> );
        expect( handle() ).toBe( 'estream-logo__size estream-logo__size--bottom-right' );
        rerender( <EasyStreamApp client={ asClient } preview appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-right' } } /> );
        expect( handle() ).toBe( 'estream-logo__size estream-logo__size--top-left' );
        // Only in a preview: viewers have the image alone.
        rerender( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-right' } } /> );
        expect( handle() ).toBeUndefined();
        expect( container.querySelector( '.estream-logo' )?.tagName ).toBe( 'IMG' );
    } );

    it( 'shows the cover before the stream starts and after it ends, never over the picture', () => {
        const { update, asClient } = fakeClient();
        const { container } = render( <EasyStreamApp client={ asClient } cover="https://site.example/cover.jpg" /> );
        const cover = () => container.querySelector( '.estream-cover' ) as HTMLElement | null;

        expect( cover()?.style.backgroundImage ).toBe( 'url("https://site.example/cover.jpg")' );

        update( live() );
        expect( cover() ).toBeNull();

        update( { stream: { id: 's', state: 'ended', started_at: 1, ended_at: 2 }, tiles: [] } );
        expect( cover() ).toBeTruthy();
    } );

    it( 'shows no cover from an address that isn\'t a plain image\'s', () => {
        const { asClient } = fakeClient();
        const { container } = render( <EasyStreamApp client={ asClient } cover={ 'https://x.example/a.jpg"); background: url("https://evil.example/' } /> );

        expect( container.querySelector( '.estream-cover' ) ).toBeNull();
    } );

    it( 'leaves the emoji picker out where the site says so', () => {
        const { asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } appearance={ { emoji: false } } /> );

        expect( screen.queryByLabelText( 'Emoji' ) ).toBeNull();
    } );

    it( 'reaches nothing beyond itself as a settings page\'s preview: no warning before leaving', () => {
        const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
        const { asClient } = fakeClient( { ...live(), you: host, devices: { camera: true, microphone: true } } );
        render( <EasyStreamApp client={ asClient } manage={ false } preview /> );

        const leaving = new Event( 'beforeunload', { cancelable: true } );
        window.dispatchEvent( leaving );
        expect( leaving.defaultPrevented ).toBe( false );
    } );
} );
