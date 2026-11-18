// The chat's parts on Preact through preact/compat, as Live Support's visitor panel draws them in its bubble's shadow
// root (K8 of the slimming of 2026-10-31): what differs from React under the parts, each checked where it runs. The
// Preact project of vitest.config.ts runs this file and the chat's parts' own tests (chat-parts, presence, chat-files,
// icon-sets, label-corpus) with React's names given to Preact's; the React project runs them all on React 19.
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { configureUi } from '../src/host.ts';
import BaseTooltip, { tooltipContent } from '../src/primitives/tooltip.tsx';
import Tooltip from '../src/components/helpers/tooltip.tsx';
import { ReactionPicker } from '../src/components/chat/reactions.tsx';

const floater = { canHover: true, show: vi.fn(), hide: vi.fn(), place: () => {} };

beforeEach( () => {
    configureUi( { translate: ( text: string ) => text } );
    ( window as unknown as { wordplusTooltips?: unknown } ).wordplusTooltips = floater;
    floater.show.mockClear();
} );
afterEach( () => {
    cleanup();
    delete ( window as unknown as { wordplusTooltips?: unknown } ).wordplusTooltips;
} );

it( 'runs on Preact in its project, and on React 19 in the other', async () => {
    // preact/compat says React 18.3.1, so the parts take React 18's ways where it and 19 differ (an element's ref).
    expect( process.env.UI_ON ).toMatch( /^(react|preact)$/ );
    expect( React.version ).toMatch( process.env.UI_ON === 'preact' ? /^18\.3\.1$/ : /^19\./ );
    // Preact's own element (its constructor left out on purpose), not React's, under the kit's parts.
    const element = React.createElement( 'b' ) as unknown as Record<string, unknown>;
    expect( Object.prototype.hasOwnProperty.call( element, 'constructor' ) && element.constructor === undefined ).toBe( process.env.UI_ON === 'preact' );
} );

it( 'keeps a control\'s own ref under a tooltip, and draws the tooltip\'s markup through a root of its own at once', async () => {
    const own = createRef<HTMLButtonElement>();
    const { container } = render( <BaseTooltip label={ <b className="who">Ann</b> }><button ref={ own } type="button">Ann</button></BaseTooltip> );
    const button = container.querySelector( 'button' )!;
    // The element's ref, which React 19 keeps among its props and React 18 and Preact beside them.
    expect( own.current ).toBe( button );

    await act( async () => { fireEvent.mouseEnter( button ); } );
    await act( async () => { await Promise.resolve(); } );
    expect( floater.show ).toHaveBeenCalled();
    const [ anchor, content ] = floater.show.mock.calls.at( -1 )!;
    expect( anchor ).toBe( button );

    // createRoot and flushSync, Preact's: the label is in the floater before it is measured, and gone with it.
    const box = document.createElement( 'div' );
    const done = ( content as ( el: HTMLElement ) => () => void )( box );
    expect( box.querySelector( 'b.who' )?.textContent ).toBe( 'Ann' );
    act( () => done() );
    expect( box.querySelector( 'b.who' ) ).toBeNull();

    expect( tooltipContent( 'Ann' ) ).toBe( 'Ann' );
} );

it( 'names a control by its tooltip\'s words and draws their markup, as on React', async () => {
    const { container } = render( <Tooltip content={ 'Ann <span class="badge">Pro</span>' }><span onClick={ () => {} }>x</span></Tooltip> );
    const control = container.querySelector( 'span' )!;
    expect( control.getAttribute( 'aria-label' ) ).toBe( 'Ann Pro' );
    expect( control.getAttribute( 'role' ) ).toBe( 'button' );
    await act( async () => { fireEvent.mouseEnter( control ); } );
    await act( async () => { await Promise.resolve(); } );
    const box = document.createElement( 'div' );
    ( floater.show.mock.calls.at( -1 )![ 1 ] as ( el: HTMLElement ) => () => void )( box );
    expect( box.querySelector( '.badge' )?.textContent ).toBe( 'Pro' );
} );

it( 'opens the reaction strip in the shadow root it is drawn in, not on the page beyond it', async () => {
    const host = document.createElement( 'div' );
    document.body.appendChild( host );
    const shadow = host.attachShadow( { mode: 'open' } );
    const mount = document.createElement( 'div' );
    shadow.appendChild( mount );
    const pick = vi.fn();
    render( <ReactionPicker keys={ [ '1f44d', '2764' ] } onPick={ pick } />, { container: mount } );
    await act( async () => { fireEvent.mouseEnter( shadow.querySelector( '.wplus-reaction-trigger' )! ); } );
    expect( shadow.querySelectorAll( '.wplus-reaction-strip__item' ) ).toHaveLength( 2 );
    expect( document.body.querySelector( '.wplus-reaction-strip' ) ).toBeNull();
    await act( async () => { fireEvent.click( shadow.querySelectorAll( '.wplus-reaction-strip__item' )[ 1 ] ); } );
    expect( pick ).toHaveBeenCalledWith( '2764' );
    host.remove();
} );

it( 'shows a part\'s tooltip in the shadow root it is drawn in, from the package\'s own floater the chat entry gives', async () => {
    // A visitor's page has no WordPlus SDK: the app sets the package's floater, as Live Support's panel does.
    delete ( window as unknown as { wordplusTooltips?: unknown } ).wordplusTooltips;
    const chat = await import( '../src/chat.ts' );
    chat.setOwnTooltips( chat.ownTooltips() );
    const host = document.createElement( 'div' );
    document.body.appendChild( host );
    const shadow = host.attachShadow( { mode: 'open' } );
    const mount = document.createElement( 'div' );
    shadow.appendChild( mount );
    render( <><chat.StatusTick status="failed" label="Not sent" /><chat.DaySeparator label="Today" title="Friday, 31 October" /></>, { container: mount } );

    await act( async () => { fireEvent.mouseEnter( shadow.querySelector( '.wplus-msg-status' )! ); } );
    const box = shadow.querySelector( '.realtime-tooltip.wplus-tooltip' );
    expect( box?.textContent ).toBe( 'Not sent' );
    expect( box?.getAttribute( 'role' ) ).toBe( 'tooltip' );
    expect( document.body.querySelector( '.realtime-tooltip' ) ).toBeNull();
    await act( async () => { fireEvent.mouseLeave( shadow.querySelector( '.wplus-msg-status' )! ); } );
    expect( shadow.querySelector( '.realtime-tooltip' ) ).toBeNull();

    await act( async () => { fireEvent.mouseEnter( shadow.querySelector( '.wplus-day-pill' )! ); } );
    expect( shadow.querySelector( '.realtime-tooltip' )?.textContent ).toBe( 'Friday, 31 October' );
    chat.setOwnTooltips( undefined );
    host.remove();
} );
