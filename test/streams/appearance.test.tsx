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

        expect( logoOf( { logo: 'https://site.example/logo.png', logoPosition: 'bottom-left', logoSize: 9999, logoOpacity: 5 } ) )
            .toEqual( { src: 'https://site.example/logo.png', position: 'bottom-left', width: 320, opacity: 0.2 } );
        expect( logoOf( { logo: 'https://site.example/logo.png', logoPosition: 'middle' as any } )?.position ).toBe( 'top-right' );
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
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { logo: 'https://site.example/logo.png', logoPosition: 'bottom-right', logoSize: 120, logoOpacity: 60 } } /> );

        const logo = container.querySelector( '.estream-stage .estream-logo' ) as HTMLImageElement;
        expect( logo.className ).toBe( 'estream-logo estream-logo--bottom-right' );
        expect( [ logo.getAttribute( 'src' ), logo.style.width, logo.style.opacity, logo.alt ] ).toEqual( [ 'https://site.example/logo.png', '120px', '0.6', '' ] );
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
