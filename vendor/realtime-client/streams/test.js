// A test stream: a host on a site whose streams the cloud doesn't take yet goes live in this browser alone, and watches
// it on the stream's page as its viewers will. The studio's window keeps the test (`window.wordplusLiveStreamTests`, by
// the stream's id), and a page opened from it with window.open reads it from its opener: the same origin, so the same
// MediaStreamTrack objects play there, with no network and no signalling. Nobody else can see it, and nothing of it
// leaves the browser.
//
// The two windows share one agent, so the page calls the test's methods and the test calls the page's listener at once.
// Nothing here uses instanceof on what the other window made, which is of another realm, and a listener that throws (a
// page that is gone) is let go.
export const TEST_REGISTRY = 'wordplusLiveStreamTests';
// The most chat messages a test keeps, as a stream's chat shows its last ones.
export const TEST_CHAT_MAX = 200;
// The longest message, as the cloud takes them.
const TEST_TEXT_MAX = 500;
// The person every message of a test is from: the host, in the studio and on the page alike.
export const TEST_IDENTITY = 'local';
const NO_MEDIA = { camera: null, screen: null, audio: [], micMuted: true };
const sameMedia = (a, b) => a.camera === b.camera && a.screen === b.screen && a.micMuted === b.micMuted && a.audio.length === b.audio.length && a.audio.every((t, i) => t === b.audio[i]);
export class TestFeed {
    constructor(stream, host, startedAt) {
        this.stream = stream;
        this.host = host;
        this.startedAt = startedAt;
        this.endedAt = null;
        this.media = NO_MEDIA;
        this.chat = [];
        // The pages watching it, as they come and go.
        this.watching = 0;
        this.listeners = new Set();
        this.seq = 0;
    }
    listen(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    update(media) {
        if (this.endedAt !== null || sameMedia(media, this.media))
            return;
        this.media = { ...media, audio: [...media.audio] };
        this.tell({ type: 'change' });
    }
    end(at = Date.now()) {
        if (this.endedAt !== null)
            return;
        this.endedAt = at;
        this.media = NO_MEDIA;
        this.tell({ type: 'change' });
    }
    // A page watching, until the function it gets back is called (once).
    watch() {
        this.watching += 1;
        this.tell({ type: 'change' });
        let left = false;
        return () => {
            if (left)
                return;
            left = true;
            this.watching = Math.max(0, this.watching - 1);
            this.tell({ type: 'change' });
        };
    }
    // A message from the host, in the studio or on the page: null for nothing to say, or once the test has ended.
    say(text) {
        const said = String(text).trim().slice(0, TEST_TEXT_MAX);
        if (!said || this.endedAt !== null)
            return null;
        const at = Date.now();
        const message = { id: at + '-' + ++this.seq, from: { id: TEST_IDENTITY, name: this.host.name, avatar: this.host.avatar, role: 'host' }, text: said, at };
        this.chat = [...this.chat, message].slice(-TEST_CHAT_MAX);
        this.tell({ type: 'change' });
        return message;
    }
    react(kind) {
        if (this.endedAt === null && typeof kind === 'string' && kind)
            this.tell({ type: 'reaction', kind });
    }
    tell(event) {
        for (const listener of [...this.listeners]) {
            try {
                listener(event);
            }
            catch (e) {
                this.listeners.delete(listener);
            }
        }
    }
}
const registry = (scope, make) => {
    const found = scope[TEST_REGISTRY];
    if (found && typeof found === 'object')
        return found;
    if (!make)
        return null;
    const made = {};
    scope[TEST_REGISTRY] = made;
    return made;
};
// The studio's test, where a page it opens finds it.
export function publishTest(feed, scope = globalThis) {
    registry(scope, true)[feed.stream] = feed;
}
export function withdrawTest(feed, scope = globalThis) {
    const tests = registry(scope, false);
    if (tests && tests[feed.stream] === feed)
        delete tests[feed.stream];
}
// The test of this stream in the window that opened this page, or null: none, a closed one, or another origin's, which
// the browser keeps out of reach.
export function openerTest(stream, scope = globalThis) {
    try {
        const opener = scope.opener;
        if (!opener || opener.closed)
            return null;
        const feed = registry(opener, false)?.[stream];
        return feed && typeof feed.listen === 'function' && typeof feed.watch === 'function' ? feed : null;
    }
    catch (e) {
        return null;
    }
}
// The browser's channel for this origin where a studio says that its test of a stream runs, and no longer does, and a
// page asks. A page that cannot reach the studio through its opener (typed in, opened some other way, or kept apart from
// the studio by the site's Cross-Origin-Opener-Policy) learns that a test runs, so it can say how to watch it, though it
// cannot show it.
export const TEST_CHANNEL = 'wplus-live-stream-test';
// The channel, or null in a browser without one.
export function testChannel(listen, scope = globalThis) {
    const Channel = scope.BroadcastChannel;
    if (typeof Channel !== 'function')
        return null;
    let channel;
    try {
        channel = new Channel(TEST_CHANNEL);
    }
    catch (e) {
        return null;
    }
    channel.onmessage = (event) => {
        const word = event.data;
        if (word && (word.test === 'on' || word.test === 'off' || word.test === 'ask') && typeof word.stream === 'string')
            listen({ test: word.test, stream: word.stream });
    };
    return {
        say: (word) => {
            try {
                channel.postMessage(word);
            }
            catch (e) { }
        },
        close: () => channel.close()
    };
}
// A track of a test in the page's <video> and <audio>, attached as the RTC client's tracks are (the views call attach
// and detach). Sound waits for the host (`silent`, the page's "Turn sound on"): the studio's microphone is in the same
// room, and would hear itself.
export class TestTrack {
    constructor(mediaStreamTrack, silent = false) {
        this.mediaStreamTrack = mediaStreamTrack;
        this.attached = new Set();
        this.sid = 'test-' + mediaStreamTrack.id;
        this.silent = silent && mediaStreamTrack.kind === 'audio';
    }
    get kind() {
        return this.mediaStreamTrack.kind;
    }
    attach(element) {
        this.attached.add(element);
        if (!this.silent)
            this.play(element);
        return element;
    }
    detach(element) {
        const elements = element ? [element] : [...this.attached];
        for (const e of elements) {
            this.attached.delete(e);
            e.srcObject = null;
        }
        return elements;
    }
    setSilent(silent) {
        if (this.mediaStreamTrack.kind !== 'audio' || silent === this.silent)
            return;
        this.silent = silent;
        for (const element of this.attached) {
            if (silent)
                element.srcObject = null;
            else
                this.play(element);
        }
    }
    play(element) {
        element.srcObject = new MediaStream([this.mediaStreamTrack]);
        void element.play?.()?.catch?.(() => { });
    }
}
