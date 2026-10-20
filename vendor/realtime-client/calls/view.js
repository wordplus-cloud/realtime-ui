import { VIEW_STEPS } from "./types.js";
const DEFAULT_ASPECT = 9 / 16;
// An exact wish is rounded UP to an even number of pixels, which is the
// smallest step an encoder will actually produce. Anything coarser would
// hand the viewer a picture slightly larger than its box, and the browser
// would resample it on the way to the screen: the softening this whole
// path exists to avoid. A window being dragged is settled in the session
// instead (VIEW_SETTLE_MS), not by rounding it away here.
const EXACT_STEP = 2;
export function viewStep(height) {
    if (!(height > 0))
        return 0;
    for (const step of VIEW_STEPS) {
        if (step >= height)
            return step;
    }
    return VIEW_STEPS[VIEW_STEPS.length - 1];
}
export class ElementViewTracker {
    constructor(onChange, exact = false) {
        this.onChange = onChange;
        this.exact = exact;
        this.watched = new Map();
        this.resizeObserver = null;
        this.intersectionObserver = null;
        this.visibilityListener = null;
        this.closed = false;
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const item = this.watched.get(entry.target);
                    if (!item)
                        continue;
                    const rect = entry.contentRect;
                    item.width = rect.width;
                    item.height = rect.height;
                }
                this.changed();
            });
        }
        if (typeof IntersectionObserver !== 'undefined') {
            this.intersectionObserver = new IntersectionObserver((entries) => {
                for (const entry of entries) {
                    const item = this.watched.get(entry.target);
                    if (!item)
                        continue;
                    item.intersecting = entry.isIntersecting;
                }
                this.changed();
            });
        }
        this.visibilityListener = () => this.changed();
        document.addEventListener('visibilitychange', this.visibilityListener);
    }
    observe(element) {
        if (this.closed || this.watched.has(element))
            return;
        const rect = element.getBoundingClientRect();
        const item = { element, width: rect.width, height: rect.height, intersecting: true, listeners: [] };
        // The video's own size decides how the box is filled; picture in
        // picture keeps the element on screen while the tab is away.
        for (const name of ['loadedmetadata', 'resize', 'enterpictureinpicture', 'leavepictureinpicture']) {
            const listener = () => this.changed();
            element.addEventListener(name, listener);
            item.listeners.push([element, name, listener]);
        }
        this.watched.set(element, item);
        if (this.resizeObserver)
            this.resizeObserver.observe(element);
        if (this.intersectionObserver)
            this.intersectionObserver.observe(element);
        this.changed();
    }
    unobserve(element) {
        const item = this.watched.get(element);
        if (!item)
            return;
        this.watched.delete(element);
        for (const [target, name, listener] of item.listeners) {
            target.removeEventListener(name, listener);
        }
        if (this.resizeObserver)
            this.resizeObserver.unobserve(element);
        if (this.intersectionObserver)
            this.intersectionObserver.unobserve(element);
        if (!this.closed)
            this.changed();
    }
    // Elements React has already thrown away are still attached from the
    // layout's point of view; they are dropped here rather than counted.
    stale() {
        const out = [];
        for (const element of this.watched.keys()) {
            if (!element.isConnected)
                out.push(element);
        }
        return out;
    }
    // Height of the largest visible box in device pixels, as a VIEW_STEPS
    // rung, or rounded up to EXACT_STEP when exact; 0 when nothing shows the
    // track.
    wantedHeight() {
        let best = 0;
        for (const item of this.watched.values()) {
            const height = this.visibleHeight(item);
            if (height > best)
                best = height;
        }
        if (this.exact)
            return best > 0 ? Math.ceil(best / EXACT_STEP) * EXACT_STEP : 0;
        return viewStep(best);
    }
    visibleHeight(item) {
        const element = item.element;
        if (!element.isConnected || !(item.width > 0) || !(item.height > 0))
            return 0;
        const pip = typeof document.pictureInPictureElement !== 'undefined' && document.pictureInPictureElement === element;
        if (!pip && (document.visibilityState === 'hidden' || !item.intersecting))
            return 0;
        let aspect = DEFAULT_ASPECT;
        if (element instanceof HTMLVideoElement && element.videoWidth > 0 && element.videoHeight > 0) {
            aspect = element.videoHeight / element.videoWidth;
        }
        // Contained in its box: the shorter of the box's height and the
        // height the box's width allows at the video's proportions.
        const shown = Math.min(item.height, item.width * aspect);
        const density = Math.max(1, window.devicePixelRatio || 1);
        return Math.ceil(shown * density);
    }
    changed() {
        if (this.closed)
            return;
        try {
            this.onChange();
        }
        catch (e) {
            console.error(e);
        }
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        for (const element of Array.from(this.watched.keys())) {
            this.unobserve(element);
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
            this.intersectionObserver = null;
        }
        if (this.visibilityListener) {
            document.removeEventListener('visibilitychange', this.visibilityListener);
            this.visibilityListener = null;
        }
    }
}
