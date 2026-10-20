import type { SealedSignal, SignalBody } from "./types.js";
export declare function isSealedSignal(body: unknown): body is SealedSignal;
export declare class SignalCipher {
    private readonly key;
    private constructor();
    static create(secret: string): Promise<SignalCipher | null>;
    seal(body: SignalBody): Promise<SealedSignal>;
    open(body: SealedSignal): Promise<SignalBody | null>;
}
