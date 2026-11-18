import { RealtimeError } from '../errors.js';
/**
 * A call's name for the page's user and another, from a template, as the call buttons take it: `{pair}` the two ids in
 * order, `{me}`, `{id}`. Both people so name the same call, whichever calls. A name with none of them is as it is.
 * Refused with `no_identity` where it needs the page's user and the app named none.
 */
export function callName(template, me, id) {
    if (!template.includes('{'))
        return template;
    if (me === null && /\{(pair|me)\}/.test(template))
        throw new RealtimeError('no_identity');
    const other = String(id);
    const pair = pairOf(String(me ?? ''), other).join(':');
    return template.replace(/\{pair\}/g, pair).replace(/\{me\}/g, String(me ?? '')).replace(/\{id\}/g, other);
}
// The two ids in order, the smaller first: as numbers when both are whole numbers (9 before 10, as an app's server sorts
// them), else as text, so both people name the same call either way round.
function pairOf(one, other) {
    const numbers = /^\d+$/.test(one) && /^\d+$/.test(other);
    const first = numbers ? compareNumbers(one, other) <= 0 : one <= other;
    return first ? [one, other] : [other, one];
}
// Whole numbers of any length compared exactly, without parsing past what a number holds.
function compareNumbers(one, other) {
    const a = one.replace(/^0+(?=\d)/, '');
    const b = other.replace(/^0+(?=\d)/, '');
    return a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0;
}
