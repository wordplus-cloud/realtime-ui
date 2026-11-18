/**
 * The candidate pair a peer connection is using, of one stats report's.
 *
 * The transport's own word first: its `selectedCandidatePairId` (Chrome,
 * Safari). Firefox has no transport entry and marks the pair in use with
 * `selected` instead. `nominated` says the least, since a pair stays
 * nominated after the connection moves off it: Firefox's side of a call
 * that ran direct reported the relay pair that won the first checks, and
 * that pair's round trip frozen at 1.6 s, for the whole call (2026-10-26),
 * because whichever nominated pair the report listed last won. So a
 * nominated pair counts only where neither of the others says anything, and
 * then the one that heard from the other side last.
 */
const heard = (pair) => Number(pair.lastPacketReceivedTimestamp ?? 0) || 0;
const received = (pair) => Number(pair.bytesReceived ?? 0) || 0;
export function selectedPair(report) {
    let transport = null;
    const pairs = [];
    report.forEach((s) => {
        if (!s)
            return;
        if (s.type === 'transport' && typeof s.selectedCandidatePairId === 'string' && !transport) {
            transport = s;
        }
        else if (s.type === 'candidate-pair') {
            pairs.push(s);
        }
    });
    const named = transport ? pairs.find((p) => p.id === transport.selectedCandidatePairId) : undefined;
    if (named)
        return named;
    const marked = pairs.find((p) => p.selected === true);
    if (marked)
        return marked;
    let best;
    for (const p of pairs) {
        if (p.state !== 'succeeded' || p.nominated !== true)
            continue;
        if (!best || heard(p) > heard(best) || (heard(p) === heard(best) && received(p) > received(best)))
            best = p;
    }
    return best;
}
