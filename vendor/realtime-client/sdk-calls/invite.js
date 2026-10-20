/**
 * A ring that brings someone into a group call: a call between two people becomes one when either of them rings a third
 * person in (`Call.add()`), and everyone in it may ring more (`GroupCall.add()`). The person is rung on every tab they have
 * open, as for a call, until they answer and arrive in the room, turn it down, it runs out after 45 seconds, or the one
 * who rang calls it off.
 */
import { Listeners } from '../channel.js';
const STATES = ['ringing', 'answered', 'rejected', 'busy', 'no_answer', 'cancelled'];
export const inviteState = (value) => (STATES.includes(value) ? value : null);
/** One ring into a group call, as everyone in it hears of it. Event: `state` (InviteState), at each change. */
export class Invite {
    constructor(m) {
        this.listeners = new Listeners();
        this.canceller = null;
        this.id = m.id;
        this.group = m.group;
        this.from = m.from ?? null;
        this.to = m.to;
        this.state = m.state ?? 'ringing';
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /** Calls it off while it rings: from the page that rang only. */
    cancel() {
        if (this.state !== 'ringing')
            return Promise.resolve();
        if (!this.canceller)
            return Promise.reject(Object.assign(new Error('forbidden'), { code: 'forbidden' }));
        return this.canceller();
    }
    /** @internal The page that rang can call it off. */
    own(canceller) {
        this.canceller = canceller;
    }
    /** @internal */
    update(state) {
        // A ring that ended stays ended, whichever word of it arrives last.
        if (this.state === state || this.state !== 'ringing')
            return;
        this.state = state;
        this.listeners.fire('state', [state], false);
    }
}
