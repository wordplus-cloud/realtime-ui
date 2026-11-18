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
type StatsLike = {
    forEach(fn: (s: any) => void): void;
};
export declare function selectedPair(report: StatsLike): any | undefined;
export {};
