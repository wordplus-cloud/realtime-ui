/**
 * A ring that brings someone into a group call: a call between two people becomes one when either of them rings a third
 * person in (`Call.add()`), and everyone in it may ring more (`GroupCall.add()`). The person is rung on every tab they have
 * open, as for a call, until they answer and arrive in the room, turn it down, it runs out after 45 seconds, or the one
 * who rang calls it off.
 */
import { type Listener } from '../channel.js';
import type { CallUser } from '../calls/users.js';
/** How a ring into a group call stands: still ringing, or how it ended. */
export type InviteState = 'ringing' | 'answered' | 'rejected' | 'busy' | 'no_answer' | 'cancelled';
export declare const inviteState: (value: unknown) => InviteState | null;
/** One ring into a group call, as everyone in it hears of it. Event: `state` (InviteState), at each change. */
export declare class Invite {
    readonly id: string;
    /** The group call it rings into: the id of the call it was made from. */
    readonly group: string;
    /** Who rang, and whom. */
    readonly from: CallUser | null;
    readonly to: CallUser;
    state: InviteState;
    private readonly listeners;
    private canceller;
    constructor(m: {
        id: string;
        group: string;
        from?: CallUser | null;
        to: CallUser;
        state?: InviteState;
    });
    on(event: 'state', fn: Listener): this;
    off(event: 'state', fn?: Listener): this;
    /** Calls it off while it rings: from the page that rang only. */
    cancel(): Promise<void>;
    /** @internal The page that rang can call it off. */
    own(canceller: () => Promise<void>): void;
    /** @internal */
    update(state: InviteState): void;
}
