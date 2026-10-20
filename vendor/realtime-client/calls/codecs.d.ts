import type { CodecCaps, CodecDirection, P2PSource } from "./types.js";
export declare const FAMILIES: string[];
interface VideoCodec {
    mimeType: string;
    clockRate: number;
    channels?: number;
    sdpFmtpLine?: string;
}
export declare function forcedFamilies(): string[] | null;
export declare function brokenCodecs(): Record<string, CodecDirection[]>;
export declare function forgetBroken(): void;
export declare function markBroken(family: string, direction: CodecDirection): boolean;
export declare function probeCodecCaps(): Promise<CodecCaps>;
export declare function directionScore(sender: CodecCaps, receiver: CodecCaps | null, family: string): number | null;
export declare function fastDirection(sender: CodecCaps, receiver: CodecCaps | null, family: string): boolean;
export declare function screenDirectionScore(sender: CodecCaps, receiver: CodecCaps | null, family: string): number | null;
export declare function offerOrder(own: CodecCaps, source?: P2PSource): string[];
export declare function answerOrder(own: CodecCaps, peer: CodecCaps | null, source?: P2PSource): string[];
export type RoomCodec = 'av1' | 'vp9' | 'h264' | 'vp8';
export declare function roomPublishCodec(own: CodecCaps, encrypted: boolean): RoomCodec;
export declare function chooseSendFamily(own: CodecCaps, peer: CodecCaps | null, negotiated: string[], source?: P2PSource): string | null;
export declare function familyOf(codec: {
    mimeType: string;
}): string | null;
export declare function negotiatedCodec(codecs: VideoCodec[], family: string): VideoCodec | null;
export declare function applyCodecPreferences(transceiver: RTCRtpTransceiver, families: string[]): void;
export {};
