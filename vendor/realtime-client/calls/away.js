/**
 * How long a room call keeps the tile of someone who left, marked as reconnecting, before it goes: Better Messages'
 * call screen's `awayFor` (call-container.tsx, 2026-10-10: "We need preserve the tile for it while it reconnects so the
 * reconnection/migrating behaviour is very smooth under any conditions and only remove the tile when connection is
 * lost completely for some reason or user leaved"), here so its screen and the SDK's group calls run the same rule.
 *
 * By the departure's reason, the media server's DisconnectReason:
 * - none: the room made it up. Its own reconnect empties it and fills it again from the server's list.
 * - CLIENT_INITIATED (1): a leave. On the mesh it is a hang-up, and the tile goes at once, as WordPlus Mesh reports a
 *   client that leaves only to join again as SIGNAL_CLOSE. Any other server reports a full reconnect as a leave too,
 *   so there the tile gets AWAY_LEFT_MS.
 * - DUPLICATE_IDENTITY (2), SERVER_SHUTDOWN (3), MIGRATION (8) and SIGNAL_CLOSE (9) come back too: the same person
 *   joining again (a reload), a node going, a move between nodes, a dropped signal or a full reconnect.
 * - any other: removed, the room closed, a timeout. Gone.
 *
 * A page that hangs up says so first over the room (its bye: BYE_TOPIC in the SDK, `bm-call-bye` in Better Messages),
 * and a departure within BYE_KEEP_MS of it goes at once, whichever came first. No imports, so a unit test or another
 * product can take it alone.
 */
/** The wait for someone who may come back. */
export const AWAY_MS = 20000;
/** The wait for a leave off the mesh, which may be a full reconnect. */
export const AWAY_LEFT_MS = 6000;
/** How long a bye stands for the departure it announces. */
export const BYE_KEEP_MS = 30000;
/** The topic of the SDK's bye over the room, sent as a page hangs up (Better Messages' is `bm-call-bye`). */
export const BYE_TOPIC = 'realtime-bye';
/** How long a tile of someone who left stays, in ms: 0 for at once. `byeAt` is when their bye came, if it did. */
export function awayFor(reason, options) {
    const now = options.now ?? Date.now();
    if (options.byeAt !== undefined && now - options.byeAt < BYE_KEEP_MS)
        return 0;
    if (!reason)
        return AWAY_MS;
    if (reason === 1)
        return options.onMesh ? 0 : AWAY_LEFT_MS;
    if (reason === 2 || reason === 3 || reason === 8 || reason === 9)
        return AWAY_MS;
    return 0;
}
