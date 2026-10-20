export const VIEW_STEPS = [180, 360, 540, 720, 1080, 1440, 2160];
export function randomId(length = 24) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    }
    else {
        for (let i = 0; i < length; i++)
            bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < length; i++) {
        out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
}
export function compareStreamIds(a, b) {
    const [aMs, aSeq] = a.split('-').map(Number);
    const [bMs, bSeq] = b.split('-').map(Number);
    if (aMs !== bMs)
        return aMs < bMs ? -1 : 1;
    if (aSeq === bSeq)
        return 0;
    return aSeq < bSeq ? -1 : 1;
}
