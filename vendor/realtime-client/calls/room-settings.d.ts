/**
 * A product's room and its node's settings (better-messages-server infra/CLIENT-CONFIG.md; @wordplus/rtc-client 1.0.23's
 * Room.meshSettings and RoomEvent.MeshSettingsChanged): the settings it holds, the policy its camera and screen go by,
 * and the live keys a product applies to what it receives. A camera's ceilings (camera.capHeight, capFps, capKbps) and
 * whether a camera in one SVC stream sends only the sizes its viewers ask for (camera.svcTrim, rtc-client 1.0.24;
 * better-messages-server infra/SVC-TRIM.md) are the room client's own, applied to every camera it publishes; the rest
 * are the product's, each where it is used (room-publish.ts, camera-check.ts, encoder-watch.ts, lip-sync.ts).
 */
import { type CallSettings, type CodecPolicy } from "./room-publish.js";
/** A room as these helpers read it: the room client's Room, typed only as far as they need. */
export interface SettingsRoom {
    meshSettings?: CallSettings | null;
    meshCodecPolicy?: CodecPolicy | null;
    options?: {
        adaptiveStream?: unknown;
    };
    remoteParticipants?: Map<string, {
        trackPublications?: Map<string, {
            kind?: string;
            track?: unknown;
        }>;
    }>;
}
/** The room's settings once its node sent any (rev 0 or more); null from a node before them, or any other server. */
export declare function roomSettings(room: SettingsRoom | null | undefined): CallSettings | null;
/** The policy the room's camera and screen go by now (room-publish.ts callPolicy()): from its settings, else its codec policy. */
export declare function roomPolicy(room: SettingsRoom | null | undefined): CodecPolicy | null;
/**
 * The pixel density what the room receives is asked by (view.pixelDensityMax, live): the room's own for what it
 * subscribes to next, and every video it receives now. Nothing where the node didn't set it: the product's own stands.
 */
export declare function applyViewSettings(room: SettingsRoom | null | undefined, devicePixelRatio: number | undefined): void;
