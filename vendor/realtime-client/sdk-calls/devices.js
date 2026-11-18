/**
 * What a page sends in a call from the browser's own devices: `setCamera( true )` opens the camera at the size calls send
 * (room-publish.ts), hands its track to the call and stops it when turned off, so a page needs no getUserMedia of its own.
 * A track the page opened itself goes through `setTrack()` and stays the page's.
 */
import { cameraCapture, micCapture } from '../calls/room-publish.js';
import { RealtimeError } from '../errors.js';
/** The cameras, microphones and speakers this browser has. */
export async function listDevices() {
    const none = { cameras: [], microphones: [], speakers: [] };
    const devices = globalThis.navigator?.mediaDevices;
    if (!devices?.enumerateDevices)
        return none;
    let all;
    try {
        all = await devices.enumerateDevices();
    }
    catch {
        return none;
    }
    const pick = (kind) => all.filter((device) => device.kind === kind && device.deviceId !== '').map((device) => ({ id: device.deviceId, label: device.label }));
    return { cameras: pick('videoinput'), microphones: pick('audioinput'), speakers: pick('audiooutput') };
}
/** What the browser's refusal to open a device means, as a code. */
function refusalOf(error) {
    const name = error?.name ?? '';
    if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name))
        return new RealtimeError('device_denied');
    if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name))
        return new RealtimeError('device_missing');
    return new RealtimeError('device_busy');
}
/** The devices a call has open for its page. One at a time for each source, in the order asked, so on then off ends off. */
export class LocalDevices {
    constructor(send, settings) {
        this.send = send;
        this.settings = settings;
        this.open = new Map();
        this.chosen = {};
        this.queue = Promise.resolve();
        this.over = false;
    }
    setCamera(on, options = {}) {
        return this.inTurn(() => (on ? this.turnOn('camera', options.deviceId) : this.turnOff('camera')));
    }
    setMicrophone(on, options = {}) {
        return this.inTurn(() => (on ? this.turnOn('microphone', options.deviceId) : this.turnOff('microphone')));
    }
    /** Shares a screen, or stops: whether one is shared now. A person who picks nothing in the browser's dialog is no error. */
    setScreenShare(on) {
        return this.inTurn(async () => {
            if (!on) {
                await this.turnOff('screen_share');
                await this.turnOff('screen_share_audio');
                return false;
            }
            if (this.open.has('screen_share'))
                return true;
            const devices = globalThis.navigator?.mediaDevices;
            if (!devices?.getDisplayMedia)
                throw new RealtimeError('no_devices');
            let stream;
            try {
                stream = await devices.getDisplayMedia({ video: true, audio: true });
            }
            catch (error) {
                if (error?.name === 'NotAllowedError')
                    return false;
                throw refusalOf(error);
            }
            if (this.over) {
                for (const track of stream.getTracks())
                    track.stop();
                return false;
            }
            const video = stream.getVideoTracks()[0];
            const audio = stream.getAudioTracks()[0] ?? null;
            // The browser's own Stop Sharing ends it too.
            video.addEventListener('ended', () => void this.setScreenShare(false));
            this.open.set('screen_share', { track: video });
            await this.send('screen_share', video);
            if (audio) {
                this.open.set('screen_share_audio', { track: audio });
                await this.send('screen_share_audio', audio);
            }
            return true;
        });
    }
    /** A track came through `setTrack()`: a device this opened for that source is no longer sent, so it closes. */
    replaced(source, track) {
        const held = this.open.get(source);
        if (!held || held.track === track)
            return;
        this.open.delete(source);
        held.track.stop();
    }
    /** Sent on through someone else from here on: a call that became a group call goes on with the same devices. */
    handTo(send, settings) {
        this.send = send;
        this.settings = settings;
    }
    /** Closes what is open, the call going on: a listener sends nothing, so their camera's light goes off too. */
    release() {
        for (const held of this.open.values())
            held.track.stop();
        this.open.clear();
    }
    /** The call is over: what is open closes, and what is still opening closes as it opens. */
    stop() {
        this.over = true;
        this.release();
    }
    inTurn(work) {
        const turn = this.queue.then(work, work);
        this.queue = turn.catch(() => { });
        return turn;
    }
    async turnOn(source, deviceId) {
        if (this.over)
            return;
        if (deviceId)
            this.chosen[source] = deviceId;
        const device = this.chosen[source];
        const held = this.open.get(source);
        if (held && held.device === device)
            return;
        const devices = globalThis.navigator?.mediaDevices;
        if (!devices?.getUserMedia)
            throw new RealtimeError('no_devices');
        let stream;
        try {
            stream = await devices.getUserMedia(source === 'camera' ? { video: this.cameraAsked(device) } : { audio: this.microphoneAsked(device) });
        }
        catch (error) {
            throw refusalOf(error);
        }
        const track = stream.getTracks()[0];
        if (this.over) {
            track.stop();
            return;
        }
        // The new device goes out first, so the others see no gap; then the one before it closes.
        const before = this.open.get(source);
        this.open.set(source, { track, device });
        await this.send(source, track);
        before?.track.stop();
    }
    async turnOff(source) {
        const held = this.open.get(source);
        this.open.delete(source);
        held?.track.stop();
        await this.send(source, null);
    }
    /** The camera at the size calls send, facing the user unless a device is named: asked for no size, Chrome opens 640x480. */
    cameraAsked(device) {
        const { width, height, frameRate } = cameraCapture(this.settings());
        return { width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: frameRate }, ...(device ? { deviceId: { exact: device } } : { facingMode: 'user' }) };
    }
    microphoneAsked(device) {
        return { ...micCapture(this.settings()), ...(device ? { deviceId: { exact: device } } : {}) };
    }
}
