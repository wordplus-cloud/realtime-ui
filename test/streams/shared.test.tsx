import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {EasyStreamApp, EasyStreamProvider} from "../../src/components/streams/index.ts";
import {MenuButton, MenuItem} from "../../src/components/streams/menu.tsx";
import {fakeClient} from "./fake.tsx";

// What the player takes from the WordPlus SDK where the page has it (shared.ts): the tooltips' floater and the menus'
// placement every WordPlus plugin shares, in a browser with popovers, and the emoji picker. Without them, its own
// (tooltip.test.tsx, chat.test.tsx).

type Page = Window & { wordplusTooltips? : unknown, wordplusMenus? : unknown, wordplusPickers? : unknown, wordplusPickersConfig? : unknown, wordplusEmoji? : unknown };
const page = window as Page;
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
let hadPopovers = false;

beforeEach( () => {
    hadPopovers = 'showPopover' in proto;
    if( ! hadPopovers ) proto.showPopover = function(){};
} );

afterEach( () => {
    cleanup();
    delete page.wordplusTooltips;
    delete page.wordplusMenus;
    delete page.wordplusPickers;
    delete page.wordplusPickersConfig;
    delete page.wordplusEmoji;
    if( ! hadPopovers ) delete proto.showPopover;
} );

function tree( children? : React.ReactNode ){
    const { asClient } = fakeClient();
    return render( <EasyStreamProvider client={ asClient }>{ children }</EasyStreamProvider> );
}

describe( 'the WordPlus SDK\'s shared parts', () => {
    it( 'hands the page\'s labels to the SDK\'s tooltips, once whatever streams it has, styled as ours', () => {
        const stop = vi.fn();
        const watch = vi.fn( () => stop );
        page.wordplusTooltips = { watch };

        const first = tree( <button type="button" data-estream-tip="Mute (m)">a</button> );
        const second = tree();
        expect( watch ).toHaveBeenCalledTimes( 1 );
        expect( watch ).toHaveBeenCalledWith( document, { attribute: 'data-estream-tip', focus: true, className: 'estream-tip' } );

        // Ours draws nothing meanwhile.
        fireEvent.pointerOver( screen.getByText( 'a' ), { pointerType: 'mouse' } );
        expect( document.getElementById( 'estream-tooltip' ) ).toBeNull();

        first.unmount();
        expect( stop ).not.toHaveBeenCalled();
        second.unmount();
        expect( stop ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'has the SDK\'s menus place a menu above its button and close it, focus back on the button after Escape', () => {
        const handle = { place: vi.fn(), close: vi.fn() };
        const open = vi.fn( () => handle );
        page.wordplusMenus = { open };
        page.wordplusTooltips = { watch: () => () => {} };

        tree(
            <MenuButton icon="more" label="More">
                { ( close ) => <MenuItem onSelect={ close }>Stream from OBS</MenuItem> }
            </MenuButton>
        );
        const button = screen.getByLabelText( 'More' );
        fireEvent.click( button );

        const list = screen.getByRole( 'menu' );
        expect( open ).toHaveBeenCalledTimes( 1 );
        const [ menu, options ] = open.mock.calls[0] as unknown as [ HTMLElement, Record<string, any> ];
        expect( menu ).toBe( list );
        // (The button apart: matching an object that holds an element walks the whole document.)
        expect( options.anchor ).toBe( button );
        expect( [ options.origin, options.lift ] ).toEqual( [ 'bottom', true ] );

        // The SDK closes it (Escape, here, with focus in the menu): the button has the focus back.
        act( () => { options.onClose(); } );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();
        expect( handle.close ).toHaveBeenCalled();
        expect( document.activeElement ).toBe( button );

        // A choice closes it the plugin's way, which lets the SDK go too.
        fireEvent.click( button );
        handle.close.mockClear();
        fireEvent.click( screen.getByRole( 'menuitem', { name: 'Stream from OBS' } ) );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();
        expect( handle.close ).toHaveBeenCalledTimes( 1 );
    } );

    it( 'keeps its own where the browser has no popovers, whose top layer shows over the player in full screen', () => {
        delete proto.showPopover;
        const watch = vi.fn( () => () => {} );
        const open = vi.fn();
        page.wordplusTooltips = { watch };
        page.wordplusMenus = { open };

        tree(
            <MenuButton icon="more" label="More">
                { () => <MenuItem onSelect={ () => {} }>Stream from OBS</MenuItem> }
            </MenuButton>
        );
        fireEvent.click( screen.getByLabelText( 'More' ) );

        expect( watch ).not.toHaveBeenCalled();
        expect( open ).not.toHaveBeenCalled();
        expect( screen.getByRole( 'menu' ) ).toBeTruthy();

        // Closed by a press elsewhere, its own way.
        fireEvent.pointerDown( document.body );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();
    } );

    it( 'opens the SDK\'s emoji picker from the chat: emoji only, in the chat\'s dark and accent, several at the caret while it stays open', async () => {
        const closed = vi.fn();
        let options : Record<string, any> = {};
        const open = vi.fn( async ( o : Record<string, any> ) => {
            options = o;
            return () => { closed(); o.onClose(); };
        } );
        page.wordplusPickers = { open };
        page.wordplusPickersConfig = {};

        const { asClient } = fakeClient();
        const app = render( <EasyStreamApp client={ asClient } appearance={ { theme: 'dark', accent: '#0d9488' } } /> );
        const input = screen.getByPlaceholderText( 'Say something…' ) as HTMLInputElement;
        fireEvent.change( input, { target: { value: 'hello world' } } );
        input.setSelectionRange( 5, 5 );

        const button = screen.getByLabelText( 'Emoji' );
        await act( async () => { fireEvent.click( button ); } );
        expect( open ).toHaveBeenCalledTimes( 1 );
        expect( options.anchor ).toBe( button );
        expect( [ options.emoji, options.gifs, options.dark, options.style ] ).toEqual( [ true, false, true, { '--wplus-picker-accent': '13, 148, 136' } ] );
        expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'true' );
        expect( screen.queryByRole( 'menu' ) ).toBeNull();

        act( () => { options.onInsert( '🔥' ); } );
        act( () => { options.onInsert( '🎉' ); } );
        expect( input.value ).toBe( 'hello🔥🎉 world' );

        // The button closes it again.
        fireEvent.click( button );
        expect( closed ).toHaveBeenCalledTimes( 1 );
        expect( button.getAttribute( 'aria-expanded' ) ).toBe( 'false' );

        // And it goes with the chat.
        await act( async () => { fireEvent.click( button ); } );
        app.unmount();
        expect( closed ).toHaveBeenCalledTimes( 2 );
    } );

    it( 'keeps the chat\'s own few emoji where the SDK\'s picker can\'t load', async () => {
        page.wordplusPickers = { open: vi.fn( () => Promise.reject( new Error( 'Could not load' ) ) ) };
        page.wordplusPickersConfig = {};

        const { asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } /> );
        await act( async () => { fireEvent.click( screen.getByLabelText( 'Emoji' ) ); } );

        fireEvent.click( screen.getByLabelText( 'Emoji' ) );
        expect( screen.getByRole( 'menu', { name: 'Emoji' } ).textContent ).toContain( '🔥' );
    } );

    // The SDK's renderer stood in for: 🔥 is the one emoji it knows.
    const renderer = ( set : string ) => {
        const ready = vi.fn( async () => set !== 'native' );
        return {
            ready,
            api: {
                set,
                has: ( text : string ) => text.includes( '🔥' ),
                ready,
                split: ( text : string ) => text.split( /(🔥)/ ).filter( Boolean ).map( ( part ) => part === '🔥' ? { emoji: '🔥', src: 'https://site.example/wp-content/uploads/wordplus/emoji/apple/1f525.png' } : part )
            }
        };
    };
    const said = ( id : string, text : string ) => ( { id, text, at: 1, from: { id: 'u:3', name: 'Sam', avatar: null, role: 'viewer' as const } } );

    it( 'draws the reactions in the site\'s set, on their buttons and rising over the picture', async () => {
        const { api } = renderer( 'apple' );
        page.wordplusEmoji = api;

        const { asClient, update } = fakeClient( { stream: { id: 's', state: 'live', started_at: Date.now(), ended_at: null }, media: 'live' } );
        render( <EasyStreamApp client={ asClient } appearance={ { reactions: [ '🔥', '🎉' ] } } /> );
        await act( async () => {} );

        const fire = screen.getByRole( 'button', { name: 'Fire' } );
        expect( fire.querySelector( 'img.estream-emoji-image' )?.getAttribute( 'alt' ) ).toBe( '🔥' );
        // One the set's renderer doesn't know stays the device's own.
        expect( screen.getByRole( 'button', { name: '🎉' } ).textContent ).toBe( '🎉' );

        await act( async () => { update( { reactions: [ { id: 1, kind: '🔥', at: Date.now() } ] } ); } );
        expect( document.querySelector( '.estream-floating img.estream-emoji-image' )?.getAttribute( 'alt' ) ).toBe( '🔥' );
    } );

    it( 'draws the chat\'s emoji in the site\'s set, as Better Messages does, once a message has one', async () => {
        const { api, ready } = renderer( 'apple' );
        page.wordplusEmoji = api;

        // No reactions offered, whose buttons draw in the set too.
        const { asClient, update } = fakeClient( { chat: [ said( '1-0', 'Hello there' ) ] } );
        render( <EasyStreamApp client={ asClient } appearance={ { reactions: [] } } /> );
        await act( async () => {} );
        expect( ready, 'nothing loaded for a chat without emoji' ).not.toHaveBeenCalled();

        await act( async () => { update( { chat: [ said( '1-0', 'Hello there' ), said( '2-0', 'So 🔥 hot, https://site.example/🔥' ) ] } ); } );
        expect( ready ).toHaveBeenCalledTimes( 1 );
        const text = document.querySelectorAll( '.estream-message__text' )[1]!;
        const images = [ ...text.querySelectorAll( 'img.estream-emoji-image' ) ] as HTMLImageElement[];
        // The emoji in the text, not the one inside the link's address.
        expect( images.map( ( img ) => [ img.alt, img.src ] ) ).toEqual( [ [ '🔥', 'https://site.example/wp-content/uploads/wordplus/emoji/apple/1f525.png' ] ] );
        expect( text.textContent ).toBe( 'So  hot, https://site.example/🔥' );
    } );

    it( 'keeps the device\'s emoji where the site chose no set', async () => {
        const { api, ready } = renderer( 'native' );
        page.wordplusEmoji = api;

        const { asClient } = fakeClient( { chat: [ said( '1-0', 'So 🔥 hot' ) ] } );
        render( <EasyStreamApp client={ asClient } /> );
        await act( async () => {} );

        expect( ready ).not.toHaveBeenCalled();
        expect( document.querySelector( '.estream-message__text' )?.textContent ).toBe( 'So 🔥 hot' );
        expect( document.querySelector( 'img.estream-emoji-image' ) ).toBeNull();
    } );
} );
