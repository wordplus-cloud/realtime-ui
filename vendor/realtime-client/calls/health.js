const PRESSURE_RANK = { nominal: 0, fair: 1, serious: 2, critical: 3 };
// A main-thread task this long or longer is a hang worth telling (the Long
// Tasks API reports from 50 ms).
export const HANG_MS = 200;
// The PressureObserver's sample interval: it raises an event only when the
// state changes.
const PRESSURE_SAMPLE_MS = 2000;
const fresh = (now = Date.now()) => ({ cpuMs: 0, pressureAt: now, hangs: 0, hangMs: 0, hiddenMs: 0, devices: 0 });
export class CallHealthWatch {
    constructor() {
        this.c = fresh();
        this.stops = [];
    }
    // Starts counting: every listener and observer the browser has, none it
    // hasn't.
    start() {
        if (this.stops.length)
            return;
        this.c = fresh();
        const g = globalThis;
        // CPU pressure (Chrome and Edge 125 and later): the state the system
        // is in, raised when it changes
        if (typeof g.PressureObserver === 'function') {
            try {
                const observer = new g.PressureObserver((records) => {
                    for (const r of records)
                        this.pressureChanged(r.state);
                });
                Promise.resolve(observer.observe('cpu', { sampleInterval: PRESSURE_SAMPLE_MS })).catch(() => undefined);
                this.stops.push(() => observer.disconnect());
            }
            catch (e) {
                // not allowed here (a frame without the permission policy)
            }
        }
        // the main thread busy at a stretch: the page itself hangs, its timers
        // and the call's own handling of the network with it
        if (typeof g.PerformanceObserver === 'function' && g.PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
            try {
                const observer = new g.PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        if (e.duration >= HANG_MS) {
                            this.c.hangs++;
                            this.c.hangMs = Math.max(this.c.hangMs, Math.round(e.duration));
                        }
                    }
                });
                observer.observe({ type: 'longtask' });
                this.stops.push(() => observer.disconnect());
            }
            catch (e) {
                // no long tasks here
            }
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            const visibility = () => this.visibilityChanged(document.visibilityState === 'hidden');
            visibility();
            document.addEventListener('visibilitychange', visibility);
            this.stops.push(() => document.removeEventListener('visibilitychange', visibility));
        }
        const devices = g.navigator?.mediaDevices;
        if (devices && typeof devices.addEventListener === 'function') {
            const changed = () => { this.c.devices++; };
            devices.addEventListener('devicechange', changed);
            this.stops.push(() => devices.removeEventListener('devicechange', changed));
        }
        if (typeof g.navigator?.getBattery === 'function') {
            Promise.resolve(g.navigator.getBattery()).then((b) => {
                if (!this.stops.length || !b)
                    return;
                const charging = () => { this.battery = !b.charging; };
                charging();
                b.addEventListener?.('chargingchange', charging);
                this.stops.push(() => b.removeEventListener?.('chargingchange', charging));
            }).catch(() => undefined);
        }
        void this.machine().then((m) => { this.machineInfo = m; });
    }
    stop() {
        this.stops.forEach((s) => s());
        this.stops = [];
    }
    pressureChanged(state, now = Date.now()) {
        if (!(state in PRESSURE_RANK))
            return;
        this.accountPressure(now);
        this.c.pressure = state;
        if (!this.c.cpu || PRESSURE_RANK[state] > PRESSURE_RANK[this.c.cpu])
            this.c.cpu = state;
    }
    accountPressure(now) {
        if (this.c.pressure && PRESSURE_RANK[this.c.pressure] >= PRESSURE_RANK.serious) {
            this.c.cpuMs += now - this.c.pressureAt;
        }
        this.c.pressureAt = now;
    }
    visibilityChanged(hidden, now = Date.now()) {
        if (hidden && this.c.hiddenAt === undefined) {
            this.c.hiddenAt = now;
        }
        else if (!hidden && this.c.hiddenAt !== undefined) {
            this.c.hiddenMs += now - this.c.hiddenAt;
            this.c.hiddenAt = undefined;
        }
    }
    // A main-thread task the Long Tasks API reported, for a test.
    hung(ms) {
        if (ms < HANG_MS)
            return;
        this.c.hangs++;
        this.c.hangMs = Math.max(this.c.hangMs, Math.round(ms));
    }
    /**
     * What happened since the last reading, and the counters started over.
     * Only what there is to say, and the machine every time: the relay keeps
     * a side's latest reading alone.
     */
    reading(now = Date.now()) {
        this.accountPressure(now);
        const c = this.c;
        const out = {};
        if (c.cpu && c.cpu !== 'nominal')
            out.cpu = c.cpu;
        if (c.cpuMs > 0)
            out.cpuMs = c.cpuMs;
        if (c.hangs > 0) {
            out.hangs = c.hangs;
            out.hangMs = c.hangMs;
        }
        const hiddenMs = c.hiddenMs + (c.hiddenAt !== undefined ? now - c.hiddenAt : 0);
        if (hiddenMs > 0)
            out.hiddenMs = hiddenMs;
        if (this.battery !== undefined)
            out.battery = this.battery;
        if (c.devices > 0)
            out.devices = c.devices;
        if (this.machineInfo)
            out.machine = this.machineInfo;
        // what carries on (a pressure state, a hidden page) starts the next
        // reading as it is now: the state it is in is the worst of the next
        // until another comes
        this.c = {
            ...fresh(now),
            cpu: c.pressure,
            pressure: c.pressure,
            hiddenAt: c.hiddenAt !== undefined ? now : undefined
        };
        return out;
    }
    // The machine: its cores and memory as the browser rounds them, and its
    // graphics adapter where WebGPU names it.
    async machine() {
        const nav = globalThis.navigator;
        if (!nav)
            return undefined;
        const out = {};
        if (typeof nav.hardwareConcurrency === 'number')
            out.cores = nav.hardwareConcurrency;
        if (typeof nav.deviceMemory === 'number')
            out.memGb = nav.deviceMemory;
        const gpu = await CallHealthWatch.gpuName(nav);
        if (gpu)
            out.gpu = gpu;
        return Object.keys(out).length ? out : undefined;
    }
    // The graphics adapter's vendor and architecture (WebGPU's adapter info),
    // once a page and at most 300 ms: a low-power adapter asked for, so a
    // laptop's second GPU isn't woken for it.
    static gpuName(nav) {
        if (!CallHealthWatch.gpu) {
            const ask = async () => {
                if (!nav.gpu || typeof nav.gpu.requestAdapter !== 'function')
                    return undefined;
                const adapter = await nav.gpu.requestAdapter({ powerPreference: 'low-power' });
                const info = adapter?.info;
                const name = [info?.vendor, info?.architecture].filter((s) => typeof s === 'string' && s).join(' ');
                return name ? name.slice(0, 60) : undefined;
            };
            CallHealthWatch.gpu = Promise.race([
                ask().catch(() => undefined),
                new Promise((resolve) => setTimeout(() => resolve(undefined), 300))
            ]);
        }
        return CallHealthWatch.gpu;
    }
}
