import React from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import css from "virtual:recording-css";
import { RecordingPlayer } from "./components/recording/player.tsx";
import type { RecordingData } from "./components/recording/types.ts";
import { defineElements, loadPrefix, nameOf, type OurElement } from "./element-names.ts";
import { configureUi } from "./host.ts";
import { direction, translator } from "./inc/translations.ts";

/**
 * `<recording-player>`, the recording player as an element for any page, in a script of its own
 * (dist/realtime-ui-recording.min.js, `window.wordplusRecordingUi`): React, the player, its stylesheet and its words
 * inside, no call screen. The WordPlus SDK serves it for plugins' pages (its wp-admin list of recordings among them), and
 * @wordplus/realtime beside its other UI files for apps.
 *
 * What it plays, one of:
 * - `data`, the property: a recording as the SDK's read route answers it (RecordingData);
 * - `data`, the attribute: the same as JSON;
 * - `src`: the read route's address, fetched with the page's cookies, and the page's nonce and headers when its config
 *   names them (`window.wordplusRealtimeConfig.recording`: `nonce`, `headers`).
 *
 * `hls`: where hls.js's light build loads from, for a browser without HLS of its own (else the config's `hlsUrl`);
 * `lang`: the language of its words (else the config's, else the page's);
 * `autoplay`: plays as soon as its video is in, for a page's Play that puts it in place. Such a page calls its `play()`
 * in the same click: it is drawn at once, so that reaches its video, and Safari plays sound only from a click.
 */

interface RecordingConfig {
    hlsUrl?: string;
    nonce?: string;
    headers?: Record<string, string>;
    lang?: string;
    strings?: Record<string, string>;
}

const config = (): RecordingConfig => ( ( globalThis as Record<string, any> ).wordplusRealtimeConfig?.recording ?? {} ) as RecordingConfig;

let translated = "";

function translate( lang: string ): void {
    if ( translated === lang ) return;
    translated = lang;
    configureUi( translator( lang, config().strings ?? {} ) );
}

class RecordingPlayerElement extends HTMLElement {
    static readonly tag = "recording-player";
    static readonly observedAttributes = [ "src", "data", "hls", "lang", "autoplay" ];

    private root: Root | null = null;
    private holder: HTMLDivElement | null = null;
    private value: RecordingData | null = null;
    private asked = "";

    set data( value: RecordingData | null ) {
        this.value = value;
        this.draw();
    }

    get data(): RecordingData | null {
        return this.value;
    }

    /** Plays now: for the click that put it in place, as Safari plays sound only from one. */
    play(): Promise<void> {
        const media = this.shadowRoot?.querySelector<HTMLMediaElement>( "video, audio" );

        return media ? media.play().catch( () => undefined ) : Promise.resolve();
    }

    connectedCallback(): void {
        if ( ! this.holder ) {
            const shadow = this.shadowRoot ?? this.attachShadow( { mode: "open" } );
            const style = document.createElement( "style" );
            style.textContent = css;
            this.holder = document.createElement( "div" );
            shadow.append( style, this.holder );
        }
        this.read();
    }

    disconnectedCallback(): void {
        this.root?.unmount();
        this.root = null;
    }

    attributeChangedCallback(): void {
        if ( this.isConnected ) this.read();
    }

    private read(): void {
        const json = this.getAttribute( "data" );

        if ( json ) {
            try {
                this.value = JSON.parse( json ) as RecordingData;
            } catch {
                this.value = null;
            }
            this.draw();
            return;
        }

        const src = this.getAttribute( "src" ) ?? "";

        if ( ! src || src === this.asked ) {
            this.draw();
            return;
        }

        this.asked = src;
        const headers: Record<string, string> = { Accept: "application/json", ...( config().headers ?? {} ) };
        if ( config().nonce ) headers[ "X-WP-Nonce" ] = String( config().nonce );

        fetch( src, { credentials: "same-origin", headers } ).then( ( r ) => r.ok ? r.json() : null ).then( ( answer ) => {
            if ( this.asked !== src ) return;
            this.value = answer as RecordingData | null;
            this.draw();
        } ).catch( () => undefined );
    }

    private draw(): void {
        if ( ! this.holder || ! this.isConnected ) return;

        const lang = this.getAttribute( "lang" ) || config().lang || document.documentElement.lang || "en";
        translate( lang );
        this.holder.dir = direction( lang );

        const root = this.root ??= createRoot( this.holder );
        const autoPlay = this.hasAttribute( "autoplay" );
        const tree = this.value
            ? <RecordingPlayer key={ String( this.value.id ?? "" ) } data={ this.value } hlsUrl={ this.getAttribute( "hls" ) || config().hlsUrl || "" } autoPlay={ autoPlay } />
            : <></>;

        // Drawn at once with autoplay, so a play() in the click that made it reaches its video.
        if ( autoPlay ) flushSync( () => root.render( tree ) );
        else root.render( tree );
    }
}

const ELEMENTS: readonly OurElement[] = [ RecordingPlayerElement ];

/** Defines `<recording-player>` under the page's prefix (or `prefix`), and answers its name. */
export function define( prefix: string = loadPrefix ): string {
    defineElements( ELEMENTS, prefix );
    return nameOf( RecordingPlayerElement.tag, prefix );
}

const name = define();

// Which name the player took on this page, for a script that makes one (the WordPlus SDK's list of recordings).
( globalThis as Record<string, unknown> ).wordplusRecordingPlayerTag = name;
