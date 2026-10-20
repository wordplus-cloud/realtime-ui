import {afterEach, describe, expect, it} from "vitest";
import {cleanup, fireEvent, render} from "@testing-library/react";
import {EasyStreamProvider} from "../../src/components/streams/index.ts";
import {fakeClient} from "./fake.tsx";

// Our own tooltip (tooltip.ts), where the page has no WordPlus SDK's (shared.test.tsx): shown over the control at once
// on hover and on keyboard focus, never for a touch; one for the page, gone with the last stream on it.

afterEach( cleanup );

function controls(){
    const { asClient } = fakeClient();
    return render(
        <EasyStreamProvider client={ asClient }>
            <button type="button" aria-label="Mute" data-estream-tip="Mute (m)">a</button>
            <button type="button" data-estream-tip="Picture-in-picture (p)"><span>b</span></button>
            <span data-estream-tip="Slow mode" aria-description="Slow mode" tabIndex={ 0 }>10s</span>
        </EasyStreamProvider>
    );
}

const tip = () => document.getElementById( 'estream-tooltip' );
const showing = () => tip()?.classList.contains( 'estream-tooltip--on' ) ? tip()!.textContent : null;
const button = ( text : string ) => document.querySelector<HTMLElement>( '[data-estream-tip="' + text + '"]' )!;

describe( 'our own tooltips', () => {
    it( 'shows a control\'s at once over it, moves on to the next, and hides on a click or leaving', () => {
        controls();

        fireEvent.pointerOver( button( 'Mute (m)' ), { pointerType: 'mouse' } );
        expect( showing() ).toBe( 'Mute (m)' );
        expect( tip()!.getAttribute( 'role' ) ).toBe( 'tooltip' );

        // Its inner parts are the same control.
        fireEvent.pointerOver( button( 'Picture-in-picture (p)' ).firstElementChild!, { pointerType: 'mouse' } );
        expect( showing() ).toBe( 'Picture-in-picture (p)' );

        fireEvent.pointerDown( button( 'Picture-in-picture (p)' ), { pointerType: 'mouse' } );
        expect( showing() ).toBeNull();

        fireEvent.pointerOver( button( 'Mute (m)' ), { pointerType: 'mouse' } );
        fireEvent.pointerOver( document.body, { pointerType: 'mouse' } );
        expect( showing() ).toBeNull();
    } );

    it( 'shows nothing for a touch', () => {
        controls();

        fireEvent.pointerOver( button( 'Mute (m)' ), { pointerType: 'touch' } );
        expect( showing() ).toBeNull();
    } );

    it( 'shows it on keyboard focus, and Escape hides it', () => {
        controls();

        fireEvent.focusIn( button( 'Slow mode' ) );
        expect( showing() ).toBe( 'Slow mode' );

        fireEvent.keyDown( document.body, { key: 'Escape' } );
        expect( showing() ).toBeNull();

        fireEvent.focusIn( button( 'Mute (m)' ) );
        expect( showing() ).toBe( 'Mute (m)' );
        fireEvent.focusOut( button( 'Mute (m)' ) );
        expect( showing() ).toBeNull();
    } );

    it( 'is one for the page, gone with the last stream on it', () => {
        const first = controls();
        const second = controls();
        fireEvent.focusIn( button( 'Slow mode' ) );
        expect( document.querySelectorAll( '#estream-tooltip' ).length ).toBe( 1 );

        first.unmount();
        expect( tip() ).not.toBeNull();
        second.unmount();
        expect( tip() ).toBeNull();
    } );
} );
