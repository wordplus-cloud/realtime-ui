import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { ActivityIndicator, Avatar } from "../components/presence/presence.tsx";
import { DaySeparator, EmptyThread, MessageBody, MessageMeta, MessageStack, MessageText, MetaPieces, StatusTick, TypingPinned } from "../components/chat/message-parts.tsx";
import { ComposerRow } from "../components/chat/composer-row.tsx";
import { ReactionPicker, ReactionPill, ReactionPills, decodeReaction } from "../components/chat/reactions.tsx";
import Btn from "../inc/helpers/btn.tsx";
import Icon from "../primitives/icon.tsx";
import { host } from "../host.ts";
import { __, _x, sprintf } from "../inc/globals.ts";
import { plainName } from "../inc/names.ts";
import type { SdkRooms } from "./rooms.ts";
import { grouped, useChat, type ChatEvents, type ChatFile, type ChatLoader, type SentMessage } from "./use-chat.ts";
import { routeLoader } from "./route-loader.ts";
import { Piece, PiecesProvider, type Pieces } from "../pieces.tsx";
import Tooltip from "../primitives/tooltip.tsx";
import { useChatCall, useChatPeer, useStartCall, type ChatCall, type ChatPeer } from "./chat-call.tsx";
import { DropStrip, ImageViewer, MessageFiles, StagedFiles, routeUploader, type ChatUploader, type StagedFile, type ViewedImage } from "./chat-files.tsx";

export type { StoredMessage, ChatPage, ChatLoader, SentMessage, ChatFile } from "./use-chat.ts";
export type { ChatUploader } from "./chat-files.tsx";

// Better Messages' conversation on one of an app's rooms, drawn from useChat (use-chat.ts), which runs it: its message
// list (days, a sender's stacks, bubbles with their time and ticks, reactions, pictures and files), who is typing, the
// older messages paged back as the reader scrolls up, and its composer, which takes files where the app gives the chat
// its `upload`: each goes up to the app's own server as it is picked, and the message carries where it is.

export interface ChatProps {
    rt: SdkRooms | null | undefined;
    /** A room of the app's whose rule lets its members emit `message` (and `typing`, `reaction`, `read`). */
    room: string;
    /** The events' names, where the app's are others. */
    events?: ChatEvents;
    /** The reactions to pick from, as emoji or 2.0's hex keys; none for a conversation without them. */
    reactions?: string[];
    /** The longest message, in characters: none by default. */
    maxLength?: number;
    /** What the empty composer says. */
    placeholder?: string;
    /** The language the times and days are written in: the page's by default. */
    locale?: string;
    /**
     * The conversation the app's server keeps: the newest page for `null`, else the page before the message given, the
     * oldest the chat shows. Each message carries the id of the room event that brought it (its webhook's `event_id`).
     */
    load?: ChatLoader;
    /**
     * The app's route for the messages it kept, asked with the page's cookies, `?before=<id>` for the page before a
     * message, as `<chat-room messages>` asks it: `load` when the app asks another way.
     */
    messages?: string;
    /** Called as the room takes a message of the page user: for the page to tell its own server (useChat's `onSent`). */
    onSent?: ( message: SentMessage ) => void;
    /**
     * Files in the conversation: the app's route that takes one (`POST`, with the page's cookies, a form of the `file`
     * and the chat's `room`), answering it as the app keeps it (`ChatFile`), or a function that takes it up another way.
     * With it, the composer has its paperclip, and takes files pasted or dropped on the chat. The app's server keeps
     * the files and decides who opens them: the room carries only where each is.
     */
    upload?: string | ChatUploader;
    /** The files the picker offers, as an input's `accept`: `"image/*,.pdf"`. Every kind by default. */
    accept?: string;
    /** The largest file, in bytes, refused before it goes up: none by default, the app's server deciding. */
    maxFileSize?: number;
    /** The most files in one message: 10 by default. */
    maxFiles?: number;
    /**
     * The hosts the app keeps files on beside its own site, such as its storage's (`"files.example.com"`): a message's
     * file elsewhere is not shown, as a member may write any address into a message of their own.
     */
    fileHosts?: string[];
    /**
     * The other person, in a chat between two: their id. The chat shows them on its top bar, online or not, with their
     * calls where it has its `call`.
     */
    to?: string | number;
    /**
     * The other person's name and picture (`to`), where the page has them, as `CallButton` takes them: on the top bar
     * at once and in their call's window. Without them, the directory's, which knows a person for a day after they were
     * last online.
     */
    name?: string;
    avatar?: string;
    /**
     * The names and pictures of the people in a group conversation, by id, where the page has them, as `name` and
     * `avatar` give the other person's in a chat between two: on their messages and as they type. Someone the page
     * leaves out takes the directory's, which knows a person for a day after they were last online, so the older
     * messages of a channel keep the names of those who wrote them.
     */
    people?: Record<string, { name: string; avatar?: string }>;
    /**
     * The conversation's own call, which shows in the chat while it is on: `true` for the call named as the room, or
     * the call's name (`{pair}` the page's user and `to` in order). Beside the messages where the chat is wide, over
     * them where it is narrow, its controls showing and hiding them. The page's CallScreen rings for it and runs it,
     * and the `rt` gives its calls (`useRealtime()`).
     */
    call?: boolean | string;
    /**
     * Calls `to` as the chat opens, once: for the page a call button elsewhere opens, such as Video on a list of people,
     * so the call starts in the chat rather than where the button was. Needs `to` and `call`.
     */
    startCall?: "video" | "audio";
    /** The app's own pieces in place of ours: `Message`, `Composer`, `EmptyConversation`, `ChatHeader` (pieces.tsx). */
    components?: Pieces;
}

/** The reactions a conversation offers when the app names none. */
export const DEFAULT_REACTIONS = [ "1f44d", "2764", "1f602", "1f62e", "1f622", "1f64f" ];

/**
 * Each day's label pinned to the top of the list (pushed down from its place at the head of its day) is marked
 * --stuck, and --faded too while the list rests: pinned, it says which day the reader scrolls through, and at rest it
 * would sit over the messages under it (styles/chat/_messages.scss). With `animate` off a label takes its state at
 * once, as a conversation opening needs. Better Messages' thread column does the same, measuring only the days around
 * the top edge of its longer lists. All reads first, then the writes, so no class flip lays the list out again.
 */
function markStuckDays( list: HTMLElement, atRest: boolean, animate: boolean ) {
    const labels: Array<[ Element, boolean ]> = [];
    for ( const day of list.querySelectorAll<HTMLElement>( ":scope > .wplus-msg-day" ) ) {
        const label = day.firstElementChild;
        if ( label?.classList.contains( "wplus-day-sep" ) ) labels.push( [ label, label.getBoundingClientRect().top - day.getBoundingClientRect().top > 4 ] );
    }
    for ( const [ label, stuck ] of labels ) {
        const faded = stuck && atRest;
        label.classList.toggle( "wplus-day-sep--stuck", stuck );
        if ( label.classList.contains( "wplus-day-sep--faded" ) !== faded ) {
            label.classList.toggle( "wplus-day-sep--instant", ! animate );
            label.classList.toggle( "wplus-day-sep--faded", faded );
        }
    }
}

export function Chat( { components, messages, load, ...props }: ChatProps ) {
    const fromRoute = useMemo( () => routeLoader( messages ), [ messages ] );
    return <PiecesProvider pieces={ components }><Conversation { ...props } load={ load ?? fromRoute } /></PiecesProvider>;
}

function Conversation( { rt, room, events, reactions = DEFAULT_REACTIONS, maxLength = 0, placeholder, locale, load, onSent, upload, accept, maxFileSize = 0, maxFiles = 10,
                         fileHosts, to, name, avatar, people, call, startCall }: Omit<ChatProps, "components"> ) {
    const chat = useChat( { rt, room, events, maxLength, load, onSent } );
    const files = useStagedFiles( upload, room, maxFileSize, maxFiles );
    const [ viewing, setViewing ] = useState<{ images: ViewedImage[]; index: number } | null>( null );
    const view = ( images: ViewedImage[], index: number ) => setViewing( { images, index } );
    const { me, messages, history, writers } = chat;
    const other = to === undefined || to === null || to === "" ? null : String( to );
    const ownCall = useChatCall( rt, room, call, other );
    const peer = useChatPeer( rt, other, chat.person, { name, avatar } );
    // The other person, and anyone of a group, by the name and picture the page gave, on their messages too.
    const person = ( id: string ) => {
        if ( peer && id === peer.id ) return { ...chat.person( id ), name: peer.name, avatar: peer.avatar };
        const given = people?.[ id ];
        return given ? { ...chat.person( id ), name: given.name, ...( given.avatar ? { avatar: given.avatar } : {} ) } : chat.person( id );
    };
    useStartCall( ownCall, startCall, peer );
    const lang = locale ?? ( ( typeof document !== "undefined" && document.documentElement.lang ) || undefined );

    const [ text, setText ] = useState( "" );
    const [ scrolledUp, setScrolledUp ] = useState( false );
    const listRef = useRef<HTMLDivElement | null>( null );
    const hostRef = useRef<HTMLDivElement | null>( null );
    const editableRef = useRef<HTMLDivElement | null>( null );
    const pickerRef = useRef<HTMLInputElement | null>( null );
    const joined = chat.state === "joined";
    const removed = chat.state === "failed" && chat.error === "kicked";

    // Whether the list rests, and the timer that says so once it stops scrolling.
    const atRestRef = useRef( true );
    const restTimerRef = useRef( 0 );
    useEffect( () => () => window.clearTimeout( restTimerRef.current ), [] );

    // Paged back as the reader nears the top: the list is column-reverse, so its scrollTop is 0 at the bottom. A day's
    // label pinned to the top shows while the list scrolls, and fades once it rests.
    const onScroll = () => {
        const list = listRef.current;
        if ( ! list ) return;
        setScrolledUp( list.scrollTop < -80 );
        if ( list.scrollHeight + list.scrollTop - list.clientHeight <= 120 ) chat.older();
        atRestRef.current = false;
        markStuckDays( list, false, true );
        window.clearTimeout( restTimerRef.current );
        restTimerRef.current = window.setTimeout( () => {
            atRestRef.current = true;
            if ( listRef.current ) markStuckDays( listRef.current, true, true );
        }, 900 );
    };

    // The newest message from someone else, once on screen: read, for their ticks.
    useEffect( () => {
        if ( scrolledUp || ( typeof document !== "undefined" && document.visibilityState === "hidden" ) ) return;
        chat.markRead();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ messages, scrolledUp, me, joined ] );

    // A message, from our composer or an app's own (the `Composer` piece), with the newest in view.
    const sendText = async ( value: string, attached: ChatFile[] = [] ) => {
        listRef.current?.scrollTo( { top: 0 } );
        await chat.send( value, attached );
    };

    // What our composer holds, sent with the files that went up, and the composer emptied. A file still on its way up
    // holds Send back; one that failed stays, saying why, until it is removed.
    const send = async () => {
        const words = text.trim();
        const ready = files.ready();
        if ( ( ! words && ! ready.length ) || ! joined || files.uploading || ( maxLength > 0 && words.length > maxLength ) ) return;
        setText( "" );
        if ( editableRef.current ) editableRef.current.textContent = "";
        files.sent();
        await sendText( words, ready );
    };

    const onInput = ( e: FormEvent<HTMLDivElement> ) => {
        const value = e.currentTarget.innerText.replace( /\n$/, "" );
        setText( value );
        if ( value.trim() ) chat.typing();
    };
    const onKeyDown = ( e: KeyboardEvent<HTMLDivElement> ) => {
        if ( e.key === "Enter" && ! e.shiftKey && ! e.nativeEvent.isComposing ) {
            e.preventDefault();
            void send();
        }
    };
    // Plain text only: what is pasted goes in as text, never as markup. Files pasted, a screenshot among them, go up as
    // picked ones do, where the chat takes files.
    const onPaste = ( e: ClipboardEvent<HTMLDivElement> ) => {
        e.preventDefault();
        const pasted = Array.from( e.clipboardData.files ?? [] );
        if ( pasted.length && files.can ) {
            files.add( pasted );
            return;
        }
        document.execCommand( "insertText", false, e.clipboardData.getData( "text/plain" ) );
    };

    // Files dragged over the chat: the strip over the composer takes them, wherever on the chat they are dropped.
    const [ dragging, setDragging ] = useState( false );
    const depth = useRef( 0 );
    const carriesFiles = ( e: DragEvent ) => Array.from( e.dataTransfer?.types ?? [] ).includes( "Files" );
    const dropping = files.can ? {
        onDragEnter: ( e: DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            depth.current += 1;
            setDragging( true );
        },
        onDragOver: ( e: DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: ( e: DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            depth.current = Math.max( 0, depth.current - 1 );
            if ( depth.current === 0 ) setDragging( false );
        },
        onDrop: ( e: DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            depth.current = 0;
            setDragging( false );
            files.add( Array.from( e.dataTransfer.files ) );
        },
    } : {};

    const time = useMemo( () => new Intl.DateTimeFormat( lang, { hour: "2-digit", minute: "2-digit" } ), [ lang ] );
    const full = useMemo( () => new Intl.DateTimeFormat( lang, { dateStyle: "medium", timeStyle: "medium" } ), [ lang ] );
    const dayLabel = ( at: number ) => {
        const date = new Date( at );
        const today = new Date();
        const yesterday = new Date( today.getFullYear(), today.getMonth(), today.getDate() - 1 );
        if ( date.toDateString() === today.toDateString() ) return _x( "Today", "Messages stack date (today)", "bp-better-messages" );
        if ( date.toDateString() === yesterday.toDateString() ) return _x( "Yesterday", "Messages stack date (yesterday)", "bp-better-messages" );
        return new Intl.DateTimeFormat( lang, { month: "long", day: "numeric", ...( date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {} ) } ).format( date );
    };

    // The newest message in view when one arrives at the bottom.
    useLayoutEffect( () => {
        const list = listRef.current;
        if ( list && list.scrollTop > -80 ) list.scrollTop = 0;
    }, [ messages.length ] );

    // Before paint, the day labels the messages pinned: at once as the conversation opens, fading as an arrival pushes
    // one into its pin after that.
    const openedRef = useRef( false );
    useLayoutEffect( () => {
        const list = listRef.current;
        if ( ! list ) return;
        markStuckDays( list, atRestRef.current, openedRef.current );
        if ( messages.length > 0 ) openedRef.current = true;
    }, [ messages ] );

    // The list as it mounts, and again as a call puts it in a column beside the call: its labels follow its height.
    const watchRef = useRef<ResizeObserver | null>( null );
    const setList = useCallback( ( list: HTMLDivElement | null ) => {
        listRef.current = list;
        watchRef.current?.disconnect();
        watchRef.current = null;
        if ( ! list || typeof ResizeObserver === "undefined" ) return;
        watchRef.current = new ResizeObserver( () => markStuckDays( list, atRestRef.current, false ) );
        watchRef.current.observe( list );
    }, [] );

    const days = grouped( messages );
    const lead = writers[ 0 ];

    const conversation = <>
            <div className="wplus-msg-list-wrap">
                <div ref={ setList } className="wplus-msg-list" onScroll={ onScroll } data-typing={ writers.length > 0 ? "list" : undefined }>
                    { [ ...days ].reverse().map( ( day ) => (
                        <div key={ day.day } className="wplus-msg-day">
                            <DaySeparator label={ dayLabel( day.at ) } title={ new Intl.DateTimeFormat( lang, { dateStyle: "full" } ).format( new Date( day.at ) ) } />
                            { day.stacks.map( ( stack ) => {
                                const isMe = stack.from === me;
                                const sender = person( stack.from );
                                return (
                                    <MessageStack key={ stack.messages[ 0 ].key } isMe={ isMe } side={ isMe ? "right" : "left" } bubble="filled"
                                                  avatar={ ! isMe && <Avatar user={ sender } size={ 32 } title="" presenceRing="rgba(var(--wplus-color-chat-bg), 1)" /> }
                                                  name={ <span className="wplus-name">{ plainName( sender.name ) }</span> }>
                                        { stack.messages.map( ( m ) => {
                                            const status = isMe ? chat.statusOf( m ) : undefined;
                                            const pills = Object.entries( m.reactions ).filter( ( [ , users ] ) => users.length > 0 );
                                            const hasText = m.text.length > 0;
                                            const hasFiles = m.files.length > 0;
                                            const meta = ( variant: "inline" | "row" ) => (
                                                <MessageMeta variant={ variant } pieces={ ( interactive ) => (
                                                    <MetaPieces interactive={ interactive }
                                                                time={ { label: time.format( m.at ), title: full.format( m.at ) } }
                                                                status={ status && <StatusTick status={ status } interactive={ interactive } /> } />
                                                ) } />
                                            );
                                            return (
                                                <Piece key={ m.key } name="Message"
                                                       props={ { message: m, mine: isMe, sender,
                                                                 react: isMe || ! reactions.length ? undefined : ( key: string ) => void chat.react( m, key ) } }>
                                                <MessageBody isMe={ isMe } data-has-text={ hasText ? 1 : 0 } data-has-files={ hasFiles ? 1 : undefined } data-message-id={ m.id ?? undefined } part="message"
                                                             data-outbox={ m.status === "failed" || m.status === "sending" ? m.status : undefined }
                                                             after={ ! hasText && (
                                                                 // Files alone: the time, the ticks and the reactions in a row under them.
                                                                 <ReactionPills meta={ meta( "row" ) }>
                                                                     { pills.map( ( [ key, users ] ) => (
                                                                         <ReactionPill key={ key } emoji={ decodeReaction( key ) } count={ users.length } mine={ !! me && users.includes( me ) }
                                                                                       onClick={ isMe || ! reactions.length ? undefined : () => void chat.react( m, key ) } />
                                                                     ) ) }
                                                                 </ReactionPills>
                                                             ) }>
                                                    { hasFiles && <MessageFiles files={ m.files } hosts={ fileHosts } attached={ hasText } onOpen={ view } /> }
                                                    { hasText && <MessageText after={ pills.length > 0 && (
                                                        <ReactionPills meta={ meta( "row" ) }>
                                                            { pills.map( ( [ key, users ] ) => (
                                                                <ReactionPill key={ key } emoji={ decodeReaction( key ) } count={ users.length } mine={ !! me && users.includes( me ) }
                                                                              onClick={ isMe || ! reactions.length ? undefined : () => void chat.react( m, key ) } />
                                                            ) ) }
                                                        </ReactionPills>
                                                    ) }>
                                                        <span className="wplus-chat-text">{ m.text }</span>
                                                        { pills.length === 0 && meta( "inline" ) }
                                                    </MessageText> }
                                                    { ! isMe && m.id && reactions.length > 0 && (
                                                        <ReactionPicker keys={ reactions }
                                                                        mine={ me ? Object.entries( m.reactions ).find( ( [ , users ] ) => users.includes( me ) )?.[ 0 ] : undefined }
                                                                        onPick={ ( key ) => void chat.react( m, key ) } />
                                                    ) }
                                                </MessageBody>
                                                </Piece>
                                            );
                                        } ) }
                                    </MessageStack>
                                );
                            } ) }
                        </div>
                    ) ) }
                    { messages.length === 0 && ! history.loading && writers.length === 0 && <Piece name="EmptyConversation" props={ {} }><EmptyThread /></Piece> }
                    { messages.length > 0 && (
                        <div className="wplus-history-start"
                             data-visible={ history.loading || ! history.more ? 1 : undefined }
                             data-loading={ history.loading ? 1 : undefined }>
                            { history.loading
                                ? _x( "Loading...", "Label at the start of messages list in conversation while loading", "bp-better-messages" )
                                : ! history.more
                                    ? _x( "Start of conversation", "Label at the start of messages list in conversation", "bp-better-messages" )
                                    : " " }
                        </div>
                    ) }
                </div>

                { lead && (
                    <TypingPinned avatar={ <Avatar user={ person( lead ) } size={ 18 } title="" presenceRing="rgba(var(--wplus-color-bg-elevated), 1)" /> }>
                        <ActivityIndicator compact entries={ writers.map( ( id ) => ( { activity: "typing" as const, name: person( id ).name ? host().nameHtml( person( id ).name ) : null } ) ) } />
                    </TypingPinned>
                ) }

                { scrolledUp && (
                    <Btn className="wplus-scroll-pill" aria-label={ _x( "Scroll to latest", "Conversation", "bp-better-messages" ) }
                         onClick={ () => listRef.current?.scrollTo( { top: 0, behavior: "smooth" } ) }>
                        <Icon name="chevronD" size={ 18 } />
                    </Btn>
                ) }
            </div>

            { /* Taken out of the room by the app server: said in place of the composer, whose placeholder and Send arrow
                 read as usable when only switched off (an SDK review, 2026-10-14). */ }
            { removed &&
                <div className="wplus-chat-removed" role="status">{ __( "Removed from conversation", "bp-better-messages" ) }</div> }

            { ! removed && <div className="wplus-composer" part="composer">
                <Piece name="Composer" props={ { send: sendText, typing: chat.typing, disabled: ! joined, maxLength,
                                                 placeholder: placeholder ?? _x( "Write your message", "Reply area placeholder", "bp-better-messages" ),
                                                 upload: files.uploader } }>
                <StagedFiles staged={ files.staged } onRemove={ files.remove } onOpen={ view } />
                { files.can && (
                    // Out of sight, in the layout: iOS Safari opens no picker for an input that is not.
                    <input ref={ pickerRef } type="file" multiple accept={ accept } className="wplus-attachments-input" tabIndex={ -1 } aria-hidden="true"
                           onChange={ ( e ) => {
                               files.add( Array.from( e.currentTarget.files ?? [] ) );
                               e.currentTarget.value = "";
                           } } />
                ) }
                <ComposerRow
                    hostRef={ hostRef }
                    editableRef={ editableRef }
                    onInput={ onInput }
                    onKeyDown={ onKeyDown }
                    onPaste={ onPaste }
                    placeholder={ placeholder ?? _x( "Write your message", "Reply area placeholder", "bp-better-messages" ) }
                    disabled={ ! joined }
                    maxLength={ maxLength }
                    charCount={ text.length }
                    limited={ maxLength > 0 }
                    onSend={ () => void send() }
                    canSend={ ( text.trim().length > 0 || files.ready().length > 0 ) && ! files.uploading && joined }
                    hasContent={ text.trim().length > 0 || files.staged.length > 0 }
                    sending={ files.uploading }
                    attachCount={ files.staged.length }
                    onAttachClick={ files.can && joined ? () => pickerRef.current?.click() : undefined }
                    canRecordVoice={ false }
                    canRecordVideo={ false }
                />
                </Piece>
                { dragging && <DropStrip over /> }
            </div> }
    </>;

    // A chat between two, or with its call: the other person on top, and the call beside the conversation or over it.
    // `data-call` holds the call's name while it is in the chat, `data-call-chat` whether the messages show with it, and
    // `data-call-layout` where: `beside` them, or `over` them in a narrow chat.
    const { here, chatShown } = ownCall;
    return (
        <div className="realtime-chat" data-call={ here ? ownCall.name ?? undefined : undefined } data-call-chat={ here ? ( chatShown ? "1" : "0" ) : undefined }
             data-call-layout={ here ? ( ownCall.narrow ? "over" : "beside" ) : undefined } { ...dropping }>
            { peer && <ChatTop peer={ peer } call={ ownCall } /> }
            { peer || ownCall.name !== null
                ? <div ref={ ownCall.body } className="realtime-chat-body">
                    { ownCall.name !== null && <div ref={ ownCall.spot } className="realtime-call-spot realtime-chat-call" /> }
                    <div className="realtime-chat-col">{ conversation }</div>
                </div>
                : conversation }
            { /* Here, not over the message list: the list is a size container, which would hold a fixed viewer inside it. */ }
            { viewing && <ImageViewer images={ viewing.images } index={ viewing.index } onClose={ () => setViewing( null ) } /> }
        </div>
    );
}

/** A picked file as it goes up, then as the app's server keeps it. */
interface Picked extends StagedFile {
    abort: AbortController;
}

/**
 * The files the user picked for the next message: each goes up to the app's server at once, so Send has nothing left
 * to wait for, and a picture shows from this page while it does. Refused at once when over the size or the count.
 */
function useStagedFiles( upload: string | ChatUploader | undefined, room: string, maxFileSize: number, maxFiles: number ) {
    const [ staged, setStaged ] = useState<Picked[]>( [] );
    const uploader = useMemo<ChatUploader | undefined>( () => ( typeof upload === "string" ? routeUploader( upload, room ) : upload ), [ upload, room ] );
    const update = ( key: string, change: Partial<Picked> ) => setStaged( ( list ) => list.map( ( s ) => ( s.key === key ? { ...s, ...change } : s ) ) );
    const forget = ( s: Picked ) => {
        s.abort.abort();
        if ( s.preview ) URL.revokeObjectURL( s.preview );
    };
    // The pictures made on this page, let go with the chat.
    const current = useRef( staged );
    current.current = staged;
    useEffect( () => () => current.current.forEach( forget ), [] );

    const add = ( picked: File[] ) => {
        if ( ! uploader ) return;
        const left = Math.max( 0, maxFiles - current.current.length );
        for ( const file of picked.slice( 0, left ) ) {
            const key = `f${ Date.now() }-${ Math.random().toString( 36 ).slice( 2 ) }`;
            const tooLarge = maxFileSize > 0 && file.size > maxFileSize;
            const entry: Picked = {
                key, name: file.name, type: file.type, size: file.size, abort: new AbortController(),
                preview: file.type.startsWith( "image/" ) && typeof URL.createObjectURL === "function" ? URL.createObjectURL( file ) : null,
                status: tooLarge ? "error" : "uploading", progress: 0,
                error: tooLarge ? sprintf( _x( "Exceeds maximum size of %s MB", "Native uploader: rejected oversized file", "bp-better-messages" ), Math.round( maxFileSize / 1024 / 1024 * 10 ) / 10 ) : undefined,
            };
            setStaged( ( list ) => [ ...list, entry ] );
            if ( tooLarge ) continue;
            uploader( file, ( done ) => update( key, { progress: Math.min( 1, Math.max( 0, done ) ) } ), entry.abort.signal ).then(
                ( kept ) => update( key, { status: "done", progress: 1, file: kept } ),
                ( error: unknown ) => {
                    if ( entry.abort.signal.aborted ) return;
                    update( key, { status: "error", error: error instanceof Error ? error.message : "" } );
                },
            );
        }
    };
    const remove = ( key: string ) => {
        const gone = current.current.find( ( s ) => s.key === key );
        if ( gone ) forget( gone );
        setStaged( ( list ) => list.filter( ( s ) => s.key !== key ) );
    };
    const ready = () => staged.flatMap( ( s ) => ( s.status === "done" && s.file ? [ s.file ] : [] ) );
    // Sent: the files that went up leave the composer, their pictures with them. Those that failed stay, saying why.
    const sent = () => {
        for ( const s of current.current ) if ( s.status === "done" && s.preview ) URL.revokeObjectURL( s.preview );
        setStaged( ( list ) => list.filter( ( s ) => s.status !== "done" ) );
    };

    return { can: !! uploader, uploader, staged, add, remove, ready, sent, uploading: staged.some( ( s ) => s.status === "uploading" ) };
}

/** The chat's top bar: the other person, and the call buttons where the chat has its call. */
function ChatTop( { peer, call }: { peer: ChatPeer; call: ChatCall } ) {
    const place = call.place && ( ( type: "audio" | "video" ) => call.place!( type, { name: peer.name, avatar: peer.avatar } ) );
    const person = { id: peer.id, name: peer.name, avatar: peer.avatar };

    return (
        <Piece name="ChatHeader" props={ { person, online: peer.online, call: place, calling: call.busy } }>
            <div className="realtime-chat-top" part="chat-header">
                <Avatar user={ peer } size={ 36 } title="" />
                <div className="realtime-chat-top__who">
                    <span className="realtime-chat-top__name">{ plainName( peer.name ) }</span>
                    { peer.online && <span className="realtime-chat-top__online">{ _x( "Online", "User online status", "bp-better-messages" ) }</span> }
                </div>
                { place && <div className="realtime-chat-top__calls">
                    <TopButton icon="phone" label={ _x( "Audio Call", "Users List", "bp-better-messages" ) } disabled={ call.busy } onClick={ () => place( "audio" ) } />
                    <TopButton icon="video" label={ _x( "Video Call", "Users List", "bp-better-messages" ) } disabled={ call.busy } onClick={ () => place( "video" ) } />
                </div> }
            </div>
        </Piece>
    );
}

function TopButton( { icon, label, disabled, onClick }: { icon: "phone" | "video"; label: string; disabled: boolean; onClick: () => void } ) {
    return (
        <Tooltip label={ label }>
            <Btn className="realtime-chat-top__call" data-call-type={ icon === "phone" ? "audio" : "video" } aria-label={ label } disabled={ disabled } onClick={ onClick }>
                <Icon name={ icon } size={ 20 } />
            </Btn>
        </Tooltip>
    );
}
