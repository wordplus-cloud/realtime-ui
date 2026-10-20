/**
 * An id of digits as a number, any other id of text as it is, else null: at most 64 characters, none a space or a control
 * character. 0 is nobody.
 */
export function callUserOf(raw) {
    if (typeof raw === 'number')
        return Number.isSafeInteger(raw) && raw !== 0 ? raw : null;
    if (typeof raw !== 'string' || !/^[^\s\u0000-\u001f\u007f]{1,64}$/.test(raw))
        return null;
    if (/^-?[1-9][0-9]*$/.test(raw) && Number.isSafeInteger(Number(raw)))
        return Number(raw);
    return raw === '0' ? null : raw;
}
