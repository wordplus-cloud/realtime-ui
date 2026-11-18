import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import Btn from "../inc/helpers/btn.tsx";
import Icon from "../primitives/icon.tsx";
import { _x, sprintf } from "../inc/globals.ts";
import type { ChatFile } from "./use-chat.ts";

// The files of a chat (chat.tsx's `upload`), drawn as Better Messages draws them: a message's pictures in a grid of 1,
// 2, 3 or 2 by 2 that opens them large, a video with its player, any other file as a row with its kind's badge, and
// the files the user picked waiting above the composer, each as a chip that fills while it goes up. The app's own
// server takes each file (`routeUploader`) and keeps it: the room carries only where it is.
//
// Styles: styles/chat/_attachments.scss.

/** How a file is drawn and coloured: its badge's colour in Better Messages. */
export type FileKind = "image" | "video" | "audio" | "pdf" | "doc" | "code" | "archive" | "file";

const DOCS = new Set( [ "doc", "docx", "odt", "txt", "rtf", "md", "xls", "xlsx", "ppt", "pptx", "csv", "ods", "odp" ] );
const CODE = new Set( [ "json", "js", "ts", "tsx", "jsx", "html", "css", "scss", "py", "rb", "php", "sh", "yaml", "yml", "xml" ] );
const ARCHIVES = new Set( [ "zip", "rar", "7z", "tar", "gz", "bz2" ] );

/** A file's kind, by its media type, else by its extension. */
export function kindOf( type: string | undefined, name: string | undefined ): FileKind {
    const media = ( type ?? "" ).toLowerCase();
    if ( media.startsWith( "image/" ) ) return "image";
    if ( media.startsWith( "video/" ) ) return "video";
    if ( media.startsWith( "audio/" ) ) return "audio";
    if ( media === "application/pdf" ) return "pdf";
    const ext = extensionOf( name );
    if ( ext === "pdf" ) return "pdf";
    if ( DOCS.has( ext ) ) return "doc";
    if ( CODE.has( ext ) ) return "code";
    if ( ARCHIVES.has( ext ) ) return "archive";
    return "file";
}

const extensionOf = ( name: string | undefined ) => ( name?.includes( "." ) ? name.split( "." ).pop() ?? "" : "" ).toLowerCase();

/** The few letters on a file's badge: its extension, or its kind's where that is long or missing. */
export function badgeOf( name: string | undefined, kind: FileKind ): string {
    const ext = extensionOf( name );
    if ( ext && ext.length <= 4 ) return ext.toUpperCase();
    return { image: "IMG", video: "VID", audio: "AUD", pdf: "PDF", doc: "DOC", code: "CODE", archive: "ZIP", file: "FILE" }[ kind ];
}

/** A size as people read it: 820 KB, 4.2 MB. */
export function bytesLabel( n: number | undefined ): string {
    if ( ! n ) return "";
    if ( n < 1024 ) return `${ n } B`;
    if ( n < 1024 * 1024 ) return `${ ( n / 1024 ).toFixed( 0 ) } KB`;
    if ( n < 1024 * 1024 * 1024 ) return `${ ( n / 1024 / 1024 ).toFixed( 1 ) } MB`;
    return `${ ( n / 1024 / 1024 / 1024 ).toFixed( 2 ) } GB`;
}

/**
 * Takes a file up to the app's server: called with the file, a function it tells how far it got (0 to 1), and a
 * signal that cancels it when the user removes the file. Answers the file as the app keeps it, or throws, its
 * message shown on the file where it is a sentence of the app's.
 */
export type ChatUploader = ( file: File, progress: ( done: number ) => void, signal: AbortSignal ) => Promise<ChatFile>;

/** Why a file did not go up, in the app's own words where its server gave some. */
export class UploadError extends Error {}

/**
 * The uploader for the app's route: `POST` with the page's cookies, as a form of the `file` and the chat's `room`,
 * answered with the file as JSON (`ChatFile`), or with an error status and `{ error: "…" }`, whose words the file shows.
 */
export function routeUploader( route: string, room: string ): ChatUploader {
    return ( file, progress, signal ) => new Promise<ChatFile>( ( resolve, reject ) => {
        const xhr = new XMLHttpRequest();
        xhr.open( "POST", route );
        xhr.upload.onprogress = ( e ) => {
            if ( e.lengthComputable && e.total > 0 ) progress( e.loaded / e.total );
        };
        xhr.onload = () => {
            let answer: unknown = null;
            try {
                answer = JSON.parse( xhr.responseText );
            } catch {
                // Not JSON: the status says enough.
            }
            if ( xhr.status >= 200 && xhr.status < 300 ) {
                const kept = answer as Partial<ChatFile> | null;
                if ( kept && typeof kept.url === "string" && kept.url ) {
                    resolve( { id: String( kept.id ?? kept.url ), url: kept.url, name: kept.name ?? file.name, type: kept.type ?? file.type, size: kept.size ?? file.size,
                               ...( kept.width && kept.height ? { width: kept.width, height: kept.height } : {} ), ...( kept.thumb ? { thumb: kept.thumb } : {} ) } );
                    return;
                }
            }
            const words = ( answer as { error?: unknown } | null )?.error;
            reject( new UploadError( typeof words === "string" && words.length <= 160 ? words : "" ) );
        };
        xhr.onerror = () => reject( new UploadError( "" ) );
        xhr.onabort = () => reject( new DOMException( "Removed", "AbortError" ) );
        signal.addEventListener( "abort", () => xhr.abort(), { once: true } );
        const form = new FormData();
        form.append( "room", room );
        form.append( "file", file, file.name );
        xhr.send( form );
    } );
}

/**
 * The address a file opens at, where it may be shown: the page's own site, a host the app named (`fileHosts`, such as
 * its storage's), or a picture this page made of a file it is sending. Anything else, which a member could put in a
 * message of their own, is not shown: no picture or link of another site's, and never a script's address.
 */
export function shownUrl( url: string | undefined, hosts: string[] = [] ): string | null {
    if ( ! url ) return null;
    if ( url.startsWith( "blob:" ) ) return url;
    const here = typeof location === "undefined" ? null : location;
    if ( ! here ) return url.startsWith( "/" ) && ! url.startsWith( "//" ) ? url : null;
    let address: URL;
    try {
        address = new URL( url, here.href );
    } catch {
        return null;
    }
    if ( address.protocol !== "https:" && address.protocol !== "http:" ) return null;
    if ( address.origin !== here.origin && ! hosts.includes( address.host ) && ! hosts.includes( address.origin ) ) return null;
    // A path of the site's own as it was given, as the server renders it too.
    return url.startsWith( "/" ) && ! url.startsWith( "//" ) ? url : address.href;
}

/** A picture the viewer shows: where it is, what it is called. */
export interface ViewedImage {
    url: string;
    name: string;
}

// ─── IN A MESSAGE ──────────────────────────────────────────────────────

export interface MessageFilesProps {
    files: ChatFile[];
    /** The hosts the app keeps files on, beside its own (Chat's `fileHosts`). */
    hosts?: string[];
    /** A text bubble follows: the grid's bottom corners square, to join it. */
    attached?: boolean;
    /** Opens the pictures large, at one of them. */
    onOpen: ( images: ViewedImage[], index: number ) => void;
}

/** A message's files: its pictures in a grid, its videos with their player, the rest as rows. */
export function MessageFiles( { files, hosts, attached, onOpen }: MessageFilesProps ) {
    const shown = files.map( ( file ) => ( { file, url: shownUrl( file.url, hosts ), thumb: shownUrl( file.thumb, hosts ), kind: kindOf( file.type, file.name ) } ) );
    const images = shown.filter( ( f ) => f.kind === "image" && f.url );
    const videos = shown.filter( ( f ) => f.kind === "video" && f.url );
    const rows = shown.filter( ( f ) => ! images.includes( f ) && ! videos.includes( f ) );
    const viewed = images.map( ( f ) => ( { url: f.url!, name: f.file.name } ) );
    const last = images.length ? "images" : videos.length ? "videos" : "rows";

    return <>
        { rows.length > 0 && (
            <div className="wplus-files-list">
                { rows.map( ( f, i ) => <FileRow key={ f.file.id + i } file={ f.file } url={ f.url } kind={ f.kind } /> ) }
            </div>
        ) }
        { videos.length > 0 && (
            <div className="realtime-chat-videos">
                { videos.map( ( f, i ) => (
                    <video key={ f.file.id + i } className="realtime-chat-video" src={ f.url! } poster={ f.thumb ?? undefined } controls playsInline preload="metadata"
                           data-attached={ attached && last === "videos" && i === videos.length - 1 ? 1 : undefined } />
                ) ) }
            </div>
        ) }
        { images.length > 0 && (
            <div className="wplus-image-grid" data-count={ Math.min( images.length, 4 ) } data-attached={ attached ? 1 : undefined }>
                { images.slice( 0, 4 ).map( ( f, i ) => (
                    <ImageTile key={ f.file.id + i } src={ f.thumb ?? f.url! } name={ f.file.name } more={ i === 3 && images.length > 4 ? images.length - 4 : 0 }
                               onOpen={ () => onOpen( viewed, i ) } />
                ) ) }
            </div>
        ) }
    </>;
}

function ImageTile( { src, name, more, onOpen }: { src: string; name: string; more: number; onOpen: () => void } ) {
    const open = ( e: ReactKeyboardEvent ) => {
        if ( e.key === "Enter" || e.key === " " ) {
            e.preventDefault();
            onOpen();
        }
    };
    return (
        <div className="wplus-image-tile" role="button" tabIndex={ 0 } aria-label={ name } onClick={ onOpen } onKeyDown={ open }>
            <img src={ src } alt={ name } loading="lazy" />
            { more > 0 && <div className="wplus-image-overflow">+{ more }</div> }
        </div>
    );
}

/** A file that is no picture or video: its badge, its name, its size and type, and its download. */
function FileRow( { file, url, kind }: { file: ChatFile; url: string | null; kind: FileKind } ) {
    const name = file.name || _x( "Attachment", "Conversation info panel", "bp-better-messages" );
    const type = ( file.type.split( "/" )[ 1 ] ?? "" ) || extensionOf( file.name ) || kind;
    const inner = <>
        <span className="wplus-file-row__badge" data-kind={ kind }>{ badgeOf( file.name, kind ) }</span>
        <span className="wplus-file-row__body">
            <span className="wplus-file-row__name">{ name }</span>
            <span className="wplus-file-row__meta">
                { file.size > 0 && <><span className="wplus-file-row__size">{ bytesLabel( file.size ) }</span><span className="wplus-file-row__sep"> · </span></> }
                <span className="wplus-file-row__ext">{ type }</span>
            </span>
        </span>
        { url && <Icon name="download" size={ 16 } className="wplus-file-row__download" /> }
    </>;
    // A file whose address is not one to show keeps its name, unlinked.
    if ( ! url ) return <span className="wplus-file-row" data-kind={ kind } data-unlinked="1">{ inner }</span>;
    return <a className="wplus-file-row" data-kind={ kind } href={ url } target="_blank" rel="noopener noreferrer" download={ file.name || true }>{ inner }</a>;
}

// ─── WAITING IN THE COMPOSER ───────────────────────────────────────────

/** A file the user picked, on its way up or up, or refused. */
export interface StagedFile {
    key: string;
    name: string;
    type: string;
    size: number;
    /** A picture of it, made on this page, for an image. */
    preview: string | null;
    status: "uploading" | "done" | "error";
    /** 0 to 1. */
    progress: number;
    /** Why it was refused, in words to show: empty for the usual "Upload failed". */
    error?: string;
    /** As the app's server keeps it, once up. */
    file?: ChatFile;
}

/** A picked file as it goes up, then as the app's server keeps it. */
interface Picked extends StagedFile {
    abort: AbortController;
}

export interface StagedFilesOptions {
    /** The chat's room, which `routeUploader` sends with each file: for an app that hands the hook its route. */
    room?: string;
    /** The largest file, in bytes, refused at once in the package's words: 0 for none, as an uploader can refuse it. */
    maxFileSize?: number;
    /** The most files one message takes: 10 by default. */
    maxFiles?: number;
}

/** The files picked for the next message, as useStagedFiles() keeps them. */
export interface StagedFilesState {
    /** Whether files can be picked at all: there is an uploader. */
    can: boolean;
    uploader: ChatUploader | undefined;
    staged: StagedFile[];
    /** Takes files picked, pasted or dropped: each goes up at once. */
    add: ( picked: File[] ) => void;
    /** Takes a file out, stopping it where it is still going up. */
    remove: ( key: string ) => void;
    /** The files that went up, for the message. */
    ready: () => ChatFile[];
    /** The message went: the files that went up leave, those refused stay, saying why. */
    sent: () => void;
    /** Whether a file is still on its way up, which holds Send back. */
    uploading: boolean;
}

/**
 * The files the user picked for the next message: each goes up to the app's server at once, so Send has nothing left
 * to wait for, and a picture shows from this page while it does. Refused at once when over the size or the count. The
 * kit's Chat keeps its files with it, and so can an app that draws its own composer with the kit's parts and keeps its
 * own engine (Live Support's visitor panel and inbox): `upload` is its route, or its own uploader, which may refuse a
 * file in its own words by throwing them (an Error whose message the file shows).
 */
export function useStagedFiles( upload: string | ChatUploader | undefined, { room = "", maxFileSize = 0, maxFiles = 10 }: StagedFilesOptions = {} ): StagedFilesState {
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

/** What useFileDrop() gives: whether files are dragged over, and the handlers for the element they are dropped on. */
export interface FileDrop {
    dragging: boolean;
    dropping: {
        onDragEnter?: ( e: React.DragEvent ) => void;
        onDragOver?: ( e: React.DragEvent ) => void;
        onDragLeave?: ( e: React.DragEvent ) => void;
        onDrop?: ( e: React.DragEvent ) => void;
    };
}

/**
 * Files dragged over an element, for its DropStrip, and handed to `add` when dropped there: the element's handlers,
 * none where `on` is false. Only a drag that carries files counts, and one over the element's children too.
 */
export function useFileDrop( add: ( files: File[] ) => void, on = true ): FileDrop {
    const [ dragging, setDragging ] = useState( false );
    const depth = useRef( 0 );
    const carriesFiles = ( e: React.DragEvent ) => Array.from( e.dataTransfer?.types ?? [] ).includes( "Files" );
    const dropping = on ? {
        onDragEnter: ( e: React.DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            depth.current += 1;
            setDragging( true );
        },
        onDragOver: ( e: React.DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: ( e: React.DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            depth.current = Math.max( 0, depth.current - 1 );
            if ( depth.current === 0 ) setDragging( false );
        },
        onDrop: ( e: React.DragEvent ) => {
            if ( ! carriesFiles( e ) ) return;
            e.preventDefault();
            depth.current = 0;
            setDragging( false );
            add( Array.from( e.dataTransfer.files ) );
        },
    } : {};

    return { dragging: on && dragging, dropping };
}

export interface StagedFilesProps {
    staged: StagedFile[];
    onRemove: ( key: string ) => void;
    onOpen: ( images: ViewedImage[], index: number ) => void;
}

/** The files the user picked, above the composer: each with its badge or picture, its state, and its remove button. */
export function StagedFiles( { staged, onRemove, onOpen }: StagedFilesProps ) {
    if ( ! staged.length ) return null;
    const pictures = staged.filter( ( s ) => s.preview );
    return (
        <div className="wplus-staged-files">
            { staged.map( ( s ) => {
                const kind = kindOf( s.type, s.name );
                const status = s.status === "error"
                    ? ( s.error || _x( "Upload failed", "File Uploader", "bp-better-messages" ) )
                    : s.status === "done"
                        ? _x( "Ready", "Native uploader: chip uploaded label", "bp-better-messages" )
                        : sprintf( _x( "Uploading… %s%%", "Native uploader: chip uploading label", "bp-better-messages" ), Math.round( s.progress * 100 ) );
                return (
                    <div key={ s.key } className="wplus-staged-chip" data-kind={ kind } data-status={ s.status }>
                        { s.preview
                            ? <Btn className="wplus-staged-chip__badge wplus-staged-chip__badge--thumb"
                                   aria-label={ sprintf( _x( "Preview %s", "Native uploader: chip preview button", "bp-better-messages" ), s.name ) }
                                   onClick={ () => onOpen( pictures.map( ( p ) => ( { url: p.preview!, name: p.name } ) ), pictures.indexOf( s ) ) }>
                                <img src={ s.preview } alt="" />
                              </Btn>
                            : <span className="wplus-staged-chip__badge">{ badgeOf( s.name, kind ) }</span> }
                        <span className="wplus-staged-chip__body">
                            <span className="wplus-staged-chip__name" title={ s.name }>{ s.name }</span>
                            <span className="wplus-staged-chip__status" data-numeric={ s.status === "uploading" ? 1 : undefined }>{ status }</span>
                        </span>
                        { s.status === "uploading" && <span className="wplus-staged-chip__progress" style={ { width: `${ Math.round( s.progress * 100 ) }%` } } /> }
                        <Btn className="wplus-staged-chip__remove" aria-label={ _x( "Remove file", "File Uploader", "bp-better-messages" ) } onClick={ () => onRemove( s.key ) }>
                            <Icon name="x" size={ 12 } />
                        </Btn>
                    </div>
                );
            } ) }
        </div>
    );
}

/** The strip a dragged file is dropped on, over the composer. */
export function DropStrip( { over }: { over: boolean } ) {
    return (
        <div className="wplus-attachments-dropzone" data-over={ over ? 1 : undefined }>
            <Icon name="paperclip" size={ 18 } />
            <span className="wplus-attachments-dropzone__title">{ _x( "Drop your files here", "File Uploader", "bp-better-messages" ) }</span>
        </div>
    );
}

// ─── LARGE ─────────────────────────────────────────────────────────────

export interface ImageViewerProps {
    images: ViewedImage[];
    index: number;
    onClose: () => void;
}

/**
 * The pictures large, over the page: one at a time, with the others a step away (the arrows, or ← and →), its
 * download, and closed by Escape, the close button or a click beside it. The focus goes into it and back where it was.
 */
export function ImageViewer( { images, index, onClose }: ImageViewerProps ) {
    const [ at, setAt ] = useState( Math.min( Math.max( index, 0 ), images.length - 1 ) );
    const closeRef = useRef<HTMLElement | null>( null );
    const step = ( by: number ) => setAt( ( now ) => ( now + by + images.length ) % images.length );

    useEffect( () => {
        const before = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();
        const keys = ( e: KeyboardEvent ) => {
            if ( e.key === "Escape" ) onClose();
            else if ( e.key === "ArrowLeft" && images.length > 1 ) step( -1 );
            else if ( e.key === "ArrowRight" && images.length > 1 ) step( 1 );
            else return;
            e.preventDefault();
        };
        document.addEventListener( "keydown", keys );
        return () => {
            document.removeEventListener( "keydown", keys );
            before?.focus?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [] );

    const image = images[ at ];
    if ( ! image ) return null;
    const beside = ( e: ReactMouseEvent ) => {
        if ( e.target === e.currentTarget ) onClose();
    };
    return (
        <div className="realtime-viewer" role="dialog" aria-modal="true" aria-label={ image.name } onClick={ beside }>
            <div className="realtime-viewer__bar">
                <span className="realtime-viewer__name">{ image.name }</span>
                { images.length > 1 && <span className="realtime-viewer__count">{ at + 1 } / { images.length }</span> }
                <a className="realtime-viewer__button" href={ image.url } download={ image.name || true } aria-label={ _x( "Download", "Lightbox", "bp-better-messages" ) }
                   title={ _x( "Download", "Lightbox", "bp-better-messages" ) }>
                    <Icon name="download" size={ 20 } />
                </a>
                <Btn ref={ closeRef } className="realtime-viewer__button" aria-label={ _x( "Close", "Lightbox", "bp-better-messages" ) } onClick={ onClose }>
                    <Icon name="x" size={ 20 } />
                </Btn>
            </div>
            <img className="realtime-viewer__image" src={ image.url } alt={ image.name } onClick={ beside } />
            { images.length > 1 && <>
                <Btn className="realtime-viewer__step" data-step="previous" aria-label={ _x( "Previous", "Lightbox", "bp-better-messages" ) } onClick={ () => step( -1 ) }>
                    <Icon name="chevronL" size={ 26 } />
                </Btn>
                <Btn className="realtime-viewer__step" data-step="next" aria-label={ _x( "Next", "Lightbox", "bp-better-messages" ) } onClick={ () => step( 1 ) }>
                    <Icon name="chevronR" size={ 26 } />
                </Btn>
            </> }
        </div>
    );
}
