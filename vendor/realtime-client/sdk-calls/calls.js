import { Listeners } from '../channel.js';
import { P2PCallSession } from '../calls/session.js';
import { SfuReporter } from '../calls/sfu-report.js';
import { randomId } from '../calls/types.js';
import { callUserOf } from '../calls/users.js';
import { CallDispatcher, SdkCallTransport } from './transport.js';
import { callName } from './call-name.js';
import { listDevices, LocalDevices } from './devices.js';
import { RealtimeError } from '../errors.js';
import { actsOf, openRoom, } from './group-call.js';
import { Invite, inviteState } from './invite.js';
import { loadRoomClient } from './media.js';
import { Stream } from './stream.js';
import { siteRequest } from '../site.js';
import { streamsEngine } from './streams-engine.js';
const ANSWER_MS = 8000;
/** A token is renewed this long before it runs out. */
const RENEW_BEFORE_S = 600;
/** A call moved to a room gives the other side this long to arrive, or come back, before it ends. */
const ROOM_WAIT_MS = 60000;
const ROOM_REPORT_MS = 15000;
/** How far into the next second a join waits after its call took it out or ended (afterOut()). */
const OUT_MARGIN_MS = 150;
/** The most people one `may` request asks about: the route refuses more. */
const MAY_AT_ONCE = 100;
const nowS = () => Math.floor(Date.now() / 1000);
const refused = (code) => new RealtimeError(code);
const instances = new WeakMap();
/** The page's calls, on a site's or app's rooms: one for each. */
export function calls(rt, options = {}) {
    let found = instances.get(rt);
    if (!found) {
        found = new Calls(rt, options);
        instances.set(rt, found);
    }
    return found;
}
export class Calls {
    constructor(rt, options = {}) {
        this.rt = rt;
        this.options = options;
        this.listeners = new Listeners();
        this.socketListeners = new Set();
        this.ringing = new Map();
        this.active = new Map();
        /** When a group call this page was in took it out or ended, by its name (afterOut()). */
        this.outAt = new Map();
        /** The rings into group calls this page heard of, and the rooms of the group calls it is in, by their ids. */
        this.invites = new Map();
        this.groups = new Map();
        this.line = null;
        this.lineRenewal = null;
        this.ride = rt.rideFor((via) => this.holdLine(via));
        this.dispatcher = new CallDispatcher(this.ride.socket);
        this.ringOn = options.ring !== false;
        this.ride.socket.on('line', (m) => this.onLine(m));
        // A connect after a drop, and a move to another node: each call joins on the socket the page has now.
        const changed = () => {
            for (const listener of this.socketListeners)
                listener();
        };
        rt.on('connected', changed);
        rt.on('moved', changed);
        if (this.ringOn && this.ride.socket.connected)
            void this.holdLine();
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /** The calls ringing for this page's user now. */
    incoming() {
        return [...this.ringing.values()];
    }
    /** The cameras, microphones and speakers this browser has, for a choice before a call. */
    devices() {
        return listDevices();
    }
    /**
     * Calls `to` (a user id) about `name`, a call the plugin owns: rings their every open tab. The name may be a template
     * as the call buttons take it, `support:{pair}`: `{pair}` the two ids in order, `{me}`, `{id}` the one called. Rejects
     * with its `code`.
     */
    async start(template, options) {
        const name = callName(template, this.rt.user, options.to);
        const type = options.type ?? 'video';
        const id = randomId(20);
        const request = { call: name, id, role: 'caller', to: options.to, type };
        const grant = await this.authorize(request);
        const call = new Call(this, { id, name, type, role: 'caller', peer: { user: callUserOf(options.to) ?? options.to, info: null } }, request, grant);
        this.active.set(id, call);
        await call.begin();
        this.listeners.fire('call', [call], false);
        return call;
    }
    /**
     * Starts the call in a token from the app's own server (`callToken()` there), which decided that this user may make
     * it, and rings the person it names. The calls route isn't asked. A token rings once, so each call takes a new one.
     * Rejects with its `code`: `bad_token`, or `forbidden` for a token made for another user.
     */
    async startCall(token) {
        const made = openCallToken(token);
        if (!made)
            throw refused('bad_token');
        if (this.rt.user !== null && this.rt.user !== undefined && made.pair[0] !== callUserOf(this.rt.user))
            throw refused('forbidden');
        // Its proof of being in the call gets it a new token through the calls route, should the call outlast this one.
        const request = { call: made.call, id: made.id, role: 'caller', to: made.to, type: made.type, member: made.member };
        const call = new Call(this, { id: made.id, name: made.call, type: made.type, role: 'caller', peer: { user: made.to, info: null } }, request, made);
        this.active.set(made.id, call);
        await call.begin();
        this.listeners.fire('call', [call], false);
        return call;
    }
    /**
     * A token from a route of the app's own, as `<call-button token-url>` asks for one: a GET with what is asked in its
     * query (`?to=34&type=video`) and the headers the app's other routes take, answered with `{ token }`. Rejects with
     * `forbidden` for a route that says no.
     */
    async tokenFrom(url, ask) {
        const headers = (this.options.calls ?? routeBeside(this.ride.options))?.headers;
        const query = Object.entries(ask).map(([name, value]) => name + '=' + encodeURIComponent(String(value))).join('&');
        let res;
        try {
            res = await fetch(url + (url.includes('?') ? '&' : '?') + query, { headers, credentials: 'same-origin' });
        }
        catch {
            throw refused('auth_failed');
        }
        if (res.status === 401 || res.status === 403)
            throw refused('forbidden');
        const token = res.ok ? (await res.json().catch(() => null))?.token : null;
        if (typeof token !== 'string' || !token)
            throw refused('auth_failed');
        return token;
    }
    /**
     * A group call `name` on the mesh, encrypted end to end when its rule says so. Rejects with its `code`.
     */
    async group(name, options = {}) {
        await this.afterOut(name);
        const grant = await this.authorize({ room: name, type: options.type ?? 'video' });
        return this.connectGroup(name, await this.placeInRoom(name, grant.token, grant.media_key, { mayRecord: !!grant.record, acts: grant.acts }));
    }
    /**
     * Joins the group call in a token from the app's own server (`groupCallToken()` there), which decided that this user
     * may join and what they may do in it. The calls route isn't asked. Rejects with its `code`: `bad_token`, or `forbidden`
     * for a token made for another user, and for one signed before its user was taken out of the call: they need a new one to
     * come back, signed at least a second after. `banned` for someone a host banned, while the ban holds, and `locked`
     * for a locked call they weren't in, or were removed from.
     */
    async joinGroupCall(token) {
        const made = openToken(token);
        if (!made || typeof made.token !== 'string' || typeof made.room !== 'string')
            throw refused('bad_token');
        if (this.rt.user !== null && this.rt.user !== undefined && callUserOf(made.user) !== callUserOf(this.rt.user))
            throw refused('forbidden');
        return this.connectGroup(made.room, await this.placeInRoom(made.room, made.token, typeof made.media_key === 'string' ? made.media_key : undefined, {
            host: made.host,
            recorder: made.recorder,
            member: made.member,
            mayRecord: !!made.recorder,
            acts: made.acts,
        }));
    }
    /**
     * A place in the group call's room, with its token, and the room to connect to it: what it offers is what the realtime
     * server's place and the app's package both name (actsOf()), and a refusal is the server's code (`banned`, `locked` …),
     * with when a ban ends where the server says it (`until`, ms).
     */
    async placeInRoom(name, token, mediaKey, may) {
        const place = await this.ask('room', { tab: this.ride.tab, token });
        if (!place?.ok)
            throw refusedJoin(place);
        const room = await this.openRoom({}, mediaKey, undefined, (act, user, options) => this.moderateVia(name, act, user, may.host, options), {
            record: (action, recording) => this.recordVia(name, action, recording, may.recorder),
            mayRecord: may.mayRecord,
            hand: (up, user) => this.handVia(name, up, user, may.host, may.member),
            acts: actsOf(place.acts, may.acts),
        });
        return { room, place };
    }
    /**
     * Starts connecting, in the same tick that hands the room to the caller, so whoever awaited it is listening before anything
     * connects: a spotlight already on as it joins is said once, as the room connects.
     */
    connectGroup(name, { room, place }) {
        room.on('ended', (reason) => {
            if (reason === 'removed' || reason === 'closed')
                this.outAt.set(name, Date.now());
        });
        this.connectRoom(room, place, name);
        this.listeners.fire('group', [room], false);
        return room;
    }
    /**
     * The live stream `name`: the app's route signs Easy Stream's grant for it, as the app's
     * `streams()` rule says who is what in it, and the page joins as that host, guest or viewer. Its chat rides the page's
     * connection; its picture comes through the rooms script. Rejects with its `code`. `video: false` for a page that shows
     * only the chat or the stream's details: the picture is fetched once something wants it (`watch()`).
     *
     * @deprecated On an app's page, `rt.stream( name )`: a stream is no call.
     */
    async stream(name, options = {}) {
        const first = (await this.authorize({ stream: name })).token;
        return this.intoStream(name, first, async () => (await this.authorize({ stream: name })).token, options);
    }
    /**
     * Joins the live stream in a token from the app's own server (`streamToken()` there), which decided who this user is in
     * it. A token lasts minutes, so this takes a function that gets one, which is asked again as each runs out, and your
     * route may then say no. Rejects with its `code`: `bad_token`, or `expired` for a token given alone that ran out.
     */
    async joinStream(source, options = {}) {
        const read = (token) => {
            const made = openToken(token);
            if (!made || typeof made.token !== 'string' || typeof made.name !== 'string')
                throw refused('bad_token');
            return made;
        };
        const made = read(typeof source === 'function' ? await source() : source);
        return this.intoStream(made.name, made.token, async () => {
            if (typeof source !== 'function')
                throw refused('expired');
            return read(await source()).token;
        }, options);
    }
    async intoStream(name, token, renew, options) {
        let first = token;
        const ride = this.ride.options;
        // The engine is fetched on a page's first stream, so a page with calls alone never carries it.
        const { EasyStreamClient } = await streamsEngine(this.options.streams ?? this.options.rooms?.replace(/realtime-rooms\.min\.js(?=$|\?)/, 'realtime-streams.min.js'));
        const engine = new EasyStreamClient({
            cloud: ride.server,
            // The grant just signed, then a new one each time one runs out.
            grant: async () => {
                if (first) {
                    const given = first;
                    first = null;
                    return given;
                }
                return renew();
            },
            media: () => loadRoomClient(this.options.rooms),
            worker: ride.worker ?? null,
            video: options.video,
        });
        await engine.start();
        const joined = engine.getState();
        if (joined.status === 'error') {
            engine.stop();
            throw refused(joined.error ?? 'server');
        }
        return new Stream(name, engine);
    }
    /**
     * Who the page's user may add to calls named `name`, as the site lists them (the PHP package's `calls()`,
     * `people`): none when it lists nobody.
     */
    async people(name) {
        let answer;
        try {
            answer = await (this.options.authorize ?? ((r) => this.viaRoute(r)))({ people: name });
        }
        catch {
            return [];
        }
        return Array.isArray(answer?.people) ? answer.people.filter((p) => callUserOf(p?.id) !== null && typeof p?.name === 'string').map((p) => ({ ...p, id: callUserOf(p.id) })) : [];
    }
    /**
     * Whether the page's user may call each person about each call, as the site's rules answer for a caller, in the order
     * asked: what a list of people asks before it offers call buttons. `null` where the site gave no answer (a route of
     * the app's own that doesn't know the question, or a failed request): placing the call still asks the rule.
     */
    async may(asks) {
        const out = [];
        for (let i = 0; i < asks.length; i += MAY_AT_ONCE) {
            const part = asks.slice(i, i + MAY_AT_ONCE).map((a) => ({ call: a.call, to: a.to }));
            let answer = null;
            try {
                answer = await (this.options.authorize ?? ((r) => this.viaRoute(r)))({ may: part });
            }
            catch {
                answer = null;
            }
            const may = Array.isArray(answer?.may) && answer.may.length === part.length ? answer.may : null;
            for (let j = 0; j < part.length; j++)
                out.push(may ? may[j] === true : null);
        }
        return out;
    }
    /** Stops holding this page's line: its user's calls no longer ring here. */
    stopRinging() {
        this.ringOn = false;
        if (this.lineRenewal)
            clearTimeout(this.lineRenewal);
        this.lineRenewal = null;
        if (this.ride.socket.connected)
            this.ride.socket.emit('unline', { tab: this.ride.tab });
    }
    /** @internal */
    async answer(incoming) {
        if (incoming.group)
            return this.answerGroup(incoming, incoming.group);
        // A call from a token of the app's server brought the proof that this user was rung, which is all the calls route needs.
        const { ring } = incoming.proofs;
        const request = { call: incoming.call, id: incoming.id, role: 'callee', from: incoming.from, type: incoming.type, ...(ring ? { ring } : {}) };
        const grant = await this.authorize(request);
        const call = new Call(this, { id: incoming.id, name: incoming.call, type: incoming.type, role: 'callee', peer: { user: incoming.from, info: incoming.info } }, request, grant);
        this.ringing.delete(incoming.id);
        this.active.set(incoming.id, call);
        await call.begin();
        this.listeners.fire('call', [call], false);
        return call;
    }
    /** A ring into a group call, answered with the proof it brought: the site's token for this ring, then a place in its room. */
    async answerGroup(incoming, group) {
        const request = { call: incoming.call, id: incoming.id, role: 'callee', from: incoming.from, type: incoming.type, group, ...incoming.proofs };
        const grant = await this.authorize(request);
        this.ringing.delete(incoming.id);
        return this.joinGroup({ id: group, name: incoming.call, type: incoming.type, pair: grant.pair ?? incoming.proofs.pair, member: grant.member }, grant.token, grant.media_key);
    }
    /**
     * @internal A place in a group call's room, with the token of the call it was made from or of the ring answered,
     * the call's media already sent to it when it was a call.
     */
    async joinGroup(group, token, mediaKey, tracks) {
        const place = await this.ask('group', { tab: this.ride.tab, token });
        if (!place?.ok)
            throw refusedJoin(place);
        const link = {
            id: group.id,
            ref: refOf(group),
            add: (who) => this.addTo(group, who),
            invites: () => [...this.invites.values()].filter((invite) => invite.group === group.id),
        };
        const room = await this.openRoom({}, mediaKey, link);
        for (const [source, track] of tracks ?? [])
            await room.setTrack(source, track);
        this.groups.set(group.id, room);
        room.on('ended', () => {
            if (this.groups.get(group.id) !== room)
                return;
            this.groups.delete(group.id);
            for (const invite of link.invites())
                this.invites.delete(invite.id);
        });
        this.connectRoom(room, place, group.name);
        this.listeners.fire('group', [room], false);
        return room;
    }
    /**
     * @internal Rings `user` into a group call, or into the call that becomes one: the site's token for the ring first,
     * given for the proof that this page's user is in the call, and the proof the person was rung, which the server
     * hands them with the ring.
     */
    async invite(group, user) {
        const id = randomId(20);
        const grant = await this.authorize({ call: group.name, id, role: 'caller', to: user, type: group.type, group: group.id, pair: group.pair, member: group.member });
        return this.ringInto(group, id, user, grant);
    }
    /**
     * @internal Rings someone into a group call, or the call that becomes one: with a token from the app's own server
     * (`callToken( user, to, { into: call.ref } )`), or by their user id, which a rule of the app's decides.
     */
    addTo(group, who) {
        const made = typeof who === 'string' ? openCallToken(who) : null;
        if (!made)
            return this.invite(group, who);
        if (made.group !== group.id)
            return Promise.reject(refused('forbidden'));
        return this.ringInto(group, made.id, made.to, made);
    }
    async ringInto(group, id, user, grant) {
        const reply = await this.ask('invite', { tab: this.ride.tab, token: grant.token, ring: grant.ring });
        if (!reply?.ok)
            throw refused(reply?.error ?? 'server');
        // Its `ringing` may have come on the line first.
        let invite = this.invites.get(id);
        if (!invite) {
            invite = new Invite({ id, group: group.id, to: user, state: inviteState(reply.state) ?? 'ringing' });
            this.invites.set(id, invite);
            this.groups.get(group.id)?.invited(invite);
        }
        invite.own(async () => {
            const over = await this.ask('uninvite', { tab: this.ride.tab, token: grant.token });
            if (!over?.ok)
                throw refused(over?.error ?? 'server');
            const state = inviteState(over.state);
            if (state)
                invite.update(state);
        });
        return invite;
    }
    /** @internal */
    async decline(incoming, reason) {
        this.ringing.delete(incoming.id);
        const reply = await this.ask('decline', { tab: this.ride.tab, id: incoming.id, reason });
        if (!reply?.ok)
            throw refused(reply?.error ?? 'server');
    }
    /** @internal What a call needs of the page: its socket, tab, site, the relay's address and the rooms script. */
    transportFor(call) {
        return new SdkCallTransport({
            socket: this.ride.socket,
            tab: this.ride.tab,
            dispatcher: this.dispatcher,
            token: () => call.token,
            api: this.options.api,
            site: this.rt.site,
            onSocketChange: (listener) => {
                this.socketListeners.add(listener);
                return () => this.socketListeners.delete(listener);
            },
        });
    }
    /**
     * @internal A room, its encryption worker started when the site gave its key: a call's rooms always, a group call's
     * when its plugin encrypts it.
     */
    async openRoom(options, mediaKey, group, moderate, recording) {
        const lib = await loadRoomClient(this.options.rooms);
        return openRoom(lib, options, this.ride.keyring, { key: mediaKey, worker: this.options.roomsWorker, rooms: this.options.rooms, group, moderate, ...recording });
    }
    /**
     * Before joining a group call this page was just taken out of, or that just ended: the realtime server refuses a
     * token signed in the second of that, as from before it (better-messages-server's outs.ts), so the page asks its
     * server once the next second has begun. Someone removed who joins again at once was refused `forbidden`.
     */
    async afterOut(name) {
        const out = this.outAt.get(name);
        if (out === undefined)
            return;
        this.outAt.delete(name);
        const wait = (Math.floor(out / 1000) + 1) * 1000 + OUT_MARGIN_MS - Date.now();
        if (wait > 0)
            await new Promise((resolve) => setTimeout(resolve, wait));
    }
    /**
     * A host's act in the group call `name`, as the site's calls route answers it: whether it changed anything, and for an
     * ask its id, for the rules the rules now. A ban's `minutes`, an ask's `devices` and the `rules` go with it.
     */
    async moderateVia(name, act, user, host, options = {}) {
        const request = {
            moderate: name,
            act,
            user,
            ...(host ? { host } : {}),
            ...(options.minutes !== undefined ? { minutes: options.minutes } : {}),
            ...(options.devices ? { devices: options.devices } : {}),
            ...(options.rules ? { rules: options.rules } : {}),
        };
        const answer = await (this.options.authorize ?? ((r) => this.viaRoute(r)))(request);
        if (answer?.denied)
            throw refused(answer.denied);
        if (typeof answer?.done !== 'boolean')
            throw refused('server');
        return {
            done: answer.done,
            ...(typeof answer.id === 'string' ? { id: answer.id } : {}),
            ...(answer.rules && typeof answer.rules === 'object' ? { rules: answer.rules } : {}),
        };
    }
    /**
     * A hand in the group call `name`, through the site's calls route: this user's own up or down, or with `user` a host
     * lowering another's (null: everyone's), with the token's proofs that this user is in the call and hosts it.
     */
    async handVia(name, up, user, host, member) {
        const request = { hand: name, up, ...(user !== undefined ? { user } : {}), ...(host ? { host } : {}), ...(member ? { member } : {}) };
        const answer = await (this.options.authorize ?? ((r) => this.viaRoute(r)))(request);
        if (answer?.denied)
            throw refused(answer.denied);
        if (typeof answer?.done !== 'boolean')
            throw refused('server');
        return answer.done;
    }
    /** Starts or stops the recording of the group call `name`, as the site's calls route answers it. */
    async recordVia(name, record, recording, recorder) {
        const request = { call: name, record, ...(recording === undefined ? {} : { recording }), ...(recorder ? { recorder } : {}) };
        const answer = await (this.options.authorize ?? ((r) => this.viaRoute(r)))(request);
        if (answer?.denied)
            throw refused(answer.denied);
        if (typeof answer?.recording?.id !== 'string')
            throw refused('server');
        return answer.recording;
    }
    /** Connects a room in the background: one that fails is left, and said so. */
    connectRoom(room, place, name) {
        void room.connect({ server: place.server, token: place.token, iceServers: place.ice_servers, micHeld: place.mic_held === true }).catch((error) => {
            room.leave();
            this.listeners.fire('error', [{ code: 'room_failed', room: name, error }], false);
        });
    }
    /** @internal The page's keyring, which opens what the site said about the people in a call. */
    get keyring() {
        return this.ride.keyring;
    }
    /** @internal */
    forget(call) {
        if (this.active.get(call.id) === call)
            this.active.delete(call.id);
    }
    /** @internal The site's answer to a request, or a refusal with its code. */
    async authorize(request) {
        let grant;
        try {
            grant = await (this.options.authorize ?? ((r) => this.viaRoute(r)))(request);
        }
        catch {
            throw refused('auth_failed');
        }
        if (grant?.denied)
            throw refused(grant.denied);
        if (typeof grant?.token !== 'string' || !grant.token)
            throw refused('auth_failed');
        return grant;
    }
    async viaRoute(request) {
        const route = this.options.calls ?? routeBeside(this.ride.options);
        if (!route)
            return { denied: 'no_auth' };
        // On another website (rooms()' `embedded`), at the site's absolute address alone and without cookies (site.ts).
        const res = await siteRequest(this.ride.options, route, request);
        if (res.status === 403 || res.status === 401)
            return { denied: (await res.json().catch(() => null))?.denied ?? 'forbidden' };
        if (!res.ok)
            throw new Error('calls route ' + res.status);
        return (await res.json());
    }
    ask(event, payload, via) {
        return (via ?? this.ride.socket).timeout(ANSWER_MS).emitWithAck(event, payload).catch(() => ({ error: 'timeout' }));
    }
    /** Holds the line on the socket, or a move's new one before it takes over; asks the site for it when it has none. */
    async holdLine(via) {
        if (!this.ringOn)
            return;
        if (!this.line || this.line.exp - nowS() < 60) {
            try {
                const grant = await this.authorize({ line: true });
                this.line = { user: null, token: grant.token, exp: Number(grant.exp) || nowS() + 3600 };
            }
            catch (e) {
                // A page without a signed-in user (or a visitor id) has no line: nothing rings here.
                this.line = null;
                if (e?.code !== 'no_user')
                    this.listeners.fire('error', [{ code: e?.code ?? 'auth_failed', what: 'line' }], false);
                return;
            }
        }
        const reply = await this.ask('line', { tab: this.ride.tab, token: this.line.token }, via);
        if (!reply?.ok) {
            if (reply?.error === 'expired')
                this.line = null;
            if (reply?.error !== 'timeout')
                this.listeners.fire('error', [{ code: reply?.error ?? 'server', what: 'line' }], false);
            return;
        }
        for (const ring of reply.ringing ?? [])
            this.ring(ring);
        this.scheduleLineRenewal();
    }
    scheduleLineRenewal() {
        if (this.lineRenewal)
            clearTimeout(this.lineRenewal);
        if (!this.line)
            return;
        const inS = Math.max(30, this.line.exp - RENEW_BEFORE_S - nowS());
        this.lineRenewal = setTimeout(() => {
            this.line = null;
            if (this.ride.socket.connected)
                void this.holdLine();
        }, inS * 1000);
    }
    onLine(m) {
        if (!m || typeof m.id !== 'string')
            return;
        if (m.op === 'incoming')
            this.ring(m);
        else if (m.op === 'ring_over') {
            const incoming = this.ringing.get(m.id);
            if (!incoming)
                return;
            this.ringing.delete(m.id);
            incoming.over(String(m.reason ?? 'ended'));
        }
        else if (m.op === 'invite')
            this.heardInvite(m);
    }
    /** Someone rung into a group call this page's user is in, or how that ring ended: the room hears of a new one. */
    heardInvite(m) {
        const state = inviteState(m.state);
        const to = callUserOf(m.to);
        if (!state || typeof m.group !== 'string' || to === null)
            return;
        const known = this.invites.get(m.id);
        if (known) {
            known.update(state);
            return;
        }
        const invite = new Invite({ id: m.id, group: m.group, from: callUserOf(m.from), to, state });
        this.invites.set(m.id, invite);
        this.groups.get(m.group)?.invited(invite);
    }
    /**
     * A call ringing: shown once the caller's info opens (the site seals it with the day's key), after asking the site
     * for a key the page lacks. Ringing already, so a `ring_over` meanwhile stops it before it shows.
     */
    ring(m) {
        if (typeof m?.id !== 'string' || this.ringing.has(m.id) || this.active.has(m.id))
            return;
        const keys = this.ride.keyring;
        const opened = () => keys.openJson(m.info) ?? null;
        const missing = keys.missing(m.info);
        const incoming = new Incoming(this, { ...m, info: missing.length === 0 ? opened() : null });
        this.ringing.set(m.id, incoming);
        if (missing.length === 0) {
            this.listeners.fire('incoming', [incoming], false);
            return;
        }
        void keys.ensure(missing).then(() => {
            if (this.ringing.get(m.id) !== incoming || incoming.state !== 'ringing')
                return;
            incoming.opened(opened());
            this.listeners.fire('incoming', [incoming], false);
        });
    }
}
/**
 * The realtime server's refusal of a place in a group call, by its code: `banned` (with `until`, when the ban ends, in ms,
 * where the server says it), `locked`, `forbidden`, `expired` …
 */
function refusedJoin(place) {
    const error = refused(typeof place?.error === 'string' && place.error !== '' ? place.error : 'server');
    if (typeof place?.until === 'number')
        Object.assign(error, { until: place.until });
    return error;
}
/** A token from the app's server, read, or null for anything else. */
function openToken(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+$/.test(token))
        return null;
    try {
        const bytes = Uint8Array.from(atob(token.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        const made = JSON.parse(new TextDecoder().decode(bytes));
        return made && typeof made === 'object' ? made : null;
    }
    catch {
        return null;
    }
}
/** What a page sends the app's route to ring someone into this call: the call, and the proof that this user is in it. */
function refOf(group) {
    const text = String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ id: group.id, name: group.name, type: group.type, pair: group.pair, member: group.member })));
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** A token from the app's `callToken()`, read, or null for anything else. */
function openCallToken(token) {
    const made = openToken(token);
    if (typeof made?.token !== 'string' || typeof made.call !== 'string' || typeof made.id !== 'string' || typeof made.member !== 'string')
        return null;
    const to = callUserOf(made.to);
    const pair = Array.isArray(made.pair) && made.pair.length === 2 ? made.pair.map(callUserOf) : [];
    if (to === null || pair.length !== 2 || pair.includes(null))
        return null;
    return { ...made, token: made.token, call: made.call, id: made.id, member: made.member, to, type: made.type === 'audio' ? 'audio' : 'video', pair: pair };
}
/** The calls route beside the rooms' auth route: `…/realtime/auth` → `…/realtime/calls`. */
function routeBeside(options) {
    const auth = options.auth;
    if (!auth?.endpoint || !/\/auth\/?$/.test(auth.endpoint))
        return null;
    return { endpoint: auth.endpoint.replace(/\/auth\/?$/, '/calls'), headers: auth.headers };
}
/**
 * A call ringing for this page's user, or a ring into a group call (`group`: someone in it added them). `over` (the
 * reason) when it stops ringing: answered elsewhere, declined, cancelled …
 */
export class Incoming {
    constructor(owner, m) {
        this.owner = owner;
        this.state = 'ringing';
        this.reason = null;
        this.listeners = new Listeners();
        this.id = m.id;
        this.call = String(m.call ?? '');
        this.from = callUserOf(m.from) ?? 0;
        this.info = null;
        this.type = m.type === 'audio' ? 'audio' : 'video';
        this.group = typeof m.group === 'string' && m.group !== '' ? m.group : null;
        const two = Array.isArray(m.pair) && m.pair.length === 2 ? m.pair.map(callUserOf) : [];
        const pair = two.length === 2 && two.every((u) => u !== null) ? two : undefined;
        this.proofs = { pair, ring: typeof m.ring === 'string' ? m.ring : undefined };
        this.opened(m.info ?? null);
    }
    /**
     * @internal The caller's info, once it opens. A call from a token of the app's server carries the proof that this
     * user was rung inside it, which is for the calls route alone and not part of what the app said about the caller.
     */
    opened(info) {
        if (info && typeof info === 'object' && typeof info._ring === 'string') {
            const { _ring, ...rest } = info;
            this.proofs.ring = _ring;
            this.info = Object.keys(rest).length > 0 ? rest : null;
            return;
        }
        this.info = info;
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /**
     * Answers: the call, connecting, or for a ring into a group call (`group`) the GroupCall. Rejects with its `code`, such as
     * `forbidden` when the plugin said no.
     */
    accept() {
        if (this.state !== 'ringing')
            return Promise.reject(refused(this.reason ?? 'not_ringing'));
        this.state = 'answered';
        // It rings no more, wherever it shows: a ring card stayed when a page answered through the API (an SDK review).
        this.listeners.fire('over', ['answered'], false);
        return this.owner.answer(this);
    }
    /** Turns it down, or says this user is busy: it ends for the caller, and stops ringing on every tab. */
    decline(reason = 'declined') {
        if (this.state !== 'ringing')
            return Promise.resolve();
        this.state = 'declined';
        this.listeners.fire('over', [reason], false);
        return this.owner.decline(this, reason);
    }
    /** @internal */
    over(reason) {
        if (this.state !== 'ringing')
            return;
        this.state = 'over';
        this.reason = reason;
        this.listeners.fire('over', [reason], false);
    }
}
const NOTHING = { camera: false, microphone: false, screen_share: false, screen_share_audio: false };
/**
 * A call between two people. Events: `state` (CallState), `path` (CallPath), `remote` (RemoteMedia), `waiting`
 * ({ until, reason }: the mesh is finding the room a place), `reacquire` (the source the other side stopped hearing:
 * open the device again), `autoplay_blocked` (a click must start the sound: `startAudio()`), `group` (GroupCall: someone
 * was added, and the call goes on as a group call there, with what this page sends), and `ended` (the reason; `group`
 * after `group`).
 */
export class Call {
    constructor(owner, who, request, grant) {
        this.owner = owner;
        this.request = request;
        this.path = null;
        this.endReason = null;
        this.remote = { camera: null, microphone: null, screen: null, screenAudio: null, media: { ...NOTHING }, quality: 'unknown' };
        this.listeners = new Listeners();
        this.local = new Map();
        // What setCamera(), setMicrophone() and setScreenShare() opened, handed to the group call this call may become.
        this.opened = new LocalDevices((source, track) => this.setTrack(source, track), () => null);
        this.room = null;
        this.toGroupOnce = null;
        this.reporter = null;
        this.reportTimer = null;
        this.roomWait = null;
        this.renewal = null;
        this.connectedOnce = false;
        this.handedOver = false;
        this.id = who.id;
        this.name = who.name;
        this.type = who.type;
        this.role = who.role;
        this.peer = who.peer;
        this.state = who.role === 'caller' ? 'ringing' : 'connecting';
        this.token = grant.token;
        this.mediaKey = grant.media_key;
        this.proofs = { pair: grant.pair, member: grant.member };
        this.transport = owner.transportFor(this);
        this.session = new P2PCallSession({ transport: this.transport, callId: this.id, type: this.type, signalKey: grant.key ?? '' });
        this.scheduleRenewal(Number(grant.exp) || nowS() + 3600);
        this.session.on('peerJoined', () => {
            if (this.state === 'ringing')
                this.setState('connecting');
        });
        this.session.on('connection', (state) => {
            if (state === 'connected') {
                this.connectedOnce = true;
                this.setState('connected');
            }
            else if (state === 'reconnecting')
                this.setState('reconnecting');
            else if (state === 'connecting' && this.state !== 'ringing')
                this.setState(this.connectedOnce ? 'reconnecting' : 'connecting');
        });
        this.session.on('participant', (view) => this.fromView(view));
        this.session.on('stats', (stats) => this.fromStats(stats));
        this.session.on('fallback', (sfu) => void this.toRoom(sfu));
        // Someone was added: the relay ends the call between two people as `group`, and it goes on in the group's room.
        this.session.on('ended', (reason) => (reason === 'group' ? void this.toGroup() : this.finish(reason)));
        this.session.on('playbackBlocked', () => this.listeners.fire('autoplay_blocked', [], false));
        this.session.on('reacquire', (source) => this.listeners.fire('reacquire', [source], false));
    }
    on(event, fn) {
        this.listeners.on(event, fn);
        return this;
    }
    off(event, fn) {
        this.listeners.off(event, fn);
        return this;
    }
    /**
     * Rings someone into the call, which becomes a group call: both sides get `room` and go on there, and they arrive in it
     * once they answer. Takes a token from the app's own server, `callToken( user, to, { into: call.ref } )`, which decided
     * they may be added, or a user id, which a rule of the app's decides. Rejects with its `code`: `not_connected` before the
     * call is up, or the site's or the server's refusal.
     */
    add(who) {
        if (this.state !== 'connected' && this.state !== 'reconnecting')
            return Promise.reject(refused('not_connected'));
        return this.owner.addTo(this.group(), who);
    }
    /** What the page sends your route to ring someone into this call: `realtime.callToken( user, to, { into: ref } )`. */
    get ref() {
        return refOf(this.group());
    }
    /** The group call this call is, or becomes. */
    group() {
        return { id: this.id, name: this.name, type: this.type, ...this.proofs };
    }
    /**
     * The browser's camera, opened and sent, or stopped with false: the device named, the one last named, or the browser's
     * own choice, and named while on, it moves there. Closed as the call ends. Rejects with its `code`: `device_denied`,
     * `device_missing`, `device_busy` or `no_devices`.
     */
    setCamera(on, options) {
        return this.opened.setCamera(on, options);
    }
    /** The browser's microphone, as `setCamera()` has its camera. */
    setMicrophone(on, options) {
        return this.opened.setMicrophone(on, options);
    }
    /** Shares a screen, its sound with it where the browser gives it, or stops: whether one is shared now. */
    setScreenShare(on) {
        return this.opened.setScreenShare(on);
    }
    /** The cameras, microphones and speakers this browser has. Their names are empty until the browser gave the site one. */
    devices() {
        return listDevices();
    }
    /** What this page sends now, for a picture of its own: `video.srcObject = new MediaStream( [ call.camera ] )`. */
    get camera() {
        return this.local.get('camera') ?? null;
    }
    get microphone() {
        return this.local.get('microphone') ?? null;
    }
    get screen() {
        return this.local.get('screen_share') ?? null;
    }
    /** The other side's sound, where the browser held it back: call it from a click, such as a Turn On Sound button. */
    async startAudio() {
        await this.session.resumePlayback();
        await this.room?.startAudio();
    }
    /** What this page sends from a source: a live track of your own, or null to stop sending it. */
    setTrack(source, track) {
        this.opened.replaced(source, track);
        if (track)
            this.local.set(source, track);
        else
            this.local.delete(source);
        this.session.setLocalTrack(source, track);
        void this.room?.setTrack(source, track);
    }
    /** Hangs up, or calls it off while it still rings (`cancelled`). */
    end() {
        if (this.state === 'ended')
            return;
        const reason = this.state === 'ringing' ? 'cancelled' : 'hangup';
        if (this.room)
            this.session.leaveAfterHandoff(reason);
        else
            this.session.end(reason);
        this.finish(reason);
    }
    /** @internal Joins the call: as its caller, that makes it ring. */
    async begin() {
        const started = await this.session.start();
        if (!started)
            this.finish('not_started');
    }
    setState(state) {
        if (this.state === state || this.state === 'ended')
            return;
        this.state = state;
        this.listeners.fire('state', [state], false);
    }
    setPath(path) {
        if (this.path === path)
            return;
        this.path = path;
        this.listeners.fire('path', [path], false);
    }
    fromView(view) {
        if (this.room)
            return;
        this.remote = {
            camera: view.video,
            microphone: view.audio,
            screen: view.screen,
            screenAudio: view.screenAudio,
            media: { ...view.mediaState },
            quality: view.quality,
        };
        this.listeners.fire('remote', [this.remote], false);
    }
    fromStats(stats) {
        if (this.room || !stats.candidatePair)
            return;
        const pair = stats.candidatePair;
        this.setPath(pair.local === 'relay' || pair.remote === 'relay' ? 'relay' : 'direct');
    }
    /** Neither the direct path nor TURN carried the call: it goes on in a room on the mesh, with what this page sends. */
    async toRoom(sfu) {
        if (this.room || this.state === 'ended')
            return;
        this.setPath('room');
        this.setState('connecting');
        try {
            // Encrypted end to end with the call's key, as the direct path is.
            const room = await this.owner.openRoom({ adaptiveStream: false }, this.mediaKey);
            // Hung up while the room client loaded.
            if (this.state === 'ended') {
                room.leave();
                return;
            }
            this.room = room;
            room.on('waiting', (wait) => this.listeners.fire('waiting', [wait], false));
            room.on('state', (state) => {
                if (state === 'connected')
                    this.setState('connected');
                else if (state === 'reconnecting' || state === 'waiting')
                    this.setState(state === 'waiting' ? 'connecting' : 'reconnecting');
            });
            room.on('person', (person) => {
                if (person.user !== this.peer.user)
                    return;
                this.clearRoomWait();
                this.fromPerson(person);
            });
            // Gone, or away and maybe coming back: the minute's wait starts as soon as they leave.
            room.on('person_away', (person) => {
                if (person.user === this.peer.user)
                    this.waitInRoom();
            });
            room.on('person_left', (person) => {
                if (person.user === this.peer.user)
                    this.waitInRoom();
            });
            // The room gave up for good: the call can't go on.
            room.on('ended', () => {
                if (this.state === 'ended')
                    return;
                this.session.leaveAfterHandoff('room_lost');
                this.finish('room_lost');
            });
            for (const [source, track] of this.local)
                await room.setTrack(source, track);
            if (!sfu.server)
                throw refused('no_server');
            await room.connect({ server: sfu.server, token: sfu.token });
            // What the room leg ran on, for the call's record, as the rooms in Better Messages report theirs.
            this.reporter = new SfuReporter(this.transport, this.id);
            this.reportTimer = setInterval(() => void this.reporter?.report(room.livekit, 0, 0), ROOM_REPORT_MS);
            if (!room.people().some((p) => p.user === this.peer.user))
                this.waitInRoom();
        }
        catch {
            this.end();
        }
    }
    /**
     * Someone was added: the call goes on in the group call's room, encrypted with the call's key, with what this page
     * sends. `room` hands it to the page before the call ends as `group`.
     */
    toGroup() {
        this.toGroupOnce ?? (this.toGroupOnce = (async () => {
            if (this.state === 'ended')
                return;
            try {
                const room = await this.owner.joinGroup(this.group(), this.token, this.mediaKey, this.local);
                if (this.state === 'ended') {
                    room.leave();
                    return;
                }
                this.setPath('room');
                // The devices it opened go on in the group call, which closes them as it ends.
                room.takeDevices(this.opened);
                this.handedOver = true;
                this.listeners.fire('group', [room], false);
                this.finish('group');
            }
            catch (error) {
                this.finish(error?.code === 'encryption_unsupported' ? 'encryption_unsupported' : 'group_failed');
            }
        })());
        return this.toGroupOnce;
    }
    fromPerson(person) {
        this.remote = {
            camera: person.camera,
            microphone: person.microphone,
            screen: person.screen,
            screenAudio: person.screenAudio,
            media: { camera: !!person.camera, microphone: !!person.microphone, screen_share: !!person.screen, screen_share_audio: !!person.screenAudio },
            quality: 'good',
        };
        this.listeners.fire('remote', [this.remote], false);
    }
    /** The other side isn't in the room: on its way after a hand-off, or gone. It gets a minute. */
    waitInRoom() {
        if (this.roomWait || this.state === 'ended')
            return;
        this.roomWait = setTimeout(() => {
            this.roomWait = null;
            if (this.state === 'ended')
                return;
            this.session.leaveAfterHandoff('peer_lost');
            this.finish('peer_lost');
        }, ROOM_WAIT_MS);
    }
    clearRoomWait() {
        if (this.roomWait)
            clearTimeout(this.roomWait);
        this.roomWait = null;
    }
    /** The token asked for again before it runs out, so a join after a long drop still has one. */
    scheduleRenewal(exp) {
        if (this.renewal)
            clearTimeout(this.renewal);
        this.renewal = setTimeout(async () => {
            this.renewal = null;
            if (this.state === 'ended')
                return;
            try {
                const grant = await this.owner.authorize(this.request);
                this.token = grant.token;
                this.mediaKey = grant.media_key ?? this.mediaKey;
                if (grant.member)
                    this.proofs = { pair: grant.pair, member: grant.member };
                this.scheduleRenewal(Number(grant.exp) || nowS() + 3600);
            }
            catch {
                this.scheduleRenewal(nowS() + RENEW_BEFORE_S + 60);
            }
        }, Math.max(30, exp - RENEW_BEFORE_S - nowS()) * 1000);
    }
    /** The call is over, however it ended: what it held goes, the room with it. */
    finish(reason) {
        if (this.state === 'ended')
            return;
        this.endReason = reason;
        this.state = 'ended';
        this.clearRoomWait();
        if (this.renewal)
            clearTimeout(this.renewal);
        if (this.reportTimer)
            clearInterval(this.reportTimer);
        this.reporter?.close();
        this.room?.leave();
        if (!this.handedOver)
            this.opened.stop();
        this.owner.forget(this);
        this.listeners.fire('state', ['ended'], false);
        this.listeners.fire('ended', [reason], false);
    }
}
