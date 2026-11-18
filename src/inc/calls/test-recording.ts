import { useEffect, useRef, useState } from "react";

// What a microphone's test heard in its last seconds, played back to the user on the speaker they chose. With AI Noise
// Removal on, the same seconds twice: as the browser gives them (it always lowers steady noise itself), then with the
// noise removal, so the difference is heard rather than taken on trust. Kept on the page alone, never sent, and gone as
// the test ends. Recording stops while it plays, so the speaker is not recorded into the next playback.
const SECONDS = 5;
// The pause between the two.
const BETWEEN = 0.6;

/** What is playing: the test as it was (`plain`), or of the two, the one without the noise removal or the one with it. */
export type PlaybackPart = 'plain' | 'without' | 'with';

interface Kept {
    context: AudioContext,
    raw: Float32Array,
    cleaned: Float32Array | null,
    at: number,
    filled: number,
}

/**
 * The test's recording: `track` as the microphone gives it, and `cleaned`, the same with AI Noise Removal, where it is
 * on. `ready` once a second is heard, `playing` the part playing.
 */
export function useTestRecording( track: MediaStreamTrack | null, cleaned: MediaStreamTrack | null, speaker: string ): { ready: boolean, playing: PlaybackPart | null, play: () => void } {
    const [ ready, setReady ] = useState( false );
    const [ playing, setPlaying ] = useState<PlaybackPart | null>( null );
    const kept = useRef<Kept | null>( null );
    const paused = useRef( false );

    useEffect( () => {
        setReady( false );
        const Context = typeof window !== 'undefined' ? window.AudioContext : undefined;
        if ( ! track || ! Context || ! ( 'createScriptProcessor' in Context.prototype ) ) return;
        const context = new Context();
        // Both into one recorder, side by side, so each moment of the one is the same moment of the other.
        const merger = context.createChannelMerger( 2 );
        const sources = [ track, cleaned ].filter( ( one ): one is MediaStreamTrack => !! one ).map( ( one, i ) => {
            const source = context.createMediaStreamSource( new MediaStream( [ one ] ) );
            source.connect( merger, 0, i );
            return source;
        } );
        // A script processor is enough for a test, and needs no module of its own as a worklet would.
        const recorder = context.createScriptProcessor( 4096, 2, 1 );
        const silent = context.createGain();
        silent.gain.value = 0;
        const size = context.sampleRate * SECONDS;
        const state: Kept = { context, raw: new Float32Array( size ), cleaned: cleaned ? new Float32Array( size ) : null, at: 0, filled: 0 };
        kept.current = state;
        recorder.onaudioprocess = ( event ) => {
            if ( paused.current ) return;
            const raw = event.inputBuffer.getChannelData( 0 );
            const clean = state.cleaned ? event.inputBuffer.getChannelData( 1 ) : null;
            for ( let i = 0; i < raw.length; i++ ) {
                state.raw[ state.at ] = raw[ i ];
                if ( state.cleaned && clean ) state.cleaned[ state.at ] = clean[ i ];
                state.at = ( state.at + 1 ) % size;
            }
            state.filled = Math.min( size, state.filled + raw.length );
            // A second at least, so the playback is worth a press.
            if ( state.filled >= context.sampleRate ) setReady( true );
        };
        merger.connect( recorder );
        // A script processor runs only while connected onward: to the speaker, silenced.
        recorder.connect( silent ).connect( context.destination );
        void context.resume().catch( () => null );

        return () => {
            recorder.onaudioprocess = null;
            sources.forEach( ( source ) => source.disconnect() );
            merger.disconnect();
            recorder.disconnect();
            silent.disconnect();
            void context.close().catch( () => null );
            kept.current = null;
            paused.current = false;
            setReady( false );
            setPlaying( null );
        };
    }, [ track, cleaned ] );

    const play = () => {
        const state = kept.current;
        const Context = typeof window !== 'undefined' ? window.AudioContext : undefined;
        if ( ! state || ! Context || paused.current || state.filled === 0 ) return;
        const { at, filled } = state;
        const player = new Context() as AudioContext & { setSinkId?: ( id: string ) => Promise<void> };
        const sound = ( from: Float32Array ) => {
            const buffer = player.createBuffer( 1, filled, state.context.sampleRate );
            const data = buffer.getChannelData( 0 );
            for ( let i = 0; i < filled; i++ ) data[ i ] = from[ ( at - filled + i + from.length ) % from.length ];
            return buffer;
        };
        const parts: Array<[ PlaybackPart, AudioBuffer ]> = state.cleaned
            ? [ [ 'without', sound( state.raw ) ], [ 'with', sound( state.cleaned ) ] ]
            : [ [ 'plain', sound( state.raw ) ] ];
        paused.current = true;
        setPlaying( parts[ 0 ][ 0 ] );

        const timers: ReturnType<typeof setTimeout>[] = [];
        const done = () => {
            timers.forEach( clearTimeout );
            void player.close().catch( () => null );
            // The next playback is what is said after this one.
            state.filled = 0;
            paused.current = false;
            setReady( false );
            setPlaying( null );
        };
        const sink = speaker && player.setSinkId ? player.setSinkId( speaker ).catch( () => null ) : Promise.resolve();
        sink.then( () => player.resume() ).then( () => {
            let start = player.currentTime + 0.05;
            parts.forEach( ( [ part, buffer ], i ) => {
                const source = player.createBufferSource();
                source.buffer = buffer;
                source.connect( player.destination );
                source.start( start );
                if ( i > 0 ) timers.push( setTimeout( () => setPlaying( part ), ( start - player.currentTime ) * 1000 ) );
                if ( i === parts.length - 1 ) source.onended = done;
                start += buffer.duration + BETWEEN;
            } );
        } ).catch( done );
    };

    return { ready, playing, play };
}
