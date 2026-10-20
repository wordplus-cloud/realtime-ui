import {afterEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {createRef, useState} from "react";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {EmojiField, fieldText, type EmojiFieldHandle} from "../../src/components/streams/emoji-field.tsx";
import {fakeClient} from "./fake.tsx";

// The chat's field where the site draws emoji in a set (emoji-field.tsx), as Better Messages' composer is: its emoji
// the set's images however they came in, its text given back with each image as its emoji.

type Page = Window & { wordplusEmoji? : unknown };
const page = window as Page;

afterEach( () => {
    cleanup();
    delete page.wordplusEmoji;
} );

const SRC : Record<string, string> = {
    '🔥': 'https://site.example/wp-content/uploads/wordplus/emoji/apple/1f525.png',
    '🎉': 'https://site.example/wp-content/uploads/wordplus/emoji/apple/1f389.png'
};

// The SDK's renderer stood in for: 🔥 and 🎉 are the emoji it knows.
const renderer = () => {
    const ready = vi.fn( async () => true );
    return {
        ready,
        api: {
            set: 'apple',
            has: ( text : string ) => /🔥|🎉/.test( text ),
            ready,
            split: ( text : string ) => text.split( /(🔥|🎉)/ ).filter( Boolean ).map( ( part ) => SRC[ part ] ? { emoji: part, src: SRC[ part ] } : part )
        }
    };
};

function Field( props : { emoji : ReturnType<typeof renderer>['api'], handle? : React.Ref<EmojiFieldHandle>, onSubmit? : () => void, said? : ( text : string ) => void, max? : number, start? : string } ){
    const [ text, setText ] = useState( props.start ?? '' );
    return (
        <>
            <EmojiField
                ref={ props.handle }
                value={ text }
                onChange={ ( next ) => { setText( next ); props.said?.( next ); } }
                onSubmit={ props.onSubmit ?? ( () => {} ) }
                placeholder="Say something…"
                maxLength={ props.max ?? 500 }
                emoji={ props.emoji }
            />
            <button type="button" onClick={ () => setText( '' ) }>Clear</button>
        </>
    );
}

// The caret put in the field's own text, as a person would leave it.
function caret( node : Node, offset : number ){
    const range = document.createRange();
    range.setStart( node, offset );
    range.collapse( true );
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange( range );
    document.dispatchEvent( new Event( 'selectionchange' ) );
}

// What a person typed, as the browser leaves it in the field.
function type( box : HTMLElement, text : string ){
    box.textContent = text;
    caret( box.firstChild!, text.length );
    fireEvent.input( box );
}

const images = ( box : Element ) => [ ...box.querySelectorAll( 'img' ) ].map( ( img ) => [ img.alt, img.getAttribute( 'src' ) ] );

describe( 'the chat\'s emoji field', () => {
    it( 'reads its text with each emoji image as its emoji, WordPress\'s too, on one line', () => {
        const box = document.createElement( 'div' );
        box.innerHTML = 'So <img class="estream-emoji-image" alt="🔥" src="x.png"> hot<br><span>and <img class="emoji" alt="🎉" src="https://s.w.org/images/core/emoji/16.0.1/svg/1f389.svg"></span>\nyes';
        expect( fieldText( box ) ).toBe( 'So 🔥 hotand 🎉 yes' );
    } );

    it( 'draws a typed emoji as the set\'s image once the set has loaded, and gives the text back as written', async () => {
        const { api, ready } = renderer();
        const said = vi.fn();
        render( <Field emoji={ api } said={ said } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();

        type( box, 'So hot' );
        expect( ready, 'nothing loaded without an emoji' ).not.toHaveBeenCalled();

        await act( async () => { type( box, 'So 🔥 hot' ); } );
        expect( ready ).toHaveBeenCalledTimes( 1 );
        expect( images( box ) ).toEqual( [ [ '🔥', SRC['🔥'] ] ] );
        expect( box.textContent ).toBe( 'So  hot' );
        expect( said ).toHaveBeenLastCalledWith( 'So 🔥 hot' );
        expect( box.querySelector( 'img' )?.draggable ).toBe( false );
    } );

    it( 'pastes plain text at the caret, on one line, its emoji drawn', async () => {
        const { api } = renderer();
        const said = vi.fn();
        render( <Field emoji={ api } said={ said } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();
        await act( async () => { type( box, 'So 🔥 hot' ); } );

        // The caret after "So", in the field's first text.
        caret( box.firstChild!, 2 );
        const paste = fireEvent.paste( box, { clipboardData: { getData: ( kind : string ) => kind === 'text/plain' ? ' 🎉\n  yay\r\nyes,' : '<b>no</b>' } } );
        expect( paste, 'the browser\'s own paste is stopped' ).toBe( false );

        expect( said ).toHaveBeenLastCalledWith( 'So 🎉 yay yes, 🔥 hot' );
        expect( images( box ).map( ( [ alt ] ) => alt ) ).toEqual( [ '🎉', '🔥' ] );
        expect( box.querySelector( 'b' ) ).toBeNull();
    } );

    it( 'copies and cuts its text with each image as its emoji', async () => {
        const { api } = renderer();
        const said = vi.fn();
        render( <Field emoji={ api } said={ said } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();
        await act( async () => { type( box, 'So 🔥 hot' ); } );

        // "o 🔥 h" chosen: from the first text into the last.
        const range = document.createRange();
        range.setStart( box.firstChild!, 1 );
        range.setEnd( box.lastChild!, 2 );
        document.getSelection()!.removeAllRanges();
        document.getSelection()!.addRange( range );

        const copied = vi.fn();
        expect( fireEvent.copy( box, { clipboardData: { setData: copied } } ) ).toBe( false );
        expect( copied ).toHaveBeenCalledWith( 'text/plain', 'o 🔥 h' );
        expect( said ).toHaveBeenLastCalledWith( 'So 🔥 hot' );

        const cut = vi.fn();
        fireEvent.cut( box, { clipboardData: { setData: cut } } );
        expect( cut ).toHaveBeenCalledWith( 'text/plain', 'o 🔥 h' );
        expect( said ).toHaveBeenLastCalledWith( 'Sot' );
        expect( box.querySelector( 'img' ) ).toBeNull();
    } );

    it( 'puts the picker\'s emoji where the caret was in the field, though the picker has taken the focus', async () => {
        const { api } = renderer();
        const said = vi.fn();
        const handle = createRef<EmojiFieldHandle>();
        render( <Field emoji={ api } said={ said } handle={ handle } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();
        await act( async () => { type( box, 'hello world' ); } );
        caret( box.firstChild!, 5 );

        // The picker's search takes the focus and the selection.
        const search = document.createElement( 'input' );
        document.body.append( search );
        search.focus();
        document.getSelection()!.removeAllRanges();
        document.dispatchEvent( new Event( 'selectionchange' ) );

        // The first emoji in the field loads the set's index, and the field draws it once loaded.
        await act( async () => { handle.current!.insert( '🔥' ); } );
        await act( async () => { handle.current!.insert( '🎉' ); } );
        expect( said ).toHaveBeenLastCalledWith( 'hello🔥🎉 world' );
        expect( images( box ).map( ( [ alt ] ) => alt ) ).toEqual( [ '🔥', '🎉' ] );
        expect( document.activeElement ).toBe( box );
        search.remove();
    } );

    it( 'puts the picker\'s emoji at the end of a field never written in', () => {
        const { api } = renderer();
        const said = vi.fn();
        const handle = createRef<EmojiFieldHandle>();
        render( <Field emoji={ api } said={ said } handle={ handle } start="hi " /> );

        act( () => { handle.current!.insert( '🔥' ); } );
        expect( said ).toHaveBeenLastCalledWith( 'hi 🔥' );
    } );

    it( 'keeps to its limit, emoji counted as their characters', async () => {
        const { api } = renderer();
        const said = vi.fn();
        const handle = createRef<EmojiFieldHandle>();
        render( <Field emoji={ api } said={ said } handle={ handle } max={ 10 } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();

        type( box, 'abcdefghi' );
        type( box, 'abcdefghijk' );
        expect( fieldText( box ) ).toBe( 'abcdefghi' );
        expect( said ).toHaveBeenLastCalledWith( 'abcdefghi' );

        // 🔥 is two characters: one more would pass the limit.
        act( () => { handle.current!.insert( '🔥' ); } );
        expect( fieldText( box ) ).toBe( 'abcdefghi' );
    } );

    it( 'sends with Enter, but not while a keyboard is composing, and empties when its value is cleared', async () => {
        const { api } = renderer();
        const submit = vi.fn();
        render( <Field emoji={ api } onSubmit={ submit } /> );
        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        box.focus();
        await act( async () => { type( box, 'So 🔥 hot' ); } );

        fireEvent.keyDown( box, { key: 'Enter', isComposing: true } );
        expect( submit ).not.toHaveBeenCalled();
        const enter = fireEvent.keyDown( box, { key: 'Enter' } );
        expect( submit ).toHaveBeenCalledTimes( 1 );
        expect( enter, 'no line break' ).toBe( false );

        fireEvent.click( screen.getByText( 'Clear' ) );
        expect( box.childNodes.length ).toBe( 0 );
    } );

    it( 'is the chat\'s field where the site has a set: what is sent is the text, its emoji as characters', async () => {
        const { api } = renderer();
        page.wordplusEmoji = api;
        const { client, asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null } } );
        render( <EasyStreamApp client={ asClient } /> );

        const box = screen.getByRole( 'textbox', { name: 'Say something…' } );
        expect( box.getAttribute( 'contenteditable' ) ).not.toBeNull();
        expect( box.closest( '.wp-exclude-emoji' ), 'WordPress\'s emoji script leaves it alone' ).not.toBeNull();
        box.focus();
        await act( async () => { type( box, 'So 🔥 hot' ); } );
        expect( images( box ) ).toEqual( [ [ '🔥', SRC['🔥'] ] ] );

        await act( async () => { fireEvent.keyDown( box, { key: 'Enter' } ); } );
        expect( client.sendChat ).toHaveBeenCalledWith( 'So 🔥 hot' );
        expect( box.childNodes.length ).toBe( 0 );
    } );
} );
