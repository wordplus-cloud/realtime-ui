// What the call screens take from Better Messages' inc/functions.ts, line for line, and formatSize, so a view copied
// into an app imports none of the package's dependencies itself.

export function BMHexToRGBA( hex: string, opacity: number ) {
    let c;
    if ( /^#([A-Fa-f0-9]{3}){1,2}$/.test( hex ) ) {
        c = hex.substring( 1 ).split( '' );
        if ( c.length == 3 ) {
            c = [ c[ 0 ], c[ 0 ], c[ 1 ], c[ 1 ], c[ 2 ], c[ 2 ] ];
        }
        let n = Number( '0x' + c.join( '' ) );
        return 'rgba(' + [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ].join( ',' ) + ',' + opacity + ')';
    }
    throw new Error( 'Bad Hex' );
}

export interface SpeakerHighlightResult {
    boxShadow: string;
    background: string;
}

export function getSpeakerHighlightStyles(
    isSpeaking: boolean,
    audioLevel: number,
    color: string
): SpeakerHighlightResult | null {
    if ( ! isSpeaking ) return null;

    let level = audioLevel * 100 * 5;
    if ( level > 90 ) level = 90;
    if ( level < 15 ) level = 15;
    const opacity = level / 100;

    return {
        boxShadow: '0 0 ' + Math.round( 2 + opacity * 4 ) + 'px ' + Math.round( opacity * 2 ) + 'px ' + BMHexToRGBA( color, opacity ),
        background: 'linear-gradient(135deg, ' + BMHexToRGBA( color, opacity * 0.15 ) + ' 0%, ' + BMHexToRGBA( color, opacity * 0.05 ) + ' 100%)'
    };
}

const SIZE_UNITS = [ "B", "kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB" ];

/**
 * A number of bytes as people read it ("1.5 MB"): a call's traffic in its settings, a file's size. As filesize wrote it
 * with its defaults until 2026-10-31: powers of 1000, two decimals past the bytes, rounded half up, 1000 of a unit as
 * one of the next (test/format-size.test.ts holds the two side by side).
 */
export function formatSize( bytes: number ): string {
    if ( isNaN( bytes ) ) throw new TypeError( "Invalid number" );
    const negative = bytes < 0;
    const size = negative ? -bytes : bytes;
    let unit = Math.min( Math.max( Math.floor( Math.log( size ) / Math.log( 1000 ) ), 0 ), 8 );
    let value = 0;
    if ( size !== 0 ) {
        const decimals = Math.pow( 10, unit > 0 ? 2 : 0 );
        value = Math.round( ( size / Math.pow( 1000, unit ) ) * decimals ) / decimals;
        if ( value === 1000 && unit < 8 ) {
            value = 1;
            unit++;
        }
    }
    return ( negative ? -value : value ) + " " + SIZE_UNITS[ unit ];
}

export function msToTime( duration: number ) {
    let seconds: string | number = Math.floor( ( duration / 1000 ) % 60 ),
        minutes: string | number = Math.floor( ( duration / ( 1000 * 60 ) ) % 60 ),
        hours: string | number = Math.floor( ( duration / ( 1000 * 60 * 60 ) ) % 24 );

    hours = ( hours < 10 ) ? "0" + hours : hours;
    minutes = ( minutes < 10 ) ? "0" + minutes : minutes;
    seconds = ( seconds < 10 ) ? "0" + seconds : seconds;

    if ( hours !== '00' ) {
        return hours + ":" + minutes + ":" + seconds;
    } else {
        return minutes + ":" + seconds;
    }
}
