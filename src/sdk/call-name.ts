/** A call's name for the page's user and another, from a template: `{pair}` the two ids in order, `{me}`, `{id}`. */
export function callName( template: string, me: string | null, id: string ): string {
    const pair = pairOf( String( me ?? '' ), String( id ) ).join( ':' );
    return template.replace( /\{pair\}/g, pair ).replace( /\{me\}/g, String( me ?? '' ) ).replace( /\{id\}/g, String( id ) );
}

// The two ids in order, the smaller first: as numbers when both are whole numbers (9 before 10, as an app's server sorts
// them), else as text, so both people name the same call either way round.
function pairOf( one: string, other: string ): [ string, string ] {
    const numbers = /^\d+$/.test( one ) && /^\d+$/.test( other );
    const first = numbers ? compareNumbers( one, other ) <= 0 : one <= other;
    return first ? [ one, other ] : [ other, one ];
}

// Whole numbers of any length compared exactly, without parsing past what a number holds.
function compareNumbers( one: string, other: string ): number {
    const a = one.replace( /^0+(?=\d)/, '' );
    const b = other.replace( /^0+(?=\d)/, '' );
    return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
