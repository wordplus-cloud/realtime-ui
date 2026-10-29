/**
 * How loud a microphone is, from 0 to 1, read off its browser track twenty times a second while the page is drawn, each
 * reading handed to `onReading`. In decibels, as the ear hears it: -60 dB, a quiet room after the browser's noise
 * suppression, is nothing, and -10 dB, someone speaking up, is all of it. Returns what stops the reading. Nothing is
 * read where the track has ended or the browser has no Web Audio.
 */
export function readLevel( source: MediaStreamTrack, onReading: ( level: number ) => void ): () => void {
    const Context = typeof window !== 'undefined' ? window.AudioContext : undefined;

    if ( source.readyState === 'ended' || ! Context ) return () => {};

    let context: AudioContext | null = null;
    let input: MediaStreamAudioSourceNode;
    try {
        context = new Context();
        input = context.createMediaStreamSource( new MediaStream( [ source ] ) );
    } catch ( e ) {
        void context?.close().catch( () => null );
        return () => {};
    }

    const running = context;
    const analyser = running.createAnalyser();
    analyser.fftSize = 512;
    input.connect( analyser );

    // A context made away from a press can start suspended, and measures nothing until it runs. The capture just
    // allowed lets it run in most browsers, and the next press on the page brings the rest round.
    const wake = () => { void running.resume().catch( () => null ); };
    wake();
    document.addEventListener( 'pointerdown', wake, true );

    const samples = new Uint8Array( analyser.fftSize );
    let frame = 0;
    let last = 0;

    const measure = ( now: number ) => {
        frame = window.requestAnimationFrame( measure );
        if ( now - last < 50 ) return;
        last = now;

        analyser.getByteTimeDomainData( samples );
        let sum = 0;
        for ( let i = 0; i < samples.length; i++ ) {
            const v = ( samples[ i ] - 128 ) / 128;
            sum += v * v;
        }

        const rms = Math.sqrt( sum / samples.length );
        onReading( rms > 0 ? Math.min( 1, Math.max( 0, ( 20 * Math.log10( rms ) + 60 ) / 50 ) ) : 0 );
    };
    frame = window.requestAnimationFrame( measure );

    return () => {
        window.cancelAnimationFrame( frame );
        document.removeEventListener( 'pointerdown', wake, true );
        try { input.disconnect(); } catch ( e ) {}
        void running.close().catch( () => null );
    };
}
