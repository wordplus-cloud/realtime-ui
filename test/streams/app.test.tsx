import {afterEach, describe, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {configureUi} from "../../src/index.ts";
import {translator} from "../../src/inc/translations.ts";
import {EasyStreamApp} from "../../src/components/streams/index.ts";
import {base, fakeClient} from "./fake.tsx";

// The UI against a stand-in client whose state the test sets.

afterEach( cleanup );

describe( 'EasyStreamApp', () => {
    it( 'starts the client, and tells a viewer the stream starts soon', () => {
        const { client, asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } title="Launch party" scheduled={ Date.now() + 86_400_000 } /> );

        expect( client.start ).toHaveBeenCalled();
        expect( screen.getByText( 'Launch party' ) ).toBeTruthy();
        expect( screen.getByText( 'The stream starts soon' ) ).toBeTruthy();
        expect( screen.getByText( /^Starts / ) ).toBeTruthy();
        expect( screen.getByText( '12 watching' ) ).toBeTruthy();
        expect( screen.queryByText( 'Live' ) ).toBeNull();
    } );

    it( 'shows the live badge, the waiting screen when the mesh is full, and the end', () => {
        const { update, asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null }, media: 'waiting' } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'Live' ) ).toBeTruthy();
        expect( screen.getByText( /The stream is full/ ) ).toBeTruthy();

        update( { stream: { id: 's', state: 'ended', started_at: 1, ended_at: 2 }, media: 'off' } );
        expect( screen.getByText( 'This stream has ended' ) ).toBeTruthy();
    } );

    it( 'tells a viewer refused for want of the site\'s viewer-minutes that the stream is full, nothing of what the site pays', () => {
        const { asClient } = fakeClient( { status: 'error', error: 'no_hours', stream: null } );
        const { unmount } = render( <EasyStreamApp client={ asClient } /> );
        expect( screen.getByText( 'The stream is full. Joining as soon as a place frees up…' ) ).toBeTruthy();
        expect( screen.queryByRole( 'button', { name: 'Try again' } ) ).toBeNull();
        expect( document.body.textContent ).not.toMatch( /credit|hour|minute|plan/i );
        unmount();

        // In the stream's own words for a full stream, where it has them.
        render( <EasyStreamApp client={ asClient } texts={ { full: 'No more seats for now' } } /> );
        expect( screen.getByText( 'No more seats for now' ) ).toBeTruthy();
    } );

    it( 'says the stream\'s own words where it has them: before it starts, waiting, full, after it, and in the closed chat', () => {
        const texts = { soon: 'Doors open at six', soon_note: 'Bring questions', waiting: 'Back in a moment', full: 'No more seats for now', ended: 'That\'s a wrap', thanks: 'See you Friday', chat_before: 'Chat opens at six' };
        const { update, asClient } = fakeClient( { you: { ...base.you!, offline: 'closed' } } );
        render( <EasyStreamApp client={ asClient } texts={ texts } /> );

        expect( screen.getByText( 'Doors open at six' ) ).toBeTruthy();
        expect( screen.getByText( 'Bring questions' ) ).toBeTruthy();
        expect( screen.getByText( 'Chat opens at six' ) ).toBeTruthy();

        update( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null }, media: 'live', tiles: [] } );
        expect( screen.getByText( 'Back in a moment' ) ).toBeTruthy();
        update( { media: 'waiting' } );
        expect( screen.getByText( 'No more seats for now' ) ).toBeTruthy();

        update( { stream: { id: 's', state: 'ended', started_at: 1, ended_at: 2 }, media: 'off' } );
        expect( screen.getByText( 'That\'s a wrap' ) ).toBeTruthy();
        expect( screen.getByText( 'See you Friday' ) ).toBeTruthy();
        // The ones it doesn't have are the player's.
        expect( screen.getByText( 'The chat closed when the stream ended' ) ).toBeTruthy();
    } );

    it( 'shows a host the way to the studio the page names, not studio controls in the stream', () => {
        const host = { identity: 'u:1', role: 'host' as const, name: 'Host', chat: 'write' as const, mod: true };
        const { asClient } = fakeClient( { you: host } );
        render( <EasyStreamApp client={ asClient } studioUrl="https://site.example/wp-admin/admin.php?page=wordplus-stream#/studio/12" /> );

        expect( screen.getByText( 'You host this stream.' ) ).toBeTruthy();
        expect( screen.getByText( 'Go live in the studio' ).getAttribute( 'href' ) ).toBe( 'https://site.example/wp-admin/admin.php?page=wordplus-stream#/studio/12' );
        expect( screen.queryByText( 'Turn on camera and microphone' ) ).toBeNull();
        expect( screen.queryByText( 'How do you want to go live?' ) ).toBeNull();
        cleanup();

        // A page naming no studio (another platform's) carries the studio in the stream.
        render( <EasyStreamApp client={ fakeClient( { you: host } ).asClient } /> );
        expect( screen.getByText( 'Turn on camera and microphone' ) ).toBeTruthy();
        expect( screen.queryByText( 'You host this stream.' ) ).toBeNull();
    } );

    it( 'says why a join failed', () => {
        const { asClient } = fakeClient( { status: 'error', error: 'not_licensed' } );
        render( <EasyStreamApp client={ asClient } /> );

        expect( screen.getByText( 'Live streaming is not set up on this site yet' ) ).toBeTruthy();
    } );

    it( 'sends chat, shows it as text, and holds back a read-only viewer', async () => {
        const { client, update, asClient } = fakeClient();
        render( <EasyStreamApp client={ asClient } /> );

        const input = screen.getByPlaceholderText( 'Say something…' );
        fireEvent.change( input, { target: { value: 'hello' } } );
        await act( async () => { fireEvent.submit( input.closest( 'form' )! ); } );
        expect( client.sendChat ).toHaveBeenCalledWith( 'hello' );

        update( { chat: [ { id: '1-0', from: { id: 'u:3', name: 'Ann', avatar: null, role: 'viewer' }, text: '<b>not bold</b>', at: 1 } ] } );
        expect( screen.getByText( '<b>not bold</b>' ) ).toBeTruthy();

        update( { you: { ...base.you!, chat: 'read' } } );
        expect( screen.queryByPlaceholderText( 'Say something…' ) ).toBeNull();
        expect( screen.getByText( 'Chat is read-only for you' ) ).toBeTruthy();
    } );

    it( 'lets a signed-in viewer of a stream that takes guests react and ask to come on stage, and answers the invitation', async () => {
        const { client, update, asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null } } );
        render( <EasyStreamApp client={ asClient } guests /> );

        fireEvent.click( screen.getByLabelText( 'Heart' ) );
        expect( client.react ).toHaveBeenCalledWith( '❤️' );

        await act( async () => { fireEvent.click( screen.getByText( 'Ask to join on stage' ) ); } );
        expect( client.raiseHand ).toHaveBeenCalledWith( true );

        update( { invited: true } );
        expect( screen.getByRole( 'dialog' ) ).toBeTruthy();
        await act( async () => { fireEvent.click( screen.getByText( 'Join stage' ) ); } );
        expect( client.acceptStage ).toHaveBeenCalled();
    } );

    it( 'takes the reactions away while the stream takes none, and brings them back when it does again', () => {
        const { update, asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null } } );
        render( <EasyStreamApp client={ asClient } /> );
        expect( screen.getByLabelText( 'Heart' ) ).toBeTruthy();

        update( { reactionsOn: false } );
        expect( screen.queryByLabelText( 'Heart' ) ).toBeNull();
        expect( screen.queryByRole( 'group', { name: 'Reactions' } ) ).toBeNull();

        update( { reactionsOn: true } );
        expect( screen.getByLabelText( 'Heart' ) ).toBeTruthy();
    } );

    it( 'offers no stage to viewers of a stream that takes no guests, which is every stream unless the page says so', () => {
        const { asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null } } );
        const { unmount } = render( <EasyStreamApp client={ asClient } guests={ false } /> );

        expect( screen.getByLabelText( 'Heart' ) ).toBeTruthy();
        expect( screen.queryByText( 'Ask to join on stage' ) ).toBeNull();
        unmount();

        // Guests on stage aren't in the first release: none without the page asking.
        render( <EasyStreamApp client={ asClient } /> );
        expect( screen.getByLabelText( 'Heart' ) ).toBeTruthy();
        expect( screen.queryByText( 'Ask to join on stage' ) ).toBeNull();
    } );

    it( 'offers no stage when the cloud says the grant has none, whatever the page says', async () => {
        const { update, asClient } = fakeClient( { stream: { id: 's', state: 'live', started_at: 1, ended_at: null }, you: { ...base.you!, stage: false } } );
        render( <EasyStreamApp client={ asClient } guests /> );

        expect( screen.queryByText( 'Ask to join on stage' ) ).toBeNull();

        // And says why, should an invitation come anyway.
        update( { invited: true } );
        ( asClient as any ).acceptStage.mockResolvedValueOnce( { ok: false, error: 'no_stage' } );
        await act( async () => { fireEvent.click( screen.getByText( 'Join stage' ) ); } );
        expect( screen.getByText( 'This stream does not take guests on stage' ) ).toBeTruthy();
    } );

    it( 'speaks the language its host gives it, plurals included, asking in the wordplus-stream text domain', () => {
        // An app's host: the package's translator, with words of its own, in Polish (three forms a number).
        const polish = translator( 'pl', {
            'The stream starts soon': 'Transmisja wkrótce się zacznie',
            'how many people watch\u0004%s watching': [ '%s ogląda', '%s oglądają', '%s ogląda' ],
            'a reaction\u0004Heart': 'Serce'
        } );
        const domains = new Set<string | undefined>();
        configureUi( {
            translate: ( text, context, domain ) => { domains.add( domain ); return polish.translate( text, context ); },
            translatePlural: ( single, plural, count, context, domain ) => { domains.add( domain ); return polish.translatePlural( single, plural, count, context ); }
        } );

        try {
            const { update, asClient } = fakeClient( { viewers: 21 } );
            render( <EasyStreamApp client={ asClient } /> );

            expect( screen.getByText( 'Transmisja wkrótce się zacznie' ) ).toBeTruthy();
            expect( screen.getByText( '21 ogląda' ) ).toBeTruthy();

            update( { viewers: 3, stream: { id: 's', state: 'live', started_at: 1, ended_at: null } } );
            expect( screen.getByText( '3 oglądają' ) ).toBeTruthy();
            expect( screen.getByLabelText( 'Serce' ) ).toBeTruthy();
            expect( [ ...domains ] ).toEqual( [ 'wordplus-stream' ] );
        } finally {
            configureUi( { translate: ( text ) => text, translatePlural: ( single, plural, count ) => count === 1 ? single : plural } );
        }
    } );

    it( 'is translated from the package\'s own languages of its text domain, kept apart from the shared ones', () => {
        // The package's translator, as an app's host gets it: the streams' words are found in their domain only.
        configureUi( translator( 'de-DE' ) );

        try {
            const { asClient } = fakeClient( { viewers: 21 } );
            render( <EasyStreamApp client={ asClient } /> );

            expect( screen.getByText( 'Der Stream beginnt bald' ) ).toBeTruthy();
            expect( screen.getByText( '21 schauen zu' ) ).toBeTruthy();
            expect( translator( 'de' ).translate( 'The stream starts soon' ) ).toBe( 'The stream starts soon' );
            expect( translator( 'de' ).translate( 'The stream starts soon', undefined, 'bp-better-messages' ) ).toBe( 'The stream starts soon' );
        } finally {
            configureUi( { translate: ( text ) => text, translatePlural: ( single, plural, count ) => count === 1 ? single : plural } );
        }
    } );

    it( 'leaves chat out of a stream without it', () => {
        const { asClient } = fakeClient();
        const { container } = render( <EasyStreamApp client={ asClient } chat={ false } /> );

        expect( container.querySelector( '.estream-app__side' ) ).toBeNull();
        expect( container.querySelector( '.estream-app--no-chat' ) ).toBeTruthy();
    } );

    it( 'wears the site\'s appearance: theme, accent with readable text on it, corners, chat below', () => {
        const { asClient } = fakeClient();
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { theme: 'dark', accent: '#ffd400', radius: 40, chat: 'below' } } /> );
        const root = container.querySelector( '.estream-theme' ) as HTMLElement;

        expect( root.className ).toBe( 'estream-theme wp-exclude-emoji estream-theme--dark estream-theme--chat-below' );
        expect( root.style.getPropertyValue( '--estream-accent' ) ).toBe( '#ffd400' );
        expect( root.style.getPropertyValue( '--estream-accent-text' ) ).toBe( '#111111' );
        expect( root.style.getPropertyValue( '--estream-radius' ) ).toBe( '24px' );
        // The invitation dialog sits inside the theme root, so it wears the same colours.
        expect( root.querySelector( '.estream-shell' ) ).toBeTruthy();
    } );

    it( 'ignores an accent that is not a colour, and keeps the light theme by default', () => {
        const { asClient } = fakeClient();
        const { container } = render( <EasyStreamApp client={ asClient } appearance={ { accent: 'red;background:url(x)' } } /> );
        const root = container.querySelector( '.estream-theme' ) as HTMLElement;

        expect( root.className ).toBe( 'estream-theme wp-exclude-emoji estream-theme--light' );
        expect( root.style.getPropertyValue( '--estream-accent' ) ).toBe( '' );
    } );

    it( 'hides the viewer count from viewers when the site says so, never from hosts', () => {
        const { asClient, update } = fakeClient();
        render( <EasyStreamApp client={ asClient } appearance={ { viewers: false } } /> );

        expect( screen.queryByText( /watching/ ) ).toBeNull();

        update( { you: { ...base.you!, role: 'host', mod: true } } );
        expect( screen.getByText( /12 watching/ ) ).toBeTruthy();
    } );
} );
