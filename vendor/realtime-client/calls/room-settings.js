/**
 * A product's room and its node's settings (better-messages-server infra/CLIENT-CONFIG.md; @wordplus/rtc-client 1.0.23's
 * Room.meshSettings and RoomEvent.MeshSettingsChanged): the settings it holds, the policy its camera and screen go by,
 * and the live keys a product applies to what it receives. A camera's ceilings (camera.capHeight, capFps, capKbps) and
 * whether a camera in one SVC stream sends only the sizes its viewers ask for (camera.svcTrim, rtc-client 1.0.24;
 * better-messages-server infra/SVC-TRIM.md) are the room client's own, applied to every camera it publishes; the rest
 * are the product's, each where it is used (room-publish.ts, camera-check.ts, encoder-watch.ts, lip-sync.ts).
 */
import { callPolicy, roomPixelDensity } from "./room-publish.js";
/** The room's settings once its node sent any (rev 0 or more); null from a node before them, or any other server. */
export function roomSettings(room) {
    const s = room?.meshSettings;
    return s && s.rev >= 0 ? s : null;
}
/** The policy the room's camera and screen go by now (room-publish.ts callPolicy()): from its settings, else its codec policy. */
export function roomPolicy(room) {
    return callPolicy(room?.meshCodecPolicy ?? null, roomSettings(room));
}
/**
 * The pixel density what the room receives is asked by (view.pixelDensityMax, live): the room's own for what it
 * subscribes to next, and every video it receives now. Nothing where the node didn't set it: the product's own stands.
 */
export function applyViewSettings(room, devicePixelRatio) {
    const settings = roomSettings(room);
    if (!room || !settings?.has('view.pixelDensityMax'))
        return;
    const pixelDensity = roomPixelDensity(devicePixelRatio, settings);
    const adaptive = room.options?.adaptiveStream;
    if (adaptive && typeof adaptive === 'object')
        adaptive.pixelDensity = pixelDensity;
    for (const participant of room.remoteParticipants?.values() ?? []) {
        for (const publication of participant.trackPublications?.values() ?? []) {
            const track = publication.track;
            if (publication.kind !== 'video' || !track || !track.adaptiveStreamSettings)
                continue;
            track.adaptiveStreamSettings = { ...track.adaptiveStreamSettings, pixelDensity };
        }
    }
}
