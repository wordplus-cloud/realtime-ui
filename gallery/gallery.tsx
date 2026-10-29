// The package's gallery: every component in its states, on one page, for the picture checks (gallery.spec.ts). The
// page reads `?theme=light|dark` and `?dir=ltr|rtl`; the phone width is the browser's.
//
// Everything on it is fixed: the people, the times written out, a call's context faked (test/fake-call.ts), so a
// picture only changes when a component does.
import React, { createRef, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
    ActivityIndicator, Avatar, AvatarStack, ComposerRow, DaySeparator, DeletedBubble, EmptyThread, GroupAvatar, HoverActions,
    HoverButton, IncomingCallCard, MessageBody, MessageMeta, MessageStack, MessageText, MetaPieces, OnlineCount, OnlineList,
    PersonRow, PresenceLabel, ReactionPill, ReactionPills, ReadBy, RowAction, StatusTick, SystemRow, TypingDots, TypingPinned,
    UnreadDivider, configureUi, setUiUsers, AiWaiting, type DeliveryState,
} from "../src/index.ts";
import { CallScreen } from "../src/calls.ts";
import { fakeCall, participant } from "../test/fake-call.ts";

const params = new URLSearchParams( location.search );
document.body.classList.add( params.get( "theme" ) === "dark" ? "wplus-messages-dark" : "wplus-messages-light" );
document.documentElement.dir = params.get( "dir" ) === "rtl" ? "rtl" : "ltr";

const PEOPLE = {
    ann: { user_id: 34, name: "Ann", avatar: "avatars/ann.svg" },
    ben: { user_id: 42, name: "Ben", avatar: "avatars/ben.svg" },
    cara: { user_id: 43, name: "Cara", avatar: "avatars/cara.svg" },
};
setUiUsers( Object.values( PEOPLE ).map( ( p ) => [ p.user_id, { name: p.name, avatar: p.avatar } ] ) );
configureUi( { currentUserId: () => 34 } );

function Shot( { name, title, width, children }: { name: string; title: string; width?: number; children: React.ReactNode } ) {
    return (
        <section className="gallery-shot" data-shot={ name } style={ width ? { maxWidth: width } : undefined }>
            <h2>{ title }</h2>
            <div className="gallery-frame">{ children }</div>
        </section>
    );
}

const meta = ( time: string, status?: DeliveryState, extra: { edited?: boolean; pinned?: boolean } = {} ) => (
    <MessageMeta pieces={ ( interactive ) => (
        <MetaPieces interactive={ interactive } time={ { label: time } }
                    edited={ extra.edited ? { title: "Edited" } : null } pinned={ extra.pinned }
                    status={ status && <StatusTick status={ status } interactive={ interactive } /> } />
    ) } />
);

function Messages() {
    return (
        <div className="realtime-chat gallery-chat">
            <div className="wplus-msg-list-wrap">
                <div className="wplus-msg-list" data-typing="list">
                    <div className="wplus-msg-day">
                        <DaySeparator label="Today" />
                        <MessageStack isMe={ false } side="left" bubble="filled" avatar={ <Avatar user={ PEOPLE.ben } size={ 32 } title="" presence="online" /> } name={ <span className="wplus-name">Ben</span> }>
                            <MessageBody isMe={ false } data-has-text={ 1 }>
                                <MessageText><span className="wplus-chat-text">Hi! Has my order left yet?</span>{ meta( "10:02" ) }</MessageText>
                            </MessageBody>
                            <MessageBody isMe={ false } data-has-text={ 1 }>
                                <MessageText after={ <ReactionPills meta={ <MessageMeta variant="row" pieces={ ( i ) => <MetaPieces interactive={ i } time={ { label: "10:03" } } /> } /> }>
                                    <ReactionPill emoji="👍" count={ 1 } mine />
                                </ReactionPills> }>
                                    <span className="wplus-chat-text">It is a gift, so the sooner the better</span>
                                </MessageText>
                            </MessageBody>
                        </MessageStack>
                        <UnreadDivider />
                        <MessageStack isMe side="right" bubble="filled" name={ <span className="wplus-name">Ann</span> }>
                            <MessageBody isMe data-has-text={ 1 }>
                                <MessageText><span className="wplus-chat-text">Hi Ben, it is being packed now. I will let you know.</span>{ meta( "10:05", "seen", { edited: true } ) }</MessageText>
                            </MessageBody>
                            <MessageBody isMe data-has-text={ 1 }>
                                <MessageText after={ <ReactionPills meta={ <MessageMeta variant="row" pieces={ ( i ) => <MetaPieces interactive={ i } time={ { label: "10:06" } } status={ <StatusTick status="delivered" interactive={ i } /> } /> } /> }>
                                    <ReactionPill emoji="❤️" count={ 2 } />
                                    <ReactionPill emoji="🎉" count={ 1 } />
                                </ReactionPills> }>
                                    <span className="wplus-chat-text">It left this morning 📦</span>
                                </MessageText>
                            </MessageBody>
                            <MessageBody isMe data-has-text={ 1 }>
                                <MessageText><span className="wplus-chat-text">Tracking number to follow</span>{ meta( "10:07", "sending" ) }</MessageText>
                            </MessageBody>
                        </MessageStack>
                        <SystemRow type="user_joined" tone="success" icon="userPlus">Cara joined the conversation</SystemRow>
                        <MessageStack isMe={ false } side="left" bubble="filled" avatar={ <Avatar user={ PEOPLE.cara } size={ 32 } title="" /> } name={ <span className="wplus-name">Cara</span> }>
                            <DeletedBubble isMe={ false } time="10:09" />
                            <MessageBody isMe={ false } data-has-text={ 1 }>
                                <MessageText><AiWaiting /></MessageText>
                            </MessageBody>
                        </MessageStack>
                    </div>
                </div>
                <TypingPinned avatar={ <Avatar user={ PEOPLE.ben } size={ 18 } title="" /> }>
                    <ActivityIndicator compact names={ [ "Ben" ] } />
                </TypingPinned>
            </div>
        </div>
    );
}

function Composer( { text }: { text?: string } ) {
    const editable = useRef<HTMLDivElement>( null );
    // The editor's content is its host's: here, the text typed.
    useEffect( () => {
        if ( editable.current && text ) editable.current.textContent = text;
    }, [ text ] );
    return (
        <div className="realtime-chat gallery-composer">
            <div className="wplus-composer">
                <ComposerRow hostRef={ createRef() } editableRef={ editable } onInput={ () => {} } onKeyDown={ () => {} } placeholder="Write your message"
                             maxLength={ 100 } charCount={ text ? text.length : 0 } limited={ !! text } onSend={ () => {} } canSend={ !! text } hasContent={ !! text }
                             canRecordVoice={ ! text } canRecordVideo={ ! text } onStartVoice={ () => {} } onStartVideo={ () => {} }
                             onAttachClick={ () => {} } attachCount={ text ? 2 : 0 } onEmojiClick={ () => {} } pickerLabel="Emoji" />
            </div>
        </div>
    );
}

const callWith = ( people: Array<[ string, Partial<Parameters<typeof participant>[ 1 ]> ]>, over = {} ) => {
    const participants = new Map( people.map( ( [ id, extra ] ) => [ id, participant( id, extra ) ] ) );
    return { ...fakeCall( { participants, ...over } ), wrapper: createRef<HTMLDivElement>() as never };
};

function App() {
    return (
        <main className="gallery">
            <Shot name="ring" title="A call ringing" width={ 380 }>
                <div className="realtime-calls">
                    <div className="realtime-call-ring wplus-toast-site-call">
                        <IncomingCallCard user_id={ 42 } name="Ben" type="video" onAnswer={ () => {} } onReject={ () => {} } />
                    </div>
                </div>
            </Shot>

            <Shot name="private-call" title="A call between two" width={ 720 }>
                <div className="wplus-call-surface gallery-call" data-layout="private">
                    <CallScreen layout="private" call={ callWith( [ [ "user_34", { name: "Ann", avatar: PEOPLE.ann.avatar } ], [ "user_42", { name: "Ben", avatar: PEOPLE.ben.avatar } ] ],
                        { thread: { thread_id: 7, participants: [ 42 ] } } ) } />
                </div>
            </Shot>

            <Shot name="group-video" title="A group call" width={ 720 }>
                <div className="wplus-call-surface gallery-call" data-layout="video">
                    <CallScreen layout="group-video" call={ callWith( [
                        [ "user_34", { name: "Ann", avatar: PEOPLE.ann.avatar } ],
                        [ "user_42", { name: "Ben", avatar: PEOPLE.ben.avatar, isSpeaking: true, audioLevel: 0.6 } ],
                        [ "user_43", { name: "Cara", avatar: PEOPLE.cara.avatar, micMuted: true, handRaised: true } ],
                    ] ) } />
                </div>
            </Shot>

            <Shot name="group-audio" title="A group audio call" width={ 520 }>
                <div className="wplus-call-surface gallery-call" data-layout="audio">
                    <CallScreen layout="group-audio" call={ callWith( [
                        [ "user_34", { name: "Ann", avatar: PEOPLE.ann.avatar } ],
                        [ "user_42", { name: "Ben", avatar: PEOPLE.ben.avatar, isSpeaking: true } ],
                        [ "user_43", { name: "Cara", avatar: PEOPLE.cara.avatar, micMuted: true } ],
                    ] ) } />
                </div>
            </Shot>

            <Shot name="presence" title="Presence" width={ 520 }>
                <div className="gallery-row">
                    <Avatar user={ PEOPLE.ann } size={ 48 } presence="online" title="" />
                    <Avatar user={ PEOPLE.ben } size={ 40 } presence="away" title="" />
                    <Avatar user={ PEOPLE.cara } size={ 32 } presence="busy" title="" />
                    <Avatar user={ { user_id: 50, name: "Dan" } } size={ 32 } title="" />
                    <GroupAvatar users={ [ PEOPLE.ann, PEOPLE.ben, PEOPLE.cara ] } size={ 40 } />
                    <AvatarStack users={ [ PEOPLE.ann, PEOPLE.ben, PEOPLE.cara, PEOPLE.ann, PEOPLE.ben ] } size={ 28 } max={ 3 } />
                </div>
                <div className="gallery-row">
                    <PresenceLabel presence="online" />
                    <PresenceLabel presence="offline" detail="Active 5 minutes ago" />
                    <PresenceLabel presence="online" label="In a meeting" color="#d97706" />
                    <TypingDots />
                    <ActivityIndicator entries={ [ { name: "Ben", activity: "typing" }, { name: "Cara", activity: "recording" } ] } />
                    <ReadBy users={ [ PEOPLE.ben, PEOPLE.cara ] } />
                </div>
            </Shot>

            <Shot name="online" title="Who is online" width={ 260 }>
                <div className="gallery-online">
                    <OnlineList count={ 3 } onClose={ () => {} }>
                        <PersonRow avatar={ <Avatar user={ PEOPLE.ann } size={ 32 } presence="online" title="" /> } name="Ann" sub="You" />
                        <PersonRow avatar={ <Avatar user={ PEOPLE.ben } size={ 32 } presence="online" title="" /> } name="Ben" sub="Customer"
                                   actions={ <span className="wplus-conv-admin__member-actions"><RowAction icon="phone" label="Audio Call" onClick={ () => {} } /><RowAction icon="video" label="Video Call" onClick={ () => {} } /></span> } />
                        <PersonRow avatar={ <Avatar user={ PEOPLE.cara } size={ 32 } presence="online" title="" /> } name="Cara" sub="Warehouse"
                                   actions={ <span className="wplus-conv-admin__member-actions"><RowAction icon="video" label="Video Call" onClick={ () => {} } /></span> } />
                    </OnlineList>
                </div>
                <div className="gallery-row"><OnlineCount count={ 7 } /><OnlineCount count={ 230 } /></div>
            </Shot>

            <Shot name="messages" title="A conversation" width={ 560 }>
                <Messages />
            </Shot>

            <Shot name="hover-actions" title="A message hovered" width={ 560 }>
                <div className="realtime-chat gallery-chat gallery-short">
                    <div className="wplus-msg-list-wrap"><div className="wplus-msg-list"><div className="wplus-msg-day">
                        <MessageStack isMe={ false } side="left" bubble="filled" avatar={ <Avatar user={ PEOPLE.ben } size={ 32 } title="" /> } name={ <span className="wplus-name">Ben</span> }>
                            <MessageBody isMe={ false } data-has-text={ 1 } data-actions="1" className="wplus-msg-body wplus-message gallery-hovered">
                                <MessageText><span className="wplus-chat-text">Can I change the address?</span>{ meta( "10:12" ) }</MessageText>
                                <HoverActions>
                                    <HoverButton icon="more" label="More actions" />
                                    <HoverButton icon="reply" label="Reply" />
                                    <HoverButton icon="star" label="Favorite" modifier="favorite" active />
                                </HoverActions>
                            </MessageBody>
                        </MessageStack>
                    </div></div></div>
                </div>
            </Shot>

            <Shot name="composer" title="The composer" width={ 560 }>
                <Composer />
                <Composer text="It left this morning" />
            </Shot>

            <Shot name="empty" title="An empty conversation" width={ 560 }>
                <div className="realtime-chat gallery-short"><div className="wplus-msg-list-wrap"><div className="wplus-msg-list"><EmptyThread /></div></div></div>
            </Shot>
        </main>
    );
}

createRoot( document.getElementById( "gallery" )! ).render( <App /> );
