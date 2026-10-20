// The preview `npx @wordplus/realtime-ui preview` serves: each component in its states, drawn from the fakes
// (@wordplus/realtime-ui/testing), the app's own copy of a component in place of ours where it has one (the command
// resolves `wordplus-views:<component>` to it), and the app's own pieces where it names them (`--pieces`, resolved as
// `wordplus-preview:app`, with its stylesheets and the body's classes). `?theme=dark`, `?dir=rtl` and `?width=phone`
// show the rest of what must keep working.
import React, { createRef, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { configureUi, PiecesProvider, setUiUsers } from "@wordplus/realtime-ui";
// @ts-expect-error: resolved by the preview's build to the app's pieces and page classes, or none.
import { pieces as appPieces, piecesFrom, bodyClass } from "wordplus-preview:app";
import { fakeCall, fakeRoom, fakeRooms, participant } from "@wordplus/realtime-ui/testing";
// @ts-expect-error: resolved by the preview's build to the app's copy or ours.
import { CallView, RingCard } from "wordplus-views:call-screen";
// @ts-expect-error: as above.
import { OnlineList, Typing, OnlineCount } from "wordplus-views:online-list";
// @ts-expect-error: as above.
import { Chat } from "wordplus-views:chat";

const params = new URLSearchParams( location.search );
const theme = params.get( "theme" ) === "dark" ? "dark" : "light";
const dir = params.get( "dir" ) === "rtl" ? "rtl" : "ltr";
const width = params.get( "width" ) === "phone" ? "phone" : "computer";
document.body.classList.add( theme === "dark" ? "bm-messages-dark" : "bm-messages-light" );
if ( bodyClass ) document.body.classList.add( ...String( bodyClass ).split( /\s+/ ).filter( Boolean ) );
document.documentElement.dir = dir;

const PEOPLE = { 34: { name: "Ann", avatar: "avatars/ann.svg" }, 42: { name: "Ben", avatar: "avatars/ben.svg" }, 43: { name: "Cara", avatar: "avatars/cara.svg" } };
setUiUsers( Object.entries( PEOPLE ).map( ( [ id, p ] ) => [ Number( id ), p ] ) );
configureUi( { currentUserId: () => 34, translate: ( text: string ) => text } );

const people = ( list: Array<[ string, Record<string, unknown> ]> ) => new Map( list.map( ( [ id, extra ] ) => [ id, participant( id, extra ) ] ) );
const call = ( over: Record<string, unknown> ) => ( { ...fakeCall( over ), wrapper: createRef<HTMLDivElement>() } );
const two = () => people( [ [ "me", { name: "Ann", avatar: PEOPLE[ 34 ].avatar } ], [ "user_42", { name: "Ben", avatar: PEOPLE[ 42 ].avatar } ] ] );
const three = () => people( [
    [ "me", { name: "Ann", avatar: PEOPLE[ 34 ].avatar } ],
    [ "user_42", { name: "Ben", avatar: PEOPLE[ 42 ].avatar, isSpeaking: true, audioLevel: 0.6 } ],
    [ "user_43", { name: "Cara", avatar: PEOPLE[ 43 ].avatar, micMuted: true, handRaised: true } ],
] );

function Shot( { title, note, children }: { title: string; note?: string; children: React.ReactNode } ) {
    return <section className="preview-shot">
        <h2>{ title }{ note && <small>{ note }</small> }</h2>
        <div className="preview-frame">{ children }</div>
    </section>;
}

function Call( { layout, over }: { layout: "private" | "group-video" | "group-audio"; over: Record<string, unknown> } ) {
    return <div className="bm-call-surface preview-call" data-layout={ layout }>
        <CallView layout={ layout } call={ call( { thread: { thread_id: 7, participants: [ 42 ] }, ...over } ) } />
    </div>;
}

const shop = fakeRoom( "shop", { members: { 34: { name: "Ann" }, 42: { name: "Ben", role: "Customer" }, 43: { name: "Cara", role: "Warehouse" } } } );
const now = Date.now();
const chat = fakeRoom( "chat:34:42", {
    members: { 34: { name: "Ann" }, 42: { name: "Ben" } },
    history: { more: false, events: [
        { event: "message", data: { text: "Hi! Has my order left yet?" }, id: "h1", at: now - 600_000, from: "42" },
        { event: "message", data: { text: "It is a gift, so the sooner the better" }, id: "h2", at: now - 590_000, from: "42" },
        { event: "message", data: { text: "Hi Ben, it is being packed now. I will let you know." }, id: "h3", at: now - 500_000, from: "34" },
        { event: "reaction", data: { id: "h3", key: "2764" }, id: "h4", at: now - 490_000, from: "42" },
        { event: "message", data: { text: "It left this morning" }, id: "h5", at: now - 60_000, from: "34" },
    ] },
} );
const empty = fakeRoom( "chat:34:43", { members: { 34: { name: "Ann" }, 43: { name: "Cara" } } } );
const rt = fakeRooms( { shop, "chat:34:42": chat, "chat:34:43": empty }, { profiles: PEOPLE } );

function Typist() {
    const [ , set ] = useState( 0 );
    // Ben typing, a moment after the list has joined.
    useEffect( () => {
        const timer = setTimeout( () => { chat.fire( "typing", { on: true }, { from: "42" } ); set( 1 ); }, 300 );
        return () => clearTimeout( timer );
    }, [] );
    return <Typing rt={ rt } room="chat:34:42" />;
}

function App() {
    const link = ( key: string, value: string, label: string ) => {
        const next = new URLSearchParams( location.search );
        next.set( key, value );
        return <a href={ "?" + next.toString() }>{ label }</a>;
    };
    return <main className="preview" data-width={ width }>
        <div className="preview-bar">
            <span><b>Theme</b>{ link( "theme", "light", "light" ) } · { link( "theme", "dark", "dark" ) }</span>
            <span><b>Direction</b>{ link( "dir", "ltr", "left to right" ) } · { link( "dir", "rtl", "right to left" ) }</span>
            <span><b>Width</b>{ link( "width", "computer", "computer" ) } · { link( "width", "phone", "phone" ) }</span>
            { piecesFrom && <span><b>Your pieces</b>{ piecesFrom }</span> }
        </div>

        <Shot title="A call ringing in" note="the ring's card">
            <div className="realtime-calls"><div className="realtime-call-ring bm-toast-site-call">
                <RingCard user_id={ 42 } name="Ben" type="video" onAnswer={ () => {} } onReject={ () => {} } />
            </div></div>
        </Shot>
        <Shot title="Calling out"><Call layout="private" over={ { action: "outgoing_call", participants: two() } } /></Shot>
        <Shot title="Ringing in, on the call screen"><Call layout="private" over={ { action: "incoming_call", participants: two() } } /></Shot>
        <Shot title="Connecting"><Call layout="private" over={ { action: "connecting", statusMessage: "Connecting...", participants: two() } } /></Shot>
        <Shot title="In a call between two" note="no camera on the other side"><Call layout="private" over={ { participants: two() } } /></Shot>
        <Shot title="The other side's microphone off"><Call layout="private" over={ { participants: people( [ [ "me", {} ], [ "user_42", { micMuted: true } ] ] ) } } /></Shot>
        <Shot title="A camera or a microphone refused"><Call layout="private" over={ { action: "outgoing_call", participants: two(), errorMessages: [ "Camera access was denied" ] } } /></Shot>
        <Shot title="A group video call"><Call layout="group-video" over={ { participants: three() } } /></Shot>
        <Shot title="A group video call, as its moderator"><Call layout="group-video" over={ { participants: three(), adminMode: true } } /></Shot>
        <Shot title="A group audio call"><Call layout="group-audio" over={ { participants: three() } } /></Shot>

        <Shot title="Who is online">
            <div className="preview-online"><OnlineList rt={ rt } room="shop" actions={ () => <button type="button">Call</button> } /></div>
            <div><OnlineCount rt={ rt } room="shop" /></div>
        </Shot>
        <Shot title="Who is typing"><Typist /></Shot>

        <Shot title="A conversation"><div className="preview-chat"><Chat rt={ rt } room="chat:34:42" /></div></Shot>
        <Shot title="An empty conversation"><div className="preview-chat"><Chat rt={ rt } room="chat:34:43" /></div></Shot>
    </main>;
}

createRoot( document.getElementById( "preview" )! ).render( <PiecesProvider pieces={ appPieces }><App /></PiecesProvider> );
