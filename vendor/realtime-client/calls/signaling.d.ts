import type { CallId, CallTransport } from "./transport.js";
import { AliveAck, FailedAck, IceAck, JoinAck, PulseAck, PulseBody, SealedSignal, ServerMessage, SignalAck, SignalBody, SyncAck } from "./types.js";
import type { QualityReading } from "./quality.js";
export declare function leaveUnjoined(transport: CallTransport, callId: CallId, reason: string): void;
export declare class P2PSignaling {
    readonly transport: CallTransport;
    readonly callId: CallId;
    private readonly onMessage;
    readonly session: string;
    private queue;
    private closed;
    private readonly stopListening;
    constructor(transport: CallTransport, callId: CallId, onMessage: (message: ServerMessage) => void);
    get connected(): boolean;
    get isClosed(): boolean;
    private request;
    join(params: {
        epoch: number;
        last_id: string | null;
        resume?: boolean;
        fresh?: boolean;
    }): Promise<JoinAck>;
    signal(generation: number, body: SignalBody | SealedSignal): Promise<SignalAck>;
    sync(lastId: string | null): Promise<SyncAck>;
    iceServers(): Promise<IceAck>;
    alive(): Promise<AliveAck>;
    pulse(pulse: PulseBody, quality?: QualityReading): Promise<PulseAck>;
    report(report: unknown): Promise<{
        ok: boolean;
    }>;
    trace(lines: string[]): Promise<{
        ok: boolean;
    }>;
    failed(reason: string): Promise<FailedAck>;
    leave(reason: string): Promise<{
        ok: boolean;
    }>;
    close(): void;
}
