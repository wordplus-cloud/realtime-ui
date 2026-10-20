import { ElementViewTracker } from "./view.js";
export class RemoteMediaTrack {
    constructor(mediaStreamTrack, source, onPlaybackBlocked, onViewChange = null) {
        this.mediaStreamTrack = mediaStreamTrack;
        this.source = source;
        this.onPlaybackBlocked = onPlaybackBlocked;
        this.onViewChange = onViewChange;
        this.attachedElements = [];
        this.viewTracker = null;
        this.sid = 'p2p_' + source + '_' + mediaStreamTrack.id;
        this.stream = new MediaStream([mediaStreamTrack]);
    }
    get kind() {
        return this.mediaStreamTrack.kind === 'audio' ? 'audio' : 'video';
    }
    get isMuted() {
        return this.mediaStreamTrack.muted;
    }
    attach(element) {
        if (!element)
            return element;
        if (element.srcObject !== this.stream) {
            element.srcObject = this.stream;
        }
        element.autoplay = true;
        if (element instanceof HTMLVideoElement) {
            element.playsInline = true;
        }
        if (!this.attachedElements.includes(element)) {
            this.attachedElements.push(element);
        }
        // The layouts attach and never detach: the boxes a video is shown in
        // are watched from here, so the other side can be told what size to
        // send (a screen share to the pixel, the camera by rung).
        if (this.kind === 'video' && this.onViewChange) {
            if (!this.viewTracker) {
                this.viewTracker = new ElementViewTracker(this.onViewChange, this.source === 'screen_share');
            }
            this.viewTracker.observe(element);
        }
        this.play(element);
        return element;
    }
    play(element) {
        const attempt = element.play();
        if (attempt && typeof attempt.catch === 'function') {
            attempt.catch((error) => {
                const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
                if (name === 'NotAllowedError') {
                    this.onPlaybackBlocked(element);
                }
            });
        }
    }
    // How big this track is shown, as a height in device pixels (a VIEW_STEPS
    // rung for the camera, the shown size rounded up to a small step for a
    // screen share); 0 when no attached element shows it. Elements the
    // layout has thrown away are dropped on the way.
    wantedHeight() {
        if (!this.viewTracker)
            return 0;
        for (const element of this.viewTracker.stale()) {
            this.detach(element);
        }
        return this.viewTracker.wantedHeight();
    }
    detach(element) {
        const targets = element ? [element] : [...this.attachedElements];
        for (const target of targets) {
            if (target.srcObject === this.stream) {
                target.srcObject = null;
            }
            const index = this.attachedElements.indexOf(target);
            if (index > -1) {
                this.attachedElements.splice(index, 1);
            }
            if (this.viewTracker) {
                this.viewTracker.unobserve(target);
            }
        }
        if (!element && this.viewTracker) {
            this.viewTracker.close();
            this.viewTracker = null;
        }
        return targets;
    }
    stop() {
        this.detach();
    }
}
