import type { CallId, CallTransport } from "./transport.js";
export interface ReportableRoom {
    engine?: {
        pcManager?: {
            publisher?: {
                getStats(): Promise<RTCStatsReport>;
            };
            subscriber?: {
                getStats(): Promise<RTCStatsReport>;
            };
        };
    };
}
export declare class SfuReporter {
    private readonly transport;
    private readonly callId;
    private readonly session;
    private sent;
    private sentAt;
    private closed;
    constructor(transport: CallTransport, callId: CallId);
    close(): void;
    report(room: ReportableRoom | null, bytesSent: number, bytesReceived: number, final?: boolean, carried?: {
        sent: number;
        recv: number;
    }): Promise<void>;
}
